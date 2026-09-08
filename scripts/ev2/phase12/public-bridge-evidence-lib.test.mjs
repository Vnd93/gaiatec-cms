import assert from "node:assert/strict";
import test from "node:test";

import { createHash } from "node:crypto";

import {
  validatePublicBridgeForwardCanary,
  validatePublicBridgeReadOnlyCanary,
  validatePublicBridgeRolloutProbe,
} from "./public-bridge-evidence-lib.mjs";

const SHA = "a".repeat(40);

function metric(samples) {
  return {
    samples,
    availabilityPercent: 100,
    p50Ms: 25,
    p95Ms: 40,
    maxMs: 50,
  };
}

function report() {
  const samplesPerRoute = 20;
  const measuredResponses = samplesPerRoute * 4 + 2;
  return {
    schemaVersion: 1,
    event: "g12.rollout.probe",
    probeProfile: "full",
    warmupSamplesPerRoute: 3,
    origin: "https://gaiatecsistemas.com.br",
    candidateSha: SHA,
    environment: "production",
    measuredResponses,
    sampleCount: samplesPerRoute,
    availabilityPercent: 100,
    http5xxRatePercent: 0,
    publicP95Ms: 40,
    requestTimeoutMs: 10_000,
    routeMetrics: {
      "/": metric(samplesPerRoute),
      "/produtos": metric(samplesPerRoute),
      "/contato": metric(samplesPerRoute),
      "/admin/login": metric(samplesPerRoute),
    },
    routeBudgetsValid: true,
    releaseHeadersExact: true,
    healthContractValid: true,
    manifestReleaseExact: true,
    nonProductionNoindexValid: true,
    cspPolicyValid: true,
    outcome: "pass",
    violations: [],
  };
}

test("accepts the actual rollout-probe total and per-route sample semantics", () => {
  assert.deepEqual(
    validatePublicBridgeRolloutProbe(report(), {
      candidateSha: SHA,
      environment: "production",
      probeProfile: "full",
      origin: "https://gaiatecsistemas.com.br",
    }),
    { valid: true, violations: [] },
  );
});

function forwardReport() {
  return {
    schemaVersion: 1,
    event: "g12.public_bridge.forward_compatibility",
    status: "passed",
    environment: "staging",
    frontendSha: SHA,
    backendContract: "forward-expand-contract",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    fixtureBindingSha256: "f".repeat(64),
    contracts: {
      frontendAToCandidate: "public-v2-exact-201",
      loadedF48TabToCandidate: "legacy-f48-exact-201",
      duplicateReplay: "legacy-f48-same-idempotency-201-duplicate",
      productIdor: "legacy-product-id-unbound-422",
      hybridEnvelope: "mixed-generation-400",
    },
    observations: {
      modernAccepted: 1,
      legacyAccepted: 1,
      duplicateAccepted: 1,
      productIdorRejected: 1,
      hybridRejected: 1,
      automaticRetries: 0,
    },
    boundary: { responseIds: 0, secretsPersisted: false },
  };
}

test("accepts all three forward bridge directions and strict negative cases", () => {
  assert.deepEqual(validatePublicBridgeForwardCanary(forwardReport(), { candidateSha: SHA }), {
    valid: true,
    violations: [],
  });
});

test("rejects omitted, extra, hybrid or retried forward evidence", () => {
  const retry = forwardReport();
  retry.observations.automaticRetries = 1;
  assert.ok(validatePublicBridgeForwardCanary(retry).violations.includes("forward_observations_invalid"));
  assert.ok(
    validatePublicBridgeForwardCanary({ ...forwardReport(), rawPayload: {} }).violations.includes(
      "forward_schema_invalid",
    ),
  );
});

test("rejects a mathematically inconsistent response total", () => {
  const value = report();
  value.routeMetrics["/"].samples = 19;
  assert.ok(validatePublicBridgeRolloutProbe(value).violations.includes("rollout_routes_invalid"));
});

test("rejects missing or extra rollout fields", () => {
  const missing = report();
  delete missing.cspPolicyValid;
  assert.ok(validatePublicBridgeRolloutProbe(missing).violations.includes("rollout_schema_invalid"));
  assert.ok(
    validatePublicBridgeRolloutProbe({ ...report(), rawResponses: [] }).violations.includes(
      "rollout_schema_invalid",
    ),
  );
});

function readOnlyReport() {
  return {
    schemaVersion: 1,
    event: "g12.public_bridge.production_readonly",
    status: "passed",
    frontendSha: SHA,
    origin: "https://gaiatecsistemas.com.br",
    deploymentOrigin: "https://bridge-a.gaiatec-website.pages.dev",
    deploymentIdentitySha256: createHash("sha256").update("deployment-a").digest("hex"),
    routes: ["/", "/produtos", "/contato", "/admin/login"],
    renderedRoutes: 4,
    backendMutationRequests: 0,
    leadSubmissions: 0,
    unexpectedConsole: 0,
    requestFailures: 0,
    secretsPersisted: false,
  };
}

test("accepts a production bridge render proof with zero backend mutation", () => {
  assert.deepEqual(
    validatePublicBridgeReadOnlyCanary(readOnlyReport(), {
      candidateSha: SHA,
      origin: "https://gaiatecsistemas.com.br",
      deploymentOrigin: "https://bridge-a.gaiatec-website.pages.dev",
      deploymentId: "deployment-a",
    }),
    { valid: true, violations: [] },
  );
});

test("rejects incomplete, hybrid or mutating production bridge proofs", () => {
  const mutation = { ...readOnlyReport(), leadSubmissions: 1 };
  assert.ok(
    validatePublicBridgeReadOnlyCanary(mutation).violations.includes("readonly_observations_invalid"),
  );
  const extra = { ...readOnlyReport(), rawRequests: [] };
  assert.ok(validatePublicBridgeReadOnlyCanary(extra).violations.includes("readonly_schema_invalid"));
  assert.ok(
    validatePublicBridgeReadOnlyCanary(readOnlyReport(), { deploymentId: "another" }).violations.includes(
      "readonly_deployment_invalid",
    ),
  );
});
