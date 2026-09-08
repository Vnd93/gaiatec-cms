import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DamPicker } from "@/admin/components/DamPicker";

const mocks = vi.hoisted(() => ({
  damCommand: vi.fn(),
  createResponsiveMediaPackage: vi.fn(),
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
}));

const assetId = "47000000-0000-4000-8000-000000000011";
const timestamp = "2026-09-08T12:00:00.000Z";
const libraryAsset = {
  id: "47000000-0000-4000-8000-000000000012",
  originalFilename: "biblioteca-qa.png",
  processingStatus: "ready",
  scanStatus: "clean",
  sourceKind: "owner_authored",
  sourceReference: "Acervo controlado QA",
  licenseName: "Uso autorizado",
  ownerName: "GAIATEC SISTEMAS",
  rightsExpiresAt: null,
  rightsState: "valid",
  altText: "Imagem pronta da biblioteca",
  caption: null,
  credit: null,
  focalX: 0.5,
  focalY: 0.5,
  width: 1200,
  height: 800,
  sha256: "c".repeat(64),
  perceptualHash: "0123456789abcdef",
  previewUrl: "https://storage.example/biblioteca-qa.webp",
  lockVersion: 1,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  collections: [],
  tags: [],
  crops: [],
  usages: [],
} as const;
const rejectedAsset = {
  ...libraryAsset,
  id: "47000000-0000-4000-8000-000000000013",
  originalFilename: "imagem-rejeitada.png",
  scanStatus: "rejected",
  altText: "Imagem rejeitada na verificação",
} as const;
const uploadedAsset = {
  ...libraryAsset,
  id: assetId,
  originalFilename: "picker-qa.png",
  altText: "Imagem de homologação do seletor",
  sha256: "b".repeat(64),
} as const;
const descriptors = [
  { key: "original", format: "png", signedUrl: "https://upload.example/original" },
  { key: "thumbnail", format: "webp", signedUrl: "https://upload.example/thumbnail-webp" },
  { key: "thumbnail", format: "avif", signedUrl: "https://upload.example/thumbnail-avif" },
  { key: "medium", format: "webp", signedUrl: "https://upload.example/medium-webp" },
  { key: "medium", format: "avif", signedUrl: "https://upload.example/medium-avif" },
  { key: "large", format: "webp", signedUrl: "https://upload.example/large-webp" },
  { key: "large", format: "avif", signedUrl: "https://upload.example/large-avif" },
] as const;

function resultBase(body: Record<string, any>) {
  return {
    schemaVersion: 1,
    commandId: body.envelope.commandId,
    correlationId: body.envelope.correlationId,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
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

function commonCommand(body: Record<string, any>, items: readonly unknown[] = []) {
  if (body.action === "capability")
    return Promise.resolve({
      ...resultBase(body),
      key: "ev2.dam",
      enabled: true,
      source: "override",
      evaluatedAt: "2026-09-08T12:00:00.000Z",
    });
  if (body.action === "list_assets")
    return Promise.resolve({
      ...resultBase(body),
      items,
      collections: [],
      tags: [],
      page: 1,
      pageSize: 50,
      total: items.length,
    });
  if (body.action === "match_asset")
    return Promise.resolve({ ...resultBase(body), exact: null, similar: [] });
  return null;
}

async function openAndCompletePicker(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Escolher ou enviar imagem" }));
  await waitFor(() =>
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "list_assets")).toBe(true),
  );
  await user.click(screen.getByRole("button", { name: "Enviar nova imagem sem sair" }));
  await user.upload(
    screen.getByLabelText(/^Imagem original/),
    new File(["original"], "picker-qa.png", { type: "image/png" }),
  );
  await user.type(screen.getByLabelText("Referência da origem"), "Acervo controlado QA");
  await user.type(screen.getByLabelText("Texto alternativo"), "Imagem de homologação do seletor");
  await user.click(screen.getByLabelText(/Confirmo origem e direitos/));
  expect(screen.getByLabelText(/^Imagem original/)).toHaveProperty("files.length", 1);
  expect(screen.getByLabelText(/Confirmo origem e direitos/)).toBeChecked();
}

