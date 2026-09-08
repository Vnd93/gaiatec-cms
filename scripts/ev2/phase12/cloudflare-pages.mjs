import { appendFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import {
  decodeDeploymentCommitMessage,
  encodeDeploymentCommitMessage,
  isDeploymentCommitMessage,
} from "./deployment-commit-message.mjs";
import { UUID_PATTERN, isFullSha } from "./release-guard-lib.mjs";
import {
  bindProductionPagesOwnedDeployment,
  productionPagesRecoveryDecision,
  sameProductionPagesDeployment,
} from "./production-pages-recovery-lib.mjs";

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
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("G12_CLOUDFLARE_API_FAILED:transport");
  }
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

async function productionProjectDetails() {
  const projectDetails = await cloudflare("");
  if (projectDetails?.name !== project || projectDetails?.production_branch !== "main")
    throw new Error("G12_PRODUCTION_PAGES_PROJECT_CONFIG_REFUSED");
  return projectDetails;
}

function productionDeploymentIdentity(deployment) {
  const release = fullRelease(deployment?.deployment_trigger?.metadata?.commit_hash);
  if (
    !UUID_PATTERN.test(deployment?.id ?? "") ||
    deployment?.environment !== "production" ||
    !isFullSha(release) ||
    !Number.isFinite(Date.parse(deployment?.created_on ?? "")) ||
    !isDeploymentCommitMessage(String(deployment?.deployment_trigger?.metadata?.commit_message ?? ""))
  )
    throw new Error("G12_PRODUCTION_PAGES_CANONICAL_REFUSED");
  return {
    deploymentId: deployment.id,
    release,
    commitMessage: String(deployment?.deployment_trigger?.metadata?.commit_message ?? ""),
    createdOn: new Date(deployment.created_on).toISOString(),
    url: deployment.url,
  };
}

async function canonicalProductionDeployment() {
  const projectDetails = await productionProjectDetails();
  return productionDeploymentIdentity(projectDetails.canonical_deployment);
}

function expectedCurrentProductionDeployment() {
  const names = [
    "CLOUDFLARE_EXPECTED_CURRENT_DEPLOYMENT_ID",
    "CLOUDFLARE_EXPECTED_CURRENT_RELEASE",
    "CLOUDFLARE_EXPECTED_CURRENT_CREATED_ON",
    "CLOUDFLARE_EXPECTED_CURRENT_COMMIT_MESSAGE_B64",
  ];
  if (names.some((name) => !Object.hasOwn(process.env, name)))
    throw new Error("G12_ROLLBACK_EXPECTED_CURRENT_REQUIRED");
  const expected = {
    deploymentId: process.env.CLOUDFLARE_EXPECTED_CURRENT_DEPLOYMENT_ID ?? "",
    release: process.env.CLOUDFLARE_EXPECTED_CURRENT_RELEASE ?? "",
    createdOn: process.env.CLOUDFLARE_EXPECTED_CURRENT_CREATED_ON ?? "",
    commitMessage: decodeDeploymentCommitMessage(
      process.env.CLOUDFLARE_EXPECTED_CURRENT_COMMIT_MESSAGE_B64 ?? "",
    ),
  };
  if (!sameProductionPagesDeployment(expected, expected))
    throw new Error("G12_ROLLBACK_EXPECTED_CURRENT_INVALID");
  return expected;
}

async function productionDeployments() {
  const deployments = (
    await Promise.all([
      cloudflare("/deployments?env=production&per_page=25&page=1"),
      cloudflare("/deployments?env=production&per_page=25&page=2"),
    ])
  ).flatMap((page) => (Array.isArray(page) ? page : []));
  return deployments.map((deployment) => ({
    deploymentId: deployment?.id,
    release: fullRelease(deployment?.deployment_trigger?.metadata?.commit_hash),
    commitMessage: String(deployment?.deployment_trigger?.metadata?.commit_message ?? ""),
    createdOn: deployment?.created_on,
  }));
}

function recoveryState() {
  if (!Object.hasOwn(process.env, "CLOUDFLARE_BASELINE_COMMIT_MESSAGE_B64"))
    throw new Error("G12_PRODUCTION_PAGES_STATE_REFUSED:baseline_commit_message_missing");
  return {
    baseline: {
      deploymentId: process.env.CLOUDFLARE_BASELINE_DEPLOYMENT_ID ?? "",
      release: process.env.CLOUDFLARE_BASELINE_RELEASE ?? "",
      createdOn: process.env.CLOUDFLARE_BASELINE_CREATED_ON ?? "",
      commitMessage: decodeDeploymentCommitMessage(process.env.CLOUDFLARE_BASELINE_COMMIT_MESSAGE_B64 ?? ""),
    },
    owned: {
      deploymentId: process.env.CLOUDFLARE_OWNED_DEPLOYMENT_ID ?? "",
      release: process.env.CLOUDFLARE_OWNED_RELEASE ?? "",
      runMarker: process.env.CLOUDFLARE_OWNED_RUN_MARKER ?? "",
      createdOn: process.env.CLOUDFLARE_OWNED_CREATED_ON ?? "",
    },
  };
}

