import { appendFile } from "node:fs/promises";

import {
  readStagingReleaseCheckpointControls,
  verifyStagingReleaseCheckpoint,
} from "./staging-release-checkpoint-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const required = [
  "state",
  "checkpoint",
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
const result = await verifyStagingReleaseCheckpoint({
  statePath: values.state,
  checkpointPath: values.checkpoint,
  controls,
  now: argument("now") || new Date().toISOString(),
});
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      "verified=true",
      "binding_matches=true",
      `candidate_sha=${result.context.candidateSha}`,
      `artifact_id=${result.context.artifact.id}`,
      `artifact_digest=${result.context.artifact.digest}`,
      `archive_sha256=${result.context.artifact.archiveSha256}`,
      `tree_sha256=${result.context.artifact.treeSha256}`,
      `deployment_id=${result.context.deployment.id}`,
      `environment_snapshot_sha256=${result.context.environment.snapshotSha256}`,
      `edge_baseline_manifest_sha256=${result.context.environment.edgeBaselineManifestSha256}`,
      `release_profile=${result.context.profile}`,
      `matrix_sha256=${result.context.matrixSha256}`,
      `policy_sha256=${result.context.policySha256}`,
      `checkpoint_sha256=${result.checkpointSha256}`,
      `state_sha256=${result.stateSha256}`,
      "reusable_gates=artifact-seal,immutable-provenance",
      "mutation_gates_reused=false",
      "",
    ].join("\n"),
    "utf8",
  );
}
console.log(
  JSON.stringify({
    event: "g12.staging.release_checkpoint.verified",
    candidateSha: result.context.candidateSha,
    artifactId: result.context.artifact.id,
    bindingMatches: true,
    reusableGates: result.evaluation.reusable.map(({ name }) => name),
    mutationGatesReused: false,
    secretsExposed: false,
  }),
);
