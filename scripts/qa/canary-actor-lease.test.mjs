import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  QA_ACTOR_LEASE_TTL_MINUTES,
  assertQaActorLease,
  completeQaActorLease,
  createQaRunTag,
  qaActorMetadata,
} from "./qa-actor-lease.mjs";

const candidateSha = "a".repeat(40);
const runTag = "QA-CMS-FINAL-20260907-aaaaaaaa";
const actorId = "10000000-0000-4000-8000-000000000001";
const identity = { actorId, runTag, candidateSha, environment: "staging" };

function lease(status) {
  return {
    schemaVersion: 1,
    status,
    environment: "staging",
    candidateSha,
    runTag,
    ttlSeconds: QA_ACTOR_LEASE_TTL_MINUTES * 60,
    failureCount: 0,
    swept: false,
  };
}

test("QA actor metadata is exact, SHA-bound and accepted only with an exact run tag", () => {
  assert.equal(createQaRunTag(candidateSha, new Date("2026-09-07T23:59:59Z")), runTag);
  assert.deepEqual(qaActorMetadata(runTag, candidateSha, "staging"), {
    synthetic: true,
    purpose: "qa-cms-browser",
    runTag,
    candidateSha,
    environment: "staging",
  });
  assert.throws(() => createQaRunTag("short"), /QA_ACTOR_LEASE_SHA_INVALID/);
  assert.throws(
    () => qaActorMetadata("QA-CMS-FINAL-20260907-bbbbbbbb", candidateSha, "staging"),
    /QA_ACTOR_LEASE_RUN_TAG_INVALID/,
  );
  assert.throws(() => qaActorMetadata(runTag, candidateSha, "local"), /QA_ACTOR_LEASE_ENVIRONMENT_INVALID/);
});

test("lease verification sends the exact identity and fails closed on an altered response", async () => {
  const calls = [];
  const result = await assertQaActorLease(async (name, body) => {
    calls.push({ name, body });
    return lease("active");
  }, identity);
  assert.equal(result.status, "active");
  assert.deepEqual(calls, [
    {
      name: "cms_qa_actor_lease_status",
      body: {
        p_actor_id: actorId,
        p_run_tag: runTag,
        p_candidate_sha: candidateSha,
        p_environment: "staging",
      },
    },
  ]);
  await assert.rejects(
    () => assertQaActorLease(async () => ({ ...lease("active"), candidateSha: "b".repeat(40) }), identity),
    /QA_ACTOR_LEASE_STATUS_INVALID/,
  );
});

test("explicit completion is followed by an authoritative cleaned-status read", async () => {
  const calls = [];
  const result = await completeQaActorLease(async (name, body) => {
    calls.push({ name, body });
    if (name === "cms_complete_qa_actor_lease")
      return { schemaVersion: 1, status: "cleaned", replayed: false };
    return lease("cleaned");
  }, identity);
  assert.equal(result.status, "cleaned");
  assert.deepEqual(
    calls.map((call) => call.name),
    ["cms_complete_qa_actor_lease", "cms_qa_actor_lease_status"],
  );
});

test("all final staging canaries lease before privilege and revoke every active access surface", async () => {
  const [g11, g17, phase7, watchdog] = await Promise.all([
    readFile("scripts/ev2/phase11/staging-canary.mjs", "utf8"),
    readFile("scripts/ev2/phase17/staging-canary.mjs", "utf8"),
    readFile("scripts/phase7/staging-roundtrip.mjs", "utf8"),
    readFile("supabase/migrations/0061_cms_qa_actor_lease_watchdog.sql", "utf8"),
  ]);

  for (const source of [g11, g17, phase7]) {
    assert.match(source, /qaActorMetadata\(/);
    assert.match(source, /assertQaActorLease\(/);
    assert.match(source, /completeQaActorLease\(/);
    assert.match(source, /cms_scoped_role_assignments/);
    assert.match(source, /cms_user_roles/);
    assert.match(source, /rdo_user_access/);
    assert.match(source, /cms_publication_outbox/);
    assert.match(source, /cms_publications/);
    assert.match(source, /cms_published_projection/);
    assert.match(source, /cms_route_rules/);
    assert.match(source, /workflow_status: "archived"/);
    assert.match(source, /delete from auth\.sessions where user_id/);
    assert.match(source, /sessions_valid_after/);
    assert.match(source, /ban_duration: "876000h"/);
  }
  assert.match(
    g11,
    /actorIds\.push\(created\.json\.id\);[\s\S]*assertQaActorLease\([\s\S]*await rest\(ctx, "cms_profiles"/,
  );
  assert.match(
    g17,
    /actor = \{ id: created\.json\.id \};[\s\S]*assertQaActorLease\([\s\S]*await rest\("cms_profiles"/,
  );
  assert.match(
    phase7,
    /createdUsers\.push\(actor\);\s*actor\.lease = await assertQaActorLease[\s\S]*from\("cms_profiles"\)\.insert/,
  );
  assert.doesNotMatch(g17, /method: "DELETE",\s*headers: context\.serviceHeaders/);
  assert.doesNotMatch(phase7, /deleteUser\(/);
  assert.match(watchdog, /'\* \* \* \* \*'/);
  assert.match(watchdog, /where lease\.status = 'active' and lease\.expires_at <= clock_timestamp\(\)/);
});
