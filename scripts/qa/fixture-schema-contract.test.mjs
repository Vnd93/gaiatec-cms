// Gate do contrato fixture x schema (secao 3.1 da instrucao de otimizacao de entrega).
//
// Entra em `npm run check` pelo alvo `test:qa`, que ja varre `scripts/qa/*.test.mjs`. Executa local,
// sem rede, em segundos.

import assert from "node:assert/strict";
import test from "node:test";

import {
  formatFailure,
  GATE,
  KNOWN_DEFECTS,
  runContract,
  runKnownDefect,
} from "./fixture-schema-contract/contract.mjs";
import { CONTRACTED_TABLES, FIXTURES } from "./fixture-schema-contract/fixtures.mjs";
import { computeAnchorDigests, GUARD_ANCHORS, staleAnchors } from "./fixture-schema-contract/guards.mjs";
import {
  auditConstraintCoverage,
  buildSchemaModel,
  getTable,
} from "./fixture-schema-contract/schema-model.mjs";
import {
  checkIsSatisfied,
  evaluateCheck,
  UnsupportedExpressionError,
} from "./fixture-schema-contract/sql-expression.mjs";

test("toda fixture sintetica vigente satisfaz as restricoes atuais do schema", () => {
  const failures = runContract();
  assert.deepEqual(
    failures.map((entry) => entry.cause),
    [],
    `contrato reprovou fixtures vigentes:\n${failures.map(formatFailure).join("\n\n")}`,
  );
});

test("o contrato reproduz a recusa da origem do lead sintetico pela migration 0084", () => {
  const defect = KNOWN_DEFECTS.find((entry) => entry.id === "g11-lead-origin-refused-by-0084");
  const failures = runKnownDefect(defect);

  const origin = failures.find((entry) => entry.cause === "FIXTURE_LEAD_ORIGIN_SCOPE_FORBIDDEN");
  assert.ok(origin, `a origem historica deveria ser recusada:\n${failures.map(formatFailure).join("\n\n")}`);

  // A falha nomeia fixture, coluna, valor recusado, restricao e a migration que a introduziu.
  assert.equal(origin.gate, GATE);
  assert.equal(origin.fixture, defect.id);
  assert.equal(origin.table, "public.cms_leads");
  assert.equal(origin.column, "origin_source");
  assert.equal(origin.migration, defect.expect.migration);
  assert.match(origin.observed, /origin_source=ev2-g11-canary/);
  assert.match(origin.observed, /origin_path=\/g11-synthetic/);
  assert.match(origin.expected, /vocabulario fechado/);
  assert.ok(origin.remediation.length > 0);
});

test("o contrato reproduz a exigencia de qa_actor_id do mesmo run pela migration 0072", () => {
  const defect = KNOWN_DEFECTS.find((entry) => entry.id === "g11-lead-provenance-refused-by-0072");
  const failures = runKnownDefect(defect);

  const scope = failures.find((entry) => entry.cause === "FIXTURE_LEAD_SCOPE_UNREACHABLE");
  assert.ok(
    scope,
    `o vinculo de proveniencia deveria ser exigido:\n${failures.map(formatFailure).join("\n\n")}`,
  );
  assert.equal(scope.fixture, defect.id);
  assert.equal(scope.table, "public.cms_leads");
  assert.equal(scope.column, "qa_actor_id");
  assert.equal(scope.migration, defect.expect.migration);
  assert.match(scope.expected, /lease de QA|proveniencia/);

  // E nomeia a armadilha da primeira tentativa de correcao: o valor enviado que 0072 descarta.
  const discarded = failures.find((entry) => entry.cause === "FIXTURE_VALUE_DISCARDED_BY_TRIGGER");
  assert.ok(discarded, "enviar qa_actor_id no lead nao muda o que 0072 grava, e isso tem de aparecer");
  assert.equal(discarded.column, "qa_actor_id");
  assert.equal(discarded.migration, defect.expect.migration);
  assert.match(discarded.observed, /gravado=null/);
});

test("os dois defeitos conhecidos sao colhidos sem nenhuma execucao remota", () => {
  // Nenhum modulo do contrato abre rede: o gate roda inteiro sobre os arquivos do repositorio.
  const reproduced = KNOWN_DEFECTS.map((defect) => ({
    id: defect.id,
    causes: runKnownDefect(defect).map((entry) => entry.cause),
  }));
  assert.equal(reproduced.length, 2);
  for (const entry of reproduced) assert.ok(entry.causes.length > 0, `${entry.id} passou sem ser recusado`);
});

test("cada guarda continua ancorado no trecho de migration que representa", () => {
  const stale = staleAnchors();
  assert.deepEqual(
    stale,
    [],
    "o trecho de migration que uma regra do contrato representa mudou; revisar a regra antes de " +
      `atualizar o digest:\n${JSON.stringify(stale, null, 2)}`,
  );
  const computed = computeAnchorDigests();
  assert.equal(computed.length, GUARD_ANCHORS.length);
  for (const anchor of computed) assert.match(anchor.digest ?? "", /^[0-9a-f]{64}$/);
});

test("nenhuma restricao das tabelas sob contrato escapa do modelo do schema", () => {
  const model = buildSchemaModel();
  assert.deepEqual(auditConstraintCoverage(model, CONTRACTED_TABLES), []);
  for (const table of CONTRACTED_TABLES) {
    const entry = getTable(model, table);
    assert.ok(entry, `${table} ausente do modelo`);
    assert.ok(entry.columns.size > 0, `${table} sem colunas extraidas`);
  }
});

