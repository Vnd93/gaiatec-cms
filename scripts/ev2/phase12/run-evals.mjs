import {
  evaluateProbeWindow,
  evaluateRolloutAdvance,
  evaluateRolloutWindow,
  validateApprovalRecord,
} from "./release-guard-lib.mjs";

const sha = "a".repeat(40);
const baseWindow = {
  candidateSha: sha,
  environment: "staging",
  stage: "staging-canary",
  startedAt: "2026-09-04T10:00:00.000Z",
  endedAt: "2026-09-04T10:05:00.000Z",
  sampleCount: 20,
  availabilityPercent: 100,
  http5xxRatePercent: 0,
  publicP95Ms: 500,
  releaseHeadersExact: true,
  healthContractValid: true,
  manifestReleaseExact: true,
  routeBudgetsValid: true,
  nonProductionNoindexValid: true,
  p0Count: 0,
  p1Count: 0,
  securityIncidentCount: 0,
  projectionDivergenceCount: 0,
  accessibilityCriticalCount: 0,
  accessibilitySeriousCount: 0,
  securityReviewStatus: "passed",
  privacyReviewStatus: "passed",
  projectionComparisonStatus: "passed",
  restoreStatus: "passed",
  adminReadP95Ms: 400,
  commandP95Ms: 650,
  outboxLagP95Ms: 0,
};

const healthyWindows = [0, 10, 20].map((offsetMinutes) => {
  const startedAt = new Date(Date.UTC(2026, 8, 4, 10, offsetMinutes));
  return {
    ...baseWindow,
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + 5 * 60_000).toISOString(),
  };
});

const scenarios = [
  ["healthy_probe", true, () => evaluateProbeWindow(baseWindow).healthy],
  ["invalid_sha", false, () => evaluateProbeWindow({ ...baseWindow, candidateSha: "short" }).healthy],
  ["low_availability", false, () => evaluateProbeWindow({ ...baseWindow, availabilityPercent: 99 }).healthy],
  ["http_5xx", false, () => evaluateProbeWindow({ ...baseWindow, http5xxRatePercent: 0.2 }).healthy],
  ["slow_public", false, () => evaluateProbeWindow({ ...baseWindow, publicP95Ms: 1501 }).healthy],
  [
    "release_mismatch",
    false,
    () => evaluateProbeWindow({ ...baseWindow, releaseHeadersExact: false }).healthy,
  ],
  ["healthy_full_window", true, () => evaluateRolloutWindow(baseWindow).healthy],
  ["p0_pauses", false, () => evaluateRolloutWindow({ ...baseWindow, p0Count: 1 }).healthy],
  ["p1_pauses", false, () => evaluateRolloutWindow({ ...baseWindow, p1Count: 1 }).healthy],
  [
    "security_pauses",
    false,
    () => evaluateRolloutWindow({ ...baseWindow, securityIncidentCount: 1 }).healthy,
  ],
  [
    "divergence_pauses",
    false,
    () => evaluateRolloutWindow({ ...baseWindow, projectionDivergenceCount: 1 }).healthy,
  ],
  ["restore_pauses", false, () => evaluateRolloutWindow({ ...baseWindow, restoreStatus: "failed" }).healthy],
  [
    "three_windows_advance",
    true,
    () =>
      evaluateRolloutAdvance({
        candidateSha: sha,
        currentStage: "staging-canary",
        nextStage: "production-shell",
        windows: healthyWindows,
      }).allowed,
  ],
  [
    "two_windows_pause",
    false,
    () =>
      evaluateRolloutAdvance({
        candidateSha: sha,
        currentStage: "staging-canary",
        nextStage: "production-shell",
        windows: [baseWindow, baseWindow],
      }).allowed,
  ],
  [
    "skip_stage_pause",
    false,
    () =>
      evaluateRolloutAdvance({
        candidateSha: sha,
        currentStage: "staging-canary",
        nextStage: "production-5",
        windows: [baseWindow, baseWindow, baseWindow],
      }).allowed,
  ],
  [
    "failed_window_pause",
    false,
    () =>
      evaluateRolloutAdvance({
        candidateSha: sha,
        currentStage: "staging-canary",
        nextStage: "production-shell",
        windows: [baseWindow, baseWindow, { ...baseWindow, p1Count: 1 }],
      }).allowed,
  ],
  [
    "pending_approval_refused",
    false,
    () =>
      validateApprovalRecord(
        { gate: "G12", decision: "pending" },
        { expectedSha: sha, expectedEnvironment: "production" },
      ).valid,
  ],
  [
    "incomplete_legacy_approval_refused",
    false,
    () =>
      validateApprovalRecord(
        {
          schemaVersion: 1,
          gate: "G12",
          decision: "approved",
          candidateSha: sha,
          environment: "production",
          changeReference: "CHG-12",
          g11EvidenceRunId: "7466a0d3-021f-4c60-ad82-61e76b93844f",
          requestedBy: "OP-01",
          productionAuthorized: true,
          productionAuthorizationText: "AUTORIZO-G12-PRODUCAO",
          dpoLegalStatus: "approved",
          target: {
            cloudflareProject: "gaiatec-website",
            domains: ["gaiatecsistemas.com.br", "www.gaiatecsistemas.com.br"],
          },
          rollback: { deploymentId: "ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf", release: "b".repeat(40) },
          changeWindow: { startsAt: "2026-09-04T09:00:00.000Z", endsAt: "2026-09-04T12:00:00.000Z" },
          owners: Object.fromEntries(
            ["changeOwner", "technicalReviewer", "securityPrivacyOwner", "businessOwner"].map((role) => [
              role,
              { id: "OP-01", approvedAt: "2026-09-04T09:00:00.000Z" },
            ]),
          ),
        },
        { expectedSha: sha, expectedEnvironment: "production" },
      ).valid,
  ],
];

const failures = scenarios.filter(([, expected, execute]) => execute() !== expected).map(([name]) => name);
const report = {
  outcome: failures.length === 0 ? "G12_RULES_PASS" : "G12_RULES_FAIL",
  scenarios: scenarios.length,
  falseAcceptances: failures.length,
  failures,
  realDataUsed: false,
  productionMutations: 0,
};
console.log(JSON.stringify(report));
if (failures.length) process.exitCode = 1;
