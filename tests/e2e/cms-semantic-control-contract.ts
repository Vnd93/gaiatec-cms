export const CMS_SEMANTIC_CONTROL_CONTRACT_VERSION = 1 as const;

export const CMS_SEMANTIC_VIEWPORTS = ["390x844", "768x1024", "1440x900", "1920x1080"] as const;

export type CmsSemanticViewport = (typeof CMS_SEMANTIC_VIEWPORTS)[number];

export type CmsRuntimeControl = {
  kind: "field" | "action" | "tab" | "link" | "form" | "dialog" | "other";
  tag: string;
  role: string | null;
  name: string;
  type: string | null;
  required: boolean;
  disabled: boolean;
  readOnly?: boolean;
  destination: string | null;
};

export type CmsSemanticClassification =
  | "field.editable"
  | "field.read-only"
  | "field.disabled"
  | "action.mutating"
  | "action.non-mutating"
  | "action.disabled"
  | "navigation.tab"
  | "navigation.link"
  | "structure.form"
  | "structure.dialog"
  | "unsupported";

export type CmsSemanticEvidenceKind =
  | "ui-interaction"
  | "backend-response"
  | "navigation-response"
  | "scenario-contract"
  | "state-assertion"
  | "focus-only"
  | "observation-only";

export type CmsSemanticBinding = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  controlId: string;
  ordinal: number;
  kind: CmsRuntimeControl["kind"];
  name: string;
  classification: CmsSemanticClassification;
  handlerId: string;
  requiredEvidence: Exclude<CmsSemanticEvidenceKind, "focus-only" | "observation-only">[];
};

export type CmsSemanticExecution = CmsSemanticBinding & {
  viewport: CmsSemanticViewport;
  executionScope: "viewport-local" | "scenario-once";
  semanticExecutionRef: string | null;
  handlerExecuted: boolean;
  evidenceKind: CmsSemanticEvidenceKind | null;
  evidenceReference: string | null;
  restored: boolean;
  status: "passed" | "failed";
};

export type CmsSourceControl = {
  id: string;
  classification: "field" | "form" | "action" | "link" | "tab" | "dialog";
  element: string;
  accessibleNameHint: string;
  ownerRouteIds: string[];
  runtimeApplicabilityBySurface?: Record<string, CmsSourceControlApplicability>;
};

export type CmsSourceControlApplicability =
  | { applicability: "required" }
  | {
      applicability: "not-applicable";
      basisCode: "feature-branch-disabled" | "legacy-state-unavailable-by-read-only-cutover";
      justification: string;
      documentationReference: string;
    };

export type CmsSourceControlExecution = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  sourceControlId: string;
  sourceClassification: CmsSourceControl["classification"];
  sourceAccessibleNameHint: string;
  runtimeControlId: string;
  runtimeClassification: CmsSemanticClassification;
  runtimeHandlerId: string;
  runtimeControlName: string;
  runtimeControlOccurrence: number;
  viewport: CmsSemanticViewport;
  mapping: "accessible-name-and-occurrence" | "class-cardinality-and-occurrence";
  executionScope: "viewport-local" | "scenario-once";
  semanticExecutionRef: string | null;
  handlerExecuted: true;
  evidenceKind: Exclude<CmsSemanticEvidenceKind, "focus-only" | "observation-only">;
  evidenceReference: string;
  status: "passed";
};

export type CmsSourceControlNotApplicable = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  sourceControlId: string;
  sourceClassification: CmsSourceControl["classification"];
  sourceAccessibleNameHint: string;
  viewport: CmsSemanticViewport;
  applicability: "not-applicable";
  basisCode: Extract<CmsSourceControlApplicability, { applicability: "not-applicable" }>["basisCode"];
  justification: string;
  documentationReference: string;
  executionScope: "not-applicable";
  semanticExecutionRef: null;
  handlerExecuted: false;
  evidenceKind: null;
  evidenceReference: string;
  status: "not-applicable";
};

export type CmsMutatingActionEvidence = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  controlName: string;
  controlOccurrence: number;
  controlContractKey: string;
  actions: string[];
  scenarioIds: string[];
  handlerExecuted: true;
  evidenceKind: "backend-response";
  backendStatus: string;
  httpStatus: number;
  status: "passed";
};

export const CMS_SEMANTIC_FIELD_CASES = [
  "valid",
  "absent",
  "invalid",
  "lower-boundary",
  "upper-boundary",
] as const;

export type CmsSemanticFieldCase = (typeof CMS_SEMANTIC_FIELD_CASES)[number];

export type CmsSemanticScenarioDisposition =
  | {
      applicability: "exercised";
      scenarioId: string;
      proofKind:
        | "ui-validation"
        | "backend-validation"
        | "reload-persistence"
        | "backend-response"
        | "immutable-audit";
      evidenceReference: string;
      expectedResult: string;
      observedResult: string;
      httpStatus?: number;
    }
  | {
      applicability: "not-applicable";
      basisCode:
        | "non-editable-field"
        | "field-optional-by-schema"
        | "schema-defines-no-invalid-representation"
        | "schema-defines-no-lower-bound"
        | "schema-defines-no-upper-bound"
        | "security-prohibits-secret-persistence"
        | "transient-query-field"
        | "transient-command-field"
        | "security-sensitive-value-not-audited"
        | "non-mutating-query-not-audited";
      justification: string;
      documentationReference: string;
    };

