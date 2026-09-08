import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { decodeDeploymentCommitMessage } from "./deployment-commit-message.mjs";
import {
  FRONTEND_BRIDGE_REPOSITORY,
  FRONTEND_BRIDGE_WORKFLOW_NAME,
  FRONTEND_BRIDGE_WORKFLOW_PATH,
  frontendBridgeCompensationMarker,
  frontendBridgeRunMarker,
  validateFrontendBridgeState,
} from "./production-frontend-bridge-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function identity(prefix) {
  if (!Object.hasOwn(process.env, `${prefix}_COMMIT_MESSAGE_B64`))
    throw new Error("G12_FRONTEND_BRIDGE_STATE_COMMIT_MESSAGE_REQUIRED");
  return {
    deploymentId: process.env[`${prefix}_DEPLOYMENT_ID`] ?? "",
    release: process.env[`${prefix}_RELEASE`] ?? "",
    createdOn: process.env[`${prefix}_CREATED_ON`] ?? "",
    commitMessage: decodeDeploymentCommitMessage(process.env[`${prefix}_COMMIT_MESSAGE_B64`] ?? ""),
  };
}

const output = argument("output");
const sealPath = argument("seal");
const predecessorSealPath = argument("predecessor-seal");
if (!output || !sealPath || !predecessorSealPath) throw new Error("G12_FRONTEND_BRIDGE_STATE_INPUT_REQUIRED");
const seal = JSON.parse(await readFile(resolve(sealPath), "utf8"));
const predecessorSeal = JSON.parse(await readFile(resolve(predecessorSealPath), "utf8"));
const runId = process.env.GITHUB_RUN_ID ?? "";
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT);
const candidateSha = process.env.CANDIDATE_SHA ?? "";
const state = {
  schemaVersion: 2,
  event: "g12.production.frontend_bridge.prepared",
  repository: FRONTEND_BRIDGE_REPOSITORY,
  workflow: {
    name: FRONTEND_BRIDGE_WORKFLOW_NAME,
    path: FRONTEND_BRIDGE_WORKFLOW_PATH,
    runId,
    runAttempt,
    controlSha: process.env.CONTROL_SHA ?? "",
  },
  candidateSha,
  runMarker: frontendBridgeRunMarker(runId, runAttempt),
  compensationMarker: frontendBridgeCompensationMarker(runId, runAttempt),
  baseline: identity("BASELINE"),
  approval: {
    record: process.env.APPROVAL_RECORD ?? "",
    recordSha256: process.env.APPROVAL_RECORD_SHA256 ?? "",
    changeReference: process.env.CHANGE_REFERENCE ?? "",
  },
  dist: {
    candidateSha: seal.candidateSha,
    archiveFile: seal.archiveFile,
    archiveBytes: seal.archiveBytes,
    archiveSha256: seal.archiveSha256,
    treeSha256: seal.treeSha256,
    fileCount: seal.fileCount,
    byteCount: seal.byteCount,
  },
  predecessorDist: {
    candidateSha: predecessorSeal.candidateSha,
    archiveFile: predecessorSeal.archiveFile,
    archiveBytes: predecessorSeal.archiveBytes,
    archiveSha256: predecessorSeal.archiveSha256,
    treeSha256: predecessorSeal.treeSha256,
    fileCount: predecessorSeal.fileCount,
    byteCount: predecessorSeal.byteCount,
  },
  backendMutation: "none",
};
const result = validateFrontendBridgeState(state, {
  runId,
  runAttempt,
  controlSha: process.env.CONTROL_SHA,
  candidateSha,
});
if (!result.valid) throw new Error(`G12_FRONTEND_BRIDGE_STATE_REFUSED:${result.violations.join(",")}`);
const target = resolve(output);
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(state, null, 2)}\n`, { flag: "wx", mode: 0o600 });
console.log(JSON.stringify({ event: state.event, candidateSha, backendMutation: "none" }));
