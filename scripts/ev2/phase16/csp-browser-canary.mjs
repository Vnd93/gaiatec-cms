import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const origin = (process.env.CSP_CANARY_ORIGIN ?? "").replace(/\/$/, "");
const expectedSha = process.env.CSP_EXPECTED_SHA ?? "";
const reportPath = process.env.CSP_EVIDENCE_PATH;
if (
  !/^https:\/\/(?:ev2-g16-csp-canary|[a-f0-9]{8,40})\.gaiatec-cms-staging\.pages\.dev$/.test(origin) ||
  !/^[a-f0-9]{40}$/.test(expectedSha)
)
  throw new Error("CSP_CANARY_INPUT_REFUSED: isolated staging origin and full SHA are mandatory.");

const routes = ["/", "/contato", "/relatorio-de-obra/login", "/admin/login"];
const violations = [];
const results = [];
const observedPublicPolicies = new Set();
const observedAdminPolicies = new Set();
let workerPolicy = null;
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const manifestResponse = await context.request.get(`${origin}/release-manifest.json`);
  const manifest = manifestResponse.ok() ? await manifestResponse.json() : null;
  const workerCandidates = Array.isArray(manifest?.files)
    ? manifest.files
        .map((entry) => entry?.path)
        .filter((path) => /^assets\/avif-encoder\.worker-[A-Za-z0-9_-]+\.js$/.test(path))
    : [];
  const wasmCandidates = Array.isArray(manifest?.files)
    ? manifest.files
        .map((entry) => entry?.path)
        .filter((path) => /^assets\/avif_enc-[A-Za-z0-9_-]+\.wasm$/.test(path))
    : [];
  if (
    !manifestResponse.ok() ||
    manifestResponse.headers()["x-release"] !== expectedSha ||
    manifest?.release !== expectedSha
  )
    violations.push({
      path: "/release-manifest.json",
      type: "release",
      text: "The release manifest is unavailable or belongs to another candidate",
    });
  if (workerCandidates.length !== 1 || wasmCandidates.length !== 1)
    violations.push({
      path: "/release-manifest.json",
      type: "artifact",
      text: "The dedicated AVIF worker artifact is absent or ambiguous",
    });
  if (workerCandidates.length === 1) {
    const workerResponse = await context.request.get(`${origin}/${workerCandidates[0]}`);
    workerPolicy = workerResponse.headers()["content-security-policy"] ?? "";
    const workerReportOnly = workerResponse.headers()["content-security-policy-report-only"] ?? "";
    if (
      !workerResponse.ok() ||
      workerResponse.headers()["x-release"] !== expectedSha ||
      !workerPolicy.includes("default-src 'none'") ||
      !workerPolicy.includes("script-src 'self' 'wasm-unsafe-eval'") ||
      workerPolicy.includes("script-src 'self' 'unsafe-eval'") ||
      workerReportOnly
    )
      violations.push({
        path: `/${workerCandidates[0]}`,
        type: "policy",
        text: "The dedicated AVIF worker does not have its exact isolated CSP",
      });
  }
  for (const path of routes) {
    const page = await context.newPage();
    const routeViolations = [];
    let adminAvifProbe = null;
    page.on("console", (message) => {
      const text = message.text();
      if (/content security policy|violates.*script-src|refused to (?:load|execute|frame)/i.test(text))
        routeViolations.push({ type: "console", text: text.slice(0, 500) });
    });
    page.on("pageerror", (error) => routeViolations.push({ type: "pageerror", text: error.message }));
    const response = await page.goto(`${origin}${path}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });
    await page.waitForTimeout(2_000);
    const policy = response?.headers()["content-security-policy"] ?? "";
    const reportOnly = response?.headers()["content-security-policy-report-only"] ?? "";
    const release = response?.headers()["x-release"] ?? "";
    if (response?.status() !== 200)
      routeViolations.push({ type: "status", text: String(response?.status()) });
    if (release !== expectedSha) routeViolations.push({ type: "release", text: release });
    if (!policy || reportOnly)
      routeViolations.push({ type: "header", text: "CSP is not exclusively enforced" });
    if (policy.includes("https://api.resend.com"))
      routeViolations.push({ type: "policy", text: "Resend browser origin is forbidden" });
    const adminRoute = path === "/admin/login";
    if (policy.includes("wasm-unsafe-eval"))
      routeViolations.push({
        type: "policy",
        text: "A document route received the worker-only WebAssembly capability",
      });
    if (policy.includes("script-src 'self' 'unsafe-eval'"))
      routeViolations.push({ type: "policy", text: "JavaScript unsafe-eval is forbidden" });
    if (adminRoute && workerCandidates.length === 1) {
      try {
        adminAvifProbe = await page.evaluate(async (workerPath) => {
          const worker = new Worker(workerPath, { type: "module", name: "csp-avif-canary" });
          const requestId = "csp-avif-canary";
          const pixels = new Uint8Array(16).fill(255).buffer;
          const encoded = await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("AVIF_WORKER_TIMEOUT")), 15_000);
            worker.addEventListener("error", () => {
              clearTimeout(timer);
              reject(new Error("AVIF_WORKER_ERROR"));
            });
            worker.addEventListener("message", (event) => {
              if (event.data?.requestId !== requestId) return;
              clearTimeout(timer);
              if (event.data?.type !== "result" || !(event.data.result instanceof ArrayBuffer)) {
                reject(new Error("AVIF_WORKER_RESULT_INVALID"));
                return;
              }
              resolve(new Uint8Array(event.data.result));
            });
            worker.postMessage({ type: "encode", requestId, width: 2, height: 2, pixels }, [pixels]);
          });
          worker.terminate();
          return {
            bytes: encoded.length,
            brand: String.fromCharCode(...encoded.slice(4, 12)),
            crossOriginIsolated,
          };
        }, `/${workerCandidates[0]}`);
        if (adminAvifProbe.bytes < 100 || adminAvifProbe.brand !== "ftypavif")
          routeViolations.push({ type: "runtime", text: "The AVIF encoder returned an invalid file" });
        if (adminAvifProbe.crossOriginIsolated !== false)
          routeViolations.push({
            type: "runtime",
            text: "The admin isolation mode changed and the production AVIF execution path must be reassessed",
          });
      } catch (error) {
        routeViolations.push({
          type: "runtime",
          text: `The enforced admin CSP blocked AVIF generation: ${String(error).slice(0, 300)}`,
        });
      }
    }
    if (policy) (adminRoute ? observedAdminPolicies : observedPublicPolicies).add(policy);
    results.push({
      path,
      status: response?.status() ?? 0,
      release,
      cspEnforced: Boolean(policy),
      policySha256: policy ? createHash("sha256").update(policy).digest("hex") : null,
      adminAvifProbe,
      violations: routeViolations,
    });
    violations.push(...routeViolations.map((item) => ({ path, ...item })));
    await page.close();
  }
} finally {
  await browser.close();
}

if (observedPublicPolicies.size !== 1)
  violations.push({ path: "*", type: "policy", text: "Public CSP must be identical on every public route" });
if (observedAdminPolicies.size !== 1)
  violations.push({ path: "/admin/login", type: "policy", text: "Admin CSP must have one exact value" });
const observedPolicy = observedPublicPolicies.size === 1 ? [...observedPublicPolicies][0] : null;
const observedAdminPolicy = observedAdminPolicies.size === 1 ? [...observedAdminPolicies][0] : null;
if (observedPolicy && observedAdminPolicy !== observedPolicy)
  violations.push({
    path: "/admin/login",
    type: "policy",
    text: "Admin documents must retain the exact strict public document CSP",
  });

const report = {
  schemaVersion: 1,
  event: "ev2.phase16.csp.browser-canary",
  origin,
  candidateSha: expectedSha,
  executedAt: new Date().toISOString(),
  routes: results,
  policySha256: observedPolicy ? createHash("sha256").update(observedPolicy).digest("hex") : null,
  adminPolicySha256: observedAdminPolicy
    ? createHash("sha256").update(observedAdminPolicy).digest("hex")
    : null,
  workerPolicySha256: workerPolicy ? createHash("sha256").update(workerPolicy).digest("hex") : null,
  criticalViolations: violations.length,
  outcome: violations.length === 0 ? "pass" : "pause",
  realDataUsed: false,
  productionMutations: 0,
};
if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
if (violations.length > 0) process.exitCode = 1;
