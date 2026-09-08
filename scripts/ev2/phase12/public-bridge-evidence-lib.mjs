import { createHash } from "node:crypto";

import { evaluateProbeWindow, G12_BUDGETS } from "./release-guard-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
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
    report.warmupSamplesPerRoute > 10 ||
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

export function validatePublicBridgeFunctionalCanary(report, expected = {}) {
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
      "turnstile",
    ]) ||
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.public_bridge.functional_canary" ||
    report?.status !== "passed"
  ) {
    violations.push("functional_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.frontendSha ?? "") ||
    (expected.candidateSha && report?.frontendSha !== expected.candidateSha) ||
    report?.backendContract !== (expected.backendContract ?? "legacy-f48")
  ) {
    violations.push("functional_contract_invalid");
  }
  if (
    !Object.hasOwn(ORIGINS, report?.environment ?? "") ||
    (expected.environment && report?.environment !== expected.environment) ||
    !exactOrigin(report?.origin, ORIGINS[report?.environment]) ||
    (expected.origin && report?.origin !== expected.origin)
  ) {
    violations.push("functional_origin_invalid");
  }
  const deploymentPattern =
    report?.environment === "production"
      ? /^https:\/\/(?:[a-z0-9-]+\.gaiatec-website\.pages\.dev|(?:www\.)?gaiatecsistemas\.com\.br)$/
      : ORIGINS.staging;
  if (
    !exactOrigin(report?.deploymentOrigin, deploymentPattern) ||
    (expected.deploymentOrigin && report?.deploymentOrigin !== expected.deploymentOrigin) ||
    !SHA256.test(report?.deploymentIdentitySha256 ?? "") ||
    !SHA256.test(report?.fixtureBindingSha256 ?? "")
  ) {
    violations.push("functional_deployment_invalid");
  }
  const legacy = report?.backendContract === "legacy-f48";
  if (
    !exactKeys(report?.contracts, ["page", "campaign", "form", "lead", "duplicate"]) ||
    report?.contracts?.page !== "legacy-row-normalized-and-rendered" ||
    report?.contracts?.campaign !== "legacy-row-normalized-and-rendered" ||
    report?.contracts?.form !== "legacy-f48-normalized-and-rendered" ||
    report?.contracts?.lead !== "legacy-f48-exact-201" ||
    report?.contracts?.duplicate !== "same-idempotency-key-201-duplicate" ||
    !legacy
  ) {
    violations.push("functional_cases_invalid");
  }
  if (
    !exactKeys(report?.observations, [
      "renderedPages",
      "renderedCampaigns",
      "renderedForms",
      "browserLeadRequests",
      "acceptedLeads",
      "duplicateReplays",
      "unexpectedConsole",
      "requestFailures",
    ]) ||
    report?.observations?.renderedPages !== 1 ||
    report?.observations?.renderedCampaigns !== 1 ||
    report?.observations?.renderedForms !== 1 ||
    report?.observations?.browserLeadRequests !== 1 ||
    report?.observations?.acceptedLeads !== 1 ||
    report?.observations?.duplicateReplays !== 1 ||
    report?.observations?.unexpectedConsole !== 0 ||
    report?.observations?.requestFailures !== 0
  ) {
    violations.push("functional_observations_invalid");
  }
  if (
    !exactKeys(report?.boundary, [
      "uuidInDomOrStorage",
      "legacyIdsPersisted",
      "hybridPayloads",
      "retryPayloads",
      "secretsPersisted",
    ]) ||
    report?.boundary?.uuidInDomOrStorage !== 0 ||
    report?.boundary?.legacyIdsPersisted !== false ||
    report?.boundary?.hybridPayloads !== 0 ||
    report?.boundary?.retryPayloads !== 0 ||
    report?.boundary?.secretsPersisted !== false ||
    report?.turnstile !== `official-${report?.environment}-widget-token`
  ) {
    violations.push("functional_boundary_invalid");
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
      "frontendSha",
      "backendContract",
      "origin",
      "fixtureBindingSha256",
      "contracts",
      "observations",
      "boundary",
    ]) ||
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.public_bridge.forward_compatibility" ||
    report?.status !== "passed" ||
    report?.environment !== "staging" ||
    report?.backendContract !== "forward-expand-contract"
  ) {
    violations.push("forward_schema_invalid");
  }
  if (
    !FULL_SHA.test(report?.frontendSha ?? "") ||
    (expected.candidateSha && report?.frontendSha !== expected.candidateSha) ||
    !exactOrigin(report?.origin, ORIGINS.staging) ||
    report?.origin !== "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev" ||
    !SHA256.test(report?.fixtureBindingSha256 ?? "")
  ) {
    violations.push("forward_binding_invalid");
  }
  if (
    !exactKeys(report?.contracts, [
      "frontendAToCandidate",
      "loadedF48TabToCandidate",
      "duplicateReplay",
      "productIdor",
      "hybridEnvelope",
    ]) ||
    report?.contracts?.frontendAToCandidate !== "public-v2-exact-201" ||
    report?.contracts?.loadedF48TabToCandidate !== "legacy-f48-exact-201" ||
    report?.contracts?.duplicateReplay !== "legacy-f48-same-idempotency-201-duplicate" ||
    report?.contracts?.productIdor !== "legacy-product-id-unbound-422" ||
    report?.contracts?.hybridEnvelope !== "mixed-generation-400"
  ) {
    violations.push("forward_contracts_invalid");
  }
  if (
    !exactKeys(report?.observations, [
      "modernAccepted",
      "legacyAccepted",
      "duplicateAccepted",
      "productIdorRejected",
      "hybridRejected",
      "automaticRetries",
    ]) ||
    report?.observations?.modernAccepted !== 1 ||
    report?.observations?.legacyAccepted !== 1 ||
    report?.observations?.duplicateAccepted !== 1 ||
    report?.observations?.productIdorRejected !== 1 ||
    report?.observations?.hybridRejected !== 1 ||
    report?.observations?.automaticRetries !== 0 ||
    !exactKeys(report?.boundary, ["responseIds", "secretsPersisted"]) ||
    report?.boundary?.responseIds !== 0 ||
    report?.boundary?.secretsPersisted !== false
  ) {
    violations.push("forward_observations_invalid");
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

export function publicBridgeCanarySummary(functional, cleanup, residue) {
  return {
    contract: functional.backendContract,
    origin: functional.origin,
    deploymentOrigin: functional.deploymentOrigin,
    deploymentIdentitySha256: functional.deploymentIdentitySha256,
    fixtureBindingSha256: functional.fixtureBindingSha256,
    pageRendered: functional.observations.renderedPages === 1,
    campaignRendered: functional.observations.renderedCampaigns === 1,
    formRendered: functional.observations.renderedForms === 1,
    leadAccepted201: functional.observations.acceptedLeads === 1,
    duplicateAccepted201: functional.observations.duplicateReplays === 1,
    cleanupStatus: cleanup.status,
    residueStatus: residue.status,
    auditRetained: cleanup.auditRetained === true && residue.auditRetained === true,
  };
}
