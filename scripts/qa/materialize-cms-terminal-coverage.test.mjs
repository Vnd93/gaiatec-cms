import assert from "node:assert/strict";
import test from "node:test";

import {
  CMS_TERMINAL_VIEWPORTS,
  assertCmsTerminalCoverage,
  materializeCmsTerminalCoverage,
} from "./materialize-cms-terminal-coverage.mjs";

const sha = "1234567890abcdef1234567890abcdef12345678";
const runTag = `QA-CMS-FINAL-20260907-${sha.slice(0, 8)}`;

function fieldKey(surfaceId, name = "Name", occurrence = 0) {
  return `field|${surfaceId}|${name.toLowerCase()}|${occurrence}`;
}

function exercised(proofKind, contractKey, slot) {
  return {
    applicability: "exercised",
    scenarioId: `field-${slot}`,
    proofKind,
    evidenceReference: `cms-field-scenarios.json#scenarios/${contractKey}/${slot}`,
    expectedResult: `${proofKind} expected`,
    observedResult: `${proofKind} observed`,
    ...(proofKind === "backend-response" ? { httpStatus: 200 } : {}),
  };
}

function fieldEvidence(surfaceId, name = "Name", occurrence = 0) {
  const contractKey = fieldKey(surfaceId, name, occurrence);
  return {
    schemaVersion: 1,
    surfaceId,
    fieldName: name,
    fieldOccurrence: occurrence,
    fieldContractKey: contractKey,
    mode: "editable",
    schemaReference: `src/${surfaceId}.tsx#${name}`,
    cases: Object.fromEntries(
      ["valid", "absent", "invalid", "lower-boundary", "upper-boundary"].map((caseId) => [
        caseId,
        exercised("ui-validation", contractKey, caseId),
      ]),
    ),
    persistence: exercised("reload-persistence", contractKey, "persistence"),
    backend: exercised("backend-response", contractKey, "backend"),
    audit: exercised("immutable-audit", contractKey, "audit"),
    status: "passed",
  };
}

function structureEvidence(surfaceId, name = "Importar registros", occurrence = 0) {
  const contractKey = `form|${surfaceId}|${name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}|${occurrence}`;
  const reference = (slot) => `cms-secondary-ui-cycles.json#scenarios/import-real-ui/${contractKey}/${slot}`;
  return {
    schemaVersion: 1,
    surfaceId,
    controlKind: "form",
    controlName: name,
    controlOccurrence: occurrence,
    structureContractKey: contractKey,
    scenarioId: "import-real-ui",
    openedEvidenceReference: reference("opened"),
    submittedOrConfirmedEvidenceReference: reference("submitted-or-confirmed"),
    effectKind: "backend-response",
    effectEvidenceReference: reference("effect"),
    httpStatus: 200,
    restoredOrClosedEvidenceReference: reference("restored-or-closed"),
    status: "passed",
  };
}

const tombstone = {
  classification: "terminalArchivedTombstone",
  count: 1,
  statusCode: 410,
  destinationAbsent: true,
  itemArchived: true,
  publicationCount: 0,
  projectionCount: 0,
  actionableOutboxCount: 0,
  piiExposed: false,
};

function execution(surfaceId, viewport, overrides = {}) {
  const semanticExecutionRef = fieldKey(surfaceId);
  const evidenceFile =
    surfaceId === "work-overview"
      ? "cms-admin-ops-cycles.json"
      : surfaceId === "products-import"
        ? "cms-secondary-ui-cycles.json"
        : "cms-final-coverage.json";
  return {
    surfaceId,
    viewport,
    controlId: `${surfaceId}:field:input:name:0`,
    name: "Name",
    ordinal: 0,
    classification: "field.editable",
    handlerId: "field.require-schema-scenario-text",
    executionScope: "scenario-once",
    semanticExecutionRef,
    handlerExecuted: true,
    evidenceKind: "scenario-contract",
    evidenceReference: `${evidenceFile}#semanticFields/${semanticExecutionRef}`,
    restored: true,
    status: "passed",
    ...overrides,
  };
}

