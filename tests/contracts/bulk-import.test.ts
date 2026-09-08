import { describe, expect, it } from "vitest";
import {
  BULK_TEMPLATE_VERSION,
  buildBulkProductRows,
  bulkRequiredHeaders,
  bulkVocabularyOptionDisplay,
  type BulkVocabularyList,
  type BulkWorkbookTables,
} from "../../src/admin/bulk-import-model";

const controlledIds = {
  "product.category": "10000000-0000-4000-8000-000000000060",
  "product.application_magnitude": "10000000-0000-4000-8000-000000000061",
  "product.technology": "10000000-0000-4000-8000-000000000062",
  "product.installation_operation": "10000000-0000-4000-8000-000000000063",
  "product.monitored_element": "10000000-0000-4000-8000-000000000064",
} as const;

function vocabularies(): BulkVocabularyList[] {
  return Object.entries(controlledIds).map(([listKey, id], index) => ({
    list_key: listKey,
    label: `Lista ${index + 1}`,
    active: true,
    options: [
      {
        id,
        slug: `opcao-estavel-${index + 1}`,
        label: `Opção comercial ${index + 1}`,
        active: true,
        sort_order: index,
      },
    ],
  }));
}

function validTables(): BulkWorkbookTables {
  return {
    products: [
      {
        template_versao: BULK_TEMPLATE_VERSION,
        referencia_produto: "REF-COMERCIAL-001",
        titulo: "Produto sintético de lote",
        marca: "GATFLOW",
        fabricante: "OEM interno",
        linha: "Linha sintética",
        categoria_produto: "Opção comercial 1",
        aplicacao_grandeza: "opcao-estavel-2",
        tecnologia: "Opção comercial 3 [opcao-estavel-3]",
        instalacao_operacao: "opção comercial 4",
        elemento_monitorado: "OPCAO-ESTAVEL-5",
        funcao: "Medição sintética",
        descricao_curta: "Descrição curta produzida somente para teste.",
        proposta_valor: "Proposta sintética sem conteúdo legado.",
        beneficios: "Benefício A|Benefício B",
        owner_portfolio: "Owner sintético",
        revisor_tecnico: "Revisor técnico sintético",
        revisor_comercial: "Revisor comercial sintético",
        revisor_editorial: "Revisor editorial sintético",
        visibilidade_fabricante: "Interno",
        visibilidade_referencia_fabricante: "Interno",
        visibilidade_sku: "Interno",
      },
    ],
    models: [
      {
        produto_referencia: "ref-comercial-001",
        modelo_comercial: "MODELO-GAIATEC",
        referencia_fabricante: "REF-OEM",
        sku: "SKU-INTERNO",
        variante: "Variante sintética",
        codigo_variante: "VAR-SINTETICA",
        status: "ativo",
      },
    ],
    specifications: [
      {
        produto_referencia: "REF-COMERCIAL-001",
        chave: "faixa-sintetica",
        rotulo: "Faixa sintética",
        tipo: "range",
        valor: "0|100",
        unidade: "u",
        obrigatorio: "Sim",
        filtravel: "Sim",
        comparavel: "Sim",
        pesquisavel: "Sim",
      },
    ],
  };
}

describe("standardized bulk product import", () => {
  it("builds a complete draft and defaults manufacturer data to internal", () => {
    const result = buildBulkProductRows(validTables(), vocabularies());
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].slug).toBe("ref-comercial-001-produto-sintetico-de-lote");
    expect(result.rows[0].payload).toMatchObject({
      pilotState: "awaiting_owner",
      fieldVisibility: {
        manufacturer: "internal",
        manufacturerReference: "internal",
        sku: "internal",
      },
      seo: { indexable: false },
      controlledClassification: {
        productCategory: {
          id: "10000000-0000-4000-8000-000000000060",
          slug: "opcao-estavel-1",
          label: "Opção comercial 1",
        },
      },
    });
  });

  it("rejects an incomplete sheet without producing a partial row", () => {
    const tables = validTables();
    tables.models = [];
    const result = buildBulkProductRows(tables, vocabularies());
    expect(result.rows).toEqual([]);
    expect(result.errors.some((error) => error.sheet === "Modelos")).toBe(true);
  });

  it("rejects unknown or ambiguous controlled names without leaking internal ids", () => {
    const tables = validTables();
    tables.products[0].categoria_produto = "Categoria inexistente";
    const catalog = vocabularies();
    const category = catalog.find((list) => list.list_key === "product.category");
    category?.options.push({
      id: "20000000-0000-4000-8000-000000000060",
      slug: "segunda-opcao",
      label: "Opção duplicada",
      active: true,
    });
    category?.options.push({
      id: "30000000-0000-4000-8000-000000000060",
      slug: "terceira-opcao",
      label: "Opção duplicada",
      active: true,
    });

    let result = buildBulkProductRows(tables, catalog);
    expect(result.rows).toEqual([]);
    expect(result.errors.find((error) => error.field === "categoria_produto")?.message).toContain(
      "Opção não encontrada",
    );
    expect(result.errors.map((error) => error.message).join(" ")).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/i);

    tables.products[0].categoria_produto = "Opção duplicada";
    result = buildBulkProductRows(tables, catalog);
    expect(result.rows).toEqual([]);
    expect(result.errors.find((error) => error.field === "categoria_produto")?.message).toContain(
      "Nome ambíguo",
    );
  });

  it("keeps technical ids and URL slugs out of the operator-facing spreadsheet contract", () => {
    expect(bulkRequiredHeaders.products).toContain("referencia_produto");
    expect(bulkRequiredHeaders.models).toContain("produto_referencia");
    expect(bulkRequiredHeaders.specifications).toContain("produto_referencia");
    expect(bulkRequiredHeaders.products.some((header) => header.endsWith("_id"))).toBe(false);
    expect(bulkRequiredHeaders.products.some((header) => header.includes("slug"))).toBe(false);
    expect(bulkVocabularyOptionDisplay(vocabularies()[0].options[0])).toBe(
      "Opção comercial 1 [opcao-estavel-1]",
    );
  });
});
