// Read-only staging diagnostics. Never expose SQL, actor/session IDs or payloads.
export const EDITORIAL_ACTIVITY_SQL = `
select count(*)::int as active,
  count(*) filter (where wait_event_type = 'Lock')::int as lock_waits,
  count(*) filter (where wait_event_type = 'IO')::int as io_waits,
  count(*) filter (where wait_event_type is null)::int as running,
  count(*) filter (where cardinality(pg_blocking_pids(pid)) > 0)::int as blocked,
  coalesce(max(extract(epoch from clock_timestamp() - query_start) * 1000), 0)::float8 as oldest_ms
from pg_stat_activity
where datname = current_database() and pid <> pg_backend_pid()
  and backend_type = 'client backend' and usename = 'authenticator'
  and state = 'active' and position('cms_execute_editorial_command' in query) > 0;
`;

function safeSample(rows) {
  if (!Array.isArray(rows) || rows.length !== 1) throw new Error("OBSERVATION_INVALID");
  const result = {};
  for (const key of ["active", "lock_waits", "io_waits", "running", "blocked", "oldest_ms"]) {
    const value = rows[0]?.[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1_000_000)
      throw new Error("OBSERVATION_INVALID");
    if (key !== "oldest_ms" && !Number.isInteger(value)) throw new Error("OBSERVATION_INVALID");
    result[key] = value;
  }
  return result;
}

export async function observeEditorialPublication({ operation, sample, report, now = Date.now }) {
  const controller = new AbortController();
  const started = now();
  const observations = [];
  let unavailable = 0;
  const observer = (async () => {
    // Bounded, abortable observation only; no retries of the business command.
    for (let index = 0; index < 12 && !controller.signal.aborted; index += 1) {
      try {
        const rows = await sample(EDITORIAL_ACTIVITY_SQL, controller.signal);
        if (!controller.signal.aborted)
          observations.push({ elapsedMs: Math.max(0, now() - started), ...safeSample(rows) });
      } catch {
        if (!controller.signal.aborted) unavailable += 1;
      }
      if (controller.signal.aborted) break;
      await new Promise((resolve) => {
        const done = () => {
          clearTimeout(timer);
          controller.signal.removeEventListener("abort", done);
          resolve();
        };
        const timer = setTimeout(done, 250);
        controller.signal.addEventListener("abort", done, { once: true });
      });
    }
  })();
  try {
    return await operation();
  } finally {
    controller.abort();
    await observer;
    report({
      event: "qa.editorial.publication_activity",
      durationMs: Math.max(0, now() - started),
      observations,
      unavailable,
    });
  }
}
