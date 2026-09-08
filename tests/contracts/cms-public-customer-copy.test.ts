import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer-facing CMS copy", () => {
  it("does not expose editorial workflow terminology outside private preview messages", () => {
    const publicSources = [
      "src/shared/components/CmsStructuredArticle.tsx",
      "src/public/components/CmsProductRenderer.tsx",
      "src/public/components/ProductCard.tsx",
      "src/public/components/CmsPageRenderer.tsx",
      "src/public/components/DiscoveryEntityRenderer.tsx",
      "src/public/pages/CmsProductsPage.tsx",
      "src/public/pages/CmsBlogPage.tsx",
      "src/app/components/Header.tsx",
    ]
      .map(source)
      .join("\n");

    for (const workflowCopy of [
      "CONTEÚDO PUBLICADO",
      "Produto publicado",
      "conteúdo publicado",
      "imagem publicada",
      "projeção publicada",
      "Dados homologados",
      "Artigos publicados",
      "ainda não publicada",
      "está publicado",
      "documento público aprovado",
    ])
      expect(publicSources).not.toContain(workflowCopy);

    expect(source("src/shared/components/CmsStructuredArticle.tsx")).toContain("Preview privado");
    expect(source("src/public/components/CmsPageRenderer.tsx")).toContain("Preview privado");
  });

  it("does not render editorial identifiers through implementation data attributes", () => {
    const renderers = [
      "src/shared/components/CmsStructuredArticle.tsx",
      "src/public/components/CmsPageRenderer.tsx",
      "src/public/components/CmsProductRenderer.tsx",
      "src/public/pages/CmsProductPage.tsx",
    ]
      .map(source)
      .join("\n");

    for (const attribute of [
      "data-component-version",
      "data-visual-group",
      "data-source=",
      "data-cms-renderer",
      "cmsProductSchema",
    ])
      expect(renderers).not.toContain(attribute);
  });
});
