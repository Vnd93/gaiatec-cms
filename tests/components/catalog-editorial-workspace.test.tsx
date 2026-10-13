import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogWorkspace } from "@/shared/contracts/catalog-workspace";

const mock = vi.hoisted(() => ({ read: vi.fn(), execute: vi.fn() }));
vi.mock("@/admin/api/catalog-workspace-api", async (original) => ({
  ...(await original<typeof import("@/admin/api/catalog-workspace-api")>()),
  readCatalogEditorialWorkspace: mock.read,
  executeCatalogEditorialCommand: mock.execute,
}));
import { CatalogEditorialWorkspace } from "@/admin/components/CatalogEditorialWorkspace";

const termId = "c0110000-0000-4000-8000-000000000101";
const otherId = "c0110000-0000-4000-8000-000000000102";
const savedPage = {
  term_id: termId,
  revision: 1,
  status: "draft",
  title: "Technology 0",
  summary: "Synthetic summary",
  blocks: [{ heading: "Synthetic heading", paragraphs: ["Synthetic paragraph"] }],
  term_kind: "technology",
  slug: "technology-0",
  index_requested: false,
  redirect_term_id: null,
  changed_at: "2026-10-12T01:00:00Z",
};
const workspace: CatalogWorkspace = {
  schemaVersion: 1,
  enabled: true,
  source: "override",
  permissions: { edit: true, administer: true },
  products: [],
  terms: [termId, otherId].map((id, index) => ({
    id,
    revision: 1,
    slug: `technology-${index}`,
    title: `Technology ${index}`,
    term_type: "technology",
    status: "active",
    parent_id: null,
    replacement_id: null,
  })),
  relations: [],
  hierarchy: [],
  effectiveRelations: [],
};

beforeEach(() => {
  mock.read.mockReset().mockResolvedValue([]);
  mock.execute.mockReset().mockResolvedValue(undefined);
});

async function saveDraft() {
  const user = userEvent.setup();
  render(<CatalogEditorialWorkspace workspace={workspace} onDirtyChange={vi.fn()} />);
  await screen.findByRole("combobox", { name: "Termo editorial" });
  await user.selectOptions(screen.getByRole("combobox", { name: "Termo editorial" }), termId);
  await user.type(screen.getByRole("textbox", { name: "Resumo editorial" }), "Synthetic summary");
  await user.type(screen.getByRole("textbox", { name: "Título do bloco" }), "Synthetic heading");
  await user.type(screen.getByRole("textbox", { name: "Parágrafos (um por linha)" }), "Synthetic paragraph");
  await user.type(screen.getByRole("textbox", { name: "Justificativa editorial" }), "Synthetic review");
  mock.read.mockResolvedValue([
    {
      term_id: termId,
      revision: 1,
      status: "draft",
      title: "Technology 0",
      summary: "Synthetic summary",
      blocks: [{ heading: "Synthetic heading", paragraphs: ["Synthetic paragraph"] }],
      term_kind: "technology",
      slug: "technology-0",
      index_requested: false,
      redirect_term_id: null,
      changed_at: "2026-10-12T01:00:00Z",
    },
  ]);
  await user.click(screen.getByRole("button", { name: "Salvar rascunho editorial" }));
  await screen.findByText(/Revisão registrada/);
  return user;
}

describe("editorial feedback belongs to the current action and term", () => {
  it("clears prior success when selecting a different term", async () => {
    const user = await saveDraft();
    await user.selectOptions(screen.getByRole("combobox", { name: "Termo editorial" }), otherId);
    expect(screen.queryByText(/Revisão registrada/)).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Conteúdo da página · revisão 0" })).toBeInTheDocument();
    expect(mock.execute).toHaveBeenCalledTimes(1);
  });
  it("clears prior success when validation refuses the next save", async () => {
    const user = await saveDraft();
    await user.clear(screen.getByRole("textbox", { name: "Resumo editorial" }));
    await user.click(screen.getByRole("button", { name: "Salvar rascunho editorial" }));
    await screen.findByText("Preencha título, resumo, blocos e justificativa.");
    expect(screen.queryByText(/Revisão registrada/)).not.toBeInTheDocument();
    expect(mock.execute).toHaveBeenCalledTimes(1);
  });
});

describe("private preview uses only the authorized saved revision", () => {
  it("renders saved content without another request, mutation or public link", async () => {
    const user = await saveDraft();
    const reads = mock.read.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Ver revisão gravada" }));
    const preview = screen.getByRole("article", { name: "Prévia da revisão 1" });
    expect(within(preview).getByRole("heading", { name: "Technology 0" })).toBeInTheDocument();
    expect(within(preview).getByText("Synthetic paragraph")).toBeInTheDocument();
    expect(within(preview).queryByRole("link")).not.toBeInTheDocument();
    expect(mock.read).toHaveBeenCalledTimes(reads);
    expect(mock.execute).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Fechar prévia privada" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await user.click(screen.getByRole("button", { name: "Fechar prévia privada" }));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("hides the preview and refuses stale or unsaved content", async () => {
    const user = await saveDraft();
    await user.click(screen.getByRole("button", { name: "Ver revisão gravada" }));
    await user.type(screen.getByRole("textbox", { name: "Resumo editorial" }), " Unsaved attempt");
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver revisão gravada" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Descartar alterações não salvas" }));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "Termo editorial" }), otherId);
    expect(screen.queryByRole("button", { name: "Ver revisão gravada" })).not.toBeInTheDocument();
    expect(mock.execute).toHaveBeenCalledTimes(1);
  });

  it("allows an authorized read-only viewer without granting edit or publication", async () => {
    mock.read.mockResolvedValue([savedPage]);
    const user = userEvent.setup();
    render(
      <CatalogEditorialWorkspace
        workspace={{ ...workspace, permissions: { edit: false, administer: false } }}
        onDirtyChange={vi.fn()}
      />,
    );
    await user.selectOptions(await screen.findByRole("combobox", { name: "Termo editorial" }), termId);
    expect(screen.getByRole("button", { name: "Salvar rascunho editorial" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Publicar página noindex" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ver revisão gravada" }));
    expect(screen.getByRole("article", { name: "Prévia da revisão 1" })).toBeInTheDocument();
    expect(mock.execute).not.toHaveBeenCalled();
  });

  it("escapes markup instead of executing saved content", async () => {
    const markup = '<img src="x" onerror="alert(1)">';
    mock.read.mockResolvedValue([
      { ...savedPage, blocks: [{ heading: "Safe heading", paragraphs: [markup] }] },
    ]);
    const user = userEvent.setup();
    render(<CatalogEditorialWorkspace workspace={workspace} onDirtyChange={vi.fn()} />);
    await user.selectOptions(await screen.findByRole("combobox", { name: "Termo editorial" }), termId);
    await user.click(screen.getByRole("button", { name: "Ver revisão gravada" }));
    const preview = screen.getByRole("article", { name: "Prévia da revisão 1" });
    expect(within(preview).getByText(markup)).toBeInTheDocument();
    expect(preview.querySelector("img")).toBeNull();
    expect(mock.execute).not.toHaveBeenCalled();
  });
});
