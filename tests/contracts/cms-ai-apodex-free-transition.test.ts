import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0117_cms_ai_apodex_free_model_transition.sql", "utf8");

describe("Apodex staging-only free ZDR successor", () => {
  it("binds the added migration to SQL, adapter and bridge tests executed by CI", () => {
    const compatibility = readFileSync(
      "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs",
      "utf8",
    );
    expect(compatibility).toContain('"0117": [');
    for (const test of [
      "supabase/tests/rls_cms_ai_private_model_transition.test.sql",
      "supabase/tests/rls_cms_ai_authoritative_scope.test.sql",
      "tests/contracts/cms-ai-apodex-free-transition.test.ts",
      "tests/unit/ev2-ai-model-transition.test.ts",
      "tests/unit/openrouter-adapter.test.ts",
    ])
      expect(compatibility.slice(compatibility.indexOf('"0117": ['))).toContain(test);
    expect(compatibility).toContain("candidateTestIsCiExecuted");
  });

  it("is additive, bounded and refuses predecessor drift", () => {
    expect(migration).toContain("set local lock_timeout='5s'");
    expect(migration).toContain("set local statement_timeout='30s'");
    expect(migration).toContain("CMS_AI_APODEX_PROVIDER_POLICY_DRIFT");
    expect(migration).toContain("CMS_AI_APODEX_POLICY_STATE_INVALID");
    expect(migration).toContain("v_affected<>1");
    expect(migration).toContain("insert into public.cms_ai_provider_policy");
    expect(migration).not.toMatch(
      /(?:update|delete from) public\.cms_ai_(?:provider_policy|provider_calls|eval_runs)\b/,
    );
    expect(migration).toContain("'f015-openrouter-v5','main',array['local','staging']::text[]");
    expect(migration).toContain("'apodex/apodex-1.1-mini:free','f015-v1','approved',false,false,false,true");
    expect(migration).not.toMatch(/grant |disable row level security|cms_catalog_|feature_flag/i);
  });

  it("preserves privacy, zero price and all four retired historical models", () => {
    expect(migration).toContain("configuration->>'dataCollection'='deny'");
    expect(migration).toContain("configuration->'zeroDataRetention'='true'::jsonb");
    expect(migration).toContain("'maxPrice',jsonb_build_object('prompt',0,'completion',0,'request',0)");
    expect(migration).toContain("'nvidia/nemotron-3.5-lightning:free'");
    expect(migration).toContain("'inclusionai/ling-3.0-flash-vl:free'");
    expect(migration).toContain("'qwen/qwen3.8-27b:free'");
    expect(migration).toContain("'inclusionai/ling-3.0-flash-sante:free'");
    expect(migration).toContain("configuration->>'model'='inclusionai/ling-3.0-flash-sante:free'");
    expect(migration).toContain("configuration->>'providerPolicyKey'='f015-openrouter-v4'");
    expect(migration).toContain("new.model_key is distinct from 'apodex/apodex-1.1-mini:free'");
    expect(migration).toContain("CMS_AI_PROVIDER_MODEL_FORBIDDEN");
    expect(migration).toContain("CMS_AI_EVIDENCE_IMMUTABLE");
  });

  it("verifies exact wrapper shape, privileges, MFA and historical response provenance", () => {
    expect(migration).toContain("v_expected_old_counts constant integer[]:=array[1,4,3,2,1,3,1]");
    expect(migration).toContain("CMS_AI_APODEX_SOURCE_DRIFT");
    expect(migration).toContain("v_security_after is distinct from v_security_before");
    expect(migration).toContain("'oid',oid,'owner',proowner,'acl',proacl");
    expect(migration).toContain("'securityDefiner',prosecdef,'configuration',proconfig");
    expect(migration).toContain("CMS_AI_MFA_REQUIRED");
    expect(migration).toContain("cms_execute_ai_command_unscoped_0075");
    expect(migration).toContain("'search_path=pg_catalog, private, pg_temp'=any(procedure_row.proconfig)");
    expect(migration).toContain("historical_call.model_key");
    expect(migration).toContain("policy.training_opt_out");
    expect(migration).toContain("CMS_AI_APODEX_POSTCONDITION_FAILED");
  });
});
