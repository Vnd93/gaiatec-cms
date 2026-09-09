import { readdir, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  canonicalTextSha256,
  resolveG12EvidenceRepositoryPath,
  validateCanaryEvidenceBinding,
} from "./release-guard-lib.mjs";
import { STAGING_AUTH_REDIRECT_ALLOW_LIST, STAGING_AUTH_SITE_ORIGIN } from "./staging-auth-config-lib.mjs";
import { assertCmsTerminalCoverage } from "../../qa/materialize-cms-terminal-coverage.mjs";
import { assertConsumedRealBrowserEvidence } from "./real-browser-release-evidence-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function uniqueFile(root, basename) {
  const matches = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error("G12_STAGING_ARTIFACT_SYMLINK_REFUSED");
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && entry.name === basename) matches.push(path);
      else if (!entry.isFile()) throw new Error("G12_STAGING_ARTIFACT_ENTRY_REFUSED");
    }
  }
  await walk(root);
  if (matches.length !== 1) throw new Error(`G12_STAGING_ARTIFACT_FILE_REFUSED:${basename}`);
  return matches[0];
}

const relativeFile = argument("file");
const artifactDirectory = argument("artifact-dir");
if (!relativeFile || !artifactDirectory) throw new Error("G12_STAGING_ARTIFACT_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`)) throw new Error("G12_STAGING_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
const control = record?.g12Evidence;
const evidenceFile = resolveG12EvidenceRepositoryPath(control?.file);
if (!evidenceFile) throw new Error("G12_STAGING_EVIDENCE_PATH_REFUSED");
const versionedPath = resolve(evidenceFile);
if (dirname(versionedPath) !== resolve(".github/release-controls/evidence"))
  throw new Error("G12_STAGING_EVIDENCE_PATH_REFUSED");
const root = resolve(artifactDirectory);
const [
  downloadedPath,
  bindingsPath,
  coveragePath,
  authPath,
  adminOpsPath,
  secondaryPath,
  securityPath,
  uiCreatedStatePath,
  realBrowserAttestationPath,
  realBrowserScreenshotPath,
  mutatingSetupPath,
  mutatingCleanupPath,
  mutatingResiduePath,
  inventoryPath,
  terminalCoveragePath,
  authConfigPath,
  rollbackCoveragePath,
  rollbackSetupPath,
  rollbackCleanupPath,
  rollbackInventoryPath,
  versionedBytes,
] = await Promise.all([
  uniqueFile(root, "g12-canary.json"),
  uniqueFile(root, "staging-artifact-bindings.json"),
  uniqueFile(root, "cms-final-coverage.json"),
  uniqueFile(root, "cms-auth-lifecycle.json"),
  uniqueFile(root, "cms-admin-ops-cycles.json"),
  uniqueFile(root, "cms-secondary-ui-cycles.json"),
  uniqueFile(root, "cms-security-boundaries.json"),
  uniqueFile(root, "cms-ui-created-state.json"),
  uniqueFile(root, "cms-real-browser-attestation.json"),
  uniqueFile(root, "cms-real-browser-attestation.png"),
  uniqueFile(root, "cms-browser-mutating-setup.json"),
  uniqueFile(root, "cms-browser-mutating-cleanup.json"),
  uniqueFile(root, "cms-browser-mutating-residue.json"),
  uniqueFile(root, "g12-cms-coverage-matrix.json"),
  uniqueFile(root, "cms-terminal-coverage-matrix.json"),
  uniqueFile(root, "g12-staging-auth.json"),
  uniqueFile(root, "cms-rollback-authenticated-compatibility.json"),
  uniqueFile(root, "cms-browser-rollback-setup.json"),
  uniqueFile(root, "cms-browser-rollback-cleanup.json"),
  uniqueFile(root, "cms-coverage-rollback.json"),
  readFile(versionedPath),
]);
const [
  downloadedBytes,
  bindingsBytes,
  coverageBytes,
  authBytes,
  adminOpsBytes,
  secondaryBytes,
  securityBytes,
  uiCreatedStateBytes,
  realBrowserAttestationBytes,
  realBrowserScreenshotBytes,
  mutatingSetupBytes,
  mutatingCleanupBytes,
  mutatingResidueBytes,
  inventoryBytes,
  terminalCoverageBytes,
  authConfigBytes,
  rollbackCoverageBytes,
  rollbackSetupBytes,
  rollbackCleanupBytes,
  rollbackInventoryBytes,
] = await Promise.all([
  readFile(downloadedPath),
  readFile(bindingsPath),
  readFile(coveragePath),
  readFile(authPath),
  readFile(adminOpsPath),
  readFile(secondaryPath),
  readFile(securityPath),
  readFile(uiCreatedStatePath),
  readFile(realBrowserAttestationPath),
  readFile(realBrowserScreenshotPath),
  readFile(mutatingSetupPath),
  readFile(mutatingCleanupPath),
  readFile(mutatingResiduePath),
  readFile(inventoryPath),
  readFile(terminalCoveragePath),
  readFile(authConfigPath),
  readFile(rollbackCoveragePath),
  readFile(rollbackSetupPath),
  readFile(rollbackCleanupPath),
  readFile(rollbackInventoryPath),
]);
if (
  canonicalTextSha256(downloadedBytes) !== control.reportSha256 ||
  canonicalTextSha256(versionedBytes) !== control.reportSha256 ||
  downloadedBytes.toString("utf8").replace(/\r\n?/g, "\n") !==
    versionedBytes.toString("utf8").replace(/\r\n?/g, "\n")
)
  throw new Error("G12_STAGING_DOWNLOADED_EVIDENCE_DIGEST_REFUSED");
const evidence = JSON.parse(downloadedBytes.toString("utf8"));
const result = validateCanaryEvidenceBinding(record, evidence, {
  reportSha256: canonicalTextSha256(downloadedBytes),
});
if (!result.valid) throw new Error(`G12_STAGING_DOWNLOADED_EVIDENCE_REFUSED:${result.violations.join(",")}`);
const bindings = JSON.parse(bindingsBytes.toString("utf8"));
if (
  bindings?.schemaVersion !== 1 ||
  bindings?.event !== "g12.staging.artifacts.bound" ||
  bindings?.candidateSha !== record.candidateSha ||
  String(bindings?.candidate?.id ?? "") !== control.candidateArtifactId ||
  bindings?.candidate?.digest !== control.candidateArtifactDigest ||
  bindings?.candidate?.archiveSha256 !== control.candidateArchiveSha256 ||
  bindings?.candidate?.treeSha256 !== control.candidateTreeSha256
)
  throw new Error("G12_STAGING_CANDIDATE_BINDING_REFUSED");
const coverage = JSON.parse(coverageBytes.toString("utf8"));
const auth = JSON.parse(authBytes.toString("utf8"));
const adminOps = JSON.parse(adminOpsBytes.toString("utf8"));
const secondary = JSON.parse(secondaryBytes.toString("utf8"));
const security = JSON.parse(securityBytes.toString("utf8"));
const uiCreatedState = JSON.parse(uiCreatedStateBytes.toString("utf8"));
const realBrowserAttestation = JSON.parse(realBrowserAttestationBytes.toString("utf8"));
const mutatingSetup = JSON.parse(mutatingSetupBytes.toString("utf8"));
const mutatingCleanup = JSON.parse(mutatingCleanupBytes.toString("utf8"));
const mutatingResidue = JSON.parse(mutatingResidueBytes.toString("utf8"));
const inventory = JSON.parse(inventoryBytes.toString("utf8"));
const terminalCoverage = assertCmsTerminalCoverage(JSON.parse(terminalCoverageBytes.toString("utf8")));
const authConfig = JSON.parse(authConfigBytes.toString("utf8"));
const rollbackCoverage = JSON.parse(rollbackCoverageBytes.toString("utf8"));
const rollbackSetup = JSON.parse(rollbackSetupBytes.toString("utf8"));
const rollbackCleanup = JSON.parse(rollbackCleanupBytes.toString("utf8"));
const rollbackInventory = JSON.parse(rollbackInventoryBytes.toString("utf8"));
const runTag = adminOps?.runTag;
assertConsumedRealBrowserEvidence({
  report: realBrowserAttestation,
  screenshot: realBrowserScreenshotBytes,
  expected: {
    environment: "staging",
    candidateSha: record.candidateSha,
    runId: String(record.g12Evidence.runId),
    runAttempt: Number(record.g12Evidence.runAttempt),
    runTag,
    controlSha: record.g12Evidence.headSha,
  },
});
const rollbackSha = record?.rollback?.release;
const rollbackSurfaceIds = (rollbackInventory?.matrix ?? [])
  .filter((item) => item?.testMode === "authenticated")
  .map((item) => item.id)
  .sort();
const observedRollbackSurfaceIds = (rollbackCoverage?.authenticated?.observations ?? [])
  .map((item) => item?.surfaceId)
  .sort();
const rollbackAuthSteps = new Set(
  (rollbackCoverage?.authenticated?.authJourney ?? []).map((item) => item?.step),
);
const requiredAuthLifecycleScenarios = [
  "real_recovery_link_password_and_mfa",
  "recovery_account_enumeration_resistance",
  "new_auth_identity_invite_activation_and_mfa",
  "silent_session_refresh_real_backend",
  "single_use_action_links",
  "auth_profile_and_immutable_audit_persistence",
  "effective_cms_session_revocation",
  "expired_session_rejected_refresh",
  "mfa_cancel_signout",
];
const requiredAuthSurfaces = ["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"];
const requiredAuthViewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
];
const requiredAuthSemanticExecutions = [
  "auth-login.sign-in",
  "auth-login.forgot-password",
  "auth-recovery.request-link",
  "auth-recovery.back-to-login",
  "auth-set-password.save-password",
  "auth-mfa.verify",
  "auth-mfa.configure-authenticator",
  "auth-mfa.cancel-and-sign-out",
];
const requiredAuthControlCounts = {
  "auth-login": { controls: 5, fields: 2, actions: 1, links: 1, forms: 1 },
  "auth-recovery": { controls: 4, fields: 1, actions: 1, links: 1, forms: 1 },
  "auth-set-password": { controls: 4, fields: 2, actions: 1, links: 0, forms: 1 },
  "auth-mfa": { controls: 5, fields: 1, actions: 3, links: 0, forms: 1 },
};
const semanticSegment = (value) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "unnamed";
const semanticFieldKey = (surfaceId, fieldName, occurrence) =>
  `field|${semanticSegment(surfaceId)}|${semanticSegment(fieldName)}|${occurrence}`;
