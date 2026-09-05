import { writeFile } from "node:fs/promises";
import {
  evaluateProbeWindow,
  G12_BUDGETS,
  isFullSha,
  percentile,
  validateHealthContract,
  validateReleaseManifest,
} from "./release-guard-lib.mjs";

const origin = (process.env.EV2_G12_ORIGIN ?? "").replace(/\/$/, "");
const expectedSha = process.env.EV2_G12_EXPECTED_SHA ?? "";
const environment = process.env.EV2_G12_ENVIRONMENT ?? "";
const sampleCount = Number(process.env.EV2_G12_SAMPLE_COUNT ?? (environment === "production" ? 20 : 5));
const requestTimeoutMs = Number(process.env.EV2_G12_REQUEST_TIMEOUT_MS ?? 10_000);
const reportPath = process.env.EV2_G12_REPORT_PATH;
const expectedCspMode =
  process.env.EV2_G12_CSP_MODE ??
  (environment === "production" || environment === "production-preview" ? "enforce" : "report-only");

if (
  !origin ||
  !isFullSha(expectedSha) ||
  !Number.isInteger(sampleCount) ||
  sampleCount < 5 ||
  !Number.isInteger(requestTimeoutMs) ||
  requestTimeoutMs < 1_000 ||
  requestTimeoutMs > 30_000
)
  throw new Error("G12_PROBE_INPUT_REFUSED: exact origin, full SHA and at least five samples are required.");

const allowedOrigin = {
  local: /^http:\/\/127\.0\.0\.1:\d{2,5}$/,
  staging: /^https:\/\/(?:[a-z0-9-]+\.)?gaiatec-cms-staging\.pages\.dev$/,
  "production-preview": /^https:\/\/(?:[a-z0-9-]+\.)?gaiatec-website\.pages\.dev$/,
  production: /^https:\/\/(?:www\.)?gaiatecsistemas\.com\.br$/,
}[environment];
if (!allowedOrigin?.test(origin))
  throw new Error("G12_PROBE_TARGET_REFUSED: origin does not match environment.");
if (!new Set(["enforce", "report-only"]).has(expectedCspMode))
  throw new Error("G12_CSP_MODE_REFUSED: expected CSP mode is invalid.");
if (environment === "production" && process.env.EV2_G12_PRODUCTION_AUTHORIZED !== "true")
  throw new Error("G12_PRODUCTION_PROBE_REFUSED: explicit workflow authorization is absent.");

const routes = [
  { path: "/", status: 200 },
  { path: "/produtos", status: 200 },
  { path: "/contato", status: 200 },
  { path: "/admin/login", status: 200 },
];
const observations = [];

async function request(path, expectedStatus, category = "route") {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${origin}${path}`, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    observations.push({
      path,
      category,
      durationMs: performance.now() - startedAt,
      status: response.status,
      expectedStatus,
      release: response.headers.get("x-release"),
      robots: response.headers.get("x-robots-tag") ?? "",
      contentType: response.headers.get("content-type") ?? "",
      contentSecurityPolicy: response.headers.get("content-security-policy") ?? "",
      contentSecurityPolicyReportOnly: response.headers.get("content-security-policy-report-only") ?? "",
    });
    return response;
  } catch (error) {
    observations.push({
      path,
      category,
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

const healthResponse = await request("/healthz", 200, "contract");
const health = healthResponse ? await healthResponse.json().catch(() => null) : null;
const manifestResponse = await request("/release-manifest.json", 200, "contract");
const manifest = manifestResponse ? await manifestResponse.json().catch(() => null) : null;

for (let sample = 0; sample < sampleCount; sample += 1)
  for (const route of routes) await request(route.path, route.status);

const successful = observations.filter((item) => item.status === item.expectedStatus).length;
const serverErrors = observations.filter((item) => item.status >= 500).length;
const measured = observations.length;
const routeObservations = observations.filter((item) => item.category === "route");
const routeMetrics = Object.fromEntries(
  routes.map((route) => {
    const samples = routeObservations.filter((item) => item.path === route.path);
    const successfulSamples = samples.filter((item) => item.status === item.expectedStatus).length;
    return [
      route.path,
      {
        samples: samples.length,
        availabilityPercent: samples.length ? (successfulSamples / samples.length) * 100 : 0,
        p50Ms: percentile(
          samples.map((item) => item.durationMs),
          50,
        ),
        p95Ms: percentile(
          samples.map((item) => item.durationMs),
          95,
        ),
        maxMs: Math.max(...samples.map((item) => item.durationMs)),
      },
    ];
  }),
);
const requiresNoindex = environment === "staging" || environment === "production-preview";
const requiresCspEnforcement = expectedCspMode === "enforce";
const requiredCspFragments = [
  "default-src 'self'",
  "object-src 'none'",
  "script-src-attr 'none'",
  "https://brasilapi.com.br",
  "https://nominatim.openstreetmap.org",
];
const jsonContentType = (response) => response?.headers.get("content-type")?.includes("application/json");
const evidence = {
  candidateSha: expectedSha,
  environment,
  sampleCount: measured,
  availabilityPercent: (successful / measured) * 100,
  http5xxRatePercent: (serverErrors / measured) * 100,
  publicP95Ms: percentile(
    routeObservations.map((item) => item.durationMs),
    95,
  ),
  requestTimeoutMs,
  routeMetrics,
  routeBudgetsValid: Object.values(routeMetrics).every(
    (route) =>
      route.samples === sampleCount &&
      route.availabilityPercent >= G12_BUDGETS.availabilityPercent &&
      route.p95Ms <= G12_BUDGETS.publicP95Ms,
  ),
  releaseHeadersExact: observations.every((item) => item.release === expectedSha),
  healthContractValid:
    healthResponse?.status === 200 &&
    jsonContentType(healthResponse) &&
    validateHealthContract(health, {
      expectedRelease: expectedSha,
      expectedEnvironment: environment,
    }).valid &&
    healthResponse.headers.get("cache-control")?.includes("no-store"),
  manifestReleaseExact:
    manifestResponse?.status === 200 &&
    jsonContentType(manifestResponse) &&
    validateReleaseManifest(manifest, { expectedRelease: expectedSha }).valid,
  nonProductionNoindexValid:
    !requiresNoindex || observations.every((item) => item.robots.includes("noindex")),
  cspPolicyValid: observations.every((item) => {
    const activePolicy =
      (requiresCspEnforcement ? item.contentSecurityPolicy : item.contentSecurityPolicyReportOnly) ?? "";
    const inactivePolicy =
      (requiresCspEnforcement ? item.contentSecurityPolicyReportOnly : item.contentSecurityPolicy) ?? "";
    return (
      activePolicy.length > 0 &&
      inactivePolicy.length === 0 &&
      !activePolicy.includes("https://api.resend.com") &&
      requiredCspFragments.every((fragment) => activePolicy.includes(fragment))
    );
  }),
};
const baseEvaluation = evaluateProbeWindow(evidence);
const violations = [...baseEvaluation.violations];
if (!evidence.cspPolicyValid) violations.push("csp_policy_invalid");
const report = {
  schemaVersion: 1,
  event: "g12.rollout.probe",
  origin,
  candidateSha: expectedSha,
  environment,
  measuredResponses: measured,
  ...evidence,
  outcome: violations.length === 0 ? "pass" : "pause",
  violations,
};

if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
if (violations.length > 0) process.exitCode = 1;
