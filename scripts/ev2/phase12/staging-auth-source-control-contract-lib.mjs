export const STAGING_AUTH_SOURCE_CONTROL_SURFACES = [
  "auth-login",
  "auth-recovery",
  "auth-set-password",
  "auth-mfa",
];

export const STAGING_AUTH_REQUIRED_SOURCE_CONTROL_COUNTS = {
  "auth-login": 5,
  "auth-recovery": 4,
  "auth-set-password": 4,
  "auth-mfa": 5,
};

const CONDITIONAL_FAILURE_BASIS = "conditional-failure-state-component-tested";
const CONDITIONAL_FAILURE_REFERENCE =
  "tests/components/admin-auth-flows.test.tsx#conditional-auth-failure-controls";
const CONDITIONAL_FAILURE_SPECS = [
  {
    key: "auth-mfa|retry",
    surfaceId: "auth-mfa",
    sourcePath: "src/admin/pages/MfaPage.tsx",
    accessibleName: "Tentar novamente",
  },
  {
    key: "auth-mfa|cancel-and-sign-out",
    surfaceId: "auth-mfa",
    sourcePath: "src/admin/pages/MfaPage.tsx",
    accessibleName: "Cancelar e sair",
  },
  {
    key: "auth-set-password|retry",
    surfaceId: "auth-set-password",
    sourcePath: "src/admin/pages/SetPasswordPage.tsx",
    accessibleName: "Tentar novamente",
  },
];

function conditionalFailureKey(source, surfaceId, disposition) {
  if (
    source?.classification !== "action" ||
    source?.element !== "button" ||
    typeof source?.id !== "string" ||
    typeof source?.evidence !== "string" ||
    typeof source?.accessibleNameHint !== "string" ||
    disposition?.applicability !== "not-applicable" ||
    disposition?.basisCode !== CONDITIONAL_FAILURE_BASIS ||
    disposition?.documentationReference !== CONDITIONAL_FAILURE_REFERENCE ||
    typeof disposition?.justification !== "string" ||
    disposition.justification.trim().length < 32
  ) {
    return null;
  }
  const matches = CONDITIONAL_FAILURE_SPECS.filter(
    (spec) =>
      spec.surfaceId === surfaceId &&
      source.id.startsWith(`${spec.sourcePath}:`) &&
      source.evidence.startsWith(`${spec.sourcePath}:`) &&
      source.accessibleNameHint.trim().endsWith(spec.accessibleName),
  );
  return matches.length === 1 ? matches[0].key : null;
}

function sameUniqueIds(values, expectedIds) {
  if (
    !Array.isArray(values) ||
    values.length !== expectedIds.length ||
    new Set(expectedIds).size !== expectedIds.length
  ) {
    return false;
  }
  const actualIds = values.map((value) => value?.sourceControlId);
  return (
    actualIds.every((id) => typeof id === "string") &&
    new Set(actualIds).size === actualIds.length &&
    expectedIds.every((id) => actualIds.includes(id))
  );
}

export function buildStagingAuthSourceControlExpectations(inventory) {
  const failures = [];
  const sourceControls = Array.isArray(inventory?.sourceControls) ? inventory.sourceControls : [];
  if (!sourceControls.length) failures.push("inventory-source-controls-missing");
  const bySurface = Object.fromEntries(
    STAGING_AUTH_SOURCE_CONTROL_SURFACES.map((surfaceId) => [surfaceId, { required: [], notApplicable: [] }]),
  );
  const conditionalKeys = [];
  for (const surfaceId of STAGING_AUTH_SOURCE_CONTROL_SURFACES) {
    const surfaceControls = sourceControls.filter(
      (source) => Array.isArray(source?.ownerRouteIds) && source.ownerRouteIds.includes(surfaceId),
    );
    for (const source of surfaceControls) {
      const disposition = source?.runtimeApplicabilityBySurface?.[surfaceId] ?? {
        applicability: "required",
      };
      if (disposition?.applicability === "required") {
        bySurface[surfaceId].required.push(source);
        continue;
      }
      const key = conditionalFailureKey(source, surfaceId, disposition);
      if (!key) {
        failures.push(`conditional-source-invalid:${surfaceId}:${String(source?.id ?? "missing")}`);
        continue;
      }
      conditionalKeys.push(key);
      bySurface[surfaceId].notApplicable.push({ source, disposition, key });
    }
    if (bySurface[surfaceId].required.length !== STAGING_AUTH_REQUIRED_SOURCE_CONTROL_COUNTS[surfaceId]) {
      failures.push(`required-source-count-invalid:${surfaceId}`);
    }
  }
  const expectedConditionalKeys = CONDITIONAL_FAILURE_SPECS.map((spec) => spec.key).sort();
  if (JSON.stringify(conditionalKeys.sort()) !== JSON.stringify(expectedConditionalKeys)) {
    failures.push("conditional-source-cardinality-invalid");
  }
  return { valid: failures.length === 0, failures, bySurface };
}

