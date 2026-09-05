import { describe, expect, it } from "vitest";
import {
  BULK_TEMPLATE_VERSION,
  buildBulkProductRows,
  type BulkWorkbookTables,
} from "../../src/admin/bulk-import-model";

function validTables(): BulkWorkbookTables {
  return {
    products: [
      {
        template_versao: BULK_TEMPLATE_VERSION,
        slug: "produto-sintetico-lote",
        titulo: "Produto sintético de lote",
        marca: "GATFLOW",
        marca_slug: "gatflow",
        fabricante: "OEM interno",
        fabricante_slug: "oem-interno",
        linha: "Linha sintética",
        linha_slug: "linha-sintetica",
        categoria_produto_id: "10000000-0000-4000-8000-000000000060",
        aplicacao_grandeza_id: "10000000-0000-4000-8000-000000000061",
        tecnologia_id: "10000000-0000-4000-8000-000000000062",
        instalacao_operacao_id: "10000000-0000-4000-8000-000000000063",
        elemento_monitorado_id: "10000000-0000-4000-8000-000000000064",
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
        produto_slug: "produto-sintetico-lote",
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
        produto_slug: "produto-sintetico-lote",
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
    const result = buildBulkProductRows(validTables());
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payload).toMatchObject({
      pilotState: "awaiting_owner",
      fieldVisibility: {
        manufacturer: "internal",
        manufacturerReference: "internal",
        sku: "internal",
      },
      seo: { indexable: false },
      controlledClassification: {
        productCategory: { id: "10000000-0000-4000-8000-000000000060" },
      },
    });
  });

  it("rejects an incomplete sheet without producing a partial row", () => {
    const tables = validTables();
    tables.models = [];
    const result = buildBulkProductRows(tables);
    expect(result.rows).toEqual([]);
    expect(result.errors.some((error) => error.sheet === "Modelos")).toBe(true);
  });
});
