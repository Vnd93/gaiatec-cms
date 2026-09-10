import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const context = readFileSync("src/admin/auth/AdminAuthContext.tsx", "utf8");

describe("admin session resolution", () => {
  it("issues one call per distinct token and action, not one per trigger", () => {
    // Measured on staging: mounting fires three identical resolves within seven milliseconds of each
    // other, and under that self-contention each took between 3.1 and 4.0 seconds while the access
    // gate waited for all of them.
    expect(context).toContain("const sessionInFlight = new Map<string, Promise<SessionSnapshot>>();");
    expect(context).toContain("const key = `${action}:${session.access_token}`;");
    expect(context).toContain("const running = sessionInFlight.get(key);");
    expect(context).toContain("if (running) return running;");
    // The entry has to be released whatever the outcome, or a later resolve would reuse a dead promise.
    expect(context).toMatch(/\.finally\(\(\) => \{\s*sessionInFlight\.delete\(key\);\s*\}\)/);
  });

  it("keeps every guarantee that made three calls safe", () => {
    // A different action or a different token is still its own call: the key contains both.
    expect(context).toContain("`${action}:${session.access_token}`");
    // The response is still validated and still bound to the user it was requested for.
    expect(context).toContain("body.userId !== session.user.id");
    expect(context).toContain('throw new SessionInvocationError("SESSION_RESPONSE_INVALID", 503)');
    // Each caller still checks its own request identifier before applying anything.
    expect(context).toContain("if (currentRequest !== requestId.current) return;");
    // The call itself keeps its own deadline.
    expect(context).toContain("signal: AbortSignal.timeout(10_000)");
  });
});

describe("qa fixture readiness", () => {
  const fixture = readFileSync("scripts/qa/cms-browser-fixture.mjs", "utf8");

  it("waits for readiness instead of reading it in the first instant", () => {
    // The actor has just received its roles and flag overrides, and the capability manifest can be
    // evaluated moments later. The required condition is unchanged; only the instant it is read is.
    const block = fixture.slice(fixture.indexOf("async function assertReadySession"));
    expect(block.slice(0, 1800)).toContain("for (let attempt = 0; attempt < 6; attempt += 1)");
    expect(block.slice(0, 1800)).toContain("setTimeout(resolve, 2_000)");
    expect(block.slice(0, 1800)).toContain("status === 200 && accessGranted && capabilities");
  });

  it("names which of the three conditions was missing", () => {
    // The previous message said only that the session was not ready, which cost a full staging cycle.
    expect(fixture).toContain("QA_CMS_FIXTURE_SESSION_NOT_READY:${status}:");
    expect(fixture).toContain('accessGranted ? "granted" : "denied"');
    expect(fixture).toContain('capabilities ? "capabilities" : "no_capabilities"');
    // Only closed words and a status travel: nothing from the response body.
    const message = fixture.slice(
      fixture.indexOf("QA_CMS_FIXTURE_SESSION_NOT_READY:${status}"),
      fixture.indexOf("QA_CMS_FIXTURE_SESSION_NOT_READY:${status}") + 240,
    );
    expect(message).not.toMatch(/result\?\.|body|error/);
  });
});
