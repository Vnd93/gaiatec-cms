import { appendFile } from "node:fs/promises";

import {
  readStagingReleaseCheckpointControls,
  writeStagingReleaseCheckpoint,
} from "./staging-release-checkpoint-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const required = [
  "state",
  "output",
  "candidate-matrix",
  "control-matrix",
  "candidate-policy",
  "control-policy",
  "profile",
];
const values = Object.fromEntries(required.map((name) => [name, argument(name)]));
if (Object.values(values).some((value) => !value)) {
  throw new Error("G12_STAGING_RELEASE_CHECKPOINT_ARGUMENTS_REQUIRED");
}
const controls = await readStagingReleaseCheckpointControls({
  candidateMatrixPath: values["candidate-matrix"],
  controlMatrixPath: values["control-matrix"],
  candidatePolicyPath: values["candidate-policy"],
  controlPolicyPath: values["control-policy"],
  profile: values.profile,
  expectedMatrixSha256: argument("expected-matrix-sha256"),
  expectedPolicySha256: argument("expected-policy-sha256"),
});
const result = await writeStagingReleaseCheckpoint({
  statePath: values.state,
  outputPath: values.output,
  controls,
  createdAt: argument("created-at") || new Date().toISOString(),
});
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `checkpoint_sha256=${result.checkpointSha256}`,
      `release_profile=${result.context.profile}`,
      `matrix_sha256=${result.context.matrixSha256}`,
      `policy_sha256=${result.context.policySha256}`,
      "mutation_gates_reused=false",
      "",
    ].join("\n"),
    "utf8",
  );
}
console.log(
  JSON.stringify({
    event: "g12.staging.release_checkpoint.written",
    candidateSha: result.context.candidateSha,
    artifactId: result.context.artifact.id,
    checkpointSha256: result.checkpointSha256,
    reusableGates: result.checkpoint.gates.map(({ name }) => name),
    mutationGatesReused: false,
    secretsExposed: false,
  }),
);
