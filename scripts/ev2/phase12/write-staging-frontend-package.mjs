import { writeStagingFrontendPackage } from "./staging-frontend-package-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const archivePath = argument("archive");
const sealPath = argument("seal");
const outputDirectory = argument("output");
const candidateSha = argument("candidate");
const runId = argument("run-id");
const runAttemptInput = argument("run-attempt");
const runAttempt = Number(runAttemptInput);

if (!archivePath || !sealPath || !outputDirectory || !/^[1-9]\d*$/.test(runAttemptInput))
  throw new Error("G12_STAGING_FRONTEND_PACKAGE_ARGUMENTS_REQUIRED");

const result = await writeStagingFrontendPackage({
  archivePath,
  sealPath,
  outputDirectory,
  candidateSha,
  runId,
  runAttempt,
});

console.log(
  JSON.stringify({
    event: "g12.staging.frontend.package_written",
    artifactName: result.provenance.artifactName,
    controlSha: result.provenance.controlSha,
    sourceRunId: result.provenance.sourceRunId,
    sourceRunAttempt: result.provenance.sourceRunAttempt,
    archiveSha256: result.provenance.archive.sha256,
    treeSha256: result.provenance.dist.treeSha256,
    profileSha256: result.provenance.profile.sha256,
    fileCount: result.provenance.dist.fileCount,
    byteCount: result.provenance.dist.byteCount,
    secretsExposed: false,
  }),
);
