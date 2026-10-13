import type { Page, Response } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// Only allowlisted endpoint labels, status codes and durations leave the browser.
// Never persist URLs, request/response bodies, headers, cookies or form values.
export function observeCmsLogin(page: Page, expectedApiOrigin: string) {
  const started = Date.now();
  const responses: Array<{ endpoint: string; status: number; elapsedMs: number }> = [];
  const listener = (response: Response) => {
    const url = new URL(response.url());
    if (url.origin !== expectedApiOrigin) return;
    const endpoint = {
      "/auth/v1/token": "auth-token",
      "/auth/v1/user": "auth-user",
      "/functions/v1/cms-session": "cms-session",
    }[url.pathname];
    if (!endpoint || responses.length >= 32) return;
    responses.push({ endpoint, status: response.status(), elapsedMs: Date.now() - started });
  };
  page.on("response", listener);
  return {
    stop: () => page.off("response", listener),
    writeFailure(file: string, candidateSha: string, environment: string) {
      if (!/^[a-f0-9]{40}$/.test(candidateSha) || !["staging", "production"].includes(environment))
        throw new Error("CMS_LOGIN_DIAGNOSTIC_BINDING_REFUSED");
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(
        file,
        `${JSON.stringify(
          {
            schemaVersion: 1,
            event: "cms.login.mfa_navigation.failed",
            status: "failed",
            releaseEligible: false,
            candidateSha,
            environment,
            elapsedMs: Date.now() - started,
            responses,
            sensitiveValuesPersisted: false,
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
    },
  };
}
