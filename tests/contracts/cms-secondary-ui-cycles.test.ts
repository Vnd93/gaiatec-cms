import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const e2e = readFileSync(resolve(repositoryRoot, "tests/e2e/cms-secondary-ui-cycles.spec.ts"), "utf8");
const builder = readFileSync(resolve(repositoryRoot, "src/admin/pages/AdminPageBuilderPage.tsx"), "utf8");

describe("homologação mutante das superfícies secundárias", () => {
  it("permanece opt-in, vinculada ao SHA e selecionável pelo grep de deploy", () => {
    expect(e2e).toContain('test("@mutating DAM, documentos, PIM, importação, site global e retiradas');
    for (const gate of [
      "QA_CMS_REQUIRE_AUTHENTICATED",
      "QA_CMS_EXPECTED_SHA",
      "QA_CMS_RUN_TAG",
      "QA_CMS_SUPABASE_URL",
      "QA_CMS_SUPABASE_ANON_KEY",
      "QA_CMS_REVIEWER_EMAIL",
      "QA_CMS_REVIEWER_PASSWORD",
      "QA_CMS_REVIEWER_TOTP_SECRET",
    ])
      expect(e2e).toContain(gate);
    expect(e2e).toContain("loadCmsUiCreatedState");
    expect(e2e).toContain("createdState.ids.productId");
    expect(e2e).toContain("createdState.ids.pageId");
    expect(e2e).not.toContain("QA_CMS_SYNTHETIC_IDS");
    expect(e2e).toContain("ev2-g17-canary.gaiatec-cms-staging.pages.dev");
    expect(e2e).toContain("glcqsosxwgmlhzgcsnzv.supabase.co");
    expect(e2e).toContain("https://gaiatecsistemas.com.br");
    expect(e2e).toContain("chfuhctnhqgyjowkvllv.supabase.co");
    expect(e2e).toContain("AUTORIZO-G12-PRODUCAO:");
    expect(e2e).toContain('test.skip(testInfo.project.name !== "desktop-chromium"');
  });

  it("muta somente por controles reais e cobre backend, público, auditoria e negativos", () => {
    for (const edgeFunction of ["cms-media", "cms-documents", "cms-pim", "cms-master-data", "cms-content"])
      expect(e2e).toContain(edgeFunction);
    for (const control of [
      "setInputFiles",
      "Salvar entidade",
      "Salvar rascunho versionado",
      "Executar dry-run",
      "Criar todo o lote como rascunho",
      "Enviar PDF para quarentena",
      "review_download",
      "review_security",
      "Atestar como seguro",
      "Rejeitar documento",
      "Salvar rascunho",
      "Duplicar página",
      "Criar página",
      "Retirar do ar",
      "Restaurar como nova revisão",
    ])
      expect(e2e).toContain(control);
    for (const publicCheck of ["toBe(301)", "toBe(410)", "toBe(404)"]) expect(e2e).toContain(publicCheck);
    expect(e2e).toContain('adminReady(page, "/admin/auditoria")');
    expect(e2e).toContain("O registro de auditoria é imutável");
    expect(e2e).not.toMatch(/service[_ -]?role|supabase\.auth\.admin/i);
    expect(e2e).not.toMatch(/from\(["'`]cms_/);
  });

  it("prova que o href público governado é estável e revogável em todo o cleanup", () => {
    expect(e2e).toContain("publicDocumentHref?: string");
    expect(e2e).toContain('expect(proxy.pathname).toBe("/functions/v1/cms-public")');
    expect(e2e).toContain('["kind", "position", "slug", "type"]');
    expect(e2e).toContain('expect(proxy.searchParams.get("kind")).toBe("product")');
    expect(e2e).toContain('expect(proxy.searchParams.get("slug")).toBe(productSlug)');
    expect(e2e).toContain('expect(proxy.searchParams.get("position")).toBe("1")');
    expect(e2e).toContain('expect(proxy.searchParams.has("documentId")).toBe(false)');
    expect(e2e).toContain('expect(proxy.searchParams.has("sha256")).toBe(false)');
    expect(e2e).toContain("expect(href).not.toContain(state.documentId)");
    expect(e2e).toContain("expect(href).not.toContain(state.documentSha256)");
    expect(e2e).toContain("expect(stableHref).toBe(publishedDocumentHref)");
    expect(e2e).toContain('expect(documentResponse.headers()["cache-control"]).toBe("private, no-store")');
    expect(e2e).toContain(
      'expect(documentResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive")',
    );
    expect(e2e).toContain("expect(response.status()).toBe(404)");
    expect(e2e).toContain('expect(await response.json()).toEqual({ error: "Documento não encontrado." })');
    expect(e2e.match(/expectPublicDocumentRevoked\(page, state\.publicDocumentHref!?\)/g)).toHaveLength(3);

    const publication = e2e.indexOf("state.publicDocumentHref = publishedDocumentHref");
    const productWithdrawal = e2e.indexOf('name: "Despublicar e arquivar produto"', publication);
    const documentArchive = e2e.indexOf('name: "Arquivar documento"', productWithdrawal);
    const neutralization = e2e.indexOf('action: "neutralize_synthetic"', documentArchive);
    expect(publication).toBeGreaterThan(0);
    expect(productWithdrawal).toBeGreaterThan(publication);
    expect(documentArchive).toBeGreaterThan(productWithdrawal);
    expect(neutralization).toBeGreaterThan(documentArchive);
  });

  it("exercita a comparação pública somente por slugs e rejeita identificadores internos no wire", () => {
    expect(e2e).toContain('request.searchParams.has("slugs")');
    expect(e2e).toContain('comparisonRequest.searchParams.get("slugs")?.split(",")');
    expect(e2e).toContain('expect(comparisonRequest.searchParams.has("ids")).toBe(false)');
    expect(e2e).toContain("const comparisonWire = JSON.stringify(await comparisonResponse.json())");
    expect(e2e).toMatch(/expect\(comparisonWire\)\.not\.toMatch\([\s\S]+\{64\}/);
    expect(e2e).toContain('getByRole("heading", { name: "Comparar produtos" })');
    expect(e2e).toContain('getByRole("table")');
  });

  it("faz cleanup fail-closed e grava apenas evidência sanitizada em caminho dedicado", () => {
    const writerStart = e2e.indexOf("function writeEvidence(");
    const writerEnd = e2e.indexOf("// Senha e TOTP", writerStart);
    const evidenceWriter = e2e.slice(writerStart, writerEnd);
    expect(writerStart).toBeGreaterThan(0);
    expect(writerEnd).toBeGreaterThan(writerStart);
    expect(e2e).toContain("QA_CMS_SECONDARY_REPORT_PATH");
    expect(e2e).toContain("outputs/cms-secondary-ui-cycles.json");
    expect(evidenceWriter).toContain("sourceSha: configuration.expectedSha");
    expect(evidenceWriter).toContain("runTag: configuration.runTag");
    expect(evidenceWriter).toContain("state.documentId, state.rejectedDocumentId");
    expect(evidenceWriter).toContain("baseline por operador corporativo AAL2 fora da lease");
    expect(evidenceWriter).toContain("operador QA AAL2; identidade e segredos omitidos");
    expect(evidenceWriter).toContain("syntheticDocumentCount:");
    expect(evidenceWriter).toContain("targetReferenceSha256");
    expect(evidenceWriter).toContain("noIdentifiersPersisted: true");
    expect(evidenceWriter).toContain("QA_CMS_SECONDARY_REPORT_SENSITIVE_VALUE_REFUSED");
    expect(evidenceWriter).not.toContain("syntheticDocumentIds:");
    expect(e2e).toContain(
      'test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" })',
    );
    expect(e2e).toContain("cleanupFailures.length === 0");
    expect(e2e).toContain("Cleanup fail-closed não convergiu");
    expect(e2e).toContain('action: "neutralize_synthetic"');
    expect(e2e).toContain('blobDisposition: "removed"');
    expect(e2e.match(/\[state\.documentId, state\.rejectedDocumentId\]/g)).toHaveLength(2);
    expect(e2e).toContain("writeEvidence(");
    expect(evidenceWriter).not.toMatch(/access[_-]?token|refresh[_-]?token/i);
  });

  it("emite cenários semânticos reais e reabre estados condicionais sem requests mutantes", () => {
    for (const marker of [
      'new CmsSemanticScenarioLedger("cms-secondary-ui-cycles.json")',
      "prepareCmsSemanticField({",
      "prepareSecondaryFieldWithReloadProof({",
      "recordPersistedSecondaryFields(",
      "recordTransientSecondaryField(",
      "recordReloadedSecondaryFields(",
      "semanticScenarios.recordNonEditableField(",
      "semanticScenarios.recordStructure({",
      "recordSecondarySemanticStateSetup(semanticStateSetups, {",
      "semanticScenarios.assertNonEmpty()",
      "semanticFields: semanticScenarios.fields()",
      "semanticStructures: semanticScenarios.structures()",
      "semanticStateSetups: [...semanticStateSetups.values()]",
      "setup de estado condicional não pode executar request mutante",
    ]) {
      expect(e2e).toContain(marker);
    }
    for (const stateId of [
      'stateId: "selected-run-tag-entity"',
      'stateId: "archived-media-details"',
      'stateId: "unsaved-changes-dialog"',
    ]) {
      expect(e2e).toContain(stateId);
    }
    expect(e2e).toContain("observedMutationRequests: 0");
    expect(e2e).not.toMatch(/evidenceReference:\s*["'`]dom:/);
    expect(e2e).not.toMatch(/proofKind:\s*["'`](?:focus-only|observation-only)/);
  });

  it("faz bootstrap de baseline produtivo somente por operador corporativo AAL2 fora da lease", () => {
    for (const gate of [
      "QA_CMS_CORPORATE_EMAIL",
      "QA_CMS_CORPORATE_PASSWORD",
      "QA_CMS_CORPORATE_TOTP_SECRET",
      "QA_CMS_CORPORATE_EMAIL_DOMAIN",
      "PRODUCTION_OPERATOR_EMAIL",
    ])
      expect(e2e).toContain(gate);
    expect(e2e).toContain("corporate.email !== corporate.operatorEmail");
    expect(e2e).toContain("domain[1] !== corporate.allowedEmailDomain");
    expect(e2e).toContain("QA_CMS_PRODUCTION_CORPORATE_BASELINE_IDENTITY_REFUSED");
    expect(e2e).toContain("bootstrapProductionSiteBaseline(");
    expect(e2e).toContain("baseURL: targets.production.site");
    expect(e2e).toContain("expect(corporateUserId).not.toBe(configuration.qaLeaseActorId)");
    expect(e2e).toContain('state.baselineSiteSettings = "created-via-ui"');
    expect(e2e).toContain('state.baselineNavigation = "created-via-ui"');
    expect(e2e).toContain('workflow: "draft-submit-approve-publish"');
    expect(e2e).toContain('baselineOwner: "corporate"');
    expect(e2e).toContain("actorOutsideQaLease: true");
    expect(e2e).toContain('navigationTerminalState: "published-after-restore"');
    expect(e2e).toContain('siteSettingsTerminalState: "published-after-restore"');
    expect(e2e).toContain("publicShellVerifiedAfterRestore: true");
    expect(e2e).toContain("ownerAuthored: true");
    expect(e2e).toContain("canonicalRepositoryDataVerified: true");
    expect(e2e).toContain("verifyStagingSiteBaseline(");
    expect(e2e).toContain('state.baselineSiteSettings = "preexisting-published"');
    expect(e2e).toContain('state.baselineNavigation = "preexisting-published"');
    expect(e2e).toContain("expect(settingsRow.created_by).not.toBe(configuration.qaLeaseActorId)");
    expect(e2e).toContain("expect(navigationRow.created_by).not.toBe(configuration.qaLeaseActorId)");
    expect(e2e).toContain("qaLeaseActorUsed: false");
    expect(e2e).toContain('mutationTransport: "cms-ui-only"');
    expect(e2e).toContain('"reuse-published-baseline"');
    expect(e2e).toContain("sealedPreviewApiGet(");
    expect(e2e).not.toContain("page.request.get(");

    const firstInspection = e2e.indexOf('adminReady(corporatePage, "/admin/site?section=site_settings")');
    const secondInspection = e2e.indexOf('adminReady(corporatePage, "/admin/site?section=navigation")');
    const firstCreation = e2e.indexOf("createCorporateSettings(corporatePage");
    expect(firstInspection).toBeGreaterThan(0);
    expect(secondInspection).toBeGreaterThan(firstInspection);
    expect(firstCreation).toBeGreaterThan(secondInspection);
  });

  it("duplica no editor progressivo sem persistir ou validar direitos presumidos", () => {
    const start = builder.indexOf("function duplicatePage()");
    const end = builder.indexOf("  if (loading)", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const duplicationFlow = builder.slice(start, end);
    expect(duplicationFlow).toContain("duplicateManagedPagePayload");
    expect(duplicationFlow).toContain('navigate("/admin/paginas/novo?type=page"');
    expect(duplicationFlow).toContain("duplicateDraft");
    expect(duplicationFlow).not.toContain("editorialCommand");
    expect(duplicationFlow).not.toContain("CmsPageContentSchema.parse");
    expect(builder).toContain("Cópia aberta como rascunho local incompleto");
    expect(builder).toContain("Complete a governança e os direitos antes de criar a página");
  });
});
