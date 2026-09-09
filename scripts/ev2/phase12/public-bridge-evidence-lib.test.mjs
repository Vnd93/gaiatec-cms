import assert from "node:assert/strict";
import test from "node:test";

import { createHash } from "node:crypto";

import {
  validatePublicBridgeForwardCanary,
  validatePublicBridgeHeadlessCanary,
  validatePublicBridgeReadOnlyCanary,
  validatePublicBridgeRolloutProbe,
} from "./public-bridge-evidence-lib.mjs";

const SHA = "a".repeat(40);
const PREVIEW_DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174001";
const CANONICAL_DEPLOYMENT_ID = "123e4567-e89b-42d3-a456-426614174002";
const PREVIEW_ORIGIN = "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev";
const PREVIEW_DEPLOYMENT_ORIGIN = "https://12345678.gaiatec-cms-staging.pages.dev";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function headlessReport() {
  return {
    schemaVersion: 1,
    event: "g12.public_bridge.headless_canary",
    status: "passed",
    environment: "staging",
    frontendSha: SHA,
    backendContract: "legacy-f48",
    origin: PREVIEW_ORIGIN,
    deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
    deploymentIdentitySha256: sha256(PREVIEW_DEPLOYMENT_ID),
    fixtureBindingSha256: "2".repeat(64),
    contracts: {
      page: "legacy-row-normalized-and-rendered",
      campaign: "legacy-row-normalized-and-rendered",
      form: "legacy-f48-normalized-and-rendered",
      turnstile: "configured-real-widget-load-requested",
      submission: "disabled-without-token",
    },
    observations: {
      renderedPages: 1,
      renderedCampaigns: 1,
      renderedForms: 1,
      turnstileScriptRequests: 1,
      turnstileRequestFailures: 1,
      turnstileConsoleFailures: 1,
      backendMutationRequests: 0,
      unexpectedConsole: 0,
      requestFailures: 0,
    },
    boundary: {
      uuidInDomOrStorage: 0,
      tokenObserved: false,
      submitDisabledWithoutToken: true,
      unavailableFeedbackVisible: true,
      intentionalFailureMode: "turnstile-network-unavailable",
      secretsPersisted: false,
    },
  };
}

test("accepts the headless real-widget failure proof only with zero submission", () => {
  assert.deepEqual(
    validatePublicBridgeHeadlessCanary(headlessReport(), {
      candidateSha: SHA,
      environment: "staging",
      origin: PREVIEW_ORIGIN,
      deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }),
    { valid: true, violations: [] },
  );
  const mutation = headlessReport();
  mutation.observations.backendMutationRequests = 1;
  assert.ok(
    validatePublicBridgeHeadlessCanary(mutation, {
      origin: PREVIEW_ORIGIN,
      deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }).violations.includes("headless_observations_invalid"),
  );
  const falseTokenClaim = headlessReport();
  falseTokenClaim.boundary.tokenObserved = true;
  assert.ok(
    validatePublicBridgeHeadlessCanary(falseTokenClaim, {
      origin: PREVIEW_ORIGIN,
      deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }).violations.includes("headless_boundary_invalid"),
  );
});

test("rejects cross-substituted staging deployment identity and origin evidence", () => {
  const substitutedIdentity = headlessReport();
  substitutedIdentity.deploymentIdentitySha256 = sha256(CANONICAL_DEPLOYMENT_ID);
  assert.ok(
    validatePublicBridgeHeadlessCanary(substitutedIdentity, {
      candidateSha: SHA,
      environment: "staging",
      origin: PREVIEW_ORIGIN,
      deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }).violations.includes("headless_deployment_invalid"),
  );

  const substitutedOrigin = headlessReport();
  substitutedOrigin.origin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  assert.ok(
    validatePublicBridgeHeadlessCanary(substitutedOrigin, {
      candidateSha: SHA,
      environment: "staging",
      origin: PREVIEW_ORIGIN,
      deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }).violations.includes("headless_origin_invalid"),
  );

  const substitutedDeploymentOrigin = headlessReport();
  substitutedDeploymentOrigin.deploymentOrigin = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
  assert.ok(
    validatePublicBridgeHeadlessCanary(substitutedDeploymentOrigin, {
      candidateSha: SHA,
      environment: "staging",
      origin: PREVIEW_ORIGIN,
      deploymentOrigin: PREVIEW_DEPLOYMENT_ORIGIN,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }).violations.includes("headless_deployment_invalid"),
  );
});

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

