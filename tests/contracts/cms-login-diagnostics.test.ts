import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Page, Response } from "@playwright/test";
import { describe, expect, it, vi } from "vitest";
import { observeCmsLogin } from "../e2e/cms-login-diagnostics";

describe("fail-closed sanitized login diagnostics", () => {
  it("retains only exact-origin allowlisted response facts and never credentials", () => {
    const directory = mkdtempSync(join(tmpdir(), "cms-login-diagnostic-"));
    let listener: (response: Response) => void = () => undefined;
    const page = {
      on: vi.fn((_event, callback) => {
        listener = callback;
      }),
      off: vi.fn(),
    } as unknown as Page;
    const observation = observeCmsLogin(page, "https://api.example.invalid");
    const response = (url: string, status: number) =>
      ({
        url: () => url,
        status: () => status,
      }) as Response;
    try {
      listener(response("https://api.example.invalid/auth/v1/token?secret=never-persist", 200));
      listener(response("https://other.example.invalid/auth/v1/token", 503));
      listener(response("https://api.example.invalid/auth/v1/admin/users/private-actor", 200));
      listener(response("https://api.example.invalid/functions/v1/cms-session", 503));
      const file = join(directory, "failure.json");
      observation.writeFailure(file, "a".repeat(40), "staging");
      const contents = readFileSync(file, "utf8");
      const report = JSON.parse(contents);
      expect(report.status).toBe("failed");
      expect(report.releaseEligible).toBe(false);
      expect(
        report.responses.map(({ endpoint, status }: { endpoint: string; status: number }) => ({
          endpoint,
          status,
        })),
      ).toEqual([
        { endpoint: "auth-token", status: 200 },
        { endpoint: "cms-session", status: 503 },
      ]);
      expect(contents).not.toMatch(/never-persist|private-actor|https:|secret|cookie|password/i);
      observation.stop();
      expect(page.off).toHaveBeenCalledWith("response", listener);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses unbound SHA or unknown environment before writing", () => {
    const page = { on: vi.fn(), off: vi.fn() } as unknown as Page;
    const observation = observeCmsLogin(page, "https://api.example.invalid");
    expect(() => observation.writeFailure("unused", "short", "staging")).toThrow(
      "CMS_LOGIN_DIAGNOSTIC_BINDING_REFUSED",
    );
    expect(() => observation.writeFailure("unused", "a".repeat(40), "local")).toThrow(
      "CMS_LOGIN_DIAGNOSTIC_BINDING_REFUSED",
    );
  });

  it("preserves the original MFA expectation and failure separately from release evidence", () => {
    const spec = readFileSync("tests/e2e/cms-final-coverage.spec.ts", "utf8");
    const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
    expect(spec).toContain("await expect(page).toHaveURL(/\\/admin\\/mfa$/)");
    const helper = spec.slice(
      spec.indexOf("async function signInWithAal2"),
      spec.indexOf("function isEditorialResponseFor"),
    );
    expect(helper).toContain("throw error;");
    expect(helper).not.toContain("timeout:");
    const upload = workflow.slice(
      workflow.indexOf("      - name: Preserve allowlisted login diagnostics"),
      workflow.indexOf("      - name: Materialize fail-closed terminal CMS coverage"),
    );
    expect(upload).toContain("if: failure()");
    expect(upload).toContain("path: candidate/outputs/cms-login-failure.json");
    expect(upload).not.toMatch(/test-results|trace|video|\*|continue-on-error/);
    expect(workflow.indexOf("      - name: Prove terminal zero residue")).toBeLessThan(
      workflow.indexOf("      - name: Preserve allowlisted login diagnostics"),
    );
  });
});
