import type { Locator, Page } from "@playwright/test";
import {
  CMS_SEMANTIC_FIELD_CASES,
  cmsSemanticFieldContractKey,
  cmsSemanticStructureContractKey,
  resolveCmsSemanticFieldEvidence,
  resolveCmsSemanticStructureEvidence,
  type CmsSemanticFieldCase,
  type CmsSemanticFieldEvidence,
  type CmsSemanticScenarioDisposition,
  type CmsSemanticStructureEvidence,
} from "./cms-semantic-control-contract";

type ExercisedCase = {
  applicability: "exercised";
  proofKind: "ui-validation" | "backend-validation";
  expectedResult: string;
  observedResult: string;
};

type NotApplicableCase = {
  applicability: "not-applicable";
  basisCode: Extract<CmsSemanticScenarioDisposition, { applicability: "not-applicable" }>["basisCode"];
  justification: string;
  documentationReference: string;
};

type PreparedCase = ExercisedCase | NotApplicableCase;

export type CmsPreparedSemanticField = {
  surfaceId: string;
  fieldName: string;
  fieldOccurrence: number;
  fieldContractKey: string;
  mode: "editable" | "read-only" | "disabled";
  schemaReference: string;
  scenarioId: string;
  cases: Record<CmsSemanticFieldCase, PreparedCase>;
};

type BoundaryPolicy =
  | { applicability: "schema-none" }
  | { applicability: "exercise"; value: string; expectedResult: string; observedResult: string }
  | {
      applicability: "already-exercised";
      proofKind: "ui-validation" | "backend-validation";
      expectedResult: string;
      observedResult: string;
    };

type InvalidPolicy =
  | { applicability: "schema-none" }
  | { applicability: "exercise"; value: string; expectedResult: string; observedResult: string }
  | {
      applicability: "already-exercised";
      proofKind: "ui-validation" | "backend-validation";
      expectedResult: string;
      observedResult: string;
    };

type AbsencePolicy =
  | { applicability: "optional" }
  | { applicability: "exercise" }
  | {
      applicability: "already-exercised";
      proofKind: "ui-validation" | "backend-validation";
      expectedResult: string;
      observedResult: string;
    };

type PersistenceProof =
  | {
      applicability: "exercised";
      expectedResult: string;
      observedResult: string;
    }
  | {
      applicability: "not-applicable";
      basisCode:
        "security-prohibits-secret-persistence" | "transient-query-field" | "transient-command-field";
      justification: string;
      documentationReference: string;
    };

type AuditProof =
  | {
      applicability: "exercised";
      expectedResult: string;
      observedResult: string;
    }
  | {
      applicability: "not-applicable";
      basisCode: "security-sensitive-value-not-audited" | "non-mutating-query-not-audited";
      justification: string;
      documentationReference: string;
    };

type FinalizeFieldInput = {
  httpStatus: number;
  backendExpectedResult: string;
  backendObservedResult: string;
  persistence: PersistenceProof;
  audit: AuditProof;
};

type PrepareFieldInput = {
  page: Page;
  locator: Locator;
  surfaceId: string;
  fieldName: string;
  scenarioId: string;
  schemaReference: string;
  fieldOccurrence?: number;
  absence?: AbsencePolicy;
  invalid?: InvalidPolicy;
  lowerBoundary?: BoundaryPolicy;
  upperBoundary?: BoundaryPolicy;
};

const sensitiveEvidencePattern =
  /(?:[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b|\b(?:eyJ|sbp_|sb_secret_|sk-or-)[A-Za-z0-9._-]{10,})/i;

function assertSafeText(value: string, label: string) {
  if (!value.trim() || sensitiveEvidencePattern.test(value)) {
    throw new Error(`CMS_SEMANTIC_SCENARIO_SENSITIVE_OR_EMPTY:${label}`);
  }
}

function exercisedCase(
  proofKind: ExercisedCase["proofKind"],
  expectedResult: string,
  observedResult: string,
): ExercisedCase {
  assertSafeText(expectedResult, "expected-result");
  assertSafeText(observedResult, "observed-result");
  return { applicability: "exercised", proofKind, expectedResult, observedResult };
}

function notApplicableCase(
  basisCode: NotApplicableCase["basisCode"],
  justification: string,
  documentationReference: string,
): NotApplicableCase {
  assertSafeText(justification, "not-applicable-justification");
  if (justification.trim().length < 16 || !/^(?:src|docs|supabase)\//.test(documentationReference)) {
    throw new Error("CMS_SEMANTIC_SCENARIO_NOT_APPLICABLE_INVALID");
  }
  return { applicability: "not-applicable", basisCode, justification, documentationReference };
}

async function visibleFieldOccurrence(page: Page, name: string, target: Locator) {
  const targetHandle = await target.elementHandle();
  if (!targetHandle) throw new Error(`CMS_SEMANTIC_FIELD_RUNTIME_MISSING:${name}`);
  const candidates = page.getByLabel(name, { exact: true });
  let occurrence = 0;
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    if (await candidate.evaluate((element, expected) => element === expected, targetHandle)) {
      return occurrence;
    }
    occurrence += 1;
  }
  throw new Error(`CMS_SEMANTIC_FIELD_RUNTIME_UNBOUND:${name}`);
}

