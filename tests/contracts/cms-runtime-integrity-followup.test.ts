import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0088_cms_runtime_integrity_followup.sql", "utf8");

describe("CMS runtime integrity follow-up rollout", () => {
  it("repairs progressive media usage resolution without rewriting history", () => {
    expect(migration).toContain("progressive.promoted_item_id = item.id");
    expect(migration).toContain("CMS_RUNTIME_FOLLOWUP_MEDIA_USAGE_REPAIR_NOT_INSTALLED");
    expect(migration).not.toMatch(/join public\.cms_content_drafts_v2 progressive on progressive\.item_id/);
  });

  it("keeps malformed AI calls opaque and returns the explicit MFA contract for AAL1", () => {
    const aalGate = migration.indexOf("if p_aal is distinct from 'aal2' then");
    const mfaError = migration.indexOf("CMS_AI_MFA_REQUIRED", aalGate);
    const actorScope = migration.indexOf("cms_user_actor_context_active", mfaError);
    expect(aalGate).toBeGreaterThan(0);
    expect(mfaError).toBeGreaterThan(aalGate);
    expect(actorScope).toBeGreaterThan(mfaError);
  });

  it("restores every DAM GC capability in success and exception paths", () => {
    for (const setting of [
      "cms.qa_mutation_actor_id",
      "cms.qa_compensating",
      "cms.dam_gc_operation",
      "cms.dam_gc_claim_id",
    ]) {
      expect(migration.split(`set_config('${setting}'`).length - 1).toBeGreaterThanOrEqual(4);
    }
    expect(migration).toContain("cms_prepare_dam_gc_core_0088");
    expect(migration).toContain("cms_complete_dam_gc_core_0088");
    expect(migration).toContain("v_mutation_is_claim_only");
    expect(migration).toContain("new.lock_version=old.lock_version+1");
  });

  it("clones deployed cores while preserving every public RPC OID", () => {
    expect(migration).toContain("pg_get_functiondef(v_source::oid)");
    expect(migration).toContain("cms.runtime_followup.public_oid_");
    expect(migration).not.toMatch(/rename to cms_(?:prepare|complete|retry|execute).*_core_0088/);
    for (const rpc of [
      "cms_prepare_dam_gc",
      "cms_complete_dam_gc",
      "cms_retry_lead_delivery_scoped",
      "cms_execute_dam_command",
    ]) {
      expect(migration).toContain(`create or replace function public.${rpc}(`);
    }
  });

  it("serializes lead-delivery idempotency before resolving the target event", () => {
    const retry = migration.indexOf("create or replace function public.cms_retry_lead_delivery_scoped(");
    const advisory = migration.indexOf("cms:lead-delivery-idempotency:", retry);
    const receipt = migration.indexOf("from public.cms_lead_outbox_replays replay", retry);
    const delegatedCore = migration.indexOf("cms_retry_lead_delivery_scoped_core_0088", receipt);
    expect(retry).toBeGreaterThan(0);
    expect(advisory).toBeGreaterThan(retry);
    expect(receipt).toBeGreaterThan(advisory);
    expect(delegatedCore).toBeGreaterThan(receipt);
  });

  it("keeps public RPCs service-only and preserved cores owner-only", () => {
    for (const core of [
      "cms_prepare_dam_gc_core_0088",
      "cms_complete_dam_gc_core_0088",
      "cms_retry_lead_delivery_scoped_core_0088",
      "cms_execute_dam_command_core_0088",
    ]) {
      expect(migration).toContain(`revoke all on function public.${core}`);
    }
    expect(migration).toContain("revoke create on schema public from public,anon,authenticated,service_role");
    expect(migration).toContain("runtime_followup_acl_scrub");
    expect(migration).toContain("CMS_RUNTIME_FOLLOWUP_RPC_ACL_INVALID");
    expect(migration).toContain("CMS_RUNTIME_FOLLOWUP_CORE_ACL_INVALID");
  });
});