async function emitRecovery(current, action) {
  await setOutputs({
    action,
    deployment_id: current.deploymentId,
    release: current.release,
  });
  console.log(
    JSON.stringify({
      event: "g12.production.pages.recovery_decision",
      action,
      deploymentId: current.deploymentId,
      release: current.release,
    }),
  );
}

if (command === "latest-production") {
  const deployment = await canonicalProductionDeployment();
  await setOutputs({
    deployment_id: deployment.deploymentId,
    release: deployment.release,
    created_on: deployment.createdOn,
    commit_message_b64: encodeDeploymentCommitMessage(deployment.commitMessage),
    url: deployment.url,
  });
  console.log(
    JSON.stringify({
      event: "g12.production.baseline.captured",
      deploymentId: deployment.deploymentId,
      release: deployment.release,
    }),
  );
} else if (command === "rollback") {
  const deploymentId = process.env.CLOUDFLARE_DEPLOYMENT_ID ?? "";
  const expectedRelease = process.env.CLOUDFLARE_EXPECTED_RELEASE ?? "";
  if (!UUID_PATTERN.test(deploymentId) || !isFullSha(expectedRelease))
    throw new Error("G12_ROLLBACK_TARGET_INVALID: immutable deployment id and full SHA are required.");
  const expectedCurrent = expectedCurrentProductionDeployment();
  await productionProjectDetails();
  const target = await cloudflare(`/deployments/${deploymentId}`);
  const targetRelease = fullRelease(target?.deployment_trigger?.metadata?.commit_hash);
  if (target?.environment !== "production" || targetRelease !== expectedRelease)
    throw new Error("G12_ROLLBACK_TARGET_REFUSED: target is not the approved production deployment.");

  // Compare all immutable canonical fields in the last read immediately before
  // the mutating request. A caller-side observation alone leaves a TOCTOU gap.
  const current = await canonicalProductionDeployment();
  if (!sameProductionPagesDeployment(current, expectedCurrent))
    throw new Error("G12_ROLLBACK_CANONICAL_CHANGED: refusing to overwrite concurrent production.");
  const result = await cloudflare(`/deployments/${deploymentId}/rollback`, { method: "POST", body: "{}" });
  await setOutputs({ rollback_deployment_id: result?.id ?? deploymentId, restored_release: targetRelease });
  console.log(
    JSON.stringify({
      event: "g12.production.rollback.requested",
      targetDeploymentId: deploymentId,
      release: targetRelease,
    }),
  );
} else if (command === "reconcile") {
  let state = recoveryState();
  let current = await canonicalProductionDeployment();
  let action = productionPagesRecoveryDecision(current, state);
  if (action === "external-conflict") {
    await emitRecovery(current, action);
    throw new Error("G12_PRODUCTION_PAGES_EXTERNAL_DEPLOYMENT_PRESERVED");
  }
  if (action === "already-baseline") {
    await emitRecovery(current, action);
  } else {
    if (!state.owned.deploymentId) {
      try {
        state = bindProductionPagesOwnedDeployment(current, await productionDeployments(), state);
      } catch {
        await emitRecovery(current, "external-conflict");
        throw new Error("G12_PRODUCTION_PAGES_EXTERNAL_DEPLOYMENT_PRESERVED");
      }
    }
    const target = await cloudflare(`/deployments/${state.baseline.deploymentId}`);
    const targetIdentity = productionDeploymentIdentity(target);
    if (!sameProductionPagesDeployment(targetIdentity, state.baseline))
      throw new Error("G12_PRODUCTION_PAGES_BASELINE_REFUSED");

    // The second read is the compare immediately adjacent to the only mutating request.
    current = await canonicalProductionDeployment();
    action = productionPagesRecoveryDecision(current, state);
    if (action === "external-conflict") {
      await emitRecovery(current, action);
      throw new Error("G12_PRODUCTION_PAGES_EXTERNAL_DEPLOYMENT_PRESERVED");
    }
    if (action === "already-baseline") {
      await emitRecovery(current, action);
    } else {
      await cloudflare(`/deployments/${state.baseline.deploymentId}/rollback`, {
        method: "POST",
        body: "{}",
      });

      let terminal = null;
      for (let attempt = 1; attempt <= 6; attempt += 1) {
        terminal = await canonicalProductionDeployment();
        const terminalAction = productionPagesRecoveryDecision(terminal, state);
        if (terminalAction === "already-baseline") break;
        if (terminalAction === "external-conflict") {
          await emitRecovery(terminal, terminalAction);
          throw new Error("G12_PRODUCTION_PAGES_EXTERNAL_DEPLOYMENT_PRESERVED");
        }
        if (attempt < 6) await new Promise((done) => setTimeout(done, attempt * 1_000));
      }
      if (!sameProductionPagesDeployment(terminal, state.baseline))
        throw new Error("G12_PRODUCTION_PAGES_RECOVERY_NOT_CANONICAL");
      await emitRecovery(terminal, "restore-owned-candidate");
    }
  }
} else {
  throw new Error("G12_CLOUDFLARE_COMMAND_INVALID: use latest-production, rollback or reconcile.");
}
