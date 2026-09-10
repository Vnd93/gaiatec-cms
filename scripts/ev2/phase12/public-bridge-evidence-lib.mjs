import { createHash } from "node:crypto";

import { evaluateProbeWindow, G12_BUDGETS, UUID_PATTERN } from "./release-guard-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FORWARD_OBSERVED_HERE = Object.freeze([
  "candidate-health-release-and-environment",
  "legacy-envelope-without-captcha-token-403",
  "hybrid-envelope-400",
]);
const FORWARD_NOT_OBSERVED_HERE = Object.freeze([
  "baseline-f48-browser-execution",
  "browser-reload",
  "positive-form-submission",
  "turnstile-action-evaluation",
  "turnstile-hostname-evaluation",
  "turnstile-cdata-evaluation",
]);
const ORIGINS = Object.freeze({
  staging: /^https:\/\/[a-z0-9-]+\.gaiatec-cms-staging\.pages\.dev$/,
  production: /^https:\/\/(?:www\.)?gaiatecsistemas\.com\.br$/,
  "production-preview": /^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/,
});

function exactKeys(value, expected) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort())
  );
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function exactOrigin(value, pattern) {
  if (typeof value !== "string" || !pattern?.test(value)) return false;
  try {
    const url = new URL(value);
    return url.origin === value && url.pathname === "/" && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function validatePublicBridgeRolloutProbe(report, expected = {}) {
  const violations = [];
  const keys = [
    "schemaVersion",
    "event",
    "probeProfile",
    "warmupSamplesPerRoute",
    "origin",
    "candidateSha",
    "environment",
    "measuredResponses",
    "sampleCount",
    "availabilityPercent",
    "http5xxRatePercent",
    "publicP95Ms",
    "requestTimeoutMs",
    "routeMetrics",
    "routeBudgetsValid",
    "releaseHeadersExact",
    "healthContractValid",
    "manifestReleaseExact",
    "nonProductionNoindexValid",
    "cspPolicyValid",
    "outcome",
    "violations",
  ];
  if (!exactKeys(report, keys) || report?.schemaVersion !== 1 || report?.event !== "g12.rollout.probe") {
    violations.push("rollout_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.candidateSha ?? "") ||
    (expected.candidateSha && report?.candidateSha !== expected.candidateSha)
  ) {
    violations.push("rollout_candidate_invalid");
  }
  if (
    !Object.hasOwn(ORIGINS, report?.environment ?? "") ||
    (expected.environment && report?.environment !== expected.environment) ||
    !exactOrigin(report?.origin, ORIGINS[report?.environment]) ||
    (expected.origin && report?.origin !== expected.origin)
  ) {
    violations.push("rollout_origin_invalid");
  }
  if (!new Set(["technical", "full"]).has(report?.probeProfile)) violations.push("rollout_profile_invalid");
  if (expected.probeProfile && report?.probeProfile !== expected.probeProfile)
    violations.push("rollout_profile_mismatch");
  const routes =
    report?.probeProfile === "technical"
      ? ["/produtos", "/admin/login"]
      : ["/", "/produtos", "/contato", "/admin/login"];
  const routeSamples = (Number(report?.measuredResponses) - 2) / routes.length;
  if (
    !exactKeys(report?.routeMetrics, routes) ||
    !Number.isSafeInteger(routeSamples) ||
    routeSamples < 5 ||
    routes.some((route) => {
      const metric = report?.routeMetrics?.[route];
      return (
        !exactKeys(metric, ["samples", "availabilityPercent", "p50Ms", "p95Ms", "maxMs"]) ||
        !Number.isSafeInteger(metric.samples) ||
        metric.samples !== routeSamples ||
        !finite(metric.availabilityPercent) ||
        metric.availabilityPercent < G12_BUDGETS.availabilityPercent ||
        !finite(metric.p50Ms) ||
        !finite(metric.p95Ms) ||
        metric.p95Ms > G12_BUDGETS.publicP95Ms ||
        !finite(metric.maxMs)
      );
    })
  ) {
    violations.push("rollout_routes_invalid");
  }
  const evaluation = evaluateProbeWindow(report);
  if (
    !evaluation.healthy ||
    report?.cspPolicyValid !== true ||
    report?.outcome !== "pass" ||
    !Array.isArray(report?.violations) ||
    report.violations.length !== 0 ||
    !Number.isSafeInteger(report?.warmupSamplesPerRoute) ||
    report.warmupSamplesPerRoute < 1 ||
    // O teto acompanha o do proprio probe: aquecer pelo menos tanto quanto se mede, com limite
    // fechado. Manter 10 aqui recusava a evidencia de um probe valido.
    report.warmupSamplesPerRoute > 40 ||
    report.warmupSamplesPerRoute < routeSamples ||
    report?.sampleCount !== routeSamples ||
    report?.measuredResponses !== routes.length * routeSamples + 2 ||
    !Number.isSafeInteger(report?.requestTimeoutMs) ||
    report.requestTimeoutMs < 1_000 ||
    report.requestTimeoutMs > 30_000
  ) {
    violations.push("rollout_outcome_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validatePublicBridgeHeadlessCanary(report, expected = {}) {
  const violations = [];
  if (
    !exactKeys(report, [
      "schemaVersion",
      "event",
      "status",
      "environment",
      "frontendSha",
      "backendContract",
      "origin",
      "deploymentOrigin",
      "deploymentIdentitySha256",
      "fixtureBindingSha256",
      "contracts",
      "observations",
      "boundary",
    ]) ||
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.public_bridge.headless_canary" ||
    report?.status !== "passed"
  ) {
    violations.push("headless_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.frontendSha ?? "") ||
    (expected.candidateSha && report?.frontendSha !== expected.candidateSha) ||
    report?.backendContract !== (expected.backendContract ?? "legacy-f48")
  ) {
    violations.push("headless_contract_invalid");
  }
  if (
    !Object.hasOwn(ORIGINS, report?.environment ?? "") ||
    (expected.environment && report?.environment !== expected.environment) ||
    !exactOrigin(report?.origin, ORIGINS[report?.environment]) ||
    !exactOrigin(expected.origin, ORIGINS[report?.environment]) ||
    report?.origin !== expected.origin
  ) {
    violations.push("headless_origin_invalid");
  }
  const deploymentPattern =
    report?.environment === "production"
      ? /^https:\/\/(?:[a-z0-9-]+\.gaiatec-website\.pages\.dev|(?:www\.)?gaiatecsistemas\.com\.br)$/
      : ORIGINS.staging;
  if (
    !exactOrigin(report?.deploymentOrigin, deploymentPattern) ||
    !exactOrigin(expected.deploymentOrigin, deploymentPattern) ||
    report?.deploymentOrigin !== expected.deploymentOrigin ||
    !UUID_PATTERN.test(expected.deploymentId ?? "") ||
    !SHA256.test(report?.deploymentIdentitySha256 ?? "") ||
    report?.deploymentIdentitySha256 !==
      createHash("sha256")
        .update(expected.deploymentId ?? "")
        .digest("hex") ||
    !SHA256.test(report?.fixtureBindingSha256 ?? "")
  ) {
    violations.push("headless_deployment_invalid");
  }
  const legacy = report?.backendContract === "legacy-f48";
  if (
    !exactKeys(report?.contracts, ["page", "campaign", "form", "turnstile", "submission"]) ||
    report?.contracts?.page !== "legacy-row-normalized-and-rendered" ||
    report?.contracts?.campaign !== "legacy-row-normalized-and-rendered" ||
    report?.contracts?.form !== "legacy-f48-normalized-and-rendered" ||
    report?.contracts?.turnstile !== "configured-real-widget-load-requested" ||
    report?.contracts?.submission !== "disabled-without-token" ||
    !legacy
  ) {
    violations.push("headless_cases_invalid");
  }
  if (
    !exactKeys(report?.observations, [
      "renderedPages",
      "renderedCampaigns",
      "renderedForms",
      "turnstileScriptRequests",
      "turnstileRequestFailures",
      "turnstileConsoleFailures",
      "backendMutationRequests",
      "unexpectedConsole",
      "requestFailures",
    ]) ||
    report?.observations?.renderedPages !== 1 ||
    report?.observations?.renderedCampaigns !== 1 ||
    report?.observations?.renderedForms !== 1 ||
    !Number.isSafeInteger(report?.observations?.turnstileScriptRequests) ||
    report.observations.turnstileScriptRequests < 1 ||
    report.observations.turnstileScriptRequests > 4 ||
    report?.observations?.turnstileRequestFailures !== report.observations.turnstileScriptRequests ||
    !Number.isSafeInteger(report?.observations?.turnstileConsoleFailures) ||
    report.observations.turnstileConsoleFailures < 0 ||
    report.observations.turnstileConsoleFailures > report.observations.turnstileScriptRequests ||
    report?.observations?.backendMutationRequests !== 0 ||
    report?.observations?.unexpectedConsole !== 0 ||
    report?.observations?.requestFailures !== 0
  ) {
    violations.push("headless_observations_invalid");
  }
  if (
    !exactKeys(report?.boundary, [
      "uuidInDomOrStorage",
      "tokenObserved",
      "submitDisabledWithoutToken",
      "unavailableFeedbackVisible",
      "intentionalFailureMode",
      "secretsPersisted",
    ]) ||
    report?.boundary?.uuidInDomOrStorage !== 0 ||
    report?.boundary?.tokenObserved !== false ||
    report?.boundary?.submitDisabledWithoutToken !== true ||
    report?.boundary?.unavailableFeedbackVisible !== true ||
    report?.boundary?.intentionalFailureMode !== "turnstile-network-unavailable" ||
    report?.boundary?.secretsPersisted !== false
  ) {
    violations.push("headless_boundary_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validatePublicBridgeReadOnlyCanary(report, expected = {}) {
  const violations = [];
  const routes = ["/", "/produtos", "/contato", "/admin/login"];
  if (
    !exactKeys(report, [
      "schemaVersion",
      "event",
      "status",
      "frontendSha",
      "origin",
      "deploymentOrigin",
      "deploymentIdentitySha256",
      "routes",
      "renderedRoutes",
      "backendMutationRequests",
      "leadSubmissions",
      "unexpectedConsole",
      "requestFailures",
      "secretsPersisted",
    ]) ||
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.public_bridge.production_readonly" ||
    report?.status !== "passed"
  ) {
    violations.push("readonly_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.frontendSha ?? "") ||
    (expected.candidateSha && report?.frontendSha !== expected.candidateSha)
  ) {
    violations.push("readonly_candidate_invalid");
  }
  if (
    !exactOrigin(report?.origin, ORIGINS.production) ||
    (expected.origin && report?.origin !== expected.origin) ||
    (!exactOrigin(report?.deploymentOrigin, ORIGINS.production) &&
      !exactOrigin(report?.deploymentOrigin, ORIGINS["production-preview"])) ||
    (expected.deploymentOrigin && report?.deploymentOrigin !== expected.deploymentOrigin) ||
    !SHA256.test(report?.deploymentIdentitySha256 ?? "") ||
    (expected.deploymentId &&
      report?.deploymentIdentitySha256 !== createHash("sha256").update(expected.deploymentId).digest("hex"))
  ) {
    violations.push("readonly_deployment_invalid");
  }
  if (
    !Array.isArray(report?.routes) ||
    JSON.stringify(report.routes) !== JSON.stringify(routes) ||
    report?.renderedRoutes !== routes.length ||
    report?.backendMutationRequests !== 0 ||
    report?.leadSubmissions !== 0 ||
    report?.unexpectedConsole !== 0 ||
    report?.requestFailures !== 0 ||
    report?.secretsPersisted !== false
  ) {
    violations.push("readonly_observations_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validatePublicBridgeForwardCanary(report, expected = {}) {
  const violations = [];
  if (
    !exactKeys(report, [
      "schemaVersion",
      "event",
      "status",
      "environment",
      "candidateSha",
      "deploymentIdentitySha256",
      "proofMode",
      "backendContract",
      "origin",
      "fixtureBindingSha256",
      "requestShapes",
      "remoteObservations",
      "evidenceScope",
      "boundary",
    ]) ||
    report?.schemaVersion !== 3 ||
    report?.event !== "g12.public_bridge.forward_compatibility" ||
    report?.status !== "passed" ||
    report?.environment !== "staging" ||
    report?.proofMode !== "direct-remote-negative-contract" ||
    report?.backendContract !== "candidate-a-strict-turnstile"
  ) {
    violations.push("forward_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.candidateSha ?? "") ||
    (expected.candidateSha && report?.candidateSha !== expected.candidateSha) ||
    !UUID_PATTERN.test(expected.deploymentId ?? "") ||
    !SHA256.test(report?.deploymentIdentitySha256 ?? "") ||
    report?.deploymentIdentitySha256 !==
      createHash("sha256")
        .update(expected.deploymentId ?? "")
        .digest("hex") ||
    !exactOrigin(report?.origin, ORIGINS.staging) ||
    report?.origin !== "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev" ||
    !SHA256.test(report?.fixtureBindingSha256 ?? "")
  ) {
    violations.push("forward_binding_invalid");
  }
  if (
    !exactKeys(report?.requestShapes, ["legacyEnvelope", "hybridEnvelope"]) ||
    report?.requestShapes?.legacyEnvelope !== "form-id-version-without-captcha-token" ||
    report?.requestShapes?.hybridEnvelope !== "legacy-plus-form-key-version-without-captcha-token"
  ) {
    violations.push("forward_contracts_invalid");
  }
  if (
    !exactKeys(report?.remoteObservations, ["health", "legacyEnvelope", "hybridEnvelope"]) ||
    !exactKeys(report?.remoteObservations?.health, [
      "status",
      "environment",
      "releaseSha",
      "releaseHeaderSha",
    ]) ||
    report?.remoteObservations?.health?.status !== 200 ||
    report?.remoteObservations?.health?.environment !== "staging" ||
    report?.remoteObservations?.health?.releaseSha !== report?.candidateSha ||
    report?.remoteObservations?.health?.releaseHeaderSha !== report?.candidateSha ||
    !exactKeys(report?.remoteObservations?.legacyEnvelope, ["status", "error", "challengeRequired"]) ||
    report?.remoteObservations?.legacyEnvelope?.status !== 403 ||
    report?.remoteObservations?.legacyEnvelope?.error !== "Confirme a verificação de segurança." ||
    report?.remoteObservations?.legacyEnvelope?.challengeRequired !== true ||
    !exactKeys(report?.remoteObservations?.hybridEnvelope, ["status", "error"]) ||
    report?.remoteObservations?.hybridEnvelope?.status !== 400 ||
    report?.remoteObservations?.hybridEnvelope?.error !== "Revise os campos do formulário."
  ) {
    violations.push("forward_observations_invalid");
  }
  if (
    !exactKeys(report?.evidenceScope, ["observedHere", "notObservedHere", "complementaryEvidence"]) ||
    JSON.stringify(report?.evidenceScope?.observedHere) !== JSON.stringify(FORWARD_OBSERVED_HERE) ||
    JSON.stringify(report?.evidenceScope?.notObservedHere) !== JSON.stringify(FORWARD_NOT_OBSERVED_HERE) ||
    !exactKeys(report?.evidenceScope?.complementaryEvidence, [
      "adversarialTurnstilePolicy",
      "successfulCandidateBrowser",
    ]) ||
    report?.evidenceScope?.complementaryEvidence?.adversarialTurnstilePolicy !==
      "tests/unit/security-origin.test.ts" ||
    report?.evidenceScope?.complementaryEvidence?.successfulCandidateBrowser !==
      "cms-real-browser-attestation.json"
  ) {
    violations.push("forward_scope_invalid");
  }
  if (
    !exactKeys(report?.boundary, ["responseIdentifiersPersisted", "secretsPersisted"]) ||
    report?.boundary?.responseIdentifiersPersisted !== 0 ||
    report?.boundary?.secretsPersisted !== false
  ) {
    violations.push("forward_boundary_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function validatePublicBridgeFixtureReport(report, expected = {}) {
  const violations = [];
  const common = [
    "schemaVersion",
    "event",
    "phase",
    "status",
    "environment",
    "candidateSha",
    "runTag",
    "fixtureBindingSha256",
    "auditRetained",
    "identifiersPersisted",
    "secretsPersisted",
  ];
  const setup = report?.phase === "setup";
  const expectedKeys = setup
    ? [...common, "backendContract", "resources"]
    : [
        ...common,
        "activeProjections",
        "activePublications",
        "activeForms",
        "activeFormVersions",
        "activeLeads",
        "actionableLeadOutbox",
      ];
  if (
    !exactKeys(report, expectedKeys) ||
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.public_bridge.fixture" ||
    !["setup", "cleanup", "residue"].includes(report?.phase)
  ) {
    violations.push("fixture_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.candidateSha ?? "") ||
    (expected.candidateSha && report?.candidateSha !== expected.candidateSha) ||
    !["staging", "production"].includes(report?.environment) ||
    (expected.environment && report?.environment !== expected.environment) ||
    !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(report?.runTag ?? "") ||
    !SHA256.test(report?.fixtureBindingSha256 ?? "") ||
    report?.identifiersPersisted !== false ||
    report?.secretsPersisted !== false
  ) {
    violations.push("fixture_binding_invalid");
  }
  if (setup) {
    if (
      report?.status !== "ready" ||
      report?.backendContract !== "legacy-f48" ||
      !exactKeys(report?.resources, ["page", "campaign", "form"]) ||
      report?.resources?.page !== 1 ||
      report?.resources?.campaign !== 1 ||
      report?.resources?.form !== 1 ||
      report?.auditRetained !== true
    ) {
      violations.push("fixture_setup_invalid");
    }
  } else if (
    report?.status !== (report?.phase === "cleanup" ? "cleaned" : "passed") ||
    [
      "activeProjections",
      "activePublications",
      "activeForms",
      "activeFormVersions",
      "activeLeads",
      "actionableLeadOutbox",
    ].some((key) => report?.[key] !== 0) ||
    report?.auditRetained !== true
  ) {
    violations.push("fixture_terminal_invalid");
  }
  return { valid: violations.length === 0, violations: [...new Set(violations)] };
}

export function publicBridgeHeadlessSummary(headless, cleanup, residue) {
  return {
    mode: "headless-fail-closed",
    contract: headless.backendContract,
    origin: headless.origin,
    deploymentOrigin: headless.deploymentOrigin,
    deploymentIdentitySha256: headless.deploymentIdentitySha256,
    fixtureBindingSha256: headless.fixtureBindingSha256,
    pageRendered: headless.observations.renderedPages === 1,
    campaignRendered: headless.observations.renderedCampaigns === 1,
    formRendered: headless.observations.renderedForms === 1,
    turnstileWidgetRequested: headless.observations.turnstileScriptRequests > 0,
    turnstileNetworkFailureObserved:
      headless.observations.turnstileRequestFailures === headless.observations.turnstileScriptRequests,
    submitDisabledWithoutToken: headless.boundary.submitDisabledWithoutToken === true,
    unavailableFeedbackVisible: headless.boundary.unavailableFeedbackVisible === true,
    backendMutationRequests: headless.observations.backendMutationRequests,
    cleanupStatus: cleanup.status,
    residueStatus: residue.status,
    auditRetained: cleanup.auditRetained === true && residue.auditRetained === true,
  };
}