const semanticStructureKey = (surfaceId, kind, name, occurrence) =>
  `${kind}|${semanticSegment(surfaceId)}|${semanticSegment(name)}|${occurrence}`;
const validSemanticReference = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  !value.startsWith("dom:") &&
  !/focus|observation/i.test(value);
const validAuthScenarioDisposition = (entry, report, proofKinds, notApplicableBasis) => {
  if (!entry || typeof entry !== "object") return false;
  if (entry.applicability === "exercised") {
    return (
      typeof entry.scenarioId === "string" &&
      report?.scenarios?.some(
        (scenario) => scenario?.id === entry.scenarioId && scenario?.status === "passed",
      ) &&
      proofKinds.includes(entry.proofKind) &&
      validSemanticReference(entry.evidenceReference) &&
      typeof entry.expectedResult === "string" &&
      entry.expectedResult.length > 0 &&
      typeof entry.observedResult === "string" &&
      entry.observedResult.length > 0 &&
      (entry.proofKind !== "backend-response" ||
        (Number.isInteger(entry.httpStatus) && entry.httpStatus >= 200 && entry.httpStatus < 300))
    );
  }
  return (
    entry.applicability === "not-applicable" &&
    notApplicableBasis.includes(entry.basisCode) &&
    typeof entry.justification === "string" &&
    entry.justification.length >= 16 &&
    typeof entry.documentationReference === "string" &&
    /^(?:src|docs|supabase)\//.test(entry.documentationReference)
  );
};
const authSemanticFieldPassed = (entry, report) => {
  const cases = entry?.cases;
  const caseNames = ["valid", "absent", "invalid", "lower-boundary", "upper-boundary"];
  if (
    entry?.schemaVersion !== 1 ||
    entry?.status !== "passed" ||
    entry?.mode !== "editable" ||
    !requiredAuthSurfaces.includes(entry?.surfaceId) ||
    !Number.isInteger(entry?.fieldOccurrence) ||
    entry.fieldOccurrence < 0 ||
    entry?.fieldContractKey !== semanticFieldKey(entry.surfaceId, entry.fieldName, entry.fieldOccurrence) ||
    !/^(?:src|docs|supabase)\//.test(entry?.schemaReference ?? "") ||
    !cases ||
    JSON.stringify(Object.keys(cases).sort()) !== JSON.stringify([...caseNames].sort())
  )
    return false;
  const allowedNotApplicable = {
    valid: [],
    absent: ["field-optional-by-schema"],
    invalid: ["schema-defines-no-invalid-representation"],
    "lower-boundary": ["schema-defines-no-lower-bound"],
    "upper-boundary": ["schema-defines-no-upper-bound"],
  };
  return (
    caseNames.every((caseName) =>
      validAuthScenarioDisposition(
        cases[caseName],
        report,
        ["ui-validation", "backend-validation"],
        allowedNotApplicable[caseName],
      ),
    ) &&
    validAuthScenarioDisposition(
      entry.persistence,
      report,
      ["reload-persistence"],
      ["security-prohibits-secret-persistence", "transient-query-field"],
    ) &&
    validAuthScenarioDisposition(entry.backend, report, ["backend-response"], []) &&
    validAuthScenarioDisposition(
      entry.audit,
      report,
      ["immutable-audit"],
      ["security-sensitive-value-not-audited", "non-mutating-query-not-audited"],
    )
  );
};
const authSemanticStructurePassed = (entry, report) =>
  entry?.schemaVersion === 1 &&
  entry?.status === "passed" &&
  entry?.controlKind === "form" &&
  requiredAuthSurfaces.includes(entry?.surfaceId) &&
  Number.isInteger(entry?.controlOccurrence) &&
  entry.controlOccurrence >= 0 &&
  entry?.structureContractKey ===
    semanticStructureKey(entry.surfaceId, "form", entry.controlName, entry.controlOccurrence) &&
  report?.scenarios?.some((scenario) => scenario?.id === entry.scenarioId && scenario?.status === "passed") &&
  validSemanticReference(entry.openedEvidenceReference) &&
  validSemanticReference(entry.submittedOrConfirmedEvidenceReference) &&
  ["backend-response", "navigation-response", "state-transition"].includes(entry.effectKind) &&
  validSemanticReference(entry.effectEvidenceReference) &&
  (entry.effectKind === "state-transition" ||
    (Number.isInteger(entry.httpStatus) && entry.httpStatus >= 200 && entry.httpStatus < 400)) &&
  validSemanticReference(entry.restoredOrClosedEvidenceReference);
