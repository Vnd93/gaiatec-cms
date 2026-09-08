import { describe, expect, it } from "vitest";
import {
  CMS_SEMANTIC_CONTROL_CONTRACT_VERSION,
  CMS_SEMANTIC_FIELD_CASES,
  CMS_SEMANTIC_VIEWPORTS,
  cmsMutatingActionContractKey,
  cmsSemanticControlId,
  cmsSemanticFieldContractKey,
  cmsSemanticStateContractKey,
  cmsSemanticStructureContractKey,
  mapCmsSourceControlsToRuntime,
  resolveCmsSemanticBinding,
  resolveCmsSemanticFieldEvidence,
  resolveCmsSemanticStateSetup,
  resolveCmsMutatingActionEvidence,
  resolveCmsSemanticStructureEvidence,
  validateCmsSemanticCoverage,
  type CmsSemanticFieldEvidence,
  type CmsRuntimeControl,
  type CmsMutatingActionEvidence,
  type CmsSemanticExecution,
  type CmsSemanticStructureEvidence,
  type CmsSemanticStateSetup,
} from "../e2e/cms-semantic-control-contract";

const field: CmsRuntimeControl = {
  kind: "field",
  tag: "input",
  role: null,
  name: "Título",
  type: "text",
  required: true,
  disabled: false,
  readOnly: false,
  destination: null,
};

function exercised(
  proofKind:
    "ui-validation" | "backend-validation" | "reload-persistence" | "backend-response" | "immutable-audit",
  contractKey: string,
  slot: string,
) {
  return {
    applicability: "exercised" as const,
    scenarioId: `field-${slot}`,
    proofKind,
    evidenceReference: `cms-field-scenarios.json#scenarios/${contractKey}/${slot}`,
    expectedResult: `${proofKind} expected`,
    observedResult: `${proofKind} observed`,
    ...(proofKind === "backend-response" ? { httpStatus: 200 } : {}),
  };
}

function completeFieldEvidence(): CmsSemanticFieldEvidence {
  const surfaceId = "content-edit";
  const fieldName = "Título";
  const fieldContractKey = cmsSemanticFieldContractKey(surfaceId, fieldName, 0);
  return {
    schemaVersion: 1,
    surfaceId,
    fieldName,
    fieldOccurrence: 0,
    fieldContractKey,
    mode: "editable",
    schemaReference: "src/shared/contracts/cms-content.ts#title",
    cases: Object.fromEntries(
      CMS_SEMANTIC_FIELD_CASES.map((caseId) => [
        caseId,
        exercised("ui-validation", fieldContractKey, caseId),
      ]),
    ) as CmsSemanticFieldEvidence["cases"],
    persistence: exercised("reload-persistence", fieldContractKey, "persistence"),
    backend: exercised("backend-response", fieldContractKey, "backend"),
    audit: exercised("immutable-audit", fieldContractKey, "audit"),
    status: "passed",
  };
}