export type CmsSemanticFieldEvidence = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  fieldName: string;
  fieldOccurrence: number;
  fieldContractKey: string;
  mode: "editable" | "read-only" | "disabled";
  schemaReference: string;
  cases: Record<CmsSemanticFieldCase, CmsSemanticScenarioDisposition>;
  persistence: CmsSemanticScenarioDisposition;
  backend: CmsSemanticScenarioDisposition;
  audit: CmsSemanticScenarioDisposition;
  status: "passed";
};

export type CmsSemanticStructureEvidence = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  controlKind: "form" | "dialog";
  controlName: string;
  controlOccurrence: number;
  structureContractKey: string;
  scenarioId: string;
  openedEvidenceReference: string;
  submittedOrConfirmedEvidenceReference: string;
  effectKind: "backend-response" | "navigation-response" | "state-transition";
  effectEvidenceReference: string;
  httpStatus: number | null;
  restoredOrClosedEvidenceReference: string;
  status: "passed";
};

export const CMS_SEMANTIC_STATE_SCOPE_KINDS = [
  "page",
  "run-tag-row",
  "managed-user-row",
  "created-lead-row",
  "run-tag-article",
] as const;

export type CmsSemanticStateScopeKind = (typeof CMS_SEMANTIC_STATE_SCOPE_KINDS)[number];

export type CmsSemanticStateSetupStep = {
  stepId: string;
  scope: CmsSemanticStateScopeKind;
  controlKind: "button" | "tab" | "checkbox" | "field" | "summary" | "link";
  accessibleName: string;
  controlOccurrence: number;
  operation: "activate" | "check" | "uncheck" | "fill-run-tag" | "select-first-nonempty" | "select-option";
  optionValue?: string;
};

export type CmsSemanticExpectedState =
  | {
      kind: "field";
      accessibleName: string;
      occurrence: number;
    }
  | {
      kind: "role";
      role: "dialog" | "alertdialog" | "region" | "form" | "tabpanel" | "group" | "heading";
      accessibleName: string;
      occurrence: number;
    }
  | {
      kind: "open-details";
      accessibleName: string;
      occurrence: number;
    };

export type CmsSemanticStateSetup = {
  schemaVersion: typeof CMS_SEMANTIC_CONTROL_CONTRACT_VERSION;
  surfaceId: string;
  stateId: string;
  stateContractKey: string;
  scenarioId: string;
  steps: CmsSemanticStateSetupStep[];
  expectedState: CmsSemanticExpectedState;
  restore: {
    operation: "escape" | "reload-route" | "activate";
    controlKind: "button" | "summary" | null;
    accessibleName: string | null;
    controlOccurrence: number | null;
  };
  mutationFree: true;
  observedMutationRequests: 0;
  triggerObserved: true;
  stateObserved: true;
  restored: true;
  evidenceReference: string;
  status: "passed";
};

export type CmsSemanticCoverageResult = {
  status: "passed" | "failed";
  failures: string[];
  totals: {
    bindings: number;
    executions: number;
    fields: number;
    actions: number;
    surfaces: number;
    viewports: number;
  };
};

// Buttons are side-effecting by default. Only labels whose implementation is
// unambiguously local, reversible UI state may be activated by the route scan.
// Everything else needs an exact backend/navigation ledger entry produced by
// the scenario that really executed the handler.
const reversibleUiOnlyActionPattern =
  /^(?:(?:abrir|fechar|expandir|recolher) menu administrativo|sobre esta tela|fechar (?:resumo|confirmação)|continuar editando|sair sem salvar|cancelar edição|descartar alterações(?: de .+| do .+)?|remover tag .+|abrir revogação|abrir|novo formulário|página anterior|página seguinte|anterior|próxima)$/i;

function stableSegment(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return normalized || "unnamed";
}

export function cmsSemanticControlId(surfaceId: string, control: CmsRuntimeControl, ordinal: number) {
  if (!surfaceId.trim()) throw new Error("CMS_SEMANTIC_SURFACE_ID_REQUIRED");
  if (!Number.isInteger(ordinal) || ordinal < 0) throw new Error("CMS_SEMANTIC_ORDINAL_INVALID");
  return [
    stableSegment(surfaceId),
    stableSegment(control.kind),
    stableSegment(control.role ?? control.tag),
    stableSegment(control.name || control.type || control.destination || "unnamed"),
    String(ordinal),
  ].join(":");
}

