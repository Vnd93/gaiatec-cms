import { lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertConsumedRealBrowserEvidence } from "../ev2/phase12/real-browser-release-evidence-lib.mjs";

export const CMS_TERMINAL_COVERAGE_SCHEMA_VERSION = 1;
export const CMS_TERMINAL_VIEWPORTS = ["390x844", "768x1024", "1440x900", "1920x1080"];

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const shaPattern = /^[0-9a-f]{40}$/;
const terminalFailurePattern =
  /\b(?:pendente|pending|not[- ]tested|not[- ]run|unsupported|em implementa(?:c|ç)(?:a|ã)o)\b/i;
const evidenceLabels = ["auth", "admin", "secondary", "security"];
const runTagPattern = /^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/;

function evidenceManifestFileNames(environment) {
  return environment === "production"
    ? {
        inventory: "cms-coverage-production.json",
        setup: "cms-browser-production-setup.json",
        cleanup: "cms-browser-production-cleanup.json",
        residue: "g12-production-residue.json",
        runtime: "cms-final-coverage-production.json",
        auth: "cms-auth-lifecycle-production.json",
        admin: "cms-admin-ops-cycles-production.json",
        secondary: "cms-secondary-ui-cycles-production.json",
        security: "cms-security-boundaries-production.json",
        realBrowser: "cms-real-browser-attestation-production.json",
        realBrowserScreenshot: "cms-real-browser-attestation-production.png",
      }
    : {
        inventory: "g12-cms-coverage-matrix.json",
        setup: "cms-browser-mutating-setup.json",
        cleanup: "cms-browser-mutating-cleanup.json",
        residue: "cms-browser-mutating-residue.json",
        runtime: "cms-final-coverage.json",
        auth: "cms-auth-lifecycle.json",
        admin: "cms-admin-ops-cycles.json",
        secondary: "cms-secondary-ui-cycles.json",
        security: "cms-security-boundaries.json",
        realBrowser: "cms-real-browser-attestation.json",
        realBrowserScreenshot: "cms-real-browser-attestation.png",
      };
}

function record(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value;
}

function array(value, message) {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function nonEmptyString(value, message) {
  if (typeof value !== "string" || !value.trim()) throw new Error(message);
  return value;
}

function normalizedSha(value, message = "CMS_TERMINAL_SHA_INVALID") {
  const sha = nonEmptyString(value, message).toLowerCase();
  if (!shaPattern.test(sha)) throw new Error(message);
  return sha;
}

function normalizedRunTag(value, candidateSha, message = "CMS_TERMINAL_RUN_TAG_INVALID") {
  const runTag = nonEmptyString(value, message);
  if (!runTagPattern.test(runTag) || !runTag.endsWith(`-${candidateSha.slice(0, 8)}`)) {
    throw new Error(message);
  }
  return runTag;
}

function safeEvidenceReference(label, path) {
  const normalized = `${label}#${path.join(".")}`.replace(/[^a-zA-Z0-9_./#:[\]-]/g, "-").slice(0, 240);
  return normalized || `${label}#root`;
}

function reportSha(report) {
  return report.candidateSha ?? report.sourceSha ?? report.frontendSha ?? null;
}

function stableSegment(value) {
  return (
    String(value)
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "unnamed"
  );
}

function semanticActionContractKey(surfaceId, controlName, occurrence) {
  return `${stableSegment(surfaceId)}|${stableSegment(controlName)}|${occurrence}`;
}

function semanticFieldContractKey(surfaceId, fieldName, occurrence) {
  return `field|${semanticActionContractKey(surfaceId, fieldName, occurrence)}`;
}

function semanticStructureContractKey(surfaceId, controlKind, controlName, occurrence) {
  return `${controlKind}|${semanticActionContractKey(surfaceId, controlName, occurrence)}`;
}

function semanticStateContractKey(surfaceId, stateId) {
  return `state|${stableSegment(surfaceId)}|${stableSegment(stateId)}`;
}

function publicConsumerContractKey(surfaceId, consumer, occurrence) {
  return `public|${semanticActionContractKey(surfaceId, consumer, occurrence)}`;
}

const fieldCases = ["valid", "absent", "invalid", "lower-boundary", "upper-boundary"];
const notApplicableBasis = {
  valid: ["non-editable-field"],
  absent: ["non-editable-field", "field-optional-by-schema"],
  invalid: ["non-editable-field", "schema-defines-no-invalid-representation"],
  "lower-boundary": ["non-editable-field", "schema-defines-no-lower-bound"],
  "upper-boundary": ["non-editable-field", "schema-defines-no-upper-bound"],
  persistence: [
    "non-editable-field",
    "security-prohibits-secret-persistence",
    "transient-query-field",
    "transient-command-field",
  ],
  backend: ["non-editable-field"],
  audit: ["non-editable-field", "security-sensitive-value-not-audited", "non-mutating-query-not-audited"],
};

function scenarioReference(value) {
  return (
    typeof value === "string" &&
    value.trim() &&
    !value.startsWith("dom:") &&
    !/focus|observation/i.test(value)
  );
}

function safeSemanticStateName(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 160 &&
    !/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(value) &&
    !/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(value) &&
    !/\b(?:eyJ[A-Za-z0-9_-]+\.|sbp_|sb_secret_|sk-or-)[A-Za-z0-9._-]{12,}/i.test(value)
  );
}

function assertScenarioDisposition(value, label, proofKinds, basisCodes, contractKey) {
  const disposition = record(value, `CMS_TERMINAL_${label}_INVALID`);
  if (disposition.applicability === "exercised") {
    if (
      !proofKinds.includes(disposition.proofKind) ||
      !nonEmptyString(disposition.scenarioId, `CMS_TERMINAL_${label}_SCENARIO_MISSING`) ||
      !scenarioReference(disposition.evidenceReference) ||
      !disposition.evidenceReference.includes(contractKey) ||
      !nonEmptyString(disposition.expectedResult, `CMS_TERMINAL_${label}_EXPECTED_MISSING`) ||
      !nonEmptyString(disposition.observedResult, `CMS_TERMINAL_${label}_OBSERVED_MISSING`) ||
      (disposition.proofKind === "backend-response" &&
        (!Number.isInteger(disposition.httpStatus) ||
          disposition.httpStatus < 200 ||
          disposition.httpStatus >= 300))
    ) {
      throw new Error(`CMS_TERMINAL_${label}_EXERCISED_INVALID`);
    }
    return disposition;
  }
  if (
    disposition.applicability !== "not-applicable" ||
    !basisCodes.includes(disposition.basisCode) ||
    !nonEmptyString(disposition.justification, `CMS_TERMINAL_${label}_JUSTIFICATION_MISSING`) ||
    disposition.justification.trim().length < 16 ||
    !/^(?:src|docs|supabase)\//.test(
      nonEmptyString(disposition.documentationReference, `CMS_TERMINAL_${label}_DOCUMENTATION_MISSING`),
    )
  ) {
    throw new Error(`CMS_TERMINAL_${label}_NOT_APPLICABLE_INVALID`);
  }
  return disposition;
}

function assertBoundReport(label, value, candidateSha, environment, runTag) {
  const report = record(value, `CMS_TERMINAL_${label.toUpperCase()}_REPORT_INVALID`);
  if (normalizedSha(reportSha(report), `CMS_TERMINAL_${label.toUpperCase()}_SHA_INVALID`) !== candidateSha) {
    throw new Error(`CMS_TERMINAL_${label.toUpperCase()}_SHA_MISMATCH`);
  }
  if (report.environment !== environment) {
    throw new Error(`CMS_TERMINAL_${label.toUpperCase()}_ENVIRONMENT_MISMATCH`);
  }
  if (report.runTag !== runTag) throw new Error(`CMS_TERMINAL_${label.toUpperCase()}_RUN_TAG_MISMATCH`);
  if (report.status !== "passed") throw new Error(`CMS_TERMINAL_${label.toUpperCase()}_NOT_PASSED`);
  if (report.credentialsPersisted === true || report.noSecretsPersisted === false) {
    throw new Error(`CMS_TERMINAL_${label.toUpperCase()}_SENSITIVE_EVIDENCE_REFUSED`);
  }
  return report;
}

function assertSetupReport(value, candidateSha, environment, runTag) {
  const report = record(value, "CMS_TERMINAL_SETUP_REPORT_INVALID");
  if (
    report.status !== "ready" ||
    normalizedSha(report.candidateSha, "CMS_TERMINAL_SETUP_SHA_INVALID") !== candidateSha ||
    report.environment !== environment ||
    report.runTag !== runTag ||
    report.fixtureProvisioning !== "actors-and-prerequisites-only" ||
    report.editorialEntitiesCreatedByFixture !== 0 ||
    report.formsCreatedByFixture !== 0 ||
    report.leadsCreatedByFixture !== 0 ||
    report.credentialsInStateOrReport !== false
  ) {
    throw new Error("CMS_TERMINAL_SETUP_BINDING_INVALID");
  }
  return report;
}

function assertTerminalTombstone(value, label) {
  const tombstone = record(value, `CMS_TERMINAL_${label}_TOMBSTONE_MISSING`);
  if (
    tombstone.classification !== "terminalArchivedTombstone" ||
    tombstone.count !== 1 ||
    tombstone.statusCode !== 410 ||
    tombstone.destinationAbsent !== true ||
    tombstone.itemArchived !== true ||
    tombstone.publicationCount !== 0 ||
    tombstone.projectionCount !== 0 ||
    tombstone.actionableOutboxCount !== 0 ||
    tombstone.piiExposed !== false ||
    "itemId" in tombstone ||
    "path" in tombstone
  ) {
    throw new Error(`CMS_TERMINAL_${label}_TOMBSTONE_INVALID`);
  }
  return tombstone;
}

function assertCleanupReport(value, candidateSha, environment, runTag) {
  const cleanup = record(value, "CMS_TERMINAL_CLEANUP_REPORT_INVALID");
  if (
    cleanup.schemaVersion !== 1 ||
    cleanup.status !== "cleaned" ||
    normalizedSha(cleanup.candidateSha, "CMS_TERMINAL_CLEANUP_SHA_INVALID") !== candidateSha ||
    cleanup.environment !== environment ||
    cleanup.runTag !== runTag ||
    cleanup.activeResidue !== 0 ||
    cleanup.auditRetained !== true ||
    cleanup.activePublications !== 0 ||
    cleanup.publishedProjections !== 0 ||
    cleanup.actionablePublicationOutbox !== 0 ||
    cleanup.actionableLeadOutbox !== 0 ||
    cleanup.activeCredentials !== 0 ||
    cleanup.activeSessions !== 0
  ) {
    throw new Error("CMS_TERMINAL_CLEANUP_BINDING_INVALID");
  }
  assertTerminalTombstone(cleanup.terminalArchivedTombstone, "CLEANUP");
  return cleanup;
}

function assertResidueReport(value, candidateSha, environment, runTag) {
  const residue = record(value, "CMS_TERMINAL_RESIDUE_REPORT_INVALID");
  if (
    residue.schemaVersion !== 1 ||
    residue.status !== "passed" ||
    normalizedSha(residue.candidateSha, "CMS_TERMINAL_RESIDUE_SHA_INVALID") !== candidateSha ||
    residue.environment !== environment ||
    residue.runTag !== runTag ||
    residue.activeResidue !== 0 ||
    residue.activeLeases !== 0 ||
    residue.activeSessions !== 0 ||
    residue.auditRetained !== true
  ) {
    throw new Error("CMS_TERMINAL_RESIDUE_BINDING_INVALID");
  }
  assertTerminalTombstone(residue.terminalArchivedTombstone, "RESIDUE");
  return residue;
}

function assertRealBrowserSummary(value, candidateSha, environment, runTag) {
  const summary = record(value, "CMS_TERMINAL_REAL_BROWSER_SUMMARY_INVALID");
  if (
    summary.status !== "passed" ||
    summary.environment !== environment ||
    summary.candidateSha !== candidateSha ||
    summary.runTag !== runTag ||
    summary.channel !== "iab-workflow-dispatch-hmac" ||
    summary.canonicalFrontendReleaseBound !== true ||
    summary.backendAccepted !== true ||
    summary.successLocator !== '[data-form-submission-status="success"]' ||
    summary.successLocatorObserved !== true ||
    summary.officialWidgetObserved !== true ||
    summary.cDataBound !== true ||
    summary.tokenCaptured !== false ||
    summary.variableCleared !== true ||
    !/^[a-f0-9]{64}$/.test(String(summary.screenshotSha256 ?? "")) ||
    !Number.isSafeInteger(summary.screenshotBytes) ||
    summary.screenshotBytes < 45 ||
    summary.screenshotBytes > 30 * 1024
  ) {
    throw new Error("CMS_TERMINAL_REAL_BROWSER_SUMMARY_INVALID");
  }
  return summary;
}

function assertSiteBaseline(value) {
  const baseline = record(value, "CMS_TERMINAL_SITE_BASELINE_MISSING");
  const states = [baseline.navigation, baseline.siteSettings];
  if (
    !states.every((state) => ["created-via-ui", "preexisting-published"].includes(state)) ||
    !["draft-submit-approve-publish", "reuse-published-baseline", "mixed-create-and-reuse"].includes(
      baseline.workflow,
    ) ||
    (states.every((state) => state === "created-via-ui") &&
      baseline.workflow !== "draft-submit-approve-publish") ||
    (states.every((state) => state === "preexisting-published") &&
      baseline.workflow !== "reuse-published-baseline") ||
    (new Set(states).size === 2 && baseline.workflow !== "mixed-create-and-reuse") ||
    baseline.aal2 !== true ||
    baseline.audit !== true ||
    baseline.public !== true ||
    baseline.ownerAuthored !== true ||
    baseline.baselineOwner !== "corporate" ||
    baseline.actorOutsideQaLease !== true ||
    baseline.qaLeaseActorUsed !== false ||
    baseline.mutationTransport !== "cms-ui-only" ||
    baseline.canonicalRepositoryDataVerified !== true ||
    baseline.navigationTerminalState !== "published-after-restore" ||
    baseline.siteSettingsTerminalState !== "published-after-restore" ||
    baseline.publicShellVerifiedAfterRestore !== true ||
    baseline.idsPersisted !== false
  ) {
    throw new Error("CMS_TERMINAL_SITE_BASELINE_INVALID");
  }
  return baseline;
}

function collectSemanticActionLedger(runtime, boundReports) {
  const ledger = new Map();
  const reports = [
    ["cms-final-coverage.json", runtime],
    ["cms-auth-lifecycle.json", boundReports.auth],
    ["cms-admin-ops-cycles.json", boundReports.admin],
    ["cms-secondary-ui-cycles.json", boundReports.secondary],
    ["cms-security-boundaries.json", boundReports.security],
  ];
  for (const [label, report] of reports) {
    const entries = report.semanticActions ?? [];
    if (!Array.isArray(entries)) throw new Error(`CMS_TERMINAL_SEMANTIC_ACTIONS_INVALID:${label}`);
    for (const entryValue of entries) {
      const entry = record(entryValue, `CMS_TERMINAL_SEMANTIC_ACTION_INVALID:${label}`);
      const surfaceId = nonEmptyString(entry.surfaceId, "CMS_TERMINAL_SEMANTIC_ACTION_SURFACE_MISSING");
      const controlName = nonEmptyString(entry.controlName, "CMS_TERMINAL_SEMANTIC_ACTION_NAME_MISSING");
      if (!Number.isInteger(entry.controlOccurrence) || entry.controlOccurrence < 0) {
        throw new Error("CMS_TERMINAL_SEMANTIC_ACTION_OCCURRENCE_INVALID");
      }
      const expectedKey = semanticActionContractKey(surfaceId, controlName, entry.controlOccurrence);
      if (
        entry.schemaVersion !== 1 ||
        entry.controlContractKey !== expectedKey ||
        entry.handlerExecuted !== true ||
        entry.evidenceKind !== "backend-response" ||
        entry.status !== "passed" ||
        !Number.isInteger(entry.httpStatus) ||
        entry.httpStatus < 200 ||
        entry.httpStatus >= 300 ||
        !nonEmptyString(entry.backendStatus, "CMS_TERMINAL_SEMANTIC_ACTION_BACKEND_STATUS_MISSING") ||
        !Array.isArray(entry.actions) ||
        !entry.actions.length ||
        !entry.actions.every((action) => typeof action === "string" && action.trim()) ||
        !Array.isArray(entry.scenarioIds) ||
        !entry.scenarioIds.length ||
        !entry.scenarioIds.every((scenario) => typeof scenario === "string" && scenario.trim())
      ) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_ACTION_INVALID:${expectedKey}`);
      }
      if (ledger.has(expectedKey)) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_ACTION_DUPLICATE:${expectedKey}`);
      }
      ledger.set(expectedKey, {
        ...entry,
        evidenceReference: `${label}#semanticActions/${expectedKey}`,
      });
    }
  }
  return ledger;
}

