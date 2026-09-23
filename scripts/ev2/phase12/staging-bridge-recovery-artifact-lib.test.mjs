import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";

import {
  resolveStagingBridgeRecoveryProvenanceMode,
  STAGING_BRIDGE_RECOVERY_PROVENANCE,
  verifyStagingBridgeRecoveryArtifact,
  verifyStagingBridgeRecoveryOutputs,
} from "./staging-bridge-recovery-artifact-lib.mjs";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeTopology(root, provenanceMode) {
  await mkdir(root, { recursive: true });
  const modern = provenanceMode === STAGING_BRIDGE_RECOVERY_PROVENANCE.required;
  const archiveFile = modern ? "staging-frontend-dist.tar" : "staging-candidate-dist.tar";
  const companionSealFile = modern ? "staging-frontend-dist-seal.json" : "staging-candidate-dist-seal.json";
  const archive = Buffer.from(modern ? "modern immutable archive" : "bootstrap immutable archive");
  const seal = Buffer.from(
    `${JSON.stringify({
      schemaVersion: 2,
      event: "g12.production.dist.sealed",
      candidateSha: "a".repeat(40),
      archiveFile,
      archiveBytes: archive.length,
      archiveSha256: sha256(archive),
    })}\n`,
  );
  await writeFile(resolve(root, archiveFile), archive);
  await writeFile(resolve(root, "staging-baseline-dist-seal.json"), seal);
  await writeFile(resolve(root, companionSealFile), seal);
  if (modern) await writeFile(resolve(root, "staging-frontend-provenance.json"), "trusted provenance\n");
  return { archiveFile, companionSealFile };
}

async function fixture(provenanceMode) {
  const root = await mkdtemp(resolve(tmpdir(), "g12-bridge-recovery-topology-"));
  const local = resolve(root, "local");
  const remote = resolve(root, "remote");
  await writeTopology(local, provenanceMode);
  await writeTopology(remote, provenanceMode);
  return { root, local, remote };
}

async function artifactFixture(provenanceMode) {
  const root = await mkdtemp(resolve(tmpdir(), "g12-bridge-recovery-artifact-"));
  const local = resolve(root, "local");
  const remote = resolve(root, "remote");
  for (const artifact of [local, remote]) {
    await mkdir(resolve(artifact, "dist"), { recursive: true });
    await writeFile(resolve(artifact, "dist", "index.html"), "sealed baseline\n");
    await writeTopology(resolve(artifact, "outputs"), provenanceMode);
  }
  return { root, local, remote };
}

test("baseline source mode selects provenance fail-closed", () => {
  for (const baselineMode of ["bridge-v5", "deploy-compensation"])
    assert.equal(
      resolveStagingBridgeRecoveryProvenanceMode({ baselineMode }),
      STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
    );
  for (const baselineMode of ["bootstrap", "legacy-bootstrap-compensation"])
    assert.equal(
      resolveStagingBridgeRecoveryProvenanceMode({ baselineMode }),
      STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent,
    );
  assert.equal(
    resolveStagingBridgeRecoveryProvenanceMode({
      baselineMode: "bridge-compensation",
      compensationProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent,
    }),
    STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent,
  );
  for (const input of [
    { baselineMode: "" },
    { baselineMode: "unknown" },
    { baselineMode: "bridge-compensation", compensationProvenanceMode: "" },
    { baselineMode: "bridge-compensation", compensationProvenanceMode: "optional" },
  ])
    assert.throws(() => resolveStagingBridgeRecoveryProvenanceMode(input), /TOPOLOGY_REFUSED/);
});

