import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/0013_fase3_cms_editorial_foundation.sql";
const contractPath = "src/shared/contracts/cms-content.ts";

test("CMS editorial tables are empty-by-default and versioned", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  for (const table of [
    "cms_taxonomy_terms",
    "cms_content_items",
    "cms_content_drafts",
    "cms_content_revisions",
    "cms_content_taxonomy",
    "cms_publications",
    "cms_publication_outbox",
    "cms_editorial_command_receipts",
  ]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.doesNotMatch(sql, /insert into public\.cms_(taxonomy|content|publication)/);
  assert.match(sql, /source_draft_version/);
  assert.match(sql, /lock_version/);
});

test("CMS revisions are immutable and publication is transactional-ready", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  assert.match(sql, /cms_revisions_immutable/);
  assert.match(sql, /cms_reject_immutable_mutation/);
  assert.match(sql, /foreign key \(revision_id, item_id\)/);
  assert.match(sql, /unique \(item_id, revision_id, event_type\)/);
  assert.match(sql, /cms_editorial_transition_allowed/);
  assert.match(sql, /primary key \(actor_id, action, idempotency_key\)/);
});

test("CMS editorial RLS maps each domain to explicit permissions", async () => {
  const sql = (await readFile(migrationPath, "utf8")).toLowerCase();
  for (const scope of ["cms:products.", "cms:services.", "cms:posts.", "cms:homepage."]) {
    assert.match(sql, new RegExp(scope.replace(":", "\\:")));
  }
  assert.match(sql, /cms_can_read_content/);
  assert.match(sql, /revoke all on table[\s\S]*from public, anon, authenticated/);
  const authenticatedGrants = sql.split(";").filter((statement) => statement.includes("to authenticated"));
  for (const statement of authenticatedGrants) {
    assert.doesNotMatch(statement, /grant (insert|update|delete|all) on table/);
  }
});

test("CMS runtime contracts require provenance and confirmed rights", async () => {
  const source = (await readFile(contractPath, "utf8")).toLowerCase();
  assert.match(source, /cmsprovenanceschema/);
  assert.match(source, /official_manufacturer/);
  assert.match(source, /sourcesha256/);
  assert.match(source, /rightsconfirmed: z\.literal\(true\)/);
  assert.match(source, /cmscontentpayloadschema/);
  assert.doesNotMatch(source, /legacyid/);
});
