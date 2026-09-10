import { writeFile } from "node:fs/promises";
import {
  evaluateProbeWindow,
  G12_BUDGETS,
  isFullSha,
  percentile,
  retryStrictBoundaryWindow,
  validateHealthContract,
  validateReleaseManifest,
} from "./release-guard-lib.mjs";

const origin = (process.env.EV2_G12_ORIGIN ?? "").replace(/\/$/, "");
const expectedSha = process.env.EV2_G12_EXPECTED_SHA ?? "";
const environment = process.env.EV2_G12_ENVIRONMENT ?? "";
const probeProfile = process.env.EV2_G12_PROBE_PROFILE ?? "full";
// percentile(values, 95) at n=5 returns the maximum, so a five sample probe reports the worst
// response as if it were the tail. Twenty is the smallest size at which p95 excludes a sample.
const sampleCount = Number(process.env.EV2_G12_SAMPLE_COUNT ?? 20);
const requestTimeoutMs = Number(process.env.EV2_G12_REQUEST_TIMEOUT_MS ?? 10_000);
const readinessAttempts = Number(process.env.EV2_G12_READINESS_ATTEMPTS ?? 10);
const readinessIntervalMs = Number(process.env.EV2_G12_READINESS_INTERVAL_MS ?? 1_500);
// A redeploy leaves every public route cold; three requests are not enough to leave the cold
// start out of the measured window.
const warmupSamplesPerRoute = Number(process.env.EV2_G12_WARMUP_SAMPLES_PER_ROUTE ?? 8);
const warmupAttempts = Number(process.env.EV2_G12_WARMUP_ATTEMPTS ?? readinessAttempts);
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
  requestTimeoutMs > 30_000 ||
  !Number.isInteger(readinessAttempts) ||
  readinessAttempts < 1 ||
  readinessAttempts > 20 ||
  !Number.isInteger(readinessIntervalMs) ||
  readinessIntervalMs < 100 ||
  readinessIntervalMs > 5_000 ||
  !Number.isInteger(warmupSamplesPerRoute) ||
  warmupSamplesPerRoute < 1 ||
  warmupSamplesPerRoute > 10 ||
  !Number.isInteger(warmupAttempts) ||
  warmupAttempts < 1 ||
  warmupAttempts > 20
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
if (!new Set(["technical", "full"]).has(probeProfile))
  throw new Error("G12_PROBE_PROFILE_REFUSED: profile is invalid.");
if (probeProfile === "technical" && environment !== "production-preview")
  throw new Error("G12_PROBE_PROFILE_REFUSED: technical profile is exclusive to isolated preview.");
if (!new Set(["enforce", "report-only"]).has(expectedCspMode))
  throw new Error("G12_CSP_MODE_REFUSED: expected CSP mode is invalid.");
if (environment === "production" && process.env.EV2_G12_PRODUCTION_AUTHORIZED !== "true")
  throw new Error("G12_PRODUCTION_PROBE_REFUSED: explicit workflow authorization is absent.");

const routes =
  probeProfile === "technical"
    ? [
        { path: "/produtos", status: 200 },
        { path: "/admin/login", status: 200 },
      ]
    : [
        { path: "/", status: 200 },
        { path: "/produtos", status: 200 },
        { path: "/contato", status: 200 },
        { path: "/admin/login", status: 200 },
      ];
const observations = [];
const requiresNoindex = environment === "staging" || environment === "production-preview";
const requiresCspEnforcement = expectedCspMode === "enforce";
const requiredCspFragments = [
  "default-src 'self'",
  "object-src 'none'",
  "script-src-attr 'none'",
  "https://brasilapi.com.br",
  "https://nominatim.openstreetmap.org",
];

function boundaryHeadersValid(response) {
  const activePolicy = response.headers.get(
    requiresCspEnforcement ? "content-security-policy" : "content-security-policy-report-only",
  );
  const inactivePolicy = response.headers.get(
    requiresCspEnforcement ? "content-security-policy-report-only" : "content-security-policy",
  );
  return (
    response.headers.get("x-release") === expectedSha &&
    (!requiresNoindex || (response.headers.get("x-robots-tag") ?? "").includes("noindex")) &&
    Boolean(activePolicy) &&
    !inactivePolicy &&
    !activePolicy.includes("https://api.resend.com") &&
    requiredCspFragments.every((fragment) => activePolicy.includes(fragment))
  );
}

async function previewReady() {
  const expectations = [
    { path: "/healthz", status: 200 },
    { path: "/release-manifest.json", status: 200 },
    ...routes,
  ];
  const responses = await Promise.all(
    expectations.map(async ({ path, status }) => {
      try {
        const response = await fetch(`${origin}${path}`, {
          cache: "no-store",
          redirect: "manual",
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
        return response.status === status && boundaryHeadersValid(response);
      } catch {
        return false;
      }
    }),
  );
  return responses.every(Boolean);
}

let ready = false;
for (let attempt = 1; attempt <= readinessAttempts; attempt += 1) {
  ready = await previewReady();
  if (ready) break;
  if (attempt < readinessAttempts) await new Promise((resolve) => setTimeout(resolve, readinessIntervalMs));
}
if (!ready) throw new Error("G12_PROBE_NOT_READY: target did not reach a stable measurable boundary.");

async function warmRoutes() {
  for (let sample = 0; sample < warmupSamplesPerRoute; sample += 1) {
    for (const route of routes) {
      const response = await fetch(`${origin}${route.path}`, {
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(requestTimeoutMs),
      });
      if (response.status !== route.status || !boundaryHeadersValid(response))
        throw new Error(`G12_PROBE_WARMUP_FAILED: ${route.path} did not preserve its boundary.`);
      await response.arrayBuffer();
    }
  }
}

await retryStrictBoundaryWindow({
  attempts: warmupAttempts,
  verify: warmRoutes,
  wait: () => new Promise((resolve) => setTimeout(resolve, readinessIntervalMs)),
});

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
const jsonContentType = (response) => response?.headers.get("content-type")?.includes("application/json");
const evidence = {
  candidateSha: expectedSha,
  environment,
  sampleCount,
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
  probeProfile,
  warmupSamplesPerRoute,
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
