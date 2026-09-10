import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  evaluateSystemEvidence,
  percentile,
  serverTimingDuration,
  summarizeDurations,
} from "./system-assurance-lib.mjs";
import { resolveStableBaseline } from "./stable-baseline-lib.mjs";

const read = (path) => readFile(path, "utf8");

function response(status, type, json) {
  return { status, headers: new Headers({ "Content-Type": type }), json };
}

test("G11 fingerprints a legacy stable deployment without promoting it", () => {
  const result = resolveStableBaseline({
    health: response(404, "text/html; charset=utf-8", "missing"),
    manifest: response(200, "text/html; charset=utf-8", "legacy fallback"),
    root: response(200, "text/html; charset=utf-8", "<html>stable</html>"),
  });
  assert.equal(result.stableContractMode, "legacy-root-fingerprint");
  assert.match(result.stableRelease, /^legacy-root-sha256:[a-f0-9]{64}$/);
});

test("G11 keeps strict release contracts when the stable deployment exposes them", () => {
  const release = "a".repeat(40);
  const result = resolveStableBaseline({
    health: response(200, "application/json", {
      schemaVersion: 1,
      status: "ready",
      release,
      environment: "staging",
    }),
    manifest: response(200, "application/json", {
      schemaVersion: 1,
      release,
      files: [{ path: "index.html", bytes: 1, sha256: "b".repeat(64) }],
    }),
    root: response(200, "text/html", "<html>stable</html>"),
  });
  assert.deepEqual(result, { stableRelease: release, stableContractMode: "release-contracts-v1" });
});

test("G11 fails closed when only one stable release contract is valid", () => {
  const release = "a".repeat(40);
  assert.throws(
    () =>
      resolveStableBaseline({
        health: response(200, "application/json", {
          schemaVersion: 1,
          status: "ready",
          release,
          environment: "staging",
        }),
        manifest: response(200, "text/html", "partial"),
        root: response(200, "text/html", "<html>stable</html>"),
      }),
    /stable_release_contract_partial/,
  );
});

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
  assert.match(rls, /select plan\(52\)/);
});

