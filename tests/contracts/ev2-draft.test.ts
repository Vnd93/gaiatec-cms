import { describe, expect, it } from "vitest";
import {
  Ev2DraftCommandSchema,
  Ev2DraftCommandResultSchema,
  Ev2DraftRecordSchema,
  Ev2DraftSchema,
  Ev2PublishSchema,
  Ev2ReviewDraftSchema,
} from "@/shared/contracts/ev2-draft";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

const envelope = (expectedVersion?: number) => ({
  schemaVersion: 1 as const,
  commandId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  actorContext: { environment: "local" as const, siteKey: "main" },
  ...(expectedVersion ? { expectedVersion } : {}),
});

describe("EV2 progressive draft contracts", () => {
  it("accepts a completely empty editorial draft but not review", () => {
    const empty = { schemaVersion: 2, contentType: "product", workingTitle: "", fields: {} };
    expect(Ev2DraftSchema.safeParse(empty).success).toBe(true);
    expect(Ev2ReviewDraftSchema.safeParse(empty).success).toBe(false);
  });

  it("keeps publication behind the complete public contract", () => {
    expect(Ev2PublishSchema.safeParse(comprehensiveProductPayload()).success).toBe(true);
    expect(Ev2PublishSchema.safeParse({ schemaVersion: 2, contentType: "product", fields: {} }).success).toBe(
      false,
    );
  });

  it("requires optimistic concurrency for patches and rejects unsafe fields", () => {
    expect(
      Ev2DraftCommandSchema.safeParse({
        action: "patch",
        envelope: envelope(),
        draftId: crypto.randomUUID(),
        patches: [{ operation: "set", path: ["title"], value: "Detector" }],
      }).success,
    ).toBe(false);
    expect(
      Ev2DraftCommandSchema.safeParse({
        action: "patch",
        envelope: envelope(1),
        draftId: crypto.randomUUID(),
        patches: [{ operation: "set", path: ["__proto__"], value: "unsafe" }],
      }).success,
    ).toBe(false);
  });

  it("accepts small field-level set/remove patches", () => {
    expect(
      Ev2DraftCommandSchema.safeParse({
        action: "patch",
        envelope: envelope(7),
        draftId: crypto.randomUUID(),
        workingTitle: "Detector fixo",
        patches: [
          { operation: "set", path: ["summary"], value: "Resumo em elaboração" },
          { operation: "remove", path: ["temporaryNote"] },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts PostgreSQL timestamps with an explicit UTC offset", () => {
    const databaseTimestamp = "2026-09-02T13:52:10.993529+00:00";
    const identifiers = {
      commandId: crypto.randomUUID(),
      correlationId: crypto.randomUUID(),
      draftId: crypto.randomUUID(),
    };

    expect(
      Ev2DraftRecordSchema.safeParse({
        schemaVersion: 2,
        contentType: "product",
        workingTitle: "Produto sintético",
        fields: { activeTab: "identificacao" },
        draftId: identifiers.draftId,
        status: "active",
        lockVersion: 2,
        fieldsHash: "a".repeat(64),
        createdAt: databaseTimestamp,
        updatedAt: databaseTimestamp,
      }).success,
    ).toBe(true);
    expect(
      Ev2DraftCommandResultSchema.safeParse({
        schemaVersion: 1,
        ...identifiers,
        status: "active",
        lockVersion: 2,
        savedAt: databaseTimestamp,
        replayed: false,
      }).success,
    ).toBe(true);
    expect(
      Ev2DraftRecordSchema.safeParse({
        schemaVersion: 2,
        contentType: "product",
        workingTitle: "Produto sintético",
        fields: {},
        draftId: identifiers.draftId,
        status: "active",
        lockVersion: 1,
        fieldsHash: "a".repeat(64),
        createdAt: "2026-09-02T13:52:10",
        updatedAt: databaseTimestamp,
      }).success,
    ).toBe(false);
  });
});
