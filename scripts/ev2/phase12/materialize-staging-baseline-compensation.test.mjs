import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { sealProductionDistArchive } from "./production-dist-seal-lib.mjs";
import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  buildStagingDeployRecoveryState,
  STAGING_DEPLOY_RECOVERY,
} from "./staging-deploy-recovery-state-lib.mjs";
import { frameRawEszip } from "./staging-cms-public-hotfix-lib.mjs";
import {
  STAGING_EDGE_BASELINE_ARTIFACT,
  writeStagingEdgeBaselineArtifact,
} from "./staging-edge-baseline-artifact-lib.mjs";
import {
  STAGING_ENVIRONMENT_SNAPSHOT,
  writeStagingEnvironmentSnapshot,
} from "./staging-environment-snapshot-lib.mjs";
import { stagingSealIdentity } from "./staging-recovery-seal-lib.mjs";
import { writeStagingFrontendPackage } from "./staging-frontend-package-lib.mjs";

const candidateSha = "b".repeat(40);
const attemptedCandidateSha = "c".repeat(40);
const controlSha = "a".repeat(40);
const runId = "40000000001";
const runAttempt = 3;
const profile = {
  VITE_RELEASE: candidateSha,
  VITE_CMS_ENVIRONMENT: "staging",
  VITE_SUPABASE_URL: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
  VITE_SUPABASE_ANON_KEY: "anon-key-at-least-twenty-characters",
  VITE_TURNSTILE_SITE_KEY: "turnstile-real-looking-key",
  VITE_GOOGLE_MAPS_KEY: "maps-real-looking-key",
  VITE_CONTACT_CAPTCHA_ALWAYS: "true",
  VITE_EV2_DRAFT_V2_CANDIDATE: "false",
};

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

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "g12-compensation-test-"));
  const sourceDist = resolve(root, "source-dist");
  const source = resolve(root, "source");
  const packageRoot = resolve(root, "package");
  const recovery = resolve(root, "recovery");
  const stateRoot = resolve(root, "state");
  await mkdir(sourceDist);
  await mkdir(source);
  await writeFile(
    resolve(sourceDist, "release-manifest.json"),
    `${JSON.stringify({ schemaVersion: 1, release: candidateSha })}\n`,
  );
  await writeFile(resolve(sourceDist, "index.html"), "safe bytes\n");
  const archive = resolve(source, "staging-frontend-dist.tar");
  const sealPath = resolve(source, "staging-frontend-dist-seal.json");
  const seal = await sealProductionDistArchive(sourceDist, archive, candidateSha);
  await writeFile(sealPath, `${JSON.stringify(seal, null, 2)}\n`);
  await writeStagingFrontendPackage({
    archivePath: archive,
    sealPath,
    outputDirectory: packageRoot,
    candidateSha,
    runId: "39999999999",
    runAttempt: 2,
    environment: profile,
  });

  await mkdir(resolve(recovery, "outputs"), { recursive: true });
  await cp(sourceDist, resolve(recovery, "dist"), { recursive: true });
  await cp(
    resolve(packageRoot, "staging-frontend-dist.tar"),
    resolve(recovery, "outputs/staging-frontend-dist.tar"),
  );
  await cp(
    resolve(packageRoot, "staging-frontend-dist-seal.json"),
    resolve(recovery, "outputs/staging-baseline-dist-seal.json"),
  );
  await cp(
    resolve(packageRoot, "staging-frontend-provenance.json"),
    resolve(recovery, "outputs/staging-frontend-provenance.json"),
  );
  await mkdir(stateRoot);
  const original = {
    deploymentId: "00000000-0000-4000-8000-000000000001",
    release: candidateSha,
    createdOn: "2026-09-22T11:00:00.000Z",
    commitMessage: "g12-staging-bridge-run-39999999998-1",
  };
  const provenance = JSON.parse(
    await readFile(resolve(packageRoot, "staging-frontend-provenance.json"), "utf8"),
  );
  const sourceIdentity = {
    ciRunId: provenance.sourceRunId,
    ciRunAttempt: provenance.sourceRunAttempt,
    gateCiRunAttempt: provenance.sourceRunAttempt,
    artifactId: "199",
    digest: `sha256:${"4".repeat(64)}`,
    name: provenance.artifactName,
    profileSha256: provenance.profile.sha256,
  };
  const distIdentity = {
    archiveSha256: seal.archiveSha256,
    treeSha256: seal.treeSha256,
    archiveBytes: seal.archiveBytes,
    fileCount: seal.fileCount,
    byteCount: seal.byteCount,
  };
  const environmentPath = resolve(recovery, STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath);
  const environmentSnapshot = await writeStagingEnvironmentSnapshot({
    outputPath: environmentPath,
    migrationOutput: "Local | Remote | Time (UTC)\n20260901000000 | 20260901000000 | 2026-09-01 00:00:00\n",
    functionsOutput: JSON.stringify([
      { name: "cms-public", status: "ACTIVE", version: 7, verify_jwt: false },
    ]),
    candidateSha: attemptedCandidateSha,
    controlSha,
    projectRef: STAGING_ENVIRONMENT_SNAPSHOT.projectRef,
    pagesDeployment: {
      id: original.deploymentId,
      branch: STAGING_ENVIRONMENT_SNAPSHOT.pagesBranch,
      commitSha: original.release,
      createdOn: original.createdOn,
    },
    generatedAt: "2026-09-22T11:30:00.000Z",
  });
  const edgeBody = frameRawEszip(fixtureEszip());
  const edgeRecords = edgeInventory(sha256(edgeBody));
  const edgeArtifact = writeStagingEdgeBaselineArtifact({
    outputDirectory: resolve(recovery, STAGING_DEPLOY_RECOVERY.edgeBaselineDirectory),
    workflow: { runId, runAttempt, controlSha },
    candidateSha: attemptedCandidateSha,
    projectRef: STAGING_EDGE_BASELINE_ARTIFACT.projectRef,
    capturedAt: "2026-09-22T11:29:00.000Z",
    beforePayload: edgeRecords,
    afterPayload: structuredClone(edgeRecords),
    bodies: Object.fromEntries(PRODUCTION_FUNCTIONS.map((name) => [name, edgeBody])),
  });
  const state = buildStagingDeployRecoveryState({
    workflow: { runId, attempt: runAttempt, controlSha },
    candidateRelease: attemptedCandidateSha,
    original,
    source: sourceIdentity,
    dist: distIdentity,
    recoveryArtifact: {
      id: "200",
      digest: `sha256:${"5".repeat(64)}`,
      name: `staging-recovery-${runId}-${runAttempt}`,
    },
    environmentSnapshot: {
      file: STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath,
      sha256: environmentSnapshot.snapshotSha256,
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
      runTag: `QA-CMS-FINAL-20260922-${attemptedCandidateSha.slice(0, 8)}`,
    },
  });
  const statePath = resolve(stateRoot, "staging-deploy-state.json");
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
  return { root, recovery, stateRoot, statePath, state, packageRoot, sourceDist };
}

