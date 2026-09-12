import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isEv2FeatureEnabled } from "../../src/admin/ev2-runtime";
import {
  EV2_DELIVERABLE_FEATURES,
  type Ev2CapabilityManifest,
} from "../../src/shared/contracts/ev2-foundation";

/**
 * O livro de entregas (migration 0093) é o estado que faltava entre "em teste" e "no ar".
 *
 * Este arquivo prende a FORMA do mecanismo — o que ele pode alcançar e quais travas carrega. O
 * comportamento contra o banco migrado é coberto por `supabase/tests/rls_cms_ev2_delivery_ledger`,
 * que roda contra Postgres de verdade; aqui não há banco, e um teste que fingisse haver seria pior
 * que nenhum.
 */

const MIGRACAO = readFileSync(
  path.resolve(__dirname, "../../supabase/migrations/0093_cms_ev2_delivery_ledger.sql"),
  "utf8",
);

/** As três que a revisão de segurança não fecha. */
const ENTREGAVEIS = ["ev2.draft_v2", "ev2.master_data", "ev2.pim_v2"];

/**
 * O que NÃO pode ser entregue por este caminho, e por quê. Cada uma é o portão único de um item
 * que a revisão de segurança mandou manter fechado, ou um adiamento declarado.
 */
const PROIBIDAS = new Map([
  ["ev2.dam", "abriria curadoria de mídia em produção"],
  ["ev2.search_quality", "a mesma flag serve o Centro de Qualidade e a governança de busca"],
  ["ev2.collaboration_bulk", "abriria publicação direta de pacote editorial"],
  ["ev2.visual_studio", "a revisão mandou manter fechado"],
  ["ev2.multisite", "adiamento declarado na especificação e na ADR-015"],
  ["ev2.ai_assist", "regra 9 do escopo de privacidade: provedor externo desligado"],
  ["ev2.ai_execute", "adiamento declarado"],
  ["ev2.system_assurance", "a revisão mandou manter fechado"],
  ["ev2.rbac_scoped", "fora do escopo da primeira leva"],
  ["ev2.release_skeleton", "fora do escopo da primeira leva"],
]);

/**
 * O corpo inteiro da restrição, lido por balanceamento de parênteses.
 *
 * Uma versão anterior capturava com `check \(([^)]*)\)`, e a classe `[^)]` para no PRIMEIRO
 * fecha-parêntese. Na forma atual da restrição isso coincide com o fim da lista, e os testes
 * passavam — por coincidência de formato. Bastaria a restrição ganhar um segundo termo para a
 * captura devolver um pedaço, e o guarda das flags proibidas passar a olhar para o lugar errado
 * sem reprovar nada.
 */
function restricaoDeElegibilidade(): string {
  const ancora = MIGRACAO.indexOf("constraint cms_ev2_delivery_ledger_flag_elegivel");
  if (ancora < 0) return "";
  const abre = MIGRACAO.indexOf("(", ancora);
  if (abre < 0) return "";
  let profundidade = 0;
  for (let i = abre; i < MIGRACAO.length; i += 1) {
    if (MIGRACAO[i] === "(") profundidade += 1;
    else if (MIGRACAO[i] === ")") {
      profundidade -= 1;
      if (profundidade === 0) return MIGRACAO.slice(abre + 1, i);
    }
  }
  return "";
}

