import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import {
  STAGING_CANDIDATE_HANDOFF,
  verifyStagingCandidateHandoff,
} from "./staging-candidate-handoff-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const relativeFile = argument("file");
const artifactDirectory = argument("artifact-dir");
if (!relativeFile || !artifactDirectory) throw new Error("G12_STAGING_CANDIDATE_ARTIFACT_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`)) throw new Error("G12_STAGING_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (record?.schemaVersion !== 3 || record?.environment !== "production")
  throw new Error("G12_STAGING_APPROVAL_SCHEMA_REFUSED");
const control = record.g12Evidence;
const artifactRoot = resolve(artifactDirectory);
const manifestPath = resolve(artifactRoot, STAGING_CANDIDATE_HANDOFF.manifestFile);
const manifestMetadata = await lstat(manifestPath);
if (!manifestMetadata.isFile() || manifestMetadata.isSymbolicLink())
  throw new Error("G12_STAGING_CANDIDATE_HANDOFF_MANIFEST_REFUSED");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const expected = {
  sourceRunId: manifest?.source?.runId,
  sourceRunAttempt: manifest?.source?.runAttempt,
  archiveSha256: control?.candidateArchiveSha256,
  sealSha256: manifest?.package?.seal?.sha256,
  provenanceSha256: manifest?.package?.provenance?.sha256,
  profileSha256: manifest?.package?.profileSha256,
  treeSha256: control?.candidateTreeSha256,
  archiveBytes: manifest?.package?.archive?.bytes,
  fileCount: manifest?.package?.dist?.fileCount,
  byteCount: manifest?.package?.dist?.byteCount,
};

const temporary = await mkdtemp(join(tmpdir(), "g12-staging-candidate-"));
try {
  const verified = await verifyStagingCandidateHandoff({
    handoffDirectory: artifactRoot,
    outputDirectory: resolve(temporary, "dist"),
    candidateSha: record.candidateSha,
    expected,
  });
  console.log(
    JSON.stringify({
      event: "g12.staging.candidate-artifact.verified",
      candidateSha: record.candidateSha,
      sourceRunId: verified.manifest.source.runId,
      sourceRunAttempt: verified.manifest.source.runAttempt,
      fileCount: verified.fileCount,
      byteCount: verified.byteCount,
      archiveSha256: verified.archiveSha256,
      sealSha256: verified.sealSha256,
      provenanceSha256: verified.provenanceSha256,
      manifestSha256: verified.manifestSha256,
      treeSha256: verified.treeSha256,
      originalPackageBytesPreserved: true,
      secretsExposed: false,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