function materialize(paths, output, options = {}) {
  const mode = options.mode ?? "deploy-compensation";
  const args = [
    "scripts/ev2/phase12/materialize-staging-baseline-compensation.mjs",
    "--mode",
    mode,
    "--record",
    options.record ?? ".github/release-controls/staging-baseline-bootstrap.json",
    "--recovery-dir",
    options.recovery ?? paths.recovery,
  ];
  args.push(
    "--state-dir",
    options.stateRoot ?? paths.stateRoot,
    "--recovery-artifact-id",
    options.recoveryArtifactId ?? (mode === "deploy-compensation" ? "200" : "201"),
    "--recovery-artifact-digest",
    options.recoveryArtifactDigest ??
      (mode === "deploy-compensation" ? `sha256:${"5".repeat(64)}` : `sha256:${"6".repeat(64)}`),
    "--recovery-artifact-name",
    options.recoveryArtifactName ??
      (mode === "deploy-compensation"
        ? `staging-recovery-${runId}-${runAttempt}`
        : `staging-frontend-bridge-recovery-${runId}-${runAttempt}`),
  );
  args.push(
    "--candidate",
    options.candidateSha ?? candidateSha,
    "--run-id",
    runId,
    "--run-attempt",
    String(runAttempt),
    "--control-sha",
    controlSha,
    "--output-dist",
    output,
  );
  return spawnSync(process.execPath, args, {
    cwd: resolve("."),
    encoding: "utf8",
    env: { ...process.env, ...profile, GITHUB_OUTPUT: options.githubOutput ?? "" },
  });
}