export function resolveCmsSemanticBinding(
  surfaceId: string,
  control: CmsRuntimeControl,
  ordinal: number,
): CmsSemanticBinding {
  const base = {
    schemaVersion: CMS_SEMANTIC_CONTROL_CONTRACT_VERSION,
    surfaceId,
    controlId: cmsSemanticControlId(surfaceId, control, ordinal),
    ordinal,
    kind: control.kind,
    name: control.name,
  } as const;

  if (control.kind === "field") {
    if (control.disabled) {
      return {
        ...base,
        classification: "field.disabled",
        handlerId: "field.require-schema-scenario-evidence",
        requiredEvidence: ["scenario-contract"],
      };
    }
    if (control.readOnly) {
      return {
        ...base,
        classification: "field.read-only",
        handlerId: "field.require-schema-scenario-evidence",
        requiredEvidence: ["scenario-contract"],
      };
    }
    return {
      ...base,
      classification: "field.editable",
      handlerId: `field.require-schema-scenario-${stableSegment(control.type ?? control.tag)}`,
      requiredEvidence: ["scenario-contract"],
    };
  }

  if (control.kind === "action") {
    if (control.disabled) {
      return {
        ...base,
        classification: "action.disabled",
        handlerId: "action.assert-disabled",
        requiredEvidence: ["state-assertion"],
      };
    }
    if (!reversibleUiOnlyActionPattern.test(control.name.trim())) {
      return {
        ...base,
        classification: "action.mutating",
        handlerId: "action.require-exact-side-effect-evidence",
        requiredEvidence: ["backend-response"],
      };
    }
    return {
      ...base,
      classification: "action.non-mutating",
      handlerId: "action.activate-and-verify-ui-effect",
      requiredEvidence: ["ui-interaction", "navigation-response"],
    };
  }

  if (control.kind === "tab") {
    return {
      ...base,
      classification: "navigation.tab",
      handlerId: "navigation.activate-tab",
      requiredEvidence: ["ui-interaction"],
    };
  }

  if (control.kind === "link") {
    return {
      ...base,
      classification: "navigation.link",
      handlerId: "navigation.open-and-return",
      requiredEvidence: ["navigation-response"],
    };
  }

  if (control.kind === "form") {
    return {
      ...base,
      classification: "structure.form",
      handlerId: "structure.require-submit-effect-evidence",
      requiredEvidence: ["scenario-contract"],
    };
  }

  if (control.kind === "dialog") {
    return {
      ...base,
      classification: "structure.dialog",
      handlerId: "structure.require-open-confirm-effect-evidence",
      requiredEvidence: ["scenario-contract"],
    };
  }

  return {
    ...base,
    classification: "unsupported",
    handlerId: "unsupported",
    requiredEvidence: [],
  };
}

function normalizedAccessibleName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function cmsMutatingActionContractKey(
  surfaceId: string,
  controlName: string,
  controlOccurrence: number,
) {
  if (!surfaceId.trim() || !Number.isInteger(controlOccurrence) || controlOccurrence < 0) {
    throw new Error("CMS_SEMANTIC_ACTION_TARGET_INVALID");
  }
  return `${stableSegment(surfaceId)}|${stableSegment(controlName)}|${controlOccurrence}`;
}

export function cmsSemanticFieldContractKey(surfaceId: string, fieldName: string, fieldOccurrence: number) {
  return `field|${cmsMutatingActionContractKey(surfaceId, fieldName, fieldOccurrence)}`;
}

export function cmsSemanticStructureContractKey(
  surfaceId: string,
  controlKind: "form" | "dialog",
  controlName: string,
  controlOccurrence: number,
) {
  return `${controlKind}|${cmsMutatingActionContractKey(surfaceId, controlName, controlOccurrence)}`;
}

export function cmsSemanticStateContractKey(surfaceId: string, stateId: string) {
  if (!surfaceId.trim() || !stateId.trim()) {
    throw new Error("CMS_SEMANTIC_STATE_TARGET_INVALID");
  }
  return `state|${stableSegment(surfaceId)}|${stableSegment(stateId)}`;
}

const semanticStateStepOperations = {
  button: ["activate"],
  tab: ["activate"],
  checkbox: ["check", "uncheck"],
  field: ["fill-run-tag", "select-first-nonempty", "select-option"],
  summary: ["activate"],
  link: ["activate"],
} as const;

function safeSemanticStateName(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 160 &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) &&
    !/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value) &&
    !/\b(?:eyJ[A-Za-z0-9_-]+\.|sbp_|sb_secret_|sk-or-)[A-Za-z0-9._-]{12,}/i.test(value)
  );
}

function validSemanticStateStep(step: CmsSemanticStateSetupStep) {
  const allowedOperations = semanticStateStepOperations[step.controlKind] as readonly string[];
  return (
    /^[a-z0-9][a-z0-9-]{2,79}$/.test(step.stepId) &&
    CMS_SEMANTIC_STATE_SCOPE_KINDS.includes(step.scope) &&
    safeSemanticStateName(step.accessibleName) &&
    Number.isInteger(step.controlOccurrence) &&
    step.controlOccurrence >= 0 &&
    allowedOperations.includes(step.operation) &&
    (step.scope !== "created-lead-row" || step.controlKind === "button") &&
    (step.operation !== "fill-run-tag" || step.scope === "page") &&
    (step.operation === "select-option"
      ? typeof step.optionValue === "string" && /^[a-z][a-z0-9_-]{1,63}$/.test(step.optionValue)
      : step.optionValue === undefined)
  );
}

function validSemanticExpectedState(state: CmsSemanticExpectedState) {
  if (
    !safeSemanticStateName(state.accessibleName) ||
    !Number.isInteger(state.occurrence) ||
    state.occurrence < 0
  ) {
    return false;
  }
  return state.kind === "open-details" || state.kind === "field"
    ? true
    : ["dialog", "alertdialog", "region", "form", "tabpanel", "group", "heading"].includes(state.role);
}

