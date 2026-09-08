import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
  createCmsBrowserObserver,
  expectedHttpFailureMatches,
  sanitizeBrowserDiagnostic,
} from "../e2e/cms-browser-observer";

const sha = "a".repeat(40);

class FakePage {
  private readonly listeners = new Map<string, Array<(value: any) => void>>();

  on(event: string, listener: (value: any) => void) {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }

  emit(event: string, value: any) {
    for (const listener of this.listeners.get(event) ?? []) listener(value);
  }
}

function fakeResponse(path: string, status: number, method = "POST") {
  return {
    status: () => status,
    url: () => `https://backend.invalid${path}?sensitive=discarded`,
    request: () => ({ method: () => method }),
  };
}

describe("CMS real-browser observer", () => {
  it("matches only the explicit method, path and status tuple", () => {
    const allowance = {
      id: "tampered-payload",
      method: "POST",
      path: "/functions/v1/cms-content",
      statuses: [422],
      maxOccurrences: 1,
    } as const;
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "POST",
        pathname: "/functions/v1/cms-content",
        status: 422,
      }),
    ).toBe(true);
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "GET",
        pathname: "/functions/v1/cms-content",
        status: 422,
      }),
    ).toBe(false);
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "POST",
        pathname: "/functions/v1/cms-content-other",
        status: 422,
      }),
    ).toBe(false);
  });

  it("redacts credentials, identities, tokens, UUIDs and complete URLs", () => {
    const secret = "DoNotPersist!123";
    const diagnostic = sanitizeBrowserDiagnostic(
      `${secret} qa@example.invalid eyJabc.def.ghi 1b7c70c5-6007-44fe-a347-22f03bf4d242 https://site.invalid/path?token=x <script>javascript:onerror=`,
      [secret],
    );
    expect(diagnostic).not.toContain(secret);
    expect(diagnostic).not.toContain("qa@example.invalid");
    expect(diagnostic).not.toContain("eyJabc.def.ghi");
    expect(diagnostic).not.toContain("1b7c70c5-6007-44fe-a347-22f03bf4d242");
    expect(diagnostic).not.toContain("token=x");
    expect(diagnostic).not.toContain("<script>");
    expect(diagnostic).not.toContain("javascript:");
    expect(diagnostic).not.toContain("onerror=");
  });

  it("accepts a bounded intentional HTTP failure and its console mirror", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({
      suite: "observer-unit",
      expectedSha: sha,
      expectedHttpFailures: [
        {
          id: "tampered-payload",
          method: "POST",
          path: "/functions/v1/cms-content",
          statuses: [422],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
      ],
    });
    observer.observePage(page as unknown as Page);
    page.emit("console", {
      type: () => "error",
      text: () => "Failed to load resource: the server responded with a status of 422 ()",
      location: () => ({ url: "https://backend.invalid/functions/v1/cms-content" }),
    });
    page.emit("response", fakeResponse("/functions/v1/cms-content", 422));
    expect(() => observer.assertClean()).not.toThrow();
    expect(observer.snapshot()).toMatchObject({
      status: "passed",
      unexpectedConsole: 0,
      unexpectedHttp: 0,
      requestFailures: 0,
      expectedHttp: [{ id: "tampered-payload", occurrences: 1 }],
      secretsPersisted: false,
    });
  });

  it("fails closed on an unclassified response, page error or failed request", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({ suite: "observer-negative", expectedSha: sha });
    observer.observePage(page as unknown as Page);
    const unexpectedId = "1b7c70c5-6007-44fe-a347-22f03bf4d242";
    page.emit("response", fakeResponse(`/functions/v1/unexpected/${unexpectedId}`, 500));
    page.emit("pageerror", new Error("unexpected browser exception"));
    page.emit("requestfailed", {
      method: () => "GET",
      url: () => "https://site.invalid/assets/app.js?credential=discarded",
      failure: () => ({ errorText: "net::ERR_FAILED" }),
    });
    let failure = "";
    try {
      observer.assertClean();
    } catch (error) {
      failure = String(error);
    }
    expect(failure).toContain("QA_CMS_BROWSER_OBSERVABILITY_FAILED");
    expect(failure).not.toContain(unexpectedId);
    expect(observer.snapshot()).toMatchObject({
      status: "failed",
      unexpectedConsole: 1,
      unexpectedHttp: 1,
      requestFailures: 1,
    });
  });

  it("does not let console mirrors or malformed allowances broaden a negative scenario", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({
      suite: "observer-mirror-bound",
      expectedSha: sha,
      expectedHttpFailures: [
        {
          id: "one-negative",
          method: "POST",
          path: "/functions/v1/cms-content",
          statuses: [422],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
      ],
    });
    observer.observePage(page as unknown as Page);
    page.emit("response", fakeResponse("/functions/v1/cms-content", 422));
    for (let index = 0; index < 2; index += 1) {
      page.emit("console", {
        type: () => "error",
        text: () => "Failed to load resource: the server responded with a status of 422 ()",
        location: () => ({ url: "https://backend.invalid/functions/v1/cms-content" }),
      });
    }
    expect(() => observer.assertClean()).toThrow(/console resource/);
    expect(observer.snapshot().unexpectedConsole).toBe(1);

    expect(() =>
      createCmsBrowserObserver({
        suite: "observer-invalid-allowance",
        expectedSha: sha,
        expectedHttpFailures: [
          {
            id: "broad",
            method: "get",
            path: "/functions/v1/cms-public?type=search",
            statuses: [],
            maxOccurrences: 1,
          },
        ],
      }),
    ).toThrow(/QA_CMS_BROWSER_OBSERVER_ALLOWANCE_INVALID/);
  });
});
