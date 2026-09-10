// Regra derivada da secao 3.1: migration que cria ou aperta restricao, escopo de RLS ou vinculo
// obrigatorio tem de atualizar, no mesmo commit, as fixtures afetadas.
//
// O teste prova as duas metades: que o intervalo em analise esta limpo, e que a regra realmente
// reprova uma migration que aperta restricao sem tocar em fixture. A segunda metade roda contra um
// repositorio git descartavel, criado e removido no proprio teste.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  checkCoupling,
  resolveRange,
  TIGHTENING_PATTERNS,
} from "./fixture-schema-contract/migration-coupling.mjs";

function git(repository, args) {
  const result = spawnSync("git", args, { cwd: repository, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, `git ${args.join(" ")} falhou: ${result.stderr}`);
  return result.stdout;
}

function createRepository() {
  const repository = mkdtempSync(path.join(tmpdir(), "coupling-"));
  git(repository, ["init", "--quiet"]);
  git(repository, ["config", "user.email", "qa@example.invalid"]);
  git(repository, ["config", "user.name", "Contrato Fixture Schema"]);
  mkdirSync(path.join(repository, "supabase/migrations"), { recursive: true });
  mkdirSync(path.join(repository, "scripts/qa/fixture-schema-contract"), { recursive: true });
  writeFileSync(
    path.join(repository, "supabase/migrations/0001_base.sql"),
    "create table public.t(id uuid);\n",
  );
  writeFileSync(
    path.join(repository, "scripts/qa/fixture-schema-contract/fixtures.mjs"),
    "export const FIXTURES = [];\n",
  );
  git(repository, ["add", "."]);
  git(repository, ["commit", "--quiet", "-m", "base"]);
  return repository;
}

const FIXTURE_SOURCE = "scripts/ev2/phase11/staging-canary.mjs";
const DECLARED = [{ id: "exemplo", source: FIXTURE_SOURCE, rows: [] }];

test("uma migration que aperta restricao sem atualizar fixture e reprovada", () => {
  const repository = createRepository();
  try {
    writeFileSync(
      path.join(repository, "supabase/migrations/0002_tighten.sql"),
      "alter table public.t add constraint t_origin_check check (origin_source in ('site'));\n",
    );
    git(repository, ["add", "."]);
    git(repository, ["commit", "--quiet", "-m", "aperta restricao sem tocar em fixture"]);

    const result = checkCoupling({
      repositoryRoot: repository,
      env: { FIXTURE_CONTRACT_DIFF_RANGE: "HEAD~1..HEAD" },
      fixtures: DECLARED,
    });

    assert.deepEqual(result.migrations, ["supabase/migrations/0002_tighten.sql"]);
    const failure = result.failures.find(
      (entry) => entry.cause === "MIGRATION_TIGHTENS_WITHOUT_FIXTURE_UPDATE",
    );
    assert.ok(failure, `deveria reprovar: ${JSON.stringify(result.failures)}`);
    assert.equal(failure.migration, "supabase/migrations/0002_tighten.sql");
    assert.match(failure.observed, /CHECK/);
    assert.match(failure.remediation, /defeito de entrega/);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("a mesma migration passa quando a fixture e atualizada no mesmo commit", () => {
  const repository = createRepository();
  try {
    writeFileSync(
      path.join(repository, "supabase/migrations/0002_tighten.sql"),
      "alter table public.t add constraint t_origin_check check (origin_source in ('site'));\n",
    );
    writeFileSync(
      path.join(repository, "scripts/qa/fixture-schema-contract/fixtures.mjs"),
      "export const FIXTURES = [{ id: 'exemplo' }];\n",
    );
    git(repository, ["add", "."]);
    git(repository, ["commit", "--quiet", "-m", "aperta restricao e atualiza a fixture"]);

    const result = checkCoupling({
      repositoryRoot: repository,
      env: { FIXTURE_CONTRACT_DIFF_RANGE: "HEAD~1..HEAD" },
      fixtures: DECLARED,
    });
    assert.deepEqual(result.failures, []);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("migration que apenas relaxa ou documenta nao exige atualizacao de fixture", () => {
  const repository = createRepository();
  try {
    writeFileSync(
      path.join(repository, "supabase/migrations/0002_relax.sql"),
      "alter table public.t drop constraint if exists t_origin_check;\ncomment on table public.t is 'nota';\n",
    );
    git(repository, ["add", "."]);
    git(repository, ["commit", "--quiet", "-m", "relaxa restricao"]);

    const result = checkCoupling({
      repositoryRoot: repository,
      env: { FIXTURE_CONTRACT_DIFF_RANGE: "HEAD~1..HEAD" },
      fixtures: DECLARED,
    });
    assert.deepEqual(result.failures, []);
  } finally {
    rmSync(repository, { recursive: true, force: true });
  }
});

test("o intervalo em analise neste repositorio nao tem migration desacoplada de fixture", () => {
  const result = checkCoupling();
  assert.deepEqual(
    result.failures.map((entry) => `${entry.cause} :: ${entry.entity}`),
    [],
    `acoplamento reprovado no intervalo ${result.range ?? "(vazio)"}`,
  );
});

test("o intervalo de diff e sempre determinavel neste checkout", () => {
  // Sem saber o que mudou nao ha como provar acoplamento; aprovar por falta de informacao seria
  // exatamente o furo que a regra fecha, entao a ausencia de intervalo e reprovacao.
  const resolved = resolveRange();
  assert.ok(resolved !== null, "intervalo de diff indeterminavel: o contrato reprova em vez de aprovar");
  assert.ok(typeof resolved.origin === "string" && resolved.origin.length > 0);
});

test("os padroes de aperto cobrem restricao, vinculo obrigatorio e escopo de RLS", () => {
  const ids = TIGHTENING_PATTERNS.map((entry) => entry.id);
  for (const expected of ["check", "foreign-key", "unique", "not-null", "policy", "scope-function"]) {
    assert.ok(ids.includes(expected), `padrao de aperto ausente: ${expected}`);
  }
  const scope = TIGHTENING_PATTERNS.find((entry) => entry.id === "scope-function");
  assert.match("create or replace function private.cms_form_capture_origin_allowed(", scope.pattern);
});