export function resolveCmsSemanticStateSetup(input: {
  surfaceId: string;
  stateId: string;
  evidence: CmsSemanticStateSetup[];
}): CmsSemanticStateSetup {
  const key = cmsSemanticStateContractKey(input.surfaceId, input.stateId);
  const matches = input.evidence.filter((entry) => {
    const restoreValid =
      entry.restore.operation === "reload-route" || entry.restore.operation === "escape"
        ? entry.restore.controlKind === null &&
          entry.restore.accessibleName === null &&
          entry.restore.controlOccurrence === null
        : ["button", "summary"].includes(entry.restore.controlKind ?? "") &&
          safeSemanticStateName(entry.restore.accessibleName) &&
          Number.isInteger(entry.restore.controlOccurrence) &&
          entry.restore.controlOccurrence! >= 0;
    return (
      entry.schemaVersion === CMS_SEMANTIC_CONTROL_CONTRACT_VERSION &&
      entry.surfaceId === input.surfaceId &&
      entry.stateId === input.stateId &&
      entry.stateContractKey === key &&
      /^[a-z0-9][a-z0-9-]{2,79}$/.test(entry.stateId) &&
      typeof entry.scenarioId === "string" &&
      entry.scenarioId.trim().length > 0 &&
      entry.steps.length > 0 &&
      new Set(entry.steps.map((step) => step.stepId)).size === entry.steps.length &&
      entry.steps.every(validSemanticStateStep) &&
      validSemanticExpectedState(entry.expectedState) &&
      restoreValid &&
      entry.mutationFree === true &&
      entry.observedMutationRequests === 0 &&
      entry.triggerObserved === true &&
      entry.stateObserved === true &&
      entry.restored === true &&
      scenarioReference(entry.evidenceReference) &&
      entry.evidenceReference.includes(key) &&
      entry.status === "passed"
    );
  });
  if (matches.length !== 1) {
    throw new Error(`CMS_SEMANTIC_STATE_EVIDENCE_COUNT:${key}:${matches.length}`);
  }
  return matches[0]!;
}

function scenarioReference(value: unknown) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !value.startsWith("dom:") &&
    !/focus|observation/i.test(value)
  );
}

function validScenarioDisposition(
  value: CmsSemanticScenarioDisposition,
  allowedProofKinds: Array<
    Extract<CmsSemanticScenarioDisposition, { applicability: "exercised" }>["proofKind"]
  >,
  allowedNotApplicable: Array<
    Extract<CmsSemanticScenarioDisposition, { applicability: "not-applicable" }>["basisCode"]
  >,
  contractKey: string,
) {
  if (!value || typeof value !== "object") return false;
  if (value.applicability === "exercised") {
    return (
      typeof value.scenarioId === "string" &&
      value.scenarioId.trim().length > 0 &&
      allowedProofKinds.includes(value.proofKind) &&
      scenarioReference(value.evidenceReference) &&
      value.evidenceReference.includes(contractKey) &&
      typeof value.expectedResult === "string" &&
      value.expectedResult.trim().length > 0 &&
      typeof value.observedResult === "string" &&
      value.observedResult.trim().length > 0 &&
      (value.proofKind !== "backend-response" ||
        (Number.isInteger(value.httpStatus) && value.httpStatus! >= 200 && value.httpStatus! < 300))
    );
  }
  return (
    value.applicability === "not-applicable" &&
    allowedNotApplicable.includes(value.basisCode) &&
    typeof value.justification === "string" &&
    value.justification.trim().length >= 16 &&
    typeof value.documentationReference === "string" &&
    /^(?:src|docs|supabase)\//.test(value.documentationReference)
  );
}

function validFieldEvidence(entry: CmsSemanticFieldEvidence) {
  if (
    entry.schemaVersion !== CMS_SEMANTIC_CONTROL_CONTRACT_VERSION ||
    entry.status !== "passed" ||
    !["editable", "read-only", "disabled"].includes(entry.mode) ||
    entry.fieldContractKey !==
      cmsSemanticFieldContractKey(entry.surfaceId, entry.fieldName, entry.fieldOccurrence) ||
    !Number.isInteger(entry.fieldOccurrence) ||
    entry.fieldOccurrence < 0 ||
    !/^(?:src|docs|supabase)\//.test(entry.schemaReference)
  ) {
    return false;
  }
  const caseIds = Object.keys(entry.cases ?? {}).sort();
  if (JSON.stringify(caseIds) !== JSON.stringify([...CMS_SEMANTIC_FIELD_CASES].sort())) return false;
  const nonEditable = entry.mode !== "editable";
  const exercisedReferences: string[] = [];
  const allowedCases: Record<
    CmsSemanticFieldCase,
    Array<Extract<CmsSemanticScenarioDisposition, { applicability: "not-applicable" }>["basisCode"]>
  > = {
    valid: nonEditable ? ["non-editable-field"] : [],
    absent: nonEditable ? ["non-editable-field"] : ["field-optional-by-schema"],
    invalid: nonEditable ? ["non-editable-field"] : ["schema-defines-no-invalid-representation"],
    "lower-boundary": nonEditable ? ["non-editable-field"] : ["schema-defines-no-lower-bound"],
    "upper-boundary": nonEditable ? ["non-editable-field"] : ["schema-defines-no-upper-bound"],
  };
  for (const caseId of CMS_SEMANTIC_FIELD_CASES) {
    if (
      !validScenarioDisposition(
        entry.cases[caseId],
        ["ui-validation", "backend-validation"],
        allowedCases[caseId],
        entry.fieldContractKey,
      )
    ) {
      return false;
    }
  }
  if (
    !validScenarioDisposition(
      entry.persistence,
      ["reload-persistence"],
      nonEditable
        ? ["non-editable-field"]
        : ["security-prohibits-secret-persistence", "transient-query-field", "transient-command-field"],
      entry.fieldContractKey,
    ) ||
    !validScenarioDisposition(
      entry.backend,
      ["backend-response"],
      nonEditable ? ["non-editable-field"] : [],
      entry.fieldContractKey,
    ) ||
    !validScenarioDisposition(
      entry.audit,
      ["immutable-audit"],
      nonEditable
        ? ["non-editable-field"]
        : ["security-sensitive-value-not-audited", "non-mutating-query-not-audited"],
      entry.fieldContractKey,
    )
  ) {
    return false;
  }
  for (const disposition of [
    ...CMS_SEMANTIC_FIELD_CASES.map((caseId) => entry.cases[caseId]),
    entry.persistence,
    entry.backend,
    entry.audit,
  ]) {
    if (disposition.applicability === "exercised") {
      exercisedReferences.push(disposition.evidenceReference);
    }
  }
  return new Set(exercisedReferences).size === exercisedReferences.length;
}

