import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { UUID_PATTERN, isFullSha } from "./release-guard-lib.mjs";

const command = process.argv[2];
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const token = process.env.CLOUDFLARE_API_TOKEN ?? "";
const project = process.env.CLOUDFLARE_PAGES_PROJECT ?? "";
if (!accountId || !token || project !== "gaiatec-website")
  throw new Error(
    "G12_CLOUDFLARE_CONTEXT_REFUSED: production account credentials and exact project are required.",
  );

const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`;
async function cloudflare(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true)
    throw new Error(`G12_CLOUDFLARE_API_FAILED:${response.status}`);
  return payload.result;
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

function fullRelease(value) {
  if (isFullSha(value)) return value;
  if (!/^[a-f0-9]{7,39}$/.test(value ?? "")) return null;
  const resolved = spawnSync("git", ["rev-parse", "--verify", `${value}^{commit}`], {
    encoding: "utf8",
  });
  const candidate = resolved.status === 0 ? resolved.stdout.trim() : "";
  return isFullSha(candidate) ? candidate : null;
}

if (command === "latest-production") {
  const projectDetails = await cloudflare("");
  const deployment = projectDetails?.canonical_deployment;
  const release = fullRelease(deployment?.deployment_trigger?.metadata?.commit_hash);
  if (!UUID_PATTERN.test(deployment?.id ?? "") || !isFullSha(release))
    throw new Error("G12_ROLLBACK_BASELINE_INVALID: canonical production deployment is not immutable.");
  await setOutputs({ deployment_id: deployment.id, release, url: deployment.url });
  console.log(
    JSON.stringify({ event: "g12.production.baseline.captured", deploymentId: deployment.id, release }),
  );
} else if (command === "rollback") {
  const deploymentId = process.env.CLOUDFLARE_DEPLOYMENT_ID ?? "";
  const expectedRelease = process.env.CLOUDFLARE_EXPECTED_RELEASE ?? "";
  if (!UUID_PATTERN.test(deploymentId) || !isFullSha(expectedRelease))
    throw new Error("G12_ROLLBACK_TARGET_INVALID: immutable deployment id and full SHA are required.");
  const target = await cloudflare(`/deployments/${deploymentId}`);
  const targetRelease = fullRelease(target?.deployment_trigger?.metadata?.commit_hash);
  if (target?.environment !== "production" || targetRelease !== expectedRelease)
    throw new Error("G12_ROLLBACK_TARGET_REFUSED: target is not the approved production deployment.");
  const result = await cloudflare(`/deployments/${deploymentId}/rollback`, { method: "POST", body: "{}" });
  await setOutputs({ rollback_deployment_id: result?.id ?? deploymentId, restored_release: targetRelease });
  console.log(
    JSON.stringify({
      event: "g12.production.rollback.requested",
      targetDeploymentId: deploymentId,
      release: targetRelease,
    }),
  );
} else {
  throw new Error("G12_CLOUDFLARE_COMMAND_INVALID: use latest-production or rollback.");
}
