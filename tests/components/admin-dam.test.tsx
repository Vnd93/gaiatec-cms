import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType } from "react";
import { createMemoryRouter, Link, RouterProvider } from "react-router";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dam: vi.fn(),
  capabilityEnabled: true,
  auth: {
    session: { access_token: "test-token" },
    profile: {
      permissions: ["cms:media.read", "cms:media.upload", "cms:media.manage"],
      ev2Capabilities: {
        schemaVersion: 1,
        status: "ready",
        environment: "local",
        siteKey: "main",
        evaluatedAt: new Date().toISOString(),
        capabilities: {
          "ev2.dam": {
            schemaVersion: 1,
            key: "ev2.dam",
            enabled: true,
            source: "override",
            evaluatedAt: new Date().toISOString(),
          },
        },
      },
    },
  },
}));

vi.mock("@/admin/api/cms-api", () => ({ damCommand: mocks.dam }));
vi.mock("@/admin/auth/AdminAuthContext", () => ({ useAdminAuth: () => mocks.auth }));

const timestamp = "2026-09-02T23:00:00+00:00";
const asset = {
  id: "47000000-0000-4000-8000-000000000010",
  originalFilename: "produto.png",
  processingStatus: "ready",
  scanStatus: "clean",
  sourceKind: "official_manufacturer",
  sourceReference: "Catálogo oficial",
  licenseName: "Uso autorizado",
  ownerName: "Fabricante",
  rightsExpiresAt: "2027-09-02T23:00:00+00:00",
  rightsState: "valid",
  altText: "Vista frontal do produto",
  caption: null,
  credit: null,
  focalX: 0.5,
  focalY: 0.5,
  width: 1200,
  height: 800,
  sha256: "a".repeat(64),
  perceptualHash: "0123456789abcdef",
  previewUrl: "https://storage.example/preview.webp",
  lockVersion: 1,
  archivedAt: null,
  createdAt: timestamp,
  updatedAt: timestamp,
  collections: [],
  tags: [],
  crops: [],
  usages: [],
} as const;

const secondAsset = {
  ...asset,
  id: "47000000-0000-4000-8000-000000000011",
  originalFilename: "segunda-imagem.png",
  altText: "Segunda imagem do produto",
  sha256: "b".repeat(64),
  perceptualHash: "fedcba9876543210",
} as const;

const persistedCrop = {
  id: "47000000-0000-4000-8000-000000000020",
  cropKey: "banner-amplo",
  label: "Banner amplo",
  aspectWidth: 16,
  aspectHeight: 9,
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.8,
  focalX: 0.4,
  focalY: 0.6,
  updatedAt: timestamp,
} as const;

function base(body: Record<string, any>) {
  return { schemaVersion: 1, commandId: body.envelope.commandId, correlationId: body.envelope.correlationId };
}

let AdminDamPage: ComponentType;

