import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";

import { materializeProductionDistArchive } from "./production-dist-seal-lib.mjs";

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
const entries = await readdir(artifactRoot, { withFileTypes: true });
const expectedFiles = new Set(["staging-candidate-dist-seal.json", "staging-candidate-dist.tar"]);
if (
  entries.length !== expectedFiles.size ||
  entries.some((entry) => !entry.isFile() || !expectedFiles.has(entry.name))
)
  throw new Error("G12_STAGING_CANDIDATE_ARTIFACT_CONTENTS_REFUSED");
const archivePath = resolve(artifactRoot, "staging-candidate-dist.tar");
const seal = JSON.parse(await readFile(resolve(artifactRoot, "staging-candidate-dist-seal.json"), "utf8"));
if (
  seal?.schemaVersion !== 2 ||
  seal?.candidateSha !== record.candidateSha ||
  seal?.archiveFile !== "staging-candidate-dist.tar" ||
  seal?.archiveSha256 !== control.candidateArchiveSha256 ||
  seal?.treeSha256 !== control.candidateTreeSha256
)
  throw new Error("G12_STAGING_CANDIDATE_SEAL_REFUSED");
const temporary = await mkdtemp(join(tmpdir(), "g12-staging-candidate-"));
try {
  const snapshot = await materializeProductionDistArchive(
    archivePath,
    seal,
    record.candidateSha,
    resolve(temporary, "dist"),
  );
  console.log(
    JSON.stringify({
      event: "g12.staging.candidate-artifact.verified",
      candidateSha: record.candidateSha,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
      archiveSha256: seal.archiveSha256,
      treeSha256: seal.treeSha256,
      secretsExposed: false,
    }),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
