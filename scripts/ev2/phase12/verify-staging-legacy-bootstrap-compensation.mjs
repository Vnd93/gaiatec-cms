import { resolve } from "node:path";

import { verifyStagingLegacyBootstrapCompensation } from "./staging-legacy-bootstrap-compensation-lib.mjs";

const PREFIX = "G12_STAGING_LEGACY_BOOTSTRAP_COMPENSATION_REFUSED";
const FLAGS = Object.freeze([
  "record",
  "state-artifact-dir",
  "recovery-artifact-dir",
  "candidate-sha",
  "control-sha",
  "run-id",
  "run-attempt",
  "state-artifact-id",
  "state-artifact-digest",
  "state-artifact-name",
  "recovery-artifact-id",
  "recovery-artifact-digest",
  "recovery-artifact-name",
]);

function argumentsExact(argv) {
  if (argv.length !== FLAGS.length * 2) throw new Error(`${PREFIX}:arguments_invalid`);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const token = argv[index];
    const value = argv[index + 1];
    if (!token.startsWith("--") || !FLAGS.includes(token.slice(2)) || !value)
      throw new Error(`${PREFIX}:arguments_invalid`);
    const name = token.slice(2);
    if (Object.hasOwn(values, name)) throw new Error(`${PREFIX}:arguments_invalid`);
    values[name] = value;
  }
  if (FLAGS.some((name) => !Object.hasOwn(values, name))) throw new Error(`${PREFIX}:arguments_invalid`);
  return values;
}

const values = argumentsExact(process.argv.slice(2));
if (!/^[1-9]\d*$/.test(values["run-attempt"])) throw new Error(`${PREFIX}:run_attempt_invalid`);
const runAttempt = Number(values["run-attempt"]);
if (!Number.isSafeInteger(runAttempt)) throw new Error(`${PREFIX}:run_attempt_invalid`);

let result;
try {
  result = await verifyStagingLegacyBootstrapCompensation({
    recordPath: resolve(values.record),
    stateArtifactDirectory: resolve(values["state-artifact-dir"]),
    recoveryArtifactDirectory: resolve(values["recovery-artifact-dir"]),
    candidateSha: values["candidate-sha"],
    controlSha: values["control-sha"],
    runId: values["run-id"],
    runAttempt,
    stateArtifact: {
      id: values["state-artifact-id"],
      digest: values["state-artifact-digest"],
      name: values["state-artifact-name"],
    },
    recoveryArtifact: {
      id: values["recovery-artifact-id"],
      digest: values["recovery-artifact-digest"],
      name: values["recovery-artifact-name"],
    },
  });
} catch (error) {
  if (String(error?.message ?? "").startsWith(`${PREFIX}:`)) throw error;
  throw new Error(`${PREFIX}:verification_failed`, { cause: error });
}

console.log(
  JSON.stringify({
    event: "g12.staging.legacy_bootstrap_compensation.verified",
    ...result,
    rebuildPerformed: false,
    resealPerformed: false,
    persistentOutputCreated: false,
  }),
);
