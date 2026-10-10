import type { Page, Request, Response } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import {
  observePublicPageRender,
  publicRenderErrorCategory,
  publicRenderState,
} from "../e2e/public-render-diagnostics";

function fakePage() {
  const handlers = new Map<string, (value: never) => void>();
  const page = {
    on: vi.fn((event: string, handler: (value: never) => void) => {
      handlers.set(event, handler);
    }),
    off: vi.fn((event: string) => {
      handlers.delete(event);
    }),
  };
  return {
    page: page as unknown as Pick<Page, "on" | "off">,
    handlers,
    emit: (event: string, value: unknown) => handlers.get(event)?.(value as never),
  };
}
const request = (path = "/sobre", origin = "https://glcqsosxwgmlhzgcsnzv.supabase.co", method = "GET") =>
  ({
    url: () =>
      `${origin}/functions/v1/cms-public?type=page-by-path&path=${encodeURIComponent(path)}&secret=never-record`,
    method: () => method,
  }) as Request;

describe("public rendering diagnostics", () => {
  it("tracks exact discovery reads and their pending body without exposing query data", () => {
    const fake = fakePage();
    const recorder = observePublicPageRender(fake.page, "/industrias/protecao-catodica", () => 10);
    const entity = (kind: string, slug: string, method = "GET") => ({
      method: () => method,
      url: () =>
        `https://glcqsosxwgmlhzgcsnzv.supabase.co/functions/v1/cms-public?type=entity-detail&contentType=${kind}&slug=${slug}&private=never-record`,
    });
    for (const unrelated of [
      entity("service", "protecao-catodica"),
      entity("industry", "instrumentacao"),
      entity("industry", "protecao-catodica", "POST"),
    ]) {
      fake.emit("request", unrelated);
      fake.emit("response", { request: () => unrelated, status: () => 200 });
    }
    expect(recorder.snapshot()).toMatchObject({ pageReadPending: false, events: [] });
    const req = entity("industry", "protecao-catodica");
    fake.emit("request", req);
    fake.emit("response", { request: () => req, status: () => 503 });
    expect(recorder.snapshot()).toMatchObject({
      pageReadPending: true,
      events: [{ event: "page-read-headers", status: 503, elapsedMs: 0 }],
    });
    fake.emit("requestfinished", req);
    expect(recorder.snapshot().pageReadPending).toBe(false);
    fake.emit("request", req);
    fake.emit("requestfailed", req);
    expect(recorder.snapshot().pageReadPending).toBe(false);
    expect(JSON.stringify(recorder.snapshot())).not.toMatch(/never-record|private=|contentType|https:/);
    recorder.dispose();
  });
  it("distinguishes headers, read completion and failed first-party modules without recording URLs", () => {
    const fake = fakePage();
    let now = 0;
    const recorder = observePublicPageRender(fake.page, "/sobre", () => now);
    const req = request();
    fake.emit("request", req);
    now = 120;
    fake.emit("response", { request: () => req, status: () => 200 });
    now = 320;
    fake.emit("requestfinished", req);
    const module = {
      method: () => "GET",
      url: () =>
        "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev/assets/private-name.js?credential=never-record",
    };
    fake.emit("request", module);
    now = 500;
    fake.emit("requestfailed", module);
    expect(recorder.snapshot().events).toEqual([
      { event: "page-read-headers", status: 200, elapsedMs: 120 },
      { event: "page-read-finished", elapsedMs: 320 },
      { event: "module-read-transport-failed", elapsedMs: 180 },
    ]);
    expect(JSON.stringify(recorder.snapshot())).not.toMatch(/private-name|never-record|credential/);
    recorder.dispose();
    expect(fake.handlers.size).toBe(0);
  });
  it("does not mask the original gate failure when DOM observation fails", async () => {
    expect(
      await publicRenderState({
        isVisible: async () => {
          throw new Error("closed page with private details");
        },
      }),
    ).toBeNull();
    expect(await publicRenderState({ isVisible: async () => false })).toBe(false);
    expect(await publicRenderState({ isVisible: async () => true })).toBe(true);
  });
  it("records the first HTTP error unchanged without reading bodies or request headers", () => {
    const fake = fakePage();
    let now = 10;
    const recorder = observePublicPageRender(fake.page, "/sobre", () => now);
    const req = request();
    fake.emit("request", req);
    now = 1710;
    fake.emit("response", { request: () => req, status: () => 503 } as Response);
    const snapshot = recorder.snapshot();
    expect(snapshot.events).toEqual([{ event: "page-read-headers", status: 503, elapsedMs: 1700 }]);
    expect(JSON.stringify(snapshot)).not.toContain("never-record");
    recorder.dispose();
    expect(fake.handlers.size).toBe(0);
  });
  it("rejects writes, unrelated paths, other backends and arbitrary routes", () => {
    const fake = fakePage();
    const recorder = observePublicPageRender(fake.page, "/sobre");
    for (const req of [
      request("/contato"),
      request("/sobre", "https://other.invalid"),
      request("/sobre", undefined, "POST"),
    ]) {
      fake.emit("request", req);
      fake.emit("response", { request: () => req, status: () => 200 });
    }
    expect(recorder.snapshot().events).toEqual([]);
    recorder.dispose();
    const unknown = observePublicPageRender(fake.page, "/private?person=never-record");
    expect(unknown.snapshot().route).toBe("other");
    unknown.dispose();
  });
  it("bounds metadata and never emits raw JavaScript exceptions or transport errors", () => {
    const fake = fakePage();
    const recorder = observePublicPageRender(fake.page, "/politica-de-privacidade");
    const req = request("/politica-de-privacidade");
    fake.emit("requestfailed", req);
    for (let index = 0; index < 20; index++)
      fake.emit("pageerror", new Error("Failed to import private?credential=never-record"));
    expect(recorder.snapshot()).toMatchObject({ events: expect.any(Array), dropped: 9 });
    expect(recorder.snapshot().events).toHaveLength(12);
    expect(recorder.snapshot().events[0]).toEqual({ event: "page-read-transport-failed", elapsedMs: null });
    expect(JSON.stringify(recorder.snapshot())).not.toContain("never-record");
    recorder.dispose();
  });
  it.each([
    ["Content Security Policy", "csp"],
    ["CORS refusal", "cors"],
    ["Failed to import module", "module"],
    ["Failed to fetch", "network"],
    ["private error", "other"],
  ])("classifies %s without copying it", (message, category) => {
    expect(publicRenderErrorCategory(message)).toBe(category);
  });
});
