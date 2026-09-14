import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStagingAuthSourceControlCoverage } from "./staging-auth-source-control-contract-lib.mjs";

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const reference = "tests/components/admin-auth-flows.test.tsx#conditional-auth-failure-controls";
const justification =
  "O controle só renderiza após falha real de dependência; o canário não injeta indisponibilidade e o handler é exercitado no contrato de componente.";
const surfaceConfig = {
  "auth-login": { path: "src/admin/pages/LoginPage.tsx", required: 5, conditional: [] },
  "auth-recovery": { path: "src/admin/pages/RecoveryPage.tsx", required: 4, conditional: [] },
  "auth-set-password": {
    path: "src/admin/pages/SetPasswordPage.tsx",
    required: 4,
    conditional: [{ line: 176, ordinal: 5012, accessibleNameHint: "handler }> Tentar novamente" }],
  },
  "auth-mfa": {
    path: "src/admin/pages/MfaPage.tsx",
    required: 5,
    conditional: [
      { line: 184, ordinal: 5001, accessibleNameHint: "handler }> Tentar novamente" },
      { line: 187, ordinal: 5002, accessibleNameHint: "handler }> Cancelar e sair" },
    ],
  },
};

function fixture() {
  const sourceControls = [];
  const controlsBySurface = {};
  for (const [surfaceId, config] of Object.entries(surfaceConfig)) {
    const required = Array.from({ length: config.required }, (_, index) => ({
      id: `${config.path}:${300 + index}:input:${4000 + index}`,
      classification: "field",
      element: "input",
      accessibleNameHint: `Campo ${index}`,
      ownerRouteIds: [surfaceId],
      evidence: `${config.path}:${300 + index}`,
      runtimeApplicabilityBySurface: { [surfaceId]: { applicability: "required" } },
    }));
    const notApplicable = config.conditional.map((control) => ({
      id: `${config.path}:${control.line}:button:${control.ordinal}`,
      classification: "action",
      element: "button",
      accessibleNameHint: control.accessibleNameHint,
      ownerRouteIds: [surfaceId],
      evidence: `${config.path}:${control.line}`,
      runtimeApplicabilityBySurface: {
        [surfaceId]: {
          applicability: "not-applicable",
          basisCode: "conditional-failure-state-component-tested",
          justification,
          documentationReference: reference,
        },
      },
    }));
    controlsBySurface[surfaceId] = { required, notApplicable };
    sourceControls.push(...required, ...notApplicable);
  }
  const entries = Object.entries(controlsBySurface).flatMap(([surfaceId, controls]) =>
    viewports.map((viewport) => ({
      surfaceId,
      viewport: { ...viewport },
      sourceControlContract: {
        status: "passed",
        failures: [],
        mappings: controls.required.map((source) => ({
          schemaVersion: 1,
          surfaceId,
          sourceControlId: source.id,
          sourceClassification: source.classification,
          sourceAccessibleNameHint: source.accessibleNameHint,
          viewport: viewport.name,
        })),
        notApplicable: controls.notApplicable.map((source) => {
          const disposition = source.runtimeApplicabilityBySurface[surfaceId];
          return {
            schemaVersion: 1,
            surfaceId,
            sourceControlId: source.id,
            sourceClassification: source.classification,
            sourceAccessibleNameHint: source.accessibleNameHint,
            viewport: viewport.name,
            applicability: "not-applicable",
            basisCode: disposition.basisCode,
            justification: disposition.justification,
            documentationReference: disposition.documentationReference,
            executionScope: "not-applicable",
            semanticExecutionRef: null,
            handlerExecuted: false,
            evidenceKind: null,
            evidenceReference: `${disposition.documentationReference}|${source.id}`,
            status: "not-applicable",
          };
        }),
      },
    })),
  );
  const terminalCoverage = {
    matrix: Object.entries(controlsBySurface).map(([surfaceId, controls]) => ({
      id: surfaceId,
      sourceControlResults: [...controls.required, ...controls.notApplicable].map((source) => {
        const disposition = source.runtimeApplicabilityBySurface[surfaceId];
        const notApplicable = disposition.applicability === "not-applicable";
        return {
          sourceControlId: source.id,
          classification: source.classification,
          accessibleNameHint: source.accessibleNameHint,
          sourceEvidence: source.evidence,
          applicability: notApplicable ? "not-applicable" : "required",
          testState: notApplicable ? "not-applicable" : "passed",
          ...(notApplicable
            ? {
                basisCode: disposition.basisCode,
                justification: disposition.justification,
                documentationReference: disposition.documentationReference,
              }
            : {}),
        };
      }),
    })),
  };
  return { inventory: { sourceControls }, entries, terminalCoverage };
}

