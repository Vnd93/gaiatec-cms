import {
  sealProductionReleaseEvidenceArchive,
  writeProductionReleaseArchiveSeal,
} from "./production-release-archive-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const root = argument("root");
const indexFile = argument("index");
const archiveFile = argument("archive");
const sealFile = argument("seal");
if (!root || !indexFile || !archiveFile || !sealFile)
  throw new Error("G12_PRODUCTION_RELEASE_ARCHIVE_ARGUMENTS_REQUIRED");
const seal = await sealProductionReleaseEvidenceArchive({ root, indexFile, archiveFile });
await writeProductionReleaseArchiveSeal(sealFile, seal);
console.log(
  JSON.stringify({
    event: "g12.production.release_evidence.archive_written",
    candidateSha: seal.candidateSha,
    archiveSha256: seal.archiveSha256,
    fileCount: seal.fileCount,
  }),
);
