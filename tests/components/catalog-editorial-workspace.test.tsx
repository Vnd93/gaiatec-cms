import { render, screen } from "@testing-library/react";
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
