import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildFailureProbeDiagnostics,
  MAX_PROBE_DIAGNOSTICS,
  observeProbeRequest,
} from "./rollout-probe-diagnostics-lib.mjs";

const sha = "a".repeat(40);

test("rejects invalid status, trace, time and unbounded Worker fields", () => {
  const base = {
    route: "/contato",
    category: "route",
    ordinal: 1,
    expectedStatus: 200,
    status: 503,
    workerUpstream: "page-by-path;timeout;2;503;2900",
    workerAttemptTimings: "1,0,2200,timeout,0;2,700,2200,timeout,0",
    documentTrace: "12345678-1234-4234-8234-123456789abc",
    observedAt: "2026-10-10T04:10:00.000Z",
  };
  const report = (changes) =>
    buildFailureProbeDiagnostics({
      violations: ["http_5xx_budget_exceeded"],
      candidateSha: sha,
      environment: "staging",
      probeProfile: "full",
      diagnostics: [{ ...base, ...changes }],
    }).observations[0];
  for (const status of [undefined, NaN, "503", 499, 600, 503.5])
    assert.equal(report({ status }).workerUpstream, undefined);
  for (const workerUpstream of [
    "page-by-path;timeout;2;503;60001",
    "page-by-path;timeout;3;503;2900",
    "page-by-path;timeout;2;999;2900",
  ])
    assert.equal(report({ workerUpstream }).workerUpstream, undefined);
  assert.equal(report({ documentTrace: "Bearer secret" }).documentTrace, undefined);
  assert.equal(report({ observedAt: "2026-02-30T04:10:00.000Z" }).observedAt, undefined);
  assert.equal(report({}).workerAttemptTimings, base.workerAttemptTimings);
  for (const workerAttemptTimings of [
    "1,0,2200,timeout,0",
    "1,0,60001,timeout,0;2,700,2200,timeout,0",
    "1,0,2200,secret,0;2,700,2200,timeout,0",
    "1,0,2200,timeout,0;1,700,2200,timeout,0",
    "1,0,2200,timeout,0;2,700,2200,timeout,999",
    "Bearer private-value",
  ])
    assert.equal(report({ workerAttemptTimings }).workerAttemptTimings, undefined);
});

test("preserves closed staging Worker failure correlation without accepting arbitrary headers", async () => {
  const trace = "12345678-1234-4234-8234-123456789abc";
  for (const upstream of ["page-by-path;timeout;2;503;2900", "secret;token;9;999;999999"])
    for (const environment of ["staging", "production"]) {
      const result = await observeProbeRequest({
        route: "/contato",
        category: "route",
        ordinal: 1,
        expectedStatus: 200,
        fetchResponse: async () =>
          new Response(null, {
            status: 503,
            headers: {
              "X-CMS-Upstream": upstream,
              "X-CMS-Upstream-Attempts": "1,0,2200,timeout,0;2,700,2200,timeout,0",
              "X-CMS-Document-Trace": trace,
              Authorization: "Bearer secret",
            },
          }),
      });
      const report = buildFailureProbeDiagnostics({
        violations: ["http_5xx_budget_exceeded"],
        candidateSha: sha,
        environment,
        probeProfile: "full",
        diagnostics: [result.diagnostic],
      });
      const observation = report.observations[0];
      if (environment === "staging" && upstream.startsWith("page-by-path")) {
        assert.equal(observation.workerUpstream, upstream);
        assert.equal(observation.documentTrace, trace);
        assert.equal(observation.workerAttemptTimings, "1,0,2200,timeout,0;2,700,2200,timeout,0");
        assert.ok(Number.isFinite(Date.parse(observation.observedAt)));
      } else {
        assert.equal(observation.workerUpstream, undefined);
        assert.equal(observation.documentTrace, undefined);
        assert.equal(observation.workerAttemptTimings, undefined);
      }
      assert.doesNotMatch(JSON.stringify(report), /secret|Authorization|Bearer/);
    }
});

