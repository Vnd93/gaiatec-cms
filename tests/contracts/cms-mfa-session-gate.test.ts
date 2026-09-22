import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const helper = readFileSync("tests/e2e/cms-mfa-session-gate.ts", "utf8");
const consumers = [
  readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8"),
  readFileSync("tests/e2e/cms-admin-ops-cycles.spec.ts", "utf8"),
  readFileSync("tests/e2e/cms-secondary-ui-cycles.spec.ts", "utf8"),
  readFileSync("tests/e2e/cms-security-boundaries.spec.ts", "utf8"),
];

describe("CMS MFA session gate", () => {
  it("waits for an exact real-backend MFA resolution before accepting the admin route", () => {
    expect(helper).toContain('url.pathname !== "/functions/v1/cms-session"');
    expect(helper).toContain('body.action === "mfa"');
    expect(helper).toContain("url.origin !== expectedOrigin");
    expect(helper).toContain('status: "active", mfaVerified: true, accessGranted: true');
    expect(helper).toContain("toHaveURL(/\\/admin(?:\\/?|\\?.*)$/");
    expect(helper.indexOf("const response = await resolution")).toBeLessThan(
      helper.indexOf("toHaveURL(/\\/admin"),
    );
  });

  it("is mandatory in every dependent mutating browser suite", () => {
    for (const source of consumers) {
      expect(source).toContain('import { submitCmsMfaAndAwaitReady } from "./cms-mfa-session-gate"');
      expect(source).toContain("await submitCmsMfaAndAwaitReady(");
    }
    expect(consumers[0].match(/await submitCmsMfaAndAwaitReady\(/g)).toHaveLength(2);
  });
});
