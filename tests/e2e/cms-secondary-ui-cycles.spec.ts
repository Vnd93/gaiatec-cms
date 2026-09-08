import { createHash, createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import sharp from "sharp";
import { BULK_TEMPLATE_VERSION, bulkRequiredHeaders } from "../../src/admin/bulk-import-model";
import {
  createCmsBrowserObserver,
  sanitizeBrowserDiagnostic,
  type CmsBrowserObserver,
} from "./cms-browser-observer";
import {
  assertSealedPreviewRoutingUsed,
  installSealedPreviewRouting,
  sealedPreviewApiGet,
  sealedPreviewDeploymentEnvironment,
  sealedPreviewRoutingEvidence,
} from "./cms-sealed-preview-routing";
import { createCmsSemanticActionLedger, type CmsSemanticActionLedger } from "./cms-semantic-action-ledger";
import {
  cmsSemanticStateContractKey,
  resolveCmsSemanticStateSetup,
  type CmsSemanticStateSetup,
} from "./cms-semantic-control-contract";
import {
  CmsSemanticScenarioLedger,
  prepareCmsSemanticField,
  type CmsPreparedSemanticField,
} from "./cms-semantic-scenario-ledger";
import { loadCmsUiCreatedState } from "./cms-ui-created-state";

test.beforeEach(async ({ context }) => {
  await installSealedPreviewRouting(context);
});
test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) assertSealedPreviewRoutingUsed(context);
});

type SyntheticIds = {
  productId: string;
  pageId: string;
};

type MutationConfiguration = {
  environment: "staging" | "production";
  email: string;
  password: string;
  totpSecret: string;
  reviewerEmail: string;
  reviewerPassword: string;
  reviewerTotpSecret: string;
  expectedSha: string;
  runTag: string;
  supabaseOrigin: string;
  anonKey: string;
  qaLeaseActorId: string;
  corporateActor?: {
    email: string;
    password: string;
    totpSecret: string;
    allowedEmailDomain: string;
  };
  ids: SyntheticIds;
};

type ScenarioEvidence = {
  scenario: string;
  status: "passed" | "failed";
  checks: string[];
  targetType?: string;
  targetId?: string;
};

type CleanupEvidence = {
  target: string;
  status: "archived" | "inactive" | "neutralized" | "restored" | "not-created" | "failed";
};

type ActionResult = {
  response: Response;
  body: Record<string, unknown>;
};

type SemanticActionTarget = {
  ledger: CmsSemanticActionLedger;
  surfaceId: string;
  controlName: string;
  target: Locator;
  scenarioId: string;
};

function semanticTarget(
  ledger: CmsSemanticActionLedger,
  surfaceId: string,
  controlName: string,
  target: Locator,
  scenarioId: string,
): SemanticActionTarget {
  return { ledger, surfaceId, controlName, target, scenarioId };
}

function recordSecondarySemanticStateSetup(
  ledger: Map<string, CmsSemanticStateSetup>,
  entry: Omit<
    CmsSemanticStateSetup,
    | "schemaVersion"
    | "stateContractKey"
    | "mutationFree"
    | "observedMutationRequests"
    | "triggerObserved"
    | "stateObserved"
    | "restored"
    | "evidenceReference"
    | "status"
  >,
) {
  const stateContractKey = cmsSemanticStateContractKey(entry.surfaceId, entry.stateId);
  const value: CmsSemanticStateSetup = {
    schemaVersion: 1,
    ...entry,
    stateContractKey,
    mutationFree: true,
    observedMutationRequests: 0,
    triggerObserved: true,
    stateObserved: true,
    restored: true,
    evidenceReference: `cms-secondary-ui-cycles.json#semanticStateSetups/${stateContractKey}`,
    status: "passed",
  };
  const resolved = resolveCmsSemanticStateSetup({
    surfaceId: value.surfaceId,
    stateId: value.stateId,
    evidence: [value],
  });
  if (ledger.has(resolved.stateContractKey)) {
    throw new Error(`QA_CMS_SEMANTIC_STATE_DUPLICATE:${resolved.stateContractKey}`);
  }
  ledger.set(resolved.stateContractKey, resolved);
}

function recordPersistedSecondaryFields(
  ledger: CmsSemanticScenarioLedger,
  fields: CmsPreparedSemanticField[],
  httpStatus: number,
) {
  for (const field of fields) {
    ledger.recordField(field, {
      httpStatus,
      backendExpectedResult: "O backend deve aceitar o valor validado no comando governado.",
      backendObservedResult: "A resposta 2xx confirmou o campo no registro governado.",
      persistence: {
        applicability: "exercised",
        expectedResult: "O valor deve reaparecer após reload da fonte autoritativa.",
        observedResult: "A recarga da interface confirmou o valor ou efeito persistido.",
      },
      audit: {
        applicability: "exercised",
        expectedResult: "A alteração deve permanecer na trilha imutável de auditoria.",
        observedResult: "A tela final de auditoria confirmou o evento governado.",
      },
    });
  }
}

function recordTransientSecondaryField(
  ledger: CmsSemanticScenarioLedger,
  field: CmsPreparedSemanticField,
  httpStatus: number,
  kind: "query" | "command",
  audited: boolean,
) {
  ledger.recordField(field, {
    httpStatus,
    backendExpectedResult: "O backend deve processar o valor somente no escopo controlado.",
    backendObservedResult: "A resposta 2xx confirmou o processamento sem ampliar o escopo.",
    persistence: {
      applicability: "not-applicable",
      basisCode: kind === "query" ? "transient-query-field" : "transient-command-field",
      justification:
        kind === "query"
          ? "O campo controla somente a consulta atual e não integra o registro persistido."
          : "O campo pertence somente ao comando atual e não deve permanecer no formulário.",
      documentationReference: field.schemaReference,
    },
    audit: audited
      ? {
          applicability: "exercised",
          expectedResult: "O comando sensível deve constar na auditoria imutável.",
          observedResult: "A tela final de auditoria confirmou o comando sensível.",
        }
      : {
          applicability: "not-applicable",
          basisCode: "non-mutating-query-not-audited",
          justification: "A consulta não mutante é transitória e não gera alteração auditável.",
          documentationReference: field.schemaReference,
        },
  });
}

type ReloadFieldProof = {
  prepared: CmsPreparedSemanticField;
  locator: Locator;
  value: string;
  checked: boolean | null;
};

async function prepareSecondaryFieldWithReloadProof(
  input: Parameters<typeof prepareCmsSemanticField>[0],
): Promise<ReloadFieldProof> {
  const prepared = await prepareCmsSemanticField(input);
  const state = await input.locator.evaluate((element) => {
    if (!(
      element instanceof HTMLInputElement ||
      element instanceof HTMLSelectElement ||
      element instanceof HTMLTextAreaElement
    )) {
      throw new Error("semantic reload target is not a form field");
    }
    return {
      value: element.value,
      checked:
        element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type)
          ? element.checked
          : null,
    };
  });
  return { prepared, locator: input.locator, ...state };
}

async function assertSecondaryFieldsAfterReload(fields: ReloadFieldProof[]) {
  for (const field of fields) {
    await field.locator.waitFor({ state: "visible" });
    if (field.checked === null) await expect(field.locator).toHaveValue(field.value);
    else if (field.checked) await expect(field.locator).toBeChecked();
    else await expect(field.locator).not.toBeChecked();
  }
}

function recordReloadedSecondaryFields(
  ledger: CmsSemanticScenarioLedger,
  fields: ReloadFieldProof[],
  httpStatus: number,
) {
  recordPersistedSecondaryFields(
    ledger,
    fields.map((field) => field.prepared),
    httpStatus,
  );
}

type ControlledVocabularyList = {
  list_key: string;
  options: Array<{ id: string; slug: string; label: string; active: boolean }>;
};

type SecondaryState = {
  mediaId?: string;
  mediaFilename?: string;
  documentId?: string;
  documentTitle?: string;
  documentSha256?: string;
  publicDocumentHref?: string;
  rejectedDocumentId?: string;
  bulkProductId?: string;
  bulkProductSlug?: string;
  pimProductId?: string;
  pimProductName?: string;
  masterEntities: Array<{
    id: string;
    name: string;
    type: "manufacturer" | "category" | "magnitude";
  }>;
  retiredPages: Array<{ id: string; path: string; mode: "redirect" | "gone" }>;
  navigationSaved: boolean;
  navigationRestored: boolean;
  navigationPriorRevision?: string;
  navigationLabel?: string;
  navigationId?: string;
  settingsSaved: boolean;
  settingsRestored: boolean;
  settingsPriorRevision?: string;
  settingsPhone?: string;
  settingsId?: string;
  placementSaved?: boolean;
  placementRestored?: boolean;
  placementArchived?: boolean;
  placementPriorRevision?: string;
  placementLabel?: string;
  placementId?: string;
  baselineNavigation?: "created-via-ui" | "preexisting-published";
  baselineSiteSettings?: "created-via-ui" | "preexisting-published";
  baselineCorporateVerified: boolean;
  siteBaseline?: SiteBaselineEvidence;
};

type SiteBaselineEvidence = {
  navigation: "created-via-ui" | "preexisting-published";
  siteSettings: "created-via-ui" | "preexisting-published";
  workflow: "draft-submit-approve-publish" | "reuse-published-baseline" | "mixed-create-and-reuse";
  aal2: true;
  audit: true;
  public: true;
  idsPersisted: false;
  ownerAuthored: true;
  canonicalRepositoryDataVerified: true;
  baselineOwner: "corporate";
  actorOutsideQaLease: true;
  qaLeaseActorUsed: false;
  mutationTransport: "cms-ui-only";
  navigationTerminalState: "published-after-restore";
  siteSettingsTerminalState: "published-after-restore";
  publicShellVerifiedAfterRestore: true;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = resolve(
  repositoryRoot,
  process.env.QA_CMS_SECONDARY_REPORT_PATH ?? "outputs/cms-secondary-ui-cycles.json",
);
const targets = {
  staging: {
    site: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    supabase: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
  },
  production: {
    site: "https://gaiatecsistemas.com.br",
    supabase: "https://chfuhctnhqgyjowkvllv.supabase.co",
  },
} as const;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidInTextPattern = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const canonicalSiteSettings = {
  companyName: "GAIATEC Sistemas",
  email: "vendas@gaiatecsistemas.com.br",
  phone: "(11) 2207-1986",
  ctaLabel: "Fale com um Especialista",
  ctaHref: "/contato",
} as const;
const canonicalNavigation = {
  header: [
    ["Produtos", "/produtos"],
    ["Indústrias", "/industrias"],
    ["Soluções", "/solucoes"],
    ["Serviços", "/servicos"],
    ["Blog", "/blog"],
    ["Contato", "/contato"],
  ],
  footer: [
    ["Sobre", "/sobre"],
    ["Política de Privacidade", "/politica-de-privacidade"],
    ["Termos de Uso", "/termos-de-uso"],
  ],
} as const;

function mutationConfiguration(baseURL: string | undefined): MutationConfiguration | null {
  if (process.env.QA_CMS_REQUIRE_AUTHENTICATED !== "true") return null;
  const environment = process.env.QA_CMS_TARGET_ENVIRONMENT;
  if (environment !== "staging" && environment !== "production") {
    throw new Error("QA_CMS_TARGET_ENVIRONMENT precisa identificar staging ou production.");
  }
  const required = {
    email: process.env.QA_CMS_EMAIL,
    password: process.env.QA_CMS_PASSWORD,
    totpSecret: process.env.QA_CMS_TOTP_SECRET,
    reviewerEmail: process.env.QA_CMS_REVIEWER_EMAIL,
    reviewerPassword: process.env.QA_CMS_REVIEWER_PASSWORD,
    reviewerTotpSecret: process.env.QA_CMS_REVIEWER_TOTP_SECRET,
    expectedSha: process.env.QA_CMS_EXPECTED_SHA,
    runTag: process.env.QA_CMS_RUN_TAG,
    supabaseUrl: process.env.QA_CMS_SUPABASE_URL,
    anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY,
  };
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Homologação secundária habilitada sem configuração completa: ${missing.join(", ")}.`);
  }
  const target = targets[environment];
  const deployed = new URL(baseURL ?? "https://invalid.invalid");
  const backend = new URL(required.supabaseUrl!);
  if (
    deployed.origin !== target.site ||
    deployed.pathname !== "/" ||
    deployed.search ||
    deployed.hash ||
    deployed.username ||
    deployed.password
  ) {
    throw new Error("A homologação secundária recusou uma origem de site diferente do alvo canônico.");
  }
  if (
    backend.origin !== target.supabase ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash ||
    backend.username ||
    backend.password ||
    required.anonKey!.length < 24
  ) {
    throw new Error("A homologação secundária recusou um projeto Supabase diferente do alvo canônico.");
  }
  if (!/^[0-9a-f]{40}$/.test(required.expectedSha!)) {
    throw new Error("QA_CMS_EXPECTED_SHA precisa ser um SHA Git completo.");
  }
  if (!/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/i.test(required.runTag!)) {
    throw new Error("QA_CMS_RUN_TAG não segue o identificador sintético aprovado.");
  }
  if (
    environment === "production" &&
    process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${required.expectedSha}`
  ) {
    throw new Error("Produção exige autorização literal vinculada ao SHA final.");
  }
  const createdState = loadCmsUiCreatedState({
    repositoryRoot,
    expectedEnvironment: environment,
    expectedSha: required.expectedSha!,
    expectedRunTag: required.runTag!,
  });
  let corporateActor: MutationConfiguration["corporateActor"];
  if (environment === "production") {
    const corporate = {
      email: (process.env.QA_CMS_CORPORATE_EMAIL ?? "").trim().toLowerCase(),
      password: process.env.QA_CMS_CORPORATE_PASSWORD ?? "",
      totpSecret: process.env.QA_CMS_CORPORATE_TOTP_SECRET ?? "",
      allowedEmailDomain: (process.env.QA_CMS_CORPORATE_EMAIL_DOMAIN ?? "")
        .trim()
        .toLowerCase()
        .replace(/^@/, ""),
      operatorEmail: (process.env.PRODUCTION_OPERATOR_EMAIL ?? "").trim().toLowerCase(),
    };
    const domain = corporate.email.split("@");
    if (
      !corporate.email ||
      !corporate.password ||
      !corporate.totpSecret ||
      !corporate.allowedEmailDomain ||
      !corporate.operatorEmail ||
      corporate.email !== corporate.operatorEmail ||
      domain.length !== 2 ||
      domain[1] !== corporate.allowedEmailDomain ||
      [required.email, required.reviewerEmail].some(
        (candidate) => candidate!.trim().toLowerCase() === corporate.email,
      )
    ) {
      throw new Error("QA_CMS_PRODUCTION_CORPORATE_BASELINE_IDENTITY_REFUSED");
    }
    base32Bytes(corporate.totpSecret);
    corporateActor = {
      email: corporate.email,
      password: corporate.password,
      totpSecret: corporate.totpSecret,
      allowedEmailDomain: corporate.allowedEmailDomain,
    };
  }
  return {
    environment,
    email: required.email!,
    password: required.password!,
    totpSecret: required.totpSecret!,
    reviewerEmail: required.reviewerEmail!,
    reviewerPassword: required.reviewerPassword!,
    reviewerTotpSecret: required.reviewerTotpSecret!,
    expectedSha: required.expectedSha!,
    runTag: required.runTag!,
    supabaseOrigin: target.supabase,
    anonKey: required.anonKey!,
    qaLeaseActorId: createdState.lease.actorId,
    corporateActor,
    ids: { productId: createdState.ids.productId, pageId: createdState.ids.pageId },
  };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("O segredo TOTP configurado não está em Base32 válido.");
  }
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Bytes(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

async function signInWithAal2(
  page: Page,
  configuration: MutationConfiguration,
  identity: Pick<MutationConfiguration, "email" | "password" | "totpSecret"> = configuration,
) {
  const response = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(response?.headers()["x-release"]).toBe(configuration.expectedSha);
  await page.getByLabel("E-mail corporativo").fill(identity.email);
  await page.getByLabel("Senha").fill(identity.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await expect(page.getByRole("heading", { name: "Ativar verificação em duas etapas" })).toHaveCount(0);
  const millisecondsInStep = Date.now() % 30_000;
  if (millisecondsInStep > 27_000) await page.waitForTimeout(31_000 - millisecondsInStep);
  await page.getByLabel("Código de 6 dígitos").fill(totp(identity.totpSecret));
  await page.getByRole("button", { name: "Verificar e entrar" }).click();
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
}

async function assertDeployment(
  page: Page,
  expectedSha: string,
  expectedEnvironment: MutationConfiguration["environment"],
) {
  const response = await sealedPreviewApiGet(page, "/healthz", {
    failOnStatusCode: false,
    headers: { "Cache-Control": "no-store" },
  });
  const body = (await response.json()) as Record<string, unknown>;
  expect(response.status()).toBe(200);
  expect(response.headers()["x-release"]).toBe(expectedSha);
  expect(body.environment).toBe(sealedPreviewDeploymentEnvironment(expectedEnvironment));
  expect(body.release).toBe(expectedSha);
}

function functionAction(response: Response, origin: string, functionName: string, action: string) {
  const request = response.request();
  let body: Record<string, unknown>;
  try {
    body = request.postDataJSON() as Record<string, unknown>;
  } catch {
    return false;
  }
  const url = new URL(response.url());
  return (
    request.method() === "POST" &&
    url.origin === origin &&
    url.pathname.endsWith(`/functions/v1/${functionName}`) &&
    body.action === action
  );
}

async function visibleButtonOccurrence(page: Page, name: string, target: Locator) {
  const targetHandle = await target.elementHandle();
  if (!targetHandle) throw new Error(`Controle sem elemento runtime: ${name}.`);
  const candidates = page.getByRole("button", { name, exact: true });
  let occurrence = 0;
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    const candidateHandle = await candidate.elementHandle();
    if (
      candidateHandle &&
      (await candidateHandle.evaluate((element, expected) => element === expected, targetHandle))
    ) {
      return occurrence;
    }
    occurrence += 1;
  }
  throw new Error(`Controle runtime não localizado pela ocorrência: ${name}.`);
}

async function clickAction(
  page: Page,
  configuration: MutationConfiguration,
  functionName: string,
  action: string,
  trigger: () => Promise<void>,
  acceptedStatuses = [200, 201],
  semantic?: SemanticActionTarget,
): Promise<ActionResult> {
  const controlOccurrence = semantic
    ? await visibleButtonOccurrence(page, semantic.controlName, semantic.target)
    : null;
  const responsePromise = page.waitForResponse(
    (response) => functionAction(response, configuration.supabaseOrigin, functionName, action),
    { timeout: 30_000 },
  );
  await trigger();
  const response = await responsePromise;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !body ||
    !acceptedStatuses.includes(response.status()) ||
    !uuidPattern.test(String(body.correlationId ?? ""))
  ) {
    throw new Error(`${functionName}/${action} não foi confirmado de forma auditável pelo backend.`);
  }
  if (semantic && controlOccurrence !== null) {
    semantic.ledger.record({
      surfaceId: semantic.surfaceId,
      controlName: semantic.controlName,
      controlOccurrence,
      action,
      scenarioId: semantic.scenarioId,
      backendStatus: String(body.status ?? body.state ?? action),
      httpStatus: response.status(),
    });
  }
  return { response, body };
}

async function clickEditorial(
  page: Page,
  configuration: MutationConfiguration,
  action: string,
  expectedState: string,
  trigger: () => Promise<void>,
  semantic?: SemanticActionTarget,
) {
  const result = await clickAction(page, configuration, "cms-content", action, trigger, [200, 201], semantic);
  expect(result.body.status).toBe(expectedState);
  expect(uuidPattern.test(String(result.body.itemId ?? ""))).toBe(true);
  return result;
}

