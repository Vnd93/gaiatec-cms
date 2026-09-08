import { spawnSync } from "node:child_process";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  copyStableProductionDistArchive,
  lockProductionDistTree,
  materializeProductionDistArchive,
  unlockProductionDistTree,
  verifyProductionDistSeal,
} from "./production-dist-seal-lib.mjs";
import { isFullSha, UUID_PATTERN } from "./release-guard-lib.mjs";
import { sameStagingDeployment } from "./staging-pages-state.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const archive = resolve(argument("archive"));
const sealFile = resolve(argument("seal"));
const candidateSha = argument("candidate");
const branch = argument("branch");
const commitMessage = argument("commit-message");
const wranglerScript = resolve(argument("wrangler-script"));
const project = process.env.CLOUDFLARE_PAGES_PROJECT ?? "";
const expectedCanonical = {
  deploymentId: process.env.STAGING_ORIGINAL_DEPLOYMENT ?? "",
  release: process.env.STAGING_ORIGINAL_RELEASE ?? "",
  createdOn: process.env.STAGING_ORIGINAL_CREATED_ON ?? "",
  commitMessage: process.env.STAGING_ORIGINAL_COMMIT_MESSAGE ?? "",
};
if (
  !argument("archive") ||
  !argument("seal") ||
  !/^[a-f0-9]{40}$/.test(candidateSha) ||
  !["ev2-g17-canary", "ev2-g12-rollback-compat", "ev2-g12-canary"].includes(branch) ||
  !/^g12-staging-(?:run-[1-9]\d*-[1-9]\d*|bridge-(?:preview-)?run-[1-9]\d*-[1-9]\d*|rollback-[1-9]\d*-[1-9]\d*|(?:rollback|deploy|bridge)-compensation-[1-9]\d*-[1-9]\d*)$/.test(
    commitMessage,
  ) ||
  project !== "gaiatec-cms-staging" ||
  !process.env.CLOUDFLARE_API_TOKEN ||
  !process.env.CLOUDFLARE_ACCOUNT_ID ||
  !argument("wrangler-script") ||
  (branch === "ev2-g17-canary" &&
    (!UUID_PATTERN.test(expectedCanonical.deploymentId) ||
      !isFullSha(expectedCanonical.release) ||
      !Number.isFinite(Date.parse(expectedCanonical.createdOn)) ||
      /[\r\n\0]/.test(expectedCanonical.commitMessage)))
)
  throw new Error("G12_STAGING_SEALED_DEPLOY_INPUT_REFUSED");

const cloudflareBaseUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${project}`;

async function cloudflare(path = "") {
  let response;
  try {
    response = await fetch(`${cloudflareBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("G12_STAGING_SEALED_DEPLOY_API_UNAVAILABLE");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(`G12_STAGING_SEALED_DEPLOY_API_REFUSED:${response.status}`);
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

function deploymentIdentity(deployment) {
  const identity = {
    deploymentId: deployment?.id,
    release: fullRelease(deployment?.deployment_trigger?.metadata?.commit_hash),
    createdOn: Number.isFinite(Date.parse(deployment?.created_on ?? ""))
      ? new Date(deployment.created_on).toISOString()
      : "",
    commitMessage: String(deployment?.deployment_trigger?.metadata?.commit_message ?? ""),
    url: deployment?.url,
  };
  if (
    deployment?.environment !== "preview" ||
    deployment?.deployment_trigger?.metadata?.branch !== branch ||
    !UUID_PATTERN.test(identity.deploymentId ?? "") ||
    !isFullSha(identity.release) ||
    !identity.createdOn ||
    /[\r\n\0]/.test(identity.commitMessage)
  )
    throw new Error("G12_STAGING_SEALED_DEPLOY_IDENTITY_REFUSED");
  return identity;
}

async function projectDetails() {
  const details = await cloudflare();
  if (details?.name !== project || details?.production_branch !== "main")
    throw new Error("G12_STAGING_SEALED_DEPLOY_PROJECT_CONFIG_REFUSED");
  return details;
}

async function currentBranchDeployment() {
  await projectDetails();
  const deployments = await cloudflare("/deployments?env=preview&per_page=50");
  const matches = (Array.isArray(deployments) ? deployments : [])
    .filter((deployment) => deployment?.deployment_trigger?.metadata?.branch === branch)
    .map(deploymentIdentity)
    .sort((left, right) => Date.parse(right.createdOn) - Date.parse(left.createdOn));
  if (!matches.length) throw new Error("G12_STAGING_SEALED_DEPLOY_CANONICAL_MISSING");
  return matches[0];
}

const seal = JSON.parse(await readFile(sealFile, "utf8"));
const temporaryRoot = await mkdtemp(join(tmpdir(), "g12-staging-dist-deploy-"));
const deploymentDirectory = join(temporaryRoot, "dist");
const privateArchive = join(temporaryRoot, basename(archive));
try {
  await copyStableProductionDistArchive(archive, privateArchive);
  await materializeProductionDistArchive(privateArchive, seal, candidateSha, deploymentDirectory);
  await lockProductionDistTree(deploymentDirectory);
  // This is the compare immediately adjacent to the only mutating process.
  const before = await currentBranchDeployment();
  if (branch === "ev2-g17-canary" && !sameStagingDeployment(before, expectedCanonical))
    throw new Error("G12_STAGING_SEALED_DEPLOY_CANONICAL_CAS_REFUSED");
  const result = spawnSync(
    process.execPath,
    [
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
      "--commit-message",
      commitMessage,
      "--commit-dirty=false",
    ],
    {
      encoding: "utf8",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 15 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0) throw new Error("G12_STAGING_SEALED_DEPLOY_FAILED");
  const sourceAfter = await verifyProductionDistSeal(deploymentDirectory, seal, candidateSha);
  if (!sourceAfter.valid)
    throw new Error(`G12_STAGING_SEALED_DEPLOY_SOURCE_CHANGED:${sourceAfter.violations.join(",")}`);
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const deploymentUrl = output.match(/https:\/\/[a-z0-9.-]+\.pages\.dev\b/i)?.[0];
  if (!deploymentUrl) throw new Error("G12_STAGING_SEALED_DEPLOY_URL_MISSING");
  const after = await currentBranchDeployment();
  if (
    after.release !== candidateSha ||
    after.commitMessage !== commitMessage ||
    normalizedUrl(after.url) !== normalizedUrl(deploymentUrl)
  )
    throw new Error("G12_STAGING_SEALED_DEPLOY_NOT_CANONICAL");
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      [
        `deployment-url=${deploymentUrl}`,
        `deployment-id=${after.deploymentId}`,
        `deployment-release=${after.release}`,
        `deployment-created-on=${after.createdOn}`,
        `deployment-marker=${after.commitMessage}`,
        "deployment-environment=preview",
        "",
      ].join("\n"),
      "utf8",
    );
  console.log(
    JSON.stringify({
      schemaVersion: 1,
      event: "g12.staging.pages.sealed_deploy",
      candidateSha,
      branch,
      deploymentUrl,
      deploymentId: after.deploymentId,
      deploymentCreatedOn: after.createdOn,
      deploymentEnvironment: "preview",
      archiveSha256: seal.archiveSha256,
      sourceStableThroughUpload: true,
    }),
  );
} finally {
  await unlockProductionDistTree(deploymentDirectory).catch(() => undefined);
  await rm(temporaryRoot, { recursive: true, force: true });
}
