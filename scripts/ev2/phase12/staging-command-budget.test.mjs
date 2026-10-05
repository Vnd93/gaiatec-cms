import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateSystemEvidence, budgetsMissed, percentile } from "../phase11/system-assurance-lib.mjs";
import { evaluateRolloutWindow } from "./release-guard-lib.mjs";
import {
  commandP95Budget,
  stagingCommandBudgetSemanticSql,
  STAGING_COMMAND_BUDGET_SOURCES,
} from "./staging-command-budget.mjs";

const metrics = {
  availabilityPercent: 99.9,
  adminReadP95Ms: 500,
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

test("G11 accepts 2s only in staging and retains every independent gate", () => {
  assert.equal(evaluateSystemEvidence(evidence).passed, true);
  assert.equal(evaluateSystemEvidence(evidence).requiresIndependentReview, true);
  for (const value of [2001, 5241, Infinity, NaN, null, "2000"]) {
    assert.equal(
      evaluateSystemEvidence({ ...evidence, metrics: { ...metrics, commandP95Ms: value } }).passed,
      false,
    );
  }
  for (const environment of [
    undefined,
    null,
    "",
    "STAGING",
    "local",
    "production",
    "production-preview",
    "unknown",
  ]) {
    assert.equal(commandP95Budget(environment), 800);
    assert.equal(evaluateSystemEvidence({ ...evidence, environment }).passed, false);
    assert.equal(
      evaluateSystemEvidence({ ...evidence, environment, metrics: { ...metrics, commandP95Ms: 800 } }).passed,
      true,
    );
  }
  for (const change of [
    { p0Count: 1 },
    { p1Count: 1 },
    { passedChecks: 9 },
    { securityStatus: "failed" },
    { restoreStatus: "failed" },
    { realDataUsed: true },
    { accessibilityCritical: 1 },
    { accessibilitySerious: 1 },
    { metrics: { ...metrics, adminReadP95Ms: 501 } },
    { metrics: { ...metrics, auditCoveragePercent: 99 } },
  ]) {
    assert.equal(evaluateSystemEvidence({ ...evidence, ...change }).passed, false);
  }
  assert.equal(budgetsMissed({ commandP95Ms: 2000 }, { commandP95Ms: 2000 }).length, 0);
  assert.equal(
    budgetsMissed(
      { commandP95Ms: 2000 },
      { commandP95Ms: percentile([493, 449, 369, 364, 511, 564, 236, 194, 395, 5241], 95) },
    ).length,
    1,
  );
});

test("G12 requires both staging environment and staging-canary stage for 2s", () => {
  const window = {
    candidateSha: "a".repeat(40),
    environment: "staging",
    stage: "staging-canary",
    startedAt: "2026-10-05T00:00:00Z",
    endedAt: "2026-10-05T00:05:00Z",
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
    adminReadP95Ms: 500,
    commandP95Ms: 2000,
    outboxLagP95Ms: 0,
  };
  assert.equal(evaluateRolloutWindow(window).healthy, true);
  for (const change of [
    { commandP95Ms: 2001 },
    { commandP95Ms: 5241 },
    { stage: "production-1" },
    { environment: "production" },
    { environment: "local" },
    { environment: "production-preview" },
    { adminReadP95Ms: 501 },
    { securityIncidentCount: 1 },
    { restoreStatus: "failed" },
  ]) {
    assert.equal(evaluateRolloutWindow({ ...window, ...change }).healthy, false);
  }
  assert.equal(
    evaluateRolloutWindow({ ...window, environment: "production", stage: "production-1", commandP95Ms: 800 })
      .healthy,
    true,
  );
});

test("0115 changes only the two bound budget expressions, preserving source and pg_proc attributes", () => {
  const old = readFileSync("supabase/migrations/0050_ev2_system_assurance.sql", "utf8").replaceAll(
    "\r\n",
    "\n",
  );
  const migration = readFileSync("supabase/migrations/0115_cms_staging_command_latency_budget.sql", "utf8");
  const replacements = [
    [
      "cms_system_capability",
      "'commandP95Ms', 800",
      "'commandP95Ms', case when p_environment = 'staging' then 2000 else 800 end",
    ],
    [
      "cms_execute_system_command",
      "::numeric <= 800, false)",
      "::numeric <= (case when p_environment = 'staging' then 2000 else 800 end), false)",
    ],
  ];
  for (const [index, [name, before, after]] of replacements.entries()) {
    const source = old.split(`create function public.${name}(`)[1].split("as $$")[1].split("$$;")[0];
    assert.equal(source.split(before).length, 2);
    assert.ok(migration.includes(createHash("sha256").update(source).digest("hex")));
    assert.equal(
      createHash("sha256").update(source.replace(before, after)).digest("hex"),
      STAGING_COMMAND_BUDGET_SOURCES[index][1],
    );
    assert.ok(migration.includes(STAGING_COMMAND_BUDGET_SOURCES[index][1]));
  }
  for (const marker of [
    "CMS_STAGING_COMMAND_BUDGET_SOURCE_DRIFT",
    "CMS_STAGING_COMMAND_BUDGET_POSTCONDITION_DRIFT",
    "pg_get_functiondef(v_function) is distinct from v_after",
    "is distinct from v_attributes",
  ])
    assert.ok(migration.includes(marker));
  assert.doesNotMatch(migration, /\b(?:grant|revoke|drop|disable|truncate)\b/i);
  const sql = stagingCommandBudgetSemanticSql("staging_command_budget_0115_exact");
  assert.ok(sql.includes("p.oid is null"));
  assert.ok(sql.includes("acl.grantee <> p.proowner"));
  assert.throws(() => stagingCommandBudgetSemanticSql("x;select"));
  for (const path of [
    "scripts/ev2/phase12/verify-staging-database.mjs",
    "scripts/ev2/phase12/staging-migrations-canary.mjs",
  ]) {
    const content = readFileSync(path, "utf8");
    assert.ok(content.includes('stagingCommandBudgetSemanticSql("staging_command_budget_0115_exact")'));
    assert.ok(content.includes('"staging_command_budget_0115_exact",'));
  }
});
