import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SERVICE_VOCABULARY_SOURCES, serviceVocabularySemanticSql } from "./staging-service-vocabulary.mjs";

const migration = readFileSync("supabase/migrations/0121_cms_qa_service_vocabulary.sql", "utf8").replaceAll(
  "\r\n",
  "\n",
);
const digest = (value) => createHash("sha256").update(value).digest("hex");

test("source-bound recipe changes only reviewed bodies while preserving security attributes", () => {
  const match = migration.match(/\$service_bindings\$([\s\S]+?)\$service_bindings\$::jsonb/);
  const recipes = JSON.parse(match[1]);
  assert.equal(recipes.length, 3);
  for (const recipe of recipes) {
    assert.match(recipe.before_sha256, /^[a-f0-9]{64}$/);
    assert.equal(
      SERVICE_VOCABULARY_SOURCES.find(([signature]) => signature === recipe.signature)?.[1],
      recipe.after_sha256,
    );
    assert.ok(recipe.edits.every((edit) => edit.old_text.length > 0 && edit.new_text.length > 0));
  }
  for (const guard of [
    "CMS_QA_SERVICE_SOURCE_DRIFT",
    "CMS_QA_SERVICE_REPLACEMENT_DRIFT",
    "CMS_QA_SERVICE_PLAN_DRIFT",
    "CMS_QA_SERVICE_POSTCONDITION_DRIFT",
  ])
    assert.ok(migration.includes(guard));
  assert.ok(migration.includes("to_jsonb(p) - 'prosrc'"));
  assert.ok(migration.includes("set local lock_timeout = '5s'"));
  assert.ok(migration.includes("set local statement_timeout = '30s'"));
  assert.ok(!/disable trigger|disable row level|grant .*authenticated|drop policy/i.test(migration));
});

test("new private helpers are byte-bound, staging-only and never shared across actors", () => {
  for (const [signature, expected] of SERVICE_VOCABULARY_SOURCES.filter(
    ([signature]) =>
      signature.includes("shared_list_allowed_0121") ||
      signature.includes("scope_allowed_0121") ||
      signature.includes("archived_service_reference_exact_0121"),
  )) {
    const name = signature.slice(0, signature.indexOf("("));
    const at = migration.indexOf(`create function ${name}(`);
    const start = migration.indexOf("as $$", at) + 5,
      end = migration.indexOf("$$;", start);
    assert.equal(digest(migration.slice(start, end)), expected);
    assert.ok(
      migration.includes(
        `revoke all on function ${signature.replace("timestamp with time zone", "timestamptz")}`,
      ),
    );
  }
  for (const guard of [
    "p_environment = 'staging'",
    "caller.expires_at > statement_timestamp()",
    "cms_qa_actor_marker_is_exact",
    "not option.public_visible",
    "private.cms_qa_archived_service_reference_exact_0121(",
    "option.created_by = p_actor_id and option.updated_by = p_actor_id",
    "service_category",
  ])
    assert.ok(migration.includes(guard));
  const canonical = readFileSync("supabase/migrations/0078_cms_product_pim_consolidation.sql", "utf8");
  assert.ok(canonical.includes("No sixth list key receives this exception"));
});

test("terminal compensation is a separate source-bound trigger without weakening product cleanup", () => {
  const clone = JSON.parse(migration.match(/\$cleanup_binding\$([\s\S]+?)\$cleanup_binding\$::jsonb/)[1]);
  assert.equal(clone.signature, "private.cms_cleanup_terminal_product_shared_options_0078()");
  assert.equal(clone.new_signature, "private.cms_cleanup_terminal_service_shared_options_0121()");
  assert.equal(
    SERVICE_VOCABULARY_SOURCES.find(([signature]) => signature === clone.new_signature)?.[1],
    clone.after_sha256,
  );
  for (const guard of [
    "CMS_QA_SERVICE_COMPENSATOR_NAME_DRIFT",
    "CMS_QA_SERVICE_COMPENSATOR_SOURCE_DRIFT",
    "CMS_QA_SERVICE_COMPENSATOR_POSTCONDITION_DRIFT",
    "old.environment = 'staging'",
    "not option.public_visible",
    "before update of status on private.cms_qa_actor_leases",
  ])
    assert.ok(migration.includes(guard));
  assert.ok(migration.includes("where p.oid = v_old) <> v_binding ->> 'before_sha256'"));
});

test("semantic gates bind hashes, ACLs, search paths and the precise terminal trigger", () => {
  const sql = serviceVocabularySemanticSql("service_contract_exact");
  for (const [, hash] of SERVICE_VOCABULARY_SOURCES) assert.ok(sql.includes(hash));
  for (const guard of [
    "p.prosecdef is not true",
    "p.proconfig is distinct",
    "acl.grantee <> p.proowner",
    "coalesce(role.rolname = 'service_role', false)",
    "t.tgtype = 19",
    "t.tgattr::text",
    "t.tgqual is null",
  ])
    assert.ok(sql.includes(guard));
  assert.throws(() => serviceVocabularySemanticSql("bad;select"), /ALIAS_INVALID/);
  for (const file of [
    "scripts/ev2/phase12/verify-staging-database.mjs",
    "scripts/ev2/phase12/staging-migrations-canary.mjs",
  ])
    assert.ok(
      readFileSync(file, "utf8").includes('serviceVocabularySemanticSql("qa_service_vocabulary_0121_exact")'),
    );
  const compatibility = readFileSync("scripts/ev2/phase12/verify-backend-forward-compatibility.mjs", "utf8");
  assert.ok(compatibility.includes('"0121": ['));
  assert.ok(compatibility.includes('"supabase/tests/rls_cms_qa_service_vocabulary.test.sql"'));
  assert.ok(compatibility.includes('"supabase/tests/rls_cms_qa_service_legacy_scope.test.sql"'));
});
