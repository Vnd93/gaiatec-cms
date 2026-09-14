import type { BrowserContext, ConsoleMessage, Page, Request, Response } from "@playwright/test";
import { isAllowedThirdPartyConsoleOrigin } from "./console-origins";

type PathMatcher = string | RegExp;

export type ExpectedHttpFailure = {
  id: string;
  method: string;
  origin?: string;
  path: PathMatcher;
  statuses: readonly number[];
  maxOccurrences: number;
  minOccurrences?: number;
  allowConsoleMirror?: boolean;
  consoleErrorMirrorFirstLine?: string;
  consoleErrorMirrorOrigin?: string;
};

export type BrowserObserverSnapshot = {
  status: "passed" | "failed";
  unexpectedConsole: number;
  unexpectedHttp: number;
  requestFailures: number;
  expectedHttp: Array<{ id: string; occurrences: number }>;
  secretsPersisted: false;
};

type ObserverConfiguration = {
  suite: string;
  expectedSha: string;
  sensitiveValues?: readonly string[];
  expectedHttpFailures?: readonly ExpectedHttpFailure[];
  trackedRequestOrigins?: readonly string[];
};

type SettleOptions = {
  timeoutMs?: number;
  quietPeriodMs?: number;
};

type MutableAllowance = ExpectedHttpFailure & {
  occurrences: number;
  consoleErrorMirrorOccurrences: number;
};

const relevantWarning =
  /content security policy|\bcsp\b|mixed content|deprecated|hydration|uncaught|security|blocked|refused/i;
const resourceFailure = /failed to load resource.*status(?: code)?(?: of)?\s*(\d{3})/i;
const javascriptStackFrame =
  /^ {4}at (?:async )?(?:(?:[A-Za-z_$][\w$.[\]<>]* )?\()?https:\/\/[^\s()]+:\d+:\d+\)?$/;
// The observed contexts deliberately use `serviceWorkers: "block"`. Chromium reports this exact
// Playwright-owned diagnostic when the production bootstrap attempts registration; it confirms the
// harness contract rather than an application failure. Any variation remains observable.
const playwrightServiceWorkerBlock = "Service Worker registration blocked by Playwright";
// Cloudflare documents both signals as normal Turnstile challenge processing: an unavailable
// Private Access Token returns 401 at the apex, and DNS probes on challenge subdomains can fail
// without blocking the visitor. Keep the tuples narrower than the vendor's own recommendation so
// every other status, request kind, transport error and apex failure remains fail-closed.
const turnstileOrigin = "https://challenges.cloudflare.com";
const turnstilePatPath = /^\/cdn-cgi\/challenge-platform\/(?:[^/]+\/)*pat(?:\/|$)/;

export function isExpectedTurnstilePatResponse(input: {
  method: string;
  resourceType: string;
  status: number;
  url: string;
}) {
  if (input.method !== "GET" || input.resourceType !== "fetch" || input.status !== 401) return false;
  try {
    const url = new URL(input.url);
    return url.origin === turnstileOrigin && turnstilePatPath.test(url.pathname);
  } catch {
    return false;
  }
}

export function isExpectedTurnstileDnsFailure(input: {
  errorText: string | undefined;
  method: string;
  resourceType: string;
  url: string;
}) {
  if (
    input.method !== "GET" ||
    input.resourceType !== "fetch" ||
    input.errorText !== "net::ERR_NAME_NOT_RESOLVED"
  ) {
    return false;
  }
  try {
    const url = new URL(input.url);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.hostname !== "challenges.cloudflare.com" &&
      url.hostname.endsWith(".challenges.cloudflare.com")
    );
  } catch {
    return false;
  }
}

function matchesPath(matcher: PathMatcher, pathname: string) {
  if (typeof matcher === "string") return matcher === pathname;
  matcher.lastIndex = 0;
  return matcher.test(pathname);
}

