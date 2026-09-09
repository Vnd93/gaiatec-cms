import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCmsBrowserObserver, type CmsBrowserObserver } from "./cms-browser-observer";
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
import {
  cmsRealBrowserEvidenceSummary,
  loadCmsRealBrowserAttestation,
  selectSingleAttestedLead,
} from "./cms-real-browser-attestation";

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await installSealedPreviewRouting(context);
});
test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) assertSealedPreviewRoutingUsed(context);
});

type TargetEnvironment = "staging" | "production";

type ActorCredentials = {
  email: string;
  password: string;
  totpSecret: string;
};

type Configuration = {
  enabled: true;
  environment: TargetEnvironment;
  expectedSha: string;
  runTag: string;
  supabaseOrigin: string;
  anonKey: string;
  managedUserId: string;
  existingIdentityUserId: string;
  leadReference: string;
  leadStatus: string;
  leadCampaignPath: string;
  operator: ActorCredentials;
  reviewer: ActorCredentials;
  existingIdentity: ActorCredentials;
};

type ScenarioEvidence = {
  id: string;
  status: "passed";
  backend: string;
  audit: string;
  negative?: string;
  cleanup?: string;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = resolve(
  repositoryRoot,
  process.env.QA_CMS_ADMIN_OPS_REPORT_PATH ?? "outputs/cms-admin-ops-cycles.json",
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

function optionalConfiguration(baseURL: string | undefined): { enabled: false } | Configuration {
  if (process.env.QA_CMS_REQUIRE_AUTHENTICATED !== "true") return { enabled: false };
  const environment = process.env.QA_CMS_TARGET_ENVIRONMENT;
  if (environment !== "staging" && environment !== "production") {
    throw new Error("QA_CMS_TARGET_ENVIRONMENT precisa identificar staging ou production.");
  }
  const values = {
    expectedSha: process.env.QA_CMS_EXPECTED_SHA,
    runTag: process.env.QA_CMS_RUN_TAG,
    supabaseUrl: process.env.QA_CMS_SUPABASE_URL,
    anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY,
    managedUserId: process.env.QA_CMS_MANAGED_USER_ID,
    existingIdentityUserId: process.env.QA_CMS_EXISTING_IDENTITY_USER_ID,
    operatorEmail: process.env.QA_CMS_EMAIL,
    operatorPassword: process.env.QA_CMS_PASSWORD,
    operatorTotp: process.env.QA_CMS_TOTP_SECRET,
    reviewerEmail: process.env.QA_CMS_REVIEWER_EMAIL,
    reviewerPassword: process.env.QA_CMS_REVIEWER_PASSWORD,
    reviewerTotp: process.env.QA_CMS_REVIEWER_TOTP_SECRET,
    existingIdentityEmail: process.env.QA_CMS_EXISTING_IDENTITY_EMAIL,
    existingIdentityPassword: process.env.QA_CMS_EXISTING_IDENTITY_PASSWORD,
    existingIdentityTotp: process.env.QA_CMS_EXISTING_IDENTITY_TOTP_SECRET,
  };
  const missing = Object.entries(values)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length) {
    throw new Error(`Fixture operacional incompleto; ausências: ${missing.join(", ")}.`);
  }
  const expected = targets[environment];
  const deployed = new URL(baseURL ?? "https://invalid.invalid");
  const backend = new URL(values.supabaseUrl!);
  if (
    deployed.origin !== expected.site ||
    deployed.pathname !== "/" ||
    backend.origin !== expected.supabase ||
    backend.pathname !== "/"
  ) {
    throw new Error("O ciclo administrativo recusou uma origem diferente do alvo canônico.");
  }
  if (!/^[0-9a-f]{40}$/.test(values.expectedSha!)) throw new Error("SHA de homologação inválido.");
  if (!/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(values.runTag!)) {
    throw new Error("Marcador sintético de homologação inválido.");
  }
  if (!uuidPattern.test(values.managedUserId!)) throw new Error("Ator gerenciado inválido.");
  if (!uuidPattern.test(values.existingIdentityUserId!)) {
    throw new Error("Identidade Auth existente sintética inválida.");
  }
  const createdState = loadCmsUiCreatedState({
    repositoryRoot,
    expectedEnvironment: environment,
    expectedSha: values.expectedSha!,
    expectedRunTag: values.runTag!,
  });
  if (createdState.lead.status === "new") {
    throw new Error("O lead de handoff precisa estar em um status isolado diferente de new.");
  }
  if (environment === "production") {
    const authorization = `AUTORIZO-G12-PRODUCAO:${values.expectedSha}`;
    if (process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== authorization) {
      throw new Error("Produção exige autorização literal vinculada ao SHA final.");
    }
  }
  return {
    enabled: true,
    environment,
    expectedSha: values.expectedSha!,
    runTag: values.runTag!,
    supabaseOrigin: backend.origin,
    anonKey: values.anonKey!,
    managedUserId: values.managedUserId!,
    existingIdentityUserId: values.existingIdentityUserId!,
    leadReference: createdState.lead.reference,
    leadStatus: createdState.lead.status,
    leadCampaignPath: createdState.lead.campaignPath,
    operator: {
      email: values.operatorEmail!,
      password: values.operatorPassword!,
      totpSecret: values.operatorTotp!,
    },
    reviewer: {
      email: values.reviewerEmail!,
      password: values.reviewerPassword!,
      totpSecret: values.reviewerTotp!,
    },
    existingIdentity: {
      email: values.existingIdentityEmail!,
      password: values.existingIdentityPassword!,
      totpSecret: values.existingIdentityTotp!,
    },
  };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("Segredo TOTP do fixture inválido.");
  }
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string): string {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Bytes(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

async function signInWithAal2(page: Page, credentials: ActorCredentials, expectedSha: string) {
  const response = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(response?.headers()["x-release"]).toBe(expectedSha);
  await page.getByLabel("E-mail corporativo").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  await expect(page.getByRole("heading", { name: "Ativar verificação em duas etapas" })).toHaveCount(0);
  const stepPosition = Date.now() % 30_000;
  if (stepPosition > 27_000) await page.waitForTimeout(31_000 - stepPosition);
  await page.getByLabel("Código de 6 dígitos").fill(totp(credentials.totpSecret));
  await page.getByRole("button", { name: "Verificar e entrar" }).click();
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/admin(?:\/?|\?.*)$/);
}

async function signInWithoutCmsProfile(page: Page, credentials: ActorCredentials, expectedSha: string) {
  const response = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(response?.headers()["x-release"]).toBe(expectedSha);
  await page.getByLabel("E-mail corporativo").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  const sessionResolution = waitForEdgeAction(page, "cms-session", "resolve");
  await page.getByRole("button", { name: "Entrar" }).click();
  const denied = await sessionResolution;
  expect(denied.status()).toBe(403);
  const body = (await denied.json().catch(() => null)) as Record<string, unknown> | null;
  expect(body?.error).toBe("Conta sem acesso administrativo ativo.");
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Acesso administrativo não autorizado" })).toBeVisible();
  await expect(page.getByText("O acesso ao RDO não concede acesso administrativo.")).toBeVisible();
}

async function expectCmsAccessDeniedAfterAuthentication(
  page: Page,
  credentials: ActorCredentials,
  expectedSha: string,
) {
  const response = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(response?.headers()["x-release"]).toBe(expectedSha);
  await page.getByLabel("E-mail corporativo").fill(credentials.email);
  await page.getByLabel("Senha").fill(credentials.password);
  const sessionResolution = waitForEdgeAction(page, "cms-session", "resolve");
  await page.getByRole("button", { name: "Entrar" }).click();
  const denied = await sessionResolution;
  expect(denied.status()).toBe(403);
  const body = (await denied.json().catch(() => null)) as Record<string, unknown> | null;
  expect(body?.error).toBe("Conta sem acesso administrativo ativo.");
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Acesso administrativo não autorizado" })).toBeVisible();
}

async function expectSuspendedSessionStillDeniedAfterReactivation(page: Page) {
  const prepared = await page.evaluate(() => {
    const authEntry = Object.entries(localStorage).find(([key]) => key.endsWith("-auth-token"));
    const stored = authEntry ? (JSON.parse(authEntry[1]) as Record<string, unknown>) : null;
    if (!authEntry || !stored || typeof stored.refresh_token !== "string") {
      throw new Error("suspended-browser-session-unavailable");
    }
    stored.expires_at = Math.floor(Date.now() / 1000) - 60;
    stored.expires_in = 0;
    localStorage.setItem(authEntry[0], JSON.stringify(stored));
    return true;
  });
  expect(prepared).toBe(true);
  const refreshed = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname.endsWith("/auth/v1/token") &&
        url.searchParams.get("grant_type") === "refresh_token"
      );
    },
    { timeout: 30_000 },
  );
  const cmsResolution = waitForEdgeAction(page, "cms-session", "resolve");
  await page.reload({ waitUntil: "domcontentloaded" });
  expect((await refreshed).status()).toBe(200);
  expect((await cmsResolution).status()).toBe(403);
  await expect(page.getByRole("heading", { name: "Acesso administrativo não autorizado" })).toBeVisible();
}

function waitForEdgeAction(page: Page, functionName: string, action: string) {
  return page.waitForResponse(
    (response) => {
      let body: unknown;
      try {
        body = response.request().postDataJSON();
      } catch {
        return false;
      }
      return (
        new URL(response.url()).pathname.endsWith(`/functions/v1/${functionName}`) &&
        response.request().method() === "POST" &&
        Boolean(body && typeof body === "object" && (body as Record<string, unknown>).action === action)
      );
    },
    { timeout: 30_000 },
  );
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  expect(response.status(), `HTTP inesperado em ${new URL(response.url()).pathname}`).toBeLessThan(300);
  expect(body).not.toBeNull();
  return body!;
}

function cmsCommandEnvelope(configuration: Configuration) {
  return {
    schemaVersion: 1 as const,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: configuration.environment, siteKey: "main" as const },
  };
}

