import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveStagingBridgeAttempts,
  STAGING_FRONTEND_BRIDGE_WORKFLOW_NAME,
} from "./staging-frontend-bridge-lib.mjs";

function fixture(rerun = true) {
  const run = {
    id: 123,
    head_sha: "a".repeat(40),
    status: "completed",
    conclusion: "success",
    run_attempt: rerun ? 2 : 1,
    run_started_at: rerun ? "2026-09-30T13:38:06Z" : "2026-09-30T13:16:53Z",
  };
  const promote = {
    id: 1001,
    run_id: run.id,
    run_attempt: 1,
    head_sha: run.head_sha,
    head_branch: "main",
    workflow_name: STAGING_FRONTEND_BRIDGE_WORKFLOW_NAME,
    name: "promote",
    status: "completed",
    conclusion: "success",
    started_at: "2026-09-30T13:16:58Z",
    completed_at: "2026-09-30T13:27:56Z",
    steps: ["Upload immutable staging bridge evidence", "Enforce terminal staging bridge outcome"].map(
      (name, number) => ({
        number: number + 1,
        name,
        status: "completed",
        conclusion: "success",
        started_at: "2026-09-30T13:27:48Z",
        completed_at: "2026-09-30T13:27:55Z",
      }),
    ),
  };
  const metrics = {
    ...structuredClone(promote),
    id: 1002,
    name: "pipeline-metrics",
    conclusion: rerun ? "failure" : "success",
    started_at: "2026-09-30T13:27:58Z",
    completed_at: "2026-09-30T13:28:18Z",
    steps: [],
  };
  const jobs = [promote, metrics];
  if (rerun)
    jobs.push(
      { ...structuredClone(promote), id: 1003, run_attempt: 2 },
      {
        ...structuredClone(metrics),
        id: 1004,
        run_attempt: 2,
        conclusion: "success",
        started_at: "2026-09-30T13:38:14Z",
        completed_at: "2026-09-30T13:38:23Z",
      },
    );
  return {
    run,
    jobsPayload: { total_count: jobs.length, jobs },
    artifact: { created_at: "2026-09-30T13:27:49Z" },
  };
}

test("normal bridge keeps the same producer and metrics attempt", () => {
  assert.deepEqual(resolveStagingBridgeAttempts(fixture(false)), {
    valid: true,
    violations: [],
    producerAttempt: 1,
    gateAttempt: 1,
    producerJobId: 1001,
    metricsJobId: 1002,
  });
});

test("metrics-only retry preserves the original promotion and immutable evidence", () => {
  assert.deepEqual(resolveStagingBridgeAttempts(fixture()), {
    valid: true,
    violations: [],
    producerAttempt: 1,
    gateAttempt: 2,
    producerJobId: 1001,
    metricsJobId: 1004,
  });
});

const refusals = {
  "overall failure": (value) => (value.run.conclusion = "failure"),
  "run still active": (value) => (value.run.status = "in_progress"),
  "invalid attempt": (value) => (value.run.run_attempt = 0),
  "partial pagination": (value) => (value.jobsPayload.total_count = 101),
  "missing inventory": (value) => (value.jobsPayload.jobs = []),
  "duplicated job ID": (value) => (value.jobsPayload.jobs[3].id = 1001),
  "different SHA": (value) => (value.jobsPayload.jobs[2].head_sha = "b".repeat(40)),
  "different run": (value) => (value.jobsPayload.jobs[2].run_id = 456),
  "different workflow": (value) => (value.jobsPayload.jobs[2].workflow_name = "Untrusted bridge"),
  "different branch": (value) => (value.jobsPayload.jobs[2].head_branch = "untrusted"),
  "future job attempt": (value) => (value.jobsPayload.jobs[2].run_attempt = 3),
  "unknown writer": (value) => (value.jobsPayload.jobs[3].name = "deploy"),
  "current metrics failure": (value) => (value.jobsPayload.jobs[3].conclusion = "failure"),
  "current promotion failure": (value) => (value.jobsPayload.jobs[2].conclusion = "failure"),
  "unfinished job": (value) => (value.jobsPayload.jobs[2].status = "in_progress"),
  "invalid job start": (value) => (value.jobsPayload.jobs[2].started_at = "invalid"),
  "job ends before start": (value) => (value.jobsPayload.jobs[2].completed_at = "2026-09-30T13:00:00Z"),
  "new promotion cannot reuse an older artifact": (value) => {
    value.jobsPayload.jobs[2].started_at = "2026-09-30T13:38:10Z";
    value.jobsPayload.jobs[2].completed_at = "2026-09-30T13:38:20Z";
  },
  "artifact before producer": (value) => (value.artifact.created_at = "2026-09-30T13:00:00Z"),
  "artifact after producer": (value) => (value.artifact.created_at = "2026-09-30T14:00:00Z"),
  "missing artifact timestamp": (value) => delete value.artifact.created_at,
  "changed step cannot be attributed to the old producer": (value) => {
    value.jobsPayload.jobs[2].steps[0].completed_at = "2026-09-30T13:27:54Z";
  },
  "failed evidence upload": (value) => {
    for (const job of value.jobsPayload.jobs.filter((job) => job.name === "promote"))
      job.steps[0].conclusion = "failure";
  },
  "missing terminal gate": (value) => {
    for (const job of value.jobsPayload.jobs.filter((job) => job.name === "promote")) job.steps.pop();
  },
  "metrics before promotion completion": (value) => {
    value.jobsPayload.jobs[3].started_at = "2026-09-30T13:20:00Z";
  },
  "missing producer history": (value) => {
    value.jobsPayload.jobs = value.jobsPayload.jobs.slice(2);
    value.jobsPayload.total_count = 2;
  },
};
for (const [name, mutate] of Object.entries(refusals)) {
  test(`refuses ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.equal(resolveStagingBridgeAttempts(value).valid, false);
  });
}

test("consumer keeps producer for deployment evidence and green attempt for duration", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
    "utf8",
  );
  const resolver = await readFile(
    new URL("./verify-staging-frontend-bridge-run.mjs", import.meta.url),
    "utf8",
  );
  assert.match(
    workflow,
    /EXPECTED_RUN_ATTEMPT: \$\{\{ steps\.frontend_bridge_run\.outputs\.run_attempt \}\}/,
  );
  assert.match(
    workflow,
    /bridge_run_attempt: \$\{\{ steps\.frontend_bridge_run\.outputs\.gate_run_attempt \}\}/,
  );
  assert.match(resolver, /jobs\?filter=all&per_page=100/);
  assert.match(resolver, /run_attempt=\$\{attempts\.producerAttempt\}/);
  assert.match(resolver, /gate_run_attempt=\$\{attempts\.gateAttempt\}/);
  assert.ok(resolver.indexOf("if (!attempts.valid)") < resolver.indexOf("await appendFile("));
});
