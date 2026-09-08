import { readFile } from "node:fs/promises";

import { verifyProductionReleaseEvidenceArchive } from "./production-release-archive-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const archiveFile = argument("archive");
const sealFile = argument("seal");
const binding = {
  candidateSha: argument("candidate"),
  runId: argument("run-id"),
  runAttempt: argument("run-attempt"),
  controlSha: argument("control-sha"),
};
const materializeDirectory = argument("materialize");
if (!archiveFile || !sealFile) throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_ARGUMENTS_REQUIRED");
const seal = JSON.parse(await readFile(sealFile, "utf8"));
const result = await verifyProductionReleaseEvidenceArchive({
  archiveFile,
  seal,
  binding,
  materializeDirectory,
});
if (!result.valid) throw new Error(`G12_PRODUCTION_RELEASE_ARCHIVE_REFUSED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "g12.production.release_evidence.archive_verified",
    candidateSha: binding.candidateSha,
    archiveSha256: seal.archiveSha256,
  }),
);
