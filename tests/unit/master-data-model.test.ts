import { describe, expect, it } from "vitest";
import { resolveDependentOptions } from "@/admin/master-data-model";
import type { Ev2MasterCompatibility, Ev2MasterEntity } from "@/shared/contracts/ev2-master-data";

const timestamp = "2026-09-02T17:41:41.59918+00:00";
const entity = (
  id: string,
  canonicalName: string,
  status: Ev2MasterEntity["status"] = "active",
): Ev2MasterEntity => ({
  id,
  entityType: "technology",
  canonicalName,
  normalizedName: canonicalName.toLowerCase(),
  description: "",
  externalDomain: null,
  sourceType: "manual",
  sourceRef: null,
  status,
  mergedIntoId: null,
  lockVersion: 1,
  updatedAt: timestamp,
  aliases: [],
});

const compatibility = (
  id: string,
  target: Ev2MasterEntity,
  status: Ev2MasterCompatibility["status"] = "active",
): Ev2MasterCompatibility => ({
  id,
  relationType: "category_technology",
  sourceEntityId: crypto.randomUUID(),
  targetEntityId: target.id,
  status,
  effectiveFrom: timestamp,
  effectiveTo: status === "active" ? null : timestamp,
  version: 1,
  lockVersion: 1,
  sourceType: "manual",
  sourceRef: null,
  updatedAt: timestamp,
  target: {
    id: target.id,
    entityType: target.entityType,
    canonicalName: target.canonicalName,
    status: target.status,
    lockVersion: target.lockVersion,
  },
});

describe("master-data dependent options", () => {
  it("offers only active compatible targets, sorted and deduplicated", () => {
    const infrared = entity(crypto.randomUUID(), "Infravermelho");
    const catalytic = entity(crypto.randomUUID(), "Catalítico");
    const archived = entity(crypto.randomUUID(), "Legado", "inactive");
    const result = resolveDependentOptions(
      [infrared, catalytic, archived],
      [
        compatibility(crypto.randomUUID(), infrared),
        compatibility(crypto.randomUUID(), catalytic),
        compatibility(crypto.randomUUID(), catalytic),
        compatibility(crypto.randomUUID(), archived),
      ],
    );
    expect(result.options.map((option) => option.label)).toEqual(["Catalítico", "Infravermelho"]);
  });

  it("preserves and explains historical values before removal", () => {
    const compatible = entity(crypto.randomUUID(), "Infravermelho");
    const incompatible = entity(crypto.randomUUID(), "Laser");
    const inactive = entity(crypto.randomUUID(), "Legado", "inactive");
    const missingId = crypto.randomUUID();
    const result = resolveDependentOptions(
      [compatible, incompatible, inactive],
      [compatibility(crypto.randomUUID(), compatible)],
      [compatible.id, incompatible.id, inactive.id, missingId],
    );
    expect(result.preservedIncompatibilities.map((item) => item.reason)).toEqual([
      "not_compatible",
      "inactive",
      "not_found",
    ]);
    expect(result.preservedIncompatibilities.every((item) => item.explanation.length > 20)).toBe(true);
  });
});
