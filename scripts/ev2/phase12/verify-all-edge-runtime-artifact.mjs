#!/usr/bin/env node
import { appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAndVerifyAllEdgeRuntimeArtifact } from "./all-edge-runtime-artifact-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1])
    throw new Error(`G12_ALL_EDGE_RUNTIME_ARTIFACT_VERIFY_ARGUMENT_${name.toUpperCase()}_REQUIRED`);
  return process.argv[index + 1];
}

export function main() {
  const artifact = loadAndVerifyAllEdgeRuntimeArtifact({
    root: argument("root"),
    candidateSha: argument("candidate-sha"),
    manifestSha256: argument("manifest-sha256"),
  });
  const result = {
    schemaVersion: 1,
    event: "g12.ci.all_edge_runtime_smoke.artifact_verified",
    candidateSha: artifact.manifest.candidateSha,
    manifestSha256: artifact.manifestSha256,
    fileIndexSha256: artifact.manifest.evidence.fileIndexSha256,
    inventorySha256: artifact.manifest.input.inventorySha256,
    functionCount: artifact.functions.length,
    transport: "management-api-ezbr",
  };
  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    appendFileSync(
      githubOutput,
      [
        `candidate_sha=${result.candidateSha}`,
        `manifest_sha256=${result.manifestSha256}`,
        `file_index_sha256=${result.fileIndexSha256}`,
        `inventory_sha256=${result.inventorySha256}`,
        `function_count=${result.functionCount}`,
        `transport=${result.transport}`,
        "",
      ].join("\n"),
      { encoding: "utf8" },
    );
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  return result;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
