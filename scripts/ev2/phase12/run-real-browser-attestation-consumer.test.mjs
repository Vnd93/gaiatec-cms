import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";

import {
  awaitAttestationConsumption,
  claimChallengeVariable,
  clearExactBrokerAttestation,
  createRealBrowserBrokerGitHubClient,
  runRealBrowserAttestationConsumer,
  runRealBrowserStoreChild,
} from "./run-real-browser-attestation-consumer.mjs";
import {
  buildRealBrowserAttestationVariable,
  serializeRealBrowserAttestationVariable,
} from "./real-browser-attestation-store-lib.mjs";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const candidateSha = "a".repeat(40);
const controlSha = "b".repeat(40);
const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
const runId = "7654321";
const runAttempt = 2;
const screenshot = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

function challenge(relativePath) {
  const origin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  const campaignPath = `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`;
  const nonce = "deadbeefcafebabe";
  const syntheticEmail = `qa-iab-${runTag.toLowerCase()}-${runAttempt}-${nonce}@example.invalid`;
  return {
    relativePath,
    value: {
      schemaVersion: 1,
      event: "g12.real_browser.handoff.ready",
      repository: "Vnd93/gaiatec-cms",
      environment: "staging",
      candidateSha,
      controlSha,
      runId,
      runAttempt,
      runTag,
      origin,
      campaignPath,
      url: `${origin}${campaignPath}`,
      syntheticEmail,
      emailSha256: createHash("sha256").update(syntheticEmail).digest("hex"),
      challengeNonceSha256: createHash("sha256").update(nonce).digest("hex"),
      variable: `G12_STAGING_REAL_BROWSER_${runId}_${runAttempt}`,
      challengeVariable: `G12_STAGING_REAL_BROWSER_CHALLENGE_${runId}_${runAttempt}`,
      successLocator: '[data-form-submission-status="success"]',
      documentReleaseHeader: "x-release",
      healthUrl: `${origin}/healthz`,
      healthReleaseField: "release",
      deploymentIdentityRequired: true,
      screenshotScope: "success-locator-only-no-input-fields",
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
    },
  };
}

function argsFor(challengePath, suffix) {
  return [
    "--environment",
    "staging",
    "--candidate-sha",
    candidateSha,
    "--control-sha",
    controlSha,
    "--run-id",
    runId,
    "--run-attempt",
    String(runAttempt),
    "--run-tag",
    runTag,
    "--challenge-file",
    challengePath,
    "--output-json",
    `outputs/${suffix}-attestation.json`,
    "--output-png",
    `outputs/${suffix}-attestation.png`,
    "--challenge-wait-seconds",
    "1",
  ];
}

function reportFor(value, observedAt) {
  return {
    schemaVersion: 1,
    event: "g12.real_browser.attestation",
    repository: "Vnd93/gaiatec-cms",
    environment: value.environment,
    candidateSha: value.candidateSha,
    documentReleaseSha: value.candidateSha,
    healthReleaseSha: value.candidateSha,
    deploymentIdentityObserved: true,
    runId: value.runId,
    runAttempt: value.runAttempt,
    runTag: value.runTag,
    origin: value.origin,
    campaignPath: value.campaignPath,
    emailSha256: value.emailSha256,
    reference: "LD-A1B2C3D4E5",
    responseStatus: 201,
    uiSuccessObserved: true,
    visibleSuccessText: "Solicitação recebida. Protocolo LD-A1B2C3D4E5.",
    observedAt,
    challengeNonceSha256: value.challengeNonceSha256,
    turnstile: {
      provider: "cloudflare-turnstile",
      officialWidgetObserved: true,
      cDataBound: true,
      tokenCaptured: false,
    },
  };
}