function proof(surfaceId, viewport, overrides = {}) {
  const runtimeExecution = execution(surfaceId, viewport);
  const value = {
    surfaceId,
    viewport,
    status: "passed",
    failures: [],
    controlInteraction: {
      fieldsSeen: 1,
      fieldsExercised: 1,
      actionsSeen: 0,
      actionsFocused: 0,
      actionsExecuted: 0,
      actionsExecutionReferenced: 0,
      actionsStateAsserted: 0,
      linksSeen: 0,
      linksFocused: 0,
      linksExecuted: 0,
      unsupported: [],
      failures: [],
      semanticExecutions: [runtimeExecution],
    },
    sourceControlContract: {
      status: "passed",
      failures: [],
      notApplicable: [],
      mappings: [
        {
          schemaVersion: 1,
          surfaceId,
          sourceControlId: `src/${surfaceId}.tsx:1:input:1`,
          sourceClassification: "field",
          sourceAccessibleNameHint: "Name",
          runtimeControlId: runtimeExecution.controlId,
          runtimeClassification: runtimeExecution.classification,
          runtimeHandlerId: runtimeExecution.handlerId,
          runtimeControlName: "Name",
          runtimeControlOccurrence: 0,
          viewport,
          mapping: "accessible-name-and-occurrence",
          executionScope: "scenario-once",
          semanticExecutionRef: runtimeExecution.semanticExecutionRef,
          handlerExecuted: true,
          evidenceKind: "scenario-contract",
          evidenceReference: runtimeExecution.evidenceReference,
          status: "passed",
        },
      ],
    },
    ...overrides,
  };
  if (surfaceId === "products-import") {
    const structure = structureEvidence(surfaceId);
    const structureControlId = `${surfaceId}:form:form:importar-registros:1`;
    value.controlInteraction.semanticExecutions.push({
      surfaceId,
      viewport,
      controlId: structureControlId,
      name: structure.controlName,
      ordinal: 1,
      classification: "structure.form",
      handlerId: "structure.require-submit-effect-evidence",
      executionScope: "scenario-once",
      semanticExecutionRef: structure.structureContractKey,
      handlerExecuted: true,
      evidenceKind: "scenario-contract",
      evidenceReference: `cms-secondary-ui-cycles.json#semanticStructures/${structure.structureContractKey}`,
      restored: true,
      status: "passed",
    });
    value.sourceControlContract.mappings.push({
      schemaVersion: 1,
      surfaceId,
      sourceControlId: `src/${surfaceId}.tsx:2:form:2`,
      sourceClassification: "form",
      sourceAccessibleNameHint: structure.controlName,
      runtimeControlId: structureControlId,
      runtimeClassification: "structure.form",
      runtimeHandlerId: "structure.require-submit-effect-evidence",
      runtimeControlName: structure.controlName,
      runtimeControlOccurrence: 0,
      viewport,
      mapping: "accessible-name-and-occurrence",
      executionScope: "scenario-once",
      semanticExecutionRef: structure.structureContractKey,
      handlerExecuted: true,
      evidenceKind: "scenario-contract",
      evidenceReference: `cms-secondary-ui-cycles.json#semanticStructures/${structure.structureContractKey}`,
      status: "passed",
    });
  }
  return value;
}

function sourceSurface(id, testMode) {
  return {
    id,
    route: id === "auth-login" ? "/admin/login" : "/admin",
    testMode,
    publicConsumers: [],
    publicResult: "private surface",
    origin: { code: [`src/${id}.tsx`] },
    state: "classificado por fonte; resultado runtime será anexado",
    testState: "inventariado; evidência runtime será anexada",
    finalResult: "pendente de homologação",
    fieldContracts: [
      {
        id: `src/${id}.tsx:1:input:1`,
        resultState: "pendente de evidência runtime",
      },
    ],
    actionContracts: [],
  };
}

function boundReport(extra = {}) {
  return {
    schemaVersion: 1,
    status: "passed",
    environment: "staging",
    candidateSha: sha,
    runTag,
    credentialsPersisted: false,
    ...extra,
  };
}

