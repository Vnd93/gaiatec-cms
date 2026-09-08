import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mediaCommand: vi.fn(),
  damCommand: vi.fn(),
  createResponsiveMediaPackage: vi.fn(),
  createSafeRasterPreview: vi.fn(),
  auth: {
    session: { access_token: "synthetic-test-token" },
    profile: { permissions: ["cms:media.read", "cms:media.upload"] },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({
  mediaCommand: mocks.mediaCommand,
  damCommand: mocks.damCommand,
}));
vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => mocks.auth,
}));
vi.mock("@/admin/ev2-runtime", () => ({
  cmsEnvironment: () => "local",
  isEv2FeatureEnabled: () => false,
}));
vi.mock("@/admin/responsive-media", () => ({
  createResponsiveMediaPackage: mocks.createResponsiveMediaPackage,
  createSafeRasterPreview: mocks.createSafeRasterPreview,
}));
vi.mock("@/admin/pages/AdminDamPage", () => ({ default: () => null }));

const assetId = "47000000-0000-4000-8000-000000000010";
const descriptors = [
  { key: "original", format: "png", signedUrl: "https://upload.example/original" },
  { key: "thumbnail", format: "webp", signedUrl: "https://upload.example/thumbnail-webp" },
  { key: "thumbnail", format: "avif", signedUrl: "https://upload.example/thumbnail-avif" },
  { key: "medium", format: "webp", signedUrl: "https://upload.example/medium-webp" },
  { key: "medium", format: "avif", signedUrl: "https://upload.example/medium-avif" },
  { key: "large", format: "webp", signedUrl: "https://upload.example/large-webp" },
  { key: "large", format: "avif", signedUrl: "https://upload.example/large-avif" },
] as const;

function responsivePackage(original: File) {
  return {
    original,
    "thumbnail.webp": new File(["thumbnail-webp"], "thumbnail.webp", { type: "image/webp" }),
    "thumbnail.avif": new File(["thumbnail-avif"], "thumbnail.avif", { type: "image/avif" }),
    "medium.webp": new File(["medium-webp"], "medium.webp", { type: "image/webp" }),
    "medium.avif": new File(["medium-avif"], "medium.avif", { type: "image/avif" }),
    "large.webp": new File(["large-webp"], "large.webp", { type: "image/webp" }),
    "large.avif": new File(["large-avif"], "large.avif", { type: "image/avif" }),
  };
}

async function completeUploadForm(user: ReturnType<typeof userEvent.setup>) {
  const original = new File(["original"], "produto-qa.png", { type: "image/png" });
  await user.upload(screen.getByLabelText("Imagem original"), original);
  await user.type(screen.getByLabelText("Referência da origem"), "Acervo controlado QA");
  await user.type(screen.getByLabelText("Texto alternativo"), "Produto de homologação");
  await user.click(screen.getByLabelText(/Confirmo a origem e os direitos/));
  return original;
}

let AdminMediaPage: ComponentType;

