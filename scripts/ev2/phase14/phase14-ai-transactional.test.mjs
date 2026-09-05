import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), "utf8");

test("migration 0054 keeps F-016 additive, synthetic and inaccessible to clients", () => {
  const sql = read("supabase/migrations/0054_ev2_ai_transactional.sql");
  for (const table of [
    "cms_ai_execution_tools",
    "cms_ai_synthetic_targets",
    "cms_ai_execution_plans",
    "cms_ai_execution_approvals",
    "cms_ai_execution_runs",
    "cms_ai_execution_run_steps",
    "cms_ai_execution_policy_decisions",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /default_enabled is false/);
  assert.match(sql, /data_class text not null default 'synthetic' check \(data_class = 'synthetic'\)/);
  assert.match(sql, /target_ref ~ '\^g14x-/);
  assert.match(sql, /expires_at <= created_at \+ interval '10 minutes'/);
  assert.match(sql, /CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED/);
  assert.match(sql, /CMS_AI_EXECUTE_OPERATOR_SEPARATION_REQUIRED/);
  assert.match(sql, /CMS_AI_EXECUTE_PLAN_CONFLICT/);
  assert.match(sql, /CMS_AI_EXECUTE_COMPENSATION_CONFLICT/);
  assert.match(sql, /CMS_AI_EXECUTE_APPROVAL_CONFLICT/);
  assert.match(sql, /broad_activation_not_supported/);
  assert.match(sql, /create unique index cms_ai_execution_approvals_one_active_idx/);
  assert.match(sql, /on conflict \(target_ref\) do nothing/);
  assert.doesNotMatch(sql, /unique \(plan_id, plan_hash, purpose\)/);
  assert.match(
    sql,
    /approve_compensation' then[\s\S]*for update of p;[\s\S]*from public\.cms_ai_execution_runs[\s\S]*for update;/,
  );
  assert.match(
    sql,
    /compensate_run' then[\s\S]*for update of p;[\s\S]*from public\.cms_ai_execution_runs[\s\S]*for update;/,
  );
  assert.match(sql, /\('commercial', 'cms:ai\.read'\)/);
  assert.match(sql, /\('technical', 'cms:ai\.read'\)/);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all).*to authenticated/i);
  assert.doesNotMatch(sql, /environment in \([^)]*'production'/);
});

test("edge gateway rejects production, external providers and unsafe input", () => {
  const edge = read("supabase/functions/cms-ai-execute/index.ts");
  assert.match(edge, /const EXTERNAL_PROVIDER_ENABLED = false/);
  assert.match(edge, /CMS_AI_EXECUTE_PRODUCTION_GATED/);
  assert.match(edge, /CMS_AI_EXECUTE_EXTERNAL_PROVIDER_DENIED/);
  assert.match(edge, /detectAiPromptInjection/);
  assert.match(edge, /redactAiText/);
  assert.match(edge, /identity\.claims\.aal !== "aal2"/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.match(edge, /cms_execute_ai_transaction_command/);
  assert.match(edge, /g14-policy-denial-/);
  assert.match(edge, /database_policy_denial/);
  assert.doesNotMatch(edge, /fetch\([^)]*https?:\/\//);
  assert.ok(
    edge.indexOf('mutation && identity.claims.aal !== "aal2"') < edge.indexOf("capability?.enabled !== true"),
    "MFA denial must precede the generic feature-disabled response for mutations",
  );
});

test("frontend requires both runtime capabilities and exposes no real target input", () => {
  const page = read("src/admin/pages/AdminAiExecutionPage.tsx");
  const runtime = read("src/admin/ev2-runtime.ts");
  assert.match(page, /isEv2FeatureEnabled\(profile, "ev2\.ai_assist"\)/);
  assert.match(page, /isEv2FeatureEnabled\(profile, "ev2\.ai_execute"\)/);
  assert.match(page, /Somente <strong>alvos sintéticos g14x-\*<\/strong>/);
  assert.match(page, /expectedPlanHash: plan\.planHash/);
  assert.match(page, /Aprovar por 10 minutos/);
  assert.match(page, /Executar compensação/);
  assert.match(runtime, /environment === "production"/);
  assert.doesNotMatch(page, /contentId|itemId|domain|production target/i);
});

test("the immutable contract fixes closed tools and non-production policy", () => {
  const contract = read("src/shared/contracts/ev2-ai-execute.ts");
  assert.match(contract, /Ev2AiExecutionToolKeySchema = z\.enum/);
  assert.match(contract, /z\.literal\("synthetic"\)/);
  assert.match(contract, /productionAllowed: z\.literal\(false\)/);
  assert.match(contract, /reviewerSeparationRequired: z\.literal\(true\)/);
  assert.match(contract, /compensationRequired: z\.literal\(true\)/);
  assert.match(contract, /planHash: z\.string\(\)\.regex\(\/\^\[0-9a-f\]\{64\}\$\//);
});

test("rehearsal and canary executors are locked to the isolated staging target", () => {
  const rehearsal = read("scripts/ev2/phase14/validate-migration.mjs");
  const canary = read("scripts/ev2/phase14/staging-canary.mjs");
  const workflow = read(".github/workflows/preview-ev2-phase14.yml");
  const genericPreview = read(".github/workflows/preview.yml");

  assert.match(rehearsal, /EV2_G14_REHEARSAL_AUTHORIZED/);
  assert.match(rehearsal, /STAGING-0054-SYNTHETIC/);
  assert.match(rehearsal, /begin;[\s\S]*rollback;/);
  assert.match(rehearsal, /EV2_G14_COMPENSATION_RENEWAL_FAILED/);
  assert.match(canary, /EV2_G14_CANARY_AUTHORIZED/);
  assert.match(canary, /STAGING-G14-SYNTHETIC/);
  assert.match(canary, /ev2-g14-canary\.gaiatec-cms-staging\.pages\.dev/);
  assert.match(canary, /concurrent_execution_single_winner/);
  assert.match(canary, /concurrent_target_creation_single_winner/);
  assert.match(canary, /expired_compensation_approval_renewed/);
  assert.match(canary, /concurrent_recovery_has_no_deadlock/);
  assert.match(canary, /no_broad_activation_present/);
  assert.match(canary, /synthetic_residue_zero/);
  assert.match(canary, /productionMutations: 0/);
  assert.doesNotMatch(canary, /scope_type:\s*"environment"/);
  assert.match(workflow, /PREVIEW-G14-STAGING/);
  assert.match(workflow, /--branch ev2-g14-canary/);
  assert.doesNotMatch(workflow, /gaiatec-website|--branch main|deploy:production/);
  assert.match(genericPreview, /head\.ref != 'ev2\/fase-14-ia-transacional-controlada'/);
});

test("pgTAP plan count matches its explicit assertions", () => {
  const sql = read("supabase/tests/rls_ev2_phase14_ai_transactional.test.sql");
  const declared = Number(sql.match(/select plan\((\d+)\)/)?.[1]);
  const assertions = sql.match(/^select\s+(?:is|isnt|matches|throws_ok|lives_ok)\s*\(/gm) ?? [];
  assert.equal(assertions.length, declared);
  assert.match(sql, /identical replay returns the original run/);
  assert.match(sql, /expired compensation approval can be renewed/);
});
