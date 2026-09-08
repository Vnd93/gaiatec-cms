import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { buildProductionReleaseEvidenceIndex } from "./production-release-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

const root = argument("--root");
const output = argument("--output");
const candidateSha = argument("--candidate");
const runId = argument("--run-id");
const runAttempt = argument("--run-attempt");
const controlSha = argument("--control-sha");
const baselineRelease = argument("--baseline-release");
if (!root || !output) throw new Error("G12_PRODUCTION_RELEASE_EVIDENCE_ARGUMENTS_REQUIRED");

const index = await buildProductionReleaseEvidenceIndex(root, candidateSha, undefined, {
  candidateSha,
  runId,
  runAttempt,
  controlSha,
  baselineRelease,
});
const outputPath = resolve(output);
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(
  JSON.stringify({
    event: "g12.production.release_evidence.index_written",
    candidateSha,
    fileCount: index.fileCount,
  }),
);