describe("livro de entregas EV2 — o que ele pode alcançar", () => {
  it("restringe as funcionalidades entregáveis por CHECK, não por convenção", () => {
    const restricao = restricaoDeElegibilidade();
    expect(restricao, "a restrição de elegibilidade sumiu da migration").not.toBe("");
    for (const flag of ENTREGAVEIS) {
      expect(restricao).toContain(flag);
    }
  });

  it("torna as proibidas inalcançáveis — ausência de caminho, não lista para lembrar", () => {
    const restricao = restricaoDeElegibilidade();
    const vazaram = [...PROIBIDAS.keys()].filter((flag) => restricao.includes(flag));
    expect(
      vazaram,
      `Estas entraram na lista de entregáveis e não podiam: ${vazaram
        .map((f) => `${f} (${PROIBIDAS.get(f)})`)
        .join("; ")}. Ampliar a lista é decisão do dono do produto COM a revisão de segurança, ` +
        "e exige migration nova — não edição desta.",
    ).toEqual([]);
  });

  it("o predicado carrega as quatro travas dentro dele", () => {
    // `cms:flags.read` é não-crítica e concedida a todos os papéis (0037:6 e 0037:14-17). Se as
    // travas ficassem nos pontos de consumo, bastaria um deles esquecer para abrir a API a uma
    // sessão de autenticação simples. Dentro do predicado, os dezessete pontos herdam.
    const predicado = MIGRACAO.slice(
      MIGRACAO.indexOf("create or replace function private.cms_ev2_delivery_active"),
      MIGRACAO.indexOf("revoke all on function private.cms_ev2_delivery_active"),
    );
    expect(predicado).not.toBe("");
    expect(predicado, "autenticação forte em produção").toContain("p_aal = 'aal2'");
    expect(predicado, "site principal").toContain("p_site_key = 'main'");
    expect(predicado, "interruptor de emergência").toContain("kill_switch");
    expect(predicado, "veto de habilitação ampla").toContain(
      "scope_type in ('site', 'environment', 'global')",
    );
  });

  it("o livro é somente-acréscimo, inclusive para service_role", () => {
    expect(MIGRACAO).toContain("before update or delete or truncate on private.cms_ev2_delivery_ledger");
    expect(MIGRACAO).toContain("CMS_EV2_DELIVERY_LEDGER_IMMUTABLE");
  });

  it("exige 24 h em homologação antes de produção", () => {
    // Único anteparo automático contra erro de ordem de publicação. Sem ele, uma entrega declarada
    // antes do servidor e do painel deixa a capacidade aberta na API e apagada na tela — o pior
    // estado, porque ninguém vê e ninguém reclama.
    expect(MIGRACAO).toContain("CMS_EV2_DELIVERY_STAGING_SOAK_REQUIRED");
    expect(MIGRACAO).toContain("interval '24 hours'");
  });

  it("as duas escritas exigem service_role", () => {
    const escritas = MIGRACAO.match(/CMS_EV2_DELIVERY_SERVICE_ROLE_REQUIRED/g) ?? [];
    expect(escritas.length).toBe(2);
  });

  it("a cópia que o cliente enxerga é idêntica à restrição do banco, nos dois sentidos", () => {
    // A autoridade é a restrição da migration. Se as duas divergirem, o painel acenderia algo que
    // o banco recusa — ou recusaria algo que o banco entrega. As duas direções importam.
    const restricao = restricaoDeElegibilidade();
    for (const flag of EV2_DELIVERABLE_FEATURES) {
      expect(restricao, `${flag} está no cliente e não na restrição do banco`).toContain(flag);
    }
    for (const flag of ENTREGAVEIS) {
      expect(
        (EV2_DELIVERABLE_FEATURES as readonly string[]).includes(flag),
        `${flag} está na restrição do banco e não no cliente`,
      ).toBe(true);
    }
    expect(EV2_DELIVERABLE_FEATURES.length).toBe(ENTREGAVEIS.length);
  });

  it("não introduz rótulo novo de origem", () => {
    // Rótulo novo quebraria scripts/ev2/phase0/phase0-structure.test.mjs:39, que fixa a lista por
    // z.enum — e um deploy fora de ordem faria o manifesto inteiro ser recusado, apagando as treze
    // capacidades de uma vez, inclusive as que funcionam.
    expect(MIGRACAO).not.toMatch(/'delivered'\s*(?:as|,)\s*'source'|'source',\s*'deliver/);
  });
});

const manifesto = (source: string, enabled: boolean, flag = "ev2.draft_v2"): Ev2CapabilityManifest =>
  ({
    schemaVersion: 1,
    status: "ready",
    environment: "local",
    siteKey: "main",
    evaluatedAt: new Date(1_700_000_000_000).toISOString(),
    capabilities: {
      [flag]: {
        schemaVersion: 1,
        key: flag,
        enabled,
        source,
        evaluatedAt: new Date(1_700_000_000_000).toISOString(),
      },
    },
  }) as unknown as Ev2CapabilityManifest;

describe("o painel aceita a funcionalidade entregue", () => {
  const agora = 1_700_000_010_000;

  it("aceita a habilitação nominal, como sempre aceitou", () => {
    expect(isEv2FeatureEnabled({ ev2Capabilities: manifesto("override", true) }, "ev2.draft_v2", agora)).toBe(
      true,
    );
  });

  it("aceita a entrega, que chega como 'default' com enabled true", () => {
    expect(isEv2FeatureEnabled({ ev2Capabilities: manifesto("default", true) }, "ev2.draft_v2", agora)).toBe(
      true,
    );
  });

  it("continua recusando 'default' desligado, que é o estado de toda flag não entregue", () => {
    expect(isEv2FeatureEnabled({ ev2Capabilities: manifesto("default", false) }, "ev2.draft_v2", agora)).toBe(
      false,
    );
  });

  it("recusa a entrega para funcionalidade que não é entregável", () => {
    // O painel não pode acender por 'default' o que o banco jamais entregaria. Esta é a linha que
    // mantém de pé a garantia anterior para as outras dez.
    for (const flag of ["ev2.dam", "ev2.search_quality", "ev2.multisite", "ev2.ai_execute"]) {
      expect(
        isEv2FeatureEnabled(
          { ev2Capabilities: manifesto("default", true, flag) },
          flag as Parameters<typeof isEv2FeatureEnabled>[1],
          agora,
        ),
        `${flag} não é entregável e não pode acender por 'default'`,
      ).toBe(false);
    }
  });

  it("continua recusando o interruptor de emergência e o indisponível", () => {
    for (const origem of ["kill_switch", "unavailable"]) {
      expect(isEv2FeatureEnabled({ ev2Capabilities: manifesto(origem, true) }, "ev2.draft_v2", agora)).toBe(
        false,
      );
    }
  });
});
