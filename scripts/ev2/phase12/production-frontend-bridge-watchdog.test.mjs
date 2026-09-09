import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { encodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import {
  productionFrontendBridgeDecision,
  uniqueProductionFrontendBridgeOwnedDeployment,
} from "./production-frontend-bridge-pages-state.mjs";
import {
  sealRecoveryStateVariable,
  serializeRecoveryStateVariable,
  verifyRecoveryStateVariable,
} from "./recovery-state-store-lib.mjs";

const root = resolve(import.meta.dirname, "../../..");
const candidateSha = "a".repeat(40);
const predecessorSha = "b".repeat(40);
const controlSha = "c".repeat(40);
const runId = "731";
const runAttempt = "2";
const runMarker = `g12-production-bridge-run-${runId}-${runAttempt}`;
const compensationMarker = `g12-production-bridge-compensation-${runId}-${runAttempt}`;
const predecessor = {
  deploymentId: "123e4567-e89b-42d3-a456-426614174001",
  release: predecessorSha,
  createdOn: "2026-09-08T12:00:00.000Z",
  commitMessage: "approved predecessor\r\n\r\nRelease body com Unicode 🌎",
};
const owned = {
  deploymentId: "123e4567-e89b-42d3-a456-426614174002",
  release: candidateSha,
  createdOn: "2026-09-08T13:00:00.000Z",
  commitMessage: runMarker,
};
const state = { baseline: predecessor, candidateRelease: candidateSha, runMarker, compensationMarker };

function position(source, fragment) {
  const offset = source.indexOf(fragment);
  assert.notEqual(offset, -1, `missing contract: ${fragment}`);
  return offset;
}

test("production bridge recovery preserves external deploys and recognizes only owned identities", () => {
  assert.equal(productionFrontendBridgeDecision(predecessor, state), "already-predecessor");
  assert.equal(productionFrontendBridgeDecision(owned, state), "restore-predecessor");
  assert.equal(
    productionFrontendBridgeDecision(
      {
        ...predecessor,
        deploymentId: "123e4567-e89b-42d3-a456-426614174003",
        createdOn: "2026-09-08T14:00:00.000Z",
        commitMessage: compensationMarker,
      },
      state,
    ),
    "already-restored-predecessor",
  );
  for (const external of [
    { ...owned, commitMessage: "external-same-sha" },
    { ...owned, release: "d".repeat(40), commitMessage: "external-release" },
  ])
    assert.equal(productionFrontendBridgeDecision(external, state), "external-conflict");
  assert.equal(uniqueProductionFrontendBridgeOwnedDeployment(owned, [owned], state), true);
  assert.equal(
    uniqueProductionFrontendBridgeOwnedDeployment(
      owned,
      [owned, { ...owned, deploymentId: "123e4567-e89b-42d3-a456-426614174004" }],
      state,
    ),
    false,
  );
});

test("bridge and compensation markers are accepted by the sealed deploy CLI but external markers are refused", () => {
  const script = resolve(root, "scripts/ev2/phase12/deploy-sealed-production-dist.mjs");
  const args = (marker) => [
    script,
    "--archive",
    "missing.tar",
    "--seal",
    "missing.json",
    "--candidate",
    candidateSha,
    "--branch",
    "main",
    "--commit-message",
    marker,
    "--expected-canonical-id",
    predecessor.deploymentId,
    "--expected-canonical-release",
    predecessorSha,
    "--expected-canonical-created-on",
    predecessor.createdOn,
    "--expected-canonical-marker-b64",
    encodeDeploymentCommitMessage(predecessor.commitMessage),
    "--wrangler-script",
    "missing-wrangler.js",
  ];
  const env = {
    ...process.env,
    CLOUDFLARE_PAGES_PROJECT: "gaiatec-website",
    CLOUDFLARE_API_TOKEN: "not-a-real-token",
    CLOUDFLARE_ACCOUNT_ID: "not-a-real-account",
  };
  for (const marker of [runMarker, compensationMarker]) {
    const result = spawnSync(process.execPath, args(marker), { cwd: root, env, encoding: "utf8" });
    assert.notEqual(result.status, 0);
    assert.doesNotMatch(result.stderr, /G12_PRODUCTION_SEALED_DEPLOY_INPUT_REFUSED/);
  }
  const refused = spawnSync(process.execPath, args("external-marker"), { cwd: root, env, encoding: "utf8" });
  assert.match(refused.stderr, /G12_PRODUCTION_SEALED_DEPLOY_INPUT_REFUSED/);
});

test("production preview sealed deploy rejects an explicitly empty canonical marker before mutation", () => {
  const script = resolve(root, "scripts/ev2/phase12/deploy-sealed-production-dist.mjs");
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--archive",
      "missing.tar",
      "--seal",
      "missing.json",
      "--candidate",
      candidateSha,
      "--branch",
      "ev2-g12-preflight",
      "--commit-message",
      runMarker,
      "--expected-canonical-marker-b64",
      "",
      "--wrangler-script",
      "missing-wrangler.js",
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOUDFLARE_PAGES_PROJECT: "gaiatec-website",
        CLOUDFLARE_API_TOKEN: "not-a-real-token",
        CLOUDFLARE_ACCOUNT_ID: "not-a-real-account",
      },
    },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /G12_PRODUCTION_SEALED_DEPLOY_INPUT_REFUSED/);
  assert.doesNotMatch(result.stderr, /PRODUCTION_SEALED_DEPLOY_API|ENOENT|missing\.tar/);
});