function parentJobsPayload({
  active = true,
  completedSuccess = false,
  jobId = 445566,
  stepNumber = 17,
} = {}) {
  const waitStep = "Run the complete authenticated mutating editorial cycle first";
  return {
    total_count: 2,
    jobs: [
      {
        id: jobId,
        run_id: Number(runId),
        run_attempt: runAttempt,
        head_branch: "main",
        head_sha: controlSha,
        name: "deploy",
        status: active ? "in_progress" : "completed",
        conclusion: active ? null : completedSuccess ? "success" : "cancelled",
        steps: [
          { number: 1, name: "Set up job", status: "completed", conclusion: "success" },
          {
            number: stepNumber,
            name: waitStep,
            status: active ? "in_progress" : "completed",
            conclusion: active ? null : completedSuccess ? "success" : "cancelled",
          },
        ],
      },
      {
        id: 778899,
        run_id: Number(runId),
        run_attempt: runAttempt,
        head_branch: "main",
        head_sha: controlSha,
        name: "finalize",
        status: "queued",
        conclusion: null,
        steps: [],
      },
    ],
  };
}

function parentJobsRequest(payload = parentJobsPayload()) {
  return async (path) => {
    assert.equal(
      path,
      `/repos/Vnd93/gaiatec-cms/actions/runs/${runId}/attempts/${runAttempt}/jobs?per_page=100&page=1`,
    );
    return { found: true, status: 200, payload };
  };
}

function brokerEnvironment() {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "Vnd93/gaiatec-cms/.github/workflows/submit-real-browser-attestation.yml@refs/heads/main",
    RUNNER_ENVIRONMENT: "github-hosted",
    GITHUB_ACTOR: "Vnd93",
    GITHUB_TRIGGERING_ACTOR: "Vnd93",
    GITHUB_RUN_ID: "998877",
    GITHUB_RUN_ATTEMPT: "1",
    GITHUB_SHA: controlSha,
    CONTROL_SHA: controlSha,
    EVIDENCE_SALT: "consumer-test-evidence-salt-1234567890abcdef",
  };
}

function parentStateValue() {
  return {
    schemaVersion: 1,
    event: "g12.real_browser.parent_wait_step.active",
    repository: "Vnd93/gaiatec-cms",
    environment: "staging",
    candidateSha,
    controlSha,
    runId,
    runAttempt,
    jobId: "445566",
    jobName: "deploy",
    stepNumber: 17,
    stepName: "Run the complete authenticated mutating editorial cycle first",
  };
}

function attestationRecord(report, observedNow) {
  const environment = brokerEnvironment();
  const wrapper = buildRealBrowserAttestationVariable({
    report,
    screenshot,
    broker: {
      controlSha,
      runId: environment.GITHUB_RUN_ID,
      runAttempt: Number(environment.GITHUB_RUN_ATTEMPT),
      actor: "Vnd93",
      triggeringActor: "Vnd93",
      sealedAt: observedNow.toISOString(),
    },
    evidenceSalt: environment.EVIDENCE_SALT,
    now: observedNow,
  });
  return {
    name: wrapper.variable,
    value: serializeRealBrowserAttestationVariable(wrapper),
    created_at: "2026-09-08T14:59:59.000Z",
    updated_at: "2026-09-08T14:59:59.000Z",
  };
}

