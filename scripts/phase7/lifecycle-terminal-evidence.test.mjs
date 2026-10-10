import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateStagingEvidence } from "../ev2/phase12/verify-staging-evidence.mjs";
import {
  finalizeLifecycleEvidence,
  LifecycleCleanupError,
  lifecycleCleanupDiagnostic,
  lifecycleFailure,
} from "./lifecycle-terminal-evidence.mjs";

test("cleanup failure preserves primary failure and still fails closed", async () => {
  let calls = 0;
  const report = await finalizeLifecycleEvidence(
    { status: "failed", error: "PRIMARY", evidence: [] },
    async () => {
      calls++;
      throw new LifecycleCleanupError([
        lifecycleCleanupDiagnostic("overrides:private-actor", { code: "57014", message: "secret" }),
      ]);
    },
  );
  assert.equal(calls, 1);
  assert.equal(report.error, "PRIMARY");
  assert.equal(report.status, "failed");
  assert.equal(report.cleanup.zeroActiveResidueProved, false);
  assert.deepEqual(report.cleanup.diagnostics, [{ stage: "overrides", sqlstate: "57014" }]);
  assert.doesNotMatch(JSON.stringify(report), /private-actor|secret/);
});

test("passed operation cannot conceal failed cleanup, including unknown errors", async () => {
  const report = await finalizeLifecycleEvidence({ status: "passed" }, async () => {
    throw Error("secret payload");
  });
  assert.equal(report.status, "failed");
  assert.equal(report.error, "G7_LIFECYCLE_CLEANUP_INCOMPLETE");
  assert.deepEqual(report.cleanup.diagnostics, [{ stage: "unknown" }]);
  assert.doesNotMatch(JSON.stringify(report), /secret payload/);
});

test("successful cleanup preserves exact outcome and performs no retry", async () => {
  const cleanup = { actorLeasesCleaned: 3, retainedLeaseAuditEvents: 15 };
  for (const status of ["passed", "failed"]) {
    let calls = 0;
    const report = await finalizeLifecycleEvidence({ status }, async () => {
      calls++;
      return cleanup;
    });
    assert.equal(calls, 1);
    assert.equal(report.status, status);
    assert.equal(report.cleanup, cleanup);
  }
});

test("cleanup diagnostics exclude arbitrary stages, messages, codes and actor identifiers", () => {
  assert.deepEqual(lifecycleCleanupDiagnostic("unknown-secret", { code: "secret", message: "payload" }), {
    stage: "unknown",
  });
  assert.deepEqual(lifecycleCleanupDiagnostic("lease:secret", { code: "42501" }), {
    stage: "lease",
    sqlstate: "42501",
  });
  const error = new LifecycleCleanupError([{ stage: "secret", sqlstate: "secret" }]);
  assert.deepEqual(error.diagnostics, [{ stage: "unknown" }]);
});

test("primary error retains only a closed invocation prefix", () => {
  assert.equal(
    lifecycleFailure(Error('cms-content/publish retornou 500, esperado 200: {"token":"secret"}')),
    "cms-content/publish retornou 500, esperado 200",
  );
  assert.equal(
    lifecycleFailure(Error("G7_SCHEDULED_PUBLICATION_READ_FAILED:items:secret")),
    "G7_SCHEDULED_PUBLICATION_READ_FAILED",
  );
  assert.equal(
    lifecycleFailure(Error("G7_CAMPAIGN_EXPIRY_STATE_REFUSED:private-payload")),
    "G7_CAMPAIGN_EXPIRY_STATE_REFUSED",
  );
  for (const error of [
    Error("Bearer secret"),
    Error("cms-other/send retornou 500, esperado 200"),
    Error("cms-content/send-secret retornou 500, esperado 200"),
    Error("cms-content/private_secret retornou 500, esperado 200"),
    Error("cms-leads/publish retornou 500, esperado 200"),
    { message: "payload" },
  ]) {
    assert.equal(lifecycleFailure(error), "G7_LIFECYCLE_OPERATION_FAILED");
  }
});

test("driver emits publication diagnostics immediately and terminal failure remains blocking", () => {
  const source = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  assert.match(source, /editorialDiagnostics\.push\(diagnostic\);\s*process\.stderr\.write/);
  assert.equal(source.match(/process\.stdout\.write/g)?.length, 1);
  assert.match(source, /process\.stdout\.write\(`\$\{JSON\.stringify\(report, null, 2\)\}\\n`\)/);
  assert.match(
    source,
    /report = await finalizeLifecycleEvidence\(report, cleanup\);\s*if \(report\.status === "failed"\) process\.exitCode = 1;/,
  );
  assert.match(source, /throw new LifecycleCleanupError\(cleanupErrors\)/);
  assert.match(source, /assert\(archivedPage\.status === 404,/);
});

test("canonical evidence gate receives one JSON document and refuses cleanup failure", async () => {
  for (const cleanupFails of [false, true]) {
    const report = await finalizeLifecycleEvidence({ status: "passed" }, async () => {
      if (cleanupFails) throw new LifecycleCleanupError([{ stage: "overrides", sqlstate: "57014" }]);
      return { actorLeasesCleaned: 3 };
    });
    const contents = `${JSON.stringify({ ...report, editorialDiagnostics: [{ event: "diagnostic" }] }, null, 2)}\n`;
    assert.equal(evaluateStagingEvidence("lifecycle.json", contents).valid, !cleanupFails);
    assert.deepEqual(
      evaluateStagingEvidence("lifecycle.json", contents).violations,
      cleanupFails ? ["evidence_status_failed:failed"] : [],
    );
    assert.equal(
      evaluateStagingEvidence("lifecycle.json", `{"event":"diagnostic"}\n${contents}`).valid,
      false,
    );
  }
});
