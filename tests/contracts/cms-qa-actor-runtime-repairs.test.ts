import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0086_cms_qa_actor_runtime_repairs.sql", "utf8");

describe("QA actor runtime repairs", () => {
  it("treats only an exact synthetic marker as QA and aligns same-transaction provenance", () => {
    expect(migration).toContain("v_created_at timestamptz := transaction_timestamp();");
    expect(migration).toMatch(
      /if \(\s*new\.raw_user_meta_data -> 'synthetic' = 'true'::jsonb[\s\S]*?\) is not true then/,
    );
    expect(migration).toContain("if coalesce(new.raw_user_meta_data -> 'synthetic' = 'true'::jsonb, false)");
    expect(migration).toContain("CMS_QA_ACTOR_CAPTURE_PREDICATE_DRIFT");
  });

  it("generates valid cleanup correlation IDs without reading absent lease columns", () => {
    expect(migration.match(/v_correlation_id uuid:=gen_random_uuid\(\);/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("old.actor_id,'ai_qa_scope_terminal',v_correlation_id");
    expect(migration.match(/\),v_correlation_id/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("CMS_QA_FORMS_CLEANUP_CORRELATION_USE_DRIFT");
    expect(migration).toContain("CMS_QA_AI_AUDIT_CORRELATION_DRIFT");
  });

  it("keeps every repaired trigger private after CREATE OR REPLACE", () => {
    for (const routine of [
      "private.cms_capture_qa_actor_lease()",
      "private.cms_prepare_qa_actor_terminal_forms_leads_cleanup()",
      "private.cms_ai_terminalize_qa_actor_graph()",
      "public.cms_open_draft_after_edit()",
    ]) {
      expect(migration).toContain(`revoke all on function ${routine}`);
    }
  });

  it("prevents compensation restores from reopening a published item as draft", () => {
    expect(migration).toMatch(
      /create or replace function public\.cms_open_draft_after_edit\(\)[\s\S]*?current_setting\('cms\.qa_compensating', true\) = 'on'[\s\S]*?current_setting\('cms\.qa_restore_item', true\) = new\.item_id::text[\s\S]*?return new/,
    );
  });
});
