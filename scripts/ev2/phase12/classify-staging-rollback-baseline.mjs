import { appendFile, readFile } from "node:fs/promises";

import { decodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { classifyStagingRollbackBaseline } from "./staging-rollback-baseline-source-lib.mjs";

function argument(name) {
  const indexes = process.argv.flatMap((value, index) => (value === `--${name}` ? [index] : []));
  if (indexes.length !== 1) throw new Error("G12_STAGING_ROLLBACK_BASELINE_ARGUMENT_REFUSED");
  const value = process.argv[indexes[0] + 1];
  if (!value || value.startsWith("--")) throw new Error("G12_STAGING_ROLLBACK_BASELINE_ARGUMENT_REFUSED");
  return value;
}

const record = JSON.parse(await readFile(argument("record"), "utf8"));
const result = classifyStagingRollbackBaseline({
  record,
  deployment: {
    deploymentId: argument("deployment-id"),
    release: argument("release"),
    createdOn: argument("created-on"),
    commitMessage: decodeDeploymentCommitMessage(argument("commit-message-b64")),
  },
});
if (!result.valid) throw new Error(`G12_STAGING_ROLLBACK_BASELINE_REFUSED:${result.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_ROLLBACK_BASELINE_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `mode=${result.mode}`,
    `producer_run_id=${result.runId}`,
    `producer_run_attempt=${result.runAttempt}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(
  JSON.stringify({
    event: "g12.staging.rollback.baseline_classified",
    mode: result.mode,
    producerRunId: result.runId,
    producerRunAttempt: result.runAttempt,
  }),
);