const authSurfaceCoveragePassed = (report) => {
  const coverage = report?.authSurfaceCoverage;
  const entries = coverage?.entries;
  const semanticExecutions = coverage?.semanticExecutions;
  const semanticActions = report?.semanticActions;
  const semanticFields = report?.semanticFields;
  const semanticStructures = report?.semanticStructures;
  if (
    coverage?.status !== "passed" ||
    JSON.stringify(coverage?.viewports) !== JSON.stringify(requiredAuthViewports) ||
    !Array.isArray(entries) ||
    !Array.isArray(semanticExecutions) ||
    !Array.isArray(semanticActions) ||
    !Array.isArray(semanticFields) ||
    semanticFields.length !== 6 ||
    new Set(semanticFields.map((field) => field?.fieldContractKey)).size !== semanticFields.length ||
    semanticFields.some((field) => !authSemanticFieldPassed(field, report)) ||
    !Array.isArray(semanticStructures) ||
    semanticStructures.length !== 4 ||
    new Set(semanticStructures.map((structure) => structure?.structureContractKey)).size !==
      semanticStructures.length ||
    semanticStructures.some((structure) => !authSemanticStructurePassed(structure, report)) ||
    new Set(semanticActions.map((action) => action?.controlContractKey)).size !== semanticActions.length ||
    semanticActions.some(
      (action) =>
        action?.schemaVersion !== 1 ||
        !requiredAuthSurfaces.includes(action?.surfaceId) ||
        typeof action?.controlName !== "string" ||
        !Number.isInteger(action?.controlOccurrence) ||
        action.controlOccurrence < 0 ||
        action?.controlContractKey !==
          `${action.surfaceId}|${action.controlName
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 80)}|${action.controlOccurrence}` ||
        action?.handlerExecuted !== true ||
        action?.evidenceKind !== "backend-response" ||
        action?.status !== "passed" ||
        !Number.isInteger(action?.httpStatus) ||
        action.httpStatus < 200 ||
        action.httpStatus >= 300 ||
        typeof action?.backendStatus !== "string" ||
        action.backendStatus.length === 0 ||
        !Array.isArray(action?.actions) ||
        action.actions.length === 0 ||
        !Array.isArray(action?.scenarioIds) ||
        action.scenarioIds.length === 0 ||
        action.scenarioIds.some(
          (scenarioId) =>
            !report?.scenarios?.some(
              (scenario) => scenario?.id === scenarioId && scenario?.status === "passed",
            ),
        ),
    ) ||
    semanticExecutions.length !== requiredAuthSemanticExecutions.length ||
    requiredAuthSemanticExecutions.some(
      (id) =>
        !semanticExecutions.some(
          (execution) =>
            execution?.id === id &&
            execution?.result === "passed" &&
            ["real-browser-real-backend", "real-browser-navigation"].includes(execution?.proof) &&
            report?.scenarios?.some(
              (scenario) => scenario?.id === execution?.scenarioId && scenario?.status === "passed",
            ),
        ),
    )
  )
    return false;
  const validEntry = (entry) => {
    const expected = requiredAuthControlCounts[entry?.surfaceId];
    const runtimeExecutions = entry?.semanticExecutions;
    const sourceContract = entry?.sourceControlContract;
    if (
      !expected ||
      entry?.status !== "passed" ||
      !requiredAuthViewports.some(
        (viewport) =>
          entry?.viewport?.name === viewport.name &&
          entry?.viewport?.width === viewport.width &&
          entry?.viewport?.height === viewport.height,
      ) ||
      !Array.isArray(entry?.controls) ||
      entry.controls.length !== expected.controls ||
      new Set(entry.controls).size !== entry.controls.length ||
      !Array.isArray(entry?.actions) ||
      entry.actions.length !== expected.actions ||
      entry.fieldsSeen !== expected.fields ||
      entry.fieldsExercised !== expected.fields ||
      entry.actionsSeen !== expected.actions ||
      entry.actionsExecuted !== 0 ||
      entry.actionsExecutionReferenced !== expected.actions ||
      entry.actionsStateAsserted !== 0 ||
      entry.actionsSeen !==
        entry.actionsExecuted + entry.actionsExecutionReferenced + entry.actionsStateAsserted ||
      entry.linksSeen !== expected.links ||
      entry.linksExecuted !== expected.links ||
      entry.formsSeen !== expected.forms ||
      entry.formsValidated !== expected.forms ||
      entry.horizontalOverflow !== false ||
      !Array.isArray(entry?.unsupported) ||
      entry.unsupported.length !== 0 ||
      !Array.isArray(entry?.failures) ||
      entry.failures.length !== 0 ||
      !Array.isArray(entry?.semanticBindings) ||
      entry.semanticBindings.length !== expected.controls ||
      !Array.isArray(runtimeExecutions) ||
      runtimeExecutions.length !== expected.controls ||
      sourceContract?.status !== "passed" ||
      !Array.isArray(sourceContract?.failures) ||
      sourceContract.failures.length !== 0 ||
      !Array.isArray(sourceContract?.mappings) ||
      sourceContract.mappings.length !== expected.controls
    )
      return false;
    const runtimeIds = new Set(runtimeExecutions.map((execution) => execution?.controlId));
    if (runtimeIds.size !== expected.controls || entry.controls.some((id) => !runtimeIds.has(id)))
      return false;
    if (
      runtimeExecutions.some((execution) => {
        if (
          execution?.schemaVersion !== 1 ||
          execution?.surfaceId !== entry.surfaceId ||
          execution?.viewport !== entry.viewport.name ||
          execution?.handlerExecuted !== true ||
          execution?.status !== "passed" ||
          execution?.restored !== true ||
          typeof execution?.evidenceReference !== "string" ||
          execution.evidenceReference.length === 0 ||
          ["focus-only", "observation-only"].includes(execution?.evidenceKind)
        )
          return true;
        if (execution?.classification?.startsWith("field.")) {
          return (
            execution?.executionScope !== "scenario-once" ||
            execution?.evidenceKind !== "scenario-contract" ||
            !semanticFields.some(
              (field) =>
                field.fieldContractKey === execution.semanticExecutionRef &&
                field.surfaceId === execution.surfaceId &&
                field.fieldName === execution.name &&
                field.fieldOccurrence === execution.ordinal &&
                execution.evidenceReference.endsWith(`#semanticFields/${field.fieldContractKey}`),
            )
          );
        }
        if (execution?.classification === "structure.form") {
          return (
            execution?.executionScope !== "scenario-once" ||
            execution?.evidenceKind !== "scenario-contract" ||
            !semanticStructures.some(
              (structure) =>
                structure.structureContractKey === execution.semanticExecutionRef &&
                structure.surfaceId === execution.surfaceId &&
                structure.controlName === execution.name &&
                structure.controlOccurrence === execution.ordinal &&
                execution.evidenceReference.endsWith(`#semanticStructures/${structure.structureContractKey}`),
            )
          );
        }
        if (execution?.classification === "action.mutating") {
          return (
            execution?.executionScope !== "scenario-once" ||
            execution?.evidenceKind !== "backend-response" ||
            !semanticActions.some(
              (action) =>
                action.controlContractKey === execution.semanticExecutionRef &&
                action.surfaceId === execution.surfaceId &&
                action.controlName === execution.name &&
                action.controlOccurrence === execution.ordinal,
            )
          );
        }
        return (
          execution?.executionScope !== "viewport-local" ||
          execution?.semanticExecutionRef !== null ||
          execution?.classification !== "navigation.link" ||
          execution?.evidenceKind !== "navigation-response"
        );
      })
    )
      return false;
    if (
      entry.actions.some(
        (action) =>
          action?.executionScope !== "scenario-once" ||
          !entry.controls.includes(action?.controlId) ||
          !runtimeExecutions.some(
            (execution) =>
              execution.controlId === action.controlId &&
              execution.name === action.controlName &&
              execution.semanticExecutionRef === action.semanticExecutionRef,
          ) ||
          !semanticActions.some(
            (proof) =>
              proof.controlContractKey === action.semanticExecutionRef &&
              proof.surfaceId === entry.surfaceId &&
              proof.controlName === action.controlName,
          ),
      )
    )
      return false;
    return sourceContract.mappings.every(
      (mapping) =>
        mapping?.schemaVersion === 1 &&
        mapping?.surfaceId === entry.surfaceId &&
        mapping?.viewport === entry.viewport.name &&
        mapping?.handlerExecuted === true &&
        mapping?.status === "passed" &&
        typeof mapping?.runtimeControlName === "string" &&
        Number.isInteger(mapping?.runtimeControlOccurrence) &&
        !["focus-only", "observation-only"].includes(mapping?.evidenceKind) &&
        typeof mapping?.evidenceReference === "string" &&
        mapping.evidenceReference.length > 0,
    );
  };
  return (
    entries.length === requiredAuthSurfaces.length * requiredAuthViewports.length &&
    entries.every(validEntry) &&
    requiredAuthSurfaces.every((surfaceId) =>
      requiredAuthViewports.every((viewport) =>
        entries.some(
          (entry) =>
            entry.surfaceId === surfaceId &&
            entry.viewport.name === viewport.name &&
            entry.viewport.width === viewport.width &&
            entry.viewport.height === viewport.height,
        ),
      ),
    )
  );
};
const browserObserverPassed = (report) =>
  report?.browserObservability?.status === "passed" &&
  report.browserObservability.unexpectedConsole === 0 &&
  report.browserObservability.unexpectedHttp === 0 &&
  report.browserObservability.requestFailures === 0 &&
  report.browserObservability.secretsPersisted === false &&
  Array.isArray(report.browserObservability.expectedHttp);