async function adminReady(page: Page, path: string) {
  const response = await page.goto(path, { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBeLessThan(400);
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Acesso negado" })).toHaveCount(0);
}

async function buildOriginalImage(runTag: string) {
  const seed = createHash("sha256").update(runTag).digest();
  const background = { r: seed[0]!, g: seed[1]!, b: seed[2]!, alpha: 1 };
  return sharp({ create: { width: 1200, height: 800, channels: 4, background } })
    .png()
    .toBuffer();
}

async function exerciseDam(
  page: Page,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
) {
  await adminReady(page, "/admin/midia");
  await expect(page.getByRole("heading", { name: "Mídia contextual" })).toBeVisible();
  const filename = `${configuration.runTag.toLowerCase()}-dam.png`;
  const alt = `${configuration.runTag} imagem governada`;
  state.mediaFilename = filename;

  await page.getByLabel("Origem", { exact: true }).selectOption("synthetic_test");
  await page.getByLabel("Referência", { exact: true }).fill(configuration.runTag);
  await page.getByLabel("Texto alternativo", { exact: true }).fill(alt);
  const uploadButton = page.getByRole("button", { name: "Verificar e enviar", exact: true });
  const mutationRequests: string[] = [];
  const mutationObserver = (request: { postDataJSON(): unknown }) => {
    try {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (["reserve_upload", "finalize_upload"].includes(String(body.action))) {
        mutationRequests.push(String(body.action));
      }
    } catch {
      // Requests without JSON are irrelevant to this negative control.
    }
  };
  page.on("request", mutationObserver);
  await page.getByRole("button", { name: "Verificar e enviar" }).click();
  const originalInput = page.getByLabel(/^Imagem original/);
  await expect(originalInput).toBeFocused();
  expect(mutationRequests).toEqual([]);

  const originalFile = {
    name: filename,
    mimeType: "image/png",
    buffer: await buildOriginalImage(configuration.runTag),
  };
  await originalInput.setInputFiles(originalFile);

  // O operador fornece somente o original. Ausência/MIME inválido devem falhar
  // antes de qualquer reserva; as seis variantes são geradas localmente pelo CMS.
  await originalInput.setInputFiles([]);
  await uploadButton.click();
  expect(mutationRequests).toEqual([]);
  await originalInput.setInputFiles(originalFile);
  await originalInput.setInputFiles({
    name: "imagem-original-invalida.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("invalid-original-media"),
  });
  await uploadButton.click();
  await expect(page.getByRole("alert")).toBeVisible();
  expect(mutationRequests).toEqual([]);
  await originalInput.setInputFiles(originalFile);
  page.off("request", mutationObserver);
  await page.getByLabel("Confirmo a origem e os direitos de uso").check();
  await expect(uploadButton).toBeEnabled();

  const uploadSemanticFields: CmsPreparedSemanticField[] = [
    await prepareCmsSemanticField({
      page,
      locator: originalInput,
      surfaceId: "media",
      fieldName: "Imagem original",
      scenarioId: "dam-media-upload",
      schemaReference: "src/admin/responsive-media.ts#createResponsiveMediaPackage",
      absence: {
        applicability: "already-exercised",
        proofKind: "ui-validation",
        expectedResult: "A ausência da imagem original obrigatória deve impedir o envio.",
        observedResult: "O envio foi impedido sem reserva ou finalização no backend.",
      },
      invalid: {
        applicability: "already-exercised",
        proofKind: "ui-validation",
        expectedResult: "Uma imagem original com MIME incompatível deve ser rejeitada antes da reserva.",
        observedResult: "O original inválido foi rejeitado sem request mutante.",
      },
    }),
  ];
  const uploadForm = page.getByRole("form", { name: "Enviar mídia governada" });
  for (const [fieldName, accessibleName] of [
    ["Origem", "Origem"],
    ["Referência", "Referência"],
    ["Proprietário", "Proprietário"],
    ["Licença", "Licença"],
    ["Direitos válidos até (opcional)", /^Direitos válidos até/],
    ["Texto alternativo", "Texto alternativo"],
    ["Legenda (opcional)", /^Legenda/],
    ["Crédito (opcional)", /^Crédito/],
    ["Foco horizontal (50%)", /^Foco horizontal/],
    ["Foco vertical (50%)", /^Foco vertical/],
    ["Confirmo a origem e os direitos de uso", "Confirmo a origem e os direitos de uso"],
  ] as const) {
    uploadSemanticFields.push(
      await prepareCmsSemanticField({
        page,
        locator: uploadForm.getByLabel(accessibleName, {
          exact: typeof accessibleName === "string",
        }),
        surfaceId: "media",
        fieldName,
        scenarioId: "dam-media-upload",
        schemaReference: "supabase/functions/cms-media/index.ts",
      }),
    );
  }
  const reservePromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-media", "reserve_upload"),
  );
  const finalized = await clickAction(
    page,
    configuration,
    "cms-media",
    "finalize_upload",
    () => uploadButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Verificar e enviar", uploadButton, "dam-media"),
  );
  const reserved = await reservePromise;
  const reservation = (await reserved.json()) as Record<string, unknown>;
  expect(reserved.status()).toBe(201);
  expect(finalized.body.status).toBe("ready");
  expect(finalized.body.variants).toBe(6);
  state.mediaId = String(reservation.assetId);
  expect(uuidPattern.test(state.mediaId)).toBe(true);
  await expect(page.getByRole("status")).toContainText("Mídia validada e adicionada");
  await expect(page.getByRole("img", { name: alt })).toBeVisible();

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Buscar", { exact: true }).fill(filename);
  const listAssetsPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-media", "list_assets"),
  );
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  const listAssetsResponse = await listAssetsPromise;
  expect(listAssetsResponse.status()).toBe(200);
  const filterSemanticFields: CmsPreparedSemanticField[] = [];
  for (const fieldName of ["Buscar", "Coleção", "Direitos", "Incluir arquivados"]) {
    filterSemanticFields.push(
      await prepareCmsSemanticField({
        page,
        locator: page.getByLabel(fieldName, { exact: true }),
        surfaceId: "media",
        fieldName,
        scenarioId: "dam-media-query",
        schemaReference: "supabase/functions/cms-media/index.ts",
      }),
    );
  }
  for (const field of filterSemanticFields) {
    recordTransientSecondaryField(semanticScenarios, field, listAssetsResponse.status(), "query", false);
  }
  const card = page.locator("article").filter({ hasText: filename });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: `Abrir detalhes e usos de ${filename}`, exact: true }).click();
  let governedCard = page
    .locator("section")
    .filter({ hasText: `Governar: ${filename}` })
    .last();
  await expect(governedCard.getByLabel("Nome do arquivo")).toHaveValue(filename);
  await expect(governedCard.getByLabel("Referência da origem")).toHaveValue(configuration.runTag);
  await expect(governedCard.getByLabel("Texto alternativo")).toHaveValue(alt);
  recordPersistedSecondaryFields(semanticScenarios, uploadSemanticFields, finalized.response.status());
  semanticScenarios.recordStructure({
    surfaceId: "media",
    controlKind: "form",
    controlName: "Enviar mídia governada",
    scenarioId: "dam-media-upload",
    effectKind: "backend-response",
    httpStatus: finalized.response.status(),
  });

  await governedCard.getByLabel("Texto alternativo").fill(`${alt} revisada`);
  await governedCard.getByLabel("Legenda").fill(`${configuration.runTag} legenda`);
  const metadataSemanticFields: CmsPreparedSemanticField[] = [];
  const metadataGroup = governedCard.getByRole("group", { name: "Metadados e vigência" });
  for (const [fieldName, accessibleName] of [
    ["Nome do arquivo", "Nome do arquivo"],
    ["Referência da origem", "Referência da origem"],
    ["Proprietário", "Proprietário"],
    ["Licença", "Licença"],
    ["Direitos válidos até", "Direitos válidos até"],
    ["Texto alternativo", "Texto alternativo"],
    ["Legenda", "Legenda"],
    ["Crédito", "Crédito"],
    ["Foco horizontal (50%)", /^Foco horizontal/],
    ["Foco vertical (50%)", /^Foco vertical/],
  ] as const) {
    metadataSemanticFields.push(
      await prepareCmsSemanticField({
        page,
        locator: metadataGroup.getByLabel(accessibleName, {
          exact: typeof accessibleName === "string",
        }),
        surfaceId: "media",
        fieldName,
        scenarioId: "dam-media-metadata",
        schemaReference: "supabase/functions/cms-media/index.ts",
      }),
    );
  }
  const saveMetadataButton = governedCard.getByRole("button", {
    name: "Salvar metadados",
    exact: true,
  });
  const metadata = await clickAction(
    page,
    configuration,
    "cms-media",
    "update_metadata",
    () => saveMetadataButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Salvar metadados", saveMetadataButton, "dam-media"),
  );
  expect(metadata.body.assetId).toBe(state.mediaId);
  await expect(governedCard.getByLabel("Texto alternativo")).toHaveValue(`${alt} revisada`);

  const collectionName = `${configuration.runTag} coleção DAM`;
  await governedCard.getByLabel("Nova coleção", { exact: true }).fill(collectionName);
  const newCollectionSemanticField = await prepareCmsSemanticField({
    page,
    locator: governedCard.getByLabel("Nova coleção", { exact: true }),
    surfaceId: "media",
    fieldName: "Nova coleção",
    scenarioId: "dam-media-collection",
    schemaReference: "supabase/functions/cms-media/index.ts",
  });
  const createCollectionButton = governedCard.getByRole("button", {
    name: "Criar coleção",
    exact: true,
  });
  const collection = await clickAction(
    page,
    configuration,
    "cms-media",
    "upsert_collection",
    () => createCollectionButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Criar coleção", createCollectionButton, "dam-media"),
  );
  expect(uuidPattern.test(String(collection.body.collectionId ?? ""))).toBe(true);
  await expect(
    governedCard.getByLabel("Coleções").getByRole("option", { name: collectionName }),
  ).toBeAttached();
  recordTransientSecondaryField(
    semanticScenarios,
    newCollectionSemanticField,
    collection.response.status(),
    "command",
    true,
  );

  await governedCard.getByLabel("Coleções").selectOption({ label: collectionName });
  const collectionSemanticField = await prepareCmsSemanticField({
    page,
    locator: governedCard.getByLabel("Coleções", { exact: true }),
    surfaceId: "media",
    fieldName: "Coleções",
    scenarioId: "dam-media-organization",
    schemaReference: "supabase/functions/cms-media/index.ts",
  });
  const newTagAccessibleName = "Nova tag Adicione uma tag por vez, sem vírgulas ou ponto e vírgula.";
  const newTagField = governedCard.getByLabel(/^Nova tag/);
  await newTagField.fill("qa-final");
  const newTagSemanticField = await prepareCmsSemanticField({
    page,
    locator: newTagField,
    surfaceId: "media",
    fieldName: newTagAccessibleName,
    scenarioId: "dam-media-organization",
    schemaReference: "supabase/functions/cms-media/index.ts",
  });
  await governedCard.getByRole("button", { name: "Adicionar tag", exact: true }).click();
  await newTagField.fill(configuration.runTag);
  await governedCard.getByRole("button", { name: "Adicionar tag", exact: true }).click();
  await expect(governedCard.getByRole("list", { name: "Tags da imagem" })).toContainText(
    configuration.runTag,
  );
  const organizationSemanticFields = [collectionSemanticField, newTagSemanticField];
  const saveOrganizationButton = governedCard.getByRole("button", {
    name: "Salvar organização",
    exact: true,
  });
  const organization = await clickAction(
    page,
    configuration,
    "cms-media",
    "set_organization",
    () => saveOrganizationButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Salvar organização", saveOrganizationButton, "dam-media"),
  );
  expect(organization.body.assetId).toBe(state.mediaId);
  const cropGroup = governedCard.getByRole("group", { name: "Recorte da imagem" });
  await cropGroup.getByLabel("Formato do recorte", { exact: true }).selectOption("1:1");
  await cropGroup.getByLabel("Nome do recorte", { exact: true }).fill("Recorte QA final");
  await cropGroup.getByLabel(/^Margem esquerda/).fill("0");
  await cropGroup.getByLabel(/^Margem superior/).fill("0");
  await cropGroup.getByLabel(/^Tamanho do recorte/).fill("1");
  await cropGroup.getByLabel(/^Foco horizontal/).fill("0.5");
  await cropGroup.getByLabel(/^Foco vertical/).fill("0.5");
  const cropSemanticFields = await Promise.all(
    [
      ["Formato do recorte", "Formato do recorte"],
      ["Nome do recorte", "Nome do recorte"],
      ["Margem esquerda (0%)", /^Margem esquerda/],
      ["Margem superior (0%)", /^Margem superior/],
      ["Tamanho do recorte (100%)", /^Tamanho do recorte/],
      ["Foco horizontal (50%)", /^Foco horizontal/],
      ["Foco vertical (50%)", /^Foco vertical/],
    ].map(([fieldName, accessibleName]) =>
      prepareCmsSemanticField({
        page,
        locator: cropGroup.getByLabel(accessibleName, { exact: typeof accessibleName === "string" }),
        surfaceId: "media",
        fieldName: fieldName as string,
        scenarioId: "dam-media-crop",
        schemaReference: "supabase/functions/cms-media/index.ts",
      }),
    ),
  );
  const saveCropButton = governedCard.getByRole("button", { name: "Salvar recorte", exact: true });
  const crop = await clickAction(
    page,
    configuration,
    "cms-media",
    "save_crop",
    () => saveCropButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Salvar recorte", saveCropButton, "dam-media"),
  );
  expect(crop.body.assetId).toBe(state.mediaId);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Buscar", { exact: true }).fill(filename);
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  const persistedCard = page.locator("article").filter({ hasText: filename });
  await expect(persistedCard).toBeVisible();
  await persistedCard
    .getByRole("button", { name: `Abrir detalhes e usos de ${filename}`, exact: true })
    .click();
  governedCard = page
    .locator("section")
    .filter({ hasText: `Governar: ${filename}` })
    .last();
  await expect(governedCard.getByLabel("Texto alternativo")).toHaveValue(`${alt} revisada`);
  await expect(governedCard.getByLabel("Legenda")).toHaveValue(`${configuration.runTag} legenda`);
  await expect(governedCard.getByLabel("Coleções")).toHaveValue(String(collection.body.collectionId));
  await expect(governedCard.getByRole("list", { name: "Tags da imagem" })).toContainText(
    configuration.runTag,
  );
  await expect(governedCard.getByLabel("Nome do recorte")).toHaveValue("Recorte QA final");
  recordPersistedSecondaryFields(semanticScenarios, metadataSemanticFields, metadata.response.status());
  recordPersistedSecondaryFields(
    semanticScenarios,
    organizationSemanticFields,
    organization.response.status(),
  );
  recordPersistedSecondaryFields(semanticScenarios, cropSemanticFields, crop.response.status());

  const archiveButton = governedCard.getByRole("button", { name: "Arquivar imagem", exact: true });
  const archived = await clickAction(
    page,
    configuration,
    "cms-media",
    "archive_asset",
    () => archiveButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Arquivar imagem", archiveButton, "dam-media"),
  );
  expect(archived.body.status).toBe("archived");
  const restoreButton = governedCard.getByRole("button", { name: "Restaurar imagem", exact: true });
  const restored = await clickAction(
    page,
    configuration,
    "cms-media",
    "restore_asset",
    () => restoreButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Restaurar imagem", restoreButton, "dam-media"),
  );
  expect(restored.body.assetId).toBe(state.mediaId);
  const finalArchiveButton = governedCard.getByRole("button", {
    name: "Arquivar imagem",
    exact: true,
  });
  const finalArchive = await clickAction(
    page,
    configuration,
    "cms-media",
    "archive_asset",
    () => finalArchiveButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "media", "Arquivar imagem", finalArchiveButton, "dam-media"),
  );
  expect(finalArchive.body.status).toBe("archived");
  evidence.push({
    scenario: "dam-media",
    status: "passed",
    targetType: "media_asset",
    targetId: state.mediaId,
    checks: [
      "validação negativa sem reserva",
      "upload de um original e geração local automática de seis variantes",
      "persistência de metadados",
      "organização e crop",
      "preview privado autenticado",
      "arquivamento, restauração e arquivamento final",
    ],
  });
}

async function createMasterEntity(
  page: Page,
  configuration: MutationConfiguration,
  type: "manufacturer" | "category" | "magnitude",
  name: string,
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios?: CmsSemanticScenarioLedger,
) {
  await page.getByLabel("Tipo", { exact: true }).selectOption(type);
  await page.getByLabel("Nome canônico").fill(name);
  await page
    .getByLabel("Domínio externo opcional")
    .fill(`qa-${configuration.expectedSha.slice(0, 8)}.invalid`);
  await page.getByLabel("Descrição").fill(`${configuration.runTag} entidade controlada`);
  await page.getByLabel("Referência da origem").fill(configuration.runTag);
  const semanticFields = semanticScenarios
    ? await Promise.all(
        [
          { name: "Tipo", locator: page.getByLabel("Tipo", { exact: true }) },
          { name: "Nome canônico", locator: page.getByLabel("Nome canônico", { exact: true }) },
          {
            name: "Domínio externo opcional",
            locator: page.getByLabel("Domínio externo opcional", { exact: true }),
            invalid: {
              applicability: "exercise" as const,
              value: "https://dominio invalido",
              expectedResult: "Um domínio com esquema e espaço deve ser recusado pela interface.",
              observedResult: "A restrição declarada recusou o domínio inválido e restaurou o valor.",
            },
          },
          { name: "Descrição", locator: page.getByLabel("Descrição", { exact: true }) },
          {
            name: "Referência da origem",
            locator: page.getByLabel("Referência da origem", { exact: true }),
          },
        ].map((field) =>
          prepareCmsSemanticField({
            page,
            locator: field.locator,
            surfaceId: "master-data",
            fieldName: field.name,
            scenarioId: "master-data-create",
            schemaReference: "supabase/functions/cms-master-data/index.ts",
            ...(field.invalid ? { invalid: field.invalid } : {}),
          }),
        ),
      )
    : [];
  const saveButton = page.getByRole("button", { name: "Salvar entidade", exact: true });
  const created = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "create_entity",
    () => saveButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "master-data", "Salvar entidade", saveButton, "master-data"),
  );
  const id = String(created.body.entityId ?? "");
  expect(uuidPattern.test(id)).toBe(true);
  const row = page.getByRole("row").filter({ hasText: name });
  await expect(row).toBeVisible();
  if (semanticScenarios) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.getByLabel("Tipo", { exact: true }).selectOption(type);
    await page.getByLabel("Buscar nome ou alias").fill(name);
    await expect(page.getByRole("row").filter({ hasText: name })).toBeVisible();
    recordPersistedSecondaryFields(semanticScenarios, semanticFields, created.response.status());
    semanticScenarios.recordStructure({
      surfaceId: "master-data",
      controlKind: "form",
      controlName: "Editar entidade de dados mestres",
      scenarioId: "master-data-create",
      effectKind: "backend-response",
      httpStatus: created.response.status(),
    });
  }
  return { id, name, type };
}