describe("admin DAM candidate", () => {
  beforeAll(async () => {
    AdminDamPage = (await import("@/admin/pages/AdminDamPage")).default;
  });
  beforeEach(() => {
    mocks.dam.mockReset();
    mocks.capabilityEnabled = true;
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: mocks.capabilityEnabled,
          source: mocks.capabilityEnabled ? "override" : "default",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [asset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      if (body.action === "get_asset")
        return Promise.resolve({
          ...base(body),
          asset: {
            ...asset,
            usages: [
              {
                itemId: "47000000-0000-4000-8000-000000000030",
                revisionId: null,
                blockId: null,
                usageKind: "content",
                createdAt: timestamp,
                contentType: "page",
                displayTitle: "Página técnica do produto",
                adminPath: "/admin/conteudo/47000000-0000-4000-8000-000000000030",
                blockLabel: "Galeria principal",
              },
            ],
          },
        });
      throw new Error(`Unexpected action ${body.action}`);
    });
  });

  function renderPage() {
    const router = createMemoryRouter(
      [
        {
          path: "/admin/midia",
          element: (
            <>
              <AdminDamPage />
              <Link to="/admin/produtos">Produtos</Link>
            </>
          ),
        },
        { path: "/admin/produtos", element: <h1>Produtos</h1> },
      ],
      { initialEntries: ["/admin/midia"] },
    );
    return render(<RouterProvider router={router} />);
  }

  it("lists governed assets and exposes a human-readable usage map", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(await screen.findByRole("heading", { name: "Mídia contextual" })).toBeVisible();
    expect(screen.getByText("Vista frontal do produto")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    const usageLink = await screen.findByRole("link", { name: "Página técnica do produto" });
    expect(usageLink).toHaveAttribute("href", "/admin/conteudo/47000000-0000-4000-8000-000000000030");
    expect(usageLink.closest("li")).toHaveTextContent(
      "Página técnica do produto · Conteúdo editorial · versão atual · Galeria principal",
    );
    expect(screen.queryByText(/47000000/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Arquivar imagem" })).toBeDisabled();
  });

  it("fails closed when the server-side DAM flag is disabled", async () => {
    mocks.capabilityEnabled = false;
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent("Biblioteca de mídia desativada"),
    );
    expect(screen.queryByRole("heading", { name: "Mídia contextual" })).not.toBeInTheDocument();
  });

  it("adds tags one at a time and sends a structured list instead of comma-separated text", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));

    const tagField = await screen.findByRole("combobox", { name: /Nova tag/ });
    const addTag = screen.getByRole("button", { name: "Adicionar tag" });
    await user.type(tagField, "primeira, segunda");
    expect(addTag).toBeDisabled();
    await user.clear(tagField);
    await user.type(tagField, "primeira");
    await user.click(addTag);
    await user.type(tagField, "segunda");
    await user.click(addTag);

    expect(screen.getByRole("list", { name: "Tags da imagem" })).toHaveTextContent("primeira");
    expect(screen.getByRole("list", { name: "Tags da imagem" })).toHaveTextContent("segunda");
    await user.click(screen.getByRole("button", { name: "Salvar organização" }));
    await waitFor(() =>
      expect(mocks.dam).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ action: "set_organization", tags: ["primeira", "segunda"] }),
        expect.any(String),
      ),
    );
  });

  it("keeps only the latest asset request when detail responses arrive out of order", async () => {
    let resolveFirst!: (value: Record<string, unknown>) => void;
    let resolveSecond!: (value: Record<string, unknown>) => void;
    const firstResponse = new Promise<Record<string, unknown>>((resolve) => {
      resolveFirst = resolve;
    });
    const secondResponse = new Promise<Record<string, unknown>>((resolve) => {
      resolveSecond = resolve;
    });
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [asset, secondAsset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 2,
        });
      if (body.action === "get_asset") {
        return body.assetId === asset.id ? firstResponse : secondResponse;
      }
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos de segunda-imagem.png" }));
    resolveSecond({
      ...base({ envelope: { commandId: crypto.randomUUID(), correlationId: crypto.randomUUID() } }),
      asset: secondAsset,
    });
    expect(await screen.findByRole("heading", { name: "Governar: segunda-imagem.png" })).toBeVisible();
    resolveFirst({
      ...base({ envelope: { commandId: crypto.randomUUID(), correlationId: crypto.randomUUID() } }),
      asset,
    });
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Governar: segunda-imagem.png" })).toBeVisible(),
    );
    expect(screen.queryByRole("heading", { name: "Governar: produto.png" })).not.toBeInTheDocument();
  });

  it("handles an invalid asset response without leaving stale details or an unhandled rejection", async () => {
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [asset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      if (body.action === "get_asset") return Promise.resolve({ ...base(body), asset: { id: "inválido" } });
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível abrir os detalhes da imagem.",
    );
    expect(screen.queryByRole("heading", { name: /Governar:/ })).not.toBeInTheDocument();
  });

  it("loads a persisted crop and sends a ratio-correct strict payload after an explicit change", async () => {
    const croppedAsset = { ...asset, width: 1600, height: 900, crops: [persistedCrop] };
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [croppedAsset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      if (body.action === "get_asset") return Promise.resolve({ ...base(body), asset: croppedAsset });
      if (body.action === "save_crop") return Promise.resolve(base(body));
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    expect(await screen.findByRole("combobox", { name: "Recorte salvo" })).toHaveValue(persistedCrop.id);
    expect(screen.getByRole("combobox", { name: "Formato do recorte" })).toHaveValue("16:9");
    expect(screen.getByRole("button", { name: "Salvar recorte" })).toBeDisabled();

    await user.selectOptions(screen.getByRole("combobox", { name: "Formato do recorte" }), "1:1");
    const save = screen.getByRole("button", { name: "Salvar recorte" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() =>
      expect(mocks.dam).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          action: "save_crop",
          assetId: asset.id,
          crop: {
            cropKey: "banner-amplo",
            label: "Banner amplo",
            aspectWidth: 1,
            aspectHeight: 1,
            x: 0.21875,
            y: 0,
            width: 0.5625,
            height: 1,
            focalX: 0.4,
            focalY: 0.6,
          },
        }),
        expect.any(String),
      ),
    );
  });

  it("blocks changing assets with a dirty crop, then discards without carrying state", async () => {
    const firstAsset = { ...asset, width: 1600, height: 900, crops: [persistedCrop] };
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [firstAsset, secondAsset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 2,
        });
      if (body.action === "get_asset")
        return Promise.resolve({
          ...base(body),
          asset: body.assetId === asset.id ? firstAsset : secondAsset,
        });
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    await user.selectOptions(await screen.findByRole("combobox", { name: "Formato do recorte" }), "1:1");
    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos de segunda-imagem.png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Salve ou descarte as alterações antes de abrir outra imagem.",
    );
    expect(screen.getByRole("heading", { name: "Governar: produto.png" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Descartar alterações do recorte" }));
    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos de segunda-imagem.png" }));
    expect(await screen.findByRole("heading", { name: "Governar: segunda-imagem.png" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "Recorte salvo" })).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nome do recorte" })).toHaveValue("Quadrado");
  });

  it("blocks archiving a replacement target even when it has no direct usages", async () => {
    const replacementTarget = {
      ...asset,
      usages: [],
      incomingReplacement: {
        id: "47000000-0000-4000-8000-000000000040",
        sourceAssetId: "47000000-0000-4000-8000-000000000041",
        lockVersion: 2,
      },
    };
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [replacementTarget],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      if (body.action === "get_asset") return Promise.resolve({ ...base(body), asset: replacementTarget });
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    expect(await screen.findByText(/destino de uma substituição ativa/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Arquivar imagem" })).toBeDisabled();
  });

  it("protects metadata edits from being lost when another asset is opened", async () => {
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [asset, secondAsset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 2,
        });
      if (body.action === "get_asset")
        return Promise.resolve({
          ...base(body),
          asset: body.assetId === asset.id ? asset : secondAsset,
        });
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    const filename = await screen.findByRole("textbox", { name: "Nome do arquivo" });
    await user.clear(filename);
    await user.type(filename, "produto-revisado.png");
    expect(screen.getByRole("button", { name: "Salvar metadados" })).toBeEnabled();
    expect(screen.getByRole("combobox", { name: "Formato do recorte" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos de segunda-imagem.png" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Salve ou descarte as alterações antes de abrir outra imagem.",
    );
    expect(screen.getByRole("heading", { name: "Governar: produto.png" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Descartar alterações de metadados" }));
    expect(filename).toHaveValue("produto.png");
    await user.click(screen.getByRole("button", { name: "Abrir detalhes e usos de segunda-imagem.png" }));
    expect(await screen.findByRole("heading", { name: "Governar: segunda-imagem.png" })).toBeVisible();
  });

  it("protects dirty media metadata from route navigation until the operator decides", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    await user.type(await screen.findByRole("textbox", { name: "Legenda" }), "Alteração pendente");

    await user.click(screen.getByRole("link", { name: "Produtos" }));
    expect(screen.getByRole("alertdialog", { name: "Sair sem salvar?" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Continuar editando" }));
    expect(screen.getByRole("heading", { name: "Governar: produto.png" })).toBeVisible();

    await user.click(screen.getByRole("link", { name: "Produtos" }));
    await user.click(screen.getByRole("button", { name: "Sair sem salvar" }));
    expect(await screen.findByRole("heading", { name: "Produtos" })).toBeVisible();
  });

  it("retains a collection name when creation fails", async () => {
    mocks.dam.mockImplementation((_session, body: Record<string, any>) => {
      if (body.action === "capability")
        return Promise.resolve({
          ...base(body),
          key: "ev2.dam",
          enabled: true,
          source: "override",
          evaluatedAt: timestamp,
        });
      if (body.action === "list_assets")
        return Promise.resolve({
          ...base(body),
          items: [asset],
          collections: [],
          tags: [],
          page: 1,
          pageSize: 20,
          total: 1,
        });
      if (body.action === "get_asset") return Promise.resolve({ ...base(body), asset });
      if (body.action === "upsert_collection") return Promise.reject(new Error("Falha controlada"));
      throw new Error(`Unexpected action ${body.action}`);
    });

    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Abrir detalhes e usos de produto.png" }));
    const collectionName = await screen.findByRole("textbox", { name: "Nova coleção" });
    await user.type(collectionName, "Coleção QA controlada");
    await user.click(screen.getByRole("button", { name: "Criar coleção" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Falha controlada");
    expect(collectionName).toHaveValue("Coleção QA controlada");
  });
});