test("F-017 exposes delivery state and a controlled, durable replay path", async () => {
  const [sql, scopedSql, edge, page, worker] = await Promise.all([
    read("supabase/migrations/0050_ev2_system_assurance.sql"),
    read("supabase/migrations/0072_cms_forms_leads_authoritative_scope.sql"),
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
  assert.match(edge, /cms_retry_lead_delivery_limited/);
  assert.match(edge, /rateLimitKeyHash/);
  assert.match(edge, /Server-Timing.*command/);
  assert.match(edge, /cms_leads_list_scoped/);
  assert.match(scopedSql, /from public\.cms_lead_outbox outbox where outbox\.lead_id = lead\.id/);
  assert.match(page, /action: "list_leads"/);
  assert.match(page, /cms_lead_outbox/);
  assert.match(page, /Tentar envio novamente/);
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
  assert.match(edge, /Server-Timing.*admin-read/);
  assert.match(edge, /identity\.claims\.aal !== "aal2"/);
  assert.match(edge, /cms_system_capability_limited/);
  assert.match(edge, /cms_get_system_snapshot_limited/);
  assert.match(edge, /cms_execute_system_command_limited/);
  assert.match(edge, /rateLimitKeyHash/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
  assert.match(contract, /gateDecision: z\.literal\("non_authoritative"\)/);
  assert.match(page, /isEv2FeatureEnabled\(profile, "ev2\.system_assurance"\)/);
  assert.match(page, /não libera uma publicação por conta própria/);
  assert.match(page, /Processamentos verificados/);
  assert.match(api, /systemAssuranceCommand/);
});

test("G11 projection reconciliation respects managed-content retirement", async () => {
  const [sql, rls] = await Promise.all([
    read("supabase/migrations/0051_ev2_system_assurance_projection_reconciliation.sql"),
    read("supabase/tests/rls_ev2_phase11_system.test.sql"),
  ]);
  assert.match(sql, /create or replace function public\.cms_get_system_snapshot/);
  assert.match(sql, /item\.workflow_status in \('archived', 'trashed'\)/);
  assert.match(
    sql,
    /item\.content_type in \('page', 'homepage', 'navigation', 'site_settings', 'placement'\)/,
  );
  assert.match(sql, /join public\.cms_content_items item on item\.id = publication\.item_id/);
  assert.match(sql, /join public\.cms_content_items item on item\.id = projection\.item_id/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from|default_enabled\s*=\s*true/i);
  assert.match(rls, /retired managed content preserves publication history/);
  assert.match(rls, /active publication without its public projection remains a real divergence/);
});

test("G11 fuses rate limiting with guarded operations without broadening access", async () => {
  const [sql, shared, system, leads] = await Promise.all([
    read("supabase/migrations/0052_ev2_system_assurance_rate_limit_fusion.sql"),
    read("supabase/functions/_shared/security.ts"),
    read("supabase/functions/cms-system/index.ts"),
    read("supabase/functions/cms-leads/index.ts"),
  ]);
  for (const procedure of [
    "cms_system_capability_limited",
    "cms_get_system_snapshot_limited",
    "cms_retry_lead_delivery_limited",
    "cms_execute_system_command_limited",
  ]) {
    assert.match(sql, new RegExp(`create function public\\.${procedure}`));
    assert.match(sql, new RegExp(`revoke all on function public\\.${procedure}`));
    assert.match(sql, new RegExp(`grant execute on function public\\.${procedure}`));
  }
  assert.match(sql, /CMS_RATE_LIMIT_EXCEEDED/);
  assert.match(sql, /errcode = 'PT429'/);
  assert.match(sql, /to service_role/);
  assert.doesNotMatch(sql, /drop table|truncate|delete from|default_enabled\s*=\s*true/i);
  assert.match(shared, /export async function rateLimitKeyHash/);
  assert.match(system, /p_rate_limit_key_hash: rateLimitHash/);
  assert.match(leads, /p_rate_limit_key_hash:fusedRateLimitHash/);
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
  assert.equal(
    serverTimingDuration(new Headers({ "Server-Timing": "db;dur=4, admin-read;dur=123.5" }), "admin-read"),
    123.5,
  );
  assert.equal(Number.isNaN(serverTimingDuration(new Headers(), "command")), true);
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

test("G11 executable controls remain reproducible and fail-closed", async () => {
  const [rehearsal, reconciliation, rateLimit, canary, workflow] = await Promise.all([
    read("scripts/ev2/phase11/validate-migration.mjs"),
    read("scripts/ev2/phase11/validate-projection-reconciliation.mjs"),
    read("scripts/ev2/phase11/validate-rate-limit-fusion.mjs"),
    read("scripts/ev2/phase11/staging-canary.mjs"),
    read(".github/workflows/preview-ev2-phase11.yml"),
  ]);
  assert.match(rehearsal, /G11_MIGRATION_REHEARSAL_PASS/);
  assert.match(rehearsal, /ALVO RECUSADO/);
  assert.match(rehearsal, /rollback;/i);
  assert.match(reconciliation, /G11_PROJECTION_RECONCILIATION_REHEARSAL_PASS/);
  assert.match(reconciliation, /snapshotHash/);
  assert.match(reconciliation, /rollback;/i);
  assert.match(rateLimit, /G11_RATE_LIMIT_FUSION_REHEARSAL_PASS/);
  assert.match(rateLimit, /rateLimitFailClosed: true/);
  assert.match(rateLimit, /rollback;/i);
  assert.match(canary, /EV2_G11_EXPECTED_SHA/);
  assert.match(canary, /exact_candidate_sha/);
  assert.match(canary, /lead_preserved_after_delivery_failure/);
  assert.match(canary, /backend_server_timing_available/);
  assert.match(canary, /for \(let warmup = 0; warmup < 5; warmup \+= 1\)/);
  assert.match(canary, /adminReadWallP95Ms/);
  assert.match(canary, /commandWallP95Ms/);
  assert.match(canary, /async function rpc[\s\S]*?allowed: \[200, 204\]/);
  assert.match(canary, /independent_review_required/);
  assert.match(canary, /synthetic_active_residue_zero/);
  assert.match(canary, /retainedSyntheticActors/);
  assert.match(canary, /ban_duration: "876000h"/);
  assert.match(canary, /activeCredentials/);
  assert.match(workflow, /ev2-g11-canary/);
  assert.match(workflow, /VITE_EV2_SYSTEM_ASSURANCE_CANDIDATE/);
});

test("the G11 synthetic lead uses an origin the schema actually accepts", async () => {
  const canary = await readFile("scripts/ev2/phase11/staging-canary.mjs", "utf8");
  const binding = await readFile("supabase/migrations/0084_cms_lead_origin_form_binding.sql", "utf8");

  // 0084 accepts an origin for a corporate published form only from a campaign, a product, or the
  // closed vocabulary of site sources. A synthetic name was refused with
  // CMS_LEAD_ORIGIN_SCOPE_FORBIDDEN before any assurance check could run.
  assert.match(binding, /v_source in \('site', 'contact', 'newsletter', 'website'\)/);
  const accepted = ["site", "contact", "newsletter", "website"];
  const source = /origin_source: "([^"]+)"/.exec(canary)?.[1];
  assert.ok(accepted.includes(source), `origin_source ${source} is not accepted by 0084`);

  // And the path stays outside the space the same guard reserves for QA fixtures on this form.
  const path = /origin_path: "([^"]+)"/.exec(canary)?.[1];
  assert.ok(path && !path.startsWith("/qa-cms-final/"), `origin_path ${path} is reserved for fixtures`);

  // The synthetic nature is still explicit where it belongs.
  assert.match(canary, /reference_code: "LD-G11-/);
  assert.match(canary, /synthetic: true/);
});

test("the G11 synthetic lead is visible to the actor that has to close it", async () => {
  const canary = await readFile("scripts/ev2/phase11/staging-canary.mjs", "utf8");
  const scope = await readFile("supabase/migrations/0072_cms_forms_leads_authoritative_scope.sql", "utf8");

  // A caller holding a QA lease only sees leads bound to an actor of the same run. Without the bind,
  // the operator that had just created the fixture could not find it: retrying the delivery answered
  // CMS_LEAD_DELIVERY_NOT_FOUND and anonymising answered CMS_LEAD_NOT_FOUND, both as 404.
  assert.match(scope, /owner\.actor_id = lead\.qa_actor_id/);
  assert.match(scope, /owner\.run_tag = caller\.run_tag/);

  const insert = canary.slice(canary.indexOf("async function createSyntheticLead"));
  assert.match(insert.slice(0, 2400), /qa_actor_id: operator\.id/);

  // The bind is also what keeps the fixture visible inside its own run instead of widening it.
  assert.match(canary, /operator = await createActor\(/);
});