async function prepareModernBridgeCompensation(paths) {
  const bridgeRecovery = resolve(paths.root, "bridge-recovery-fixture");
  const bridgeStateRoot = resolve(paths.root, "bridge-state-fixture");
  await mkdir(resolve(bridgeRecovery, "outputs"), { recursive: true });
  await mkdir(bridgeStateRoot);
  await cp(paths.sourceDist, resolve(bridgeRecovery, "dist"), { recursive: true });
  for (const [source, target] of [
    ["staging-frontend-dist.tar", "staging-frontend-dist.tar"],
    ["staging-frontend-dist-seal.json", "staging-baseline-dist-seal.json"],
    ["staging-frontend-dist-seal.json", "staging-frontend-dist-seal.json"],
    ["staging-frontend-provenance.json", "staging-frontend-provenance.json"],
  ])
    await cp(resolve(paths.packageRoot, source), resolve(bridgeRecovery, "outputs", target));
  const seal = JSON.parse(
    await readFile(resolve(paths.packageRoot, "staging-frontend-dist-seal.json"), "utf8"),
  );
  const bridgeState = {
    schemaVersion: 1,
    event: "g12.staging.deploy.prepared",
    workflow: { runId, runAttempt, controlSha },
    project: "gaiatec-cms-staging",
    branch: "ev2-g17-canary",
    runMarker: `g12-staging-bridge-run-${runId}-${runAttempt}`,
    compensationMarker: `g12-staging-bridge-compensation-${runId}-${runAttempt}`,
    candidateRelease: "c".repeat(40),
    original: paths.state.original,
    recovery: {
      artifact: {
        id: "201",
        digest: `sha256:${"6".repeat(64)}`,
        name: `staging-frontend-bridge-recovery-${runId}-${runAttempt}`,
      },
      seal: stagingSealIdentity(seal),
    },
  };
  const bridgeStatePath = resolve(bridgeStateRoot, "staging-frontend-bridge-state.json");
  await writeFile(bridgeStatePath, `${JSON.stringify(bridgeState, null, 2)}\n`);
  return { bridgeRecovery, bridgeStateRoot, bridgeStatePath, bridgeState };
}

