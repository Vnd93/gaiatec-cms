// Regra derivada da secao 3.1: acoplamento entre migration e fixture.
//
// "Toda migration que crie ou aperte restricao, escopo de RLS ou vinculo obrigatorio deve, no mesmo
// commit, atualizar as fixtures afetadas e passar neste contrato. Migration que aperta restricao sem
// atualizar fixture e defeito de entrega, nao descoberta de canario."
//
// A trava e mecanica: le o proprio diff, nao a disciplina de quem entrega.

import { spawnSync } from "node:child_process";

import { FIXTURES } from "./fixtures.mjs";

export const GATE = "cms-migration-fixture-coupling";

const MIGRATIONS_PREFIX = "supabase/migrations/";
const DECLARATION = "scripts/qa/fixture-schema-contract/fixtures.mjs";

/** Padroes que caracterizam criacao ou aperto de restricao, escopo de RLS ou vinculo obrigatorio. */
export const TIGHTENING_PATTERNS = [
  {
    id: "check",
    pattern: /add\s+constraint\s+[^\s]+\s+check/i,
    describes: "restricao CHECK criada ou reescrita",
  },
  {
    id: "foreign-key",
    pattern: /add\s+constraint\s+[^\s]+\s+foreign\s+key/i,
    describes: "vinculo obrigatorio criado",
  },
  { id: "unique", pattern: /add\s+constraint\s+[^\s]+\s+unique/i, describes: "restricao UNIQUE criada" },
  { id: "not-null", pattern: /set\s+not\s+null/i, describes: "coluna passou a exigir valor" },
  {
    id: "add-column-not-null",
    pattern: /add\s+column[^;]*\bnot\s+null\b/i,
    describes: "coluna obrigatoria criada",
  },
  {
    id: "policy",
    pattern: /create\s+(or\s+replace\s+)?policy|alter\s+policy/i,
    describes: "politica de RLS criada ou alterada",
  },
  {
    id: "scope-function",
    pattern: /function\s+private\.[a-z0-9_]*(scope_allowed|_allowed|origin_allowed)/i,
    describes: "predicado de escopo criado ou reescrito",
  },
  {
    id: "forbidden",
    pattern: /raise\s+exception\s+'CMS_[A-Z0-9_]*(FORBIDDEN|REQUIRED|INVALID)'/i,
    describes: "recusa explicita adicionada",
  },
];

function git(args, { repositoryRoot }) {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8", windowsHide: true });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
}

/**
 * Intervalo de diff analisado. Ordem: variavel explicita, base de merge com `origin/main`, base com
 * `main`, commit anterior. Sem nenhum deles o contrato reprova -- nao ha como provar acoplamento
 * sem saber o que mudou, e aprovar por falta de informacao seria exatamente o furo que a regra fecha.
 */
export function resolveRange({ repositoryRoot = process.cwd(), env = process.env } = {}) {
  const explicit = env.FIXTURE_CONTRACT_DIFF_RANGE;
  if (explicit) return { range: explicit, origin: "FIXTURE_CONTRACT_DIFF_RANGE" };
  if (git(["rev-parse", "--git-dir"], { repositoryRoot }) === null) return null;
  for (const base of ["origin/main", "main"]) {
    const mergeBase = git(["merge-base", base, "HEAD"], { repositoryRoot });
    if (!mergeBase) continue;
    const sha = mergeBase.trim();
    const head = git(["rev-parse", "HEAD"], { repositoryRoot })?.trim();
    if (sha && head && sha !== head) return { range: `${sha}..HEAD`, origin: `merge-base ${base}` };
    if (sha && head && sha === head) return { range: null, origin: `merge-base ${base} (sem divergencia)` };
  }
  const parent = git(["rev-parse", "HEAD~1"], { repositoryRoot });
  if (parent) return { range: "HEAD~1..HEAD", origin: "commit anterior" };
  return { range: null, origin: "repositorio sem historico anterior" };
}

export function changedFiles({ repositoryRoot = process.cwd(), range }) {
  if (!range) return [];
  const output = git(["diff", "--name-only", range], { repositoryRoot });
  if (output === null) return null;
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function addedLines({ repositoryRoot = process.cwd(), range, file }) {
  const output = git(["diff", "--unified=0", range, "--", file], { repositoryRoot });
  if (output === null) return [];
  return output
    .split("\n")
    .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
    .map((line) => line.slice(1));
}

function failure({ cause, entity, observed, expected, remediation, migration }) {
  return {
    gate: GATE,
    cause,
    entity,
    observed,
    expected,
    remediation,
    migration: migration ?? null,
  };
}

/**
 * Verifica o acoplamento no intervalo em analise.
 * Devolve `{ failures, range, migrations }`.
 */
export function checkCoupling({
  repositoryRoot = process.cwd(),
  env = process.env,
  fixtures = FIXTURES,
} = {}) {
  const resolved = resolveRange({ repositoryRoot, env });
  if (resolved === null) {
    return {
      range: null,
      migrations: [],
      failures: [
        failure({
          cause: "COUPLING_RANGE_UNRESOLVED",
          entity: "git",
          observed: "sem metadados de git e sem FIXTURE_CONTRACT_DIFF_RANGE",
          expected: "intervalo de diff determinavel",
          remediation:
            "Executar em um checkout com historico, ou definir FIXTURE_CONTRACT_DIFF_RANGE com o " +
            "intervalo a analisar. Sem saber o que mudou nao ha como provar acoplamento.",
        }),
      ],
    };
  }

  const { range } = resolved;
  const files = changedFiles({ repositoryRoot, range });
  if (files === null) {
    return {
      range,
      migrations: [],
      failures: [
        failure({
          cause: "COUPLING_RANGE_UNREADABLE",
          entity: range,
          observed: "git diff falhou para o intervalo",
          expected: "intervalo legivel",
          remediation: "Conferir o intervalo informado em FIXTURE_CONTRACT_DIFF_RANGE.",
        }),
      ],
    };
  }

  const migrations = files.filter((file) => file.startsWith(MIGRATIONS_PREFIX) && file.endsWith(".sql"));
  const fixtureSources = new Set(fixtures.map((fixture) => fixture.source).filter(Boolean));
  const touchedFixture = files.some((file) => file === DECLARATION || fixtureSources.has(file));

  const failures = [];
  for (const migration of migrations) {
    const added = addedLines({ repositoryRoot, range, file: migration });
    if (added.length === 0) continue;
    const text = added.join("\n");
    const matched = TIGHTENING_PATTERNS.filter((entry) => entry.pattern.test(text));
    if (matched.length === 0) continue;
    if (touchedFixture) continue;
    failures.push(
      failure({
        cause: "MIGRATION_TIGHTENS_WITHOUT_FIXTURE_UPDATE",
        entity: migration,
        observed: matched.map((entry) => entry.describes).join("; "),
        expected: `atualizacao, no mesmo commit, de ${DECLARATION} ou da fonte de alguma fixture declarada`,
        remediation:
          "Atualizar as fixtures afetadas e fazer o contrato fixture x schema passar no mesmo commit. " +
          "Migration que aperta restricao sem atualizar fixture e defeito de entrega, nao descoberta " +
          "de canario.",
        migration,
      }),
    );
  }

  return { range, migrations, failures, rangeOrigin: resolved.origin };
}
