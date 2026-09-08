import { spawnSync } from "node:child_process";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  decodeDeploymentCommitMessage,
  encodeDeploymentCommitMessage,
  isDeploymentCommitMessage,
} from "./deployment-commit-message.mjs";
import { UUID_PATTERN, isFullSha } from "./release-guard-lib.mjs";

const PROJECT = "gaiatec-website";
const RUN_MARKER = /^g12-production-bridge-run-[1-9]\d*-[1-9]\d*$/;
const COMPENSATION_MARKER = /^g12-production-bridge-compensation-[1-9]\d*-[1-9]\d*$/;

function requiredContext() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
  const project = process.env.CLOUDFLARE_PAGES_PROJECT ?? "";
  if (!accountId || !token || project !== PROJECT)
    throw new Error("G12_PRODUCTION_BRIDGE_PAGES_CONTEXT_REFUSED");
  return { accountId, token, project };
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

async function cloudflare(context, path = "") {
  let response;
  try {
    response = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${context.accountId}/pages/projects/${context.project}${path}`,
      {
        headers: { Authorization: `Bearer ${context.token}`, "Content-Type": "application/json" },
        signal: AbortSignal.timeout(30_000),
      },
    );
  } catch {
    throw new Error("G12_PRODUCTION_BRIDGE_PAGES_API_UNAVAILABLE");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(`G12_PRODUCTION_BRIDGE_PAGES_API_REFUSED:${response.status}`);
  return payload.result;
}

function deploymentIdentity(deployment) {
  const release = resolveRelease(deployment?.deployment_trigger?.metadata?.commit_hash);
  const commitMessage = String(deployment?.deployment_trigger?.metadata?.commit_message ?? "");
  if (
    !UUID_PATTERN.test(deployment?.id ?? "") ||
    deployment?.environment !== "production" ||
    !isFullSha(release) ||
    !Number.isFinite(Date.parse(deployment?.created_on ?? "")) ||
    !isDeploymentCommitMessage(commitMessage)
  )
    throw new Error("G12_PRODUCTION_BRIDGE_CANONICAL_REFUSED");
  return {
    deploymentId: deployment.id,
    release,
    createdOn: new Date(deployment.created_on).toISOString(),
    commitMessage,
  };
}

async function canonical(context) {
  const project = await cloudflare(context);
  if (project?.name !== PROJECT || project?.production_branch !== "main")
    throw new Error("G12_PRODUCTION_BRIDGE_PROJECT_CONFIG_REFUSED");
  return deploymentIdentity(project.canonical_deployment);
}

function expectedState() {
  if (!Object.hasOwn(process.env, "PRODUCTION_BRIDGE_BASELINE_COMMIT_MESSAGE_B64"))
    throw new Error("G12_PRODUCTION_BRIDGE_PAGES_STATE_REFUSED");
  const state = {
    baseline: {
      deploymentId: process.env.PRODUCTION_BRIDGE_BASELINE_DEPLOYMENT_ID ?? "",
      release: process.env.PRODUCTION_BRIDGE_BASELINE_RELEASE ?? "",
      createdOn: process.env.PRODUCTION_BRIDGE_BASELINE_CREATED_ON ?? "",
      commitMessage: decodeDeploymentCommitMessage(
        process.env.PRODUCTION_BRIDGE_BASELINE_COMMIT_MESSAGE_B64 ?? "",
      ),
    },
    candidateRelease: process.env.PRODUCTION_BRIDGE_CANDIDATE_RELEASE ?? "",
    runMarker: process.env.PRODUCTION_BRIDGE_RUN_MARKER ?? "",
    compensationMarker: process.env.PRODUCTION_BRIDGE_COMPENSATION_MARKER ?? "",
  };
  if (
    !UUID_PATTERN.test(state.baseline.deploymentId) ||
    !isFullSha(state.baseline.release) ||
    !Number.isFinite(Date.parse(state.baseline.createdOn)) ||
    !isDeploymentCommitMessage(state.baseline.commitMessage) ||
    !isFullSha(state.candidateRelease) ||
    state.candidateRelease === state.baseline.release ||
    !RUN_MARKER.test(state.runMarker) ||
    !COMPENSATION_MARKER.test(state.compensationMarker)
  )
    throw new Error("G12_PRODUCTION_BRIDGE_PAGES_STATE_REFUSED");
  state.baseline.createdOn = new Date(state.baseline.createdOn).toISOString();
  return state;
}

function sameDeployment(left, right) {
  return (
    left.deploymentId === right.deploymentId &&
    left.release === right.release &&
    left.createdOn === right.createdOn &&
    left.commitMessage === right.commitMessage
  );
}

export function productionFrontendBridgeDecision(current, state) {
  if (sameDeployment(current, state.baseline)) return "already-predecessor";
  if (current.release === state.baseline.release && current.commitMessage === state.compensationMarker)
    return "already-restored-predecessor";
  if (current.release === state.candidateRelease && current.commitMessage === state.runMarker)
    return "restore-predecessor";
  return "external-conflict";
}

export function uniqueProductionFrontendBridgeOwnedDeployment(current, deployments, state) {
  const matches = deployments.filter(
    (entry) => entry.release === state.candidateRelease && entry.commitMessage === state.runMarker,
  );
  return matches.length === 1 && sameDeployment(matches[0], current);
}

async function assertUniqueOwnedDeployment(context, current, state) {
  const deployments = (
    await Promise.all([
      cloudflare(context, "/deployments?env=production&per_page=25&page=1"),
      cloudflare(context, "/deployments?env=production&per_page=25&page=2"),
    ])
  ).flatMap((page) => (Array.isArray(page) ? page : []));
  const matches = deployments
    .filter((entry) => entry?.environment === "production")
    .map((entry) => {
      try {
        return deploymentIdentity(entry);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  if (!uniqueProductionFrontendBridgeOwnedDeployment(current, matches, state))
    throw new Error("G12_PRODUCTION_BRIDGE_OWNERSHIP_AMBIGUOUS");
}

async function outputs(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(values)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    "utf8",
  );
}

export async function main(command = process.argv[2]) {
  const context = requiredContext();
  const state = expectedState();
  const current = await canonical(context);
  const action = productionFrontendBridgeDecision(current, state);
  if (action === "external-conflict") throw new Error("G12_PRODUCTION_BRIDGE_EXTERNAL_DEPLOYMENT_PRESERVED");
  if (action === "restore-predecessor") await assertUniqueOwnedDeployment(context, current, state);
  if (command === "assert-predecessor") {
    if (!action.startsWith("already-")) throw new Error("G12_PRODUCTION_BRIDGE_PREDECESSOR_NOT_CANONICAL");
  } else if (command !== "decide") {
    throw new Error("G12_PRODUCTION_BRIDGE_PAGES_COMMAND_INVALID");
  }
  await outputs({
    action,
    deployment_id: current.deploymentId,
    release: current.release,
    created_on: current.createdOn,
    commit_message_b64: encodeDeploymentCommitMessage(current.commitMessage),
  });
  console.log(
    JSON.stringify({
      event: "g12.production.frontend_bridge.pages_decision",
      action,
      deploymentId: current.deploymentId,
      release: current.release,
      backendMutation: "none",
    }),
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
