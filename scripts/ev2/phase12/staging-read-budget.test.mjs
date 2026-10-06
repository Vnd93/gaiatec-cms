import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateSystemEvidence, budgetsMissed, percentile } from "../phase11/system-assurance-lib.mjs";
import { evaluateRolloutWindow } from "./release-guard-lib.mjs";
import { STAGING_COMMAND_BUDGET_SOURCES } from "./staging-command-budget.mjs";
import {
  adminReadP95Budget,
  stagingReadBudgetSemanticSql,
  STAGING_READ_BUDGET_SOURCES,
} from "./staging-read-budget.mjs";

const metrics = {
  availabilityPercent: 99.9,
  adminReadP95Ms: 2000,
  commandP95Ms: 2000,
  outboxLagP95Ms: 60000,
  auditCoveragePercent: 100,
  restoreRpoMinutes: 0,
  restoreRtoMinutes: 15,
};
const evidence = {
  environment: "staging",
  totalChecks: 10,
  passedChecks: 10,
  p0Count: 0,
  p1Count: 0,
  accessibilityCritical: 0,
  accessibilitySerious: 0,
  securityStatus: "passed",
  restoreStatus: "passed",
  syntheticOnly: true,
  realDataUsed: false,
  metrics,
};
const window = {
  candidateSha: "a".repeat(40),
  environment: "staging",
  stage: "staging-canary",
  startedAt: "2026-10-06T00:00:00Z",
  endedAt: "2026-10-06T00:05:00Z",
  sampleCount: 20,
  availabilityPercent: 100,
  http5xxRatePercent: 0,
  publicP95Ms: 500,
  releaseHeadersExact: true,
  healthContractValid: true,
  manifestReleaseExact: true,
  routeBudgetsValid: true,
  nonProductionNoindexValid: true,
  p0Count: 0,
  p1Count: 0,
  securityIncidentCount: 0,
  projectionDivergenceCount: 0,
  accessibilityCriticalCount: 0,
  accessibilitySeriousCount: 0,
  securityReviewStatus: "passed",
  privacyReviewStatus: "passed",
  projectionComparisonStatus: "passed",
  restoreStatus: "passed",
  adminReadP95Ms: 2000,
  commandP95Ms: 2000,
  outboxLagP95Ms: 0,
};

test("G11 accepts the explicit 2s read ceiling only for exact staging", () => {
  assert.equal(adminReadP95Budget("staging"), 2000);
  assert.equal(evaluateSystemEvidence(evidence).passed, true);
  assert.equal(evaluateSystemEvidence(evidence).requiresIndependentReview, true);
  for (const adminReadP95Ms of [2001, 2406, Infinity, NaN, null, undefined, "2000"]) {
    assert.equal(
      evaluateSystemEvidence({ ...evidence, metrics: { ...metrics, adminReadP95Ms } }).passed,
      false,
    );
  }
  for (const environment of [
    undefined,
    null,
    "",
    "STAGING",
    " staging ",
    "local",
    "production",
    "production-preview",
    "unknown",
  ]) {
    assert.equal(adminReadP95Budget(environment), 500);
    const strict = {
      ...evidence,
      environment,
      metrics: { ...metrics, commandP95Ms: 800, adminReadP95Ms: 500 },
    };
    assert.equal(evaluateSystemEvidence(strict).passed, true);
    assert.equal(
      evaluateSystemEvidence({ ...strict, metrics: { ...strict.metrics, adminReadP95Ms: 501 } }).passed,
      false,
    );
  }
});

test("read approval does not change independent G11 checks or nearest-rank sampling", () => {
  for (const change of [
    { p0Count: 1 },
    { p1Count: 1 },
    { passedChecks: 9 },
    { totalChecks: 0 },
    { securityStatus: "failed" },
    { restoreStatus: "failed" },
    { realDataUsed: true },
    { syntheticOnly: false },
    { accessibilityCritical: 1 },
    { accessibilitySerious: 1 },
    { metrics: { ...metrics, availabilityPercent: 99.89 } },
    { metrics: { ...metrics, commandP95Ms: 2001 } },
    { metrics: { ...metrics, outboxLagP95Ms: 60001 } },
    { metrics: { ...metrics, auditCoveragePercent: 99 } },
    { metrics: { ...metrics, restoreRpoMinutes: 1 } },
    { metrics: { ...metrics, restoreRtoMinutes: 16 } },
  ])
    assert.equal(evaluateSystemEvidence({ ...evidence, ...change }).passed, false);
  const vector = [
    133, 121, 142, 111, 104, 103, 81, 101, 116, 90, 90, 96, 56, 95, 88, 108, 103, 277, 737, 1910,
  ];
  assert.equal(percentile(vector, 95), 737);
  assert.equal(budgetsMissed({ adminReadP95Ms: 500 }, { adminReadP95Ms: percentile(vector, 95) }).length, 1);
  assert.equal(budgetsMissed({ adminReadP95Ms: 2000 }, { adminReadP95Ms: 2000 }).length, 0);
  assert.equal(budgetsMissed({ adminReadP95Ms: 2000 }, { adminReadP95Ms: 2001 }).length, 1);
  // The old budget still fails the old vector; no historical report is rewritten.
  assert.equal(vector.length, 20);
});

