import { describe, expect, it, vi } from "vitest";
import { publicDocumentFailureDiagnostic } from "../e2e/public-document-diagnostics";

function response(headers: Record<string, string>, fromServiceWorker = false) {
  return {
    status: () => 503,
    fromServiceWorker: () => fromServiceWorker,
    headerValue: vi.fn(async (name: string) => headers[name] ?? null),
  };
}

describe("public document failure diagnostics", () => {
  it("preserves exact release and bounded diagnostic metadata without changing a failure", async () => {
    const upstream = response({
      "x-release": "a".repeat(40),
      "server-timing": "edge;dur=2901, cfExtPri",
      "cf-ray": "0123456789abcdef-IAD",
      "content-type": "text/html; charset=utf-8",
      "set-cookie": "never-read",
    });
    expect(JSON.parse(await publicDocumentFailureDiagnostic("/contato", upstream, 2999.4))).toEqual({
      event: "public.document.failure",
      route: "/contato",
      status: 503,
      elapsedMs: 2999,
      fromServiceWorker: false,
      release: "a".repeat(40),
      edgeMs: 2901,
      ray: "0123456789abcdef-IAD",
      contentType: "text/html",
      upstream: null,
    });
    expect(upstream.headerValue.mock.calls.map(([name]) => name)).toEqual([
      "x-release",
      "server-timing",
      "cf-ray",
      "content-type",
      "x-cms-upstream",
    ]);
  });

  it("distinguishes service worker synthetic failures from edge-tagged responses", async () => {
    const result = JSON.parse(await publicDocumentFailureDiagnostic("/", response({}, true), 14));
    expect(result).toMatchObject({
      status: 503,
      fromServiceWorker: true,
      release: null,
      edgeMs: null,
      ray: null,
    });
  });

  it("never copies arbitrary header values or unapproved routes into the report", async () => {
    const untrusted = "private-payload/?credential=do-not-record";
    const report = await publicDocumentFailureDiagnostic(
      `/admin/${untrusted}`,
      response({
        "x-release": untrusted,
        "server-timing": `edge;dur=${untrusted}`,
        "cf-ray": untrusted,
        "content-type": untrusted,
      }),
      Number.NaN,
    );
    expect(report).not.toContain(untrusted);
    expect(JSON.parse(report)).toMatchObject({
      route: "other",
      elapsedMs: null,
      release: null,
      edgeMs: null,
      ray: null,
      contentType: "other",
    });
  });

  it("does not obscure the HTTP failure when response headers are unavailable", async () => {
    const upstream = response({});
    upstream.headerValue.mockRejectedValue(new Error("private backend error"));
    const report = await publicDocumentFailureDiagnostic("/blog", upstream, 500);
    expect(report).not.toContain("private backend error");
    expect(JSON.parse(report)).toMatchObject({ route: "/blog", status: 503, release: null, edgeMs: null });
  });

  it("handles a missing response without inventing a status, release or service worker", async () => {
    expect(JSON.parse(await publicDocumentFailureDiagnostic("/produtos", null, -1))).toMatchObject({
      status: null,
      elapsedMs: null,
      fromServiceWorker: null,
      release: null,
      edgeMs: null,
      ray: null,
    });
  });
});

describe("bounded upstream diagnostics", () => {
  it.each([
    "entity-detail;timeout;1;503;5000",
    "page-by-path;transport;2;503;11",
    "detail;http;1;503;301",
    "other;unconfigured;0;0;0",
  ])("retains only the safe grammar: %s", async (value) => {
    expect(
      JSON.parse(await publicDocumentFailureDiagnostic("/", response({ "x-cms-upstream": value }), 1))
        .upstream,
    ).toBe(value);
  });
  it.each([
    "entity-detail;timeout;3;503;5000",
    "entity-detail;timeout;1;503;60001",
    "private?secret=value",
    "entity-detail;http;1;200;1\nprivate",
    "entity-detail;http;1;999;1",
  ])("rejects invalid or sensitive diagnostic values", async (value) => {
    expect(
      JSON.parse(await publicDocumentFailureDiagnostic("/", response({ "x-cms-upstream": value }), 1))
        .upstream,
    ).toBeNull();
  });
});
