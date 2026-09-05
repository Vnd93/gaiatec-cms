import { describe, expect, it } from "vitest";
import {
  Ev2MasterDataCommandSchema,
  Ev2MasterDependencyResultSchema,
  Ev2MasterEntityListResultSchema,
  Ev2MasterMutationResultSchema,
} from "@/shared/contracts/ev2-master-data";

const envelope = (expectedVersion?: number) => ({
  schemaVersion: 1 as const,
  commandId: crypto.randomUUID(),
  correlationId: crypto.randomUUID(),
  occurredAt: new Date().toISOString(),
  actorContext: { environment: "local" as const, siteKey: "main" },
  ...(expectedVersion === undefined ? {} : { expectedVersion }),
});

describe("EV2 master-data contracts", () => {
  it("accepts searches and new entities without an optimistic version", () => {
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        action: "list_entities",
        envelope: envelope(),
        entityType: "technology",
        query: "ultrassônico",
      }).success,
    ).toBe(true);
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        action: "create_entity",
        envelope: envelope(),
        entityType: "category",
        name: "Detecção de gases",
      }).success,
    ).toBe(true);
  });

  it("requires optimistic concurrency for edits, aliases and reversible merges", () => {
    const entityId = crypto.randomUUID();
    const targetEntityId = crypto.randomUUID();
    for (const command of [
      {
        action: "set_entity_status",
        envelope: envelope(),
        entityId,
        status: "inactive",
        reason: "Fim de uso",
      },
      { action: "upsert_alias", envelope: envelope(), entityId, alias: "Nome anterior" },
      {
        action: "merge_entities",
        envelope: envelope(),
        sourceEntityId: entityId,
        targetEntityId,
        reason: "Duplicidade confirmada",
      },
      {
        action: "restore_merge",
        envelope: envelope(),
        sourceEntityId: entityId,
        reason: "Revisão do steward",
      },
    ]) {
      expect(Ev2MasterDataCommandSchema.safeParse(command).success).toBe(false);
    }
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        action: "restore_merge",
        envelope: envelope(3),
        sourceEntityId: entityId,
        reason: "Revisão do steward",
      }).success,
    ).toBe(true);
  });

  it("allows a new N:N link but requires a version to edit an existing one", () => {
    const base = {
      action: "upsert_compatibility" as const,
      relationType: "category_technology" as const,
      sourceEntityId: crypto.randomUUID(),
      targetEntityId: crypto.randomUUID(),
    };
    expect(Ev2MasterDataCommandSchema.safeParse({ ...base, envelope: envelope() }).success).toBe(true);
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        ...base,
        envelope: envelope(),
        compatibilityId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        ...base,
        envelope: envelope(2),
        compatibilityId: crypto.randomUUID(),
      }).success,
    ).toBe(true);
  });

  it("rejects unknown entity and relation types", () => {
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        action: "create_entity",
        envelope: envelope(),
        entityType: "uncontrolled_type",
        name: "Valor",
      }).success,
    ).toBe(false);
    expect(
      Ev2MasterDataCommandSchema.safeParse({
        action: "get_dependencies",
        envelope: envelope(),
        relationType: "category_unknown",
        sourceEntityId: crypto.randomUUID(),
      }).success,
    ).toBe(false);
  });

  it("parses camel-case list, dependency and mutation responses", () => {
    const commandId = crypto.randomUUID();
    const correlationId = crypto.randomUUID();
    const entityId = crypto.randomUUID();
    const targetEntityId = crypto.randomUUID();
    const timestamp = "2026-09-02T17:41:41.59918+00:00";
    const entity = {
      id: entityId,
      entityType: "category",
      canonicalName: "Detecção de gases",
      normalizedName: "deteccao de gases",
      description: "",
      externalDomain: null,
      sourceType: "manual",
      sourceRef: null,
      status: "active",
      mergedIntoId: null,
      lockVersion: 1,
      updatedAt: timestamp,
      aliases: [],
    };
    expect(
      Ev2MasterEntityListResultSchema.safeParse({
        schemaVersion: 1,
        commandId,
        correlationId,
        entities: [entity],
      }).success,
    ).toBe(true);
    expect(
      Ev2MasterDependencyResultSchema.safeParse({
        schemaVersion: 1,
        commandId,
        correlationId,
        compatibilities: [
          {
            id: crypto.randomUUID(),
            relationType: "category_technology",
            sourceEntityId: entityId,
            targetEntityId,
            status: "active",
            effectiveFrom: timestamp,
            effectiveTo: null,
            version: 1,
            lockVersion: 1,
            sourceType: "manual",
            sourceRef: null,
            updatedAt: timestamp,
            target: {
              id: targetEntityId,
              entityType: "technology",
              canonicalName: "Infravermelho",
              status: "active",
              lockVersion: 1,
            },
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      Ev2MasterMutationResultSchema.safeParse({
        schemaVersion: 1,
        commandId,
        correlationId,
        entityId,
        status: "active",
        lockVersion: 2,
        replayed: false,
      }).success,
    ).toBe(true);
  });
});