test("measures TTFB at headers and drains the complete response afterwards", async () => {
  const bytes = new TextEncoder().encode("controlled response");
  let bodyDrainStarted = false;
  let clockCalls = 0;
  const response = {
    status: 200,
    headers: new Headers({
      "CF-Ray": "9abcdef012345678-GIG",
      "CF-Cache-Status": "DYNAMIC",
      "Server-Timing": "edge;dur=27.5",
    }),
    arrayBuffer: async () => {
      bodyDrainStarted = true;
      return bytes.buffer;
    },
  };
  const result = await observeProbeRequest({
    route: "/contato",
    category: "route",
    ordinal: 1,
    expectedStatus: 200,
    fetchResponse: async () => response,
    now: () => {
      clockCalls += 1;
      if (clockCalls === 1) return 100;
      assert.equal(bodyDrainStarted, false, "TTFB was captured after body drain started");
      return 137;
    },
  });

  assert.equal(result.durationMs, 37);
  assert.equal(bodyDrainStarted, true);
  assert.deepEqual(result.body, bytes);
  assert.deepEqual(result.diagnostic, {
    route: "/contato",
    category: "route",
    ordinal: 1,
    expectedStatus: 200,
    ttfbMs: 37,
    status: 200,
    cfRay: "9abcdef012345678-GIG",
    colo: "GIG",
    edgeDurationMs: 27.5,
    cfCacheStatus: "DYNAMIC",
    bodyBytes: bytes.byteLength,
    bodySha256: createHash("sha256").update(bytes).digest("hex"),
    bodyComplete: true,
    errorClass: "none",
  });
});

test("creates a bounded allowlisted sidecar only for a failed probe", () => {
  const sample = {
    route: "/contato",
    category: "route",
    ordinal: 1,
    status: 503,
    expectedStatus: 200,
    ttfbMs: 850,
    cfRay: "9abcdef012345678-GIG",
    colo: "GIG",
    edgeDurationMs: 825,
    cfCacheStatus: "DYNAMIC",
    bodyBytes: 42,
    bodySha256: "b".repeat(64),
    bodyComplete: true,
    errorClass: "none",
    body: "secret response text",
    url: "https://backend.invalid/private?token=secret",
    headers: { authorization: "Bearer secret" },
    payload: { email: "person@example.test" },
  };

  assert.equal(
    buildFailureProbeDiagnostics({
      violations: [],
      candidateSha: sha,
      environment: "staging",
      probeProfile: "full",
      diagnostics: [sample],
    }),
    null,
  );

  const report = buildFailureProbeDiagnostics({
    violations: ["route_availability_budget_exceeded:/contato"],
    candidateSha: sha,
    environment: "staging",
    probeProfile: "full",
    diagnostics: Array.from({ length: MAX_PROBE_DIAGNOSTICS + 5 }, (_, index) => ({
      ...sample,
      ordinal: index + 1,
    })),
  });
  assert.equal(report.observationCount, MAX_PROBE_DIAGNOSTICS + 5);
  assert.equal(report.capturedCount, MAX_PROBE_DIAGNOSTICS);
  assert.equal(report.truncated, true);
  assert.equal(report.observations.length, MAX_PROBE_DIAGNOSTICS);
  assert.deepEqual(Object.keys(report.observations[0]), [
    "route",
    "category",
    "ordinal",
    "status",
    "expectedStatus",
    "ttfbMs",
    "cfRay",
    "colo",
    "edgeDurationMs",
    "cfCacheStatus",
    "bodyBytes",
    "bodySha256",
    "bodyComplete",
    "errorClass",
  ]);
  const serialized = JSON.stringify(report);
  for (const forbidden of [
    "secret response text",
    "backend.invalid",
    "authorization",
    "person@example.test",
    "Bearer secret",
  ])
    assert.equal(serialized.includes(forbidden), false);
});

test("refuses arbitrary diagnostic routes and classifies failures without error text", async () => {
  await assert.rejects(
    observeProbeRequest({
      route: "/private?token=secret",
      category: "route",
      ordinal: 1,
      expectedStatus: 200,
      fetchResponse: async () => {
        throw new Error("credential-bearing backend URL");
      },
      now: () => 10,
    }),
    /G12_PROBE_DIAGNOSTIC_INPUT_REFUSED/,
  );

  const result = await observeProbeRequest({
    route: "/contato",
    category: "route",
    ordinal: 2,
    expectedStatus: 200,
    fetchResponse: async () => {
      throw new TypeError("private backend failure text");
    },
    now: () => 10,
  });
  assert.equal(result.diagnostic.errorClass, "network");
  assert.equal(JSON.stringify(result.diagnostic).includes("private backend"), false);
});
