import type { Page, Request, Response } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCmsBrowserObserver } from "../e2e/cms-browser-observer";
import { createPublicReadObserver } from "../e2e/cms-public-read-observer";

const origin = "https://backend.invalid";
const target = `${origin}/functions/v1/cms-public?type=page-by-path&path=%2F`;
const makeRequest = (
  options: {
    url?: string;
    method?: string;
    resource?: string;
    headers?: Record<string, string>;
    error?: string;
  } = {},
) =>
  ({
    url: () => options.url ?? target,
    method: () => options.method ?? "GET",
    resourceType: () => options.resource ?? "fetch",
    headers: () => options.headers ?? { apikey: "public-test-key" },
    failure: () => ({ errorText: options.error ?? "net::ERR_ABORTED" }),
  }) as Request;
const response = (request: Request, status = 200) =>
  ({ request: () => request, status: () => status, url: request.url }) as Response;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.useRealTimers();
});

function pair(options: Parameters<typeof makeRequest>[0] = {}, winnerFirst = true) {
  const observer = createPublicReadObserver(new Set([origin]));
  const winner = makeRequest();
  const loser = makeRequest(options);
  observer.onRequest(winnerFirst ? winner : loser);
  vi.setSystemTime(700);
  observer.onRequest(winnerFirst ? loser : winner);
  return { observer, winner, loser };
}

describe("proof of a redundant public page transport cancellation", () => {
  it.each([true, false])(
    "accepts one loser only after the winning body completes (primary wins=%s)",
    (winnerFirst) => {
      const { observer, winner, loser } = pair({}, winnerFirst);
      observer.onResponse(response(winner));
      observer.onRequestFailed(loser);
      expect(observer.isProvenRedundantCancellation(loser)).toBe(false);
      observer.onRequestFinished(winner);
      expect(observer.isProvenRedundantCancellation(loser)).toBe(true);
      expect(observer.isProvenRedundantCancellation(winner)).toBe(false);
    },
  );

  it.each([201, 204, 301, 401, 403, 404, 429, 500, 503])(
    "does not use HTTP %i as success proof",
    (status) => {
      const { observer, winner, loser } = pair();
      observer.onResponse(response(winner, status));
      observer.onRequestFailed(loser);
      observer.onRequestFinished(winner);
      expect(observer.isProvenRedundantCancellation(loser)).toBe(false);
    },
  );

  it.each<NonNullable<Parameters<typeof makeRequest>[0]>>([
    { url: `${origin}/functions/v1/cms-public?type=entity-detail&path=%2F` },
    { url: `${target}other` },
    { url: "https://untracked.invalid/functions/v1/cms-public?type=page-by-path&path=%2F" },
    { url: `${origin}/functions/v1/cms-public?type=form&path=%2F` },
    { url: `${origin}/functions/v1/cms-public?type=site-shell&path=%2F` },
    { url: `${origin}/functions/v1/cms-admin?type=page-by-path&path=%2F` },
    { url: "invalid" },
    { method: "POST" },
    { method: "HEAD" },
    { resource: "document" },
    { headers: {} },
    { headers: { apikey: "another-key" } },
    { headers: { apikey: "public-test-key", authorization: "" } },
    { error: "net::ERR_TIMED_OUT" },
    { error: "net::ERR_FAILED" },
  ])("rejects a mismatched or unapproved transport %#", (options) => {
    const { observer, winner, loser } = pair(options);
    observer.onResponse(response(winner));
    observer.onRequestFailed(loser);
    observer.onRequestFinished(winner);
    expect(observer.isProvenRedundantCancellation(loser)).toBe(false);
  });

  it.each([
    "no-response",
    "body-failed",
    "abort-before-response",
    "loser-headers",
    "third-read",
    "deadline",
    "late-body",
  ])("keeps %s fail-closed", (scenario) => {
    const { observer, winner, loser } = pair();
    if (scenario === "third-read") observer.onRequest(makeRequest());
    if (scenario === "loser-headers") observer.onResponse(response(loser));
    if (scenario === "abort-before-response") observer.onRequestFailed(loser);
    if (scenario !== "no-response") observer.onResponse(response(winner));
    if (scenario === "deadline") vi.setSystemTime(10_001);
    if (scenario !== "abort-before-response") observer.onRequestFailed(loser);
    if (scenario === "late-body") vi.setSystemTime(10_001);
    if (scenario === "body-failed") observer.onRequestFailed(winner);
    else observer.onRequestFinished(winner);
    expect(observer.isProvenRedundantCancellation(loser)).toBe(false);
  });

  it("does not borrow success from an earlier read", () => {
    const observer = createPublicReadObserver(new Set([origin]));
    const winner = makeRequest();
    const loser = makeRequest();
    observer.onRequest(winner);
    observer.onResponse(response(winner));
    observer.onRequestFinished(winner);
    observer.onRequest(loser);
    observer.onRequestFailed(loser);
    expect(observer.isProvenRedundantCancellation(loser)).toBe(false);
  });

  it("does not pair transports whose overlap exceeds the shared deadline", () => {
    const observer = createPublicReadObserver(new Set([origin]));
    const winner = makeRequest();
    const loser = makeRequest();
    observer.onRequest(winner);
    vi.setSystemTime(10_001);
    observer.onRequest(loser);
    observer.onResponse(response(winner));
    observer.onRequestFinished(winner);
    observer.onRequestFailed(loser);
    expect(observer.isProvenRedundantCancellation(loser)).toBe(false);
  });
});

