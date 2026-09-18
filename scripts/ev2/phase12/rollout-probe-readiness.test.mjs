import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const expectedSha = "a".repeat(40);
const sensitiveBody = "private readiness payload person@example.test token=do-not-record";
const sensitiveHeader = "private-readiness-header-do-not-record";
const csp = [
  "default-src 'self'",
  "object-src 'none'",
  "script-src-attr 'none'",
  "connect-src 'self' https://brasilapi.com.br https://nominatim.openstreetmap.org",
].join("; ");

function runProbe(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/ev2/phase12/rollout-probe.mjs"], {
      cwd: process.cwd(),
      env: { ...process.env, ...environment },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test("readiness failure writes and logs bounded sanitized diagnostics", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "g12-rollout-readiness-"));
  const reportPath = join(temporary, "probe.json");
  const diagnosticsPath = join(temporary, "diagnostics.json");
  const server = createServer((request, response) => {
    response.statusCode = request.url === "/contato" ? 503 : 200;
    response.setHeader("content-security-policy-report-only", csp);
    response.setHeader("x-private-readiness-token", sensitiveHeader);
    response.setHeader("x-release", expectedSha);
    response.end(sensitiveBody);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await rm(temporary, { recursive: true, force: true });
  });
  const address = server.address();
  assert.equal(typeof address, "object");

  const result = await runProbe({
    EV2_G12_ORIGIN: `http://127.0.0.1:${address.port}`,
    EV2_G12_EXPECTED_SHA: expectedSha,
    EV2_G12_ENVIRONMENT: "local",
    EV2_G12_PROBE_PROFILE: "full",
    EV2_G12_SAMPLE_COUNT: "5",
    EV2_G12_REQUEST_TIMEOUT_MS: "1000",
    EV2_G12_READINESS_ATTEMPTS: "20",
    EV2_G12_READINESS_INTERVAL_MS: "100",
    EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "5",
    EV2_G12_WARMUP_ATTEMPTS: "1",
    EV2_G12_CSP_MODE: "report-only",
    EV2_G12_REPORT_PATH: reportPath,
    EV2_G12_DIAGNOSTICS_PATH: diagnosticsPath,
    NO_PROXY: "127.0.0.1",
  });

  assert.equal(result.code, 1);
  assert.equal(result.signal, null);
  assert.match(result.stderr, /"event":"g12\.rollout\.probe\.diagnostics"/);
  assert.match(result.stderr, /G12_PROBE_NOT_READY/);
  await assert.rejects(access(reportPath), { code: "ENOENT" });

  const serialized = await readFile(diagnosticsPath, "utf8");
  const diagnostics = JSON.parse(serialized);
  assert.equal(diagnostics.event, "g12.rollout.probe.diagnostics");
  assert.equal(diagnostics.candidateSha, expectedSha);
  assert.equal(diagnostics.environment, "local");
  assert.equal(diagnostics.probeProfile, "full");
  assert.equal(diagnostics.observationCount, 120);
  assert.equal(diagnostics.capturedCount, 100);
  assert.equal(diagnostics.truncated, true);
  assert.equal(diagnostics.observations.length, 100);
  assert.ok(
    diagnostics.observations.some(
      (observation) =>
        observation.route === "/contato" &&
        observation.category === "route" &&
        observation.status === 503 &&
        observation.expectedStatus === 200 &&
        observation.bodyComplete === true,
    ),
  );
  for (const output of [serialized, result.stdout, result.stderr]) {
    assert.equal(output.includes(sensitiveBody), false);
    assert.equal(output.includes(sensitiveHeader), false);
  }
});