function evidenceReports(runtime, boundReports) {
  return [
    ["cms-final-coverage.json", runtime],
    ["cms-auth-lifecycle.json", boundReports.auth],
    ["cms-admin-ops-cycles.json", boundReports.admin],
    ["cms-secondary-ui-cycles.json", boundReports.secondary],
    ["cms-security-boundaries.json", boundReports.security],
  ];
}

function collectSemanticStateSetupLedger(runtime, boundReports) {
  const ledger = new Map();
  const allowedScopes = ["page", "run-tag-row", "managed-user-row", "created-lead-row", "run-tag-article"];
  const allowedStepOperations = {
    button: ["activate"],
    tab: ["activate"],
    checkbox: ["check", "uncheck"],
    field: ["fill-run-tag", "select-first-nonempty", "select-option"],
    summary: ["activate"],
  };
  for (const [label, report] of evidenceReports(runtime, boundReports)) {
    const entries = report.semanticStateSetups ?? [];
    if (!Array.isArray(entries)) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_SETUPS_INVALID:${label}`);
    }
    for (const entryValue of entries) {
      const entry = record(entryValue, `CMS_TERMINAL_SEMANTIC_STATE_SETUP_INVALID:${label}`);
      const surfaceId = nonEmptyString(entry.surfaceId, "CMS_TERMINAL_SEMANTIC_STATE_SURFACE_MISSING");
      const stateId = nonEmptyString(entry.stateId, "CMS_TERMINAL_SEMANTIC_STATE_ID_MISSING");
      const expectedKey = semanticStateContractKey(surfaceId, stateId);
      const steps = array(entry.steps, `CMS_TERMINAL_SEMANTIC_STATE_STEPS_MISSING:${expectedKey}`);
      const expectedState = record(
        entry.expectedState,
        `CMS_TERMINAL_SEMANTIC_EXPECTED_STATE_MISSING:${expectedKey}`,
      );
      const restore = record(entry.restore, `CMS_TERMINAL_SEMANTIC_STATE_RESTORE_MISSING:${expectedKey}`);
      const stepIds = new Set();
      for (const stepValue of steps) {
        const step = record(stepValue, `CMS_TERMINAL_SEMANTIC_STATE_STEP_INVALID:${expectedKey}`);
        const stepId = nonEmptyString(
          step.stepId,
          `CMS_TERMINAL_SEMANTIC_STATE_STEP_ID_MISSING:${expectedKey}`,
        );
        const operations = allowedStepOperations[step.controlKind];
        if (
          !/^[a-z0-9][a-z0-9-]{2,79}$/.test(stepId) ||
          stepIds.has(stepId) ||
          !allowedScopes.includes(step.scope) ||
          !operations?.includes(step.operation) ||
          !safeSemanticStateName(step.accessibleName) ||
          !Number.isInteger(step.controlOccurrence) ||
          step.controlOccurrence < 0 ||
          (step.scope === "created-lead-row" && step.controlKind !== "button") ||
          (step.operation === "fill-run-tag" && step.scope !== "page") ||
          (step.operation === "select-option"
            ? typeof step.optionValue !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/.test(step.optionValue)
            : step.optionValue !== undefined)
        ) {
          throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_STEP_INVALID:${expectedKey}:${stepId}`);
        }
        stepIds.add(stepId);
      }
      const expectedStateValid =
        safeSemanticStateName(expectedState.accessibleName) &&
        Number.isInteger(expectedState.occurrence) &&
        expectedState.occurrence >= 0 &&
        (expectedState.kind === "open-details" ||
          expectedState.kind === "field" ||
          (expectedState.kind === "role" &&
            ["dialog", "alertdialog", "region", "form", "tabpanel", "group", "heading"].includes(
              expectedState.role,
            )));
      const restoreValid = ["escape", "reload-route"].includes(restore.operation)
        ? restore.controlKind === null &&
          restore.accessibleName === null &&
          restore.controlOccurrence === null
        : restore.operation === "activate" &&
          ["button", "summary"].includes(restore.controlKind) &&
          safeSemanticStateName(restore.accessibleName) &&
          Number.isInteger(restore.controlOccurrence) &&
          restore.controlOccurrence >= 0;
      if (
        entry.schemaVersion !== 1 ||
        !/^[a-z0-9][a-z0-9-]{2,79}$/.test(stateId) ||
        entry.stateContractKey !== expectedKey ||
        !nonEmptyString(entry.scenarioId, "CMS_TERMINAL_SEMANTIC_STATE_SCENARIO_MISSING") ||
        !steps.length ||
        !expectedStateValid ||
        !restoreValid ||
        entry.mutationFree !== true ||
        entry.observedMutationRequests !== 0 ||
        entry.triggerObserved !== true ||
        entry.stateObserved !== true ||
        entry.restored !== true ||
        entry.status !== "passed" ||
        entry.evidenceReference !== `${label}#semanticStateSetups/${expectedKey}`
      ) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_SETUP_INVALID:${expectedKey}`);
      }
      if (ledger.has(expectedKey)) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_SETUP_DUPLICATE:${expectedKey}`);
      }
      ledger.set(expectedKey, { ...entry, evidenceFile: label });
    }
  }
  return ledger;
}

function collectSemanticScenarioLedgers(runtime, boundReports) {
  const fields = new Map();
  const structures = new Map();
  for (const [label, report] of evidenceReports(runtime, boundReports)) {
    const fieldEntries = report.semanticFields ?? [];
    if (!Array.isArray(fieldEntries)) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_FIELDS_INVALID:${label}`);
    }
    if (
      ["cms-admin-ops-cycles.json", "cms-secondary-ui-cycles.json"].includes(label) &&
      fieldEntries.length === 0
    ) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_FIELDS_EMPTY:${label}`);
    }
    for (const entryValue of fieldEntries) {
      const entry = record(entryValue, `CMS_TERMINAL_SEMANTIC_FIELD_INVALID:${label}`);
      const surfaceId = nonEmptyString(entry.surfaceId, "CMS_TERMINAL_SEMANTIC_FIELD_SURFACE_MISSING");
      const fieldName = nonEmptyString(entry.fieldName, "CMS_TERMINAL_SEMANTIC_FIELD_NAME_MISSING");
      if (!Number.isInteger(entry.fieldOccurrence) || entry.fieldOccurrence < 0) {
        throw new Error("CMS_TERMINAL_SEMANTIC_FIELD_OCCURRENCE_INVALID");
      }
      const expectedKey = semanticFieldContractKey(surfaceId, fieldName, entry.fieldOccurrence);
      if (
        entry.schemaVersion !== 1 ||
        entry.fieldContractKey !== expectedKey ||
        entry.status !== "passed" ||
        !["editable", "read-only", "disabled"].includes(entry.mode) ||
        !/^(?:src|docs|supabase)\//.test(
          nonEmptyString(entry.schemaReference, "CMS_TERMINAL_SEMANTIC_FIELD_SCHEMA_MISSING"),
        )
      ) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_FIELD_INVALID:${expectedKey}`);
      }
      const cases = record(entry.cases, `CMS_TERMINAL_SEMANTIC_FIELD_CASES_MISSING:${expectedKey}`);
      if (JSON.stringify(Object.keys(cases).sort()) !== JSON.stringify([...fieldCases].sort())) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_FIELD_CASES_INVALID:${expectedKey}`);
      }
      for (const caseId of fieldCases) {
        assertScenarioDisposition(
          cases[caseId],
          `SEMANTIC_FIELD_${stableSegment(caseId).toUpperCase()}`,
          ["ui-validation", "backend-validation"],
          entry.mode === "editable" ? notApplicableBasis[caseId] : ["non-editable-field"],
          expectedKey,
        );
      }
      assertScenarioDisposition(
        entry.persistence,
        "SEMANTIC_FIELD_PERSISTENCE",
        ["reload-persistence"],
        entry.mode === "editable" ? notApplicableBasis.persistence : ["non-editable-field"],
        expectedKey,
      );
      assertScenarioDisposition(
        entry.backend,
        "SEMANTIC_FIELD_BACKEND",
        ["backend-response"],
        entry.mode === "editable" ? [] : ["non-editable-field"],
        expectedKey,
      );
      assertScenarioDisposition(
        entry.audit,
        "SEMANTIC_FIELD_AUDIT",
        ["immutable-audit"],
        entry.mode === "editable" ? notApplicableBasis.audit.slice(1) : ["non-editable-field"],
        expectedKey,
      );
      const exercisedReferences = [
        ...fieldCases.map((caseId) => cases[caseId]),
        entry.persistence,
        entry.backend,
        entry.audit,
      ]
        .filter((disposition) => disposition.applicability === "exercised")
        .map((disposition) => disposition.evidenceReference);
      if (new Set(exercisedReferences).size !== exercisedReferences.length) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_FIELD_REFERENCE_REUSED:${expectedKey}`);
      }
      if (fields.has(expectedKey)) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_FIELD_DUPLICATE:${expectedKey}`);
      }
      fields.set(expectedKey, {
        ...entry,
        evidenceReference: `${label}#semanticFields/${expectedKey}`,
      });
    }

    const structureEntries = report.semanticStructures ?? [];
    if (!Array.isArray(structureEntries)) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_STRUCTURES_INVALID:${label}`);
    }
    if (label === "cms-secondary-ui-cycles.json" && structureEntries.length === 0) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_STRUCTURES_EMPTY:${label}`);
    }
    for (const entryValue of structureEntries) {
      const entry = record(entryValue, `CMS_TERMINAL_SEMANTIC_STRUCTURE_INVALID:${label}`);
      const surfaceId = nonEmptyString(entry.surfaceId, "CMS_TERMINAL_SEMANTIC_STRUCTURE_SURFACE_MISSING");
      const controlName = nonEmptyString(entry.controlName, "CMS_TERMINAL_SEMANTIC_STRUCTURE_NAME_MISSING");
      if (
        !["form", "dialog"].includes(entry.controlKind) ||
        !Number.isInteger(entry.controlOccurrence) ||
        entry.controlOccurrence < 0
      ) {
        throw new Error("CMS_TERMINAL_SEMANTIC_STRUCTURE_TARGET_INVALID");
      }
      const expectedKey = semanticStructureContractKey(
        surfaceId,
        entry.controlKind,
        controlName,
        entry.controlOccurrence,
      );
      const structureReferences = [
        entry.openedEvidenceReference,
        entry.submittedOrConfirmedEvidenceReference,
        entry.effectEvidenceReference,
        entry.restoredOrClosedEvidenceReference,
      ];
      if (
        entry.schemaVersion !== 1 ||
        entry.structureContractKey !== expectedKey ||
        entry.status !== "passed" ||
        !nonEmptyString(entry.scenarioId, "CMS_TERMINAL_SEMANTIC_STRUCTURE_SCENARIO_MISSING") ||
        !scenarioReference(entry.openedEvidenceReference) ||
        !scenarioReference(entry.submittedOrConfirmedEvidenceReference) ||
        !["backend-response", "navigation-response", "state-transition"].includes(entry.effectKind) ||
        !scenarioReference(entry.effectEvidenceReference) ||
        (entry.effectKind !== "state-transition" &&
          (!Number.isInteger(entry.httpStatus) || entry.httpStatus < 200 || entry.httpStatus >= 400)) ||
        !scenarioReference(entry.restoredOrClosedEvidenceReference) ||
        !structureReferences.every((reference) => reference.includes(expectedKey)) ||
        new Set(structureReferences).size !== structureReferences.length
      ) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_STRUCTURE_INVALID:${expectedKey}`);
      }
      if (structures.has(expectedKey)) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_STRUCTURE_DUPLICATE:${expectedKey}`);
      }
      structures.set(expectedKey, {
        ...entry,
        evidenceReference: `${label}#semanticStructures/${expectedKey}`,
      });
    }
  }
  return { fields, structures };
}