class PageEvents {
  listeners = new Map<string, Array<(value: any) => void>>();
  on(event: string, listener: (value: any) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string, value: any) {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

describe("browser evidence remains fail-closed with redundant reads", () => {
  it.each([false, true])(
    "records a proved cancellation but never seals a failed winning body (fails=%s)",
    (fails) => {
      const page = new PageEvents();
      const observer = createCmsBrowserObserver({
        suite: "hedge-proof",
        expectedSha: "a".repeat(40),
        trackedRequestOrigins: [origin],
      });
      observer.observePage(page as unknown as Page);
      const winner = makeRequest();
      const loser = makeRequest();
      page.emit("request", winner);
      vi.setSystemTime(700);
      page.emit("request", loser);
      page.emit("response", response(winner));
      page.emit("requestfailed", loser);
      expect(() => observer.assertClean()).toThrow();
      page.emit(fails ? "requestfailed" : "requestfinished", winner);
      if (fails) {
        expect(() => observer.assertClean()).toThrow();
        expect(observer.snapshot().requestFailures).toBe(2);
      } else {
        expect(() => observer.assertClean()).not.toThrow();
        expect(observer.snapshot()).toMatchObject({
          requestFailures: 0,
          redundantPublicReadCancellations: 1,
        });
      }
      expect(JSON.stringify(observer.snapshot())).not.toContain("public-test-key");
      expect(JSON.stringify(observer.snapshot())).not.toContain("backend.invalid");
    },
  );

  it("cannot correlate requests across pages", () => {
    const first = new PageEvents();
    const second = new PageEvents();
    const observer = createCmsBrowserObserver({
      suite: "hedge-cross-page",
      expectedSha: "a".repeat(40),
      trackedRequestOrigins: [origin],
    });
    observer.observePage(first as unknown as Page);
    observer.observePage(second as unknown as Page);
    const winner = makeRequest();
    const loser = makeRequest();
    first.emit("request", winner);
    second.emit("request", loser);
    first.emit("response", response(winner));
    first.emit("requestfinished", winner);
    second.emit("requestfailed", loser);
    expect(() => observer.assertClean()).toThrow();
    expect(observer.snapshot().redundantPublicReadCancellations).toBe(0);
  });
});
