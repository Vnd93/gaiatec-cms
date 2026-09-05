import { describe, expect, it } from "vitest";
import {
  Ev2CapabilityManifestSchema,
  Ev2FeatureFlagKeySchema,
  Ev2FeatureFlagEvaluationSchema,
  Ev2ReleaseCommandResultSchema,
  Ev2ReleaseCommandSchema,
} from "../../src/shared/contracts/ev2-foundation";

const envelope = {
  schemaVersion: 1 as const,
  commandId: "41000000-0000-4000-8000-000000000001",
  correlationId: "41000000-0000-4000-8000-000000000002",
  occurredAt: "2026-09-01T23:00:00.000Z",
  actorContext: { environment: "local" as const, siteKey: "main" },
};

describe("EV2 foundation contracts", () => {
  it("accepts PostgreSQL offsets in feature evaluation timestamps", () => {
    expect(
      Ev2FeatureFlagEvaluationSchema.safeParse({
        schemaVersion: 1,
        key: "ev2.master_data",
        enabled: false,
        source: "default",
        evaluatedAt: "2026-09-02T17:41:41.59918+00:00",
      }).success,
    ).toBe(true);
  });

  it("requires a complete fail-closed runtime capability manifest", () => {
    const evaluatedAt = "2026-09-04T20:00:00.000Z";
    const capabilities = Object.fromEntries(
      Ev2FeatureFlagKeySchema.options.map((key) => [
        key,
        { schemaVersion: 1, key, enabled: false, source: "unavailable", evaluatedAt },
      ]),
    );
    expect(
      Ev2CapabilityManifestSchema.safeParse({
        schemaVersion: 1,
        status: "ready",
        environment: "staging",
        siteKey: "main",
        evaluatedAt,
        capabilities,
      }).success,
    ).toBe(true);
    const incomplete = { ...capabilities };
    delete incomplete["ev2.system_assurance"];
    expect(
      Ev2CapabilityManifestSchema.safeParse({
        schemaVersion: 1,
        status: "ready",
        environment: "staging",
        siteKey: "main",
        evaluatedAt,
        capabilities: incomplete,
      }).success,
    ).toBe(false);
  });
  it("accepts a versioned empty release command", () => {
    expect(
      Ev2ReleaseCommandSchema.parse({ envelope, action: "create", reason: "Provar release vazio" }),
    ).toMatchObject({ action: "create" });
  });

  it("requires optimistic concurrency for rollback", () => {
    const command = {
      envelope,
      action: "rollback",
      releaseId: "41000000-0000-4000-8000-000000000003",
      reason: "Reverter release vazio",
    };
    expect(Ev2ReleaseCommandSchema.safeParse(command).success).toBe(false);
    expect(
      Ev2ReleaseCommandSchema.safeParse({
        ...command,
        envelope: { ...envelope, expectedVersion: 1 },
      }).success,
    ).toBe(true);
  });

  it("rejects client-controlled actor identity and unknown fields", () => {
    expect(
      Ev2ReleaseCommandSchema.safeParse({
        envelope: { ...envelope, actorId: "41000000-0000-4000-8000-000000000099" },
        action: "create",
        reason: "Tentar forjar identidade",
      }).success,
    ).toBe(false);
  });

  it("keeps feature evaluations and release receipts strict", () => {
    expect(
      Ev2FeatureFlagEvaluationSchema.parse({
        schemaVersion: 1,
        key: "ev2.release_skeleton",
        enabled: false,
        source: "default",
        evaluatedAt: "2026-09-01T23:00:00.000Z",
      }).enabled,
    ).toBe(false);
    expect(
      Ev2ReleaseCommandResultSchema.safeParse({
        schemaVersion: 1,
        commandId: envelope.commandId,
        correlationId: envelope.correlationId,
        releaseId: "41000000-0000-4000-8000-000000000003",
        status: "draft",
        lockVersion: 1,
        empty: true,
        payload: {},
      }).success,
    ).toBe(false);
  });
});