function collectPublicConsumerLedger(runtime, boundReports, candidateSha) {
  const ledger = new Map();
  for (const [label, report] of evidenceReports(runtime, boundReports)) {
    const entries = report.publicConsumerEvidence ?? [];
    if (!Array.isArray(entries)) {
      throw new Error(`CMS_TERMINAL_PUBLIC_CONSUMERS_INVALID:${label}`);
    }
    for (const entryValue of entries) {
      const entry = record(entryValue, `CMS_TERMINAL_PUBLIC_CONSUMER_INVALID:${label}`);
      const surfaceId = nonEmptyString(entry.surfaceId, "CMS_TERMINAL_PUBLIC_CONSUMER_SURFACE_MISSING");
      const consumer = nonEmptyString(entry.consumer, "CMS_TERMINAL_PUBLIC_CONSUMER_NAME_MISSING");
      if (!Number.isInteger(entry.consumerOccurrence) || entry.consumerOccurrence < 0) {
        throw new Error("CMS_TERMINAL_PUBLIC_CONSUMER_OCCURRENCE_INVALID");
      }
      const expectedKey = publicConsumerContractKey(surfaceId, consumer, entry.consumerOccurrence);
      const httpValid =
        entry.consumerKind === "http" &&
        Number.isInteger(entry.expectedStatus) &&
        Number.isInteger(entry.observedStatus) &&
        entry.expectedStatus === entry.observedStatus &&
        [200, 201, 204, 301, 404, 410].includes(entry.observedStatus) &&
        normalizedSha(entry.candidateSha, "CMS_TERMINAL_PUBLIC_CONSUMER_SHA_INVALID") === candidateSha;
      const contractValid =
        entry.consumerKind === "downstream-contract" &&
        entry.expectedStatus === null &&
        entry.observedStatus === null &&
        entry.contractResult === "passed";
      if (
        entry.schemaVersion !== 1 ||
        entry.consumerContractKey !== expectedKey ||
        entry.status !== "passed" ||
        !nonEmptyString(entry.scenarioId, "CMS_TERMINAL_PUBLIC_CONSUMER_SCENARIO_MISSING") ||
        !scenarioReference(entry.evidenceReference) ||
        !entry.evidenceReference.includes(expectedKey) ||
        entry.noInternalOrUnpublishedContent !== true ||
        !["validated", "not-applicable"].includes(entry.cacheInvalidation) ||
        (entry.cacheInvalidation === "not-applicable" &&
          (!nonEmptyString(
            entry.cacheJustification,
            "CMS_TERMINAL_PUBLIC_CONSUMER_CACHE_JUSTIFICATION_MISSING",
          ) ||
            entry.cacheJustification.trim().length < 16)) ||
        (!httpValid && !contractValid)
      ) {
        throw new Error(`CMS_TERMINAL_PUBLIC_CONSUMER_INVALID:${expectedKey}`);
      }
      if (ledger.has(expectedKey)) {
        throw new Error(`CMS_TERMINAL_PUBLIC_CONSUMER_DUPLICATE:${expectedKey}`);
      }
      ledger.set(expectedKey, {
        ...entry,
        evidenceReference: `${label}#publicConsumerEvidence/${expectedKey}`,
      });
    }
  }
  return ledger;
}

function collectSurfaceViewportProofs(value, label, path = [], result = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectSurfaceViewportProofs(item, label, [...path, String(index)], result),
    );
    return result;
  }
  if (!value || typeof value !== "object") return result;
  const item = value;
  const viewport = (() => {
    if (typeof item.viewport === "string") return item.viewport;
    if (!item.viewport || typeof item.viewport !== "object" || Array.isArray(item.viewport)) return null;
    const candidate = item.viewport;
    if (typeof candidate.name !== "string") return null;
    const [expectedWidth, expectedHeight] = candidate.name.split("x").map(Number);
    if (candidate.width !== expectedWidth || candidate.height !== expectedHeight) return null;
    return candidate.name;
  })();
  if (
    typeof item.surfaceId === "string" &&
    viewport &&
    CMS_TERMINAL_VIEWPORTS.includes(viewport) &&
    !("controlId" in item) &&
    !("sourceControlId" in item)
  ) {
    result.push({
      label,
      path,
      surfaceId: item.surfaceId,
      viewport,
      value: item,
    });
  }
  for (const [key, nested] of Object.entries(item)) {
    collectSurfaceViewportProofs(nested, label, [...path, key], result);
  }
  return result;
}

function passedState(value) {
  return value.status === "passed" || value.result === "passed";
}

function semanticExecutionsFrom(proof) {
  const interaction =
    proof.controlInteraction && typeof proof.controlInteraction === "object"
      ? proof.controlInteraction
      : proof.controlEvidence && typeof proof.controlEvidence === "object"
        ? proof.controlEvidence
        : proof;
  const executions = interaction.semanticExecutions ?? interaction.executions;
  return Array.isArray(executions) ? executions : [];
}

function sourceControlExecutionsFrom(
  proof,
  surfaceId,
  viewport,
  semanticActionLedger,
  semanticScenarioLedgers,
  semanticReferenceOwners,
) {
  const contract = record(
    proof.sourceControlContract,
    `CMS_TERMINAL_SOURCE_CONTRACT_MISSING:${surfaceId}:${viewport}`,
  );
  if (contract.status !== "passed" || !Array.isArray(contract.failures) || contract.failures.length) {
    throw new Error(`CMS_TERMINAL_SOURCE_CONTRACT_FAILED:${surfaceId}:${viewport}`);
  }
  const mappings = array(contract.mappings, `CMS_TERMINAL_SOURCE_MAPPINGS_MISSING:${surfaceId}:${viewport}`);
  const notApplicable = array(
    contract.notApplicable,
    `CMS_TERMINAL_SOURCE_NOT_APPLICABLE_MISSING:${surfaceId}:${viewport}`,
  );
  const proofExecutions = semanticExecutionsFrom(proof);
  const sourceIds = new Set();
  const runtimeIds = new Set();
  for (const mappingValue of mappings) {
    const mapping = record(mappingValue, "CMS_TERMINAL_SOURCE_MAPPING_INVALID");
    if (
      mapping.schemaVersion !== 1 ||
      mapping.surfaceId !== surfaceId ||
      mapping.viewport !== viewport ||
      mapping.status !== "passed" ||
      mapping.handlerExecuted !== true ||
      !nonEmptyString(mapping.sourceControlId, "CMS_TERMINAL_SOURCE_MAPPING_ID_MISSING") ||
      !nonEmptyString(mapping.runtimeControlId, "CMS_TERMINAL_RUNTIME_MAPPING_ID_MISSING") ||
      !nonEmptyString(mapping.runtimeHandlerId, "CMS_TERMINAL_RUNTIME_MAPPING_HANDLER_MISSING") ||
      !nonEmptyString(mapping.runtimeControlName, "CMS_TERMINAL_RUNTIME_MAPPING_NAME_MISSING") ||
      !Number.isInteger(mapping.runtimeControlOccurrence) ||
      mapping.runtimeControlOccurrence < 0 ||
      !nonEmptyString(mapping.evidenceReference, "CMS_TERMINAL_SOURCE_MAPPING_EVIDENCE_MISSING") ||
      ["focus-only", "observation-only"].includes(mapping.evidenceKind)
    ) {
      throw new Error(`CMS_TERMINAL_SOURCE_MAPPING_NON_SEMANTIC:${surfaceId}:${viewport}`);
    }
    if (sourceIds.has(mapping.sourceControlId)) {
      throw new Error(`CMS_TERMINAL_SOURCE_MAPPING_DUPLICATE:${mapping.sourceControlId}:${viewport}`);
    }
    if (runtimeIds.has(mapping.runtimeControlId)) {
      throw new Error(`CMS_TERMINAL_RUNTIME_MAPPING_REUSED:${mapping.runtimeControlId}:${viewport}`);
    }
    const runtimeMatches = proofExecutions.filter(
      (execution) => execution.controlId === mapping.runtimeControlId,
    );
    const runtimeOccurrence =
      runtimeMatches.length === 1
        ? proofExecutions
            .filter(
              (execution) =>
                execution.kind === runtimeMatches[0].kind && execution.name === runtimeMatches[0].name,
            )
            .sort(
              (left, right) => left.ordinal - right.ordinal || left.controlId.localeCompare(right.controlId),
            )
            .findIndex((execution) => execution.controlId === mapping.runtimeControlId)
        : -1;
    if (
      runtimeMatches.length !== 1 ||
      runtimeMatches[0].classification !== mapping.runtimeClassification ||
      runtimeMatches[0].handlerId !== mapping.runtimeHandlerId ||
      runtimeMatches[0].name !== mapping.runtimeControlName ||
      runtimeOccurrence !== mapping.runtimeControlOccurrence ||
      runtimeMatches[0].executionScope !== mapping.executionScope ||
      runtimeMatches[0].semanticExecutionRef !== mapping.semanticExecutionRef ||
      runtimeMatches[0].evidenceKind !== mapping.evidenceKind ||
      runtimeMatches[0].evidenceReference !== mapping.evidenceReference
    ) {
      throw new Error(`CMS_TERMINAL_SOURCE_RUNTIME_BINDING_INVALID:${mapping.sourceControlId}:${viewport}`);
    }
    sourceIds.add(mapping.sourceControlId);
    runtimeIds.add(mapping.runtimeControlId);
    if (mapping.executionScope === "scenario-once") {
      const reference = nonEmptyString(
        mapping.semanticExecutionRef,
        `CMS_TERMINAL_SEMANTIC_REFERENCE_MISSING:${mapping.sourceControlId}:${viewport}`,
      );
      const action = semanticActionLedger.get(reference);
      const field = semanticScenarioLedgers.fields.get(reference);
      const structure = semanticScenarioLedgers.structures.get(reference);
      const actionValid =
        mapping.sourceClassification === "action" &&
        mapping.runtimeClassification === "action.mutating" &&
        mapping.evidenceKind === "backend-response" &&
        action &&
        action.surfaceId === surfaceId &&
        action.controlName.normalize("NFKC") === mapping.runtimeControlName.normalize("NFKC") &&
        action.controlOccurrence === mapping.runtimeControlOccurrence &&
        mapping.evidenceReference.endsWith(`#semanticActions/${reference}`);
      const fieldValid =
        mapping.sourceClassification === "field" &&
        mapping.runtimeClassification.startsWith("field.") &&
        mapping.evidenceKind === "scenario-contract" &&
        field &&
        field.surfaceId === surfaceId &&
        field.fieldName.normalize("NFKC") === mapping.runtimeControlName.normalize("NFKC") &&
        field.fieldOccurrence === mapping.runtimeControlOccurrence &&
        ((field.mode === "editable" && mapping.runtimeClassification === "field.editable") ||
          (field.mode === "read-only" && mapping.runtimeClassification === "field.read-only") ||
          (field.mode === "disabled" && mapping.runtimeClassification === "field.disabled")) &&
        mapping.evidenceReference.endsWith(`#semanticFields/${reference}`);
      const structureValid =
        ["form", "dialog"].includes(mapping.sourceClassification) &&
        mapping.runtimeClassification === `structure.${mapping.sourceClassification}` &&
        mapping.evidenceKind === "scenario-contract" &&
        structure &&
        structure.surfaceId === surfaceId &&
        structure.controlKind === mapping.sourceClassification &&
        structure.controlName.normalize("NFKC") === mapping.runtimeControlName.normalize("NFKC") &&
        structure.controlOccurrence === mapping.runtimeControlOccurrence &&
        mapping.evidenceReference.endsWith(`#semanticStructures/${reference}`);
      if ([actionValid, fieldValid, structureValid].filter(Boolean).length !== 1) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_INVALID:${mapping.sourceControlId}:${viewport}`);
      }
      const owner = `${surfaceId}|${mapping.sourceControlId}`;
      const previousOwner = semanticReferenceOwners.get(reference);
      if (previousOwner && previousOwner !== owner) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_REUSED:${reference}`);
      }
      semanticReferenceOwners.set(reference, owner);
    } else if (
      mapping.executionScope !== "viewport-local" ||
      mapping.semanticExecutionRef !== null ||
      mapping.runtimeClassification === "action.mutating" ||
      mapping.runtimeClassification.startsWith("field.") ||
      mapping.runtimeClassification === "structure.form" ||
      mapping.runtimeClassification === "structure.dialog"
    ) {
      throw new Error(`CMS_TERMINAL_EXECUTION_SCOPE_INVALID:${mapping.sourceControlId}:${viewport}`);
    }
  }
  const allowedNotApplicable = new Map([
    ["feature-branch-disabled", "src/admin/ev2-runtime.ts#ev2.dam"],
    [
      "legacy-state-unavailable-by-read-only-cutover",
      "supabase/migrations/0078_cms_product_pim_consolidation.sql#legacy-writers-read-only",
    ],
  ]);
  for (const value of notApplicable) {
    const disposition = record(value, "CMS_TERMINAL_SOURCE_NOT_APPLICABLE_INVALID");
    const documentationReference = allowedNotApplicable.get(disposition.basisCode);
    const sourceControlId = nonEmptyString(
      disposition.sourceControlId,
      "CMS_TERMINAL_SOURCE_NOT_APPLICABLE_ID_MISSING",
    );
    if (
      disposition.schemaVersion !== 1 ||
      disposition.surfaceId !== surfaceId ||
      disposition.viewport !== viewport ||
      disposition.applicability !== "not-applicable" ||
      disposition.status !== "not-applicable" ||
      disposition.executionScope !== "not-applicable" ||
      disposition.semanticExecutionRef !== null ||
      disposition.handlerExecuted !== false ||
      disposition.evidenceKind !== null ||
      !["field", "form", "action", "link", "tab", "dialog"].includes(disposition.sourceClassification) ||
      typeof disposition.justification !== "string" ||
      disposition.justification.trim().length < 32 ||
      documentationReference !== disposition.documentationReference ||
      disposition.evidenceReference !== `${documentationReference}|${sourceControlId}` ||
      sourceIds.has(sourceControlId)
    ) {
      throw new Error(`CMS_TERMINAL_SOURCE_NOT_APPLICABLE_INVALID:${surfaceId}:${viewport}`);
    }
    sourceIds.add(sourceControlId);
  }
  return { mappings, notApplicable };
}