function evaluate(input) {
  return evaluateStagingAuthSourceControlCoverage({ ...input, requiredViewports: viewports });
}

test("binds all 16 Auth viewport entries to dynamic inventory source partitions", () => {
  const input = fixture();
  const result = evaluate(input);
  assert.equal(result.valid, true, result.failures.join(","));
  assert.equal(
    input.entries.reduce((total, entry) => total + entry.sourceControlContract.notApplicable.length, 0),
    12,
  );
});

test("rejects missing, duplicated, misplaced or extra conditional source controls", () => {
  const mutations = [
    (input) => input.entries[12].sourceControlContract.notApplicable.pop(),
    (input) => {
      input.entries[12].sourceControlContract.notApplicable[1] = structuredClone(
        input.entries[12].sourceControlContract.notApplicable[0],
      );
    },
    (input) => {
      input.entries[12].sourceControlContract.notApplicable[0].surfaceId = "auth-login";
    },
    (input) => {
      input.entries[12].sourceControlContract.notApplicable[0].viewport = "768x1024";
    },
    (input) => {
      const extra = structuredClone(input.inventory.sourceControls.at(-1));
      extra.id = "src/admin/pages/MfaPage.tsx:999:button:9999";
      input.inventory.sourceControls.push(extra);
    },
    (input) => {
      const source = structuredClone(input.inventory.sourceControls.at(-1));
      source.id = "src/admin/pages/LoginPage.tsx:999:button:9999";
      source.evidence = "src/admin/pages/LoginPage.tsx:999";
      source.ownerRouteIds = ["auth-login"];
      source.runtimeApplicabilityBySurface = {
        "auth-login": source.runtimeApplicabilityBySurface["auth-mfa"],
      };
      input.inventory.sourceControls.push(source);
    },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.equal(evaluate(input).valid, false);
  }
});

test("rejects tampered disposition, evidence and source metadata", () => {
  const mutations = [
    (value) => (value.basisCode = "feature-branch-disabled"),
    (value) => (value.documentationReference = "tests/components/unrelated.test.tsx"),
    (value) => (value.justification = "curta"),
    (value) => (value.evidenceReference = "unbound"),
    (value) => (value.sourceAccessibleNameHint = "Outro controle"),
    (value) => (value.sourceClassification = "field"),
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input.entries[12].sourceControlContract.notApplicable[0]);
    assert.equal(evaluate(input).valid, false);
  }

  const overlap = fixture();
  overlap.entries[12].sourceControlContract.mappings[0].sourceControlId =
    overlap.entries[12].sourceControlContract.notApplicable[0].sourceControlId;
  assert.equal(evaluate(overlap).valid, false);

  const inventoryMetadata = fixture();
  inventoryMetadata.inventory.sourceControls.at(-1).element = "a";
  assert.equal(evaluate(inventoryMetadata).valid, false);

  const terminalMutations = [
    (controls) => controls.pop(),
    (controls) => {
      controls[controls.length - 1] = structuredClone(controls.at(-2));
    },
    (controls) => (controls[0].sourceControlId = "src/admin/pages/MfaPage.tsx:999:button:9999"),
    (controls) => (controls[0].sourceEvidence = "src/admin/pages/OtherPage.tsx:1"),
    (controls) => (controls.find((control) => control.testState === "not-applicable").testState = "passed"),
    (controls) =>
      (controls.find((control) => control.testState === "not-applicable").applicability = "required"),
    (controls) =>
      (controls.find((control) => control.testState === "not-applicable").basisCode =
        "feature-branch-disabled"),
  ];
  for (const mutate of terminalMutations) {
    const input = fixture();
    const controls = input.terminalCoverage.matrix.find(
      (surface) => surface.id === "auth-mfa",
    ).sourceControlResults;
    mutate(controls);
    const result = evaluate(input);
    assert.equal(result.valid, false);
    assert.ok(result.failures.includes("terminal-source-contract-invalid"));
  }
});
