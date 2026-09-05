import { describe, expect, it } from "vitest";
import { Ev2DamCommandSchema, Ev2DamMetadataSchema } from "../../src/shared/contracts/ev2-dam";

const envelope = {
  schemaVersion: 1 as const,
  commandId: "47000000-0000-4000-8000-000000000001",
  correlationId: "47000000-0000-4000-8000-000000000002",
  occurredAt: "2026-09-02T22:00:00.000Z",
  actorContext: { environment: "local" as const, siteKey: "main" },
};

describe("EV2 DAM contracts", () => {
  it("requires complete source, rights and accessibility metadata", () => {
    const base = {
      originalFilename: "produto.png",
      declaredMime: "image/png",
      sourceKind: "official_manufacturer",
      sourceReference: "https://manufacturer.example/image",
      rightsConfirmed: true,
      rightsExpiresAt: "2027-09-02T23:59:59.000Z",
      licenseName: "Uso comercial autorizado",
      ownerName: "Fabricante",
      altText: "Vista frontal do instrumento",
      caption: null,
      credit: null,
      focalX: 0.5,
      focalY: 0.5,
      sha256: "a".repeat(64),
      perceptualHash: "0123456789abcdef",
    };
    expect(Ev2DamMetadataSchema.safeParse(base).success).toBe(true);
    expect(Ev2DamMetadataSchema.safeParse({ ...base, rightsConfirmed: false }).success).toBe(false);
    expect(Ev2DamMetadataSchema.safeParse({ ...base, altText: "" }).success).toBe(false);
  });

  it("requires optimistic concurrency for destructive or reversible mutations", () => {
    const archive = {
      action: "archive_asset",
      envelope,
      assetId: "47000000-0000-4000-8000-000000000010",
      reason: "Arquivar ativo",
    };
    expect(Ev2DamCommandSchema.safeParse(archive).success).toBe(false);
    expect(
      Ev2DamCommandSchema.safeParse({ ...archive, envelope: { ...envelope, expectedVersion: 2 } }).success,
    ).toBe(true);
  });

  it("rejects crops outside normalized image bounds", () => {
    const command = {
      action: "save_crop",
      envelope: { ...envelope, expectedVersion: 1 },
      assetId: "47000000-0000-4000-8000-000000000010",
      crop: {
        cropKey: "quadrado",
        label: "Quadrado",
        aspectWidth: 1,
        aspectHeight: 1,
        x: 0.5,
        y: 0,
        width: 0.6,
        height: 1,
        focalX: 0.5,
        focalY: 0.5,
      },
      reason: "Salvar crop",
    };
    expect(Ev2DamCommandSchema.safeParse(command).success).toBe(false);
  });

  it("never accepts actor identity from the client envelope", () => {
    expect(
      Ev2DamCommandSchema.safeParse({
        action: "capability",
        envelope: { ...envelope, actorId: "47000000-0000-4000-8000-000000000099" },
      }).success,
    ).toBe(false);
  });
});