function assertNoFailures(value, code) {
  for (const key of ["failures", "unsupported", "consoleFailures", "httpFailures", "requestFailures"]) {
    if (Array.isArray(value[key]) && value[key].length) throw new Error(`${code}_${key.toUpperCase()}`);
  }
}

function assertSemanticStateSnapshots(proof, surfaceId, viewport, semanticStateSetupLedger) {
  const expected = [...semanticStateSetupLedger.values()]
    .filter((setup) => setup.surfaceId === surfaceId)
    .map((setup) => setup.stateContractKey)
    .sort();
  const snapshots = proof.semanticStateSnapshots ?? [];
  if (!Array.isArray(snapshots)) {
    throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_SNAPSHOTS_INVALID:${surfaceId}:${viewport}`);
  }
  const actual = snapshots.map((snapshot) => snapshot.stateContractKey).sort();
  if (new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_SNAPSHOT_COVERAGE:${surfaceId}:${viewport}`);
  }
  for (const snapshotValue of snapshots) {
    const snapshot = record(
      snapshotValue,
      `CMS_TERMINAL_SEMANTIC_STATE_SNAPSHOT_INVALID:${surfaceId}:${viewport}`,
    );
    if (
      snapshot.status !== "passed" ||
      !semanticStateSetupLedger.has(snapshot.stateContractKey) ||
      !Number.isInteger(snapshot.controlsCaptured) ||
      snapshot.controlsCaptured < 1 ||
      snapshot.mutationRequests !== 0 ||
      snapshot.restored !== true ||
      !Array.isArray(snapshot.failures) ||
      snapshot.failures.length
    ) {
      throw new Error(
        `CMS_TERMINAL_SEMANTIC_STATE_SNAPSHOT_FAILED:${surfaceId}:${viewport}:${snapshot.stateContractKey}`,
      );
    }
  }
  return snapshots;
}

function assertControlProof(proof, surfaceId, viewport) {
  const code = `CMS_TERMINAL_CONTROL_PROOF_${surfaceId}_${viewport}`.replace(/[^a-zA-Z0-9_]/g, "_");
  if (!passedState(proof)) throw new Error(`${code}_NOT_PASSED`);
  assertNoFailures(proof, code);
  const interaction =
    proof.controlInteraction && typeof proof.controlInteraction === "object"
      ? proof.controlInteraction
      : proof.controlEvidence && typeof proof.controlEvidence === "object"
        ? proof.controlEvidence
        : proof;
  assertNoFailures(interaction, code);

  const fieldSeen = interaction.fieldsSeen;
  const fieldExercised = interaction.fieldsExercised;
  const actionSeen = interaction.actionsSeen;
  const actionExecuted = interaction.actionsExecuted;
  const actionExecutionReferenced = interaction.actionsExecutionReferenced ?? 0;
  const actionStateAsserted = interaction.actionsStateAsserted ?? 0;
  const linkSeen = interaction.linksSeen ?? 0;
  const linkExecuted = interaction.linksExecuted ?? 0;
  if (
    !Number.isInteger(fieldSeen) ||
    !Number.isInteger(fieldExercised) ||
    !Number.isInteger(actionSeen) ||
    !Number.isInteger(actionExecuted) ||
    !Number.isInteger(actionExecutionReferenced) ||
    !Number.isInteger(actionStateAsserted) ||
    fieldSeen !== fieldExercised ||
    actionSeen !== actionExecuted + actionExecutionReferenced + actionStateAsserted ||
    !Number.isInteger(linkSeen) ||
    !Number.isInteger(linkExecuted) ||
    linkSeen !== linkExecuted
  ) {
    throw new Error(`${code}_FIELDS_OR_ACTIONS_UNEXERCISED`);
  }

  const executions = semanticExecutionsFrom(proof);
  if (executions.length) {
    for (const executionValue of executions) {
      const execution = record(executionValue, `${code}_EXECUTION_INVALID`);
      if (
        execution.status !== "passed" ||
        execution.handlerExecuted !== true ||
        !nonEmptyString(execution.handlerId, `${code}_HANDLER_MISSING`) ||
        !nonEmptyString(execution.controlId, `${code}_CONTROL_ID_MISSING`) ||
        !nonEmptyString(execution.evidenceReference, `${code}_REFERENCE_MISSING`) ||
        ["focus-only", "observation-only"].includes(execution.evidenceKind)
      ) {
        throw new Error(`${code}_NON_SEMANTIC_EXECUTION`);
      }
      if (
        (execution.executionScope === "scenario-once" &&
          (!nonEmptyString(execution.semanticExecutionRef, `${code}_SEMANTIC_REFERENCE_MISSING`) ||
            !["backend-response", "scenario-contract"].includes(execution.evidenceKind))) ||
        (execution.executionScope === "viewport-local" && execution.semanticExecutionRef !== null) ||
        !["scenario-once", "viewport-local"].includes(execution.executionScope)
      ) {
        throw new Error(`${code}_EXECUTION_SCOPE_INVALID`);
      }
    }
    if (
      executions.filter(
        (execution) =>
          execution.executionScope === "scenario-once" && execution.classification?.startsWith("action."),
      ).length !== actionExecutionReferenced
    ) {
      throw new Error(`${code}_SEMANTIC_REFERENCE_COUNT_INVALID`);
    }
    return executions;
  }
  const handlerEvidence = interaction.handlerEvidence ?? proof.handlerEvidence;
  if (typeof handlerEvidence !== "string" || !handlerEvidence.trim()) {
    throw new Error(`${code}_HANDLER_EVIDENCE_MISSING`);
  }
  if (/focus|observ/i.test(handlerEvidence)) throw new Error(`${code}_NON_SEMANTIC_HANDLER_EVIDENCE`);
  return [];
}

function assertCoreRuntime(runtime, candidateSha, environment) {
  if (normalizedSha(runtime.sourceSha, "CMS_TERMINAL_RUNTIME_SHA_INVALID") !== candidateSha) {
    throw new Error("CMS_TERMINAL_RUNTIME_SHA_MISMATCH");
  }
  for (const [name, sectionValue] of Object.entries({
    staticInventory: runtime.staticInventory,
    signedOut: runtime.signedOut,
    authenticated: runtime.authenticated,
    mutatingEntityLifecycles: runtime.mutatingEntityLifecycles,
    mutatingEditorialLifecycle: runtime.mutatingEditorialLifecycle,
  })) {
    const section = record(sectionValue, `CMS_TERMINAL_RUNTIME_${name.toUpperCase()}_MISSING`);
    if (section.status !== "passed") throw new Error(`CMS_TERMINAL_RUNTIME_${name.toUpperCase()}_NOT_PASSED`);
  }
  const authenticated = runtime.authenticated;
  if (authenticated.rollbackCompatibility === true) {
    throw new Error("CMS_TERMINAL_RUNTIME_ROLLBACK_COMPATIBILITY_IS_NOT_FINAL_CANDIDATE");
  }
  if (normalizedSha(authenticated.frontendSha, "CMS_TERMINAL_FRONTEND_SHA_INVALID") !== candidateSha) {
    throw new Error("CMS_TERMINAL_FRONTEND_SHA_MISMATCH");
  }
  for (const key of ["consoleFailures", "httpFailures", "requestFailures"]) {
    if (!Array.isArray(authenticated[key]) || authenticated[key].length) {
      throw new Error(`CMS_TERMINAL_RUNTIME_${key.toUpperCase()}`);
    }
  }
  const semantic = record(authenticated.semanticContract, "CMS_TERMINAL_SEMANTIC_CONTRACT_MISSING");
  const semanticResult = record(semantic.result, "CMS_TERMINAL_SEMANTIC_RESULT_MISSING");
  if (
    semantic.schemaVersion !== 1 ||
    semantic.focusOrObservationAcceptedAsActionEvidence !== false ||
    semanticResult.status !== "passed" ||
    !Array.isArray(semanticResult.failures) ||
    semanticResult.failures.length
  ) {
    throw new Error("CMS_TERMINAL_SEMANTIC_CONTRACT_FAILED");
  }
  const requiredViewports = [...array(semantic.requiredViewports, "CMS_TERMINAL_VIEWPORTS_MISSING")].sort();
  if (JSON.stringify(requiredViewports) !== JSON.stringify([...CMS_TERMINAL_VIEWPORTS].sort())) {
    throw new Error("CMS_TERMINAL_VIEWPORTS_INCOMPLETE");
  }
  const entityLifecycle = runtime.mutatingEntityLifecycles;
  if (
    entityLifecycle.positivePublicLeadEvidence !== "iab-attested-lead-capture-and-admin-responded" ||
    entityLifecycle.editorialRelease?.status !== "rolled_back" ||
    entityLifecycle.auditPreserved !== true
  ) {
    throw new Error("CMS_TERMINAL_ENTITY_LIFECYCLE_INCOMPLETE");
  }
  const editorialLifecycle = runtime.mutatingEditorialLifecycle;
  if (
    editorialLifecycle.finalSyntheticState !== "published-for-downstream" ||
    editorialLifecycle.noindexRoute !== true ||
    editorialLifecycle.auditPreserved !== true
  ) {
    throw new Error("CMS_TERMINAL_EDITORIAL_LIFECYCLE_INCOMPLETE");
  }
  const runtimeEnvironment = String(entityLifecycle.environment ?? "").split(" ")[0];
  if (runtimeEnvironment !== environment) throw new Error("CMS_TERMINAL_RUNTIME_ENVIRONMENT_MISMATCH");
}

function sourceHandler(classification) {
  const handlers = {
    field: "source-field.schema-cases-persistence-backend-audit",
    form: "source-form.runtime-open-submit-effect",
    action: "source-action.runtime-ui-or-backend-effect",
    dialog: "source-dialog.runtime-open-confirm-effect-close",
    link: "source-link.runtime-navigation-response",
    tab: "source-tab.runtime-keyboard-activation",
  };
  const handler = handlers[classification];
  if (!handler) throw new Error(`CMS_TERMINAL_SOURCE_CONTROL_UNSUPPORTED:${classification}`);
  return handler;
}

