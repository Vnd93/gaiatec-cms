import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0077_cms_production_operator_provisioning.sql", "utf8");
const workflow = readFileSync(".github/workflows/provision-production-operator.yml", "utf8");
const productionDeploy = readFileSync(".github/workflows/deploy-production.yml", "utf8");
const provisioner = readFileSync("scripts/ev2/phase12/provision-production-operator.mjs", "utf8");
const identityGuard = readFileSync("scripts/ev2/phase12/production-operator-identity-lib.mjs", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_production_operator_provisioning.test.sql", "utf8");

describe("SHA-bound production CMS operator provisioning", () => {
  it("exposes only a service-role RPC and never accepts a clear-text email", () => {
    expect(migration).toContain("p_email_sha256 text");
    expect(migration).not.toMatch(/\bp_email\s+text\b/);
    expect(migration).toContain("CMS_PRODUCTION_OPERATOR_SERVICE_ROLE_REQUIRED");
    expect(migration).toMatch(
      /revoke all on function public\.cms_provision_production_operator\([\s\S]+from public,anon,authenticated,service_role;[\s\S]+grant execute[\s\S]+to service_role;/,
    );
    expect(migration).toContain("lower(btrim(coalesce(candidate.email,'')))");
  });

  it("requires one confirmed, unbanned, non-QA identity with verified TOTP", () => {
    expect(migration).toContain("cardinality(v_user_ids)<>1");
    expect(migration).toContain("v_user.email_confirmed_at is null");
    expect(migration).toContain("v_user.banned_until>v_now");
    expect(migration).toContain("private.cms_qa_actor_leases");
    expect(migration).toContain("from auth.mfa_factors factor");
    expect(migration).toContain("factor.factor_type::text='totp'");
    expect(migration).toContain("factor.status::text='verified'");
    expect(migration).toContain("CMS_PRODUCTION_OPERATOR_TOTP_REQUIRED");
  });

  it("binds release and renewal operations to production, the candidate and exact one-shot literals", () => {
    expect(migration).toContain("p_environment is distinct from 'production'");
    expect(migration).toContain("'AUTORIZO-G12-PRODUCAO:'||p_candidate_sha");
    expect(migration).toContain("'AUTORIZO-RENOVAR-OPERADOR-CMS:'||p_candidate_sha");
    expect(migration).toContain("p_window_minutes not between 1440 and 525600");
    expect(migration).toContain("p_window_minutes%1440<>0");
    expect(migration).toContain("CMS_PRODUCTION_OPERATOR_IDEMPOTENCY_CONFLICT");
    expect(migration).toContain("CMS_PRODUCTION_OPERATOR_AUTHORIZATION_REPLAY");
    expect(migration).toContain("authorization_sha256 text not null unique");
    expect(migration).toContain("approval_record_sha256");
  });

  it("activates both rollout-safe superadmin representations", () => {
    expect(migration).toContain("insert into public.cms_profiles");
    expect(migration).toContain("insert into public.cms_user_roles");
    expect(migration).toContain("insert into public.cms_scoped_role_assignments");
    expect(migration).toContain("'super_admin','main','production','direct'");
    expect(migration).toContain("private.cms_rbac_scope_context");
    expect(migration).not.toMatch(
      /v_user_count=1 and v_user_enabled and v_user_environment='production'[\s\S]+production_not_available/,
    );
  });

  it("enables only the ADR-022 individual allowlist for a renewable maximum of 365 days", () => {
    for (const flag of [
      "ev2.release_skeleton",
      "ev2.draft_v2",
      "ev2.master_data",
      "ev2.pim_v2",
      "ev2.dam",
      "ev2.search_quality",
      "ev2.collaboration_bulk",
      "ev2.rbac_scoped",
      "ev2.visual_studio",
      "ev2.ai_assist",
      "ev2.system_assurance",
    ]) {
      expect(migration).toContain(`'${flag}'`);
    }
    expect(migration).toContain("v_forbidden_flags constant text[]:=array['ev2.multisite','ev2.ai_execute']");
    expect(migration).toContain("scope_type='user'");
    expect(migration).toContain("override_expires_at <= created_at + interval '365 days'");
    expect(productionDeploy).toContain('PRODUCTION_OPERATOR_WINDOW_MINUTES: "525600"');
    expect(productionDeploy).toContain("PRODUCTION_OPERATOR_REQUEST_ID: ${{ github.run_id }}");
    expect(migration).toContain("CMS_PRODUCTION_OPERATOR_BROAD_OVERRIDE_FORBIDDEN");
  });

  it("persists an immutable PII-free receipt and audit record", () => {
    expect(migration).toContain("cms_production_operator_provision_receipts");
    expect(migration).toContain("CMS_PRODUCTION_OPERATOR_RECEIPT_IMMUTABLE");
    expect(migration).toContain("'cms:production_operator.provision'");
    expect(migration).toContain("'candidateSha',p_candidate_sha");
    expect(migration).toContain("'workflowRunId',p_workflow_run_id");
    expect(migration).toContain("'containsPii',false");
    expect(migration).not.toMatch(/event_data[\s\S]{0,1200}p_email_sha256/);
  });

  it("protects the last effective corporate superadmin in both control planes", () => {
    expect(migration).toContain("cms_user_roles_last_corporate_superadmin_guard");
    expect(migration).toContain("cms_scoped_roles_last_corporate_superadmin_guard");
    expect(migration).toContain("cms_profiles_last_corporate_superadmin_guard");
    expect(migration).toContain("CMS_LAST_CORPORATE_SCOPED_SUPER_ADMIN");
    expect(migration).toContain("hashtextextended('cms:last-corporate-superadmin',0)");
  });

  it("keeps the operator secret out of dispatch inputs, requests and output", () => {
    expect(workflow).toContain("PRODUCTION_OPERATOR_EMAIL: ${{ secrets.PRODUCTION_OPERATOR_EMAIL }}");
    expect(workflow).toContain("PRODUCTION_AUTH_CANARY_EMAIL: ${{ secrets.PRODUCTION_AUTH_CANARY_EMAIL }}");
    expect(workflow).not.toMatch(/inputs\.production_operator_email|inputs\.operator_email/);
    expect(provisioner).toContain("p_email_sha256: emailSha256");
    expect(provisioner).toContain("PRODUCTION_OPERATOR_REQUEST_ID");
    expect(provisioner).toContain("exactCorporateOperatorEmail");
    expect(identityGuard).toContain("operator !== login");
    expect(identityGuard).toContain("operator.endsWith(`@${domain}`)");
    expect(workflow).toContain("PRODUCTION_OPERATOR_REQUEST_ID: ${{ github.run_id }}");
    expect(provisioner).not.toMatch(/p_email:\s*rawEmail/);
    expect(provisioner).toContain("console.log(JSON.stringify(safeReport))");
    expect(provisioner).not.toMatch(/console\.(?:log|error)\([^\n]*(?:rawEmail|emailSha256|serviceRoleKey)/);
    expect(provisioner).toContain("containsPii: false");
  });

  it("gates the manual workflow on main, immutable approval and candidate health", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain('test "$DISPATCH_REF" = refs/heads/main');
    expect(workflow).toContain(
      'test "$PRODUCTION_AUTHORIZATION" = "AUTORIZO-RENOVAR-OPERADOR-CMS:$CANDIDATE_SHA:$VALIDITY_DAYS-DIAS"',
    );
    expect(workflow).toContain('echo "window_minutes=$((VALIDITY_DAYS * 1440))"');
    expect(workflow).toContain("git -C control merge-base --is-ancestor");
    expect(workflow).toContain("check-github-controls.mjs");
    expect(workflow).toContain("verify-approval.mjs");
    expect(workflow).toContain("rollout-probe.mjs");
    expect(workflow).toContain("EV2_G12_EXPECTED_SHA: ${{ inputs.candidate_sha }}");
    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain("environment: production");
  });

  it("backs the critical refusal and idempotency paths with pgTAP", () => {
    for (const evidence of [
      "an identity without a verified TOTP factor is refused",
      "an unconfirmed identity is refused without identity disclosure",
      "a currently banned identity is refused without identity disclosure",
      "an unknown hash returns the same non-disclosing eligibility error",
      "the RPC independently rejects a non-service JWT role",
      "an authorization hash not bound to the exact candidate is refused",
      "a production override beyond 365 days is refused",
      "a production override shorter than one day is refused",
      "a reused authorization with a new idempotency key is refused",
      "a broad production override fails closed",
      "a refused broad override leaves no partial profile mutation",
      "the same idempotency key replays without mutation",
      "the last legacy corporate superadmin is protected",
      "the last effective scoped production superadmin is protected",
      "the effective production capability no longer falls back to legacy",
    ]) {
      expect(pgTap).toContain(evidence);
    }
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
