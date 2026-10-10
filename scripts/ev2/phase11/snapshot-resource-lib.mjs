// Closed numeric projection: never persist Prometheus labels, identities or raw text.
const gauges = new Set([
  "node_cpu_online",
  "node_load1",
  "node_memory_MemAvailable_bytes",
  "node_memory_MemTotal_bytes",
  "pgrst_db_pool_waiting",
  "pgbouncer_pools_client_waiting_connections",
  "postgres_active_connections",
  "postgres_active_lock_waits",
  "postgres_active_io_waits",
  "postgres_active_running",
  "postgres_idle_transactions",
  "postgres_blocked_connections",
]);
const modes = new Set(["idle", "iowait", "irq", "nice", "softirq", "steal", "system", "user"]);

export const SNAPSHOT_RESOURCE_WAIT_SQL = `select
  count(*) filter(where state='active') as active_connections,
  count(*) filter(where state='active' and wait_event_type='Lock') as active_lock_waits,
  count(*) filter(where state='active' and wait_event_type='IO') as active_io_waits,
  count(*) filter(where state='active' and wait_event_type is null) as active_running,
  count(*) filter(where state='idle in transaction') as idle_transactions,
  count(*) filter(where cardinality(pg_blocking_pids(pid))>0) as blocked_connections
from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid();`;

export function resourceWaitMetrics(rows) {
  const keys = [
    "active_connections",
    "active_lock_waits",
    "active_io_waits",
    "active_running",
    "idle_transactions",
    "blocked_connections",
  ];
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("G11_RESOURCE_WAITS_INVALID");
  return keys
    .map((key) => {
      const value = Number(rows[0][key]);
      if (rows[0][key] == null || !Number.isSafeInteger(value) || value < 0)
        throw new Error("G11_RESOURCE_WAITS_INVALID");
      return `postgres_${key} ${value}`;
    })
    .join("\n");
}

// Infrastructure scrapes follow the documented one-minute cadence. Live wait
// counts remain separate, fresh reads at the observer's bounded cadence.
export function createResourceMetricsReader({ readMetrics, readWaits, now = Date.now }) {
  let cached;
  let fetchedAt = -Infinity;
  return async () => {
    if (cached === undefined || now() - fetchedAt >= 60_000) {
      cached = await readMetrics();
      fetchedAt = now();
    }
    return cached + "\n" + resourceWaitMetrics(await readWaits());
  };
}

export function sanitizeResourceMetrics(text) {
  if (typeof text !== "string" || text.length > 4 * 1024 * 1024)
    throw new Error("G11_RESOURCE_METRICS_INVALID");
  const counters = {};
  for (const line of text.split("\n")) {
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{(.*)\})?\s+(\S+)(?:\s+\d+)?\s*$/.exec(line);
    if (!match) continue;
    const [, name, labels = "", raw] = match;
    let key;
    if (gauges.has(name)) key = name;
    else if (name === "node_cpu_seconds_total") {
      const mode = /(?:^|,)\s*mode="([a-z]+)"(?:,|$)/.exec(labels)?.[1];
      if (modes.has(mode)) key = "cpu_" + mode + "_seconds_total";
    }
    if (!key) continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error("G11_RESOURCE_METRICS_INVALID");
    counters[key] = (counters[key] ?? 0) + value;
  }
  if (!Object.hasOwn(counters, "cpu_idle_seconds_total") || !Object.hasOwn(counters, "node_cpu_online"))
    throw new Error("G11_RESOURCE_METRICS_MISSING");
  return counters;
}

// No timer, overlap, retry or extra snapshot request. Launch at most once per five
// seconds within the existing window; await only at closure, not in measured RPCs.
export function createResourceObserver(readMetrics, now = Date.now) {
  const samples = [];
  let pending;
  let lastStarted = -Infinity;
  let attempted = 0;
  let failure = false;
  return {
    sample() {
      if (pending || failure || attempted >= 13 || now() - lastStarted < 5_000) return;
      lastStarted = now();
      attempted++;
      const startedAt = new Date(lastStarted).toISOString();
      pending = Promise.resolve()
        .then(readMetrics)
        .then(sanitizeResourceMetrics)
        .then((counters) => samples.push({ startedAt, finishedAt: new Date(now()).toISOString(), counters }))
        .catch(() => {
          failure = true;
        })
        .finally(() => {
          pending = undefined;
        });
    },
    async finish() {
      await pending;
      return {
        samples,
        attempted,
        failureCode: failure ? "G11_RESOURCE_METRICS_UNAVAILABLE" : null,
        coverageLimited: attempted >= 13,
        intervalMinimumMs: 5_000,
        maximumRequests: 13,
        meaning: "concurrent aggregate resource observations; correlation is not exclusive root-cause proof",
      };
    },
  };
}