function fixture() {
  const authenticatedSurfaces = [
    "work-overview",
    "products-list",
    "product-create",
    "product-edit",
    "products-import",
    "pim",
  ];
  const authSurface = "auth-login";
  const authenticatedProofs = authenticatedSurfaces.flatMap((surfaceId) =>
    CMS_TERMINAL_VIEWPORTS.map((viewport) => proof(surfaceId, viewport)),
  );
  const authProofs = CMS_TERMINAL_VIEWPORTS.map((viewport) => proof(authSurface, viewport));
  const inventory = {
    schemaVersion: 1,
    sourceSha: sha,
    sourceDirty: false,
    classificationPolicy: { runtime: "SHA-bound" },
    documentationCrossCheck: { status: "validated" },
    requirementsCoverage: {
      functional: [{ id: "F-001", state: "runtime pendente", surfaceIds: ["work-overview"], evidence: [] }],
      businessRules: [
        { id: "RB-001", state: "runtime pendente", surfaceIds: ["product-edit"], evidence: [] },
      ],
    },
    redesignDivergences: [
      {
        id: "RD-001",
        status: "homologação runtime pendente",
        productionDecision: "actions require backend effects",
        evidence: ["tests/e2e/cms-final-coverage.spec.ts"],
      },
      {
        id: "RD-002",
        status: "regression pending",
        productionDecision: "semantic product controls",
        evidence: ["src/admin/components/ProductSemanticEditors.tsx"],
      },
      {
        id: "RD-003",
        status: "implementation pending",
        productionDecision: "single canonical writer",
        evidence: ["src/admin/pages/AdminPimPage.tsx"],
      },
    ],
    productPimAuthority: {
      state: "reconciliação em implementação",
      independentPimWriterInCommonUi: false,
      contextualReadRoute: "/admin/pim",
      canonicalWriterRoutePatterns: ["/admin/produtos/:id", "/admin/importacao"],
      canonicalPayload: "CmsProductContentSchema via cms-content",
      legacyCompatibility: "leitura e reconciliação somente",
    },
    counts: { surfaces: authenticatedSurfaces.length + 1, sourceControls: authenticatedSurfaces.length + 2 },
    matrix: [
      ...authenticatedSurfaces.map((surfaceId) => sourceSurface(surfaceId, "authenticated")),
      sourceSurface(authSurface, "auth-journey"),
    ],
    sourceControls: [
      ...authenticatedSurfaces.map((surfaceId) => ({
        id: `src/${surfaceId}.tsx:1:input:1`,
        classification: "field",
        ownerRouteIds: [surfaceId],
        accessibleNameHint: "Nome",
        evidence: `src/${surfaceId}.tsx:1`,
        correction: null,
      })),
      {
        id: `src/${authSurface}.tsx:1:input:1`,
        classification: "field",
        ownerRouteIds: [authSurface],
        accessibleNameHint: "E-mail corporativo",
        evidence: `src/${authSurface}.tsx:1`,
        correction: null,
      },
      {
        id: "src/products-import.tsx:2:form:2",
        classification: "form",
        ownerRouteIds: ["products-import"],
        accessibleNameHint: "Importar registros",
        evidence: "src/products-import.tsx:2",
        correction: null,
      },
    ],
  };
  const runtime = {
    schemaVersion: 1,
    generatedAt: "2026-09-07T12:00:00.000Z",
    sourceSha: sha,
    runTag,
    semanticFields: [...authenticatedSurfaces, authSurface]
      .filter((surfaceId) => !["work-overview", "products-import"].includes(surfaceId))
      .map((surfaceId) => fieldEvidence(surfaceId)),
    staticInventory: { status: "passed" },
    signedOut: { status: "passed" },
    authenticated: {
      status: "passed",
      rollbackCompatibility: false,
      frontendSha: sha,
      consoleFailures: [],
      httpFailures: [],
      requestFailures: [],
      semanticContract: {
        schemaVersion: 1,
        requiredViewports: [...CMS_TERMINAL_VIEWPORTS],
        focusOrObservationAcceptedAsActionEvidence: false,
        result: { status: "passed", failures: [] },
      },
      observations: authenticatedProofs,
    },
    mutatingEntityLifecycles: {
      status: "passed",
      environment: "staging confirmed by /healthz",
      positivePublicLeadEvidence: "iab-attested-lead-capture-and-admin-responded",
      editorialRelease: { status: "rolled_back" },
      auditPreserved: true,
    },
    mutatingEditorialLifecycle: {
      status: "passed",
      finalSyntheticState: "published-for-downstream",
      noindexRoute: true,
      auditPreserved: true,
    },
  };
  return {
    inventory,
    runtime,
    reports: {
      setup: {
        schemaVersion: 1,
        status: "ready",
        environment: "staging",
        candidateSha: sha,
        runTag,
        fixtureProvisioning: "actors-and-prerequisites-only",
        editorialEntitiesCreatedByFixture: 0,
        formsCreatedByFixture: 0,
        leadsCreatedByFixture: 0,
        credentialsInStateOrReport: false,
      },
      cleanup: {
        schemaVersion: 1,
        status: "cleaned",
        environment: "staging",
        candidateSha: sha,
        runTag,
        activeResidue: 0,
        auditRetained: true,
        activePublications: 0,
        publishedProjections: 0,
        actionablePublicationOutbox: 0,
        actionableLeadOutbox: 0,
        activeCredentials: 0,
        activeSessions: 0,
        terminalArchivedTombstone: { ...tombstone },
      },
      residue: {
        schemaVersion: 1,
        status: "passed",
        environment: "staging",
        candidateSha: sha,
        runTag,
        activeResidue: 0,
        activeLeases: 0,
        activeSessions: 0,
        auditRetained: true,
        terminalArchivedTombstone: { ...tombstone },
      },
      auth: boundReport({ viewportEvidence: authProofs }),
      admin: boundReport({ semanticFields: [fieldEvidence("work-overview")] }),
      secondary: {
        ...boundReport(),
        sourceSha: sha,
        semanticFields: [fieldEvidence("products-import")],
        semanticStructures: [structureEvidence("products-import")],
        siteBaseline: {
          navigation: "created-via-ui",
          siteSettings: "created-via-ui",
          workflow: "draft-submit-approve-publish",
          aal2: true,
          audit: true,
          public: true,
          ownerAuthored: true,
          baselineOwner: "corporate",
          actorOutsideQaLease: true,
          qaLeaseActorUsed: false,
          mutationTransport: "cms-ui-only",
          canonicalRepositoryDataVerified: true,
          navigationTerminalState: "published-after-restore",
          siteSettingsTerminalState: "published-after-restore",
          publicShellVerifiedAfterRestore: true,
          idsPersisted: false,
        },
      },
      security: boundReport(),
    },
    realBrowser: {
      status: "passed",
      environment: "staging",
      candidateSha: sha,
      runTag,
      channel: "iab-workflow-dispatch-hmac",
      canonicalFrontendReleaseBound: true,
      backendAccepted: true,
      successLocator: '[data-form-submission-status="success"]',
      successLocatorObserved: true,
      officialWidgetObserved: true,
      cDataBound: true,
      tokenCaptured: false,
      variableCleared: true,
      screenshotSha256: "a".repeat(64),
      screenshotBytes: 1024,
    },
    candidateSha: sha,
    environment: "staging",
  };
}

