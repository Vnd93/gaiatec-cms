import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  createCmsRealBrowserChallenge,
  parseCanonicalUtcTimestamp,
  selectSingleAttestedLead,
} from "../e2e/cms-real-browser-attestation";

describe("real-browser lead binding", () => {
  it("accepts the two canonical UTC formats returned by GitHub and rejects offsets", () => {
    expect(parseCanonicalUtcTimestamp("2026-09-08T14:59:00Z")).toBe(Date.parse("2026-09-08T14:59:00.000Z"));
    expect(parseCanonicalUtcTimestamp("2026-09-08T14:59:00.123Z")).toBe(
      Date.parse("2026-09-08T14:59:00.123Z"),
    );
    expect(parseCanonicalUtcTimestamp("2026-09-08T11:59:00-03:00")).toBeNaN();
    expect(parseCanonicalUtcTimestamp("2026-09-08T14:59:00.12Z")).toBeNaN();
  });

  it("selects the exact attested reference while unrelated commercial leads coexist", () => {
    const attested = { reference_code: "LD-A1B2C3D4E5", status: "new" };
    expect(
      selectSingleAttestedLead(
        [
          { reference_code: "LD-FFFFFFFFFF", status: "new" },
          attested,
          { reference_code: "LD-0000000000", status: "responded" },
        ],
        attested.reference_code,
      ),
    ).toBe(attested);
  });

  it("fails closed when the attested reference is absent, duplicated, or malformed", () => {
    expect(() => selectSingleAttestedLead([], "LD-A1B2C3D4E5")).toThrow(
      "QA_CMS_REAL_BROWSER_REFERENCE_CARDINALITY_INVALID",
    );
    expect(() =>
      selectSingleAttestedLead(
        [{ reference_code: "LD-A1B2C3D4E5" }, { reference_code: "LD-A1B2C3D4E5" }],
        "LD-A1B2C3D4E5",
      ),
    ).toThrow("QA_CMS_REAL_BROWSER_REFERENCE_CARDINALITY_INVALID");
    expect(() => selectSingleAttestedLead([], "LD-NOT-VALID")).toThrow(
      "QA_CMS_REAL_BROWSER_REFERENCE_REFUSED",
    );
  });

  it("logs only a sanitized challenge lifecycle event", () => {
    const directory = mkdtempSync(join(tmpdir(), "g12-browser-challenge-log-"));
    const candidateSha = "a".repeat(40);
    const runTag = "QA-CMS-FINAL-20260908-aaaaaaaa";
    const campaignPath = `/campanhas/qa-lead-${runTag.toLowerCase()}-deadbeef`;
    const saved = {
      required: process.env.QA_CMS_REAL_BROWSER_REQUIRED,
      runId: process.env.QA_CMS_PARENT_RUN_ID,
      runAttempt: process.env.QA_CMS_PARENT_RUN_ATTEMPT,
      controlSha: process.env.QA_CMS_CONTROL_SHA,
    };
    const writes: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(((value: unknown) => {
      writes.push(String(value));
      return true;
    }) as typeof process.stdout.write);
    try {
      process.env.QA_CMS_REAL_BROWSER_REQUIRED = "true";
      process.env.QA_CMS_PARENT_RUN_ID = "7654321";
      process.env.QA_CMS_PARENT_RUN_ATTEMPT = "2";
      process.env.QA_CMS_CONTROL_SHA = "b".repeat(40);
      const { challenge } = createCmsRealBrowserChallenge({
        repositoryRoot: directory,
        environment: "staging",
        candidateSha,
        runTag,
        origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
        campaignPath,
        formKey: `qa-ops-${runTag.toLowerCase()}-deadbeef`,
      });
      const log = writes.join("");
      const nonce = challenge.syntheticEmail.split("-").at(-1)?.split("@")[0] ?? "";
      expect(log).toContain('"event":"g12.real_browser.handoff.created"');
      expect(log).toContain(`"candidateSha":"${candidateSha}"`);
      expect(log).not.toContain("example.invalid");
      expect(log).not.toContain(challenge.syntheticEmail);
      expect(log).not.toContain(campaignPath);
      expect(log).not.toContain(challenge.challengeVariable);
      expect(log).not.toContain(nonce);
    } finally {
      stdout.mockRestore();
      for (const [key, value] of [
        ["QA_CMS_REAL_BROWSER_REQUIRED", saved.required],
        ["QA_CMS_PARENT_RUN_ID", saved.runId],
        ["QA_CMS_PARENT_RUN_ATTEMPT", saved.runAttempt],
        ["QA_CMS_CONTROL_SHA", saved.controlSha],
      ] as const) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