test("the broker workflow claims, stores, handshakes, and always clears without expressions in shell", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/submit-real-browser-attestation.yml"),
    "utf8",
  );
  const stepStart = workflow.indexOf(
    "- name: Claim the exact single-use browser challenge, then seal the attestation",
  );
  const cleanupStart = workflow.indexOf(
    "- name: Clear any exact orphaned attestation and remove decoded broker inputs",
    stepStart,
  );
  assert.notEqual(stepStart, -1);
  assert.notEqual(cleanupStart, -1);
  const claimAndPut = workflow.slice(stepStart, cleanupStart);
  const claim = claimAndPut.indexOf("run-real-browser-attestation-consumer.mjs claim-challenge");
  const put = claimAndPut.indexOf("real-browser-attestation-store.mjs put");
  const handshake = claimAndPut.indexOf("run-real-browser-attestation-consumer.mjs await-consumption");
  assert.notEqual(claim, -1);
  assert.notEqual(put, -1);
  assert.notEqual(handshake, -1);
  assert.ok(claim < put && put < handshake, "claim, put, and handshake order must remain fail-closed");
  assert.match(claimAndPut, /set -euo pipefail/);
  for (const binding of [
    '--environment "$TARGET_ENVIRONMENT"',
    '--candidate-sha "$CANDIDATE_SHA"',
    '--control-sha "$CONTROL_SHA"',
    '--run-id "$PARENT_RUN_ID"',
    '--run-attempt "$PARENT_RUN_ATTEMPT"',
    "--report runner-temp-real-browser-report.json",
    "--parent-state runner-temp-real-browser-parent-state.json",
  ]) {
    assert.match(claimAndPut.slice(claim, put), new RegExp(binding.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(
    claimAndPut.slice(claim),
    /\$\{\{\s*inputs\.(?:candidate_sha|control_sha|parent_run_id|parent_run_attempt)/,
  );
  const cleanup = workflow.slice(cleanupStart);
  assert.match(cleanup, /if: always\(\)/);
  assert.match(cleanup, /run-real-browser-attestation-consumer\.mjs clear-attestation/);
  assert.match(cleanup, /--report runner-temp-real-browser-report\.json/);
  assert.doesNotMatch(cleanup, /real-browser-attestation-store\.mjs clear/);
  assert.doesNotMatch(cleanup.slice(cleanup.indexOf("run: |")), /\$\{\{\s*inputs\./);
});

test("the broker claims the exact challenge once and blocks replay before attestation creation", async () => {
  const suffix = `consumer-claim-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  fixture.value.expiresAt = "2026-09-08T15:10:00.000Z";
  const stored = {
    name: fixture.value.challengeVariable,
    value: JSON.stringify(fixture.value),
    created_at: "2026-09-08T14:59:30Z",
    updated_at: "2026-09-08T14:59:30Z",
  };
  let deleted = false;
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      deleteCalls += 1;
      deleted = true;
      return { found: true, status: 204, payload: null };
    }
    if (deleted) return { found: false, status: 404, payload: null };
    return { found: true, status: 200, payload: { ...stored } };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(reportFor(fixture.value, now.toISOString()))}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await claimChallengeVariable(
      {
        environment: "staging",
        candidateSha,
        controlSha,
        runId,
        runAttempt,
        reportFile: relativeReport,
        parentStateFile: relativeParentState,
      },
      { githubRequest, parentJobsRequest: parentJobsRequest(), now },
    );
    assert.equal(deleteCalls, 1);
    const storedParentState = JSON.parse(await readFile(absoluteParentState, "utf8"));
    assert.equal(storedParentState.jobId, "445566");
    assert.equal(storedParentState.stepName, "Run the complete authenticated mutating editorial cycle first");
    await rm(absoluteParentState, { force: true });
    await assert.rejects(
      claimChallengeVariable(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
        },
        { githubRequest, parentJobsRequest: parentJobsRequest(), now },
      ),
      /G12_REAL_BROWSER_CHALLENGE_CLAIM_NOT_FOUND/,
    );
    assert.equal(deleteCalls, 1);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("the broker refuses a challenge replacement immediately before its destructive claim", async () => {
  const suffix = `consumer-claim-race-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  fixture.value.expiresAt = "2026-09-08T15:10:00.000Z";
  const stored = {
    name: fixture.value.challengeVariable,
    value: JSON.stringify(fixture.value),
    created_at: "2026-09-08T14:59:30Z",
    updated_at: "2026-09-08T14:59:30Z",
  };
  let reads = 0;
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      deleteCalls += 1;
      return { found: true, status: 204, payload: null };
    }
    reads += 1;
    return {
      found: true,
      status: 200,
      payload: reads === 1 ? { ...stored } : { ...stored, updated_at: "2026-09-08T14:59:31Z" },
    };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(reportFor(fixture.value, now.toISOString()))}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await assert.rejects(
      claimChallengeVariable(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
        },
        { githubRequest, parentJobsRequest: parentJobsRequest(), now },
      ),
      /G12_REAL_BROWSER_CHALLENGE_CLAIM_PREDELETE_SNAPSHOT_MISMATCH/,
    );
    assert.equal(deleteCalls, 0);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("the broker requires an explicit terminal 404 after deleting the challenge", async () => {
  const suffix = `consumer-claim-terminal-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  fixture.value.expiresAt = "2026-09-08T15:10:00.000Z";
  const stored = {
    name: fixture.value.challengeVariable,
    value: JSON.stringify(fixture.value),
    created_at: "2026-09-08T14:59:30Z",
    updated_at: "2026-09-08T14:59:30Z",
  };
  let reads = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") return { found: true, status: 204, payload: null };
    reads += 1;
    if (reads <= 2) return { found: true, status: 200, payload: { ...stored } };
    return { found: false, status: 200, payload: null };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(reportFor(fixture.value, now.toISOString()))}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await assert.rejects(
      claimChallengeVariable(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
        },
        { githubRequest, parentJobsRequest: parentJobsRequest(), now },
      ),
      /G12_REAL_BROWSER_CHALLENGE_CLAIM_CLEAR_VERIFICATION_FAILED/,
    );
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("an inactive parent wait step blocks challenge claim before any variable mutation", async () => {
  const suffix = `consumer-claim-inactive-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  fixture.value.expiresAt = "2026-09-08T15:10:00.000Z";
  let variableReads = 0;
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    variableReads += 1;
    if (options.method === "DELETE") deleteCalls += 1;
    throw new Error("challenge variable must not be reached");
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(reportFor(fixture.value, now.toISOString()))}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await assert.rejects(
      claimChallengeVariable(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
        },
        {
          githubRequest,
          parentJobsRequest: parentJobsRequest(parentJobsPayload({ active: false })),
          now,
        },
      ),
      /G12_REAL_BROWSER_PARENT_WAIT_STEP_INACTIVE/,
    );
    assert.equal(variableReads, 0);
    assert.equal(deleteCalls, 0);
    await assert.rejects(access(absoluteParentState), /ENOENT/);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("the HTTP client recovers only a lost DELETE response and refuses an initial 404", async () => {
  const path = "/repos/Vnd93/gaiatec-cms/actions/variables/G12_STAGING_REAL_BROWSER_CHALLENGE_7654321_2";
  let initialCalls = 0;
  const initialMissing = createRealBrowserBrokerGitHubClient({
    token: "release-guard-token-never-print-123456789",
    repositoryName: "Vnd93/gaiatec-cms",
    fetchImplementation: async () => {
      initialCalls += 1;
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
    sleep: async () => undefined,
  });
  await assert.rejects(
    initialMissing(path, { method: "DELETE", allowNotFound: true, recoverLostDelete: true }),
    /G12_REAL_BROWSER_CHALLENGE_GITHUB_HTTP_404/,
  );
  assert.equal(initialCalls, 1);

  let recoveryCalls = 0;
  const lostResponse = createRealBrowserBrokerGitHubClient({
    token: "release-guard-token-never-print-123456789",
    repositoryName: "Vnd93/gaiatec-cms",
    fetchImplementation: async () => {
      recoveryCalls += 1;
      if (recoveryCalls === 1) throw new TypeError("simulated lost response after DELETE");
      return new Response(JSON.stringify({ message: "Not Found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    },
    sleep: async () => undefined,
  });
  assert.deepEqual(
    await lostResponse(path, { method: "DELETE", allowNotFound: true, recoverLostDelete: true }),
    {
      found: false,
      payload: { message: "Not Found" },
      status: 404,
      recoveredLostDelete: true,
    },
  );
  assert.equal(recoveryCalls, 2);
});

test("claim confirms terminal 404 after recovering a lost HTTP DELETE response", async () => {
  const suffix = `consumer-claim-lost-delete-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  fixture.value.expiresAt = "2026-09-08T15:10:00.000Z";
  const stored = {
    name: fixture.value.challengeVariable,
    value: JSON.stringify(fixture.value),
    created_at: "2026-09-08T14:59:30Z",
    updated_at: "2026-09-08T14:59:30Z",
  };
  let exists = true;
  let deleteCalls = 0;
  const client = createRealBrowserBrokerGitHubClient({
    token: "release-guard-token-never-print-123456789",
    repositoryName: "Vnd93/gaiatec-cms",
    fetchImplementation: async (input, options = {}) => {
      const url = new URL(input);
      const method = options.method ?? "GET";
      if (url.pathname === "/user") {
        return new Response(JSON.stringify({ login: "Vnd93" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (method === "DELETE") {
        deleteCalls += 1;
        if (deleteCalls === 1) {
          exists = false;
          throw new TypeError("simulated lost response after committed DELETE");
        }
        return new Response(JSON.stringify({ message: "Not Found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify(exists ? stored : { message: "Not Found" }), {
        status: exists ? 200 : 404,
        headers: { "Content-Type": "application/json" },
      });
    },
    sleep: async () => undefined,
  });
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(reportFor(fixture.value, now.toISOString()))}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await claimChallengeVariable(
      {
        environment: "staging",
        candidateSha,
        controlSha,
        runId,
        runAttempt,
        reportFile: relativeReport,
        parentStateFile: relativeParentState,
      },
      { githubRequest: client, parentJobsRequest: parentJobsRequest(), now },
    );
    assert.equal(deleteCalls, 2);
    assert.equal(exists, false);
    assert.equal(JSON.parse(await readFile(absoluteParentState, "utf8")).jobId, "445566");
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("a late put after parent finalization is compare-cleared and fails the broker handshake", async () => {
  const suffix = `consumer-handshake-orphan-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  fixture.value.expiresAt = "2026-09-08T15:10:00.000Z";
  const report = reportFor(fixture.value, now.toISOString());
  let challengeDeleted = false;
  const claimRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      challengeDeleted = true;
      return { found: true, status: 204, payload: null, recoveredLostDelete: false };
    }
    if (challengeDeleted) return { found: false, status: 404, payload: null };
    return {
      found: true,
      status: 200,
      payload: {
        name: fixture.value.challengeVariable,
        value: JSON.stringify(fixture.value),
        created_at: "2026-09-08T14:59:30Z",
        updated_at: "2026-09-08T14:59:30Z",
      },
    };
  };
  let attestation = attestationRecord(report, now);
  let attestationDeleteCalls = 0;
  const handshakeRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      attestationDeleteCalls += 1;
      attestation = null;
      return { found: true, status: 204, payload: null, recoveredLostDelete: false };
    }
    return attestation
      ? { found: true, status: 200, payload: { ...attestation } }
      : { found: false, status: 404, payload: null };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(report)}\n`, { mode: 0o600, flag: "wx" });
    await claimChallengeVariable(
      {
        environment: "staging",
        candidateSha,
        controlSha,
        runId,
        runAttempt,
        reportFile: relativeReport,
        parentStateFile: relativeParentState,
      },
      { githubRequest: claimRequest, parentJobsRequest: parentJobsRequest(), now },
    );
    assert.equal(challengeDeleted, true);
    await assert.rejects(
      awaitAttestationConsumption(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
          handshakeWaitSeconds: "1",
          handshakePollMs: "100",
        },
        {
          githubRequest: handshakeRequest,
          parentJobsRequest: parentJobsRequest(parentJobsPayload({ active: false })),
          environment: brokerEnvironment(),
          clock: () => new Date(now),
          sleep: async () => undefined,
        },
      ),
      /G12_REAL_BROWSER_HANDSHAKE_PARENT_INACTIVE/,
    );
    assert.equal(attestation, null);
    assert.equal(attestationDeleteCalls, 1);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("the handshake waits while the exact parent step is active and accepts only observed consumption", async () => {
  const suffix = `consumer-handshake-ack-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  const report = reportFor(fixture.value, now.toISOString());
  let attestation = attestationRecord(report, now);
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      deleteCalls += 1;
      throw new Error("broker must not delete an attestation consumed by the parent");
    }
    return attestation
      ? { found: true, status: 200, payload: { ...attestation } }
      : { found: false, status: 404, payload: null };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(report)}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(absoluteParentState, `${JSON.stringify(parentStateValue())}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    assert.deepEqual(
      await awaitAttestationConsumption(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
          handshakeWaitSeconds: "1",
          handshakePollMs: "100",
        },
        {
          githubRequest,
          parentJobsRequest: parentJobsRequest(),
          environment: brokerEnvironment(),
          clock: () => new Date(now),
          sleep: async () => {
            attestation = null;
          },
        },
      ),
      { variable: `G12_STAGING_REAL_BROWSER_${runId}_${runAttempt}`, consumed: true },
    );
    assert.equal(deleteCalls, 0);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("a terminal parent cannot turn a first-read 404 into a false consumption acknowledgement", async () => {
  const suffix = `consumer-handshake-terminal-404-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  const report = reportFor(fixture.value, now.toISOString());
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") deleteCalls += 1;
    return { found: false, status: 404, payload: null };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(report)}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(absoluteParentState, `${JSON.stringify(parentStateValue())}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await assert.rejects(
      awaitAttestationConsumption(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
          handshakeWaitSeconds: "1",
          handshakePollMs: "100",
        },
        {
          githubRequest,
          parentJobsRequest: parentJobsRequest(parentJobsPayload({ active: false })),
          environment: brokerEnvironment(),
          clock: () => new Date(now),
          sleep: async () => undefined,
        },
      ),
      /G12_REAL_BROWSER_PARENT_WAIT_STEP_INACTIVE/,
    );
    assert.equal(deleteCalls, 0);

    assert.deepEqual(
      await awaitAttestationConsumption(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
          handshakeWaitSeconds: "1",
          handshakePollMs: "100",
        },
        {
          githubRequest,
          parentJobsRequest: parentJobsRequest(parentJobsPayload({ active: false, completedSuccess: true })),
          environment: brokerEnvironment(),
          clock: () => new Date(now),
          sleep: async () => undefined,
        },
      ),
      { variable: `G12_STAGING_REAL_BROWSER_${runId}_${runAttempt}`, consumed: true },
    );
    assert.equal(deleteCalls, 0);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("finalizer deletion between inactive detection and compare-clear still fails the broker", async () => {
  const suffix = `consumer-handshake-finalizer-race-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  const report = reportFor(fixture.value, now.toISOString());
  const attestation = attestationRecord(report, now);
  let variableReads = 0;
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      deleteCalls += 1;
      return { found: true, status: 204, payload: null };
    }
    variableReads += 1;
    return variableReads === 1
      ? { found: true, status: 200, payload: { ...attestation } }
      : { found: false, status: 404, payload: null };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(report)}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(absoluteParentState, `${JSON.stringify(parentStateValue())}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await assert.rejects(
      awaitAttestationConsumption(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
          handshakeWaitSeconds: "1",
          handshakePollMs: "100",
        },
        {
          githubRequest,
          parentJobsRequest: parentJobsRequest(parentJobsPayload({ active: false })),
          environment: brokerEnvironment(),
          clock: () => new Date(now),
          sleep: async () => undefined,
        },
      ),
      /G12_REAL_BROWSER_HANDSHAKE_PARENT_INACTIVE/,
    );
    assert.equal(variableReads, 2);
    assert.equal(deleteCalls, 0);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("the handshake never deletes an attestation replaced before orphan cleanup", async () => {
  const suffix = `consumer-handshake-replaced-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const relativeParentState = `outputs/${suffix}-parent-state.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const absoluteParentState = resolve(repositoryRoot, relativeParentState);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  const report = reportFor(fixture.value, now.toISOString());
  const original = attestationRecord(report, now);
  let reads = 0;
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      deleteCalls += 1;
      return { found: true, status: 204, payload: null };
    }
    reads += 1;
    return {
      found: true,
      status: 200,
      payload: reads === 1 ? { ...original } : { ...original, updated_at: "2026-09-08T15:00:00.000Z" },
    };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(report)}\n`, { mode: 0o600, flag: "wx" });
    await writeFile(absoluteParentState, `${JSON.stringify(parentStateValue())}\n`, {
      mode: 0o600,
      flag: "wx",
    });
    await assert.rejects(
      awaitAttestationConsumption(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
          parentStateFile: relativeParentState,
          handshakeWaitSeconds: "1",
          handshakePollMs: "100",
        },
        {
          githubRequest,
          parentJobsRequest: parentJobsRequest(parentJobsPayload({ active: false })),
          environment: brokerEnvironment(),
          clock: () => new Date(now),
          sleep: async () => undefined,
        },
      ),
      /G12_REAL_BROWSER_HANDSHAKE_PREDELETE_SNAPSHOT_MISMATCH/,
    );
    assert.equal(deleteCalls, 0);
  } finally {
    await Promise.all([absoluteReport, absoluteParentState].map((path) => rm(path, { force: true })));
  }
});