function materializeRequirement(itemValue, terminalSurfaceById) {
  const item = record(itemValue, "CMS_TERMINAL_REQUIREMENT_INVALID");
  const requirementId = nonEmptyString(item.id, "CMS_TERMINAL_REQUIREMENT_ID_INVALID");
  const surfaceIds = array(item.surfaceIds, `CMS_TERMINAL_REQUIREMENT_SURFACES_MISSING:${requirementId}`);
  if (!surfaceIds.length || new Set(surfaceIds).size !== surfaceIds.length) {
    throw new Error(`CMS_TERMINAL_REQUIREMENT_SURFACES_INVALID:${requirementId}`);
  }
  const runtimeEvidence = surfaceIds.map((surfaceId) => {
    const surface = terminalSurfaceById.get(surfaceId);
    if (!surface || surface.testState !== "passed" || surface.finalResult !== "passed") {
      throw new Error(`CMS_TERMINAL_REQUIREMENT_SURFACE_NOT_PASSED:${requirementId}:${surfaceId}`);
    }
    return {
      surfaceId,
      testState: "passed",
      evidenceReference: `cms-terminal-coverage-matrix.json#matrix/${surfaceId}`,
      backendResult: surface.backendResult.status,
      publicResult: surface.publicResult.status,
    };
  });
  return {
    ...item,
    state: "passed; every bound surface has exact runtime evidence",
    runtimeEvidence,
    evidence: [
      ...new Set([
        ...(Array.isArray(item.evidence) ? item.evidence : []),
        ...runtimeEvidence.map((entry) => entry.evidenceReference),
      ]),
    ],
  };
}

function surfaceEvidence(terminalSurfaceById, ids, code) {
  return ids.map((surfaceId) => {
    const surface = terminalSurfaceById.get(surfaceId);
    if (!surface || surface.testState !== "passed" || surface.finalResult !== "passed") {
      throw new Error(`${code}:${surfaceId}`);
    }
    return {
      surfaceId,
      testState: "passed",
      evidenceReference: `cms-terminal-coverage-matrix.json#matrix/${surfaceId}`,
    };
  });
}

function materializeRedesignDivergences(itemsValue, terminalSurfaceById) {
  const items = array(itemsValue, "CMS_TERMINAL_REDESIGN_INVALID");
  const expected = {
    "RD-001": [...terminalSurfaceById.keys()],
    "RD-002": ["product-create", "product-edit", "pim"],
    "RD-003": ["products-list", "product-create", "product-edit", "products-import", "pim"],
  };
  if (
    items.length !== Object.keys(expected).length ||
    new Set(items.map((item) => item.id)).size !== items.length
  ) {
    throw new Error("CMS_TERMINAL_REDESIGN_CARDINALITY_INVALID");
  }
  return items.map((itemValue) => {
    const item = record(itemValue, "CMS_TERMINAL_REDESIGN_ITEM_INVALID");
    const surfaceIds = expected[item.id];
    if (!surfaceIds || !surfaceIds.length || !Array.isArray(item.evidence) || !item.evidence.length) {
      throw new Error(`CMS_TERMINAL_REDESIGN_INVARIANT_INVALID:${item.id}`);
    }
    if (typeof item.productionDecision !== "string" || !item.productionDecision.trim()) {
      throw new Error(`CMS_TERMINAL_REDESIGN_DECISION_MISSING:${item.id}`);
    }
    return {
      ...item,
      status: "passed; declared production invariant validated",
      invariant: item.productionDecision,
      runtimeEvidence: surfaceEvidence(
        terminalSurfaceById,
        surfaceIds,
        `CMS_TERMINAL_REDESIGN_SURFACE_NOT_PASSED:${item.id}`,
      ),
    };
  });
}

function materializeProductPimAuthority(value, terminalSurfaceById) {
  const pim = record(value, "CMS_TERMINAL_PIM_INVALID");
  if (
    pim.independentPimWriterInCommonUi !== false ||
    pim.contextualReadRoute !== "/admin/pim" ||
    !Array.isArray(pim.canonicalWriterRoutePatterns) ||
    !pim.canonicalWriterRoutePatterns.includes("/admin/produtos/:id") ||
    typeof pim.canonicalPayload !== "string" ||
    !pim.canonicalPayload.includes("cms-content") ||
    typeof pim.legacyCompatibility !== "string" ||
    !/leitura|read/i.test(pim.legacyCompatibility)
  ) {
    throw new Error("CMS_TERMINAL_PIM_INVARIANT_INVALID");
  }
  return {
    ...pim,
    state: "passed; canonical product writer and authoritative PIM projection validated",
    invariant: "cms-content is the only common UI writer; /admin/pim is contextual read/reconciliation",
    runtimeEvidence: surfaceEvidence(
      terminalSurfaceById,
      ["products-list", "product-create", "product-edit", "products-import", "pim"],
      "CMS_TERMINAL_PIM_SURFACE_NOT_PASSED",
    ),
  };
}

