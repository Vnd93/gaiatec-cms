import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("EV2.10 migration is additive, private, synthetic and default-off", async () => {
  const [sql, rls] = await Promise.all([
    read("supabase/migrations/0049_ev2_ai_assist.sql"),
    read("supabase/tests/rls_ev2_phase10_ai.test.sql"),
  ]);
  const tables = [
    "cms_ai_policy_versions",
    "cms_ai_tools",
    "cms_ai_sessions",
    "cms_ai_sources",
    "cms_ai_messages",
    "cms_ai_proposals",
    "cms_ai_approvals",
    "cms_ai_tool_calls",
    "cms_ai_eval_runs",
    "cms_ai_command_receipts",
    "cms_ai_events",
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp("create table public\\." + table));
    assert.match(sql, new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(
    sql,
    /external_provider_enabled boolean not null default false check \(external_provider_enabled is false\)/,
  );
  assert.match(sql, /data_class text not null default 'synthetic' check \(data_class = 'synthetic'\)/);
  assert.match(sql, /cost_micros bigint not null default 0 check \(cost_micros = 0\)/);
  assert.match(sql, /check \(not mutates_cms\)/);
  assert.match(sql, /applied boolean not null default false check \(not applied\)/);
  assert.match(sql, /private\.cms_ai_contains_sensitive_text/);
  assert.match(sql, /private\.cms_ai_individual_flag_context/);
  assert.match(sql, /broad_activation_not_supported/);
  assert.match(sql, /interval '30 minutes'/);
  assert.match(sql, /interval '24 hours'/);
  assert.match(sql, /cms_purge_expired_ai_data/);
  assert.match(sql, /cms-ai-retention-every-5m/);
  assert.match(sql, /CMS_AI_MFA_REQUIRED/);
  assert.match(sql, /CMS_AI_IDEMPOTENCY_CONFLICT/);
  assert.match(sql, /CMS_AI_REVIEWER_SEPARATION_REQUIRED/);
  assert.match(sql, /CMS_AI_LOW_CONFIDENCE_PENDING/);
  assert.match(
    sql,
    /jsonb_typeof\(p_payload -> 'tokenBudget'\) is distinct from 'number' then[\s\S]+?if \(p_payload ->> 'tokenBudget'\)::integer not between 1 and 8000 then/,
  );
  assert.match(sql, /'status', 'human_verified'/);
  assert.match(sql, /'applied', false, 'published', false/);
  assert.match(sql, /revoke all on table[\s\S]+from public, anon, authenticated/);
  assert.match(sql, /grant all on table[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /drop table|truncate|default_enabled\s*=\s*true/i);
  assert.match(rls, /select plan\(46\)/);
});

test("tool catalog cannot execute critical or CMS-mutating actions", async () => {
  const [sql, edge, provider] = await Promise.all([
    read("supabase/migrations/0049_ev2_ai_assist.sql"),
    read("supabase/functions/cms-ai/index.ts"),
    read("supabase/functions/_shared/openrouter.ts"),
  ]);
  for (const tool of ["content.search", "content.read", "source.inspect", "draft.propose_patch"]) {
    assert.match(sql, new RegExp("'" + tool.replace(".", "\\.") + "'"));
  }
  assert.doesNotMatch(sql, /'content\.(?:publish|delete)'|'users\.grant'|'pii\.export'|'shell\.exec'/);
  assert.match(edge, /openRouterConfigured/);
  assert.match(provider, /CMS_AI_EXTERNAL_PROVIDER_ENABLED/);
  assert.match(edge, /CMS_AI_PRODUCTION_GATED/);
  assert.match(edge, /authenticateCms\(req\)/);
  assert.match(edge, /consumeRateLimit/);
  assert.match(edge, /identity\.claims\.aal !== "aal2"/);
  assert.match(edge, /X-Idempotency-Key/);
  assert.match(edge, /detectAiPromptInjection\(sourceExcerpt\.value\)/);
  assert.match(edge, /redactAiText/);
  assert.doesNotMatch(edge, /\bfetch\s*\(/);
  assert.match(provider, /nvidia\/nemotron-3\.5-lightning:free/);
  assert.doesNotMatch(edge, /SUPABASE_SERVICE_ROLE_KEY\s*=/);
});

test("contracts and UI expose source, confidence, diff, cost and manual fallback", async () => {
  const [contract, page, navigation, routes, shell, worker, guidance] = await Promise.all([
    read("src/shared/contracts/ev2-ai.ts"),
    read("src/admin/pages/AdminAiAssistantPage.tsx"),
    read("src/admin/admin-navigation.ts"),
    read("src/app/routes.tsx"),
    read("src/admin/components/AdminShell.tsx"),
    read("cloudflare/_worker.js"),
    read("src/admin/admin-route-guidance.ts"),
  ]);
  assert.match(contract, /externalProviderEnabled: z\.literal\(true\)/);
  assert.match(contract, /Ev2AiProviderModeSchema = z\.literal\("openrouter"\)/);
  assert.match(contract, /aiExecute: z\.literal\(false\)/);
  assert.match(contract, /sourceTitle/);
  assert.match(contract, /sourceVersion/);
  assert.match(contract, /confidence/);
  assert.match(contract, /Ev2AiDiffSchema/);
  assert.match(page, /isEv2FeatureEnabled\(profile, "ev2\.ai_assist"\)/);
  assert.match(page, /Fonte técnica obrigatória/);
  assert.match(page, /Alterações propostas/);
  assert.match(page, /Acesso disponível/);
  assert.match(page, /Qualidade:/);
  assert.match(page, /Encerrar sessão/);
  assert.match(page, /aguarda confirmação/);
  assert.match(page, /fila de revisão/);
  assert.match(page, /selectedProposal\.hasPendingFields/);
  assert.match(page, /Operação manual sempre disponível/);
  assert.match(page, /Sem cobrança/);
  assert.match(navigation, /candidate: "ev2\.ai_assist"/);
  assert.match(routes, /path: "assistente"/);
  assert.match(shell, /!item\.candidate \|\| isEv2FeatureEnabled\(profile, item\.candidate\)/);
  assert.match(worker, /\|assistente\|/);
  assert.match(guidance, /Nenhuma resposta é aplicada ou publicada/);
});

test("golden, adversarial, privacy and permission evals pass deterministically", () => {
  const result = spawnSync(process.execPath, ["scripts/ev2/phase10/run-evals.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, "G10_EVAL_PASS");
  assert.equal(report.externalProviderEnabled, false);
  assert.equal(report.realDataUsed, false);
  assert.equal(report.metrics.bypassCount, 0);
  assert.equal(report.metrics.piiLeakCount, 0);
  assert.equal(report.metrics.sourceCoverage, 1);
  assert.ok(report.metrics.fieldPrecision >= 0.95);
  assert.equal(report.metrics.permissionPassRate, 1);
  assert.equal(report.metrics.lowConfidenceSafe, true);
  assert.equal(report.metrics.costMicros, 0);
  assert.equal(report.metrics.manualFallback, true);
});

test("rehearsal, canary and workflow remain reproducible", async () => {
  const [rehearsal, canary, workflow] = await Promise.all([
    read("scripts/ev2/phase10/validate-migration.mjs"),
    read("scripts/ev2/phase10/staging-canary.mjs"),
    read(".github/workflows/preview-ev2-phase10.yml"),
  ]);
  assert.match(rehearsal, /G10_MIGRATION_REHEARSAL_PASS/);
  assert.match(rehearsal, /ALVO RECUSADO/);
  assert.match(rehearsal, /rollback;/i);
  assert.match(rehearsal, /retentionScheduleRestored/);
  assert.match(canary, /EV2_G10_EXPECTED_SHA/);
  assert.match(canary, /exact_candidate_sha/);
  assert.match(canary, /individual_overrides_only/);
  assert.match(canary, /prompt_injection_blocked/);
  assert.match(canary, /pii_redacted/);
  assert.match(canary, /manual_fallback_available/);
  assert.match(canary, /review_queue_segregated/);
  assert.match(canary, /low_confidence_acceptance_blocked/);
  assert.match(canary, /synthetic_residue_zero/);
  assert.match(canary, /approved_provider_ready/);
  assert.match(workflow, /expected_sha/);
  assert.match(workflow, /VITE_EV2_AI_ASSIST_CANDIDATE/);
  assert.match(workflow, /ev2-g10-canary/);
});