test("the always-finalizer compare-clears the exact attestation after a lost put response", async () => {
  const suffix = `consumer-broker-clear-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeReport = `outputs/${suffix}-report.json`;
  const absoluteReport = resolve(repositoryRoot, relativeReport);
  const now = new Date("2026-09-08T15:00:00.000Z");
  const fixture = challenge("");
  const report = reportFor(fixture.value, now.toISOString());
  let attestation = attestationRecord(report, now);
  let deleteCalls = 0;
  const githubRequest = async (path, options = {}) => {
    if (path === "/user") return { found: true, status: 200, payload: { login: "Vnd93" } };
    if (options.method === "DELETE") {
      deleteCalls += 1;
      attestation = null;
      return { found: true, status: 204, payload: null, recoveredLostDelete: false };
    }
    return attestation
      ? { found: true, status: 200, payload: { ...attestation } }
      : { found: false, status: 404, payload: null };
  };
  try {
    await mkdir(dirname(absoluteReport), { recursive: true });
    await writeFile(absoluteReport, `${JSON.stringify(report)}\n`, { mode: 0o600, flag: "wx" });
    assert.deepEqual(
      await clearExactBrokerAttestation(
        {
          environment: "staging",
          candidateSha,
          controlSha,
          runId,
          runAttempt,
          reportFile: relativeReport,
        },
        {
          githubRequest,
          environment: brokerEnvironment(),
          clock: () => new Date(now),
        },
      ),
      {
        variable: `G12_STAGING_REAL_BROWSER_${runId}_${runAttempt}`,
        absent: false,
        cleared: true,
      },
    );
    assert.equal(attestation, null);
    assert.equal(deleteCalls, 1);
  } finally {
    await rm(absoluteReport, { force: true });
  }
});

test("an interrupted consumer awaits its poller and clears the published challenge", async () => {
  const suffix = `consumer-cancel-${process.pid}-${randomBytes(4).toString("hex")}`;
  const relativeChallenge = `outputs/${suffix}-challenge.json`;
  const absoluteChallenge = resolve(repositoryRoot, relativeChallenge);
  const fixture = challenge(relativeChallenge);
  const originalToken = process.env.RELEASE_GUARD_TOKEN;
  const originalSalt = process.env.EVIDENCE_SALT;
  let clearCalls = 0;
  let pollerClosed = false;
  try {
    await mkdir(dirname(absoluteChallenge), { recursive: true });
    await writeFile(absoluteChallenge, `${JSON.stringify(fixture.value)}\n`, { mode: 0o600, flag: "wx" });
    process.env.RELEASE_GUARD_TOKEN = "release-guard-token-long-enough-for-test";
    process.env.EVIDENCE_SALT = "evidence-salt-long-enough-for-test-value";
    const consumer = runRealBrowserAttestationConsumer(argsFor(relativeChallenge, suffix), {
      publishChallengeVariable: async () => undefined,
      runStoreChild: async (_args, { signal }) =>
        new Promise((_resolvePromise, rejectPromise) => {
          const interrupt = () => {
            pollerClosed = true;
            rejectPromise(new Error("G12_REAL_BROWSER_CONSUMER_INTERRUPTED"));
          };
          signal.addEventListener("abort", interrupt, { once: true });
          setImmediate(() => process.emit("SIGTERM", "SIGTERM"));
        }),
      clearChallengeVariable: async () => {
        clearCalls += 1;
      },
    });
    await assert.rejects(consumer, /G12_REAL_BROWSER_CONSUMER_INTERRUPTED/);
    assert.equal(pollerClosed, true);
    assert.equal(clearCalls, 1);
  } finally {
    if (originalToken === undefined) delete process.env.RELEASE_GUARD_TOKEN;
    else process.env.RELEASE_GUARD_TOKEN = originalToken;
    if (originalSalt === undefined) delete process.env.EVIDENCE_SALT;
    else process.env.EVIDENCE_SALT = originalSalt;
    await rm(absoluteChallenge, { force: true });
  }
});

test("the child runner waits for SIGTERM acknowledgement and leaves no polling process", async () => {
  const suffix = `consumer-child-${process.pid}-${randomBytes(4).toString("hex")}`;
  const childScript = resolve(repositoryRoot, `outputs/${suffix}.mjs`);
  const startedFile = resolve(repositoryRoot, `outputs/${suffix}.started`);
  const stoppedFile = resolve(repositoryRoot, `outputs/${suffix}.stopped`);
  const source = [
    'import { writeFileSync } from "node:fs";',
    `writeFileSync(${JSON.stringify(startedFile)}, String(process.pid), { flag: "wx" });`,
    'process.on("SIGTERM", () => {',
    `  writeFileSync(${JSON.stringify(stoppedFile)}, "stopped", { flag: "wx" });`,
    "  process.exit(0);",
    "});",
    "setInterval(() => {}, 1000);",
  ].join("\n");
  const controller = new AbortController();
  try {
    await mkdir(dirname(childScript), { recursive: true });
    await writeFile(childScript, source, { mode: 0o600, flag: "wx" });
    const running = runRealBrowserStoreChild([childScript], { signal: controller.signal });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      try {
        await access(startedFile);
        break;
      } catch {
        await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
      }
    }
    const pid = Number(await readFile(startedFile, "utf8"));
    controller.abort();
    await assert.rejects(running, /G12_REAL_BROWSER_CONSUMER_INTERRUPTED/);
    if (process.platform !== "win32") {
      assert.equal(await readFile(stoppedFile, "utf8"), "stopped");
    }
    assert.throws(() => process.kill(pid, 0));
  } finally {
    await Promise.all([childScript, startedFile, stoppedFile].map((path) => rm(path, { force: true })));
  }
});

test("the child runner closes the abort race between its initial check and listener registration", async () => {
  const suffix = `consumer-child-race-${process.pid}-${randomBytes(4).toString("hex")}`;
  const childScript = resolve(repositoryRoot, `outputs/${suffix}.mjs`);
  const racingSignal = {
    aborted: false,
    addEventListener() {
      this.aborted = true;
    },
    removeEventListener() {},
  };
  try {
    await mkdir(dirname(childScript), { recursive: true });
    await writeFile(childScript, "setInterval(() => {}, 1000);\n", { mode: 0o600, flag: "wx" });
    await assert.rejects(
      runRealBrowserStoreChild([childScript], { signal: racingSignal }),
      /G12_REAL_BROWSER_CONSUMER_INTERRUPTED/,
    );
  } finally {
    await rm(childScript, { force: true });
  }
});
