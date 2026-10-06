import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminProductEditorPage from "@/admin/pages/AdminProductEditorPage";
import { CmsProductContentSchema } from "@/shared/contracts/cms-content";
import { createInitialProductDraft } from "@/admin/product-editor-model";

const mocks = vi.hoisted(() => ({
  editorialCommand: vi.fn(),
  draftV2Command: vi.fn(),
  progressive: false,
  session: { access_token: "test-token", user: { id: "90000000-0000-4000-8000-000000000001" } },
}));
const id = (suffix: number) => `90000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const vocabulary = [
  ["Categoria de produto", "product.category"],
  ["Aplicação / grandeza", "product.application_magnitude"],
  ["Tecnologia", "product.technology"],
  ["Instalação / operação", "product.installation_operation"],
  ["Elemento monitorado", "product.monitored_element"],
];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        in: () => query,
        order: () => Promise.resolve({ data: [], error: null }),
      };
      return query;
    },
  },
}));
vi.mock("@/admin/auth/AdminAuthContext", () => ({
  useAdminAuth: () => ({ session: mocks.session, profile: { permissions: ["cms:products.edit"] } }),
}));
vi.mock("@/admin/api/cms-api", () => ({
  CmsApiError: class extends Error {},
  draftV2Command: mocks.draftV2Command,
  attributesCommand: vi.fn().mockImplementation(async () => ({
    schemaVersion: 1,
    commandId: id(90),
    correlationId: id(91),
    attributeSet: null,
    definitions: [
      {
        id: id(20),
        attributeKey: "atributo-qa",
        label: "Atributo QA",
        description: "Atributo sintético",
        dataType: "boolean",
        canonicalUnitCode: null,
        enumOptions: [],
        filterable: true,
        comparable: true,
        searchable: true,
        required: true,
        inherited: false,
        position: 1,
      },
    ],
    units: [],
  })),
  controlledVocabularyCommand: vi.fn().mockImplementation(async () => ({
    items: vocabulary.map(([label, key], index) => ({
      id: id(index + 30),
      list_key: key,
      label,
      options: [{ id: id(index + 40), slug: `termo-${index}`, label: `Termo QA ${index}`, active: true }],
    })),
  })),
  editorialCommand: mocks.editorialCommand,
  issuePreview: vi.fn(),
}));
vi.mock("@/admin/hooks/useDraftBackup", () => ({
  useDraftBackup: () => ({
    recoverable: null,
    state: "idle",
    restore: vi.fn(),
    discard: vi.fn(),
    clear: vi.fn(),
  }),
}));
vi.mock("@/admin/components/UnsavedChangesGuard", () => ({ UnsavedChangesGuard: () => null }));
vi.mock("@/admin/ev2-runtime", () => ({
  cmsEnvironment: () => "local",
  isEv2FeatureEnabled: () => mocks.progressive,
}));

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
}
function click(name: string, role = "button") {
  fireEvent.click(screen.getByRole(role, { name }));
}

describe("new product creation through the real editor", () => {
  beforeEach(() => {
    mocks.progressive = false;
    mocks.editorialCommand
      .mockReset()
      .mockResolvedValue({ itemId: id(99), status: "draft", correlationId: id(98) });
    let lockVersion = 2;
    const privateDraft = createInitialProductDraft();
    mocks.draftV2Command.mockReset().mockImplementation(async (_session, request) => {
      if (request.action === "capability") return { enabled: true };
      if (request.action === "resume")
        return {
          draft: {
            schemaVersion: 2,
            contentType: "product",
            workingTitle: "",
            fields: { draft: privateDraft, activeTab: "especificacoes" },
            draftId: id(80),
            status: "active",
            lockVersion,
            fieldsHash: "a".repeat(64),
            createdAt: "2026-10-06T02:00:00.000Z",
            updatedAt: "2026-10-06T02:01:00.000Z",
          },
        };
      if (!["patch", "promote"].includes(request.action)) throw new Error("Unexpected private draft action");
      expect(request.envelope.expectedVersion).toBe(lockVersion);
      return {
        schemaVersion: 1,
        commandId: request.envelope.commandId,
        correlationId: request.envelope.correlationId,
        draftId: id(80),
        status: request.action === "promote" ? "promoted" : "active",
        lockVersion: ++lockVersion,
        savedAt: "2026-10-06T02:02:00.000Z",
        replayed: false,
        ...(request.action === "promote" ? { itemId: id(99) } : {}),
      };
    });
  });

  it.each([false, true])(
    "creates a complete product with progressive draft enabled=%s",
    async (progressive) => {
      mocks.progressive = progressive;
      render(
        <MemoryRouter initialEntries={["/admin/produtos/novo"]}>
          <Routes>
            <Route path="/admin/produtos/:id" element={<AdminProductEditorPage />} />
            <Route path={`/admin/produtos/${id(99)}`} element={<p>Rascunho criado</p>} />
          </Routes>
        </MemoryRouter>,
      );
      const runTag = "QA-CMS-FINAL-20261006-bcc9a22b";
      await waitFor(() => expect(screen.getByLabelText("Categoria de produto")).toBeEnabled());
      if (progressive) {
        await screen.findByText("Rascunho recuperável no servidor");
        click("Salvar rascunho");
        expect(await screen.findByRole("alert")).toHaveTextContent("O rascunho foi preservado localmente");
        expect(mocks.draftV2Command.mock.calls.some(([, request]) => request.action === "promote")).toBe(
          false,
        );
        expect(mocks.editorialCommand).not.toHaveBeenCalled();
        click("Restaurar versão do servidor");
        click("Dados essenciais", "tab");
      }
      fill("Nome comercial do produto", `${runTag} PRODUTO`);
      fill("Marca comercial", "Marca QA");
      fill("Fabricante/OEM nominal", "Fabricante QA");
      fill("Site oficial do fabricante/OEM", "https://example.invalid/fabricante-qa");
      fill("Linha", "Linha QA");
      for (const [index, [label]] of vocabulary.entries()) fill(label, `Termo QA ${index}`);
      fill("Função", "Medição sintética controlada");
      fill("Resumo", `${runTag} resumo do produto sintético.`);
      fill("Descrição curta", "Produto temporário de homologação.");
      fill("Proposta de valor", "Validar o ciclo PIM sem dados comerciais reais.");
      fill("Benefícios", "Rastreabilidade");
      click("Adicionar item em benefícios");
      fill("Benefícios 2", "Isolamento");
      fill("Diferenciais", "Conteúdo não indexável");
      click("Adicionar item em diferenciais");
      fill("Diferenciais 2", "Reversão comprovada");
      fill("Texto", `${runTag} descrição técnica sintética.`);

      click("Modelos", "tab");
      fill("Modelo 1", "MODELO-QA");
      fill("Referência 1", "REF-QA");
      fill("Código comercial do modelo 1", "QA-MODELO");
      fill("Nome da variante 1 do modelo 1", "Variante QA");
      fill("Referência da variante 1 do modelo 1", "VAR-QA");
      fill("Código comercial da variante 1 do modelo 1", "QA-VAR");
      await waitFor(() => expect(screen.getByLabelText("Atributo controlado")).toBeEnabled());
      fill("Atributo controlado", id(20));
      fill("Valor", "true");
      click("Valor técnico homologado", "checkbox");

      click("SEO e publicação", "tab");
      fill("Meta title", `${runTag} PRODUTO | GAIATEC`);
      fill("Meta description", `${runTag} produto sintético temporário não indexável.`);
      fill("Endereço canônico no site", `/produtos/${runTag.toLowerCase()}-produto`);
      fill("Estado do piloto", "synthetic_test");
      click("Adicionar fonte");
      fill("Referência de autorização", runTag);
      fill("Data da autorização", "2026-10-06");
      fill("Escopo dos direitos", "Homologação sintética descartável");
      fill("Responsável comercial", "Owner QA");
      fill("Responsável técnico", "Revisor QA");
      click("Confirmo que a fonte e os direitos foram verificados", "checkbox");
      fill("Owner do portfólio", "Owner QA");
      fill("Revisor técnico", "Revisor QA");
      fill("Revisor comercial", "Revisor QA");
      fill("Revisor editorial", "Revisor QA");
      fill("Homologado em", "2026-10-06T02:00");
      fill("Motivo da revisão", `${runTag} criação pela UI`);
      fireEvent.click(screen.getAllByRole("button", { name: "Salvar rascunho" })[0]);

      await screen.findByText("Rascunho criado");
      const request = progressive
        ? mocks.draftV2Command.mock.calls.find(([, body]) => body.action === "promote")![1]
        : mocks.editorialCommand.mock.calls[0][1];
      if (progressive) {
        expect(request).toMatchObject({
          action: "promote",
          draftId: id(80),
          envelope: { expectedVersion: 3 },
        });
        expect(mocks.editorialCommand).not.toHaveBeenCalled();
      } else {
        expect(request).toMatchObject({ action: "create", contentType: "product" });
        expect(mocks.editorialCommand).toHaveBeenCalledOnce();
        expect(mocks.draftV2Command).not.toHaveBeenCalled();
      }
      const payload = CmsProductContentSchema.parse(request.payload);
      expect(payload.blocks[0]).toMatchObject({
        type: "rich_text",
        data: { text: `${runTag} descrição técnica sintética.` },
      });
      expect(payload.models[0]).toMatchObject({
        model: "MODELO-QA",
        manufacturerReference: "REF-QA",
        sku: "QA-MODELO",
      });
      expect(payload.seo.indexable).toBe(false);
      expect(await screen.findByText("Rascunho criado")).toBeVisible();
    },
  );
});