const terminalTombstonePassed = (value) =>
  value?.classification === "terminalArchivedTombstone" &&
  value?.count === 1 &&
  value?.statusCode === 410 &&
  value?.destinationAbsent === true &&
  value?.itemArchived === true &&
  value?.publicationCount === 0 &&
  value?.projectionCount === 0 &&
  value?.actionableOutboxCount === 0 &&
  value?.piiExposed === false &&
  !("itemId" in value) &&
  !("path" in value);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uiCreatedIds = [
  uiCreatedState?.lease?.actorId,
  ...Object.values(uiCreatedState?.ids ?? {}),
  uiCreatedState?.form?.id,
  uiCreatedState?.form?.versionId,
];
if (
  inventory?.schemaVersion !== 1 ||
  inventory?.sourceSha !== record.candidateSha ||
  inventory?.sourceDirty !== false ||
  !Array.isArray(inventory?.matrix) ||
  inventory.matrix.length === 0 ||
  mutatingSetup?.schemaVersion !== 1 ||
  mutatingSetup?.status !== "ready" ||
  mutatingSetup?.environment !== "staging" ||
  mutatingSetup?.candidateSha !== record.candidateSha ||
  mutatingSetup?.runTag !== runTag ||
  mutatingSetup?.fixtureProvisioning !== "actors-and-prerequisites-only" ||
  mutatingSetup?.editorialEntitiesCreatedByFixture !== 0 ||
  mutatingSetup?.formsCreatedByFixture !== 0 ||
  mutatingSetup?.leadsCreatedByFixture !== 0 ||
  mutatingSetup?.credentialsInStateOrReport !== false ||
  mutatingCleanup?.schemaVersion !== 1 ||
  mutatingCleanup?.status !== "cleaned" ||
  mutatingCleanup?.environment !== "staging" ||
  mutatingCleanup?.candidateSha !== record.candidateSha ||
  mutatingCleanup?.runTag !== runTag ||
  mutatingCleanup?.activeResidue !== 0 ||
  mutatingCleanup?.auditRetained !== true ||
  mutatingCleanup?.activePublications !== 0 ||
  mutatingCleanup?.publishedProjections !== 0 ||
  mutatingCleanup?.actionablePublicationOutbox !== 0 ||
  mutatingCleanup?.actionableLeadOutbox !== 0 ||
  mutatingCleanup?.activeCredentials !== 0 ||
  mutatingCleanup?.activeSessions !== 0 ||
  !terminalTombstonePassed(mutatingCleanup?.terminalArchivedTombstone) ||
  mutatingResidue?.schemaVersion !== 1 ||
  mutatingResidue?.status !== "passed" ||
  mutatingResidue?.environment !== "staging" ||
  mutatingResidue?.candidateSha !== record.candidateSha ||
  mutatingResidue?.runTag !== runTag ||
  mutatingResidue?.activeResidue !== 0 ||
  mutatingResidue?.activeLeases !== 0 ||
  mutatingResidue?.activeSessions !== 0 ||
  mutatingResidue?.auditRetained !== true ||
  !terminalTombstonePassed(mutatingResidue?.terminalArchivedTombstone) ||
  terminalCoverage?.environment !== "staging" ||
  terminalCoverage?.candidateSha !== record.candidateSha ||
  terminalCoverage?.runTag !== runTag ||
  terminalCoverage?.sourceDirty !== false ||
  terminalCoverage?.credentialsPersisted !== false ||
  terminalCoverage?.syntheticEntityIdentifiersInTerminalReport !== false ||
  terminalCoverage?.evidenceManifest?.inventory !== "g12-cms-coverage-matrix.json" ||
  terminalCoverage?.evidenceManifest?.setupStatus !== "ready" ||
  terminalCoverage?.evidenceManifest?.cleanupStatus !== "cleaned" ||
  terminalCoverage?.evidenceManifest?.residueStatus !== "passed" ||
  terminalCoverage?.evidenceManifest?.allReportsPassed !== true ||
  terminalCoverage?.evidenceManifest?.realBrowser !== "cms-real-browser-attestation.json" ||
  terminalCoverage?.evidenceManifest?.realBrowserScreenshot !== "cms-real-browser-attestation.png" ||
  terminalCoverage?.evidenceManifest?.realBrowserStatus !== "passed" ||
  terminalCoverage?.evidenceManifest?.realBrowserChannel !== "iab-workflow-dispatch-hmac" ||
  terminalCoverage?.evidenceManifest?.realBrowserCanonicalFrontendReleaseBound !== true ||
  terminalCoverage?.evidenceManifest?.realBrowserBackendAccepted !== true ||
  terminalCoverage?.evidenceManifest?.realBrowserSuccessLocator !==
    '[data-form-submission-status="success"]' ||
  terminalCoverage?.evidenceManifest?.realBrowserSuccessLocatorObserved !== true ||
  terminalCoverage?.evidenceManifest?.realBrowserOfficialWidgetObserved !== true ||
  terminalCoverage?.evidenceManifest?.realBrowserCDataBound !== true ||
  terminalCoverage?.evidenceManifest?.realBrowserTokenCaptured !== false ||
  terminalCoverage?.evidenceManifest?.realBrowserVariableCleared !== true ||
  terminalCoverage?.evidenceManifest?.realBrowserScreenshotSha256 !==
    realBrowserAttestation?.screenshot?.sha256 ||
  terminalCoverage?.counts?.terminalSurfaces !== inventory.matrix.length ||
  !terminalTombstonePassed(terminalCoverage?.terminalArchivedTombstone) ||
  coverage?.schemaVersion !== 1 ||
  coverage?.sourceSha !== record.candidateSha ||
  coverage?.credentialsPersisted !== false ||
  coverage?.mutatingEntityLifecycles?.status !== "passed" ||
  coverage?.mutatingEditorialLifecycle?.status !== "passed" ||
  !Array.isArray(coverage?.mutatingEntityLifecycles?.operationalGaps) ||
  coverage.mutatingEntityLifecycles.operationalGaps.length !== 0 ||
  auth?.schemaVersion !== 1 ||
  auth?.status !== "passed" ||
  auth?.environment !== "staging" ||
  auth?.candidateSha !== record.candidateSha ||
  auth?.runTag !== runTag ||
  auth?.credentialsPersisted !== false ||
  auth?.noIdentifiersPersisted !== true ||
  auth?.actionLinksPersisted !== false ||
  auth?.rawBrowserArtifacts !== "disabled" ||
  !browserObserverPassed(auth) ||
  !authSurfaceCoveragePassed(auth) ||
  !Array.isArray(auth?.scenarios) ||
  auth.scenarios.some((scenario) => scenario?.status !== "passed") ||
  requiredAuthLifecycleScenarios.some(
    (scenarioId) => !auth.scenarios.some((scenario) => scenario?.id === scenarioId),
  ) ||
  auth?.sessionLifecycle?.silentRefresh !== "real-auth-refresh-and-aal2-session-resolution" ||
  auth?.sessionLifecycle?.expiration !== "expired-local-session-with-server-rejected-refresh" ||
  auth?.sessionLifecycle?.revocation !== "cms-session-403-and-ui-access-denied" ||
  auth?.sessionLifecycle?.tokensPersistedInEvidence !== false ||
  auth?.cleanup !== "awaiting-fixture-teardown-verification" ||
  authConfig?.event !== "g12.staging.auth_config.verified" ||
  authConfig?.siteUrl !== STAGING_AUTH_SITE_ORIGIN ||
  JSON.stringify(authConfig?.redirectAllowList) !== JSON.stringify(STAGING_AUTH_REDIRECT_ALLOW_LIST) ||
  authConfig?.publicSignupDisabled !== true ||
  !/^[a-f0-9]{40}$/.test(rollbackSha ?? "") ||
  rollbackCoverage?.schemaVersion !== 1 ||
  rollbackCoverage?.sourceSha !== rollbackSha ||
  rollbackCoverage?.credentialsPersisted !== false ||
  rollbackCoverage?.authenticated?.status !== "passed" ||
  rollbackCoverage?.authenticated?.rollbackCompatibility !== true ||
  rollbackCoverage?.authenticated?.candidateBackendSha !== record.candidateSha ||
  rollbackCoverage?.authenticated?.frontendSha !== rollbackSha ||
  JSON.stringify(rollbackCoverage?.authenticated?.viewports) !==
    JSON.stringify([{ name: "1440x900", width: 1440, height: 900 }]) ||
  !Array.isArray(rollbackCoverage?.authenticated?.observations) ||
  rollbackCoverage.authenticated.observations.length !== rollbackSurfaceIds.length ||
  JSON.stringify(observedRollbackSurfaceIds) !== JSON.stringify(rollbackSurfaceIds) ||
  rollbackCoverage.authenticated.observations.some((item) => item?.status !== "passed") ||
  !Array.isArray(rollbackCoverage?.authenticated?.menuResults) ||
  rollbackCoverage.authenticated.menuResults.length === 0 ||
  rollbackCoverage.authenticated.menuResults.some((item) => item?.status !== "passed") ||
  !rollbackAuthSteps.has("invalid_password_generic_rejection") ||
  !rollbackAuthSteps.has("invalid_or_expired_mfa_generic_rejection") ||
  !rollbackAuthSteps.has("valid_aal2_login") ||
  !rollbackAuthSteps.has("logout_and_protected_route_rejection") ||
  rollbackCoverage?.authenticated?.consoleFailures?.length !== 0 ||
  rollbackCoverage?.authenticated?.httpFailures?.length !== 0 ||
  rollbackCoverage?.authenticated?.requestFailures?.length !== 0 ||
  rollbackInventory?.schemaVersion !== 1 ||
  rollbackInventory?.sourceSha !== rollbackSha ||
  rollbackInventory?.sourceDirty !== false ||
  rollbackSurfaceIds.length === 0 ||
  rollbackSetup?.schemaVersion !== 1 ||
  rollbackSetup?.status !== "ready" ||
  rollbackSetup?.environment !== "staging" ||
  rollbackSetup?.candidateSha !== record.candidateSha ||
  !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(rollbackSetup?.runTag ?? "") ||
  rollbackSetup?.credentialsInStateOrReport !== false ||
  rollbackCleanup?.schemaVersion !== 1 ||
  rollbackCleanup?.status !== "cleaned" ||
  rollbackCleanup?.environment !== "staging" ||
  rollbackCleanup?.candidateSha !== record.candidateSha ||
  rollbackCleanup?.runTag !== rollbackSetup?.runTag ||
  rollbackCleanup?.activeResidue !== 0 ||
  rollbackCleanup?.auditRetained !== true ||
  adminOps?.schemaVersion !== 1 ||
  adminOps?.status !== "passed" ||
  adminOps?.environment !== "staging" ||
  adminOps?.candidateSha !== record.candidateSha ||
  adminOps?.runTag !== runTag ||
  adminOps?.noIdentifiersPersisted !== true ||
  adminOps?.noSecretsPersisted !== true ||
  adminOps?.positivePublicLead?.status !== "passed" ||
  adminOps?.positivePublicLead?.attestation?.channel !== "iab-workflow-dispatch-hmac" ||
  adminOps?.positivePublicLead?.attestation?.canonicalFrontendReleaseBound !== true ||
  adminOps?.positivePublicLead?.attestation?.backendAccepted !== true ||
  adminOps?.positivePublicLead?.attestation?.successLocator !== '[data-form-submission-status="success"]' ||
  adminOps?.positivePublicLead?.attestation?.successLocatorObserved !== true ||
  adminOps?.positivePublicLead?.attestation?.officialWidgetObserved !== true ||
  adminOps?.positivePublicLead?.attestation?.cDataBound !== true ||
  adminOps?.positivePublicLead?.attestation?.tokenCaptured !== false ||
  adminOps?.positivePublicLead?.attestation?.variableCleared !== true ||
  adminOps?.positivePublicLead?.attestation?.screenshotSha256 !==
    realBrowserAttestation?.screenshot?.sha256 ||
  adminOps?.positivePublicLead?.authoritativePersistence?.scopedLeadCount !== 1 ||
  adminOps?.positivePublicLead?.authoritativePersistence?.referenceMatched !== true ||
  adminOps?.positivePublicLead?.authoritativePersistence?.campaignPathMatched !== true ||
  adminOps?.positivePublicLead?.authoritativePersistence?.consentCount !== 1 ||
  adminOps?.positivePublicLead?.authoritativePersistence?.consentVersionMatched !== true ||
  adminOps?.positivePublicLead?.authoritativePersistence?.initialHistoryPresent !== true ||
  adminOps?.positivePublicLead?.authoritativePersistence?.leadReceivedOutboxCount !== 1 ||
  adminOps?.positivePublicLead?.authoritativePersistence?.attestationAuditCount !== 1 ||
  adminOps?.positivePublicLead?.authoritativePersistence?.auditCorrelationPresent !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.status !== "passed" ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.canonicalFrontendReleaseBound !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.backendAccepted !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.successLocator !==
    '[data-form-submission-status="success"]' ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.successLocatorObserved !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.screenshotSha256 !==
    realBrowserAttestation?.screenshot?.sha256 ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.scopedLeadCount !== 1 ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.referenceMatched !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.campaignPathMatched !==
    true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.formBindingMatched !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence
    ?.actorRunShaEnvironmentMatched !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.emailHashMatched !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.consentCount !== 1 ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.consentAccepted !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.consentVersionMatched !==
    true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.consentEvidenceMatched !==
    true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.initialHistoryCount !== 1 ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.initialStatusNew !== true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.leadReceivedOutboxCount !==
    1 ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.outboxCorrelationPresent !==
    true ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.attestationAuditCount !== 1 ||
  coverage?.mutatingEntityLifecycles?.browserHandoff?.authoritativePersistence?.auditCorrelationMatched !==
    true ||
  !browserObserverPassed(adminOps) ||
  secondary?.schemaVersion !== 1 ||
  secondary?.status !== "passed" ||
  secondary?.environment !== "staging" ||
  secondary?.sourceSha !== record.candidateSha ||
  secondary?.runTag !== runTag ||
  secondary?.noIdentifiersPersisted !== true ||
  secondary?.noSecretsPersisted !== true ||
  !browserObserverPassed(secondary) ||
  uiCreatedState?.schemaVersion !== 1 ||
  uiCreatedState?.status !== "ready" ||
  uiCreatedState?.environment !== "staging" ||
  uiCreatedState?.candidateSha !== record.candidateSha ||
  uiCreatedState?.runTag !== runTag ||
  uiCreatedState?.lease?.source !== "cms-browser-fixture" ||
  uiCreatedState?.lease?.resourceIdsCaptured !== true ||
  uiCreatedIds.length !== 11 ||
  uiCreatedIds.some((id) => !uuid.test(id ?? "")) ||
  uiCreatedState?.form?.status !== "published" ||
  String(uiCreatedState?.form?.key ?? "").length > 150 ||
  !/^qa-ops-qa-cms-final-[0-9]{8}-[0-9a-f]{8}-[a-z0-9]+$/.test(uiCreatedState?.form?.key ?? "") ||
  !/^LD-[A-Z0-9]+$/.test(uiCreatedState?.lead?.reference ?? "") ||
  uiCreatedState?.lead?.reference !== realBrowserAttestation?.reference ||
  uiCreatedState?.lead?.campaignPath !== realBrowserAttestation?.campaignPath ||
  !["assigned", "in_service", "responded", "converted", "disqualified", "archived"].includes(
    uiCreatedState?.lead?.status,
  ) ||
  !/^\/campanhas\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(uiCreatedState?.lead?.campaignPath ?? "") ||
  security?.schemaVersion !== 1 ||
  security?.status !== "passed" ||
  security?.environment !== "staging" ||
  security?.candidateSha !== record.candidateSha ||
  security?.runTag !== runTag ||
  security?.noIdentifiersPersisted !== true ||
  security?.credentialsPersisted !== false ||
  security?.rawBrowserArtifacts !== "disabled" ||
  security?.syntheticPage?.created !== true ||
  security?.syntheticPage?.finalState !== "archived" ||
  security?.browserObservability?.status !== "passed" ||
  security?.browserObservability?.unexpectedConsole !== 0 ||
  security?.browserObservability?.unexpectedHttp !== 0 ||
  security?.browserObservability?.requestFailures !== 0 ||
  !Array.isArray(security?.scenarios) ||
  security.scenarios.some((scenario) => scenario?.status !== "passed") ||
  security.scenarios.find((scenario) => scenario?.id === "backend-tampering-rejection")?.responseStatus !==
    422 ||
  security.scenarios.find((scenario) => scenario?.id === "backend-tampering-rejection")?.draftPreserved !==
    true ||
  security.scenarios.find((scenario) => scenario?.id === "backend-tampering-rejection")
    ?.opaqueUnknownUuidStatus !== 404 ||
  security.scenarios.find((scenario) => scenario?.id === "backend-tampering-rejection")
    ?.identifiersPersisted !== false ||
  security.scenarios.find((scenario) => scenario?.id === "public-xss-inert-output")?.executableNodes !== 0 ||
  security.scenarios.find((scenario) => scenario?.id === "public-xss-inert-output")?.executionFlag !==
    false ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.limitedStatus !== 429 ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.sharedPublicIpBucketConsumed !== false ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.proofIdPersisted !== false ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.exactCorsOrigin !== true ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.varyOrigin !== true ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.recoveredStatus !== 200 ||
  !Number.isInteger(
    security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
      ?.retryAfterSeconds,
  ) ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.retryAfterSeconds < 1 ||
  security.scenarios.find((scenario) => scenario?.id === "public-search-rate-limit-and-recovery")
    ?.retryAfterSeconds > 3 ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-binding-negatives")
    ?.unboundProofStatus !== 404 ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-binding-negatives")
    ?.unboundCandidateStatus !== 404 ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-binding-negatives")
    ?.productionHiddenStatus !== 404 ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-binding-negatives")
    ?.productionModeAccepted !== false ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-binding-negatives")
    ?.invalidCorsPreflightStatus !== 403 ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-binding-negatives")
    ?.wildcardCorsAccepted !== false ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-cleanup")?.explicitCleanup !==
    true ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-cleanup")?.idempotentReplay !==
    true ||
  security.scenarios.find((scenario) => scenario?.id === "qa-rate-limit-proof-cleanup")?.proofIdPersisted !==
    false ||
  !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(runTag ?? "") ||
  !Array.isArray(secondary?.cleanup) ||
  secondary.cleanup.some((item) => item?.status === "failed")
)
  throw new Error("G12_STAGING_BROWSER_EVIDENCE_REFUSED");
console.log(
  JSON.stringify({
    event: "g12.staging.downloaded-evidence.verified",
    candidateSha: record.candidateSha,
    reportSha256: control.reportSha256,
    candidateArtifactId: control.candidateArtifactId,
    authenticatedBrowserEvidenceVerified: 12,
    secretsExposed: false,
  }),
);
