import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { decodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import {
  STAGING_DEPLOY_RECOVERY,
  buildStagingDeployRecoveryState,
  normalizeStagingArtifactDigest,
  readStagingDeployRecoveryJson,
  stagingDeployRecoveryIdentityFromSealAndProvenance,
  validateStagingDeployRecoverySourceFiles,
} from "./staging-deploy-recovery-state-lib.mjs";
import {
  STAGING_ENVIRONMENT_SNAPSHOT,
  verifyStagingEnvironmentSnapshot,
} from "./staging-environment-snapshot-lib.mjs";
import {
  STAGING_EDGE_BASELINE_ARTIFACT,
  loadAndVerifyStagingEdgeBaselineArtifact,
} from "./staging-edge-baseline-artifact-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? "" : process.argv[index + 1];
}

function requiredEnvironment(name) {
  if (!Object.hasOwn(process.env, name) || process.env[name] === "")
    throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_REQUIRED:${name}`);
  return process.env[name];
}

const output = argument("output");
const sealPath = argument("seal");
const provenancePath = argument("provenance");
const snapshotPath = argument("environment-snapshot");
const edgeBaselinePath = argument("edge-baseline");
if (!output || !sealPath || !provenancePath || !snapshotPath || !edgeBaselinePath)
  throw new Error("G12_STAGING_DEPLOY_RECOVERY_STATE_INPUT_REQUIRED");
const [{ value: seal }, { value: provenance }] = await Promise.all([
  readStagingDeployRecoveryJson(sealPath, "SEAL"),
  readStagingDeployRecoveryJson(provenancePath, "PROVENANCE"),
]);
const candidateRelease = requiredEnvironment("CANDIDATE_RELEASE");
const controlSha = requiredEnvironment("CONTROL_SHA");
const createdOnInput = requiredEnvironment("ORIGINAL_CREATED_ON");
const original = {
  deploymentId: requiredEnvironment("ORIGINAL_DEPLOYMENT_ID"),
  release: requiredEnvironment("ORIGINAL_RELEASE"),
  createdOn: Number.isFinite(Date.parse(createdOnInput))
    ? new Date(createdOnInput).toISOString()
    : createdOnInput,
  commitMessage: decodeDeploymentCommitMessage(requiredEnvironment("ORIGINAL_COMMIT_MESSAGE_B64")),
};
const { source: derivedSource, dist } = stagingDeployRecoveryIdentityFromSealAndProvenance({
  seal,
  provenance,
});
const source = {
  ...derivedSource,
  ciRunId: requiredEnvironment("SOURCE_CI_RUN_ID"),
  ciRunAttempt: Number(requiredEnvironment("SOURCE_CI_RUN_ATTEMPT")),
  gateCiRunAttempt: Number(requiredEnvironment("GATE_CI_RUN_ATTEMPT")),
  artifactId: requiredEnvironment("SOURCE_ARTIFACT_ID"),
  digest: normalizeStagingArtifactDigest(requiredEnvironment("SOURCE_ARTIFACT_DIGEST")),
  name: requiredEnvironment("SOURCE_ARTIFACT_NAME"),
  profileSha256: requiredEnvironment("SOURCE_PROFILE_SHA256"),
};
const sourceResult = validateStagingDeployRecoverySourceFiles({
  seal,
  provenance,
  originalRelease: original.release,
  source,
  dist,
});
if (!sourceResult.valid)
  throw new Error(`G12_STAGING_DEPLOY_RECOVERY_STATE_SOURCE_REFUSED:${sourceResult.violations.join(",")}`);
const snapshotVerification = await verifyStagingEnvironmentSnapshot({
  snapshotPath,
  expected: {
    candidateSha: candidateRelease,
    controlSha,
    projectRef: STAGING_ENVIRONMENT_SNAPSHOT.projectRef,
    pagesDeployment: {
      id: original.deploymentId,
      branch: STAGING_ENVIRONMENT_SNAPSHOT.pagesBranch,
      commitSha: original.release,
      createdOn: original.createdOn,
    },
  },
});
const edgeBaseline = loadAndVerifyStagingEdgeBaselineArtifact({
  root: edgeBaselinePath,
  expected: {
    projectRef: STAGING_EDGE_BASELINE_ARTIFACT.projectRef,
    candidateSha: candidateRelease,
    controlSha,
    runId: requiredEnvironment("GITHUB_RUN_ID"),
    runAttempt: Number(requiredEnvironment("GITHUB_RUN_ATTEMPT")),
  },
});
const state = buildStagingDeployRecoveryState({
  workflow: {
    runId: requiredEnvironment("GITHUB_RUN_ID"),
    attempt: Number(requiredEnvironment("GITHUB_RUN_ATTEMPT")),
    controlSha,
  },
  candidateRelease,
  original,
  source,
  dist,
  recoveryArtifact: {
    id: requiredEnvironment("RECOVERY_ARTIFACT_ID"),
    digest: requiredEnvironment("RECOVERY_ARTIFACT_DIGEST"),
    name: requiredEnvironment("RECOVERY_ARTIFACT_NAME"),
  },
  environmentSnapshot: {
    file: STAGING_DEPLOY_RECOVERY.environmentSnapshotArtifactPath,
    sha256: snapshotVerification.snapshotSha256,
  },
  edgeBaseline: {
    manifestFile: STAGING_DEPLOY_RECOVERY.edgeBaselineManifestPath,
    manifestSha256: edgeBaseline.manifestSha256,
    inventorySha256: edgeBaseline.manifest.inventorySha256,
    functionCount: edgeBaseline.manifest.functionCount,
    aggregateBytes: edgeBaseline.manifest.aggregateBytes,
    aggregateRawEszipBytes: edgeBaseline.manifest.aggregateRawEszipBytes,
  },
  browserRecovery: {
    environment: "staging",
    runTag: requiredEnvironment("BROWSER_RUN_TAG"),
  },
});
const target = resolve(output);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(state, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
  flag: "wx",
});
console.log(
  JSON.stringify({
    event: "g12.staging.deploy.recovery_state.written",
    runId: state.workflow.runId,
    attempt: state.workflow.attempt,
    recoveryArtifactId: state.recoveryArtifact.id,
    secretsDisclosed: false,
  }),
);