for (const provenanceMode of Object.values(STAGING_BRIDGE_RECOVERY_PROVENANCE))
  test(`${provenanceMode} exact local and remote recovery topology is accepted`, async () => {
    const paths = await fixture(provenanceMode);
    try {
      const result = await verifyStagingBridgeRecoveryOutputs({
        outputsDirectory: paths.local,
        peerOutputsDirectory: paths.remote,
        expectedProvenanceMode: provenanceMode,
      });
      assert.equal(result.provenanceMode, provenanceMode);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

for (const provenanceMode of Object.values(STAGING_BRIDGE_RECOVERY_PROVENANCE))
  test(`${provenanceMode} exact local and remote artifact roots are accepted`, async () => {
    const paths = await artifactFixture(provenanceMode);
    try {
      const result = await verifyStagingBridgeRecoveryArtifact({
        artifactRoot: paths.local,
        peerArtifactRoot: paths.remote,
        expectedProvenanceMode: provenanceMode,
      });
      assert.equal(result.provenanceMode, provenanceMode);
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  });

test("artifact root refuses unrelated members instead of hiding them from upload", async () => {
  const paths = await artifactFixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
  try {
    await writeFile(resolve(paths.local, "unexpected.txt"), "unexpected\n");
    await assert.rejects(
      verifyStagingBridgeRecoveryArtifact({
        artifactRoot: paths.local,
        expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      }),
      /local_payload_contents_invalid/,
    );
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("artifact root refuses symlinked dist and outputs directories", async (t) => {
  for (const directory of ["dist", "outputs"]) {
    const paths = await artifactFixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
    try {
      const target = resolve(paths.root, `outside-${directory}`);
      const member = resolve(paths.local, directory);
      await mkdir(target);
      await rm(member, { recursive: true });
      try {
        await symlink(target, member, process.platform === "win32" ? "junction" : "dir");
      } catch (error) {
        if (error?.code === "EPERM") {
          t.skip("symlink creation is unavailable on this Windows host");
          return;
        }
        throw error;
      }
      await assert.rejects(
        verifyStagingBridgeRecoveryArtifact({
          artifactRoot: paths.local,
          expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
        }),
        /local_payload_contents_invalid/,
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("artifact root refuses a symlinked root", async (t) => {
  const root = await mkdtemp(resolve(tmpdir(), "g12-bridge-recovery-root-link-"));
  const target = resolve(root, "target");
  const linked = resolve(root, "linked");
  try {
    await mkdir(resolve(target, "dist"), { recursive: true });
    await writeFile(resolve(target, "dist", "index.html"), "sealed baseline\n");
    await writeTopology(resolve(target, "outputs"), STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
    try {
      await symlink(target, linked, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("symlink creation is unavailable on this Windows host");
        return;
      }
      throw error;
    }
    await assert.rejects(
      verifyStagingBridgeRecoveryArtifact({
        artifactRoot: linked,
        expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      }),
      /local_payload_root_invalid/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("artifact roots reject extra recovery-like members locally and after download", async () => {
  for (const { provenanceMode, side, extra } of [
    {
      provenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      side: "local",
      extra: "extra-recovery.tar",
    },
    {
      provenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      side: "local",
      extra: "staging-unexpected-dist-seal.json",
    },
    {
      provenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent,
      side: "local",
      extra: "staging-frontend-provenance.json",
    },
    {
      provenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      side: "remote",
      extra: "extra-recovery.tar",
    },
  ]) {
    const paths = await artifactFixture(provenanceMode);
    try {
      await writeFile(resolve(paths[side], "outputs", extra), "unexpected\n");
      await assert.rejects(
        verifyStagingBridgeRecoveryArtifact({
          artifactRoot: paths.local,
          peerArtifactRoot: paths.remote,
          expectedProvenanceMode: provenanceMode,
        }),
        side === "local" ? /local_outputs_contents_invalid/ : /remote_outputs_contents_invalid/,
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("recovery artifact CLI verifies local and downloaded roots and requires the new root interface", async () => {
  const paths = await artifactFixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
  const cli = resolve("scripts/ev2/phase12/verify-staging-bridge-recovery-artifact.mjs");
  try {
    const verified = spawnSync(
      process.execPath,
      [
        cli,
        "--root",
        paths.local,
        "--peer-root",
        paths.remote,
        "--expected-provenance-mode",
        STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      ],
      { encoding: "utf8" },
    );
    assert.equal(verified.status, 0, `${verified.stderr}\n${verified.stdout}`);
    assert.match(verified.stdout, /"remoteBytesVerified":true/);

    const missingRoot = spawnSync(
      process.execPath,
      [cli, "--expected-provenance-mode", STAGING_BRIDGE_RECOVERY_PROVENANCE.required],
      { encoding: "utf8" },
    );
    assert.notEqual(missingRoot.status, 0);
    assert.match(missingRoot.stderr, /G12_STAGING_BRIDGE_RECOVERY_TOPOLOGY_INPUT_REFUSED/);
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("modern recovery refuses missing or mismatched provenance", async () => {
  for (const mutation of [
    async (paths) => rm(resolve(paths.remote, "staging-frontend-provenance.json")),
    async (paths) => writeFile(resolve(paths.remote, "staging-frontend-provenance.json"), "changed\n"),
  ]) {
    const paths = await fixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
    try {
      await mutation(paths);
      await assert.rejects(
        verifyStagingBridgeRecoveryOutputs({
          outputsDirectory: paths.local,
          peerOutputsDirectory: paths.remote,
          expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
        }),
        /TOPOLOGY_REFUSED/,
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("bootstrap recovery refuses provenance downgrade ambiguity and unknown files", async () => {
  for (const extra of ["staging-frontend-provenance.json", "unexpected.txt"]) {
    const paths = await fixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent);
    try {
      await writeFile(resolve(paths.local, extra), "unexpected\n");
      await assert.rejects(
        verifyStagingBridgeRecoveryOutputs({
          outputsDirectory: paths.local,
          expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent,
        }),
        /local_outputs_contents_invalid/,
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("recovery refuses seal archive and redundant seal substitution", async () => {
  for (const mutation of [
    async (paths) => writeFile(resolve(paths.remote, "staging-frontend-dist.tar"), "changed archive"),
    async (paths) => writeFile(resolve(paths.remote, "staging-frontend-dist-seal.json"), "{}\n"),
    async (paths) => {
      const sealPath = resolve(paths.remote, "staging-baseline-dist-seal.json");
      const seal = JSON.parse(await readFile(sealPath, "utf8"));
      seal.archiveFile = "unknown.tar";
      const bytes = `${JSON.stringify(seal)}\n`;
      await writeFile(sealPath, bytes);
      await writeFile(resolve(paths.remote, "staging-frontend-dist-seal.json"), bytes);
    },
  ]) {
    const paths = await fixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
    try {
      await mutation(paths);
      await assert.rejects(
        verifyStagingBridgeRecoveryOutputs({
          outputsDirectory: paths.local,
          peerOutputsDirectory: paths.remote,
          expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
        }),
        /TOPOLOGY_REFUSED/,
      );
    } finally {
      await rm(paths.root, { recursive: true, force: true });
    }
  }
});

test("recovery refuses a self-consistent remote artifact whose bytes differ from local", async () => {
  const paths = await fixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
  try {
    const remoteArchive = Buffer.from("self-consistent but substituted remote archive");
    const sealPath = resolve(paths.remote, "staging-baseline-dist-seal.json");
    const remoteSeal = JSON.parse(await readFile(sealPath, "utf8"));
    remoteSeal.archiveBytes = remoteArchive.length;
    remoteSeal.archiveSha256 = sha256(remoteArchive);
    const remoteSealBytes = `${JSON.stringify(remoteSeal)}\n`;
    await writeFile(resolve(paths.remote, "staging-frontend-dist.tar"), remoteArchive);
    await writeFile(sealPath, remoteSealBytes);
    await writeFile(resolve(paths.remote, "staging-frontend-dist-seal.json"), remoteSealBytes);
    await assert.rejects(
      verifyStagingBridgeRecoveryOutputs({
        outputsDirectory: paths.local,
        peerOutputsDirectory: paths.remote,
        expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      }),
      /remote_(?:baseline_seal|companion_seal|archive)_bytes_mismatch/,
    );
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});

test("recovery refuses a symlink member", async (t) => {
  const paths = await fixture(STAGING_BRIDGE_RECOVERY_PROVENANCE.required);
  try {
    const target = resolve(paths.root, "outside-provenance.json");
    const member = resolve(paths.local, "staging-frontend-provenance.json");
    await writeFile(target, "outside\n");
    await rm(member);
    try {
      await symlink(target, member, "file");
    } catch (error) {
      if (error?.code === "EPERM") {
        t.skip("symlink creation is unavailable on this Windows host");
        return;
      }
      throw error;
    }
    await assert.rejects(
      verifyStagingBridgeRecoveryOutputs({
        outputsDirectory: paths.local,
        expectedProvenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
      }),
      /local_outputs_contents_invalid/,
    );
  } finally {
    await rm(paths.root, { recursive: true, force: true });
  }
});
