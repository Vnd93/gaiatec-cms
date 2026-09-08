import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { sealProductionDistArchive } from "./production-dist-seal-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const dist = argument("--dist");
const output = argument("--output");
const archive = argument("--archive");
const candidateSha = argument("--candidate");
if (!dist || !output || !archive) throw new Error("G12_PRODUCTION_DIST_SEAL_ARGUMENTS_REQUIRED");

const seal = await sealProductionDistArchive(dist, archive, candidateSha);
const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(seal, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });

console.log(
  JSON.stringify({
    event: "g12.production.dist_seal.written",
    candidateSha: seal.candidateSha,
    fileCount: seal.fileCount,
    byteCount: seal.byteCount,
    treeSha256: seal.treeSha256,
    archiveSha256: seal.archiveSha256,
  }),
);
