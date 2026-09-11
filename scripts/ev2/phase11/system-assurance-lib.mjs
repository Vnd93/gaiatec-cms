export const G11_BASELINES = Object.freeze({
  availabilityPercent: 99.9,
  adminReadP95Ms: 500,
  commandP95Ms: 800,
  outboxLagP95Ms: 60_000,
  auditCoveragePercent: 100,
  restoreRpoMinutes: 0,
  restoreRtoMinutes: 15,
  accessibilityCritical: 0,
  accessibilitySerious: 0,
  p0Count: 0,
  p1Count: 0,
});

const finite = (value) => typeof value === "number" && Number.isFinite(value);

// A direcao de cada comparacao mora aqui porque o orcamento diz o limite mas nao de que lado dele se
// deve estar. Os limites em si vem do backend, na resposta de capability: comparar contra essa fonte,
// e nao contra uma copia local, e o que impede a verificacao do canario de divergir em silencio do
// que o banco aplica ao decidir `measured`.
const BASELINE_DIRECTION = Object.freeze({
  availabilityPercent: "atLeast",
  auditCoveragePercent: "atLeast",
  adminReadP95Ms: "atMost",
  commandP95Ms: "atMost",
  outboxLagP95Ms: "atMost",
  restoreRtoMinutes: "atMost",
  restoreRpoMinutes: "exactly",
  accessibilityCritical: "exactly",
  accessibilitySerious: "exactly",
  p0Count: "exactly",
  p1Count: "exactly",
});

export function budgetsMissed(baselines, measured) {
  const missed = [];
  for (const [metric, required] of Object.entries(baselines ?? {})) {
    const direction = BASELINE_DIRECTION[metric];
    // Orcamento novo que este canario nao sabe comparar nao pode passar despercebido: trata-lo como
    // satisfeito transformaria ignorancia em aprovacao.
    if (!direction) throw new Error(`G11_UNKNOWN_BASELINE_DIRECTION:${metric}`);
    const observed = measured?.[metric];
    if (typeof observed !== "number" || !Number.isFinite(observed)) {
      missed.push({ metric, observed: null, required, direction });
      continue;
    }
    const satisfied =
      direction === "atLeast"
        ? observed >= required
        : direction === "atMost"
          ? observed <= required
          : observed === required;
    if (!satisfied) missed.push({ metric, observed, required, direction });
  }
  return missed;
}

export function percentile(values, percentileValue) {
  if (!Array.isArray(values) || values.length === 0) throw new Error("Amostra vazia.");
  if (!finite(percentileValue) || percentileValue <= 0 || percentileValue > 100)
    throw new Error("Percentil inválido.");
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (sorted.length !== values.length) throw new Error("Amostra contém valor inválido.");
  return sorted[Math.max(0, Math.ceil((percentileValue / 100) * sorted.length) - 1)];
}

export function summarizeDurations(durations) {
  return {
    samples: durations.length,
    minMs: Math.round(Math.min(...durations) * 100) / 100,
    p50Ms: Math.round(percentile(durations, 50) * 100) / 100,
    p95Ms: Math.round(percentile(durations, 95) * 100) / 100,
    p99Ms: Math.round(percentile(durations, 99) * 100) / 100,
    maxMs: Math.round(Math.max(...durations) * 100) / 100,
  };
}

export function serverTimingDuration(headers, metric) {
  const value = headers?.get?.("server-timing") ?? "";
  const match = value.match(new RegExp(`(?:^|,)\\s*${metric};dur=([0-9.]+)(?:,|$)`, "i"));
  return match ? Number(match[1]) : Number.NaN;
}

export function evaluateSystemEvidence(evidence) {
  const metrics = evidence?.metrics ?? {};
  const checks = [
    ["all_checks_pass", evidence?.totalChecks > 0 && evidence?.passedChecks === evidence?.totalChecks],
    ["zero_p0", evidence?.p0Count === G11_BASELINES.p0Count],
    ["zero_p1", evidence?.p1Count === G11_BASELINES.p1Count],
    ["accessibility_critical", evidence?.accessibilityCritical === G11_BASELINES.accessibilityCritical],
    ["accessibility_serious", evidence?.accessibilitySerious === G11_BASELINES.accessibilitySerious],
    ["security", evidence?.securityStatus === "passed"],
    ["restore", evidence?.restoreStatus === "passed"],
    ["synthetic_only", evidence?.syntheticOnly === true && evidence?.realDataUsed === false],
    [
      "availability",
      finite(metrics.availabilityPercent) && metrics.availabilityPercent >= G11_BASELINES.availabilityPercent,
    ],
    [
      "admin_read_p95",
      finite(metrics.adminReadP95Ms) && metrics.adminReadP95Ms <= G11_BASELINES.adminReadP95Ms,
    ],
    ["command_p95", finite(metrics.commandP95Ms) && metrics.commandP95Ms <= G11_BASELINES.commandP95Ms],
    [
      "outbox_lag_p95",
      finite(metrics.outboxLagP95Ms) && metrics.outboxLagP95Ms <= G11_BASELINES.outboxLagP95Ms,
    ],
    [
      "audit_coverage",
      finite(metrics.auditCoveragePercent) &&
        metrics.auditCoveragePercent >= G11_BASELINES.auditCoveragePercent,
    ],
    [
      "restore_rpo",
      finite(metrics.restoreRpoMinutes) && metrics.restoreRpoMinutes === G11_BASELINES.restoreRpoMinutes,
    ],
    [
      "restore_rto",
      finite(metrics.restoreRtoMinutes) && metrics.restoreRtoMinutes <= G11_BASELINES.restoreRtoMinutes,
    ],
  ].map(([key, passed]) => ({ key, passed: passed === true }));
  return {
    passed: checks.every((check) => check.passed),
    checks,
    failed: checks.filter((check) => !check.passed).map((check) => check.key),
    requiresIndependentReview: checks.every((check) => check.passed),
  };
}

export async function runHttpLoadProbe({
  url,
  requests = 30,
  concurrency = 5,
  requestInit = {},
  acceptedStatuses = [200],
  timeoutMs = 10_000,
}) {
  if (!/^https?:\/\//.test(url)) throw new Error("URL HTTP(S) obrigatória.");
  if (!Number.isInteger(requests) || requests < 1 || requests > 1000) throw new Error("Volume inválido.");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 25)
    throw new Error("Concorrência inválida.");
  let next = 0;
  let succeeded = 0;
  const durations = [];
  const statuses = {};
  async function worker() {
    while (next < requests) {
      next += 1;
      const startedAt = performance.now();
      try {
        const response = await fetch(url, {
          ...requestInit,
          signal: AbortSignal.timeout(timeoutMs),
        });
        durations.push(performance.now() - startedAt);
        statuses[response.status] = (statuses[response.status] ?? 0) + 1;
        if (acceptedStatuses.includes(response.status)) succeeded += 1;
        await response.body?.cancel();
      } catch {
        durations.push(performance.now() - startedAt);
        statuses.network_error = (statuses.network_error ?? 0) + 1;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, requests) }, () => worker()));
  return {
    requests,
    succeeded,
    availabilityPercent: Math.round((succeeded / requests) * 100_000) / 1000,
    durations: summarizeDurations(durations),
    statuses,
  };
}
