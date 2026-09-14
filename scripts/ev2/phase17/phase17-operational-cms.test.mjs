import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

const protectedFunctions = [
  "cms-drafts-v2",
  "cms-master-data",
  "cms-pim",
  "cms-attributes",
  "cms-documents",
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

test("OpenRouter adapter is locked to the privacy-safe Ling free endpoint", async () => {
  const [adapter, edge, contract, page] = await Promise.all([
    read("supabase/functions/_shared/openrouter.ts"),
    read("supabase/functions/cms-ai/index.ts"),
    read("src/shared/contracts/ev2-ai.ts"),
    read("src/admin/pages/AdminAiAssistantPage.tsx"),
  ]);
  assert.match(adapter, /inclusionai\/ling-3\.0-flash-vl:free/);
  assert.match(adapter, /OPENROUTER_MODEL/);
  assert.match(adapter, /AbortController/);
  assert.doesNotMatch(adapter, /response_format/);
  assert.match(adapter, /reasoning: \{ effort: "none", exclude: true \}/);
  assert.match(adapter, /provider: \{ data_collection: "deny", zdr: true \}/);
  assert.match(adapter, /OPENROUTER_NO_ALLOWED_PROVIDER/);
  assert.doesNotMatch(adapter, /fallback|models:/i);
  assert.doesNotMatch(adapter, /console\.(?:log|debug|info)/);
  assert.match(edge, /CMS_AI_PROVIDER_UNAVAILABLE/);
  assert.match(edge, /OPENROUTER_REQUEST_FAILED/);
  assert.match(edge, /cms_record_ai_provider_call_scoped/);
  assert.match(edge, /recordProviderCall\([\s\S]*?"failed"/);
  assert.match(edge, /CMS_AI_PROVIDER_AUDIT_UNAVAILABLE/);
  assert.match(contract, /Ev2AiProviderModeSchema = z\.literal\("openrouter"\)/);
  assert.match(page, /Sem cobrança · nenhuma troca automática de serviço/);
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

test("production database verification tracks the exact repository migration inventory", async () => {
  const [verifier, manifest] = await Promise.all([
    read("scripts/ev2/phase12/verify-production-database.mjs"),
    read("scripts/ev2/phase12/migration-manifest-lib.mjs"),
  ]);
  const versions = (await readdir("supabase/migrations"))
    .map((name) => name.match(/^(\d+)_.*\.sql$/)?.[1])
    .filter(Boolean)
    .sort();
  assert.ok(versions.length > 0);
  assert.equal(new Set(versions).size, versions.length);
  assert.equal(versions.at(-1), String(versions.length).padStart(4, "0"));
  assert.match(verifier, /sourceMigrationManifest\(sourceRoot\)/);
  assert.match(verifier, /exactMigrationHistorySql\(migrations\)/);
  assert.match(verifier, /"migration_history_exact"/);
  assert.match(manifest, /array_agg\(version order by version\)/);
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

test("production workflow enables the controlled EV2 and approved free provider switches", async () => {
  const [workflow, configurator, secretLibrary] = await Promise.all([
    read(".github/workflows/deploy-production.yml"),
    read("scripts/ev2/phase12/configure-production-function-secrets.mjs"),
    read("scripts/ev2/phase12/production-function-secrets-lib.mjs"),
  ]);
  assert.match(workflow, /CMS_EV2_PRODUCTION_ENABLED: "true"/);
  assert.match(workflow, /CMS_AI_EXTERNAL_PROVIDER_ENABLED: "true"/);
  assert.match(workflow, /OPENROUTER_API_KEY: \$\{\{ secrets\.OPENROUTER_API_KEY \}\}/);
  assert.match(workflow, /OPENROUTER_MODEL: \$\{\{ vars\.OPENROUTER_MODEL \}\}/);
  assert.match(workflow, /configure-production-function-secrets\.mjs/);
  assert.match(configurator, /writeFile\(envFile, serializeProductionFunctionSecrets\(secrets\)/);
  assert.match(configurator, /"secrets",\s*"set",[\s\S]*"--env-file",\s*envFile/);
  assert.match(secretLibrary, /clean\(env\.CMS_EV2_PRODUCTION_ENABLED\) !== "true"/);
  assert.match(secretLibrary, /clean\(env\.CMS_AI_EXTERNAL_PROVIDER_ENABLED\) !== "true"/);
  assert.match(secretLibrary, /CMS_EV2_PRODUCTION_ENABLED: clean\(env\.CMS_EV2_PRODUCTION_ENABLED\)/);
  assert.match(
    secretLibrary,
    /CMS_AI_EXTERNAL_PROVIDER_ENABLED: clean\(env\.CMS_AI_EXTERNAL_PROVIDER_ENABLED\)/,
  );
});

test("staging operational canary invokes the pinned Supabase CLI on Windows and Linux", async () => {
  const canary = await read("scripts/ev2/phase17/staging-canary.mjs");
  assert.match(canary, /process\.platform === "win32"/);
  assert.match(canary, /: binary/);
  assert.match(canary, /: pinned/);
  assert.match(canary, /result\.error \|\| result\.status !== 0/);
  assert.match(canary, /capability\.json\.providerModel === EXPECTED_MODEL/);
  assert.match(canary, /capability\.json\.allowedModel === EXPECTED_MODEL/);
  assert.match(canary, /generated\.json\.providerModel === EXPECTED_MODEL/);
  assert.match(canary, /workspace\.json\.policy\?\.providerModel === EXPECTED_MODEL/);
  assert.match(canary, /sessionItem\?\.providerModel === EXPECTED_MODEL/);
  assert.match(canary, /ownerSession\?\.owned === true && ownerSession\.reviewable === false/);
  assert.match(
    canary,
    /sessionItem\?\.providerMode === "openrouter"\s*&&\s*sessionItem\.owned === false\s*&&\s*sessionItem\.reviewable === true/,
  );
  assert.match(canary, /const decision = await edge\(\s*reviewer,/);
  assert.match(canary, /syntheticUsers: 2/);
  assert.match(canary, /result\.status === "cleaned"\) \? "cleaned" : "invalid"/);
  assert.match(canary, /zzzz_cms_ai_terminal_cleanup/);
  assert.match(canary, /G17_AI_TERMINAL_BUSINESS_RESIDUE/);
  assert.match(canary, /retainedProviderEvidence/);
  assert.match(canary, /retainedEventEvidence/);
  assert.match(canary, /G17_AI_PROVIDER_EVIDENCE_MISSING/);
  assert.match(canary, /G17_AI_TERMINAL_AUDIT_MISSING/);
  assert.match(canary, /G17_LEASE_CLEANUP_AUDIT_MISSING/);
  assert.match(
    canary,
    /rest\("cms_ai_command_receipts", \{\s*method: "DELETE",\s*query: `actor_id=eq\.\$\{actorId\}`/,
  );
  assert.doesNotMatch(
    canary,
    /rest\("cms_ai_(?:provider_calls|events|sessions|sources|messages|proposals|approvals|tool_calls|eval_runs)"[\s\S]{0,160}method: "DELETE"/,
  );
  assert.match(canary, /new AggregateError\(\s*\[operationError, cleanupError\]/);
  assert.match(canary, /G17_CANARY_OPERATION_AND_CLEANUP_FAILED/);
  assert.match(canary, /proposal\?\.sourceIds\.includes\(generated\.json\.sourceId\)/);
  assert.match(canary, /field\.excerpt === sourceExcerpt/);
  assert.match(canary, /groundedText\.includes\("press"\)/);
});

test("staging operational commands bind idempotency to the exact envelope", async () => {
  const canary = await read("scripts/ev2/phase17/staging-canary.mjs");
  assert.match(
    canary,
    /const commandEnvelope = envelope\(environment\);[\s\S]*"X-Idempotency-Key": commandEnvelope\.commandId[\s\S]*envelope: commandEnvelope/,
  );
  assert.doesNotMatch(canary, /idempotent \? \{ "X-Idempotency-Key": randomUUID\(\) \}/);
});
