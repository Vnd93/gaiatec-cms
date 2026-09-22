import { open } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { validatePipelineChain } from "./pipeline-end-to-end-lib.mjs";

function parseArguments(argv) {
  if (argv.length % 2 !== 0) throw new Error("invalid arguments");
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("invalid arguments");
    const name = key.slice(2);
    if (Object.hasOwn(options, name)) throw new Error(`duplicate --${name}`);
    options[name] = value;
  }
  const expected = [
    "candidate",
    "profile",
    "matrix-sha256",
    "policy-sha256",
    "ci-run-id",
    "ci-gate-run-attempt",
    "ci-producer-run-attempt",
    "ci-control-sha",
    "bridge-run-id",
    "bridge-run-attempt",
    "bridge-control-sha",
    "staging-run-id",
    "staging-run-attempt",
    "staging-control-sha",
    "artifact-name",
    "artifact-id",
    "artifact-digest",
    "archive-sha256",
    "tree-sha256",
    "captured-at",
    "output",
  ];
  if (Object.keys(options).sort().join(",") !== expected.sort().join(",")) {
    throw new Error("invalid arguments");
  }
  return options;
}

function integer(value) {
  return /^[1-9]\d*$/.test(value ?? "") && Number.isSafeInteger(Number(value));
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  for (const name of [
    "ci-run-id",
    "ci-gate-run-attempt",
    "ci-producer-run-attempt",
    "bridge-run-id",
    "bridge-run-attempt",
    "staging-run-id",
    "staging-run-attempt",
    "artifact-id",
  ]) {
    if (!integer(options[name])) throw new Error(`${name} is invalid`);
  }
  const artifact = {
    name: options["artifact-name"],
    id: options["artifact-id"],
    digest: options["artifact-digest"],
    archiveSha256: options["archive-sha256"],
    treeSha256: options["tree-sha256"],
  };
  const chain = validatePipelineChain({
    schemaVersion: 1,
    event: "release.pipeline.chain.binding",
    repository: "Vnd93/gaiatec-cms",
    candidateSha: options.candidate,
    profile: options.profile,
    matrixSha256: options["matrix-sha256"],
    policySha256: options["policy-sha256"],
    capturedAt: options["captured-at"],
    ci: {
      workflow: "CI",
      runId: Number(options["ci-run-id"]),
      runAttempt: Number(options["ci-gate-run-attempt"]),
      producerRunAttempt: Number(options["ci-producer-run-attempt"]),
      controlSha: options["ci-control-sha"],
      artifact: structuredClone(artifact),
    },
    bridge: {
      workflow: "Promote staging frontend bridge",
      runId: Number(options["bridge-run-id"]),
      runAttempt: Number(options["bridge-run-attempt"]),
      sourceCiRunId: Number(options["ci-run-id"]),
      gateCiRunAttempt: Number(options["ci-gate-run-attempt"]),
      sourceCiRunAttempt: Number(options["ci-producer-run-attempt"]),
      controlSha: options["bridge-control-sha"],
      artifact: structuredClone(artifact),
    },
    staging: {
      workflow: "Deploy staging",
      runId: Number(options["staging-run-id"]),
      runAttempt: Number(options["staging-run-attempt"]),
      sourceBridgeRunId: Number(options["bridge-run-id"]),
      sourceBridgeRunAttempt: Number(options["bridge-run-attempt"]),
      controlSha: options["staging-control-sha"],
      artifact: structuredClone(artifact),
    },
  });
  const output = options.output;
  if (!path.isAbsolute(output) || path.normalize(output) !== output)
    throw new Error("output path must be canonical and absolute");
  const handle = await open(output, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(chain, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  process.stdout.write(`${JSON.stringify(chain)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