test("o modelo captura as restricoes exatas que produziram os dois defeitos", () => {
  const model = buildSchemaModel();
  const leads = getTable(model, "public.cms_leads");

  const provenance = leads.constraints.get("cms_leads_qa_provenance_check");
  assert.ok(provenance, "cms_leads_qa_provenance_check nao foi extraida");
  assert.equal(provenance.migration, "0072_cms_forms_leads_authoritative_scope.sql");
  assert.match(
    provenance.expression,
    /num_nonnulls\(qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment\)/,
  );

  const originSource = [...leads.constraints.values()].find(
    (constraint) => constraint.kind === "check" && /char_length\(origin_source\)/.test(constraint.expression),
  );
  assert.ok(originSource, "a restricao de origin_source nao foi extraida");
  assert.equal(originSource.migration, "0027_fase7_marketing_blog_leads.sql");
});

test("toda fixture declarada continua amarrada aos valores que a fonte usa", () => {
  // As ancoras ja rodam dentro de runContract; aqui se prova que elas existem para cada fixture.
  for (const fixture of FIXTURES) {
    assert.ok(fixture.source, `${fixture.id} sem fonte declarada`);
    const anchored = fixture.rows.filter((row) => (row.anchors ?? []).length > 0);
    assert.ok(
      anchored.length > 0,
      `${fixture.id} nao tem nenhuma ancora: a declaracao poderia derivar em silencio`,
    );
  }
});

test("nenhuma falha do contrato carrega segredo, credencial ou dado pessoal", () => {
  const failures = KNOWN_DEFECTS.flatMap((defect) => runKnownDefect(defect));
  assert.ok(failures.length > 0);
  const forbidden = [
    /@[a-z0-9.-]+\.[a-z]{2,}/i,
    /bearer\s/i,
    /apikey/i,
    /password|senha/i,
    /eyJ[A-Za-z0-9_-]{10,}/,
  ];
  for (const entry of failures) {
    const serialized = JSON.stringify(entry);
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(serialized), `falha expoe conteudo proibido (${pattern}): ${serialized}`);
    }
  }
});

test("o avaliador de expressao respeita a logica de tres valores do Postgres", () => {
  // CHECK e satisfeita quando TRUE ou NULL; violada apenas quando FALSE.
  assert.equal(evaluateCheck("status in ('new','archived')", { status: "new" }), true);
  assert.equal(evaluateCheck("status in ('new','archived')", { status: "converted" }), false);
  assert.equal(evaluateCheck("status in ('new','archived')", { status: null }), null);
  assert.equal(checkIsSatisfied("status in ('new','archived')", { status: null }), true);

  assert.equal(evaluateCheck("char_length(btrim(title)) between 1 and 180", { title: "  ok  " }), true);
  assert.equal(evaluateCheck("char_length(btrim(title)) between 1 and 180", { title: "   " }), false);

  assert.equal(evaluateCheck("capture_hash ~ '^[0-9a-f]{64}$'", { capture_hash: "a".repeat(64) }), true);
  assert.equal(evaluateCheck("capture_hash ~ '^[0-9a-f]{64}$'", { capture_hash: "zz" }), false);

  assert.equal(evaluateCheck("origin_path like '/%'", { origin_path: "/qa-cms-final/x" }), true);
  assert.equal(evaluateCheck("origin_path like '/%'", { origin_path: "qa" }), false);

  assert.equal(evaluateCheck("jsonb_typeof(payload)='object'", { payload: { a: 1 } }), true);
  assert.equal(evaluateCheck("jsonb_typeof(payload)='object'", { payload: [1] }), false);

  assert.equal(
    evaluateCheck("(status='anonymized')=(anonymized_at is not null)", {
      status: "new",
      anonymized_at: null,
    }),
    true,
  );
  assert.equal(
    evaluateCheck("(status='anonymized')=(anonymized_at is not null)", {
      status: "anonymized",
      anonymized_at: null,
    }),
    false,
  );

  const provenance =
    "(qa_actor_id is null and qa_run_tag is null) or (num_nonnulls(qa_actor_id,qa_run_tag) = 2 " +
    "and qa_run_tag ~ '^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$' and right(qa_run_tag, 9) = ('-' || left(qa_candidate_sha, 8)))";
  assert.equal(
    evaluateCheck(provenance, { qa_actor_id: null, qa_run_tag: null, qa_candidate_sha: null }),
    true,
  );
  assert.equal(
    evaluateCheck(provenance, {
      qa_actor_id: "actor",
      qa_run_tag: "QA-CMS-FINAL-20260910-ff2238df",
      qa_candidate_sha: "ff2238df23ba00854b9e9c401376b3edcdc93f46",
    }),
    true,
  );
  assert.equal(
    evaluateCheck(provenance, {
      qa_actor_id: "actor",
      qa_run_tag: "QA-CMS-FINAL-20260910-00000000",
      qa_candidate_sha: "ff2238df23ba00854b9e9c401376b3edcdc93f46",
    }),
    false,
  );
});

test("expressao fora da gramatica coberta falha em vez de ser aprovada por omissao", () => {
  assert.throws(
    () => evaluateCheck("my_custom_predicate(payload)", { payload: {} }),
    (error) => error instanceof UnsupportedExpressionError && /nao coberta/.test(error.detail),
  );
});
