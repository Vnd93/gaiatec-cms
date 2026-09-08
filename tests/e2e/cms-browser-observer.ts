import type { BrowserContext, ConsoleMessage, Page, Request, Response } from "@playwright/test";

type PathMatcher = string | RegExp;

export type ExpectedHttpFailure = {
  id: string;
  method: string;
  path: PathMatcher;
  statuses: readonly number[];
  maxOccurrences: number;
  minOccurrences?: number;
  allowConsoleMirror?: boolean;
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
};

type MutableAllowance = ExpectedHttpFailure & { occurrences: number };

const relevantWarning =
  /content security policy|\bcsp\b|mixed content|deprecated|hydration|uncaught|security|blocked|refused/i;
const resourceFailure = /failed to load resource.*status(?: code)?(?: of)?\s*(\d{3})/i;

function matchesPath(matcher: PathMatcher, pathname: string) {
  if (typeof matcher === "string") return matcher === pathname;
  matcher.lastIndex = 0;
  return matcher.test(pathname);
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
  input: { method: string; pathname: string; status: number },
) {
  return (
    allowance.method.toUpperCase() === input.method.toUpperCase() &&
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
  const ids = new Set<string>();
  const allowances: MutableAllowance[] = (configuration.expectedHttpFailures ?? []).map((entry) => {
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
      (typeof entry.path === "string" &&
        (!entry.path.startsWith("/") || entry.path.includes("?") || entry.path.includes("#"))) ||
      entry.statuses.some((status) => !Number.isInteger(status) || status < 400 || status > 599)
    ) {
      throw new Error("QA_CMS_BROWSER_OBSERVER_ALLOWANCE_INVALID");
    }
    ids.add(entry.id);
    return { ...entry, occurrences: 0 };
  });
  const observedPages = new WeakSet<Page>();
  const observedContexts = new WeakSet<BrowserContext>();
  const unexpectedConsole: string[] = [];
  const unexpectedHttp: string[] = [];
  const requestFailures: string[] = [];
  const consoleResourceFailures = new Map<
    string,
    { status: number; pathname: string; occurrences: number }
  >();

  const sanitize = (value: unknown) => sanitizeBrowserDiagnostic(value, configuration.sensitiveValues ?? []);

  function onResponse(response: Response) {
    const status = response.status();
    if (status < 400) return;
    const request = response.request();
    const input = {
      method: request.method(),
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
    if (type !== "error" && !(type === "warning" && relevantWarning.test(message.text()))) return;
    const mirror = message.text().match(resourceFailure);
    if (mirror) {
      const status = Number(mirror[1]);
      const pathname = safePath(message.location().url);
      const key = `${status}:${pathname}`;
      const current = consoleResourceFailures.get(key);
      consoleResourceFailures.set(key, {
        status,
        pathname,
        occurrences: (current?.occurrences ?? 0) + 1,
      });
      return;
    }
    unexpectedConsole.push(sanitize(message.text()));
  }

  function onRequestFailed(request: Request) {
    const failure = request.failure();
    requestFailures.push(
      sanitize(`${request.method()} ${safePath(request.url())}: ${failure?.errorText ?? "request failed"}`),
    );
  }

  function observePage(page: Page) {
    if (observedPages.has(page)) return;
    observedPages.add(page);
    page.on("console", onConsole);
    page.on("pageerror", (error) => unexpectedConsole.push(sanitize(error)));
    page.on("requestfailed", onRequestFailed);
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
      ({ status, pathname, occurrences }) => {
        const permitted = allowances
          .filter(
            (entry) =>
              entry.allowConsoleMirror !== false &&
              entry.statuses.includes(status) &&
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
      ...unmatchedConsoleMirrors,
      ...missing,
    ];
  }

  function snapshot(): BrowserObserverSnapshot {
    const unmatchedMirrorCount = [...consoleResourceFailures.values()].reduce(
      (total, { status, pathname, occurrences }) => {
        const permitted = allowances
          .filter(
            (entry) =>
              entry.allowConsoleMirror !== false &&
              entry.statuses.includes(status) &&
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
      requestFailures: requestFailures.length,
      expectedHttp: allowances.map(({ id, occurrences }) => ({ id, occurrences })),
      secretsPersisted: false,
    };
  }

  function assertClean() {
    const failures = violations();
    if (failures.length) {
      throw new Error(
        `QA_CMS_BROWSER_OBSERVABILITY_FAILED:${configuration.suite}:${failures.slice(0, 12).join(" | ")}`,
      );
    }
  }

  return { observePage, observeContext, snapshot, assertClean };
}

export type CmsBrowserObserver = ReturnType<typeof createCmsBrowserObserver>;