test("state writer binds complete candidate and predecessor seal bytes before preview exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "g12-bridge-state-test-"));
  try {
    const candidateSeal = {
      schemaVersion: 2,
      event: "g12.production.dist.sealed",
      candidateSha,
      archiveFile: "g12-production-frontend-bridge-dist.tar",
      archiveBytes: 2048,
      archiveSha256: "1".repeat(64),
      treeSha256: "2".repeat(64),
      fileCount: 12,
      byteCount: 1024,
      files: [],
    };
    const predecessorSeal = {
      ...candidateSeal,
      candidateSha: predecessorSha,
      archiveFile: "g12-production-frontend-bridge-predecessor-dist.tar",
      archiveBytes: 1024,
      archiveSha256: "3".repeat(64),
      treeSha256: "4".repeat(64),
      fileCount: 10,
      byteCount: 768,
    };
    const candidateSealPath = join(directory, "candidate.json");
    const predecessorSealPath = join(directory, "predecessor.json");
    const output = join(directory, "state.json");
    await writeFile(candidateSealPath, JSON.stringify(candidateSeal));
    await writeFile(predecessorSealPath, JSON.stringify(predecessorSeal));
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, "scripts/ev2/phase12/write-production-frontend-bridge-state.mjs"),
        "--seal",
        candidateSealPath,
        "--predecessor-seal",
        predecessorSealPath,
        "--output",
        output,
      ],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_RUN_ID: runId,
          GITHUB_RUN_ATTEMPT: runAttempt,
          CANDIDATE_SHA: candidateSha,
          CONTROL_SHA: controlSha,
          APPROVAL_RECORD: `.github/release-controls/approvals/G12_${candidateSha}.json`,
          APPROVAL_RECORD_SHA256: "5".repeat(64),
          CHANGE_REFERENCE: "G12-test",
          BASELINE_DEPLOYMENT_ID: predecessor.deploymentId,
          BASELINE_RELEASE: predecessorSha,
          BASELINE_CREATED_ON: predecessor.createdOn,
          BASELINE_COMMIT_MESSAGE_B64: encodeDeploymentCommitMessage(predecessor.commitMessage),
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const written = JSON.parse(await readFile(output, "utf8"));
    assert.equal(written.schemaVersion, 2);
    assert.equal(written.preview, undefined);
    assert.equal(written.dist.archiveBytes, 2048);
    assert.equal(written.predecessorDist.archiveSha256, "3".repeat(64));
    assert.equal(written.backendMutation, "none");

    const hmacKey = "6".repeat(64);
    const wrapped = sealRecoveryStateVariable("production-frontend-bridge", written, hmacKey);
    const restored = verifyRecoveryStateVariable(
      JSON.parse(serializeRecoveryStateVariable(wrapped)),
      hmacKey,
      {
        kind: "production-frontend-bridge",
        runId,
        runAttempt,
        controlSha,
      },
    );
    assert.equal(restored.valid, true, restored.violations.join(","));
    assert.equal(restored.state.baseline.commitMessage, predecessor.commitMessage);

    const readerOutput = join(directory, "reader-output.txt");
    const reader = spawnSync(
      process.execPath,
      [resolve(root, "scripts/ev2/phase12/read-production-frontend-bridge-state.mjs"), "--file", output],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          EXPECTED_RUN_ID: runId,
          EXPECTED_RUN_ATTEMPT: runAttempt,
          EXPECTED_CONTROL_SHA: controlSha,
          EXPECTED_CANDIDATE_SHA: candidateSha,
          GITHUB_OUTPUT: readerOutput,
        },
      },
    );
    assert.equal(reader.status, 0, reader.stderr);
    const readerBoundary = await readFile(readerOutput, "utf8");
    assert.ok(
      readerBoundary.includes(
        `baseline_commit_message_b64=${encodeDeploymentCommitMessage(predecessor.commitMessage)}`,
      ),
    );
    assert.doesNotMatch(readerBoundary, /Release body com Unicode/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("production bridge arms redundant sealed recovery before its first Pages mutation", async () => {
  const workflow = await readFile(
    resolve(root, ".github/workflows/promote-production-frontend-bridge.yml"),
    "utf8",
  );
  const predecessorBuild = position(
    workflow,
    "Build and seal exact predecessor bytes before the first Pages mutation",
  );
  const hmacState = position(
    workflow,
    "Persist redundant HMAC bridge recovery state before any Pages mutation",
  );
  const stateArtifact = position(
    workflow,
    "Upload HMAC state and exact sealed predecessor bytes before any Pages mutation",
  );
  const preview = position(workflow, "Deploy sealed bridge A to isolated production-project preview");
  const canonical = position(workflow, "Promote the exact sealed frontend bridge with canonical CAS");
  const validation = position(
    workflow,
    "Install and validate exact bridge A, then discard its non-release build",
  );
  const cleanBuild = position(workflow, "Build clean production bridge A");
  const validationBlock = workflow.slice(validation, cleanBuild);
  assert.match(validationBlock, /rm -rf -- dist/);
  assert.match(validationBlock, /test ! -e dist/);
  assert.ok(validation < cleanBuild);
  assert.ok(predecessorBuild < hmacState && hmacState < stateArtifact && stateArtifact < preview);
  assert.ok(preview < canonical);
  assert.match(workflow, /--kind production-frontend-bridge/);
  assert.match(workflow, /--wrapper-file \.\.\/g12-production-frontend-bridge-recovery-wrapper\.json/);
  assert.match(workflow, /g12-production-frontend-bridge-predecessor-dist\.tar/);
  assert.match(workflow, /--expected-canonical-id/);
  assert.match(workflow, /Clear exact HMAC state only after promotion evidence or proven reconciliation/);
  assert.doesNotMatch(workflow, /cloudflare-pages\.mjs reconcile/);
});

test("workflow-run watchdog validates both deployment byte sets and only restores by owned CAS", async () => {
  const workflow = await readFile(
    resolve(root, ".github/workflows/promote-production-frontend-bridge-watchdog.yml"),
    "utf8",
  );
  assert.match(
    workflow,
    /workflow_run:\s+workflows: \["Promote production frontend bridge"\]\s+types: \[completed\]\s+branches: \[main\]/s,
  );
  for (const conclusion of ["cancelled", "failure", "timed_out"])
    assert.match(workflow, new RegExp(`workflow_run\\.conclusion == '${conclusion}'`));
  assert.match(workflow, /Recover HMAC production bridge state independently of artifacts/);
  assert.match(workflow, /Verify artifact HMAC state independently of the repository variable/);
  assert.match(workflow, /verify-production-dist-archive\.mjs/g);
  assert.equal((workflow.match(/verify-production-dist-archive\.mjs/g) ?? []).length, 2);
  assert.match(workflow, /Restore sealed predecessor under adjacent canonical CAS/);
  assert.match(
    workflow,
    /--expected-canonical-id "\$\{\{ steps\.watchdog_decision\.outputs\.deployment_id \}\}"/,
  );
  const pagesState = await readFile(
    resolve(root, "scripts/ev2/phase12/production-frontend-bridge-pages-state.mjs"),
    "utf8",
  );
  assert.match(pagesState, /G12_PRODUCTION_BRIDGE_EXTERNAL_DEPLOYMENT_PRESERVED/);
  assert.match(pagesState, /G12_PRODUCTION_BRIDGE_OWNERSHIP_AMBIGUOUS/);
  assert.match(workflow, /Compare and clear HMAC state only after proven watchdog reconciliation/);
  assert.ok(
    position(workflow, "Probe restored predecessor without backend or lead mutation") <
      position(workflow, "Compare and clear HMAC state only after proven watchdog reconciliation"),
  );
  assert.doesNotMatch(
    workflow,
    /SUPABASE|cms-public-bridge-fixture|lead-capture|deploy-production-functions|db push/i,
  );
});

test("evidence writer obtains preview identity only from validated post-deploy outputs", async () => {
  const source = await readFile(
    resolve(root, "scripts/ev2/phase12/write-production-frontend-bridge-evidence.mjs"),
    "utf8",
  );
  const verifier = await readFile(
    resolve(root, "scripts/ev2/phase12/verify-production-frontend-bridge-evidence.mjs"),
    "utf8",
  );
  assert.doesNotMatch(source, /state\.preview/);
  assert.match(source, /process\.env\.PREVIEW_DEPLOYMENT_ID/);
  assert.match(source, /process\.env\.PREVIEW_CREATED_ON/);
  assert.match(source, /runAttempt: process\.env\.STAGING_BRIDGE_RUN_ATTEMPT/);
  assert.match(source, /process\.env\.PREVIEW_DEPLOYMENT_ORIGIN/);
  assert.match(source, /"https:\/\/gaiatecsistemas\.com\.br"/);
  assert.match(source, /origin: expectedOrigin/);
  assert.match(verifier, /runAttempt: process\.env\.EXPECTED_RUN_ATTEMPT/);
});
