import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0075_cms_ai_authoritative_scope.sql", "utf8");
const assistEdge = readFileSync("supabase/functions/cms-ai/index.ts", "utf8");
const executeEdge = readFileSync("supabase/functions/cms-ai-execute/index.ts", "utf8");
const openRouter = readFileSync("supabase/functions/_shared/openrouter.ts", "utf8");
const assistContract = readFileSync("src/shared/contracts/ev2-ai.ts", "utf8");
const executeContract = readFileSync("src/shared/contracts/ev2-ai-execute.ts", "utf8");
const assistPage = readFileSync("src/admin/pages/AdminAiAssistantPage.tsx", "utf8");
const executePage = readFileSync("src/admin/pages/AdminAiExecutionPage.tsx", "utf8");
const fixture = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_ai_authoritative_scope.test.sql", "utf8");

const approvedModel = "nvidia/nemotron-3.5-lightning:free";

describe("authoritative AI scope for F-015 and F-016", () => {
  it("pins the sole provider/model and forbids autonomous or direct data access", () => {
    expect(migration).toContain("provider text not null check (provider = 'openrouter')");
    expect(migration).toContain(`model_key text not null check (model_key = '${approvedModel}')`);
    expect(migration).toContain("check (not automatic_publish_allowed)");
    expect(migration).toContain("check (not direct_database_access_allowed)");
    expect(migration).toContain("check (training_opt_out)");
    expect(openRouter).toContain(`APPROVED_OPENROUTER_MODEL = "${approvedModel}"`);
    expect(openRouter).toContain('provider: { data_collection: "deny" }');
    expect(assistContract).toContain('z.literal("openrouter")');
    expect(executeContract).toContain('z.literal("openrouter")');
    expect(executeContract).toContain("externalProviderReady: z.boolean()");
    expect(executeEdge).toContain('command.action !== "capability"');
    expect(executeEdge).toContain("enabled: capability?.enabled === true && externalProviderReady");
  });

  it("normalizes every persistent provider label and keeps audit costs bounded", () => {
    expect(migration).toContain("update public.cms_ai_policy_versions");
    expect(migration).toContain("update public.cms_ai_sessions set provider_mode='openrouter'");
    expect(migration).toContain("update public.cms_ai_eval_runs");
    expect(migration).toContain("cms_ai_eval_provider_enforce");
    expect(migration).toContain("cost_micros bigint not null default 0 check (cost_micros = 0)");
    expect(migration).toContain("cms_ai_provider_calls_status_shape");
    for (const [dropMarker, backfillMarker] of [
      ["drop constraint cms_ai_policy_versions_provider_mode_check", "update public.cms_ai_policy_versions"],
      ["drop constraint cms_ai_sessions_provider_mode_check", "update public.cms_ai_sessions"],
      ["drop constraint cms_ai_eval_runs_provider_mode_check", "update public.cms_ai_eval_runs"],
    ]) {
      expect(migration.indexOf(dropMarker)).toBeLessThan(migration.indexOf(backfillMarker));
    }
  });

  it("derives corporate/same-run QA visibility from immutable server leases", () => {
    for (const helper of [
      "cms_ai_actor_row_scope_allowed",
      "cms_ai_target_scope_allowed",
      "cms_ai_session_scope_allowed",
      "cms_ai_proposal_scope_allowed",
      "cms_ai_plan_scope_allowed",
      "cms_ai_run_scope_allowed",
    ]) {
      expect(migration).toContain(helper);
    }
    expect(migration).toContain("private.cms_user_actor_target_scope_allowed(");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toContain("p_row_at between lease.created_at and lease.expires_at");
    expect(migration).toContain("qa_candidate_sha ~ '^[0-9a-f]{40}$'");
    expect(migration).toContain("target.created_at between lease.created_at and lease.expires_at");
    expect(migration).not.toMatch(/raw_user_meta_data[\s\S]{0,120}p_payload/);
  });

  it("makes target provenance server-derived and rejects IDOR/cross-run graphs", () => {
    expect(migration).toContain("cms_ai_target_provenance_guard");
    expect(migration).toContain("CMS_AI_EXECUTE_PROVENANCE_IMMUTABLE");
    expect(migration).toContain("CMS_AI_EXECUTE_PROVENANCE_INVALID");
    expect(migration).toContain("not private.cms_ai_target_scope_allowed(");
    expect(migration).toContain("CMS_AI_EXECUTE_TARGET_NOT_FOUND");
    expect(migration).toContain("select target.created_by");
    expect(migration).toContain("cross join lateral jsonb_array_elements(plan.steps) step");
  });

  it("preserves deployed literal RPCs while revoking every legacy bypass", () => {
    for (const rpc of [
      "cms_ai_capability",
      "cms_get_ai_workspace",
      "cms_execute_ai_command",
      "cms_ai_execute_capability",
      "cms_get_ai_execution_workspace",
      "cms_execute_ai_transaction_command",
      "cms_record_ai_provider_call_scoped",
    ]) {
      expect(assistEdge + executeEdge).toMatch(new RegExp(`rpc\\(\\s*"${rpc}"`));
    }
    expect(assistEdge + executeEdge).not.toMatch(/\.rpc\((?:rpc|rpcName|commandRpc)\s*,/);
    expect(migration).toContain("cms_execute_ai_command_unscoped_0075");
    expect(migration).toContain("cms_execute_ai_transaction_command_unscoped_0075");
    expect(migration).toMatch(/_unscoped_0075\([\s\S]*?from public,anon,authenticated,service_role/);
  });

  it("fails closed when OpenRouter is unavailable and stores no fabricated proposal", () => {
    expect(assistEdge).toContain("openRouterConfigured()");
    expect(assistEdge).toContain("CMS_AI_PROVIDER_NOT_CONFIGURED");
    expect(assistEdge).toContain("CMS_AI_PROVIDER_UNAVAILABLE");
    expect(assistEdge).toContain("o cadastro manual continua funcionando");
    const providerTry = assistEdge.indexOf("const generated = await generateOpenRouterProposal");
    const providerEvidence = assistEdge.indexOf(
      "const { error: providerAuditError } = await recordProviderCall",
      providerTry,
    );
    const proposalWrite = assistEdge.indexOf('execute("generate_proposal"');
    expect(providerTry).toBeGreaterThan(-1);
    expect(providerEvidence).toBeGreaterThan(providerTry);
    expect(providerEvidence).toBeLessThan(proposalWrite);
    expect(proposalWrite).toBeGreaterThan(providerTry);
    expect(assistEdge.slice(providerTry, proposalWrite)).toContain("return json(");
    expect(assistEdge).not.toMatch(/\.from\("cms_ai_provider_calls"\)/);
  });

  it("persists only sanitized provider/audit metadata through a scoped writer", () => {
    expect(assistEdge).toContain('rpc("cms_record_ai_provider_call_scoped"');
    expect(assistEdge).toContain("prompt: `request-${promptHash}`");
    expect(assistEdge).toContain("p_input_tokens:");
    expect(assistEdge).toContain("p_output_tokens:");
    expect(assistEdge).toContain("p_error_code:");
    expect(migration).toContain("cms_ai_provider_calls_immutable");
    expect(migration).toContain("cms_ai_events_immutable");
    expect(migration).toContain("CMS_AI_EVIDENCE_IMMUTABLE");
    expect(migration).not.toMatch(
      /cms_ai_provider_calls\([\s\S]{0,300}(?:prompt|response_body|api_key|token_value)/i,
    );
  });

  it("enforces main-site, environment, MFA, origin, rate and injection gates", () => {
    for (const edge of [assistEdge, executeEdge]) {
      expect(edge).toContain("isAllowedOrigin(req)");
      expect(edge).toContain("consumeRateLimit(");
      expect(edge).toContain('siteKey !== "main"');
      expect(edge).toContain('identity.claims.aal !== "aal2"');
      expect(edge).toContain('environment === "production"');
      expect(edge).toContain("detectAiPromptInjection");
      expect(edge).toContain("redactAiText");
    }
    expect(migration).toContain("p_environment not in ('local','staging')");
    expect(migration).toContain("p_site_key is distinct from 'main'");
    expect(assistEdge).toContain("OPENROUTER_OUTPUT_UNSAFE");
    expect(assistEdge).toContain("containsExecutableAiOutput");
  });

  it("retains CAS, expiring approval, two-person review and monotonic compensation", () => {
    expect(migration).toContain("private.cms_lock_active_qa_actor_leases(v_actor_ids)");
    expect(migration).toContain("private.cms_ai_plan_actor_ids(v_plan_id)");
    expect(migration).toContain("CMS_AI_EXECUTE_GRAPH_CONFLICT");
    expect(migration).toMatch(
      /pg_advisory_xact_lock\([\s\S]*?private\.cms_ai_plan_actor_ids\(v_plan_id\) <@ v_actor_ids[\s\S]*?cms_execute_ai_transaction_command_unscoped_0075/,
    );
    expect(migration).toContain("pg_advisory_xact_lock(");
    expect(executeEdge).toContain("expectedPlanHash");
    expect(executeEdge).toContain("X-Idempotency-Key");
    expect(executePage).toContain("revisão e execução por pessoas distintas");
    expect(executePage).toContain("aprovação anterior foi invalidada");
    expect(executePage).toContain("versão monotônica");
  });

  it("keeps every direct table read closed and covered by authoritative RLS", () => {
    for (const policy of [
      "cms_ai_sessions_authoritative_read",
      "cms_ai_sources_authoritative_read",
      "cms_ai_proposals_authoritative_read",
      "cms_ai_provider_calls_authoritative_read",
      "cms_ai_targets_authoritative_read",
      "cms_ai_plans_authoritative_read",
      "cms_ai_runs_authoritative_read",
      "cms_ai_execution_decisions_authoritative_read",
    ]) {
      expect(migration).toContain(policy);
    }
    expect(migration).toContain("revoke all on table");
    expect(migration).toContain("from public,anon,authenticated");
    expect(assistEdge + executeEdge).not.toMatch(/\.from\("cms_ai_/);
  });

  it("terminally removes assist residue, scrubs execution residue and preserves evidence", () => {
    expect(migration).toContain("zzzz_cms_ai_terminal_cleanup");
    expect(migration).toContain("delete from public.cms_ai_proposals");
    expect(migration).toContain("delete from public.cms_ai_messages");
    expect(migration).toContain("delete from public.cms_ai_sources");
    expect(migration).toContain("title='QA terminal target',payload='{}'::jsonb");
    expect(migration).toContain("steps=jsonb_build_array(jsonb_build_object('terminal',true))");
    expect(migration).toContain("providerEvidencePreserved");
    expect(migration).toContain("eventEvidencePreserved");
    expect(migration).toContain("businessResidueActive',false");
  });

  it("binds the browser fixture to the exact server provenance tuple", () => {
    expect(fixture).toContain("QA_CMS_FIXTURE_AI_TARGET_PROVENANCE_MISMATCH");
    expect(fixture).toContain('.eq("qa_run_tag", state.runTag)');
    expect(fixture).toContain('.eq("qa_candidate_sha", expectedSha)');
    expect(fixture).toContain('.eq("qa_environment", target.environment)');
    expect(fixture).toContain('title: "QA terminal target"');
  });

  it("keeps manual operation and explicit human review visible in both UI surfaces", () => {
    expect(assistPage).toMatch(/O conteúdo é enviado ao modelo\s+aprovado/);
    expect(assistPage).not.toContain("via OpenRouter");
    expect(assistPage).toContain("não é aplicado nem publicado automaticamente");
    expect(assistPage).toContain("Operação manual sempre disponível");
    expect(executePage).toContain("Fallback manual preservado");
    expect(executePage).toMatch(/Dados reais\s+e\s+tabelas editoriais permanecem bloqueados/);
  });

  it("covers corporate, same-run, cross-run, forged marker and direct RLS in pgTAP", () => {
    expect(pgTap).toContain("QA can read its exact-run target");
    expect(pgTap).toContain("QA cannot read another run target by ID");
    expect(pgTap).toContain("corporate cannot read an ever-QA target by ID");
    expect(pgTap).toContain("payload cannot forge a different QA run marker");
    expect(pgTap).toContain("same-run QA reviewer can read the session");
    expect(pgTap).toContain("lease lock graph includes both planner and target owner");
    expect(pgTap).toContain("clients cannot bypass scoped readers");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