function materializeSurface(
  surfaceValue,
  sourceControls,
  proofs,
  candidateSha,
  semanticActionLedger,
  semanticScenarioLedgers,
  semanticStateSetupLedger,
  publicConsumerLedger,
  semanticReferenceOwners,
) {
  const surface = record(surfaceValue, "CMS_TERMINAL_SURFACE_INVALID");
  const surfaceId = nonEmptyString(surface.id, "CMS_TERMINAL_SURFACE_ID_INVALID");
  const surfaceProofs = proofs.filter((proof) => proof.surfaceId === surfaceId);
  const byViewport = new Map();
  for (const viewport of CMS_TERMINAL_VIEWPORTS) {
    const matches = surfaceProofs.filter((proof) => proof.viewport === viewport);
    if (matches.length !== 1) {
      throw new Error(`CMS_TERMINAL_SURFACE_VIEWPORT_PROOF_COUNT:${surfaceId}:${viewport}:${matches.length}`);
    }
    const proof = matches[0];
    const executions = assertControlProof(proof.value, surfaceId, viewport);
    const stateSnapshots = assertSemanticStateSnapshots(
      proof.value,
      surfaceId,
      viewport,
      semanticStateSetupLedger,
    );
    const sourceBindings = sourceControlExecutionsFrom(
      proof.value,
      surfaceId,
      viewport,
      semanticActionLedger,
      semanticScenarioLedgers,
      semanticReferenceOwners,
    );
    byViewport.set(viewport, { proof, executions, sourceBindings, stateSnapshots });
  }

  const surfaceSourceControls = sourceControls.filter((control) =>
    array(control.ownerRouteIds, "CMS_TERMINAL_CONTROL_OWNERS_INVALID").includes(surfaceId),
  );
  for (const viewport of CMS_TERMINAL_VIEWPORTS) {
    const expectedIds = surfaceSourceControls.map((control) => control.id).sort();
    const binding = byViewport.get(viewport).sourceBindings;
    const actualIds = [...binding.mappings, ...binding.notApplicable]
      .map((mapping) => mapping.sourceControlId)
      .sort();
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
      throw new Error(`CMS_TERMINAL_SOURCE_MAPPING_COVERAGE_MISMATCH:${surfaceId}:${viewport}`);
    }
  }
  const sourceControlResults = surfaceSourceControls.map((control) => {
    const classification = nonEmptyString(
      control.classification,
      "CMS_TERMINAL_CONTROL_CLASSIFICATION_MISSING",
    );
    const expectedApplicability = control.runtimeApplicabilityBySurface?.[surfaceId] ?? {
      applicability: "required",
    };
    const evidenceByViewport = CMS_TERMINAL_VIEWPORTS.map((viewport) => {
      const item = byViewport.get(viewport);
      const mappingMatches = item.sourceBindings.mappings.filter(
        (mapping) => mapping.sourceControlId === control.id,
      );
      const notApplicableMatches = item.sourceBindings.notApplicable.filter(
        (mapping) => mapping.sourceControlId === control.id,
      );
      if (mappingMatches.length + notApplicableMatches.length !== 1) {
        throw new Error(
          `CMS_TERMINAL_SOURCE_BINDING_COUNT:${control.id}:${viewport}:${mappingMatches.length + notApplicableMatches.length}`,
        );
      }
      if (expectedApplicability.applicability === "not-applicable") {
        const disposition = notApplicableMatches[0];
        if (
          !disposition ||
          disposition.sourceClassification !== classification ||
          disposition.basisCode !== expectedApplicability.basisCode ||
          disposition.justification !== expectedApplicability.justification ||
          disposition.documentationReference !== expectedApplicability.documentationReference
        ) {
          throw new Error(`CMS_TERMINAL_SOURCE_NOT_APPLICABLE_MISMATCH:${control.id}:${viewport}`);
        }
        return {
          viewport,
          status: "not-applicable",
          evidenceReference: disposition.evidenceReference,
          runtimeControlId: null,
          runtimeClassification: null,
          runtimeHandlerId: null,
          mapping: null,
          semanticEvidenceKind: null,
          semanticEvidenceReference: null,
          executionScope: "not-applicable",
          semanticExecutionRef: null,
          handlerExecuted: false,
          basisCode: disposition.basisCode,
          justification: disposition.justification,
          documentationReference: disposition.documentationReference,
        };
      }
      const mapping = mappingMatches[0];
      if (!mapping || mapping.sourceClassification !== classification) {
        throw new Error(`CMS_TERMINAL_SOURCE_MAPPING_CLASS_MISMATCH:${control.id}:${viewport}`);
      }
      return {
        viewport,
        status: "passed",
        evidenceReference: safeEvidenceReference(item.proof.label, item.proof.path),
        runtimeControlId: mapping.runtimeControlId,
        runtimeClassification: mapping.runtimeClassification,
        runtimeHandlerId: mapping.runtimeHandlerId,
        mapping: mapping.mapping,
        semanticEvidenceKind: mapping.evidenceKind,
        semanticEvidenceReference: mapping.evidenceReference,
        executionScope: mapping.executionScope,
        semanticExecutionRef: mapping.semanticExecutionRef,
        handlerExecuted: true,
      };
    });
    const isNotApplicable = expectedApplicability.applicability === "not-applicable";
    const scenarioReferences = evidenceByViewport
      .filter((entry) => entry.executionScope === "scenario-once")
      .map((entry) => entry.semanticExecutionRef);
    if (
      scenarioReferences.length !== 0 &&
      (scenarioReferences.length !== CMS_TERMINAL_VIEWPORTS.length || new Set(scenarioReferences).size !== 1)
    ) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_VIEWPORT_MISMATCH:${control.id}`);
    }
    return {
      sourceControlId: control.id,
      classification,
      handlerId: isNotApplicable ? null : sourceHandler(classification),
      accessibleNameHint: control.accessibleNameHint,
      sourceEvidence: control.evidence,
      applicability: isNotApplicable ? "not-applicable" : "required",
      testState: isNotApplicable ? "not-applicable" : "passed",
      ...(isNotApplicable
        ? {
            basisCode: expectedApplicability.basisCode,
            justification: expectedApplicability.justification,
            documentationReference: expectedApplicability.documentationReference,
          }
        : {}),
      evidenceByViewport,
      correctionPerformed: control.correction ?? "none-required",
    };
  });

  const runtimeControls = surfaceProofs
    .flatMap((proof) =>
      semanticExecutionsFrom(proof.value).map((execution) => ({
        viewport: proof.viewport,
        controlId: execution.controlId,
        classification: execution.classification,
        handlerId: execution.handlerId,
        executionScope: execution.executionScope,
        semanticExecutionRef: execution.semanticExecutionRef,
        evidenceKind: execution.evidenceKind,
        evidenceReference: execution.evidenceReference,
        testState: "passed",
      })),
    )
    .sort((left, right) =>
      `${left.viewport}|${left.controlId}`.localeCompare(`${right.viewport}|${right.controlId}`),
    );

  const evidenceByViewport = CMS_TERMINAL_VIEWPORTS.map((viewport) => {
    const proof = byViewport.get(viewport).proof;
    return {
      viewport,
      testState: "passed",
      evidenceReference: safeEvidenceReference(proof.label, proof.path),
      handlerEvidence: "semantic UI/backend execution accepted; focus/observation-only rejected",
      semanticStateSnapshots: byViewport.get(viewport).stateSnapshots.map((snapshot) => ({
        stateContractKey: snapshot.stateContractKey,
        status: "passed",
        controlsCaptured: snapshot.controlsCaptured,
        mutationRequests: 0,
        restored: true,
      })),
    };
  });
  const sourceResultById = new Map(sourceControlResults.map((control) => [control.sourceControlId, control]));
  const contractEvidence = (contract) => {
    const sourceResult = sourceResultById.get(contract.id);
    const notApplicable = sourceResult?.testState === "not-applicable";
    return {
      ...contract,
      resultState: notApplicable ? "not-applicable" : "passed",
      runtimeEvidence: notApplicable ? sourceResult.evidenceByViewport : evidenceByViewport,
      ...(notApplicable
        ? {
            basisCode: sourceResult.basisCode,
            justification: sourceResult.justification,
            documentationReference: sourceResult.documentationReference,
          }
        : {}),
    };
  };
  const controlEvidence = sourceControlResults
    .filter(
      (control) =>
        control.testState === "passed" &&
        ["field", "action", "form", "dialog"].includes(control.classification),
    )
    .map((control) => {
      const semanticReferences = [
        ...new Set(
          control.evidenceByViewport.map((entry) => entry.semanticEvidenceReference).filter(Boolean),
        ),
      ];
      if (!semanticReferences.length) {
        throw new Error(`CMS_TERMINAL_BACKEND_CONTROL_REFERENCE_MISSING:${control.sourceControlId}`);
      }
      return {
        sourceControlId: control.sourceControlId,
        classification: control.classification,
        status: "passed",
        evidenceReferences: semanticReferences,
      };
    });
  const publicConsumers = array(surface.publicConsumers ?? [], "CMS_TERMINAL_PUBLIC_CONSUMERS_INVALID");
  const publicEvidence = publicConsumers.map((consumer, consumerOccurrence) => {
    const key = publicConsumerContractKey(surfaceId, consumer, consumerOccurrence);
    const evidence = publicConsumerLedger.get(key);
    if (!evidence) {
      throw new Error(`CMS_TERMINAL_PUBLIC_CONSUMER_EVIDENCE_MISSING:${key}`);
    }
    publicConsumerLedger.delete(key);
    return {
      consumer,
      consumerOccurrence,
      consumerContractKey: key,
      status: "passed",
      evidenceReference: evidence.evidenceReference,
      consumerKind: evidence.consumerKind,
      observedStatus: evidence.observedStatus,
      cacheInvalidation: evidence.cacheInvalidation,
      noInternalOrUnpublishedContent: true,
    };
  });
  return {
    ...surface,
    state: "runtime SHA-bound validation complete",
    testState: "passed",
    browserEvidence: evidenceByViewport,
    fieldContracts: array(surface.fieldContracts ?? [], "CMS_TERMINAL_FIELD_CONTRACTS_INVALID").map(
      contractEvidence,
    ),
    actionContracts: array(surface.actionContracts ?? [], "CMS_TERMINAL_ACTION_CONTRACTS_INVALID").map(
      (contract) => {
        const evidence = contractEvidence(contract);
        return {
          ...evidence,
          semanticProof:
            evidence.resultState === "not-applicable"
              ? "source-backed conditional branch classified by canonical feature/cutover evidence; no handler execution claimed"
              : "runtime handler executed with UI, navigation, state, or backend evidence",
        };
      },
    ),
    sourceControlResults,
    runtimeControls,
    backendResult: {
      status: "passed",
      candidateSha,
      controlEvidence,
    },
    publicResult: {
      expected: surface.publicResult,
      status: publicConsumers.length ? "passed" : "not-applicable",
      classification: publicConsumers.length ? "consumer-specific-runtime-evidence" : "private-admin-surface",
      justification: publicConsumers.length
        ? null
        : "The inventory declares no public consumer for this protected administrative surface.",
      documentationReference: publicConsumers.length ? null : surface.origin?.code?.[0],
      consumerEvidence: publicEvidence,
    },
    observedError: null,
    rootCause: null,
    correctionPerformed: surface.correctionPerformed ?? surface.correction ?? "none-required",
    revalidation: "passed on exact candidate SHA across all required viewports",
    finalResult: "passed",
  };
}

function terminalStateStrings(value, path = [], failures = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => terminalStateStrings(item, [...path, String(index)], failures));
    return failures;
  }
  if (!value || typeof value !== "object") return failures;
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = [...path, key];
    if (
      typeof nested === "string" &&
      /(?:^|_)(?:state|status|result|testState|resultState|finalResult)$/i.test(key) &&
      terminalFailurePattern.test(nested)
    ) {
      failures.push(nextPath.join("."));
    }
    terminalStateStrings(nested, nextPath, failures);
  }
  return failures;
}

function terminalDisposition(value) {
  return value.applicability === "exercised"
    ? {
        applicability: value.applicability,
        scenarioId: value.scenarioId,
        proofKind: value.proofKind,
        evidenceReference: value.evidenceReference,
      }
    : {
        applicability: value.applicability,
        basisCode: value.basisCode,
        justification: value.justification,
        documentationReference: value.documentationReference,
      };
}

export function assertCmsTerminalCoverage(value) {
  const report = record(value, "CMS_TERMINAL_REPORT_INVALID");
  if (report.schemaVersion !== CMS_TERMINAL_COVERAGE_SCHEMA_VERSION || report.status !== "passed") {
    throw new Error("CMS_TERMINAL_REPORT_NOT_PASSED");
  }
  const candidateSha = normalizedSha(report.candidateSha);
  normalizedRunTag(report.runTag, candidateSha);
  if (!["staging", "production"].includes(report.environment)) {
    throw new Error("CMS_TERMINAL_ENVIRONMENT_INVALID");
  }
  if (
    report.sourceDirty !== false ||
    report.credentialsPersisted !== false ||
    report.syntheticEntityIdentifiersInTerminalReport !== false ||
    "syntheticIdentifiersPersisted" in report
  ) {
    throw new Error("CMS_TERMINAL_REPORT_CLAIMS_INVALID");
  }
  const realBrowserManifest = record(report.evidenceManifest, "CMS_TERMINAL_EVIDENCE_MANIFEST_INVALID");
  const expectedEvidenceFiles = evidenceManifestFileNames(report.environment);
  if (
    Object.entries(expectedEvidenceFiles).some(([key, file]) => realBrowserManifest[key] !== file) ||
    realBrowserManifest.shaBinding !== candidateSha ||
    realBrowserManifest.allReportsPassed !== true ||
    realBrowserManifest.setupStatus !== "ready" ||
    realBrowserManifest.cleanupStatus !== "cleaned" ||
    realBrowserManifest.residueStatus !== "passed"
  ) {
    throw new Error("CMS_TERMINAL_EVIDENCE_MANIFEST_BINDING_INVALID");
  }
  if (
    realBrowserManifest.realBrowserStatus !== "passed" ||
    realBrowserManifest.realBrowserChannel !== "iab-workflow-dispatch-hmac" ||
    realBrowserManifest.realBrowserCanonicalFrontendReleaseBound !== true ||
    realBrowserManifest.realBrowserBackendAccepted !== true ||
    realBrowserManifest.realBrowserSuccessLocator !== '[data-form-submission-status="success"]' ||
    realBrowserManifest.realBrowserSuccessLocatorObserved !== true ||
    realBrowserManifest.realBrowserOfficialWidgetObserved !== true ||
    realBrowserManifest.realBrowserCDataBound !== true ||
    realBrowserManifest.realBrowserTokenCaptured !== false ||
    realBrowserManifest.realBrowserVariableCleared !== true ||
    !/^[a-f0-9]{64}$/.test(String(realBrowserManifest.realBrowserScreenshotSha256 ?? "")) ||
    !Number.isSafeInteger(realBrowserManifest.realBrowserScreenshotBytes) ||
    realBrowserManifest.realBrowserScreenshotBytes < 45 ||
    realBrowserManifest.realBrowserScreenshotBytes > 30 * 1024
  ) {
    throw new Error("CMS_TERMINAL_REAL_BROWSER_MANIFEST_INVALID");
  }
  assertSiteBaseline(report.siteBaseline);
  assertTerminalTombstone(report.terminalArchivedTombstone, "REPORT");
  const matrix = array(report.matrix, "CMS_TERMINAL_MATRIX_MISSING");
  if (!matrix.length) throw new Error("CMS_TERMINAL_MATRIX_EMPTY");
  if (new Set(matrix.map((surface) => surface.id)).size !== matrix.length) {
    throw new Error("CMS_TERMINAL_MATRIX_DUPLICATE_SURFACE");
  }
  const semanticActionManifest = array(
    report.semanticActionManifest,
    "CMS_TERMINAL_SEMANTIC_ACTION_MANIFEST_MISSING",
  );
  const semanticActionsByKey = new Map();
  for (const actionValue of semanticActionManifest) {
    const action = record(actionValue, "CMS_TERMINAL_SEMANTIC_ACTION_MANIFEST_INVALID");
    const key = nonEmptyString(action.controlContractKey, "CMS_TERMINAL_SEMANTIC_ACTION_KEY_MISSING");
    if (
      semanticActionsByKey.has(key) ||
      action.status !== "passed" ||
      action.evidenceKind !== "backend-response" ||
      !nonEmptyString(action.evidenceReference, "CMS_TERMINAL_SEMANTIC_ACTION_REFERENCE_MISSING")
    ) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_ACTION_MANIFEST_INVALID:${key}`);
    }
    semanticActionsByKey.set(key, action);
  }
  const semanticFieldsByKey = new Map();
  for (const fieldValue of array(
    report.semanticFieldManifest,
    "CMS_TERMINAL_SEMANTIC_FIELD_MANIFEST_MISSING",
  )) {
    const field = record(fieldValue, "CMS_TERMINAL_SEMANTIC_FIELD_MANIFEST_INVALID");
    const key = nonEmptyString(field.fieldContractKey, "CMS_TERMINAL_SEMANTIC_FIELD_KEY_MISSING");
    if (
      semanticFieldsByKey.has(key) ||
      field.status !== "passed" ||
      !nonEmptyString(field.evidenceReference, "CMS_TERMINAL_SEMANTIC_FIELD_REFERENCE_MISSING") ||
      !Array.isArray(field.caseResults) ||
      field.caseResults.length !== fieldCases.length ||
      !field.caseResults.every(
        (item) => item.applicability === "exercised" || item.applicability === "not-applicable",
      )
    ) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_FIELD_MANIFEST_INVALID:${key}`);
    }
    semanticFieldsByKey.set(key, field);
  }
  const semanticStructuresByKey = new Map();
  for (const structureValue of array(
    report.semanticStructureManifest,
    "CMS_TERMINAL_SEMANTIC_STRUCTURE_MANIFEST_MISSING",
  )) {
    const structure = record(structureValue, "CMS_TERMINAL_SEMANTIC_STRUCTURE_MANIFEST_INVALID");
    const key = nonEmptyString(structure.structureContractKey, "CMS_TERMINAL_SEMANTIC_STRUCTURE_KEY_MISSING");
    if (
      semanticStructuresByKey.has(key) ||
      structure.status !== "passed" ||
      !nonEmptyString(structure.evidenceReference, "CMS_TERMINAL_SEMANTIC_STRUCTURE_REFERENCE_MISSING")
    ) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_STRUCTURE_MANIFEST_INVALID:${key}`);
    }
    semanticStructuresByKey.set(key, structure);
  }
  const semanticStateSetupsByKey = new Map();
  for (const setupValue of array(
    report.semanticStateSetupManifest,
    "CMS_TERMINAL_SEMANTIC_STATE_MANIFEST_MISSING",
  )) {
    const setup = record(setupValue, "CMS_TERMINAL_SEMANTIC_STATE_MANIFEST_INVALID");
    const key = nonEmptyString(setup.stateContractKey, "CMS_TERMINAL_SEMANTIC_STATE_KEY_MISSING");
    if (
      key !== semanticStateContractKey(setup.surfaceId, setup.stateId) ||
      semanticStateSetupsByKey.has(key) ||
      setup.schemaVersion !== 1 ||
      setup.status !== "passed" ||
      setup.mutationFree !== true ||
      setup.observedMutationRequests !== 0 ||
      setup.triggerObserved !== true ||
      setup.stateObserved !== true ||
      setup.restored !== true ||
      !nonEmptyString(setup.evidenceReference, "CMS_TERMINAL_SEMANTIC_STATE_REFERENCE_MISSING") ||
      !setup.evidenceReference.endsWith(`#semanticStateSetups/${key}`)
    ) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_MANIFEST_INVALID:${key}`);
    }
    semanticStateSetupsByKey.set(key, setup);
  }
  const semanticEvidenceByKey = new Map([
    ...semanticActionsByKey,
    ...semanticFieldsByKey,
    ...semanticStructuresByKey,
  ]);
  if (
    semanticEvidenceByKey.size !==
    semanticActionsByKey.size + semanticFieldsByKey.size + semanticStructuresByKey.size
  ) {
    throw new Error("CMS_TERMINAL_SEMANTIC_MANIFEST_KEY_COLLISION");
  }
  const semanticReferenceOwners = new Map();
  for (const surfaceValue of matrix) {
    const surface = record(surfaceValue, "CMS_TERMINAL_SURFACE_INVALID");
    if (
      surface.testState !== "passed" ||
      surface.finalResult !== "passed" ||
      surface.backendResult?.status !== "passed" ||
      !["passed", "not-applicable"].includes(surface.publicResult?.status)
    ) {
      throw new Error(`CMS_TERMINAL_SURFACE_NOT_PASSED:${surface.id}`);
    }
    const backendControlEvidence = array(
      surface.backendResult.controlEvidence,
      "CMS_TERMINAL_BACKEND_CONTROL_EVIDENCE_MISSING",
    );
    const sourceBackendControls = surface.sourceControlResults.filter(
      (control) =>
        control.testState === "passed" &&
        ["field", "action", "form", "dialog"].includes(control.classification),
    );
    if (
      backendControlEvidence.length !== sourceBackendControls.length ||
      new Set(backendControlEvidence.map((entry) => entry.sourceControlId)).size !==
        backendControlEvidence.length ||
      backendControlEvidence.some(
        (entry) =>
          entry.status !== "passed" ||
          !Array.isArray(entry.evidenceReferences) ||
          !entry.evidenceReferences.length,
      )
    ) {
      throw new Error(`CMS_TERMINAL_BACKEND_CONTROL_EVIDENCE_INVALID:${surface.id}`);
    }
    for (const control of sourceBackendControls) {
      const matches = backendControlEvidence.filter(
        (entry) => entry.sourceControlId === control.sourceControlId,
      );
      const expectedReferences = [
        ...new Set(control.evidenceByViewport.map((entry) => entry.semanticEvidenceReference)),
      ].sort();
      const actualReferences = [...(matches[0]?.evidenceReferences ?? [])].sort();
      if (matches.length !== 1 || JSON.stringify(actualReferences) !== JSON.stringify(expectedReferences)) {
        throw new Error(
          `CMS_TERMINAL_BACKEND_CONTROL_REFERENCE_MISMATCH:${surface.id}:${control.sourceControlId}`,
        );
      }
    }
    const publicConsumerEvidence = array(
      surface.publicResult.consumerEvidence,
      "CMS_TERMINAL_PUBLIC_CONSUMER_EVIDENCE_MISSING",
    );
    const declaredPublicConsumers = array(
      surface.publicConsumers ?? [],
      "CMS_TERMINAL_DECLARED_PUBLIC_CONSUMERS_INVALID",
    );
    if (
      surface.publicResult.status === "passed"
        ? publicConsumerEvidence.length !== declaredPublicConsumers.length ||
          publicConsumerEvidence.some(
            (entry, occurrence) =>
              entry.consumer !== declaredPublicConsumers[occurrence] ||
              entry.consumerOccurrence !== occurrence ||
              entry.consumerContractKey !==
                publicConsumerContractKey(surface.id, entry.consumer, occurrence) ||
              entry.status !== "passed" ||
              !nonEmptyString(entry.evidenceReference, "CMS_TERMINAL_PUBLIC_CONSUMER_REFERENCE_MISSING") ||
              entry.noInternalOrUnpublishedContent !== true,
          )
        : declaredPublicConsumers.length ||
          publicConsumerEvidence.length ||
          surface.publicResult.classification !== "private-admin-surface" ||
          !nonEmptyString(
            surface.publicResult.justification,
            "CMS_TERMINAL_PUBLIC_NOT_APPLICABLE_JUSTIFICATION_MISSING",
          ) ||
          !nonEmptyString(
            surface.publicResult.documentationReference,
            "CMS_TERMINAL_PUBLIC_NOT_APPLICABLE_DOCUMENTATION_MISSING",
          )
    ) {
      throw new Error(`CMS_TERMINAL_PUBLIC_RESULT_INVALID:${surface.id}`);
    }
    const viewportEvidence = array(surface.browserEvidence, "CMS_TERMINAL_BROWSER_EVIDENCE_MISSING");
    const actualViewports = viewportEvidence.map((item) => item.viewport).sort();
    if (JSON.stringify(actualViewports) !== JSON.stringify([...CMS_TERMINAL_VIEWPORTS].sort())) {
      throw new Error(`CMS_TERMINAL_SURFACE_VIEWPORTS_INCOMPLETE:${surface.id}`);
    }
    for (const contract of [
      ...array(surface.fieldContracts ?? [], "CMS_TERMINAL_FIELDS_INVALID"),
      ...array(surface.actionContracts ?? [], "CMS_TERMINAL_ACTIONS_INVALID"),
    ]) {
      if (!["passed", "not-applicable"].includes(contract.resultState))
        throw new Error(`CMS_TERMINAL_CONTROL_NOT_PASSED:${contract.id}`);
    }
    const expectedStateKeys = [...semanticStateSetupsByKey.values()]
      .filter((setup) => setup.surfaceId === surface.id)
      .map((setup) => setup.stateContractKey)
      .sort();
    for (const evidence of viewportEvidence) {
      const snapshots = array(
        evidence.semanticStateSnapshots ?? [],
        "CMS_TERMINAL_SEMANTIC_STATE_BROWSER_EVIDENCE_INVALID",
      );
      const actualStateKeys = snapshots.map((snapshot) => snapshot.stateContractKey).sort();
      if (
        new Set(actualStateKeys).size !== actualStateKeys.length ||
        JSON.stringify(actualStateKeys) !== JSON.stringify(expectedStateKeys) ||
        snapshots.some(
          (snapshot) =>
            snapshot.status !== "passed" ||
            snapshot.mutationRequests !== 0 ||
            snapshot.restored !== true ||
            !Number.isInteger(snapshot.controlsCaptured) ||
            snapshot.controlsCaptured < 1,
        )
      ) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_STATE_BROWSER_EVIDENCE_FAILED:${surface.id}`);
      }
    }
    const sourceControlResults = array(surface.sourceControlResults, "CMS_TERMINAL_SOURCE_RESULTS_MISSING");
    if (!sourceControlResults.length) {
      throw new Error(`CMS_TERMINAL_SOURCE_RESULTS_EMPTY:${surface.id}`);
    }
    const surfaceSourceIds = new Set();
    for (const control of sourceControlResults) {
      if (control.classification === "unsupported") {
        throw new Error(`CMS_TERMINAL_SOURCE_CONTROL_NOT_PASSED:${control.sourceControlId}`);
      }
      if (surfaceSourceIds.has(control.sourceControlId)) {
        throw new Error(`CMS_TERMINAL_SOURCE_CONTROL_DUPLICATE:${surface.id}:${control.sourceControlId}`);
      }
      surfaceSourceIds.add(control.sourceControlId);
      const evidenceByViewport = array(control.evidenceByViewport, "CMS_TERMINAL_SOURCE_EVIDENCE_MISSING");
      if (
        evidenceByViewport.length !== CMS_TERMINAL_VIEWPORTS.length ||
        JSON.stringify(evidenceByViewport.map((entry) => entry.viewport).sort()) !==
          JSON.stringify([...CMS_TERMINAL_VIEWPORTS].sort())
      ) {
        throw new Error(`CMS_TERMINAL_SOURCE_CONTROL_VIEWPORTS_INCOMPLETE:${control.sourceControlId}`);
      }
      if (control.testState === "not-applicable") {
        const allowedDocumentation = new Map([
          ["feature-branch-disabled", "src/admin/ev2-runtime.ts#ev2.dam"],
          [
            "legacy-state-unavailable-by-read-only-cutover",
            "supabase/migrations/0078_cms_product_pim_consolidation.sql#legacy-writers-read-only",
          ],
        ]);
        const documentationReference = allowedDocumentation.get(control.basisCode);
        if (
          control.applicability !== "not-applicable" ||
          control.handlerId !== null ||
          typeof control.justification !== "string" ||
          control.justification.trim().length < 32 ||
          documentationReference !== control.documentationReference ||
          evidenceByViewport.some(
            (evidence) =>
              evidence.status !== "not-applicable" ||
              evidence.handlerExecuted !== false ||
              evidence.runtimeControlId !== null ||
              evidence.runtimeHandlerId !== null ||
              evidence.runtimeClassification !== null ||
              evidence.mapping !== null ||
              evidence.semanticEvidenceKind !== null ||
              evidence.semanticEvidenceReference !== null ||
              evidence.executionScope !== "not-applicable" ||
              evidence.semanticExecutionRef !== null ||
              evidence.basisCode !== control.basisCode ||
              evidence.justification !== control.justification ||
              evidence.documentationReference !== documentationReference ||
              evidence.evidenceReference !== `${documentationReference}|${control.sourceControlId}`,
          )
        ) {
          throw new Error(`CMS_TERMINAL_SOURCE_NOT_APPLICABLE_INVALID:${control.sourceControlId}`);
        }
        continue;
      }
      if (control.testState !== "passed" || control.applicability !== "required" || !control.handlerId) {
        throw new Error(`CMS_TERMINAL_SOURCE_CONTROL_NOT_PASSED:${control.sourceControlId}`);
      }
      const scenarioReferences = [];
      for (const evidence of evidenceByViewport) {
        if (
          evidence.status !== "passed" ||
          !nonEmptyString(evidence.runtimeControlId, "CMS_TERMINAL_RUNTIME_CONTROL_ID_MISSING") ||
          !nonEmptyString(evidence.runtimeHandlerId, "CMS_TERMINAL_RUNTIME_HANDLER_MISSING") ||
          !nonEmptyString(evidence.semanticEvidenceReference, "CMS_TERMINAL_SEMANTIC_EVIDENCE_MISSING") ||
          ["focus-only", "observation-only"].includes(evidence.semanticEvidenceKind)
        ) {
          throw new Error(`CMS_TERMINAL_SOURCE_EVIDENCE_INVALID:${control.sourceControlId}`);
        }
        if (evidence.executionScope === "scenario-once") {
          const reference = nonEmptyString(
            evidence.semanticExecutionRef,
            "CMS_TERMINAL_SEMANTIC_REFERENCE_MISSING",
          );
          if (!semanticEvidenceByKey.has(reference)) {
            throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_INVALID:${reference}`);
          }
          if (
            (control.classification === "field" && !semanticFieldsByKey.has(reference)) ||
            (["form", "dialog"].includes(control.classification) &&
              !semanticStructuresByKey.has(reference)) ||
            (control.classification === "action" && !semanticActionsByKey.has(reference))
          ) {
            throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_CLASS_MISMATCH:${reference}`);
          }
          scenarioReferences.push(reference);
          const owner = `${surface.id}|${control.sourceControlId}`;
          const previousOwner = semanticReferenceOwners.get(reference);
          if (previousOwner && previousOwner !== owner) {
            throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_REUSED:${reference}`);
          }
          semanticReferenceOwners.set(reference, owner);
        } else if (evidence.executionScope !== "viewport-local" || evidence.semanticExecutionRef !== null) {
          throw new Error(`CMS_TERMINAL_EXECUTION_SCOPE_INVALID:${control.sourceControlId}`);
        }
      }
      if (
        scenarioReferences.length !== 0 &&
        (scenarioReferences.length !== CMS_TERMINAL_VIEWPORTS.length ||
          new Set(scenarioReferences).size !== 1)
      ) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_REFERENCE_VIEWPORT_MISMATCH:${control.sourceControlId}`);
      }
    }
    const sourceResultsById = new Map(
      sourceControlResults.map((control) => [control.sourceControlId, control]),
    );
    for (const contract of [
      ...array(surface.fieldContracts ?? [], "CMS_TERMINAL_FIELDS_INVALID"),
      ...array(surface.actionContracts ?? [], "CMS_TERMINAL_ACTIONS_INVALID"),
    ]) {
      const sourceResult = sourceResultsById.get(contract.id);
      if (
        !sourceResult ||
        (sourceResult.testState === "not-applicable"
          ? contract.resultState !== "not-applicable" ||
            contract.basisCode !== sourceResult.basisCode ||
            contract.documentationReference !== sourceResult.documentationReference
          : contract.resultState !== "passed")
      ) {
        throw new Error(`CMS_TERMINAL_CONTROL_SOURCE_STATE_MISMATCH:${surface.id}:${contract.id}`);
      }
    }
  }
  for (const key of semanticEvidenceByKey.keys()) {
    if (!semanticReferenceOwners.has(key)) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_ACTION_UNBOUND:${key}`);
    }
  }
  const counts = record(report.counts, "CMS_TERMINAL_COUNTS_INVALID");
  if (
    counts.terminalSurfaces !== matrix.length ||
    counts.terminalSourceControlBindings !==
      matrix.reduce((total, surface) => total + surface.sourceControlResults.length, 0) ||
    counts.terminalSourceControlNotApplicable !==
      matrix.reduce(
        (total, surface) =>
          total +
          surface.sourceControlResults.filter((control) => control.testState === "not-applicable").length,
        0,
      ) ||
    counts.terminalScenarioOnceExecutions !== semanticReferenceOwners.size ||
    counts.terminalSemanticStateSetups !== semanticStateSetupsByKey.size
  ) {
    throw new Error("CMS_TERMINAL_COUNTS_MISMATCH");
  }
  const terminalFailures = terminalStateStrings(report);
  if (terminalFailures.length) {
    throw new Error(`CMS_TERMINAL_NON_TERMINAL_STATE:${terminalFailures.slice(0, 5).join(",")}`);
  }
  return report;
}

export function materializeCmsTerminalCoverage(input) {
  const inventory = record(input.inventory, "CMS_TERMINAL_INVENTORY_INVALID");
  const runtime = record(input.runtime, "CMS_TERMINAL_RUNTIME_INVALID");
  const candidateSha = normalizedSha(input.candidateSha);
  const environment = input.environment;
  if (!["staging", "production"].includes(environment)) throw new Error("CMS_TERMINAL_ENVIRONMENT_INVALID");
  if (inventory.schemaVersion !== 1 || inventory.sourceDirty !== false) {
    throw new Error("CMS_TERMINAL_INVENTORY_NOT_RELEASE_BOUND");
  }
  if (normalizedSha(inventory.sourceSha, "CMS_TERMINAL_INVENTORY_SHA_INVALID") !== candidateSha) {
    throw new Error("CMS_TERMINAL_INVENTORY_SHA_MISMATCH");
  }
  const runTag = normalizedRunTag(runtime.runTag, candidateSha);
  assertCoreRuntime(runtime, candidateSha, environment);

  const reports = record(input.reports, "CMS_TERMINAL_EVIDENCE_REPORTS_INVALID");
  const setupReport = assertSetupReport(reports.setup, candidateSha, environment, runTag);
  const cleanupReport = assertCleanupReport(reports.cleanup, candidateSha, environment, runTag);
  const residueReport = assertResidueReport(reports.residue, candidateSha, environment, runTag);
  const realBrowserSummary = assertRealBrowserSummary(input.realBrowser, candidateSha, environment, runTag);
  const boundReports = Object.fromEntries(
    evidenceLabels.map((label) => [
      label,
      assertBoundReport(label, reports[label], candidateSha, environment, runTag),
    ]),
  );
  const siteBaseline = assertSiteBaseline(boundReports.secondary.siteBaseline);
  const semanticActionLedger = collectSemanticActionLedger(runtime, boundReports);
  const semanticScenarioLedgers = collectSemanticScenarioLedgers(runtime, boundReports);
  const semanticStateSetupLedger = collectSemanticStateSetupLedger(runtime, boundReports);
  const publicConsumerLedger = collectPublicConsumerLedger(runtime, boundReports, candidateSha);
  const semanticReferenceOwners = new Map();
  const proofs = [
    ...collectSurfaceViewportProofs(runtime.authenticated.observations, "cms-final-coverage.json", [
      "authenticated",
      "observations",
    ]),
    ...collectSurfaceViewportProofs(boundReports.auth, "cms-auth-lifecycle.json"),
  ];
  const matrixInput = array(inventory.matrix, "CMS_TERMINAL_INVENTORY_MATRIX_INVALID");
  const matrixIds = matrixInput.map((surface) => surface.id);
  if (new Set(matrixIds).size !== matrixIds.length) throw new Error("CMS_TERMINAL_MATRIX_DUPLICATE_SURFACE");
  const sourceControls = array(inventory.sourceControls, "CMS_TERMINAL_SOURCE_CONTROLS_INVALID");
  const matrix = matrixInput.map((surface) =>
    materializeSurface(
      surface,
      sourceControls,
      proofs,
      candidateSha,
      semanticActionLedger,
      semanticScenarioLedgers,
      semanticStateSetupLedger,
      publicConsumerLedger,
      semanticReferenceOwners,
    ),
  );
  for (const key of semanticActionLedger.keys()) {
    if (!semanticReferenceOwners.has(key)) {
      throw new Error(`CMS_TERMINAL_SEMANTIC_ACTION_UNBOUND:${key}`);
    }
  }
  for (const [kind, ledger] of Object.entries(semanticScenarioLedgers)) {
    for (const key of ledger.keys()) {
      if (!semanticReferenceOwners.has(key)) {
        throw new Error(`CMS_TERMINAL_SEMANTIC_${kind.toUpperCase()}_UNBOUND:${key}`);
      }
    }
  }
  if (publicConsumerLedger.size) {
    throw new Error(`CMS_TERMINAL_PUBLIC_CONSUMER_UNBOUND:${[...publicConsumerLedger.keys()].sort()[0]}`);
  }
  const terminalSurfaceById = new Map(matrix.map((surface) => [surface.id, surface]));
  const requirementsCoverage = record(inventory.requirementsCoverage, "CMS_TERMINAL_REQUIREMENTS_INVALID");
  const report = {
    schemaVersion: CMS_TERMINAL_COVERAGE_SCHEMA_VERSION,
    generatedAt: runtime.generatedAt,
    status: "passed",
    environment,
    candidateSha,
    runTag,
    sourceDirty: false,
    credentialsPersisted: false,
    syntheticEntityIdentifiersInTerminalReport: false,
    classificationPolicy: inventory.classificationPolicy,
    documentationCrossCheck: inventory.documentationCrossCheck,
    requirementsCoverage: {
      functional: array(requirementsCoverage.functional, "CMS_TERMINAL_FUNCTIONAL_INVALID").map((item) =>
        materializeRequirement(item, terminalSurfaceById),
      ),
      businessRules: array(requirementsCoverage.businessRules, "CMS_TERMINAL_BUSINESS_RULES_INVALID").map(
        (item) => materializeRequirement(item, terminalSurfaceById),
      ),
    },
    redesignDivergences: materializeRedesignDivergences(inventory.redesignDivergences, terminalSurfaceById),
    productPimAuthority: materializeProductPimAuthority(inventory.productPimAuthority, terminalSurfaceById),
    siteBaseline: {
      navigation: siteBaseline.navigation,
      siteSettings: siteBaseline.siteSettings,
      workflow: siteBaseline.workflow,
      aal2: true,
      audit: true,
      public: true,
      ownerAuthored: true,
      baselineOwner: siteBaseline.baselineOwner,
      actorOutsideQaLease: true,
      qaLeaseActorUsed: false,
      mutationTransport: "cms-ui-only",
      canonicalRepositoryDataVerified: true,
      navigationTerminalState: siteBaseline.navigationTerminalState,
      siteSettingsTerminalState: siteBaseline.siteSettingsTerminalState,
      publicShellVerifiedAfterRestore: true,
      idsPersisted: false,
    },
    terminalArchivedTombstone: {
      ...cleanupReport.terminalArchivedTombstone,
    },
    semanticActionManifest: [...semanticActionLedger.entries()]
      .map(([controlContractKey, action]) => ({
        schemaVersion: action.schemaVersion,
        surfaceId: action.surfaceId,
        controlName: action.controlName,
        controlOccurrence: action.controlOccurrence,
        controlContractKey,
        actions: action.actions,
        scenarioIds: action.scenarioIds,
        evidenceKind: action.evidenceKind,
        backendStatus: action.backendStatus,
        httpStatus: action.httpStatus,
        status: action.status,
        evidenceReference: action.evidenceReference,
      }))
      .sort((left, right) => left.controlContractKey.localeCompare(right.controlContractKey)),
    semanticFieldManifest: [...semanticScenarioLedgers.fields.entries()]
      .map(([fieldContractKey, field]) => ({
        schemaVersion: field.schemaVersion,
        surfaceId: field.surfaceId,
        fieldName: field.fieldName,
        fieldOccurrence: field.fieldOccurrence,
        fieldContractKey,
        mode: field.mode,
        schemaReference: field.schemaReference,
        caseResults: fieldCases.map((caseId) => ({
          caseId,
          ...terminalDisposition(field.cases[caseId]),
        })),
        persistence: terminalDisposition(field.persistence),
        backend: terminalDisposition(field.backend),
        audit: terminalDisposition(field.audit),
        evidenceReference: field.evidenceReference,
        status: field.status,
      }))
      .sort((left, right) => left.fieldContractKey.localeCompare(right.fieldContractKey)),
    semanticStructureManifest: [...semanticScenarioLedgers.structures.entries()]
      .map(([structureContractKey, structure]) => ({
        schemaVersion: structure.schemaVersion,
        surfaceId: structure.surfaceId,
        controlKind: structure.controlKind,
        controlName: structure.controlName,
        controlOccurrence: structure.controlOccurrence,
        structureContractKey,
        scenarioId: structure.scenarioId,
        effectKind: structure.effectKind,
        httpStatus: structure.httpStatus,
        evidenceReference: structure.evidenceReference,
        status: structure.status,
      }))
      .sort((left, right) => left.structureContractKey.localeCompare(right.structureContractKey)),
    semanticStateSetupManifest: [...semanticStateSetupLedger.entries()]
      .map(([stateContractKey, setup]) => ({
        schemaVersion: setup.schemaVersion,
        surfaceId: setup.surfaceId,
        stateId: setup.stateId,
        stateContractKey,
        scenarioId: setup.scenarioId,
        evidenceReference: setup.evidenceReference,
        mutationFree: true,
        observedMutationRequests: 0,
        triggerObserved: true,
        stateObserved: true,
        restored: true,
        status: "passed",
      }))
      .sort((left, right) => left.stateContractKey.localeCompare(right.stateContractKey)),
    counts: {
      ...inventory.counts,
      terminalSurfaces: matrix.length,
      terminalSourceControlBindings: matrix.reduce(
        (total, surface) => total + surface.sourceControlResults.length,
        0,
      ),
      terminalSourceControlNotApplicable: matrix.reduce(
        (total, surface) =>
          total +
          surface.sourceControlResults.filter((control) => control.testState === "not-applicable").length,
        0,
      ),
      terminalRuntimeControlExecutions: matrix.reduce(
        (total, surface) => total + surface.runtimeControls.length,
        0,
      ),
      terminalScenarioOnceExecutions: semanticReferenceOwners.size,
      terminalSemanticStateSetups: semanticStateSetupLedger.size,
    },
    evidenceManifest: {
      ...evidenceManifestFileNames(environment),
      realBrowserStatus: realBrowserSummary.status,
      realBrowserChannel: realBrowserSummary.channel,
      realBrowserCanonicalFrontendReleaseBound: realBrowserSummary.canonicalFrontendReleaseBound,
      realBrowserBackendAccepted: realBrowserSummary.backendAccepted,
      realBrowserSuccessLocator: realBrowserSummary.successLocator,
      realBrowserSuccessLocatorObserved: realBrowserSummary.successLocatorObserved,
      realBrowserOfficialWidgetObserved: realBrowserSummary.officialWidgetObserved,
      realBrowserCDataBound: realBrowserSummary.cDataBound,
      realBrowserTokenCaptured: realBrowserSummary.tokenCaptured,
      realBrowserVariableCleared: realBrowserSummary.variableCleared,
      realBrowserScreenshotSha256: realBrowserSummary.screenshotSha256,
      realBrowserScreenshotBytes: realBrowserSummary.screenshotBytes,
      shaBinding: candidateSha,
      allReportsPassed: true,
      setupStatus: setupReport.status,
      cleanupStatus: cleanupReport.status,
      residueStatus: residueReport.status,
    },
    matrix,
  };
  return assertCmsTerminalCoverage(report);
}

function readJsonFile(path, code) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 2 || stat.size > 64 * 1024 * 1024) {
    throw new Error(`${code}_FILE_REFUSED`);
  }
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${code}_JSON_INVALID`);
  }
}

