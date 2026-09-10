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
