import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { appendFile, lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

import { materializeProductionDistArchive, verifyProductionDistSeal } from "./production-dist-seal-lib.mjs";
import { validateStagingBaselineBootstrapRecord } from "./staging-baseline-bootstrap-lib.mjs";
import { validateStagingCompensationState } from "./staging-baseline-compensation-lib.mjs";
import {
  STAGING_DEPLOY_RECOVERY,
  verifyStagingDeployRecoveryArtifact,
} from "./staging-deploy-recovery-state-lib.mjs";
import { STAGING_FRONTEND_PACKAGE, verifyStagingFrontendPackage } from "./staging-frontend-package-lib.mjs";

const POSITIVE = /^[1-9]\d*$/;
const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function within(root, candidate) {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

async function stableFile(path) {
  const source = resolve(path);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:not_regular");
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const buffer = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      BigInt(buffer.length) !== before.size
    )
      throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:changed_while_reading");
    return { path: source, buffer, bytes: buffer.length, sha256: sha256(buffer) };
  } finally {
    await handle.close();
  }
}

function json(identity, label) {
  try {
    return JSON.parse(identity.buffer.toString("utf8"));
  } catch {
    throw new Error(`G12_STAGING_BASELINE_COMPENSATION_REFUSED:${label}_json_invalid`);
  }
}

async function assertDirectory(path, label) {
  const root = resolve(path);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error(`G12_STAGING_BASELINE_COMPENSATION_REFUSED:${label}_invalid`);
  return root;
}

async function assertEntries(path, expected, label) {
  const entries = await readdir(path, { withFileTypes: true });
  if (
    JSON.stringify(entries.map((entry) => entry.name).sort()) !== JSON.stringify([...expected].sort()) ||
    entries.some((entry) => entry.isSymbolicLink())
  )
    throw new Error(`G12_STAGING_BASELINE_COMPENSATION_REFUSED:${label}_contents_invalid`);
  return entries;
}