function option(args, name) {
  const index = args.indexOf(name);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) {
    throw new Error(`CMS_TERMINAL_OPTION_REQUIRED:${name}`);
  }
  return args[index + 1];
}

function writeTerminalReport(destination, report) {
  const output = resolve(repositoryRoot, destination);
  const fromRoot = relative(repositoryRoot, output);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("CMS_TERMINAL_OUTPUT_PATH_REFUSED");
  }
  mkdirSync(dirname(output), { recursive: true });
  const temporary = `${output}.tmp-${process.pid}`;
  try {
    writeFileSync(temporary, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    assertCmsTerminalCoverage(readJsonFile(temporary, "CMS_TERMINAL_OUTPUT"));
    renameSync(temporary, output);
  } finally {
    rmSync(temporary, { force: true });
  }
}

function runCli(args) {
  const paths = Object.fromEntries(
    ["inventory", "runtime", "setup", "cleanup", "residue", ...evidenceLabels].map((name) => [
      name,
      resolve(repositoryRoot, option(args, `--${name}`)),
    ]),
  );
  const realBrowserPath = resolve(repositoryRoot, option(args, "--real-browser"));
  const realBrowserScreenshotPath = resolve(repositoryRoot, option(args, "--real-browser-screenshot"));
  const realBrowserReport = readJsonFile(realBrowserPath, "CMS_TERMINAL_REAL_BROWSER");
  const realBrowserScreenshot = readFileSync(realBrowserScreenshotPath);
  const candidateSha = option(args, "--sha");
  const environment = option(args, "--environment");
  assertConsumedRealBrowserEvidence({
    report: realBrowserReport,
    screenshot: realBrowserScreenshot,
    expected: {
      environment,
      candidateSha,
      runId: option(args, "--run-id"),
      runAttempt: Number(option(args, "--run-attempt")),
      controlSha: option(args, "--control-sha"),
    },
  });
  const report = materializeCmsTerminalCoverage({
    inventory: readJsonFile(paths.inventory, "CMS_TERMINAL_INVENTORY"),
    runtime: readJsonFile(paths.runtime, "CMS_TERMINAL_RUNTIME"),
    reports: Object.fromEntries(
      ["setup", "cleanup", "residue", ...evidenceLabels].map((label) => [
        label,
        readJsonFile(paths[label], `CMS_TERMINAL_${label.toUpperCase()}`),
      ]),
    ),
    realBrowser: {
      status: "passed",
      environment,
      candidateSha,
      runTag: realBrowserReport.runTag,
      channel: "iab-workflow-dispatch-hmac",
      canonicalFrontendReleaseBound:
        realBrowserReport.documentReleaseSha === candidateSha &&
        realBrowserReport.healthReleaseSha === candidateSha &&
        realBrowserReport.deploymentIdentityObserved === true,
      backendAccepted: realBrowserReport.responseStatus === 201,
      successLocator: '[data-form-submission-status="success"]',
      successLocatorObserved: realBrowserReport.uiSuccessObserved,
      officialWidgetObserved: realBrowserReport.turnstile?.officialWidgetObserved,
      cDataBound: realBrowserReport.turnstile?.cDataBound,
      tokenCaptured: realBrowserReport.turnstile?.tokenCaptured,
      variableCleared: realBrowserReport.variableCleared,
      screenshotSha256: realBrowserReport.screenshot?.sha256,
      screenshotBytes: realBrowserReport.screenshot?.bytes,
    },
    candidateSha,
    environment,
  });
  writeTerminalReport(option(args, "--output"), report);
  process.stdout.write(
    `${JSON.stringify({ status: report.status, candidateSha: report.candidateSha, surfaces: report.matrix.length })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    runCli(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "CMS_TERMINAL_UNKNOWN_ERROR"}\n`);
    process.exitCode = 1;
  }
}
