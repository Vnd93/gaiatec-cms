import { appendFile, readFile } from "node:fs/promises";

import { selectStagingBaselineSource } from "./staging-baseline-bootstrap-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function decodeBase64(value) {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value ?? ""))
    throw new Error("G12_STAGING_BASELINE_MARKER_ENCODING_REFUSED");
  const decoded = Buffer.from(value, "base64").toString("utf8");
  if (
    Buffer.byteLength(decoded, "utf8") > 4096 ||
    decoded.includes("\0") ||
    Buffer.from(decoded, "utf8").toString("base64") !== value
  )
    throw new Error("G12_STAGING_BASELINE_MARKER_ENCODING_REFUSED");
  return decoded;
}

const recordFile = argument("record");
const candidateSha = argument("candidate");
const deployment = {
  deploymentId: argument("deployment-id"),
  createdOn: argument("created-on"),
  commitMessage: decodeBase64(argument("commit-message-b64")),
};
if (!recordFile) throw new Error("G12_STAGING_BASELINE_SOURCE_INPUT_REFUSED");
const record = JSON.parse(await readFile(recordFile, "utf8"));
const result = selectStagingBaselineSource({ record, candidateSha, deployment });
if (!result.valid) throw new Error(`G12_STAGING_BASELINE_SOURCE_REFUSED:${result.violations.join(",")}`);
if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `mode=${result.mode}`,
      `provenance_trusted=${result.trusted}`,
      `remote_verification_required=${result.requiresRemoteVerification}`,
      `bridge_run_id=${result.bridgeRunId}`,
      `bridge_run_attempt=${result.bridgeRunAttempt}`,
      `compensation_run_id=${result.compensationRunId ?? ""}`,
      `compensation_run_attempt=${result.compensationRunAttempt ?? 0}`,
      "",
    ].join("\n"),
    "utf8",
  );
console.log(
  JSON.stringify({
    event: "g12.staging.baseline_source.classified_untrusted",
    candidateSha,
    mode: result.mode,
    provenanceTrusted: result.trusted,
    remoteVerificationRequired: result.requiresRemoteVerification,
    bridgeRunId: result.bridgeRunId,
    bridgeRunAttempt: result.bridgeRunAttempt,
    compensationRunId: result.compensationRunId ?? "",
    compensationRunAttempt: result.compensationRunAttempt ?? 0,
  }),
);