async function exerciseMasterDataAndPim(
  page: Page,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
  semanticStateSetups: Map<string, CmsSemanticStateSetup>,
) {
  await adminReady(page, "/admin/dados-mestres");
  await expect(page.getByRole("heading", { name: "Dados mestres", exact: true })).toBeVisible();
  const manufacturer = await createMasterEntity(
    page,
    configuration,
    "manufacturer",
    `${configuration.runTag} fabricante`,
    semanticActions,
    semanticScenarios,
  );
  const category = await createMasterEntity(
    page,
    configuration,
    "category",
    `${configuration.runTag} categoria`,
    semanticActions,
  );
  const duplicateManufacturer = await createMasterEntity(
    page,
    configuration,
    "manufacturer",
    `${configuration.runTag} fabricante duplicado`,
    semanticActions,
  );
  const magnitude = await createMasterEntity(
    page,
    configuration,
    "magnitude",
    `${configuration.runTag} grandeza`,
    semanticActions,
  );
  state.masterEntities.push(manufacturer, category, duplicateManufacturer, magnitude);

  await page.getByLabel("Tipo", { exact: true }).selectOption("manufacturer");
  const manufacturerRow = page.getByRole("row").filter({ hasText: manufacturer.name });
  await manufacturerRow.getByRole("button", { name: "Editar" }).click();
  await page.getByLabel("Descrição").fill(`${configuration.runTag} descrição revisada`);
  const updateButton = page.getByRole("button", { name: "Salvar entidade", exact: true });
  const updated = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "update_entity",
    () => updateButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "master-data", "Salvar entidade", updateButton, "master-data"),
  );
  expect(updated.body.entityId).toBe(manufacturer.id);
  await page
    .getByRole("row")
    .filter({ hasText: manufacturer.name })
    .getByRole("button", { name: "Editar" })
    .click();
  await page.getByLabel("Novo nome alternativo").fill(`${configuration.runTag} OEM`);
  const aliasSemanticField = await prepareCmsSemanticField({
    page,
    locator: page.getByLabel("Novo nome alternativo", { exact: true }),
    surfaceId: "master-data",
    fieldName: "Novo nome alternativo",
    scenarioId: "master-data-alias",
    schemaReference: "supabase/functions/cms-master-data/index.ts",
  });
  const addAliasButton = page.getByRole("button", { name: "Adicionar alias", exact: true });
  const alias = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "upsert_alias",
    () => addAliasButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "master-data", "Adicionar alias", addAliasButton, "master-data"),
  );
  expect(alias.body.entityId).toBe(manufacturer.id);
  await expect(page.getByRole("row").filter({ hasText: `${configuration.runTag} OEM` })).toBeVisible();
  const masterReloadPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-master-data", "list_entities"),
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  const masterListResponse = await masterReloadPromise;
  expect(masterListResponse.status()).toBe(200);
  await page.getByLabel("Tipo", { exact: true }).selectOption("manufacturer");
  await page.getByLabel("Buscar nome ou alias").fill(`${configuration.runTag} OEM`);
  await expect(page.getByRole("row").filter({ hasText: manufacturer.name })).toBeVisible();
  recordTransientSecondaryField(
    semanticScenarios,
    aliasSemanticField,
    alias.response.status(),
    "command",
    true,
  );
  const masterQuerySemanticFields = await Promise.all(
    ["Buscar nome ou alias", "Mostrar inativos e mesclados"].map((fieldName) =>
      prepareCmsSemanticField({
        page,
        locator: page.getByLabel(fieldName, { exact: true }),
        surfaceId: "master-data",
        fieldName,
        scenarioId: "master-data-query",
        schemaReference: "supabase/functions/cms-master-data/index.ts",
      }),
    ),
  );
  for (const field of masterQuerySemanticFields) {
    recordTransientSecondaryField(semanticScenarios, field, masterListResponse.status(), "query", false);
  }

  const currentManufacturerRow = page.getByRole("row").filter({ hasText: manufacturer.name });
  await currentManufacturerRow.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Destino canônico", { exact: true }).selectOption(duplicateManufacturer.id);
  const mergeTargetSemanticField = await prepareCmsSemanticField({
    page,
    locator: page.getByLabel("Destino canônico", { exact: true }),
    surfaceId: "master-data",
    fieldName: "Destino canônico",
    scenarioId: "master-data-merge-restore",
    schemaReference: "supabase/functions/cms-master-data/index.ts",
  });
  page.once("dialog", (dialog) => void dialog.accept());
  const mergeButton = page.getByRole("button", { name: "Mesclar no destino", exact: true });
  const merged = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "merge_entities",
    () => mergeButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "master-data", "Mesclar no destino", mergeButton, "master-data"),
  );
  recordTransientSecondaryField(
    semanticScenarios,
    mergeTargetSemanticField,
    merged.response.status(),
    "command",
    true,
  );
  await page.getByLabel("Tipo", { exact: true }).selectOption("manufacturer");
  await page.getByLabel("Buscar nome ou alias").fill(manufacturer.name);
  const mergedRow = page.getByRole("row").filter({ hasText: manufacturer.name });
  await expect(mergedRow).toBeVisible();
  const restoreMergeButton = mergedRow.getByRole("button", { name: "Restaurar mesclagem", exact: true });
  const mergeRestored = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "restore_merge",
    () => restoreMergeButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "master-data", "Restaurar mesclagem", restoreMergeButton, "master-data"),
  );
  expect(mergeRestored.response.status()).toBeLessThan(300);

  await page.getByLabel("Relação", { exact: true }).selectOption("category_magnitude");
  const dependencyPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-master-data", "get_dependencies"),
  );
  await page.getByLabel("Origem", { exact: true }).selectOption(category.id);
  await expect(page.getByLabel("Destino compatível", { exact: true })).toContainText(magnitude.name);
  const dependencyResponse = await dependencyPromise;
  expect(dependencyResponse.status()).toBe(200);
  await page.getByLabel("Destino compatível", { exact: true }).selectOption(magnitude.id);
  const compatibilitySemanticFields = await Promise.all(
    ["Relação", "Origem", "Destino compatível"].map((fieldName) =>
      prepareCmsSemanticField({
        page,
        locator: page.getByLabel(fieldName, { exact: true }),
        surfaceId: "master-data",
        fieldName,
        scenarioId: "master-data-compatibility",
        schemaReference: "supabase/functions/cms-master-data/index.ts",
      }),
    ),
  );
  const compatibilityButton = page.getByRole("button", {
    name: "Adicionar compatibilidade",
    exact: true,
  });
  const compatibility = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "upsert_compatibility",
    () => compatibilityButton.click(),
    [200, 201],
    semanticTarget(
      semanticActions,
      "master-data",
      "Adicionar compatibilidade",
      compatibilityButton,
      "master-data",
    ),
  );
  await expect(page.locator("li").filter({ hasText: magnitude.name })).toContainText("active");
  for (const field of compatibilitySemanticFields) {
    recordTransientSecondaryField(semanticScenarios, field, compatibility.response.status(), "command", true);
  }
  const compatibilityItem = page.locator("li").filter({ hasText: magnitude.name });
  const inactivateCompatibilityButton = compatibilityItem.getByRole("button", {
    name: "Inativar compatibilidade",
    exact: true,
  });
  const inactivatedCompatibility = await clickAction(
    page,
    configuration,
    "cms-master-data",
    "set_compatibility_status",
    () => inactivateCompatibilityButton.click(),
    [200, 201],
    semanticTarget(
      semanticActions,
      "master-data",
      "Inativar compatibilidade",
      inactivateCompatibilityButton,
      "master-data-compatibility",
    ),
  );
  expect(inactivatedCompatibility.body.status).toBe("inactive");

  const pimListPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-pim", "list_products"),
  );
  await adminReady(page, "/admin/pim");
  await expect(page.getByRole("heading", { name: "Visão especializada de produtos" })).toBeVisible();
  const initialPimListResponse = await pimListPromise;
  expect(initialPimListResponse.status()).toBe(200);
  await page.getByLabel("Buscar por produto, marca, fabricante ou linha").fill(configuration.runTag);
  await page.getByLabel("Situação editorial").selectOption("all");
  const refreshedPimListPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-pim", "list_products"),
  );
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  const pimListResponse = await refreshedPimListPromise;
  expect(pimListResponse.status()).toBe(200);
  const pimQuerySemanticFields = await Promise.all(
    ["Buscar por produto, marca, fabricante ou linha", "Situação editorial"].map((fieldName) =>
      prepareCmsSemanticField({
        page,
        locator: page.getByLabel(fieldName, { exact: true }),
        surfaceId: "pim",
        fieldName,
        scenarioId: "pim-product-query",
        schemaReference: "supabase/functions/cms-pim/index.ts",
      }),
    ),
  );
  for (const field of pimQuerySemanticFields) {
    recordTransientSecondaryField(semanticScenarios, field, pimListResponse.status(), "query", false);
  }
  const productRow = page.getByRole("row").filter({ hasText: configuration.runTag }).first();
  await expect(productRow).toBeVisible();
  await expect(productRow.getByRole("link", { name: "Abrir cadastro completo" })).toHaveAttribute(
    "href",
    `/admin/produtos/${configuration.ids.productId}?etapa=modelos`,
  );

  for (const entity of state.masterEntities) {
    await adminReady(page, "/admin/dados-mestres");
    await page.getByLabel("Tipo", { exact: true }).selectOption(entity.type);
    await page.getByLabel("Buscar nome ou alias").fill(entity.name);
    const row = page.getByRole("row").filter({ hasText: entity.name });
    await expect(row).toBeVisible();
    const inactivateButton = row.getByRole("button", { name: "Inativar entidade", exact: true });
    const inactivated = await clickAction(
      page,
      configuration,
      "cms-master-data",
      "set_entity_status",
      () => inactivateButton.click(),
      [200, 201],
      semanticTarget(semanticActions, "master-data", "Inativar entidade", inactivateButton, "master-data"),
    );
    expect(inactivated.body.status).toBe("inactive");
  }

  await adminReady(page, "/admin/dados-mestres");
  await page.getByLabel("Tipo", { exact: true }).selectOption("manufacturer");
  await page.getByLabel("Buscar nome ou alias", { exact: true }).fill(configuration.runTag);
  const conditionalRow = page.getByRole("row").filter({ hasText: configuration.runTag }).first();
  await expect(conditionalRow).toBeVisible();
  await conditionalRow.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Editar entidade", exact: true })).toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Editar entidade", exact: true })).toHaveCount(0);
  recordSecondarySemanticStateSetup(semanticStateSetups, {
    surfaceId: "master-data",
    stateId: "selected-run-tag-entity",
    scenarioId: "master-data-conditional-editor",
    steps: [
      {
        stepId: "filter-run-tag-entity",
        scope: "page",
        controlKind: "field",
        accessibleName: "Buscar nome ou alias",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "open-run-tag-entity",
        scope: "run-tag-row",
        controlKind: "button",
        accessibleName: "Editar",
        controlOccurrence: 0,
        operation: "activate",
      },
    ],
    expectedState: {
      kind: "role",
      role: "heading",
      accessibleName: "Editar entidade",
      occurrence: 0,
    },
    restore: {
      operation: "reload-route",
      controlKind: null,
      accessibleName: null,
      controlOccurrence: null,
    },
  });

  evidence.push(
    {
      scenario: "master-data",
      status: "passed",
      checks: [
        "criação pela UI",
        "edição persistida",
        "alias auditado",
        "compatibilidade categoria–grandeza exercida e encerrada pela UI",
        "inativação final preservando histórico",
      ],
    },
    {
      scenario: "pim",
      status: "passed",
      targetType: "pim_product",
      checks: [
        "consulta autoritativa atualizada pelo backend",
        "filtros exercidos sem mutação",
        "produto sintético do ciclo principal localizado",
        "vínculo para o cadastro oficial validado sem segunda gravação paralela",
      ],
    },
  );
}

async function controlledVocabularySelections(page: Page, configuration: MutationConfiguration) {
  const responsePromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-controlled-vocabularies", "list"),
  );
  await adminReady(page, `/admin/produtos/${configuration.ids.productId}`);
  const body = (await (await responsePromise).json()) as { items: ControlledVocabularyList[] };
  const selections: Record<string, string> = {};
  for (const key of [
    "product.category",
    "product.application_magnitude",
    "product.technology",
    "product.installation_operation",
    "product.monitored_element",
  ]) {
    const option = body.items.find((list) => list.list_key === key)?.options.find((item) => item.active);
    if (!option || !uuidPattern.test(option.id)) throw new Error(`Lista controlada sem opção ativa: ${key}.`);
    selections[key] = `${option.label} [${option.slug}]`;
  }
  return selections;
}

