import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const SHA256 = /^[a-f0-9]{64}$/;
const PREFIX = "G12_STAGING_BRIDGE_RECOVERY_TOPOLOGY_REFUSED";

export const STAGING_BRIDGE_RECOVERY_PROVENANCE = Object.freeze({
  required: "required",
  pinnedBootstrapAbsent: "pinned-bootstrap-absent",
});

const TOPOLOGY = Object.freeze({
  [STAGING_BRIDGE_RECOVERY_PROVENANCE.required]: Object.freeze({
    provenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.required,
    archiveFile: "staging-frontend-dist.tar",
    companionSealFile: "staging-frontend-dist-seal.json",
    provenanceFile: "staging-frontend-provenance.json",
  }),
  [STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent]: Object.freeze({
    provenanceMode: STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent,
    archiveFile: "staging-candidate-dist.tar",
    companionSealFile: "staging-candidate-dist-seal.json",
    provenanceFile: "",
  }),
});

function refuse(reason) {
  throw new Error(`${PREFIX}:${reason}`);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function exactNames(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function sameMetadata(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs
  );
}

async function inspectArtifactRoot(artifactRoot, label) {
  const root = resolve(artifactRoot);
  const rootBefore = await lstat(root, { bigint: true }).catch(() => refuse(`${label}_root_missing`));
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) refuse(`${label}_root_invalid`);
  const entries = await readdir(root, { withFileTypes: true });
  if (
    !exactNames(
      entries.map((entry) => entry.name),
      ["dist", "outputs"],
    ) ||
    entries.some((entry) => !entry.isDirectory() || entry.isSymbolicLink())
  )
    refuse(`${label}_contents_invalid`);

  const distDirectory = resolve(root, "dist");
  const outputsDirectory = resolve(root, "outputs");
  const distBefore = await lstat(distDirectory, { bigint: true }).catch(() =>
    refuse(`${label}_dist_missing`),
  );
  const outputsBefore = await lstat(outputsDirectory, { bigint: true }).catch(() =>
    refuse(`${label}_outputs_missing`),
  );
  if (!distBefore.isDirectory() || distBefore.isSymbolicLink()) refuse(`${label}_dist_invalid`);
  if (!outputsBefore.isDirectory() || outputsBefore.isSymbolicLink()) refuse(`${label}_outputs_invalid`);
  return { root, rootBefore, distDirectory, distBefore, outputsDirectory, outputsBefore };
}

async function assertArtifactRootStable(artifact, label) {
  for (const [path, before, suffix] of [
    [artifact.root, artifact.rootBefore, "root"],
    [artifact.distDirectory, artifact.distBefore, "dist"],
    [artifact.outputsDirectory, artifact.outputsBefore, "outputs"],
  ]) {
    const after = await lstat(path, { bigint: true }).catch(() => refuse(`${label}_${suffix}_changed`));
    if (!sameMetadata(before, after)) refuse(`${label}_${suffix}_changed`);
  }
}

async function stableRegularFile(path, label) {
  const target = resolve(path);
  const pathBefore = await lstat(target, { bigint: true }).catch(() => refuse(`${label}_missing`));
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()) refuse(`${label}_not_regular`);
  const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)).catch(() =>
    refuse(`${label}_open_failed`),
  );
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    const pathAfter = await lstat(target, { bigint: true }).catch(() =>
      refuse(`${label}_changed_while_reading`),
    );
    if (
      !sameMetadata(pathBefore, before) ||
      !sameMetadata(before, after) ||
      !sameMetadata(after, pathAfter) ||
      BigInt(bytes.length) !== before.size
    )
      refuse(`${label}_changed_while_reading`);
    return { bytes, sha256: sha256(bytes) };
  } finally {
    await handle.close();
  }
}

async function inspectOutputs(outputsDirectory, topology, label) {
  const root = resolve(outputsDirectory);
  const rootBefore = await lstat(root, { bigint: true }).catch(() => refuse(`${label}_root_missing`));
  if (!rootBefore.isDirectory() || rootBefore.isSymbolicLink()) refuse(`${label}_root_invalid`);
  const entries = await readdir(root, { withFileTypes: true });
  const expected = [
    topology.archiveFile,
    "staging-baseline-dist-seal.json",
    topology.companionSealFile,
    ...(topology.provenanceFile ? [topology.provenanceFile] : []),
  ];
  if (
    !exactNames(
      entries.map((entry) => entry.name),
      expected,
    ) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  )
    refuse(`${label}_contents_invalid`);

  const baselineSeal = await stableRegularFile(
    resolve(root, "staging-baseline-dist-seal.json"),
    `${label}_baseline_seal`,
  );
  const companionSeal = await stableRegularFile(
    resolve(root, topology.companionSealFile),
    `${label}_companion_seal`,
  );
  if (!baselineSeal.bytes.equals(companionSeal.bytes)) refuse(`${label}_companion_seal_mismatch`);

  let seal;
  try {
    seal = JSON.parse(baselineSeal.bytes.toString("utf8"));
  } catch {
    refuse(`${label}_seal_json_invalid`);
  }
  if (
    seal?.schemaVersion !== 2 ||
    seal?.archiveFile !== topology.archiveFile ||
    !Number.isSafeInteger(seal?.archiveBytes) ||
    seal.archiveBytes < 1 ||
    !SHA256.test(seal?.archiveSha256 ?? "")
  )
    refuse(`${label}_seal_identity_invalid`);

  const archive = await stableRegularFile(resolve(root, topology.archiveFile), `${label}_archive`);
  if (archive.bytes.length !== seal.archiveBytes || archive.sha256 !== seal.archiveSha256)
    refuse(`${label}_archive_identity_mismatch`);

  const provenance = topology.provenanceFile
    ? await stableRegularFile(resolve(root, topology.provenanceFile), `${label}_provenance`)
    : null;
  const rootAfter = await lstat(root, { bigint: true }).catch(() => refuse(`${label}_root_changed`));
  if (!sameMetadata(rootBefore, rootAfter)) refuse(`${label}_root_changed`);
  return { baselineSeal, companionSeal, archive, provenance, seal };
}