function isCanonicalHttpOrigin(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "https:" || parsed.protocol === "http:") &&
      parsed.origin === value &&
      parsed.username === "" &&
      parsed.password === ""
    );
  } catch {
    return false;
  }
}

function safeOrigin(url: string) {
  try {
    return new URL(url).origin;
  } catch {
    return "[invalid-origin]";
  }
}

function matchesConsoleErrorMirror(text: string, expectedFirstLine: string) {
  if (text.length > 2_048) return false;
  const lines = text.split(/\r?\n/);
  return (
    lines.length >= 2 &&
    lines.length <= 12 &&
    lines[0] === expectedFirstLine &&
    lines.slice(1).every((line) => javascriptStackFrame.test(line))
  );
}

export function sanitizeBrowserDiagnostic(value: unknown, sensitiveValues: readonly string[] = []) {
  let sanitized = value instanceof Error ? value.message : String(value ?? "");
  for (const sensitive of sensitiveValues) {
    if (sensitive) sanitized = sanitized.replaceAll(sensitive, "[secret]");
  }
  return sanitized
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/gi, "[uuid]")
    .replace(/\b(?:sbp_|sb_secret_|sk-or-)[A-Za-z0-9._-]{12,}\b/gi, "[secret]")
    .replace(/<[^>]{1,500}>/g, "[markup]")
    .replace(/\bjavascript\s*:/gi, "[script-scheme]")
    .replace(/\bon(?:error|load|click)\s*=/gi, "[event-handler]")
    .replace(/https?:\/\/[^\s"')]+/gi, "[url]")
    .slice(0, 320);
}

export function expectedHttpFailureMatches(
  allowance: ExpectedHttpFailure,
  input: { method: string; origin: string; pathname: string; status: number },
) {
  return (
    allowance.method.toUpperCase() === input.method.toUpperCase() &&
    (allowance.origin === undefined || allowance.origin === input.origin) &&
    allowance.statuses.includes(input.status) &&
    matchesPath(allowance.path, input.pathname)
  );
}

function safePath(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return "[invalid-url]";
  }
}

