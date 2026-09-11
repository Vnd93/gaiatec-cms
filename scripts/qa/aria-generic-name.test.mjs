// Trava mecanica contra `aria-prohibited-attr` em elemento de role generico.
//
// A axe reprovou UMA ocorrencia, em /produtos, porque era o unico estado renderizado na rota testada
// naquele instante. A varredura da fonte achou DOZE. E sete das doze estao em src/admin/**, atras de
// sessao autenticada, onde a suite @a11y nao chega -- a axe nunca as pegaria, em passe nenhum.
//
// Por isso a trava e de fonte, nao de execucao: ela cobre a classe inteira, nao a instancia que por
// acaso estava na tela.
//
// Duas exigencias que vem do proprio defeito do levantamento inicial, que contou dez em vez de doze:
// a varredura precisa ser CIENTE DE MULTILINHA, porque JSX quebra atributos em varias linhas, e
// precisa cobrir `aria-label` E `aria-labelledby`. Uma trava por linha nasceria com o mesmo furo.

import assert from "node:assert/strict";
import test from "node:test";

import {
  findGenericNamedElements,
  formatFinding,
  GENERIC_ELEMENTS,
  hasExplicitRole,
  namingAttribute,
  openingTags,
} from "./aria-generic-name-lib.mjs";

test("nenhum div, span ou p nomeia a si mesmo sem role explicito", () => {
  const findings = findGenericNamedElements();
  assert.deepEqual(
    findings.map((finding) => `${finding.file}:${finding.line}`),
    [],
    `aria-label ou aria-labelledby em elemento de role generico:\n${findings.map(formatFinding).join("\n\n")}`,
  );
});

test("a varredura enxerga tag que quebra em varias linhas", () => {
  // Foi exatamente este caso que escondeu AdminVisualStudioPage.tsx:859 de uma busca por linha.
  const source = ["<div", '  className="x"', "  aria-label={`Canvas ${breakpoint}`}", ">", "</div>"].join(
    "\n",
  );
  const tags = openingTags(source, "div");
  assert.equal(tags.length, 1);
  assert.equal(namingAttribute(tags[0].text), "aria-label");
  assert.equal(hasExplicitRole(tags[0].text), false);
});

test("a varredura cobre aria-labelledby, nao so aria-label", () => {
  // Foi este caso que escondeu AdminQualityPage.tsx:336.
  const tags = openingTags('<div className="x" aria-labelledby="t">', "div");
  assert.equal(namingAttribute(tags[0].text), "aria-labelledby");
});

test("role explicito libera o nome, e role vazio ou indefinido nao", () => {
  assert.equal(hasExplicitRole('<div role="status" aria-label="x">'), true);
  assert.equal(hasExplicitRole('<div role={computedRole} aria-label="x">'), true);
  assert.equal(hasExplicitRole('<div role="" aria-label="x">'), false);
  assert.equal(hasExplicitRole('<div role={undefined} aria-label="x">'), false);
  assert.equal(hasExplicitRole('<div className="x" aria-label="y">'), false);
});

test("elemento com role implicito que aceita nome nao e tocado", () => {
  // `section`, `ul`, `nav` e `li` aceitam nome acessivel; so `div`, `span` e `p` sao genericos.
  assert.deepEqual(GENERIC_ELEMENTS, ["div", "span", "p"]);
  assert.equal(openingTags('<section aria-label="x">', "div").length, 0);
  assert.equal(openingTags('<ul aria-label="x">', "span").length, 0);
});

test("o estado de carregamento segue o precedente do proprio codigo", async () => {
  const { readFile } = await import("node:fs/promises");

  // Lido pela propria varredura, e nao por regex de linha: o prettier reparte uma tag longa em varias
  // linhas assim que ela cresce, e uma assercao por linha quebraria na primeira reformatacao -- o
  // mesmo furo que fez o levantamento inicial contar dez ocorrencias em vez de doze.
  const loadingRegions = async (file, className) => {
    const source = await readFile(file, "utf8");
    return openingTags(source, "div").filter((tag) => tag.text.includes(className));
  };

  // AdminUI.tsx ja fazia o certo antes deste lote: role="status" junto de aria-busy, que alem de
  // liberar o nome faz o leitor de tela anunciar a mudanca -- o efeito pretendido.
  const [precedent] = await loadingRegions("src/admin/components/AdminUI.tsx", "admin-loading-skeleton");
  assert.ok(precedent, "o precedente admin-loading-skeleton sumiu");
  assert.match(precedent.text, /\baria-busy\s*=/);
  assert.match(precedent.text, /\brole\s*=\s*"status"/);

  const [products] = await loadingRegions(
    "src/public/pages/CmsProductsPage.tsx",
    "products-catalog__loading",
  );
  assert.ok(products, "a regiao de carregamento do catalogo sumiu");
  assert.match(products.text, /\baria-busy\s*=/);
  assert.match(products.text, /\brole\s*=\s*"status"/);
  assert.equal(namingAttribute(products.text), "aria-label");
});

test("todo aria-busy em elemento generico vem acompanhado de role", async () => {
  // `aria-busy` sozinho e valido, mas onde ele aparece junto de um nome o elemento precisa de papel.
  const findings = findGenericNamedElements();
  assert.equal(findings.length, 0);

  const { readFile } = await import("node:fs/promises");
  for (const file of ["src/public/pages/CmsProductsPage.tsx", "src/admin/components/AdminUI.tsx"]) {
    const source = await readFile(file, "utf8");
    for (const element of GENERIC_ELEMENTS) {
      for (const tag of openingTags(source, element)) {
        if (!/\baria-busy\s*=/.test(tag.text) || !namingAttribute(tag.text)) continue;
        assert.ok(hasExplicitRole(tag.text), `${file}:${tag.line} tem aria-busy e nome sem role`);
      }
    }
  }
});