describe("compensação do envio de mídia", () => {
  beforeAll(async () => {
    AdminMediaPage = (await import("@/admin/pages/AdminMediaPage")).default;
  });

  beforeEach(() => {
    mocks.auth.profile.permissions = ["cms:media.read", "cms:media.upload"];
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    mocks.mediaCommand.mockReset();
    mocks.damCommand.mockReset();
    mocks.createResponsiveMediaPackage.mockReset();
    mocks.createSafeRasterPreview.mockReset();
    mocks.createSafeRasterPreview.mockResolvedValue({
      blob: new Blob(["preview"], { type: "image/webp" }),
      width: 1,
      height: 1,
      metadata: {},
    });
    mocks.damCommand.mockRejectedValue(new Error("Falha secundária na compensação"));
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: [], total: 0 });
      if (body.action === "create") return Promise.resolve({ assetId, uploads: descriptors });
      if (body.action === "finalize") return Promise.resolve({ status: "ready", width: 1600, height: 900 });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("abandona uma única vez a reserva quando o quarto envio falha e preserva o erro principal", async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", request);
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) =>
      Promise.resolve(responsivePackage(original)),
    );

    render(<AdminMediaPage />);
    await screen.findByRole("heading", { name: "Mídia" });
    await completeUploadForm(user);
    fireEvent.submit(screen.getByRole("button", { name: "Enviar imagem" }).closest("form")!);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    await waitFor(() => expect(mocks.damCommand).toHaveBeenCalledTimes(1));
    const [, abortBody, idempotencyKey] = mocks.damCommand.mock.calls[0];
    expect(abortBody).toMatchObject({ action: "abort_upload", assetId });
    expect(abortBody.envelope.commandId).toBe(idempotencyKey);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível enviar a imagem média em WebP. Tente novamente.",
    );
    expect(mocks.mediaCommand).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "finalize" }),
    );
  });

  it("não tenta abandonar quando a criação da reserva falha", async () => {
    const user = userEvent.setup();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) =>
      Promise.resolve(responsivePackage(original)),
    );
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: [], total: 0 });
      if (body.action === "create") return Promise.reject(new Error("Reserva temporariamente indisponível."));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<AdminMediaPage />);
    await screen.findByRole("heading", { name: "Mídia" });
    await completeUploadForm(user);
    fireEvent.submit(screen.getByRole("button", { name: "Enviar imagem" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Reserva temporariamente indisponível.");
    expect(mocks.damCommand).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it("cancela um PUT em voo, bloqueia os campos e compensa com motivo explícito", async () => {
    const user = userEvent.setup();
    const request = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(init.signal?.reason ?? new DOMException("cancelled", "AbortError")),
            { once: true },
          );
        }),
    );
    vi.stubGlobal("fetch", request);
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) =>
      Promise.resolve(responsivePackage(original)),
    );

    render(<AdminMediaPage />);
    await screen.findByRole("heading", { name: "Mídia" });
    await completeUploadForm(user);
    fireEvent.submit(screen.getByRole("button", { name: "Enviar imagem" }).closest("form")!);

    const cancel = await screen.findByRole("button", { name: "Cancelar envio em andamento" });
    expect(screen.getByLabelText("Referência da origem")).toBeDisabled();
    await user.click(cancel);

    await waitFor(() => expect(mocks.damCommand).toHaveBeenCalledTimes(1));
    expect(mocks.damCommand.mock.calls[0]?.[1]).toMatchObject({
      action: "abort_upload",
      assetId,
      reasonCode: "client_cancelled",
    });
    expect(await screen.findByRole("alert")).toHaveTextContent("Envio cancelado");
  });

  it("reconcilia resposta perdida da finalização sem arquivar mídia pronta", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) =>
      Promise.resolve(responsivePackage(original)),
    );
    let finalizeCalls = 0;
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: [], total: 0 });
      if (body.action === "create") return Promise.resolve({ assetId, uploads: descriptors });
      if (body.action === "finalize") {
        finalizeCalls += 1;
        return finalizeCalls === 1
          ? Promise.reject(new Error("Resposta perdida após commit"))
          : Promise.resolve({ status: "ready", width: 1600, height: 900, replayed: true });
      }
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<AdminMediaPage />);
    await screen.findByRole("heading", { name: "Mídia" });
    await completeUploadForm(user);
    fireEvent.submit(screen.getByRole("button", { name: "Enviar imagem" }).closest("form")!);

    expect(await screen.findByText(/Mídia pronta \(1600 × 900\)/)).toBeVisible();
    expect(finalizeCalls).toBe(2);
    expect(mocks.damCommand).not.toHaveBeenCalled();
  });

  it("distingue as ações de cada cartão pelo nome do arquivo", async () => {
    const user = userEvent.setup();
    const item = (id: string, filename: string) => ({
      id,
      original_filename: filename,
      processing_status: "ready",
      scan_status: "clean",
      alt_text: `Descrição de ${filename}`,
      width: 1200,
      height: 800,
      source_kind: "owner_authored",
      license_name: "Uso autorizado",
      owner_name: "GAIATEC SISTEMAS",
      archived_at: null,
      preview_url: null,
    });
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list")
        return Promise.resolve({
          items: [
            item("47000000-0000-4000-8000-000000000020", "alpha.png"),
            item("47000000-0000-4000-8000-000000000021", "beta.png"),
          ],
          total: 2,
        });
      if (body.action === "usages")
        return Promise.resolve({ usages: [], totalUsageCount: 0, hiddenUsageCount: 0 });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<AdminMediaPage />);

    expect(await screen.findByRole("button", { name: "Abrir detalhes de alpha.png" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Abrir detalhes de beta.png" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Consultar usos de alpha.png" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Consultar usos de beta.png" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Ver ficha completa" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Abrir detalhes de alpha.png" }));
    expect(screen.getByRole("button", { name: "Consultar usos no painel de alpha.png" })).toBeVisible();
  });

  it("converte a exclusão legada em arquivamento governado após conferir os usos", async () => {
    const user = userEvent.setup();
    mocks.auth.profile.permissions = ["cms:media.read", "cms:media.manage"];
    const item = {
      id: "47000000-0000-4000-8000-000000000040",
      original_filename: "arquivo-retido.png",
      processing_status: "ready",
      scan_status: "clean",
      alt_text: "Arquivo sem vínculos",
      width: 1200,
      height: 800,
      source_kind: "owner_authored",
      license_name: "Uso autorizado",
      owner_name: "GAIATEC SISTEMAS",
      archived_at: null,
      preview_url: null,
    };
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: [item], total: 1 });
      if (body.action === "usages")
        return Promise.resolve({ usages: [], totalUsageCount: 0, hiddenUsageCount: 0 });
      if (body.action === "delete") {
        return Promise.resolve({ assetId: item.id, archived: true, status: "archived" });
      }
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<AdminMediaPage />);
    const inspect = await screen.findByRole("button", { name: "Consultar usos de arquivo-retido.png" });
    const archive = screen.getByRole("button", { name: "Arquivar arquivo-retido.png" });
    expect(archive).toBeDisabled();
    await user.click(inspect);
    await waitFor(() => expect(archive).toBeEnabled());
    await user.click(archive);
    await user.click(screen.getByRole("button", { name: "Arquivar mídia" }));

    await waitFor(() =>
      expect(mocks.mediaCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "delete", assetId: item.id }),
      ),
    );
    expect(await screen.findByText(/Mídia arquivada com retenção/)).toBeVisible();
  });

  it("mantém o arquivamento bloqueado quando há vínculos fora do escopo de leitura", async () => {
    const user = userEvent.setup();
    mocks.auth.profile.permissions = ["cms:media.read", "cms:media.manage"];
    const item = {
      id: "47000000-0000-4000-8000-000000000041",
      original_filename: "vinculo-oculto.png",
      processing_status: "ready",
      scan_status: "clean",
      alt_text: "Arquivo com vínculo protegido",
      width: 1200,
      height: 800,
      source_kind: "owner_authored",
      license_name: "Uso autorizado",
      owner_name: "GAIATEC SISTEMAS",
      archived_at: null,
      preview_url: null,
    };
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list") return Promise.resolve({ items: [item], total: 1 });
      if (body.action === "usages")
        return Promise.resolve({ usages: [], totalUsageCount: 1, hiddenUsageCount: 1 });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<AdminMediaPage />);
    await user.click(await screen.findByRole("button", { name: "Consultar usos de vinculo-oculto.png" }));

    expect(screen.getByRole("button", { name: "Arquivar vinculo-oculto.png" })).toBeDisabled();
    expect(await screen.findByText(/fora do seu escopo de leitura/)).toBeVisible();
  });

  it("lista e restaura mídia arquivada enquanto a retenção está ativa", async () => {
    const user = userEvent.setup();
    mocks.auth.profile.permissions = ["cms:media.read", "cms:media.manage"];
    const item = {
      id: "47000000-0000-4000-8000-000000000042",
      original_filename: "restauravel.png",
      processing_status: "ready",
      scan_status: "clean",
      alt_text: "Arquivo arquivado reversível",
      width: 1200,
      height: 800,
      source_kind: "owner_authored",
      license_name: "Uso autorizado",
      owner_name: "GAIATEC SISTEMAS",
      archived_at: "2026-09-01T12:00:00.000Z",
      preview_url: null,
    };
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action === "list")
        return Promise.resolve({
          items: body.includeArchived ? [item] : [],
          total: body.includeArchived ? 1 : 0,
        });
      if (body.action === "restore") return Promise.resolve({ restored: true, status: "ready" });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<AdminMediaPage />);
    await user.click(await screen.findByLabelText("Incluir arquivadas"));
    await user.click(await screen.findByRole("button", { name: "Restaurar restauravel.png" }));

    await waitFor(() =>
      expect(mocks.mediaCommand).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "restore", assetId: item.id }),
      ),
    );
    expect(await screen.findByText(/Mídia restaurada/)).toBeVisible();
  });

  it("avisa quando a atualização falha e identifica a lista anterior como desatualizada", async () => {
    const item = {
      id: "47000000-0000-4000-8000-000000000030",
      original_filename: "cache-seguro.png",
      processing_status: "ready",
      scan_status: "clean",
      alt_text: "Imagem previamente carregada",
      width: 1200,
      height: 800,
      source_kind: "owner_authored",
      license_name: "Uso autorizado",
      owner_name: "GAIATEC SISTEMAS",
      archived_at: null,
      preview_url: null,
    };
    let lists = 0;
    mocks.mediaCommand.mockImplementation((_session, body: Record<string, unknown>) => {
      if (body.action !== "list") throw new Error(`Ação inesperada: ${String(body.action)}`);
      lists += 1;
      return lists === 1
        ? Promise.resolve({ items: [item], total: 1 })
        : Promise.reject(new Error("Serviço de mídia temporariamente indisponível."));
    });

    const user = userEvent.setup();
    render(<AdminMediaPage />);
    expect(await screen.findByRole("heading", { name: "cache-seguro.png" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Buscar" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Os arquivos exibidos são da última consulta concluída com sucesso.",
    );
    expect(screen.getByRole("heading", { name: "cache-seguro.png" })).toBeVisible();
  });
});