async function validity(locator: Locator) {
  return locator.evaluate((element) => {
    if (!(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    )) {
      throw new Error("semantic target is not a form field");
    }
    return element.checkValidity();
  });
}

async function restoreValue(locator: Locator, tag: string, type: string, value: string, checked: boolean) {
  if (type === "checkbox" || type === "radio") await locator.setChecked(checked);
  else if (tag === "select") await locator.selectOption(value);
  else await locator.fill(value);
}

async function exerciseValue(locator: Locator, tag: string, type: string, value: string) {
  if (type === "checkbox" || type === "radio") await locator.setChecked(value === "checked");
  else if (tag === "select") await locator.selectOption(value);
  else await locator.fill(value);
}

function exactBoundaryValue(type: string, length: number) {
  if (type === "email") {
    const suffix = "@example.invalid";
    return `${"q".repeat(Math.max(1, length - suffix.length))}${suffix}`.slice(0, length);
  }
  return "q".repeat(length);
}

export async function prepareCmsSemanticField(input: PrepareFieldInput): Promise<CmsPreparedSemanticField> {
  const { locator } = input;
  await locator.waitFor({ state: "visible" });
  const attributes = await locator.evaluate((element) => {
    if (!(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    )) {
      throw new Error("semantic target is not a form field");
    }
    return {
      tag: element.tagName.toLowerCase(),
      type: (element.getAttribute("type") ?? "text").toLowerCase(),
      value: element.value,
      checked: element instanceof HTMLInputElement ? element.checked : false,
      required: element.required,
      disabled: element.disabled,
      readOnly:
        element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
          ? element.readOnly
          : false,
      min: element.getAttribute("min"),
      max: element.getAttribute("max"),
      minLength: element.getAttribute("minlength"),
      maxLength: element.getAttribute("maxlength"),
    };
  });
  const occurrence =
    input.fieldOccurrence ?? (await visibleFieldOccurrence(input.page, input.fieldName, locator));
  const key = cmsSemanticFieldContractKey(input.surfaceId, input.fieldName, occurrence);
  const mode = attributes.disabled ? "disabled" : attributes.readOnly ? "read-only" : "editable";
  if (mode !== "editable") {
    const classification = notApplicableCase(
      "non-editable-field",
      "O estado runtime impede edição e nenhuma mutação deste campo é permitida.",
      input.schemaReference,
    );
    return {
      surfaceId: input.surfaceId,
      fieldName: input.fieldName,
      fieldOccurrence: occurrence,
      fieldContractKey: key,
      mode,
      schemaReference: input.schemaReference,
      scenarioId: input.scenarioId,
      cases: Object.fromEntries(CMS_SEMANTIC_FIELD_CASES.map((caseId) => [caseId, classification])) as Record<
        CmsSemanticFieldCase,
        PreparedCase
      >,
    };
  }

  if (!(await validity(locator))) throw new Error(`CMS_SEMANTIC_FIELD_VALID_CASE_FAILED:${key}`);
  const cases = {} as Record<CmsSemanticFieldCase, PreparedCase>;
  cases.valid = exercisedCase(
    "ui-validation",
    "O valor controlado deve satisfazer o contrato visível antes do envio.",
    "A validação nativa da interface aceitou o valor controlado.",
  );

  const absence =
    input.absence ?? (attributes.required ? { applicability: "exercise" } : { applicability: "optional" });
  if (absence.applicability === "optional") {
    cases.absent = notApplicableCase(
      "field-optional-by-schema",
      "O schema declara este campo opcional e aceita sua ausência explicitamente.",
      input.schemaReference,
    );
  } else if (absence.applicability === "already-exercised") {
    cases.absent = exercisedCase(absence.proofKind, absence.expectedResult, absence.observedResult);
  } else {
    if (attributes.type === "file") {
      throw new Error(`CMS_SEMANTIC_FIELD_FILE_ABSENCE_REQUIRES_EXPLICIT_PROOF:${key}`);
    }
    await exerciseValue(
      locator,
      attributes.tag,
      attributes.type,
      attributes.type === "checkbox" ? "unchecked" : "",
    );
    if (await validity(locator)) throw new Error(`CMS_SEMANTIC_FIELD_ABSENCE_NOT_REJECTED:${key}`);
    await restoreValue(locator, attributes.tag, attributes.type, attributes.value, attributes.checked);
    cases.absent = exercisedCase(
      "ui-validation",
      "A ausência do campo obrigatório deve ser recusada pela interface.",
      "A interface recusou a ausência e o valor controlado foi restaurado.",
    );
  }

  const invalid = input.invalid ?? { applicability: "schema-none" };
  if (invalid.applicability === "schema-none") {
    cases.invalid = notApplicableCase(
      "schema-defines-no-invalid-representation",
      "O controle limita a entrada aos valores tipados e não define outra representação inválida.",
      input.schemaReference,
    );
  } else if (invalid.applicability === "already-exercised") {
    cases.invalid = exercisedCase(invalid.proofKind, invalid.expectedResult, invalid.observedResult);
  } else {
    await exerciseValue(locator, attributes.tag, attributes.type, invalid.value);
    if (await validity(locator)) throw new Error(`CMS_SEMANTIC_FIELD_INVALID_CASE_ACCEPTED:${key}`);
    await restoreValue(locator, attributes.tag, attributes.type, attributes.value, attributes.checked);
    cases.invalid = exercisedCase("ui-validation", invalid.expectedResult, invalid.observedResult);
  }

  const automaticLower = attributes.minLength
    ? {
        applicability: "exercise" as const,
        value: exactBoundaryValue(attributes.type, Number(attributes.minLength)),
        expectedResult: "O limite inferior declarado deve ser aceito exatamente.",
        observedResult: "A interface aceitou o valor no limite inferior declarado.",
      }
    : attributes.min !== null
      ? {
          applicability: "exercise" as const,
          value: attributes.min,
          expectedResult: "O mínimo declarado deve ser aceito exatamente.",
          observedResult: "A interface aceitou o mínimo declarado.",
        }
      : ({ applicability: "schema-none" } as const);
  const lower = input.lowerBoundary ?? automaticLower;
  if (lower.applicability === "schema-none") {
    cases["lower-boundary"] = notApplicableCase(
      "schema-defines-no-lower-bound",
      "O schema deste campo não declara limite inferior aplicável.",
      input.schemaReference,
    );
  } else if (lower.applicability === "already-exercised") {
    cases["lower-boundary"] = exercisedCase(lower.proofKind, lower.expectedResult, lower.observedResult);
  } else {
    await exerciseValue(locator, attributes.tag, attributes.type, lower.value);
    if (!(await validity(locator))) throw new Error(`CMS_SEMANTIC_FIELD_LOWER_BOUNDARY_FAILED:${key}`);
    await restoreValue(locator, attributes.tag, attributes.type, attributes.value, attributes.checked);
    cases["lower-boundary"] = exercisedCase("ui-validation", lower.expectedResult, lower.observedResult);
  }

  const automaticUpper = attributes.maxLength
    ? {
        applicability: "exercise" as const,
        value: exactBoundaryValue(attributes.type, Number(attributes.maxLength)),
        expectedResult: "O limite superior declarado deve ser aceito exatamente.",
        observedResult: "A interface aceitou o valor no limite superior declarado.",
      }
    : attributes.max !== null
      ? {
          applicability: "exercise" as const,
          value: attributes.max,
          expectedResult: "O máximo declarado deve ser aceito exatamente.",
          observedResult: "A interface aceitou o máximo declarado.",
        }
      : ({ applicability: "schema-none" } as const);
  const upper = input.upperBoundary ?? automaticUpper;
  if (upper.applicability === "schema-none") {
    cases["upper-boundary"] = notApplicableCase(
      "schema-defines-no-upper-bound",
      "O schema deste campo não declara limite superior aplicável.",
      input.schemaReference,
    );
  } else if (upper.applicability === "already-exercised") {
    cases["upper-boundary"] = exercisedCase(upper.proofKind, upper.expectedResult, upper.observedResult);
  } else {
    await exerciseValue(locator, attributes.tag, attributes.type, upper.value);
    if (!(await validity(locator))) throw new Error(`CMS_SEMANTIC_FIELD_UPPER_BOUNDARY_FAILED:${key}`);
    await restoreValue(locator, attributes.tag, attributes.type, attributes.value, attributes.checked);
    cases["upper-boundary"] = exercisedCase("ui-validation", upper.expectedResult, upper.observedResult);
  }

  if (!(await validity(locator))) throw new Error(`CMS_SEMANTIC_FIELD_RESTORE_FAILED:${key}`);
  return {
    surfaceId: input.surfaceId,
    fieldName: input.fieldName,
    fieldOccurrence: occurrence,
    fieldContractKey: key,
    mode,
    schemaReference: input.schemaReference,
    scenarioId: input.scenarioId,
    cases,
  };
}

