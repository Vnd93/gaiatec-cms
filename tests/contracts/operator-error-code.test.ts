import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { operatorMessageForCode } from "../../src/admin/operator-error-code";
import { isOperatorSafeMessage } from "../../src/admin/operator-error-message";

const raiz = (relativo: string) => path.resolve(__dirname, "../..", relativo);
const EDGE = readFileSync(raiz("supabase/functions/cms-content/index.ts"), "utf8");
const MODULO = readFileSync(raiz("src/admin/operator-error-code.ts"), "utf8");

/** Os códigos que o cliente sabe traduzir, lidos do próprio módulo. */
function codigosMapeados(): string[] {
  return [...MODULO.matchAll(/^\s{2}(CMS_[A-Z0-9_]+):/gm)].map((m) => m[1]);
}

/** A allowlist da fronteira remota, lida da própria edge function. */
function codigosQueAtravessam(): string[] {
  const bloco = EDGE.slice(EDGE.indexOf("const knownCode = ["), EDGE.indexOf(".find((candidate)"));
  return [...bloco.matchAll(/"(CMS_[A-Z0-9_]+)"/g)].map((m) => m[1]);
}

describe("motivo da recusa chega ao operador", () => {
  it("todo código que o cliente traduz atravessa a fronteira", () => {
    // Uma frase escrita para um código que nunca chega é uma frase morta: o operador continua
    // lendo "revise os dados informados".
    const atravessam = new Set(codigosQueAtravessam());
    const mortos = codigosMapeados().filter((codigo) => !atravessam.has(codigo));
    expect(
      mortos,
      `Estes códigos têm frase no cliente mas não estão na allowlist de ` +
        `supabase/functions/cms-content/index.ts, então nunca chegam: ${mortos.join(", ")}`,
    ).toEqual([]);
  });

  it("nenhuma frase vaza texto técnico ao operador", () => {
    // O mesmo crivo que protege a fronteira remota. Uma frase com código, identificador ou nome de
    // campo interno seria pior do que a frase genérica que ela substitui.
    for (const codigo of codigosMapeados()) {
      const frase = operatorMessageForCode(codigo);
      expect(frase, `${codigo} não devolveu frase`).toBeTruthy();
      expect(isOperatorSafeMessage(frase), `${codigo}: "${frase}"`).toBe(true);
    }
  });

  it("mostra qual bloco falhou quando o sufixo é um tipo de bloco conhecido", () => {
    const frase = operatorMessageForCode("CMS_PAGE_BLOCK_INVALID:form");
    expect(frase).toContain("Formulário");
    expect(frase).toContain("aba Blocos");
    expect(isOperatorSafeMessage(frase)).toBe(true);
  });

  it("descarta sufixo que não é forma fechada, inclusive identificador", () => {
    // CMS_PAGE_ORPHAN_RELATION carrega o identificador do conteúdo órfão. Mostrá-lo seria vazar
    // dado interno, e o crivo de mensagem segura recusaria a frase inteira.
    const comId = operatorMessageForCode(
      "CMS_PAGE_ORPHAN_RELATION:3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
    expect(comId).toBe(operatorMessageForCode("CMS_PAGE_ORPHAN_RELATION"));
    expect(isOperatorSafeMessage(comId)).toBe(true);

    // Sufixo inventado num código que aceita sufixo: cai na frase base, não vira texto.
    const inventado = operatorMessageForCode("CMS_PAGE_BLOCK_INVALID:bloco_que_nao_existe");
    expect(inventado).toBe("Um bloco da página está incompleto.");
  });

  it("código desconhecido não vira texto", () => {
    expect(operatorMessageForCode("CMS_ALGO_QUE_NAO_EXISTE")).toBeNull();
    expect(operatorMessageForCode("23514")).toBeNull();
    expect(operatorMessageForCode(undefined)).toBeNull();
    expect(operatorMessageForCode("")).toBeNull();
  });

  it("a fronteira remota continua descartando o texto do servidor", () => {
    // A frase vem do CÓDIGO, nunca da mensagem. Esta linha é o que garante isso, e o contrato de
    // mensagens amigáveis já a exige — repetida aqui porque este lote depende dela.
    expect(readFileSync(raiz("src/admin/api/cms-api.ts"), "utf8")).toContain(
      'operatorErrorMessage(message, { source: "remote", status })',
    );
  });

  it("os códigos de publicação de página realmente atravessam agora", () => {
    // Antes deste lote, nenhum deles estava na allowlist: publicar página falhava com o número do
    // SQLSTATE e o operador não tinha como saber o que revisar.
    const atravessam = new Set(codigosQueAtravessam());
    for (const codigo of [
      "CMS_PAGE_HOMOLOGATION_REQUIRED",
      "CMS_PAGE_APPROVAL_REQUIRED",
      "CMS_PAGE_PROVENANCE_INVALID",
      "CMS_PAGE_RETIREMENT_INVALID",
      "CMS_PAGE_BLOCK_INVALID",
      "CMS_ROUTE_CANONICAL_MISMATCH",
    ]) {
      expect(atravessam.has(codigo), `${codigo} saiu da allowlist`).toBe(true);
    }
  });
});
