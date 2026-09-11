import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStagingEvidence } from "./verify-staging-evidence.mjs";

test("the npm banner that makes a failed canary look like evidence is refused", () => {
  // Este e o caso que `test -s` nunca pegaria: o banner do npm sai em stdout antes de o script rodar,
  // entao o arquivo e nao-vazio POR CONSTRUCAO mesmo que o canario estoure no primeiro check.
  const banner =
    "\n> @gaiatec/site-publico@0.0.1 canary:ev2:phase17\n> node scripts/ev2/phase17/canary.mjs\n\n";
  const refused = evaluateStagingEvidence("g17-staging-canary.json", banner);
  assert.equal(refused.valid, false);
  assert.ok(refused.violations.includes("evidence_not_json"));

  // E o banner seguido do JSON tambem nao e JSON, que e o que salva este gate do caso real.
  assert.equal(evaluateStagingEvidence("g17.json", `${banner}{"status":"passed"}`).valid, false);
});

test("evidence that says failed inside is refused instead of counted", () => {
  // staging-roundtrip.mjs grava isto no catch: arquivo nao vazio, veredito reprovado, subindo como
  // se estivesse aprovado.
  const failed = evaluateStagingEvidence(
    "g12-staging-lifecycle.json",
    JSON.stringify({ status: "failed", error: "Primeira captação falhou" }),
  );
  assert.equal(failed.valid, false);
  assert.ok(failed.violations.some((violation) => violation.startsWith("evidence_status_failed")));

  for (const [field, value] of [
    ["outcome", "reproved"],
    ["ok", false],
    ["passed", false],
  ]) {
    const result = evaluateStagingEvidence("x.json", JSON.stringify({ [field]: value }));
    assert.equal(result.valid, false, `${field}=${value} deveria reprovar`);
  }
});

test("a real passing report is accepted, including shapes with no verdict field", () => {
  assert.equal(
    evaluateStagingEvidence("g12.json", JSON.stringify({ status: "passed", objects: 3 })).valid,
    true,
  );
  // Varios destes arquivos sao inventarios sem campo de veredito nenhum, e recusa-los seria inventar
  // uma regra que a evidencia nunca teve.
  assert.equal(
    evaluateStagingEvidence("functions.json", JSON.stringify([{ name: "cms-public" }])).valid,
    true,
  );
  assert.equal(evaluateStagingEvidence("matrix.json", JSON.stringify({ tables: 22, rows: 44 })).valid, true);
});

test("an empty file is still refused, so the old guarantee is not lost", () => {
  for (const empty of ["", "   \n", null]) {
    assert.equal(evaluateStagingEvidence("empty.json", empty).valid, false);
  }
});
