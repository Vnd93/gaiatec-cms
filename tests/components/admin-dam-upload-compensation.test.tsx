import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  damCommand: vi.fn(),
  createResponsiveMediaPackage: vi.fn(),
  createSafeRasterPreview: vi.fn(),
  fingerprintMediaFile: vi.fn(),
  auth: {
    session: { access_token: "synthetic-test-token" },
    profile: { permissions: ["cms:media.read", "cms:media.upload"] },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ damCommand: mocks.damCommand }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => mocks.auth,
}));
vi.mock("@/admin/ev2-runtime", () => ({ cmsEnvironment: () => "local" }));
vi.mock("@/admin/dam-model", () => ({ fingerprintMediaFile: mocks.fingerprintMediaFile }));
vi.mock("@/admin/responsive-media", () => ({
  createResponsiveMediaPackage: mocks.createResponsiveMediaPackage,
  createSafeRasterPreview: mocks.createSafeRasterPreview,
}));

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

function base(body: Record<string, any>) {
  return {
    schemaVersion: 1,
    commandId: body.envelope.commandId,
    correlationId: body.envelope.correlationId,
  };
}

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
  await user.upload(screen.getByLabelText(/^Imagem original/), original);
  await user.type(screen.getByLabelText("Referência"), "Acervo controlado QA");
  await user.type(screen.getByLabelText("Texto alternativo"), "Produto de homologação");
  await user.click(screen.getByLabelText(/Confirmo a origem e os direitos/));
  expect(screen.getByLabelText(/^Imagem original/)).toHaveProperty("files.length", 1);
  expect(screen.getByLabelText(/Confirmo a origem e os direitos/)).toBeChecked();
}

let AdminDamPage: ComponentType;

function renderPage() {
  const router = createMemoryRouter([{ path: "/admin/midia", element: <AdminDamPage /> }], {
    initialEntries: ["/admin/midia"],
  });
  return render(<RouterProvider router={router} />);
}

describe("compensação do envio no DAM canônico", () => {
  beforeAll(async () => {
    AdminDamPage = (await import("@/admin/pages/AdminDamPage")).default;
  });

  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:preview"),
      revokeObjectURL: vi.fn(),
    });
    mocks.damCommand.mockReset();
    mocks.createResponsiveMediaPackage.mockReset();
    mocks.createSafeRasterPreview.mockReset();
    mocks.fingerprintMediaFile.mockReset();
    mocks.fingerprintMediaFile.mockResolvedValue({
      sha256: "a".repeat(64),
      perceptualHash: "0123456789abcdef",
    });
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) =>
      Promise.resolve(responsivePackage(original)),
    );
    mocks.createSafeRasterPreview.mockResolvedValue({
      blob: new Blob(["preview"], { type: "image/webp" }),
      width: 1,
      height: 1,
      metadata: {},
    });
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: "2026-09-08T12:00:00.000Z",
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 0,
        });
      if (body.action === "match_asset") return Promise.resolve({ ...base(body), exact: null, similar: [] });
      if (body.action === "reserve_upload") return Promise.resolve({ assetId, uploads: descriptors });
      if (body.action === "abort_upload") return Promise.reject(new Error("Falha secundária na compensação"));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborta uma única vez após falha no quarto PUT e preserva o erro original", async () => {
    const user = userEvent.setup();
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", request);

    renderPage();
    await screen.findByRole("heading", { name: "Mídia contextual" });
    await completeUploadForm(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(mocks.damCommand.mock.calls.filter(([, body]) => body.action === "abort_upload")).toHaveLength(
        1,
      ),
    );
    const [, abortBody, idempotencyKey] = mocks.damCommand.mock.calls.find(
      ([, body]) => body.action === "abort_upload",
    )!;
    expect(abortBody).toMatchObject({
      action: "abort_upload",
      assetId,
      reasonCode: "client_upload_failed",
    });
    expect(abortBody.envelope.commandId).toBe(idempotencyKey);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível enviar a imagem média em WebP. Tente novamente.",
    );
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "finalize_upload")).toBe(false);
  });

  it("não aborta quando a reserva falha antes de existir asset temporário", async () => {
    const user = userEvent.setup();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: "2026-09-08T12:00:00.000Z",
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 0,
        });
      if (body.action === "match_asset") return Promise.resolve({ ...base(body), exact: null, similar: [] });
      if (body.action === "reserve_upload")
        return Promise.reject(new Error("Reserva temporariamente indisponível."));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    renderPage();
    await screen.findByRole("heading", { name: "Mídia contextual" });
    await completeUploadForm(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Reserva temporariamente indisponível.");
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "abort_upload")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
});
