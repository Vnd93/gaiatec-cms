import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/0118_cms_catalog_qa_durable_recovery.sql", "utf8");
const databaseTests = readFileSync("supabase/tests/rls_catalog_qa_durable_recovery.test.sql", "utf8");

describe("catalog durable QA recovery boundary", () => {
  it("prepares exact release and deployment bindings before mutation", () => {
    for (const field of [
      "candidate_sha",
      "artifact_digest",
      "deployment_id",
      "backend_snapshot_digest",
      "recovery_digest",
      "prepared_xid",
    ]) {
      expect(migration).toContain(field);
    }
    expect(migration).toContain("check(environment='staging')");
    expect(migration).toContain("m.prepared_xid<>pg_catalog.pg_current_xact_id()");
    expect(migration).toContain("CMS_CATALOG_RECOVERY_PREEXISTING_MUTATION");
    expect(migration).toContain("CMS_CATALOG_RECOVERY_GROUP_INCOMPLETE");
  });

  it("does not grant recovery authority to clients, service RPCs or GUCs", () => {
    expect(migration).toContain("m.compensation_pid=pg_catalog.pg_backend_pid()");
    expect(migration).toContain("m.state='compensating'");
    expect(migration).toContain("l.created_at=a.lease_created_at and l.expires_at=a.lease_expires_at");
    expect(migration).not.toMatch(/set_config\('request\.jwt\./);
    expect(migration).not.toMatch(/disable trigger|session_replication_role|grant .* to service_role/i);
    expect(migration).toContain(
      "revoke all on function private.cms_catalog_compensate_qa_recovery(uuid) from public,anon,authenticated,service_role",
    );
    expect(migration).toContain("if v_actor is not null then return v_actor; end if;");
  });

  it("fences every catalog surface and rejects foreign ownership", () => {
    for (const surface of [
      "cms_catalog_products",
      "cms_catalog_taxonomy_terms",
      "cms_catalog_product_relation_revisions",
      "cms_catalog_product_hierarchy_revisions",
      "cms_catalog_product_terms",
      "cms_catalog_editorial_revisions",
    ]) {
      expect(migration).toContain(`'${surface}'`);
    }
    expect(migration).toContain("CMS_CATALOG_QA_FOREIGN_REFERENCE");
    expect(migration).toContain("CMS_CATALOG_QA_OWNERSHIP_REQUIRED");
    expect(migration).toContain("CMS_CATALOG_RECOVERY_FOREIGN_STATE");
    expect(migration).toContain("catalog_qa_override_recovery_fence");
  });

  it("retires active state without deleting revisions, audit or snapshots", () => {
    expect(migration).not.toMatch(
      /delete from public\.cms_catalog_(?:.*revisions|.*snapshots|audit_events)/i,
    );
    expect(migration).toContain("'retracted'");
    expect(migration).toContain("'unpublished'");
    expect(migration).toContain("catalog_lifecycle_state='archived'");
    expect(migration).toContain("status='superseded'");
    expect(migration).toContain("CMS_CATALOG_RECOVERY_ACTIVE_RESIDUE");
    expect(migration).toContain("if m.state='cleaned' then return; end if;");
    expect(migration).toContain("zzy_catalog_durable_terminal_recovery");
  });

  it("keeps positive rollback tests distinct from committed staging evidence", () => {
    expect(databaseTests).toContain("NOT evidence of a committed hosted manifest");
    expect(databaseTests).toContain("same-transaction preparation cannot authorize first mutation");
    expect(databaseTests).toContain("another backend PID cannot use compensation authority");
    expect(databaseTests).toContain("immutable audit survives compensation");
    expect(databaseTests).toMatch(/rollback;\s*$/);
  });
});