export function resolveCmsSemanticFieldEvidence(input: {
  surfaceId: string;
  fieldName: string;
  fieldOccurrence: number;
  evidence: CmsSemanticFieldEvidence[];
}): CmsSemanticFieldEvidence {
  const key = cmsSemanticFieldContractKey(input.surfaceId, input.fieldName, input.fieldOccurrence);
  const matches = input.evidence.filter(
    (entry) =>
      entry.surfaceId === input.surfaceId &&
      entry.fieldContractKey === key &&
      entry.fieldOccurrence === input.fieldOccurrence &&
      normalizedAccessibleName(entry.fieldName) === normalizedAccessibleName(input.fieldName) &&
      validFieldEvidence(entry),
  );
  if (matches.length !== 1) {
    throw new Error(`CMS_SEMANTIC_FIELD_EVIDENCE_COUNT:${key}:${matches.length}`);
  }
  return matches[0]!;
}

function validStructureEvidence(entry: CmsSemanticStructureEvidence) {
  const references = [
    entry.openedEvidenceReference,
    entry.submittedOrConfirmedEvidenceReference,
    entry.effectEvidenceReference,
    entry.restoredOrClosedEvidenceReference,
  ];
  return (
    entry.schemaVersion === CMS_SEMANTIC_CONTROL_CONTRACT_VERSION &&
    entry.status === "passed" &&
    ["form", "dialog"].includes(entry.controlKind) &&
    entry.structureContractKey ===
      cmsSemanticStructureContractKey(
        entry.surfaceId,
        entry.controlKind,
        entry.controlName,
        entry.controlOccurrence,
      ) &&
    Number.isInteger(entry.controlOccurrence) &&
    entry.controlOccurrence >= 0 &&
    typeof entry.scenarioId === "string" &&
    entry.scenarioId.trim().length > 0 &&
    scenarioReference(entry.openedEvidenceReference) &&
    scenarioReference(entry.submittedOrConfirmedEvidenceReference) &&
    ["backend-response", "navigation-response", "state-transition"].includes(entry.effectKind) &&
    scenarioReference(entry.effectEvidenceReference) &&
    (entry.effectKind === "state-transition" ||
      (Number.isInteger(entry.httpStatus) && entry.httpStatus! >= 200 && entry.httpStatus! < 400)) &&
    scenarioReference(entry.restoredOrClosedEvidenceReference) &&
    references.every((reference) => reference.includes(entry.structureContractKey)) &&
    new Set(references).size === references.length
  );
}

export function resolveCmsSemanticStructureEvidence(input: {
  surfaceId: string;
  controlKind: "form" | "dialog";
  controlName: string;
  controlOccurrence: number;
  evidence: CmsSemanticStructureEvidence[];
}): CmsSemanticStructureEvidence {
  const key = cmsSemanticStructureContractKey(
    input.surfaceId,
    input.controlKind,
    input.controlName,
    input.controlOccurrence,
  );
  const matches = input.evidence.filter(
    (entry) =>
      entry.surfaceId === input.surfaceId &&
      entry.controlKind === input.controlKind &&
      entry.structureContractKey === key &&
      entry.controlOccurrence === input.controlOccurrence &&
      normalizedAccessibleName(entry.controlName) === normalizedAccessibleName(input.controlName) &&
      validStructureEvidence(entry),
  );
  if (matches.length !== 1) {
    throw new Error(`CMS_SEMANTIC_STRUCTURE_EVIDENCE_COUNT:${key}:${matches.length}`);
  }
  return matches[0]!;
}

export function resolveCmsMutatingActionEvidence(input: {
  surfaceId: string;
  controlName: string;
  controlOccurrence: number;
  evidence: CmsMutatingActionEvidence[];
}): CmsMutatingActionEvidence {
  const key = cmsMutatingActionContractKey(input.surfaceId, input.controlName, input.controlOccurrence);
  const matches = input.evidence.filter(
    (item) =>
      item.schemaVersion === CMS_SEMANTIC_CONTROL_CONTRACT_VERSION &&
      item.surfaceId === input.surfaceId &&
      item.controlContractKey === key &&
      item.controlOccurrence === input.controlOccurrence &&
      normalizedAccessibleName(item.controlName) === normalizedAccessibleName(input.controlName) &&
      item.handlerExecuted === true &&
      item.evidenceKind === "backend-response" &&
      item.status === "passed" &&
      Number.isInteger(item.httpStatus) &&
      item.httpStatus >= 200 &&
      item.httpStatus < 300 &&
      typeof item.backendStatus === "string" &&
      item.backendStatus.length > 0 &&
      Array.isArray(item.actions) &&
      item.actions.length > 0 &&
      Array.isArray(item.scenarioIds) &&
      item.scenarioIds.length > 0,
  );
  if (matches.length !== 1) {
    throw new Error(`CMS_SEMANTIC_ACTION_EVIDENCE_COUNT:${key}:${matches.length}`);
  }
  return matches[0]!;
}

