import { describe, expect, it } from "vitest";
import {
  Ev2DraftCommandSchema,
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
});