function scenarioOnceFixture() {
  const input = fixture();
  const surfaceId = "products-list";
  const controlName = "Salvar rascunho";
  const controlContractKey = "products-list|salvar-rascunho|0";
  const sourceControl = input.inventory.sourceControls.find((entry) =>
    entry.ownerRouteIds.includes(surfaceId),
  );
  const sourceSurface = input.inventory.matrix.find((entry) => entry.id === surfaceId);
  sourceControl.classification = "action";
  sourceControl.accessibleNameHint = controlName;
  sourceSurface.actionContracts = sourceSurface.fieldContracts;
  sourceSurface.fieldContracts = [];
  input.runtime.semanticFields = input.runtime.semanticFields.filter(
    (entry) => entry.surfaceId !== surfaceId,
  );
  for (const item of input.runtime.authenticated.observations.filter(
    (candidate) => candidate.surfaceId === surfaceId,
  )) {
    const executionValue = item.controlInteraction.semanticExecutions[0];
    Object.assign(executionValue, {
      controlId: `${surfaceId}:action:button:salvar-rascunho:0`,
      name: controlName,
      ordinal: 0,
      classification: "action.mutating",
      handlerId: "action.require-exact-side-effect-evidence",
      executionScope: "scenario-once",
      semanticExecutionRef: controlContractKey,
      evidenceKind: "backend-response",
      evidenceReference: `cms-final-coverage.json#semanticActions/${controlContractKey}`,
    });
    Object.assign(item.controlInteraction, {
      fieldsSeen: 0,
      fieldsExercised: 0,
      actionsSeen: 1,
      actionsExecuted: 0,
      actionsExecutionReferenced: 1,
    });
    Object.assign(item.sourceControlContract.mappings[0], {
      sourceClassification: "action",
      sourceAccessibleNameHint: controlName,
      runtimeControlId: executionValue.controlId,
      runtimeClassification: executionValue.classification,
      runtimeHandlerId: executionValue.handlerId,
      runtimeControlName: controlName,
      runtimeControlOccurrence: 0,
      executionScope: "scenario-once",
      semanticExecutionRef: controlContractKey,
      evidenceKind: "backend-response",
      evidenceReference: executionValue.evidenceReference,
    });
  }
  input.runtime.semanticActions = [
    {
      schemaVersion: 1,
      surfaceId,
      controlName,
      controlOccurrence: 0,
      controlContractKey,
      actions: ["save"],
      scenarioIds: ["work-save-via-ui"],
      handlerExecuted: true,
      evidenceKind: "backend-response",
      backendStatus: "draft",
      httpStatus: 200,
      status: "passed",
    },
  ];
  return input;
}

function sourceNotApplicableFixture() {
  const input = fixture();
  const surfaceId = "pim";
  const sourceControl = input.inventory.sourceControls.find((entry) =>
    entry.ownerRouteIds.includes(surfaceId),
  );
  const applicability = {
    applicability: "not-applicable",
    basisCode: "legacy-state-unavailable-by-read-only-cutover",
    justification:
      "A migration 0078 tornou o grafo legado somente leitura; o ator sintético não pode criar este estado pela interface.",
    documentationReference:
      "supabase/migrations/0078_cms_product_pim_consolidation.sql#legacy-writers-read-only",
  };
  sourceControl.runtimeApplicabilityBySurface = { [surfaceId]: applicability };
  input.runtime.semanticFields = input.runtime.semanticFields.filter(
    (entry) => entry.surfaceId !== surfaceId,
  );
  for (const item of input.runtime.authenticated.observations.filter(
    (candidate) => candidate.surfaceId === surfaceId,
  )) {
    item.controlInteraction.fieldsSeen = 0;
    item.controlInteraction.fieldsExercised = 0;
    item.controlInteraction.semanticExecutions = [];
    item.controlInteraction.handlerEvidence =
      "canonical source branch classified not-applicable without runtime execution";
    item.sourceControlContract.mappings = [];
    item.sourceControlContract.notApplicable = [
      {
        schemaVersion: 1,
        surfaceId,
        sourceControlId: sourceControl.id,
        sourceClassification: sourceControl.classification,
        sourceAccessibleNameHint: sourceControl.accessibleNameHint,
        viewport: item.viewport,
        applicability: "not-applicable",
        basisCode: applicability.basisCode,
        justification: applicability.justification,
        documentationReference: applicability.documentationReference,
        executionScope: "not-applicable",
        semanticExecutionRef: null,
        handlerExecuted: false,
        evidenceKind: null,
        evidenceReference: `${applicability.documentationReference}|${sourceControl.id}`,
        status: "not-applicable",
      },
    ];
  }
  return input;
}