function genericAccessibleName(value: string) {
  const normalized = normalizedAccessibleName(value);
  return (
    !normalized ||
    normalized === "nome acessivel verificado em runtime" ||
    // Source inventory deliberately keeps dynamic JSX fail-closed. Handler
    // expressions and DOM ids are not accessible names, so they may only use
    // the deterministic class/cardinality/occurrence fallback.
    normalized.startsWith("void ") ||
    normalized.startsWith("admin ") ||
    normalized.includes("classname") ||
    normalized.includes("onclick") ||
    normalized.includes("onchange") ||
    normalized.includes("event target") ||
    normalized.includes(" set") ||
    normalized.startsWith("button ref") ||
    normalized.length < 2
  );
}

function sourceRuntimeFamily(classification: CmsSourceControl["classification"]) {
  return classification;
}

function runtimeFamily(execution: CmsSemanticExecution) {
  if (execution.classification.startsWith("field.")) return "field";
  if (execution.classification.startsWith("action.")) return "action";
  if (execution.classification === "navigation.link") return "link";
  if (execution.classification === "navigation.tab") return "tab";
  if (execution.classification === "structure.form") return "form";
  if (execution.classification === "structure.dialog") return "dialog";
  return "unsupported";
}

function accessibleNamesMatch(sourceName: string, runtimeName: string) {
  if (genericAccessibleName(sourceName)) return false;
  const source = normalizedAccessibleName(sourceName);
  const runtime = normalizedAccessibleName(runtimeName);
  if (!source || !runtime) return false;
  return source === runtime || (runtime.length >= 4 && source.startsWith(runtime));
}

function sourceControlApplicability(
  source: CmsSourceControl,
  surfaceId: string,
): CmsSourceControlApplicability {
  const disposition = source.runtimeApplicabilityBySurface?.[surfaceId] ?? {
    applicability: "required" as const,
  };
  if (disposition.applicability === "required") return disposition;
  const validDocumentation =
    disposition.basisCode === "feature-branch-disabled"
      ? disposition.documentationReference === "src/admin/ev2-runtime.ts#ev2.dam"
      : disposition.documentationReference ===
        "supabase/migrations/0078_cms_product_pim_consolidation.sql#legacy-writers-read-only";
  if (
    !validDocumentation ||
    typeof disposition.justification !== "string" ||
    disposition.justification.trim().length < 32
  ) {
    throw new Error(`CMS_SOURCE_CONTROL_NOT_APPLICABLE_INVALID:${surfaceId}:${source.id}`);
  }
  return disposition;
}

