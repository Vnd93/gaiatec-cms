import { writeFile } from "node:fs/promises";
import { evaluateProbeWindow, isFullSha, percentile } from "./release-guard-lib.mjs";

const origin = (process.env.EV2_G12_ORIGIN ?? "").replace(/\/$/, "");
const expectedSha = process.env.EV2_G12_EXPECTED_SHA ?? "";
const environment = process.env.EV2_G12_ENVIRONMENT ?? "";
const sampleCount = Number(process.env.EV2_G12_SAMPLE_COUNT ?? (environment === "production" ? 20 : 5));
const reportPath = process.env.EV2_G12_REPORT_PATH;

if (!origin || !isFullSha(expectedSha) || !Number.isInteger(sampleCount) || sampleCount < 5)
  throw new Error("G12_PROBE_INPUT_REFUSED: exact origin, full SHA and at least five samples are required.");

const allowedOrigin = {
  local: /^http:\/\/127\.0\.0\.1:\d{2,5}$/,
  staging: /^https:\/\/(?:[a-z0-9-]+\.)?gaiatec-cms-staging\.pages\.dev$/,
  "production-preview": /^https:\/\/(?:[a-z0-9-]+\.)?gaiatec-website\.pages\.dev$/,
  production: /^https:\/\/(?:www\.)?gaiatecsistemas\.com\.br$/,
}[environment];
if (!allowedOrigin?.test(origin))
  throw new Error("G12_PROBE_TARGET_REFUSED: origin does not match environment.");
if (environment === "production" && process.env.EV2_G12_PRODUCTION_AUTHORIZED !== "true")
  throw new Error("G12_PRODUCTION_PROBE_REFUSED: explicit workflow authorization is absent.");

const routes = [
  { path: "/", status: 200 },
  { path: "/produtos", status: 200 },
  { path: "/contato", status: 200 },
  { path: "/admin/login", status: 200 },
];
const observations = [];

async function request(path, expectedStatus) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${origin}${path}`, { redirect: "manual", cache: "no-store" });
    observations.push({
      path,
      durationMs: performance.now() - startedAt,
      status: response.status,
      expectedStatus,
      release: response.headers.get("x-release"),
      robots: response.headers.get("x-robots-tag") ?? "",
    });
    return response;
  } catch (error) {
    observations.push({
      path,
      durationMs: performance.now() - startedAt,
      status: 0,
      expectedStatus,
      release: null,
      robots: "",
      error: error instanceof Error ? error.name : "RequestError",
    });
    return null;
  }
}

const healthResponse = await request("/healthz", 200);
const health = healthResponse ? await healthResponse.json().catch(() => null) : null;
const manifestResponse = await request("/release-manifest.json", 200);
const manifest = manifestResponse ? await manifestResponse.json().catch(() => null) : null;

for (let sample = 0; sample < sampleCount; sample += 1)
  for (const route of routes) await request(route.path, route.status);

const successful = observations.filter((item) => item.status === item.expectedStatus).length;
const serverErrors = observations.filter((item) => item.status >= 500).length;
const measured = observations.length;
const requiresNoindex = environment === "staging" || environment === "production-preview";
const evidence = {
  candidateSha: expectedSha,
  environment,
  sampleCount: measured,
  availabilityPercent: (successful / measured) * 100,
  http5xxRatePercent: (serverErrors / measured) * 100,
  publicP95Ms: percentile(
    observations.map((item) => item.durationMs),
    95,
  ),
  releaseHeadersExact: observations.every((item) => item.release === expectedSha),
  healthContractValid:
    healthResponse?.status === 200 &&
    health?.schemaVersion === 1 &&
    health?.status === "ready" &&
    health?.release === expectedSha &&
    health?.environment === environment &&
    healthResponse.headers.get("cache-control")?.includes("no-store"),
  manifestReleaseExact: manifestResponse?.status === 200 && manifest?.release === expectedSha,
  nonProductionNoindexValid:
    !requiresNoindex || observations.every((item) => item.robots.includes("noindex")),
};
const evaluation = evaluateProbeWindow(evidence);
const report = {
  schemaVersion: 1,
  event: "g12.rollout.probe",
  origin,
  candidateSha: expectedSha,
  environment,
  measuredResponses: measured,
  ...evidence,
  outcome: evaluation.healthy ? "pass" : "pause",
  violations: evaluation.violations,
};

if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
if (!evaluation.healthy) process.exitCode = 1;
