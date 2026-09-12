import { describe, expect, it } from "vitest";
import { CmsPageContentSchema } from "../../src/shared/contracts/cms-content";
import {
  PAGE_BUILDER_TABS,
  createInitialPagePayload,
  pageBuilderTabLabel,
  pageSchemaForContentType,
  tabForPagePath,
} from "../../src/admin/page-builder-model";
import { humanValidationIssue, humanValidationPath } from "../../src/admin/validation-field-label";

const GENERIC_LABEL = "Campo do cadastro";

describe("painel de pendências do construtor de páginas", () => {
  it("manda cada campo para a aba onde ele é realmente editado", () => {
    // `route` está partido entre duas abas no formulário: o endereço público é editado em
    // "SEO e URL", os rótulos de navegação em "Estrutura". Um mapa que decidisse só pela
    // primeira chave do caminho mandaria o operador para a aba errada — que é pior do que
    // não oferecer atalho nenhum.
    expect(tabForPagePath(["route", "path"])).toBe("seo");
    expect(tabForPagePath(["route", "navigationLabel"])).toBe("structure");
    expect(tabForPagePath(["route", "breadcrumbLabel"])).toBe("structure");

    expect(tabForPagePath(["title"])).toBe("structure");
    expect(tabForPagePath(["seo", "description"])).toBe("seo");
    expect(tabForPagePath(["blocks", 2, "data", "text"])).toBe("content");
    expect(tabForPagePath(["relations", "productIds"])).toBe("relations");
    expect(tabForPagePath(["provenance", 0, "rightsConfirmed"])).toBe("governance");
    expect(tabForPagePath(["approval", "businessOwner"])).toBe("governance");
  });

  it("devolve sempre uma aba que existe na barra de abas", () => {
    const known = new Set(PAGE_BUILDER_TABS.map(([key]) => key));
    for (const path of [[], ["campo_que_nao_existe"], ["route"], ["blocks"], ["retirement", "mode"]]) {
      expect(known.has(tabForPagePath(path))).toBe(true);
    }
  });

  it("nomeia os campos de governança com as palavras que estão na tela", () => {
    // Antes deste lote estes campos não tinham rótulo e o operador lia
    // "Proveniência e direitos › item 1 › Campo do cadastro".
    const issue = humanValidationIssue({ path: ["provenance", 0, "commercialOwner"], code: "too_small" });
    expect(issue).toContain("Owner comercial");
    expect(issue).not.toContain(GENERIC_LABEL);

    expect(humanValidationPath(["provenance", 0, "technicalOwner"])).toContain("Owner técnico");
    expect(humanValidationPath(["provenance", 0, "rightsConfirmed"])).toContain(
      "Direitos de uso confirmados",
    );
    expect(humanValidationPath(["approval", "businessOwner"])).toContain("Owner de negócio");
    expect(humanValidationPath(["approval", "editorialReviewer"])).toContain("Revisor editorial");
    expect(humanValidationPath(["route", "navigationLabel"])).toContain("Rótulo de navegação");
  });

  it("não deixa o union engolir as pendências de campo", () => {
    // `CmsPageContentSchema` é um `z.union` simples: quando os dois ramos falham ele devolve UMA
    // pendência de caminho vazio, e o painel do operador mostrava uma linha só — "Cadastro:
    // revise o valor informado" — sem nomear campo nenhum. Este teste prende o defeito: se
    // alguém trocar `pageSchemaForContentType` de volta pelo union, ele reprova.
    const colapsado = CmsPageContentSchema.safeParse(createInitialPagePayload("page"));
    expect(colapsado.success).toBe(false);
    if (!colapsado.success) {
      expect(colapsado.error.issues.every((issue) => issue.path.length === 0)).toBe(true);
    }

    for (const contentType of ["page", "homepage"] as const) {
      const parsed = pageSchemaForContentType(contentType).safeParse(createInitialPagePayload(contentType));
      expect(parsed.success).toBe(false);
      if (parsed.success) continue;
      expect(parsed.error.issues.length).toBeGreaterThanOrEqual(10);
      expect(parsed.error.issues.every((issue) => issue.path.length > 0)).toBe(true);
    }
  });

  it("cobre com rótulo e aba TODA pendência que o rascunho inicial produz", () => {
    // Guarda mecânica: em vez de listar campos à mão, deriva a lista das pendências que o próprio
    // rascunho inicial gera. Quando alguém acrescentar um campo obrigatório novo sem rótulo, este
    // teste volta a falhar sozinho.
    for (const contentType of ["page", "homepage"] as const) {
      const parsed = pageSchemaForContentType(contentType).safeParse(createInitialPagePayload(contentType));
      expect(parsed.success).toBe(false);
      if (parsed.success) continue;

      const semRotulo: string[] = [];
      for (const issue of parsed.error.issues) {
        const texto = humanValidationPath(issue.path);
        if (texto.includes(GENERIC_LABEL)) semRotulo.push(issue.path.join("."));
        expect(PAGE_BUILDER_TABS.some(([key]) => key === tabForPagePath(issue.path))).toBe(true);
      }
      expect(semRotulo, `campos sem rótulo em ${contentType}: ${semRotulo.join(", ")}`).toEqual([]);
    }
  });

  it("rotula as abas com o mesmo texto do botão", () => {
    expect(pageBuilderTabLabel("seo")).toBe("SEO e URL");
    expect(pageBuilderTabLabel("governance")).toBe("Governança");
    expect(pageBuilderTabLabel("content")).toBe("Blocos");
  });
});
