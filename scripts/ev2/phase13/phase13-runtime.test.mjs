import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const read = (file) => readFile(file, "utf8");

async function sourceFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const target = path.join(root, entry.name);
      return entry.isDirectory() ? sourceFiles(target) : [target];
    }),
  );
  return nested.flat().filter((file) => /\.(?:ts|tsx)$/.test(file));
}

test("EV2.13 historical manifest remains immutable and is superseded safely", async () => {
  const [migration, rls] = await Promise.all([
    read("supabase/migrations/0053_ev2_runtime_eligibility.sql"),
    read("supabase/tests/rls_ev2_phase13_runtime.test.sql"),
  ]);
  assert.match(migration, /create function public\.cms_runtime_capability_manifest/);
  assert.match(migration, /scope_type = 'user'/);
  assert.match(migration, /expires_at - override\.starts_at <= interval '30 minutes'/);
  assert.match(migration, /scope_type in \('site', 'environment', 'global'\)/);
  assert.match(migration, /v_individual_override_count <> 1/);
  assert.match(migration, /v_broad_override_count <> 0/);
  assert.match(migration, /p_environment in \('local', 'staging'\)/);
  assert.match(migration, /when p_environment = 'production' then 'gated'/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /drop table|truncate|delete from|default_enabled\s*=\s*true/i);
  assert.match(rls, /select plan\(16\)/);
  assert.match(rls, /rejects duplicate overrides/);
  assert.match(rls, /parallel broad override invalidates/);
  assert.match(rls, /longer than 30 minutes is ineligible/);
  assert.match(rls, /environment-wide override cannot activate/);
  assert.match(rls, /production manifest without an individual override cannot enable/);
});

test("cms-session refreshes one validated aggregate and loses EV2 access on transient failure", async () => {
  const [session, runtime, contract, auth] = await Promise.all([
    read("supabase/functions/cms-session/index.ts"),
    read("src/admin/ev2-runtime.ts"),
    read("src/shared/contracts/ev2-foundation.ts"),
    read("src/admin/auth/AdminAuthContext.tsx"),
  ]);
  assert.match(session, /cms_runtime_capability_manifest/);
  assert.match(session, /validManifest\(manifest, configuredEnvironment\)/);
  assert.match(session, /unavailableManifest/);
  assert.match(session, /manifest\.status !== "ready"/);
  assert.match(session, /capabilityKeys\.length !== EV2_FEATURE_KEYS\.length/);
  assert.match(runtime, /MAX_MANIFEST_AGE_MS = 60_000/);
  assert.match(auth, /setInterval\(refreshCapabilities, 30_000\)/);
  assert.doesNotMatch(runtime, /environment === "production"\s*\|\|/);
  assert.match(session, /CMS_EV2_PRODUCTION_ENABLED/);
  assert.match(runtime, /capability\.source === "override"/);
  assert.match(contract, /"ev2\.system_assurance"/);
});

test("no frontend source uses legacy EV2 build switches as an authorization decision", async () => {
  const files = await sourceFiles("src");
  const matches = [];
  for (const file of files) {
    const source = await read(file);
    if (source.includes("VITE_EV2_")) matches.push(file.replaceAll("\\", "/"));
  }
  assert.deepEqual(matches, []);
});

test("anonymous public search v2 is closed and the public client remains on v1", async () => {
  const [edge, client] = await Promise.all([
    read("supabase/functions/cms-public/index.ts"),
    read("src/public/catalog-api.ts"),
  ]);
  assert.match(edge, /CMS_PUBLIC_SEARCH_V2_CANARY_TOKEN/);
  assert.match(edge, /CMS_ENVIRONMENT"\) !== "staging"/);
  assert.match(edge, /X-EV2-Search-Canary/);
  assert.match(client, /new URLSearchParams\(\{ type: "search", q: query \}\)/);
  assert.doesNotMatch(client, /type: .*search-v2/);
});

test("the reduced G13 canary is immutable, identity-scoped and staging-only", async () => {
  const [canary, rehearsal, workflow] = await Promise.all([
    read("scripts/ev2/phase13/staging-canary.mjs"),
    read("scripts/ev2/phase13/validate-migration.mjs"),
    read(".github/workflows/preview-ev2-phase13.yml"),
  ]);
  assert.match(canary, /ev2-g13-canary\.gaiatec-cms-staging\.pages\.dev/);
  assert.match(canary, /same_build_identity_isolation/);
  assert.match(canary, /authorized_search_v2_healthy/);
  assert.match(canary, /EV2_G13_SEARCH_CANARY_TOKEN/);
  assert.match(canary, /"X-EV2-Search-Canary": searchCanaryToken/);
  assert.match(canary, /scope_type=eq\.user&scope_key=in\./);
  assert.match(canary, /individual_revocation_within_60s/);
  assert.match(canary, /globalActivationMutations: 0/);
  assert.match(canary, /productionMutations: 0/);
  assert.match(canary, /synthetic_active_residue_zero/);
  assert.match(canary, /syntheticSearchEvents === 0/);
  assert.match(rehearsal, /G13_MIGRATION_REHEARSAL_PASS/);
  assert.match(rehearsal, /supabase@2\.116\.0/);
  assert.match(rehearsal, /EV2_G13_PARALLEL_BROAD_OVERRIDE_NOT_CLOSED/);
  assert.match(rehearsal, /EV2_G13_LONG_TTL_NOT_CLOSED/);
  assert.match(workflow, /EV2\.13 Candidate Preview \(not a gate\)/);
  assert.match(workflow, /PREVIEW-G13-STAGING/);
  assert.match(workflow, /Require isolated Pages preview configuration/);
  assert.doesNotMatch(workflow, /CANARY-G13-STAGING|CANARY_DEPLOY_CONFIGURED/);
  assert.match(workflow, /--commit-hash \$\{\{ inputs\.expected_sha \}\}/);
  assert.doesNotMatch(workflow, /pages deploy .*--branch (?:main|Remodelagem)/);
});