function entrySourceControlContractPassed(entry, expectations) {
  const surface = expectations.bySurface[entry?.surfaceId];
  const contract = entry?.sourceControlContract;
  if (!surface || contract?.status !== "passed" || !Array.isArray(contract?.failures)) return false;
  if (contract.failures.length !== 0) return false;
  const requiredIds = surface.required.map((source) => source.id);
  const notApplicableIds = surface.notApplicable.map(({ source }) => source.id);
  if (
    !sameUniqueIds(contract.mappings, requiredIds) ||
    !sameUniqueIds(contract.notApplicable, notApplicableIds)
  ) {
    return false;
  }
  const mappingIds = new Set(contract.mappings.map((mapping) => mapping.sourceControlId));
  if (contract.notApplicable.some((disposition) => mappingIds.has(disposition.sourceControlId))) {
    return false;
  }
  const requiredById = new Map(surface.required.map((source) => [source.id, source]));
  if (
    contract.mappings.some((mapping) => {
      const source = requiredById.get(mapping.sourceControlId);
      return (
        !source ||
        mapping.schemaVersion !== 1 ||
        mapping.surfaceId !== entry.surfaceId ||
        mapping.viewport !== entry.viewport.name ||
        mapping.sourceClassification !== source.classification ||
        mapping.sourceAccessibleNameHint !== source.accessibleNameHint
      );
    })
  ) {
    return false;
  }
  const notApplicableById = new Map(surface.notApplicable.map((expected) => [expected.source.id, expected]));
  return contract.notApplicable.every((actual) => {
    const expected = notApplicableById.get(actual.sourceControlId);
    if (!expected) return false;
    const { source, disposition } = expected;
    return (
      actual.schemaVersion === 1 &&
      actual.surfaceId === entry.surfaceId &&
      actual.sourceClassification === source.classification &&
      actual.sourceAccessibleNameHint === source.accessibleNameHint &&
      actual.viewport === entry.viewport.name &&
      actual.applicability === "not-applicable" &&
      actual.basisCode === disposition.basisCode &&
      actual.justification === disposition.justification &&
      actual.documentationReference === disposition.documentationReference &&
      actual.executionScope === "not-applicable" &&
      actual.semanticExecutionRef === null &&
      actual.handlerExecuted === false &&
      actual.evidenceKind === null &&
      actual.evidenceReference === `${disposition.documentationReference}|${source.id}` &&
      actual.status === "not-applicable"
    );
  });
}

function terminalSourceControlCoveragePassed(terminalCoverage, expectations) {
  if (!Array.isArray(terminalCoverage?.matrix)) return false;
  return STAGING_AUTH_SOURCE_CONTROL_SURFACES.every((surfaceId) => {
    const terminalMatches = terminalCoverage.matrix.filter((surface) => surface?.id === surfaceId);
    if (terminalMatches.length !== 1) return false;
    const terminalControls = terminalMatches[0]?.sourceControlResults;
    const expected = expectations.bySurface[surfaceId];
    const expectedControls = [
      ...expected.required.map((source) => ({ source, disposition: { applicability: "required" } })),
      ...expected.notApplicable,
    ];
    if (
      !sameUniqueIds(
        terminalControls,
        expectedControls.map(({ source }) => source.id),
      )
    )
      return false;
    const expectedById = new Map(expectedControls.map((value) => [value.source.id, value]));
    return terminalControls.every((control) => {
      const match = expectedById.get(control.sourceControlId);
      if (
        !match ||
        control.classification !== match.source.classification ||
        control.accessibleNameHint !== match.source.accessibleNameHint ||
        control.sourceEvidence !== match.source.evidence
      ) {
        return false;
      }
      if (match.disposition.applicability === "required") {
        return control.applicability === "required" && control.testState === "passed";
      }
      return (
        control.applicability === "not-applicable" &&
        control.testState === "not-applicable" &&
        control.basisCode === match.disposition.basisCode &&
        control.justification === match.disposition.justification &&
        control.documentationReference === match.disposition.documentationReference
      );
    });
  });
}

export function evaluateStagingAuthSourceControlCoverage({
  inventory,
  entries,
  requiredViewports,
  terminalCoverage,
}) {
  const expectations = buildStagingAuthSourceControlExpectations(inventory);
  const failures = [...expectations.failures];
  if (!Array.isArray(entries) || !Array.isArray(requiredViewports)) {
    return { valid: false, failures: [...failures, "coverage-input-invalid"], expectations };
  }
  const expectedEntryCount = STAGING_AUTH_SOURCE_CONTROL_SURFACES.length * requiredViewports.length;
  if (entries.length !== expectedEntryCount) failures.push("coverage-entry-count-invalid");
  if (!terminalSourceControlCoveragePassed(terminalCoverage, expectations)) {
    failures.push("terminal-source-contract-invalid");
  }
  for (const surfaceId of STAGING_AUTH_SOURCE_CONTROL_SURFACES) {
    for (const viewport of requiredViewports) {
      const matches = entries.filter(
        (entry) =>
          entry?.surfaceId === surfaceId &&
          entry?.viewport?.name === viewport?.name &&
          entry?.viewport?.width === viewport?.width &&
          entry?.viewport?.height === viewport?.height,
      );
      if (matches.length !== 1) {
        failures.push(`coverage-entry-identity-invalid:${surfaceId}:${String(viewport?.name ?? "missing")}`);
        continue;
      }
      if (!entrySourceControlContractPassed(matches[0], expectations)) {
        failures.push(`coverage-source-contract-invalid:${surfaceId}:${viewport.name}`);
      }
    }
  }
  return { valid: failures.length === 0, failures, expectations };
}