test("deploy compensation validates state and recovery before materializing unchanged bytes", async () => {
  const paths = await fixture();
  try {
    const output = resolve(paths.root, "verified");
    const result = materialize(paths, output);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(await readFile(resolve(output, "release-manifest.json"), "utf8")), {
      schemaVersion: 1,
      release: candidateSha,
    });
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("bridge compensation materializes current recovery bytes bound to its separate state", async () => {
  const paths = await fixture();
  try {
    const bridgeRecovery = resolve(paths.root, "bridge-recovery");
    const bridgeStateRoot = resolve(paths.root, "bridge-state");
    await mkdir(resolve(bridgeRecovery, "outputs"), { recursive: true });
    await mkdir(bridgeStateRoot);
    await cp(paths.sourceDist, resolve(bridgeRecovery, "dist"), { recursive: true });
    for (const [source, target] of [
      ["staging-frontend-dist.tar", "staging-frontend-dist.tar"],
      ["staging-frontend-dist-seal.json", "staging-baseline-dist-seal.json"],
      ["staging-frontend-dist-seal.json", "staging-frontend-dist-seal.json"],
      ["staging-frontend-provenance.json", "staging-frontend-provenance.json"],
    ])
      await cp(resolve(paths.packageRoot, source), resolve(bridgeRecovery, "outputs", target));
    const seal = JSON.parse(
      await readFile(resolve(paths.packageRoot, "staging-frontend-dist-seal.json"), "utf8"),
    );
    const bridgeState = {
      schemaVersion: 1,
      event: "g12.staging.deploy.prepared",
      workflow: { runId, runAttempt, controlSha },
      project: "gaiatec-cms-staging",
      branch: "ev2-g17-canary",
      runMarker: `g12-staging-bridge-run-${runId}-${runAttempt}`,
      compensationMarker: `g12-staging-bridge-compensation-${runId}-${runAttempt}`,
      candidateRelease: "c".repeat(40),
      original: paths.state.original,
      recovery: {
        artifact: {
          id: "201",
          digest: `sha256:${"6".repeat(64)}`,
          name: `staging-frontend-bridge-recovery-${runId}-${runAttempt}`,
        },
        seal: stagingSealIdentity(seal),
      },
    };
    await writeFile(
      resolve(bridgeStateRoot, "staging-frontend-bridge-state.json"),
      `${JSON.stringify(bridgeState, null, 2)}\n`,
    );
    const output = resolve(paths.root, "bridge-verified");
    const githubOutput = resolve(paths.root, "bridge-output.txt");
    const result = materialize(paths, output, {
      mode: "bridge-compensation",
      recovery: bridgeRecovery,
      stateRoot: bridgeStateRoot,
      githubOutput,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(githubOutput, "utf8"), /provenance_mode=required/);
    assert.deepEqual(JSON.parse(await readFile(resolve(output, "release-manifest.json"), "utf8")), {
      schemaVersion: 1,
      release: candidateSha,
    });
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("bridge compensation rejects every recovery artifact tuple divergence before materialization", async () => {
  for (const options of [
    { recoveryArtifactId: "202" },
    { recoveryArtifactDigest: `sha256:${"7".repeat(64)}` },
    { recoveryArtifactName: `staging-frontend-bridge-recovery-${runId}-different` },
  ]) {
    const paths = await fixture();
    try {
      const bridge = await prepareModernBridgeCompensation(paths);
      const output = resolve(paths.root, "bridge-artifact-refused");
      const result = materialize(paths, output, {
        mode: "bridge-compensation",
        recovery: bridge.bridgeRecovery,
        stateRoot: bridge.bridgeStateRoot,
        ...options,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /recovery_artifact_binding_invalid/);
      await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("bridge compensation rejects a state seal divergent from the exact recovery bytes", async () => {
  const paths = await fixture();
  try {
    const bridge = await prepareModernBridgeCompensation(paths);
    bridge.bridgeState.recovery.seal.archiveSha256 = "7".repeat(64);
    await writeFile(bridge.bridgeStatePath, `${JSON.stringify(bridge.bridgeState, null, 2)}\n`);
    const output = resolve(paths.root, "bridge-seal-refused");
    const result = materialize(paths, output, {
      mode: "bridge-compensation",
      recovery: bridge.bridgeRecovery,
      stateRoot: bridge.bridgeStateRoot,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /recovery_seal_binding_invalid/);
    await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("bridge compensation rejects malformed companion seal bytes or type", async () => {
  for (const mutation of [
    async (path) => writeFile(path, "{}\n"),
    async (path) => {
      await rm(path);
      await mkdir(path);
    },
  ]) {
    const paths = await fixture();
    try {
      const bridge = await prepareModernBridgeCompensation(paths);
      const companionSealPath = resolve(bridge.bridgeRecovery, "outputs", "staging-frontend-dist-seal.json");
      await chmod(companionSealPath, 0o600);
      await mutation(companionSealPath);
      const output = resolve(paths.root, "bridge-companion-refused");
      const result = materialize(paths, output, {
        mode: "bridge-compensation",
        recovery: bridge.bridgeRecovery,
        stateRoot: bridge.bridgeStateRoot,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /G12_STAGING_BRIDGE_RECOVERY_TOPOLOGY_REFUSED/);
      await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("bridge compensation accepts the exact bootstrap recovery without package provenance", async () => {
  const paths = await fixture();
  try {
    const bootstrapSource = resolve(paths.root, "bootstrap-source");
    const bridgeRecovery = resolve(paths.root, "bootstrap-bridge-recovery");
    const bridgeStateRoot = resolve(paths.root, "bootstrap-bridge-state");
    const recordPath = resolve(paths.root, "bootstrap-record.json");
    await mkdir(bootstrapSource);
    await mkdir(resolve(bridgeRecovery, "outputs"), { recursive: true });
    await mkdir(bridgeStateRoot);
    await cp(paths.sourceDist, resolve(bridgeRecovery, "dist"), { recursive: true });
    const archivePath = resolve(bootstrapSource, "staging-candidate-dist.tar");
    const seal = await sealProductionDistArchive(paths.sourceDist, archivePath, candidateSha);
    const sealBytes = Buffer.from(`${JSON.stringify(seal, null, 2)}\n`);
    await writeFile(
      resolve(bridgeRecovery, "outputs/staging-candidate-dist.tar"),
      await readFile(archivePath),
    );
    await writeFile(resolve(bridgeRecovery, "outputs/staging-baseline-dist-seal.json"), sealBytes);
    await writeFile(resolve(bridgeRecovery, "outputs/staging-candidate-dist-seal.json"), sealBytes);
    const record = {
      schemaVersion: 1,
      event: "g12.staging.baseline.bootstrap",
      repository: "Vnd93/gaiatec-cms",
      candidateSha,
      canonical: {
        deploymentId: "00000000-0000-4000-8000-000000000002",
        createdOn: "2026-09-22T10:00:00.000Z",
        commitMessage: "g12-staging-bridge-run-39999999997-1",
      },
      bridge: {
        runId: "39999999997",
        runAttempt: 1,
        controlSha: candidateSha,
        artifactId: "101",
        artifactDigest: `sha256:${"1".repeat(64)}`,
        artifactName: `staging-frontend-bridge-${candidateSha}`,
        evidenceSha256: "2".repeat(64),
      },
      source: {
        runId: "39999999996",
        runAttempt: 1,
        controlSha: candidateSha,
        artifactId: "102",
        artifactDigest: `sha256:${"3".repeat(64)}`,
        artifactName: `staging-candidate-${candidateSha}-39999999996-1`,
        sealFile: "staging-candidate-dist-seal.json",
        archiveFile: "staging-candidate-dist.tar",
        sealSha256: createHash("sha256").update(sealBytes).digest("hex"),
      },
      dist: {
        archiveSha256: seal.archiveSha256,
        treeSha256: seal.treeSha256,
        archiveBytes: seal.archiveBytes,
        fileCount: seal.fileCount,
        byteCount: seal.byteCount,
      },
    };
    await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`);
    const bridgeState = {
      schemaVersion: 1,
      event: "g12.staging.deploy.prepared",
      workflow: { runId, runAttempt, controlSha },
      project: "gaiatec-cms-staging",
      branch: "ev2-g17-canary",
      runMarker: `g12-staging-bridge-run-${runId}-${runAttempt}`,
      compensationMarker: `g12-staging-bridge-compensation-${runId}-${runAttempt}`,
      candidateRelease: "c".repeat(40),
      original: {
        deploymentId: record.canonical.deploymentId,
        release: candidateSha,
        createdOn: record.canonical.createdOn,
        commitMessage: record.canonical.commitMessage,
      },
      recovery: {
        artifact: {
          id: "201",
          digest: `sha256:${"6".repeat(64)}`,
          name: `staging-frontend-bridge-recovery-${runId}-${runAttempt}`,
        },
        seal: stagingSealIdentity(seal),
      },
    };
    await writeFile(
      resolve(bridgeStateRoot, "staging-frontend-bridge-state.json"),
      `${JSON.stringify(bridgeState, null, 2)}\n`,
    );
    const output = resolve(paths.root, "bootstrap-verified");
    const githubOutput = resolve(paths.root, "bootstrap-output.txt");
    const result = materialize(paths, output, {
      mode: "bridge-compensation",
      recovery: bridgeRecovery,
      stateRoot: bridgeStateRoot,
      record: recordPath,
      githubOutput,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(await readFile(githubOutput, "utf8"), /provenance_mode=pinned-bootstrap-absent/);
    assert.deepEqual(JSON.parse(await readFile(resolve(output, "release-manifest.json"), "utf8")), {
      schemaVersion: 1,
      release: candidateSha,
    });
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("deploy compensation rejects a substituted state before creating output", async () => {
  const paths = await fixture();
  try {
    paths.state.original.release = "c".repeat(40);
    await writeFile(paths.statePath, `${JSON.stringify(paths.state, null, 2)}\n`);
    const output = resolve(paths.root, "refused");
    const result = materialize(paths, output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /G12_STAGING_BASELINE_COMPENSATION_STATE_REFUSED/);
    await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("deploy compensation rejects substituted recovery bytes before materialization", async () => {
  const paths = await fixture();
  try {
    await writeFile(resolve(paths.recovery, "dist/index.html"), "substituted\n");
    const output = resolve(paths.root, "refused");
    const result = materialize(paths, output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /recovery_snapshot/);
    await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("deploy compensation rejects a substituted remote environment snapshot", async () => {
  const paths = await fixture();
  try {
    const snapshotPath = resolve(paths.recovery, STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    snapshot.candidateSha = "d".repeat(40);
    await chmod(snapshotPath, 0o600);
    await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    const output = resolve(paths.root, "refused");
    const result = materialize(paths, output);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /STAGING_ENVIRONMENT_SNAPSHOT_REFUSED/);
    await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("deploy compensation rejects remote recovery artifact substitution", async () => {
  const paths = await fixture();
  try {
    const output = resolve(paths.root, "refused");
    const result = materialize(paths, output, {
      recoveryArtifactDigest: `sha256:${"6".repeat(64)}`,
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /recovery_artifact_binding_invalid/);
    await assert.rejects(readFile(resolve(output, "release-manifest.json")), /ENOENT/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