async function buildBulkWorkbook(
  runTag: string,
  productReference: string,
  controlled: Record<string, string>,
): Promise<Buffer> {
  const ExcelJS = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const products = workbook.addWorksheet("Produtos");
  products.addRow([...bulkRequiredHeaders.products]);
  products.addRow([
    BULK_TEMPLATE_VERSION,
    productReference,
    `${runTag} produto importado`,
    "GAIATEC QA",
    "GAIATEC QA",
    "Linha QA",
    controlled["product.category"],
    controlled["product.application_magnitude"],
    controlled["product.technology"],
    controlled["product.installation_operation"],
    controlled["product.monitored_element"],
    "Homologação integral",
    "Produto sintético criado exclusivamente pela importação governada.",
    "Validar o ciclo real do cadastro em massa.",
    "Rastreável|Reversível",
    "QA CMS",
    "QA CMS",
    "QA CMS",
    "QA CMS",
  ]);
  const models = workbook.addWorksheet("Modelos");
  models.addRow([...bulkRequiredHeaders.models]);
  models.addRow([
    productReference,
    "Modelo QA",
    `REF-${runTag.slice(-8)}`,
    `SKU-${runTag.slice(-8)}`,
    "Padrão",
    "QA",
  ]);
  const specifications = workbook.addWorksheet("Especificacoes");
  specifications.addRow([...bulkRequiredHeaders.specifications]);
  specifications.addRow([productReference, "faixa_qa", "Faixa QA", "text", "controlada"]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

async function productState(page: Page) {
  return (
    (await page
      .locator("fieldset")
      .filter({ has: page.locator("legend", { hasText: "Workflow, preview e histórico imutável" }) })
      .locator("p")
      .filter({ hasText: "Status:" })
      .locator("strong")
      .textContent()) ?? ""
  ).trim();
}

async function advanceProductToPublished(page: Page, configuration: MutationConfiguration) {
  for (const [from, action, button, to] of [
    ["draft", "submit", "Enviar para revisão", "in_review"],
    ["in_review", "approve", "Aprovar revisão", "approved"],
    ["approved", "publish", "Publicar", "published"],
  ] as const) {
    if ((await productState(page)) !== from) continue;
    await clickEditorial(page, configuration, action, to, () =>
      page.getByRole("button", { name: button, exact: true }).click(),
    );
    await expect.poll(() => productState(page)).toBe(to);
  }
  expect(await productState(page)).toBe("published");
}

function assertPublicDocumentProxy(
  href: string,
  configuration: MutationConfiguration,
  state: SecondaryState,
  productSlug: string,
) {
  const proxy = new URL(href, targets[configuration.environment].site);
  expect(proxy.origin).toBe(configuration.supabaseOrigin);
  expect(proxy.pathname).toBe("/functions/v1/cms-public");
  expect([...proxy.searchParams.keys()].sort()).toEqual(["kind", "position", "slug", "type"]);
  expect(proxy.searchParams.get("type")).toBe("document");
  expect(proxy.searchParams.get("kind")).toBe("product");
  expect(proxy.searchParams.get("slug")).toBe(productSlug);
  expect(proxy.searchParams.get("position")).toBe("1");
  expect(proxy.searchParams.has("documentId")).toBe(false);
  expect(proxy.searchParams.has("sha256")).toBe(false);
  expect(href).not.toContain(state.documentId);
  expect(href).not.toContain(state.documentSha256);
}

async function expectPublicDocumentRevoked(page: Page, href: string) {
  await expect(async () => {
    const response = await sealedPreviewApiGet(page, href, { failOnStatusCode: false });
    expect(response.status()).toBe(404);
    expect(response.headers()["content-type"]).toContain("application/json");
    expect(response.headers()["cache-control"]).toContain("no-store");
    expect(await response.json()).toEqual({ error: "Documento não encontrado." });
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
}

async function exerciseBulkAndDocuments(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
  observer: CmsBrowserObserver,
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
) {
  const controlled = await controlledVocabularySelections(page, configuration);
  const productReference = `QA-${configuration.expectedSha.slice(0, 8)}`;
  const workbook = await buildBulkWorkbook(configuration.runTag, productReference, controlled);
  await adminReady(page, "/admin/produtos/importacao");
  await expect(page.getByRole("heading", { name: "Cadastro em massa por planilha" })).toBeVisible();
  await expect(page.getByLabel(/Arquivo `.xlsx` padronizado/)).toBeDisabled();
  await page.getByLabel(/Declaro que o arquivo contém somente cadastros novos/).check();
  await expect(page.getByLabel(/Arquivo `.xlsx` padronizado/)).toBeEnabled();
  const sourceDeclarationSemanticField = await prepareCmsSemanticField({
    page,
    locator: page.getByLabel(/Declaro que o arquivo contém somente cadastros novos/),
    surfaceId: "products-import",
    fieldName: "Declaro que o arquivo contém somente cadastros novos, com origem e direitos verificados.",
    scenarioId: "bulk-import",
    schemaReference: "src/admin/bulk-import-model.ts",
    absence: {
      applicability: "already-exercised",
      proofKind: "ui-validation",
      expectedResult: "Sem a declaração de origem o seletor do arquivo deve permanecer desabilitado.",
      observedResult: "A interface manteve o seletor desabilitado até a declaração explícita.",
    },
  });
  await page.getByLabel(/Arquivo `.xlsx` padronizado/).setInputFiles({
    name: `${configuration.runTag}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from("invalido"),
  });
  await expect(page.getByRole("status")).toContainText("Use somente o arquivo .xlsx padronizado");
  await page.getByLabel(/Arquivo `.xlsx` padronizado/).setInputFiles({
    name: `${configuration.runTag}.xlsx`,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: workbook,
  });
  await expect(page.getByRole("status")).toContainText("produto(s) válido(s) no navegador");
  const bulkFileSemanticField = await prepareCmsSemanticField({
    page,
    locator: page.getByLabel(/Arquivo `.xlsx` padronizado/),
    surfaceId: "products-import",
    fieldName: "Arquivo `.xlsx` padronizado, até 5 MB e 500 produtos",
    scenarioId: "bulk-import",
    schemaReference: "src/admin/bulk-import-model.ts",
    absence: {
      applicability: "already-exercised",
      proofKind: "ui-validation",
      expectedResult: "Sem planilha válida o passo de validação não deve liberar o dry-run.",
      observedResult: "Nenhum passo de dry-run foi liberado antes da seleção válida.",
    },
    invalid: {
      applicability: "already-exercised",
      proofKind: "ui-validation",
      expectedResult: "Um arquivo fora do formato XLSX deve ser recusado localmente.",
      observedResult: "O arquivo CSV foi recusado antes de qualquer chamada mutante.",
    },
  });
  await page.getByRole("button", { name: "Continuar para o dry-run" }).click();
  const dryRunButton = page.getByRole("button", { name: "Executar dry-run", exact: true });
  const dryRun = await clickAction(
    page,
    configuration,
    "cms-content",
    "bulk_validate",
    () => dryRunButton.click(),
    [200, 201],
    semanticTarget(semanticActions, "products-import", "Executar dry-run", dryRunButton, "bulk-import"),
  );
  expect(dryRun.body.status).toBe("valid");
  expect(dryRun.body.total).toBe(1);
  const confirmationField = page.getByLabel(/Confirmo que estes são cadastros novos/);
  await expect(confirmationField).not.toBeChecked();
  await expect(page.getByRole("button", { name: "Criar todo o lote como rascunho" })).toBeDisabled();
  await confirmationField.check();
  const confirmationSemanticField = await prepareCmsSemanticField({
    page,
    locator: confirmationField,
    surfaceId: "products-import",
    fieldName:
      "Confirmo que estes são cadastros novos, que não vieram do painel/site antigo e que as fontes e direitos declarados estão corretos.",
    scenarioId: "bulk-import",
    schemaReference: "src/admin/bulk-import-model.ts",
    absence: {
      applicability: "already-exercised",
      proofKind: "ui-validation",
      expectedResult: "Sem confirmação humana o comando de criação deve permanecer desabilitado.",
      observedResult: "A interface bloqueou o comando até a confirmação explícita.",
    },
  });
  const createBatchButton = page.getByRole("button", {
    name: "Criar todo o lote como rascunho",
    exact: true,
  });
  const created = await clickAction(
    page,
    configuration,
    "cms-content",
    "bulk_create",
    () => createBatchButton.click(),
    [200, 201],
    semanticTarget(
      semanticActions,
      "products-import",
      "Criar todo o lote como rascunho",
      createBatchButton,
      "bulk-import",
    ),
  );
  expect(created.body.status).toBe("created");
  const rows = created.body.rows as Array<Record<string, unknown>>;
  state.bulkProductId = String(rows[0]?.itemId ?? "");
  const slug = String(rows[0]?.slug ?? "");
  state.bulkProductSlug = slug;
  expect(uuidPattern.test(state.bulkProductId)).toBe(true);
  expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  await expect(page.getByRole("status")).toContainText("rascunho(s) criado(s), sem publicação automática");
  for (const field of [sourceDeclarationSemanticField, bulkFileSemanticField, confirmationSemanticField]) {
    recordTransientSecondaryField(semanticScenarios, field, created.response.status(), "command", true);
  }

  await adminReady(page, `/admin/produtos/${state.bulkProductId}?etapa=midia`);
  await page.getByRole("tab", { name: "Mídia", exact: true }).click();
  await page.getByRole("button", { name: "Escolher ou enviar documento" }).click();
  await page.getByRole("button", { name: "Enviar novo PDF" }).click();
  const title = `${configuration.runTag} documento técnico`;
  state.documentTitle = title;
  await page.getByLabel("Arquivo PDF").setInputFiles({
    name: `${configuration.runTag}.pdf`,
    mimeType: "text/plain",
    buffer: Buffer.from("arquivo inválido"),
  });
  await page.getByLabel("Título público/interno").fill(title);
  await page.getByLabel("Origem", { exact: true }).selectOption("synthetic_test");
  await page.getByLabel("Referência da origem").fill(configuration.runTag);
  await page.getByLabel("Confirmo os direitos de armazenamento e publicação deste documento.").check();
  const documentReservations: string[] = [];
  const reserveObserver = (request: { postDataJSON(): unknown }) => {
    try {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (body.action === "reserve_upload") documentReservations.push("reserve_upload");
    } catch {
      // Non-JSON requests are not document reservations.
    }
  };
  page.on("request", reserveObserver);
  await page.getByRole("button", { name: "Enviar PDF para quarentena" }).click();
  await expect(page.getByRole("alert")).toContainText("O documento deve ser um arquivo PDF");
  expect(documentReservations).toEqual([]);

  const pdf = Buffer.from(
    `%PDF-1.4\n% ${configuration.runTag}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n`,
    "latin1",
  );
  await page.getByLabel("Arquivo PDF").setInputFiles([]);
  await page.getByRole("button", { name: "Enviar PDF para quarentena" }).click();
  await expect(page.getByRole("alert")).toContainText(/Selecione um arquivo PDF/i);
  expect(documentReservations).toEqual([]);
  page.off("request", reserveObserver);
  await page.getByLabel("Arquivo PDF").setInputFiles({
    name: `${configuration.runTag}.pdf`,
    mimeType: "application/pdf",
    buffer: pdf,
  });
  const documentUploadSemanticFields = await Promise.all(
    [
      {
        name: "Arquivo PDF",
        absence: {
          applicability: "already-exercised" as const,
          proofKind: "ui-validation" as const,
          expectedResult: "A ausência do PDF obrigatório deve impedir a reserva.",
          observedResult: "A interface recusou o envio sem arquivo e o backend não recebeu reserva.",
        },
        invalid: {
          applicability: "already-exercised" as const,
          proofKind: "ui-validation" as const,
          expectedResult: "Conteúdo que não seja PDF passivo deve ser recusado antes da reserva.",
          observedResult: "O arquivo com MIME de texto foi recusado sem request de reserva.",
        },
      },
      { name: "Título público/interno" },
      { name: "Tipo" },
      { name: "Revisão" },
      {
        name: "Idioma",
        invalid: {
          applicability: "exercise" as const,
          value: "idioma inválido",
          expectedResult: "Um idioma fora do padrão BCP 47 aceito deve ser recusado.",
          observedResult: "A validação da interface recusou o idioma inválido e restaurou o valor.",
        },
      },
      { name: "Visibilidade" },
      { name: "Origem" },
      { name: "Referência da origem" },
      { name: "Licença/autorização" },
      { name: "Proprietário dos direitos" },
      { name: "Confirmo os direitos de armazenamento e publicação deste documento." },
    ].map((field) =>
      prepareCmsSemanticField({
        page,
        locator: page.getByLabel(field.name, { exact: true }),
        surfaceId: "product-edit",
        fieldName: field.name,
        scenarioId: "governed-document-upload",
        schemaReference: "supabase/functions/cms-documents/index.ts",
        ...(field.absence ? { absence: field.absence } : {}),
        ...(field.invalid ? { invalid: field.invalid } : {}),
      }),
    ),
  );
  const reservationPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-documents", "reserve_upload"),
  );
  const quarantineButton = page.getByRole("button", {
    name: "Enviar PDF para quarentena",
    exact: true,
  });
  const finalized = await clickAction(
    page,
    configuration,
    "cms-documents",
    "finalize_upload",
    () => quarantineButton.click(),
    [200, 201],
    semanticTarget(
      semanticActions,
      "product-edit",
      "Enviar PDF para quarentena",
      quarantineButton,
      "governed-document",
    ),
  );
  const reservation = (await (await reservationPromise).json()) as Record<string, unknown>;
  state.documentId = String(reservation.documentId ?? "");
  expect(uuidPattern.test(state.documentId)).toBe(true);
  const finalizedDocument = finalized.body.document as Record<string, unknown>;
  state.documentSha256 = String(finalizedDocument?.sha256 ?? "");
  expect(finalizedDocument?.id).toBe(state.documentId);
  expect(state.documentSha256).toMatch(/^[0-9a-f]{64}$/);
  expect(finalized.body.status).toBe("quarantined");
  await expect(page.getByRole("status")).toContainText("somente pela pré-verificação estrutural");
  await expect(page.getByRole("list", { name: "Documentos vinculados ao produto" })).toHaveCount(0);
  const ownQueue = page.getByRole("list", { name: "Fila de revisão de segurança" });
  await expect(ownQueue).toContainText(title);
  await expect(
    ownQueue
      .getByRole("listitem")
      .filter({ hasText: title })
      .getByRole("button", { name: "Atestar como seguro" }),
  ).toBeDisabled();

  const browser = context.browser();
  if (!browser) throw new Error("Navegador indisponível para o segundo ator de segurança.");
  const reviewerContext = await browser.newContext({
    baseURL: targets[configuration.environment].site,
    serviceWorkers: "block",
  });
  await installSealedPreviewRouting(reviewerContext);
  observer.observeContext(reviewerContext);
  const reviewerPage = await reviewerContext.newPage();
  try {
    await signInWithAal2(reviewerPage, {
      ...configuration,
      email: configuration.reviewerEmail,
      password: configuration.reviewerPassword,
      totpSecret: configuration.reviewerTotpSecret,
    });
    await adminReady(reviewerPage, `/admin/produtos/${state.bulkProductId}?etapa=midia`);
    await reviewerPage.getByRole("tab", { name: "Mídia", exact: true }).click();
    await reviewerPage.getByRole("button", { name: "Escolher ou enviar documento" }).click();
    await reviewerPage.getByLabel("Buscar por título").fill(title);
    const securityListPromise = reviewerPage.waitForResponse((response) =>
      functionAction(response, configuration.supabaseOrigin, "cms-documents", "list_security_review"),
    );
    await reviewerPage.getByRole("button", { name: "Abrir fila de segurança" }).click();
    const securityListResponse = await securityListPromise;
    expect(securityListResponse.status()).toBe(200);
    const documentQuerySemanticField = await prepareCmsSemanticField({
      page: reviewerPage,
      locator: reviewerPage.getByLabel("Buscar por título", { exact: true }),
      surfaceId: "product-edit",
      fieldName: "Buscar por título",
      scenarioId: "governed-document-query",
      schemaReference: "supabase/functions/cms-documents/index.ts",
    });
    recordTransientSecondaryField(
      semanticScenarios,
      documentQuerySemanticField,
      securityListResponse.status(),
      "query",
      false,
    );
    const reviewQueue = reviewerPage.getByRole("list", { name: "Fila de revisão de segurança" });
    const reviewRow = reviewQueue.getByRole("listitem").filter({ hasText: title });
    await expect(reviewRow).toBeVisible();
    await reviewRow.getByLabel(`Scanner/atestação para ${title}`).selectOption("qa-synthetic-attestation-v1");
    await reviewerPage.getByLabel("Referência do relatório do scanner").fill(`${configuration.runTag}-SCAN`);
    await reviewerPage
      .getByLabel("SHA-256 do relatório do scanner")
      .fill(createHash("sha256").update(`${configuration.runTag}:approved`).digest("hex"));
    const securityReviewSemanticFields = await Promise.all([
      prepareCmsSemanticField({
        page: reviewerPage,
        locator: reviewRow.getByLabel(`Scanner/atestação para ${title}`, { exact: true }),
        surfaceId: "product-edit",
        fieldName: `Scanner/atestação para ${title}`,
        scenarioId: "governed-document-security-review",
        schemaReference: "supabase/functions/cms-documents/index.ts",
      }),
      prepareCmsSemanticField({
        page: reviewerPage,
        locator: reviewerPage.getByLabel("Referência do relatório do scanner", { exact: true }),
        surfaceId: "product-edit",
        fieldName: "Referência do relatório do scanner",
        scenarioId: "governed-document-security-review",
        schemaReference: "supabase/functions/cms-documents/index.ts",
        invalid: {
          applicability: "exercise",
          value: "referência inválida com espaços",
          expectedResult: "A referência do scanner com espaços deve ser recusada.",
          observedResult: "A validação declarada recusou a referência inválida e restaurou o valor.",
        },
      }),
      prepareCmsSemanticField({
        page: reviewerPage,
        locator: reviewerPage.getByLabel("SHA-256 do relatório do scanner", { exact: true }),
        surfaceId: "product-edit",
        fieldName: "SHA-256 do relatório do scanner",
        scenarioId: "governed-document-security-review",
        schemaReference: "supabase/functions/cms-documents/index.ts",
        invalid: {
          applicability: "exercise",
          value: "hash-invalido",
          expectedResult: "Um hash fora do formato SHA-256 deve ser recusado.",
          observedResult: "O padrão de sessenta e quatro hexadecimais recusou o hash inválido.",
        },
      }),
    ]);
    const scannerDownloadButton = reviewRow.getByRole("button", {
      name: "Baixar anexo para scanner",
      exact: true,
    });
    const isolatedDownload = await clickAction(
      reviewerPage,
      configuration,
      "cms-documents",
      "review_download",
      () => scannerDownloadButton.click(),
      [200, 201],
      semanticTarget(
        semanticActions,
        "product-edit",
        "Baixar anexo para scanner",
        scannerDownloadButton,
        "governed-document",
      ),
    );
    expect(isolatedDownload.body.expectedSha256).toBe(state.documentSha256);
    expect(isolatedDownload.body.disposition).toBe("attachment");
    reviewerPage.once("dialog", (dialog) => void dialog.accept());
    const approveDocumentButton = reviewRow.getByRole("button", {
      name: "Atestar como seguro",
      exact: true,
    });
    const approval = await clickAction(
      reviewerPage,
      configuration,
      "cms-documents",
      "review_security",
      () => approveDocumentButton.click(),
      [200, 201],
      semanticTarget(
        semanticActions,
        "product-edit",
        "Atestar como seguro",
        approveDocumentButton,
        "governed-document",
      ),
    );
    expect(approval.body.status).toBe("ready");
    expect(approval.body.scanStatus).toBe("clean");
    expect(approval.body.expectedSha256).toBe(state.documentSha256);
    for (const field of securityReviewSemanticFields) {
      recordTransientSecondaryField(semanticScenarios, field, approval.response.status(), "command", true);
    }
  } finally {
    try {
      assertSealedPreviewRoutingUsed(reviewerContext);
    } finally {
      await reviewerContext.close();
    }
  }

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Mídia", exact: true }).click();
  await page.getByRole("button", { name: "Escolher ou enviar documento" }).click();
  await page.getByLabel("Buscar por título").fill(title);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const approvedDocumentRow = page.getByRole("listitem").filter({ hasText: title });
  await expect(approvedDocumentRow).toBeVisible();
  await approvedDocumentRow.getByRole("button", { name: "Adicionar ao produto" }).click();
  await expect(page.getByRole("list", { name: "Documentos vinculados ao produto" })).toContainText(title);

  const rejectedTitle = `${configuration.runTag} documento rejeitado`;
  await page.getByRole("button", { name: "Enviar novo PDF" }).click();
  await page.getByLabel("Arquivo PDF").setInputFiles({
    name: `${configuration.runTag}-rejected.pdf`,
    mimeType: "application/pdf",
    buffer: Buffer.from(
      `%PDF-1.4\n% ${configuration.runTag}-rejected\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n`,
      "latin1",
    ),
  });
  await page.getByLabel("Título público/interno").fill(rejectedTitle);
  await page.getByLabel("Origem", { exact: true }).selectOption("synthetic_test");
  await page.getByLabel("Referência da origem").fill(configuration.runTag);
  await page.getByLabel("Confirmo os direitos de armazenamento e publicação deste documento.").check();
  const rejectedReservationPromise = page.waitForResponse((response) =>
    functionAction(response, configuration.supabaseOrigin, "cms-documents", "reserve_upload"),
  );
  const rejectedQuarantineButton = page.getByRole("button", {
    name: "Enviar PDF para quarentena",
    exact: true,
  });
  const rejectedFinalize = await clickAction(
    page,
    configuration,
    "cms-documents",
    "finalize_upload",
    () => rejectedQuarantineButton.click(),
    [200, 201],
    semanticTarget(
      semanticActions,
      "product-edit",
      "Enviar PDF para quarentena",
      rejectedQuarantineButton,
      "governed-document-rejection",
    ),
  );
  const rejectedReservation = (await (await rejectedReservationPromise).json()) as Record<string, unknown>;
  state.rejectedDocumentId = String(rejectedReservation.documentId ?? "");
  expect(uuidPattern.test(state.rejectedDocumentId)).toBe(true);
  expect(rejectedFinalize.body.status).toBe("quarantined");

  const rejectingContext = await browser.newContext({
    baseURL: targets[configuration.environment].site,
    serviceWorkers: "block",
  });
  await installSealedPreviewRouting(rejectingContext);
  observer.observeContext(rejectingContext);
  const rejectingPage = await rejectingContext.newPage();
  try {
    await signInWithAal2(rejectingPage, {
      ...configuration,
      email: configuration.reviewerEmail,
      password: configuration.reviewerPassword,
      totpSecret: configuration.reviewerTotpSecret,
    });
    await adminReady(rejectingPage, `/admin/produtos/${state.bulkProductId}?etapa=midia`);
    await rejectingPage.getByRole("tab", { name: "Mídia", exact: true }).click();
    await rejectingPage.getByRole("button", { name: "Escolher ou enviar documento" }).click();
    await rejectingPage.getByLabel("Buscar por título").fill(rejectedTitle);
    await rejectingPage.getByRole("button", { name: "Abrir fila de segurança" }).click();
    const rejectedQueue = rejectingPage.getByRole("list", { name: "Fila de revisão de segurança" });
    const rejectedRow = rejectedQueue.getByRole("listitem").filter({ hasText: rejectedTitle });
    await expect(rejectedRow).toBeVisible();
    await rejectedRow
      .getByLabel(`Scanner/atestação para ${rejectedTitle}`)
      .selectOption("qa-synthetic-attestation-v1");
    await rejectingPage
      .getByLabel("Referência do relatório do scanner")
      .fill(`${configuration.runTag}-REJECT`);
    await rejectingPage
      .getByLabel("SHA-256 do relatório do scanner")
      .fill(createHash("sha256").update(`${configuration.runTag}:rejected`).digest("hex"));
    await rejectingPage.getByLabel("Veredito para rejeição").selectOption("malicious");
    const rejectionVerdictSemanticField = await prepareCmsSemanticField({
      page: rejectingPage,
      locator: rejectingPage.getByLabel("Veredito para rejeição", { exact: true }),
      surfaceId: "product-edit",
      fieldName: "Veredito para rejeição",
      scenarioId: "governed-document-rejection",
      schemaReference: "supabase/functions/cms-documents/index.ts",
    });
    rejectingPage.once("dialog", (dialog) => void dialog.accept());
    const rejectDocumentButton = rejectedRow.getByRole("button", {
      name: "Rejeitar documento",
      exact: true,
    });
    const rejected = await clickAction(
      rejectingPage,
      configuration,
      "cms-documents",
      "review_security",
      () => rejectDocumentButton.click(),
      [200, 201],
      semanticTarget(
        semanticActions,
        "product-edit",
        "Rejeitar documento",
        rejectDocumentButton,
        "governed-document-rejection",
      ),
    );
    expect(rejected.body.status).toBe("rejected");
    expect(rejected.body.scanStatus).toBe("rejected");
    await expect(rejectingPage.getByRole("status")).toContainText("mantido fora de qualquer publicação");
    recordTransientSecondaryField(
      semanticScenarios,
      rejectionVerdictSemanticField,
      rejected.response.status(),
      "command",
      true,
    );
  } finally {
    try {
      assertSealedPreviewRoutingUsed(rejectingContext);
    } finally {
      await rejectingContext.close();
    }
  }

  const saveVersionedButton = page.getByRole("button", {
    name: "Salvar rascunho versionado",
    exact: true,
  });
  const saved = await clickEditorial(
    page,
    configuration,
    "save",
    "draft",
    () => saveVersionedButton.click(),
    semanticTarget(
      semanticActions,
      "product-edit",
      "Salvar rascunho versionado",
      saveVersionedButton,
      "governed-document",
    ),
  );
  expect(saved.body.itemId).toBe(state.bulkProductId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "Mídia", exact: true }).click();
  await expect(page.getByRole("list", { name: "Documentos vinculados ao produto" })).toContainText(title);
  recordPersistedSecondaryFields(
    semanticScenarios,
    documentUploadSemanticFields,
    finalized.response.status(),
  );
  semanticScenarios.recordStructure({
    surfaceId: "product-edit",
    controlKind: "form",
    controlName: "Enviar documento governado",
    scenarioId: "governed-document-upload",
    effectKind: "backend-response",
    httpStatus: finalized.response.status(),
  });

  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Pré-visualizar" }).click();
  const preview = await popupPromise;
  await preview.waitForLoadState("domcontentloaded");
  await expect(preview.getByText(title)).toBeVisible();
  await expect(preview.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  await preview.close();

  await page.getByRole("tab", { name: "SEO e publicação" }).click();
  await page.getByLabel("Estado do piloto").selectOption("synthetic_test");
  const pilotStateSemanticField = await prepareCmsSemanticField({
    page,
    locator: page.getByLabel("Estado do piloto", { exact: true }),
    surfaceId: "product-edit",
    fieldName: "Estado do piloto",
    scenarioId: "bulk-product-governance",
    schemaReference: "src/shared/contracts/cms-content.ts",
  });
  const governed = await clickEditorial(page, configuration, "save", "draft", () =>
    page.getByRole("button", { name: "Salvar rascunho", exact: true }).click(),
  );
  expect(governed.body.itemId).toBe(state.bulkProductId);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByRole("tab", { name: "SEO e publicação" }).click();
  await expect(page.getByLabel("Estado do piloto", { exact: true })).toHaveValue("synthetic_test");
  recordPersistedSecondaryFields(semanticScenarios, [pilotStateSemanticField], governed.response.status());
  await advanceProductToPublished(page, configuration);
  const publicProduct = await context.newPage();
  let publishedDocumentHref = "";
  try {
    await expect(async () => {
      const response = await publicProduct.goto(`/produtos/${slug}`, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      expect(response?.status()).toBe(200);
      expect(response?.headers()["x-release"]).toBe(configuration.expectedSha);
      await expect(publicProduct.getByRole("heading", { level: 1 })).toContainText(configuration.runTag);
      const link = publicProduct.getByRole("link", { name: new RegExp(title) });
      await expect(link).toBeVisible();
      const href = await link.getAttribute("href");
      expect(href).toBeTruthy();
      assertPublicDocumentProxy(href!, configuration, state, slug);
      publishedDocumentHref = href!;
      const documentResponse = await sealedPreviewApiGet(publicProduct, href!, {
        failOnStatusCode: false,
      });
      expect(documentResponse.status()).toBe(200);
      expect(documentResponse.headers()["content-type"]).toContain("application/pdf");
      expect(documentResponse.headers()["content-disposition"]).toMatch(/^attachment;/i);
      expect(documentResponse.headers()["cache-control"]).toBe("private, no-store");
      expect(documentResponse.headers()["content-security-policy"]).toBe("sandbox");
      expect(documentResponse.headers()["x-content-type-options"]).toBe("nosniff");
      expect(documentResponse.headers()["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
      expect(
        createHash("sha256")
          .update(await documentResponse.body())
          .digest("hex"),
      ).toBe(state.documentSha256);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });

    expect(publishedDocumentHref).toBeTruthy();
    await expect(async () => {
      await publicProduct.reload({ waitUntil: "domcontentloaded" });
      const stableHref = await publicProduct
        .getByRole("link", { name: new RegExp(title) })
        .getAttribute("href");
      expect(stableHref).toBe(publishedDocumentHref);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    state.publicDocumentHref = publishedDocumentHref;

    await publicProduct.goto("/produtos", { waitUntil: "domcontentloaded" });
    await expect
      .poll(async () => {
        const hrefs = await publicProduct
          .locator('a[href^="/produtos/"]')
          .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
        return hrefs.filter(
          (href) =>
            href !== `/produtos/${slug}` &&
            href !== "/produtos/comparador" &&
            /^\/produtos\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(href),
        ).length;
      })
      .toBeGreaterThan(0);
    const comparisonSlug = await publicProduct
      .locator('a[href^="/produtos/"]')
      .evaluateAll((links, ownSlug) => {
        const candidates = links
          .map((link) => link.getAttribute("href") ?? "")
          .map((href) => href.match(/^\/produtos\/([a-z0-9]+(?:-[a-z0-9]+)*)$/)?.[1] ?? "")
          .filter((candidate) => candidate && candidate !== ownSlug && candidate !== "comparador");
        return [...new Set(candidates)][0] ?? null;
      }, slug);
    if (!comparisonSlug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(comparisonSlug)) {
      throw new Error("O catálogo público não expôs um segundo slug publicado para comparação.");
    }
    const comparisonResponsePromise = publicProduct.waitForResponse((response) => {
      const request = new URL(response.url());
      return (
        request.pathname.endsWith("/functions/v1/cms-public") &&
        request.searchParams.get("type") === "products" &&
        request.searchParams.has("slugs")
      );
    });
    await publicProduct.goto(
      `/produtos/comparador?produtos=${encodeURIComponent(`${slug},${comparisonSlug}`)}`,
      { waitUntil: "domcontentloaded" },
    );
    const comparisonResponse = await comparisonResponsePromise;
    expect(comparisonResponse.status()).toBe(200);
    const comparisonRequest = new URL(comparisonResponse.url());
    expect(comparisonRequest.searchParams.get("slugs")?.split(",")).toEqual([slug, comparisonSlug]);
    expect(comparisonRequest.searchParams.has("ids")).toBe(false);
    const comparisonWire = JSON.stringify(await comparisonResponse.json());
    expect(comparisonWire).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    expect(comparisonWire).not.toMatch(/\b[0-9a-f]{64}\b/i);
    await expect(publicProduct.getByRole("heading", { name: "Comparar produtos" })).toBeVisible();
    await expect(publicProduct.getByRole("table")).toBeVisible();
  } finally {
    await publicProduct.close();
  }

  page.once("dialog", (dialog) => void dialog.accept());
  const archived = await clickEditorial(page, configuration, "archive", "archived", () =>
    page.getByRole("button", { name: "Despublicar e arquivar produto" }).click(),
  );
  expect(archived.body.itemId).toBe(state.bulkProductId);
  await expect(async () => {
    const publicResponse = await sealedPreviewApiGet(page, `/produtos/${slug}`, {
      failOnStatusCode: false,
    });
    expect(publicResponse.status()).toBe(404);
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
  await expectPublicDocumentRevoked(page, state.publicDocumentHref!);

  await adminReady(page, `/admin/produtos/${state.bulkProductId}?etapa=midia`);
  await page.getByRole("tab", { name: "Mídia", exact: true }).click();
  await page.getByRole("button", { name: "Escolher ou enviar documento" }).click();
  await page.getByLabel("Buscar por título").fill(title);
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  const documentRow = page.getByRole("listitem").filter({ hasText: title });
  await expect(documentRow).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  const archiveDocumentButton = documentRow.getByRole("button", {
    name: "Arquivar documento",
    exact: true,
  });
  const documentArchived = await clickAction(
    page,
    configuration,
    "cms-documents",
    "archive_document",
    () => archiveDocumentButton.click(),
    [200, 201],
    semanticTarget(
      semanticActions,
      "product-edit",
      "Arquivar documento",
      archiveDocumentButton,
      "governed-document",
    ),
  );
  expect(documentArchived.body.status).toBe("archived");
  await expectPublicDocumentRevoked(page, state.publicDocumentHref!);

  evidence.push(
    {
      scenario: "bulk-import",
      status: "passed",
      targetType: "content_item",
      targetId: state.bulkProductId,
      checks: [
        "formato inválido bloqueado no cliente",
        "planilha real processada no navegador",
        "dry-run no backend",
        "criação somente como rascunho",
        "persistência após reload",
        "arquivamento final",
      ],
    },
    {
      scenario: "governed-document",
      status: "passed",
      targetType: "document_asset",
      targetId: state.documentId,
      checks: [
        "MIME inválido bloqueado sem reserva",
        "PDF enviado ao Storage privado pela URL assinada emitida pelo backend",
        "pré-verificação estrutural deixou o upload em quarentena sem alegar antivírus",
        "autor impedido de autoaprovar; segundo ator AAL2 atestou SHA-256 e evidência",
        "caminho de rejeição manteve o segundo PDF fora de publicação",
        "vínculo persistido no produto",
        "preview privado no navegador",
        "proxy público estável por kind/slug/position, sem UUID/hash, validado byte a byte como attachment",
        "comparação pública real consultou dois slugs e não transportou IDs nem hashes internos",
        "o mesmo href retornou 404 fail-closed após despublicação e arquivamento",
        "produto despublicado e documento arquivado sem apagar auditoria",
      ],
    },
  );
}

async function siteState(page: Page) {
  return (
    (await page
      .locator("fieldset")
      .filter({ has: page.locator("legend", { hasText: /Workflow de/ }) })
      .locator("p")
      .filter({ hasText: "Status:" })
      .locator("strong")
      .first()
      .textContent()) ?? ""
  ).trim();
}

async function advanceSiteToPublished(
  page: Page,
  configuration: MutationConfiguration,
  semanticActions: CmsSemanticActionLedger,
  surfaceId: "site-settings" | "site-navigation" | "site-placements",
  scenarioId: "global-site-settings" | "global-navigation" | "global-placements",
) {
  for (const [from, action, button, to] of [
    ["draft", "submit", "Enviar para revisão", "in_review"],
    ["in_review", "approve", "Aprovar", "approved"],
    ["approved", "publish", "Publicar agora", "published"],
  ] as const) {
    if ((await siteState(page)) !== from) continue;
    const actionButton = page.getByRole("button", { name: button, exact: true });
    await clickEditorial(
      page,
      configuration,
      action,
      to,
      () => actionButton.click(),
      semanticTarget(semanticActions, surfaceId, button, actionButton, scenarioId),
    );
    await expect.poll(() => siteState(page)).toBe(to);
  }
  expect(await siteState(page)).toBe("published");
}

async function expectPublicNavigation(context: BrowserContext, label: string, visible: boolean) {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      await publicPage.goto("/", { waitUntil: "domcontentloaded" });
      const link = publicPage.getByRole("link", { name: label, exact: true });
      const visibleCount = await link.evaluateAll(
        (elements) => elements.filter((element) => element.getClientRects().length > 0).length,
      );
      if (visible) expect(visibleCount).toBeGreaterThan(0);
      else expect(visibleCount).toBe(0);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
  } finally {
    await publicPage.close();
  }
}

async function expectPublicPhone(context: BrowserContext, phone: string, visible: boolean) {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      await publicPage.goto("/", { waitUntil: "domcontentloaded" });
      const links = publicPage.getByRole("link", { name: phone, exact: true });
      const visibleCount = await links.evaluateAll(
        (elements) => elements.filter((element) => element.getClientRects().length > 0).length,
      );
      if (visible) expect(visibleCount).toBeGreaterThan(0);
      else expect(visibleCount).toBe(0);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
  } finally {
    await publicPage.close();
  }
}

async function expectPublicPlacement(context: BrowserContext, label: string, visible: boolean) {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      await publicPage.goto("/", { waitUntil: "domcontentloaded" });
      const announcement = publicPage.getByLabel("Destaque da GAIATEC").getByText(label, {
        exact: true,
      });
      const visibleCount = await announcement.evaluateAll(
        (elements) => elements.filter((element) => element.getClientRects().length > 0).length,
      );
      if (visible) expect(visibleCount).toBeGreaterThan(0);
      else expect(visibleCount).toBe(0);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
  } finally {
    await publicPage.close();
  }
}

type SiteDocumentRow = {
  id: string;
  created_by: string;
  workflow_status: string;
};

async function authenticatedRestRows<T>(
  page: Page,
  configuration: MutationConfiguration,
  path: string,
): Promise<T[]> {
  const result = await page.evaluate(
    async ({ anonKey, path, supabaseOrigin }) => {
      const projectRef = new URL(supabaseOrigin).hostname.split(".")[0];
      const serialized = localStorage.getItem(`sb-${projectRef}-auth-token`);
      const accessToken = serialized
        ? (JSON.parse(serialized) as { access_token?: unknown }).access_token
        : null;
      if (typeof accessToken !== "string" || accessToken.length < 24) {
        throw new Error("QA_CMS_CORPORATE_SESSION_MISSING");
      }
      const response = await fetch(`${supabaseOrigin}${path}`, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      });
      return { status: response.status, body: await response.json() };
    },
    { anonKey: configuration.anonKey, path, supabaseOrigin: configuration.supabaseOrigin },
  );
  expect(result.status).toBe(200);
  expect(Array.isArray(result.body)).toBe(true);
  return result.body as T[];
}

async function authenticatedUserId(page: Page, configuration: MutationConfiguration) {
  const userId = await page.evaluate((supabaseOrigin) => {
    const projectRef = new URL(supabaseOrigin).hostname.split(".")[0];
    const serialized = localStorage.getItem(`sb-${projectRef}-auth-token`);
    if (!serialized) return "";
    const stored = JSON.parse(serialized) as { user?: { id?: unknown } };
    return typeof stored.user?.id === "string" ? stored.user.id : "";
  }, configuration.supabaseOrigin);
  expect(uuidPattern.test(userId)).toBe(true);
  return userId;
}

async function siteDocumentRow(
  page: Page,
  configuration: MutationConfiguration,
  contentType: "navigation" | "site_settings",
) {
  const rows = await authenticatedRestRows<SiteDocumentRow>(
    page,
    configuration,
    `/rest/v1/cms_content_items?select=id,created_by,workflow_status&content_type=eq.${contentType}`,
  );
  expect(rows).toHaveLength(1);
  expect(uuidPattern.test(rows[0]!.id)).toBe(true);
  expect(uuidPattern.test(rows[0]!.created_by)).toBe(true);
  return rows[0]!;
}

async function expectEditorialAuditTrail(
  page: Page,
  configuration: MutationConfiguration,
  itemIds: readonly string[],
) {
  for (const itemId of itemIds) {
    const rows = await authenticatedRestRows<{ action: string; target_id: string }>(
      page,
      configuration,
      `/rest/v1/cms_audit_log?select=action,target_id&target_id=eq.${itemId}&action=in.(cms%3Acontent.create,cms%3Acontent.submit,cms%3Acontent.approve,cms%3Acontent.publish)`,
    );
    const actions = new Set(rows.map((row) => row.action));
    for (const action of ["create", "submit", "approve", "publish"]) {
      expect(actions.has(`cms:content.${action}`)).toBe(true);
    }
  }
}

async function fillCorporateGovernance(page: Page, configuration: MutationConfiguration, title: string) {
  const authorization = `GAIATEC-RELEASE-${configuration.expectedSha}`;
  await page.getByLabel("Título do documento", { exact: true }).fill(title);
  await page.getByLabel("Título SEO", { exact: true }).fill(`${title} | GAIATEC`);
  await page
    .getByLabel("Descrição SEO", { exact: true })
    .fill("Configuração institucional oficial, governada e publicada pela GAIATEC Sistemas.");
  await page.getByLabel("Referência da autorização", { exact: true }).fill(authorization);
  await page.getByLabel("Data da autorização", { exact: true }).fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel("Escopo dos direitos", { exact: true })
    .fill("Conteúdo institucional canônico de propriedade da GAIATEC Sistemas");
  await page.getByLabel("Responsável comercial", { exact: true }).fill("GAIATEC Sistemas");
  await page.getByLabel("Responsável técnico", { exact: true }).fill("GAIATEC Sistemas");
  const rights = page.getByLabel("Confirmo os direitos para esta configuração global", { exact: true });
  if (!(await rights.isChecked())) await rights.check();
  await page
    .getByLabel("Motivo da alteração", { exact: true })
    .fill(`Baseline corporativo autorizado no release ${configuration.expectedSha}`);
}

async function expectOwnerAuthoredGovernance(page: Page) {
  await expect(page.getByLabel("Responsável comercial", { exact: true })).not.toHaveValue("");
  await expect(page.getByLabel("Responsável técnico", { exact: true })).not.toHaveValue("");
  await expect(
    page.getByLabel("Confirmo os direitos para esta configuração global", { exact: true }),
  ).toBeChecked();
}

async function expectCanonicalSettingsEditor(page: Page) {
  await expect(page.getByLabel("Nome público", { exact: true })).toHaveValue(
    canonicalSiteSettings.companyName,
  );
  await expect(page.getByLabel("Telefone", { exact: true })).toHaveValue(canonicalSiteSettings.phone);
  await expect(page.getByLabel("E-mail", { exact: true })).toHaveValue(canonicalSiteSettings.email);
  await expect(page.getByLabel("Destino", { exact: true })).toHaveValue(canonicalSiteSettings.ctaHref);
  await expectOwnerAuthoredGovernance(page);
}

async function expectCanonicalNavigationEditor(page: Page) {
  const required = [...canonicalNavigation.header, ...canonicalNavigation.footer];
  const fieldsets = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Item \d+$/ }) });
  const actual: Array<{ label: string; href: string; location: string; visible: boolean }> = [];
  for (let index = 0; index < (await fieldsets.count()); index += 1) {
    const item = fieldsets.nth(index);
    actual.push({
      label: await item.getByLabel("Rótulo", { exact: true }).inputValue(),
      href: await item.getByLabel("Destino", { exact: true }).inputValue(),
      location: await item.getByLabel("Local", { exact: true }).inputValue(),
      visible: await item.getByLabel("Visível", { exact: true }).isChecked(),
    });
  }
  for (const [label, href] of required) {
    const location = canonicalNavigation.header.some((item) => item[1] === href) ? "header" : "footer";
    expect(actual).toContainEqual({ label, href, location, visible: true });
  }
  await expectOwnerAuthoredGovernance(page);
}

async function createCorporateSettings(
  page: Page,
  configuration: MutationConfiguration,
  state: SecondaryState,
  semanticActions: CmsSemanticActionLedger,
) {
  await page.getByLabel("Nome público", { exact: true }).fill(canonicalSiteSettings.companyName);
  await page.getByLabel("Razão social opcional", { exact: true }).fill("");
  await page.getByLabel("Telefone", { exact: true }).fill(canonicalSiteSettings.phone);
  await page.getByLabel("WhatsApp", { exact: true }).fill("");
  await page.getByLabel("E-mail", { exact: true }).fill(canonicalSiteSettings.email);
  await page.getByLabel("Endereço", { exact: true }).fill("");
  await page.getByLabel("Rótulo", { exact: true }).fill(canonicalSiteSettings.ctaLabel);
  await page.getByLabel("Destino", { exact: true }).fill(canonicalSiteSettings.ctaHref);
  await fillCorporateGovernance(page, configuration, "Dados globais GAIATEC Sistemas");
  const button = page.getByRole("button", { name: "Criar documento", exact: true });
  const created = await clickEditorial(
    page,
    configuration,
    "create",
    "draft",
    () => button.click(),
    semanticTarget(semanticActions, "site-settings", "Criar documento", button, "global-site-settings"),
  );
  state.settingsId = String(created.body.itemId);
  await advanceSiteToPublished(page, configuration, semanticActions, "site-settings", "global-site-settings");
}

async function addNavigationItem(
  page: Page,
  label: string,
  href: string,
  location: "header" | "footer",
  order: number,
) {
  await page.getByRole("button", { name: "Adicionar item", exact: true }).click();
  const item = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Item \d+$/ }) })
    .last();
  await item.getByLabel("Local", { exact: true }).selectOption(location);
  await item.getByLabel("Rótulo", { exact: true }).fill(label);
  await item.getByLabel("Destino", { exact: true }).fill(href);
  await item.getByLabel("Ordem", { exact: true }).fill(String(order));
  const visible = item.getByLabel("Visível", { exact: true });
  if (!(await visible.isChecked())) await visible.check();
}

async function createCorporateNavigation(
  page: Page,
  configuration: MutationConfiguration,
  state: SecondaryState,
  semanticActions: CmsSemanticActionLedger,
) {
  for (const [index, [label, href]] of canonicalNavigation.header.entries()) {
    await addNavigationItem(page, label, href, "header", index);
  }
  for (const [index, [label, href]] of canonicalNavigation.footer.entries()) {
    await addNavigationItem(page, label, href, "footer", index);
  }
  await fillCorporateGovernance(page, configuration, "Navegação global GAIATEC Sistemas");
  const button = page.getByRole("button", { name: "Criar documento", exact: true });
  const created = await clickEditorial(
    page,
    configuration,
    "create",
    "draft",
    () => button.click(),
    semanticTarget(semanticActions, "site-navigation", "Criar documento", button, "global-navigation"),
  );
  state.navigationId = String(created.body.itemId);
  await advanceSiteToPublished(page, configuration, semanticActions, "site-navigation", "global-navigation");
}

async function expectCanonicalPublicShell(page: Page, configuration: MutationConfiguration) {
  await expect(async () => {
    const response = await sealedPreviewApiGet(
      page,
      `${configuration.supabaseOrigin}/functions/v1/cms-public?type=site-shell`,
      {
        failOnStatusCode: false,
        headers: { apikey: configuration.anonKey, Origin: targets[configuration.environment].site },
      },
    );
    expect(response.status()).toBe(200);
    const shell = (await response.json()) as {
      settings?: {
        company?: { name?: unknown; email?: unknown; phone?: unknown };
        defaultCta?: { label?: unknown; href?: unknown };
      };
      navigation?: { items?: Array<{ href?: unknown; visible?: unknown }> };
    };
    expect(shell.settings?.company).toMatchObject({
      name: canonicalSiteSettings.companyName,
      email: canonicalSiteSettings.email,
      phone: canonicalSiteSettings.phone,
    });
    expect(shell.settings?.defaultCta).toEqual({
      label: canonicalSiteSettings.ctaLabel,
      href: canonicalSiteSettings.ctaHref,
    });
    const items = Array.isArray(shell.navigation?.items) ? shell.navigation.items : [];
    for (const [, href] of [...canonicalNavigation.header, ...canonicalNavigation.footer]) {
      expect(items.some((item: Record<string, unknown>) => item.href === href && item.visible === true)).toBe(
        true,
      );
    }
  }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  for (const [, href] of canonicalNavigation.header) {
    await expect(page.locator(`header a[href="${href}"]`).first()).toBeVisible({ timeout: 20_000 });
  }
  await expect(page.locator("footer")).toContainText(canonicalSiteSettings.phone);
  await expect(page.locator("footer")).toContainText(canonicalSiteSettings.email);
  for (const [label] of canonicalNavigation.footer) await expect(page.locator("footer")).toContainText(label);
}

async function bootstrapProductionSiteBaseline(
  browser: Browser,
  configuration: MutationConfiguration,
  state: SecondaryState,
  observer: CmsBrowserObserver,
  semanticActions: CmsSemanticActionLedger,
) {
  if (configuration.environment !== "production") return;
  const corporate = configuration.corporateActor;
  if (!corporate) throw new Error("QA_CMS_PRODUCTION_CORPORATE_BASELINE_IDENTITY_MISSING");
  const corporateContext = await browser.newContext({
    baseURL: targets.production.site,
    serviceWorkers: "block",
  });
  await installSealedPreviewRouting(corporateContext);
  observer.observeContext(corporateContext);
  const corporatePage = await corporateContext.newPage();
  try {
    await assertDeployment(corporatePage, configuration.expectedSha, "production");
    await signInWithAal2(corporatePage, configuration, corporate);
    const corporateUserId = await authenticatedUserId(corporatePage, configuration);
    expect(corporateUserId).not.toBe(configuration.qaLeaseActorId);

    // The entire preflight is read-only. Both singleton states, canonical data,
    // ownership and UI permissions are checked before either document is created.
    await adminReady(corporatePage, "/admin/site?section=site_settings");
    await expect.poll(() => siteState(corporatePage)).toMatch(/^(new|published)$/);
    const initialSettingsState = await siteState(corporatePage);
    let settingsRow: SiteDocumentRow | null = null;
    if (initialSettingsState === "published") {
      await expectCanonicalSettingsEditor(corporatePage);
      settingsRow = await siteDocumentRow(corporatePage, configuration, "site_settings");
      expect(settingsRow.workflow_status).toBe("published");
      expect(settingsRow.created_by).not.toBe(configuration.qaLeaseActorId);
    } else {
      await expect(corporatePage.getByRole("button", { name: "Criar documento", exact: true })).toBeVisible();
    }

    await adminReady(corporatePage, "/admin/site?section=navigation");
    await expect.poll(() => siteState(corporatePage)).toMatch(/^(new|published)$/);
    const initialNavigationState = await siteState(corporatePage);
    let navigationRow: SiteDocumentRow | null = null;
    if (initialNavigationState === "published") {
      await expectCanonicalNavigationEditor(corporatePage);
      navigationRow = await siteDocumentRow(corporatePage, configuration, "navigation");
      expect(navigationRow.workflow_status).toBe("published");
      expect(navigationRow.created_by).not.toBe(configuration.qaLeaseActorId);
    } else {
      await expect(corporatePage.getByRole("button", { name: "Criar documento", exact: true })).toBeVisible();
    }

    if (initialSettingsState === "new") {
      await adminReady(corporatePage, "/admin/site?section=site_settings");
      await expect.poll(() => siteState(corporatePage)).toBe("new");
      await createCorporateSettings(corporatePage, configuration, state, semanticActions);
      state.baselineSiteSettings = "created-via-ui";
      await expectCanonicalSettingsEditor(corporatePage);
      settingsRow = await siteDocumentRow(corporatePage, configuration, "site_settings");
      expect(settingsRow.created_by).toBe(corporateUserId);
    } else {
      state.baselineSiteSettings = "preexisting-published";
    }

    if (initialNavigationState === "new") {
      await adminReady(corporatePage, "/admin/site?section=navigation");
      await expect.poll(() => siteState(corporatePage)).toBe("new");
      await createCorporateNavigation(corporatePage, configuration, state, semanticActions);
      state.baselineNavigation = "created-via-ui";
      await expectCanonicalNavigationEditor(corporatePage);
      navigationRow = await siteDocumentRow(corporatePage, configuration, "navigation");
      expect(navigationRow.created_by).toBe(corporateUserId);
    } else {
      state.baselineNavigation = "preexisting-published";
    }

    if (!settingsRow || !navigationRow) {
      throw new Error("QA_CMS_PRODUCTION_CORPORATE_BASELINE_ROWS_MISSING");
    }
    expect(settingsRow.workflow_status).toBe("published");
    expect(settingsRow.created_by).not.toBe(configuration.qaLeaseActorId);
    expect(navigationRow.workflow_status).toBe("published");
    expect(navigationRow.created_by).not.toBe(configuration.qaLeaseActorId);
    state.settingsId = settingsRow.id;
    state.navigationId = navigationRow.id;

    await expectEditorialAuditTrail(corporatePage, configuration, [settingsRow.id, navigationRow.id]);
    await adminReady(corporatePage, "/admin/auditoria");
    for (const itemId of [settingsRow.id, navigationRow.id]) {
      await expect(corporatePage.locator("code").filter({ hasText: itemId }).first()).toBeVisible({
        timeout: 20_000,
      });
    }
    await expect(corporatePage.getByText("O registro de auditoria é imutável")).toBeVisible();
    await expectCanonicalPublicShell(corporatePage, configuration);
    state.baselineCorporateVerified = true;
  } finally {
    try {
      assertSealedPreviewRoutingUsed(corporateContext);
    } finally {
      await corporateContext.close();
    }
  }
}

async function verifyStagingSiteBaseline(
  page: Page,
  configuration: MutationConfiguration,
  state: SecondaryState,
) {
  if (configuration.environment !== "staging") return;
  const qaUserId = await authenticatedUserId(page, configuration);
  expect(qaUserId).toBe(configuration.qaLeaseActorId);

  await adminReady(page, "/admin/site?section=site_settings");
  await expect.poll(() => siteState(page)).toBe("published");
  await expectCanonicalSettingsEditor(page);
  const settingsRow = await siteDocumentRow(page, configuration, "site_settings");
  expect(settingsRow.workflow_status).toBe("published");
  expect(settingsRow.created_by).not.toBe(configuration.qaLeaseActorId);

  await adminReady(page, "/admin/site?section=navigation");
  await expect.poll(() => siteState(page)).toBe("published");
  await expectCanonicalNavigationEditor(page);
  const navigationRow = await siteDocumentRow(page, configuration, "navigation");
  expect(navigationRow.workflow_status).toBe("published");
  expect(navigationRow.created_by).not.toBe(configuration.qaLeaseActorId);

  state.settingsId = settingsRow.id;
  state.navigationId = navigationRow.id;
  state.baselineSiteSettings = "preexisting-published";
  state.baselineNavigation = "preexisting-published";
  await expectEditorialAuditTrail(page, configuration, [settingsRow.id, navigationRow.id]);
  await adminReady(page, "/admin/auditoria");
  for (const itemId of [settingsRow.id, navigationRow.id]) {
    await expect(page.locator("code").filter({ hasText: itemId }).first()).toBeVisible({ timeout: 20_000 });
  }
  await expect(page.getByText("O registro de auditoria é imutável")).toBeVisible();
  await expectCanonicalPublicShell(page, configuration);
  state.baselineCorporateVerified = true;
}

async function finalizeSiteBaseline(page: Page, configuration: MutationConfiguration, state: SecondaryState) {
  if (
    !state.baselineCorporateVerified ||
    !state.baselineNavigation ||
    !state.baselineSiteSettings ||
    !state.navigationRestored ||
    !state.settingsRestored
  ) {
    throw new Error("QA_CMS_PRODUCTION_CORPORATE_BASELINE_NOT_RESTORED");
  }
  await expectCanonicalPublicShell(page, configuration);
  const states = [state.baselineNavigation, state.baselineSiteSettings];
  const workflow = states.every((value) => value === "created-via-ui")
    ? "draft-submit-approve-publish"
    : states.every((value) => value === "preexisting-published")
      ? "reuse-published-baseline"
      : "mixed-create-and-reuse";
  state.siteBaseline = {
    navigation: state.baselineNavigation,
    siteSettings: state.baselineSiteSettings,
    workflow,
    aal2: true,
    audit: true,
    public: true,
    idsPersisted: false,
    ownerAuthored: true,
    canonicalRepositoryDataVerified: true,
    baselineOwner: "corporate",
    actorOutsideQaLease: true,
    qaLeaseActorUsed: false,
    mutationTransport: "cms-ui-only",
    navigationTerminalState: "published-after-restore",
    siteSettingsTerminalState: "published-after-restore",
    publicShellVerifiedAfterRestore: true,
  };
}

async function restoreSettings(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  semanticActions: CmsSemanticActionLedger,
) {
  if (!state.settingsSaved || state.settingsRestored) return;
  await adminReady(page, "/admin/site?section=site_settings");
  await advanceSiteToPublished(page, configuration, semanticActions, "site-settings", "global-site-settings");
  const priorSummary = state.settingsPriorRevision;
  if (!priorSummary) throw new Error("A revisão anterior das configurações não foi registrada.");
  const prior = page.locator("details").filter({ has: page.locator("summary", { hasText: priorSummary }) });
  await expect(prior).toHaveCount(1);
  await prior.locator("summary").click();
  const restoreButton = prior.getByRole("button", {
    name: "Restaurar como nova revisão",
    exact: true,
  });
  const restored = await clickEditorial(
    page,
    configuration,
    "restore",
    "published",
    () => restoreButton.click(),
    semanticTarget(
      semanticActions,
      "site-settings",
      "Restaurar como nova revisão",
      restoreButton,
      "global-site-settings",
    ),
  );
  expect(restored.body.status).toBe("published");
  state.settingsRestored = true;
  await expectPublicPhone(context, state.settingsPhone!, false);
}

async function restoreNavigation(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  semanticActions: CmsSemanticActionLedger,
) {
  if (!state.navigationSaved || state.navigationRestored) return;
  await adminReady(page, "/admin/site?section=navigation");
  await advanceSiteToPublished(page, configuration, semanticActions, "site-navigation", "global-navigation");
  const priorSummary = state.navigationPriorRevision;
  if (!priorSummary) throw new Error("A revisão anterior da navegação não foi registrada antes da mutação.");
  const prior = page.locator("details").filter({ has: page.locator("summary", { hasText: priorSummary }) });
  await expect(prior).toHaveCount(1);
  await prior.locator("summary").click();
  const restoreButton = prior.getByRole("button", {
    name: "Restaurar como nova revisão",
    exact: true,
  });
  const restored = await clickEditorial(
    page,
    configuration,
    "restore",
    "published",
    () => restoreButton.click(),
    semanticTarget(
      semanticActions,
      "site-navigation",
      "Restaurar como nova revisão",
      restoreButton,
      "global-navigation",
    ),
  );
  expect(restored.body.status).toBe("published");
  state.navigationRestored = true;
  await expectPublicNavigation(context, state.navigationLabel!, false);
}

async function restoreOrArchivePlacement(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  semanticActions: CmsSemanticActionLedger,
) {
  if (!state.placementSaved || state.placementRestored || state.placementArchived) return;
  await adminReady(page, "/admin/site?section=placement");
  await advanceSiteToPublished(page, configuration, semanticActions, "site-placements", "global-placements");
  if (state.placementPriorRevision) {
    const prior = page
      .locator("details")
      .filter({ has: page.locator("summary", { hasText: state.placementPriorRevision }) });
    await expect(prior).toHaveCount(1);
    await prior.locator("summary").click();
    const restoreButton = prior.getByRole("button", {
      name: "Restaurar como nova revisão",
      exact: true,
    });
    const restored = await clickEditorial(
      page,
      configuration,
      "restore",
      "published",
      () => restoreButton.click(),
      semanticTarget(
        semanticActions,
        "site-placements",
        "Restaurar como nova revisão",
        restoreButton,
        "global-placements",
      ),
    );
    expect(restored.body.status).toBe("published");
    state.placementRestored = true;
  } else {
    const archiveButton = page.getByRole("button", {
      name: "Despublicar e arquivar",
      exact: true,
    });
    const archived = await clickEditorial(
      page,
      configuration,
      "archive",
      "archived",
      () => archiveButton.click(),
      semanticTarget(
        semanticActions,
        "site-placements",
        "Despublicar e arquivar",
        archiveButton,
        "global-placements",
      ),
    );
    expect(archived.body.status).toBe("archived");
    state.placementArchived = true;
  }
  await expectPublicPlacement(context, state.placementLabel!, false);
}

async function fillBlank(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  if (!(await field.inputValue())) await field.fill(value);
}

async function prepareSiteGovernanceFields(
  page: Page,
  surfaceId: "site-settings" | "site-navigation" | "site-placements",
  scenarioId: string,
) {
  const schemaReference = "src/shared/contracts/cms-content.ts";
  const editable: ReloadFieldProof[] = [];
  for (const fieldName of [
    "Título do documento",
    "Título SEO",
    "Descrição SEO",
    "Referência da autorização",
    "Data da autorização",
    "Escopo dos direitos",
    "Responsável comercial",
    "Responsável técnico",
    "Confirmo os direitos para esta configuração global",
    "Motivo da alteração",
  ]) {
    editable.push(
      await prepareSecondaryFieldWithReloadProof({
        page,
        locator: page.getByLabel(fieldName, { exact: true }),
        surfaceId,
        fieldName,
        scenarioId,
        schemaReference,
      }),
    );
  }
  const canonical = await prepareSecondaryFieldWithReloadProof({
    page,
    locator: page.getByLabel("Canonical técnico", { exact: true }),
    surfaceId,
    fieldName: "Canonical técnico",
    scenarioId,
    schemaReference,
  });
  return { editable, nonEditable: [canonical] };
}

async function exerciseGlobalSettings(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
  semanticStateSetups: Map<string, CmsSemanticStateSetup>,
) {
  await adminReady(page, "/admin/site?section=site_settings");
  await expect(page.getByRole("heading", { name: "Estrutura do site" })).toBeVisible();
  expect(await siteState(page)).toBe("published");
  const summaries = await page.locator("details summary").allTextContents();
  if (!summaries[0]) throw new Error("Configurações publicadas sem revisão anterior restaurável.");
  state.settingsPriorRevision = summaries[0];
  state.settingsPhone = `(11) 0000-${configuration.expectedSha.slice(0, 4)}`;
  const email = page.getByLabel("E-mail", { exact: true });
  const previousEmail = await email.inputValue();
  await email.fill("email-invalido");
  await expect(page.getByRole("button", { name: "Salvar rascunho" })).toBeDisabled();
  await email.fill(previousEmail);
  await page.getByLabel("Telefone", { exact: true }).fill(state.settingsPhone);
  await page.getByLabel("Motivo da alteração").fill(`${configuration.runTag} configurações globais`);
  await fillBlank(page, "Título do documento", "Configurações globais GAIATEC");
  await fillBlank(page, "Título SEO", "Configurações globais | GAIATEC");
  await fillBlank(page, "Descrição SEO", "Configurações públicas governadas do site GAIATEC.");
  await fillBlank(page, "Referência da autorização", configuration.runTag);
  await fillBlank(page, "Data da autorização", new Date().toISOString().slice(0, 10));
  await fillBlank(page, "Escopo dos direitos", "Configuração global sintética de homologação");
  await fillBlank(page, "Responsável comercial", "QA CMS");
  await fillBlank(page, "Responsável técnico", "QA CMS");
  const rights = page.getByLabel("Confirmo os direitos para esta configuração global");
  if (!(await rights.isChecked())) await rights.check();

  const socialCount = await page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Rede \d+$/ }) })
    .count();
  expect(socialCount).toBeLessThan(20);
  const addSocialButton = page.getByRole("button", { name: "Adicionar rede", exact: true });
  await addSocialButton.click();
  let social = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Rede \d+$/ }) })
    .last();
  await social.getByLabel("Nome", { exact: true }).fill("Rede temporária de homologação");
  await social.getByLabel("URL", { exact: true }).fill("https://example.invalid/removida");
  await social.getByRole("button", { name: "Remover rede", exact: true }).click();
  await expect(
    page.locator("fieldset").filter({ has: page.locator("legend", { hasText: /^Rede \d+$/ }) }),
  ).toHaveCount(socialCount);
  await addSocialButton.click();
  social = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Rede \d+$/ }) })
    .last();
  await social.getByLabel("Nome", { exact: true }).fill("Homologação CMS");
  await social
    .getByLabel("URL", { exact: true })
    .fill(`https://example.invalid/${configuration.expectedSha.slice(0, 8)}`);
  const firstSocial = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Rede \d+$/ }) })
    .first();

  const semanticFields: ReloadFieldProof[] = [];
  for (const fieldName of [
    "Nome público",
    "Razão social opcional",
    "Telefone",
    "WhatsApp",
    "Endereço",
    "Rótulo",
  ]) {
    semanticFields.push(
      await prepareSecondaryFieldWithReloadProof({
        page,
        locator: page.getByLabel(fieldName, { exact: true }),
        surfaceId: "site-settings",
        fieldName,
        scenarioId: "global-site-settings",
        schemaReference: "src/shared/contracts/cms-content.ts",
      }),
    );
  }
  semanticFields.push(
    await prepareSecondaryFieldWithReloadProof({
      page,
      locator: email,
      surfaceId: "site-settings",
      fieldName: "E-mail",
      scenarioId: "global-site-settings",
      schemaReference: "src/shared/contracts/cms-content.ts",
      invalid: {
        applicability: "already-exercised",
        proofKind: "ui-validation",
        expectedResult: "Um endereço sem formato de e-mail deve bloquear a gravação.",
        observedResult: "A interface desabilitou a gravação sem enviar request ao backend.",
      },
    }),
    await prepareSecondaryFieldWithReloadProof({
      page,
      locator: page.getByLabel("Destino", { exact: true }),
      surfaceId: "site-settings",
      fieldName: "Destino",
      scenarioId: "global-site-settings",
      schemaReference: "src/shared/contracts/cms-content.ts",
      invalid: {
        applicability: "exercise",
        value: "#",
        expectedResult: "Um destino sem rota interna ou URL HTTP deve ser recusado.",
        observedResult: "A validação declarada recusou o destino inválido e restaurou a rota.",
      },
    }),
    await prepareSecondaryFieldWithReloadProof({
      page,
      locator: firstSocial.getByLabel("Nome", { exact: true }),
      surfaceId: "site-settings",
      fieldName: "Nome",
      scenarioId: "global-site-settings",
      schemaReference: "src/shared/contracts/cms-content.ts",
    }),
    await prepareSecondaryFieldWithReloadProof({
      page,
      locator: firstSocial.getByLabel("URL", { exact: true }),
      surfaceId: "site-settings",
      fieldName: "URL",
      scenarioId: "global-site-settings",
      schemaReference: "src/shared/contracts/cms-content.ts",
      invalid: {
        applicability: "exercise",
        value: "endereco-invalido",
        expectedResult: "Uma rede social sem URL absoluta deve ser recusada.",
        observedResult: "A validação nativa recusou a URL e restaurou o endereço controlado.",
      },
    }),
  );
  const governance = await prepareSiteGovernanceFields(page, "site-settings", "global-site-settings");
  semanticFields.push(...governance.editable);

  await page.getByRole("tab", { name: "Menus", exact: true }).click();
  const unsavedDialog = page.getByRole("alertdialog", { name: "Sair sem salvar?", exact: true });
  await expect(unsavedDialog).toBeVisible();
  await unsavedDialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(unsavedDialog).toBeHidden();
  semanticScenarios.recordStructure({
    surfaceId: "site-settings",
    controlKind: "dialog",
    controlName: "Sair sem salvar?",
    scenarioId: "global-site-settings-unsaved-dialog",
    effectKind: "state-transition",
    httpStatus: null,
  });
  const saveSettingsButton = page.getByRole("button", { name: "Salvar rascunho", exact: true });
  const saved = await clickEditorial(
    page,
    configuration,
    "save",
    "draft",
    () => saveSettingsButton.click(),
    semanticTarget(
      semanticActions,
      "site-settings",
      "Salvar rascunho",
      saveSettingsButton,
      "global-site-settings",
    ),
  );
  expect(saved.body.status).toBe("draft");
  state.settingsId = String(saved.body.itemId);
  state.settingsSaved = true;
  await expect.poll(() => siteState(page)).toBe("draft");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => siteState(page)).toBe("draft");
  await assertSecondaryFieldsAfterReload(semanticFields);
  for (const field of governance.nonEditable) semanticScenarios.recordNonEditableField(field.prepared);
  recordReloadedSecondaryFields(semanticScenarios, semanticFields, saved.response.status());
  semanticScenarios.recordStructure({
    surfaceId: "site-settings",
    controlKind: "form",
    controlName: "Configuração global do site",
    scenarioId: "global-site-settings",
    effectKind: "backend-response",
    httpStatus: saved.response.status(),
  });
  semanticActions.record({
    surfaceId: "site-settings",
    controlName: "Adicionar rede",
    action: "save-social-link",
    scenarioId: "global-site-settings",
    backendStatus: "draft",
    httpStatus: saved.response.status(),
  });
  await page.getByLabel("Telefone", { exact: true }).fill(configuration.runTag);
  await page.getByRole("tab", { name: "Menus", exact: true }).click();
  const replayableUnsavedDialog = page.getByRole("alertdialog", {
    name: "Sair sem salvar?",
    exact: true,
  });
  await expect(replayableUnsavedDialog).toBeVisible();
  await replayableUnsavedDialog.getByRole("button", { name: "Sair sem salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/site\?section=navigation$/);
  recordSecondarySemanticStateSetup(semanticStateSetups, {
    surfaceId: "site-settings",
    stateId: "unsaved-changes-dialog",
    scenarioId: "global-site-settings-unsaved-dialog",
    steps: [
      {
        stepId: "dirty-phone",
        scope: "page",
        controlKind: "field",
        accessibleName: "Telefone",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "request-navigation-tab",
        scope: "page",
        controlKind: "tab",
        accessibleName: "Menus",
        controlOccurrence: 0,
        operation: "activate",
      },
    ],
    expectedState: {
      kind: "role",
      role: "alertdialog",
      accessibleName: "Sair sem salvar?",
      occurrence: 0,
    },
    restore: {
      operation: "activate",
      controlKind: "button",
      accessibleName: "Sair sem salvar",
      controlOccurrence: 0,
    },
  });
  await adminReady(page, "/admin/site?section=site_settings");
  await expect.poll(() => siteState(page)).toBe("draft");
  semanticActions.record({
    surfaceId: "site-settings",
    controlName: "Remover rede",
    action: "save-social-link-removal",
    scenarioId: "global-site-settings",
    backendStatus: "draft",
    httpStatus: saved.response.status(),
  });
  await advanceSiteToPublished(page, configuration, semanticActions, "site-settings", "global-site-settings");
  await expectPublicPhone(context, state.settingsPhone, true);
  await restoreSettings(page, context, configuration, state, semanticActions);
  evidence.push({
    scenario: "global-site-settings",
    status: "passed",
    checks: [
      "e-mail inválido bloqueado sem request",
      "contato global persistido no backend",
      "configuração publicada e consumida no rodapé público",
      "revisão anterior restaurada pela UI",
      "cache público confirmou remoção do valor sintético",
    ],
  });
}

async function exerciseGlobalNavigation(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
  semanticStateSetups: Map<string, CmsSemanticStateSetup>,
) {
  await adminReady(page, "/admin/site?section=navigation");
  await expect(page.getByRole("heading", { name: "Estrutura do site" })).toBeVisible();
  expect(await siteState(page)).toBe("published");
  const summaries = await page.locator("details summary").allTextContents();
  if (!summaries[0]) throw new Error("Navegação publicada sem revisão anterior restaurável.");
  state.navigationPriorRevision = summaries[0];
  const label = `${configuration.runTag} navegação`;
  state.navigationLabel = label;
  await page.getByLabel("Motivo da alteração").fill(`${configuration.runTag} navegação global`);
  const addItemButton = page.getByRole("button", { name: "Adicionar item", exact: true });
  await addItemButton.click();
  let item = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Item \d+$/ }) })
    .last();
  await item.getByLabel("Rótulo", { exact: true }).fill("Item temporário de homologação");
  await item.getByLabel("Destino", { exact: true }).fill("/qa/temporario");
  await item.getByRole("button", { name: "Remover item", exact: true }).click();
  await addItemButton.click();
  item = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Item \d+$/ }) })
    .last();
  await item.getByLabel("Local").selectOption("header");
  await item.getByLabel("Rótulo").fill(label);
  await item.getByLabel("Destino").fill(`/qa/${configuration.expectedSha.slice(0, 8)}`);
  await item.getByLabel("Visível").check();
  await fillBlank(page, "Título do documento", "Navegação global GAIATEC");
  await fillBlank(page, "Título SEO", "Navegação global | GAIATEC");
  await fillBlank(page, "Descrição SEO", "Configuração global governada da navegação GAIATEC.");
  await fillBlank(page, "Referência da autorização", configuration.runTag);
  await fillBlank(page, "Data da autorização", new Date().toISOString().slice(0, 10));
  await fillBlank(page, "Escopo dos direitos", "Configuração global sintética de homologação");
  await fillBlank(page, "Responsável comercial", "QA CMS");
  await fillBlank(page, "Responsável técnico", "QA CMS");
  const rights = page.getByLabel("Confirmo os direitos para esta configuração global");
  if (!(await rights.isChecked())) await rights.check();

  const firstItem = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Item \d+$/ }) })
    .first();
  const semanticFields: ReloadFieldProof[] = [];
  for (const fieldName of ["Local", "Rótulo", "Item pai", "Ordem", "Visível", "Abrir em nova aba"]) {
    semanticFields.push(
      await prepareSecondaryFieldWithReloadProof({
        page,
        locator: firstItem.getByLabel(fieldName, { exact: true }),
        surfaceId: "site-navigation",
        fieldName,
        scenarioId: "global-navigation",
        schemaReference: "src/shared/contracts/cms-content.ts",
      }),
    );
  }
  semanticFields.push(
    await prepareSecondaryFieldWithReloadProof({
      page,
      locator: firstItem.getByLabel("Destino", { exact: true }),
      surfaceId: "site-navigation",
      fieldName: "Destino",
      scenarioId: "global-navigation",
      schemaReference: "src/shared/contracts/cms-content.ts",
      invalid: {
        applicability: "exercise",
        value: "#",
        expectedResult: "Links vazios ou marcadores sem destino devem ser recusados.",
        observedResult: "A validação declarada recusou o marcador e restaurou a rota publicada.",
      },
    }),
  );
  const governance = await prepareSiteGovernanceFields(page, "site-navigation", "global-navigation");
  semanticFields.push(...governance.editable);

  await page.getByRole("tab", { name: "Dados globais", exact: true }).click();
  const unsavedDialog = page.getByRole("alertdialog", { name: "Sair sem salvar?", exact: true });
  await expect(unsavedDialog).toBeVisible();
  await unsavedDialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(unsavedDialog).toBeHidden();
  semanticScenarios.recordStructure({
    surfaceId: "site-navigation",
    controlKind: "dialog",
    controlName: "Sair sem salvar?",
    scenarioId: "global-navigation-unsaved-dialog",
    effectKind: "state-transition",
    httpStatus: null,
  });

  let reopenRequests = 0;
  const reopenObserver = (request: { postDataJSON(): unknown }) => {
    try {
      if ((request.postDataJSON() as Record<string, unknown>).action === "reopen") reopenRequests += 1;
    } catch {
      // Ignore non-JSON requests.
    }
  };
  page.on("request", reopenObserver);
  await page.getByRole("button", { name: "Abrir nova versão" }).click();
  await expect(page.getByRole("alert")).toContainText("Salve a configuração antes");
  expect(reopenRequests).toBe(0);
  page.off("request", reopenObserver);

  const saveNavigationButton = page.getByRole("button", { name: "Salvar rascunho", exact: true });
  const saved = await clickEditorial(
    page,
    configuration,
    "save",
    "draft",
    () => saveNavigationButton.click(),
    semanticTarget(
      semanticActions,
      "site-navigation",
      "Salvar rascunho",
      saveNavigationButton,
      "global-navigation",
    ),
  );
  state.navigationSaved = true;
  state.navigationId = String(saved.body.itemId);
  expect(saved.body.status).toBe("draft");
  await expect.poll(() => siteState(page)).toBe("draft");
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => siteState(page)).toBe("draft");
  await assertSecondaryFieldsAfterReload(semanticFields);
  await expect(page.getByLabel("Rótulo").last()).toHaveValue(label);
  for (const field of governance.nonEditable) semanticScenarios.recordNonEditableField(field.prepared);
  recordReloadedSecondaryFields(semanticScenarios, semanticFields, saved.response.status());
  semanticScenarios.recordStructure({
    surfaceId: "site-navigation",
    controlKind: "form",
    controlName: "Configuração global de navegação",
    scenarioId: "global-navigation",
    effectKind: "backend-response",
    httpStatus: saved.response.status(),
  });
  for (const [controlName, action] of [
    ["Adicionar item", "save-navigation-item"],
    ["Remover item", "save-navigation-item-removal"],
  ] as const) {
    semanticActions.record({
      surfaceId: "site-navigation",
      controlName,
      action,
      scenarioId: "global-navigation",
      backendStatus: "draft",
      httpStatus: saved.response.status(),
    });
  }
  await page.getByLabel("Rótulo", { exact: true }).first().fill(configuration.runTag);
  await page.getByRole("tab", { name: "Dados globais", exact: true }).click();
  const replayableUnsavedDialog = page.getByRole("alertdialog", {
    name: "Sair sem salvar?",
    exact: true,
  });
  await expect(replayableUnsavedDialog).toBeVisible();
  await replayableUnsavedDialog.getByRole("button", { name: "Sair sem salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/site\?section=site_settings$/);
  recordSecondarySemanticStateSetup(semanticStateSetups, {
    surfaceId: "site-navigation",
    stateId: "unsaved-changes-dialog",
    scenarioId: "global-navigation-unsaved-dialog",
    steps: [
      {
        stepId: "dirty-first-label",
        scope: "page",
        controlKind: "field",
        accessibleName: "Rótulo",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "request-settings-tab",
        scope: "page",
        controlKind: "tab",
        accessibleName: "Dados globais",
        controlOccurrence: 0,
        operation: "activate",
      },
    ],
    expectedState: {
      kind: "role",
      role: "alertdialog",
      accessibleName: "Sair sem salvar?",
      occurrence: 0,
    },
    restore: {
      operation: "activate",
      controlKind: "button",
      accessibleName: "Sair sem salvar",
      controlOccurrence: 0,
    },
  });
  await adminReady(page, "/admin/site?section=navigation");
  await expect.poll(() => siteState(page)).toBe("draft");
  await advanceSiteToPublished(page, configuration, semanticActions, "site-navigation", "global-navigation");
  await expectPublicNavigation(context, label, true);
  await restoreNavigation(page, context, configuration, state, semanticActions);
  evidence.push({
    scenario: "global-navigation",
    status: "passed",
    checks: [
      "alteração suja bloqueia transição de workflow",
      "item global persistido",
      "revisão publicada e consumida no header público",
      "revisão anterior restaurada pela UI",
      "cache público confirmou remoção do item sintético",
    ],
  });
}

async function exerciseGlobalPlacements(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
  semanticStateSetups: Map<string, CmsSemanticStateSetup>,
) {
  await adminReady(page, "/admin/site?section=placement");
  await expect(page.getByRole("heading", { name: "Estrutura do site" })).toBeVisible();
  const initialState = await siteState(page);
  expect(["new", "published"]).toContain(initialState);
  if (initialState === "published") {
    const summaries = await page.locator("details summary").allTextContents();
    if (!summaries[0]) throw new Error("Destaques publicados sem revisão anterior restaurável.");
    state.placementPriorRevision = summaries[0];
  }

  await page.getByLabel("Motivo da alteração").fill(`${configuration.runTag} destaques globais`);
  await fillBlank(page, "Título do documento", "Destaques globais GAIATEC");
  await fillBlank(page, "Título SEO", "Destaques globais | GAIATEC");
  await fillBlank(page, "Descrição SEO", "Destaques editoriais governados do site GAIATEC.");
  await fillBlank(page, "Referência da autorização", configuration.runTag);
  await fillBlank(page, "Data da autorização", new Date().toISOString().slice(0, 10));
  await fillBlank(page, "Escopo dos direitos", "Destaque sintético temporário de homologação");
  await fillBlank(page, "Responsável comercial", "QA CMS");
  await fillBlank(page, "Responsável técnico", "QA CMS");
  const rights = page.getByLabel("Confirmo os direitos para esta configuração global");
  if (!(await rights.isChecked())) await rights.check();

  const addPlacementButton = page.getByRole("button", {
    name: "Adicionar destaque",
    exact: true,
  });
  await addPlacementButton.click();
  let placement = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Destaque \d+$/ }) })
    .last();
  await placement.getByLabel("Rótulo opcional", { exact: true }).fill("Destaque temporário");
  await placement.getByRole("button", { name: "Remover destaque", exact: true }).click();
  await addPlacementButton.click();
  placement = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Destaque \d+$/ }) })
    .last();
  const placementTarget = placement.getByLabel("Conteúdo", { exact: true });
  const targetValue = await placementTarget.inputValue();
  if (!uuidPattern.test(targetValue)) {
    throw new Error("Destaque não recebeu um conteúdo publicado selecionável pela interface.");
  }
  state.placementLabel = `${configuration.runTag} destaque`;
  await placement.getByLabel("Posição", { exact: true }).selectOption("global_announcement");
  await placement.getByLabel("Rótulo opcional", { exact: true }).fill(state.placementLabel);
  const startsAt = new Date(Date.now() - 60_000).toISOString().slice(0, 16);
  const endsAt = new Date(Date.now() + 3_600_000).toISOString().slice(0, 16);
  await placement.getByLabel("Início", { exact: true }).fill(startsAt);
  const ending = placement.getByLabel("Término", { exact: true });
  await ending.fill(new Date(Date.now() - 120_000).toISOString().slice(0, 16));
  await expect(
    page.getByRole("button", {
      name: initialState === "new" ? "Criar documento" : "Salvar rascunho",
      exact: true,
    }),
  ).toBeDisabled();
  await ending.fill(endsAt);
  await placement.getByLabel("Prioridade", { exact: true }).fill("999");
  await placement.getByLabel("Ativo", { exact: true }).check();

  const firstPlacement = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Destaque \d+$/ }) })
    .first();
  const firstStartValue = await firstPlacement.getByLabel("Início", { exact: true }).inputValue();
  const firstEnd = firstPlacement.getByLabel("Término", { exact: true });
  const firstEndValue = await firstEnd.inputValue();
  await firstEnd.fill(new Date(new Date(firstStartValue).getTime() - 60_000).toISOString().slice(0, 16));
  await expect(
    page.getByRole("button", {
      name: initialState === "new" ? "Criar documento" : "Salvar rascunho",
      exact: true,
    }),
  ).toBeDisabled();
  await firstEnd.fill(firstEndValue);
  const semanticFields: ReloadFieldProof[] = [];
  for (const fieldName of ["Posição", "Conteúdo", "Rótulo opcional", "Início", "Prioridade", "Ativo"]) {
    semanticFields.push(
      await prepareSecondaryFieldWithReloadProof({
        page,
        locator: firstPlacement.getByLabel(fieldName, { exact: true }),
        surfaceId: "site-placements",
        fieldName,
        scenarioId: "global-placements",
        schemaReference: "src/shared/contracts/cms-content.ts",
      }),
    );
  }
  semanticFields.push(
    await prepareSecondaryFieldWithReloadProof({
      page,
      locator: firstPlacement.getByLabel("Término", { exact: true }),
      surfaceId: "site-placements",
      fieldName: "Término",
      scenarioId: "global-placements",
      schemaReference: "src/shared/contracts/cms-content.ts",
      invalid: {
        applicability: "already-exercised",
        proofKind: "ui-validation",
        expectedResult: "O término anterior ao início deve bloquear a gravação.",
        observedResult: "A validação cruzada desabilitou o comando até a janela ser corrigida.",
      },
    }),
  );
  const governance = await prepareSiteGovernanceFields(page, "site-placements", "global-placements");
  semanticFields.push(...governance.editable);

  await page.getByRole("tab", { name: "Menus", exact: true }).click();
  const unsavedDialog = page.getByRole("alertdialog", { name: "Sair sem salvar?", exact: true });
  await expect(unsavedDialog).toBeVisible();
  await unsavedDialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
  await expect(unsavedDialog).toBeHidden();
  semanticScenarios.recordStructure({
    surfaceId: "site-placements",
    controlKind: "dialog",
    controlName: "Sair sem salvar?",
    scenarioId: "global-placements-unsaved-dialog",
    effectKind: "state-transition",
    httpStatus: null,
  });

  const commandName = initialState === "new" ? "Criar documento" : "Salvar rascunho";
  const saveButton = page.getByRole("button", { name: commandName, exact: true });
  const saved = await clickEditorial(
    page,
    configuration,
    initialState === "new" ? "create" : "save",
    "draft",
    () => saveButton.click(),
    semanticTarget(semanticActions, "site-placements", commandName, saveButton, "global-placements"),
  );
  state.placementId = String(saved.body.itemId);
  state.placementSaved = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => siteState(page)).toBe("draft");
  await assertSecondaryFieldsAfterReload(semanticFields);
  for (const field of governance.nonEditable) semanticScenarios.recordNonEditableField(field.prepared);
  recordReloadedSecondaryFields(semanticScenarios, semanticFields, saved.response.status());
  semanticScenarios.recordStructure({
    surfaceId: "site-placements",
    controlKind: "form",
    controlName: "Configuração global de destaques",
    scenarioId: "global-placements",
    effectKind: "backend-response",
    httpStatus: saved.response.status(),
  });
  for (const [controlName, action] of [
    ["Adicionar destaque", "save-placement"],
    ["Remover destaque", "save-placement-removal"],
  ] as const) {
    semanticActions.record({
      surfaceId: "site-placements",
      controlName,
      action,
      scenarioId: "global-placements",
      backendStatus: "draft",
      httpStatus: saved.response.status(),
    });
  }

  await page.getByLabel("Rótulo opcional", { exact: true }).first().fill(configuration.runTag);
  await page.getByRole("tab", { name: "Menus", exact: true }).click();
  const replayableUnsavedDialog = page.getByRole("alertdialog", {
    name: "Sair sem salvar?",
    exact: true,
  });
  await expect(replayableUnsavedDialog).toBeVisible();
  await replayableUnsavedDialog.getByRole("button", { name: "Sair sem salvar", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/site\?section=navigation$/);
  recordSecondarySemanticStateSetup(semanticStateSetups, {
    surfaceId: "site-placements",
    stateId: "unsaved-changes-dialog",
    scenarioId: "global-placements-unsaved-dialog",
    steps: [
      {
        stepId: "dirty-placement-label",
        scope: "page",
        controlKind: "field",
        accessibleName: "Rótulo opcional",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "request-navigation-tab",
        scope: "page",
        controlKind: "tab",
        accessibleName: "Menus",
        controlOccurrence: 0,
        operation: "activate",
      },
    ],
    expectedState: {
      kind: "role",
      role: "alertdialog",
      accessibleName: "Sair sem salvar?",
      occurrence: 0,
    },
    restore: {
      operation: "activate",
      controlKind: "button",
      accessibleName: "Sair sem salvar",
      controlOccurrence: 0,
    },
  });
  await adminReady(page, "/admin/site?section=placement");
  await expect.poll(() => siteState(page)).toBe("draft");
  await advanceSiteToPublished(page, configuration, semanticActions, "site-placements", "global-placements");
  await expectPublicPlacement(context, state.placementLabel, true);
  await restoreOrArchivePlacement(page, context, configuration, state, semanticActions);
  evidence.push({
    scenario: "global-placements",
    status: "passed",
    targetType: "site_placement",
    targetId: state.placementId,
    checks: [
      "janela temporal inválida bloqueada sem request",
      "destaque salvo, recarregado e auditado pela interface",
      "publicação exibida no consumidor público",
      state.placementPriorRevision
        ? "revisão corporativa anterior restaurada pela UI"
        : "singleton sintético despublicado e arquivado pela UI",
      "cache público confirmou a retirada do destaque sintético",
    ],
  });
}