test("materializa matriz terminal completa, SHA-bound e sem estados provisórios", () => {
  const result = materializeCmsTerminalCoverage(fixture());
  assert.equal(result.status, "passed");
  assert.equal(result.candidateSha, sha);
  assert.equal(result.syntheticEntityIdentifiersInTerminalReport, false);
  assert.equal("syntheticIdentifiersPersisted" in result, false);
  assert.equal(result.matrix.length, 7);
  assert.equal(
    result.matrix.every((surface) => surface.browserEvidence.length === 4),
    true,
  );
  assert.equal(
    result.matrix.every((surface) => surface.testState === "passed"),
    true,
  );
  assert.equal(result.requirementsCoverage.functional[0].state.startsWith("passed"), true);
  assert.equal(result.redesignDivergences[0].status.startsWith("passed"), true);
  assert.equal(result.productPimAuthority.state.startsWith("passed"), true);
  assert.doesNotThrow(() => assertCmsTerminalCoverage(result));
});

test("preserva sourceControl N/A canônico sem contar execução ou backend", () => {
  const input = sourceNotApplicableFixture();
  const result = materializeCmsTerminalCoverage(input);
  const pim = result.matrix.find((surface) => surface.id === "pim");
  const sourceResult = pim.sourceControlResults[0];
  assert.equal(result.counts.terminalSourceControlNotApplicable, 1);
  assert.equal(sourceResult.testState, "not-applicable");
  assert.equal(sourceResult.handlerId, null);
  assert.equal(
    sourceResult.evidenceByViewport.every((entry) => entry.handlerExecuted === false),
    true,
  );
  assert.equal(pim.backendResult.controlEvidence.length, 0);
  assert.equal(pim.fieldContracts[0].resultState, "not-applicable");
  assert.doesNotThrow(() => assertCmsTerminalCoverage(result));

  const falseExecution = sourceNotApplicableFixture();
  falseExecution.runtime.authenticated.observations.find(
    (item) => item.surfaceId === "pim",
  ).sourceControlContract.notApplicable[0].handlerExecuted = true;
  assert.throws(
    () => materializeCmsTerminalCoverage(falseExecution),
    /CMS_TERMINAL_SOURCE_NOT_APPLICABLE_INVALID/,
  );

  const wrongBasis = sourceNotApplicableFixture();
  wrongBasis.runtime.authenticated.observations.find(
    (item) => item.surfaceId === "pim",
  ).sourceControlContract.notApplicable[0].documentationReference = "docs/ev2/README.md";
  assert.throws(
    () => materializeCmsTerminalCoverage(wrongBasis),
    /CMS_TERMINAL_SOURCE_NOT_APPLICABLE_INVALID/,
  );
});

test("recusa reports administrativo/secundário sem os ledgers semânticos obrigatórios", () => {
  const adminEmpty = fixture();
  adminEmpty.reports.admin.semanticFields = [];
  assert.throws(
    () => materializeCmsTerminalCoverage(adminEmpty),
    /CMS_TERMINAL_SEMANTIC_FIELDS_EMPTY:cms-admin-ops-cycles\.json/,
  );

  const secondaryFieldsEmpty = fixture();
  secondaryFieldsEmpty.reports.secondary.semanticFields = [];
  assert.throws(
    () => materializeCmsTerminalCoverage(secondaryFieldsEmpty),
    /CMS_TERMINAL_SEMANTIC_FIELDS_EMPTY:cms-secondary-ui-cycles\.json/,
  );

  const secondaryStructuresEmpty = fixture();
  secondaryStructuresEmpty.reports.secondary.semanticStructures = [];
  assert.throws(
    () => materializeCmsTerminalCoverage(secondaryStructuresEmpty),
    /CMS_TERMINAL_SEMANTIC_STRUCTURES_EMPTY:cms-secondary-ui-cycles\.json/,
  );
});