export function mapCmsSourceControlsToRuntime(input: {
  surfaceId: string;
  viewport: CmsSemanticViewport;
  sourceControls: CmsSourceControl[];
  executions: CmsSemanticExecution[];
}): {
  status: "passed" | "failed";
  mappings: CmsSourceControlExecution[];
  notApplicable: CmsSourceControlNotApplicable[];
  failures: string[];
} {
  const failures = new Set<string>();
  const sourceIds = new Set<string>();
  const applicableSources: CmsSourceControl[] = [];
  const notApplicable: CmsSourceControlNotApplicable[] = [];
  for (const source of input.sourceControls) {
    if (sourceIds.has(source.id)) failures.add(`duplicate-source-control:${source.id}`);
    sourceIds.add(source.id);
    if (!source.ownerRouteIds.includes(input.surfaceId)) {
      failures.add(`source-owner-mismatch:${source.id}`);
    }
    let applicability: CmsSourceControlApplicability;
    try {
      applicability = sourceControlApplicability(source, input.surfaceId);
    } catch (caught) {
      failures.add(caught instanceof Error ? caught.message : `source-applicability-invalid:${source.id}`);
      continue;
    }
    if (applicability.applicability === "required") {
      applicableSources.push(source);
      continue;
    }
    notApplicable.push({
      schemaVersion: CMS_SEMANTIC_CONTROL_CONTRACT_VERSION,
      surfaceId: input.surfaceId,
      sourceControlId: source.id,
      sourceClassification: source.classification,
      sourceAccessibleNameHint: source.accessibleNameHint,
      viewport: input.viewport,
      applicability: "not-applicable",
      basisCode: applicability.basisCode,
      justification: applicability.justification,
      documentationReference: applicability.documentationReference,
      executionScope: "not-applicable",
      semanticExecutionRef: null,
      handlerExecuted: false,
      evidenceKind: null,
      evidenceReference: `${applicability.documentationReference}|${source.id}`,
      status: "not-applicable",
    });
  }
  const eligible = input.executions.filter(
    (execution) =>
      execution.surfaceId === input.surfaceId &&
      execution.viewport === input.viewport &&
      execution.status === "passed" &&
      execution.handlerExecuted &&
      execution.evidenceKind &&
      !["focus-only", "observation-only"].includes(execution.evidenceKind) &&
      Boolean(execution.evidenceReference),
  );
  const executionIds = new Set<string>();
  for (const execution of eligible) {
    if (executionIds.has(execution.controlId))
      failures.add(`duplicate-runtime-control:${execution.controlId}`);
    executionIds.add(execution.controlId);
  }

  const sourceGroups = new Map<string, CmsSourceControl[]>();
  for (const source of applicableSources) {
    const key = `${sourceRuntimeFamily(source.classification)}|${normalizedAccessibleName(source.accessibleNameHint)}`;
    sourceGroups.set(key, [...(sourceGroups.get(key) ?? []), source]);
  }
  const unused = new Map(eligible.map((execution) => [execution.controlId, execution]));
  const mapped = new Map<
    string,
    { execution: CmsSemanticExecution; mapping: CmsSourceControlExecution["mapping"] }
  >();

  for (const sources of [...sourceGroups.values()].sort((left, right) =>
    left[0]!.id.localeCompare(right[0]!.id),
  )) {
    if (genericAccessibleName(sources[0]!.accessibleNameHint)) continue;
    const family = sourceRuntimeFamily(sources[0]!.classification);
    const candidates = [...unused.values()].filter(
      (execution) =>
        runtimeFamily(execution) === family &&
        accessibleNamesMatch(sources[0]!.accessibleNameHint, execution.name),
    );
    if (candidates.length < sources.length) {
      failures.add(
        `named-cardinality-mismatch:${family}:${normalizedAccessibleName(sources[0]!.accessibleNameHint)}:${sources.length}:${candidates.length}`,
      );
      continue;
    }
    const orderedSources = [...sources].sort((left, right) => left.id.localeCompare(right.id));
    const orderedCandidates = [...candidates].sort(
      (left, right) => left.ordinal - right.ordinal || left.controlId.localeCompare(right.controlId),
    );
    orderedSources.forEach((source, index) => {
      const execution = orderedCandidates[index]!;
      mapped.set(source.id, { execution, mapping: "accessible-name-and-occurrence" });
      unused.delete(execution.controlId);
    });
  }

  for (const family of ["field", "form", "action", "link", "tab", "dialog"] as const) {
    const remainingSources = applicableSources
      .filter((source) => sourceRuntimeFamily(source.classification) === family && !mapped.has(source.id))
      .sort((left, right) => left.id.localeCompare(right.id));
    const remainingExecutions = [...unused.values()]
      .filter((execution) => runtimeFamily(execution) === family)
      .sort((left, right) => left.ordinal - right.ordinal || left.controlId.localeCompare(right.controlId));
    if (remainingExecutions.length < remainingSources.length) {
      failures.add(
        `fallback-cardinality-mismatch:${family}:${remainingSources.length}:${remainingExecutions.length}`,
      );
      continue;
    }
    remainingSources.forEach((source, index) => {
      const execution = remainingExecutions[index]!;
      mapped.set(source.id, { execution, mapping: "class-cardinality-and-occurrence" });
      unused.delete(execution.controlId);
    });
  }

  for (const source of applicableSources) {
    if (!mapped.has(source.id)) failures.add(`source-control-unmapped:${source.id}`);
  }
  const reverseMappings = new Map<string, string[]>();
  for (const [sourceId, item] of mapped) {
    reverseMappings.set(item.execution.controlId, [
      ...(reverseMappings.get(item.execution.controlId) ?? []),
      sourceId,
    ]);
  }
  for (const [controlId, sourceIdList] of reverseMappings) {
    if (sourceIdList.length !== 1) failures.add(`runtime-control-reused:${controlId}`);
  }

  const mappings = [...mapped.entries()]
    .map(([sourceControlId, item]) => {
      const source = applicableSources.find((candidate) => candidate.id === sourceControlId)!;
      const runtimeOccurrence = [...eligible]
        .filter(
          (candidate) =>
            runtimeFamily(candidate) === runtimeFamily(item.execution) &&
            normalizedAccessibleName(candidate.name) === normalizedAccessibleName(item.execution.name),
        )
        .sort((left, right) => left.ordinal - right.ordinal || left.controlId.localeCompare(right.controlId))
        .findIndex((candidate) => candidate.controlId === item.execution.controlId);
      if (runtimeOccurrence < 0) {
        failures.add(`runtime-occurrence-unresolved:${item.execution.controlId}`);
      }
      const evidenceKind = item.execution.evidenceKind as Exclude<
        CmsSemanticEvidenceKind,
        "focus-only" | "observation-only"
      >;
      return {
        schemaVersion: CMS_SEMANTIC_CONTROL_CONTRACT_VERSION,
        surfaceId: input.surfaceId,
        sourceControlId,
        sourceClassification: source.classification,
        sourceAccessibleNameHint: source.accessibleNameHint,
        runtimeControlId: item.execution.controlId,
        runtimeClassification: item.execution.classification,
        runtimeHandlerId: item.execution.handlerId,
        runtimeControlName: item.execution.name,
        runtimeControlOccurrence: runtimeOccurrence,
        viewport: input.viewport,
        mapping: item.mapping,
        executionScope: item.execution.executionScope,
        semanticExecutionRef: item.execution.semanticExecutionRef,
        handlerExecuted: true as const,
        evidenceKind,
        evidenceReference: item.execution.evidenceReference!,
        status: "passed" as const,
      };
    })
    .sort((left, right) => left.sourceControlId.localeCompare(right.sourceControlId));

  return {
    status: failures.size ? "failed" : "passed",
    mappings,
    notApplicable: notApplicable.sort((left, right) =>
      left.sourceControlId.localeCompare(right.sourceControlId),
    ),
    failures: [...failures].sort(),
  };
}

