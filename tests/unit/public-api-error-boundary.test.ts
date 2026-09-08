import { afterEach, describe, expect, it, vi } from "vitest";

import { getPublishedForm, getPublishedProducts } from "../../src/public/catalog-api";
import { submitGovernedLead } from "../../src/public/lead-api";

const form = {
  key: "contato-principal",
  version: 2,
  title: "Contato",
  purpose: "Atendimento comercial",
  fields: [],
  consent: {
    required: true as const,
    text: "Autorizo o contato conforme a política de privacidade.",
    version: "2026-v1",
    privacyPath: "/politica-de-privacidade",
  },
  successMessage: "Recebido.",
  submitLabel: "Enviar",
};

const submit = () =>
  submitGovernedLead({
    form,
    fields: { email: "pessoa@example.test" },
    idempotencyKey: "01234567-89ab-4cde-af01-23456789abcd",
    source: "contato",
    consentAccepted: true,
  });

afterEach(() => vi.unstubAllGlobals());

describe("public API error boundary", () => {
  it.each([
    ["catalog", () => getPublishedProducts({})],
    ["form", () => getPublishedForm("contato-principal", 2)],
    ["lead", submit],
  ])("never surfaces an untrusted remote error from %s", async (_label, request) => {
    const remoteError =
      '<script>alert("xss")</script> ZodError PGRST204 public.cms_leads pessoa@empresa.test';
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: remoteError, challengeRequired: true }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const error = await request().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(remoteError);
    expect((error as Error).message).not.toMatch(/ZodError|PGRST|cms_leads|<script>|@empresa\.test/i);
  });

  it("keeps the anti-bot challenge signal without trusting the lead error text", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "ZodError: UUID inválido", challengeRequired: true }, { status: 422 }),
        ),
    );

    const error = await submit().catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      message: "Não foi possível enviar. Tente novamente.",
      challengeRequired: true,
    });
  });

  it("uses a safe local message when the transport rejects with technical details", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ZodError PGRST301 public.cms_content_items")),
    );

    await expect(getPublishedProducts({})).rejects.toThrow("Catálogo temporariamente indisponível.");
    await expect(getPublishedForm("contato-principal", 2)).rejects.toThrow(
      "Formulário temporariamente indisponível.",
    );
    await expect(submit()).rejects.toThrow("Não foi possível enviar. Tente novamente.");
  });

  it("does not echo malformed successful catalog payload details", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ items: { error: "ZodError public.cms_content_items" } }, { status: 200 }),
        ),
    );

    const error = await getPublishedProducts({}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Resposta pública inválida.");
    expect((error as Error).message).not.toMatch(/ZodError|cms_content_items/i);
  });
});
