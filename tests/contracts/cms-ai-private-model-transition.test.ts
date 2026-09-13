import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0097_cms_ai_private_model_transition.sql", "utf8");
const adapter = readFileSync("supabase/functions/_shared/openrouter.ts", "utf8");
const assistContract = readFileSync("src/shared/contracts/ev2-ai.ts", "utf8");
const executeContract = readFileSync("src/shared/contracts/ev2-ai-execute.ts", "utf8");
const stagingWorkflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
const stagingWatchdog = readFileSync(".github/workflows/deploy-staging-watchdog.yml", "utf8");
const stagingSecrets = readFileSync("scripts/ev2/phase12/staging-ai-provider-secrets-lib.mjs", "utf8");
const productionBackend = readFileSync("scripts/ev2/phase12/production-backend-lib.mjs", "utf8");

const legacyModel = "nvidia/nemotron-3.5-lightning:free";
const activeModel = "inclusionai/ling-3.0-flash-vl:free";

describe("private zero-cost AI model transition", () => {
  it("preserves historical evidence while closing new writes on Ling", () => {
    expect(migration).toContain("cms_ai_provider_calls_model_key_check check");
    expect(migration).toContain("cms_ai_eval_runs_model_key_check check");
    expect(migration).toContain(`'${legacyModel}'`);
    expect(migration).toContain(`'${activeModel}'`);
    expect(migration).not.toMatch(/update public\.cms_ai_(?:provider_calls|eval_runs)/);
    expect(migration).toContain("new.model_key:='inclusionai/ling-3.0-flash-vl:free'");
    expect(migration).toContain("cms_ai_provider_call_model_enforce");
    expect(migration).toContain("CMS_AI_PROVIDER_MODEL_FORBIDDEN");
    expect(migration).toContain("configuration->>'model'='nvidia/nemotron-3.5-lightning:free'");
    expect(migration).toContain("'f015-openrouter-v2'");
    expect(migration).toContain("and policy.training_opt_out");
  });

  it("appends an immutable privacy policy instead of rewriting its predecessor", () => {
    expect(migration).toContain("insert into public.cms_ai_provider_policy");
    expect(migration).not.toMatch(/update public\.cms_ai_provider_policy/);
    expect(migration).toContain("false,false,false,true");
    expect(migration).toContain("'dataCollection','deny'");
    expect(migration).toContain("'zeroDataRetention',true");
    expect(migration).toContain("'previousModel'");
  });

  it("updates deployed wrappers without regressing the 0088 MFA boundary", () => {
    expect(migration).toContain("pg_get_functiondef(v_function::oid)");
    expect(migration).toContain("v_expected_old_counts constant integer[]:=array[1,4,3,2,1,3,1]");
    expect(migration).toContain("CMS_AI_MODEL_TRANSITION_SOURCE_DRIFT");
    expect(migration).toContain("public.cms_execute_ai_command(uuid,text,jsonb");
    expect(migration).toContain("historical_call.model_key");
    expect(migration).toContain("'search_path=pg_catalog, private, pg_temp'=any(procedure_row.proconfig)");
    expect(migration).toContain("execute v_definition");
  });

  it("uses only a deny-plus-ZDR free endpoint with no paid fallback", () => {
    expect(adapter).toContain(`APPROVED_OPENROUTER_MODEL = "${activeModel}"`);
    expect(adapter).toContain('provider: { data_collection: "deny", zdr: true }');
    expect(adapter).toContain("OPENROUTER_NO_ALLOWED_PROVIDER");
    expect(adapter).not.toMatch(/response_format|models:/);
    expect(adapter).not.toMatch(/console\.(?:log|debug|info)/);
    expect(productionBackend).toContain(`PRODUCTION_OPENROUTER_MODEL = "${activeModel}"`);
    expect(stagingSecrets).toContain(`STAGING_OPENROUTER_MODEL = "${activeModel}"`);
  });

  it("ships a two-model frontend bridge before staging changes its backend", () => {
    expect(assistContract).toContain(`"${legacyModel}"`);
    expect(assistContract).toContain(`"${activeModel}"`);
    expect(assistContract).toContain("EV2_AI_ACTIVE_OPENROUTER_MODEL");
    expect(executeContract).toContain("CompatibleResponseModel = Ev2AiCompatibleResponseModelSchema");
    const bridge = stagingWorkflow.indexOf(
      "Verify compatibility-only staging bridge evidence for this exact SHA",
    );
    const migration = stagingWorkflow.indexOf("Apply the exact candidate migrations to staging");
    const configure = stagingWorkflow.indexOf(
      "Configure and verify the exact privacy-safe staging AI provider policy",
    );
    const deployFunctions = stagingWorkflow.indexOf(
      "Deploy the complete exact-candidate Edge Function inventory to staging",
    );
    expect(bridge).toBeGreaterThan(-1);
    expect(migration).toBeGreaterThan(bridge);
    expect(configure).toBeGreaterThan(migration);
    expect(configure).toBeLessThan(deployFunctions);
    const diagnostic = stagingWorkflow.indexOf("DIAGNOSTIC governed editorial lifecycle end to end");
    expect(diagnostic).toBeGreaterThan(deployFunctions);
    expect(stagingWorkflow.slice(diagnostic, stagingWorkflow.indexOf("\n  finalize:"))).not.toContain(
      "supabase secrets set",
    );

    for (const [workflow, prefix] of [
      [stagingWorkflow, "finalizer"],
      [stagingWatchdog, "watchdog"],
    ] as const) {
      const decision = workflow.indexOf(`id: ${prefix}_decision`);
      const checkout = workflow.indexOf("Checkout the exact candidate for", decision);
      const database = workflow.indexOf("Converge exact candidate staging migrations", checkout);
      const secrets = workflow.indexOf("configure-staging-ai-provider-secrets.mjs", database);
      const functions = workflow.indexOf("Converge exact candidate Edge Functions", secrets);
      const compensation = workflow.indexOf("staging-pages-state.mjs compensate", functions);
      expect(decision).toBeGreaterThan(-1);
      expect(checkout).toBeGreaterThan(decision);
      expect(database).toBeGreaterThan(checkout);
      expect(secrets).toBeGreaterThan(database);
      expect(functions).toBeGreaterThan(secrets);
      expect(compensation).toBeGreaterThan(functions);
      expect(workflow.slice(checkout, compensation)).toContain("--rollback-source .");
      expect(workflow.slice(checkout, compensation)).toContain("version: 2.116.0");
    }
  });
});
