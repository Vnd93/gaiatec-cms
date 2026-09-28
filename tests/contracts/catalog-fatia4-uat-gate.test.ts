import { describe, expect, it } from "vitest";
import { CatalogFatia4UatRecordSchema } from "@/shared/contracts/catalog-release";

const baseCoverage = {
  schemaVersion: 1 as const,
  source: "canonical-nominal-list" as const,
  totalCandidates: 18,
  reviewedCandidates: 18,
  approvedCandidates: 16,
  provisionalCandidates: 2,
  requiredCoveragePercent: 100 as const,
  publication: false as const,
  load: false as const,
  cutover: false as const,
};

const baseRollback = {
  schemaVersion: 1 as const,
  reader: "legacy" as const,
  featureFlag: "ev2.catalog_v1" as const,
  copyBetweenSources: false as const,
  publication: false as const,
  load: false as const,
  cutover: false as const,
};

describe("CAT-010–CAT-012 UAT evidence envelope", () => {
  it("accepts a pending local record without sensitive or mutating evidence", () => {
    expect(
      CatalogFatia4UatRecordSchema.safeParse({
        schemaVersion: 1,
        candidateSha: "a".repeat(40),
        environment: "local",
        featureFlag: "default-off",
        coverage: baseCoverage,
        rollback: baseRollback,
        browser: {
          engine: "chromium",
          authenticated: false,
          backend: "local",
          status: "pending",
          evidenceId: null,
        },
        publication: false,
        load: false,
        cutover: false,
      }).success,
    ).toBe(true);
  });

  it("requires authenticated Google Chrome and staging for a passed UAT", () => {
    const passed = {
      schemaVersion: 1,
      candidateSha: "b".repeat(40),
      environment: "staging",
      featureFlag: "default-off",
      coverage: baseCoverage,
      rollback: baseRollback,
      browser: {
        engine: "chrome",
        authenticated: true,
        backend: "staging",
        status: "passed",
        evidenceId: { evidenceId: "CAT-UAT-F4-CHROME-001", completedAt: "2026-09-28T18:00:00.000Z" },
      },
      publication: false,
      load: false,
      cutover: false,
    };
    expect(CatalogFatia4UatRecordSchema.safeParse(passed).success).toBe(true);
    expect(
      CatalogFatia4UatRecordSchema.safeParse({
        ...passed,
        browser: { ...passed.browser, engine: "chromium" },
      }).success,
    ).toBe(false);
    expect(
      CatalogFatia4UatRecordSchema.safeParse({
        ...passed,
        browser: { ...passed.browser, authenticated: false },
      }).success,
    ).toBe(false);
  });

  it("cannot authorize publication, load or cutover", () => {
    const pending = {
      schemaVersion: 1,
      candidateSha: "c".repeat(40),
      environment: "local",
      featureFlag: "default-off",
      coverage: baseCoverage,
      rollback: baseRollback,
      browser: {
        engine: "chromium",
        authenticated: false,
        backend: "local",
        status: "pending",
        evidenceId: null,
      },
      publication: false,
      load: false,
      cutover: false,
    };
    expect(
      CatalogFatia4UatRecordSchema.safeParse({
        ...pending,
        publication: true,
      }).success,
    ).toBe(false);
    expect(
      CatalogFatia4UatRecordSchema.safeParse({
        ...pending,
        coverage: { ...baseCoverage, load: true },
      }).success,
    ).toBe(false);
  });
});
