import type { Session } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { CmsApiError, editorialCommand } from "@/admin/api/cms-api";
import {
  DEFAULT_OPERATOR_ERROR_MESSAGE,
  isOperatorSafeMessage,
  operatorErrorMessage,
} from "@/admin/operator-error-message";

describe("mensagem segura ao operador", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("preserva somente mensagens locais curtas e voltadas à operação", () => {
    expect(operatorErrorMessage(new Error("A visualização expirou. Solicite uma nova."))).toBe(
      "A visualização expirou. Solicite uma nova.",
    );
    expect(isOperatorSafeMessage("Revise os campos obrigatórios.")).toBe(true);
  });

  it.each([
    '{"code":"invalid_type","path":["models",0,"sku"],"expected":"string"}',
    "Falha para 45000000-0000-4000-8000-000000000001",
    `Artefato ${"a".repeat(64)} rejeitado`,
    "CMS_PIM_ATTRIBUTE_INVALID: definição não resolvida",
    "AUTH_MFA_CHALLENGE_FAILED",
    'PGRST116: relation "cms_items" does not exist',
    "duplicate key value violates unique constraint cms_items_slug_key",
    "select secret from private.credentials",
    "Objeto ausente em /storage/v1/object/private/documentos/arquivo.pdf",
    "correlationId=abc commandId=def schemaVersion=2 lockVersion=4",
    "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "Erro ao processar comercial@example.test",
    "Error: falha\n    at handler (/srv/index.ts:12:3)",
    "getaddrinfo ENOTFOUND private-supabase-host",
    "Can't find end of central directory: invalid ZIP archive xl/worksheets/sheet1.xml",
    "Unexpected token in workbook ArrayBuffer",
  ])("substitui detalhe técnico ou sensível: %s", (message) => {
    expect(operatorErrorMessage(new Error(message))).toBe(DEFAULT_OPERATOR_ERROR_MESSAGE);
    expect(isOperatorSafeMessage(message)).toBe(false);
  });

  it("não confia em texto vindo do backend, ainda que pareça legível", () => {
    expect(
      operatorErrorMessage("Detalhe arbitrário devolvido pelo provedor", {
        source: "remote",
        status: 403,
      }),
    ).toBe("Você não tem permissão para concluir esta operação.");
    expect(
      operatorErrorMessage("Mensagem aparentemente segura", {
        source: "remote",
        status: 503,
      }),
    ).toBe("O CMS está temporariamente indisponível. Tente novamente em instantes.");
  });

  it("neutraliza um ZodError real antes que o catch o mostre", () => {
    const parsed = z.object({ items: z.array(z.object({ title: z.string() })) }).safeParse({
      items: [{ title: 42 }],
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    expect(
      operatorErrorMessage(parsed.error, {
        fallback: "Os dados recebidos são incompatíveis. Atualize e tente novamente.",
      }),
    ).toBe("Os dados recebidos são incompatíveis. Atualize e tente novamente.");
  });

  it("não permite que um fallback técnico contorne o filtro", () => {
    expect(
      operatorErrorMessage(undefined, {
        fallback: "CMS_INTERNAL_ERROR correlationId=abc",
      }),
    ).toBe(DEFAULT_OPERATOR_ERROR_MESSAGE);
  });

  it("mantém metadados técnicos do CmsApiError fora da mensagem visível", () => {
    const error = new CmsApiError('{"error":"relation cms_items does not exist","path":["item_id"]}', 409, {
      code: "CMS_CONCURRENT_WRITE",
      correlationId: "45000000-0000-4000-8000-000000000001",
      currentVersion: 7,
      diffRef: "private-diff-ref",
      preserved: true,
    });

    expect(error.message).toBe(
      "O conteúdo foi alterado por outra pessoa. Recarregue a página e tente novamente.",
    );
    expect(error).toMatchObject({
      code: "CMS_CONCURRENT_WRITE",
      correlationId: "45000000-0000-4000-8000-000000000001",
      currentVersion: 7,
      diffRef: "private-diff-ref",
      preserved: true,
    });
    expect(error.message).not.toMatch(/CMS_|45000000|item_id|relation/i);
  });

  it("neutraliza a mensagem remota no caminho real do cliente CMS", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: "PGRST116: relation cms_items does not exist",
              code: "CMS_CONCURRENT_WRITE",
              correlationId: "45000000-0000-4000-8000-000000000001",
              currentVersion: 8,
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const session = { access_token: "session-for-test" } as unknown as Session;

    await expect(editorialCommand(session, { action: "save" })).rejects.toMatchObject({
      name: "CmsApiError",
      message: "O conteúdo foi alterado por outra pessoa. Recarregue a página e tente novamente.",
      status: 409,
      code: "CMS_CONCURRENT_WRITE",
      currentVersion: 8,
    });
  });

  it("converte falha de transporte sem propagar a mensagem da plataforma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("getaddrinfo ENOTFOUND private-supabase-host");
      }),
    );
    const session = { access_token: "session-for-test" } as unknown as Session;

    await expect(editorialCommand(session, { action: "save" })).rejects.toMatchObject({
      name: "CmsApiError",
      message: "Não foi possível conectar ao CMS. Verifique sua conexão e tente novamente.",
      status: 0,
    });
  });
});
