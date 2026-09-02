import { describe, expect, it } from "vitest";
import { Ev2PimCommandSchema, Ev2PimProductInputSchema } from "../../src/shared/contracts/ev2-pim";

const id = (suffix: number) => `44000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const envelope = (expectedVersion?: number) => ({
  schemaVersion: 1,
  commandId: id(90),
  correlationId: id(91),
  occurredAt: "2026-09-02T12:00:00.000Z",
  actorContext: { environment: "local", siteKey: "main" },
  ...(expectedVersion ? { expectedVersion } : {}),
});

const product = () => ({
  id: id(1),
  name: "Medidor ultrassônico",
  slug: "medidor-ultrassonico",
  summary: "Medição sem contato.",
  valueProposition: "Instalação sem parada.",
  status: "draft" as const,
  masterData: {
    manufacturerId: id(2),
    categoryId: id(3),
    monitoredElementIds: [id(4), id(5)],
  },
  models: [
    {
      id: id(6),
      name: "UFX",
      mpn: "UFX-100",
      primary: true,
      position: 0,
      variants: [
        {
          id: id(7),
          name: "DN50 Modbus",
          position: 0,
          axes: [{ axisKey: "diametro", axisLabel: "Diâmetro", optionKey: "dn50", optionLabel: "DN50" }],
        },
      ],
    },
  ],
  provenance: [
    { id: id(8), sourceKind: "official_manufacturer", sourceRef: "Datasheet A", rightsConfirmed: true },
  ],
});

describe("EV2 PIM contracts", () => {
  it("accepts a normalized graph without exposing SKU input", () => {
    const parsed = Ev2PimProductInputSchema.parse(product());
    expect(parsed.models[0].variants[0].axes[0].optionKey).toBe("dn50");
    expect(parsed).not.toHaveProperty("sku");
  });

  it("requires exactly one active primary model", () => {
    const invalid = product();
    invalid.models[0].primary = false;
    expect(Ev2PimProductInputSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects duplicate multi-value classifications and inverted ranges", () => {
    const invalid = product() as any;
    invalid.masterData.monitoredElementIds = [id(4), id(4)];
    invalid.attributes = [
      {
        id: id(10),
        definitionId: id(11),
        scope: "model",
        ownerId: id(6),
        value: { min: 10, max: 1 },
      },
    ];
    const result = Ev2PimProductInputSchema.safeParse(invalid);
    expect(result.success).toBe(false);
    if (!result.success)
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining(["master selections must be unique", "range min must not exceed max"]),
      );
  });

  it("requires optimistic concurrency when updating an existing product", () => {
    expect(
      Ev2PimCommandSchema.safeParse({
        action: "save_product",
        envelope: envelope(),
        mode: "update",
        product: product(),
        reason: "Atualização",
      }).success,
    ).toBe(false);
    expect(
      Ev2PimCommandSchema.safeParse({
        action: "save_product",
        envelope: envelope(1),
        mode: "update",
        product: product(),
        reason: "Atualização",
      }).success,
    ).toBe(true);
    expect(
      Ev2PimCommandSchema.safeParse({
        action: "save_product",
        envelope: envelope(),
        mode: "create",
        product: product(),
        reason: "Criação",
      }).success,
    ).toBe(true);
  });
});
