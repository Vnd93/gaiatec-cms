import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0072_cms_forms_leads_authoritative_scope.sql", "utf8");
const leadsEdge = readFileSync("supabase/functions/cms-leads/index.ts", "utf8");
const captureEdge = readFileSync("supabase/functions/lead-capture/index.ts", "utf8");
const publicEdge = readFileSync("supabase/functions/cms-public/index.ts", "utf8");
const worker = readFileSync("supabase/functions/cms-outbox-worker/index.ts", "utf8");
const formsPage = readFileSync("src/admin/pages/AdminFormsPage.tsx", "utf8");
const leadsPage = readFileSync("src/admin/pages/AdminLeadsPage.tsx", "utf8");
const fixture = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");
const finalCoverage = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8");
const uiCreatedState = readFileSync("tests/e2e/cms-ui-created-state.ts", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_forms_leads_scope.test.sql", "utf8");

describe("authoritative forms and leads QA scope", () => {
  it("persists complete server-derived provenance and immutable capture binding", () => {
    for (const column of ["qa_actor_id", "qa_run_tag", "qa_candidate_sha", "qa_environment"]) {
      expect(migration).toContain(column);
    }
    expect(migration).toContain("num_nonnulls(qa_actor_id,qa_run_tag,qa_candidate_sha,qa_environment) = 4");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact(");
    expect(migration).toContain("private.cms_lead_capture_hash(");
    expect(migration).toContain("CMS_LEAD_CAPTURE_HASH_SPOOFED");
    expect(migration).toContain("CMS_LEAD_PROVENANCE_IMMUTABLE");
  });

  it("fails closed across corporate, same-run QA and cross-run graphs", () => {
    for (const helper of [
      "cms_form_scope_allowed",
      "cms_form_public_allowed",
      "cms_lead_scope_allowed",
      "cms_lead_assignee_allowed",
      "cms_form_capture_origin_allowed",
      "cms_lead_external_delivery_allowed",
      "cms_lead_system_scope",
    ]) {
      expect(migration).toContain(helper);
    }
    expect(migration).toContain("caller.run_tag");
    expect(migration).toContain("caller.candidate_sha");
    expect(migration).toContain("caller.environment");
    expect(migration).toContain("not exists (select 1 from private.cms_qa_actor_leases caller");
    expect(migration).toContain("form.qa_actor_id is null");
  });

  it("binds synthetic public capture to the exact fixture or published campaign", () => {
    expect(migration).toContain("v_path = '/qa-cms-final/' || lower(v_form.qa_run_tag)");
    expect(migration).toContain("'^/campanhas/qa-lead-' || lower(v_form.qa_run_tag) || '-[0-9a-f]{8}$'");
    expect(migration).toContain("projection.payload #>> '{form,formId}' = p_form_id::text");
    expect(migration).toContain("projection.payload #>> '{form,versionId}' = p_form_version_id::text");
    expect(captureEdge).toContain('rpc("cms_public_form_scoped"');
    expect(captureEdge).toContain('rpc("cms_capture_lead_scoped"');
    expect(publicEdge).toContain('rpc("cms_public_form_scoped"');
    expect(captureEdge).not.toMatch(/\.from\("cms_(?:form|lead)/);
    expect(publicEdge).not.toMatch(/\.from\("cms_(?:form|lead)/);
  });

  it("uses literal service-side RPC targets for every admin command", () => {
    for (const rpc of [
      "cms_forms_list_scoped",
      "cms_leads_list_scoped",
      "cms_save_form_version_scoped",
      "cms_publish_form_version_scoped",
      "cms_execute_form_lifecycle_command_scoped",
      "cms_manage_lead_scoped",
      "cms_anonymize_lead_scoped",
      "cms_export_leads_scoped",
      "cms_retry_lead_delivery_limited",
    ]) {
      expect(leadsEdge).toContain(`rpc("${rpc}"`);
    }
    expect(leadsEdge).not.toMatch(/\.rpc\(rpc\s*,/);
    expect(leadsEdge).not.toMatch(/\.from\("cms_(?:form|lead)/);
    expect(leadsEdge).not.toMatch(/raw_user_meta_data|user_metadata/);
  });

  it("keeps RLS and privileged RPC grants aligned with the scoped boundary", () => {
    for (const policy of [
      "cms_forms_scoped_read",
      "cms_form_versions_scoped_read",
      "cms_leads_scoped_read",
      "cms_lead_consents_scoped_read",
      "cms_lead_history_scoped_read",
      "cms_lead_outbox_scoped_read",
      "cms_lead_replays_scoped_read",
      "cms_lead_exports_scoped_read",
    ]) {
      expect(migration).toContain(policy);
    }
    expect(migration).toContain("from public,anon,authenticated,service_role");
    expect(migration).toContain("CMS_FORMS_LEADS_UNSCOPED_RPC_EXPOSED");
    expect(migration).toContain("to service_role");
  });

  it("prevents external delivery and system jobs from crossing QA scope", () => {
    expect(worker).toContain('rpc("cms_claim_lead_outbox_scoped"');
    expect(worker).toContain("event.delivery_allowed !== true");
    expect(worker).toContain('rpc("cms_apply_lead_retention_scoped"');
    expect(worker).toContain('p_scope: "corporate"');
    expect(worker).toContain('p_scope: "qa"');
    expect(migration).toContain("cms.leads.retention_applied.'||p_scope");
    expect(migration).toContain("private.cms_lead_system_scope(lead.id)='corporate'");
    expect(migration).toContain("lead.origin_source <> 'qa_fixture'");
  });

  it("locks leases before mutable resources and terminally compensates the graph", () => {
    const exportLock = migration.indexOf(
      "perform private.cms_lock_active_qa_actor_leases(array[new.actor_id]);",
    );
    const exportLeaseRead = migration.indexOf(
      "select * into v_lease from private.cms_qa_actor_leases lease",
      exportLock,
    );
    expect(exportLock).toBeGreaterThan(-1);
    expect(exportLeaseRead).toBeGreaterThan(exportLock);
    expect(migration).toContain("zzz_cms_forms_leads_terminal_cleanup");
    expect(migration).toContain("QA synthetic lease terminal cleanup");
    expect(migration).toContain("CMS_QA_FORMS_LEADS_CLEANUP_INCOMPLETE");
    expect(migration).toContain("where lead.form_id=any(v_form_ids)");
  });

  it("creates forms and leads only through governed real UI before fixture adoption", () => {
    expect(fixture).toContain('fixtureProvisioning: "actors-and-prerequisites-only"');
    expect(fixture).toContain("formsCreatedByFixture: 0");
    expect(fixture).toContain("leadsCreatedByFixture: 0");
    expect(fixture).toContain("bindUiCreatedStateToFixture");
    expect(fixture).not.toContain("async function cmsLeadsCommand");
    expect(finalCoverage).toContain('getByRole("button", { name: "Novo formulário", exact: true }).click()');
    expect(finalCoverage).toContain('"cms-leads",\n    "save_form"');
    expect(finalCoverage).toContain('"cms-leads",\n    "publish_form"');
    expect(finalCoverage).toContain(
      'new URL(response.url()).pathname.endsWith("/functions/v1/lead-capture")',
    );
    expect(finalCoverage).toContain("writeCmsUiCreatedState");
    expect(uiCreatedState).toContain("QA_CMS_UI_STATE_BINDING_INVALID");
    expect(uiCreatedState).toContain('form.status !== "published"');
    expect(formsPage).toContain('action: "list_forms"');
    expect(formsPage).toContain("expectedLockVersion");
    expect(leadsPage).toContain('action: "list_leads"');
    expect(formsPage).not.toMatch(/\.from\("cms_form/);
    expect(leadsPage).not.toMatch(/\.from\("cms_lead/);
  });

  it("covers direct RLS, IDOR, expiration, assignment, delivery and cleanup in pgTAP", () => {
    expect(pgTap).toContain("select plan(");
    expect(pgTap).toContain("corporate cannot read the QA form by UUID");
    expect(pgTap).toContain("QA cannot read a corporate lead by UUID");
    expect(pgTap).toContain("QA cannot assign a corporate operator");
    expect(pgTap).toContain("expired QA cannot list forms");
    expect(pgTap).toContain("synthetic outbox is never externally deliverable");
    expect(pgTap).toContain("terminal cleanup anonymizes every lead on the QA form");
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
