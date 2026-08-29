import { describe, expect, it } from "vitest";
import {
  CmsApplicationContentSchema,
  CmsIndustryContentSchema,
  CmsServiceContentSchema,
  CmsSolutionContentSchema,
} from "../../src/shared/contracts/cms-content";
import {
  applicationPayload,
  industryPayload,
  servicePayload,
  solutionPayload,
} from "../fixtures/discovery-payloads";
describe("F5 contracts and administrative round-trip", () => {
  const cases = [
    ["service", CmsServiceContentSchema, servicePayload],
    ["industry", CmsIndustryContentSchema, industryPayload],
    ["application", CmsApplicationContentSchema, applicationPayload],
    ["solution", CmsSolutionContentSchema, solutionPayload],
  ] as const;
  it.each(cases)("preserves every %s field", (_name, schema, payload) => {
    const parsed = schema.parse(JSON.parse(JSON.stringify(payload)));
    expect(parsed).toEqual(payload);
  });
  it("keeps gas detection integrated in the master catalog", () => {
    expect(CmsSolutionContentSchema.parse(solutionPayload).gasDetectionModel).toBe(
      "integrated_master_catalog",
    );
  });
  it("rejects orphan-shaped relation identifiers before persistence", () => {
    expect(
      CmsApplicationContentSchema.safeParse({
        ...applicationPayload,
        relations: { ...applicationPayload.relations, productIds: ["not-a-uuid"] },
      }).success,
    ).toBe(false);
  });
});
