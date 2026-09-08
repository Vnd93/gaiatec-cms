import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { humanValidationFields, humanValidationPath } from "@/admin/validation-field-label";

const repositoryRoot = resolve(import.meta.dirname, "../..");

function source(path: string) {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

describe("campos administrativos orientados a negócio", () => {
  it("traduz caminhos estruturais sem vazar chaves internas", () => {
    expect(humanValidationPath(["blocks", 0, "data", "title"])).toBe(
      "Blocos da página › item 1 › Conteúdo do bloco › Título",
    );
    expect(humanValidationPath(["internal_unknown_key"])).toBe("Campo do cadastro");
    expect(humanValidationFields(["payload.title", "seo.description"])).toBe(
      "Conteúdo › Título, SEO › Descrição",
    );
  });

  it("não exige slug, UUID ou JSON nos editores editoriais cotidianos", () => {
    const discovery = source("src/admin/components/DiscoveryContentEditor.tsx");
    const article = source("src/admin/pages/AdminEditorPage.tsx");
    const builder = source("src/admin/pages/AdminPageBuilderPage.tsx");

    expect(discovery).not.toMatch(/JSON governado|Conteúdo avançado|IDs relacionados|UUID da mídia/i);
    expect(article).not.toMatch(/Identificador da URL|Slug do autor|Slug da categoria|revision\.payload/i);
    expect(builder).not.toMatch(/Endereço amigável \(slug\)|Identificador da URL/i);
    expect(builder).not.toContain("blocks.form —");
    expect(article).toContain('aria-label="Endereço público gerado"');
    expect(builder).toContain('aria-label="Endereço público gerado"');
  });

  it("usa referências comerciais e seleções humanas em importação, Trabalho e DAM", () => {
    const importer = source("src/admin/pages/AdminBulkImportPage.tsx");
    const work = source("src/admin/pages/AdminWorkPage.tsx");
    const dam = source("src/admin/pages/AdminDamPage.tsx");
    const legacyMedia = source("src/admin/pages/AdminMediaPage.tsx");

    expect(importer).toContain("referencia_produto");
    expect(importer).not.toMatch(/ID da categoria|ID da marca|ID do fabricante|ID da linha|ID do país/i);
    expect(work).not.toMatch(/ID do conteúdo|ID da revisão|ID do release|ID do responsável/i);
    expect(work).not.toContain("itemId,revisionId");
    expect(work).not.toContain("taskId,expectedVersion");
    expect(work.match(/\{ id: "inbox", label: "Pendências"/g)).toHaveLength(1);
    expect(work).not.toContain('item.diff.changedFields.join(", ")');
    expect(work).toContain("humanValidationFields(item.diff.changedFields)");
    expect(work).toContain("taskPriorityLabels[task.priority]");
    expect(work).toContain("taskStatusLabels[task.status]");
    expect(work).toContain('taskEventLabels[event.eventType] ?? "Tarefa atualizada"');
    expect(work).not.toMatch(/label: "Inbox"|Dry-run válido|Jobs recentes|Abrir alvo|Executar lote atômico/);
    expect(work).not.toContain("bulkStatusLabels[job.status] ?? job.status");
    expect(dam).toContain("Nome do recorte");
    expect(dam).not.toMatch(/item \{usage\.itemId|targetAssetId\.slice|versão \$\{selected\.lockVersion/i);
    expect(legacyMedia).not.toMatch(/item \{usage\.item_id|`\/midia\/\$\{selected\.id\}`/i);
  });

  it("gera chaves estruturais internamente e oculta versões de concorrência", () => {
    const vocabulary = source("src/admin/pages/AdminControlledVocabulariesPage.tsx");
    const content = source("src/admin/pages/AdminContentPage.tsx");
    const sites = source("src/admin/pages/AdminSitesPage.tsx");
    const discovery = source("src/admin/pages/AdminDiscoveryPage.tsx");

    expect(vocabulary).toContain("semanticListPayload");
    expect(vocabulary).toContain("Área de uso");
    expect(vocabulary).not.toContain("Configuração técnica avançada de dimensão");
    expect(vocabulary).not.toContain("Chave da lista");
    expect(vocabulary).not.toContain("value={optionDraft.slug}");
    expect(vocabulary).not.toContain("value={listDraft.dimensionKey}");
    expect(content).not.toContain('{ label: "Versão", value: selected.cms_content_drafts');
    expect(sites).not.toContain("<dd>{selected.lockVersion}</dd>");
    expect(sites).toContain("urlSegmentFromText(newName");
    expect(sites).not.toContain("value={newKey}");
    expect(sites).not.toMatch(/>\s*\{token\.key\}\s*</);
    expect(sites).toContain('type="color"');
    expect(sites).toContain("tokenChoices[token.key]");
    expect(discovery).not.toContain('<p className="admin-eyebrow">{meta[kind].consumerId}</p>');
  });

  it("oferece repetidores visuais para coleções de conteúdo e formulários", () => {
    const discovery = source("src/admin/components/DiscoveryContentEditor.tsx");
    const forms = source("src/admin/pages/AdminFormsPage.tsx");

    expect(discovery).toContain("Adicionar item em");
    expect(discovery).not.toMatch(/value=\{\(value \?\? \[\]\)\.join\("\\n"\)\}/);
    expect(forms).toContain("Adicionar opção");
    expect(forms).not.toContain('field.options.join("\\n")');
    expect(forms).not.toContain('e.target.value.split("\\n")');
    expect(forms).not.toMatch(/>\s*Chave\s*<input/);
  });

  it("usa listas estruturadas e linguagem editorial nas telas de conteúdo, busca, qualidade e páginas", () => {
    const article = source("src/admin/pages/AdminEditorPage.tsx");
    const search = source("src/admin/pages/AdminSearchGovernancePage.tsx");
    const quality = source("src/admin/pages/AdminQualityPage.tsx");
    const pages = source("src/admin/pages/AdminPagesPage.tsx");

    expect(article).not.toMatch(/Tags separadas por vírgula|\.split\(","\)/i);
    expect(article).toContain("Adicionar tag");
    expect(article).toContain("Remover tag ${tag}");
    expect(article).toContain("Fluxo editorial");
    expect(article).not.toMatch(/>Workflow<|Preview do rascunho|Meta title|Meta description/);

    expect(search).not.toMatch(/Aliases separados por vírgula|\.split\(","\)/i);
    expect(search).toContain("Adicionar variação");
    expect(search).toContain("Remover variação ${alias}");
    expect(search).toContain("searchUpdateStatusLabel(jobs[0].status)");
    expect(search).not.toContain("{jobs[0].status}");

    expect(quality).toContain("qualityResultLabel(result.status)");
    expect(quality).toContain("findingMessage(finding.ruleKey)");
    expect(quality).not.toMatch(/Capacidade EV2\.6|EV2\.6 · QUALIDADE|conteúdo e PIM/);

    expect(pages).toContain("pageStatusLabel(item.workflow_status)");
    expect(pages).toContain("pageKindLabel(payload?.pageKind)");
    expect(pages).not.toMatch(/SITE BUILDER|com preview|no builder|\{item\.workflow_status\}/);
  });
});
