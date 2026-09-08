import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { materializeProductionDistArchive } from "./production-dist-seal-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const archive = argument("archive");
const sealFile = argument("seal");
const candidateSha = argument("candidate");
const expectedArchiveSha256 = argument("expected-archive-sha256");
const expectedTreeSha256 = argument("expected-tree-sha256");
const expectedArchiveBytes = Number(argument("expected-archive-bytes"));
if (
  !archive ||
  !sealFile ||
  !/^[a-f0-9]{40}$/.test(candidateSha) ||
  !/^[a-f0-9]{64}$/.test(expectedArchiveSha256) ||
  !/^[a-f0-9]{64}$/.test(expectedTreeSha256) ||
  !Number.isSafeInteger(expectedArchiveBytes) ||
  expectedArchiveBytes < 1
)
  throw new Error("G12_PRODUCTION_DIST_ARCHIVE_VERIFICATION_INPUT_REFUSED");

const seal = JSON.parse(await readFile(resolve(sealFile), "utf8"));
if (
  seal?.candidateSha !== candidateSha ||
  seal?.archiveSha256 !== expectedArchiveSha256 ||
  seal?.treeSha256 !== expectedTreeSha256 ||
  seal?.archiveBytes !== expectedArchiveBytes
)
  throw new Error("G12_PRODUCTION_DIST_ARCHIVE_STATE_BINDING_REFUSED");

const temporaryRoot = await mkdtemp(join(tmpdir(), "g12-production-dist-verify-"));
try {
  const snapshot = await materializeProductionDistArchive(
    resolve(archive),
    seal,
    candidateSha,
    resolve(temporaryRoot, "dist"),
  );
  console.log(
    JSON.stringify({
      event: "g12.production.dist_archive.verified",
      candidateSha,
      archiveSha256: seal.archiveSha256,
      treeSha256: snapshot.treeSha256,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
    }),
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
