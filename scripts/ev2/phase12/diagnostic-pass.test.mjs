import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

// O checkout local usa CRLF por core.autocrlf; o CI usa LF. As assercoes sao sobre estrutura,
// nao sobre quebra de linha, entao a leitura normaliza antes de comparar.
const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8").replaceAll("\r\n", "\n");
const reportScript = "scripts/ev2/phase12/diagnostic-report.mjs";
const CANDIDATE = "a".repeat(40);

function jobBody(name) {
  const start = workflow.indexOf(`\n  ${name}:\n`);
  assert.ok(start >= 0, `job ${name} ausente`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z_]+:\n/);
  return next >= 0 ? rest.slice(0, next + 1) : rest;
}

function runReport(outcomes) {
  const directory = mkdtempSync(path.join(tmpdir(), "diagnostic-report-"));
  const output = path.join(directory, "report.json");
  const githubOutput = path.join(directory, "github-output");
  const result = spawnSync(process.execPath, [reportScript, "--output", output], {
    encoding: "utf8",
    env: {
      ...process.env,
      CANDIDATE_SHA: CANDIDATE,
      GITHUB_OUTPUT: githubOutput,
      GITHUB_STEP_SUMMARY: path.join(directory, "summary.md"),
      ...outcomes,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  return {
    report: JSON.parse(readFileSync(output, "utf8")),
    githubOutput: readFileSync(githubOutput, "utf8"),
  };
}

test("the diagnostic pass is an explicit, defaulted-off dispatch input", () => {
  assert.match(workflow, /^ {6}diagnostic_run:$/m);
  const input = workflow.slice(workflow.indexOf("      diagnostic_run:"));
  assert.match(input.slice(0, 400), /type: boolean/);
  assert.match(input.slice(0, 400), /default: false/);
});

test("a diagnostic pass and a canonical run can never be the same run", () => {
  // A proibicao da secao 4.2 e estrutural, nao anotada step a step: em diagnostico o job canonico
  // inteiro nao existe, entao nenhum step de selo, publicacao ou evidencia pode ser alcancado.
  assert.match(jobBody("deploy").slice(0, 600), /if: \$\{\{ !inputs\.diagnostic_run \}\}/);
  assert.match(jobBody("diagnostic").slice(0, 900), /if: \$\{\{ inputs\.diagnostic_run \}\}/);
  assert.match(jobBody("finalize").slice(0, 400), /if: always\(\) && !inputs\.diagnostic_run/);
});

test("the diagnostic job cannot mutate staging beyond its own synthetic fixtures", () => {
  const diagnostic = jobBody("diagnostic");
  for (const forbidden of [
    /supabase db push/,
    /supabase secrets set/,
    /deploy-staging-functions\.mjs/,
    /pages deploy/,
    /wrangler-action/,
    /seal-production-dist\.mjs/,
    /staging-pages-state\.mjs/,
    /materialize-terminal-coverage/,
  ])
    assert.doesNotMatch(diagnostic, forbidden, `passe de diagnostico nao pode conter ${forbidden}`);

  // A unica escrita permitida e a fixture sintetica, com ator e run_tag proprios do run.
  assert.match(diagnostic, /cms-browser-fixture\.mjs setup/);

  // `link` e local: escreve supabase/.temp e nao muta o projeto remoto. Sem ele os canarios recusam
  // o alvo e nenhum check chega a rodar, entao o passe precisa dele — e so dele.
  assert.match(diagnostic, /supabase link --project-ref "\$STAGING_SUPABASE_PROJECT_REF" --yes/);
});

test("gates that compare the served release expect what staging actually serves", () => {
  const diagnostic = jobBody("diagnostic");
  // Nada e publicado por este passe, entao o alias serve o SHA anterior. Exigir o candidato faz o
  // gate recusar antes de exercitar qualquer coisa: foi assim que a fixture de navegador reprovou
  // com QA_CMS_FIXTURE_RELEASE_MISMATCH e o canario G11 com "ALVO RECUSADO".
  assert.doesNotMatch(diagnostic, /QA_CMS_EXPECTED_SHA: \$\{\{ steps\.candidate\.outputs\.sha \}\}/);
  assert.equal(
    (diagnostic.match(/QA_CMS_EXPECTED_SHA: \$\{\{ steps\.live\.outputs\.g17_sha \}\}/g) ?? []).length,
    4,
  );
  assert.match(diagnostic, /EV2_G11_EXPECTED_SHA: \$\{\{ steps\.live\.outputs\.g12_sha \}\}/);
  assert.match(diagnostic, /EV2_G12_EXPECTED_SHA: \$\{\{ steps\.live\.outputs\.g17_sha \}\}/);
  assert.match(diagnostic, /EV2_G17_EXPECTED_SHA: \$\{\{ steps\.live\.outputs\.g17_sha \}\}/);

  // A identidade da fixture, que nao e comparada com release servido, continua no candidato.
  assert.match(diagnostic, /G12_MIGRATION_CANARY_EXPECTED_SHA: \$\{\{ steps\.candidate\.outputs\.sha \}\}/);
});

test("a gate whose precondition failed is never reported as a vacuous pass", () => {
  // Limpar o que nunca foi provisionado tem sucesso sem exercitar nada.
  const { report } = runReport({
    OUTCOME_BROWSER_FIXTURE: "failure",
    OUTCOME_DIAGNOSTIC_CLEANUP: "success",
    OUTCOME_RESIDUE: "success",
  });
  const byGate = Object.fromEntries(report.gates.map((gate) => [gate.gate, gate]));
  assert.equal(byGate["diagnostic.browser_fixture"].result, "FAIL");
  assert.equal(byGate["diagnostic.cleanup"].result, "SKIPPED");
  assert.equal(byGate["diagnostic.residue"].result, "SKIPPED");
  assert.equal(byGate["diagnostic.cleanup"].dependsOn, "diagnostic.browser_fixture");

  // Com a pre-condicao aprovada, o mesmo desfecho volta a valer.
  const healthy = runReport({
    OUTCOME_BROWSER_FIXTURE: "success",
    OUTCOME_DIAGNOSTIC_CLEANUP: "success",
    OUTCOME_RESIDUE: "success",
  }).report;
  const healthyByGate = Object.fromEntries(healthy.gates.map((gate) => [gate.gate, gate]));
  assert.equal(healthyByGate["diagnostic.cleanup"].result, "PASS");
  assert.equal(healthyByGate["diagnostic.residue"].result, "PASS");

  // E a falha propria do dependente continua sendo reportada como falha.
  const broken = runReport({
    OUTCOME_BROWSER_FIXTURE: "success",
    OUTCOME_RESIDUE: "failure",
  }).report;
  assert.equal(broken.gates.find((gate) => gate.gate === "diagnostic.residue").result, "FAIL");
});

test("the canonical run refuses a missing frontend bridge run id", () => {
  // `grep` de string vazia devolve string vazia, entao a comparacao sozinha aceitaria a ausencia.
  const guard = workflow.slice(workflow.indexOf("Validate staging dispatch branch before any mutation"));
  assert.match(guard.slice(0, 900), /test -n "\$FRONTEND_BRIDGE_RUN_ID"/);
  // A entrada deixou de ser obrigatoria porque o passe de diagnostico nao a usa; quem exige e o guarda.
  const input = workflow.slice(workflow.indexOf("      frontend_bridge_run_id:"));
  assert.match(input.slice(0, 400), /required: false/);
});

test("every diagnostic gate collects its failure instead of aborting the pass", () => {
  const diagnostic = jobBody("diagnostic");
  const gates = [...diagnostic.matchAll(/- name: DIAGNOSTIC [^\n]+\n((?: {8}[^\n]*\n)+)/g)];
  assert.ok(gates.length >= 10, `esperado ao menos 10 gates, encontrados ${gates.length}`);
  for (const [, body] of gates) {
    assert.match(body, /^ {8}id: gate_[a-z0-9_]+$/m);
    assert.match(body, /^ {8}continue-on-error: true$/m);
  }
});

test("cleanup and zero-residue stay mandatory and fail-closed inside a diagnostic pass", () => {
  const diagnostic = jobBody("diagnostic");
  const retry = diagnostic.slice(diagnostic.indexOf("Retry the diagnostic actor cleanup"));
  const residue = diagnostic.slice(diagnostic.indexOf("Prove terminal zero residue for the diagnostic"));
  // A primeira tentativa tolera falha apenas para que a retentativa exista; a retentativa e a prova
  // de residuo sao fail-closed, exatamente como no run canonico.
  assert.doesNotMatch(retry.slice(0, 500), /continue-on-error/);
  assert.doesNotMatch(residue.slice(0, 500), /continue-on-error/);
  assert.match(residue.slice(0, 500), /if: always\(\)/);
  assert.match(diagnostic, /Refuse any evidence file touched by a diagnostic pass/);
  assert.match(diagnostic, /Fail the diagnostic pass when any gate reproved/);
});

test("the consolidated report names cause, entity and remediation for every reproved gate", () => {
  const { report, githubOutput } = runReport({
    OUTCOME_LOCAL_CHECK: "success",
    OUTCOME_COVERAGE_MATRIX: "success",
    OUTCOME_BACKEND_COMPATIBILITY: "success",
    OUTCOME_STAGING_DATABASE: "success",
    OUTCOME_MIGRATIONS_CANARY: "failure",
    OUTCOME_G11_CANARY: "failure",
    OUTCOME_LIVE_PROBE: "success",
    OUTCOME_BOUNDARY: "success",
    OUTCOME_LIFECYCLE: "success",
    OUTCOME_PHASE17_CANARY: "success",
    OUTCOME_BROWSER_FIXTURE: "success",
    OUTCOME_DIAGNOSTIC_CLEANUP: "failure",
    OUTCOME_RESIDUE: "success",
  });

  // Criterio de aceite da secao 4.3: uma passada sobre um candidato com tres defeitos reporta os tres.
  assert.equal(report.failedGates, 3);
  assert.equal(githubOutput.trim(), "failed_gates=3");
  const reproved = report.gates.filter((gate) => gate.result === "FAIL").map((gate) => gate.gate);
  assert.deepEqual(reproved, ["diagnostic.migrations_canary", "diagnostic.g11_canary", "diagnostic.cleanup"]);
  for (const gate of report.gates.filter((entry) => entry.result === "FAIL")) {
    // Nenhuma reprovacao pode exigir leitura de log bruto para identificar a causa.
    for (const field of ["cause", "entity", "observed", "expected", "remediation", "sha", "runTag"])
      assert.ok(gate[field], `${gate.gate} sem ${field}`);
    assert.match(gate.cause, /^CMS_[A-Z0-9_]+$/);
    assert.equal(gate.sha, CANDIDATE);
  }
});

test("a gate that never ran counts as reproved, never as pending", () => {
  const { report } = runReport({ OUTCOME_LOCAL_CHECK: "failure" });
  const notReached = report.gates.filter((gate) => gate.observed === "not_reached");
  assert.ok(notReached.length > 0);
  assert.ok(notReached.every((gate) => gate.result === "FAIL"));
  assert.equal(report.failedGates, report.gates.length);
});

test("no diagnostic artefact can ever be read as evidence", () => {
  const { report } = runReport({ OUTCOME_LOCAL_CHECK: "success" });
  assert.equal(report.diagnostic, true);
  assert.equal(report.approvable, false);
  assert.ok(report.limits.length >= 5);
  assert.ok(report.limits.some((limit) => /nao sela artefato/i.test(limit)));
  assert.ok(report.limits.some((limit) => /nao satisfaz gate/i.test(limit)));
});

test("the report carries no credential, personal identifier or secret value", () => {
  const { report } = runReport({ OUTCOME_LOCAL_CHECK: "failure" });

  const keys = [];
  const values = [];
  const walk = (node) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object")
      return Object.entries(node).forEach(([key, value]) => {
        keys.push(key);
        walk(value);
      });
    if (typeof node === "string") values.push(node);
  };
  walk(report);

  // Nenhum campo pode carregar credencial, segredo TOTP, cookie, identificador de pessoa ou dado
  // pessoal. A verificacao e sobre o nome do campo e sobre o formato do valor, nunca sobre a palavra
  // aparecer em texto explicativo.
  for (const key of keys)
    assert.doesNotMatch(key, /password|token|secret|cookie|totp|apikey|email/i, `campo ${key}`);
  for (const value of values) {
    assert.doesNotMatch(value, /[\w.+-]+@[\w-]+\.[\w.]+/, "endereco de e-mail no relatorio");
    assert.doesNotMatch(value, /\b(?:eyJ|sbp_|sb_secret_|gh[pousr]_)/, "credencial no relatorio");
    // O unico hash longo aceito e o proprio SHA candidato, que ja e publico.
    for (const [hash] of value.matchAll(/\b[a-f0-9]{32,}\b/g)) assert.equal(hash, CANDIDATE);
  }
});

test("every outcome the workflow exports maps to a catalogued gate", () => {
  const diagnostic = jobBody("diagnostic");
  const exported = [...diagnostic.matchAll(/^ {10}OUTCOME_([A-Z0-9_]+):/gm)].map(([, key]) => key);
  assert.ok(exported.length >= 12);
  const catalogued = readFileSync(reportScript, "utf8");
  for (const key of exported) assert.match(catalogued, new RegExp(`key: "${key}"`));
});