function scenarioDisposition(
  prepared: CmsPreparedSemanticField,
  slot: string,
  value: PreparedCase,
  evidenceFile: string,
): CmsSemanticScenarioDisposition {
  if (value.applicability === "not-applicable") return value;
  return {
    ...value,
    scenarioId: prepared.scenarioId,
    evidenceReference: `${evidenceFile}#scenarios/${prepared.scenarioId}/${prepared.fieldContractKey}/${slot}`,
  };
}

function lifecycleDisposition(
  prepared: CmsPreparedSemanticField,
  slot: "persistence" | "backend" | "audit",
  value:
    | PersistenceProof
    | AuditProof
    | { applicability: "exercised"; expectedResult: string; observedResult: string },
  evidenceFile: string,
  httpStatus?: number,
): CmsSemanticScenarioDisposition {
  if (value.applicability === "not-applicable") return value;
  const proofKind =
    slot === "persistence"
      ? "reload-persistence"
      : slot === "backend"
        ? "backend-response"
        : "immutable-audit";
  return {
    applicability: "exercised",
    scenarioId: prepared.scenarioId,
    proofKind,
    evidenceReference: `${evidenceFile}#scenarios/${prepared.scenarioId}/${prepared.fieldContractKey}/${slot}`,
    expectedResult: value.expectedResult,
    observedResult: value.observedResult,
    ...(httpStatus === undefined ? {} : { httpStatus }),
  };
}

