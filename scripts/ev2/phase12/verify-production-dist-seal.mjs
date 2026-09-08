import { readFile } from "node:fs/promises";

import { verifyProductionDistSeal } from "./production-dist-seal-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const dist = argument("--dist");
const sealFile = argument("--seal");
const candidateSha = argument("--candidate");
if (!dist || !sealFile) throw new Error("G12_PRODUCTION_DIST_VERIFICATION_ARGUMENTS_REQUIRED");

const seal = JSON.parse(await readFile(sealFile, "utf8"));
const result = await verifyProductionDistSeal(dist, seal, candidateSha);
if (!result.valid) throw new Error(`G12_PRODUCTION_DIST_VERIFICATION_FAILED:${result.violations.join(",")}`);

console.log(
  JSON.stringify({
    event: "g12.production.dist_seal.verified",
    candidateSha,
    fileCount: result.snapshot.fileCount,
    byteCount: result.snapshot.byteCount,
    treeSha256: result.snapshot.treeSha256,
  }),
);
