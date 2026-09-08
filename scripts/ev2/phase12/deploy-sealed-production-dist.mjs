import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  decodeDeploymentCommitMessage,
  encodeDeploymentCommitMessage,
  isDeploymentCommitMessage,
} from "./deployment-commit-message.mjs";
import {
  copyStableProductionDistArchive,
  lockProductionDistTree,
  materializeProductionDistArchive,
  unlockProductionDistTree,
  verifyProductionDistSeal,
} from "./production-dist-seal-lib.mjs";
import { PRODUCTION_PAGES_RUN_MARKER } from "./production-pages-recovery-lib.mjs";
import { UUID_PATTERN } from "./release-guard-lib.mjs";

const PRODUCTION_FRONTEND_BRIDGE_RUN_MARKER = /^g12-production-bridge-run-[1-9]\d*-[1-9]\d*$/;
const PRODUCTION_FRONTEND_BRIDGE_COMPENSATION_MARKER =
  /^g12-production-bridge-compensation-[1-9]\d*-[1-9]\d*$/;

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

function hasArgument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && index + 1 < process.argv.length;
}

const archive = resolve(argument("archive"));
const sealFile = resolve(argument("seal"));
const candidateSha = argument("candidate");
const branch = argument("branch");
const commitMessage = argument("commit-message");
const wranglerScript = resolve(argument("wrangler-script"));
const project = process.env.CLOUDFLARE_PAGES_PROJECT ?? "";
const expectedCanonical = {
  deploymentId: argument("expected-canonical-id"),
  release: argument("expected-canonical-release"),
  createdOn: argument("expected-canonical-created-on"),
  commitMessage: decodeDeploymentCommitMessage(argument("expected-canonical-marker-b64")),
};
const expectedCanonicalCommitMessageProvided = hasArgument("expected-canonical-marker-b64");
const expectedCanonicalProvided = Object.values(expectedCanonical).some((value) => value !== "");
if (
  !argument("archive") ||
  !argument("seal") ||
  !/^[a-f0-9]{40}$/.test(candidateSha) ||
  !["main", "ev2-g12-preflight"].includes(branch) ||
  project !== "gaiatec-website" ||
  !process.env.CLOUDFLARE_API_TOKEN ||
  !process.env.CLOUDFLARE_ACCOUNT_ID ||
  !argument("wrangler-script") ||
  (branch === "main" &&
    (!(
      PRODUCTION_PAGES_RUN_MARKER.test(commitMessage) ||
      PRODUCTION_FRONTEND_BRIDGE_RUN_MARKER.test(commitMessage) ||
      PRODUCTION_FRONTEND_BRIDGE_COMPENSATION_MARKER.test(commitMessage)
    ) ||
      !UUID_PATTERN.test(expectedCanonical.deploymentId) ||
      !/^[a-f0-9]{40}$/.test(expectedCanonical.release) ||
      !Number.isFinite(Date.parse(expectedCanonical.createdOn)) ||
      !expectedCanonicalCommitMessageProvided ||
      !isDeploymentCommitMessage(expectedCanonical.commitMessage))) ||
  (branch !== "main" && (expectedCanonicalProvided || expectedCanonicalCommitMessageProvided))
)
  throw new Error("G12_PRODUCTION_SEALED_DEPLOY_INPUT_REFUSED");

const cloudflareBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}`;

async function cloudflare(path = "") {
  let response;
  try {
    response = await fetch(`${cloudflareBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("G12_PRODUCTION_SEALED_DEPLOY_API_UNAVAILABLE");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(`G12_PRODUCTION_SEALED_DEPLOY_API_REFUSED:${response.status}`);
  return payload.result;
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

function fullRelease(value) {
  if (/^[a-f0-9]{40}$/.test(value ?? "")) return value;
  if (!/^[a-f0-9]{7,39}$/.test(value ?? "")) return null;
  const result = spawnSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 30_000,
  });
  const release = result.status === 0 ? result.stdout.trim() : "";
  return /^[a-f0-9]{40}$/.test(release) ? release : null;
}

function releaseMatchesCandidate(value) {
  return value === candidateSha;
}

function deploymentIdentity(deployment, environment) {
  const release = fullRelease(deployment?.deployment_trigger?.metadata?.commit_hash);
  const commit = String(deployment?.deployment_trigger?.metadata?.commit_message ?? "");
  if (
    !UUID_PATTERN.test(deployment?.id ?? "") ||
    deployment?.environment !== environment ||
    !/^[a-f0-9]{40}$/.test(release ?? "") ||
    !Number.isFinite(Date.parse(deployment?.created_on ?? "")) ||
    !isDeploymentCommitMessage(commit)
  )
    throw new Error("G12_PRODUCTION_SEALED_DEPLOY_IDENTITY_REFUSED");
  return {
    deploymentId: deployment.id,
    release,
    createdOn: new Date(deployment.created_on).toISOString(),
    commitMessage: commit,
    url: deployment.url,
  };
}

function exactCanonicalIdentity(left, right) {
  return (
    left.deploymentId === right.deploymentId &&
    left.release === right.release &&
    left.createdOn === new Date(right.createdOn).toISOString() &&
    left.commitMessage === right.commitMessage
  );
}

async function productionProjectDetails() {
  const details = await cloudflare();
  if (details?.name !== project || details?.production_branch !== "main")
    throw new Error("G12_PRODUCTION_SEALED_DEPLOY_PROJECT_CONFIG_REFUSED");
  return details;
}

function canonicalProductionIdentity(details) {
  return deploymentIdentity(details?.canonical_deployment, "production");
}

