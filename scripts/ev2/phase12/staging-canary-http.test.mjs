import assert from "node:assert/strict";
import test from "node:test";

import {
  failurePath,
  fetchStagingCanaryText,
  isRetryableAuthUserResidueRead,
  retryAuthUserResidueRead,
} from "./staging-canary-http.mjs";

const gatewayTimeout = () => new Error("G12_STAGING_HTTP_FAILED:GET:/auth/v1/admin/users/_uuid:504");
const requestTimeout = () => new Error("G12_STAGING_HTTP_TIMEOUT:GET:/auth/v1/admin/users/_uuid:45001");

test("failure paths redact every canonical UUID shape and discard query strings", () => {
  for (const actorId of [
    "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    "01890f47-6562-7c0c-9d5b-8bdad0e7b4e7",
    "00000000-0000-0000-0000-000000000000",
  ])
    assert.equal(
      failurePath(`https://project.supabase.co/auth/v1/admin/users/${actorId}?token=secret`),
      "/auth/v1/admin/users/_uuid",
    );

  assert.equal(failurePath("https://project.supabase.co/rest/v1/content"), "/rest/v1/content");
});

test("a timeout while reading the response body is normalized with a redacted path", async () => {
  const timeout = new Error("body stalled for a synthetic actor");
  timeout.name = "TimeoutError";
  const ticks = [100, 145];
  const fetchImpl = async () => ({
    text: async () => {
      throw timeout;
    },
  });

  await assert.rejects(
    () =>
      fetchStagingCanaryText(
        "https://project.supabase.co/auth/v1/admin/users/01890f47-6562-7c0c-9d5b-8bdad0e7b4e7",
        {
          method: "GET",
          headers: {},
          timeoutMs: 45_000,
          fetchImpl,
          clock: () => ticks.shift(),
        },
      ),
    (error) => {
      assert.equal(error.message, "G12_STAGING_HTTP_TIMEOUT:GET:/auth/v1/admin/users/_uuid:45");
      assert.equal(error.cause, timeout);
      return true;
    },
  );
});

test("auth residue retry classification is exact", () => {
  assert.equal(isRetryableAuthUserResidueRead(gatewayTimeout()), true);
  assert.equal(isRetryableAuthUserResidueRead(requestTimeout()), true);

  for (const message of [
    "G12_STAGING_HTTP_FAILED:GET:/auth/v1/admin/users/_uuid:500",
    "G12_STAGING_HTTP_FAILED:PUT:/auth/v1/admin/users/_uuid:504",
    "G12_STAGING_HTTP_FAILED:GET:/rest/v1/admin/users/_uuid:504",
    "G12_STAGING_HTTP_FAILED:GET:/auth/v1/admin/users/01890f47-6562-7c0c-9d5b-8bdad0e7b4e7:504",
    "G12_STAGING_HTTP_TIMEOUT:GET:/auth/v1/admin/users/_uuid:not-a-duration",
  ])
    assert.equal(isRetryableAuthUserResidueRead(new Error(message)), false, message);
});

test("auth residue read retries one transient gateway failure then returns success", async () => {
  let calls = 0;
  const waits = [];
  const result = await retryAuthUserResidueRead(
    async () => {
      calls += 1;
      if (calls === 1) throw gatewayTimeout();
      return { status: 200 };
    },
    async (milliseconds) => waits.push(milliseconds),
  );

  assert.deepEqual(result, { status: 200 });
  assert.equal(calls, 2);
  assert.deepEqual(waits, [1_000]);
});

test("auth residue read makes at most three attempts and accepts terminal 404", async () => {
  let calls = 0;
  const waits = [];
  const result = await retryAuthUserResidueRead(
    async () => {
      calls += 1;
      if (calls < 3) throw requestTimeout();
      return { status: 404 };
    },
    async (milliseconds) => waits.push(milliseconds),
  );

  assert.deepEqual(result, { status: 404 });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1_000, 2_000]);
});

test("auth residue read fails closed after three transient failures", async () => {
  const failures = [gatewayTimeout(), requestTimeout(), gatewayTimeout()];
  const waits = [];
  let calls = 0;

  await assert.rejects(
    () =>
      retryAuthUserResidueRead(
        async () => {
          const failure = failures[calls];
          calls += 1;
          throw failure;
        },
        async (milliseconds) => waits.push(milliseconds),
      ),
    (error) => {
      assert.equal(error, failures[2]);
      return true;
    },
  );
  assert.equal(calls, 3);
  assert.deepEqual(waits, [1_000, 2_000]);
});

test("auth residue read never retries a non-transient failure or a direct 404", async () => {
  const nonTransient = new Error("G12_STAGING_HTTP_FAILED:GET:/auth/v1/admin/users/_uuid:500");
  let calls = 0;
  let waits = 0;
  await assert.rejects(
    () =>
      retryAuthUserResidueRead(
        async () => {
          calls += 1;
          throw nonTransient;
        },
        async () => {
          waits += 1;
        },
      ),
    (error) => {
      assert.equal(error, nonTransient);
      return true;
    },
  );
  assert.equal(calls, 1);
  assert.equal(waits, 0);

  calls = 0;
  const result = await retryAuthUserResidueRead(async () => {
    calls += 1;
    return { status: 404 };
  });
  assert.deepEqual(result, { status: 404 });
  assert.equal(calls, 1);
});
