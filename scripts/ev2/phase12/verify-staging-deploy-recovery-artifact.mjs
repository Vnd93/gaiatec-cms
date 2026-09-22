import { appendFile } from "node:fs/promises";

import {
  STAGING_DEPLOY_RECOVERY,
  readStagingDeployRecoveryJson,
  validateStagingDeployRecoveryArtifactMetadata,
  validateStagingDeployRecoveryState,
  verifyStagingDeployRecoveryArtifact,
} from "./staging-deploy-recovery-state-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1];
}

async function github(path) {
  const token = process.env.GITHUB_TOKEN ?? "";
  if (process.env.GITHUB_REPOSITORY !== STAGING_DEPLOY_RECOVERY.repository || token.length < 30)
    throw new Error("G12_STAGING_DEPLOY_RECOVERY_GITHUB_INPUT_REFUSED");
  let lastFailure = "transport";
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(20_000),
      });
      const text = await response.text();
      if (Buffer.byteLength(text, "utf8") > 2_000_000)
        throw new Error("G12_STAGING_DEPLOY_RECOVERY_GITHUB_RESPONSE_SIZE_REFUSED");
      if (response.ok) {
        try {
          return JSON.parse(text);
        } catch (error) {
          throw new Error("G12_STAGING_DEPLOY_RECOVERY_GITHUB_RESPONSE_REFUSED", { cause: error });
        }
      }
      lastFailure = String(response.status);
      // A freshly uploaded artifact can be briefly absent from the read API even after the
      // upload action returned its immutable id. Retry that bounded visibility gap, then fail
      // closed exactly like every other exhausted response.
      if (![404, 408, 429].includes(response.status) && response.status < 500)
        throw new Error(`G12_STAGING_DEPLOY_RECOVERY_GITHUB_REQUEST_REFUSED:${response.status}`);
    } catch (error) {
      if (
        String(error?.message ?? "").startsWith("G12_STAGING_DEPLOY_RECOVERY_GITHUB_REQUEST_REFUSED:") ||
        String(error?.message ?? "").includes("RESPONSE_SIZE_REFUSED") ||
        String(error?.message ?? "").includes("RESPONSE_REFUSED")
      )
        throw error;
      lastFailure = "transport";
    }
    if (attempt < 4)
      await new Promise((done) => setTimeout(done, Math.min(1_000 * 2 ** (attempt - 1), 4_000)));
  }
  throw new Error(`G12_STAGING_DEPLOY_RECOVERY_GITHUB_RETRY_EXHAUSTED:${lastFailure}`);
}

const statePath = argument("state");
const artifactDirectory = argument("artifact-dir");
if (!statePath || !artifactDirectory) throw new Error("G12_STAGING_DEPLOY_RECOVERY_ARTIFACT_INPUT_REQUIRED");
const { value: state } = await readStagingDeployRecoveryJson(statePath, "STATE");
const stateResult = validateStagingDeployRecoveryState(state);
if (!stateResult.valid)
  throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REFUSED:${stateResult.violations.join(",")}`);
const [artifact, run] = await Promise.all([
  github(`/repos/${STAGING_DEPLOY_RECOVERY.repository}/actions/artifacts/${state.recoveryArtifact.id}`),
  github(
    `/repos/${STAGING_DEPLOY_RECOVERY.repository}/actions/runs/${state.workflow.runId}/attempts/${state.workflow.attempt}`,
  ),
]);
const metadataResult = validateStagingDeployRecoveryArtifactMetadata(artifact, run, state);
if (!metadataResult.valid)
  throw new Error(
    `G12_STAGING_DEPLOY_RECOVERY_ARTIFACT_METADATA_REFUSED:${metadataResult.violations.join(",")}`,
  );
const result = await verifyStagingDeployRecoveryArtifact({ artifactDirectory, state });
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `verified=true`,
      `artifact_id=${state.recoveryArtifact.id}`,
      `artifact_digest=${state.recoveryArtifact.digest}`,
      `archive_sha256=${result.archiveSha256}`,
      `environment_snapshot_sha256=${result.environmentSnapshotSha256}`,
      `edge_baseline_manifest_sha256=${result.edgeBaselineManifestSha256}`,
      `edge_baseline_inventory_sha256=${result.edgeBaselineInventorySha256}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.deploy.recovery_artifact.verified",
    artifactId: state.recoveryArtifact.id,
    archiveSha256: result.archiveSha256,
    edgeBaselineManifestSha256: result.edgeBaselineManifestSha256,
    secretsDisclosed: false,
  }),
);
