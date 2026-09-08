import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const script = join(root, "scripts/ev2/phase12/cloudflare-pages.mjs");
const target = {
  deploymentId: "00000000-0000-4000-8000-000000000001",
  release: "a".repeat(40),
  createdOn: "2026-09-07T09:00:00.000Z",
  commitMessage: "prior-production-release",
};
const current = {
  deploymentId: "00000000-0000-4000-8000-000000000002",
  release: "b".repeat(40),
  createdOn: "2026-09-07T10:00:00.000Z",
  commitMessage: "g12-production-run-123456-1",
};

async function runRollback({ observed = current, omit = null } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), "g12-pages-rollback-toctou-"));
  const preload = join(temporary, "mock-cloudflare.mjs");
  const trace = join(temporary, "trace.jsonl");
  await writeFile(
    preload,
    `
import { appendFileSync } from "node:fs";
const target = JSON.parse(process.env.MOCK_TARGET);
const current = JSON.parse(process.env.MOCK_CURRENT);
const trace = process.env.MOCK_TRACE;
const deployment = (identity) => ({
  id: identity.deploymentId,
  environment: "production",
  created_on: identity.createdOn,
  url: "https://" + identity.deploymentId + ".pages.dev",
  deployment_trigger: { metadata: {
    commit_hash: identity.release,
    commit_message: identity.commitMessage,
  } },
});
globalThis.fetch = async (url, init = {}) => {
  const method = init.method || "GET";
  appendFileSync(trace, JSON.stringify({ method, url: String(url) }) + "\\n");
  let result;
  if (method === "POST" && String(url).endsWith("/deployments/" + target.deploymentId + "/rollback")) {
    result = { id: target.deploymentId };
  } else if (String(url).endsWith("/deployments/" + target.deploymentId)) {
    result = deployment(target);
  } else if (String(url).endsWith("/pages/projects/gaiatec-website")) {
    result = {
      name: "gaiatec-website",
      production_branch: "main",
      canonical_deployment: deployment(current),
    };
  } else {
    throw new Error("UNEXPECTED_CLOUDFLARE_REQUEST:" + url);
  }
  return { ok: true, status: 200, json: async () => ({ success: true, result }) };
};
`,
    "utf8",
  );
  const env = {
    ...process.env,
    CLOUDFLARE_ACCOUNT_ID: "test-account",
    CLOUDFLARE_API_TOKEN: "test-token",
    CLOUDFLARE_PAGES_PROJECT: "gaiatec-website",
    CLOUDFLARE_DEPLOYMENT_ID: target.deploymentId,
    CLOUDFLARE_EXPECTED_RELEASE: target.release,
    CLOUDFLARE_EXPECTED_CURRENT_DEPLOYMENT_ID: current.deploymentId,
    CLOUDFLARE_EXPECTED_CURRENT_RELEASE: current.release,
    CLOUDFLARE_EXPECTED_CURRENT_CREATED_ON: current.createdOn,
    CLOUDFLARE_EXPECTED_CURRENT_COMMIT_MESSAGE: current.commitMessage,
    MOCK_TARGET: JSON.stringify(target),
    MOCK_CURRENT: JSON.stringify(observed),
    MOCK_TRACE: trace,
  };
  if (omit) delete env[omit];
  try {
    const result = await execFileAsync(
      process.execPath,
      ["--import", pathToFileURL(preload).href, script, "rollback"],
      {
        cwd: root,
        env,
      },
    );
    const requests = (await readFile(trace, "utf8"))
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return { ...result, requests };
  } catch (error) {
    const requests = await readFile(trace, "utf8")
      .then((value) =>
        value
          .trim()
          .split("\n")
          .filter(Boolean)
          .map((line) => JSON.parse(line)),
      )
      .catch(() => []);
    return { error, requests };
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

test("rollback compares the complete canonical identity in the read adjacent to POST", async () => {
  const result = await runRollback();
  assert.equal(result.error, undefined, result.error?.stderr);
  assert.equal(result.requests.at(-2)?.method, "GET");
  assert.match(result.requests.at(-2)?.url ?? "", /pages\/projects\/gaiatec-website$/);
  assert.equal(result.requests.at(-1)?.method, "POST");
  assert.match(result.requests.at(-1)?.url ?? "", /\/deployments\/.+\/rollback$/);
});

test("rollback fails closed if any canonical identity field changed after caller observation", async () => {
  for (const observed of [
    { ...current, deploymentId: "00000000-0000-4000-8000-000000000099" },
    { ...current, release: "c".repeat(40) },
    { ...current, createdOn: "2026-09-07T10:00:01.000Z" },
    { ...current, commitMessage: "concurrent-production-release" },
  ]) {
    const result = await runRollback({ observed });
    assert.match(result.error?.stderr ?? "", /G12_ROLLBACK_CANONICAL_CHANGED/);
    assert.equal(
      result.requests.some((request) => request.method === "POST"),
      false,
    );
  }
});

test("rollback requires every expected-current identity field before any request", async () => {
  for (const name of [
    "CLOUDFLARE_EXPECTED_CURRENT_DEPLOYMENT_ID",
    "CLOUDFLARE_EXPECTED_CURRENT_RELEASE",
    "CLOUDFLARE_EXPECTED_CURRENT_CREATED_ON",
    "CLOUDFLARE_EXPECTED_CURRENT_COMMIT_MESSAGE",
  ]) {
    const result = await runRollback({ omit: name });
    assert.match(result.error?.stderr ?? "", /G12_ROLLBACK_EXPECTED_CURRENT_REQUIRED/);
    assert.deepEqual(result.requests, []);
  }
});

test("every production rollback workflow call passes all expected-current fields", async () => {
  for (const path of [
    ".github/workflows/rollback-production.yml",
    ".github/workflows/rollback-production-watchdog.yml",
  ]) {
    const workflow = await readFile(join(root, path), "utf8");
    const rollbackCalls = workflow.match(/cloudflare-pages\.mjs rollback/g) ?? [];
    assert.ok(rollbackCalls.length > 0, `${path} must contain rollback calls`);
    for (const name of [
      "CLOUDFLARE_EXPECTED_CURRENT_DEPLOYMENT_ID",
      "CLOUDFLARE_EXPECTED_CURRENT_RELEASE",
      "CLOUDFLARE_EXPECTED_CURRENT_CREATED_ON",
      "CLOUDFLARE_EXPECTED_CURRENT_COMMIT_MESSAGE",
    ])
      assert.equal(
        workflow.match(new RegExp(name, "g"))?.length ?? 0,
        rollbackCalls.length,
        `${path} must bind ${name} once for every rollback call`,
      );
  }
});