export function resolveStagingBridgeRecoveryProvenanceMode({
  baselineMode,
  compensationProvenanceMode = "",
}) {
  if (["bridge-v5", "deploy-compensation"].includes(baselineMode))
    return STAGING_BRIDGE_RECOVERY_PROVENANCE.required;
  if (["bootstrap", "legacy-bootstrap-compensation"].includes(baselineMode))
    return STAGING_BRIDGE_RECOVERY_PROVENANCE.pinnedBootstrapAbsent;
  if (baselineMode === "bridge-compensation") {
    if (!TOPOLOGY[compensationProvenanceMode]) refuse("compensation_provenance_mode_invalid");
    return compensationProvenanceMode;
  }
  refuse("baseline_mode_invalid");
}

export function stagingBridgeRecoveryProvenanceModeForArchive(archiveFile) {
  const match = Object.values(TOPOLOGY).find((entry) => entry.archiveFile === archiveFile);
  if (!match) refuse("archive_file_invalid");
  return match.provenanceMode;
}

export function stagingBridgeRecoveryTopology(provenanceMode) {
  const topology = TOPOLOGY[provenanceMode];
  if (!topology) refuse("provenance_mode_invalid");
  return topology;
}

export async function verifyStagingBridgeRecoveryOutputs({
  outputsDirectory,
  peerOutputsDirectory = "",
  baselineMode = "",
  compensationProvenanceMode = "",
  expectedProvenanceMode = "",
}) {
  const resolvedMode = baselineMode
    ? resolveStagingBridgeRecoveryProvenanceMode({ baselineMode, compensationProvenanceMode })
    : expectedProvenanceMode;
  if (!TOPOLOGY[resolvedMode]) refuse("expected_provenance_mode_invalid");
  if (expectedProvenanceMode && expectedProvenanceMode !== resolvedMode) refuse("provenance_mode_mismatch");
  const topology = stagingBridgeRecoveryTopology(resolvedMode);
  const local = await inspectOutputs(outputsDirectory, topology, "local_outputs");
  if (peerOutputsDirectory) {
    const peer = await inspectOutputs(peerOutputsDirectory, topology, "remote_outputs");
    for (const [label, left, right] of [
      ["baseline_seal", local.baselineSeal.bytes, peer.baselineSeal.bytes],
      ["companion_seal", local.companionSeal.bytes, peer.companionSeal.bytes],
      ["archive", local.archive.bytes, peer.archive.bytes],
      ["provenance", local.provenance?.bytes ?? null, peer.provenance?.bytes ?? null],
    ])
      if (left === null ? right !== null : right === null || !left.equals(right))
        refuse(`remote_${label}_bytes_mismatch`);
  }
  return {
    provenanceMode: resolvedMode,
    archiveFile: topology.archiveFile,
    companionSealFile: topology.companionSealFile,
    provenanceFile: topology.provenanceFile,
    seal: local.seal,
  };
}

export async function verifyStagingBridgeRecoveryArtifact({
  artifactRoot,
  peerArtifactRoot = "",
  baselineMode = "",
  compensationProvenanceMode = "",
  expectedProvenanceMode = "",
}) {
  const local = await inspectArtifactRoot(artifactRoot, "local_payload");
  const peer = peerArtifactRoot ? await inspectArtifactRoot(peerArtifactRoot, "remote_payload") : null;
  const result = await verifyStagingBridgeRecoveryOutputs({
    outputsDirectory: local.outputsDirectory,
    peerOutputsDirectory: peer?.outputsDirectory ?? "",
    baselineMode,
    compensationProvenanceMode,
    expectedProvenanceMode,
  });
  await assertArtifactRootStable(local, "local_payload");
  if (peer) await assertArtifactRootStable(peer, "remote_payload");
  return result;
}