test("agrega estado condicional real em todos os viewports e rejeita replay mutante ou incompleto", () => {
  const input = fixture();
  const stateContractKey = "state|work-overview|task-details";
  input.reports.admin.semanticStateSetups = [
    {
      schemaVersion: 1,
      surfaceId: "work-overview",
      stateId: "task-details",
      stateContractKey,
      scenarioId: "task-details-opened-without-mutation",
      steps: [
        {
          stepId: "select-delegated-type",
          scope: "page",
          controlKind: "field",
          accessibleName: "Tipo",
          controlOccurrence: 0,
          operation: "select-option",
          optionValue: "delegated",
        },
      ],
      expectedState: {
        kind: "field",
        accessibleName: "Válida até",
        occurrence: 0,
      },
      restore: {
        operation: "reload-route",
        controlKind: null,
        accessibleName: null,
        controlOccurrence: null,
      },
      mutationFree: true,
      observedMutationRequests: 0,
      triggerObserved: true,
      stateObserved: true,
      restored: true,
      evidenceReference: `cms-admin-ops-cycles.json#semanticStateSetups/${stateContractKey}`,
      status: "passed",
    },
  ];
  for (const item of input.runtime.authenticated.observations.filter(
    (candidate) => candidate.surfaceId === "work-overview",
  )) {
    item.semanticStateSnapshots = [
      {
        stateContractKey,
        status: "passed",
        controlsCaptured: 4,
        mutationRequests: 0,
        restored: true,
        failures: [],
      },
    ];
  }
  const result = materializeCmsTerminalCoverage(input);
  assert.equal(result.semanticStateSetupManifest.length, 1);
  assert.equal(result.counts.terminalSemanticStateSetups, 1);
  assert.equal(
    result.matrix
      .find((surface) => surface.id === "work-overview")
      .browserEvidence.every((evidence) => evidence.semanticStateSnapshots.length === 1),
    true,
  );

  const mutating = structuredClone(input);
  mutating.runtime.authenticated.observations.find(
    (item) => item.surfaceId === "work-overview",
  ).semanticStateSnapshots[0].mutationRequests = 1;
  assert.throws(
    () => materializeCmsTerminalCoverage(mutating),
    /CMS_TERMINAL_SEMANTIC_STATE_SNAPSHOT_FAILED/,
  );

  const incomplete = structuredClone(input);
  incomplete.runtime.authenticated.observations.find(
    (item) => item.surfaceId === "work-overview",
  ).semanticStateSnapshots = [];
  assert.throws(
    () => materializeCmsTerminalCoverage(incomplete),
    /CMS_TERMINAL_SEMANTIC_STATE_SNAPSHOT_COVERAGE/,
  );

  const unsafeOption = structuredClone(input);
  unsafeOption.reports.admin.semanticStateSetups[0].steps[0].optionValue = "delegated;drop";
  assert.throws(
    () => materializeCmsTerminalCoverage(unsafeOption),
    /CMS_TERMINAL_SEMANTIC_STATE_STEP_INVALID/,
  );
});

test("normaliza viewport auth estruturado somente com dimensões exatas", () => {
  const input = fixture();
  input.reports.auth.viewportEvidence = input.reports.auth.viewportEvidence.map((item) => {
    const [width, height] = item.viewport.split("x").map(Number);
    return { ...item, viewport: { name: item.viewport, width, height } };
  });
  assert.equal(materializeCmsTerminalCoverage(input).status, "passed");

  input.reports.auth.viewportEvidence[0].viewport.width += 1;
  assert.throws(
    () => materializeCmsTerminalCoverage(input),
    /CMS_TERMINAL_SURFACE_VIEWPORT_PROOF_COUNT:auth-login:390x844:0/,
  );
});

test("reutiliza uma execução backend real somente entre viewports do mesmo sourceControl", () => {
  const result = materializeCmsTerminalCoverage(scenarioOnceFixture());
  const control = result.matrix.find((surface) => surface.id === "products-list").sourceControlResults[0];
  assert.equal(result.counts.terminalScenarioOnceExecutions, 8);
  assert.equal(result.semanticActionManifest.length, 1);
  assert.equal(control.evidenceByViewport.length, 4);
  assert.equal(new Set(control.evidenceByViewport.map((item) => item.semanticExecutionRef)).size, 1);

  const missing = scenarioOnceFixture();
  missing.runtime.semanticActions = [];
  assert.throws(() => materializeCmsTerminalCoverage(missing), /CMS_TERMINAL_SEMANTIC_REFERENCE_INVALID/);

  const ambiguous = scenarioOnceFixture();
  ambiguous.reports.admin.semanticActions = [{ ...ambiguous.runtime.semanticActions[0] }];
  assert.throws(() => materializeCmsTerminalCoverage(ambiguous), /CMS_TERMINAL_SEMANTIC_ACTION_DUPLICATE/);
});

test("falha fechado quando uma superfície não tem prova em todos os viewports", () => {
  const input = fixture();
  input.runtime.authenticated.observations.pop();
  assert.throws(
    () => materializeCmsTerminalCoverage(input),
    /CMS_TERMINAL_SURFACE_VIEWPORT_PROOF_COUNT:pim:1920x1080:0/,
  );
});

test("recusa foco/observação como evidência de ação ou campo", () => {
  const input = fixture();
  const target = input.runtime.authenticated.observations[0].controlInteraction.semanticExecutions[0];
  target.evidenceKind = "focus-only";
  assert.throws(() => materializeCmsTerminalCoverage(input), /NON_SEMANTIC_EXECUTION/);
});

test("recusa relatório downstream de outro SHA", () => {
  const input = fixture();
  input.reports.admin.candidateSha = "abcdef1234567890abcdef1234567890abcdef12";
  assert.throws(() => materializeCmsTerminalCoverage(input), /CMS_TERMINAL_ADMIN_SHA_MISMATCH/);
});

test("recusa campo ou ação observada sem exercício", () => {
  const input = fixture();
  const authProof = input.reports.auth.viewportEvidence[0];
  authProof.controlInteraction.fieldsExercised = 0;
  assert.throws(() => materializeCmsTerminalCoverage(input), /FIELDS_OR_ACTIONS_UNEXERCISED/);
});

