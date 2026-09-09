import { spawnSync } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodeDeploymentCommitMessage,
  encodeDeploymentCommitMessage,
  isDeploymentCommitMessage,
} from "./deployment-commit-message.mjs";
import { isFullSha } from "./release-guard-lib.mjs";
import { verifyProductionDistSeal } from "./production-dist-seal-lib.mjs";

const STAGING_PROJECT = "gaiatec-cms-staging";
const STAGING_BRANCH = "ev2-g17-canary";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RUN_MARKER_PATTERN = /^g12-staging-(?:run|rollback|bridge-run)-[1-9]\d*-[1-9]\d*$/;
const COMPENSATION_MARKER_PATTERN = /^g12-staging-(?:deploy|rollback|bridge)-compensation-[1-9]\d*-[1-9]\d*$/;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function requiredContext() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
  const project = process.env.CLOUDFLARE_PAGES_PROJECT ?? "";
  const branch = process.env.CLOUDFLARE_PAGES_BRANCH ?? "";
  if (!accountId || !token || project !== STAGING_PROJECT || branch !== STAGING_BRANCH)
    throw new Error("G12_STAGING_PAGES_CONTEXT_REFUSED");
  return { accountId, token, project, branch };
}

function resolveRelease(value) {
  if (isFullSha(value)) return value;
  if (!/^[a-f0-9]{7,39}$/.test(value ?? "")) return null;
  const result = spawnSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30_000,
  });
  const release = result.status === 0 ? result.stdout.trim() : "";
  return isFullSha(release) ? release : null;
}

async function requestCloudflare(context, path, init = {}) {
  let response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${context.accountId}/pages/projects/${context.project}${path}`,
      {
        ...init,
        headers: {
          Authorization: `Bearer ${context.token}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new Error("G12_STAGING_PAGES_API_UNAVAILABLE");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(`G12_STAGING_PAGES_API_REFUSED:${response.status}`);
  return payload.result;
}

export function selectCurrentStagingBranchDeployment(deployments, branch = STAGING_BRANCH) {
  const candidates = deployments
    .filter(
      (deployment) =>
        deployment?.environment === "preview" && deployment?.deployment_trigger?.metadata?.branch === branch,
    )
    .map((deployment) => ({
      deploymentId: deployment.id,
      release: resolveRelease(deployment?.deployment_trigger?.metadata?.commit_hash),
      commitMessage: String(deployment?.deployment_trigger?.metadata?.commit_message ?? ""),
      createdOn: deployment?.created_on,
      url: deployment?.url,
    }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdOn ?? "");
      const rightTime = Date.parse(right.createdOn ?? "");
      if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime))
        throw new Error("G12_STAGING_PAGES_BRANCH_DEPLOYMENT_REFUSED");
      return rightTime - leftTime;
    });
  if (!candidates.length) throw new Error("G12_STAGING_PAGES_BRANCH_DEPLOYMENT_MISSING");
  const current = candidates[0];
  if (
    !UUID_PATTERN.test(current.deploymentId ?? "") ||
    !isFullSha(current.release) ||
    !Number.isFinite(Date.parse(current.createdOn ?? "")) ||
    !isDeploymentCommitMessage(current.commitMessage)
  )
    throw new Error("G12_STAGING_PAGES_BRANCH_DEPLOYMENT_REFUSED");
  return current;
}

async function currentBranchDeployment(context) {
  const project = await requestCloudflare(context, "");
  if (project?.name !== STAGING_PROJECT || project?.production_branch !== "main")
    throw new Error("G12_STAGING_PAGES_PROJECT_CONFIG_REFUSED");
  const deployments = (
    await Promise.all([
      requestCloudflare(context, "/deployments?env=preview&per_page=25&page=1"),
      requestCloudflare(context, "/deployments?env=preview&per_page=25&page=2"),
    ])
  ).flatMap((page) => (Array.isArray(page) ? page : []));
  return selectCurrentStagingBranchDeployment(deployments, context.branch);
}

async function setOutputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    Object.entries(values)
      .map(([key, value]) => `${key}=${value}\n`)
      .join(""),
    "utf8",
  );
}

