import { evaluateSystemEvidence } from "./system-assurance-lib.mjs";

const baseline = {
  totalChecks: 180,
  passedChecks: 180,
  p0Count: 0,
  p1Count: 0,
  accessibilityCritical: 0,
  accessibilitySerious: 0,
  securityStatus: "passed",
  restoreStatus: "passed",
  syntheticOnly: true,
  realDataUsed: false,
  metrics: {
    availabilityPercent: 99.9,
    adminReadP95Ms: 500,
    commandP95Ms: 800,
    outboxLagP95Ms: 60_000,
    auditCoveragePercent: 100,
    restoreRpoMinutes: 0,
    restoreRtoMinutes: 15,
  },
};

const scenarios = [
  ["all_thresholds_at_boundary", baseline, true],
  ["one_failed_check", { ...baseline, passedChecks: 179 }, false],
  ["p0_blocks", { ...baseline, p0Count: 1 }, false],
  ["p1_blocks", { ...baseline, p1Count: 1 }, false],
  ["critical_a11y_blocks", { ...baseline, accessibilityCritical: 1 }, false],
  ["serious_a11y_blocks", { ...baseline, accessibilitySerious: 1 }, false],
  ["security_blocks", { ...baseline, securityStatus: "failed" }, false],
  ["restore_blocks", { ...baseline, restoreStatus: "failed" }, false],
  ["real_data_blocks", { ...baseline, realDataUsed: true }, false],
  [
    "availability_blocks",
    { ...baseline, metrics: { ...baseline.metrics, availabilityPercent: 99.899 } },
    false,
  ],
  ["read_latency_blocks", { ...baseline, metrics: { ...baseline.metrics, adminReadP95Ms: 501 } }, false],
  ["command_latency_blocks", { ...baseline, metrics: { ...baseline.metrics, commandP95Ms: 801 } }, false],
  ["outbox_lag_blocks", { ...baseline, metrics: { ...baseline.metrics, outboxLagP95Ms: 60_001 } }, false],
  ["audit_gap_blocks", { ...baseline, metrics: { ...baseline.metrics, auditCoveragePercent: 99.99 } }, false],
  ["rpo_blocks", { ...baseline, metrics: { ...baseline.metrics, restoreRpoMinutes: 1 } }, false],
  ["rto_blocks", { ...baseline, metrics: { ...baseline.metrics, restoreRtoMinutes: 16 } }, false],
];

const results = scenarios.map(([name, evidence, expected]) => {
  const evaluation = evaluateSystemEvidence(evidence);
  return { name, expected, actual: evaluation.passed, failed: evaluation.failed };
});
const failures = results.filter((result) => result.expected !== result.actual);
if (failures.length) throw new Error("Regras G11 inconsistentes: " + JSON.stringify(failures));

console.log(
  JSON.stringify(
    {
      outcome: "G11_RULES_PASS",
      scenarios: results.length,
      passed: results.length - failures.length,
      boundaryAccepted: results[0].actual,
      falseAcceptances: results.filter((result) => result.expected === false && result.actual === true)
        .length,
      realDataUsed: false,
      productionMutations: 0,
    },
    null,
    2,
  ),
);