test("recusa fill/restore DOM como prova terminal de campo", () => {
  const input = fixture();
  const proofValue = input.runtime.authenticated.observations[0];
  const executionValue = proofValue.controlInteraction.semanticExecutions[0];
  Object.assign(executionValue, {
    executionScope: "viewport-local",
    semanticExecutionRef: null,
    evidenceKind: "ui-interaction",
    evidenceReference: "dom-value-roundtrip:text",
  });
  Object.assign(proofValue.sourceControlContract.mappings[0], {
    executionScope: "viewport-local",
    semanticExecutionRef: null,
    evidenceKind: "ui-interaction",
    evidenceReference: "dom-value-roundtrip:text",
  });
  assert.throws(
    () => materializeCmsTerminalCoverage(input),
    /CMS_TERMINAL_EXECUTION_SCOPE_INVALID|CMS_TERMINAL_SEMANTIC_REFERENCE_VIEWPORT_MISMATCH/,
  );
});

test("recusa campo sem caso de limite ou com backend genérico", () => {
  const missingCase = fixture();
  delete missingCase.runtime.semanticFields[0].cases["upper-boundary"];
  assert.throws(
    () => materializeCmsTerminalCoverage(missingCase),
    /CMS_TERMINAL_SEMANTIC_FIELD_CASES_INVALID/,
  );

  const report = materializeCmsTerminalCoverage(fixture());
  report.matrix[0].backendResult.controlEvidence[0].evidenceReferences = ["generic-report"];
  assert.throws(() => assertCmsTerminalCoverage(report), /CMS_TERMINAL_BACKEND_CONTROL_REFERENCE_MISMATCH/);

  const unrelatedField = fixture();
  unrelatedField.runtime.semanticFields[0].cases.valid.evidenceReference =
    "cms-field-scenarios.json#scenarios/field|other-surface|name|0/valid";
  assert.throws(
    () => materializeCmsTerminalCoverage(unrelatedField),
    /CMS_TERMINAL_SEMANTIC_FIELD_VALID_EXERCISED_INVALID/,
  );

  const recycledFieldProof = fixture();
  recycledFieldProof.runtime.semanticFields[0].cases.invalid =
    recycledFieldProof.runtime.semanticFields[0].cases.valid;
  assert.throws(
    () => materializeCmsTerminalCoverage(recycledFieldProof),
    /CMS_TERMINAL_SEMANTIC_FIELD_REFERENCE_REUSED/,
  );
});

test("recusa form/dialog comprovado apenas por visibilidade DOM", () => {
  const input = fixture();
  input.runtime.semanticStructures = [
    {
      schemaVersion: 1,
      surfaceId: "work-overview",
      controlKind: "dialog",
      controlName: "Confirmar publicação",
      controlOccurrence: 0,
      structureContractKey: "dialog|work-overview|confirmar-publicacao|0",
      scenarioId: "work-confirm-publication",
      openedEvidenceReference: "dom:visible=true",
      submittedOrConfirmedEvidenceReference: "cms-work.json#confirmed",
      effectKind: "backend-response",
      effectEvidenceReference: "cms-work.json#publish-200",
      httpStatus: 200,
      restoredOrClosedEvidenceReference: "cms-work.json#closed",
      status: "passed",
    },
  ];
  assert.throws(() => materializeCmsTerminalCoverage(input), /CMS_TERMINAL_SEMANTIC_STRUCTURE_INVALID/);
});

test("exige prova específica para cada consumidor público", () => {
  const missing = fixture();
  missing.inventory.matrix[0].publicConsumers = ["/blog"];
  assert.throws(
    () => materializeCmsTerminalCoverage(missing),
    /CMS_TERMINAL_PUBLIC_CONSUMER_EVIDENCE_MISSING/,
  );

  const valid = fixture();
  valid.inventory.matrix[0].publicConsumers = ["/blog"];
  valid.runtime.publicConsumerEvidence = [
    {
      schemaVersion: 1,
      surfaceId: "work-overview",
      consumer: "/blog",
      consumerOccurrence: 0,
      consumerContractKey: "public|work-overview|blog|0",
      scenarioId: "work-release-blog-public-check",
      consumerKind: "http",
      expectedStatus: 200,
      observedStatus: 200,
      candidateSha: sha,
      cacheInvalidation: "validated",
      noInternalOrUnpublishedContent: true,
      evidenceReference: "cms-public-scenarios.json#public|work-overview|blog|0/work-release-blog",
      status: "passed",
    },
  ];
  assert.equal(materializeCmsTerminalCoverage(valid).status, "passed");

  valid.runtime.publicConsumerEvidence[0].evidenceReference =
    "cms-public-scenarios.json#public|other-surface|blog|0/work-release-blog";
  assert.throws(() => materializeCmsTerminalCoverage(valid), /CMS_TERMINAL_PUBLIC_CONSUMER_INVALID/);
});