async function browserApi(
  page: Page,
  configuration: Configuration,
  path: string,
  init: { method?: "GET" | "POST"; body?: Record<string, unknown>; idempotent?: boolean } = {},
) {
  return page.evaluate(
    async ({ anonKey, endpoint, init }) => {
      const authEntry = Object.entries(localStorage).find(([key]) => key.endsWith("-auth-token"));
      const stored = authEntry ? (JSON.parse(authEntry[1]) as Record<string, unknown>) : null;
      const token = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!token) throw new Error("authenticated-browser-session-unavailable");
      const response = await fetch(endpoint, {
        method: init.method ?? "GET",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${token}`,
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.idempotent ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
    {
      anonKey: configuration.anonKey,
      endpoint: `${configuration.supabaseOrigin}${path}`,
      init,
    },
  );
}

async function managedUserRow(page: Page, runTag: string) {
  const row = page
    .getByRole("row")
    .filter({ hasText: `Revisor QA gerenciado ${runTag}` })
    .first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  return row;
}

async function existingIdentityRow(page: Page, runTag: string) {
  const rows = page.getByRole("row").filter({ hasText: `Identidade Auth/RDO existente QA ${runTag}` });
  await expect(rows).toHaveCount(1, { timeout: 20_000 });
  return rows.first();
}

async function ownRdoAccess(page: Page, configuration: Configuration) {
  const response = await browserApi(
    page,
    configuration,
    `/rest/v1/rdo_user_access?select=user_id,role,active,invited_by,invited_at,suspended_at,suspended_by,updated_at&user_id=eq.${configuration.existingIdentityUserId}`,
  );
  expect(response.status).toBe(200);
  expect(Array.isArray(response.body)).toBe(true);
  expect(response.body).toHaveLength(1);
  const row = (response.body as Array<Record<string, unknown>>)[0]!;
  expect(row).toMatchObject({
    user_id: configuration.existingIdentityUserId,
    role: "rdo_member",
    active: true,
    suspended_at: null,
    suspended_by: null,
  });
  return row;
}

async function confirmUserAction(
  page: Page,
  row: Awaited<ReturnType<typeof managedUserRow>>,
  name: string,
  action: string,
  ledger: CmsSemanticActionLedger,
  scenarioId: string,
): Promise<Record<string, unknown> & { __qaHttpStatus: number }> {
  const responsePromise = waitForEdgeAction(page, "cms-users", action);
  const control = row.getByRole("button", { name, exact: true });
  const controlOccurrence = await visibleButtonOccurrence(page, name, control);
  await control.click();
  await page.getByRole("button", { name: "Confirmar ação", exact: true }).click();
  const response = await responsePromise;
  const body = await responseBody(response);
  ledger.record({
    surfaceId: "users",
    controlName: name,
    controlOccurrence,
    action,
    scenarioId,
    backendStatus: String(body.status ?? action),
    httpStatus: response.status(),
  });
  return Object.assign(body, { __qaHttpStatus: response.status() });
}

async function executeAiPlanAction(
  page: Page,
  controlName: string,
  action: string,
  ledger: CmsSemanticActionLedger,
  scenarioId: string,
) {
  const control = page.getByRole("button", { name: controlName, exact: true });
  const controlOccurrence = await visibleButtonOccurrence(page, controlName, control);
  const responsePromise = waitForEdgeAction(page, "cms-ai-execute", action);
  await control.click();
  const response = await responsePromise;
  const body = await responseBody(response);
  ledger.record({
    surfaceId: "ai-execution",
    controlName,
    controlOccurrence,
    action,
    scenarioId,
    backendStatus: String(body.status ?? action),
    httpStatus: response.status(),
  });
  return { response, body };
}

async function visibleButtonOccurrence(page: Page, name: string, target: ReturnType<Page["getByRole"]>) {
  const targetHandle = await target.elementHandle();
  if (!targetHandle) throw new Error("QA_CMS_SEMANTIC_ACTION_CONTROL_MISSING");
  const candidates = page.getByRole("button", { name, exact: true });
  let occurrence = 0;
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    if (await candidate.evaluate((element, expected) => element === expected, targetHandle))
      return occurrence;
    occurrence += 1;
  }
  throw new Error("QA_CMS_SEMANTIC_ACTION_CONTROL_UNBOUND");
}

async function openLead(page: Page, reference: string) {
  const row = page.getByRole("row").filter({ hasText: reference }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Atender" }).click();
  const dialog = page.getByRole("dialog", { name: "Atendimento do lead", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function anonymizeOpenLead(
  page: Page,
  reference: string,
  reason: string,
  ledger: CmsSemanticActionLedger,
  scenarioId: string,
) {
  const dialog = page.getByRole("dialog", { name: "Atendimento do lead", exact: true });
  await dialog.getByLabel("Motivo").fill(reason);
  const responsePromise = waitForEdgeAction(page, "cms-leads", "anonymize_lead");
  const control = dialog.getByRole("button", { name: "Anonimizar conforme LGPD" });
  const controlOccurrence = await visibleButtonOccurrence(page, "Anonimizar conforme LGPD", control);
  await control.click();
  await page.getByRole("button", { name: "Anonimizar lead", exact: true }).click();
  const response = await responsePromise;
  const body = await responseBody(response);
  expect(body.status).toBe("anonymized");
  ledger.record({
    surfaceId: "leads",
    controlName: "Anonimizar conforme LGPD",
    controlOccurrence,
    action: "anonymize_lead",
    scenarioId,
    backendStatus: "anonymized",
    httpStatus: response.status(),
  });
  await expect(dialog).toHaveCount(0);
}

async function newIsolatedContext(browser: Browser, baseURL: string, observer: CmsBrowserObserver) {
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  await installSealedPreviewRouting(context);
  observer.observeContext(context);
  return context;
}

function safeFailure(error: unknown) {
  return (error instanceof Error ? error.message : String(error))
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,36}\b/gi, "[uuid]")
    .slice(0, 500);
}

function recordAdminSemanticStateSetup(
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
    evidenceReference: `cms-admin-ops-cycles.json#semanticStateSetups/${stateContractKey}`,
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

function recordPersistedAdminFields(
  ledger: CmsSemanticScenarioLedger,
  fields: CmsPreparedSemanticField[],
  httpStatus: number,
) {
  for (const field of fields) {
    ledger.recordField(field, {
      httpStatus,
      backendExpectedResult: "O backend deve aceitar exatamente o valor validado pela interface.",
      backendObservedResult: "A resposta 2xx confirmou o campo no comando governado.",
      persistence: {
        applicability: "exercised",
        expectedResult: "O valor aceito deve reaparecer após recarregar a fonte autoritativa.",
        observedResult: "O reload autoritativo preservou o valor ou seu efeito persistido.",
      },
      audit: {
        applicability: "exercised",
        expectedResult: "A alteração do campo deve constar na trilha imutável.",
        observedResult: "A consulta final da auditoria confirmou o evento governado.",
      },
    });
  }
}

function recordTransientAdminField(
  ledger: CmsSemanticScenarioLedger,
  field: CmsPreparedSemanticField,
  httpStatus: number,
  kind: "query" | "command",
  audited: boolean,
) {
  ledger.recordField(field, {
    httpStatus,
    backendExpectedResult: "O backend deve processar o valor transitório sem ampliar o escopo.",
    backendObservedResult: "A resposta 2xx confirmou o processamento no escopo controlado.",
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
          expectedResult: "O comando sensível deve registrar seu contexto na trilha imutável.",
          observedResult: "A consulta final da auditoria confirmou o comando sensível.",
        }
      : {
          applicability: "not-applicable",
          basisCode: "non-mutating-query-not-audited",
          justification: "A consulta não mutante é transitória e não gera evento de alteração auditável.",
          documentationReference: field.schemaReference,
        },
  });
}

async function observeMutationFreeState(
  page: Page,
  open: () => Promise<void>,
  expected: Locator,
  close: () => Promise<void>,
) {
  const mutations: string[] = [];
  const listener = (request: { method(): string; url(): string }) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      mutations.push(new URL(request.url()).pathname);
    }
  };
  page.on("request", listener);
  try {
    await open();
    await expect(expected).toBeVisible();
    await close();
    await expect(expected).toHaveCount(0);
  } finally {
    page.off("request", listener);
  }
  expect(mutations, "setup de estado condicional não pode executar request mutante").toEqual([]);
}

function writeEvidence(value: Record<string, unknown>) {
  const pathFromRoot = relative(repositoryRoot, evidencePath);
  if (
    !pathFromRoot ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..\\`) ||
    pathFromRoot.startsWith("../")
  ) {
    throw new Error("QA_CMS_ADMIN_OPS_REPORT_PATH precisa permanecer dentro do repositório.");
  }
  const serialized = `${JSON.stringify(
    { ...value, sealedPreviewRouting: sealedPreviewRoutingEvidence() },
    null,
    2,
  )}\n`;
  if (
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(serialized) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(serialized) ||
    /\b(?:eyJ[A-Za-z0-9_-]+\.|sbp_|sb_secret_|sk-or-)[A-Za-z0-9._-]{12,}/i.test(serialized)
  ) {
    throw new Error("QA_CMS_ADMIN_OPS_REPORT_SENSITIVE_VALUE_REFUSED");
  }
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, serialized, { encoding: "utf8", mode: 0o600 });
}

test.describe("CMS administrative operational cycles", () => {
  test("@mutating usuários, leads, outbox e IA completam ciclos reais com isolamento", async ({
    page,
    browser,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "ciclo mutante executado uma vez");
    const configuration = optionalConfiguration(baseURL);
    test.skip(!configuration.enabled, "fixture autenticado não habilitado");
    if (!configuration.enabled || !baseURL) throw new Error("Gate mutante inconsistente.");
    test.setTimeout(15 * 60_000);

    const scenarios: ScenarioEvidence[] = [];
    const semanticActions = createCmsSemanticActionLedger();
    const semanticScenarios = new CmsSemanticScenarioLedger("cms-admin-ops-cycles.json");
    const semanticStateSetups = new Map<string, CmsSemanticStateSetup>();
    const contexts: BrowserContext[] = [];
    let completion: "passed" | "failed" = "failed";
    let failure: string | null = null;
    let reviewerFinalState = "cleanup-pending";
    let existingIdentityFinalState = "cleanup-pending";
    let leadsFinalState = "cleanup-pending";
    let aiFinalState = "cleanup-pending";
    let positivePublicLead: Record<string, unknown> = { status: "not-run" };
    const observer = createCmsBrowserObserver({
      suite: "cms-admin-ops-cycles",
      expectedSha: configuration.expectedSha,
      sensitiveValues: [
        configuration.operator.email,
        configuration.operator.password,
        configuration.operator.totpSecret,
        configuration.reviewer.email,
        configuration.reviewer.password,
        configuration.reviewer.totpSecret,
        configuration.existingIdentity.email,
        configuration.existingIdentity.password,
        configuration.existingIdentity.totpSecret,
      ],
      expectedHttpFailures: [
        {
          id: "cms-profile-or-suspended-session-denied",
          method: "POST",
          path: "/functions/v1/cms-session",
          statuses: [401, 403],
          minOccurrences: 1,
          maxOccurrences: 8,
        },
        {
          id: "cms-users-negative-authorization",
          method: "POST",
          path: "/functions/v1/cms-users",
          statuses: [401, 403],
          minOccurrences: 1,
          maxOccurrences: 5,
        },
        {
          id: "revoked-ai-session-denied",
          method: "POST",
          path: "/functions/v1/cms-ai",
          statuses: [401, 403],
          minOccurrences: 1,
          maxOccurrences: 2,
        },
        {
          id: "ai-provider-controlled-unavailability",
          method: "POST",
          path: "/functions/v1/cms-ai",
          statuses: [503],
          maxOccurrences: 1,
          minOccurrences: 1,
        },
        {
          id: "reviewer-scoped-rest-boundary",
          method: "GET",
          path: /^\/rest\/v1\/(?:cms_leads|rdo_user_access)$/,
          statuses: [401, 403],
          minOccurrences: 1,
          maxOccurrences: 2,
        },
        {
          id: "terminal-or-active-outbox-cannot-be-replayed",
          method: "POST",
          path: "/functions/v1/cms-leads",
          statuses: [409],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "scoped-access-field-negative-cases",
          method: "POST",
          path: "/functions/v1/cms-scopes",
          statuses: [400, 422],
          minOccurrences: 4,
          maxOccurrences: 4,
        },
      ],
    });
    observer.observePage(page);

    try {
      const health = await sealedPreviewApiGet(page, "/healthz", {
        failOnStatusCode: false,
        headers: { "Cache-Control": "no-store" },
      });
      const healthBody = (await health.json().catch(() => null)) as Record<string, unknown> | null;
      expect(health.status()).toBe(200);
      expect(healthBody?.environment).toBe(sealedPreviewDeploymentEnvironment(configuration.environment));
      expect(healthBody?.release).toBe(configuration.expectedSha);
      expect(health.headers()["x-release"]).toBe(configuration.expectedSha);
      await signInWithAal2(page, configuration.operator, configuration.expectedSha);

      await page.goto("/admin/usuarios", { waitUntil: "domcontentloaded" });
      const preInviteContext = await newIsolatedContext(browser, baseURL, observer);
      contexts.push(preInviteContext);
      const preInvitePage = await preInviteContext.newPage();
      await signInWithoutCmsProfile(preInvitePage, configuration.existingIdentity, configuration.expectedSha);
      const rdoBaseline = await ownRdoAccess(preInvitePage, configuration);
      const unauthorizedCmsMutation = await browserApi(
        preInvitePage,
        configuration,
        "/functions/v1/cms-users",
        {
          method: "POST",
          body: {
            action: "set_roles",
            userId: configuration.existingIdentityUserId,
            roles: ["super_admin"],
            idempotencyKey: randomUUID(),
          },
        },
      );
      expect(unauthorizedCmsMutation.status).toBe(403);

      const invitedDisplayName = `Identidade Auth/RDO existente QA ${configuration.runTag}`;
      const inviteName = page.getByLabel("Nome", { exact: true });
      const inviteEmail = page.getByLabel("E-mail", { exact: true });
      await inviteName.fill(invitedDisplayName);
      await inviteEmail.fill(configuration.existingIdentity.email);
      const initialRoles = page.getByRole("group", { name: "Papéis iniciais" });
      const initialRoleControls = [
        { name: "Superadministrador", selected: true },
        { name: "Administrador", selected: false },
        { name: "Marketing", selected: false },
        { name: "Comercial", selected: false },
        { name: "Técnico", selected: false },
        { name: "Editor", selected: false },
        { name: "Revisor", selected: false },
      ] as const;
      for (const role of initialRoleControls) {
        await initialRoles.getByLabel(role.name, { exact: true }).setChecked(role.selected);
      }
      // `Papéis iniciais` is one source-backed checkbox template rendered once per role.
      // Exercise every rendered role above, but bind the semantic scenario once
      // to the template's persisted selected value so runtime data cannot inflate
      // terminal source cardinality.
      const inviteSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: inviteName,
          surfaceId: "users",
          fieldName: "Nome",
          scenarioId: "existing_auth_identity_cms_invite_aal2_rdo_isolation",
          schemaReference: "src/admin/pages/AdminUsersPage.tsx",
        }),
        prepareCmsSemanticField({
          page,
          locator: inviteEmail,
          surfaceId: "users",
          fieldName: "E-mail",
          scenarioId: "existing_auth_identity_cms_invite_aal2_rdo_isolation",
          schemaReference: "src/admin/pages/AdminUsersPage.tsx",
          invalid: {
            applicability: "exercise",
            value: "email-invalido",
            expectedResult: "A interface deve rejeitar endereço eletrônico sem formato válido.",
            observedResult: "A validação nativa recusou o formato inválido e preservou o formulário.",
          },
        }),
        prepareCmsSemanticField({
          page,
          locator: initialRoles.getByLabel("Superadministrador", { exact: true }),
          surfaceId: "users",
          fieldName: "Superadministrador",
          scenarioId: "existing_auth_identity_cms_invite_aal2_rdo_isolation",
          schemaReference: "src/admin/pages/AdminUsersPage.tsx",
          absence: { applicability: "optional" },
        }),
      ]);
      const inviteResponse = waitForEdgeAction(page, "cms-users", "invite");
      await page.getByRole("button", { name: "Enviar convite", exact: true }).click();
      const inviteHttpResponse = await inviteResponse;
      const inviteResult = await responseBody(inviteHttpResponse);
      expect(inviteResult).toMatchObject({
        status: "invited",
        userId: configuration.existingIdentityUserId,
        roles: ["super_admin"],
        invitationDelivery: "existing_identity",
      });
      semanticActions.record({
        surfaceId: "users",
        controlName: "Enviar convite",
        action: "invite",
        scenarioId: "existing_auth_identity_cms_invite_aal2_rdo_isolation",
        backendStatus: String(inviteResult.status),
        httpStatus: inviteHttpResponse.status(),
      });
      await expect(page.getByRole("alert")).toContainText(
        /Identidades existentes usam as credenciais atuais/,
      );
      let existingRow = await existingIdentityRow(page, configuration.runTag);
      await expect(existingRow).toContainText("invited");

      const existingContext = await newIsolatedContext(browser, baseURL, observer);
      contexts.push(existingContext);
      const existingPage = await existingContext.newPage();
      await signInWithAal2(existingPage, configuration.existingIdentity, configuration.expectedSha);
      const rdoAfterInvite = await ownRdoAccess(existingPage, configuration);
      expect(rdoAfterInvite).toEqual(rdoBaseline);
      await existingPage.goto("/admin/usuarios", { waitUntil: "domcontentloaded" });
      await expect(existingPage.getByRole("heading", { name: "Usuários e acessos" })).toBeVisible();

      await page.reload({ waitUntil: "domcontentloaded" });
      existingRow = await existingIdentityRow(page, configuration.runTag);
      await expect(existingRow).toContainText("active");
      await expect(existingRow).toContainText("MFA: configurado");
      recordPersistedAdminFields(semanticScenarios, inviteSemanticFields, inviteHttpResponse.status());
      semanticScenarios.recordStructure({
        surfaceId: "users",
        controlKind: "form",
        controlName: "Convidar usuário",
        scenarioId: "existing_auth_identity_cms_invite_aal2_rdo_isolation",
        effectKind: "backend-response",
        httpStatus: inviteHttpResponse.status(),
      });
      expect(await ownRdoAccess(existingPage, configuration)).toEqual(rdoBaseline);

      await page.reload({ waitUntil: "domcontentloaded" });
      existingRow = await existingIdentityRow(page, configuration.runTag);
      const existingRevoke = await confirmUserAction(
        page,
        existingRow,
        "Revogar sessões",
        "revoke_sessions",
        semanticActions,
        "existing_auth_identity_cms_invite_aal2_rdo_isolation",
      );
      expect(existingRevoke.status).toBe("sessions_revoked");
      const rejectedExistingSession = await browserApi(
        existingPage,
        configuration,
        "/functions/v1/cms-users",
        { method: "POST", body: { action: "list" } },
      );
      expect([401, 403]).toContain(rejectedExistingSession.status);
      existingRow = await existingIdentityRow(page, configuration.runTag);
      const existingSuspend = await confirmUserAction(
        page,
        existingRow,
        "Suspender",
        "suspend",
        semanticActions,
        "existing_auth_identity_cms_invite_aal2_rdo_isolation",
      );
      expect(existingSuspend.status).toBe("suspended");
      const suspendedExistingContext = await newIsolatedContext(browser, baseURL, observer);
      contexts.push(suspendedExistingContext);
      const suspendedExistingPage = await suspendedExistingContext.newPage();
      await expectCmsAccessDeniedAfterAuthentication(
        suspendedExistingPage,
        configuration.existingIdentity,
        configuration.expectedSha,
      );
      expect(await ownRdoAccess(suspendedExistingPage, configuration)).toEqual(rdoBaseline);
      existingIdentityFinalState =
        "identidade Auth existente convidada sem duplicação, sessões CMS revogadas e CMS suspenso sem alterar RDO";
      scenarios.push({
        id: "existing_auth_identity_cms_invite_aal2_rdo_isolation",
        status: "passed",
        backend: "identidade Auth reutilizada; perfil/papel CMS persistidos; ativação AAL2 confirmada",
        audit: "convite, ativação, revogação e suspensão preservados",
        negative:
          "RDO não concedeu CMS e permaneceu invariável após revogação e suspensão estritamente administrativas",
        cleanup: existingIdentityFinalState,
      });

      const scopedScenarioId = "scoped_rbac_grant_evaluate_revoke_regrant";
      const scopeReason = `${configuration.runTag} concessão temporária controlada.`;
      const scopeExpiry = new Date(Date.now() + 60 * 60_000).toISOString().slice(0, 16);
      const scopeGrantForm = page.getByRole("form", { name: "Nova concessão no escopo", exact: true });
      await expect(scopeGrantForm).toBeVisible({ timeout: 20_000 });
      const scopeTargetField = scopeGrantForm.getByLabel("Usuário", { exact: true });
      const scopeRoleField = scopeGrantForm.getByLabel("Papel no escopo", { exact: true });
      const scopeTypeField = scopeGrantForm.getByLabel("Tipo", { exact: true });
      const scopeReasonField = scopeGrantForm.getByLabel("Justificativa", { exact: true });
      await scopeTargetField.selectOption(configuration.managedUserId);
      await scopeRoleField.selectOption("reviewer");
      await scopeTypeField.selectOption("delegated");
      const scopeExpiryField = scopeGrantForm.getByLabel("Válida até", { exact: true });
      await scopeExpiryField.fill(scopeExpiry);
      await scopeReasonField.fill(scopeReason);

      const missingScopeRole = await browserApi(page, configuration, "/functions/v1/cms-scopes", {
        method: "POST",
        idempotent: true,
        body: {
          envelope: cmsCommandEnvelope(configuration),
          action: "grant",
          targetUserId: configuration.managedUserId,
          grantType: "direct",
          reason: scopeReason,
        },
      });
      expect(missingScopeRole.status).toBe(400);
      const missingScopeType = await browserApi(page, configuration, "/functions/v1/cms-scopes", {
        method: "POST",
        idempotent: true,
        body: {
          envelope: cmsCommandEnvelope(configuration),
          action: "grant",
          targetUserId: configuration.managedUserId,
          roleKey: "reviewer",
          reason: scopeReason,
        },
      });
      expect(missingScopeType.status).toBe(400);
      const missingEvaluationPermission = await browserApi(page, configuration, "/functions/v1/cms-scopes", {
        method: "POST",
        body: { envelope: cmsCommandEnvelope(configuration), action: "evaluate" },
      });
      expect(missingEvaluationPermission.status).toBe(400);
      const expiredDelegation = await browserApi(page, configuration, "/functions/v1/cms-scopes", {
        method: "POST",
        idempotent: true,
        body: {
          envelope: cmsCommandEnvelope(configuration),
          action: "grant",
          targetUserId: configuration.managedUserId,
          roleKey: "reviewer",
          grantType: "delegated",
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
          reason: scopeReason,
        },
      });
      expect(expiredDelegation.status).toBe(422);

      const scopedGrantSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: scopeTargetField,
          surfaceId: "users",
          fieldName: "Usuário",
          scenarioId: scopedScenarioId,
          schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
        }),
        prepareCmsSemanticField({
          page,
          locator: scopeRoleField,
          surfaceId: "users",
          fieldName: "Papel no escopo",
          scenarioId: scopedScenarioId,
          schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
          absence: {
            applicability: "already-exercised",
            proofKind: "backend-validation",
            expectedResult: "Uma concessão sem papel deve ser recusada pelo contrato da API.",
            observedResult: "O backend respondeu 400 sem criar concessão.",
          },
        }),
        prepareCmsSemanticField({
          page,
          locator: scopeTypeField,
          surfaceId: "users",
          fieldName: "Tipo",
          scenarioId: scopedScenarioId,
          schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
          absence: {
            applicability: "already-exercised",
            proofKind: "backend-validation",
            expectedResult: "Uma concessão sem tipo deve ser recusada pelo contrato da API.",
            observedResult: "O backend respondeu 400 sem criar concessão.",
          },
        }),
        prepareCmsSemanticField({
          page,
          locator: scopeExpiryField,
          surfaceId: "users",
          fieldName: "Válida até",
          scenarioId: scopedScenarioId,
          schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
          lowerBoundary: {
            applicability: "already-exercised",
            proofKind: "backend-validation",
            expectedResult: "Uma delegação expirada deve ser recusada antes da persistência.",
            observedResult: "O backend respondeu 422 e preservou o escopo anterior.",
          },
        }),
        prepareCmsSemanticField({
          page,
          locator: scopeReasonField,
          surfaceId: "users",
          fieldName: "Justificativa",
          scenarioId: scopedScenarioId,
          schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
        }),
      ]);
      let scopedResponsePromise = waitForEdgeAction(page, "cms-scopes", "grant");
      const scopedGrantControl = scopeGrantForm.getByRole("button", {
        name: "Conceder no escopo",
        exact: true,
      });
      const scopedGrantOccurrence = await visibleButtonOccurrence(
        page,
        "Conceder no escopo",
        scopedGrantControl,
      );
      await scopedGrantControl.click();
      let scopedResponse = await scopedResponsePromise;
      let scopedBody = await responseBody(scopedResponse);
      expect(scopedBody.status).toBe("active");
      semanticActions.record({
        surfaceId: "users",
        controlName: "Conceder no escopo",
        controlOccurrence: scopedGrantOccurrence,
        action: "grant",
        scenarioId: scopedScenarioId,
        backendStatus: "active",
        httpStatus: scopedResponse.status(),
      });
      semanticScenarios.recordStructure({
        surfaceId: "users",
        controlKind: "form",
        controlName: "Nova concessão no escopo",
        scenarioId: scopedScenarioId,
        effectKind: "backend-response",
        httpStatus: scopedResponse.status(),
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      const scopedAssignmentsTable = page.getByRole("table", { name: /concessões no escopo/ });
      const scopedReviewerRow = () =>
        scopedAssignmentsTable
          .getByRole("row")
          .filter({ hasText: `Revisor QA gerenciado ${configuration.runTag}` })
          .filter({ hasText: "Revisor" })
          .filter({ hasText: "Delegada" })
          .first();
      await expect(scopedReviewerRow()).toContainText("efetiva");
      recordPersistedAdminFields(semanticScenarios, scopedGrantSemanticFields, scopedResponse.status());

      const evaluationForm = page.getByRole("form", {
        name: "Simular decisão da sessão",
        exact: true,
      });
      const permissionField = evaluationForm.getByLabel("Permissão", { exact: true });
      await permissionField.selectOption("cms:users.read");
      const permissionSemanticField = await prepareCmsSemanticField({
        page,
        locator: permissionField,
        surfaceId: "users",
        fieldName: "Permissão",
        scenarioId: scopedScenarioId,
        schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
        absence: {
          applicability: "already-exercised",
          proofKind: "backend-validation",
          expectedResult: "Uma avaliação sem permissão deve ser recusada pelo contrato da API.",
          observedResult: "O backend respondeu 400 e não ampliou o acesso da sessão.",
        },
      });
      scopedResponsePromise = waitForEdgeAction(page, "cms-scopes", "evaluate");
      const evaluateControl = evaluationForm.getByRole("button", { name: "Avaliar acesso", exact: true });
      const evaluateOccurrence = await visibleButtonOccurrence(page, "Avaliar acesso", evaluateControl);
      await evaluateControl.click();
      scopedResponse = await scopedResponsePromise;
      scopedBody = await responseBody(scopedResponse);
      expect(scopedBody.allowed).toBe(true);
      semanticActions.record({
        surfaceId: "users",
        controlName: "Avaliar acesso",
        controlOccurrence: evaluateOccurrence,
        action: "evaluate",
        scenarioId: scopedScenarioId,
        backendStatus: "allowed",
        httpStatus: scopedResponse.status(),
      });
      recordTransientAdminField(
        semanticScenarios,
        permissionSemanticField,
        scopedResponse.status(),
        "query",
        true,
      );
      semanticScenarios.recordStructure({
        surfaceId: "users",
        controlKind: "form",
        controlName: "Simular decisão da sessão",
        scenarioId: scopedScenarioId,
        effectKind: "backend-response",
        httpStatus: scopedResponse.status(),
      });
      await expect(page.getByText(/^Permitido:/)).toBeVisible();

      const refreshScopes = page.getByRole("button", { name: "Atualizar", exact: true }).first();
      const refreshOccurrence = await visibleButtonOccurrence(page, "Atualizar", refreshScopes);
      const refreshResponse = waitForEdgeAction(page, "cms-scopes", "list");
      await refreshScopes.click();
      const refreshedScopes = await refreshResponse;
      await responseBody(refreshedScopes);
      semanticActions.record({
        surfaceId: "users",
        controlName: "Atualizar",
        controlOccurrence: refreshOccurrence,
        action: "list",
        scenarioId: scopedScenarioId,
        backendStatus: "refreshed",
        httpStatus: refreshedScopes.status(),
      });

      const openRevokeControl = scopedReviewerRow().getByRole("button", {
        name: "Abrir revogação",
        exact: true,
      });
      await openRevokeControl.click();
      const revokeDialog = page.getByRole("alertdialog", {
        name: "Revogar esta concessão escopada?",
        exact: true,
      });
      await expect(revokeDialog).toBeVisible();
      const revokeReasonField = revokeDialog.getByLabel("Justificativa da revogação", { exact: true });
      await revokeReasonField.fill(`${configuration.runTag} reversão da concessão controlada.`);
      const revokeReasonSemanticField = await prepareCmsSemanticField({
        page,
        locator: revokeReasonField,
        surfaceId: "users",
        fieldName: "Justificativa da revogação",
        scenarioId: scopedScenarioId,
        schemaReference: "src/admin/components/ScopedAccessPanel.tsx",
      });
      scopedResponsePromise = waitForEdgeAction(page, "cms-scopes", "revoke");
      const revokeControl = revokeDialog.getByRole("button", { name: "Revogar concessão", exact: true });
      const revokeOccurrence = await visibleButtonOccurrence(page, "Revogar concessão", revokeControl);
      await revokeControl.click();
      scopedResponse = await scopedResponsePromise;
      scopedBody = await responseBody(scopedResponse);
      expect(scopedBody.status).toBe("revoked");
      semanticActions.record({
        surfaceId: "users",
        controlName: "Revogar concessão",
        controlOccurrence: revokeOccurrence,
        action: "revoke",
        scenarioId: scopedScenarioId,
        backendStatus: "revoked",
        httpStatus: scopedResponse.status(),
      });
      semanticScenarios.recordStructure({
        surfaceId: "users",
        controlKind: "dialog",
        controlName: "Revogar esta concessão escopada?",
        scenarioId: scopedScenarioId,
        effectKind: "backend-response",
        httpStatus: scopedResponse.status(),
      });
      await expect(revokeDialog).toHaveCount(0);
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(scopedReviewerRow()).toContainText("inativa");
      recordPersistedAdminFields(semanticScenarios, [revokeReasonSemanticField], scopedResponse.status());

      const regrantForm = page.getByRole("form", { name: "Nova concessão no escopo", exact: true });
      await regrantForm.getByLabel("Usuário", { exact: true }).selectOption(configuration.managedUserId);
      await regrantForm.getByLabel("Papel no escopo", { exact: true }).selectOption("reviewer");
      await regrantForm.getByLabel("Tipo", { exact: true }).selectOption("delegated");
      await regrantForm.getByLabel("Válida até", { exact: true }).fill(scopeExpiry);
      await regrantForm
        .getByLabel("Justificativa", { exact: true })
        .fill(`${configuration.runTag} concessão restaurada para varredura e teardown.`);
      scopedResponsePromise = waitForEdgeAction(page, "cms-scopes", "grant");
      await regrantForm.getByRole("button", { name: "Conceder no escopo", exact: true }).click();
      scopedResponse = await scopedResponsePromise;
      scopedBody = await responseBody(scopedResponse);
      expect(scopedBody.status).toBe("active");
      semanticActions.record({
        surfaceId: "users",
        controlName: "Conceder no escopo",
        controlOccurrence: scopedGrantOccurrence,
        action: "grant",
        scenarioId: scopedScenarioId,
        backendStatus: "active-restored",
        httpStatus: scopedResponse.status(),
      });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(scopedReviewerRow()).toContainText("efetiva");

      const replayGrantType = page
        .getByRole("form", { name: "Nova concessão no escopo", exact: true })
        .getByLabel("Tipo", { exact: true });
      await observeMutationFreeState(
        page,
        () => replayGrantType.selectOption("delegated").then(() => undefined),
        page.getByLabel("Válida até", { exact: true }),
        () => replayGrantType.selectOption("direct").then(() => undefined),
      );
      recordAdminSemanticStateSetup(semanticStateSetups, {
        surfaceId: "users",
        stateId: "delegated-scope-expiration-field",
        scenarioId: "delegated-scope-expiration-opened-and-restored-without-mutation",
        steps: [
          {
            stepId: "select-delegated-scope-type",
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
      });

      const activeScopedRevokeDialog = page.getByRole("alertdialog", {
        name: "Revogar esta concessão escopada?",
        exact: true,
      });
      await observeMutationFreeState(
        page,
        () => scopedReviewerRow().getByRole("button", { name: "Abrir revogação", exact: true }).click(),
        activeScopedRevokeDialog,
        () => activeScopedRevokeDialog.getByRole("button", { name: "Fechar confirmação" }).click(),
      );
      recordAdminSemanticStateSetup(semanticStateSetups, {
        surfaceId: "users",
        stateId: "active-scoped-role-revocation-dialog",
        scenarioId: "active-scoped-role-revocation-opened-and-restored-without-mutation",
        steps: [
          {
            stepId: "open-active-scoped-role-revocation",
            scope: "managed-user-row",
            controlKind: "button",
            accessibleName: "Abrir revogação",
            controlOccurrence: 0,
            operation: "activate",
          },
        ],
        expectedState: {
          kind: "role",
          role: "alertdialog",
          accessibleName: "Revogar esta concessão escopada?",
          occurrence: 0,
        },
        restore: {
          operation: "activate",
          controlKind: "button",
          accessibleName: "Fechar confirmação",
          controlOccurrence: 0,
        },
      });
      scenarios.push({
        id: scopedScenarioId,
        status: "passed",
        backend: "concessão escopada temporária criada, avaliada, revogada e restaurada pela UI",
        audit: "decisão imutável e eventos cms:scopes.grant/revoke confirmados",
        negative: "campos ausentes e delegação expirada recusados sem ampliar permissões",
        cleanup: "concessão QA ativa ficou vinculada à mesma lease para revogação fail-closed no teardown",
      });

      let userRow = await managedUserRow(page, configuration.runTag);

      const managedUserDrawerName = `Revisor QA gerenciado ${configuration.runTag}`;
      const managedUserDrawer = page.getByRole("dialog", {
        name: managedUserDrawerName,
        exact: true,
      });
      await observeMutationFreeState(
        page,
        () => userRow.getByRole("button", { name: "Abrir", exact: true }).click(),
        managedUserDrawer,
        () => managedUserDrawer.getByRole("button", { name: "Fechar resumo", exact: true }).click(),
      );
      semanticScenarios.recordStructure({
        surfaceId: "users",
        controlKind: "dialog",
        controlName: managedUserDrawerName,
        scenarioId: "managed-user-summary-opened-and-restored-without-mutation",
        effectKind: "state-transition",
        httpStatus: null,
      });
      recordAdminSemanticStateSetup(semanticStateSetups, {
        surfaceId: "users",
        stateId: "managed-user-summary-drawer",
        scenarioId: "managed-user-summary-opened-and-restored-without-mutation",
        steps: [
          {
            stepId: "open-managed-user-summary",
            scope: "managed-user-row",
            controlKind: "button",
            accessibleName: "Abrir",
            controlOccurrence: 0,
            operation: "activate",
          },
        ],
        expectedState: {
          kind: "role",
          role: "dialog",
          accessibleName: "Revisor QA gerenciado {{runTag}}",
          occurrence: 0,
        },
        restore: {
          operation: "activate",
          controlKind: "button",
          accessibleName: "Fechar resumo",
          controlOccurrence: 0,
        },
      });

      const reviewerContext = await newIsolatedContext(browser, baseURL, observer);
      contexts.push(reviewerContext);
      const reviewerPage = await reviewerContext.newPage();
      await signInWithAal2(reviewerPage, configuration.reviewer, configuration.expectedSha);
      await reviewerPage.goto("/admin/usuarios", { waitUntil: "domcontentloaded" });
      await expect(reviewerPage.getByRole("heading", { name: "Acesso negado" })).toBeVisible();
      const idor = await browserApi(reviewerPage, configuration, "/functions/v1/cms-users", {
        method: "POST",
        body: {
          action: "set_roles",
          userId: configuration.managedUserId,
          roles: ["super_admin"],
          idempotencyKey: randomUUID(),
        },
      });
      expect(idor.status).toBe(403);
      const leadBoundary = await browserApi(
        reviewerPage,
        configuration,
        `/rest/v1/cms_leads?select=id&reference_code=eq.${encodeURIComponent(configuration.leadReference)}`,
      );
      expect([200, 401, 403]).toContain(leadBoundary.status);
      expect(Array.isArray(leadBoundary.body) ? leadBoundary.body : []).toHaveLength(0);
      const rdoBoundary = await browserApi(
        reviewerPage,
        configuration,
        `/rest/v1/rdo_user_access?select=user_id&user_id=eq.${configuration.managedUserId}`,
      );
      expect([200, 401, 403]).toContain(rdoBoundary.status);
      expect(Array.isArray(rdoBoundary.body) ? rdoBoundary.body : []).toHaveLength(0);
      scenarios.push({
        id: "users_roles_negative_permissions",
        status: "passed",
        backend: "papéis globais permaneceram ocultos e o escopo efetivo foi resolvido pelo backend",
        audit: "decisão de política escopada verificada ao final",
        negative: "rota, chamada direta com UUID manipulado, leads e RDO recusados",
      });

      let editorialMutations = 0;
      const countEditorialMutation = (request: { url(): string; method(): string }) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname.endsWith("/functions/v1/cms-content")
        ) {
          editorialMutations += 1;
        }
      };
      page.on("request", countEditorialMutation);
      reviewerPage.on("request", countEditorialMutation);
      const aiSessionTitle = `${configuration.runTag} revisão humana`;
      await page.goto("/admin/assistente", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Assistente controlada" })).toBeVisible();
      const sessionTitleField = page.getByLabel("Título operacional");
      const sessionModeField = page.getByLabel("Modo");
      await sessionTitleField.fill(aiSessionTitle);
      await sessionModeField.selectOption("draft");
      const startSessionSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: sessionTitleField,
          surfaceId: "ai-assistant",
          fieldName: "Título operacional",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
        }),
        prepareCmsSemanticField({
          page,
          locator: sessionModeField,
          surfaceId: "ai-assistant",
          fieldName: "Modo",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          absence: { applicability: "optional" },
        }),
      ]);
      let responsePromise = waitForEdgeAction(page, "cms-ai", "start_session");
      await page.getByRole("button", { name: "Abrir sessão de 30 minutos" }).click();
      let actionResponse = await responsePromise;
      const startSessionHttpStatus = actionResponse.status();
      const sessionResult = await responseBody(actionResponse);
      expect(uuidPattern.test(String(sessionResult.sessionId))).toBe(true);
      semanticActions.record({
        surfaceId: "ai-assistant",
        controlName: "Abrir sessão de 30 minutos",
        action: "start_session",
        scenarioId: "ai_synthetic_human_review_manual_fallback",
        backendStatus: String(sessionResult.status ?? "opened"),
        httpStatus: actionResponse.status(),
      });
      const proposalKindField = page.getByLabel("Ação assistiva");
      const promptField = page.getByLabel("Solicitação");
      const sourceDocumentField = page.getByLabel("Documento");
      const sourceVersionField = page.getByLabel("Versão");
      const sourcePageField = page.getByLabel("Página");
      const sourceLocatorField = page.getByLabel("Localizador");
      const sourceExcerptField = page.getByLabel("Trecho técnico autorizado");
      await proposalKindField.selectOption("draft_patch");
      await promptField.fill("Prepare um resumo sintético, verificável e sujeito a revisão humana.");
      await sourceDocumentField.fill(`${configuration.runTag} documento sintético`);
      await sourceVersionField.fill("qa-v1");
      await sourcePageField.fill("1");
      await sourceLocatorField.fill("Seção sintética 1");
      await sourceExcerptField.fill(
        "Equipamento sintético com faixa operacional controlada e validação exclusivamente de QA.",
      );
      const proposalSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: proposalKindField,
          surfaceId: "ai-assistant",
          fieldName: "Ação assistiva",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          absence: { applicability: "optional" },
        }),
        ...[
          [promptField, "Solicitação"],
          [sourceDocumentField, "Documento"],
          [sourceVersionField, "Versão"],
          [sourceLocatorField, "Localizador"],
          [sourceExcerptField, "Trecho técnico autorizado"],
        ].map(([locator, fieldName]) =>
          prepareCmsSemanticField({
            page,
            locator: locator as ReturnType<Page["getByLabel"]>,
            surfaceId: "ai-assistant",
            fieldName: fieldName as string,
            scenarioId: "ai_synthetic_human_review_manual_fallback",
            schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          }),
        ),
        prepareCmsSemanticField({
          page,
          locator: sourcePageField,
          surfaceId: "ai-assistant",
          fieldName: "Página",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          absence: { applicability: "optional" },
          invalid: {
            applicability: "exercise",
            value: "0",
            expectedResult: "A página abaixo do intervalo permitido deve ser recusada.",
            observedResult: "A validação nativa recusou a página fora do intervalo.",
          },
        }),
      ]);
      responsePromise = waitForEdgeAction(page, "cms-ai", "generate_proposal");
      await page.getByRole("button", { name: "Preparar proposta sem aplicar" }).click();
      actionResponse = await responsePromise;
      const proposalHttpStatus = actionResponse.status();
      const proposalResult = await responseBody(actionResponse);
      expect(uuidPattern.test(String(proposalResult.proposalId))).toBe(true);
      expect(proposalResult.applied).toBe(false);
      expect(proposalResult.published).toBe(false);
      semanticActions.record({
        surfaceId: "ai-assistant",
        controlName: "Preparar proposta sem aplicar",
        action: "generate_proposal",
        scenarioId: "ai_synthetic_human_review_manual_fallback",
        backendStatus: String(proposalResult.status ?? "generated"),
        httpStatus: actionResponse.status(),
      });
      await expect(page.getByText("Aplicado: não · Publicado: não", { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: /Registrar edição/ })).toBeDisabled();
      await expect(page.getByText(/segregação exige que outro revisor autorizado/i)).toBeVisible();

      const reviewerWorkspace = waitForEdgeAction(reviewerPage, "cms-ai", "workspace");
      await reviewerPage.goto("/admin/assistente", { waitUntil: "domcontentloaded" });
      const reviewerWorkspaceResponse = await reviewerWorkspace;
      expect(reviewerWorkspaceResponse.status()).toBe(200);
      const sessionSelect = reviewerPage.getByLabel("Sessão atual");
      await expect(sessionSelect.locator("option").filter({ hasText: aiSessionTitle })).toHaveCount(1, {
        timeout: 20_000,
      });
      const reviewSessionId = await sessionSelect
        .locator("option")
        .filter({ hasText: aiSessionTitle })
        .getAttribute("value");
      expect(reviewSessionId).toBeTruthy();
      await sessionSelect.selectOption(reviewSessionId!);
      await expect(reviewerPage.getByText("Aplicado: não · Publicado: não", { exact: false })).toBeVisible();
      const proposalSelect = reviewerPage.getByLabel("Proposta");
      const rationaleField = reviewerPage.getByLabel("Justificativa da decisão");
      const manualAdjustmentField = reviewerPage.getByLabel("Ajuste manual do primeiro campo");
      await proposalSelect.selectOption(await proposalSelect.inputValue());
      await rationaleField.fill(`${configuration.runTag} revisão humana independente concluída.`);
      await manualAdjustmentField.fill(
        "Resumo sintético revisado manualmente; nenhum conteúdo foi aplicado ou publicado.",
      );
      const reviewerQuerySemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page: reviewerPage,
          locator: sessionSelect,
          surfaceId: "ai-assistant",
          fieldName: "Sessão atual",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          absence: { applicability: "optional" },
        }),
        prepareCmsSemanticField({
          page: reviewerPage,
          locator: proposalSelect,
          surfaceId: "ai-assistant",
          fieldName: "Proposta",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          absence: { applicability: "optional" },
        }),
      ]);
      const decisionSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page: reviewerPage,
          locator: rationaleField,
          surfaceId: "ai-assistant",
          fieldName: "Justificativa da decisão",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
        }),
        prepareCmsSemanticField({
          page: reviewerPage,
          locator: manualAdjustmentField,
          surfaceId: "ai-assistant",
          fieldName: "Ajuste manual do primeiro campo",
          scenarioId: "ai_synthetic_human_review_manual_fallback",
          schemaReference: "src/admin/pages/AdminAiAssistantPage.tsx",
          absence: { applicability: "optional" },
        }),
      ]);
      responsePromise = waitForEdgeAction(reviewerPage, "cms-ai", "decide_proposal");
      const decisionControl = reviewerPage.getByRole("button", { name: /Registrar edição/ });
      const decisionControlName = (await decisionControl.textContent())?.replace(/\s+/g, " ").trim() ?? "";
      await decisionControl.click();
      actionResponse = await responsePromise;
      const decisionResult = await responseBody(actionResponse);
      expect(decisionResult.decision).toBe("edited");
      expect(decisionResult.applied).toBe(false);
      expect(decisionResult.published).toBe(false);
      semanticActions.record({
        surfaceId: "ai-assistant",
        controlName: decisionControlName,
        action: "decide_proposal",
        scenarioId: "ai_synthetic_human_review_manual_fallback",
        backendStatus: String(decisionResult.decision),
        httpStatus: actionResponse.status(),
      });
      await expect(reviewerPage.getByText(/Decisão humana registrada sem aplicar ou publicar/)).toBeVisible();
      const persistedWorkspace = waitForEdgeAction(reviewerPage, "cms-ai", "workspace");
      await reviewerPage.reload({ waitUntil: "domcontentloaded" });
      const persistedWorkspaceResponse = await persistedWorkspace;
      expect(persistedWorkspaceResponse.status()).toBe(200);
      await expect(reviewerPage.getByText(/Aplicado: não · Publicado: não/, { exact: false })).toBeVisible();
      recordPersistedAdminFields(semanticScenarios, startSessionSemanticFields, startSessionHttpStatus);
      recordPersistedAdminFields(semanticScenarios, proposalSemanticFields, proposalHttpStatus);
      recordPersistedAdminFields(semanticScenarios, decisionSemanticFields, actionResponse.status());
      for (const field of reviewerQuerySemanticFields) {
        recordTransientAdminField(
          semanticScenarios,
          field,
          reviewerWorkspaceResponse.status(),
          "query",
          false,
        );
      }
      semanticScenarios.recordStructure({
        surfaceId: "ai-assistant",
        controlKind: "form",
        controlName: "Abrir sessão da assistente",
        scenarioId: "ai_synthetic_human_review_manual_fallback",
        effectKind: "backend-response",
        httpStatus: startSessionHttpStatus,
      });
      semanticScenarios.recordStructure({
        surfaceId: "ai-assistant",
        controlKind: "form",
        controlName: "Solicitar proposta com fonte",
        scenarioId: "ai_synthetic_human_review_manual_fallback",
        effectKind: "backend-response",
        httpStatus: proposalHttpStatus,
      });

      await page.route("**/functions/v1/cms-ai", async (route) => {
        const body = route.request().postDataJSON() as Record<string, unknown> | null;
        if (body?.action !== "generate_proposal") return route.continue();
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          headers: {
            "Access-Control-Allow-Origin": targets[configuration.environment].site,
            "Cache-Control": "no-store",
          },
          body: JSON.stringify({
            error: "A IA está temporariamente indisponível; o cadastro manual continua funcionando.",
            code: "CMS_AI_PROVIDER_UNAVAILABLE",
            preserved: true,
          }),
        });
      });
      await page.getByRole("button", { name: "Preparar proposta sem aplicar" }).click();
      await expect(page.getByRole("alert")).toContainText(/IA está temporariamente indisponível/i);
      await expect(page.getByRole("heading", { name: "Operação manual sempre disponível" })).toBeVisible();
      await expect(
        page.getByRole("navigation", { name: "Atalhos para operação manual" }).getByRole("link"),
      ).toHaveCount(3);
      await page.unroute("**/functions/v1/cms-ai");
      responsePromise = waitForEdgeAction(page, "cms-ai", "close_session");
      await page.getByRole("button", { name: "Encerrar sessão" }).click();
      actionResponse = await responsePromise;
      const closeResult = await responseBody(actionResponse);
      expect(closeResult.status).toBe("closed");
      semanticActions.record({
        surfaceId: "ai-assistant",
        controlName: "Encerrar sessão",
        action: "close_session",
        scenarioId: "ai_synthetic_human_review_manual_fallback",
        backendStatus: String(closeResult.status),
        httpStatus: actionResponse.status(),
      });

      const aiExecutionScenario = "ai_transactional_plan_execute_compensate";
      const operatorWorkspacePromise = waitForEdgeAction(page, "cms-ai-execute", "workspace");
      await page.goto("/admin/assistente/execucao", { waitUntil: "domcontentloaded" });
      expect((await operatorWorkspacePromise).status()).toBe(200);
      await expect(
        page.getByRole("heading", { name: "Execução transacional controlada", exact: true }),
      ).toBeVisible();
      const targetTitle = `${configuration.runTag} alvo transacional`;
      const targetSummary = "Estado sintético inicial controlado para validar execução e compensação.";
      const targetTitleField = page.getByLabel("Título", { exact: true });
      const targetSummaryField = page.getByLabel("Resumo inicial", { exact: true });
      await targetTitleField.fill(targetTitle);
      await targetSummaryField.fill(targetSummary);
      const targetSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: targetTitleField,
          surfaceId: "ai-execution",
          fieldName: "Título",
          scenarioId: aiExecutionScenario,
          schemaReference: "supabase/functions/cms-ai-execute/index.ts",
        }),
        prepareCmsSemanticField({
          page,
          locator: targetSummaryField,
          surfaceId: "ai-execution",
          fieldName: "Resumo inicial",
          scenarioId: aiExecutionScenario,
          schemaReference: "supabase/functions/cms-ai-execute/index.ts",
        }),
      ]);
      const createdTarget = await executeAiPlanAction(
        page,
        "Criar alvo de ensaio",
        "create_target",
        semanticActions,
        aiExecutionScenario,
      );
      expect(typeof createdTarget.body.targetRef).toBe("string");

      const planTitle = `${configuration.runTag} plano transacional`;
      const planTitleField = page.getByLabel("Título do plano", { exact: true });
      const targetSelectField = page.getByLabel("Alvo", { exact: true });
      const toolField = page.getByLabel("Comando oficial sintético", { exact: true });
      await planTitleField.fill(planTitle);
      await expect(targetSelectField.locator("option").filter({ hasText: targetTitle })).toHaveCount(1, {
        timeout: 20_000,
      });
      await targetSelectField.selectOption(
        (await targetSelectField.locator("option").filter({ hasText: targetTitle }).getAttribute("value"))!,
      );
      await toolField.selectOption("release.schedule");
      const scheduledAtField = page.getByLabel("Data do ensaio (máximo 24 horas)", { exact: true });
      await scheduledAtField.fill(new Date(Date.now() + 10 * 60_000).toISOString().slice(0, 16));
      const scheduledAtSemanticField = await prepareCmsSemanticField({
        page,
        locator: scheduledAtField,
        surfaceId: "ai-execution",
        fieldName: "Data do ensaio (máximo 24 horas)",
        scenarioId: aiExecutionScenario,
        schemaReference: "supabase/functions/cms-ai-execute/index.ts",
      });
      const addStepButton = page.getByRole("button", { name: "Adicionar ao plano", exact: true });
      await addStepButton.click();
      await expect(page.getByRole("list", { name: "Etapas planejadas" }).getByRole("listitem")).toHaveCount(
        1,
      );

      await toolField.selectOption("draft.apply_patch");
      const patchField = page.getByLabel("Novo resumo sintético", { exact: true });
      await patchField.fill("Resumo sintético alterado por um plano controlado e reversível.");
      const planSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: planTitleField,
          surfaceId: "ai-execution",
          fieldName: "Título do plano",
          scenarioId: aiExecutionScenario,
          schemaReference: "supabase/functions/cms-ai-execute/index.ts",
        }),
        prepareCmsSemanticField({
          page,
          locator: targetSelectField,
          surfaceId: "ai-execution",
          fieldName: "Alvo",
          scenarioId: aiExecutionScenario,
          schemaReference: "src/shared/contracts/ev2-ai-execute.ts",
        }),
        prepareCmsSemanticField({
          page,
          locator: toolField,
          surfaceId: "ai-execution",
          fieldName: "Comando oficial sintético",
          scenarioId: aiExecutionScenario,
          schemaReference: "src/shared/contracts/ev2-ai-execute.ts",
        }),
        prepareCmsSemanticField({
          page,
          locator: patchField,
          surfaceId: "ai-execution",
          fieldName: "Novo resumo sintético",
          scenarioId: aiExecutionScenario,
          schemaReference: "supabase/functions/cms-ai-execute/index.ts",
        }),
      ]);
      await addStepButton.click();
      await toolField.selectOption("workflow.submit");
      await addStepButton.click();
      const removableStep = page.getByRole("button", { name: "Remover etapa 3", exact: true });
      await removableStep.click();
      await expect(page.getByRole("list", { name: "Etapas planejadas" }).getByRole("listitem")).toHaveCount(
        2,
      );
      await toolField.selectOption("draft.apply_patch");

      const createdPlan = await executeAiPlanAction(
        page,
        "Validar simulação e solicitar revisão",
        "create_plan",
        semanticActions,
        aiExecutionScenario,
      );
      expect(typeof createdPlan.body.planId).toBe("string");
      for (const [controlName, action] of [
        ["Adicionar ao plano", "compose-plan-step"],
        ["Remover etapa 3", "remove-plan-step"],
      ] as const) {
        semanticActions.record({
          surfaceId: "ai-execution",
          controlName,
          action,
          scenarioId: aiExecutionScenario,
          backendStatus: "ready",
          httpStatus: createdPlan.response.status(),
        });
      }

      const persistedPlanWorkspacePromise = waitForEdgeAction(page, "cms-ai-execute", "workspace");
      await page.reload({ waitUntil: "domcontentloaded" });
      const persistedPlanWorkspace = await responseBody(await persistedPlanWorkspacePromise);
      const persistedTargets = persistedPlanWorkspace.targets as Array<Record<string, unknown>>;
      const persistedPlans = persistedPlanWorkspace.plans as Array<Record<string, unknown>>;
      expect(persistedTargets.some((target) => target.title === targetTitle)).toBe(true);
      const persistedPlan = persistedPlans.find((plan) => plan.title === planTitle);
      expect(persistedPlan?.status).toBe("ready");
      expect((persistedPlan?.steps as Array<Record<string, unknown>>)?.map((step) => step.toolKey)).toEqual([
        "release.schedule",
        "draft.apply_patch",
      ]);
      recordPersistedAdminFields(semanticScenarios, targetSemanticFields, createdTarget.response.status());
      recordPersistedAdminFields(
        semanticScenarios,
        [...planSemanticFields, scheduledAtSemanticField],
        createdPlan.response.status(),
      );
      semanticScenarios.recordStructure({
        surfaceId: "ai-execution",
        controlKind: "form",
        controlName: "Criar alvo sintético de ensaio",
        scenarioId: aiExecutionScenario,
        effectKind: "backend-response",
        httpStatus: createdTarget.response.status(),
      });

      const reviewerExecutionWorkspacePromise = waitForEdgeAction(
        reviewerPage,
        "cms-ai-execute",
        "workspace",
      );
      await reviewerPage.goto("/admin/assistente/execucao", { waitUntil: "domcontentloaded" });
      expect((await reviewerExecutionWorkspacePromise).status()).toBe(200);
      const reviewerPlanField = reviewerPage.getByLabel("Plano", { exact: true });
      const reviewerPlanOption = reviewerPlanField.locator("option").filter({ hasText: planTitle });
      await expect(reviewerPlanOption).toHaveCount(1, { timeout: 20_000 });
      await reviewerPlanField.selectOption((await reviewerPlanOption.getAttribute("value"))!);
      const executionRationaleField = reviewerPage.getByLabel("Justificativa", { exact: true });
      await executionRationaleField.fill(`${configuration.runTag} revisão segregada e compensável.`);
      const approvalSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page: reviewerPage,
          locator: reviewerPlanField,
          surfaceId: "ai-execution",
          fieldName: "Plano",
          scenarioId: aiExecutionScenario,
          schemaReference: "src/shared/contracts/ev2-ai-execute.ts",
        }),
        prepareCmsSemanticField({
          page: reviewerPage,
          locator: executionRationaleField,
          surfaceId: "ai-execution",
          fieldName: "Justificativa",
          scenarioId: aiExecutionScenario,
          schemaReference: "supabase/functions/cms-ai-execute/index.ts",
        }),
      ]);
      const approvedPlan = await executeAiPlanAction(
        reviewerPage,
        "Aprovar por 10 minutos",
        "approve_plan",
        semanticActions,
        aiExecutionScenario,
      );
      expect(approvedPlan.body.status).toBe("approved");
      recordTransientAdminField(
        semanticScenarios,
        approvalSemanticFields[0]!,
        approvedPlan.response.status(),
        "query",
        false,
      );
      recordPersistedAdminFields(
        semanticScenarios,
        [approvalSemanticFields[1]!],
        approvedPlan.response.status(),
      );

      const executableWorkspacePromise = waitForEdgeAction(page, "cms-ai-execute", "workspace");
      await page.reload({ waitUntil: "domcontentloaded" });
      expect((await executableWorkspacePromise).status()).toBe(200);
      const operatorPlanField = page.getByLabel("Plano", { exact: true });
      await operatorPlanField.selectOption(
        (await operatorPlanField.locator("option").filter({ hasText: planTitle }).getAttribute("value"))!,
      );
      const executedPlan = await executeAiPlanAction(
        page,
        "Executar plano aprovado",
        "execute_plan",
        semanticActions,
        aiExecutionScenario,
      );
      expect(executedPlan.body.status).toBe("executed");

      const compensationWorkspacePromise = waitForEdgeAction(reviewerPage, "cms-ai-execute", "workspace");
      await reviewerPage.reload({ waitUntil: "domcontentloaded" });
      expect((await compensationWorkspacePromise).status()).toBe(200);
      await reviewerPage
        .getByLabel("Plano", { exact: true })
        .selectOption(
          (await reviewerPage
            .getByLabel("Plano", { exact: true })
            .locator("option")
            .filter({ hasText: planTitle })
            .getAttribute("value"))!,
        );
      const compensationApproved = await executeAiPlanAction(
        reviewerPage,
        "Aprovar compensação",
        "approve_compensation",
        semanticActions,
        aiExecutionScenario,
      );
      expect(compensationApproved.body.status).toBe("compensation_approved");

      const compensatableWorkspacePromise = waitForEdgeAction(page, "cms-ai-execute", "workspace");
      await page.reload({ waitUntil: "domcontentloaded" });
      expect((await compensatableWorkspacePromise).status()).toBe(200);
      await page
        .getByLabel("Plano", { exact: true })
        .selectOption(
          (await page
            .getByLabel("Plano", { exact: true })
            .locator("option")
            .filter({ hasText: planTitle })
            .getAttribute("value"))!,
        );
      const compensatedPlan = await executeAiPlanAction(
        page,
        "Executar compensação",
        "compensate_run",
        semanticActions,
        aiExecutionScenario,
      );
      expect(compensatedPlan.body.status).toBe("compensated");
      const terminalWorkspacePromise = waitForEdgeAction(page, "cms-ai-execute", "workspace");
      await page.reload({ waitUntil: "domcontentloaded" });
      const terminalWorkspace = await responseBody(await terminalWorkspacePromise);
      const terminalTarget = (terminalWorkspace.targets as Array<Record<string, unknown>>).find(
        (target) => target.title === targetTitle,
      );
      expect(terminalTarget?.lifecycle).toBe("draft");
      expect((terminalTarget?.payload as Record<string, unknown>)?.summary).toBe(targetSummary);

      expect(editorialMutations).toBe(0);
      aiFinalState =
        "sessão fechada; proposta revisada; plano transacional executado e compensado; zero mutações editoriais";
      scenarios.push({
        id: "ai_synthetic_human_review_manual_fallback",
        status: "passed",
        backend: "sessão/proposta/decisão persistidas e sessão fechada",
        audit: "eventos dedicados de IA refletidos pelo workspace após reload",
        negative: "criador impedido de revisar; 503 preservou operação manual",
        cleanup: aiFinalState,
      });
      scenarios.push({
        id: aiExecutionScenario,
        status: "passed",
        backend: "alvo e plano sintéticos persistidos, aprovados, executados e compensados",
        audit: "respostas autoritativas confirmaram cada transição segregada",
        negative: "nenhuma tabela editorial foi alterada e a compensação restaurou o estado inicial",
        cleanup: "estado sintético compensado; remoção terminal permanece sob a lease da fixture",
      });

      const browserHandoff = await loadCmsRealBrowserAttestation({
        repositoryRoot,
        environment: configuration.environment,
        candidateSha: configuration.expectedSha,
        runTag: configuration.runTag,
        origin: new URL(baseURL).origin,
      });
      expect(browserHandoff.challenge.campaignPath).toBe(configuration.leadCampaignPath);
      expect(browserHandoff.attestation.reference).toBe(configuration.leadReference);
      positivePublicLead = {
        status: "passed",
        interface: "iab-public-campaign-form-and-admin-ui",
        attestation: cmsRealBrowserEvidenceSummary(browserHandoff.attestation, browserHandoff.screenshotPath),
        persistedReference: true,
        externalDelivery: "suppressed-only-for-exact-controlled-origin",
      };
      scenarios.push({
        id: "positive_public_lead_iab_attestation_reused",
        status: "passed",
        backend: `atestado HMAC confirma 201 e o mesmo protocolo persistido no projeto ${configuration.environment}`,
        audit: "consentimento, outbox e protocolo conferidos na ficha administrativa",
        negative: "nenhuma segunda submissão Turnstile; token não capturado nem injetado",
      });

      await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
      const statusFilter = page.getByLabel("Situação").first();
      const filteredLeadResponse = waitForEdgeAction(page, "cms-leads", "list_leads");
      await statusFilter.selectOption(configuration.leadStatus);
      const filteredLeadHttpResponse = await filteredLeadResponse;
      expect(filteredLeadHttpResponse.status()).toBe(200);
      await expect(page.getByRole("row").filter({ hasText: configuration.leadReference })).toHaveCount(1);
      const leadStatusFilterSemanticField = await prepareCmsSemanticField({
        page,
        locator: statusFilter,
        surfaceId: "leads",
        fieldName: "Situação",
        fieldOccurrence: 0,
        scenarioId: "leads_export_assignment_outbox_guard_anonymization",
        schemaReference: "src/admin/pages/AdminLeadsPage.tsx",
        absence: { applicability: "optional" },
      });
      const exportReasonField = page.getByLabel("Justificativa da exportação");
      await exportReasonField.fill(`${configuration.runTag} exportação isolada para homologação.`);
      const exportReasonSemanticField = await prepareCmsSemanticField({
        page,
        locator: exportReasonField,
        surfaceId: "leads",
        fieldName: "Justificativa da exportação",
        scenarioId: "leads_export_assignment_outbox_guard_anonymization",
        schemaReference: "src/admin/pages/AdminLeadsPage.tsx",
      });
      const exportResponse = waitForEdgeAction(page, "cms-leads", "export_leads");
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: "Exportar filtro atual com auditoria" }).click();
      await page.getByRole("button", { name: "Exportar arquivo", exact: true }).click();
      const [exportHttpResponse, download] = await Promise.all([exportResponse, downloadPromise]);
      const exportBody = await responseBody(exportHttpResponse);
      expect(exportBody.rowCount).toBe(1);
      semanticActions.record({
        surfaceId: "leads",
        controlName: "Exportar filtro atual com auditoria",
        action: "export_leads",
        scenarioId: "leads_export_assignment_outbox_guard_anonymization",
        backendStatus: "exported",
        httpStatus: exportHttpResponse.status(),
      });
      recordTransientAdminField(
        semanticScenarios,
        leadStatusFilterSemanticField,
        filteredLeadHttpResponse.status(),
        "query",
        false,
      );
      recordTransientAdminField(
        semanticScenarios,
        exportReasonSemanticField,
        exportHttpResponse.status(),
        "command",
        true,
      );
      semanticScenarios.recordStructure({
        surfaceId: "leads",
        controlKind: "dialog",
        controlName: "Exportar dados de leads?",
        scenarioId: "leads_export_assignment_outbox_guard_anonymization",
        effectKind: "backend-response",
        httpStatus: exportHttpResponse.status(),
      });
      recordAdminSemanticStateSetup(semanticStateSetups, {
        surfaceId: "leads",
        stateId: "lead-export-confirmation",
        scenarioId: "lead-export-confirmation-opened-and-restored-without-mutation",
        steps: [
          {
            stepId: "provide-export-justification",
            scope: "page",
            controlKind: "field",
            accessibleName: "Justificativa da exportação",
            controlOccurrence: 0,
            operation: "fill-run-tag",
          },
          {
            stepId: "open-export-confirmation",
            scope: "page",
            controlKind: "button",
            accessibleName: "Exportar filtro atual com auditoria",
            controlOccurrence: 0,
            operation: "activate",
          },
        ],
        expectedState: {
          kind: "role",
          role: "alertdialog",
          accessibleName: "Exportar dados de leads?",
          occurrence: 0,
        },
        restore: {
          operation: "activate",
          controlKind: "button",
          accessibleName: "Fechar confirmação",
          controlOccurrence: 0,
        },
      });
      const stream = await download.createReadStream();
      let csv = "";
      for await (const chunk of stream) csv += Buffer.from(chunk).toString("utf8");
      expect(csv).toContain(configuration.leadReference);
      expect(csv).toContain("@example.invalid");
      expect(csv.split(/\r?\n/).filter(Boolean)).toHaveLength(2);
      csv = "";
      await download.delete();

      let leadDialog = await openLead(page, configuration.leadReference);
      await expect(leadDialog.getByText(/Aguardando entrega|Processando|Entregue/).first()).toBeVisible();
      await expect(leadDialog.getByRole("button", { name: "Tentar envio novamente" })).toHaveCount(0);
      const leadSnapshot = await browserApi(page, configuration, "/functions/v1/cms-leads", {
        method: "POST",
        idempotent: true,
        body: {
          action: "list_leads",
          status: configuration.leadStatus,
          limit: 50,
          offset: 0,
        },
      });
      expect(leadSnapshot.status).toBe(200);
      const leadItems = (leadSnapshot.body as { items?: Array<Record<string, unknown>> } | null)?.items ?? [];
      const selectedLead = selectSingleAttestedLead(leadItems, configuration.leadReference) as
        | (Record<string, unknown> & {
            cms_lead_consents?: Array<{ consent_version?: unknown }>;
            cms_lead_status_history?: Array<{
              from_status?: unknown;
              to_status?: unknown;
            }>;
            cms_lead_outbox?: Array<{
              id?: unknown;
              event_type?: unknown;
              status?: unknown;
            }>;
          })
        | undefined;
      expect(selectedLead).toBeDefined();
      expect(selectedLead?.origin_path).toBe(configuration.leadCampaignPath);
      expect(selectedLead?.cms_lead_consents).toHaveLength(1);
      expect(selectedLead?.cms_lead_consents?.[0]?.consent_version).toBe("qa-v1");
      expect(selectedLead?.cms_lead_status_history).toHaveLength(2);
      expect(
        selectedLead?.cms_lead_status_history?.filter(
          (history) => history.from_status === null && history.to_status === "new",
        ),
      ).toHaveLength(1);
      expect(
        selectedLead?.cms_lead_outbox?.filter((event) => event.event_type === "lead_received"),
      ).toHaveLength(1);
      const attestationAudit = await browserApi(
        page,
        configuration,
        `/rest/v1/cms_audit_log?select=action,target_id,correlation_id&action=eq.cms%3Aleads.update&target_id=eq.${encodeURIComponent(String(selectedLead?.id ?? ""))}`,
      );
      expect(attestationAudit.status).toBe(200);
      expect(Array.isArray(attestationAudit.body) ? attestationAudit.body : []).toHaveLength(1);
      const attestationAuditRow = (Array.isArray(attestationAudit.body) ? attestationAudit.body : [])[0] as
        Record<string, unknown> | undefined;
      expect(attestationAuditRow?.action).toBe("cms:leads.update");
      expect(attestationAuditRow?.target_id).toBe(selectedLead?.id);
      expect(uuidPattern.test(String(attestationAuditRow?.correlation_id ?? ""))).toBe(true);
      positivePublicLead = {
        ...positivePublicLead,
        authoritativePersistence: {
          scopedLeadCount: 1,
          referenceMatched: true,
          campaignPathMatched: true,
          consentCount: 1,
          consentVersionMatched: true,
          initialHistoryPresent: true,
          leadReceivedOutboxCount: 1,
          attestationAuditCount: 1,
          auditCorrelationPresent: true,
        },
      };
      const realDelivery = selectedLead?.cms_lead_outbox?.[0];
      expect(uuidPattern.test(String(realDelivery?.id))).toBe(true);
      expect(["pending", "processing", "completed"]).toContain(realDelivery?.status);
      const guardedRetry = await browserApi(page, configuration, "/functions/v1/cms-leads", {
        method: "POST",
        idempotent: true,
        body: {
          action: "retry_delivery",
          eventId: String(realDelivery!.id),
          justification: `${configuration.runTag} prova negativa sem fabricar falha de entrega.`,
        },
      });
      expect(guardedRetry.status).toBe(409);
      expect(guardedRetry.body).toMatchObject({
        code: "CMS_LEAD_DELIVERY_NOT_RETRYABLE",
        preserved: true,
      });

      leadDialog = await openLead(page, configuration.leadReference);
      const leadStatusField = leadDialog.getByLabel("Situação");
      const leadAssigneeField = leadDialog.getByLabel("Responsável");
      const leadReasonField = leadDialog.getByLabel("Motivo");
      await leadStatusField.selectOption(configuration.leadStatus);
      await leadAssigneeField.selectOption({ label: `Operador QA ${configuration.runTag}` });
      const leadReason = `${configuration.runTag} atendimento e persistência verificados.`;
      await leadReasonField.fill(leadReason);
      const leadEditorSemanticFields = await Promise.all([
        prepareCmsSemanticField({
          page,
          locator: leadStatusField,
          surfaceId: "leads",
          fieldName: "Situação",
          fieldOccurrence: 1,
          scenarioId: "leads_export_assignment_outbox_guard_anonymization",
          schemaReference: "src/admin/pages/AdminLeadsPage.tsx",
          absence: { applicability: "optional" },
        }),
        prepareCmsSemanticField({
          page,
          locator: leadAssigneeField,
          surfaceId: "leads",
          fieldName: "Responsável",
          scenarioId: "leads_export_assignment_outbox_guard_anonymization",
          schemaReference: "src/admin/pages/AdminLeadsPage.tsx",
          absence: { applicability: "optional" },
        }),
        prepareCmsSemanticField({
          page,
          locator: leadReasonField,
          surfaceId: "leads",
          fieldName: "Motivo",
          scenarioId: "leads_export_assignment_outbox_guard_anonymization",
          schemaReference: "src/admin/pages/AdminLeadsPage.tsx",
        }),
      ]);
      responsePromise = waitForEdgeAction(page, "cms-leads", "update_lead");
      await leadDialog.getByRole("button", { name: "Salvar atendimento" }).click();
      actionResponse = await responsePromise;
      const updateLeadHttpStatus = actionResponse.status();
      const updateResult = await responseBody(actionResponse);
      expect(updateResult.status).toBe(configuration.leadStatus);
      semanticActions.record({
        surfaceId: "leads",
        controlName: "Salvar atendimento",
        action: "update_lead",
        scenarioId: "leads_export_assignment_outbox_guard_anonymization",
        backendStatus: String(updateResult.status),
        httpStatus: actionResponse.status(),
      });
      semanticScenarios.recordStructure({
        surfaceId: "leads",
        controlKind: "dialog",
        controlName: "Atendimento do lead",
        scenarioId: "leads_export_assignment_outbox_guard_anonymization",
        effectKind: "backend-response",
        httpStatus: actionResponse.status(),
      });
      expect(uuidPattern.test(String(updateResult.assignedTo))).toBe(true);
      await page.reload({ waitUntil: "domcontentloaded" });
      await statusFilter.selectOption(configuration.leadStatus);
      await expect(page.getByRole("row").filter({ hasText: configuration.leadReference })).toContainText(
        `Operador QA ${configuration.runTag}`,
      );
      leadDialog = await openLead(page, configuration.leadReference);
      await expect(leadDialog).toContainText(leadReason);
      recordPersistedAdminFields(semanticScenarios, leadEditorSemanticFields, updateLeadHttpStatus);
      await leadDialog.getByRole("button", { name: "Fechar", exact: true }).click();
      await expect(leadDialog).toHaveCount(0);
      const replayLeadDialog = page.getByRole("dialog", {
        name: "Atendimento do lead",
        exact: true,
      });
      await observeMutationFreeState(
        page,
        () =>
          page
            .getByRole("row")
            .filter({ hasText: configuration.leadReference })
            .first()
            .getByRole("button", { name: "Atender", exact: true })
            .click(),
        replayLeadDialog,
        () => replayLeadDialog.getByRole("button", { name: "Fechar", exact: true }).click(),
      );
      recordAdminSemanticStateSetup(semanticStateSetups, {
        surfaceId: "leads",
        stateId: "created-lead-editor",
        scenarioId: "created-lead-editor-open-close-without-mutation",
        steps: [
          {
            stepId: "open-created-lead-editor",
            scope: "created-lead-row",
            controlKind: "button",
            accessibleName: "Atender",
            controlOccurrence: 0,
            operation: "activate",
          },
        ],
        expectedState: {
          kind: "role",
          role: "dialog",
          accessibleName: "Atendimento do lead",
          occurrence: 0,
        },
        restore: {
          operation: "activate",
          controlKind: "button",
          accessibleName: "Fechar",
          controlOccurrence: 0,
        },
      });

      await statusFilter.selectOption("all");
      leadDialog = await openLead(page, configuration.leadReference);
      await expect(leadDialog).toContainText(configuration.leadCampaignPath);
      await expect(leadDialog).toContainText(/Consentimento: versão qa-/);
      await anonymizeOpenLead(
        page,
        configuration.leadReference,
        `${configuration.runTag} encerramento LGPD do lead público sintético.`,
        semanticActions,
        "leads_export_assignment_outbox_guard_anonymization",
      );
      await expect(page.getByRole("row").filter({ hasText: configuration.leadReference })).toHaveCount(0);
      leadsFinalState =
        "o único lead público atestado foi reutilizado no scan semântico e anonimizado; auditoria preservada";
      scenarios.push({
        id: "leads_export_assignment_outbox_guard_anonymization",
        status: "passed",
        backend:
          "export 1/1, outbox real não elegível preservado, atribuição persistida e anonimização pública confirmada",
        audit: "lead:export, lead:update e lead:anonymize verificados",
        negative: "filtro exclusivo impediu exportação preexistente; retry 409 recusou evento não elegível",
        cleanup: leadsFinalState,
      });

      await page.goto("/admin/usuarios", { waitUntil: "domcontentloaded" });
      userRow = await managedUserRow(page, configuration.runTag);
      const revokeResult = await confirmUserAction(
        page,
        userRow,
        "Revogar sessões",
        "revoke_sessions",
        semanticActions,
        "session_revocation_suspend_reactivate_downstream_handoff",
      );
      expect(revokeResult.status).toBe("sessions_revoked");
      const rejectedAfterRevocation = await browserApi(reviewerPage, configuration, "/functions/v1/cms-ai", {
        method: "POST",
        body: {
          action: "workspace",
          envelope: {
            schemaVersion: 1,
            commandId: randomUUID(),
            correlationId: randomUUID(),
            occurredAt: new Date().toISOString(),
            actorContext: { environment: configuration.environment, siteKey: "main" },
          },
        },
      });
      expect([401, 403]).toContain(rejectedAfterRevocation.status);
      userRow = await managedUserRow(page, configuration.runTag);
      const suspendResult = await confirmUserAction(
        page,
        userRow,
        "Suspender",
        "suspend",
        semanticActions,
        "session_revocation_suspend_reactivate_downstream_handoff",
      );
      expect(suspendResult.status).toBe("suspended");
      const suspendedContext = await newIsolatedContext(browser, baseURL, observer);
      contexts.push(suspendedContext);
      const suspendedPage = await suspendedContext.newPage();
      await expectCmsAccessDeniedAfterAuthentication(
        suspendedPage,
        configuration.reviewer,
        configuration.expectedSha,
      );

      userRow = await managedUserRow(page, configuration.runTag);
      const reactivateResult = await confirmUserAction(
        page,
        userRow,
        "Reativar",
        "reactivate",
        semanticActions,
        "session_revocation_suspend_reactivate_downstream_handoff",
      );
      expect(reactivateResult.status).toBe("active");
      await expectSuspendedSessionStillDeniedAfterReactivation(suspendedPage);
      const reactivatedContext = await newIsolatedContext(browser, baseURL, observer);
      contexts.push(reactivatedContext);
      const reactivatedPage = await reactivatedContext.newPage();
      await signInWithAal2(reactivatedPage, configuration.reviewer, configuration.expectedSha);
      await reactivatedPage.goto("/admin/assistente", { waitUntil: "domcontentloaded" });
      await expect(reactivatedPage.getByRole("heading", { name: "Assistente controlada" })).toBeVisible();

      userRow = await managedUserRow(page, configuration.runTag);
      const finalSuspendResult = await confirmUserAction(
        page,
        userRow,
        "Suspender",
        "suspend",
        semanticActions,
        "session_revocation_suspend_reactivate_downstream_handoff",
      );
      expect(finalSuspendResult.status).toBe("suspended");
      await reactivatedPage.reload({ waitUntil: "domcontentloaded" });
      await expect(
        reactivatedPage.getByRole("heading", { name: "Acesso administrativo não autorizado" }),
      ).toBeVisible({ timeout: 20_000 });
      await page.reload({ waitUntil: "domcontentloaded" });
      userRow = await managedUserRow(page, configuration.runTag);
      await expect(userRow).toContainText("suspended");
      const downstreamReactivate = await confirmUserAction(
        page,
        userRow,
        "Reativar",
        "reactivate",
        semanticActions,
        "session_revocation_suspend_reactivate_downstream_handoff",
      );
      expect(downstreamReactivate.status).toBe("active");
      await page.reload({ waitUntil: "domcontentloaded" });
      userRow = await managedUserRow(page, configuration.runTag);
      await expect(userRow).toContainText("active");
      reviewerFinalState =
        "revogação e suspensão estritamente CMS comprovadas; segundo ator reativado para os ciclos seguintes e teardown final";
      scenarios.push({
        id: "session_revocation_suspend_reactivate_downstream_handoff",
        status: "passed",
        backend:
          "revogação, suspensão e reativações controladas persistidas; refresh da sessão criada durante suspensão recebeu CMS 403 após reativação",
        audit: "cms:sessions.revoke e cms:users.suspend verificados",
        negative: "sessão antiga e novo acesso CMS suspenso foram recusados sem bloquear a identidade Auth",
        cleanup: reviewerFinalState,
      });

      await page.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
      const auditTable = page.getByRole("table", { name: "Trilha imutável de auditoria" });
      await expect(auditTable).toBeVisible({
        timeout: 20_000,
      });
      for (const actionLabel of [
        "Convite enviado",
        "Acesso revogado",
        "Acesso suspenso",
        "Dados exportados",
      ]) {
        await expect(auditTable.getByText(actionLabel, { exact: true }).first()).toBeVisible();
      }
      await expect(page.getByText("Imutável", { exact: true })).toBeVisible();
      const scopeAudit = await browserApi(
        page,
        configuration,
        "/rest/v1/cms_audit_log?select=action&action=in.(cms%3Ascopes.grant,cms%3Ascopes.revoke)",
      );
      expect(scopeAudit.status).toBe(200);
      const scopeAuditActions = new Set(
        (Array.isArray(scopeAudit.body) ? scopeAudit.body : []).map((entry) =>
          String((entry as Record<string, unknown>).action),
        ),
      );
      expect(scopeAuditActions).toEqual(new Set(["cms:scopes.grant", "cms:scopes.revoke"]));
      const policyAudit = await browserApi(
        page,
        configuration,
        "/rest/v1/cms_policy_decisions?select=permission_key,decision&permission_key=eq.cms%3Ausers.read&decision=eq.allow",
      );
      expect(policyAudit.status).toBe(200);
      expect(Array.isArray(policyAudit.body) ? policyAudit.body.length : 0).toBeGreaterThan(0);
      scenarios.push({
        id: "immutable_admin_audit",
        status: "passed",
        backend: "eventos recentes e decisão de política recarregados via RLS",
        audit: "trilha e decisões imutáveis preservadas com grant/revoke exatos",
      });

      semanticScenarios.assertNonEmpty();
      observer.assertClean();
      completion = "passed";
    } catch (error) {
      failure = safeFailure(error);
      throw error;
    } finally {
      for (const context of contexts) {
        if (completion === "passed") {
          try {
            assertSealedPreviewRoutingUsed(context);
          } catch (error) {
            completion = "failed";
            failure ??= safeFailure(error);
          }
        }
        await context.close().catch(() => undefined);
      }
      writeEvidence({
        schemaVersion: 1,
        status: completion,
        environment: configuration.environment,
        candidateSha: configuration.expectedSha,
        runTag: configuration.runTag,
        browser: "desktop-chromium-real-ui",
        account:
          "três atores sintéticos isolados; identidade Auth/RDO existente validada; identificadores e credenciais omitidos",
        scenarios,
        semanticActions: semanticActions.snapshot(),
        semanticFields: semanticScenarios.fields(),
        semanticStructures: semanticScenarios.structures(),
        semanticStateSetups: [...semanticStateSetups.values()].sort((left, right) =>
          left.stateContractKey.localeCompare(right.stateContractKey),
        ),
        positivePublicLead,
        cleanup: {
          status: completion === "passed" ? "awaiting-fixture-teardown-verification" : "required",
          reviewer: reviewerFinalState,
          existingIdentity: existingIdentityFinalState,
          leads: leadsFinalState,
          ai: aiFinalState,
          audit: "preservada",
        },
        noIdentifiersPersisted: true,
        noSecretsPersisted: true,
        rawBrowserArtifacts: "disabled",
        browserObservability: observer.snapshot(),
        failure,
      });
    }
  });
});
