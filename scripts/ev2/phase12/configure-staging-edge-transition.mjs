import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { appendFileSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { loadAndVerifyAllEdgeRuntimeArtifact } from "./all-edge-runtime-artifact-lib.mjs";
import { loadAndVerifyStagingEdgeBaselineArtifact } from "./staging-edge-baseline-artifact-lib.mjs";
import { functionInventorySnapshot } from "./staging-cms-public-hotfix-lib.mjs";
import { pollForVerifiedFunctionState } from "./staging-edge-artifact-deployment-lib.mjs";
import {
  appendStagingEdgeConfigurationReceipt,
  evaluateConfigurationVersionTransition,
  verifyConfigurationProof,
  verifyStagingEdgeConfigurationContext,
  verifyStagingEdgeConfigurationReceipt,
} from "./staging-edge-configuration-transition-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index < 0 ? "" : process.argv[index + 1];
  if (!value || value.startsWith("--"))
    throw new Error(`G12_STAGING_EDGE_CONFIGURATION_OPTION_REQUIRED:${name}`);
  return value;
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  const candidateSha = argument("candidate");
  const kind = argument("kind");
  const output = resolve(argument("report"));
  if (lstatSync(output, { throwIfNoEntry: false }))
    throw new Error("G12_STAGING_EDGE_CONFIGURATION_OUTPUT_EXISTS");
  const projectRef = process.env.STAGING_SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  const expected = {
    candidateSha,
    projectRef,
    workflow: {
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      controlSha: process.env.GITHUB_SHA,
    },
  };
  if (projectRef !== "glcqsosxwgmlhzgcsnzv" || !token.startsWith("sbp_") || !["public", "ai"].includes(kind))
    throw new Error("G12_STAGING_EDGE_CONFIGURATION_CONTEXT_REFUSED");
  const artifact = loadAndVerifyAllEdgeRuntimeArtifact({
    root: resolve(argument("candidate-artifact")),
    candidateSha,
    manifestSha256: argument("artifact-manifest-sha256"),
  });
  const baseline = loadAndVerifyStagingEdgeBaselineArtifact({
    root: resolve(argument("baseline-artifact")),
    expectedManifestSha256: argument("baseline-manifest-sha256"),
    expected,
  });
  let previous;
  let beforeExpected = verifyStagingEdgeConfigurationContext({ baseline, expected });
  if (kind === "ai") {
    const path = resolve(argument("previous-receipt"));
    const metadata = lstatSync(path);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 256 * 1024)
      throw new Error("G12_STAGING_EDGE_CONFIGURATION_PREVIOUS_FILE_REFUSED");
    const bytes = readFileSync(path);
    if (digest(bytes) !== argument("previous-receipt-sha256"))
      throw new Error("G12_STAGING_EDGE_CONFIGURATION_PREVIOUS_DIGEST_REFUSED");
    previous = JSON.parse(bytes);
    beforeExpected = verifyStagingEdgeConfigurationReceipt({
      receipt: previous,
      baseline,
      expected,
      requiredSteps: 1,
    });
  }
  async function readInventory() {
    const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`G12_STAGING_EDGE_CONFIGURATION_READ_FAILED:${response.status}`);
    return response.json();
  }
  const before = await readInventory();
  const live = functionInventorySnapshot(before);
  if (!live.valid || !beforeExpected.valid || live.inventorySha256 !== beforeExpected.inventorySha256)
    throw new Error("G12_STAGING_EDGE_CONFIGURATION_PRESTATE_REFUSED");
  const script =
    kind === "public"
      ? "configure-staging-edge-public-secrets.mjs"
      : "configure-staging-ai-provider-secrets.mjs";
  // Only the script from the already verified, CI-sealed artifact can mutate secrets.
  // No retry of the mutation; failures fall through to the existing durable finalizer.
  const result = spawnSync(process.execPath, [join(artifact.sourceRoot, "scripts/ev2/phase12", script)], {
    encoding: "utf8",
    env: { ...process.env, STAGING_CANDIDATE_SHA: candidateSha },
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5 * 60_000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) throw new Error("G12_STAGING_EDGE_CONFIGURATION_COMMAND_FAILED");
  const proof = JSON.parse(result.stdout.trim());
  verifyConfigurationProof(kind, proof, candidateSha);
  const after = await pollForVerifiedFunctionState({
    readInventory,
    evaluate: (payload) => evaluateConfigurationVersionTransition(before, payload),
  });
  const receipt = appendStagingEdgeConfigurationReceipt({
    previous,
    baseline,
    expected,
    kind,
    before,
    after: after.payload,
    proof,
  });
  const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, bytes, { flag: "wx", mode: 0o600 });
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `receipt_sha256=${digest(bytes)}\n`);
  console.log(
    JSON.stringify({
      event: receipt.event,
      kind,
      candidateSha,
      receiptSha256: digest(bytes),
      functions: after.result.snapshot.records.length,
    }),
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : "G12_STAGING_EDGE_CONFIGURATION_FAILED"}\n`,
  );
  process.exitCode = 1;
});
