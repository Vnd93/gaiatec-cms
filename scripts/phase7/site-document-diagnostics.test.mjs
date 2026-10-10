import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { observeSiteDocument } from "./site-document-diagnostics.mjs";

test("document failure preserves response and bounded correlation without consuming body", async () => {
  const trace = "7951bfb0-f464-4bc2-9316-7be954973c70";
  const response = new Response("private payload", {
    status: 503,
    headers: {
      "cf-ray": "abcdef1234567890-ORD",
      "x-release": "a".repeat(40),
      "x-cms-upstream": "page-by-path;timeout;2;0;2900",
      "x-cms-document-trace": trace,
      "server-timing": "edge;dur=2901.5",
      "set-cookie": "secret",
    },
  });
  let calls = 0;
  const reports = [];
  const ticks = [10, 3010];
  const actual = await observeSiteDocument({
    context: "archived-blog",
    fetchResponse: async () => {
      calls++;
      return response;
    },
    report: (d) => reports.push(d),
    now: () => ticks.shift(),
  });
  assert.equal(actual, response);
  assert.equal(calls, 1);
  assert.equal(response.bodyUsed, false);
  assert.equal(reports[0].status, 503);
  assert.equal(reports[0].documentTrace, trace);
  assert.equal(reports[0].workerUpstream, "page-by-path;timeout;2;0;2900");
  assert.equal(reports[0].ttfbMs, 3000);
  assert.equal(reports[0].edgeDurationMs, 2901.5);
  assert.doesNotMatch(JSON.stringify(reports), /secret|private payload|set-cookie/);
});

test("untrusted correlation and oversized values are excluded", async () => {
  const reports = [];
  await observeSiteDocument({
    context: "archived-blog",
    fetchResponse: async () =>
      new Response(null, {
        status: 503,
        headers: {
          "cf-ray": "secret",
          "x-release": "secret",
          "x-cms-upstream": "page-by-path;timeout;2;0;60001",
          "x-cms-document-trace": "secret",
          "server-timing": "edge;dur=60001",
        },
      }),
    report: (d) => reports.push(d),
    now: () => NaN,
  });
  assert.equal(reports[0].ttfbMs, null);
  for (const key of ["cfRay", "release", "workerUpstream", "documentTrace", "edgeDurationMs"])
    assert.equal(reports[0][key], undefined);
  assert.doesNotMatch(JSON.stringify(reports), /secret/);
});

test("404 remains 404 and cannot carry failure-only Worker correlation", async () => {
  const reports = [];
  const response = await observeSiteDocument({
    context: "archived-blog",
    fetchResponse: async () =>
      new Response(null, { status: 404, headers: { "x-cms-upstream": "page-by-path;http;1;404;10" } }),
    report: (d) => reports.push(d),
  });
  assert.equal(response.status, 404);
  assert.equal(reports[0].workerUpstream, undefined);
});

test("transport failure is reported immediately and rethrows original error without retry", async () => {
  const original = new Error("sensitive payload");
  const reports = [];
  let calls = 0;
  await assert.rejects(
    observeSiteDocument({
      context: "archived-blog",
      fetchResponse: async () => {
        calls++;
        throw original;
      },
      report: (d) => reports.push(d),
    }),
    (error) => error === original,
  );
  assert.equal(calls, 1);
  assert.equal(reports[0].outcome, "transport");
  assert.doesNotMatch(JSON.stringify(reports), /sensitive/);
});

test("arbitrary URL, selector or context is refused before fetch", async () => {
  let calls = 0;
  await assert.rejects(
    observeSiteDocument({
      context: "/blog/private?token=secret",
      fetchResponse: async () => {
        calls++;
      },
      report: () => {},
    }),
    /CONTEXT_REFUSED/,
  );
  assert.equal(calls, 0);
});

test("invalid Worker attempts, HTTP status and trace cannot enter evidence", async () => {
  for (const upstream of [
    "page-by-path;timeout;3;0;10",
    "page-by-path;http;1;999;10",
    "page-by-path;timeout;2;0;10;secret",
  ]) {
    const reports = [];
    await observeSiteDocument({
      context: "archived-blog",
      fetchResponse: async () =>
        new Response(null, {
          status: 503,
          headers: {
            "x-cms-upstream": upstream,
            "x-cms-document-trace": "Bearer secret",
          },
        }),
      report: (d) => reports.push(d),
    });
    assert.equal(reports[0].workerUpstream, undefined);
    assert.equal(reports[0].documentTrace, undefined);
  }
});

test("staging driver preserves withdrawal gate and reports before cleanup", () => {
  const source = readFileSync(new URL("./staging-roundtrip.mjs", import.meta.url), "utf8");
  assert.match(source, /const archivedPage = await siteDocument\(\s*"archived-blog"/);
  assert.match(source, /assert\(archivedPage\.status === 404,/);
  assert.match(source, /fetchResponse: \(\) => fetch\(url, options\)/);
  assert.match(source, /siteDocumentDiagnostics\.push\(diagnostic\);\s*process\.stderr\.write/);
  assert.match(source, /cleanup: cleanupEvidence, editorialDiagnostics, siteDocumentDiagnostics/);
  assert.match(source, /supabaseUrl !== `https:\/\/\$\{stagingProjectRef\}\.supabase\.co`/);
});
