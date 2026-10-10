import { percentile, serverTimingDuration } from "./system-assurance-lib.mjs";

// These statements expose counts and timings only, never SQL text or identities.
export const SNAPSHOT_DATABASE_DIAGNOSTIC_SQL = `
select 'snapshot' as operation, sum(calls)::bigint as calls,
       sum(total_exec_time)::double precision as total_ms,
       sum(shared_blks_hit)::bigint as shared_hits,
       sum(shared_blks_read)::bigint as shared_reads,
       (select stats_reset from extensions.pg_stat_statements_info) as stats_reset
from extensions.pg_stat_statements
where query like '%cms_get_system_snapshot_authenticated_timed%'
  and query not like '%pg_stat_statements%';`;

export function snapshotDiagnosticRequested(argv, env) {
  if (
    !argv.some((argument) =>
      ["--snapshot-diagnostic", "--snapshot-diagnostic-with-fixture"].includes(argument),
    )
  )
    return false;
  if (argv.length !== 1 || env.GITHUB_ACTIONS === "true" || env.CI === "true")
    throw new Error("G11_SNAPSHOT_DIAGNOSTIC_NOT_A_RELEASE");
  if (!env.EV2_G11_REPORT_PATH) throw new Error("G11_SNAPSHOT_DIAGNOSTIC_REPORT_REQUIRED");
  return true;
}

function databaseCounters(rows) {
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].operation !== "snapshot")
    throw new Error("G11_SNAPSHOT_DIAGNOSTIC_COUNTERS_INVALID");
  const row = rows[0];
  const counters = Object.fromEntries(
    ["calls", "total_ms", "shared_hits", "shared_reads"].map((key) => {
      const value = Number(row[key]);
      if (row[key] === null || !Number.isFinite(value) || value < 0)
        throw new Error("G11_SNAPSHOT_DIAGNOSTIC_COUNTERS_INVALID");
      return [key, value];
    }),
  );
  if (!Number.isFinite(Date.parse(row.stats_reset))) throw new Error("G11_SNAPSHOT_DIAGNOSTIC_RESET_INVALID");
  return { ...counters, statsReset: new Date(row.stats_reset).toISOString() };
}

export async function runSnapshotDiagnostic({
  readSnapshot,
  readDatabase,
  sourceSha,
  servedReleaseSha,
  fixtureProfile = "empty",
}) {
  if (!["empty", "resolved-lead"].includes(fixtureProfile))
    throw new Error("G11_SNAPSHOT_DIAGNOSTIC_FIXTURE_INVALID");
  if (![sourceSha, servedReleaseSha].every((sha) => /^[0-9a-f]{40}$/.test(sha ?? "")))
    throw new Error("G11_SNAPSHOT_DIAGNOSTIC_SHA_INVALID");
  const before = databaseCounters(await readDatabase(SNAPSHOT_DATABASE_DIAGNOSTIC_SQL));
  const samples = [];
  // One window only; same sample counts and server metric as the normative gate.
  for (let index = 0; index < 40; index += 1) {
    const startedAt = new Date().toISOString();
    const response = await readSnapshot();
    const timing = Object.fromEntries(
      ["admin-read", "admin-rpc", "admin-rate-limit", "admin-snapshot-db"].map((metric) => {
        const value = serverTimingDuration(response.headers, metric);
        if (!Number.isFinite(value) || value < 0) throw new Error("G11_SNAPSHOT_DIAGNOSTIC_TIMING_INVALID");
        return [metric, value];
      }),
    );
    if (
      response.status !== 200 ||
      response.json?.containsPersonalData !== false ||
      response.json?.environment !== "staging" ||
      !Number.isFinite(response.durationMs) ||
      response.durationMs < 0
    )
      throw new Error("G11_SNAPSHOT_DIAGNOSTIC_RESPONSE_INVALID");
    samples.push({
      ordinal: index + 1,
      phase: index < 20 ? "warmup" : "measured",
      startedAt,
      finishedAt: new Date().toISOString(),
      serverMs: timing["admin-read"],
      rpcMs: timing["admin-rpc"],
      rateLimitMs: timing["admin-rate-limit"],
      snapshotDbMs: timing["admin-snapshot-db"],
      wallMs: Math.round(response.durationMs * 100) / 100,
    });
  }
  const after = databaseCounters(await readDatabase(SNAPSHOT_DATABASE_DIAGNOSTIC_SQL));
  const comparable =
    before.statsReset === after.statsReset &&
    ["calls", "total_ms", "shared_hits", "shared_reads"].every((key) => after[key] >= before[key]);
  return {
    schemaVersion: 1,
    event: "g11.snapshot.diagnostic",
    sourceSha,
    servedReleaseSha,
    environment: "staging",
    syntheticOnly: true,
    containsPersonalData: false,
    releaseEligible: false,
    fixtureProfile,
    protocol: { sequence: "serial", warmups: 20, measured: 20, estimator: "nearest-rank", percentile: 95 },
    samples,
    database: {
      comparable,
      before,
      after,
      delta: comparable
        ? Object.fromEntries(
            ["calls", "total_ms", "shared_hits", "shared_reads"].map((key) => [
              key,
              after[key] - before[key],
            ]),
          )
        : null,
      attribution: "interval aggregate; not proof of exclusive attribution or historical root cause",
    },
    adminReadP95Ms: percentile(
      samples.slice(20).map((sample) => sample.serverMs),
      95,
    ),
    meaning: "focused diagnostic only; not canonical validation or authenticated Chrome UAT",
  };
}
