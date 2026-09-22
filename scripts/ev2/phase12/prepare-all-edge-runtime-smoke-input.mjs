#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { materializeAllEdgeRuntimeSmokeInput } from "./all-edge-runtime-smoke-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0 || !process.argv[index + 1])
    throw new Error(`G12_ALL_EDGE_RUNTIME_SMOKE_ARGUMENT_${name.toUpperCase()}_REQUIRED`);
  return process.argv[index + 1];
}

export async function main() {
  const manifest = await materializeAllEdgeRuntimeSmokeInput({
    source: resolve(argument("source")),
    output: resolve(argument("output")),
    candidateSha: argument("candidate-sha"),
  });
  process.stdout.write(
    `${JSON.stringify({
      event: manifest.event,
      candidateSha: manifest.candidateSha,
      functionCount: manifest.functionCount,
      sourceTreeSha256: manifest.source.treeSha256,
      materializedTreeSha256: manifest.materialized.treeSha256,
    })}\n`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url))
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
