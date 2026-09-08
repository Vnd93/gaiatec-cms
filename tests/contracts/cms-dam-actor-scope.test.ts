import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFile(path, "utf8");

describe("DAM actor scope and destructive-operation fencing", () => {
  it("routes GC discovery and every transition through actor-aware RPCs", async () => {
    const [edge, storageRemoval] = await Promise.all([
      read("supabase/functions/cms-media/index.ts"),
      read("supabase/functions/_shared/cms-storage-removal.ts"),
    ]);
    const runGc = edge.slice(
      edge.indexOf('if (command.action === "run_gc")'),
      edge.indexOf("const mutationPermission"),
    );

    expect(runGc).toContain('rpc("cms_list_dam_gc_candidates"');
    expect(runGc).toContain('rpc("cms_prepare_dam_gc"');
    expect(runGc).toContain('rpc("cms_complete_dam_gc"');
    expect(runGc).toContain("...common");
    expect(runGc).toContain("const gcClaimId = crypto.randomUUID()");
    expect(runGc.match(/p_claim_id: gcClaimId/g)).toHaveLength(2);
    expect(runGc.indexOf('rpc("cms_prepare_dam_gc"')).toBeLessThan(
      runGc.indexOf("removeAndVerifyMediaStorageObject"),
    );
    expect(runGc.indexOf("removeAndVerifyMediaStorageObject")).toBeLessThan(
      runGc.indexOf('rpc("cms_complete_dam_gc"'),
    );
    expect(storageRemoval).toContain('.from("cms-media-private").remove([storagePath])');
    expect(storageRemoval.match(/exactMediaStorageObjectPresent\(client, storagePath\)/g)).toHaveLength(2);
    expect(runGc).not.toContain('from("cms_dam_gc_jobs")');
    expect(runGc).not.toMatch(/\.update\s*\(/);
  });

  it("claims finalization before Storage reads and never hard-deletes a duplicate", async () => {
    const edge = await read("supabase/functions/cms-media/index.ts");
    const finalize = edge.slice(
      edge.indexOf("async function finalizeAsset"),
      edge.indexOf("async function handleV1"),
    );

    expect(finalize).toContain('rpc("cms_claim_dam_finalization"');
    expect(finalize).toContain('rpc("cms_finalize_dam_asset"');
    expect(finalize).toContain('rpc("cms_fail_dam_finalization"');
    expect(finalize.indexOf('rpc("cms_claim_dam_finalization"')).toBeLessThan(
      finalize.indexOf("storage.download"),
    );
    expect(finalize).not.toContain("storage.remove");
    expect(finalize).not.toContain('from("cms_media_assets").delete');
    expect(finalize).not.toMatch(/from\("cms_media_assets"\)\.update/);
  });

  it("installs fail-closed rollout tombstones, CAS and QA delete guards", async () => {
    const migration = await read("supabase/migrations/0065_cms_dam_gc_actor_scope.sql");

    for (const marker of [
      "cms_list_dam_gc_candidates",
      "cms_prepare_dam_gc",
      "cms_complete_dam_gc",
      "cms_claim_dam_finalization",
      "cms_fail_dam_finalization",
      "finalization_claim_id",
      "gc_claim_id",
      "processing_claim_id",
      "private.cms_dam_gc_fences",
      "cms.qa_mutation_actor_id",
      "CMS_DAM_GC_ACTOR_SCOPE_FORBIDDEN",
      "CMS_DAM_GC_CAS_CONFLICT",
      "CMS_DAM_GC_GENERATION_CONFLICT",
      "CMS_DAM_GC_ASSET_FENCED",
      "CMS_DAM_FINALIZATION_CAS_CONFLICT",
      "CMS_DAM_GC_ACTOR_CONTEXT_REQUIRED",
      "CMS_DAM_FINALIZATION_CLAIM_REQUIRED",
      "cms_qa_media_asset_delete_lease_guard",
      "cms_qa_media_variant_delete_lease_guard",
      "cms_qa_media_usage_delete_lease_guard",
      "cms_qa_dam_gc_job_mutation_lease_guard",
      "before update or delete on public.cms_dam_gc_jobs",
      "cms_dam_asset_gc_fence_guard",
    ]) {
      expect(migration).toContain(marker);
    }

    expect(migration).toMatch(
      /where job\.id = v_job\.id[\s\S]+job\.status = v_job\.status[\s\S]+job\.attempts = v_job\.attempts[\s\S]+job\.updated_at = v_job\.updated_at/,
    );
    expect(migration).toMatch(/revoke all on function public\.cms_prepare_dam_gc\(uuid\)[\s\S]+service_role/);
    expect(migration).toMatch(
      /revoke all on function public\.cms_finalize_dam_asset\(uuid,uuid,text,bigint,text,integer,integer,jsonb,uuid,text,text,timestamptz\)[\s\S]+service_role/,
    );

    const prepare = migration.slice(
      migration.indexOf("create or replace function public.cms_prepare_dam_gc("),
      migration.indexOf("create or replace function public.cms_complete_dam_gc("),
    );
    const complete = migration.slice(
      migration.indexOf("create or replace function public.cms_complete_dam_gc("),
      migration.indexOf("create or replace function public.cms_claim_dam_finalization("),
    );
    expect(prepare).not.toMatch(/delete from public\.cms_media_assets/);
    expect(prepare).toContain("gc_claim_id = p_claim_id");
    expect(complete).toMatch(/delete from public\.cms_media_assets asset/);
    expect(complete).toContain("asset.lock_version = v_asset.lock_version");
    expect(complete).toContain("fence.claim_id = p_claim_id");
    expect(complete).not.toMatch(/delete from private\.cms_dam_gc_fences/);
    expect(migration).toContain("O UUID fica tombstonado");
  });

  it("enforces disjoint QA and corporate read/create projections", async () => {
    const [edge, migration] = await Promise.all([
      read("supabase/functions/cms-media/index.ts"),
      read("supabase/migrations/0065_cms_dam_gc_actor_scope.sql"),
    ]);

    expect(edge).toContain('rpc("cms_dam_actor_scope"');
    expect(edge).toContain('rpc("cms_list_dam_taxonomies_scoped"');
    expect(edge).toContain('.eq("created_by", identity.user.id).eq("source_kind", "synthetic_test")');
    expect(edge).toContain('.neq("source_kind", "synthetic_test")');
    expect(migration).toContain("p_asset_created_by = p_actor_id and p_source_kind = 'synthetic_test'");
    expect(migration).toContain("p_source_kind <> 'synthetic_test'");
    expect(migration).toContain("CMS_DAM_QA_SOURCE_KIND_INVALID");
    expect(migration).toContain("cms_media_sha256_corporate_uidx");
    expect(migration).toContain("cms_media_sha256_qa_actor_uidx");
    expect(migration).toMatch(
      /duplicate\.archived_at is null[\s\S]+private\.cms_dam_asset_in_actor_scope\([\s\S]+duplicate\.created_by,[\s\S]+duplicate\.source_kind/,
    );
  });

  it("applies the actor lease boundary to direct PostgREST media reads", async () => {
    const [migration, pgTap] = await Promise.all([
      read("supabase/migrations/0065_cms_dam_gc_actor_scope.sql"),
      read("supabase/tests/rls_ev2_phase5_dam.test.sql"),
    ]);

    for (const policy of [
      "cms_media_authorized_read",
      "cms_media_variants_authorized_read",
      "cms_media_usages_authorized_read",
    ]) {
      expect(migration).toContain(`drop policy if exists ${policy}`);
      expect(migration).toContain(`create policy ${policy}`);
    }
    expect(migration).toContain("private.cms_dam_asset_session_scope_allowed");
    expect(migration).toContain("public.cms_dam_asset_session_read_allowed");
    expect(migration).toContain("public.cms_dam_usage_session_read_allowed");
    expect(migration).toContain("lease.expires_at > statement_timestamp()");
    expect(migration).toContain("p_asset_created_at >= lease.created_at");
    expect(migration).toContain("private.cms_qa_actor_marker_is_exact");
    expect(migration).toMatch(
      /create policy cms_media_variants_authorized_read[\s\S]+cms_dam_asset_session_read_allowed\(asset_id\)/,
    );
    expect(migration).toMatch(
      /create policy cms_media_usages_authorized_read[\s\S]+cms_dam_usage_session_read_allowed\(asset_id, item_id\)/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.cms_dam_asset_session_read_allowed\(uuid\)[\s\S]+service_role;[\s\S]+grant execute[\s\S]+to authenticated/,
    );
    expect(pgTap).toContain("set local role authenticated");
    expect(pgTap).toContain("direct QA media read cannot see a corporate asset");
    expect(pgTap).toContain("outside the active lease window");
    expect(pgTap).toContain("direct corporate media read excludes every synthetic QA asset");
    expect(pgTap).toContain("direct QA usage read requires its own asset and content graph");
    expect(pgTap).toContain("service-role backend retains explicit DAM media access");
  });
});