function expectedState() {
  const originalRelease = process.env.STAGING_ORIGINAL_RELEASE ?? "";
  const candidateRelease = process.env.STAGING_CANDIDATE_RELEASE ?? "";
  const runMarker = process.env.STAGING_RUN_MARKER ?? "";
  const originalDeployment = process.env.STAGING_ORIGINAL_DEPLOYMENT ?? "";
  const originalCreatedOn = process.env.STAGING_ORIGINAL_CREATED_ON ?? "";
  let originalCommitMessage;
  if (!Object.hasOwn(process.env, "STAGING_ORIGINAL_COMMIT_MESSAGE_B64"))
    throw new Error("G12_STAGING_PAGES_STATE_REFUSED");
  try {
    originalCommitMessage = decodeDeploymentCommitMessage(
      process.env.STAGING_ORIGINAL_COMMIT_MESSAGE_B64 ?? "",
    );
  } catch {
    throw new Error("G12_STAGING_PAGES_STATE_REFUSED");
  }
  const compensationMarker = process.env.STAGING_COMPENSATION_MARKER ?? "";
  if (
    !isFullSha(originalRelease) ||
    !isFullSha(candidateRelease) ||
    !RUN_MARKER_PATTERN.test(runMarker) ||
    !UUID_PATTERN.test(originalDeployment) ||
    !Number.isFinite(Date.parse(originalCreatedOn)) ||
    !isDeploymentCommitMessage(originalCommitMessage) ||
    (compensationMarker && !COMPENSATION_MARKER_PATTERN.test(compensationMarker))
  )
    throw new Error("G12_STAGING_PAGES_STATE_REFUSED");
  return {
    originalRelease,
    candidateRelease,
    runMarker,
    originalDeployment,
    originalCreatedOn: new Date(originalCreatedOn).toISOString(),
    originalCommitMessage,
    compensationMarker,
  };
}

export function sameStagingDeployment(left, right) {
  return (
    UUID_PATTERN.test(left?.deploymentId ?? "") &&
    UUID_PATTERN.test(right?.deploymentId ?? "") &&
    isFullSha(left?.release) &&
    isFullSha(right?.release) &&
    Number.isFinite(Date.parse(left?.createdOn ?? "")) &&
    Number.isFinite(Date.parse(right?.createdOn ?? "")) &&
    isDeploymentCommitMessage(left?.commitMessage) &&
    isDeploymentCommitMessage(right?.commitMessage) &&
    left.deploymentId === right.deploymentId &&
    left.release === right.release &&
    new Date(left.createdOn).toISOString() === new Date(right.createdOn).toISOString() &&
    left.commitMessage === right.commitMessage
  );
}

export function stagingReconcileDecision(current, state) {
  const original = {
    deploymentId: state.originalDeployment,
    release: state.originalRelease,
    createdOn: state.originalCreatedOn,
    commitMessage: state.originalCommitMessage,
  };
  if (
    sameStagingDeployment(current, original) ||
    (current.release === state.originalRelease &&
      state.compensationMarker &&
      current.commitMessage === state.compensationMarker &&
      UUID_PATTERN.test(current.deploymentId ?? "") &&
      Number.isFinite(Date.parse(current.createdOn ?? "")))
  )
    return "already-original";
  if (
    current.release === state.candidateRelease &&
    current.commitMessage === state.runMarker &&
    UUID_PATTERN.test(current.deploymentId ?? "") &&
    Number.isFinite(Date.parse(current.createdOn ?? ""))
  )
    return "restore-original";
  return "external-conflict";
}

async function emitCurrent(current, extra = {}) {
  await setOutputs({
    deployment_id: current.deploymentId,
    release: current.release,
    created_on: new Date(current.createdOn).toISOString(),
    commit_message_b64: encodeDeploymentCommitMessage(current.commitMessage),
    ...extra,
  });
}

async function verifySealedBaseline(distPath, sealPath, expectedRelease) {
  const seal = JSON.parse(await readFile(sealPath, "utf8"));
  const verification = await verifyProductionDistSeal(distPath, seal, expectedRelease);
  if (!verification.valid)
    throw new Error(`G12_STAGING_BASELINE_SEAL_REFUSED:${verification.violations.join(",")}`);
  return seal;
}

