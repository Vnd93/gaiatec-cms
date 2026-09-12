import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Migrations deste projeto reescrevem o CORPO de funções já existentes: leem
 * `pg_get_functiondef`, aplicam `replace`/`regexp_replace` no texto e reexecutam a definição.
 *
 * O padrão funciona, mas tem um modo de falha silencioso: se o trecho procurado não existir mais
 * — porque outra migration já mexeu ali, ou porque alguém reescreveu a função original — o
 * `replace` não casa, o texto sai idêntico, e o bloco simplesmente não faz nada. Sem erro. O deploy
 * passa verde e o banco fica diferente do que a migration pretendia.
 *
 * Foi exatamente isso que aconteceu com o bloco 2 da 0055: ele abriu produção em todas as funções
 * `cms_*` sem deixar registro de que abriu, e por quase uma semana o diagnóstico do sistema foi
 * feito lendo o texto das migrations — que já não era o que rodava no banco.
 *
 * A própria 0055 tem outro bloco, o 3, que faz certo: confere o ponto de aplicação e levanta
 * `CMS_AI_SINGLE_OPERATOR_PATCH_NOT_APPLIED` se não achar. A 0061 faz melhor ainda, com três
 * exceções distintas de drift. O padrão seguro existe na casa; só não foi aplicado em toda parte.
 *
 * ESCOPO DESTE TESTE: blocos anônimos `do $$ ... $$;` que reescrevem corpo de função em tempo de
 * migração. NÃO cobre reescrita feita dentro de função nomeada, executada depois. É uma guarda
 * estreita e deliberada — não a leia como cobertura do padrão inteiro.
 */

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

/** Palavras que identificam uma exceção de "não achei onde aplicar o patch". */
const SENTINELAS = /(DRIFT|MISSING|NOT_APPLIED|NOT_INSTALLED|WEAKENED|PATCH_POINT|INCOMPLETE)/;

/**
 * Dívida histórica, congelada. Migration aplicada não se reescreve: a 0055 já rodou em produção,
 * em staging e em todo ambiente local. Corrigi-la depois seria reescrever história e produziria
 * bancos divergentes. Fica registrada aqui, com o custo que teve, para que a lista não cresça.
 */
const DIVIDA_HISTORICA = new Map([
  [
    "0055_ev2_operational_cms_production.sql#2",
    "Reescreveu a guarda de ambiente de TODA função cms_* sem conferir se encontrou o trecho. " +
      "Aplicada em produção em 2026-09-06. Custo medido: o estado real de produção deixou de ser " +
      "legível pelo texto das migrations, e dois diagnósticos foram emitidos errados por isso.",
  ],
]);

type BlocoAnonimo = { arquivo: string; indice: number; corpo: string };

function blocosQueReescrevemCorpoDeFuncao(): BlocoAnonimo[] {
  const encontrados: BlocoAnonimo[] = [];
  const arquivos = readdirSync(MIGRATIONS_DIR)
    .filter((nome) => nome.endsWith(".sql"))
    .sort();

  for (const arquivo of arquivos) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, arquivo), "utf8");
    const blocos = [...sql.matchAll(/\bdo\s+\$\$([\s\S]*?)\$\$\s*;/gi)];

    blocos.forEach((match, posicao) => {
      const corpo = match[1];
      const leDefinicao = corpo.includes("pg_get_functiondef");
      const reescreve = /\breplace\s*\(|\bregexp_replace\s*\(/.test(corpo);
      const executa = /\bexecute\b/i.test(corpo);
      if (leDefinicao && reescreve && executa) {
        encontrados.push({ arquivo, indice: posicao + 1, corpo });
      }
    });
  }
  return encontrados;
}

function verificaOPontoDeAplicacao(corpo: string): boolean {
  const excecoes = [...corpo.matchAll(/raise\s+exception\s+'([A-Z0-9_]+)/gi)].map((m) => m[1]);
  return excecoes.some((nome) => SENTINELAS.test(nome));
}

describe("migration que reescreve corpo de função precisa conferir onde está aplicando", () => {
  it("encontra os blocos de reescrita — se este número cair a zero, o teste parou de medir", () => {
    // Guarda da guarda: se alguém mudar o formato dos blocos e a varredura deixar de achar
    // qualquer coisa, o teste passaria vazio e ninguém notaria.
    const blocos = blocosQueReescrevemCorpoDeFuncao();
    expect(blocos.length).toBeGreaterThanOrEqual(3);
  });

  it("nenhum bloco novo pode falhar em silêncio", () => {
    const semConferencia = blocosQueReescrevemCorpoDeFuncao()
      .filter((bloco) => !verificaOPontoDeAplicacao(bloco.corpo))
      .map((bloco) => `${bloco.arquivo}#${bloco.indice}`);

    const naoCatalogados = semConferencia.filter((chave) => !DIVIDA_HISTORICA.has(chave));

    expect(
      naoCatalogados,
      "Este bloco lê pg_get_functiondef, reescreve o texto e reexecuta — mas não levanta exceção " +
        "quando o trecho procurado não existe. Se o trecho mudar, o bloco vira um no-op silencioso " +
        "e o banco fica diferente do que a migration diz. Confira o ponto de aplicação e levante " +
        "uma exceção nomeada, como fazem a 0061 e o bloco 3 da própria 0055.",
    ).toEqual([]);
  });

  it("mantém a dívida histórica catalogada e não deixa ela envelhecer sem nome", () => {
    const semConferencia = new Set(
      blocosQueReescrevemCorpoDeFuncao()
        .filter((bloco) => !verificaOPontoDeAplicacao(bloco.corpo))
        .map((bloco) => `${bloco.arquivo}#${bloco.indice}`),
    );

    // Se um item sai da lista de violações — porque a migration foi removida, renomeada ou
    // corrigida — a entrada correspondente tem que sair do catálogo junto. Catálogo com item
    // morto vira ruído e some da revisão.
    for (const [chave, motivo] of DIVIDA_HISTORICA) {
      expect(semConferencia.has(chave), `${chave} não é mais uma violação; remova do catálogo`).toBe(true);
      expect(motivo.length).toBeGreaterThan(80);
    }
  });
});
