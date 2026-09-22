import { appendFile } from "node:fs/promises";

import { verifyStagingCandidateHandoff } from "./staging-candidate-handoff-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function positiveInteger(name) {
  const value = argument(name);
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_VERIFICATION_ARGUMENTS_REQUIRED");
  }
  return Number(value);
}

const handoffDirectory = argument("handoff");
const outputDirectory = argument("output");
const candidateSha = argument("candidate");
const expected = {
  sourceRunId: argument("run-id"),
  sourceRunAttempt: positiveInteger("run-attempt"),
  archiveSha256: argument("archive-sha256"),
  sealSha256: argument("seal-sha256"),
  provenanceSha256: argument("provenance-sha256"),
  profileSha256: argument("profile-sha256"),
  treeSha256: argument("tree-sha256"),
  archiveBytes: positiveInteger("archive-bytes"),
  fileCount: positiveInteger("file-count"),
  byteCount: positiveInteger("byte-count"),
};

if (!handoffDirectory || !outputDirectory) {
  throw new Error("G12_STAGING_CANDIDATE_HANDOFF_VERIFICATION_ARGUMENTS_REQUIRED");
}

const result = await verifyStagingCandidateHandoff({
  handoffDirectory,
  outputDirectory,
  candidateSha,
  expected,
});

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      "verified=true",
      `archive_sha256=${result.archiveSha256}`,
      `seal_sha256=${result.sealSha256}`,
      `provenance_sha256=${result.provenanceSha256}`,
      `profile_sha256=${result.profileSha256}`,
      `manifest_sha256=${result.manifestSha256}`,
      `tree_sha256=${result.treeSha256}`,
      `archive_path=${result.paths.archive}`,
      `seal_path=${result.paths.seal}`,
      `provenance_path=${result.paths.provenance}`,
      `manifest_path=${result.paths.manifest}`,
      `dist_path=${result.paths.dist}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.staging.candidate_handoff_verified",
    candidateSha,
    archiveSha256: result.archiveSha256,
    sealSha256: result.sealSha256,
    provenanceSha256: result.provenanceSha256,
    profileSha256: result.profileSha256,
    manifestSha256: result.manifestSha256,
    treeSha256: result.treeSha256,
    archiveBytes: result.archiveBytes,
    fileCount: result.fileCount,
    byteCount: result.byteCount,
    archivePath: result.paths.archive,
    sealPath: result.paths.seal,
    provenancePath: result.paths.provenance,
    manifestPath: result.paths.manifest,
    distPath: result.paths.dist,
    secretsExposed: false,
  }),
);
