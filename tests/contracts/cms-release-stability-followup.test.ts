import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const migrationPath = path.join(root, "supabase/migrations/0101_cms_release_stability_followup.sql");
const migration = readFileSync(migrationPath, "utf8");

describe("CMS release stability follow-up", () => {
  it("returns exact replay receipts only after every current security boundary", () => {
    const retryStart = migration.indexOf("create or replace function public.cms_retry_lead_delivery_scoped(");
    const retryEnd = migration.indexOf(
      "create or replace function private.cms_qa_archived_product_reference_exact_0101(",
    );
    const retry = migration.slice(retryStart, retryEnd);
    const inputGate = retry.indexOf("CMS_LEAD_DELIVERY_RETRY_INVALID");
    const systemGate = retry.indexOf("cms_system_assert_available");
    const leaseLock = retry.indexOf("cms_lock_active_qa_actor_leases");
    const advisoryLock = retry.indexOf("cms:lead-delivery-idempotency:");
    const receiptLock = retry.indexOf("for update;");
    const conflict = retry.indexOf("CMS_LEAD_DELIVERY_IDEMPOTENCY_CONFLICT");
    const targetScope = retry.indexOf("cms_lead_scope_allowed");
    const duplicate = retry.indexOf("'duplicate',true");
    const core = retry.indexOf("cms_retry_lead_delivery_scoped_core_0088", duplicate);

    expect(retryStart).toBeGreaterThan(0);
    expect([
      inputGate,
      systemGate,
      leaseLock,
      advisoryLock,
      receiptLock,
      conflict,
      targetScope,
      duplicate,
      core,
    ]).toEqual(
      [
        ...[
          inputGate,
          systemGate,
          leaseLock,
          advisoryLock,
          receiptLock,
          conflict,
          targetScope,
          duplicate,
          core,
        ],
      ].sort((left, right) => left - right),
    );
    expect(retry.match(/for update;/g)).toHaveLength(1);
    expect(retry).toContain("event.id=v_replay.event_id");
    expect(retry).toContain("event.lead_id=v_replay.lead_id");
    expect(retry).toContain("'correlationId',v_replay.correlation_id");
  });

  it("accepts only exact archived product history and detects textual UUIDs case-insensitively", () => {
    const helperStart = migration.indexOf(
      "create or replace function private.cms_qa_archived_product_reference_exact_0101(",
    );
    const productStart = migration.indexOf(
      "create or replace function private.cms_cleanup_terminal_product_shared_options_0078()",
    );
    const rbacStart = migration.indexOf(
      "create or replace function private.cms_system_rbac_terminal_cleanup()",
    );
    const helper = migration.slice(helperStart, productStart);
    const product = migration.slice(productStart, rbacStart);

    for (const boundary of [
      "cms_qa_actor_marker_is_exact",
      "item.content_type='product'",
      "item.workflow_status='archived'",
      "item.created_by=p_actor_id",
      "item.created_at between lease.created_at and lease.expires_at",
      "p_reference_actor_id=p_actor_id",
      "p_reference_at between lease.created_at and lease.expires_at",
    ])
      expect(helper).toContain(boundary);
    expect(helper).not.toContain("lease.status='active'");
    expect(helper).not.toMatch(/lease\.expires_at\s*>\s*(?:statement_timestamp|clock_timestamp|now)/);
    expect(product).toContain("strpos(lower(projection.payload::text),option_id::text)>0");
    expect(product).toContain("strpos(lower(reference.payload::text),option_id::text)>0");
    expect(product).toContain("CMS_QA_PRODUCT_OPTION_REFERENCE_ACTIVE");
    expect(product.match(/for update;/g)).toHaveLength(1);
    expect(product).not.toMatch(/from public\.cms_content_(?:items|drafts|revisions)[\s\S]{0,160}for update/);
  });

  it("narrows RBAC event cleanup to candidates and retains the authoritative final gate", () => {
    const rbacStart = migration.indexOf(
      "create or replace function private.cms_system_rbac_terminal_cleanup()",
    );
    const rbacEnd = migration.indexOf("do $release_stability_probe$", rbacStart);
    const rbac = migration.slice(rbacStart, rbacEnd);

    for (const source of [
      "cms_audit_log",
      "cms_policy_decisions",
      "cms_assurance_runs",
      "cms_assurance_events",
      "cms_lead_outbox_replays",
      "cms_lead_outbox",
      "cms_collaboration_outbox",
    ])
      expect(rbac).toContain(source);
    expect(rbac).toContain("candidate_correlations(correlation_id) as materialized");
    expect(rbac).toContain("candidate_event_ids(id) as materialized");
    expect(rbac).toContain("allowed_event_ids(id) as materialized");
    expect(rbac.indexOf("candidate_event_ids")).toBeLessThan(
      rbac.indexOf("cms_system_operational_event_scope_allowed"),
    );
    expect(rbac.indexOf("cms_system_operational_event_scope_allowed")).toBeLessThan(
      rbac.indexOf("delete from public.cms_operational_events"),
    );
    expect(rbac).toContain("v_previous_cleanup_actor");
    expect(rbac).toContain("exception when others then");
    expect(rbac.match(/set_config\(\s*'cms\.qa_system_cleanup_actor'/g)).toHaveLength(3);
    expect(migration).not.toMatch(/\bcms_ai\b|\bcreate\s+(?:unique\s+)?index\b/i);
  });

  it("is sealed, CI-covered and remotely verified", () => {
    const digest = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const manifest = readFileSync(path.join(root, "scripts/ev2/phase12/migration-manifest-lib.mjs"), "utf8");
    const forwardCompatibility = readFileSync(
      path.join(root, "scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
      "utf8",
    );
    expect(manifest).toContain("0101_cms_release_stability_followup.sql");
    expect(manifest).toContain(digest);
    expect(forwardCompatibility).toContain('"0101"');
    expect(forwardCompatibility).toContain("supabase/tests/rls_cms_release_stability_followup.test.sql");
    expect(forwardCompatibility).toContain("tests/contracts/cms-release-stability-followup.test.ts");

    for (const verifierPath of [
      "scripts/ev2/phase12/staging-migrations-canary.mjs",
      "scripts/ev2/phase12/verify-staging-database.mjs",
      "scripts/ev2/phase12/verify-production-database.mjs",
    ]) {
      const verifier = readFileSync(path.join(root, verifierPath), "utf8");
      expect(verifier).toContain("releaseStabilityFollowupSemanticSql");
      expect(verifier).toContain(
        'releaseStabilityFollowupSemanticSql("release_stability_followup_0101_semantics_exact")',
      );
    }
  });
});
