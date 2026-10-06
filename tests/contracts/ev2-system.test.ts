import { describe, expect, it } from "vitest";
import {
  Ev2AssuranceCommandResultSchema,
  Ev2SystemCapabilitySchema,
  Ev2SystemSnapshotSchema,
} from "@/shared/contracts/ev2-system";

const capability = {
  schemaVersion: 1,
  enabled: true,
  source: "individual_override",
  environment: "staging",
  siteKey: "main",
  realDataAllowed: false,
  syntheticOnly: true,
  maxOverrideMinutes: 30,
  requiresIndependentReview: true,
  baselines: {
    availabilityPercent: 99.9,
    adminReadP95Ms: 500,
    commandP95Ms: 800,
    outboxLagP95Ms: 60000,
    restoreRpoMinutes: 0,
    restoreRtoMinutes: 15,
    accessibilityCritical: 0,
    accessibilitySerious: 0,
    auditCoveragePercent: 100,
  },
};

describe("EV2.11 system assurance contracts", () => {
  it("accepts legacy and revised read budgets only within the staging capability", () => {
    for (const environment of ["local", "staging", "production"]) {
      for (const adminReadP95Ms of [500, 2000]) {
        for (const commandP95Ms of [800, 2000]) {
          const candidate = {
            ...capability,
            environment,
            baselines: { ...capability.baselines, adminReadP95Ms, commandP95Ms },
          };
          expect(Ev2SystemCapabilitySchema.safeParse(candidate).success).toBe(
            environment === "staging" || (adminReadP95Ms === 500 && commandP95Ms === 800),
          );
        }
      }
    }
    for (const adminReadP95Ms of [
      0,
      499,
      501,
      737,
      1000,
      1999,
      2001,
      2406,
      "2000",
      null,
      undefined,
      Infinity,
      NaN,
    ]) {
      expect(
        Ev2SystemCapabilitySchema.safeParse({
          ...capability,
          baselines: { ...capability.baselines, adminReadP95Ms },
        }).success,
      ).toBe(false);
    }
    for (const environment of [
      undefined,
      null,
      "",
      "STAGING",
      " staging ",
      "production-preview",
      "unknown",
    ]) {
      expect(
        Ev2SystemCapabilitySchema.safeParse({
          ...capability,
          environment,
          baselines: { ...capability.baselines, adminReadP95Ms: 2000 },
        }).success,
      ).toBe(false);
    }
    const revised = {
      ...capability,
      baselines: { ...capability.baselines, adminReadP95Ms: 2000, commandP95Ms: 2000 },
    };
    for (const change of [
      { requiresIndependentReview: false },
      { realDataAllowed: true },
      { syntheticOnly: false },
      { maxOverrideMinutes: 31 },
      { baselines: { ...revised.baselines, auditCoveragePercent: 99 } },
    ]) {
      expect(Ev2SystemCapabilitySchema.safeParse({ ...revised, ...change }).success).toBe(false);
    }
  });

  it("recognizes the approved staging command policy without changing production or legacy capabilities", () => {
    for (const environment of ["local", "staging", "production"]) {
      expect(Ev2SystemCapabilitySchema.safeParse({ ...capability, environment }).success).toBe(true);
      const revised = {
        ...capability,
        environment,
        baselines: { ...capability.baselines, commandP95Ms: 2000 },
      };
      expect(Ev2SystemCapabilitySchema.safeParse(revised).success).toBe(environment === "staging");
    }
    for (const commandP95Ms of [0, 799, 801, 1000, 1999, 2001, 5241, "2000", null]) {
      expect(
        Ev2SystemCapabilitySchema.safeParse({
          ...capability,
          baselines: { ...capability.baselines, commandP95Ms },
        }).success,
      ).toBe(false);
    }
    const staging = { ...capability, baselines: { ...capability.baselines, commandP95Ms: 2000 } };
    for (const change of [
      { environment: "production-preview" },
      { environment: undefined },
      { requiresIndependentReview: false },
      { realDataAllowed: true },
      { syntheticOnly: false },
      { maxOverrideMinutes: 31 },
      { baselines: { ...staging.baselines, adminReadP95Ms: 501 } },
      { baselines: { ...staging.baselines, auditCoveragePercent: 99 } },
    ]) {
      expect(Ev2SystemCapabilitySchema.safeParse({ ...staging, ...change }).success).toBe(false);
    }
  });

  it("accepts only a bounded, synthetic and independently reviewed capability", () => {
    expect(Ev2SystemCapabilitySchema.parse(capability)).toEqual(capability);
    expect(() => Ev2SystemCapabilitySchema.parse({ ...capability, realDataAllowed: true })).toThrow();
    expect(() => Ev2SystemCapabilitySchema.parse({ ...capability, maxOverrideMinutes: 60 })).toThrow();
    expect(() =>
      Ev2SystemCapabilitySchema.parse({
        ...capability,
        baselines: { ...capability.baselines, commandP95Ms: 801 },
      }),
    ).toThrow();
    expect(() =>
      Ev2SystemCapabilitySchema.parse({ ...capability, requiresIndependentReview: false }),
    ).toThrow();
  });

  it("keeps the database snapshot explicitly non-authoritative and free of personal data", () => {
    const snapshot = {
      schemaVersion: 1,
      capturedAt: "2026-09-03T12:00:00.000Z",
      correlationId: "51100000-0000-4000-8000-000000000401",
      environment: "staging",
      siteKey: "main",
      containsPersonalData: false,
      gateReady: true,
      gateDecision: "non_authoritative",
      queues: [
        { key: "publication", actionable: 0, deadLetter: 0, oldestLagSeconds: 0 },
        { key: "lead_delivery", actionable: 0, deadLetter: 0, oldestLagSeconds: 0 },
        { key: "collaboration", actionable: 0, deadLetter: 0, oldestLagSeconds: 0 },
      ],
      metrics: {
        outboxWorstLagSeconds: 0,
        projectionDivergence: 0,
        leadDivergence: 0,
        openCriticalAlerts: 0,
        criticalActionsObserved24h: 3,
        criticalActionsUntraced24h: 0,
        auditCoveragePercent: 100,
      },
      checks: [
        {
          key: "outbox_lag",
          category: "operational",
          passed: true,
          observed: 0,
          threshold: 60,
          unit: "seconds",
        },
        {
          key: "dead_letter",
          category: "resilience",
          passed: true,
          observed: 0,
          threshold: 0,
          unit: "events",
        },
        {
          key: "publication_reconciliation",
          category: "data",
          passed: true,
          observed: 0,
          threshold: 0,
          unit: "records",
        },
        {
          key: "lead_reconciliation",
          category: "data",
          passed: true,
          observed: 0,
          threshold: 0,
          unit: "records",
        },
        {
          key: "critical_alerts",
          category: "observability",
          passed: true,
          observed: 0,
          threshold: 0,
          unit: "alerts",
        },
        {
          key: "critical_audit_trace",
          category: "security",
          passed: true,
          observed: 100,
          threshold: 100,
          unit: "percent",
        },
      ],
    };
    expect(Ev2SystemSnapshotSchema.parse(snapshot).gateDecision).toBe("non_authoritative");
    expect(() => Ev2SystemSnapshotSchema.parse({ ...snapshot, containsPersonalData: true })).toThrow();
    expect(() => Ev2SystemSnapshotSchema.parse({ ...snapshot, gateDecision: "approved" })).toThrow();
  });

  it("distinguishes measured evidence from independent acceptance", () => {
    const result = {
      schemaVersion: 1,
      runId: "51100000-0000-4000-8000-000000000402",
      status: "measured",
      measurementPassed: true,
      requiresIndependentReview: true,
      correlationId: "51100000-0000-4000-8000-000000000403",
    };
    expect(Ev2AssuranceCommandResultSchema.parse(result)).toEqual(result);
    expect(
      Ev2AssuranceCommandResultSchema.parse({
        ...result,
        status: "accepted",
        requiresIndependentReview: false,
      }).status,
    ).toBe("accepted");
    expect(() => Ev2AssuranceCommandResultSchema.parse({ ...result, measurementPassed: false })).toThrow();
  });
});
