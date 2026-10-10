import assert from "node:assert/strict";
import test from "node:test";
import { EDITORIAL_ACTIVITY_SQL, observeEditorialPublication } from "./editorial-publication-observer.mjs";

const row = { active: 1, lock_waits: 1, io_waits: 0, running: 0, blocked: 1, oldest_ms: 800 };

test("observer SQL is read-only, bounded to PostgREST editorial activity and projects no identities", () => {
  assert.match(EDITORIAL_ACTIVITY_SQL, /usename = 'authenticator'/);
  assert.match(EDITORIAL_ACTIVITY_SQL, /pid <> pg_backend_pid\(\)/);
  assert.match(EDITORIAL_ACTIVITY_SQL, /cms_execute_editorial_command/);
  assert.doesNotMatch(EDITORIAL_ACTIVITY_SQL, /\b(insert|update|delete|alter|set|cancel|terminate)\b/i);
  assert.doesNotMatch(
    EDITORIAL_ACTIVITY_SQL.split("from pg_stat_activity")[0],
    /\b(query|client_addr|usename|session|actor)\b/i,
  );
});

test("preserves the exact command result and excludes extra payload fields", async () => {
  const result = { status: 200 };
  let report;
  const observed = await observeEditorialPublication({
    sample: async () => [{ ...row, token: "sensitive", query: "sensitive" }],
    operation: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return result;
    },
    report: (value) => {
      report = value;
    },
  });
  assert.equal(observed, result);
  assert.equal(report.observations.length, 1);
  assert.equal(report.observations[0].blocked, 1);
  assert.doesNotMatch(JSON.stringify(report), /sensitive|token|query/);
});

test("preserves the exact failure, aborts the sampler and never repeats publication", async () => {
  const failure = new Error("business failure");
  let calls = 0;
  let aborted = false;
  await assert.rejects(
    observeEditorialPublication({
      sample: (_query, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("secret"));
            },
            { once: true },
          );
        }),
      operation: async () => {
        calls += 1;
        throw failure;
      },
      report: () => {},
    }),
    (error) => error === failure,
  );
  assert.equal(calls, 1);
  assert.equal(aborted, true);
});

test("invalid or unavailable samples are not evidence of healthy publication", async () => {
  for (const invalid of [[], [{ ...row, active: "1" }], [{ ...row, oldest_ms: Infinity }]]) {
    let report;
    await observeEditorialPublication({
      sample: async () => invalid,
      operation: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return 200;
      },
      report: (value) => {
        report = value;
      },
    });
    assert.equal(report.observations.length, 0);
    assert.equal(report.unavailable, 1);
    assert.equal(report.ok, undefined);
  }
});
