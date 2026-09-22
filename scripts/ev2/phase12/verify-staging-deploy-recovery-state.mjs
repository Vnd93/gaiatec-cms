import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  readStagingDeployRecoveryJson,
  recoveryStateOutputs,
  validateStagingDeployRecoveryState,
} from "./staging-deploy-recovery-state-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1];
}

const file = argument("file");
if (!file) throw new Error("G12_STAGING_DEPLOY_RECOVERY_STATE_FILE_REQUIRED");
const target = resolve(file);
const { value: state } = await readStagingDeployRecoveryJson(target, "STATE");
const result = validateStagingDeployRecoveryState(state, {
  runId: argument("run-id") || undefined,
  attempt: argument("run-attempt") || undefined,
  controlSha: argument("control-sha") || undefined,
  candidateRelease: argument("candidate-release") || undefined,
  originalRelease: argument("original-release") || undefined,
});
if (!result.valid)
  throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REFUSED:${result.violations.join(",")}`);
const outputs = recoveryStateOutputs(state, file);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.deploy.recovery_state.verified",
    runId: state.workflow.runId,
    attempt: state.workflow.attempt,
    recoveryArtifactId: state.recoveryArtifact.id,
    secretsDisclosed: false,
  }),
);