export function createCmsBrowserObserver(configuration: ObserverConfiguration) {
  if (!/^[a-f0-9]{40}$/.test(configuration.expectedSha)) {
    throw new Error("QA_CMS_BROWSER_OBSERVER_SHA_INVALID");
  }
  if (!/^[a-z0-9][a-z0-9_-]{2,80}$/i.test(configuration.suite)) {
    throw new Error("QA_CMS_BROWSER_OBSERVER_SUITE_INVALID");
  }
  const trackedRequestOrigins = new Set<string>();
  for (const origin of configuration.trackedRequestOrigins ?? []) {
    if (!isCanonicalHttpOrigin(origin) || trackedRequestOrigins.has(origin)) {
      throw new Error("QA_CMS_BROWSER_OBSERVER_ORIGIN_INVALID");
    }
    trackedRequestOrigins.add(origin);
  }
  const ids = new Set<string>();
  const consoleErrorMirrorFirstLines = new Set<string>();
  const allowances: MutableAllowance[] = (configuration.expectedHttpFailures ?? []).map((entry) => {
    const consoleErrorMirrorFirstLine = entry.consoleErrorMirrorFirstLine;
    const consoleErrorMirrorOrigin = entry.consoleErrorMirrorOrigin;
    if (
      ids.has(entry.id) ||
      !/^[a-z0-9][a-z0-9_.-]{2,100}$/i.test(entry.id) ||
      !Number.isInteger(entry.maxOccurrences) ||
      entry.maxOccurrences < 1 ||
      !Number.isInteger(entry.minOccurrences ?? 0) ||
      (entry.minOccurrences ?? 0) < 0 ||
      (entry.minOccurrences ?? 0) > entry.maxOccurrences ||
      entry.statuses.length === 0 ||
      new Set(entry.statuses).size !== entry.statuses.length ||
      !/^[A-Z]+$/.test(entry.method) ||
      (entry.origin !== undefined && !isCanonicalHttpOrigin(entry.origin)) ||
      (typeof entry.path === "string" &&
        (!entry.path.startsWith("/") || entry.path.includes("?") || entry.path.includes("#"))) ||
      entry.statuses.some((status) => !Number.isInteger(status) || status < 400 || status > 599) ||
      (consoleErrorMirrorFirstLine !== undefined &&
        (typeof consoleErrorMirrorFirstLine !== "string" ||
          consoleErrorMirrorFirstLine.length < 1 ||
          consoleErrorMirrorFirstLine.length > 320 ||
          consoleErrorMirrorFirstLine.trim() !== consoleErrorMirrorFirstLine ||
          /[\r\n]/.test(consoleErrorMirrorFirstLine) ||
          consoleErrorMirrorFirstLines.has(consoleErrorMirrorFirstLine))) ||
      (consoleErrorMirrorFirstLine === undefined) !== (consoleErrorMirrorOrigin === undefined) ||
      (consoleErrorMirrorOrigin !== undefined && !isCanonicalHttpOrigin(consoleErrorMirrorOrigin))
    ) {
      throw new Error("QA_CMS_BROWSER_OBSERVER_ALLOWANCE_INVALID");
    }
    ids.add(entry.id);
    if (consoleErrorMirrorFirstLine) consoleErrorMirrorFirstLines.add(consoleErrorMirrorFirstLine);
    return { ...entry, occurrences: 0, consoleErrorMirrorOccurrences: 0 };
  });
  const observedPages = new WeakSet<Page>();
  const observedContexts = new WeakSet<BrowserContext>();
  const unexpectedConsole: string[] = [];
  const unexpectedHttp: string[] = [];
  const requestFailures: string[] = [];
  const pendingTrackedRequests = new Map<Request, string>();
  let trackedRequestRevision = 0;
  const successfulTrackedHeadFetches = new WeakSet<Request>();
  const consoleResourceFailures = new Map<
    string,
    { status: number; origin: string; pathname: string; occurrences: number }
  >();

  const sanitize = (value: unknown) => sanitizeBrowserDiagnostic(value, configuration.sensitiveValues ?? []);

  function settleTrackedRequest(request: Request) {
    if (pendingTrackedRequests.delete(request)) trackedRequestRevision += 1;
  }

  function isTrackedHeadFetch(request: Request) {
    if (request.method() !== "HEAD" || request.resourceType() !== "fetch") return false;
    try {
      return trackedRequestOrigins.has(new URL(request.url()).origin);
    } catch {
      return false;
    }
  }

  function onResponse(response: Response) {
    const status = response.status();
    const request = response.request();
    // Chromium can emit requestfailed(net::ERR_ABORTED), without requestfinished, after a fetch
    // HEAD has already returned 2xx to JavaScript. HEAD has no response body, so that response is
    // terminal proof; requests without this exact prior proof remain fail-closed.
    if (status >= 200 && status < 300 && isTrackedHeadFetch(request)) {
      successfulTrackedHeadFetches.add(request);
      settleTrackedRequest(request);
    }
    if (status < 400) return;
    if (
      isExpectedTurnstilePatResponse({
        method: request.method(),
        resourceType: request.resourceType(),
        status,
        url: response.url(),
      })
    ) {
      return;
    }
    const input = {
      method: request.method(),
      origin: safeOrigin(response.url()),
      pathname: safePath(response.url()),
      status,
    };
    const allowance = allowances.find(
      (candidate) =>
        candidate.occurrences < candidate.maxOccurrences && expectedHttpFailureMatches(candidate, input),
    );
    if (allowance) {
      allowance.occurrences += 1;
      return;
    }
    unexpectedHttp.push(sanitize(`${input.method} ${input.pathname} -> ${status}`));
  }

  function onConsole(message: ConsoleMessage) {
    const type = message.type();
    const text = message.text();
    const firstLine = text.split(/\r?\n/, 1)[0];
    if (type === "warning" && text === playwrightServiceWorkerBlock && message.location().url === "") return;
    const configuredMirror = allowances.find(
      (candidate) => candidate.consoleErrorMirrorFirstLine === firstLine,
    );
    if (configuredMirror) {
      if (
        type === "error" &&
        matchesConsoleErrorMirror(text, configuredMirror.consoleErrorMirrorFirstLine ?? "") &&
        safeOrigin(message.location().url) === configuredMirror.consoleErrorMirrorOrigin &&
        configuredMirror.consoleErrorMirrorOccurrences < configuredMirror.occurrences
      ) {
        configuredMirror.consoleErrorMirrorOccurrences += 1;
        return;
      }
      unexpectedConsole.push(sanitize(text));
      return;
    }
    if (type !== "error" && !(type === "warning" && relevantWarning.test(text))) return;
    if (isAllowedThirdPartyConsoleOrigin(message.location().url)) return;
    const mirror = text.match(resourceFailure);
    if (mirror) {
      const status = Number(mirror[1]);
      const origin = safeOrigin(message.location().url);
      const pathname = safePath(message.location().url);
      const key = `${status}:${origin}:${pathname}`;
      const current = consoleResourceFailures.get(key);
      consoleResourceFailures.set(key, {
        status,
        origin,
        pathname,
        occurrences: (current?.occurrences ?? 0) + 1,
      });
      return;
    }
    unexpectedConsole.push(sanitize(text));
  }

  function onRequestFailed(request: Request) {
    settleTrackedRequest(request);
    const failure = request.failure();
    if (
      failure?.errorText === "net::ERR_ABORTED" &&
      successfulTrackedHeadFetches.has(request) &&
      isTrackedHeadFetch(request)
    ) {
      successfulTrackedHeadFetches.delete(request);
      return;
    }
    if (
      isExpectedTurnstileDnsFailure({
        errorText: failure?.errorText,
        method: request.method(),
        resourceType: request.resourceType(),
        url: request.url(),
      })
    ) {
      return;
    }
    requestFailures.push(
      sanitize(`${request.method()} ${safePath(request.url())}: ${failure?.errorText ?? "request failed"}`),
    );
  }

  function onRequest(request: Request) {
    try {
      const url = new URL(request.url());
      if (trackedRequestOrigins.has(url.origin)) {
        pendingTrackedRequests.set(request, sanitize(`${request.method()} ${url.pathname}`));
        trackedRequestRevision += 1;
      }
    } catch {
      // Invalid URLs are still surfaced by response/request-failure diagnostics; they cannot match
      // a configured first-party origin and therefore cannot be considered settled first-party work.
    }
  }

  function onRequestFinished(request: Request) {
    settleTrackedRequest(request);
  }

  function observePage(page: Page) {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    page.on("request", onRequest);
    page.on("console", onConsole);
    page.on("pageerror", (error) => unexpectedConsole.push(sanitize(error)));
    page.on("requestfailed", onRequestFailed);
    page.on("requestfinished", onRequestFinished);
    page.on("response", onResponse);
  }

  function observeContext(context: BrowserContext) {
    if (observedContexts.has(context)) return;
    observedContexts.add(context);
    for (const page of context.pages()) observePage(page);
    context.on("page", observePage);
  }

  function violations() {
    const missing = allowances
      .filter((entry) => entry.occurrences < (entry.minOccurrences ?? 0))
      .map((entry) => `expected ${entry.id} ${entry.minOccurrences ?? 0}, observed ${entry.occurrences}`);
    const unmatchedConsoleMirrors = [...consoleResourceFailures.values()].flatMap(
      ({ status, origin, pathname, occurrences }) => {
        const permitted = allowances
          .filter(
            (entry) =>
              entry.allowConsoleMirror !== false &&
              entry.statuses.includes(status) &&
              (entry.origin === undefined || entry.origin === origin) &&
              matchesPath(entry.path, pathname),
          )
          .reduce((total, entry) => total + entry.occurrences, 0);
        return occurrences > permitted
          ? [
              sanitize(
                `console resource ${pathname} status ${status}: ${occurrences} observed, ${permitted} permitted`,
              ),
            ]
          : [];
      },
    );
    return [
      ...unexpectedConsole,
      ...unexpectedHttp,
      ...requestFailures,
      ...[...pendingTrackedRequests.values()].map((request) => `pending first-party request ${request}`),
      ...unmatchedConsoleMirrors,
      ...missing,
    ];
  }

  function snapshot(): BrowserObserverSnapshot {
    const unmatchedMirrorCount = [...consoleResourceFailures.values()].reduce(
      (total, { status, origin, pathname, occurrences }) => {
        const permitted = allowances
          .filter(
            (entry) =>
              entry.allowConsoleMirror !== false &&
              entry.statuses.includes(status) &&
              (entry.origin === undefined || entry.origin === origin) &&
              matchesPath(entry.path, pathname),
          )
          .reduce((sum, entry) => sum + entry.occurrences, 0);
        return total + Math.max(0, occurrences - permitted);
      },
      0,
    );
    return {
      status: violations().length === 0 ? "passed" : "failed",
      unexpectedConsole: unexpectedConsole.length + unmatchedMirrorCount,
      unexpectedHttp: unexpectedHttp.length,
      requestFailures: requestFailures.length + pendingTrackedRequests.size,
      expectedHttp: allowances.map(({ id, occurrences }) => ({ id, occurrences })),
      secretsPersisted: false,
    };
  }

  async function waitForTrackedRequestsToSettle(options: SettleOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const quietPeriodMs = options.quietPeriodMs ?? 500;
    if (
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 1 ||
      timeoutMs > 30_000 ||
      !Number.isInteger(quietPeriodMs) ||
      quietPeriodMs < 1 ||
      quietPeriodMs >= timeoutMs
    ) {
      throw new Error("QA_CMS_BROWSER_OBSERVER_SETTLE_OPTIONS_INVALID");
    }

    const deadline = Date.now() + timeoutMs;
    let observedRevision = trackedRequestRevision;
    let quietSince = pendingTrackedRequests.size === 0 ? Date.now() : null;
    while (true) {
      const now = Date.now();
      if (observedRevision !== trackedRequestRevision) {
        observedRevision = trackedRequestRevision;
        quietSince = pendingTrackedRequests.size === 0 ? now : null;
      } else if (pendingTrackedRequests.size === 0) {
        quietSince ??= now;
        if (now - quietSince >= quietPeriodMs) return;
      } else {
        quietSince = null;
      }

      if (now >= deadline) {
        const pending = [...pendingTrackedRequests.values()]
          .slice(0, 12)
          .map((request) => `pending first-party request ${request}`)
          .join(" | ");
        throw new Error(
          `QA_CMS_BROWSER_OBSERVABILITY_SETTLE_TIMEOUT:${configuration.suite}:${pending || "pending-state-did-not-quiesce"}`,
        );
      }

      const untilDeadline = Math.max(1, deadline - now);
      const untilQuiet = quietSince === null ? 25 : Math.max(1, quietPeriodMs - (now - quietSince));
      await new Promise((resolve) => setTimeout(resolve, Math.min(25, untilDeadline, untilQuiet)));
    }
  }

  function assertClean() {
    const failures = violations();
    if (failures.length) {
      throw new Error(
        `QA_CMS_BROWSER_OBSERVABILITY_FAILED:${configuration.suite}:${failures.slice(0, 12).join(" | ")}`,
      );
    }
  }

  return { observePage, observeContext, snapshot, waitForTrackedRequestsToSettle, assertClean };
}

export type CmsBrowserObserver = ReturnType<typeof createCmsBrowserObserver>;
