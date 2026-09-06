import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

const protectedFunctions = [
  "cms-drafts-v2",
  "cms-master-data",
  "cms-pim",
  "cms-attributes",
  "cms-media",
  "cms-search-admin",
  "cms-quality",
  "cms-collaboration",
  "cms-bulk",
  "cms-releases",
  "cms-scopes",
  "cms-visual",
  "cms-sites",
  "cms-system",
  "cms-ai",
  "cms-ai-execute",
];

test("production runtime is individual, MFA-bound and controlled by the deployment switch", async () => {
  const [runtime, session, migration] = await Promise.all([
    read("src/admin/ev2-runtime.ts"),
    read("supabase/functions/cms-session/index.ts"),
    read("supabase/migrations/0055_ev2_operational_cms_production.sql"),
  ]);
  assert.doesNotMatch(runtime, /environment === "production"\s*\|\|/);
  assert.match(runtime, /capability\.source === "override"/);
  assert.match(session, /CMS_EV2_PRODUCTION_ENABLED/);
  assert.match(migration, /p_environment = 'production' and p_aal <> 'aal2'/);
  assert.match(migration, /v_individual_override_count <> 1/);
  assert.match(migration, /v_broad_override_count <> 0/);
  assert.match(migration, /interval '365 days'/);
  assert.doesNotMatch(migration, /default_enabled\s*=\s*true/i);
  assert.doesNotMatch(migration, /insert into public\.cms_feature_flag_overrides/i);
});

test("every EV2 mutation endpoint keeps the production switch fail-closed", async () => {
  for (const name of protectedFunctions) {
    const source = await read(`supabase/functions/${name}/index.ts`);
    assert.match(source, /isProductionOperationEnabled/, `${name} has no production switch`);
    assert.match(source, /environment === "production"/, `${name} has no explicit production branch`);
  }
});

test("OpenRouter adapter is locked to Nemotron free with no paid fallback", async () => {
  const [adapter, edge, contract, page] = await Promise.all([
    read("supabase/functions/_shared/openrouter.ts"),
    read("supabase/functions/cms-ai/index.ts"),
    read("src/shared/contracts/ev2-ai.ts"),
    read("src/admin/pages/AdminAiAssistantPage.tsx"),
  ]);
  assert.match(adapter, /nvidia\/nemotron-3\.5-lightning:free/);
  assert.match(adapter, /OPENROUTER_MODEL/);
  assert.match(adapter, /AbortController/);
  assert.doesNotMatch(adapter, /response_format/);
  assert.match(adapter, /reasoning: \{ effort: "none", exclude: true \}/);
  assert.doesNotMatch(adapter, /fallback|models:/i);
  assert.doesNotMatch(adapter, /console\.(?:log|debug|info)/);
  assert.match(edge, /CMS_AI_PROVIDER_UNAVAILABLE/);
  assert.match(edge, /OPENROUTER_REQUEST_FAILED/);
  assert.match(edge, /cms_ai_provider_calls/);
  assert.match(contract, /"synthetic", "openrouter"/);
  assert.match(page, /NVIDIA NEMOTRON/);
  assert.match(page, /não é aplicado nem publicado automaticamente/);
});

test("provider audit stores metadata only and is not exposed to authenticated clients", async () => {
  const migration = await read("supabase/migrations/0055_ev2_operational_cms_production.sql");
  assert.match(migration, /create table public\.cms_ai_provider_calls/);
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.cms_ai_provider_calls from public, anon, authenticated/,
  );
  assert.doesNotMatch(migration, /prompt|excerpt|response_body|api_key/i);
});

test("synthetic identities detach without weakening immutable audit records", async () => {
  const migration = await read("supabase/migrations/0056_cms_audit_identity_detach.sql");
  assert.match(migration, /tg_op = 'UPDATE'/);
  assert.match(migration, /v_new -> v_identity_column = 'null'::jsonb/);
  assert.match(migration, /\(v_old - v_identity_column\) = \(v_new - v_identity_column\)/);
  assert.match(migration, /cms_login_events_immutable/);
  assert.match(migration, /cms_audit_log_immutable/);
  assert.match(migration, /cms_policy_decisions_immutable/);
  assert.match(migration, /raise exception 'CMS audit records are immutable'/);
});

test("historical database assertions follow the production-ready default-off contract", async () => {
  const [runtime, release, drafts] = await Promise.all([
    read("supabase/tests/rls_ev2_phase13_runtime.test.sql"),
    read("supabase/tests/rls_ev2_phase1_foundation.test.sql"),
    read("supabase/tests/rls_ev2_phase2_progressive_drafts.test.sql"),
  ]);
  assert.match(runtime, /production runtime is evaluable while every capability remains default-off/);
  assert.match(release, /CMS_RELEASE_FEATURE_DISABLED/);
  assert.match(drafts, /CMS_DRAFT_V2_FEATURE_DISABLED/);
});