test("G12 scopes the 2s read ceiling to both staging and staging-canary", () => {
  assert.equal(evaluateRolloutWindow(window).healthy, true);
  for (const change of [
    { adminReadP95Ms: 2001 },
    { adminReadP95Ms: 2406 },
    { adminReadP95Ms: null },
    { adminReadP95Ms: "2000" },
    { stage: "production-1" },
    { stage: "production-shell" },
    { environment: "production" },
    { environment: "local" },
    { environment: "STAGING" },
    { environment: undefined },
    { environment: "production-preview" },
    { commandP95Ms: 2001 },
    { securityIncidentCount: 1 },
    { restoreStatus: "failed" },
    { privacyReviewStatus: "failed" },
    { securityReviewStatus: "failed" },
    { projectionDivergenceCount: 1 },
    { p0Count: 1 },
    { p1Count: 1 },
    { accessibilityCriticalCount: 1 },
    { accessibilitySeriousCount: 1 },
    { releaseHeadersExact: false },
    { manifestReleaseExact: false },
    { routeBudgetsValid: false },
  ])
    assert.equal(evaluateRolloutWindow({ ...window, ...change }).healthy, false);
  const production = {
    ...window,
    environment: "production",
    stage: "production-1",
    commandP95Ms: 800,
    adminReadP95Ms: 500,
  };
  assert.equal(evaluateRolloutWindow(production).healthy, true);
  assert.equal(evaluateRolloutWindow({ ...production, adminReadP95Ms: 501 }).healthy, false);
});

test("0116 patches only two read expressions from exact 0115 and preserves security attributes", () => {
  const original = readFileSync("supabase/migrations/0050_ev2_system_assurance.sql", "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  const migration = readFileSync("supabase/migrations/0116_cms_staging_read_latency_budget.sql", "utf8");
  const changes = [
    [
      "cms_system_capability",
      "'commandP95Ms', 800",
      "'commandP95Ms', case when p_environment = 'staging' then 2000 else 800 end",
      "'adminReadP95Ms', 500",
      "'adminReadP95Ms', case when p_environment = 'staging' then 2000 else 500 end",
    ],
    [
      "cms_execute_system_command",
      "::numeric <= 800, false)",
      "::numeric <= (case when p_environment = 'staging' then 2000 else 800 end), false)",
      "(p_payload #>> '{metrics,adminReadP95Ms}')::numeric <= 500, false)",
      "(p_payload #>> '{metrics,adminReadP95Ms}')::numeric <= (case when p_environment = 'staging' then 2000 else 500 end), false)",
    ],
  ];
  for (const [index, [name, commandBefore, commandAfter, before, after]] of changes.entries()) {
    const source = original
      .split(`create function public.${name}(`)[1]
      .split("as $$")[1]
      .split("$$;")[0]
      .replace(commandBefore, commandAfter);
    const digest = (text) => createHash("sha256").update(text).digest("hex");
    assert.equal(digest(source), STAGING_COMMAND_BUDGET_SOURCES[index][1]);
    assert.equal(source.split(before).length, 2);
    assert.equal(digest(source.replace(before, after)), STAGING_READ_BUDGET_SOURCES[index][1]);
    assert.ok(migration.includes(digest(source)));
    assert.ok(migration.includes(STAGING_READ_BUDGET_SOURCES[index][1]));
    assert.ok(migration.includes(before.replaceAll("'", "''")));
    assert.ok(migration.includes(after.replaceAll("'", "''")));
  }
  for (const marker of [
    "CMS_STAGING_READ_BUDGET_SOURCE_DRIFT",
    "CMS_STAGING_READ_BUDGET_POSTCONDITION_DRIFT",
    "pg_get_functiondef(v_function) is distinct from v_after",
    "is distinct from v_attributes",
    "set local lock_timeout = '5s'",
    "set local statement_timeout = '30s'",
  ])
    assert.ok(migration.includes(marker));
  assert.doesNotMatch(migration, /\b(?:grant|revoke|drop|disable|truncate|update|delete|insert)\b/i);
  const sql = stagingReadBudgetSemanticSql("staging_read_and_command_budget_0116_exact");
  for (const marker of [
    "p.oid is null",
    "p.prosecdef is not true",
    "p.proconfig is distinct",
    "acl.grantee <> p.proowner",
  ])
    assert.ok(sql.includes(marker));
  for (const alias of ["x;select", "x y", "x'", "", "X", undefined])
    assert.throws(() => stagingReadBudgetSemanticSql(alias));
});

test("current remote gates and forward compatibility require the exact 0116 read and command bodies", () => {
  for (const path of [
    "scripts/ev2/phase12/verify-staging-database.mjs",
    "scripts/ev2/phase12/staging-migrations-canary.mjs",
  ]) {
    const content = readFileSync(path, "utf8");
    assert.ok(content.includes('stagingReadBudgetSemanticSql("staging_read_and_command_budget_0116_exact")'));
    assert.ok(content.includes('"staging_read_and_command_budget_0116_exact",'));
    assert.ok(!content.includes('stagingCommandBudgetSemanticSql("staging_command_budget_0115_exact")'));
  }
  const compatibility = readFileSync("scripts/ev2/phase12/verify-backend-forward-compatibility.mjs", "utf8");
  assert.ok(compatibility.includes('"0116": ['));
  for (const path of [
    "supabase/tests/rls_cms_staging_read_budget.test.sql",
    "tests/contracts/ev2-system.test.ts",
    "scripts/ev2/phase12/staging-read-budget.test.mjs",
  ])
    assert.ok(compatibility.includes(path));
  assert.ok(readFileSync("scripts/ev2/phase12/staging-migrations-canary.mjs", "utf8").includes('"0116",'));
});
