import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  runSnapshotDiagnostic,
  snapshotDiagnosticRequested,
  SNAPSHOT_DATABASE_DIAGNOSTIC_SQL,
} from "./snapshot-diagnostic-lib.mjs";

const sha = "a".repeat(40);
const counter = (calls, reset = "2026-10-10T00:00:00Z") => [
  {
    operation: "snapshot",
    calls,
    total_ms: calls * 10,
    shared_hits: calls * 100,
    shared_reads: 0,
    stats_reset: reset,
  },
];
const response = () => ({
  status: 200,
  durationMs: 30,
  headers: new Headers({
    "server-timing": "admin-read;dur=20,admin-rpc;dur=18,admin-rate-limit;dur=1,admin-snapshot-db;dur=10",
  }),
  json: { environment: "staging", containsPersonalData: false, ignored: "SENSITIVE_SENTINEL" },
});

test("focused diagnostics are explicit, local-only and require a durable report destination", () => {
  assert.equal(snapshotDiagnosticRequested([], {}), false);
  assert.equal(
    snapshotDiagnosticRequested(["--snapshot-diagnostic"], { EV2_G11_REPORT_PATH: "output.json" }),
    true,
  );
  for (const env of [{ CI: "true" }, { GITHUB_ACTIONS: "true" }, {}])
    assert.throws(() => snapshotDiagnosticRequested(["--snapshot-diagnostic"], env));
  assert.throws(() =>
    snapshotDiagnosticRequested(["--snapshot-diagnostic", "--extra"], { EV2_G11_REPORT_PATH: "output.json" }),
  );
});

test("one serial window retains 20 warmups and 20 measured server samples, never release approval", async () => {
  let calls = 0;
  let databaseReads = 0;
  const evidence = await runSnapshotDiagnostic({
    sourceSha: sha,
    servedReleaseSha: "b".repeat(40),
    readSnapshot: async () => {
      calls++;
      return response();
    },
    readDatabase: async (query) => {
      assert.equal(query, SNAPSHOT_DATABASE_DIAGNOSTIC_SQL);
      return counter(++databaseReads === 1 ? 10 : 50);
    },
  });
  assert.equal(calls, 40);
  assert.equal(databaseReads, 2);
  assert.equal(evidence.samples.filter((sample) => sample.phase === "warmup").length, 20);
  assert.equal(evidence.samples.filter((sample) => sample.phase === "measured").length, 20);
  assert.equal(evidence.adminReadP95Ms, 20);
  assert.equal(evidence.releaseEligible, false);
  assert.equal(evidence.database.delta.calls, 40);
  assert.ok(
    evidence.samples.every((sample) => Date.parse(sample.finishedAt) >= Date.parse(sample.startedAt)),
  );
  assert.ok(!JSON.stringify(evidence).includes("SENSITIVE_SENTINEL"));
});

test("changed or decreasing statistics cannot be used as a comparable delta", async () => {
  for (const after of [counter(5), counter(50, "2026-10-10T01:00:00Z")]) {
    let calls = 0;
    const evidence = await runSnapshotDiagnostic({
      sourceSha: sha,
      servedReleaseSha: sha,
      readSnapshot: async () => response(),
      readDatabase: async () => (++calls === 1 ? counter(10) : after),
    });
    assert.equal(evidence.database.comparable, false);
    assert.equal(evidence.database.delta, null);
  }
});

test("malformed identity, counters and response timing fail closed without retries", async () => {
  await assert.rejects(() => runSnapshotDiagnostic({ sourceSha: "bad", servedReleaseSha: sha }));
  await assert.rejects(() =>
    runSnapshotDiagnostic({ sourceSha: sha, servedReleaseSha: sha, readDatabase: async () => [] }),
  );
  for (const patch of [
    { status: 503 },
    { headers: new Headers() },
    { durationMs: NaN },
    { json: { environment: "production", containsPersonalData: false } },
  ]) {
    let calls = 0;
    await assert.rejects(() =>
      runSnapshotDiagnostic({
        sourceSha: sha,
        servedReleaseSha: sha,
        readDatabase: async () => counter(10),
        readSnapshot: async () => {
          calls++;
          return { ...response(), ...patch };
        },
      }),
    );
    assert.equal(calls, 1);
  }
});

test("the database diagnostic is read-only and does not expose SQL or identities", () => {
  assert.doesNotMatch(
    SNAPSHOT_DATABASE_DIAGNOSTIC_SQL,
    /\b(?:insert|update|delete|alter|create|set|truncate|reset)\b/i,
  );
  assert.doesNotMatch(SNAPSHOT_DATABASE_DIAGNOSTIC_SQL, /actor_id|user_id|session_id|email|token/i);
  assert.match(SNAPSHOT_DATABASE_DIAGNOSTIC_SQL, /query not like '%pg_stat_statements%'/);
});

test("focused mode shares lease, MFA and terminal cleanup but cannot become a canonical pass", () => {
  const canary = readFileSync("scripts/ev2/phase11/staging-canary.mjs", "utf8");
  const focused = canary.slice(
    canary.indexOf("if (snapshotDiagnostic) {"),
    canary.indexOf("await createQaFixtureForm(context);"),
  );
  assert.match(focused, /runSnapshotDiagnostic/);
  assert.doesNotMatch(focused, /createSyntheticLead|record_run|review_run|createQaFixtureForm/);
  assert.ok(canary.indexOf("qa_actor_watchdog_leases_active") < canary.indexOf("if (snapshotDiagnostic) {"));
  assert.ok(canary.indexOf("production_environment_denied") < canary.indexOf("if (snapshotDiagnostic) {"));
  assert.match(canary, /finally \{[\s\S]*await closeSyntheticResidue\(context\)/);
  assert.match(canary, /remaining\.activeSessions === 0/);
  assert.match(canary, /remaining\.cleanedLeases === actorIds\.length/);
  assert.match(canary, /"supabase@2\.116\.0", \.\.\.args, "--workdir", process\.cwd\(\)/);
  assert.match(canary, /project\.linked !== true/);
  assert.match(canary, /releaseEligible: !snapshotDiagnostic && !operationError && !cleanupError/);
  assert.ok(
    canary.indexOf("writeFileSync(process.env.EV2_G11_REPORT_PATH") <
      canary.lastIndexOf("throw new AggregateError("),
  );
});