export function validateCmsSemanticCoverage(input: {
  bindings: CmsSemanticBinding[];
  executions: CmsSemanticExecution[];
  expectedSurfaceIds: string[];
  expectedViewports?: readonly CmsSemanticViewport[];
}): CmsSemanticCoverageResult {
  const expectedViewports = input.expectedViewports ?? CMS_SEMANTIC_VIEWPORTS;
  const failures = new Set<string>();
  const bindingKeys = new Set<string>();

  for (const binding of input.bindings) {
    const key = `${binding.surfaceId}|${binding.controlId}`;
    if (bindingKeys.has(key)) failures.add(`duplicate-binding:${key}`);
    bindingKeys.add(key);
    if (binding.schemaVersion !== CMS_SEMANTIC_CONTROL_CONTRACT_VERSION) {
      failures.add(`invalid-contract-version:${key}`);
    }
    if (binding.classification === "unsupported" || binding.handlerId === "unsupported") {
      failures.add(`unsupported-control:${key}`);
    }
    if (!binding.requiredEvidence.length && binding.classification !== "unsupported") {
      failures.add(`missing-evidence-contract:${key}`);
    }
  }

  const executionsByKey = new Map<string, CmsSemanticExecution>();
  const semanticReferenceOwners = new Map<string, string>();
  for (const execution of input.executions) {
    const key = `${execution.surfaceId}|${execution.controlId}|${execution.viewport}`;
    if (executionsByKey.has(key)) failures.add(`duplicate-execution:${key}`);
    executionsByKey.set(key, execution);
    if (!bindingKeys.has(`${execution.surfaceId}|${execution.controlId}`)) {
      failures.add(`execution-without-binding:${key}`);
    }
    if (!execution.handlerExecuted) failures.add(`handler-not-executed:${key}`);
    if (execution.executionScope === "scenario-once") {
      if (!execution.semanticExecutionRef?.trim()) {
        failures.add(`semantic-execution-reference-missing:${key}`);
      } else {
        const ownerKey = `${execution.surfaceId}|${execution.controlId}`;
        const previousOwner = semanticReferenceOwners.get(execution.semanticExecutionRef);
        if (previousOwner && previousOwner !== ownerKey) {
          failures.add(`semantic-execution-reference-reused:${execution.semanticExecutionRef}`);
        } else {
          semanticReferenceOwners.set(execution.semanticExecutionRef, ownerKey);
        }
      }
      const expectedScenarioEvidence =
        execution.classification === "action.mutating" ? "backend-response" : "scenario-contract";
      if (execution.evidenceKind !== expectedScenarioEvidence) {
        failures.add(`scenario-once-without-contract-evidence:${key}`);
      }
    } else if (execution.executionScope === "viewport-local") {
      if (execution.semanticExecutionRef !== null) {
        failures.add(`viewport-local-with-semantic-reference:${key}`);
      }
      if (
        execution.classification.startsWith("field.") ||
        execution.classification === "structure.form" ||
        execution.classification === "structure.dialog" ||
        execution.classification === "action.mutating"
      ) {
        failures.add(`scenario-contract-required:${key}`);
      }
    } else {
      failures.add(`invalid-execution-scope:${key}`);
    }
    if (!execution.evidenceKind) failures.add(`evidence-missing:${key}`);
    if (execution.evidenceKind === "focus-only" || execution.evidenceKind === "observation-only") {
      failures.add(`non-semantic-evidence:${key}`);
    }
    if (
      execution.evidenceKind &&
      !execution.requiredEvidence.includes(
        execution.evidenceKind as Exclude<CmsSemanticEvidenceKind, "focus-only" | "observation-only">,
      )
    ) {
      failures.add(`wrong-evidence-kind:${key}`);
    }
    if (!execution.evidenceReference?.trim()) failures.add(`evidence-reference-missing:${key}`);
    if (execution.status !== "passed") failures.add(`execution-failed:${key}`);
    if (execution.executionScope === "viewport-local" && !execution.restored) {
      failures.add(`viewport-local-effect-not-restored:${key}`);
    }
  }

  for (const surfaceId of input.expectedSurfaceIds) {
    const surfaceBindings = input.bindings.filter((binding) => binding.surfaceId === surfaceId);
    if (!surfaceBindings.length) failures.add(`surface-without-bindings:${surfaceId}`);
    for (const viewport of expectedViewports) {
      for (const binding of surfaceBindings) {
        const key = `${surfaceId}|${binding.controlId}|${viewport}`;
        if (!executionsByKey.has(key)) failures.add(`unexercised-control:${key}`);
      }
    }
  }

  return {
    status: failures.size ? "failed" : "passed",
    failures: [...failures].sort(),
    totals: {
      bindings: input.bindings.length,
      executions: input.executions.length,
      fields: input.bindings.filter((binding) => binding.kind === "field").length,
      actions: input.bindings.filter((binding) => binding.kind === "action").length,
      surfaces: new Set(input.bindings.map((binding) => binding.surfaceId)).size,
      viewports: new Set(input.executions.map((execution) => execution.viewport)).size,
    },
  };
}