async function deployOriginal(context, state, expectedCurrent) {
  const distPath = resolve(argument("dist"));
  const sealPath = resolve(argument("seal"));
  if (!argument("dist") || !argument("seal")) throw new Error("G12_STAGING_COMPENSATION_ARTIFACT_REQUIRED");
  await verifySealedBaseline(distPath, sealPath, state.originalRelease);
  const wranglerScript = resolve(argument("wrangler-script") || "node_modules/wrangler/bin/wrangler.js");
  const compensationMarker =
    state.compensationMarker ||
    `g12-staging-deploy-compensation-${process.env.GITHUB_RUN_ID ?? "0"}-${
      process.env.GITHUB_RUN_ATTEMPT ?? "0"
    }`;
  if (!COMPENSATION_MARKER_PATTERN.test(compensationMarker ?? ""))
    throw new Error("G12_STAGING_COMPENSATION_MARKER_REQUIRED");
  // This is the compare immediately adjacent to the only mutating process.
  const adjacent = await currentBranchDeployment(context);
  if (
    !sameStagingDeployment(adjacent, expectedCurrent) ||
    stagingReconcileDecision(adjacent, state) !== "restore-original"
  )
    throw new Error("G12_STAGING_COMPENSATION_EXTERNAL_CONFLICT");
  const result = spawnSync(
    process.execPath,
    [
      wranglerScript,
      "pages",
      "deploy",
      distPath,
      "--project-name",
      context.project,
      "--branch",
      context.branch,
      "--commit-hash",
      state.originalRelease,
      "--commit-message",
      compensationMarker,
      "--commit-dirty=false",
    ],
    {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10 * 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const after = await currentBranchDeployment(context);
  if (after.release === state.originalRelease && after.commitMessage === compensationMarker) return after;
  if (!sameStagingDeployment(after, adjacent)) throw new Error("G12_STAGING_COMPENSATION_EXTERNAL_CONFLICT");
  if (result.error || result.status !== 0) throw new Error("G12_STAGING_COMPENSATION_AMBIGUOUS");
  throw new Error("G12_STAGING_COMPENSATION_NOT_CANONICAL");
}

export async function main(command = process.argv[2]) {
  const context = requiredContext();
  const current = await currentBranchDeployment(context);
  if (command === "capture" || command === "capture-current") {
    const expectedRelease = process.env.STAGING_EXPECTED_RELEASE ?? "";
    if (command === "capture" && (!isFullSha(expectedRelease) || current.release !== expectedRelease))
      throw new Error("G12_STAGING_BASELINE_MISMATCH");
    await emitCurrent(current);
    console.log(JSON.stringify({ event: "g12.staging.pages.baseline_captured", release: current.release }));
    return;
  }

  const state = expectedState();
  if (command === "assert-owned") {
    if (stagingReconcileDecision(current, state) !== "restore-original")
      throw new Error("G12_STAGING_OWNED_DEPLOYMENT_NOT_CANONICAL");
    await emitCurrent(current, { action: "owned-candidate" });
    console.log(JSON.stringify({ event: "g12.staging.pages.owned_candidate", release: current.release }));
    return;
  }
  if (command === "assert-original") {
    if (stagingReconcileDecision(current, state) !== "already-original")
      throw new Error("G12_STAGING_ORIGINAL_DEPLOYMENT_NOT_CANONICAL");
    await emitCurrent(current, { action: "original" });
    console.log(JSON.stringify({ event: "g12.staging.pages.original", release: current.release }));
    return;
  }
  if (command === "decide") {
    const action = stagingReconcileDecision(current, state);
    await emitCurrent(current, { action });
    if (action === "external-conflict") throw new Error("G12_STAGING_EXTERNAL_DEPLOYMENT_PRESERVED");
    console.log(JSON.stringify({ event: "g12.staging.pages.reconcile_decision", action }));
    return;
  }
  if (command === "compensate") {
    const action = stagingReconcileDecision(current, state);
    if (action === "external-conflict") throw new Error("G12_STAGING_EXTERNAL_DEPLOYMENT_PRESERVED");
    const result = action === "already-original" ? current : await deployOriginal(context, state, current);
    await emitCurrent(result, { action: action === "already-original" ? action : "restored-original" });
    console.log(JSON.stringify({ event: "g12.staging.pages.compensated", action, release: result.release }));
    return;
  }
  throw new Error("G12_STAGING_PAGES_COMMAND_INVALID");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