test("recusa runTag divergente, baseline genérico ou tombstone identificável", () => {
  const runTagMismatch = fixture();
  runTagMismatch.reports.admin.runTag = `QA-CMS-FINAL-20260908-${sha.slice(0, 8)}`;
  assert.throws(() => materializeCmsTerminalCoverage(runTagMismatch), /CMS_TERMINAL_ADMIN_RUN_TAG_MISMATCH/);

  const baseline = fixture();
  baseline.reports.secondary.siteBaseline.audit = false;
  assert.throws(() => materializeCmsTerminalCoverage(baseline), /CMS_TERMINAL_SITE_BASELINE_INVALID/);

  const qaOwnedBaseline = fixture();
  qaOwnedBaseline.reports.secondary.siteBaseline.baselineOwner = "qa-lease";
  qaOwnedBaseline.reports.secondary.siteBaseline.actorOutsideQaLease = false;
  qaOwnedBaseline.reports.secondary.siteBaseline.qaLeaseActorUsed = true;
  assert.throws(() => materializeCmsTerminalCoverage(qaOwnedBaseline), /CMS_TERMINAL_SITE_BASELINE_INVALID/);

  const tombstoneLeak = fixture();
  tombstoneLeak.reports.cleanup.terminalArchivedTombstone.itemId = "00000000-0000-4000-8000-000000000001";
  assert.throws(
    () => materializeCmsTerminalCoverage(tombstoneLeak),
    /CMS_TERMINAL_CLEANUP_TOMBSTONE_INVALID/,
  );
});

test("recusa claim legado de lead sem atestação IAB", () => {
  const legacy = fixture();
  legacy.runtime.mutatingEntityLifecycles.positivePublicLeadEvidence = "lead-capture-201-and-admin-responded";
  assert.throws(() => materializeCmsTerminalCoverage(legacy), /CMS_TERMINAL_ENTITY_LIFECYCLE_INCOMPLETE/);
});

test("recusa requisito funcional ou regra de negócio sem superfície terminal aprovada", () => {
  const missing = fixture();
  missing.inventory.requirementsCoverage.functional[0].surfaceIds = ["surface-absent"];
  assert.throws(
    () => materializeCmsTerminalCoverage(missing),
    /CMS_TERMINAL_REQUIREMENT_SURFACE_NOT_PASSED:F-001:surface-absent/,
  );

  const failed = fixture();
  failed.inventory.requirementsCoverage.businessRules[0].surfaceIds = ["product-edit"];
  failed.runtime.authenticated.observations = failed.runtime.authenticated.observations.filter(
    (item) => !(item.surfaceId === "product-edit" && item.viewport === "390x844"),
  );
  assert.throws(
    () => materializeCmsTerminalCoverage(failed),
    /CMS_TERMINAL_SURFACE_VIEWPORT_PROOF_COUNT:product-edit:390x844:0/,
  );
});

test("recusa decisões de redesign e autoridade PIM que não comprovam os invariantes canônicos", () => {
  const redesign = fixture();
  redesign.inventory.redesignDivergences[0].evidence = [];
  assert.throws(
    () => materializeCmsTerminalCoverage(redesign),
    /CMS_TERMINAL_REDESIGN_INVARIANT_INVALID:RD-001/,
  );

  const pim = fixture();
  pim.inventory.productPimAuthority.independentPimWriterInCommonUi = true;
  assert.throws(() => materializeCmsTerminalCoverage(pim), /CMS_TERMINAL_PIM_INVARIANT_INVALID/);
});

test("recusa sourceControl sem vínculo individual ou runtime control reutilizado", () => {
  const input = fixture();
  input.inventory.sourceControls.push({
    id: "src/work-overview.tsx:2:input:2",
    classification: "field",
    ownerRouteIds: ["work-overview"],
    accessibleNameHint: "Outro campo",
    evidence: "src/work-overview.tsx:2",
    correction: null,
  });
  input.inventory.matrix[0].fieldContracts.push({
    id: "src/work-overview.tsx:2:input:2",
    resultState: "pendente de evidência runtime",
  });
  assert.throws(() => materializeCmsTerminalCoverage(input), /CMS_TERMINAL_SOURCE_MAPPING_COVERAGE_MISMATCH/);

  const ambiguous = fixture();
  const ambiguousProof = ambiguous.runtime.authenticated.observations[0];
  ambiguousProof.sourceControlContract.mappings.push({
    ...ambiguousProof.sourceControlContract.mappings[0],
    runtimeControlId: "work-overview:field:input:other:1",
  });
  assert.throws(() => materializeCmsTerminalCoverage(ambiguous), /CMS_TERMINAL_SOURCE_MAPPING_DUPLICATE/);

  const duplicated = fixture();
  const proofValue = duplicated.runtime.authenticated.observations[0];
  proofValue.sourceControlContract.mappings.push({
    ...proofValue.sourceControlContract.mappings[0],
    sourceControlId: "src/duplicate.tsx:1:input:2",
  });
  assert.throws(() => materializeCmsTerminalCoverage(duplicated), /CMS_TERMINAL_RUNTIME_MAPPING_REUSED/);
});