async function requireAbsentOutput(path, forbidden) {
  const target = resolve(path);
  if (
    target === parse(target).root ||
    target === resolve(".") ||
    forbidden.some((root) => within(root, target))
  )
    throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:output_path_invalid");
  try {
    await lstat(target);
    throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:output_must_be_new");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  return target;
}

async function assertStateArtifactDirectory(root) {
  const entries = await readdir(root, { withFileTypes: true });
  if (
    entries.length !== 1 ||
    entries[0].name !== "staging-deploy-state.json" ||
    !entries[0].isFile() ||
    entries[0].isSymbolicLink()
  )
    throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:state_artifact_contents_invalid");
  return resolve(root, entries[0].name);
}

async function verifySnapshot(distPath, seal, candidateSha) {
  const result = await verifyProductionDistSeal(distPath, seal, candidateSha);
  if (!result.valid)
    throw new Error(
      `G12_STAGING_BASELINE_COMPENSATION_REFUSED:recovery_snapshot:${result.violations.join(",")}`,
    );
  return result.snapshot;
}

async function createCanonicalPackage({ archive, seal, provenance, temporary }) {
  const packageRoot = resolve(temporary, "package");
  await mkdir(packageRoot, { mode: 0o700 });
  for (const [name, identity] of [
    [STAGING_FRONTEND_PACKAGE.archiveFile, archive],
    [STAGING_FRONTEND_PACKAGE.sealFile, seal],
    [STAGING_FRONTEND_PACKAGE.provenanceFile, provenance],
  ])
    await writeFile(resolve(packageRoot, name), identity.buffer, { flag: "wx", mode: 0o400 });
  return packageRoot;
}

const mode = argument("mode");
const recordPath = argument("record");
const recoveryInput = argument("recovery-dir");
const stateInput = argument("state-dir");
const candidateSha = argument("candidate");
const runId = argument("run-id");
const runAttempt = Number(argument("run-attempt"));
const controlSha = argument("control-sha");
const outputInput = argument("output-dist");
const recoveryArtifactId = argument("recovery-artifact-id");
const recoveryArtifactDigest = argument("recovery-artifact-digest");
const recoveryArtifactName = argument("recovery-artifact-name");
if (
  !["deploy-compensation", "bridge-compensation"].includes(mode) ||
  !recordPath ||
  !recoveryInput ||
  !outputInput ||
  !FULL_SHA.test(candidateSha) ||
  !FULL_SHA.test(controlSha) ||
  !POSITIVE.test(runId) ||
  !Number.isSafeInteger(runAttempt) ||
  runAttempt < 1 ||
  (mode === "deploy-compensation" &&
    (!stateInput ||
      !POSITIVE.test(recoveryArtifactId) ||
      !/^sha256:[a-f0-9]{64}$/.test(recoveryArtifactDigest) ||
      !recoveryArtifactName))
)
  throw new Error("G12_STAGING_BASELINE_COMPENSATION_INPUT_REFUSED");

const recoveryRoot = await assertDirectory(recoveryInput, "recovery_root");
const stateRoot = stateInput ? await assertDirectory(stateInput, "state_root") : null;
const outputDist = await requireAbsentOutput(outputInput, [
  recoveryRoot,
  ...(stateRoot ? [stateRoot] : []),
  resolve(recordPath),
]);
let statePath;
let recoveryDist;
let recoveryOutputs;
if (mode === "deploy-compensation") {
  await assertEntries(
    recoveryRoot,
    ["dist", STAGING_DEPLOY_RECOVERY.edgeBaselineDirectory, "outputs"],
    "deploy_recovery",
  );
  statePath = await assertStateArtifactDirectory(stateRoot);
  recoveryDist = resolve(recoveryRoot, "dist");
  recoveryOutputs = resolve(recoveryRoot, "outputs");
} else {
  await assertEntries(recoveryRoot, ["baseline", "control"], "bridge_recovery");
  await assertEntries(resolve(recoveryRoot, "control"), ["outputs"], "bridge_control");
  await assertEntries(
    resolve(recoveryRoot, "control/outputs"),
    ["staging-frontend-bridge-state.json"],
    "bridge_state",
  );
  await assertEntries(resolve(recoveryRoot, "baseline"), ["dist", "outputs"], "bridge_baseline");
  statePath = resolve(recoveryRoot, "control/outputs/staging-frontend-bridge-state.json");
  recoveryDist = resolve(recoveryRoot, "baseline/dist");
  recoveryOutputs = resolve(recoveryRoot, "baseline/outputs");
}
await assertDirectory(recoveryDist, "recovery_dist");
await assertDirectory(recoveryOutputs, "recovery_outputs");

const stateIdentity = await stableFile(statePath);
const state = json(stateIdentity, "state");
const stateResult = validateStagingCompensationState({
  state,
  mode,
  runId,
  runAttempt,
  controlSha,
  expectedRelease: candidateSha,
});
if (!stateResult.valid)
  throw new Error(`G12_STAGING_BASELINE_COMPENSATION_STATE_REFUSED:${stateResult.violations.join(",")}`);

const baselineSealPath = resolve(recoveryOutputs, "staging-baseline-dist-seal.json");
const baselineSealIdentity = await stableFile(baselineSealPath);
const baselineSeal = json(baselineSealIdentity, "seal");
const recoverySnapshot = await verifySnapshot(recoveryDist, baselineSeal, candidateSha);
const provenancePath = resolve(recoveryOutputs, STAGING_FRONTEND_PACKAGE.provenanceFile);
let provenanceIdentity = null;
try {
  provenanceIdentity = await stableFile(provenancePath);
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
if (provenanceIdentity) {
  const expectedOutputs = [
    "staging-frontend-dist.tar",
    "staging-baseline-dist-seal.json",
    "staging-frontend-provenance.json",
  ];
  if (mode === "bridge-compensation") expectedOutputs.push("staging-frontend-dist-seal.json");
  else expectedOutputs.push(STAGING_DEPLOY_RECOVERY.environmentSnapshotFile);
  await assertEntries(recoveryOutputs, expectedOutputs, "provenance_outputs");
} else {
  await assertEntries(
    recoveryOutputs,
    ["staging-candidate-dist.tar", "staging-baseline-dist-seal.json", "staging-candidate-dist-seal.json"],
    "bootstrap_outputs",
  );
}

let result;
let archivePath;
let source = null;
const temporary = await mkdtemp(join(tmpdir(), "g12-staging-baseline-compensation-"));
try {
  if (provenanceIdentity) {
    const provenance = json(provenanceIdentity, "provenance");
    if (
      !POSITIVE.test(provenance?.sourceRunId ?? "") ||
      !Number.isSafeInteger(provenance?.sourceRunAttempt) ||
      provenance.sourceRunAttempt < 1
    )
      throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:provenance_identity_invalid");
    if (mode === "deploy-compensation") {
      if (
        state.recoveryArtifact?.id !== recoveryArtifactId ||
        state.recoveryArtifact?.digest !== recoveryArtifactDigest ||
        state.recoveryArtifact?.name !== recoveryArtifactName
      )
        throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:recovery_artifact_binding_invalid");
      await verifyStagingDeployRecoveryArtifact({ artifactDirectory: recoveryRoot, state });
      if (
        provenance.sourceRunId !== state.source.ciRunId ||
        provenance.sourceRunAttempt !== state.source.ciRunAttempt ||
        provenance.artifactName !== state.source.name
      )
        throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:state_source_binding_invalid");
    }
    archivePath = resolve(recoveryOutputs, STAGING_FRONTEND_PACKAGE.archiveFile);
    const archiveIdentity = await stableFile(archivePath);
    const packageRoot = await createCanonicalPackage({
      archive: archiveIdentity,
      seal: baselineSealIdentity,
      provenance: provenanceIdentity,
      temporary,
    });
    result = await verifyStagingFrontendPackage({
      packageDirectory: packageRoot,
      outputDirectory: outputDist,
      candidateSha,
      runId: provenance.sourceRunId,
      runAttempt: provenance.sourceRunAttempt,
      environment: process.env,
    });
    source = {
      runId: provenance.sourceRunId,
      runAttempt: provenance.sourceRunAttempt,
      gateRunAttempt: mode === "deploy-compensation" ? state.source.gateCiRunAttempt : "",
      artifactId: mode === "deploy-compensation" ? state.source.artifactId : "",
      artifactDigest: mode === "deploy-compensation" ? state.source.digest : "",
      artifactName: provenance.artifactName,
    };
  } else {
    if (mode !== "bridge-compensation")
      throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:provenance_required");
    const recordIdentity = await stableFile(recordPath);
    const record = json(recordIdentity, "bootstrap_record");
    const recordResult = validateStagingBaselineBootstrapRecord(record);
    if (!recordResult.valid)
      throw new Error(
        `G12_STAGING_BASELINE_COMPENSATION_REFUSED:bootstrap_record:${recordResult.violations.join(",")}`,
      );
    if (
      candidateSha !== record.candidateSha ||
      (state.original.commitMessage !== record.canonical.commitMessage &&
        !/^g12-staging-(?:deploy|bridge)-compensation-[1-9]\d*-[1-9]\d*$/.test(
          state.original.commitMessage,
        )) ||
      baselineSealIdentity.sha256 !== record.source.sealSha256 ||
      baselineSeal.archiveSha256 !== record.dist.archiveSha256 ||
      baselineSeal.treeSha256 !== record.dist.treeSha256 ||
      baselineSeal.archiveBytes !== record.dist.archiveBytes ||
      baselineSeal.fileCount !== record.dist.fileCount ||
      baselineSeal.byteCount !== record.dist.byteCount
    )
      throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:bootstrap_binding_invalid");
    archivePath = resolve(recoveryOutputs, record.source.archiveFile);
    if (basename(archivePath) !== baselineSeal.archiveFile)
      throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:bootstrap_archive_name_invalid");
    const snapshot = await materializeProductionDistArchive(
      archivePath,
      baselineSeal,
      candidateSha,
      outputDist,
    );
    result = {
      archiveSha256: baselineSeal.archiveSha256,
      treeSha256: snapshot.treeSha256,
      profileSha256: "",
      archiveBytes: baselineSeal.archiveBytes,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
      artifactName: "",
    };
  }
  if (
    result.treeSha256 !== recoverySnapshot.treeSha256 ||
    result.fileCount !== recoverySnapshot.fileCount ||
    result.byteCount !== recoverySnapshot.byteCount
  )
    throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:materialized_snapshot_mismatch");
} catch (error) {
  await rm(outputDist, { recursive: true, force: true });
  throw error;
} finally {
  await rm(temporary, { recursive: true, force: true });
}

if (!SHA256.test(result.archiveSha256) || !SHA256.test(result.treeSha256))
  throw new Error("G12_STAGING_BASELINE_COMPENSATION_REFUSED:result_digest_invalid");
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `has_ci_source=${Boolean(source)}`,
      `source_run_id=${source?.runId ?? ""}`,
      `source_run_attempt=${source?.runAttempt ?? 0}`,
      `source_gate_run_attempt=${source?.gateRunAttempt ?? 0}`,
      `source_artifact_id=${source?.artifactId ?? ""}`,
      `source_artifact_digest=${source?.artifactDigest ?? ""}`,
      `source_artifact_name=${source?.artifactName ?? ""}`,
      `archive_sha256=${result.archiveSha256}`,
      `tree_sha256=${result.treeSha256}`,
      `profile_sha256=${result.profileSha256}`,
      `archive_bytes=${result.archiveBytes}`,
      `file_count=${result.fileCount}`,
      `byte_count=${result.byteCount}`,
      `archive_path=${resolve(archivePath)}`,
      `seal_path=${baselineSealIdentity.path}`,
      `provenance_path=${provenanceIdentity?.path ?? ""}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.baseline_compensation.materialized",
    mode,
    runId,
    runAttempt,
    candidateSha,
    sourceRunId: source?.runId ?? null,
    archiveSha256: result.archiveSha256,
    treeSha256: result.treeSha256,
  }),
);