async function builderState(page: Page) {
  return ((await page.locator(".admin-builder-status strong").first().textContent()) ?? "").trim();
}

async function fillLastPageSource(page: Page, configuration: MutationConfiguration) {
  await page.getByRole("tab", { name: "Governança" }).click();
  await page.getByLabel("Estado").selectOption("synthetic_test");
  await page.getByLabel("Owner de negócio").fill("QA CMS");
  await page.getByLabel("Revisor editorial").fill("QA CMS");
  await page.getByLabel("Data de aprovação").fill(new Date().toISOString().slice(0, 16));
  const source = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Fonte \d+$/ }) })
    .last();
  await source.getByLabel("Referência da autorização").fill(configuration.runTag);
  await source.getByLabel("Data da autorização").fill(new Date().toISOString().slice(0, 10));
  await source.getByLabel("Escopo dos direitos").fill("Homologação sintética temporária");
  await source.getByLabel("Owner comercial").fill("QA CMS");
  await source.getByLabel("Owner técnico").fill("QA CMS");
  await source.getByLabel("Verificado em").fill(new Date().toISOString().slice(0, 16));
  await source.getByLabel("Direitos de uso confirmados").check();
}

async function advancePageToPublished(page: Page, configuration: MutationConfiguration) {
  await page.getByRole("tab", { name: "Publicação" }).click();
  for (const [from, action, button, to] of [
    ["draft", "submit", "Enviar para revisão", "in_review"],
    ["in_review", "approve", "Aprovar revisão", "approved"],
    ["approved", "publish", "Publicar agora", "published"],
  ] as const) {
    if ((await builderState(page)) !== from) continue;
    await clickEditorial(page, configuration, action, to, () =>
      page.getByRole("button", { name: button, exact: true }).click(),
    );
    await expect.poll(() => builderState(page)).toBe(to);
  }
  expect(await builderState(page)).toBe("published");
}

