import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealProductionDistArchive } from "./production-dist-seal-lib.mjs";
import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  evaluateStagingRecoveryFence,
  sealRecoveryStateVariable,
  verifyRecoveryStateVariable,
} from "./recovery-state-store-lib.mjs";
import {
  STAGING_FRONTEND_PACKAGE,
  STAGING_FRONTEND_PROFILE_KEYS,
  stagingFrontendArtifactName,
} from "./staging-frontend-package-lib.mjs";
import {
  STAGING_DEPLOY_RECOVERY,
  buildStagingDeployRecoveryState,
  recoveryStateOutputs,
  validateStagingDeployRecoveryArtifactMetadata,
  validateStagingDeployRecoverySourceFiles,
  validateStagingDeployRecoveryState,
  verifyStagingDeployRecoveryArtifact,
} from "./staging-deploy-recovery-state-lib.mjs";
import {
  STAGING_ENVIRONMENT_SNAPSHOT,
  writeStagingEnvironmentSnapshot,
} from "./staging-environment-snapshot-lib.mjs";
import { frameRawEszip } from "./staging-cms-public-hotfix-lib.mjs";
import {
  STAGING_EDGE_BASELINE_ARTIFACT,
  writeStagingEdgeBaselineArtifact,
} from "./staging-edge-baseline-artifact-lib.mjs";

