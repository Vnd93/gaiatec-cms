import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { decodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import { sha256Bytes } from "./production-frontend-bridge-lib.mjs";
import {
  publicBridgeHeadlessSummary,
  validatePublicBridgeFixtureReport,
  validatePublicBridgeHeadlessCanary,
  validatePublicBridgeRolloutProbe,
} from "./public-bridge-evidence-lib.mjs";
import { validateStagingFrontendBridgeEvidence } from "./staging-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const names = [
  "seal",
  "preview-probe",
  "canonical-probe",
  "preview-headless",
  "preview-cleanup",
  "preview-residue",
  "canonical-headless",
  "canonical-cleanup",
  "canonical-residue",
  "output",
];
const paths = Object.fromEntries(names.map((name) => [name, argument(name)]));
if (Object.values(paths).some((value) => !value))
  throw new Error("G12_STAGING_FRONTEND_BRIDGE_EVIDENCE_INPUT_REQUIRED");
const bytes = Object.fromEntries(
  await Promise.all(
    Object.entries(paths)
      .filter(([key]) => key !== "output")
      .map(async ([key, file]) => [key, await readFile(resolve(file))]),
  ),
);
const candidateSha = process.env.CANDIDATE_SHA ?? "";
const headlessCanaries = {};
for (const label of ["preview", "canonical"]) {
  const headlessBytes = bytes[`${label}-headless`];
  const cleanupBytes = bytes[`${label}-cleanup`];
  const residueBytes = bytes[`${label}-residue`];
  const headless = JSON.parse(headlessBytes);
  const cleanup = JSON.parse(cleanupBytes);
  const residue = JSON.parse(residueBytes);
  const expected = {
    candidateSha,
    environment: "staging",
    backendContract: "legacy-f48",
    origin: label === "preview" ? process.env.PREVIEW_ORIGIN : process.env.CANONICAL_ORIGIN,
    deploymentOrigin:
      label === "preview" ? process.env.PREVIEW_DEPLOYMENT_ORIGIN : process.env.CANONICAL_DEPLOYMENT_ORIGIN,
    deploymentId:
      label === "preview" ? process.env.PREVIEW_DEPLOYMENT_ID : process.env.CANONICAL_DEPLOYMENT_ID,
  };
  const checks = [
    validatePublicBridgeHeadlessCanary(headless, expected),
    validatePublicBridgeFixtureReport(cleanup, expected),
    validatePublicBridgeFixtureReport(residue, expected),
  ];
  if (
    checks.some((check) => !check.valid) ||
    cleanup.runTag !== residue.runTag ||
    headless.fixtureBindingSha256 !== cleanup.fixtureBindingSha256 ||
    headless.fixtureBindingSha256 !== residue.fixtureBindingSha256
  )
    throw new Error(`G12_STAGING_FRONTEND_BRIDGE_${label.toUpperCase()}_HEADLESS_REFUSED`);
  headlessCanaries[label] = {
    ...publicBridgeHeadlessSummary(headless, cleanup, residue),
    reportSha256: sha256Bytes(headlessBytes),
    cleanupSha256: sha256Bytes(cleanupBytes),
    residueSha256: sha256Bytes(residueBytes),
  };
}
for (const [label, origin] of [
  ["preview", process.env.PREVIEW_ORIGIN],
  ["canonical", process.env.CANONICAL_ORIGIN],
]) {
  const result = validatePublicBridgeRolloutProbe(JSON.parse(bytes[`${label}-probe`]), {
    candidateSha,
    environment: "staging",
    probeProfile: "full",
    origin,
  });
  if (!result.valid) throw new Error(`G12_STAGING_FRONTEND_BRIDGE_${label.toUpperCase()}_PROBE_REFUSED`);
}
const seal = JSON.parse(bytes.seal);
for (const prefix of ["BASELINE", "PREVIEW", "CANONICAL"])
  if (!Object.hasOwn(process.env, `${prefix}_COMMIT_MESSAGE_B64`))
    throw new Error("G12_STAGING_FRONTEND_BRIDGE_COMMIT_MESSAGE_REQUIRED");
const identity = (prefix) => ({
  deploymentId: process.env[`${prefix}_DEPLOYMENT_ID`] ?? "",
  release: process.env[`${prefix}_RELEASE`] ?? "",
  createdOn: process.env[`${prefix}_CREATED_ON`] ?? "",
  commitMessage: decodeDeploymentCommitMessage(process.env[`${prefix}_COMMIT_MESSAGE_B64`] ?? ""),
});
const evidence = {
  schemaVersion: 3,
  event: "g12.staging.frontend_bridge.promoted",
  repository: "Vnd93/gaiatec-cms",
  workflow: {
    name: "Promote staging frontend bridge",
    path: ".github/workflows/promote-staging-frontend-bridge.yml",
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    controlSha: process.env.CONTROL_SHA,
  },
  candidateSha,
  baseline: identity("BASELINE"),
  preview: identity("PREVIEW"),
  canonical: identity("CANONICAL"),
  dist: { archiveSha256: seal.archiveSha256, treeSha256: seal.treeSha256 },
  probes: {
    previewSha256: sha256Bytes(bytes["preview-probe"]),
    canonicalSha256: sha256Bytes(bytes["canonical-probe"]),
  },
  headlessCanaries,
  compatibilityScope: {
    mode: "compatibility-only",
    backendContract: "legacy-f48",
    tested: [
      "legacy-content-read",
      "page-campaign-form-render",
      "turnstile-widget-request",
      "fail-closed-without-token",
      "zero-lead-post",
    ],
    notTested: ["positive-form-submission", "lead-persistence", "full-candidate-backend"],
  },
  positiveBrowserRequiredAfterFullCandidateDeploy: true,
  backendMutation: "fixture-only-cleaned",
  rollbackReady: true,
};
const result = validateStagingFrontendBridgeEvidence(evidence, {
  candidateSha,
  runId: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  controlSha: process.env.CONTROL_SHA,
  deploymentId: process.env.CANONICAL_DEPLOYMENT_ID,
});
if (!result.valid)
  throw new Error(`G12_STAGING_FRONTEND_BRIDGE_EVIDENCE_REFUSED:${result.violations.join(",")}`);
const output = resolve(paths.output);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(
  JSON.stringify({
    event: evidence.event,
    candidateSha,
    backendMutation: evidence.backendMutation,
    compatibilityOnly: true,
    positiveBrowserRequiredAfterFullCandidateDeploy: true,
  }),
);