async function confirmCanonicalProduction(deploymentUrl) {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const deployment = canonicalProductionIdentity(await productionProjectDetails());
    if (
      releaseMatchesCandidate(deployment.release) &&
      deployment.commitMessage === commitMessage &&
      normalizedUrl(deployment.url) === normalizedUrl(deploymentUrl)
    )
      return { ...deployment, release: candidateSha };
    if (attempt < 6) await new Promise((done) => setTimeout(done, attempt * 1_000));
  }
  throw new Error("G12_PRODUCTION_SEALED_DEPLOY_NOT_CANONICAL");
}

async function confirmPreviewDeployment(deploymentUrl, canonicalBefore) {
  let preview = null;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const deployments = (
      await Promise.all([
        cloudflare("/deployments?env=preview&per_page=25&page=1"),
        cloudflare("/deployments?env=preview&per_page=25&page=2"),
      ])
    ).flatMap((page) => (Array.isArray(page) ? page : []));
    const matches = deployments
      .filter(
        (deployment) =>
          deployment?.deployment_trigger?.metadata?.branch === branch &&
          normalizedUrl(deployment?.url) === normalizedUrl(deploymentUrl),
      )
      .map((deployment) => deploymentIdentity(deployment, "preview"))
      .filter((deployment) => releaseMatchesCandidate(deployment.release));
    if (matches.length === 1) {
      preview = matches[0];
      break;
    }
    if (attempt < 6) await new Promise((done) => setTimeout(done, attempt * 1_000));
  }
  if (!preview) throw new Error("G12_PRODUCTION_PREFLIGHT_PREVIEW_NOT_VERIFIED");
  const canonicalAfter = canonicalProductionIdentity(await productionProjectDetails());
  if (!exactCanonicalIdentity(canonicalAfter, canonicalBefore))
    throw new Error("G12_PRODUCTION_PREFLIGHT_CHANGED_CANONICAL");
  return preview;
}

const seal = JSON.parse(await readFile(sealFile, "utf8"));
const temporaryRoot = await mkdtemp(join(tmpdir(), "g12-production-dist-deploy-"));
const deploymentDirectory = join(temporaryRoot, "dist");
const privateArchive = join(temporaryRoot, basename(archive));
try {
  await copyStableProductionDistArchive(archive, privateArchive);
  await materializeProductionDistArchive(privateArchive, seal, candidateSha, deploymentDirectory);
  await lockProductionDistTree(deploymentDirectory);
  const deployArguments = [
    wranglerScript,
    "pages",
    "deploy",
    deploymentDirectory,
    "--project-name",
    project,
    "--branch",
    branch,
    "--commit-hash",
    candidateSha,
  ];
  if (commitMessage) deployArguments.push("--commit-message", commitMessage);
  deployArguments.push("--commit-dirty=false");
  // This is the compare immediately adjacent to the only mutating process.
  const projectBefore = await productionProjectDetails();
  const canonicalBefore = canonicalProductionIdentity(projectBefore);
  if (branch === "main" && !exactCanonicalIdentity(canonicalBefore, expectedCanonical))
    throw new Error("G12_PRODUCTION_SEALED_DEPLOY_CANONICAL_CAS_REFUSED");
  const result = spawnSync(process.execPath, deployArguments, {
    encoding: "utf8",
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 15 * 60 * 1000,
  });
  if (result.error || result.status !== 0) throw new Error("G12_PRODUCTION_SEALED_DEPLOY_FAILED");
  const after = await verifyProductionDistSeal(deploymentDirectory, seal, candidateSha);
  if (!after.valid)
    throw new Error(`G12_PRODUCTION_SEALED_DEPLOY_SOURCE_CHANGED:${after.violations.join(",")}`);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const deploymentUrl = output.match(/https:\/\/[a-z0-9.-]+\.pages\.dev\b/i)?.[0];
  if (!deploymentUrl) throw new Error("G12_PRODUCTION_SEALED_DEPLOY_URL_MISSING");
  const canonical = branch === "main" ? await confirmCanonicalProduction(deploymentUrl) : null;
  const preview =
    branch === "ev2-g12-preflight" ? await confirmPreviewDeployment(deploymentUrl, canonicalBefore) : null;
  if (process.env.GITHUB_OUTPUT) {
    const outputs = [`deployment-url=${deploymentUrl}`];
    if (canonical)
      outputs.push(
        `deployment-id=${canonical.deploymentId}`,
        `deployment-release=${canonical.release}`,
        `deployment-marker-b64=${encodeDeploymentCommitMessage(commitMessage)}`,
        `deployment-created-on=${canonical.createdOn}`,
      );
    if (preview)
      outputs.push(
        `preview-deployment-id=${preview.deploymentId}`,
        `preview-deployment-created-on=${preview.createdOn}`,
        "preview-environment=preview",
        `canonical-deployment-id=${canonicalBefore.deploymentId}`,
        `canonical-release=${canonicalBefore.release}`,
        `canonical-created-on=${canonicalBefore.createdOn}`,
        `canonical-marker-b64=${encodeDeploymentCommitMessage(canonicalBefore.commitMessage)}`,
      );
    await appendFile(process.env.GITHUB_OUTPUT, `${outputs.join("\n")}\n`, "utf8");
  }
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      event: "g12.production.pages.sealed_deploy",
      candidateSha,
      branch,
      deploymentUrl,
      deploymentId: canonical?.deploymentId,
      deploymentMarker: canonical ? commitMessage : undefined,
      deploymentCreatedOn: canonical?.createdOn,
      previewEnvironment: preview ? "preview" : undefined,
      canonicalProductionUnchanged: preview ? true : undefined,
      archiveSha256: seal.archiveSha256,
      sourceStableThroughUpload: true,
    }),
  );
} finally {
  await unlockProductionDistTree(deploymentDirectory).catch(() => undefined);
  await rm(temporaryRoot, { recursive: true, force: true });
}
