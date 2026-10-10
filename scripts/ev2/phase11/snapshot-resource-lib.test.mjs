import assert from "node:assert/strict";
import test from "node:test";
import {
  createResourceObserver,
  sanitizeResourceMetrics,
  resourceWaitMetrics,
  SNAPSHOT_RESOURCE_WAIT_SQL,
  createResourceMetricsReader,
} from "./snapshot-resource-lib.mjs";

const metrics = `node_cpu_seconds_total{cpu="0",mode="idle",instance="SENSITIVE_SENTINEL"} 100
node_cpu_seconds_total{cpu="1",mode="idle"} 150
node_cpu_seconds_total{cpu="0",mode="user"} 20
node_cpu_online{instance="SENSITIVE_SENTINEL"} 2
pgrst_db_pool_waiting{user="SENSITIVE_SENTINEL"} 3
unknown_private_metric{token="SENSITIVE_SENTINEL"} 999`;

test("infrastructure metrics use a one-minute cadence while live waits stay independent", async () => {
  let clock = 0;
  let scrapes = 0;
  let waits = 0;
  const read = createResourceMetricsReader({
    now: () => clock,
    readMetrics: async () => {
      scrapes++;
      return metrics;
    },
    readWaits: async () => {
      waits++;
      return [
        {
          active_connections: 0,
          active_lock_waits: 0,
          active_io_waits: 0,
          active_running: 0,
          idle_transactions: 0,
          blocked_connections: 0,
        },
      ];
    },
  });
  for (clock = 0; clock < 60_000; clock += 5_000) await read();
  assert.equal(scrapes, 1);
  assert.equal(waits, 12);
  await read();
  assert.equal(scrapes, 2);
  assert.equal(waits, 13);
});

test("live waits contain only bounded aggregate counts, never SQL text or session identities", () => {
  const row = {
    active_connections: 2,
    active_lock_waits: 1,
    active_io_waits: 0,
    active_running: 1,
    idle_transactions: 0,
    blocked_connections: 1,
    ignored: "SENSITIVE_SENTINEL",
  };
  const waits = resourceWaitMetrics([row]);
  assert.equal(sanitizeResourceMetrics(metrics + "\n" + waits).postgres_blocked_connections, 1);
  assert.ok(!waits.includes("SENSITIVE_SENTINEL"));
  for (const value of [null, undefined, -1, 1.5, Infinity])
    assert.throws(() => resourceWaitMetrics([{ ...row, active_connections: value }]));
  assert.doesNotMatch(
    SNAPSHOT_RESOURCE_WAIT_SQL,
    /\b(?:insert|update|delete|alter|set|reset|query|usename|user_id)\b/i,
  );
  assert.match(SNAPSHOT_RESOURCE_WAIT_SQL, /pid<>pg_backend_pid/);
});

test("numeric allowlist aggregates CPU modes and gauges without raw labels or identities", () => {
  const result = sanitizeResourceMetrics(metrics);
  assert.deepEqual(result, {
    cpu_idle_seconds_total: 250,
    cpu_user_seconds_total: 20,
    node_cpu_online: 2,
    pgrst_db_pool_waiting: 3,
  });
  assert.ok(!JSON.stringify(result).includes("SENSITIVE_SENTINEL"));
  for (const value of ["NaN", "Inf", "-1"])
    assert.throws(() => sanitizeResourceMetrics(metrics.replace("} 100", "} " + value)));
  assert.throws(() => sanitizeResourceMetrics("unrelated 1"));
});

test("observer bounds cadence and request count with no overlap, retries or raw error", async () => {
  let clock = 0;
  let calls = 0;
  const observer = createResourceObserver(
    async () => {
      calls++;
      return metrics;
    },
    () => clock,
  );
  for (let i = 0; i < 20; i++) {
    observer.sample();
    observer.sample();
    await observer.finish();
    clock += 5000;
  }
  const evidence = await observer.finish();
  assert.equal(calls, 13);
  assert.equal(evidence.samples.length, 13);
  assert.equal(evidence.coverageLimited, true);
  let earlyCalls = 0;
  const early = createResourceObserver(
    async () => {
      earlyCalls++;
      return metrics;
    },
    () => clock,
  );
  early.sample();
  await early.finish();
  clock += 4999;
  early.sample();
  await early.finish();
  assert.equal(earlyCalls, 1);
  clock++;
  early.sample();
  await early.finish();
  assert.equal(earlyCalls, 2);
  const failed = createResourceObserver(async () => {
    throw new Error("SENSITIVE_SENTINEL");
  });
  failed.sample();
  await failed.finish();
  failed.sample();
  const failure = await failed.finish();
  assert.equal(failure.attempted, 1);
  assert.equal(failure.failureCode, "G11_RESOURCE_METRICS_UNAVAILABLE");
  assert.ok(!JSON.stringify(failure).includes("SENSITIVE_SENTINEL"));
});