describe("contrato semântico versionado dos controles CMS", () => {
  it("gera IDs determinísticos por superfície, controle e ordinal", () => {
    expect(cmsSemanticControlId("content-new", field, 0)).toBe("content-new:field:input:titulo:0");
    expect(cmsSemanticControlId("content-new", field, 1)).not.toBe(
      cmsSemanticControlId("content-new", field, 0),
    );
  });

  it("classifica campos, ações mutantes, navegação e recusa controles desconhecidos", () => {
    expect(resolveCmsSemanticBinding("content-new", field, 0)).toMatchObject({
      schemaVersion: CMS_SEMANTIC_CONTROL_CONTRACT_VERSION,
      classification: "field.editable",
      handlerId: "field.require-schema-scenario-text",
      requiredEvidence: ["scenario-contract"],
    });
    expect(
      resolveCmsSemanticBinding(
        "content-new",
        { ...field, kind: "action", tag: "button", name: "Salvar rascunho" },
        1,
      ),
    ).toMatchObject({
      classification: "action.mutating",
      requiredEvidence: ["backend-response"],
    });
    expect(
      resolveCmsSemanticBinding(
        "content-new",
        { ...field, kind: "link", tag: "a", destination: "/admin/conteudo" },
        2,
      ),
    ).toMatchObject({ classification: "navigation.link" });
    expect(resolveCmsSemanticBinding("content-new", { ...field, kind: "other" }, 3)).toMatchObject({
      classification: "unsupported",
      handlerId: "unsupported",
    });
  });

  it.each([
    "Abrir nova versão",
    "Encerrar sessão",
    "Fechar sessão",
    "Cancelar",
    "Tentar novamente",
    "Entrar",
    "Solicitar link",
    "Configurar autenticador",
    "Verificar e entrar",
  ])("trata o botão %s como side effect até existir ledger exato", (name) => {
    expect(
      resolveCmsSemanticBinding("auth-or-editor", { ...field, kind: "action", tag: "button", name }, 0),
    ).toMatchObject({
      classification: "action.mutating",
      handlerId: "action.require-exact-side-effect-evidence",
      requiredEvidence: ["backend-response"],
    });
  });

  it("permite somente ação UI-only explicitamente reversível no scan", () => {
    expect(
      resolveCmsSemanticBinding(
        "work-overview",
        { ...field, kind: "action", tag: "button", name: "Abrir menu administrativo" },
        0,
      ),
    ).toMatchObject({ classification: "action.non-mutating" });
    expect(
      resolveCmsSemanticBinding(
        "media",
        { ...field, kind: "action", tag: "button", name: "Remover tag homologação" },
        1,
      ),
    ).toMatchObject({ classification: "action.non-mutating" });
    expect(
      resolveCmsSemanticBinding(
        "media",
        { ...field, kind: "action", tag: "button", name: "Sair sem salvar" },
        2,
      ),
    ).toMatchObject({ classification: "action.non-mutating" });
    expect(
      resolveCmsSemanticBinding(
        "media",
        { ...field, kind: "action", tag: "button", name: "Remover coleção homologação" },
        3,
      ),
    ).toMatchObject({ classification: "action.mutating" });
  });

  it("exige cada handler por viewport e evidência semântica em vez de foco/observação", () => {
    const binding = resolveCmsSemanticBinding("content-new", field, 0);
    const semanticExecutionRef = cmsSemanticFieldContractKey("content-new", "Título", 0);
    const executions = CMS_SEMANTIC_VIEWPORTS.map((viewport): CmsSemanticExecution => ({
      ...binding,
      viewport,
      executionScope: "scenario-once",
      semanticExecutionRef,
      handlerExecuted: true,
      evidenceKind: "scenario-contract",
      evidenceReference: `cms-field-scenarios.json#semanticFields/${semanticExecutionRef}`,
      restored: true,
      status: "passed",
    }));
    expect(
      validateCmsSemanticCoverage({
        bindings: [binding],
        executions,
        expectedSurfaceIds: ["content-new"],
      }),
    ).toMatchObject({ status: "passed", failures: [] });

    expect(
      validateCmsSemanticCoverage({
        bindings: [binding],
        executions: [{ ...executions[0], evidenceKind: "focus-only", restored: false }],
        expectedSurfaceIds: ["content-new"],
      }).failures,
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("non-semantic-evidence"),
        expect.stringContaining("scenario-once-without-contract-evidence"),
        expect.stringContaining("unexercised-control"),
      ]),
    );
  });

  it("falha por controle sem classificação, ação sem execução ou referência de prova", () => {
    const unsupported = resolveCmsSemanticBinding(
      "work-release",
      { ...field, kind: "other", name: "Controle customizado" },
      0,
    );
    const action = resolveCmsSemanticBinding(
      "work-release",
      { ...field, kind: "action", tag: "button", name: "Publicar conjunto" },
      1,
    );
    const result = validateCmsSemanticCoverage({
      bindings: [unsupported, action],
      executions: [
        {
          ...action,
          viewport: "390x844",
          executionScope: "scenario-once",
          semanticExecutionRef: cmsMutatingActionContractKey("work-release", "Publicar conjunto", 1),
          handlerExecuted: false,
          evidenceKind: "backend-response",
          evidenceReference: null,
          restored: false,
          status: "failed",
        },
      ],
      expectedSurfaceIds: ["work-release"],
    });
    expect(result.status).toBe("failed");
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("unsupported-control"),
        expect.stringContaining("handler-not-executed"),
        expect.stringContaining("evidence-reference-missing"),
        expect.stringContaining("execution-failed"),
      ]),
    );
  });

  it("vincula cada sourceControl a uma execução runtime específica por nome e ocorrência", () => {
    const first = resolveCmsSemanticBinding("content-new", field, 0);
    const second = resolveCmsSemanticBinding("content-new", field, 1);
    const executions = [first, second].map((binding): CmsSemanticExecution => ({
      ...binding,
      viewport: "390x844",
      executionScope: "viewport-local",
      semanticExecutionRef: null,
      handlerExecuted: true,
      evidenceKind: "ui-interaction",
      evidenceReference: `dom-value-roundtrip:${binding.ordinal}`,
      restored: true,
      status: "passed",
    }));
    const result = mapCmsSourceControlsToRuntime({
      surfaceId: "content-new",
      viewport: "390x844",
      sourceControls: [
        {
          id: "src/Editor.tsx:10:input:1",
          classification: "field",
          element: "input",
          accessibleNameHint: "Título",
          ownerRouteIds: ["content-new"],
        },
        {
          id: "src/Editor.tsx:11:input:2",
          classification: "field",
          element: "input",
          accessibleNameHint: "Título",
          ownerRouteIds: ["content-new"],
        },
      ],
      executions,
    });
    expect(result.status).toBe("passed");
    expect(result.mappings.map((mapping) => mapping.runtimeControlId)).toEqual([
      first.controlId,
      second.controlId,
    ]);
    expect(new Set(result.mappings.map((mapping) => mapping.runtimeControlId)).size).toBe(2);
    expect(result.mappings.map((mapping) => mapping.runtimeControlOccurrence)).toEqual([0, 1]);
  });

  it("falha por sourceControl ausente ou ambíguo em vez de reutilizar prova genérica", () => {
    const binding = resolveCmsSemanticBinding("content-new", field, 0);
    const execution: CmsSemanticExecution = {
      ...binding,
      viewport: "390x844",
      executionScope: "viewport-local",
      semanticExecutionRef: null,
      handlerExecuted: true,
      evidenceKind: "ui-interaction",
      evidenceReference: "dom-value-roundtrip:text",
      restored: true,
      status: "passed",
    };
    const result = mapCmsSourceControlsToRuntime({
      surfaceId: "content-new",
      viewport: "390x844",
      sourceControls: [
        {
          id: "src/Editor.tsx:10:input:1",
          classification: "field",
          element: "input",
          accessibleNameHint: "Título",
          ownerRouteIds: ["content-new"],
        },
        {
          id: "src/Editor.tsx:11:input:2",
          classification: "field",
          element: "input",
          accessibleNameHint: "Título",
          ownerRouteIds: ["content-new"],
        },
      ],
      executions: [execution],
    });
    expect(result.status).toBe("failed");
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining("named-cardinality-mismatch"),
        expect.stringContaining("fallback-cardinality-mismatch"),
        expect.stringContaining("source-control-unmapped"),
      ]),
    );
  });

  it("preserva sourceControl de ramo canônico inalcançável sem alegar execução", () => {
    const sourceControl = {
      id: "src/admin/pages/AdminMediaPage.tsx:281:form:1",
      classification: "form" as const,
      element: "form",
      accessibleNameHint: "Imagem original",
      ownerRouteIds: ["media"],
      runtimeApplicabilityBySurface: {
        media: {
          applicability: "not-applicable" as const,
          basisCode: "feature-branch-disabled" as const,
          justification:
            "A superfície canônica exige ev2.dam e não renderiza o componente legado nesta homologação.",
          documentationReference: "src/admin/ev2-runtime.ts#ev2.dam",
        },
      },
    };
    const result = mapCmsSourceControlsToRuntime({
      surfaceId: "media",
      viewport: "390x844",
      sourceControls: [sourceControl],
      executions: [],
    });
    expect(result).toMatchObject({ status: "passed", failures: [], mappings: [] });
    expect(result.notApplicable).toEqual([
      expect.objectContaining({
        sourceControlId: sourceControl.id,
        applicability: "not-applicable",
        basisCode: "feature-branch-disabled",
        handlerExecuted: false,
        evidenceKind: null,
        semanticExecutionRef: null,
        status: "not-applicable",
      }),
    ]);

    const invalid = structuredClone(sourceControl);
    invalid.runtimeApplicabilityBySurface.media.documentationReference = "docs/ev2/README.md";
    expect(
      mapCmsSourceControlsToRuntime({
        surfaceId: "media",
        viewport: "390x844",
        sourceControls: [invalid],
        executions: [],
      }),
    ).toMatchObject({
      status: "failed",
      notApplicable: [],
      failures: [expect.stringContaining("CMS_SOURCE_CONTROL_NOT_APPLICABLE_INVALID")],
    });
  });

  it("mapeia uma expressão JSX repetida a uma ocorrência canônica sem ignorar execuções dinâmicas", () => {
    const first = resolveCmsSemanticBinding("content-list", field, 0);
    const second = resolveCmsSemanticBinding("content-list", field, 1);
    const toExecution = (binding: typeof first): CmsSemanticExecution => ({
      ...binding,
      viewport: "390x844",
      executionScope: "viewport-local",
      semanticExecutionRef: null,
      handlerExecuted: true,
      evidenceKind: "ui-interaction",
      evidenceReference: `dom-value-roundtrip:${binding.ordinal}`,
      restored: true,
      status: "passed",
    });
    const result = mapCmsSourceControlsToRuntime({
      surfaceId: "content-list",
      viewport: "390x844",
      sourceControls: [
        {
          id: "src/ContentList.tsx:20:input:1",
          classification: "field",
          element: "input",
          accessibleNameHint: "Título",
          ownerRouteIds: ["content-list"],
        },
      ],
      executions: [toExecution(first), toExecution(second)],
    });
    expect(result).toMatchObject({ status: "passed", failures: [] });
    expect(result.mappings).toHaveLength(1);
    expect(result.mappings[0]?.runtimeControlId).toBe(first.controlId);
  });

  it("não interpreta handlers JSX nem ids DOM como nomes acessíveis auth", () => {
    const runtimeControls: CmsRuntimeControl[] = [
      { ...field, kind: "form", tag: "form", name: "Autenticação MFA" },
      { ...field, name: "Código de 6 dígitos" },
      { ...field, kind: "action", tag: "button", name: "Configurar autenticador" },
      { ...field, kind: "action", tag: "button", name: "Cancelar e sair" },
    ];
    const executions = runtimeControls.map((control, ordinal): CmsSemanticExecution => {
      const binding = resolveCmsSemanticBinding("auth-mfa", control, ordinal);
      const scenarioOnce = binding.classification === "action.mutating";
      const reference = scenarioOnce ? cmsMutatingActionContractKey("auth-mfa", control.name, ordinal) : null;
      return {
        ...binding,
        viewport: "390x844",
        executionScope: scenarioOnce ? "scenario-once" : "viewport-local",
        semanticExecutionRef: reference,
        handlerExecuted: true,
        evidenceKind: scenarioOnce ? "backend-response" : "ui-interaction",
        evidenceReference: scenarioOnce
          ? `cms-auth-lifecycle.json#semanticActions/${reference}`
          : "dom:value-roundtrip",
        restored: true,
        status: "passed",
      };
    });
    const result = mapCmsSourceControlsToRuntime({
      surfaceId: "auth-mfa",
      viewport: "390x844",
      sourceControls: [
        {
          id: "src/admin/pages/MfaPage.tsx:66:button:1",
          classification: "action",
          element: "button",
          accessibleNameHint: "void startEnrollment()} disabled= >",
          ownerRouteIds: ["auth-mfa"],
        },
        {
          id: "src/admin/pages/MfaPage.tsx:79:form:2",
          classification: "form",
          element: "form",
          accessibleNameHint: "Código setCode(event.target.value)}",
          ownerRouteIds: ["auth-mfa"],
        },
        {
          id: "src/admin/pages/MfaPage.tsx:81:input:3",
          classification: "field",
          element: "input",
          accessibleNameHint: "admin-mfa-code",
          ownerRouteIds: ["auth-mfa"],
        },
        {
          id: "src/admin/pages/MfaPage.tsx:99:button:4",
          classification: "action",
          element: "button",
          accessibleNameHint: "void signOut()}> Cancelar e sair",
          ownerRouteIds: ["auth-mfa"],
        },
      ],
      executions,
    });
    expect(result).toMatchObject({ status: "passed", failures: [] });
    expect(result.mappings).toHaveLength(4);
    expect(result.mappings.every((mapping) => mapping.mapping === "class-cardinality-and-occurrence")).toBe(
      true,
    );
  });

  it("não reutiliza evidência de outro botão com o mesmo verbo", () => {
    const evidence: CmsMutatingActionEvidence = {
      schemaVersion: 1,
      surfaceId: "content-edit",
      controlName: "Salvar metadados",
      controlOccurrence: 0,
      controlContractKey: cmsMutatingActionContractKey("content-edit", "Salvar metadados", 0),
      actions: ["save"],
      scenarioIds: ["content-save-metadata-via-ui"],
      handlerExecuted: true,
      evidenceKind: "backend-response",
      backendStatus: "draft",
      httpStatus: 200,
      status: "passed",
    };
    expect(() =>
      resolveCmsMutatingActionEvidence({
        surfaceId: "content-edit",
        controlName: "Salvar rascunho",
        controlOccurrence: 0,
        evidence: [evidence],
      }),
    ).toThrow(/CMS_SEMANTIC_ACTION_EVIDENCE_COUNT:.*:0$/);
  });

  it("recusa referência scenario-once ausente ou reciclada entre controles", () => {
    const save = resolveCmsSemanticBinding(
      "content-edit",
      { ...field, kind: "action", tag: "button", name: "Salvar rascunho" },
      0,
    );
    const publish = resolveCmsSemanticBinding(
      "content-edit",
      { ...field, kind: "action", tag: "button", name: "Publicar agora" },
      0,
    );
    const sharedReference = cmsMutatingActionContractKey("content-edit", "Salvar rascunho", 0);
    const result = validateCmsSemanticCoverage({
      bindings: [save, publish],
      executions: [
        {
          ...save,
          viewport: "390x844",
          executionScope: "scenario-once",
          semanticExecutionRef: sharedReference,
          handlerExecuted: true,
          evidenceKind: "backend-response",
          evidenceReference: `cms-final-coverage.json#semanticActions/${sharedReference}`,
          restored: true,
          status: "passed",
        },
        {
          ...publish,
          viewport: "390x844",
          executionScope: "scenario-once",
          semanticExecutionRef: sharedReference,
          handlerExecuted: true,
          evidenceKind: "backend-response",
          evidenceReference: `cms-final-coverage.json#semanticActions/${sharedReference}`,
          restored: true,
          status: "passed",
        },
      ],
      expectedSurfaceIds: ["content-edit"],
      expectedViewports: ["390x844"],
    });
    expect(result.failures).toContain(`semantic-execution-reference-reused:${sharedReference}`);

    const missing = validateCmsSemanticCoverage({
      bindings: [save],
      executions: [
        {
          ...save,
          viewport: "390x844",
          executionScope: "scenario-once",
          semanticExecutionRef: null,
          handlerExecuted: true,
          evidenceKind: "backend-response",
          evidenceReference: "cms-final-coverage.json#semanticActions/missing",
          restored: true,
          status: "passed",
        },
      ],
      expectedSurfaceIds: ["content-edit"],
      expectedViewports: ["390x844"],
    });
    expect(missing.failures).toEqual(
      expect.arrayContaining([expect.stringContaining("semantic-execution-reference-missing")]),
    );
  });

  it("exige matriz completa de casos, persistência, backend e auditoria por campo", () => {
    const evidence = completeFieldEvidence();
    expect(
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: evidence.fieldOccurrence,
        evidence: [evidence],
      }),
    ).toBe(evidence);

    const missingBoundary = structuredClone(evidence);
    delete (missingBoundary.cases as Partial<CmsSemanticFieldEvidence["cases"]>)["upper-boundary"];
    expect(() =>
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: 0,
        evidence: [missingBoundary],
      }),
    ).toThrow(/CMS_SEMANTIC_FIELD_EVIDENCE_COUNT:.*:0$/);

    const unrelatedControl = structuredClone(evidence);
    const validDisposition = unrelatedControl.cases.valid;
    if (validDisposition.applicability !== "exercised") {
      throw new Error("fixture de campo válido precisa conter prova exercitada");
    }
    unrelatedControl.cases.valid = {
      ...validDisposition,
      evidenceReference: "cms-field-scenarios.json#scenarios/field|content-edit|resumo|0/valid",
    };
    expect(() =>
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: 0,
        evidence: [unrelatedControl],
      }),
    ).toThrow(/CMS_SEMANTIC_FIELD_EVIDENCE_COUNT:.*:0$/);

    const recycledCase = structuredClone(evidence);
    recycledCase.cases.invalid = recycledCase.cases.valid;
    expect(() =>
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: 0,
        evidence: [recycledCase],
      }),
    ).toThrow(/CMS_SEMANTIC_FIELD_EVIDENCE_COUNT:.*:0$/);

    const domOnly = structuredClone(evidence);
    domOnly.persistence = {
      ...exercised("reload-persistence", evidence.fieldContractKey, "persistence"),
      evidenceReference: "dom:fill-and-restore",
    };
    expect(() =>
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: 0,
        evidence: [domOnly],
      }),
    ).toThrow(/CMS_SEMANTIC_FIELD_EVIDENCE_COUNT:.*:0$/);
  });

  it("aceita N/A de campo somente com fundamento documental específico", () => {
    const evidence = completeFieldEvidence();
    evidence.cases["lower-boundary"] = {
      applicability: "not-applicable",
      basisCode: "schema-defines-no-lower-bound",
      justification: "O contrato textual não declara limite inferior.",
      documentationReference: "src/shared/contracts/cms-content.ts#title",
    };
    expect(() =>
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: 0,
        evidence: [evidence],
      }),
    ).not.toThrow();

    const generic = structuredClone(evidence);
    generic.cases["lower-boundary"] = {
      applicability: "not-applicable",
      basisCode: "field-optional-by-schema",
      justification: "Não se aplica genericamente a este caso.",
      documentationReference: "docs/ev2/README.md",
    };
    expect(() =>
      resolveCmsSemanticFieldEvidence({
        surfaceId: evidence.surfaceId,
        fieldName: evidence.fieldName,
        fieldOccurrence: 0,
        evidence: [generic],
      }),
    ).toThrow(/CMS_SEMANTIC_FIELD_EVIDENCE_COUNT:.*:0$/);
  });

  it("exige abertura, submissão/confirmação, efeito e fechamento reais por form/dialog", () => {
    const structure: CmsSemanticStructureEvidence = {
      schemaVersion: 1,
      surfaceId: "content-edit",
      controlKind: "dialog",
      controlName: "Publicar conteúdo?",
      controlOccurrence: 0,
      structureContractKey: cmsSemanticStructureContractKey(
        "content-edit",
        "dialog",
        "Publicar conteúdo?",
        0,
      ),
      scenarioId: "content-publish-confirm-via-ui",
      openedEvidenceReference: "cms-content-scenarios.json#dialog-open",
      submittedOrConfirmedEvidenceReference: "cms-content-scenarios.json#dialog-confirm",
      effectKind: "backend-response",
      effectEvidenceReference: "cms-content-scenarios.json#publish-200",
      httpStatus: 200,
      restoredOrClosedEvidenceReference: "cms-content-scenarios.json#dialog-closed",
      status: "passed",
    };
    const structureReference = (step: string) =>
      `cms-content-scenarios.json#scenarios/${structure.structureContractKey}/${step}`;
    structure.openedEvidenceReference = structureReference("dialog-open");
    structure.submittedOrConfirmedEvidenceReference = structureReference("dialog-confirm");
    structure.effectEvidenceReference = structureReference("publish-200");
    structure.restoredOrClosedEvidenceReference = structureReference("dialog-closed");
    expect(
      resolveCmsSemanticStructureEvidence({
        surfaceId: structure.surfaceId,
        controlKind: structure.controlKind,
        controlName: structure.controlName,
        controlOccurrence: 0,
        evidence: [structure],
      }),
    ).toBe(structure);

    const visibilityOnly = { ...structure, openedEvidenceReference: "dom:visible=true" };
    expect(() =>
      resolveCmsSemanticStructureEvidence({
        surfaceId: structure.surfaceId,
        controlKind: structure.controlKind,
        controlName: structure.controlName,
        controlOccurrence: 0,
        evidence: [visibilityOnly],
      }),
    ).toThrow(/CMS_SEMANTIC_STRUCTURE_EVIDENCE_COUNT:.*:0$/);

    const recycledStep = {
      ...structure,
      effectEvidenceReference: structure.submittedOrConfirmedEvidenceReference,
    };
    expect(() =>
      resolveCmsSemanticStructureEvidence({
        surfaceId: structure.surfaceId,
        controlKind: structure.controlKind,
        controlName: structure.controlName,
        controlOccurrence: 0,
        evidence: [recycledStep],
      }),
    ).toThrow(/CMS_SEMANTIC_STRUCTURE_EVIDENCE_COUNT:.*:0$/);
  });

  it("aceita setup condicional somente quando a ação acessível foi observada sem mutação e restaurada", () => {
    const stateContractKey = cmsSemanticStateContractKey("leads", "lead-editor");
    const setup: CmsSemanticStateSetup = {
      schemaVersion: 1,
      surfaceId: "leads",
      stateId: "lead-editor",
      stateContractKey,
      scenarioId: "lead-opened-from-created-row",
      steps: [
        {
          stepId: "open-created-lead",
          scope: "created-lead-row",
          controlKind: "button",
          accessibleName: "Atender",
          controlOccurrence: 0,
          operation: "activate",
        },
        {
          stepId: "request-safe-navigation",
          scope: "page",
          controlKind: "link",
          accessibleName: "Produtos",
          controlOccurrence: 0,
          operation: "activate",
        },
      ],
      expectedState: {
        kind: "role",
        role: "dialog",
        accessibleName: "Atender",
        occurrence: 0,
      },
      restore: {
        operation: "activate",
        controlKind: "button",
        accessibleName: "Fechar",
        controlOccurrence: 0,
      },
      mutationFree: true,
      observedMutationRequests: 0,
      triggerObserved: true,
      stateObserved: true,
      restored: true,
      evidenceReference: `cms-admin-ops-cycles.json#semanticStateSetups/${stateContractKey}`,
      status: "passed",
    };
    expect(
      resolveCmsSemanticStateSetup({
        surfaceId: "leads",
        stateId: "lead-editor",
        evidence: [setup],
      }),
    ).toBe(setup);
  });

  it("aceita seleção explícita segura para revelar campo condicional e recusa valor livre", () => {
    const stateContractKey = cmsSemanticStateContractKey("users", "delegated-expiration");
    const setup: CmsSemanticStateSetup = {
      schemaVersion: 1,
      surfaceId: "users",
      stateId: "delegated-expiration",
      stateContractKey,
      scenarioId: "delegated-expiration-opened-without-mutation",
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
      expectedState: { kind: "field", accessibleName: "Válida até", occurrence: 0 },
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
    };
    expect(
      resolveCmsSemanticStateSetup({
        surfaceId: "users",
        stateId: "delegated-expiration",
        evidence: [setup],
      }),
    ).toBe(setup);
    expect(() =>
      resolveCmsSemanticStateSetup({
        surfaceId: "users",
        stateId: "delegated-expiration",
        evidence: [
          {
            ...setup,
            steps: [{ ...setup.steps[0]!, optionValue: "delegated;drop" }],
          },
        ],
      }),
    ).toThrow(/CMS_SEMANTIC_STATE_EVIDENCE_COUNT:.*:0$/);
  });

  it("recusa setup condicional mutante, ambíguo, sensível ou sem prova específica", () => {
    const stateContractKey = cmsSemanticStateContractKey("users", "user-summary");
    const setup: CmsSemanticStateSetup = {
      schemaVersion: 1,
      surfaceId: "users",
      stateId: "user-summary",
      stateContractKey,
      scenarioId: "user-summary-opened",
      steps: [
        {
          stepId: "open-user-summary",
          scope: "run-tag-row",
          controlKind: "button",
          accessibleName: "Abrir",
          controlOccurrence: 0,
          operation: "activate",
        },
      ],
      expectedState: {
        kind: "role",
        role: "dialog",
        accessibleName: "Revisor QA gerenciado",
        occurrence: 0,
      },
      restore: {
        operation: "escape",
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
    };
    for (const invalid of [
      { ...setup, observedMutationRequests: 1 as 0 },
      { ...setup, restored: false as true },
      { ...setup, evidenceReference: "cms-admin-ops-cycles.json#generic-state" },
      {
        ...setup,
        steps: [{ ...setup.steps[0]!, accessibleName: "person@example.invalid" }],
      },
    ]) {
      expect(() =>
        resolveCmsSemanticStateSetup({
          surfaceId: "users",
          stateId: "user-summary",
          evidence: [invalid],
        }),
      ).toThrow(/CMS_SEMANTIC_STATE_EVIDENCE_COUNT:.*:0$/);
    }

    expect(() =>
      resolveCmsSemanticStateSetup({
        surfaceId: "users",
        stateId: "user-summary",
        evidence: [setup, structuredClone(setup)],
      }),
    ).toThrow(/CMS_SEMANTIC_STATE_EVIDENCE_COUNT:.*:2$/);
  });
});
