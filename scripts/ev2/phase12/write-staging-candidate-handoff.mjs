import { appendFile } from "node:fs/promises";

import { writeStagingCandidateHandoff } from "./staging-candidate-handoff-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const packageDirectory = argument("package");
const outputDirectory = argument("output");
const candidateSha = argument("candidate");
const runId = argument("run-id");
const runAttemptInput = argument("run-attempt");
const runAttempt = Number(runAttemptInput);

if (
  !packageDirectory ||
  !outputDirectory ||
  !/^[1-9]\d*$/.test(runId) ||
  !/^[1-9]\d*$/.test(runAttemptInput)
) {
  throw new Error("G12_STAGING_CANDIDATE_HANDOFF_ARGUMENTS_REQUIRED");
}

const result = await writeStagingCandidateHandoff({
  packageDirectory,
  outputDirectory,
  candidateSha,
  runId,
  runAttempt,
});

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `archive_sha256=${result.archiveSha256}`,
      `tree_sha256=${result.treeSha256}`,
      `seal_sha256=${result.sealSha256}`,
      `provenance_sha256=${result.provenanceSha256}`,
      `profile_sha256=${result.profileSha256}`,
      `manifest_sha256=${result.manifestSha256}`,
      `archive_bytes=${result.archiveBytes}`,
      `file_count=${result.fileCount}`,
      `byte_count=${result.byteCount}`,
      `archive_path=${result.paths.archive}`,
      `seal_path=${result.paths.seal}`,
      `provenance_path=${result.paths.provenance}`,
      `manifest_path=${result.paths.manifest}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.staging.candidate_handoff_written",
    candidateSha,
    sourceRunId: runId,
    sourceRunAttempt: runAttempt,
    archiveSha256: result.archiveSha256,
    sealSha256: result.sealSha256,
    provenanceSha256: result.provenanceSha256,
    profileSha256: result.profileSha256,
    manifestSha256: result.manifestSha256,
    treeSha256: result.treeSha256,
    archiveBytes: result.archiveBytes,
    fileCount: result.fileCount,
    byteCount: result.byteCount,
    secretsExposed: false,
  }),
);