test("rejects rollout probes substituted across exact preview and canonical origins", () => {
  const preview = {
    ...report(),
    environment: "production-preview",
    origin: "https://wrong.gaiatec-website.pages.dev",
  };
  assert.ok(
    validatePublicBridgeRolloutProbe(preview, {
      candidateSha: SHA,
      environment: "production-preview",
      probeProfile: "full",
      origin: "https://expected.gaiatec-website.pages.dev",
    }).violations.includes("rollout_origin_invalid"),
  );

  const canonical = { ...report(), origin: "https://www.gaiatecsistemas.com.br" };
  assert.ok(
    validatePublicBridgeRolloutProbe(canonical, {
      candidateSha: SHA,
      environment: "production",
      probeProfile: "full",
      origin: "https://gaiatecsistemas.com.br",
    }).violations.includes("rollout_origin_invalid"),
  );
});

function forwardReport() {
  return {
    schemaVersion: 3,
    event: "g12.public_bridge.forward_compatibility",
    status: "passed",
    environment: "staging",
    candidateSha: SHA,
    deploymentIdentitySha256: sha256(CANONICAL_DEPLOYMENT_ID),
    proofMode: "direct-remote-negative-contract",
    backendContract: "candidate-a-strict-turnstile",
    origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    fixtureBindingSha256: "f".repeat(64),
    requestShapes: {
      legacyEnvelope: "form-id-version-without-captcha-token",
      hybridEnvelope: "legacy-plus-form-key-version-without-captcha-token",
    },
    remoteObservations: {
      health: {
        status: 200,
        environment: "staging",
        releaseSha: SHA,
        releaseHeaderSha: SHA,
      },
      legacyEnvelope: {
        status: 403,
        error: "Confirme a verificação de segurança.",
        challengeRequired: true,
      },
      hybridEnvelope: { status: 400, error: "Revise os campos do formulário." },
    },
    evidenceScope: {
      observedHere: [
        "candidate-health-release-and-environment",
        "legacy-envelope-without-captcha-token-403",
        "hybrid-envelope-400",
      ],
      notObservedHere: [
        "baseline-f48-browser-execution",
        "browser-reload",
        "positive-form-submission",
        "turnstile-action-evaluation",
        "turnstile-hostname-evaluation",
        "turnstile-cdata-evaluation",
      ],
      complementaryEvidence: {
        adversarialTurnstilePolicy: "tests/unit/security-origin.test.ts",
        successfulCandidateBrowser: "cms-real-browser-attestation.json",
      },
    },
    boundary: {
      responseIdentifiersPersisted: 0,
      secretsPersisted: false,
    },
  };
}

const forwardExpected = { candidateSha: SHA, deploymentId: CANONICAL_DEPLOYMENT_ID };

test("accepts only remote negative observations bound to the exact candidate deployment", () => {
  assert.deepEqual(validatePublicBridgeForwardCanary(forwardReport(), forwardExpected), {
    valid: true,
    violations: [],
  });
});

test("rejects altered remote observations, scope or extra positive claims", () => {
  const accepted = forwardReport();
  accepted.remoteObservations.legacyEnvelope.status = 201;
  assert.ok(
    validatePublicBridgeForwardCanary(accepted, forwardExpected).violations.includes(
      "forward_observations_invalid",
    ),
  );
  const overScoped = forwardReport();
  overScoped.evidenceScope.notObservedHere = overScoped.evidenceScope.notObservedHere.filter(
    (claim) => claim !== "browser-reload",
  );
  assert.ok(
    validatePublicBridgeForwardCanary(overScoped, forwardExpected).violations.includes(
      "forward_scope_invalid",
    ),
  );
  assert.ok(
    validatePublicBridgeForwardCanary(
      { ...forwardReport(), positiveSubmissionAccepted: true },
      forwardExpected,
    ).violations.includes("forward_schema_invalid"),
  );
});

test("rejects a substituted candidate or deployment binding", () => {
  assert.ok(
    validatePublicBridgeForwardCanary(forwardReport(), {
      ...forwardExpected,
      candidateSha: "b".repeat(40),
    }).violations.includes("forward_binding_invalid"),
  );
  assert.ok(
    validatePublicBridgeForwardCanary(forwardReport(), {
      ...forwardExpected,
      deploymentId: PREVIEW_DEPLOYMENT_ID,
    }).violations.includes("forward_binding_invalid"),
  );
});

test("rejects every browser-only overclaim from the API-only forward canary", () => {
  for (const [key, value] of [
    ["baselineFrontendSha", "f48bb4530566456a0090a98cd39caf1cacb51b09"],
    ["reloadRequired", true],
    ["actionRequired", true],
    ["hostnameRequired", true],
    ["cdataRequired", true],
  ]) {
    assert.ok(
      validatePublicBridgeForwardCanary(
        { ...forwardReport(), [key]: value },
        forwardExpected,
      ).violations.includes("forward_schema_invalid"),
      `${key} must not be accepted as an observation of this API-only canary`,
    );
  }
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