const controlSha = "a".repeat(40);
const candidateRelease = "b".repeat(40);
const originalRelease = "c".repeat(40);
const digest = (character) => character.repeat(64);
const migrationOutput = `
  Local          | Remote         | Time (UTC)
 ----------------|----------------|---------------------
  20260901000000 | 20260901000000 | 2026-09-01 00:00:00
`;
const functionsOutput = JSON.stringify([
  { name: "cms-system", status: "ACTIVE", version: 8, verify_jwt: true },
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function be32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function eszipSection(value) {
  return Buffer.concat([be32(value.byteLength), value, createHash("sha256").update(value).digest()]);
}

function fixtureEszip() {
  const specifier = Buffer.from("file:///workspace/supabase/functions/test/index.ts", "utf8");
  const source = Buffer.from("Deno.serve(() => new Response('ok'));", "utf8");
  const header = Buffer.concat([
    be32(specifier.byteLength),
    specifier,
    Buffer.from([0]),
    be32(0),
    be32(source.byteLength),
    be32(0),
    be32(0),
    Buffer.from([0]),
  ]);
  const sourceSection = Buffer.concat([source, createHash("sha256").update(source).digest()]);
  return Buffer.concat([
    Buffer.from("ESZIP2.3", "ascii"),
    eszipSection(Buffer.from([0, 1, 1, 32])),
    eszipSection(header),
    eszipSection(Buffer.alloc(0)),
    be32(sourceSection.byteLength),
    sourceSection,
    be32(0),
  ]);
}

function edgeInventory(bodySha256) {
  return [...PRODUCTION_FUNCTIONS]
    .sort((left, right) => left.localeCompare(right))
    .map((name, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name,
      slug: name,
      status: "ACTIVE",
      verify_jwt: !PUBLIC_FUNCTIONS.has(name),
      version: index + 1,
      ezbr_sha256: bodySha256,
      created_at: "2026-09-22T11:00:00.000Z",
      updated_at: "2026-09-22T11:00:00.000Z",
      entrypoint_path: `file:///workspace/supabase/functions/${name}/index.ts`,
      import_map: true,
      import_map_path: "file:///workspace/deno.json",
    }));
}

function profile() {
  const fingerprints = Object.fromEntries(
    STAGING_FRONTEND_PROFILE_KEYS.map((key, index) => [key, digest(String((index % 8) + 1))]),
  );
  return {
    algorithm: "sha256",
    fingerprints,
    sha256: sha256(
      Buffer.from(
        JSON.stringify(STAGING_FRONTEND_PROFILE_KEYS.map((key) => [key, fingerprints[key]])),
        "utf8",
      ),
    ),
  };
}

function fixtureIdentity(overrides = {}) {
  const source = {
    ciRunId: "35700000001",
    ciRunAttempt: 1,
    gateCiRunAttempt: 2,
    artifactId: "10600000001",
    digest: `sha256:${digest("d")}`,
    name: stagingFrontendArtifactName(originalRelease, "35700000001", 1),
    profileSha256: profile().sha256,
  };
  const dist = {
    archiveSha256: digest("e"),
    treeSha256: digest("f"),
    archiveBytes: 8192,
    fileCount: 2,
    byteCount: 512,
  };
  const original = {
    deploymentId: "848be723-25d4-4d3a-ae00-907e77fd98b6",
    release: originalRelease,
    createdOn: "2026-09-22T11:05:24.028Z",
    commitMessage: "g12-staging-bridge-run-35700000000-1",
  };
  return {
    workflow: { runId: "35700000002", attempt: 1, controlSha },
    candidateRelease,
    original,
    source,
    dist,
    recoveryArtifact: {
      id: "10600000002",
      digest: `sha256:${digest("9")}`,
      name: "staging-recovery-35700000002-1",
    },
    environmentSnapshot: {
      file: STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath,
      sha256: digest("8"),
    },
    edgeBaseline: {
      manifestFile: STAGING_DEPLOY_RECOVERY.edgeBaselineManifestPath,
      manifestSha256: digest("7"),
      inventorySha256: digest("6"),
      functionCount: PRODUCTION_FUNCTIONS.length,
      aggregateBytes: 8192,
      aggregateRawEszipBytes: 16_384,
    },
    browserRecovery: {
      environment: "staging",
      runTag: `QA-CMS-FINAL-20260922-${candidateRelease.slice(0, 8)}`,
    },
    ...overrides,
  };
}

function stateFixture(overrides = {}) {
  const fixture = fixtureIdentity();
  return buildStagingDeployRecoveryState({ ...fixture, ...overrides });
}

test("staging deploy recovery v4 has an exact fail-closed schema", () => {
  const state = stateFixture();
  assert.equal(validateStagingDeployRecoveryState(state).valid, true);
  assert.equal(state.source.gateCiRunAttempt, 2);
  assert.equal(
    recoveryStateOutputs(state, "staging-deploy-state.json").edge_baseline_aggregate_raw_eszip_bytes,
    "16384",
  );
  assert.deepEqual(Object.keys(state).sort(), [
    "branch",
    "browserRecovery",
    "candidateRelease",
    "dist",
    "edgeBaseline",
    "environmentSnapshot",
    "event",
    "markers",
    "original",
    "project",
    "recoveryArtifact",
    "schemaVersion",
    "source",
    "workflow",
  ]);
  for (const mutate of [
    (value) => (value.extra = true),
    (value) => delete value.environmentSnapshot,
    (value) => (value.workflow.runAttempt = 1),
    (value) => (value.workflow.attempt = 0),
    (value) => (value.markers.run = "g12-staging-run-1-1"),
    (value) => (value.source.digest = digest("d")),
    (value) => (value.source.gateCiRunAttempt = 0),
    (value) => (value.source.gateCiRunAttempt = value.source.ciRunAttempt - 1),
    (value) => (value.source.name = "staging-frontend-substituted"),
    (value) => (value.dist.archiveBytes = 0),
    (value) => (value.recoveryArtifact.id = "0"),
    (value) => (value.environmentSnapshot.file = "../snapshot.json"),
    (value) => delete value.edgeBaseline.aggregateRawEszipBytes,
    (value) => (value.edgeBaseline.aggregateRawEszipBytes = 0),
    (value) =>
      (value.edgeBaseline.aggregateRawEszipBytes =
        STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateRawEszipBytes + 1),
    (value) => (value.browserRecovery.runTag = `QA-CMS-FINAL-20260922-${"d".repeat(8)}`),
    (value) => (value.browserRecovery.environment = "production"),
  ]) {
    const changed = structuredClone(state);
    mutate(changed);
    assert.equal(validateStagingDeployRecoveryState(changed).valid, false);
  }
});

test("existing HMAC store and staging fence bind the v4 workflow attempt", () => {
  const state = stateFixture();
  const key = digest("1");
  const wrapper = sealRecoveryStateVariable("staging-deploy", state, key);
  assert.equal(
    verifyRecoveryStateVariable(wrapper, key, {
      kind: "staging-deploy",
      runId: state.workflow.runId,
      runAttempt: state.workflow.attempt,
      controlSha: state.workflow.controlSha,
    }).valid,
    true,
  );
  const states = { "staging-deploy": state };
  assert.equal(
    evaluateStagingRecoveryFence({
      ownerKind: "staging-deploy",
      expected: {
        runId: state.workflow.runId,
        runAttempt: state.workflow.attempt,
        controlSha: state.workflow.controlSha,
      },
      states,
    }).valid,
    true,
  );
});

test("recovery state binds the mandatory remote environment snapshot path and digest", () => {
  const fixture = fixtureIdentity();
  const state = buildStagingDeployRecoveryState(fixture);
  assert.equal(state.environmentSnapshot.file, "outputs/staging-remote-environment-snapshot.json");
  assert.equal(state.environmentSnapshot.sha256, digest("8"));
});

test("GitHub artifact metadata is bound to id, digest, attempt, control SHA and workflow", () => {
  const state = stateFixture();
  const run = {
    id: Number(state.workflow.runId),
    run_attempt: state.workflow.attempt,
    name: STAGING_DEPLOY_RECOVERY.workflowName,
    path: STAGING_DEPLOY_RECOVERY.workflowPath,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: state.workflow.controlSha,
    run_started_at: "2026-09-22T12:00:00.000Z",
    repository: { full_name: STAGING_DEPLOY_RECOVERY.repository },
    head_repository: { full_name: STAGING_DEPLOY_RECOVERY.repository },
  };
  const artifact = {
    id: Number(state.recoveryArtifact.id),
    name: state.recoveryArtifact.name,
    digest: state.recoveryArtifact.digest,
    expired: false,
    size_in_bytes: 4096,
    created_at: "2026-09-22T12:01:00.000Z",
    expires_at: "2026-12-21T12:01:00.000Z",
    workflow_run: {
      id: Number(state.workflow.runId),
      head_branch: "main",
      head_sha: state.workflow.controlSha,
    },
  };
  const now = Date.parse("2026-09-22T12:02:00.000Z");
  assert.equal(validateStagingDeployRecoveryArtifactMetadata(artifact, run, state, now).valid, true);
  for (const [changedArtifact, changedRun] of [
    [{ ...artifact, id: artifact.id + 1 }, run],
    [{ ...artifact, digest: `sha256:${digest("7")}` }, run],
    [{ ...artifact, expired: true }, run],
    [{ ...artifact, expires_at: "2026-09-29T12:01:59.999Z" }, run],
    [{ ...artifact, expires_at: "2026-09-22T12:01:30.000Z" }, run],
    [{ ...artifact, created_at: "2026-09-22T12:08:00.000Z" }, run],
    [artifact, { ...run, run_attempt: 2 }],
    [artifact, { ...run, path: ".github/workflows/substituted.yml" }],
  ])
    assert.equal(
      validateStagingDeployRecoveryArtifactMetadata(changedArtifact, changedRun, state, now).valid,
      false,
    );
});

async function artifactFixture(root) {
  const distPath = join(root, "dist-source");
  const artifactPath = join(root, "artifact");
  const outputPath = join(artifactPath, "outputs");
  await mkdir(distPath, { recursive: true });
  await mkdir(outputPath, { recursive: true });
  await writeFile(
    join(distPath, "release-manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, release: originalRelease })}\n`,
  );
  await writeFile(join(distPath, "index.html"), "<!doctype html><title>recovery</title>\n");
  const archivePath = join(outputPath, STAGING_DEPLOY_RECOVERY.archiveFile);
  const seal = await sealProductionDistArchive(distPath, archivePath, originalRelease);
  const sealPath = join(outputPath, STAGING_DEPLOY_RECOVERY.sealFile);
  await writeFile(sealPath, `${JSON.stringify(seal, null, 2)}\n`);
  const archiveBytes = await readFile(archivePath);
  const sealBytes = await readFile(sealPath);
  const sourceProfile = profile();
  const source = {
    ciRunId: "35700000001",
    ciRunAttempt: 1,
    gateCiRunAttempt: 2,
    artifactId: "10600000001",
    digest: `sha256:${digest("d")}`,
    name: stagingFrontendArtifactName(originalRelease, "35700000001", 1),
    profileSha256: sourceProfile.sha256,
  };
  const provenance = {
    schemaVersion: 1,
    event: "g12.staging.frontend.package_provenance",
    repository: STAGING_DEPLOY_RECOVERY.repository,
    workflow: {
      name: STAGING_FRONTEND_PACKAGE.workflowName,
      path: STAGING_FRONTEND_PACKAGE.workflowPath,
    },
    controlSha: originalRelease,
    sourceRunId: source.ciRunId,
    sourceRunAttempt: source.ciRunAttempt,
    artifactName: source.name,
    profile: sourceProfile,
    archive: {
      file: STAGING_DEPLOY_RECOVERY.archiveFile,
      bytes: archiveBytes.length,
      sha256: sha256(archiveBytes),
    },
    seal: {
      file: STAGING_FRONTEND_PACKAGE.sealFile,
      bytes: sealBytes.length,
      sha256: sha256(sealBytes),
    },
    dist: {
      treeSha256: seal.treeSha256,
      fileCount: seal.fileCount,
      byteCount: seal.byteCount,
    },
  };
  await writeFile(
    join(outputPath, STAGING_DEPLOY_RECOVERY.provenanceFile),
    `${JSON.stringify(provenance, null, 2)}\n`,
  );
  const original = {
    deploymentId: "848be723-25d4-4d3a-ae00-907e77fd98b6",
    release: originalRelease,
    createdOn: "2026-09-22T11:05:24.028Z",
    commitMessage: "g12-staging-bridge-run-35700000000-1",
  };
  const dist = {
    archiveSha256: seal.archiveSha256,
    treeSha256: seal.treeSha256,
    archiveBytes: seal.archiveBytes,
    fileCount: seal.fileCount,
    byteCount: seal.byteCount,
  };
  assert.equal(
    validateStagingDeployRecoverySourceFiles({
      seal,
      provenance,
      originalRelease,
      source,
      dist,
    }).valid,
    true,
  );
  const environmentPath = join(outputPath, STAGING_DEPLOY_RECOVERY.environmentSnapshotFile);
  const environment = await writeStagingEnvironmentSnapshot({
    outputPath: environmentPath,
    migrationOutput,
    functionsOutput,
    candidateSha: candidateRelease,
    controlSha,
    projectRef: STAGING_ENVIRONMENT_SNAPSHOT.projectRef,
    pagesDeployment: {
      id: original.deploymentId,
      branch: STAGING_ENVIRONMENT_SNAPSHOT.pagesBranch,
      commitSha: original.release,
      createdOn: original.createdOn,
    },
    generatedAt: "2026-09-22T12:00:00.000Z",
  });
  await cp(distPath, join(artifactPath, "dist"), { recursive: true });
  const edgeBody = frameRawEszip(fixtureEszip());
  const edgeBodySha256 = sha256(edgeBody);
  const edgeRecords = edgeInventory(edgeBodySha256);
  const edgeArtifact = writeStagingEdgeBaselineArtifact({
    outputDirectory: join(artifactPath, STAGING_DEPLOY_RECOVERY.edgeBaselineDirectory),
    workflow: { runId: "35700000002", runAttempt: 1, controlSha },
    candidateSha: candidateRelease,
    projectRef: STAGING_EDGE_BASELINE_ARTIFACT.projectRef,
    capturedAt: "2026-09-22T11:59:00.000Z",
    beforePayload: edgeRecords,
    afterPayload: structuredClone(edgeRecords),
    bodies: Object.fromEntries(PRODUCTION_FUNCTIONS.map((name) => [name, edgeBody])),
  });
  const state = buildStagingDeployRecoveryState({
    workflow: { runId: "35700000002", attempt: 1, controlSha },
    candidateRelease,
    original,
    source,
    dist,
    recoveryArtifact: {
      id: "10600000002",
      digest: `sha256:${digest("9")}`,
      name: "staging-recovery-35700000002-1",
    },
    environmentSnapshot: {
      file: STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath,
      sha256: environment.snapshotSha256,
    },
    edgeBaseline: {
      manifestFile: STAGING_DEPLOY_RECOVERY.edgeBaselineManifestPath,
      manifestSha256: edgeArtifact.manifestSha256,
      inventorySha256: edgeArtifact.manifest.inventorySha256,
      functionCount: edgeArtifact.manifest.functionCount,
      aggregateBytes: edgeArtifact.manifest.aggregateBytes,
      aggregateRawEszipBytes: edgeArtifact.manifest.aggregateRawEszipBytes,
    },
    browserRecovery: {
      environment: "staging",
      runTag: `QA-CMS-FINAL-20260922-${candidateRelease.slice(0, 8)}`,
    },
  });
  return { artifactPath, outputPath, state };
}

test("local recovery verification proves archive, seal, provenance, snapshot and dist", async () => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-recovery-test-"));
  try {
    const fixture = await artifactFixture(root);
    const result = await verifyStagingDeployRecoveryArtifact({
      artifactDirectory: fixture.artifactPath,
      state: fixture.state,
    });
    assert.equal(result.archiveSha256, fixture.state.dist.archiveSha256);

    const substitutedCandidate = structuredClone(fixture.state);
    substitutedCandidate.candidateRelease = "d".repeat(40);
    substitutedCandidate.browserRecovery.runTag = `QA-CMS-FINAL-20260922-${"d".repeat(8)}`;
    await assert.rejects(
      () =>
        verifyStagingDeployRecoveryArtifact({
          artifactDirectory: fixture.artifactPath,
          state: substitutedCandidate,
        }),
      /candidate_sha_mismatch/,
    );

    const substitutedControl = structuredClone(fixture.state);
    substitutedControl.workflow.controlSha = "d".repeat(40);
    await assert.rejects(
      () =>
        verifyStagingDeployRecoveryArtifact({
          artifactDirectory: fixture.artifactPath,
          state: substitutedControl,
        }),
      /control_sha_mismatch/,
    );

    const tampered = structuredClone(fixture.state);
    tampered.environmentSnapshot.sha256 = digest("7");
    await assert.rejects(
      () =>
        verifyStagingDeployRecoveryArtifact({
          artifactDirectory: fixture.artifactPath,
          state: tampered,
        }),
      /environment_snapshot_digest_mismatch/,
    );
    const tamperedRawAggregate = structuredClone(fixture.state);
    tamperedRawAggregate.edgeBaseline.aggregateRawEszipBytes += 1;
    await assert.rejects(
      () =>
        verifyStagingDeployRecoveryArtifact({
          artifactDirectory: fixture.artifactPath,
          state: tamperedRawAggregate,
        }),
      /edge_baseline_aggregate_raw_eszip_bytes_state_mismatch/,
    );
    await writeFile(join(fixture.outputPath, "unexpected.txt"), "unexpected\n");
    await assert.rejects(
      () =>
        verifyStagingDeployRecoveryArtifact({
          artifactDirectory: fixture.artifactPath,
          state: fixture.state,
        }),
      /CONTENTS_REFUSED/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("state writer derives sealed identities and binds the authoritative remote snapshot", async () => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-recovery-writer-test-"));
  try {
    const fixture = await artifactFixture(root);
    const statePath = join(root, "staging-deploy-state.json");
    const environment = {
      ...process.env,
      GITHUB_RUN_ID: fixture.state.workflow.runId,
      GITHUB_RUN_ATTEMPT: String(fixture.state.workflow.attempt),
      CONTROL_SHA: fixture.state.workflow.controlSha,
      CANDIDATE_RELEASE: fixture.state.candidateRelease,
      ORIGINAL_DEPLOYMENT_ID: fixture.state.original.deploymentId,
      ORIGINAL_RELEASE: fixture.state.original.release,
      ORIGINAL_CREATED_ON: fixture.state.original.createdOn,
      ORIGINAL_COMMIT_MESSAGE_B64: Buffer.from(fixture.state.original.commitMessage, "utf8").toString(
        "base64",
      ),
      SOURCE_CI_RUN_ID: fixture.state.source.ciRunId,
      SOURCE_CI_RUN_ATTEMPT: String(fixture.state.source.ciRunAttempt),
      GATE_CI_RUN_ATTEMPT: String(fixture.state.source.gateCiRunAttempt),
      SOURCE_ARTIFACT_ID: fixture.state.source.artifactId,
      SOURCE_ARTIFACT_DIGEST: fixture.state.source.digest,
      SOURCE_ARTIFACT_NAME: fixture.state.source.name,
      SOURCE_PROFILE_SHA256: fixture.state.source.profileSha256,
      RECOVERY_ARTIFACT_ID: fixture.state.recoveryArtifact.id,
      RECOVERY_ARTIFACT_DIGEST: fixture.state.recoveryArtifact.digest,
      RECOVERY_ARTIFACT_NAME: fixture.state.recoveryArtifact.name,
      BROWSER_RUN_TAG: fixture.state.browserRecovery.runTag,
    };
    const arguments_ = [
      "scripts/ev2/phase12/write-staging-deploy-recovery-state.mjs",
      "--output",
      statePath,
      "--seal",
      join(fixture.outputPath, STAGING_DEPLOY_RECOVERY.sealFile),
      "--provenance",
      join(fixture.outputPath, STAGING_DEPLOY_RECOVERY.provenanceFile),
      "--environment-snapshot",
      join(fixture.outputPath, STAGING_DEPLOY_RECOVERY.environmentSnapshotFile),
      "--edge-baseline",
      join(fixture.artifactPath, STAGING_DEPLOY_RECOVERY.edgeBaselineDirectory),
    ];
    const written = spawnSync(process.execPath, arguments_, { env: environment, encoding: "utf8" });
    assert.equal(written.status, 0, written.stderr);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), fixture.state);

    const substituted = spawnSync(
      process.execPath,
      arguments_.map((value) => (value === statePath ? join(root, "substituted-state.json") : value)),
      {
        env: { ...environment, CANDIDATE_RELEASE: "d".repeat(40) },
        encoding: "utf8",
      },
    );
    assert.notEqual(substituted.status, 0);
    assert.match(substituted.stderr, /candidate_sha_mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
