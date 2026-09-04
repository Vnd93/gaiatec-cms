import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { evaluateSystemEvidence, percentile, summarizeDurations } from "./system-assurance-lib.mjs";

const read = (path) => readFile(path, "utf8");

test("EV2.11 migration is additive, default-off, RLS protected and production gated", async () => {
  const [sql, rls] = await Promise.all([
    read("supabase/migrations/0050_ev2_system_assurance.sql"),
    read("supabase/tests/rls_ev2_phase11_system.test.sql"),
  ]);
  for (const table of [
    "cms_lead_outbox_replays",
    "cms_assurance_runs",
    "cms_assurance_events",
    "cms_system_command_receipts",
  ]) {
    assert.match(sql, new RegExp("create table public\\." + table));
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(sql, /ev2\.system_assurance/);
  assert.match(sql, /private\.cms_system_individual_flag_context/);
  assert.match(sql, /broad_activation_not_supported/);
  assert.match(sql, /interval '30 minutes'/);
  assert.match(sql, /environment in \('local', 'staging'\)/);
  assert.match(sql, /real_data_used boolean not null default false check \(not real_data_used\)/);
  assert.match(sql, /reviewed_by <> requested_by/);
  assert.match(sql, /status not in \('accepted', 'rejected'\) or measurement_passed/);
  assert.doesNotMatch(sql, /drop table|truncate|default_enabled\s*=\s*true/i);
  assert.match(sql, /create trigger cms_assurance_runs_guard/);
  assert.match(sql, /create trigger cms_system_command_receipts_guard/);
  assert.match(rls, /select plan\(46\)/);
});

test("F-017 exposes delivery state and a controlled, durable replay path", async () => {
  const [sql, edge, page, worker] = await Promise.all([
    read("supabase/migrations/0050_ev2_system_assurance.sql"),
    read("supabase/functions/cms-leads/index.ts"),
    read("src/admin/pages/AdminLeadsPage.tsx"),
    read("supabase/functions/cms-outbox-worker/index.ts"),
  ]);
  assert.match(sql, /cms_retry_lead_delivery/);
  assert.match(sql, /previous_status text not null/);
  assert.match(sql, /CMS_LEAD_DELIVERY_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /CMS_LEAD_DELIVERY_NOT_RETRYABLE/);
  assert.match(sql, /cms:leads\.retry_delivery/);
  assert.match(sql, /cms\.leads\.delivery_dead_letter/);
  assert.match(sql, /set resolved_at = now\(\)/);
  assert.match(edge, /retry_delivery/);
  assert.match(edge, /CMS_ENVIRONMENT/);
  assert.match(edge, /p_request_hash:await sha256/);
  assert.match(page, /cms_lead_outbox\(/);
  assert.match(page, /Reprocessar entrega/);
  assert.match(page, /O lead permanecerá intacto/);
  assert.match(worker, /leadDurability: true/);
  assert.match(worker, /durationMs/);
});

test("F-018 exposes a read-only snapshot and two-person Gate G11 evidence", async () => {
  const [sql, edge, contract, page, api] = await Promise.all([
    read("supabase/migrations/0050_ev2_system_assurance.sql"),
    read("supabase/functions/cms-system/index.ts"),
    read("src/shared/contracts/ev2-system.ts"),
    read("src/admin/pages/AdminDiagnosticsPage.tsx"),
    read("src/admin/api/cms-api.ts"),
  ]);
  assert.match(sql, /cms_get_system_snapshot/);
  assert.match(sql, /gateDecision', 'non_authoritative'/);
  assert.match(sql, /CMS_SYSTEM_REVIEWER_SEPARATION_REQUIRED/);
  assert.match(sql, /availabilityPercent/);
  assert.match(sql, /adminReadP95Ms/);
  assert.match(sql, /outboxLagP95Ms/);
  assert.match(sql, /restoreRtoMinutes/);
  assert.match(edge, /CMS_SYSTEM_PRODUCTION_GATED/);
  assert.match(edge, /identity\.claims\.aal !== "aal2"/);
  assert.match(edge, /consumeRateLimit/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  assert.match(contract, /gateDecision: z\.literal\("non_authoritative"\)/);
  assert.match(page, /VITE_EV2_SYSTEM_ASSURANCE_CANDIDATE/);
  assert.match(page, /não o aprova isoladamente/);
  assert.match(page, /Filas transacionais verificadas/);
  assert.match(api, /systemAssuranceCommand/);
});

test("G11 boundary rules fail closed without redundant scenario tests", () => {
  const result = spawnSync(process.execPath, ["scripts/ev2/phase11/run-evals.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, "G11_RULES_PASS");
  assert.equal(report.scenarios, 16);
  assert.equal(report.falseAcceptances, 0);
  assert.equal(report.realDataUsed, false);
  assert.equal(report.productionMutations, 0);
});

test("load statistics use nearest-rank percentiles and strict evidence evaluation", () => {
  assert.equal(percentile([10, 20, 30, 40, 50], 95), 50);
  assert.deepEqual(summarizeDurations([1, 2, 3, 4]), {
    samples: 4,
    minMs: 1,
    p50Ms: 2,
    p95Ms: 4,
    p99Ms: 4,
    maxMs: 4,
  });
  const result = evaluateSystemEvidence({
    totalChecks: 1,
    passedChecks: 1,
    p0Count: 0,
    p1Count: 0,
    accessibilityCritical: 0,
    accessibilitySerious: 0,
    securityStatus: "passed",
    restoreStatus: "passed",
    syntheticOnly: true,
    realDataUsed: false,
    metrics: {
      availabilityPercent: 99.9,
      adminReadP95Ms: 500,
      commandP95Ms: 800,
      outboxLagP95Ms: 60000,
      auditCoveragePercent: 100,
      restoreRpoMinutes: 0,
      restoreRtoMinutes: 15,
    },
  });
  assert.equal(result.passed, true);
  assert.equal(result.requiresIndependentReview, true);
});

test("G11 operational artifacts remain reproducible and explicitly pending", async () => {
  const [rehearsal, canary, workflow, gate, plan, matrix, runbook] = await Promise.all([
    read("scripts/ev2/phase11/validate-migration.mjs"),
    read("scripts/ev2/phase11/staging-canary.mjs"),
    read(".github/workflows/preview-ev2-phase11.yml"),
    read("docs/ev2/fase-11/GATE_G11.md"),
    read("docs/ev2/fase-11/PLANO_CANARY_STAGING.md"),
    read("docs/ev2/fase-11/MATRIZ_HOMOLOGACAO.md"),
    read("docs/ev2/fase-11/RUNBOOK_OPERACIONAL.md"),
  ]);
  assert.match(rehearsal, /G11_MIGRATION_REHEARSAL_PASS/);
  assert.match(rehearsal, /ALVO RECUSADO/);
  assert.match(rehearsal, /rollback;/i);
  assert.match(canary, /EV2_G11_EXPECTED_SHA/);
  assert.match(canary, /exact_candidate_sha/);
  assert.match(canary, /lead_preserved_after_delivery_failure/);
  assert.match(canary, /independent_review_required/);
  assert.match(canary, /synthetic_residue_zero/);
  assert.match(canary, /ban_duration: "876000h"/);
  assert.match(canary, /activeCredentials/);
  assert.match(workflow, /ev2-g11-canary/);
  assert.match(workflow, /VITE_EV2_SYSTEM_ASSURANCE_CANDIDATE/);
  assert.match(gate, /G11 PENDENTE/);
  assert.match(plan, /sem produção/i);
  assert.match(matrix, /Operacional/);
  assert.match(matrix, /LGPD/);
  assert.match(runbook, /RPO 0/);
});
