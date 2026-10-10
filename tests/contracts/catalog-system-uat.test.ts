import { describe, expect, it } from "vitest";
import { CatalogManualSystemUatSchema } from "@/shared/contracts/catalog-system-uat";

const binding = {
  candidateSha: "a".repeat(40),
  artifactDigest: "b".repeat(64),
  deploymentId: "c0120000-0000-4000-8000-000000000001",
  backendSnapshotDigest: "c".repeat(64),
};
const pending = { status: "pending", proof: null };
const passed = {
  status: "passed",
  proof: { binding, evidenceId: "CAT-UAT-MANUAL-001", evidenceDigest: "d".repeat(64) },
};
const record = {
  schemaVersion: 1,
  source: "manual-empty-system",
  environment: "staging",
  status: "pending",
  binding,
  globalFeatureEnabled: false,
  commercialProducts: 0,
  importedSkus: 0,
  productionMutations: 0,
  publication: false,
  load: false,
  cutover: false,
  flows: {
    manualRegistration: pending,
    permissions: pending,
    formValidation: pending,
    reviewsAndConflicts: pending,
    taxonomyAndRelations: pending,
    editorial: pending,
    emptyStatesAndErrors: pending,
  },
  gates: {
    security: pending,
    mfaAal2: pending,
    rls: pending,
    audit: pending,
    accessibility: pending,
    mobile: pending,
    compatibility: pending,
    rollback: pending,
    zeroActiveResidue: pending,
  },
  recovery: { status: "pending", manifestDigest: null },
  browser: pending,
};
const complete = () => ({
  ...record,
  status: "passed",
  flows: Object.fromEntries(Object.keys(record.flows).map((key) => [key, passed])),
  gates: Object.fromEntries(Object.keys(record.gates).map((key) => [key, passed])),
  recovery: {
    status: "passed",
    manifestDigest: "e".repeat(64),
    preparedBeforeMutation: true,
    activeOwnedEntities: 0,
    activeSessions: 0,
  },
  browser: { ...passed, engine: "chrome", authenticated: true, headless: false, backend: "staging" },
});

describe("empty manual system delivery evidence", () => {
  it("does not require a commercial nominal list or confuse pending implementation with homologation", () => {
    expect(CatalogManualSystemUatSchema.safeParse(record).success).toBe(true);
    expect(CatalogManualSystemUatSchema.safeParse({ ...record, status: "passed" }).success).toBe(false);
    expect(CatalogManualSystemUatSchema.safeParse(complete()).success).toBe(true);
  });
  it("requires all functional flows and security gates; no skipped or omitted lane", () => {
    for (const section of ["flows", "gates"] as const) {
      for (const key of Object.keys(record[section])) {
        const baseline = complete();
        expect(
          CatalogManualSystemUatSchema.safeParse({
            ...baseline,
            [section]: { ...baseline[section], [key]: pending },
          }).success,
        ).toBe(false);
        const omitted = { ...baseline[section] };
        delete omitted[key];
        expect(CatalogManualSystemUatSchema.safeParse({ ...baseline, [section]: omitted }).success).toBe(
          false,
        );
        expect(
          CatalogManualSystemUatSchema.safeParse({
            ...baseline,
            [section]: { ...baseline[section], [key]: { status: "skipped", proof: null } },
          }).success,
        ).toBe(false);
      }
    }
  });
  it("invalidates every dependent proof on changed SHA, bytes, deployment or backend state", () => {
    const baseline = complete();
    for (const [key, value] of Object.entries({
      candidateSha: "f".repeat(40),
      artifactDigest: "f".repeat(64),
      deploymentId: "c0120000-0000-4000-8000-000000000002",
      backendSnapshotDigest: "f".repeat(64),
    })) {
      expect(
        CatalogManualSystemUatSchema.safeParse({ ...baseline, binding: { ...binding, [key]: value } })
          .success,
      ).toBe(false);
      expect(
        CatalogManualSystemUatSchema.safeParse({
          ...baseline,
          status: "pending",
          binding: { ...binding, [key]: value },
        }).success,
      ).toBe(false);
    }
  });
  it("does not accept headless, mock, unauthenticated or another browser as real Chrome", () => {
    const baseline = complete();
    for (const patch of [
      { headless: true },
      { authenticated: false },
      { engine: "chromium" },
      { backend: "mock" },
      { proof: null },
    ]) {
      expect(
        CatalogManualSystemUatSchema.safeParse({ ...baseline, browser: { ...baseline.browser, ...patch } })
          .success,
      ).toBe(false);
    }
  });
  it("requires recovery before mutation and no active residue", () => {
    const baseline = complete();
    for (const patch of [
      { preparedBeforeMutation: false },
      { activeOwnedEntities: 1 },
      { activeSessions: 1 },
      { manifestDigest: null },
    ]) {
      expect(
        CatalogManualSystemUatSchema.safeParse({ ...baseline, recovery: { ...baseline.recovery, ...patch } })
          .success,
      ).toBe(false);
    }
    expect(CatalogManualSystemUatSchema.safeParse({ ...baseline, recovery: record.recovery }).success).toBe(
      false,
    );
  });
  it("never authorizes global activation, commercial data, production, load or cutover", () => {
    for (const [key, value] of Object.entries({
      globalFeatureEnabled: true,
      commercialProducts: 1,
      importedSkus: 1,
      productionMutations: 1,
      publication: true,
      load: true,
      cutover: true,
      environment: "production",
      source: "canonical-nominal-list",
    })) {
      expect(CatalogManualSystemUatSchema.safeParse({ ...complete(), [key]: value }).success).toBe(false);
    }
  });
  it("rejects sensitive payloads and fake pending completion evidence", () => {
    expect(
      CatalogManualSystemUatSchema.safeParse({ ...record, credentials: "SENSITIVE_SENTINEL" }).success,
    ).toBe(false);
    expect(
      CatalogManualSystemUatSchema.safeParse({
        ...record,
        browser: { status: "pending", proof: passed.proof },
      }).success,
    ).toBe(false);
    expect(
      CatalogManualSystemUatSchema.safeParse({
        ...complete(),
        browser: { ...complete().browser, proof: { ...passed.proof, payload: "SENSITIVE_SENTINEL" } },
      }).success,
    ).toBe(false);
  });
});
