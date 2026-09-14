import type { Page } from "@playwright/test";
import { describe, expect, it } from "vitest";
import {
  createCmsBrowserObserver,
  expectedHttpFailureMatches,
  isExpectedTurnstileDnsFailure,
  isExpectedTurnstilePatResponse,
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

function fakeResponse(path: string, status: number, method = "POST", origin = "https://backend.invalid") {
  return {
    status: () => status,
    url: () => `${origin}${path}?sensitive=discarded`,
    request: () => ({ method: () => method, resourceType: () => "fetch" }),
  };
}

function fakeConsoleMessage(text: string, type = "error", url = "https://site.invalid/assets/app.js") {
  return {
    type: () => type,
    text: () => text,
    location: () => ({ url }),
  };
}

function fakeRequest(url: string, method = "GET", errorText = "net::ERR_FAILED", resourceType = "fetch") {
  return {
    method: () => method,
    resourceType: () => resourceType,
    url: () => url,
    failure: () => ({ errorText }),
  };
}

function fakeResponseForRequest(request: ReturnType<typeof fakeRequest>, status: number) {
  return {
    status: () => status,
    url: request.url,
    request: () => request,
  };
}

describe("CMS real-browser observer", () => {
  it("refuses to seal while a first-party request is pending and preserves a terminal failure", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({
      suite: "observer-pending-first-party",
      expectedSha: sha,
      trackedRequestOrigins: ["https://site.invalid", "https://backend.invalid"],
    });
    observer.observePage(page as unknown as Page);

    const completed = fakeRequest("https://backend.invalid/rest/v1/cms_audit_log?select=id");
    page.emit("request", completed);
    expect(observer.snapshot()).toMatchObject({ status: "failed", requestFailures: 1 });
    expect(() => observer.assertClean()).toThrow(/pending first-party request GET \/rest\/v1\/cms_audit_log/);
    page.emit("requestfinished", completed);
    expect(() => observer.assertClean()).not.toThrow();

    const failed = fakeRequest("https://site.invalid/admin/data");
    page.emit("request", failed);
    page.emit("requestfailed", failed);
    expect(observer.snapshot()).toMatchObject({ status: "failed", requestFailures: 1 });
    expect(() => observer.assertClean()).toThrow(/GET \/admin\/data: net::ERR_FAILED/);
  });

  it("settles only a tracked fetch HEAD with prior 2xx proof before Chromium aborts it", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({
      suite: "observer-successful-head",
      expectedSha: sha,
      trackedRequestOrigins: ["https://backend.invalid"],
    });
    observer.observePage(page as unknown as Page);

    const request = fakeRequest(
      "https://backend.invalid/rest/v1/cms_content_items?select=id",
      "HEAD",
      "net::ERR_ABORTED",
    );
    page.emit("request", request);
    expect(() => observer.assertClean()).toThrow(/pending first-party request HEAD/);

    page.emit("response", fakeResponseForRequest(request, 200));
    expect(() => observer.assertClean()).not.toThrow();
    page.emit("requestfailed", request);
    expect(() => observer.assertClean()).not.toThrow();
    expect(observer.snapshot()).toMatchObject({
      status: "passed",
      unexpectedHttp: 0,
      requestFailures: 0,
    });
  });

  it("keeps every HEAD cancellation without matching first-party 2xx proof fail-closed", () => {
    const scenarios = [
      {
        name: "no-response",
        request: fakeRequest("https://backend.invalid/rest/v1/cms_content_items", "HEAD", "net::ERR_ABORTED"),
      },
      {
        name: "http-error",
        request: fakeRequest("https://backend.invalid/rest/v1/cms_content_items", "HEAD", "net::ERR_ABORTED"),
        status: 500,
      },
      {
        name: "get",
        request: fakeRequest("https://backend.invalid/rest/v1/cms_content_items", "GET", "net::ERR_ABORTED"),
        status: 200,
      },
      {
        name: "post",
        request: fakeRequest("https://backend.invalid/rest/v1/cms_content_items", "POST", "net::ERR_ABORTED"),
        status: 200,
      },
      {
        name: "xhr",
        request: fakeRequest(
          "https://backend.invalid/rest/v1/cms_content_items",
          "HEAD",
          "net::ERR_ABORTED",
          "xhr",
        ),
        status: 200,
      },
      {
        name: "other-origin",
        request: fakeRequest("https://other.invalid/rest/v1/cms_content_items", "HEAD", "net::ERR_ABORTED"),
        status: 200,
      },
      {
        name: "redirect",
        request: fakeRequest("https://backend.invalid/rest/v1/cms_content_items", "HEAD", "net::ERR_ABORTED"),
        status: 302,
      },
      {
        name: "other-error",
        request: fakeRequest("https://backend.invalid/rest/v1/cms_content_items", "HEAD", "net::ERR_FAILED"),
        status: 200,
      },
    ];

    for (const scenario of scenarios) {
      const page = new FakePage();
      const observer = createCmsBrowserObserver({
        suite: `observer-head-negative-${scenario.name}`,
        expectedSha: sha,
        trackedRequestOrigins: ["https://backend.invalid"],
      });
      observer.observePage(page as unknown as Page);
      page.emit("request", scenario.request);
      if (scenario.status) page.emit("response", fakeResponseForRequest(scenario.request, scenario.status));
      page.emit("requestfailed", scenario.request);

      expect(() => observer.assertClean(), scenario.name).toThrow(/QA_CMS_BROWSER_OBSERVABILITY_FAILED/);
      expect(observer.snapshot().status, scenario.name).toBe("failed");
    }
  });

  it("matches only the explicit method, path and status tuple", () => {
    const allowance = {
      id: "tampered-payload",
      method: "POST",
      origin: "https://backend.invalid",
      path: "/functions/v1/cms-content",
      statuses: [422],
      maxOccurrences: 1,
    } as const;
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "POST",
        origin: "https://backend.invalid",
        pathname: "/functions/v1/cms-content",
        status: 422,
      }),
    ).toBe(true);
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "GET",
        origin: "https://backend.invalid",
        pathname: "/functions/v1/cms-content",
        status: 422,
      }),
    ).toBe(false);
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "POST",
        origin: "https://backend.invalid",
        pathname: "/functions/v1/cms-content-other",
        status: 422,
      }),
    ).toBe(false);
    expect(
      expectedHttpFailureMatches(allowance, {
        method: "POST",
        origin: "https://other.invalid",
        pathname: "/functions/v1/cms-content",
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

  it("accepts an exact SDK console error only after its bounded HTTP failure", () => {
    const page = new FakePage();
    const firstLine = "AuthApiError: Invalid Refresh Token: Refresh Token Not Found";
    const observer = createCmsBrowserObserver({
      suite: "observer-sdk-mirror",
      expectedSha: sha,
      expectedHttpFailures: [
        {
          id: "expired-refresh-token",
          method: "POST",
          path: "/auth/v1/token",
          statuses: [400],
          minOccurrences: 1,
          maxOccurrences: 1,
          consoleErrorMirrorFirstLine: firstLine,
          consoleErrorMirrorOrigin: "https://site.invalid",
        },
      ],
    });
    observer.observePage(page as unknown as Page);
    page.emit("response", fakeResponse("/auth/v1/token", 400));
    page.emit(
      "console",
      fakeConsoleMessage(`${firstLine}\n    at sdk (https://site.invalid/assets/app.js:1:2)`),
    );
    expect(() => observer.assertClean()).not.toThrow();
    expect(observer.snapshot()).toMatchObject({
      status: "passed",
      unexpectedConsole: 0,
      unexpectedHttp: 0,
      expectedHttp: [{ id: "expired-refresh-token", occurrences: 1 }],
    });
  });

  it("rejects reordered, retyped, changed, duplicated or page-error SDK mirrors", () => {
    const firstLine = "AuthApiError: Invalid Refresh Token: Refresh Token Not Found";
    const validMirror = `${firstLine}\n    at sdk (https://site.invalid/assets/app.js:1:2)`;
    const cases: Array<{ name: string; emit: (page: FakePage) => void }> = [
      {
        name: "before-response",
        emit: (page) => {
          page.emit("console", fakeConsoleMessage(validMirror));
          page.emit("response", fakeResponse("/auth/v1/token", 400));
        },
      },
      {
        name: "warning",
        emit: (page) => {
          page.emit("response", fakeResponse("/auth/v1/token", 400));
          page.emit("console", fakeConsoleMessage(validMirror, "warning"));
        },
      },
      {
        name: "changed-first-line",
        emit: (page) => {
          page.emit("response", fakeResponse("/auth/v1/token", 400));
          page.emit(
            "console",
            fakeConsoleMessage(
              `${firstLine} unexpected\n    at sdk (https://site.invalid/assets/app.js:1:2)`,
            ),
          );
        },
      },
      {
        name: "non-stack-suffix",
        emit: (page) => {
          page.emit("response", fakeResponse("/auth/v1/token", 400));
          page.emit("console", fakeConsoleMessage(`${firstLine}\nunrelated failure`));
        },
      },
      {
        name: "duplicate",
        emit: (page) => {
          page.emit("response", fakeResponse("/auth/v1/token", 400));
          page.emit("console", fakeConsoleMessage(validMirror));
          page.emit("console", fakeConsoleMessage(validMirror));
        },
      },
      {
        name: "wrong-console-origin",
        emit: (page) => {
          page.emit("response", fakeResponse("/auth/v1/token", 400));
          page.emit(
            "console",
            fakeConsoleMessage(validMirror, "error", "https://other.invalid/assets/app.js"),
          );
        },
      },
      {
        name: "page-error",
        emit: (page) => {
          page.emit("response", fakeResponse("/auth/v1/token", 400));
          page.emit("pageerror", new Error(firstLine));
        },
      },
    ];

    for (const scenario of cases) {
      const page = new FakePage();
      const observer = createCmsBrowserObserver({
        suite: `observer-sdk-mirror-${scenario.name}`,
        expectedSha: sha,
        expectedHttpFailures: [
          {
            id: "expired-refresh-token",
            method: "POST",
            path: "/auth/v1/token",
            statuses: [400],
            minOccurrences: 1,
            maxOccurrences: 1,
            consoleErrorMirrorFirstLine: firstLine,
            consoleErrorMirrorOrigin: "https://site.invalid",
          },
        ],
      });
      observer.observePage(page as unknown as Page);
      scenario.emit(page);
      expect(() => observer.assertClean(), scenario.name).toThrow(/QA_CMS_BROWSER_OBSERVABILITY_FAILED/);
      expect(observer.snapshot().unexpectedConsole, scenario.name).toBe(1);
    }
  });

  it("does not consume an HTTP allowance from a different origin", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({
      suite: "observer-http-origin",
      expectedSha: sha,
      expectedHttpFailures: [
        {
          id: "expired-refresh-token",
          method: "POST",
          origin: "https://backend.invalid",
          path: "/auth/v1/token",
          statuses: [400],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
      ],
    });
    observer.observePage(page as unknown as Page);
    page.emit("response", fakeResponse("/auth/v1/token", 400, "POST", "https://other.invalid"));
    expect(observer.snapshot()).toMatchObject({
      status: "failed",
      unexpectedHttp: 1,
      expectedHttp: [{ id: "expired-refresh-token", occurrences: 0 }],
    });
    expect(() => observer.assertClean()).toThrow(/POST \/auth\/v1\/token -> 400/);
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
      resourceType: () => "script",
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

  it("ignores only the exact Playwright service-worker isolation diagnostic", () => {
    const page = new FakePage();
    const observer = createCmsBrowserObserver({ suite: "observer-harness", expectedSha: sha });
    const exactMessage = "Service Worker registration blocked by Playwright";
    observer.observePage(page as unknown as Page);
    page.emit("console", {
      type: () => "warning",
      text: () => exactMessage,
      location: () => ({ url: "" }),
    });
    expect(() => observer.assertClean()).not.toThrow();
    expect(observer.snapshot().unexpectedConsole).toBe(0);

    for (const [type, text, url] of [
      ["warning", exactMessage, "https://site.invalid/sw.js"],
      ["error", exactMessage, ""],
      ["warning", `${exactMessage} for an unexpected reason`, ""],
    ]) {
      const failingPage = new FakePage();
      const failingObserver = createCmsBrowserObserver({
        suite: "observer-harness-negative",
        expectedSha: sha,
      });
      failingObserver.observePage(failingPage as unknown as Page);
      failingPage.emit("console", {
        type: () => type,
        text: () => text,
        location: () => ({ url }),
      });
      expect(() => failingObserver.assertClean()).toThrow(/blocked by Playwright/);
      expect(failingObserver.snapshot().unexpectedConsole).toBe(1);
    }
  });

  it("accepts only the documented non-fatal Turnstile browser signals", () => {
    expect(
      isExpectedTurnstilePatResponse({
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/pat/example",
      }),
    ).toBe(true);
    expect(
      isExpectedTurnstileDnsFailure({
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "GET",
        resourceType: "fetch",
        url: "https://probe.challenges.cloudflare.com/cdn-cgi/challenge-platform/probe",
      }),
    ).toBe(true);

    for (const input of [
      {
        method: "POST",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/pat/example",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 403,
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/pat/example",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com/turnstile/v0/api.js",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com.example.invalid/cdn-cgi/challenge-platform/h/g/pat/example",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "http://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/pat/example",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com:444/cdn-cgi/challenge-platform/h/g/pat/example",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/notpat/example?segment=pat",
      },
      {
        method: "GET",
        resourceType: "fetch",
        status: 401,
        url: "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/%70at/example",
      },
    ]) {
      expect(isExpectedTurnstilePatResponse(input), JSON.stringify(input)).toBe(false);
    }

    for (const input of [
      {
        errorText: "net::ERR_FAILED",
        method: "GET",
        resourceType: "fetch",
        url: "https://probe.challenges.cloudflare.com/example",
      },
      {
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "GET",
        resourceType: "fetch",
        url: "https://challenges.cloudflare.com/example",
      },
      {
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "GET",
        resourceType: "fetch",
        url: "http://probe.challenges.cloudflare.com/example",
      },
      {
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "GET",
        resourceType: "fetch",
        url: "https://probe.challenges.cloudflare.com.example.invalid/example",
      },
      {
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "POST",
        resourceType: "fetch",
        url: "https://probe.challenges.cloudflare.com/example",
      },
      {
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "GET",
        resourceType: "fetch",
        url: "https://probe.challenges.cloudflare.com:444/example",
      },
      {
        errorText: "net::ERR_ABORTED",
        method: "GET",
        resourceType: "fetch",
        url: "https://probe.challenges.cloudflare.com/example",
      },
      {
        errorText: "net::ERR_NAME_NOT_RESOLVED",
        method: "GET",
        resourceType: "fetch",
        url: "https://evilchallenges.cloudflare.com/example",
      },
    ]) {
      expect(isExpectedTurnstileDnsFailure(input), JSON.stringify(input)).toBe(false);
    }

    const page = new FakePage();
    const observer = createCmsBrowserObserver({ suite: "observer-turnstile", expectedSha: sha });
    observer.observePage(page as unknown as Page);
    page.emit("console", {
      type: () => "error",
      text: () => "vendor diagnostic",
      location: () => ({ url: "https://challenges.cloudflare.com/turnstile/v0/api.js" }),
    });
    page.emit("response", {
      status: () => 401,
      url: () => "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/pat/example",
      request: () => ({ method: () => "GET", resourceType: () => "fetch" }),
    });
    page.emit("requestfailed", {
      method: () => "GET",
      resourceType: () => "fetch",
      url: () => "https://probe.challenges.cloudflare.com/cdn-cgi/challenge-platform/probe",
      failure: () => ({ errorText: "net::ERR_NAME_NOT_RESOLVED" }),
    });
    expect(() => observer.assertClean()).not.toThrow();
    expect(observer.snapshot()).toMatchObject({
      unexpectedConsole: 0,
      unexpectedHttp: 0,
      requestFailures: 0,
    });

    for (const url of [
      "https://site.invalid/assets/app.js",
      "https://probe.challenges.cloudflare.com/turnstile.js",
      "https://challenges.cloudflare.com.example.invalid/turnstile.js",
    ]) {
      const failingPage = new FakePage();
      const failingObserver = createCmsBrowserObserver({
        suite: "observer-turnstile-console-negative",
        expectedSha: sha,
      });
      failingObserver.observePage(failingPage as unknown as Page);
      failingPage.emit("console", {
        type: () => "error",
        text: () => "same vendor diagnostic",
        location: () => ({ url }),
      });
      expect(() => failingObserver.assertClean()).toThrow(/same vendor diagnostic/);
      expect(failingObserver.snapshot().unexpectedConsole).toBe(1);
    }

    const failingPage = new FakePage();
    const failingObserver = createCmsBrowserObserver({
      suite: "observer-turnstile-network-negative",
      expectedSha: sha,
    });
    failingObserver.observePage(failingPage as unknown as Page);
    failingPage.emit("response", {
      status: () => 403,
      url: () => "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/g/pat/example",
      request: () => ({ method: () => "GET", resourceType: () => "fetch" }),
    });
    failingPage.emit("requestfailed", {
      method: () => "GET",
      resourceType: () => "fetch",
      url: () => "https://probe.challenges.cloudflare.com/cdn-cgi/challenge-platform/probe",
      failure: () => ({ errorText: "net::ERR_ABORTED" }),
    });
    expect(() => failingObserver.assertClean()).toThrow(/QA_CMS_BROWSER_OBSERVABILITY_FAILED/);
    expect(failingObserver.snapshot()).toMatchObject({ unexpectedHttp: 1, requestFailures: 1 });
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

    expect(() =>
      createCmsBrowserObserver({
        suite: "observer-invalid-sdk-mirror",
        expectedSha: sha,
        expectedHttpFailures: [
          {
            id: "invalid-mirror",
            method: "POST",
            path: "/auth/v1/token",
            statuses: [400],
            maxOccurrences: 1,
            consoleErrorMirrorFirstLine: "first line\nsecond line",
            consoleErrorMirrorOrigin: "https://site.invalid",
          },
        ],
      }),
    ).toThrow(/QA_CMS_BROWSER_OBSERVER_ALLOWANCE_INVALID/);
  });
});