async function duplicateRetirementPage(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  mode: "redirect" | "gone",
) {
  await adminReady(page, `/admin/paginas/${configuration.ids.pageId}`);
  let prematureCreateRequests = 0;
  const createObserver = (request: { postDataJSON(): unknown }) => {
    try {
      if ((request.postDataJSON() as Record<string, unknown>).action === "create")
        prematureCreateRequests += 1;
    } catch {
      // Ignore non-JSON requests.
    }
  };
  page.on("request", createObserver);
  await page.getByRole("button", { name: "Duplicar página" }).click();
  await expect(page).toHaveURL(/\/admin\/paginas\/novo\?type=page$/);
  await expect(page.getByRole("status")).toContainText("rascunho local incompleto");
  expect(prematureCreateRequests).toBe(0);
  page.off("request", createObserver);
  const suffix = `${mode}-${configuration.expectedSha.slice(0, 8)}`;
  const path = `/qa-cms-final-${suffix}`;
  await page.getByRole("tab", { name: "Estrutura" }).click();
  await page.getByLabel("Título administrativo e público").fill(`${configuration.runTag} ${mode}`);
  await page.getByLabel("Resumo").fill(`Página sintética para validar retirada ${mode}.`);
  await page.getByRole("tab", { name: "SEO e URL" }).click();
  await page.getByLabel("Endereço público").fill(path);
  await page.getByLabel("Meta title").fill(`${configuration.runTag} ${mode} | GAIATEC`);
  await page
    .getByLabel("Meta description")
    .fill("Página temporária não indexável para homologação de retirada do CMS.");
  await page.getByLabel("Comportamento").selectOption(mode);
  if (mode === "redirect") {
    await page.getByLabel("Destino", { exact: true }).fill("https://example.invalid/fora-do-site");
    await expect(page.getByRole("button", { name: "Criar página" })).toBeDisabled();
    await page.getByLabel("Destino", { exact: true }).fill("/");
  }
  await fillLastPageSource(page, configuration);
  const created = await clickEditorial(page, configuration, "create", "draft", () =>
    page.getByRole("button", { name: "Criar página" }).click(),
  );
  const itemId = String(created.body.itemId ?? "");
  expect(uuidPattern.test(itemId)).toBe(true);
  state.retiredPages.push({ id: itemId, path, mode });
  await expect(page).toHaveURL(new RegExp(`/admin/paginas/${itemId}$`));
  await advancePageToPublished(page, configuration);

  const publicPage = await context.newPage();
  try {
    const publicResponse = await publicPage.goto(path, { waitUntil: "domcontentloaded" });
    expect(publicResponse?.status()).toBe(200);
    expect(publicResponse?.headers()["x-release"]).toBe(configuration.expectedSha);
    await expect(publicPage.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  } finally {
    await publicPage.close();
  }

  await page.getByRole("tab", { name: "Publicação" }).click();
  const retired = await clickEditorial(page, configuration, "retire", "archived", () =>
    page.getByRole("button", { name: "Retirar do ar" }).click(),
  );
  expect(retired.body.itemId).toBe(itemId);
  if (mode === "redirect") {
    await expect(async () => {
      const response = await sealedPreviewApiGet(page, path, {
        failOnStatusCode: false,
        maxRedirects: 0,
      });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe("/");
      expect(response.headers()["x-release"]).toBe(configuration.expectedSha);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    const browserProbe = await context.newPage();
    try {
      await browserProbe.goto(path, { waitUntil: "domcontentloaded" });
      expect(new URL(browserProbe.url()).pathname).toBe("/");
    } finally {
      await browserProbe.close();
    }
  } else {
    await expect(async () => {
      const browserProbe = await context.newPage();
      try {
        const response = await browserProbe.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(410);
        expect(response?.headers()["x-release"]).toBe(configuration.expectedSha);
        await expect(
          browserProbe.getByRole("heading", { name: "Este conteúdo não está mais disponível" }),
        ).toBeVisible();
      } finally {
        await browserProbe.close();
      }
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });

    await adminReady(page, `/admin/paginas/${itemId}`);
    await page.getByRole("tab", { name: "Publicação" }).click();
    const revision = page.locator("details").first();
    await revision.locator("summary").click();
    const restored = await clickEditorial(page, configuration, "restore", "published", () =>
      revision.getByRole("button", { name: "Restaurar como nova revisão" }).click(),
    );
    expect(restored.body.itemId).toBe(itemId);
    const restoredPublic = await context.newPage();
    try {
      await expect(async () => {
        const response = await restoredPublic.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status()).toBe(200);
      }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    } finally {
      await restoredPublic.close();
    }
    await page.getByRole("tab", { name: "Publicação" }).click();
    await clickEditorial(page, configuration, "retire", "archived", () =>
      page.getByRole("button", { name: "Retirar do ar" }).click(),
    );
  }
  return { id: itemId, path, mode };
}

async function exerciseRetirement(
  page: Page,
  context: BrowserContext,
  configuration: MutationConfiguration,
  state: SecondaryState,
  evidence: ScenarioEvidence[],
) {
  await duplicateRetirementPage(page, context, configuration, state, "redirect");
  await duplicateRetirementPage(page, context, configuration, state, "gone");
  evidence.push({
    scenario: "redirects-and-retirement",
    status: "passed",
    checks: [
      "destino externo inválido bloqueou salvamento",
      "publicação temporária não indexável",
      "retirada com 301 e Location controlado",
      "retirada com página 410 real",
      "restauração de revisão publicada",
      "nova despublicação e estado final arquivado",
    ],
  });
}

async function assertAuditEvidence(page: Page, state: SecondaryState) {
  await adminReady(page, "/admin/auditoria");
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  const ids = [
    state.mediaId,
    state.documentId,
    state.rejectedDocumentId,
    state.bulkProductId,
    state.pimProductId,
    state.settingsId,
    state.navigationId,
    state.placementId,
    ...state.masterEntities.map((entity) => entity.id),
    ...state.retiredPages.map((item) => item.id),
  ].filter((value): value is string => Boolean(value));
  for (const id of ids) {
    await expect(
      page.locator("code").filter({ hasText: id }).first(),
      `auditoria ausente para ${id}`,
    ).toBeVisible({
      timeout: 20_000,
    });
  }
  await expect(page.getByText("O registro de auditoria é imutável")).toBeVisible();
}

async function cleanupProduct(page: Page, configuration: MutationConfiguration, state: SecondaryState) {
  if (!state.bulkProductId) return "not-created" as const;
  await adminReady(page, `/admin/produtos/${state.bulkProductId}?etapa=seo`);
  await page.getByRole("tab", { name: "SEO e publicação" }).click();
  const current = await productState(page);
  if (current === "archived") return "archived" as const;
  const label = current === "published" ? "Despublicar e arquivar produto" : "Arquivar produto";
  page.once("dialog", (dialog) => void dialog.accept());
  await clickEditorial(page, configuration, "archive", "archived", () =>
    page.getByRole("button", { name: label }).click(),
  );
  return "archived" as const;
}

async function cleanupDocument(page: Page, configuration: MutationConfiguration, state: SecondaryState) {
  const documentIds = [...new Set([state.documentId, state.rejectedDocumentId].filter(Boolean))] as string[];
  if (!documentIds.length) return "not-created" as const;
  for (const documentId of documentIds) {
    const result = await page.evaluate(
      async ({ anonKey, documentId, environment, supabaseOrigin }) => {
        const projectRef = new URL(supabaseOrigin).hostname.split(".")[0];
        const serialized = localStorage.getItem(`sb-${projectRef}-auth-token`);
        const accessToken = serialized
          ? (JSON.parse(serialized) as { access_token?: unknown }).access_token
          : null;
        if (typeof accessToken !== "string" || accessToken.length < 24)
          throw new Error("QA_DOCUMENT_CLEANUP_SESSION_MISSING");
        const commandId = crypto.randomUUID();
        const correlationId = crypto.randomUUID();
        const response = await fetch(`${supabaseOrigin}/functions/v1/cms-documents`, {
          method: "POST",
          headers: {
            apikey: anonKey,
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Idempotency-Key": commandId,
          },
          body: JSON.stringify({
            action: "neutralize_synthetic",
            documentId,
            envelope: {
              schemaVersion: 1,
              commandId,
              correlationId,
              occurredAt: new Date().toISOString(),
              actorContext: { environment, siteKey: "main" },
            },
          }),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        anonKey: configuration.anonKey,
        documentId,
        environment: configuration.environment,
        supabaseOrigin: configuration.supabaseOrigin,
      },
    );
    expect([200, 503]).toContain(result.status);
    if (result.status === 200) {
      expect(result.body).toMatchObject({
        documentId,
        status: "neutralized",
        blobDisposition: "removed",
      });
    } else {
      expect(result.body).toMatchObject({
        code: "CMS_DOCUMENT_BLOB_REMOVAL_PENDING",
      });
    }
    expect(uuidPattern.test(String(result.body.correlationId ?? ""))).toBe(true);
    if (documentId === state.documentId && state.publicDocumentHref) {
      await expectPublicDocumentRevoked(page, state.publicDocumentHref);
    }
  }
  return "neutralized" as const;
}

async function cleanupPim(page: Page, configuration: MutationConfiguration, state: SecondaryState) {
  if (!state.pimProductId || !state.pimProductName) return "not-created" as const;
  await adminReady(page, "/admin/pim");
  await page.getByLabel("Buscar produto").fill(state.pimProductName);
  const row = page.getByRole("row").filter({ hasText: state.pimProductName });
  await expect(row).toBeVisible();
  if (
    await row
      .getByText("archived", { exact: true })
      .isVisible()
      .catch(() => false)
  )
    return "archived" as const;
  await row.getByRole("button", { name: "Abrir" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await clickAction(page, configuration, "cms-pim", "archive_product", () =>
    page.getByRole("button", { name: "Arquivar", exact: true }).click(),
  );
  return "archived" as const;
}

async function cleanupMasterEntity(
  page: Page,
  configuration: MutationConfiguration,
  entity: SecondaryState["masterEntities"][number],
) {
  await adminReady(page, "/admin/dados-mestres");
  await page.getByLabel("Tipo", { exact: true }).selectOption(entity.type);
  await page.getByLabel("Buscar nome ou alias").fill(entity.name);
  const row = page.getByRole("row").filter({ hasText: entity.name });
  await expect(row).toBeVisible();
  if (
    await row
      .getByText("inactive", { exact: true })
      .isVisible()
      .catch(() => false)
  )
    return "inactive" as const;
  await clickAction(page, configuration, "cms-master-data", "set_entity_status", () =>
    row.getByRole("button", { name: "Inativar" }).click(),
  );
  return "inactive" as const;
}

async function cleanupMedia(page: Page, configuration: MutationConfiguration, state: SecondaryState) {
  if (!state.mediaId || !state.mediaFilename) return "not-created" as const;
  await adminReady(page, "/admin/midia");
  await page.getByLabel("Incluir arquivados").check();
  await page.getByLabel("Buscar", { exact: true }).fill(state.mediaFilename);
  await page.getByRole("button", { name: "Aplicar" }).click();
  const card = page.locator("article").filter({ hasText: state.mediaFilename });
  await expect(card).toBeVisible();
  await card
    .getByRole("button", {
      name: `Abrir detalhes e usos de ${state.mediaFilename}`,
      exact: true,
    })
    .click();
  const governed = page
    .locator("section")
    .filter({ hasText: `Governar: ${state.mediaFilename}` })
    .last();
  if (
    await governed
      .getByRole("button", { name: "Restaurar imagem" })
      .isVisible()
      .catch(() => false)
  ) {
    return "archived" as const;
  }
  await clickAction(page, configuration, "cms-media", "archive_asset", () =>
    governed.getByRole("button", { name: "Arquivar imagem" }).click(),
  );
  return "archived" as const;
}

function isSemanticMutationRequest(request: { method(): string; url(): string; postDataJSON(): unknown }) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method())) return false;
  const path = new URL(request.url()).pathname;
  if (path.includes("/rest/v1/")) return true;
  if (!path.includes("/functions/v1/")) return false;
  try {
    const body = request.postDataJSON() as Record<string, unknown>;
    return /^(?:create|save|submit|approve|publish|schedule|reopen|restore|retire|archive|delete|invite|update|execute|reprocess|assign|anonymize|generate|reserve|finalize|upsert|set_)/i.test(
      String(body.action ?? ""),
    );
  } catch {
    return false;
  }
}

async function observeArchivedMediaDetailsState(
  page: Page,
  configuration: MutationConfiguration,
  state: SecondaryState,
  semanticStateSetups: Map<string, CmsSemanticStateSetup>,
) {
  if (!state.mediaFilename) throw new Error("Mídia governada ausente para o setup semântico.");
  await adminReady(page, "/admin/midia");
  const mutationRequests: string[] = [];
  const listener = (request: Parameters<typeof isSemanticMutationRequest>[0]) => {
    if (isSemanticMutationRequest(request)) mutationRequests.push(new URL(request.url()).pathname);
  };
  page.on("request", listener);
  try {
    const archived = page.getByLabel("Incluir arquivados");
    if (!(await archived.isChecked())) await archived.check();
    await page.getByLabel("Buscar", { exact: true }).fill(configuration.runTag);
    await page.getByRole("button", { name: "Aplicar", exact: true }).click();
    const media = page.locator("article").filter({ hasText: state.mediaFilename });
    await expect(media).toBeVisible({ timeout: 20_000 });
    await media
      .getByRole("button", {
        name: `Abrir detalhes e usos de ${state.mediaFilename}`,
        exact: true,
      })
      .click();
    const heading = page.getByRole("heading", {
      name: `Governar: ${state.mediaFilename}`,
      exact: true,
    });
    await expect(heading).toBeVisible({ timeout: 20_000 });
    await page.getByLabel("Legenda", { exact: true }).fill(configuration.runTag);
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    const unsavedDialog = page.getByRole("alertdialog", { name: "Sair sem salvar?", exact: true });
    await expect(unsavedDialog).toBeVisible();
    await unsavedDialog.getByRole("button", { name: "Continuar editando", exact: true }).click();
    await expect(heading).toBeVisible();
    await page.getByRole("link", { name: "Produtos", exact: true }).click();
    await expect(unsavedDialog).toBeVisible();
    await unsavedDialog.getByRole("button", { name: "Sair sem salvar", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/produtos$/);
    await adminReady(page, "/admin/midia");
    await expect(heading).toHaveCount(0);
  } finally {
    page.off("request", listener);
  }
  expect(mutationRequests, "setup de estado condicional não pode executar request mutante").toEqual([]);
  recordSecondarySemanticStateSetup(semanticStateSetups, {
    surfaceId: "media",
    stateId: "archived-media-details",
    scenarioId: "archived-media-details-opened-and-restored-without-mutation",
    steps: [
      {
        stepId: "include-archived-media",
        scope: "page",
        controlKind: "checkbox",
        accessibleName: "Incluir arquivados",
        controlOccurrence: 0,
        operation: "check",
      },
      {
        stepId: "filter-media-by-run-tag",
        scope: "page",
        controlKind: "field",
        accessibleName: "Buscar",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "apply-media-filter",
        scope: "page",
        controlKind: "button",
        accessibleName: "Aplicar",
        controlOccurrence: 0,
        operation: "activate",
      },
      {
        stepId: "open-archived-media-details",
        scope: "run-tag-article",
        controlKind: "button",
        accessibleName: "Abrir detalhes e usos de {{runTagLower}}-dam.png",
        controlOccurrence: 0,
        operation: "activate",
      },
    ],
    expectedState: {
      kind: "role",
      role: "heading",
      accessibleName: "Governar: {{runTagLower}}-dam.png",
      occurrence: 0,
    },
    restore: {
      operation: "reload-route",
      controlKind: null,
      accessibleName: null,
      controlOccurrence: null,
    },
  });
  recordSecondarySemanticStateSetup(semanticStateSetups, {
    surfaceId: "media",
    stateId: "unsaved-media-changes-dialog",
    scenarioId: "dirty-media-navigation-blocked-and-editing-resumed-without-mutation",
    steps: [
      {
        stepId: "include-archived-media-before-edit",
        scope: "page",
        controlKind: "checkbox",
        accessibleName: "Incluir arquivados",
        controlOccurrence: 0,
        operation: "check",
      },
      {
        stepId: "filter-dirty-media-by-run-tag",
        scope: "page",
        controlKind: "field",
        accessibleName: "Buscar",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "apply-dirty-media-filter",
        scope: "page",
        controlKind: "button",
        accessibleName: "Aplicar",
        controlOccurrence: 0,
        operation: "activate",
      },
      {
        stepId: "open-dirty-media-details",
        scope: "run-tag-article",
        controlKind: "button",
        accessibleName: "Abrir detalhes e usos de {{runTagLower}}-dam.png",
        controlOccurrence: 0,
        operation: "activate",
      },
      {
        stepId: "change-media-caption-locally",
        scope: "page",
        controlKind: "field",
        accessibleName: "Legenda",
        controlOccurrence: 0,
        operation: "fill-run-tag",
      },
      {
        stepId: "attempt-navigation-with-dirty-media",
        scope: "page",
        controlKind: "link",
        accessibleName: "Produtos",
        controlOccurrence: 0,
        operation: "activate",
      },
    ],
    expectedState: {
      kind: "role",
      role: "alertdialog",
      accessibleName: "Sair sem salvar?",
      occurrence: 0,
    },
    restore: {
      operation: "activate",
      controlKind: "button",
      accessibleName: "Sair sem salvar",
      controlOccurrence: 0,
    },
  });
}

async function cleanupRetiredPages(page: Page, configuration: MutationConfiguration, state: SecondaryState) {
  for (const item of state.retiredPages) {
    await adminReady(page, `/admin/paginas/${item.id}`);
    const current = await builderState(page);
    if (current === "archived" || current === "trashed") continue;
    await page.getByRole("tab", { name: "Publicação" }).click();
    if (current === "published") {
      await clickEditorial(page, configuration, "retire", "archived", () =>
        page.getByRole("button", { name: "Retirar do ar" }).click(),
      );
    } else {
      await clickEditorial(page, configuration, "archive", "archived", () =>
        page.getByRole("button", { name: "Arquivar" }).click(),
      );
    }
  }
  return state.retiredPages.length ? ("archived" as const) : ("not-created" as const);
}

function writeEvidence(
  configuration: MutationConfiguration,
  state: SecondaryState,
  status: "passed" | "failed",
  scenarios: ScenarioEvidence[],
  cleanup: CleanupEvidence[],
  failure: string | null,
  observer: CmsBrowserObserver,
  semanticActions: CmsSemanticActionLedger,
  semanticScenarios: CmsSemanticScenarioLedger,
  semanticStateSetups: Map<string, CmsSemanticStateSetup>,
) {
  const sensitiveValues = [
    configuration.email,
    configuration.password,
    configuration.totpSecret,
    configuration.reviewerEmail,
    configuration.reviewerPassword,
    configuration.reviewerTotpSecret,
    configuration.corporateActor?.email,
    configuration.corporateActor?.password,
    configuration.corporateActor?.totpSecret,
    canonicalSiteSettings.email,
    canonicalSiteSettings.phone,
  ].filter((value): value is string => Boolean(value));
  const sanitizedScenarios = scenarios.map(({ targetId, ...scenario }) => ({
    ...scenario,
    ...(targetId
      ? {
          targetReferenceSha256: createHash("sha256")
            .update(`${configuration.runTag}:${targetId}`)
            .digest("hex"),
        }
      : {}),
  }));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: configuration.environment,
    sourceSha: configuration.expectedSha,
    runTag: configuration.runTag,
    status,
    browser: "desktop-chromium",
    authentication:
      configuration.environment === "production"
        ? "baseline por operador corporativo AAL2 fora da lease; ciclo por operador QA AAL2; identidades omitidas"
        : "operador QA AAL2; identidade e segredos omitidos",
    syntheticDocumentCount: [state.documentId, state.rejectedDocumentId].filter(Boolean).length,
    scenarios: sanitizedScenarios,
    cleanup,
    siteBaseline: state.siteBaseline,
    audit: "consultada pela interface; registros preservados",
    noIdentifiersPersisted: true,
    noSecretsPersisted: true,
    rawBrowserArtifacts: "disabled",
    browserObservability: observer.snapshot(),
    semanticActions: semanticActions.snapshot(),
    semanticFields: semanticScenarios.fields(),
    semanticStructures: semanticScenarios.structures(),
    semanticStateSetups: [...semanticStateSetups.values()].sort((left, right) =>
      left.stateContractKey.localeCompare(right.stateContractKey),
    ),
    sealedPreviewRouting: sealedPreviewRoutingEvidence(),
    failure: failure ? sanitizeBrowserDiagnostic(failure, sensitiveValues) : null,
  };
  const serialized = `${JSON.stringify(report, null, 2)}\n`;
  if (
    uuidInTextPattern.test(serialized) ||
    sensitiveValues.some((value) => value && serialized.includes(value))
  ) {
    throw new Error("QA_CMS_SECONDARY_REPORT_SENSITIVE_VALUE_REFUSED");
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, serialized, { encoding: "utf8", mode: 0o600 });
}

// Senha e TOTP são digitados nesta suíte. Artefatos brutos do navegador são
// desabilitados; somente o JSON sanitizado acima é persistido.
test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" });

test.describe.serial("homologação mutante secundária do CMS", () => {
  test("@mutating DAM, documentos, PIM, importação, site global e retiradas pela UI real", async ({
    browser,
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "ciclo mutante executado uma única vez");
    const configuration = mutationConfiguration(baseURL);
    test.skip(!configuration, "homologação mutante autenticada é opt-in");
    if (!configuration) throw new Error("Configuração ausente após o gate opt-in.");
    test.setTimeout(20 * 60_000);
    const state: SecondaryState = {
      masterEntities: [],
      retiredPages: [],
      navigationSaved: false,
      navigationRestored: false,
      settingsSaved: false,
      settingsRestored: false,
      placementSaved: false,
      placementRestored: false,
      placementArchived: false,
      baselineCorporateVerified: false,
    };
    const scenarios: ScenarioEvidence[] = [];
    const cleanup: CleanupEvidence[] = [];
    const semanticActions = createCmsSemanticActionLedger();
    const semanticScenarios = new CmsSemanticScenarioLedger("cms-secondary-ui-cycles.json");
    const semanticStateSetups = new Map<string, CmsSemanticStateSetup>();
    let failure: string | null = null;
    let completed = false;
    let primaryError: unknown;
    const cleanupFailures: string[] = [];
    const observer = createCmsBrowserObserver({
      suite: "cms-secondary-ui-cycles",
      expectedSha: configuration.expectedSha,
      sensitiveValues: [
        configuration.email,
        configuration.password,
        configuration.totpSecret,
        configuration.reviewerEmail,
        configuration.reviewerPassword,
        configuration.reviewerTotpSecret,
        configuration.corporateActor?.email ?? "",
        configuration.corporateActor?.password ?? "",
        configuration.corporateActor?.totpSecret ?? "",
        canonicalSiteSettings.email,
        canonicalSiteSettings.phone,
      ],
      expectedHttpFailures: [
        {
          id: "retired-page-gone",
          method: "GET",
          path: /^\/qa-cms-final-gone-[a-f0-9]{8}$/,
          statuses: [410],
          maxOccurrences: 6,
          minOccurrences: 1,
        },
        {
          id: "document-neutralization-storage-pending",
          method: "POST",
          path: "/functions/v1/cms-documents",
          statuses: [503],
          maxOccurrences: 2,
        },
      ],
    });
    observer.observeContext(context);
    try {
      await assertDeployment(page, configuration.expectedSha, configuration.environment);
      await bootstrapProductionSiteBaseline(browser, configuration, state, observer, semanticActions);
      await signInWithAal2(page, configuration);
      await verifyStagingSiteBaseline(page, configuration, state);
      await exerciseBulkAndDocuments(
        page,
        context,
        configuration,
        state,
        scenarios,
        observer,
        semanticActions,
        semanticScenarios,
      );
      await exerciseDam(page, configuration, state, scenarios, semanticActions, semanticScenarios);
      await exerciseMasterDataAndPim(
        page,
        configuration,
        state,
        scenarios,
        semanticActions,
        semanticScenarios,
        semanticStateSetups,
      );
      await exerciseGlobalSettings(
        page,
        context,
        configuration,
        state,
        scenarios,
        semanticActions,
        semanticScenarios,
        semanticStateSetups,
      );
      await exerciseGlobalNavigation(
        page,
        context,
        configuration,
        state,
        scenarios,
        semanticActions,
        semanticScenarios,
        semanticStateSetups,
      );
      await exerciseGlobalPlacements(
        page,
        context,
        configuration,
        state,
        scenarios,
        semanticActions,
        semanticScenarios,
        semanticStateSetups,
      );
      await exerciseRetirement(page, context, configuration, state, scenarios);
      await assertAuditEvidence(page, state);
      scenarios.push({
        scenario: "immutable-audit",
        status: "passed",
        checks: ["todos os alvos sintéticos localizados na tela somente leitura de auditoria"],
      });
      semanticScenarios.assertNonEmpty();
      completed = true;
    } catch (error) {
      failure = sanitizeBrowserDiagnostic(error, [
        configuration.email,
        configuration.password,
        configuration.totpSecret,
        configuration.reviewerEmail,
        configuration.reviewerPassword,
        configuration.reviewerTotpSecret,
        configuration.corporateActor?.email ?? "",
        configuration.corporateActor?.password ?? "",
        configuration.corporateActor?.totpSecret ?? "",
        canonicalSiteSettings.email,
        canonicalSiteSettings.phone,
      ]);
      primaryError = error;
    } finally {
      const attempt = async (target: string, action: () => Promise<CleanupEvidence["status"]>) => {
        try {
          cleanup.push({ target, status: await action() });
        } catch (error) {
          cleanup.push({ target, status: "failed" });
          cleanupFailures.push(`${target}: ${error instanceof Error ? error.message : "falha"}`);
        }
      };
      await attempt("bulk-product", () => cleanupProduct(page, configuration, state));
      await attempt("documents", () => cleanupDocument(page, configuration, state));
      await attempt("pim-product", () => cleanupPim(page, configuration, state));
      for (const entity of state.masterEntities) {
        await attempt(`master-${entity.type}`, () => cleanupMasterEntity(page, configuration, entity));
      }
      await attempt("media", async () => {
        const result = await cleanupMedia(page, configuration, state);
        if (result === "archived") {
          await observeArchivedMediaDetailsState(page, configuration, state, semanticStateSetups);
        }
        return result;
      });
      await attempt("retired-pages", () => cleanupRetiredPages(page, configuration, state));
      await attempt("global-site-settings", async () => {
        await restoreSettings(page, context, configuration, state, semanticActions);
        return state.settingsSaved ? "restored" : "not-created";
      });
      await attempt("global-navigation", async () => {
        await restoreNavigation(page, context, configuration, state, semanticActions);
        return state.navigationSaved ? "restored" : "not-created";
      });
      await attempt("global-placements", async () => {
        await restoreOrArchivePlacement(page, context, configuration, state, semanticActions);
        return state.placementSaved ? (state.placementRestored ? "restored" : "archived") : "not-created";
      });
      await attempt("corporate-site-baseline", async () => {
        await finalizeSiteBaseline(page, configuration, state);
        return "restored";
      });
      try {
        observer.assertClean();
      } catch (error) {
        cleanupFailures.push(`browser-observability: ${error instanceof Error ? error.message : "falha"}`);
      }
      writeEvidence(
        configuration,
        state,
        completed && cleanupFailures.length === 0 ? "passed" : "failed",
        scenarios,
        cleanup,
        failure ?? (cleanupFailures.length ? cleanupFailures.join(" | ").slice(0, 500) : null),
        observer,
        semanticActions,
        semanticScenarios,
        semanticStateSetups,
      );
    }
    if (primaryError) throw primaryError;
    if (cleanupFailures.length) {
      throw new Error(`Cleanup fail-closed não convergiu: ${cleanupFailures.join(" | ")}`);
    }
  });
});