describe("compensação do envio rápido no seletor DAM", () => {
  beforeEach(() => {
    mocks.damCommand.mockReset();
    mocks.createResponsiveMediaPackage.mockReset();
    mocks.fingerprintMediaFile.mockReset();
    mocks.fingerprintMediaFile.mockResolvedValue({
      sha256: "b".repeat(64),
      perceptualHash: "fedcba9876543210",
    });
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) =>
      Promise.resolve(responsivePackage(original)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("aborta uma vez após falha no quarto PUT e conserva o erro de envio", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const request = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal("fetch", request);
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body);
      if (common) return common;
      if (body.action === "reserve_upload") return Promise.resolve({ assetId, uploads: descriptors });
      if (body.action === "abort_upload") return Promise.reject(new Error("Falha secundária"));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={onChange} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    await waitFor(() => expect(request).toHaveBeenCalledTimes(4));
    await waitFor(() =>
      expect(mocks.damCommand.mock.calls.filter(([, body]) => body.action === "abort_upload")).toHaveLength(
        1,
      ),
    );
    const [, body, idempotencyKey] = mocks.damCommand.mock.calls.find(
      ([, command]) => command.action === "abort_upload",
    )!;
    expect(body).toMatchObject({
      action: "abort_upload",
      assetId,
      reasonCode: "client_upload_failed",
    });
    expect(body.envelope.commandId).toBe(idempotencyKey);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Não foi possível enviar a imagem média em WebP. Tente novamente.",
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it("não chama abort_upload quando reserve_upload falha", async () => {
    const user = userEvent.setup();
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body);
      if (common) return common;
      if (body.action === "reserve_upload")
        return Promise.reject(new Error("Reserva temporariamente indisponível."));
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={vi.fn()} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent("Reserva temporariamente indisponível.");
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "abort_upload")).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it("cancela durante a geração sem criar compensação e bloqueia controles conflitantes", async () => {
    const user = userEvent.setup();
    let generationSignal: AbortSignal | undefined;
    mocks.createResponsiveMediaPackage.mockImplementation(
      (_original: File, options: { signal?: AbortSignal } = {}) =>
        new Promise((_resolve, reject) => {
          generationSignal = options.signal;
          options.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason ?? new DOMException("Cancelado", "AbortError")),
            { once: true },
          );
        }),
    );
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body, [libraryAsset]);
      if (common) return common;
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={vi.fn()} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    await waitFor(() => expect(mocks.createResponsiveMediaPackage).toHaveBeenCalledOnce());
    const cancel = screen.getByRole("button", { name: "Cancelar envio em andamento" });
    expect(cancel).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fechar biblioteca" })).toBeDisabled();
    expect(screen.getByLabelText("Buscar")).toBeDisabled();
    expect(screen.getByLabelText("Coleção")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /biblioteca-qa\.png/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar envio" })).toBeDisabled();
    expect(screen.getByLabelText(/^Imagem original/)).toBeDisabled();
    expect(screen.getByLabelText("Referência da origem")).toBeDisabled();
    expect(screen.getByLabelText("Texto alternativo")).toBeDisabled();
    expect(screen.getByLabelText(/Confirmo origem e direitos/)).toBeDisabled();

    await user.click(cancel);

    expect(await screen.findByRole("alert")).toHaveTextContent("Envio cancelado antes da reserva");
    expect(generationSignal?.aborted).toBe(true);
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "reserve_upload")).toBe(false);
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "abort_upload")).toBe(false);
  });

  it("cancela um PUT em voo e compensa a reserva como client_cancelled", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    let requestSignal: AbortSignal | null | undefined;
    const request = vi.fn((_url: string, init?: RequestInit) => {
      requestSignal = init?.signal;
      return new Promise<Response>((_resolve, reject) => {
        if (requestSignal?.aborted) {
          reject(requestSignal.reason);
          return;
        }
        requestSignal?.addEventListener(
          "abort",
          () => reject(requestSignal?.reason ?? new DOMException("Cancelado", "AbortError")),
          { once: true },
        );
      });
    });
    vi.stubGlobal("fetch", request);
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body);
      if (common) return common;
      if (body.action === "reserve_upload") return Promise.resolve({ assetId, uploads: descriptors });
      if (body.action === "abort_upload") return Promise.resolve({ assetId, archived: true });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={onChange} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    await user.click(screen.getByRole("button", { name: "Cancelar envio em andamento" }));

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
      reasonCode: "client_cancelled",
    });
    expect(abortBody.envelope.commandId).toBe(idempotencyKey);
    expect(requestSignal?.aborted).toBe(true);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Envio cancelado. A reserva temporária foi encaminhada para limpeza segura.",
    );
    expect(mocks.damCommand.mock.calls.some(([, body]) => body.action === "finalize_upload")).toBe(false);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("preserva uma seleção externa recebida enquanto o envio está em voo", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const generation = deferred<ReturnType<typeof responsivePackage>>();
    let submittedOriginal: File | undefined;
    mocks.createResponsiveMediaPackage.mockImplementation((original: File) => {
      submittedOriginal = original;
      return generation.promise;
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body);
      if (common) return common;
      if (body.action === "reserve_upload") return Promise.resolve({ assetId, uploads: descriptors });
      if (body.action === "finalize_upload") return Promise.resolve({ assetId, status: "ready" });
      if (body.action === "get_asset") return Promise.resolve({ ...resultBase(body), asset: uploadedAsset });
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
    const externalSelection = {
      id: "47000000-0000-4000-8000-000000000014",
      originalFilename: "selecionada-externamente.png",
      altText: "Seleção externa",
      previewUrl: null,
    };

    const view = render(<DamPicker label="Galeria" value={[]} multiple onChange={onChange} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);
    await waitFor(() => expect(mocks.createResponsiveMediaPackage).toHaveBeenCalledOnce());

    view.rerender(<DamPicker label="Galeria" value={[externalSelection]} multiple onChange={onChange} />);
    await act(async () => {
      generation.resolve(responsivePackage(submittedOriginal!));
      await generation.promise;
    });

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith([
        externalSelection,
        {
          id: uploadedAsset.id,
          originalFilename: uploadedAsset.originalFilename,
          altText: uploadedAsset.altText,
          previewUrl: uploadedAsset.previewUrl,
        },
      ]),
    );
  });

  it("não renderiza como selecionável uma mídia pronta cujo scan foi rejeitado", async () => {
    const user = userEvent.setup();
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body, [libraryAsset, rejectedAsset]);
      if (common) return common;
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar imagem" }));

    expect(await screen.findByRole("button", { name: /^biblioteca-qa\.png/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /imagem-rejeitada\.png/ })).not.toBeInTheDocument();
  });

  it("não seleciona um resultado exato que ainda não foi liberado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "match_asset")
        return Promise.resolve({ ...resultBase(body), exact: rejectedAsset, similar: [] });
      const common = commonCommand(body);
      if (common) return common;
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={onChange} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O arquivo já existe, mas ainda não está liberado para uso.",
    );
    expect(onChange).not.toHaveBeenCalled();
    expect(mocks.createResponsiveMediaPackage).not.toHaveBeenCalled();
  });

  it("exibe somente resultados semelhantes liberados", async () => {
    const user = userEvent.setup();
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "match_asset")
        return Promise.resolve({
          ...resultBase(body),
          exact: null,
          similar: [rejectedAsset, libraryAsset],
        });
      const common = commonCommand(body);
      if (common) return common;
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });

    render(<DamPicker label="Imagem principal" value={[]} onChange={vi.fn()} />);
    await openAndCompletePicker(user);
    fireEvent.submit(screen.getByRole("button", { name: "Verificar e enviar" }).closest("form")!);

    expect(await screen.findByRole("button", { name: /^biblioteca-qa\.png/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /imagem-rejeitada\.png/ })).not.toBeInTheDocument();
    expect(mocks.createResponsiveMediaPackage).not.toHaveBeenCalled();
  });

  it("bloqueia todos os controles internos ao receber disabled com o painel já aberto", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mocks.damCommand.mockImplementation((_session, body: Record<string, any>) => {
      const common = commonCommand(body, [libraryAsset]);
      if (common) return common;
      throw new Error(`Ação inesperada: ${String(body.action)}`);
    });
    const selected = {
      id: libraryAsset.id,
      originalFilename: libraryAsset.originalFilename,
      altText: libraryAsset.altText,
      previewUrl: libraryAsset.previewUrl,
    };
    const view = render(<DamPicker label="Imagem principal" value={[selected]} onChange={onChange} />);
    await user.click(screen.getByRole("button", { name: "Escolher ou enviar imagem" }));
    expect(await screen.findByRole("button", { name: /^biblioteca-qa\.png/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Enviar nova imagem sem sair" }));

    view.rerender(<DamPicker label="Imagem principal" value={[selected]} disabled onChange={onChange} />);
    mocks.damCommand.mockClear();

    expect(screen.getByRole("button", { name: "Fechar biblioteca" })).toBeDisabled();
    expect(screen.getByRole("button", { name: `Remover ${libraryAsset.originalFilename}` })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^biblioteca-qa\.png/ })).toBeDisabled();
    expect(screen.getByLabelText("Buscar")).toBeDisabled();
    expect(screen.getByLabelText("Coleção")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Filtrar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar envio" })).toBeDisabled();
    expect(screen.getByLabelText(/^Imagem original/)).toBeDisabled();
    expect(screen.getByLabelText("Referência da origem")).toBeDisabled();
    expect(screen.getByLabelText("Proprietário")).toBeDisabled();
    expect(screen.getByLabelText("Licença")).toBeDisabled();
    expect(screen.getByLabelText("Direitos válidos até")).toBeDisabled();
    expect(screen.getByLabelText("Texto alternativo")).toBeDisabled();
    expect(screen.getByLabelText(/Confirmo origem e direitos/)).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verificar e enviar" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: /^biblioteca-qa\.png/ }));
    await user.click(screen.getByRole("button", { name: "Filtrar" }));
    await user.click(screen.getByRole("button", { name: "Verificar e enviar" }));
    expect(onChange).not.toHaveBeenCalled();
    expect(mocks.damCommand).not.toHaveBeenCalled();
    expect(mocks.createResponsiveMediaPackage).not.toHaveBeenCalled();
  });
});
