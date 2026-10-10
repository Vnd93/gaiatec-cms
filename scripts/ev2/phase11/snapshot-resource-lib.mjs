// Closed numeric projection: never persist Prometheus labels, identities or raw text.
const gauges = new Set([
  "node_cpu_online",
  "node_load1",
  "node_memory_MemAvailable_bytes",
  "node_memory_MemTotal_bytes",
  "pgrst_db_pool_waiting",
  "pgbouncer_pools_client_waiting_connections",
]);
const modes = new Set(["idle", "iowait", "irq", "nice", "softirq", "steal", "system", "user"]);

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
