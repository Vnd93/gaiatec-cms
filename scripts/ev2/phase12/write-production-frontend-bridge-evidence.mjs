import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  sha256Bytes,
  validateFrontendBridgeEvidence,
  validateFrontendBridgeState,
} from "./production-frontend-bridge-lib.mjs";
import {
  validatePublicBridgeReadOnlyCanary,
  validatePublicBridgeRolloutProbe,
} from "./public-bridge-evidence-lib.mjs";
import { validateStagingFrontendBridgeEvidence } from "./staging-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const stateFile = argument("state");
const previewProbeFile = argument("preview-probe");
const productionProbeFile = argument("production-probe");
const previewReadOnlyFile = argument("preview-readonly");
const productionReadOnlyFile = argument("production-readonly");
const stagingEvidenceFile = argument("staging-evidence");
const output = argument("output");
if (
  !stateFile ||
  !previewProbeFile ||
  !productionProbeFile ||
  !previewReadOnlyFile ||
  !productionReadOnlyFile ||
  !stagingEvidenceFile ||
  !output
)
  throw new Error("G12_FRONTEND_BRIDGE_EVIDENCE_INPUT_REQUIRED");
const files = {
  state: resolve(stateFile),
  previewProbe: resolve(previewProbeFile),
  productionProbe: resolve(productionProbeFile),
  previewReadOnly: resolve(previewReadOnlyFile),
  productionReadOnly: resolve(productionReadOnlyFile),
  stagingEvidence: resolve(stagingEvidenceFile),
};
const bytes = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file)])),
);
const stateBytes = bytes.state;
const previewProbeBytes = bytes.previewProbe;
const productionProbeBytes = bytes.productionProbe;
const previewReadOnlyBytes = bytes.previewReadOnly;
const productionReadOnlyBytes = bytes.productionReadOnly;
const state = JSON.parse(stateBytes.toString("utf8"));
const stateResult = validateFrontendBridgeState(state, {
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  controlSha: process.env.CONTROL_SHA,
  candidateSha: process.env.CANDIDATE_SHA,
});
if (!stateResult.valid)
  throw new Error(`G12_FRONTEND_BRIDGE_STATE_REFUSED:${stateResult.violations.join(",")}`);
for (const [label, probeBytes, environment, profile] of [
  ["preview", previewProbeBytes, "production-preview", "full"],
  ["production", productionProbeBytes, "production", "full"],
]) {
  const report = JSON.parse(probeBytes.toString("utf8"));
  const result = validatePublicBridgeRolloutProbe(report, {
    candidateSha: state.candidateSha,
    environment,
    probeProfile: profile,
  });
  if (!result.valid) throw new Error(`G12_FRONTEND_BRIDGE_${String(label).toUpperCase()}_PROBE_REFUSED`);
}
for (const [label, reportBytes, deploymentOrigin, deploymentId] of [
  ["preview", previewReadOnlyBytes, process.env.PREVIEW_DEPLOYMENT_ORIGIN, process.env.PREVIEW_DEPLOYMENT_ID],
  [
    "production",
    productionReadOnlyBytes,
    "https://gaiatecsistemas.com.br",
    process.env.PRODUCTION_DEPLOYMENT_ID,
  ],
]) {
  const result = validatePublicBridgeReadOnlyCanary(JSON.parse(reportBytes.toString("utf8")), {
    candidateSha: state.candidateSha,
    origin: "https://gaiatecsistemas.com.br",
    deploymentOrigin,
    deploymentId,
  });
  if (!result.valid)
    throw new Error(
      `G12_FRONTEND_BRIDGE_${String(label).toUpperCase()}_READONLY_REFUSED:${result.violations.join(",")}`,
    );
}
const stagingEvidence = JSON.parse(bytes.stagingEvidence.toString("utf8"));
const stagingResult = validateStagingFrontendBridgeEvidence(stagingEvidence, {
  candidateSha: state.candidateSha,
  runId: process.env.STAGING_BRIDGE_RUN_ID,
  controlSha: process.env.STAGING_BRIDGE_CONTROL_SHA,
});
if (!stagingResult.valid)
  throw new Error(`G12_FRONTEND_BRIDGE_STAGING_EVIDENCE_REFUSED:${stagingResult.violations.join(",")}`);
const evidence = {
  ...state,
  schemaVersion: 2,
  event: "g12.production.frontend_bridge.promoted",
  preview: {
    deploymentId: process.env.PREVIEW_DEPLOYMENT_ID ?? "",
    release: state.candidateSha,
    createdOn: process.env.PREVIEW_CREATED_ON ?? "",
  },
  production: {
    deploymentId: process.env.PRODUCTION_DEPLOYMENT_ID ?? "",
    release: process.env.PRODUCTION_RELEASE ?? "",
    createdOn: process.env.PRODUCTION_CREATED_ON ?? "",
    commitMessage: process.env.PRODUCTION_COMMIT_MESSAGE ?? "",
  },
  prerequisites: {
    stagingRunId: process.env.STAGING_RUN_ID ?? "",
    backupRunId: process.env.BACKUP_RUN_ID ?? "",
    emailRunId: process.env.EMAIL_RUN_ID ?? "",
  },
  probes: {
    previewSha256: sha256Bytes(previewProbeBytes),
    productionSha256: sha256Bytes(productionProbeBytes),
  },
  stagingBridge: {
    runId: process.env.STAGING_BRIDGE_RUN_ID ?? "",
    runAttempt: Number(process.env.STAGING_BRIDGE_RUN_ATTEMPT),
    controlSha: process.env.STAGING_BRIDGE_CONTROL_SHA ?? "",
    artifactId: process.env.STAGING_BRIDGE_ARTIFACT_ID ?? "",
    artifactDigest: process.env.STAGING_BRIDGE_ARTIFACT_DIGEST ?? "",
    evidenceSha256: sha256Bytes(bytes.stagingEvidence),
    canonicalDeploymentId: stagingEvidence.canonical.deploymentId,
    functional: stagingEvidence.functionalCanaries.canonical,
  },
  productionSafety: {
    mode: "read-only-old-backend",
    renderedRoutesPerDeployment: 4,
    leadSubmissions: 0,
    backendMutations: 0,
    previewProbeSha256: sha256Bytes(previewProbeBytes),
    productionProbeSha256: sha256Bytes(productionProbeBytes),
    previewReadOnlySha256: sha256Bytes(previewReadOnlyBytes),
    productionReadOnlySha256: sha256Bytes(productionReadOnlyBytes),
  },
  rollbackReady: true,
};
const result = validateFrontendBridgeEvidence(evidence, {
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  controlSha: process.env.CONTROL_SHA,
  candidateSha: process.env.CANDIDATE_SHA,
  deploymentId: process.env.PRODUCTION_DEPLOYMENT_ID,
});
if (!result.valid) throw new Error(`G12_FRONTEND_BRIDGE_EVIDENCE_REFUSED:${result.violations.join(",")}`);
const target = resolve(output);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(
  JSON.stringify({
    event: evidence.event,
    candidateSha: evidence.candidateSha,
    deploymentId: evidence.production.deploymentId,
    rollbackReady: true,
    backendMutation: "none",
  }),
);
