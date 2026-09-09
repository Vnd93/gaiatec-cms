import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type Inventory = {
  schemaVersion: number;
  sourceSha: string | null;
  sourceDirty: boolean | null;
  counts: {
    routerPatterns: number;
    surfaces: number;
    navigationDestinations: number;
    sourceControls: number;
    sourceDataCalls: number;
    edgeFunctions: number;
  };
  documentationCrossCheck: {
    repository: string;
    revision: string;
    localIndexes: string[];
    authoritativeLocations: string[];
    reviewedDocuments: string[];
    status: string;
    redesignArtifact: { fileName: string; sha256: string; classification: string };
  };
  requirementsCoverage: {
    functional: Array<{ id: string; profiles: string[]; surfaceIds: string[]; evidence: string[] }>;
    businessRules: Array<{ id: string; profiles: string[]; surfaceIds: string[]; evidence: string[] }>;
  };
  redesignDivergences: Array<{ id: string; evidence: string[]; status: string }>;
  productPimAuthority: {
    canonicalWriterRoutePatterns: string[];
    canonicalPayload: string;
    contextualReadRoute: string;
    independentPimWriterInCommonUi: boolean;
  };
  discoveredRouterPatterns: string[];
  discoveredNavigationDestinations: string[];
  matrix: Array<{
    id: string;
    route: string;
    routerPattern: string;
    purpose: string;
    permissions: string[];
    apiHelpers: string[];
    edgeFunctions: string[];
    tables: string[];
    storage: string[];
    publicConsumers: string[];
    publicConsumerRoutes: string[];
    positiveScenarios: string[];
    negativeScenarios: string[];
    sourceFiles: string[];
    fields: string[];
    actions: string[];
    tabs: string[];
    controls: string[];
    databaseFunctions: string[];
    functionalRequirements: string[];
    businessRules: string[];
    boundaryScenarios: string[];
    concurrencyScenarios: string[];
    persistenceChecks: string[];
    fieldContracts: Array<{ id: string; valuesToTest: string[]; resultState: string }>;
    actionContracts: Array<{ id: string; semanticProof: string; resultState: string }>;
    apiHelperEdgeBindings: Array<{ helper: string; edgeFunction: string; evidence: string }>;
    state: string;
    evidence: string[];
    correction: string | null;
  }>;
  sourceControls: Array<{
    id: string;
    classification: string;
    ownerRouteIds: string[];
    runtimeApplicabilityBySurface: Record<
      string,
      | { applicability: "required" }
      | {
          applicability: "not-applicable";
          basisCode: "feature-branch-disabled" | "legacy-state-unavailable-by-read-only-cutover";
          justification: string;
          documentationReference: string;
        }
    >;
    evidence: string;
    permissions: string[];
    apiHelpers: string[];
    edgeFunctions: string[];
    databaseFunctions: string[];
    tables: string[];
    storage: string[];
    positiveScenarios: string[];
    negativeScenarios: string[];
    publicResults: string[];
    surfaceBindings: Array<{
      surfaceId: string;
      route: string;
      permissions: string[];
      apiHelpers: string[];
      edgeFunctions: string[];
      databaseFunctions: string[];
      tables: string[];
      storage: string[];
      positiveScenarios: string[];
      negativeScenarios: string[];
      publicResult: string;
    }>;
  }>;
  sourceDataCalls: Array<{
    classification: string;
    target: string;
    ownerRouteIds: string[];
    evidence: string;
  }>;
  publicRoutes: Array<{ route: string; ownerSurfaceIds: string[]; evidence: string; state: string }>;
  edgeFunctions: Array<{
    name: string;
    entrypoint: string;
    ownerSurfaceIds: string[];
    dataCallEvidence: string[];
    consumerEvidence: string[];
    state: string;
  }>;
  backendDataCalls: Array<{
    classification: "database-rpc" | "database-table" | "storage-bucket";
    targets: string[];
    ownerEdgeFunctions: string[];
    ownerSurfaceIds: string[];
    evidence: string;
    state: string;
  }>;
  migrationInventory: {
    migrations: Array<{ path: string; classification: string; state: string }>;
    relations: Array<{ name: string; classification: string; evidence: string; state: string }>;
    databaseFunctions: Array<{ name: string; classification: string; evidence: string; state: string }>;
    storageBuckets: Array<{ name: string; classification: string; evidence: string; state: string }>;
    permissions: Array<{
      permission: string;
      classification: string;
      ownerSurfaceIds: string[];
      state: string;
    }>;
  };
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryScript = resolve(repositoryRoot, "scripts/qa/cms-coverage-inventory.mjs");
const e2eSpec = resolve(repositoryRoot, "tests/e2e/cms-final-coverage.spec.ts");
let generatedInventory: Inventory | null = null;

function generate(): Inventory {
  if (generatedInventory) return generatedInventory;
  const environment: NodeJS.ProcessEnv = { QA_CMS_MATRIX_PATH: "" };
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  generatedInventory = JSON.parse(
    execFileSync(process.execPath, [inventoryScript, "--stdout"], {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as Inventory;
  return generatedInventory;
}

describe("matriz final de cobertura do CMS", () => {
  it("cruza todas as rotas React e destinos de navegação com classificação operacional", () => {
    const report = generate();
    expect(report.schemaVersion).toBe(1);
    expect(report.counts.routerPatterns).toBe(report.discoveredRouterPatterns.length);
    expect(report.counts.navigationDestinations).toBe(report.discoveredNavigationDestinations.length);
    expect(report.counts.surfaces).toBe(report.matrix.length);
    expect(new Set(report.matrix.map((item) => item.id)).size).toBe(report.matrix.length);
    expect(report.matrix.every((item) => item.route.startsWith("/admin"))).toBe(true);
    expect(
      report.matrix.every(
        (item) =>
          item.purpose &&
          item.permissions.length &&
          item.positiveScenarios.length &&
          item.negativeScenarios.length &&
          item.sourceFiles.length &&
          Array.isArray(item.fields) &&
          Array.isArray(item.actions) &&
          Array.isArray(item.tabs) &&
          item.controls.length > 0 &&
          item.positiveScenarios.every((scenario) => scenario.startsWith(`${item.id}:`)) &&
          item.negativeScenarios.every((scenario) => scenario.startsWith(`${item.id}:`)) &&
          item.state &&
          item.evidence.length &&
          item.correction === null,
      ),
    ).toBe(true);
    expect(
      report.discoveredRouterPatterns.every((route) =>
        report.matrix.some((item) => item.routerPattern === route),
      ),
    ).toBe(true);
    expect(
      report.discoveredNavigationDestinations.every((destination) =>
        report.matrix.some((item) => item.route === destination || item.route.split("?")[0] === destination),
      ),
    ).toBe(true);
  }, 30_000);

  it("classifica cada campo, ação, aba, formulário, link e diálogo encontrado no JSX administrativo", () => {
    const report = generate();
    expect(report.counts.sourceControls).toBe(report.sourceControls.length);
    expect(report.sourceControls.length).toBeGreaterThan(100);
    expect(
      report.sourceControls.every(
        (control) =>
          ["field", "action", "tab", "form", "link", "dialog"].includes(control.classification) &&
          control.ownerRouteIds.length > 0 &&
          control.ownerRouteIds.every((owner) => !owner.startsWith("shared:")) &&
          control.permissions.length > 0 &&
          Array.isArray(control.apiHelpers) &&
          Array.isArray(control.edgeFunctions) &&
          Array.isArray(control.databaseFunctions) &&
          Array.isArray(control.tables) &&
          Array.isArray(control.storage) &&
          control.positiveScenarios.length > 0 &&
          control.negativeScenarios.length > 0 &&
          control.surfaceBindings.length === control.ownerRouteIds.length &&
          control.surfaceBindings.every(
            (binding) =>
              control.ownerRouteIds.includes(binding.surfaceId) &&
              binding.route.startsWith("/") &&
              binding.permissions.length > 0 &&
              binding.positiveScenarios.length > 0 &&
              binding.negativeScenarios.length > 0,
          ) &&
          /:\d+$/.test(control.evidence),
      ),
    ).toBe(true);
    const controlIds = new Set(report.sourceControls.map((control) => control.id));
    expect(controlIds.size).toBeGreaterThan(100);
    expect(
      report.matrix.every(
        (surface) =>
          surface.controls.every((id) => controlIds.has(id)) &&
          [...surface.fields, ...surface.actions, ...surface.tabs].every((id) =>
            surface.controls.includes(id),
          ),
      ),
    ).toBe(true);
  });

  it("atribui componentes compartilhados somente às rotas cujo grafo JSX realmente os renderiza", () => {
    const report = generate();
    const authSurfaceIds = new Set(["auth-login", "auth-recovery", "auth-set-password", "auth-mfa"]);
    const adminUiControls = report.sourceControls.filter((control) =>
      control.evidence.startsWith("src/admin/components/AdminUI.tsx:"),
    );
    expect(adminUiControls.length).toBeGreaterThan(0);
    expect(
      adminUiControls.every((control) => control.ownerRouteIds.every((owner) => !authSurfaceIds.has(owner))),
    ).toBe(true);
    expect(adminUiControls.some((control) => control.ownerRouteIds.includes("products-list"))).toBe(true);
    expect(adminUiControls.some((control) => control.ownerRouteIds.includes("leads"))).toBe(true);
    for (const surfaceId of authSurfaceIds) {
      const surface = report.matrix.find((item) => item.id === surfaceId);
      expect(surface?.controls.length).toBeGreaterThan(0);
      expect(
        surface?.controls.every((controlId) => {
          const control = report.sourceControls.find((item) => item.id === controlId);
          return control?.evidence.startsWith("src/admin/pages/") === true;
        }),
      ).toBe(true);
    }
  });

  it("atribui cada editor condicional do site somente à seção selecionada na URL", () => {
    const report = generate();
    const sourcePath = "src/admin/pages/AdminSiteConfigurationPage.tsx";
    const source = readFileSync(resolve(repositoryRoot, sourcePath), "utf8");
    const declarationLine = (name: string) => {
      const index = source.indexOf(`function ${name}(`);
      expect(index, `${name} precisa permanecer uma declaração rastreável`).toBeGreaterThanOrEqual(0);
      return source.slice(0, index).split(/\r?\n/).length;
    };
    const ranges = [
      {
        name: "NavigationEditor",
        owner: "site-navigation",
        start: declarationLine("NavigationEditor"),
        end: declarationLine("SettingsEditor"),
      },
      {
        name: "SettingsEditor",
        owner: "site-settings",
        start: declarationLine("SettingsEditor"),
        end: declarationLine("PlacementEditor"),
      },
      {
        name: "PlacementEditor",
        owner: "site-placements",
        start: declarationLine("PlacementEditor"),
        end: Number.POSITIVE_INFINITY,
      },
    ];
    for (const range of ranges) {
      const controls = report.sourceControls.filter((control) => {
        if (!control.evidence.startsWith(`${sourcePath}:`)) return false;
        const line = Number(control.evidence.slice(sourcePath.length + 1));
        return line >= range.start && line < range.end;
      });
      expect(controls.length, `${range.name} precisa ter controles inventariados`).toBeGreaterThan(0);
      expect(
        controls.every(
          (control) => control.ownerRouteIds.length === 1 && control.ownerRouteIds[0] === range.owner,
        ),
        `${range.name} não pode vazar controles para outra aba do documento global`,
      ).toBe(true);
    }
  });

  it("preserva cardinalidade e classifica somente os dois ramos canônicos inalcançáveis", () => {
    const report = generate();
    const dispositions = report.sourceControls.flatMap((control) =>
      Object.entries(control.runtimeApplicabilityBySurface).flatMap(([surfaceId, disposition]) =>
        disposition.applicability === "not-applicable" ? [{ control, surfaceId, disposition }] : [],
      ),
    );
    expect(dispositions).toHaveLength(34);
    expect(new Set(dispositions.map(({ surfaceId }) => surfaceId))).toEqual(new Set(["media", "pim"]));
    expect(new Set(dispositions.map(({ disposition }) => disposition.basisCode))).toEqual(
      new Set(["feature-branch-disabled", "legacy-state-unavailable-by-read-only-cutover"]),
    );

    const legacyMedia = dispositions.filter(({ surfaceId }) => surfaceId === "media");
    expect(legacyMedia).toHaveLength(29);
    expect(
      legacyMedia.every(
        ({ control, disposition }) =>
          disposition.applicability === "not-applicable" &&
          disposition.basisCode === "feature-branch-disabled" &&
          disposition.documentationReference === "src/admin/ev2-runtime.ts#ev2.dam" &&
          disposition.justification.length >= 32 &&
          (control.evidence.startsWith("src/admin/pages/AdminMediaPage.tsx:") ||
            control.evidence.startsWith("src/admin/components/AdminUI.tsx:")),
      ),
    ).toBe(true);

    const pimLegacy = dispositions.filter(({ surfaceId }) => surfaceId === "pim");
    expect(pimLegacy).toHaveLength(5);
    expect(pimLegacy.map(({ control }) => control.classification).sort()).toEqual(
      ["action", "action", "dialog", "field", "field"].sort(),
    );
    expect(
      pimLegacy.every(
        ({ control, disposition }) =>
          disposition.applicability === "not-applicable" &&
          disposition.basisCode === "legacy-state-unavailable-by-read-only-cutover" &&
          disposition.documentationReference ===
            "supabase/migrations/0078_cms_product_pim_consolidation.sql#legacy-writers-read-only" &&
          control.evidence.startsWith("src/admin/pages/AdminPimPage.tsx:"),
      ),
    ).toBe(true);

    expect(
      report.sourceControls.every((control) =>
        control.ownerRouteIds.every(
          (surfaceId) => control.runtimeApplicabilityBySurface[surfaceId]?.applicability,
        ),
      ),
    ).toBe(true);
  });

  it("classifica helpers, tabelas, RPCs, Auth e transportes encontrados no código administrativo", () => {
    const report = generate();
    expect(report.counts.sourceDataCalls).toBe(report.sourceDataCalls.length);
    // Forms/leads use aggregate readers and PIM no longer exposes a second
    // mutation graph: fewer browser calls are a deliberate consolidation.
    expect(report.sourceDataCalls.length).toBeGreaterThanOrEqual(138);
    expect(
      report.sourceDataCalls.every(
        (call) =>
          ["api-helper", "database-table", "database-rpc", "supabase-auth", "http-transport"].includes(
            call.classification,
          ) &&
          call.target &&
          call.ownerRouteIds.length > 0 &&
          /:\d+$/.test(call.evidence),
      ),
    ).toBe(true);
  });

  it("cruza o inventário produtivo 1:1 de Edge Functions e seus alvos Supabase com as migrations", () => {
    const report = generate();
    const productionBackendSource = readFileSync(
      resolve(repositoryRoot, "scripts/ev2/phase12/production-backend-lib.mjs"),
      "utf8",
    );
    const productionFunctionBlock = productionBackendSource.match(
      /export const PRODUCTION_FUNCTIONS = \[([\s\S]*?)\];/,
    )?.[1];
    expect(productionFunctionBlock).toBeTruthy();
    const productionFunctions = [...(productionFunctionBlock ?? "").matchAll(/"([^"]+)"/g)]
      .map((match) => match[1])
      .sort();
    const reportedFunctions = report.edgeFunctions.map((edge) => edge.name).sort();
    expect(reportedFunctions).toEqual(productionFunctions);
    expect(report.counts.edgeFunctions).toBe(productionFunctions.length);
    expect(report.edgeFunctions).toHaveLength(34);
    expect(report.edgeFunctions.map((edge) => edge.name)).toContain("cms-public");
    expect(report.edgeFunctions.map((edge) => edge.name)).toContain("cms-outbox-worker");
    expect(
      report.edgeFunctions.every(
        (edge) =>
          edge.entrypoint === `supabase/functions/${edge.name}/index.ts` &&
          edge.ownerSurfaceIds.length > 0 &&
          edge.dataCallEvidence.length > 0 &&
          edge.state,
      ),
    ).toBe(true);
    const nonCmsFunctions = [
      "lead-capture",
      "rdo-command",
      "rdo-invite",
      "rdo-notify",
      "rdo-otp",
      "rdo-sign",
      "rdo-team",
      "submit-contact",
    ];
    expect(
      report.edgeFunctions.filter((edge) => !edge.name.startsWith("cms-")).map((edge) => edge.name),
    ).toEqual(nonCmsFunctions);
    expect(
      report.edgeFunctions
        .filter((edge) => nonCmsFunctions.includes(edge.name))
        .every(
          (edge) =>
            edge.ownerSurfaceIds.length > 0 &&
            edge.consumerEvidence.length > 0 &&
            edge.consumerEvidence.every((evidence) => /:\d+$/.test(evidence)) &&
            edge.dataCallEvidence.length > 0,
        ),
    ).toBe(true);
    expect(report.backendDataCalls.some((call) => call.classification === "database-rpc")).toBe(true);
    expect(report.backendDataCalls.some((call) => call.classification === "database-table")).toBe(true);
    expect(report.backendDataCalls.some((call) => call.classification === "storage-bucket")).toBe(true);
    expect(
      report.backendDataCalls.find((call) => call.targets.includes("cms_list_collaboration_assignees")),
    ).toMatchObject({
      classification: "database-rpc",
      ownerEdgeFunctions: ["cms-collaboration"],
      ownerSurfaceIds: ["work-inbox"],
    });
    expect(
      report.backendDataCalls.find((call) => call.targets.includes("cms_abort_dam_upload")),
    ).toMatchObject({
      classification: "database-rpc",
      ownerEdgeFunctions: ["cms-media"],
    });
    expect(
      report.backendDataCalls.every(
        (call) =>
          call.targets.length > 0 &&
          call.ownerEdgeFunctions.length > 0 &&
          call.ownerSurfaceIds.length > 0 &&
          /:\d+$/.test(call.evidence) &&
          call.state,
      ),
    ).toBe(true);
    expect(report.migrationInventory.migrations.length).toBeGreaterThan(50);
    expect(report.migrationInventory.migrations.map((migration) => migration.path)).toEqual(
      expect.arrayContaining([
        "supabase/migrations/0081_cms_collaboration_assignee_directory.sql",
        "supabase/migrations/0082_cms_media_upload_abort.sql",
        "supabase/migrations/0083_cms_session_refresh_revocation.sql",
        "supabase/migrations/0084_cms_lead_origin_form_binding.sql",
        "supabase/migrations/0085_cms_public_relation_limit.sql",
        "supabase/migrations/0086_cms_qa_actor_runtime_repairs.sql",
        "supabase/migrations/0087_cms_runtime_integrity_repairs.sql",
      ]),
    );
    expect(report.migrationInventory.relations.length).toBeGreaterThan(150);
    expect(report.migrationInventory.databaseFunctions.length).toBeGreaterThan(170);
    expect(
      [
        ...report.migrationInventory.relations,
        ...report.migrationInventory.databaseFunctions,
        ...report.migrationInventory.storageBuckets,
      ].every((resource) => resource.classification && resource.evidence && resource.state),
    ).toBe(true);
  });

  it("classifica consumidores públicos e valida permissões contra as migrations", () => {
    const report = generate();
    expect(report.publicRoutes.length).toBeGreaterThan(40);
    expect(report.publicRoutes.map((route) => route.route)).toContain("/preview/:token");
    expect(report.publicRoutes.map((route) => route.route)).toContain("/cms/conteudo/:slug");
    expect(
      report.publicRoutes.every(
        (route) =>
          route.route.startsWith("/") && route.ownerSurfaceIds.length > 0 && /:\d+$/.test(route.evidence),
      ),
    ).toBe(true);
    const knownPermissions = new Set(
      report.migrationInventory.permissions.map((permission) => permission.permission),
    );
    expect(
      report.matrix.every((surface) =>
        surface.permissions
          .filter((permission) => permission.startsWith("cms:"))
          .every((permission) => knownPermissions.has(permission)),
      ),
    ).toBe(true);
    expect(
      report.matrix.every((surface) =>
        surface.apiHelperEdgeBindings.every(
          (binding) =>
            binding.edgeFunction &&
            surface.edgeFunctions.includes(binding.edgeFunction) &&
            binding.evidence === "src/admin/api/cms-api.ts",
        ),
      ),
    ).toBe(true);
    expect(report.matrix.find((surface) => surface.id === "work-inbox")?.edgeFunctions).toContain(
      "cms-outbox-worker",
    );
    expect(report.matrix.find((surface) => surface.id === "content-edit")?.edgeFunctions).toContain(
      "cms-public",
    );
  });

  it("cruza código e índices locais com a documentação CMS/EV2 canônica", () => {
    const report = generate();
    expect(report.documentationCrossCheck.localIndexes).toEqual([
      "src/admin/README.md",
      "docs/ev2/README.md",
    ]);
    expect(report.documentationCrossCheck.revision).toBe("4f5e2e7638fd9a2c2da17717e641abb7e685ece0");
    expect(report.documentationCrossCheck.authoritativeLocations).toContain(
      "https://github.com/Vnd93/gaiatec-documentacao/tree/4f5e2e7638fd9a2c2da17717e641abb7e685ece0/docs/30-cms",
    );
    expect(report.documentationCrossCheck.authoritativeLocations).toContain(
      "https://github.com/Vnd93/gaiatec-documentacao/tree/4f5e2e7638fd9a2c2da17717e641abb7e685ece0/docs/80-evolucao/ev2",
    );
    expect(report.documentationCrossCheck.authoritativeLocations).toContain(".github/release-controls");
    expect(report.documentationCrossCheck.status).toContain("validados");
    expect(report.documentationCrossCheck.redesignArtifact.sha256).toBe(
      "2FB1845FCD40680585F34550A69CD7F9E13631004B32C43B06B6D4B2F8B1E8CF",
    );
  });

  it("rastreia integralmente F-001..F-018, RB-001..RB-060 e a consolidação Produto/PIM", () => {
    const report = generate();
    expect(report.requirementsCoverage.functional.map((item) => item.id)).toEqual(
      Array.from({ length: 18 }, (_, index) => `F-${String(index + 1).padStart(3, "0")}`),
    );
    expect(report.requirementsCoverage.businessRules.map((item) => item.id)).toEqual(
      Array.from({ length: 60 }, (_, index) => `RB-${String(index + 1).padStart(3, "0")}`),
    );
    expect(
      [...report.requirementsCoverage.functional, ...report.requirementsCoverage.businessRules].every(
        (item) => item.profiles.length > 0 && item.surfaceIds.length > 0 && item.evidence.length > 0,
      ),
    ).toBe(true);
    expect(
      report.matrix.every(
        (item) =>
          item.functionalRequirements.length > 0 &&
          item.businessRules.length > 0 &&
          item.boundaryScenarios.length > 0 &&
          item.concurrencyScenarios.length > 0 &&
          item.persistenceChecks.length > 0 &&
          item.fieldContracts.every((field) => field.valuesToTest.length >= 5 && field.resultState) &&
          item.actionContracts.every((action) => action.semanticProof && action.resultState),
      ),
    ).toBe(true);
    expect(report.redesignDivergences.map((item) => item.id)).toEqual(["RD-001", "RD-002", "RD-003"]);
    expect(report.productPimAuthority).toMatchObject({
      canonicalPayload: "CmsProductContentSchema via cms-content",
      contextualReadRoute: "/admin/pim",
      independentPimWriterInCommonUi: false,
    });
  });

  it("mantém autenticação opt-in sem persistir artefatos brutos ou imprimir segredos", () => {
    const source = readFileSync(e2eSpec, "utf8");
    expect(source).toContain('trace: "off"');
    expect(source).toContain('video: "off"');
    expect(source).toContain('screenshot: "off"');
    expect(source).toContain("credentialsPersisted: false");
    expect(source).toContain("syntheticDataValuesPersisted: false");
    expect(source).not.toMatch(/console\.(?:log|error|warn)\s*\(/);
  });

  it("exige controles reais e ciclos editoriais mutantes fail-closed pela interface", () => {
    const source = readFileSync(e2eSpec, "utf8");
    for (const marker of [
      "exerciseRenderedControls",
      "unexpectedMutationRequests",
      "assertNewDraftsStartIncomplete",
      "editorialSurfacePlans",
      'kind: "post"',
      'kind: "product"',
      '["service", ids.serviceId',
      '["industry", ids.industryId',
      '["application", ids.applicationId',
      '["solution", ids.solutionId',
      'kind: "campaign"',
      "createAndRollbackSyntheticForm",
      "bindSyntheticFormToCampaign",
      "expectPublishedFormContract",
      "form_restore_version_1_and_public_contract",
      "Abrir nova versão e salvar",
      "createMandatoryEditorialSurfacesViaUi",
      "acceptIabLeadAndMarkResponded",
      "createCmsRealBrowserChallenge",
      "waitForCmsRealBrowserAttestation",
      "cmsRealBrowserEvidenceSummary",
      "iab-attested-lead-capture-and-admin-responded",
      "authoritativePersistence",
      'selectOption("responded")',
      "runSyntheticEditorialReleaseViaUi",
      "editorial_release_create_validate_approve_publish_rollback_via_ui",
      "positiveLeadSubmitted: Boolean(lead)",
      'externalDeliveryAttempted: "suppressed for exact synthetic origin by backend policy"',
      "writeCmsUiCreatedState",
      "mutatingEntityLifecycles",
      "cleanup-pending",
    ]) {
      expect(source).toContain(marker);
    }
    expect(source).toContain("test.setTimeout(25 * 60_000)");
    expect(source).not.toMatch(/QA_CMS_(?:BYPASS|DISABLE)_TURNSTILE/);
    expect(source).not.toContain("createLeadViaPublicUiAndMarkResponded");
    expect(source).not.toMatch(/turnstile(?:Token|Response)|captchaToken/i);
    expect(source).not.toContain("positiveLeadSubmitted: true");
    expect(source).not.toContain("approved-by-staging-release-gate");
  });

  it("fecha o ciclo mutante nos alvos exatos, com autorização produtiva e cleanup não destrutivo", () => {
    const source = readFileSync(e2eSpec, "utf8");
    for (const marker of [
      "QA_CMS_REQUIRE_AUTHENTICATED",
      "QA_CMS_RUN_TAG",
      "QA_CMS_SUPABASE_URL",
      "QA_CMS_SUPABASE_ANON_KEY",
      "QA_CMS_TARGET_ENVIRONMENT",
      "QA_CMS_PRODUCTION_AUTHORIZATION",
      "QA_CMS_AUTHENTICATED_SUITE_SCHEDULED",
      "O alvo production não pode ignorar o ciclo mutante autenticado.",
      "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
      "https://glcqsosxwgmlhzgcsnzv.supabase.co",
      "https://gaiatecsistemas.com.br",
      "https://chfuhctnhqgyjowkvllv.supabase.co",
      "`AUTORIZO-G12-PRODUCAO:${auth.expectedSha}`",
      "health?.environment !== sealedPreviewDeploymentEnvironment(environment)",
      "health.release !== expectedSha",
      'response.headers()["x-release"] !== expectedSha',
      '"create"',
      '"save"',
      '"submit"',
      '"approve"',
      '"publish"',
      '"reopen"',
      '"restore"',
      '"retire"',
      "expectPublicRevision",
      "expectRetiredPublicRoute",
      "immutable_audit_visible",
      "archiveSyntheticFromUi",
      "rawBrowserArtifacts",
      "published-for-downstream",
      "productionMutations:",
      "invalid_password_generic_rejection",
      "invalid_or_expired_mfa_generic_rejection",
      "logout_and_protected_route_rejection",
      "@mutating",
      'context.waitForEvent("response"',
      "previewNavigation.status() !== 200",
      "previewNavigationPath !== previewBody.path",
    ]) {
      expect(source).toContain(marker);
    }
    expect(source).toContain('test.skip(testInfo.project.name !== "desktop-chromium"');
    expect(source).not.toContain(
      'mutationTargetEnvironment() === "production",\n      "varredura autenticada geral permanece restrita ao staging"',
    );
    expect(source).toContain(
      'finalSyntheticState: archived ? "archived-after-failure" : "published-for-downstream"',
    );
    expect(source).toContain("concurrent_stale_edit_rejected");
    expect(source).toContain("writeCmsUiCreatedState");
    expect(source.indexOf("const environment = mutationTargetEnvironment()")).toBeLessThan(
      source.indexOf("const gate = process.env.QA_CMS_REQUIRE_AUTHENTICATED"),
    );
    expect(source.indexOf('const previewNavigationPromise = context.waitForEvent("response"')).toBeLessThan(
      source.indexOf('await page.getByRole("button", { name: "Preview salvo" }).click()'),
    );
    expect(source).not.toMatch(/QA_CMS_MUTATION_/);
    expect(source).not.toMatch(/(?:hard_delete|deleteUser|supabase[^\n]{0,120}\.delete\s*\()/i);
  });
});