export class CmsSemanticScenarioLedger {
  readonly #fields = new Map<string, CmsSemanticFieldEvidence>();
  readonly #structures = new Map<string, CmsSemanticStructureEvidence>();
  readonly #evidenceFile: string;

  constructor(evidenceFile: string) {
    if (!/^[a-z0-9][a-z0-9-]*\.json$/i.test(evidenceFile)) {
      throw new Error("CMS_SEMANTIC_SCENARIO_EVIDENCE_FILE_INVALID");
    }
    this.#evidenceFile = evidenceFile;
  }

  recordField(prepared: CmsPreparedSemanticField, input: FinalizeFieldInput) {
    const backend = lifecycleDisposition(
      prepared,
      "backend",
      {
        applicability: "exercised",
        expectedResult: input.backendExpectedResult,
        observedResult: input.backendObservedResult,
      },
      this.#evidenceFile,
      input.httpStatus,
    );
    const value: CmsSemanticFieldEvidence = {
      schemaVersion: 1,
      surfaceId: prepared.surfaceId,
      fieldName: prepared.fieldName,
      fieldOccurrence: prepared.fieldOccurrence,
      fieldContractKey: prepared.fieldContractKey,
      mode: prepared.mode,
      schemaReference: prepared.schemaReference,
      cases: Object.fromEntries(
        CMS_SEMANTIC_FIELD_CASES.map((caseId) => [
          caseId,
          scenarioDisposition(prepared, caseId, prepared.cases[caseId], this.#evidenceFile),
        ]),
      ) as Record<CmsSemanticFieldCase, CmsSemanticScenarioDisposition>,
      persistence: lifecycleDisposition(prepared, "persistence", input.persistence, this.#evidenceFile),
      backend,
      audit: lifecycleDisposition(prepared, "audit", input.audit, this.#evidenceFile),
      status: "passed",
    };
    const resolved = resolveCmsSemanticFieldEvidence({
      surfaceId: value.surfaceId,
      fieldName: value.fieldName,
      fieldOccurrence: value.fieldOccurrence,
      evidence: [value],
    });
    if (this.#fields.has(resolved.fieldContractKey)) {
      throw new Error(`CMS_SEMANTIC_SCENARIO_FIELD_DUPLICATE:${resolved.fieldContractKey}`);
    }
    this.#fields.set(resolved.fieldContractKey, resolved);
  }

  recordNonEditableField(prepared: CmsPreparedSemanticField) {
    if (prepared.mode === "editable") {
      throw new Error(`CMS_SEMANTIC_SCENARIO_NON_EDITABLE_REQUIRED:${prepared.fieldContractKey}`);
    }
    const classification = notApplicableCase(
      "non-editable-field",
      "O estado runtime impede edição e nenhuma mutação deste campo é permitida.",
      prepared.schemaReference,
    );
    const value: CmsSemanticFieldEvidence = {
      schemaVersion: 1,
      surfaceId: prepared.surfaceId,
      fieldName: prepared.fieldName,
      fieldOccurrence: prepared.fieldOccurrence,
      fieldContractKey: prepared.fieldContractKey,
      mode: prepared.mode,
      schemaReference: prepared.schemaReference,
      cases: prepared.cases as Record<CmsSemanticFieldCase, CmsSemanticScenarioDisposition>,
      persistence: classification,
      backend: classification,
      audit: classification,
      status: "passed",
    };
    const resolved = resolveCmsSemanticFieldEvidence({
      surfaceId: value.surfaceId,
      fieldName: value.fieldName,
      fieldOccurrence: value.fieldOccurrence,
      evidence: [value],
    });
    if (this.#fields.has(resolved.fieldContractKey)) {
      throw new Error(`CMS_SEMANTIC_SCENARIO_FIELD_DUPLICATE:${resolved.fieldContractKey}`);
    }
    this.#fields.set(resolved.fieldContractKey, resolved);
  }

  recordStructure(input: {
    surfaceId: string;
    controlKind: "form" | "dialog";
    controlName: string;
    controlOccurrence?: number;
    scenarioId: string;
    effectKind: CmsSemanticStructureEvidence["effectKind"];
    httpStatus: number | null;
  }) {
    const occurrence = input.controlOccurrence ?? 0;
    const key = cmsSemanticStructureContractKey(
      input.surfaceId,
      input.controlKind,
      input.controlName,
      occurrence,
    );
    const reference = (slot: string) => `${this.#evidenceFile}#scenarios/${input.scenarioId}/${key}/${slot}`;
    const value: CmsSemanticStructureEvidence = {
      schemaVersion: 1,
      surfaceId: input.surfaceId,
      controlKind: input.controlKind,
      controlName: input.controlName,
      controlOccurrence: occurrence,
      structureContractKey: key,
      scenarioId: input.scenarioId,
      openedEvidenceReference: reference("opened"),
      submittedOrConfirmedEvidenceReference: reference("submitted-or-confirmed"),
      effectKind: input.effectKind,
      effectEvidenceReference: reference("effect"),
      httpStatus: input.httpStatus,
      restoredOrClosedEvidenceReference: reference("restored-or-closed"),
      status: "passed",
    };
    const resolved = resolveCmsSemanticStructureEvidence({
      surfaceId: value.surfaceId,
      controlKind: value.controlKind,
      controlName: value.controlName,
      controlOccurrence: value.controlOccurrence,
      evidence: [value],
    });
    if (this.#structures.has(resolved.structureContractKey)) {
      throw new Error(`CMS_SEMANTIC_SCENARIO_STRUCTURE_DUPLICATE:${resolved.structureContractKey}`);
    }
    this.#structures.set(resolved.structureContractKey, resolved);
  }

  fields() {
    return [...this.#fields.values()].sort((left, right) =>
      left.fieldContractKey.localeCompare(right.fieldContractKey),
    );
  }

  structures() {
    return [...this.#structures.values()].sort((left, right) =>
      left.structureContractKey.localeCompare(right.structureContractKey),
    );
  }

  assertNonEmpty() {
    if (!this.#fields.size || !this.#structures.size) {
      throw new Error("CMS_SEMANTIC_SCENARIO_LEDGER_INCOMPLETE");
    }
  }
}
