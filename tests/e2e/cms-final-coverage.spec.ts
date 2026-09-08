import AxeBuilder from "@axe-core/playwright";
import { createHmac, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
  type Request,
  type Response,
} from "@playwright/test";
import {
  CMS_SEMANTIC_VIEWPORTS,
  cmsMutatingActionContractKey,
  cmsSemanticFieldContractKey,
  cmsSemanticStructureContractKey,
  mapCmsSourceControlsToRuntime,
  resolveCmsSemanticBinding,
  resolveCmsSemanticFieldEvidence,
  resolveCmsSemanticStateSetup,
  resolveCmsMutatingActionEvidence,
  resolveCmsSemanticStructureEvidence,
  validateCmsSemanticCoverage,
  type CmsSemanticFieldEvidence,
  type CmsSemanticBinding,
  type CmsSemanticExecution,
  type CmsSemanticStructureEvidence,
  type CmsSemanticStateSetup,
  type CmsSemanticViewport,
  type CmsMutatingActionEvidence,
  type CmsSourceControlExecution,
  type CmsSourceControlNotApplicable,
} from "./cms-semantic-control-contract";
import {
  loadCmsUiCreatedState,
  writeCmsUiCreatedState,
  type CmsUiCreatedState,
} from "./cms-ui-created-state";
import {
  assertSealedPreviewRoutingUsed,
  installSealedPreviewRouting,
  sealedPreviewApiGet,
  sealedPreviewDeploymentEnvironment,
  sealedPreviewRoutingEvidence,
} from "./cms-sealed-preview-routing";

type CoverageSurface = {
  id: string;
  section: string;
  menuSubmenuTab: string;
  route: string;
  routerPattern: string;
  purpose: string;
  permissions: string[];
  featureFlag: string | null;
  menuPath: string | null;
  testMode: "authenticated" | "auth-journey" | "signed-out" | "negative";
  requiredSyntheticId: string | null;
  sourceFiles: string[];
  publicConsumers: string[];
};

type CoverageInventory = {
  schemaVersion: number;
  generatedAt: string;
  sourceSha: string | null;
  sourceDirty: boolean | null;
  counts: Record<string, number>;
  documentationCrossCheck: {
    localIndexes: string[];
    authoritativeLocations: string[];
    status: string;
  };
  matrix: CoverageSurface[];
  sourceControls: Array<{
    id: string;
    classification: "field" | "form" | "action" | "link" | "tab" | "dialog";
    element: string;
    accessibleNameHint: string;
    ownerRouteIds: string[];
    evidence: string;
  }>;
  sourceDataCalls: Array<{
    classification: string;
    target: string;
    ownerRouteIds: string[];
    evidence: string;
  }>;
};

type SyntheticIds = {
  contentId: string;
  productId: string;
  serviceId: string;
  industryId: string;
  applicationId: string;
  solutionId: string;
  pageId: string;
  campaignId: string;
};

type RuntimeControl = {
  kind: "field" | "action" | "tab" | "link" | "form" | "dialog" | "other";
  tag: string;
  role: string | null;
  name: string;
  type: string | null;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  constraints: Record<string, string | number>;
  destination: string | null;
};

type RouteObservation = {
  surfaceId: string;
  route: string;
  viewport: string;
  httpStatus: number | null;
  finalPath: string;
  controls: RuntimeControl[];
  controlInteraction: ControlInteractionSummary;
  sourceControlContract: {
    status: "passed" | "failed";
    mappings: CmsSourceControlExecution[];
    notApplicable: CmsSourceControlNotApplicable[];
    failures: string[];
  };
  semanticStateSnapshots: Array<{
    stateContractKey: string;
    status: "passed" | "failed";
    controlsCaptured: number;
    mutationRequests: number;
    restored: boolean;
    failures: string[];
  }>;
  focus: { tag: string; role: string | null; visible: boolean; indicator: boolean } | null;
  reducedMotion: boolean;
  horizontalOverflow: number;
  clippedControls: number;
  axe: { scanned: boolean; seriousOrCritical: string[] };
  status: "passed" | "failed";
  failures: string[];
};

type ControlInteractionSummary = {
  mode: "observed-only" | "mutated-and-restored";
  fieldsSeen: number;
  fieldsExercised: number;
  actionsSeen: number;
  actionsFocused: number;
  actionsExecuted: number;
  actionsExecutionReferenced: number;
  actionsStateAsserted: number;
  linksSeen: number;
  linksFocused: number;
  linksExecuted: number;
  unsupported: Array<{ control: string; reason: string }>;
  failures: string[];
  unexpectedMutationRequests: number;
  semanticBindings: CmsSemanticBinding[];
  semanticExecutions: CmsSemanticExecution[];
};

type ReadyAuthentication = {
  email: string;
  password: string;
  totpSecret: string;
  expectedSha: string;
};

type MutationStepEvidence = {
  step: string;
  result: "passed";
  backendStatus?: string;
  httpStatus?: number;
};

type SemanticMutationTarget = {
  surfaceId: string;
  controlName: string;
  controlOccurrence?: number;
  scenarioId: string;
};

type CmsPublicConsumerEvidence = {
  schemaVersion: 1;
  surfaceId: string;
  consumer: string;
  consumerOccurrence: number;
  consumerContractKey: string;
  consumerKind: "http" | "downstream-contract";
  scenarioId: string;
  evidenceReference: string;
  expectedStatus: number | null;
  observedStatus: number | null;
  candidateSha?: string;
  contractResult?: "passed";
  noInternalOrUnpublishedContent: true;
  cacheInvalidation: "validated" | "not-applicable";
  cacheJustification?: string;
  status: "passed";
};

type EditorialSurfaceKind =
  "post" | "product" | "service" | "industry" | "application" | "solution" | "campaign";

type EditorialSurfacePlan = {
  kind: EditorialSurfaceKind;
  itemId: string;
  adminPath: string;
  publicPrefix: string;
  publicQueryType: "post-detail" | "detail" | "entity-detail" | "campaign-by-path";
  publicContentType?: "service" | "industry" | "application" | "solution";
  titleLabel: string;
  summaryLabel: string;
  seoLabel: string;
  saveButton: string;
  publishedSaveButton?: string;
  previewButton: string;
  submitButton: string;
  approveButton: string;
  publishButton: string;
  archiveButton: string;
  restoreButton: string;
};

type SyntheticFormFixture = {
  formId: string;
  formKey: string;
  title: string;
  fieldLabel: string;
  campaignHeading: string;
  versionOneId: string;
};

type MutationTargetEnvironment = "staging" | "production";

function editorialSurfaceId(kind: EditorialSurfaceKind, mode: "create" | "edit") {
  if (kind === "post") return `content-${mode}`;
  if (kind === "product") return `product-${mode}`;
  if (kind === "campaign") return `campaign-${mode}`;
  const plural = {
    service: "services",
    industry: "industries",
    application: "applications",
    solution: "solutions",
  }[kind];
  return `discovery-${plural}-${mode}`;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const inventoryScript = resolve(repositoryRoot, "scripts/qa/cms-coverage-inventory.mjs");
const reportPath = resolve(
  repositoryRoot,
  process.env.QA_CMS_REPORT_PATH ?? "test-results/cms-final-coverage.json",
);
const viewportMatrix = [
  { name: "390x844", width: 390, height: 844, axe: true },
  { name: "768x1024", width: 768, height: 1024, axe: false },
  { name: "1440x900", width: 1440, height: 900, axe: true },
  { name: "1920x1080", width: 1920, height: 1080, axe: false },
] as const;
const requiredSyntheticIds: Array<keyof SyntheticIds> = [
  "contentId",
  "productId",
  "serviceId",
  "industryId",
  "applicationId",
  "solutionId",
  "pageId",
  "campaignId",
];
const mutationTargets = {
  staging: {
    siteOrigin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
    supabaseOrigin: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
  },
  production: {
    siteOrigin: "https://gaiatecsistemas.com.br",
    supabaseOrigin: "https://chfuhctnhqgyjowkvllv.supabase.co",
  },
} as const satisfies Record<MutationTargetEnvironment, { siteOrigin: string; supabaseOrigin: string }>;

let cachedInventory: CoverageInventory | null = null;
const semanticActionEvidence = new Map<string, CmsMutatingActionEvidence>();
const semanticFieldEvidence = new Map<string, CmsSemanticFieldEvidence>();
const semanticStructureEvidence = new Map<string, CmsSemanticStructureEvidence>();
const publicConsumerEvidence = new Map<string, CmsPublicConsumerEvidence>();

function publicConsumerContractKey(surfaceId: string, consumer: string, occurrence = 0) {
  return `public|${cmsMutatingActionContractKey(surfaceId, consumer, occurrence)}`;
}

function mergeEvidenceByKey<T>(persisted: unknown, current: Iterable<T>, key: (entry: T) => string) {
  const existing = Array.isArray(persisted) ? (persisted as T[]) : [];
  return [...new Map([...existing, ...current].map((entry) => [key(entry), entry])).values()].sort(
    (left, right) => key(left).localeCompare(key(right)),
  );
}

function registerSemanticActionEvidence(
  target: SemanticMutationTarget,
  action: string,
  httpStatus: number,
  backendStatus: string,
) {
  const controlOccurrence = target.controlOccurrence ?? 0;
  const controlName = normalizedControlName(target.controlName);
  const controlContractKey = cmsMutatingActionContractKey(target.surfaceId, controlName, controlOccurrence);
  const existing = semanticActionEvidence.get(controlContractKey);
  if (existing) {
    existing.actions = [...new Set([...existing.actions, action])].sort();
    existing.scenarioIds = [...new Set([...existing.scenarioIds, target.scenarioId])].sort();
    existing.backendStatus = backendStatus;
    existing.httpStatus = httpStatus;
    return;
  }
  semanticActionEvidence.set(controlContractKey, {
    schemaVersion: 1,
    surfaceId: target.surfaceId,
    controlName,
    controlOccurrence,
    controlContractKey,
    actions: [action],
    scenarioIds: [target.scenarioId],
    handlerExecuted: true,
    evidenceKind: "backend-response",
    backendStatus,
    httpStatus,
    status: "passed",
  });
}

function semanticEvidenceFile() {
  return reportPath.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
}

function semanticScenarioReference(scenarioId: string, contractKey: string, proof: string) {
  return `${semanticEvidenceFile()}#scenarios/${scenarioId}/${contractKey}/${proof}`;
}

function registerPublicConsumerEvidence(
  input: Omit<CmsPublicConsumerEvidence, "schemaVersion" | "consumerContractKey" | "status">,
) {
  const consumerContractKey = publicConsumerContractKey(
    input.surfaceId,
    input.consumer,
    input.consumerOccurrence,
  );
  const entry: CmsPublicConsumerEvidence = {
    schemaVersion: 1,
    ...input,
    consumerContractKey,
    status: "passed",
  };
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA;
  if (
    !entry.surfaceId ||
    !entry.consumer ||
    !entry.scenarioId ||
    !entry.evidenceReference.includes(consumerContractKey) ||
    entry.noInternalOrUnpublishedContent !== true ||
    (entry.consumerKind === "http" &&
      (entry.candidateSha !== expectedSha || entry.expectedStatus !== entry.observedStatus)) ||
    (entry.consumerKind === "downstream-contract" && entry.contractResult !== "passed")
  ) {
    throw new Error(`CMS_PUBLIC_CONSUMER_EVIDENCE_INVALID:${consumerContractKey}`);
  }
  publicConsumerEvidence.set(consumerContractKey, entry);
}

function inventoryEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { QA_CMS_MATRIX_PATH: "" };
  for (const name of ["PATH", "Path", "SystemRoot", "WINDIR", "ComSpec", "PATHEXT", "TEMP", "TMP"]) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return environment;
}

function inventory(): CoverageInventory {
  if (cachedInventory) return cachedInventory;
  const overridePath = process.env.QA_CMS_COVERAGE_INVENTORY_PATH;
  if (overridePath) {
    if (process.env.QA_CMS_ROLLBACK_COMPATIBILITY !== "true" || !overridePath.endsWith(".json")) {
      throw new Error("O inventário externo é exclusivo do canário autenticado de rollback.");
    }
    cachedInventory = JSON.parse(
      readFileSync(resolve(repositoryRoot, overridePath), "utf8"),
    ) as CoverageInventory;
    return cachedInventory;
  }
  const output = execFileSync(process.execPath, [inventoryScript, "--stdout"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
    env: inventoryEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  cachedInventory = JSON.parse(output) as CoverageInventory;
  return cachedInventory;
}

function authenticatedFrontendSha(candidateSha: string) {
  const frontendSha = process.env.QA_CMS_FRONTEND_EXPECTED_SHA ?? candidateSha;
  if (!/^[0-9a-f]{40}$/i.test(frontendSha)) {
    throw new Error("QA_CMS_FRONTEND_EXPECTED_SHA precisa ser um SHA Git completo.");
  }
  if (
    frontendSha !== candidateSha &&
    (process.env.QA_CMS_ROLLBACK_COMPATIBILITY !== "true" || mutationTargetEnvironment() !== "staging")
  ) {
    throw new Error("Um SHA de frontend distinto só é aceito no canário autenticado de rollback em staging.");
  }
  return frontendSha;
}

function authConfiguration() {
  const email = process.env.QA_CMS_EMAIL;
  const password = process.env.QA_CMS_PASSWORD;
  const totpSecret = process.env.QA_CMS_TOTP_SECRET;
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA;
  const missing = [
    !email && "QA_CMS_EMAIL",
    !password && "QA_CMS_PASSWORD",
    !totpSecret && "QA_CMS_TOTP_SECRET",
    !expectedSha && "QA_CMS_EXPECTED_SHA",
  ].filter(Boolean) as string[];
  if (expectedSha && !/^[0-9a-f]{40}$/i.test(expectedSha)) {
    throw new Error("QA_CMS_EXPECTED_SHA precisa ser um SHA Git completo; o valor não foi registrado.");
  }
  return { ready: missing.length === 0, missing, email, password, totpSecret, expectedSha };
}

function readyAuthentication(): ReadyAuthentication {
  const auth = authConfiguration();
  if (!auth.ready || !auth.email || !auth.password || !auth.totpSecret || !auth.expectedSha) {
    throw new Error(
      `Homologação mutante habilitada sem configuração autenticada completa: ${auth.missing.join(", ")}.`,
    );
  }
  return {
    email: auth.email,
    password: auth.password,
    totpSecret: auth.totpSecret,
    expectedSha: auth.expectedSha,
  };
}

function uiCreatedState(environment: MutationTargetEnvironment, expectedSha: string, runTag: string) {
  return loadCmsUiCreatedState({
    repositoryRoot,
    expectedEnvironment: environment,
    expectedSha,
    expectedRunTag: runTag,
  });
}

function fixtureActorId(environment: MutationTargetEnvironment, expectedSha: string, runTag: string) {
  const fixtureStatePath = resolve(
    repositoryRoot,
    process.env.QA_CMS_FIXTURE_STATE_PATH ?? "test-results/cms-browser-fixture-state.json",
  );
  const value = JSON.parse(readFileSync(fixtureStatePath, "utf8")) as Record<string, unknown>;
  const actorId = String(value.actorId ?? "");
  if (
    value.schemaVersion !== 1 ||
    value.status !== "ready" ||
    value.environment !== environment ||
    value.expectedSha !== expectedSha ||
    value.runTag !== runTag ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actorId)
  ) {
    throw new Error("QA_CMS_FIXTURE_LEASE_BINDING_INVALID");
  }
  return actorId;
}

function mutationTargetEnvironment(): MutationTargetEnvironment {
  const value = process.env.QA_CMS_TARGET_ENVIRONMENT ?? "staging";
  if (value !== "staging" && value !== "production") {
    throw new Error("QA_CMS_TARGET_ENVIRONMENT aceita somente staging ou production.");
  }
  return value;
}

function mutatingConfiguration(baseURL: string | undefined) {
  const environment = mutationTargetEnvironment();
  const gate = process.env.QA_CMS_REQUIRE_AUTHENTICATED;
  if (gate !== undefined && gate !== "true" && gate !== "false") {
    throw new Error("QA_CMS_REQUIRE_AUTHENTICATED aceita somente true ou false.");
  }
  if (gate !== "true") {
    if (environment === "production") {
      throw new Error("O alvo production não pode ignorar o ciclo mutante autenticado.");
    }
    return { enabled: false as const };
  }

  const runTag = process.env.QA_CMS_RUN_TAG;
  const supabaseUrl = process.env.QA_CMS_SUPABASE_URL;
  const supabaseAnonKey = process.env.QA_CMS_SUPABASE_ANON_KEY;
  const missing = [
    !runTag && "QA_CMS_RUN_TAG",
    !supabaseUrl && "QA_CMS_SUPABASE_URL",
    !supabaseAnonKey && "QA_CMS_SUPABASE_ANON_KEY",
  ].filter(Boolean) as string[];
  if (missing.length) {
    throw new Error(`Homologação mutante habilitada sem variáveis obrigatórias: ${missing.join(", ")}.`);
  }
  if (!runTag || !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/i.test(runTag)) {
    throw new Error("QA_CMS_RUN_TAG não segue o identificador sintético aprovado; o valor foi omitido.");
  }
  if (!baseURL || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("A homologação mutante exige as origens implantada e Supabase do ambiente alvo.");
  }

  let deployed: URL;
  let backend: URL;
  try {
    deployed = new URL(baseURL);
    backend = new URL(supabaseUrl);
  } catch {
    throw new Error("Uma origem de staging não é uma URL válida; os valores não foram registrados.");
  }
  const expectedTarget = mutationTargets[environment];
  if (
    deployed.protocol !== "https:" ||
    backend.protocol !== "https:" ||
    deployed.pathname !== "/" ||
    deployed.search ||
    deployed.hash ||
    deployed.username ||
    deployed.password ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash ||
    backend.username ||
    backend.password ||
    deployed.origin !== expectedTarget.siteOrigin ||
    backend.origin !== expectedTarget.supabaseOrigin ||
    supabaseAnonKey.length < 24
  ) {
    throw new Error("A homologação mutante recusou as origens HTTPS fixas do ambiente solicitado.");
  }

  const auth = readyAuthentication();
  if (
    environment === "production" &&
    process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${auth.expectedSha}`
  ) {
    throw new Error("A homologação mutante de produção exige autorização literal vinculada ao SHA exato.");
  }

  return {
    enabled: true as const,
    environment,
    auth,
    runTag,
    supabaseOrigin: backend.origin,
  };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("QA_CMS_TOTP_SECRET não está em Base32 válido; o valor não foi registrado.");
  }
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(value: string, timestamp = Date.now()): string {
  const counter = Math.floor(timestamp / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Bytes(value)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function safePath(value: string): string {
  try {
    const url = new URL(value, "https://qa.invalid");
    const pathname = url.pathname
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[uuid]")
      .replace(/(\/preview\/)[A-Za-z0-9_-]{20,}/g, "$1[token]");
    const safeQuery = new URLSearchParams();
    for (const key of url.searchParams.keys()) safeQuery.set(key, "[presente]");
    return `${pathname}${safeQuery.size ? `?${safeQuery}` : ""}`;
  } catch {
    return "[url-inválida]";
  }
}

function redact(value: string, knownSecrets: Array<string | undefined> = []): string {
  let sanitized = value;
  for (const secret of knownSecrets) {
    if (secret) sanitized = sanitized.split(secret).join("[segredo]");
  }
  return sanitized
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\bBearer\s+\S+/gi, "Bearer [token]")
    .replace(/[?&](?:token|code|key|secret|password|access_token|refresh_token)=[^&\s]+/gi, (match) =>
      match.replace(/=.*/, "=[redigido]"),
    )
    .slice(0, 500);
}

async function assertTargetDeployment(
  page: Page,
  expectedSha: string,
  environment: MutationTargetEnvironment,
) {
  const response = await sealedPreviewApiGet(page, "/healthz", {
    failOnStatusCode: false,
    headers: { "Cache-Control": "no-store" },
  });
  const health = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    response.status() !== 200 ||
    health?.environment !== sealedPreviewDeploymentEnvironment(environment) ||
    health.release !== expectedSha ||
    response.headers()["x-release"] !== expectedSha
  ) {
    throw new Error("O gate mutante recusou o deployment: /healthz precisa confirmar ambiente e SHA exatos.");
  }
}

async function signInWithAal2(page: Page, auth: ReadyAuthentication) {
  const loginResponse = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  if (loginResponse?.headers()["x-release"] !== auth.expectedSha) {
    throw new Error("O X-Release implantado difere do SHA exato homologado; valores omitidos.");
  }
  await page.getByLabel("E-mail corporativo").fill(auth.email);
  await page.getByLabel("Senha").fill(auth.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  if (
    await page
      .getByRole("heading", { name: "Ativar verificação em duas etapas" })
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error("A conta QA precisa chegar pré-matriculada em MFA; nenhuma nova chave foi exportada.");
  }
  const millisecondsInStep = Date.now() % 30_000;
  if (millisecondsInStep > 27_000) await page.waitForTimeout(31_000 - millisecondsInStep);
  await page.getByLabel("Código de 6 dígitos").fill(totp(auth.totpSecret));
  await page.getByRole("button", { name: "Verificar e entrar" }).click();
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/admin(?:\/?|\?.*)$/);
}

function isEditorialResponseFor(action: string, responseUrl: string, method: string, body: unknown) {
  let pathname: string;
  try {
    pathname = new URL(responseUrl).pathname;
  } catch {
    return false;
  }
  return (
    method === "POST" &&
    pathname.endsWith("/functions/v1/cms-content") &&
    Boolean(body && typeof body === "object" && (body as Record<string, unknown>).action === action)
  );
}

function waitForEditorialResponse(page: Page, action: string, expectedApiOrigin?: string) {
  return page.waitForResponse(
    (response) => {
      let body: unknown;
      try {
        body = response.request().postDataJSON();
      } catch {
        return false;
      }
      return (
        (!expectedApiOrigin || new URL(response.url()).origin === expectedApiOrigin) &&
        isEditorialResponseFor(action, response.url(), response.request().method(), body)
      );
    },
    { timeout: 30_000 },
  );
}

async function editorialResponseEvidence(response: Response, action: string, expectedStatus: string) {
  const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !response.ok() ||
    response.status() >= 300 ||
    result?.status !== expectedStatus ||
    typeof result.itemId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(result.itemId) ||
    typeof result.correlationId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(result.correlationId)
  ) {
    throw new Error(`A ação editorial ${action} não foi confirmada atomicamente pelo backend.`);
  }
  return {
    itemId: result.itemId,
    evidence: {
      step: action,
      result: "passed",
      backendStatus: expectedStatus,
      httpStatus: response.status(),
    } satisfies MutationStepEvidence,
  };
}

async function clickEditorialAction(
  page: Page,
  action: string,
  expectedStatus: string,
  trigger: () => Promise<void>,
  expectedApiOrigin?: string,
  semanticTarget?: SemanticMutationTarget,
) {
  const responsePromise = waitForEditorialResponse(page, action, expectedApiOrigin);
  await trigger();
  const response = await responsePromise;
  const evidence = await editorialResponseEvidence(response, action, expectedStatus);
  if (semanticTarget) {
    registerSemanticActionEvidence(semanticTarget, action, response.status(), expectedStatus);
  }
  return evidence;
}

async function clickEdgeAction(
  page: Page,
  functionName: string,
  action: string,
  trigger: () => Promise<void>,
  expectedApiOrigin: string,
  semanticTarget?: SemanticMutationTarget,
) {
  const responsePromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      if (
        response.request().method() !== "POST" ||
        url.origin !== expectedApiOrigin ||
        !url.pathname.endsWith(`/functions/v1/${functionName}`)
      ) {
        return false;
      }
      try {
        const body = response.request().postDataJSON() as Record<string, unknown>;
        return body.action === action;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
  await trigger();
  const response = await responsePromise;
  const result = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (
    !response.ok() ||
    response.status() >= 300 ||
    !result ||
    typeof result.correlationId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(result.correlationId)
  ) {
    throw new Error(`${functionName}/${action} não foi confirmado atomicamente pelo backend.`);
  }
  if (semanticTarget) {
    registerSemanticActionEvidence(
      semanticTarget,
      action,
      response.status(),
      typeof result.status === "string" ? result.status : action,
    );
  }
  return { result, httpStatus: response.status() };
}

async function expectBuilderState(page: Page, state: string) {
  await expect(page.locator(".admin-builder-status")).toContainText(`Status: ${state}`, {
    timeout: 20_000,
  });
}

async function expectPublicRevision(
  context: BrowserContext,
  path: string,
  expectedTitle: string,
  expectedHeroTitle: string,
  expectedSeoTitle: string,
  expectedSha: string,
  expectedApiOrigin: string,
): Promise<MutationStepEvidence> {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      const projectionPromise = publicPage.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "GET" &&
            url.origin === expectedApiOrigin &&
            url.pathname.endsWith("/functions/v1/cms-public") &&
            url.searchParams.get("type") === "page-by-path"
          );
        },
        { timeout: 15_000 },
      );
      const documentResponse = await publicPage.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const projectionResponse = await projectionPromise;
      const resolution = (await projectionResponse.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const projection =
        resolution?.page && typeof resolution.page === "object"
          ? (resolution.page as Record<string, unknown>)
          : null;
      const payload =
        projection?.payload && typeof projection.payload === "object"
          ? (projection.payload as Record<string, unknown>)
          : null;
      const seo =
        projection?.seo && typeof projection.seo === "object"
          ? (projection.seo as Record<string, unknown>)
          : null;
      const blocks = Array.isArray(payload?.blocks) ? (payload.blocks as Array<Record<string, unknown>>) : [];
      const hero = blocks.find((block) => block.type === "hero");
      const heroData =
        hero?.data && typeof hero.data === "object" ? (hero.data as Record<string, unknown>) : null;

      if (
        documentResponse?.status() !== 200 ||
        documentResponse.headers()["x-release"] !== expectedSha ||
        !projectionResponse.ok() ||
        resolution?.kind !== "page" ||
        payload?.title !== expectedTitle ||
        heroData?.title !== expectedHeroTitle ||
        seo?.title !== expectedSeoTitle
      ) {
        throw new Error("A projeção pública ainda não corresponde à revisão esperada.");
      }
      if (
        "provenance" in payload ||
        "governanceState" in payload ||
        "approval" in payload ||
        "authorizationReference" in payload
      ) {
        throw new Error("A projeção pública expôs metadados editoriais internos.");
      }

      await expect(publicPage.getByRole("heading", { level: 1, name: expectedHeroTitle })).toBeVisible();
      await expect(publicPage).toHaveTitle(expectedSeoTitle);
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
      const canonical = await publicPage.locator('link[rel="canonical"]').getAttribute("href");
      if (!canonical || new URL(canonical).pathname !== path) {
        throw new Error("Canonical público não corresponde à rota sintética.");
      }
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    for (const surfaceId of ["page-create", "page-edit"]) {
      const consumer = "rota pública definida no campo path";
      const consumerContractKey = publicConsumerContractKey(surfaceId, consumer, 0);
      registerPublicConsumerEvidence({
        surfaceId,
        consumer,
        consumerOccurrence: 0,
        consumerKind: "http",
        scenarioId: "managed-page-public-revision-and-cache-invalidation",
        evidenceReference: semanticScenarioReference(
          "managed-page-public-revision-and-cache-invalidation",
          consumerContractKey,
          "public-page-contract",
        ),
        expectedStatus: 200,
        observedStatus: 200,
        candidateSha: expectedSha,
        noInternalOrUnpublishedContent: true,
        cacheInvalidation: "validated",
      });
    }
    return { step: "public_projection", result: "passed", httpStatus: 200 };
  } finally {
    await publicPage.close();
  }
}

async function expectRetiredPublicRoute(
  context: BrowserContext,
  path: string,
  expectedSha: string,
): Promise<MutationStepEvidence> {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      const response = await publicPage.goto(path, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      if (response?.status() !== 410 || response.headers()["x-release"] !== expectedSha) {
        throw new Error("A rota retirada ainda não responde com 410 no SHA homologado.");
      }
      await expect(
        publicPage.getByRole("heading", { name: "Este conteúdo não está mais disponível" }),
      ).toBeVisible();
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    return { step: "public_retirement_410", result: "passed", httpStatus: 410 };
  } finally {
    await publicPage.close();
  }
}

async function fillManagedPageRevision(
  page: Page,
  input: {
    title: string;
    summary: string;
    heroTitle: string;
    seoTitle: string;
    path?: string;
    configureGone?: boolean;
  },
) {
  await page.getByRole("tab", { name: "Estrutura" }).click();
  await page.getByLabel("Título administrativo e público").fill(input.title);
  await page.getByLabel("Resumo").fill(input.summary);

  await page.getByRole("tab", { name: "Blocos" }).click();
  const hero = page.locator(".admin-block-selection").first();
  await expect(hero).toContainText("Hero");
  await hero.getByLabel("Título", { exact: true }).fill(input.heroTitle);

  await page.getByRole("tab", { name: "SEO e URL" }).click();
  if (input.path) await page.getByLabel("Endereço público").fill(input.path);
  await page.getByLabel("Meta title").fill(input.seoTitle);
  await page
    .getByLabel("Meta description")
    .fill("Conteúdo sintético temporário e não indexável para homologação integral do CMS GAIATEC.");
  if (input.configureGone) await page.getByLabel("Comportamento").selectOption("gone");
}

async function archiveSyntheticFromUi(
  page: Page,
  itemId: string,
  expectedApiOrigin: string,
): Promise<MutationStepEvidence> {
  await page.goto(`/admin/paginas/${itemId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".admin-builder-status")).toBeVisible({ timeout: 20_000 });
  const state = (
    (await page.locator(".admin-builder-status span").first().locator("strong").textContent()) ?? ""
  ).trim();
  if (state === "archived" || state === "trashed") {
    return { step: "cleanup_archive", result: "passed", backendStatus: state };
  }
  await page.getByRole("tab", { name: "Publicação" }).click();
  if (state === "published") {
    const result = await clickEditorialAction(
      page,
      "retire",
      "archived",
      () => page.getByRole("button", { name: "Retirar do ar" }).click(),
      expectedApiOrigin,
    );
    return { ...result.evidence, step: "cleanup_retire" };
  }
  if (["draft", "in_review", "approved", "scheduled"].includes(state)) {
    const result = await clickEditorialAction(
      page,
      "archive",
      "archived",
      () => page.getByRole("button", { name: "Arquivar" }).click(),
      expectedApiOrigin,
    );
    return { ...result.evidence, step: "cleanup_archive" };
  }
  throw new Error("O conteúdo sintético ficou em estado que não oferece arquivamento seguro pela UI.");
}

async function expectPublishedFormContract(
  page: Page,
  input: {
    expectedApiOrigin: string;
    formKey: string;
    version: number;
    title: string;
    consentVersion: string;
    expectedStatus: 200 | 204;
  },
) {
  const anonKey = process.env.QA_CMS_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("A verificação pública do formulário exige a chave anônima do alvo.");
  const response = await sealedPreviewApiGet(
    page,
    `${input.expectedApiOrigin}/functions/v1/cms-public?${new URLSearchParams({
      type: "form",
      key: input.formKey,
      version: String(input.version),
    })}`,
    {
      failOnStatusCode: false,
      headers: { apikey: anonKey, "Cache-Control": "no-store" },
    },
  );
  if (response.status() !== input.expectedStatus) {
    throw new Error(`O formulário público respondeu ${response.status()}, esperado ${input.expectedStatus}.`);
  }
  if (input.expectedStatus === 204) return;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const consent =
    body?.consent && typeof body.consent === "object" ? (body.consent as Record<string, unknown>) : null;
  if (
    !body ||
    Object.hasOwn(body, "formId") ||
    Object.hasOwn(body, "versionId") ||
    Object.hasOwn(body, "status") ||
    Object.keys(body).sort().join(",") !==
      ["consent", "fields", "key", "purpose", "submitLabel", "successMessage", "title", "version"]
        .sort()
        .join(",") ||
    body?.key !== input.formKey ||
    body?.version !== input.version ||
    body?.title !== input.title ||
    consent?.version !== input.consentVersion
  ) {
    throw new Error("O contrato público do formulário não corresponde à versão publicada esperada.");
  }
}

async function createAndRollbackSyntheticForm(
  page: Page,
  runTag: string,
  expectedApiOrigin: string,
  steps: MutationStepEvidence[],
  onCreated?: (form: SyntheticFormFixture) => void,
): Promise<SyntheticFormFixture> {
  const instance = randomUUID().replaceAll("-", "").slice(0, 8);
  const formKey = `${runTag.toLowerCase()}-formulario-operacional-${instance}`;
  const title = `${runTag} Formulário operacional ${instance}`;
  const fieldLabel = `${runTag} E-mail sintético`;
  const campaignHeading = `${runTag} Formulário controlado`;
  await page.goto("/admin/marketing/formularios", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Formulários versionados" })).toBeVisible();
  await page.getByRole("button", { name: "Novo formulário", exact: true }).click();
  for (const control of [
    page.getByLabel("Título", { exact: true }),
    page.getByLabel("Finalidade"),
    page.getByLabel("Rótulo"),
    page.getByLabel("Texto do consentimento"),
    page.getByLabel("Versão do consentimento"),
    page.getByLabel("Prazo de atendimento (minutos)"),
    page.getByLabel("Retenção (dias)"),
    page.getByLabel("Botão"),
    page.getByLabel("Confirmação"),
    page.getByLabel("Motivo", { exact: true }),
  ]) {
    await expect(control).toHaveValue("");
  }
  await expect(page.getByLabel("Obrigatório")).not.toBeChecked();
  await expect(page.getByLabel("Dado pessoal")).not.toBeChecked();
  const privacyPolicy = page.getByLabel("Política de privacidade");
  await privacyPolicy.selectOption({ label: "Política de privacidade da GAIATEC" });
  await expect(privacyPolicy.locator("option:checked")).toHaveText("Política de privacidade da GAIATEC");
  const formEditor = page.locator("form.admin-form");
  if (await formEditor.evaluate((form) => (form as HTMLFormElement).checkValidity())) {
    throw new Error("O formulário novo vazio foi considerado válido pela interface.");
  }
  let invalidSaveRequests = 0;
  const invalidSaveListener = (request: Request) => {
    if (new URL(request.url()).origin === expectedApiOrigin && looksLikeMutationRequest(request)) {
      invalidSaveRequests += 1;
    }
  };
  page.on("request", invalidSaveListener);
  await page.getByRole("button", { name: "Salvar nova versão", exact: true }).click();
  await page.waitForTimeout(100);
  page.off("request", invalidSaveListener);
  if (invalidSaveRequests !== 0) {
    throw new Error("O formulário novo incompleto tentou alcançar o backend.");
  }
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Finalidade").fill(`${runTag} captura sintética para homologação controlada.`);
  await page.getByLabel("Rótulo").fill(fieldLabel);
  await page.getByLabel("Tipo").selectOption("email");
  await page.getByLabel("Limite").fill("320");
  await page.getByLabel("Obrigatório").setChecked(true);
  await page.getByLabel("Dado pessoal").setChecked(true);
  await page
    .getByLabel("Texto do consentimento")
    .fill(`${runTag} consentimento sintético exclusivo de homologação.`);
  await page.getByLabel("Versão do consentimento").fill("qa-v1");
  await page.getByLabel("Prazo de atendimento (minutos)").fill("60");
  await page.getByLabel("Retenção (dias)").fill("30");
  await page.getByLabel("Botão").fill("Enviar teste sintético");
  await page.getByLabel("Confirmação").fill(`${runTag} confirmação R1.`);
  await page.getByLabel("Motivo", { exact: true }).fill(`${runTag} criação governada R1`);
  const created = await clickEdgeAction(
    page,
    "cms-leads",
    "save_form",
    () => page.getByRole("button", { name: "Salvar nova versão", exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: "Salvar nova versão",
      scenarioId: "form-save-version-1-via-ui",
    },
  );
  const formId = String(created.result.formId ?? "");
  const versionOneId = String(created.result.versionId ?? "");
  const fixture = { formId, formKey, title, fieldLabel, campaignHeading, versionOneId };
  if (/^[0-9a-f-]{36}$/i.test(formId)) onCreated?.(fixture);
  if (
    !/^[0-9a-f-]{36}$/i.test(formId) ||
    !/^[0-9a-f-]{36}$/i.test(versionOneId) ||
    created.result.version !== 1
  ) {
    throw new Error("A primeira versão do formulário não retornou IDs/versão válidos.");
  }
  steps.push({
    step: "form_save_version_1",
    result: "passed",
    backendStatus: "draft",
    httpStatus: created.httpStatus,
  });
  await expect(page.getByLabel("Título", { exact: true })).toHaveValue(title);
  const publishedOne = await clickEdgeAction(
    page,
    "cms-leads",
    "publish_form",
    () => page.getByRole("button", { name: "Versão 1 · Rascunho", exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: "Versão 1 · Rascunho",
      scenarioId: "form-publish-version-1-via-ui",
    },
  );
  if (publishedOne.result.status !== "published") {
    throw new Error("A versão 1 do formulário não ficou publicada.");
  }
  steps.push({
    step: "form_publish_version_1",
    result: "passed",
    backendStatus: "published",
    httpStatus: publishedOne.httpStatus,
  });
  await expectPublishedFormContract(page, {
    expectedApiOrigin,
    formKey,
    version: 1,
    title,
    consentVersion: "qa-v1",
    expectedStatus: 200,
  });
  steps.push({ step: "form_public_contract_version_1", result: "passed", httpStatus: 200 });

  await page.getByLabel("Versão do consentimento").fill("qa-v2");
  await page.getByLabel("Confirmação").fill(`${runTag} confirmação R2.`);
  await page.getByLabel("Motivo", { exact: true }).fill(`${runTag} atualização governada R2`);
  const savedTwo = await clickEdgeAction(
    page,
    "cms-leads",
    "save_form",
    () => page.getByRole("button", { name: "Salvar nova versão", exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: "Salvar nova versão",
      scenarioId: "form-save-version-2-via-ui",
    },
  );
  const versionTwoId = String(savedTwo.result.versionId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(versionTwoId) || savedTwo.result.version !== 2) {
    throw new Error("A segunda versão do formulário não foi persistida.");
  }
  steps.push({
    step: "form_save_version_2",
    result: "passed",
    backendStatus: "draft",
    httpStatus: savedTwo.httpStatus,
  });
  const publishedTwo = await clickEdgeAction(
    page,
    "cms-leads",
    "publish_form",
    () => page.getByRole("button", { name: "Versão 2 · Rascunho", exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: "Versão 2 · Rascunho",
      scenarioId: "form-publish-version-2-via-ui",
    },
  );
  if (publishedTwo.result.status !== "published") {
    throw new Error("A versão 2 do formulário não ficou publicada.");
  }
  await expectPublishedFormContract(page, {
    expectedApiOrigin,
    formKey,
    version: 2,
    title,
    consentVersion: "qa-v2",
    expectedStatus: 200,
  });
  steps.push({
    step: "form_publish_and_public_contract_version_2",
    result: "passed",
    backendStatus: "published",
    httpStatus: publishedTwo.httpStatus,
  });

  await page
    .getByLabel("Motivo da retirada ou restauração")
    .fill(`${runTag} retirada temporária para rollback`);
  const firstArchive = await clickEdgeAction(
    page,
    "cms-leads",
    "archive_form",
    () => page.getByRole("button", { name: "Despublicar e arquivar formulário", exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: "Despublicar e arquivar formulário",
      scenarioId: "form-retire-before-rollback-via-ui",
    },
  );
  if (firstArchive.result.status !== "retired") throw new Error("O formulário não ficou retirado.");
  steps.push({
    step: "form_archive_before_rollback",
    result: "passed",
    backendStatus: "retired",
    httpStatus: firstArchive.httpStatus,
  });
  await page
    .getByLabel("Motivo da retirada ou restauração")
    .fill(`${runTag} restauração controlada da versão 1`);
  const restored = await clickEdgeAction(
    page,
    "cms-leads",
    "restore_form",
    () => page.getByRole("button", { name: "Restaurar versão 1 e publicar", exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: "Restaurar versão 1 e publicar",
      scenarioId: "form-restore-version-1-via-ui",
    },
  );
  if (restored.result.status !== "published" || restored.result.versionId !== versionOneId) {
    throw new Error("O rollback do formulário não restaurou a versão 1 publicada.");
  }
  await expectPublishedFormContract(page, {
    expectedApiOrigin,
    formKey,
    version: 1,
    title,
    consentVersion: "qa-v1",
    expectedStatus: 200,
  });
  steps.push({
    step: "form_restore_version_1_and_public_contract",
    result: "passed",
    backendStatus: "published",
    httpStatus: restored.httpStatus,
  });
  return fixture;
}

async function archiveSyntheticForm(
  page: Page,
  form: SyntheticFormFixture,
  runTag: string,
  expectedApiOrigin: string,
): Promise<MutationStepEvidence> {
  await page.goto("/admin/marketing/formularios", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Formulários versionados" })).toBeVisible();
  const definition = page.locator("aside.admin-workflow button").filter({ hasText: form.title }).first();
  await expect(definition).toBeVisible({ timeout: 20_000 });
  if ((await definition.textContent())?.includes("retired")) {
    await expectPublishedFormContract(page, {
      expectedApiOrigin,
      formKey: form.formKey,
      version: 1,
      title: form.title,
      consentVersion: "qa-v1",
      expectedStatus: 204,
    });
    return { step: "form_cleanup_already_retired", result: "passed", backendStatus: "retired" };
  }
  const published = (await definition.textContent())?.includes("published") ?? false;
  const archiveButtonName = published ? "Despublicar e arquivar formulário" : "Arquivar formulário";
  await definition.click();
  await page.getByRole("button", { name: "Ver ficha completa", exact: true }).click();
  await page
    .getByLabel("Motivo da retirada ou restauração")
    .fill(`${runTag} retirada final após homologação`);
  const archived = await clickEdgeAction(
    page,
    "cms-leads",
    "archive_form",
    () =>
      page
        .getByRole("button", {
          name: archiveButtonName,
          exact: true,
        })
        .click(),
    expectedApiOrigin,
    {
      surfaceId: "forms",
      controlName: archiveButtonName,
      scenarioId: "form-final-retire-via-ui",
    },
  );
  if (archived.result.status !== "retired") throw new Error("O cleanup do formulário não convergiu.");
  await expectPublishedFormContract(page, {
    expectedApiOrigin,
    formKey: form.formKey,
    version: 1,
    title: form.title,
    consentVersion: "qa-v1",
    expectedStatus: 204,
  });
  return {
    step: "form_cleanup_archive_and_public_204",
    result: "passed",
    backendStatus: "retired",
    httpStatus: archived.httpStatus,
  };
}

function editorialSurfacePlans(ids: Omit<SyntheticIds, "pageId">): EditorialSurfacePlan[] {
  return [
    {
      kind: "post",
      itemId: ids.contentId,
      adminPath: `/admin/conteudo/${ids.contentId}`,
      publicPrefix: "/blog",
      publicQueryType: "post-detail",
      titleLabel: "Título",
      summaryLabel: "Resumo",
      seoLabel: "Meta title",
      saveButton: "Salvar com controle de versão",
      publishedSaveButton: "Abrir nova versão e salvar",
      previewButton: "Preview do rascunho",
      submitButton: "Enviar para revisão",
      approveButton: "Aprovar revisão",
      publishButton: "Publicar agora",
      archiveButton: "Despublicar e arquivar conteúdo",
      restoreButton: "Restaurar como nova revisão",
    },
    {
      kind: "product",
      itemId: ids.productId,
      adminPath: `/admin/produtos/${ids.productId}`,
      publicPrefix: "/produtos",
      publicQueryType: "detail",
      titleLabel: "Nome comercial do produto",
      summaryLabel: "Resumo",
      seoLabel: "Meta title",
      saveButton: "Salvar rascunho",
      previewButton: "Preview fiel",
      submitButton: "Enviar para revisão",
      approveButton: "Aprovar revisão",
      publishButton: "Publicar",
      archiveButton: "Despublicar e arquivar produto",
      restoreButton: "Restaurar como nova revisão",
    },
    ...(
      [
        ["service", ids.serviceId, "servicos", "serviço"],
        ["industry", ids.industryId, "industrias", "indústria"],
        ["application", ids.applicationId, "aplicacoes", "aplicação"],
        ["solution", ids.solutionId, "solucoes", "solução"],
      ] as const
    ).map(([kind, itemId, publicSegment, label]) => ({
      kind,
      itemId,
      adminPath: `/admin/descoberta/${kind}/${itemId}`,
      publicPrefix: `/${publicSegment}`,
      publicQueryType: "entity-detail" as const,
      publicContentType: kind,
      titleLabel: "Título público",
      summaryLabel: "Resumo",
      seoLabel: "Título para busca",
      saveButton: "Salvar",
      previewButton: "Preview",
      submitButton: "Enviar para revisão",
      approveButton: "Aprovar",
      publishButton: "Publicar",
      archiveButton: `Despublicar e arquivar ${label}`,
      restoreButton: "Restaurar",
    })),
    {
      kind: "campaign",
      itemId: ids.campaignId,
      adminPath: `/admin/marketing/campanhas/${ids.campaignId}`,
      publicPrefix: "/campanhas",
      publicQueryType: "campaign-by-path",
      titleLabel: "Título",
      summaryLabel: "Resumo",
      seoLabel: "Título SEO",
      saveButton: "Salvar",
      previewButton: "Preview",
      submitButton: "Enviar à revisão",
      approveButton: "Aprovar",
      publishButton: "Publicar",
      archiveButton: "Despublicar e arquivar campanha",
      restoreButton: "Restaurar como nova revisão",
    },
  ];
}

async function fillFirstDatalistOption(page: Page, label: string) {
  const input = page.getByLabel(label, { exact: true });
  const listId = await input.getAttribute("list");
  if (!listId) throw new Error(`${label}: campo controlado sem datalist.`);
  const option = page.locator(`datalist[id="${listId.replaceAll('"', '\\"')}"] option`).first();
  await expect(option, `${label}: vocabulário controlado precisa estar disponível`).toHaveCount(1, {
    timeout: 20_000,
  });
  const value = await option.getAttribute("value");
  if (!value) throw new Error(`${label}: vocabulário controlado não possui opção ativa.`);
  await input.fill(value);
  await input.blur();
  await expect(input).toHaveValue(value);
}

async function fillSyntheticPostForCreate(page: Page, runTag: string) {
  await page.getByLabel("Título", { exact: true }).fill(`${runTag} POST RASCUNHO`);
  await page.getByLabel("Resumo", { exact: true }).fill(`${runTag} resumo editorial sintético controlado.`);
  await page
    .getByLabel("Corpo do artigo")
    .fill(`${runTag} corpo editorial sintético sem conteúdo comercial real.`);
  await page.getByLabel("Autor").fill("Equipe QA GAIATEC");
  await page.getByLabel("Categoria").fill("Homologação");
  await page.getByLabel("Tags separadas por vírgula").fill("qa, homologacao, sintetico");
  await page.getByLabel("Tempo de leitura (minutos)").fill("3");
  await page.getByLabel("Meta title").fill(`${runTag} POST | GAIATEC`);
  await page
    .getByLabel("Meta description")
    .fill(`${runTag} conteúdo temporário e não indexável para homologação integral.`);
  await page.getByLabel("Permitir indexação após publicação").setChecked(false);
  await page.getByLabel("Referência de autorização").fill(runTag);
  await page.getByLabel("Data da autorização").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Escopo dos direitos").fill("Homologação sintética descartável");
  await page.getByLabel("Responsável comercial").fill("Owner QA");
  await page.getByLabel("Responsável técnico").fill("Revisor QA");
  await page.getByLabel("Confirmo os direitos para uso deste conteúdo").setChecked(true);
  await page.getByLabel("Motivo da revisão").fill(`${runTag} criação pela UI`);
}

async function fillSyntheticProductForCreate(page: Page, runTag: string) {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 8);
  await page.getByRole("tab", { name: "Dados essenciais" }).click();
  await page.getByLabel("Nome comercial do produto").fill(`${runTag} PRODUTO`);
  await page.getByLabel("Marca comercial").fill("Marca QA");
  await page.getByLabel("Fabricante/OEM nominal").fill("Fabricante QA");
  await page.getByLabel("Site oficial do fabricante/OEM").fill("https://example.invalid/fabricante-qa");
  await page.getByLabel("Linha").fill("Linha QA");
  for (const label of [
    "Categoria de produto",
    "Aplicação / grandeza",
    "Tecnologia",
    "Instalação / operação",
    "Elemento monitorado",
  ]) {
    await fillFirstDatalistOption(page, label);
  }
  await page.getByLabel("Função", { exact: true }).fill("Medição sintética controlada");
  await page.getByLabel("Resumo", { exact: true }).fill(`${runTag} resumo do produto sintético.`);
  await page.getByLabel("Descrição curta").fill("Produto temporário de homologação.");
  await page.getByLabel("Proposta de valor").fill("Validar o ciclo PIM sem dados comerciais reais.");
  await page.getByLabel("Benefícios", { exact: true }).fill("Rastreabilidade");
  await page.getByRole("button", { name: "Adicionar item em benefícios" }).click();
  await page.getByLabel("Benefícios 2").fill("Isolamento");
  await page.getByLabel("Diferenciais", { exact: true }).fill("Conteúdo não indexável");
  await page.getByRole("button", { name: "Adicionar item em diferenciais" }).click();
  await page.getByLabel("Diferenciais 2").fill("Reversão comprovada");
  await page.getByLabel("Texto", { exact: true }).first().fill(`${runTag} descrição técnica sintética.`);

  await page.getByRole("tab", { name: "Modelos" }).click();
  await page.getByLabel("Modelo 1").fill(`MODELO-${nonce}`);
  await page.getByLabel("Referência 1").fill(`REF-${nonce}`);
  await page.getByLabel("SKU 1").fill(`QA-${nonce}`);
  await page.getByLabel("Nome da variante 1 do modelo 1").fill("Variante QA");
  await page.getByLabel("Código da variante 1 do modelo 1").fill(`VAR-${nonce}`);
  await page.getByLabel("SKU da variante 1 do modelo 1").fill(`QA-VAR-${nonce}`);
  const definition = page.getByLabel("Atributo controlado").first();
  await expect(definition.locator('option:not([value=""])').first()).toHaveCount(1, { timeout: 20_000 });
  const definitionValue = await definition.locator('option:not([value=""])').first().getAttribute("value");
  if (!definitionValue) throw new Error("Produto: catálogo de atributo controlado indisponível.");
  await definition.selectOption(definitionValue);
  const attribute = page.locator("fieldset.admin-semantic-card").filter({ hasText: "Atributo 1" });
  const valueType = await attribute.getByLabel("Tipo de valor").inputValue();
  if (valueType === "enum") {
    const approved = attribute.getByLabel("Valores aprovados");
    const option = await approved.locator("option").first().getAttribute("value");
    if (!option) throw new Error("Produto: atributo enum sem opção aprovada.");
    await approved.selectOption([option]);
  } else if (valueType === "range") {
    await attribute.getByLabel("Limite mínimo").fill("1");
    await attribute.getByLabel("Limite máximo").fill("2");
  } else if (valueType === "boolean") {
    await attribute.getByLabel("Valor").selectOption("true");
  } else {
    await attribute.getByLabel("Valor").fill(valueType === "number" ? "1" : "Valor QA");
  }
  await attribute.getByLabel("Valor técnico homologado").setChecked(true);

  await page.getByRole("tab", { name: "SEO e publicação" }).click();
  await page.getByLabel("Meta title").fill(`${runTag} PRODUTO | GAIATEC`);
  await page.getByLabel("Meta description").fill(`${runTag} produto sintético temporário não indexável.`);
  await page.getByLabel("Endereço canônico no site").fill(`/produtos/${runTag.toLowerCase()}-produto`);
  await page.getByLabel("Indexável — somente após homologação").setChecked(false);
  await page.getByLabel("Estado do piloto").selectOption("synthetic_test");
  await page.getByRole("button", { name: "Adicionar fonte" }).click();
  await page.getByLabel("Referência de autorização").fill(runTag);
  await page.getByLabel("Data da autorização").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Escopo dos direitos").fill("Homologação sintética descartável");
  await page.getByLabel("Responsável comercial").fill("Owner QA");
  await page.getByLabel("Responsável técnico").fill("Revisor QA");
  await page.getByLabel("Confirmo que a fonte e os direitos foram verificados").setChecked(true);
  await page.getByLabel("Owner do portfólio").fill("Owner QA");
  await page.getByLabel("Revisor técnico").fill("Revisor QA");
  await page.getByLabel("Revisor comercial").fill("Revisor QA");
  await page.getByLabel("Revisor editorial").fill("Revisor QA");
  await page.getByLabel("Homologado em").fill(new Date().toISOString().slice(0, 16));
  await page.getByLabel("Motivo da revisão").fill(`${runTag} criação pela UI`);
}

async function fillSyntheticDiscoveryForCreate(
  page: Page,
  kind: "service" | "industry" | "application" | "solution",
  runTag: string,
) {
  await page.getByRole("tab", { name: "Conteúdo" }).click();
  await page.getByLabel("Título público").fill(`${runTag} ${kind.toUpperCase()} RASCUNHO`);
  await page.getByLabel("Resumo").fill(`${runTag} resumo sintético de ${kind}.`);
  await page.getByLabel("Texto editorial complementar").fill(`${runTag} texto controlado de ${kind}.`);
  if (kind === "service") {
    await fillFirstDatalistOption(page, "Categoria do serviço");
    await page.getByLabel("Escopo").fill("Escopo sintético controlado");
    await page.getByLabel("Quando contratar").fill("Cenário sintético");
    await page.getByLabel("Entregáveis").fill("Entregável sintético");
    await page.getByLabel("Pré-requisitos").fill("Pré-requisito sintético");
    await page.getByLabel("Etapas de execução").fill("Etapa sintética");
  } else if (kind === "industry") {
    await page.getByLabel("Ordem no site").fill("999");
    await page.getByLabel("Nome do mercado").fill("Mercado sintético");
    await page.getByLabel("Desafios").fill("Desafio sintético");
    await page.getByLabel("Evidências e diferenciais").fill("Evidência sintética");
    await page.getByLabel("Áreas de processo").fill("Processo sintético");
  } else if (kind === "application") {
    await page.getByLabel("Processo").fill("Processo sintético");
    await page.getByLabel("Problema atendido").first().fill("Problema sintético");
    await page.getByLabel("Benefícios").first().fill("Benefício sintético");
    const point = page.locator("fieldset.admin-point-card").filter({ hasText: "Ponto 1" });
    await point.getByLabel("Título").fill("Ponto sintético");
    await point.getByLabel("Variável medida ou controlada").fill("Variável sintética");
    await point.getByLabel("Necessidade").fill("Necessidade sintética");
    await point.getByLabel("Função").fill("Função sintética");
    await point.getByLabel("Benefício técnico").fill("Benefício técnico sintético");
    await point.getByLabel("Benefício operacional").fill("Benefício operacional sintético");
  } else {
    await page.getByLabel("Problema atendido").fill("Problema sintético");
    await page.getByLabel("Abordagem proposta").fill("Abordagem sintética");
    await page.getByLabel("Benefícios").fill("Benefício sintético");
    await page.getByLabel("Componentes").fill("Componente sintético");
    await page.getByLabel("Modelo de detecção de gases").selectOption("not_applicable");
  }

  await page.getByRole("tab", { name: "Busca e divulgação" }).click();
  await page.getByLabel("Palavras-chave").fill("qa");
  await page.getByRole("button", { name: "Adicionar item em palavras-chave" }).click();
  await page.getByLabel("Palavras-chave 2").fill("homologacao");
  await page.getByRole("button", { name: "Adicionar item em palavras-chave" }).click();
  await page.getByLabel("Palavras-chave 3").fill("sintetico");
  await page.getByLabel("Sinônimos").fill("teste controlado");
  await page.getByLabel("Texto do botão").fill("Solicitar contato");
  await page.getByLabel("Destino do botão").fill("/contato");
  await page.getByLabel("Título para busca").fill(`${runTag} ${kind.toUpperCase()} | GAIATEC`);
  await page
    .getByLabel("Descrição para busca")
    .fill(`${runTag} conteúdo sintético temporário não indexável.`);
  await page.getByLabel("Permitir indexação quando este conteúdo estiver em produção").setChecked(false);

  await page.getByRole("tab", { name: "Aprovação" }).click();
  await page.getByLabel("Situação da aprovação").selectOption("synthetic_test");
  for (const label of [
    kind === "service" ? "Responsável operacional" : "Responsável pelo negócio",
    "Revisor técnico",
    "Revisor comercial",
    "Revisor editorial",
  ]) {
    await page.getByLabel(label).fill("Responsável QA");
  }
  await page.getByLabel("Referência da autorização").fill(runTag);
  await page.getByLabel("Data da autorização").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Responsável comercial").fill("Owner QA");
  await page.getByLabel("Responsável técnico").fill("Revisor QA");
  await page.getByLabel("Escopo dos direitos").fill("Homologação sintética descartável");
  await page.getByLabel("Direitos de uso confirmados").setChecked(true);
}

async function fillSyntheticCampaignForCreate(page: Page, runTag: string, form: SyntheticFormFixture) {
  const nonce = randomUUID().replaceAll("-", "").slice(0, 8);
  const campaignPath = `/campanhas/qa-lead-${runTag.toLowerCase()}-${nonce}`;
  await page.getByLabel("Título", { exact: true }).fill(`${runTag} CAMPANHA RASCUNHO`);
  await page.getByLabel("Resumo", { exact: true }).fill(`${runTag} campanha sintética controlada.`);
  await page.getByLabel("Personalizar o endereço público").check();
  await page.getByLabel("Nome personalizado do endereço").fill(`qa-lead-${runTag.toLowerCase()}-${nonce}`);
  await expect(page.getByLabel("Endereço público gerado")).toHaveText(campaignPath);
  await page.getByLabel("Objetivo").selectOption("lead_generation");
  await page.getByLabel("Template aprovado").selectOption("landing_conversion");
  const startsAt = new Date(Date.now() - 60_000).toISOString().slice(0, 16);
  const endsAt = new Date(Date.now() + 24 * 60 * 60_000).toISOString().slice(0, 16);
  await page.getByLabel("Início (America/São_Paulo)").fill(startsAt);
  await page.getByLabel("Término").fill(endsAt);
  await bindSyntheticFormToCampaign(page, form);
  await page.getByLabel("Estado editorial").selectOption("synthetic_test");
  await page.getByLabel("Indexável").setChecked(false);
  await page.getByLabel("Título SEO").fill(`${runTag} CAMPANHA | GAIATEC`);
  await page.getByLabel("Descrição SEO").fill(`${runTag} campanha temporária não indexável.`);
  await page.getByLabel("Referência da autorização").fill(runTag);
  await page.getByLabel("Data da autorização").fill(new Date().toISOString().slice(0, 10));
  await page.getByLabel("Escopo dos direitos").fill("Homologação sintética descartável");
  await page.getByLabel("Responsável comercial").fill("Owner QA");
  await page.getByLabel("Responsável técnico").fill("Revisor QA");
  await page.getByLabel("Data da verificação").fill(new Date().toISOString().slice(0, 16));
  await page.getByLabel("Confirmo os direitos para uso desta campanha").setChecked(true);
  await page.getByLabel("Responsável de negócio").fill("Owner QA");
  await page.getByLabel("Revisor de marketing").fill("Revisor QA");
  await page.getByLabel("Revisor de privacidade").fill("Revisor QA");
  await page.getByLabel("Data de aprovação").fill(new Date().toISOString().slice(0, 16));
  await page.getByLabel("Justificativa").fill(`${runTag} criação pela UI`);
  return campaignPath;
}

async function createMandatoryEditorialSurfacesViaUi(
  page: Page,
  runTag: string,
  expectedApiOrigin: string,
  form: SyntheticFormFixture,
) {
  const ids = {} as Omit<SyntheticIds, "pageId">;
  const creations: Array<{
    kind: EditorialSurfaceKind;
    route: string;
    fill: () => Promise<void>;
    button: string;
  }> = [
    {
      kind: "post",
      route: "/admin/conteudo/novo",
      fill: () => fillSyntheticPostForCreate(page, runTag),
      button: "Criar rascunho",
    },
    {
      kind: "product",
      route: "/admin/produtos/novo",
      fill: () => fillSyntheticProductForCreate(page, runTag),
      button: "Salvar rascunho",
    },
    ...(["service", "industry", "application", "solution"] as const).map((kind) => ({
      kind,
      route: `/admin/descoberta/${kind}/novo`,
      fill: () => fillSyntheticDiscoveryForCreate(page, kind, runTag),
      button: "Criar rascunho",
    })),
    {
      kind: "campaign",
      route: "/admin/marketing/campanhas/novo",
      fill: async () => {
        await fillSyntheticCampaignForCreate(page, runTag, form);
      },
      button: "Salvar",
    },
  ];

  for (const creation of creations) {
    await page.goto(creation.route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
    await creation.fill();
    const created = await clickEditorialAction(
      page,
      "create",
      "draft",
      () => page.getByRole("button", { name: creation.button, exact: true }).first().click(),
      expectedApiOrigin,
      {
        surfaceId: editorialSurfaceId(creation.kind, "create"),
        controlName: creation.button,
        scenarioId: `${creation.kind}-create-via-ui`,
      },
    );
    const key = creation.kind === "post" ? "contentId" : `${creation.kind}Id`;
    (ids as Record<string, string>)[key] = created.itemId;
    await page.waitForURL(/\/[0-9a-f-]{36}$/i, { timeout: 20_000 });
    if (!page.url().endsWith(`/${created.itemId}`)) {
      throw new Error(`${creation.kind}: o ID criado pelo backend não foi capturado pela navegação UI.`);
    }
  }
  return ids;
}

async function createLeadViaPublicUiAndMarkResponded(input: {
  page: Page;
  context: BrowserContext;
  campaignPath: string;
  form: SyntheticFormFixture;
  runTag: string;
  expectedApiOrigin: string;
}) {
  const publicPage = await input.context.newPage();
  let reference: string;
  try {
    await publicPage.goto(input.campaignPath, { waitUntil: "domcontentloaded" });
    const form = publicPage.getByRole("form", { name: input.form.campaignHeading });
    await expect(form).toBeVisible({ timeout: 20_000 });
    await form
      .getByLabel(new RegExp(input.form.fieldLabel))
      .fill(`qa-public-${input.runTag.toLowerCase()}@example.invalid`);
    await form.locator('input[name="consent"]').check();
    await expect(publicPage.getByLabel("Verificação de segurança")).toBeVisible();
    const submit = form.getByRole("button", { name: "Enviar teste sintético" });
    await expect(submit).toBeEnabled({ timeout: 45_000 });
    const capturePromise = publicPage.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === input.expectedApiOrigin &&
        new URL(response.url()).pathname.endsWith("/functions/v1/lead-capture"),
      { timeout: 45_000 },
    );
    await submit.click();
    const capture = await capturePromise;
    const body = (await capture.json().catch(() => null)) as Record<string, unknown> | null;
    reference = String(body?.reference ?? "");
    if (capture.status() !== 201 || !/^LD-[A-Z0-9]+$/.test(reference)) {
      throw new Error("lead-capture não confirmou o lead sintético criado pela UI pública.");
    }
    await expect(publicPage.getByRole("status")).toContainText(reference);
  } finally {
    await publicPage.close();
  }

  await input.page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
  await input.page.getByLabel("Situação").first().selectOption("new");
  const row = input.page.getByRole("row").filter({ hasText: reference }).first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("button", { name: "Atender" }).click();
  const dialog = input.page.getByRole("dialog", { name: "Atendimento do lead", exact: true });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Situação").selectOption("responded");
  await dialog.getByLabel("Motivo").fill(`${input.runTag} atendimento sintético controlado`);
  const updated = await clickEdgeAction(
    input.page,
    "cms-leads",
    "update_lead",
    () => dialog.getByRole("button", { name: "Salvar atendimento" }).click(),
    input.expectedApiOrigin,
    {
      surfaceId: "leads",
      controlName: "Salvar atendimento",
      scenarioId: "lead-mark-responded-via-ui",
    },
  );
  if (updated.result.status !== "responded") {
    throw new Error("A UI administrativa não confirmou o lead sintético como responded.");
  }
  await expect(dialog).toHaveCount(0);
  return { reference, status: "responded" as const, campaignPath: input.campaignPath };
}

async function runSyntheticEditorialReleaseViaUi(input: {
  page: Page;
  runTag: string;
  itemIds: string[];
  expectedApiOrigin: string;
}) {
  await input.page.goto("/admin/trabalho", { waitUntil: "domcontentloaded" });
  await input.page.getByRole("tab", { name: "Pacotes editoriais" }).click();
  const creator = input.page
    .locator("section")
    .filter({ has: input.page.getByRole("heading", { name: "Novo pacote editorial" }) });
  await creator.getByLabel("Título").fill(`${input.runTag} RELEASE EDITORIAL`);
  await creator.getByLabel("Motivo").fill(`${input.runTag} pacote sintético criado pela UI`);
  const created = await clickEdgeAction(
    input.page,
    "cms-releases",
    "create",
    () => creator.getByRole("button", { name: "Criar pacote vazio" }).click(),
    input.expectedApiOrigin,
    {
      surfaceId: "work-inbox",
      controlName: "Criar pacote vazio",
      scenarioId: "editorial-release-create-via-ui",
    },
  );
  const releaseId = String(created.result.releaseId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(releaseId)) throw new Error("Release UI não retornou ID válido.");
  const releaseCard = input.page
    .locator("section")
    .filter({ hasText: `${input.runTag} RELEASE EDITORIAL` })
    .last();
  if (!input.itemIds.length || new Set(input.itemIds).size !== input.itemIds.length) {
    throw new Error("Release UI exige um conjunto não vazio de itens editoriais distintos.");
  }
  for (const [index, itemId] of input.itemIds.entries()) {
    const candidate = releaseCard.getByLabel("Conteúdo e revisão aprovada");
    const candidateValue = await candidate
      .locator(`option[value^="${itemId}|"]`)
      .first()
      .getAttribute("value");
    if (!candidateValue) throw new Error("Release UI não expôs uma revisão aprovada criada pela UI.");
    await candidate.selectOption(candidateValue);
    await clickEdgeAction(
      input.page,
      "cms-releases",
      "add_item",
      () => releaseCard.getByRole("button", { name: "Adicionar ao pacote" }).click(),
      input.expectedApiOrigin,
      {
        surfaceId: "work-inbox",
        controlName: "Adicionar ao pacote",
        scenarioId: `editorial-release-add-item-${index + 1}-via-ui`,
      },
    );
  }
  for (const [action, button] of [
    ["validate", "Validar pacote"],
    ["submit", "Enviar para aprovação"],
    ["approve", "Aprovar com confirmação em duas etapas"],
  ] as const) {
    await clickEdgeAction(
      input.page,
      "cms-releases",
      action,
      () => releaseCard.getByRole("button", { name: button, exact: true }).click(),
      input.expectedApiOrigin,
      {
        surfaceId: "work-inbox",
        controlName: button,
        scenarioId: `editorial-release-${action}-via-ui`,
      },
    );
  }
  const publishPromise = clickEdgeAction(
    input.page,
    "cms-releases",
    "publish",
    () =>
      (async () => {
        await releaseCard.getByRole("button", { name: "Publicar conjunto", exact: true }).click();
        await input.page
          .getByRole("dialog", { name: "Publicar todo o pacote editorial?" })
          .getByRole("button", { name: "Publicar conjunto", exact: true })
          .click();
      })(),
    input.expectedApiOrigin,
    {
      surfaceId: "work-inbox",
      controlName: "Publicar conjunto",
      scenarioId: "editorial-release-publish-via-ui",
    },
  );
  await publishPromise;
  const rolledBack = await clickEdgeAction(
    input.page,
    "cms-releases",
    "rollback",
    () =>
      (async () => {
        await releaseCard.getByRole("button", { name: "Reverter publicação" }).click();
        await input.page
          .getByRole("dialog", { name: "Reverter todo o pacote editorial?" })
          .getByRole("button", { name: "Reverter conjunto", exact: true })
          .click();
      })(),
    input.expectedApiOrigin,
    {
      surfaceId: "work-inbox",
      controlName: "Reverter conjunto",
      scenarioId: "editorial-release-rollback-via-ui",
    },
  );
  return { releaseId, httpStatus: rolledBack.httpStatus, status: "rolled_back" as const };
}

function editorialStateLocator(page: Page, plan: EditorialSurfacePlan) {
  if (plan.kind === "post") return page.locator(".admin-workflow p strong").first();
  if (plan.kind === "product") return page.locator(".admin-status").first();
  if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    return page.locator(".admin-workflow-bar strong").first();
  }
  return page.locator(".admin-editor-context > div").nth(1).locator("dd");
}

async function expectEditorialState(page: Page, plan: EditorialSurfacePlan, state: string) {
  await expect(editorialStateLocator(page, plan)).toContainText(state, { timeout: 20_000 });
}

async function currentEditorialPublicPath(page: Page, plan: EditorialSurfacePlan) {
  if (plan.kind === "post") {
    return ((await page.getByLabel("Endereço público gerado").textContent()) ?? "").trim();
  }
  if (plan.kind === "product") {
    const context = (await page.locator(".admin-editor-context dd").first().textContent()) ?? "";
    return context.match(/\/produtos\/[a-z0-9-]+/i)?.[0] ?? "";
  }
  if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    await page.getByRole("tab", { name: "Conteúdo" }).click();
    return page.getByLabel("Endereço público gerado").inputValue();
  }
  return ((await page.getByLabel("Endereço público gerado").textContent()) ?? "").trim();
}

async function fillEditorialRevision(
  page: Page,
  plan: EditorialSurfacePlan,
  input: { title: string; summary: string; seoTitle: string; publicPath: string; reason: string },
) {
  if (plan.kind === "product") await page.getByRole("tab", { name: "Dados essenciais" }).click();
  if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    await page.getByRole("tab", { name: "Conteúdo" }).click();
  }
  await page.getByLabel(plan.titleLabel, { exact: true }).fill(input.title);
  await page.getByLabel(plan.summaryLabel, { exact: true }).fill(input.summary);
  if (plan.kind === "post") {
    await page.getByLabel("Corpo do artigo").fill(`${input.summary}\n\n${input.title}`);
    await page.getByLabel("Meta description").fill(input.summary);
    await page.getByLabel("Permitir indexação após publicação").setChecked(false);
  } else if (plan.kind === "product") {
    await page.getByLabel("Texto", { exact: true }).first().fill(`${input.summary}\n\n${input.title}`);
    await page.getByRole("tab", { name: "SEO e publicação" }).click();
    await page.getByLabel("Meta description").fill(input.summary);
    await page.getByLabel("Endereço canônico no site").fill(input.publicPath);
    await page.getByLabel("Indexável — somente após homologação").setChecked(false);
  } else if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    await page.getByRole("tab", { name: "Busca e divulgação" }).click();
    await page.getByLabel("Descrição para busca").fill(input.summary);
    await page.getByLabel("Endereço principal").fill(input.publicPath);
    await page.getByLabel("Permitir indexação quando este conteúdo estiver em produção").setChecked(false);
  } else {
    await page.getByLabel("Descrição SEO").fill(input.summary);
    await page.getByLabel("Indexável").setChecked(false);
  }
  await page.getByLabel(plan.seoLabel, { exact: true }).fill(input.seoTitle);
  if (plan.kind === "post" || plan.kind === "product") {
    await page.getByLabel("Motivo da revisão").fill(input.reason);
  } else if (plan.kind === "campaign") {
    await page.getByLabel("Justificativa").fill(input.reason);
  }
}

async function bindSyntheticFormToCampaign(page: Page, form: SyntheticFormFixture) {
  const campaignForm = page.getByLabel("Formulário publicado", { exact: true });
  await expect(campaignForm.locator("option", { hasText: form.title })).toHaveCount(1);
  if ((await campaignForm.inputValue()) === form.formId) return;
  await page.getByLabel("Tipo de novo bloco").selectOption("form");
  await page.getByRole("button", { name: /Adicionar bloco/ }).click();
  const block = page.locator("details.admin-page-block").last();
  if (!(await block.getAttribute("open"))) await block.locator("summary").click();
  await block.getByLabel("Título", { exact: true }).fill(form.campaignHeading);
  await block.getByLabel("Texto", { exact: true }).fill("Formulário sintético sem dados comerciais reais.");
  await block.getByLabel("Texto do botão", { exact: true }).fill("Abrir formulário sintético");
  await block.getByLabel("Formulário publicado").selectOption(form.formId);
  await campaignForm.selectOption(form.formId);
}

async function expectEditorialPersistence(
  page: Page,
  plan: EditorialSurfacePlan,
  input: { title: string; seoTitle: string },
) {
  await page.reload({ waitUntil: "domcontentloaded" });
  await expectEditorialState(page, plan, "draft");
  if (plan.kind === "product") await page.getByRole("tab", { name: "Dados essenciais" }).click();
  if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    await page.getByRole("tab", { name: "Conteúdo" }).click();
  }
  await expect(page.getByLabel(plan.titleLabel, { exact: true })).toHaveValue(input.title);
  if (plan.kind === "product") await page.getByRole("tab", { name: "SEO e publicação" }).click();
  if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    await page.getByRole("tab", { name: "Busca e divulgação" }).click();
  }
  await expect(page.getByLabel(plan.seoLabel, { exact: true })).toHaveValue(input.seoTitle);
}

function matchesPublicQuery(response: Response, plan: EditorialSurfacePlan, publicPath: string) {
  const url = new URL(response.url());
  if (
    response.request().method() !== "GET" ||
    !url.pathname.endsWith("/functions/v1/cms-public") ||
    url.searchParams.get("type") !== plan.publicQueryType
  ) {
    return false;
  }
  const slug = publicPath.split("/").filter(Boolean).at(-1) ?? "";
  if (plan.publicQueryType === "campaign-by-path") return url.searchParams.get("path") === publicPath;
  if (url.searchParams.get("slug") !== slug) return false;
  return plan.publicQueryType !== "entity-detail" || url.searchParams.get("contentType") === plan.kind;
}

function publicQueryEvidenceKey(plan: EditorialSurfacePlan, publicPath: string) {
  return `${plan.publicQueryType}:${plan.publicContentType ?? "-"}:${publicPath}`;
}

function publicQueryEvidenceKeyFromUrl(url: URL, plans: EditorialSurfacePlan[]) {
  if (!url.pathname.endsWith("/functions/v1/cms-public")) return null;
  const type = url.searchParams.get("type");
  const plan = plans.find(
    (candidate) =>
      candidate.publicQueryType === type &&
      (type !== "entity-detail" || candidate.publicContentType === url.searchParams.get("contentType")),
  );
  if (!plan) return null;
  const publicPath =
    type === "campaign-by-path"
      ? url.searchParams.get("path")
      : `${plan.publicPrefix}/${url.searchParams.get("slug") ?? ""}`;
  return publicPath ? publicQueryEvidenceKey(plan, publicPath) : null;
}

function directPublicConsumer(plan: EditorialSurfacePlan) {
  if (plan.kind === "post") return "/blog/:slug";
  if (plan.kind === "product") return "/produtos/:slug";
  if (plan.kind === "campaign") return "/campanhas/:slug";
  if (plan.kind === "service") return "/servicos";
  if (plan.kind === "industry") return "/industrias";
  if (plan.kind === "application") return "/aplicacoes";
  return "/solucoes e respectivas rotas :slug";
}

function registerEditorialHttpConsumer(
  plan: EditorialSurfacePlan,
  consumer: string,
  scenarioId: string,
  expectedSha: string,
  status = 200,
) {
  for (const mode of ["create", "edit"] as const) {
    const surfaceId = editorialSurfaceId(plan.kind, mode);
    const consumerContractKey = publicConsumerContractKey(surfaceId, consumer, 0);
    registerPublicConsumerEvidence({
      surfaceId,
      consumer,
      consumerOccurrence: 0,
      consumerKind: "http",
      scenarioId,
      evidenceReference: semanticScenarioReference(scenarioId, consumerContractKey, "public-http-contract"),
      expectedStatus: status,
      observedStatus: status,
      candidateSha: expectedSha,
      noInternalOrUnpublishedContent: true,
      cacheInvalidation: "validated",
    });
  }
}

async function expectPublicEditorialRevision(
  context: BrowserContext,
  plan: EditorialSurfacePlan,
  publicPath: string,
  expectedTitle: string,
  expectedSeoTitle: string,
  expectedSha: string,
  expectedApiOrigin: string,
  form?: SyntheticFormFixture,
): Promise<MutationStepEvidence> {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      const projectionPromise = publicPage.waitForResponse(
        (response) =>
          new URL(response.url()).origin === expectedApiOrigin &&
          matchesPublicQuery(response, plan, publicPath),
        { timeout: 20_000 },
      );
      const documentResponse = await publicPage.goto(publicPath, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const projectionResponse = await projectionPromise;
      const projection = (await projectionResponse.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const payload =
        projection?.payload && typeof projection.payload === "object"
          ? (projection.payload as Record<string, unknown>)
          : null;
      const seo =
        projection?.seo && typeof projection.seo === "object"
          ? (projection.seo as Record<string, unknown>)
          : null;
      if (
        documentResponse?.status() !== 200 ||
        documentResponse.headers()["x-release"] !== expectedSha ||
        !projectionResponse.ok() ||
        projection?.item_id !== plan.itemId ||
        payload?.title !== expectedTitle ||
        seo?.title !== expectedSeoTitle
      ) {
        throw new Error(`${plan.kind}: projeção pública não corresponde à revisão esperada.`);
      }
      if (
        "provenance" in payload ||
        "governanceState" in payload ||
        "approval" in payload ||
        "authorizationReference" in payload
      ) {
        throw new Error(`${plan.kind}: a projeção pública expôs governança interna.`);
      }
      if (plan.kind === "campaign") {
        await expect(publicPage.getByLabel(expectedTitle, { exact: true })).toBeVisible();
        if (form) {
          const formContract =
            projection?.form && typeof projection.form === "object"
              ? (projection.form as Record<string, unknown>)
              : null;
          if (
            !formContract ||
            formContract.key !== form.formKey ||
            formContract.version !== 1 ||
            Object.hasOwn(formContract, "formId") ||
            Object.hasOwn(formContract, "versionId") ||
            Object.hasOwn(formContract, "formVersionId") ||
            Object.hasOwn(formContract, "status") ||
            Object.keys(formContract).sort().join(",") !==
              ["consent", "fields", "key", "purpose", "submitLabel", "successMessage", "title", "version"]
                .sort()
                .join(",")
          ) {
            throw new Error("campaign: vínculo público não aponta para a versão restaurada do formulário.");
          }
          const publicForm = publicPage.getByRole("form", { name: form.campaignHeading });
          await expect(publicForm).toBeVisible();
          await expect(publicForm.getByLabel(new RegExp(form.fieldLabel))).toBeVisible();
          await expect(publicForm.getByRole("button", { name: "Enviar teste sintético" })).toBeDisabled();
          let leadRequests = 0;
          const leadListener = (request: Request) => {
            if (new URL(request.url()).pathname.endsWith("/functions/v1/lead-capture")) {
              leadRequests += 1;
            }
          };
          publicPage.on("request", leadListener);
          await publicForm.evaluate((element) => (element as HTMLFormElement).requestSubmit());
          await publicPage.waitForTimeout(100);
          publicPage.off("request", leadListener);
          if (leadRequests !== 0) {
            throw new Error("campaign: formulário inválido tentou alcançar o backend público.");
          }
        }
      } else {
        await expect(publicPage.getByRole("heading", { level: 1, name: expectedTitle })).toBeVisible();
      }
      await expect(publicPage).toHaveTitle(expectedSeoTitle);
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
      const canonical = await publicPage.locator('link[rel="canonical"]').getAttribute("href");
      if (!canonical || new URL(canonical).pathname !== publicPath) {
        throw new Error(`${plan.kind}: canonical público não corresponde à rota sintética.`);
      }
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    registerEditorialHttpConsumer(
      plan,
      directPublicConsumer(plan),
      `${plan.kind}-published-revision-public-consumer`,
      expectedSha,
    );
    return { step: `${plan.kind}_public_projection`, result: "passed", httpStatus: 200 };
  } finally {
    await publicPage.close();
  }
}

async function expectEditorialPrivatePreview(
  page: Page,
  context: BrowserContext,
  plan: EditorialSurfacePlan,
  expectedTitle: string,
  expectedSha: string,
  expectedApiOrigin: string,
): Promise<MutationStepEvidence> {
  const popupPromise = page.waitForEvent("popup", { timeout: 20_000 });
  const previewNavigationPromise = context.waitForEvent("response", {
    predicate: (response) =>
      response.request().isNavigationRequest() &&
      /^\/preview\/[A-Za-z0-9_-]+$/.test(new URL(response.url()).pathname),
    timeout: 30_000,
  });
  const previewApiPromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.origin === expectedApiOrigin &&
        url.pathname.endsWith("/functions/v1/cms-preview")
      );
    },
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: plan.previewButton, exact: true }).click();
  const [previewPage, previewApiResponse, previewNavigation] = await Promise.all([
    popupPromise,
    previewApiPromise,
    previewNavigationPromise,
  ]);
  try {
    const body = (await previewApiResponse.json().catch(() => null)) as Record<string, unknown> | null;
    if (
      !previewApiResponse.ok() ||
      previewNavigation.status() !== 200 ||
      typeof body?.path !== "string" ||
      !/^\/preview\/[A-Za-z0-9_-]+$/.test(body.path) ||
      new URL(previewNavigation.url()).pathname !== body.path ||
      previewNavigation.headers()["x-release"] !== expectedSha
    ) {
      throw new Error(`${plan.kind}: preview privado não foi confirmado pelo backend/SHA.`);
    }
    await expect(previewPage.getByText("Preview privado — alterações ainda não publicadas")).toBeVisible();
    if (plan.kind === "campaign") {
      await expect(previewPage.getByLabel(expectedTitle, { exact: true })).toBeVisible();
    } else {
      await expect(previewPage.getByRole("heading", { level: 1, name: expectedTitle })).toBeVisible();
    }
    registerEditorialHttpConsumer(
      plan,
      "/preview/:token",
      `${plan.kind}-private-preview-consumer`,
      expectedSha,
    );
    return { step: `${plan.kind}_private_preview`, result: "passed", httpStatus: 200 };
  } finally {
    await previewPage.close();
  }
}

async function expectEditorialUnavailable(
  context: BrowserContext,
  plan: EditorialSurfacePlan,
  publicPath: string,
  expectedTitle: string,
  expectedSha: string,
): Promise<MutationStepEvidence> {
  const publicPage = await context.newPage();
  try {
    await expect(async () => {
      const projectionPromise = publicPage.waitForResponse(
        (response) => matchesPublicQuery(response, plan, publicPath),
        { timeout: 20_000 },
      );
      const documentResponse = await publicPage.goto(publicPath, {
        waitUntil: "domcontentloaded",
        timeout: 30_000,
      });
      const projectionResponse = await projectionPromise;
      const projection = (await projectionResponse.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (documentResponse?.status() !== 200 || documentResponse.headers()["x-release"] !== expectedSha) {
        throw new Error(`${plan.kind}: shell público retirado não veio do SHA homologado.`);
      }
      if (plan.kind === "campaign") {
        if (
          projectionResponse.status() !== 200 ||
          !["route", "fallback"].includes(String(projection?.kind))
        ) {
          throw new Error("campaign: retirada não gerou resolução pública controlada.");
        }
        await expect(publicPage.getByRole("heading", { name: "Campanha encerrada" })).toBeVisible();
      } else {
        if (projectionResponse.status() !== 404) {
          throw new Error(`${plan.kind}: projeção retirada deveria responder 404.`);
        }
        const unavailableHeading =
          plan.kind === "post"
            ? "Artigo não encontrado"
            : plan.kind === "product"
              ? "Produto não encontrado"
              : "Conteúdo indisponível";
        await expect(publicPage.getByRole("heading", { name: unavailableHeading })).toBeVisible();
      }
      await expect(publicPage.getByRole("heading", { level: 1, name: /.+/ })).not.toHaveText(expectedTitle);
      await expect(publicPage.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
    return {
      step: `${plan.kind}_public_unavailable_after_archive`,
      result: "passed",
      httpStatus: plan.kind === "campaign" ? 200 : 404,
    };
  } finally {
    await publicPage.close();
  }
}

async function assertNewDraftsStartIncomplete(page: Page, expectedApiOrigin: string) {
  const drafts = [
    { route: "/admin/conteudo/novo", title: "Título", action: "Criar rascunho" },
    {
      route: "/admin/produtos/novo",
      title: "Nome comercial do produto",
      action: "Salvar e continuar",
      progressive: true,
    },
    {
      route: "/admin/descoberta/service/novo",
      title: "Título público",
      action: "Criar rascunho",
    },
    { route: "/admin/paginas/novo", title: "Título administrativo e público", action: "Criar página" },
    { route: "/admin/marketing/campanhas/novo", title: "Título", action: "Salvar" },
  ];
  for (const draft of drafts) {
    let mutationRequests = 0;
    const progressiveActions: string[] = [];
    const unexpectedMutations: string[] = [];
    const listener = (request: Request) => {
      const url = new URL(request.url());
      if (url.origin !== expectedApiOrigin) return;
      let action = "";
      try {
        const body = request.postDataJSON() as { action?: unknown };
        action = typeof body?.action === "string" ? body.action : "";
      } catch {
        // Requests without a JSON command body are classified below by method/path.
      }
      const progressiveRequest = url.pathname.endsWith("/functions/v1/cms-drafts-v2");
      if (progressiveRequest && action) progressiveActions.push(action);
      if (looksLikeMutationRequest(request)) {
        mutationRequests += 1;
        if (!draft.progressive || !progressiveRequest || !/^(?:create|patch)$/i.test(action)) {
          unexpectedMutations.push(`${request.method()} ${safePath(request.url())} ${action || "-"}`);
        }
      }
    };
    page.on("request", listener);
    await page.goto(draft.route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
    const title = page.getByLabel(draft.title, { exact: true }).first();
    await expect(title).toHaveValue("");
    if (draft.progressive) {
      const progressiveState = page.locator(".admin-draft-indicator, .admin-draft-recovery");
      await expect(progressiveState).toContainText(
        /rascunho progressivo pronto|rascunho salvo no servidor|rascunho recuperável no servidor/i,
        { timeout: 20_000 },
      );
      const keepLocal = page.getByRole("button", { name: "Manter versão deste navegador" });
      if (await keepLocal.isVisible().catch(() => false)) await keepLocal.click();
    }
    const action = page.getByRole("button", { name: draft.action, exact: true }).first();
    if (draft.progressive) await expect(action).toBeEnabled({ timeout: 20_000 });
    if (await action.isEnabled().catch(() => false)) {
      await action.click();
      if (draft.progressive) {
        await expect(
          page.getByText("Rascunho incompleto salvo de forma privada. Continue quando estiver pronto."),
        ).toBeVisible({ timeout: 20_000 });
      } else await page.waitForTimeout(100);
    }
    page.off("request", listener);
    if (draft.progressive) {
      if (!progressiveActions.some((candidate) => candidate === "create" || candidate === "resume")) {
        throw new Error("O produto novo não abriu nem retomou um rascunho progressivo privado.");
      }
      if (unexpectedMutations.length) {
        throw new Error(
          `O produto incompleto alcançou uma persistência fora do rascunho privado: ${unexpectedMutations.join(", ")}`,
        );
      }
    } else if (mutationRequests !== 0) {
      throw new Error(`${safePath(draft.route)} tentou persistir um rascunho novo incompleto.`);
    }
    const invalidState = page.locator(
      '[role="alert"], .admin-contract-status.is-invalid, .admin-builder-status, .admin-notice--error',
    );
    await expect(
      invalidState.filter({ hasText: /incomplet|inválid|ajuste|obrigat|pendente/i }).first(),
    ).toBeVisible();
  }
}

async function archiveEditorialSurface(page: Page, plan: EditorialSurfacePlan, expectedApiOrigin: string) {
  await page.goto(plan.adminPath, { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  const state = ((await editorialStateLocator(page, plan).textContent()) ?? "").trim();
  if (state.includes("archived") || state.includes("trashed")) {
    return {
      step: `${plan.kind}_cleanup_already_archived`,
      result: "passed",
      backendStatus: "archived",
    } satisfies MutationStepEvidence;
  }
  if (plan.kind === "product") await page.getByRole("tab", { name: "SEO e publicação" }).click();
  const buttonName = state.includes("published")
    ? plan.archiveButton
    : plan.archiveButton.replace("Despublicar e arquivar", "Arquivar");
  const archived = await clickEditorialAction(
    page,
    "archive",
    "archived",
    () => page.getByRole("button", { name: buttonName, exact: true }).click(),
    expectedApiOrigin,
  );
  return { ...archived.evidence, step: `${plan.kind}_cleanup_archive` };
}

async function expectEditorialTitle(page: Page, plan: EditorialSurfacePlan, expectedTitle: string) {
  if (plan.kind === "product") await page.getByRole("tab", { name: "Dados essenciais" }).click();
  if (["service", "industry", "application", "solution"].includes(plan.kind)) {
    await page.getByRole("tab", { name: "Conteúdo" }).click();
  }
  await expect(page.getByLabel(plan.titleLabel, { exact: true })).toHaveValue(expectedTitle);
}

async function runEditorialSurfaceLifecycle(input: {
  page: Page;
  context: BrowserContext;
  plan: EditorialSurfacePlan;
  runTag: string;
  expectedSha: string;
  expectedApiOrigin: string;
  expectedUnavailableQueries: Set<string>;
  steps: MutationStepEvidence[];
  form?: SyntheticFormFixture;
  retainPublished?: boolean;
}) {
  const {
    page,
    context,
    plan,
    runTag,
    expectedSha,
    expectedApiOrigin,
    expectedUnavailableQueries,
    steps,
    form,
    retainPublished = false,
  } = input;
  const surfaceId = editorialSurfaceId(plan.kind, "edit");
  const response = await page.goto(plan.adminPath, { waitUntil: "domcontentloaded" });
  if (response?.status() !== 200 || response.headers()["x-release"] !== expectedSha) {
    throw new Error(`${plan.kind}: o editor não foi servido pelo SHA homologado.`);
  }
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  await expectEditorialState(page, plan, "draft");
  const publicPath = await currentEditorialPublicPath(page, plan);
  if (!publicPath.startsWith(`${plan.publicPrefix}/`)) {
    throw new Error(`${plan.kind}: rota pública sintética não pertence ao consumidor esperado.`);
  }
  const revisionOne = {
    title: `${runTag} ${plan.kind.toUpperCase()} R1`,
    summary: `${runTag} ${plan.kind} revisão sintética controlada R1.`,
    seoTitle: `${runTag} ${plan.kind.toUpperCase()} R1 | GAIATEC`,
    publicPath,
    reason: `${runTag} revisão humana ${plan.kind} R1`,
  };
  const revisionTwo = {
    title: `${runTag} ${plan.kind.toUpperCase()} R2`,
    summary: `${runTag} ${plan.kind} revisão sintética controlada R2.`,
    seoTitle: `${runTag} ${plan.kind.toUpperCase()} R2 | GAIATEC`,
    publicPath,
    reason: `${runTag} revisão humana ${plan.kind} R2`,
  };

  await fillEditorialRevision(page, plan, revisionOne);
  if (plan.kind === "campaign" && form) await bindSyntheticFormToCampaign(page, form);
  const saveButton = page.getByRole("button", { name: plan.saveButton, exact: true }).first();
  await expect(saveButton, `${plan.kind}: a UI precisa expor o salvamento da revisão`).toBeVisible();
  const firstSave = await clickEditorialAction(
    page,
    "save",
    "draft",
    () => saveButton.click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.saveButton,
      scenarioId: `${plan.kind}-save-revision-1-via-ui`,
    },
  );
  if (firstSave.itemId !== plan.itemId) throw new Error(`${plan.kind}: save confirmou outro item.`);
  steps.push({ ...firstSave.evidence, step: `${plan.kind}_save_revision_1` });
  await expectEditorialPersistence(page, plan, revisionOne);
  steps.push({ step: `${plan.kind}_reload_persistence_revision_1`, result: "passed" });

  const submitted = await clickEditorialAction(
    page,
    "submit",
    "in_review",
    () => page.getByRole("button", { name: plan.submitButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.submitButton,
      scenarioId: `${plan.kind}-submit-revision-1-via-ui`,
    },
  );
  if (submitted.itemId !== plan.itemId) throw new Error(`${plan.kind}: submit confirmou outro item.`);
  steps.push({ ...submitted.evidence, step: `${plan.kind}_submit_revision_1` });
  await expectEditorialState(page, plan, "in_review");
  const approved = await clickEditorialAction(
    page,
    "approve",
    "approved",
    () => page.getByRole("button", { name: plan.approveButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.approveButton,
      scenarioId: `${plan.kind}-approve-revision-1-via-ui`,
    },
  );
  if (approved.itemId !== plan.itemId) throw new Error(`${plan.kind}: approve confirmou outro item.`);
  steps.push({ ...approved.evidence, step: `${plan.kind}_approve_revision_1` });
  await expectEditorialState(page, plan, "approved");
  steps.push(
    await expectEditorialPrivatePreview(
      page,
      context,
      plan,
      revisionOne.title,
      expectedSha,
      expectedApiOrigin,
    ),
  );
  const firstPublish = await clickEditorialAction(
    page,
    "publish",
    "published",
    () => page.getByRole("button", { name: plan.publishButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.publishButton,
      scenarioId: `${plan.kind}-publish-revision-1-via-ui`,
    },
  );
  if (firstPublish.itemId !== plan.itemId) throw new Error(`${plan.kind}: publish confirmou outro item.`);
  steps.push({ ...firstPublish.evidence, step: `${plan.kind}_publish_revision_1` });
  await expectEditorialState(page, plan, "published");
  steps.push(
    await expectPublicEditorialRevision(
      context,
      plan,
      publicPath,
      revisionOne.title,
      revisionOne.seoTitle,
      expectedSha,
      expectedApiOrigin,
      plan.kind === "campaign" ? form : undefined,
    ),
  );

  await fillEditorialRevision(page, plan, revisionTwo);
  const publishedSaveButton = page
    .getByRole("button", { name: plan.publishedSaveButton ?? plan.saveButton, exact: true })
    .first();
  await expect(
    publishedSaveButton,
    `${plan.kind}: a UI precisa expor nova versão para conteúdo publicado`,
  ).toBeVisible();
  const reopenPromise = waitForEditorialResponse(page, "reopen", expectedApiOrigin);
  const secondSavePromise = clickEditorialAction(
    page,
    "save",
    "draft",
    () => publishedSaveButton.click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.publishedSaveButton ?? plan.saveButton,
      scenarioId: `${plan.kind}-reopen-and-save-revision-2-via-ui`,
    },
  );
  const [reopenResponse, secondSave] = await Promise.all([reopenPromise, secondSavePromise]);
  const reopened = await editorialResponseEvidence(reopenResponse, "reopen", "draft");
  registerSemanticActionEvidence(
    {
      surfaceId,
      controlName: plan.publishedSaveButton ?? plan.saveButton,
      scenarioId: `${plan.kind}-reopen-and-save-revision-2-via-ui`,
    },
    "reopen",
    reopenResponse.status(),
    "draft",
  );
  if (reopened.itemId !== plan.itemId || secondSave.itemId !== plan.itemId) {
    throw new Error(`${plan.kind}: reopen/save confirmou outro item.`);
  }
  steps.push({ ...reopened.evidence, step: `${plan.kind}_reopen_revision_2` });
  steps.push({ ...secondSave.evidence, step: `${plan.kind}_save_revision_2` });
  await expectEditorialPersistence(page, plan, revisionTwo);
  steps.push({ step: `${plan.kind}_reload_persistence_revision_2`, result: "passed" });

  const secondSubmitted = await clickEditorialAction(
    page,
    "submit",
    "in_review",
    () => page.getByRole("button", { name: plan.submitButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.submitButton,
      scenarioId: `${plan.kind}-submit-revision-2-via-ui`,
    },
  );
  steps.push({ ...secondSubmitted.evidence, step: `${plan.kind}_submit_revision_2` });
  await expectEditorialState(page, plan, "in_review");
  const secondApproved = await clickEditorialAction(
    page,
    "approve",
    "approved",
    () => page.getByRole("button", { name: plan.approveButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.approveButton,
      scenarioId: `${plan.kind}-approve-revision-2-via-ui`,
    },
  );
  steps.push({ ...secondApproved.evidence, step: `${plan.kind}_approve_revision_2` });
  await expectEditorialState(page, plan, "approved");
  const secondPublished = await clickEditorialAction(
    page,
    "publish",
    "published",
    () => page.getByRole("button", { name: plan.publishButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.publishButton,
      scenarioId: `${plan.kind}-publish-revision-2-via-ui`,
    },
  );
  steps.push({ ...secondPublished.evidence, step: `${plan.kind}_publish_revision_2` });
  await expectEditorialState(page, plan, "published");
  steps.push(
    await expectPublicEditorialRevision(
      context,
      plan,
      publicPath,
      revisionTwo.title,
      revisionTwo.seoTitle,
      expectedSha,
      expectedApiOrigin,
      plan.kind === "campaign" ? form : undefined,
    ),
  );

  if (plan.kind === "product") await page.getByRole("tab", { name: "SEO e publicação" }).click();
  const revisionOneEntry = ["service", "industry", "application", "solution"].includes(plan.kind)
    ? page.locator("li").filter({ hasText: /^Revisão 1 —/ })
    : page.locator("details").filter({ hasText: /^Revisão 1 —/ });
  await expect(revisionOneEntry).toHaveCount(1);
  if (
    plan.kind !== "service" &&
    plan.kind !== "industry" &&
    plan.kind !== "application" &&
    plan.kind !== "solution"
  ) {
    await revisionOneEntry.locator("summary").click();
  }
  const restored = await clickEditorialAction(
    page,
    "restore",
    "published",
    () => revisionOneEntry.getByRole("button", { name: plan.restoreButton, exact: true }).click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.restoreButton,
      scenarioId: `${plan.kind}-restore-revision-1-via-ui`,
    },
  );
  if (restored.itemId !== plan.itemId) throw new Error(`${plan.kind}: restore confirmou outro item.`);
  steps.push({ ...restored.evidence, step: `${plan.kind}_restore_revision_1` });
  await expectEditorialState(page, plan, "published");
  await expectEditorialTitle(page, plan, revisionOne.title);
  steps.push(
    await expectPublicEditorialRevision(
      context,
      plan,
      publicPath,
      revisionOne.title,
      revisionOne.seoTitle,
      expectedSha,
      expectedApiOrigin,
      plan.kind === "campaign" ? form : undefined,
    ),
  );

  if (plan.kind === "product") await page.getByRole("tab", { name: "SEO e publicação" }).click();
  const archived = await clickEditorialAction(
    page,
    "archive",
    "archived",
    () => page.getByRole("button", { name: plan.archiveButton, exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId,
      controlName: plan.archiveButton,
      scenarioId: `${plan.kind}-archive-after-restore-via-ui`,
    },
  );
  if (archived.itemId !== plan.itemId) throw new Error(`${plan.kind}: archive confirmou outro item.`);
  steps.push({ ...archived.evidence, step: `${plan.kind}_archive_after_restore` });
  await expectEditorialState(page, plan, "archived");
  expectedUnavailableQueries.add(publicQueryEvidenceKey(plan, publicPath));
  steps.push(await expectEditorialUnavailable(context, plan, publicPath, revisionOne.title, expectedSha));
  if (retainPublished) {
    const archivedRevisionOne = ["service", "industry", "application", "solution"].includes(plan.kind)
      ? page.locator("li").filter({ hasText: /^Revisão 1 —/ })
      : page.locator("details").filter({ hasText: /^Revisão 1 —/ });
    await expect(archivedRevisionOne).toHaveCount(1);
    if (!["service", "industry", "application", "solution"].includes(plan.kind)) {
      if (!(await archivedRevisionOne.evaluate((element) => element.hasAttribute("open")))) {
        await archivedRevisionOne.locator("summary").click();
      }
    }
    const retained = await clickEditorialAction(
      page,
      "restore",
      "published",
      () => archivedRevisionOne.getByRole("button", { name: plan.restoreButton, exact: true }).click(),
      expectedApiOrigin,
      {
        surfaceId,
        controlName: plan.restoreButton,
        scenarioId: `${plan.kind}-restore-for-downstream-via-ui`,
      },
    );
    if (retained.itemId !== plan.itemId) {
      throw new Error(`${plan.kind}: restauração para handoff confirmou outro item.`);
    }
    expectedUnavailableQueries.delete(publicQueryEvidenceKey(plan, publicPath));
    steps.push({ ...retained.evidence, step: `${plan.kind}_restore_for_downstream_handoff` });
    steps.push(
      await expectPublicEditorialRevision(
        context,
        plan,
        publicPath,
        revisionOne.title,
        revisionOne.seoTitle,
        expectedSha,
        expectedApiOrigin,
        plan.kind === "campaign" ? form : undefined,
      ),
    );
    return { publicPath, finalTitle: revisionOne.title, retainedPublished: true as const };
  }
  return { publicPath, finalTitle: revisionOne.title, retainedPublished: false as const };
}

type PublishedLifecycleResult = Awaited<ReturnType<typeof runEditorialSurfaceLifecycle>>;

async function createComparisonProductViaUi(input: {
  page: Page;
  context: BrowserContext;
  ids: Omit<SyntheticIds, "pageId">;
  runTag: string;
  expectedSha: string;
  expectedApiOrigin: string;
  expectedUnavailableQueries: Set<string>;
  steps: MutationStepEvidence[];
}) {
  const { page, context, ids, runTag, expectedSha, expectedApiOrigin, expectedUnavailableQueries, steps } =
    input;
  await page.goto("/admin/produtos/novo", { waitUntil: "domcontentloaded" });
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
  const comparisonTag = `${runTag}-COMPARACAO`;
  await fillSyntheticProductForCreate(page, comparisonTag);
  const created = await clickEditorialAction(
    page,
    "create",
    "draft",
    () => page.getByRole("button", { name: "Salvar rascunho", exact: true }).first().click(),
    expectedApiOrigin,
    {
      surfaceId: "product-create",
      controlName: "Salvar rascunho",
      scenarioId: "comparison-product-create-via-ui",
    },
  );
  await page.waitForURL(/\/admin\/produtos\/[0-9a-f-]{36}$/i, { timeout: 20_000 });
  const plan = editorialSurfacePlans({ ...ids, productId: created.itemId }).find(
    (candidate) => candidate.kind === "product",
  );
  if (!plan) throw new Error("Produto sintético auxiliar não gerou plano editorial.");
  const lifecycle = await runEditorialSurfaceLifecycle({
    page,
    context,
    plan,
    runTag: comparisonTag,
    expectedSha,
    expectedApiOrigin,
    expectedUnavailableQueries,
    steps,
    retainPublished: true,
  });
  return { plan, lifecycle };
}

async function expectSupplementalPublicConsumers(input: {
  context: BrowserContext;
  plans: EditorialSurfacePlan[];
  lifecycles: Map<EditorialSurfaceKind, PublishedLifecycleResult>;
  comparison: { plan: EditorialSurfacePlan; lifecycle: PublishedLifecycleResult };
  form: SyntheticFormFixture;
  expectedSha: string;
}) {
  const { context, plans, lifecycles, comparison, expectedSha } = input;
  const publicPage = await context.newPage();
  const check = async (path: string, expectedText: string) => {
    await expect(async () => {
      const response = await publicPage.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
      if (response?.status() !== 200 || response.headers()["x-release"] !== expectedSha) {
        throw new Error(`Consumidor público ${safePath(path)} não respondeu no SHA candidato.`);
      }
      await expect(publicPage.getByText(expectedText, { exact: false }).first()).toBeVisible({
        timeout: 20_000,
      });
    }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
  };
  try {
    const post = plans.find((plan) => plan.kind === "post")!;
    const postLifecycle = lifecycles.get("post")!;
    const postSlug = postLifecycle.publicPath.split("/").filter(Boolean).at(-1)!;
    await check(`/cms/conteudo/${postSlug}`, postLifecycle.finalTitle);
    registerEditorialHttpConsumer(
      post,
      "/cms/conteudo/:slug",
      "post-generic-public-consumer-after-rollback",
      expectedSha,
    );

    const product = plans.find((plan) => plan.kind === "product")!;
    const productLifecycle = lifecycles.get("product")!;
    await check("/produtos", productLifecycle.finalTitle);
    registerEditorialHttpConsumer(
      product,
      "/produtos",
      "product-catalog-consumer-after-rollback",
      expectedSha,
    );
    await check(`/busca?q=${encodeURIComponent(productLifecycle.finalTitle)}`, productLifecycle.finalTitle);
    registerEditorialHttpConsumer(product, "/busca", "product-search-consumer-after-rollback", expectedSha);
    const productSlug = productLifecycle.publicPath.split("/").filter(Boolean).at(-1)!;
    const comparisonSlug = comparison.lifecycle.publicPath.split("/").filter(Boolean).at(-1)!;
    await check(
      `/produtos/comparador?produtos=${encodeURIComponent(`${productSlug},${comparisonSlug}`)}`,
      productLifecycle.finalTitle,
    );
    await expect(
      publicPage.getByText(comparison.lifecycle.finalTitle, { exact: false }).first(),
    ).toBeVisible();
    registerEditorialHttpConsumer(
      product,
      "/produtos/comparador",
      "product-comparison-two-ui-created-products",
      expectedSha,
    );

    const discoveryPlans = plans.filter((plan) =>
      ["service", "industry", "application", "solution"].includes(plan.kind),
    );
    const consumers = ["/servicos", "/industrias", "/aplicacoes", "/solucoes e respectivas rotas :slug"];
    for (const plan of discoveryPlans) {
      const lifecycle = lifecycles.get(plan.kind)!;
      await check(plan.publicPrefix, lifecycle.finalTitle);
    }
    for (const owner of discoveryPlans) {
      for (let index = 0; index < consumers.length; index += 1) {
        registerEditorialHttpConsumer(
          owner,
          consumers[index]!,
          `discovery-suite-consumer-${index}-after-rollback`,
          expectedSha,
        );
      }
    }

    for (const consumer of ["CmsLeadForm", "páginas/campanhas com formulário incorporado"]) {
      const consumerContractKey = publicConsumerContractKey("forms", consumer, 0);
      registerPublicConsumerEvidence({
        surfaceId: "forms",
        consumer,
        consumerOccurrence: 0,
        consumerKind: "downstream-contract",
        scenarioId: "published-form-rendered-inside-ui-created-campaign",
        evidenceReference: semanticScenarioReference(
          "published-form-rendered-inside-ui-created-campaign",
          consumerContractKey,
          "form-contract-and-invalid-submit-verified",
        ),
        expectedStatus: null,
        observedStatus: null,
        contractResult: "passed",
        noInternalOrUnpublishedContent: true,
        cacheInvalidation: "not-applicable",
        cacheJustification:
          "O formulário versionado é resolvido pelo contrato público da campanha sem cache próprio.",
      });
    }
  } finally {
    await publicPage.close();
  }
}

async function expectEditorialAudit(
  page: Page,
  plans: EditorialSurfacePlan[],
  runTag: string,
  form?: SyntheticFormFixture,
): Promise<MutationStepEvidence> {
  await page.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Trilha imutável de auditoria" })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel("Usuário").selectOption({ label: `Operador QA ${runTag}` });
  for (const plan of plans) {
    const target = `content_item:${plan.itemId}`;
    const archiveRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: target, exact: true }) })
      .filter({ hasText: "cms content archive" });
    await expect(archiveRow.first(), `${plan.kind}: archive precisa aparecer na auditoria`).toBeVisible({
      timeout: 20_000,
    });
  }
  if (form) {
    const formArchiveRow = page
      .getByRole("row")
      .filter({ has: page.getByRole("cell", { name: `form:${form.formId}`, exact: true }) })
      .filter({ hasText: "cms form archive" });
    await expect(formArchiveRow.first(), "form: archive precisa aparecer na auditoria").toBeVisible({
      timeout: 20_000,
    });
  }
  return { step: "all_editorial_archives_visible_in_immutable_audit", result: "passed" };
}

function mergeReport(section: string, value: unknown) {
  const current = (() => {
    try {
      return JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
    } catch {
      return {};
    }
  })();
  const source = inventory();
  const activeRunTag = process.env.QA_CMS_RUN_TAG ?? current.runTag ?? null;
  const report = {
    ...current,
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    sourceSha: source.sourceSha,
    runTag: activeRunTag,
    inventory: source.counts,
    documentationCrossCheck: source.documentationCrossCheck,
    credentialsPersisted: false,
    syntheticDataValuesPersisted: false,
    sealedPreviewRouting: sealedPreviewRoutingEvidence(),
    semanticActions: mergeEvidenceByKey(
      current.semanticActions,
      semanticActionEvidence.values(),
      (entry) => entry.controlContractKey,
    ),
    semanticFields: mergeEvidenceByKey(
      current.semanticFields,
      semanticFieldEvidence.values(),
      (entry) => entry.fieldContractKey,
    ),
    semanticStructures: mergeEvidenceByKey(
      current.semanticStructures,
      semanticStructureEvidence.values(),
      (entry) => entry.structureContractKey,
    ),
    publicConsumerEvidence: mergeEvidenceByKey(
      current.publicConsumerEvidence,
      publicConsumerEvidence.values(),
      (entry) => entry.consumerContractKey,
    ),
    [section]: value,
  };
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function representativePath(template: string): string {
  return template.replace(/\{\{[^}]+\}\}/g, "00000000-0000-4000-8000-000000000001");
}

function resolveSyntheticPath(template: string, ids: SyntheticIds): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_match, key: string) => {
    if (!requiredSyntheticIds.includes(key as keyof SyntheticIds)) {
      throw new Error(`Placeholder de ID não classificado: ${key}`);
    }
    return ids[key as keyof SyntheticIds];
  });
}

function normalizedControlName(value: string): string {
  const sanitized = redact(value)
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi, "[uuid]")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized.length > 120 ? `${sanitized.slice(0, 117)}...` : sanitized || "[sem nome acessível]";
}

async function collectControls(page: Page): Promise<RuntimeControl[]> {
  const controls = await page
    .locator(
      'input, select, textarea, button, a[href], form, dialog[open], [role="dialog"], [role="alertdialog"], aside[aria-label], [role="tab"], [role="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], [role="slider"]',
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        const html = element as HTMLElement;
        const style = getComputedStyle(html);
        const rect = html.getBoundingClientRect();
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          rect.width === 0 ||
          rect.height === 0
        ) {
          return [];
        }
        const input = element as HTMLInputElement;
        const role = element.getAttribute("role");
        const labels =
          "labels" in input && input.labels ? [...input.labels].map((label) => label.innerText) : [];
        const name =
          element.getAttribute("aria-label") ||
          element.getAttribute("title") ||
          labels.join(" ") ||
          html.innerText ||
          element.getAttribute("placeholder") ||
          element.getAttribute("name") ||
          "";
        const tag = element.tagName.toLowerCase();
        const constraints: Record<string, string | number> = {};
        for (const attribute of ["min", "max", "minlength", "maxlength", "pattern", "step"] as const) {
          const attributeValue = element.getAttribute(attribute);
          if (attributeValue !== null) constraints[attribute] = attributeValue;
        }
        return [
          {
            tag,
            role,
            name,
            type: element.getAttribute("type"),
            required: element.hasAttribute("required"),
            disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
            readOnly: element.hasAttribute("readonly") || element.getAttribute("aria-readonly") === "true",
            constraints,
            destination: tag === "a" ? element.getAttribute("href") : null,
          },
        ];
      }),
    );
  return controls.map((control) => {
    const kind =
      control.tag === "form"
        ? "form"
        : control.tag === "dialog" ||
            control.role === "dialog" ||
            control.role === "alertdialog" ||
            control.tag === "aside"
          ? "dialog"
          : control.role === "tab"
            ? "tab"
            : ["input", "select", "textarea"].includes(control.tag) ||
                ["switch", "checkbox", "radio", "slider"].includes(control.role ?? "")
              ? "field"
              : control.tag === "button" || control.role === "menuitem"
                ? "action"
                : control.tag === "a"
                  ? "link"
                  : "other";
    return {
      ...control,
      kind,
      name: normalizedControlName(control.name),
      destination: control.destination ? safePath(control.destination) : null,
    } as RuntimeControl;
  });
}

function mergeControls(...groups: RuntimeControl[][]): RuntimeControl[] {
  const controls = new Map<string, RuntimeControl>();
  for (const control of groups.flat()) {
    const key = JSON.stringify(control);
    if (!controls.has(key)) controls.set(key, control);
  }
  return [...controls.values()];
}

function emptyControlInteraction(
  mode: ControlInteractionSummary["mode"] = "observed-only",
): ControlInteractionSummary {
  return {
    mode,
    fieldsSeen: 0,
    fieldsExercised: 0,
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
    unexpectedMutationRequests: 0,
    semanticBindings: [],
    semanticExecutions: [],
  };
}

function mergeControlInteractions(...summaries: ControlInteractionSummary[]): ControlInteractionSummary {
  const merged = emptyControlInteraction(
    summaries.some((summary) => summary.mode === "mutated-and-restored")
      ? "mutated-and-restored"
      : "observed-only",
  );
  for (const summary of summaries) {
    merged.fieldsSeen += summary.fieldsSeen;
    merged.fieldsExercised += summary.fieldsExercised;
    merged.actionsSeen += summary.actionsSeen;
    merged.actionsFocused += summary.actionsFocused;
    merged.actionsExecuted += summary.actionsExecuted;
    merged.actionsExecutionReferenced += summary.actionsExecutionReferenced;
    merged.actionsStateAsserted += summary.actionsStateAsserted;
    merged.linksSeen += summary.linksSeen;
    merged.linksFocused += summary.linksFocused;
    merged.linksExecuted += summary.linksExecuted;
    merged.unsupported.push(...summary.unsupported);
    merged.failures.push(...summary.failures);
    merged.unexpectedMutationRequests += summary.unexpectedMutationRequests;
    for (const binding of summary.semanticBindings) {
      if (!merged.semanticBindings.some((candidate) => candidate.controlId === binding.controlId)) {
        merged.semanticBindings.push(binding);
      }
    }
    for (const execution of summary.semanticExecutions) {
      const index = merged.semanticExecutions.findIndex(
        (candidate) =>
          candidate.surfaceId === execution.surfaceId &&
          candidate.controlId === execution.controlId &&
          candidate.viewport === execution.viewport,
      );
      if (index < 0) merged.semanticExecutions.push(execution);
      else if (execution.status === "failed") merged.semanticExecutions[index] = execution;
    }
  }
  const successfulExecutions = merged.semanticExecutions.filter(
    (execution) => execution.status === "passed" && execution.handlerExecuted,
  );
  merged.fieldsSeen = merged.semanticBindings.filter((binding) => binding.kind === "field").length;
  merged.fieldsExercised = successfulExecutions.filter((execution) => execution.kind === "field").length;
  merged.actionsSeen = merged.semanticBindings.filter((binding) => binding.kind === "action").length;
  merged.actionsExecutionReferenced = successfulExecutions.filter(
    (execution) => execution.kind === "action" && execution.executionScope === "scenario-once",
  ).length;
  merged.actionsStateAsserted = successfulExecutions.filter(
    (execution) => execution.classification === "action.disabled",
  ).length;
  merged.actionsExecuted = successfulExecutions.filter(
    (execution) =>
      execution.kind === "action" &&
      execution.executionScope === "viewport-local" &&
      execution.classification !== "action.disabled",
  ).length;
  merged.linksSeen = merged.semanticBindings.filter((binding) => binding.kind === "link").length;
  merged.linksExecuted = successfulExecutions.filter((execution) => execution.kind === "link").length;
  return merged;
}

async function controlName(control: Locator, index: number) {
  const raw = await control.evaluate((element) => {
    const input = element as HTMLInputElement;
    const labels = "labels" in input && input.labels ? [...input.labels].map((label) => label.innerText) : [];
    return (
      element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      labels.join(" ") ||
      (element as HTMLElement).innerText ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      ""
    );
  });
  return normalizedControlName(raw || `controle ${index + 1}`);
}

function looksLikeMutationRequest(request: Request) {
  const method = request.method();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  const url = new URL(request.url());
  if (url.pathname.includes("/rest/v1/")) return true;
  if (!url.pathname.includes("/functions/v1/")) return false;
  let body: unknown;
  try {
    body = request.postDataJSON();
  } catch {
    return false;
  }
  const action =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).action === "string"
      ? String((body as Record<string, unknown>).action)
      : "";
  return /^(?:create|save|submit|approve|publish|schedule|reopen|restore|retire|archive|delete|invite|update|execute|reprocess|assign|anonymize|generate|reserve|finalize|upsert|set_)/i.test(
    action,
  );
}

async function runtimeControlFromLocator(
  control: Locator,
  index: number,
  kind: RuntimeControl["kind"],
): Promise<RuntimeControl> {
  const attributes = await control.evaluate((element) => ({
    tag: element.tagName.toLowerCase(),
    role: element.getAttribute("role"),
    type: element.getAttribute("type"),
    required: element.hasAttribute("required"),
    disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true",
    readOnly: element.hasAttribute("readonly") || element.getAttribute("aria-readonly") === "true",
    destination: element.tagName.toLowerCase() === "a" ? element.getAttribute("href") : null,
  }));
  return {
    ...attributes,
    kind,
    name: await controlName(control, index),
    constraints: {},
    destination: attributes.destination ? safePath(attributes.destination) : null,
  };
}

function semanticMutationEvidence(surfaceId: string, name: string, controlOccurrence: number) {
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA;
  const expectedRunTag = process.env.QA_CMS_RUN_TAG;
  if (
    !expectedSha ||
    !/^[0-9a-f]{40}$/i.test(expectedSha) ||
    !expectedRunTag ||
    !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(expectedRunTag) ||
    !expectedRunTag.endsWith(`-${expectedSha.slice(0, 8).toLowerCase()}`)
  ) {
    return null;
  }
  const evidenceFiles = [
    reportPath,
    resolve(repositoryRoot, process.env.QA_CMS_AUTH_REPORT_PATH ?? "outputs/cms-auth-lifecycle.json"),
    resolve(repositoryRoot, process.env.QA_CMS_ADMIN_OPS_REPORT_PATH ?? "outputs/cms-admin-ops-cycles.json"),
    resolve(
      repositoryRoot,
      process.env.QA_CMS_SECONDARY_REPORT_PATH ?? "outputs/cms-secondary-ui-cycles.json",
    ),
    resolve(
      repositoryRoot,
      process.env.QA_CMS_SECURITY_REPORT_PATH ?? "outputs/cms-security-boundaries.json",
    ),
  ];
  const evidence: Array<CmsMutatingActionEvidence & { evidenceFile: string }> = [];
  for (const evidenceFile of evidenceFiles) {
    try {
      const report = JSON.parse(readFileSync(evidenceFile, "utf8")) as Record<string, unknown>;
      const reportSha = report.sourceSha ?? report.candidateSha;
      if (
        typeof reportSha !== "string" ||
        reportSha.toLowerCase() !== expectedSha.toLowerCase() ||
        report.runTag !== expectedRunTag ||
        !Array.isArray(report.semanticActions)
      ) {
        continue;
      }
      const relativeEvidenceFile = evidenceFile.slice(repositoryRoot.length + 1).replaceAll("\\", "/");
      for (const item of report.semanticActions as CmsMutatingActionEvidence[]) {
        evidence.push({ ...item, evidenceFile: relativeEvidenceFile });
      }
    } catch {
      // A missing report is a fail-closed semantic result below.
    }
  }
  const resolved = resolveCmsMutatingActionEvidence({
    surfaceId,
    controlName: name,
    controlOccurrence,
    evidence,
  });
  const match = evidence.find(
    (item) => item.controlContractKey === resolved.controlContractKey && item.surfaceId === surfaceId,
  );
  return match
    ? {
        reference: `${match.evidenceFile}#semanticActions/${resolved.controlContractKey}`,
        controlContractKey: resolved.controlContractKey,
      }
    : null;
}

function semanticScenarioReports(): Array<{ report: Record<string, unknown>; evidenceFile: string }> {
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA;
  const expectedRunTag = process.env.QA_CMS_RUN_TAG;
  if (
    !expectedSha ||
    !/^[0-9a-f]{40}$/i.test(expectedSha) ||
    !expectedRunTag ||
    !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(expectedRunTag) ||
    !expectedRunTag.endsWith(`-${expectedSha.slice(0, 8).toLowerCase()}`)
  ) {
    return [];
  }
  const evidenceFiles = [
    reportPath,
    resolve(repositoryRoot, process.env.QA_CMS_AUTH_REPORT_PATH ?? "outputs/cms-auth-lifecycle.json"),
    resolve(repositoryRoot, process.env.QA_CMS_ADMIN_OPS_REPORT_PATH ?? "outputs/cms-admin-ops-cycles.json"),
    resolve(
      repositoryRoot,
      process.env.QA_CMS_SECONDARY_REPORT_PATH ?? "outputs/cms-secondary-ui-cycles.json",
    ),
    resolve(
      repositoryRoot,
      process.env.QA_CMS_SECURITY_REPORT_PATH ?? "outputs/cms-security-boundaries.json",
    ),
  ];
  return evidenceFiles.flatMap((evidenceFile) => {
    try {
      const report = JSON.parse(readFileSync(evidenceFile, "utf8")) as Record<string, unknown>;
      const reportSha = report.sourceSha ?? report.candidateSha;
      if (
        typeof reportSha !== "string" ||
        reportSha.toLowerCase() !== expectedSha.toLowerCase() ||
        report.runTag !== expectedRunTag
      ) {
        return [];
      }
      return [
        {
          report,
          evidenceFile: evidenceFile.slice(repositoryRoot.length + 1).replaceAll("\\", "/"),
        },
      ];
    } catch {
      return [];
    }
  });
}

function semanticStateSetupsForSurface(surfaceId: string) {
  const candidates: Array<CmsSemanticStateSetup & { evidenceFile: string }> = [];
  for (const { report, evidenceFile } of semanticScenarioReports()) {
    if (!Array.isArray(report.semanticStateSetups)) continue;
    for (const entry of report.semanticStateSetups as CmsSemanticStateSetup[]) {
      if (entry.surfaceId === surfaceId) candidates.push({ ...entry, evidenceFile });
    }
  }
  const keys = new Set<string>();
  return candidates
    .map((candidate) => {
      if (keys.has(candidate.stateContractKey)) {
        throw new Error(`CMS_SEMANTIC_STATE_SETUP_DUPLICATE:${candidate.stateContractKey}`);
      }
      keys.add(candidate.stateContractKey);
      const resolved = resolveCmsSemanticStateSetup({
        surfaceId,
        stateId: candidate.stateId,
        evidence: candidates,
      });
      const expectedReference = `${candidate.evidenceFile}#semanticStateSetups/${resolved.stateContractKey}`;
      if (resolved.evidenceReference !== expectedReference) {
        throw new Error(`CMS_SEMANTIC_STATE_SETUP_REFERENCE_INVALID:${resolved.stateContractKey}`);
      }
      return resolved;
    })
    .sort((left, right) => left.stateContractKey.localeCompare(right.stateContractKey));
}

function semanticStateRuntimeName(value: string, runtime: { runTag: string; createdLeadReference: string }) {
  return value
    .replaceAll("{{runTag}}", runtime.runTag)
    .replaceAll("{{runTagLower}}", runtime.runTag.toLowerCase())
    .replaceAll("{{createdLeadReference}}", runtime.createdLeadReference);
}

async function visibleOccurrence(locator: Locator, occurrence: number, description: string) {
  let visible = 0;
  for (let index = 0; index < (await locator.count()); index += 1) {
    const candidate = locator.nth(index);
    if (!(await candidate.isVisible().catch(() => false))) continue;
    if (visible === occurrence) return candidate;
    visible += 1;
  }
  throw new Error(`${description}: ocorrência visível ${occurrence} ausente`);
}

function semanticStateScope(
  page: Page,
  scope: CmsSemanticStateSetup["steps"][number]["scope"],
  runtime: { runTag: string; createdLeadReference: string },
) {
  if (scope === "page") return page.locator("body");
  if (scope === "created-lead-row") {
    return page.getByRole("row").filter({ hasText: runtime.createdLeadReference });
  }
  if (scope === "managed-user-row") {
    return page.getByRole("row").filter({ hasText: `Revisor QA gerenciado ${runtime.runTag}` });
  }
  if (scope === "run-tag-article") {
    return page
      .locator("article")
      .filter({ hasText: new RegExp(runtime.runTag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") });
  }
  return page.getByRole("row").filter({ hasText: runtime.runTag });
}

async function semanticStateStepLocator(
  page: Page,
  setup: CmsSemanticStateSetup,
  step: CmsSemanticStateSetup["steps"][number],
  runtime: { runTag: string; createdLeadReference: string },
) {
  const scope = semanticStateScope(page, step.scope, runtime);
  const name = semanticStateRuntimeName(step.accessibleName, runtime);
  const candidates =
    step.controlKind === "summary"
      ? scope.locator("summary").filter({ hasText: name })
      : step.controlKind === "field"
        ? scope.getByLabel(name, { exact: true })
        : scope.getByRole(step.controlKind, { name, exact: true });
  return visibleOccurrence(candidates, step.controlOccurrence, `${setup.stateContractKey}/${step.stepId}`);
}

async function expectedSemanticStateLocator(
  page: Page,
  setup: CmsSemanticStateSetup,
  runtime: { runTag: string; createdLeadReference: string },
) {
  const name = semanticStateRuntimeName(setup.expectedState.accessibleName, runtime);
  const candidates =
    setup.expectedState.kind === "open-details"
      ? page.locator("details[open]").filter({ has: page.locator("summary", { hasText: name }) })
      : setup.expectedState.kind === "field"
        ? page.getByLabel(name, { exact: true })
        : page.getByRole(setup.expectedState.role, { name, exact: true });
  return visibleOccurrence(
    candidates,
    setup.expectedState.occurrence,
    `${setup.stateContractKey}/expected-state`,
  );
}

async function restoreSemanticState(
  page: Page,
  setup: CmsSemanticStateSetup,
  runtime: { runTag: string; createdLeadReference: string },
) {
  if (setup.restore.operation === "reload-route") {
    await page.reload({ waitUntil: "domcontentloaded" });
    return;
  }
  if (setup.restore.operation === "escape") {
    await page.keyboard.press("Escape");
    return;
  }
  const name = semanticStateRuntimeName(setup.restore.accessibleName!, runtime);
  const candidates =
    setup.restore.controlKind === "summary"
      ? page.locator("summary").filter({ hasText: name })
      : page.getByRole("button", { name, exact: true });
  const control = await visibleOccurrence(
    candidates,
    setup.restore.controlOccurrence!,
    `${setup.stateContractKey}/restore`,
  );
  await control.click();
}

async function exerciseSemanticStateSetups(
  page: Page,
  surfaceId: string,
  route: string,
  viewport: CmsSemanticViewport,
  runtime: { runTag: string; createdLeadReference: string },
) {
  const controls: RuntimeControl[][] = [];
  const interactions: ControlInteractionSummary[] = [];
  const snapshots: RouteObservation["semanticStateSnapshots"] = [];
  const failures: string[] = [];
  for (const setup of semanticStateSetupsForSurface(surfaceId)) {
    const setupFailures: string[] = [];
    const mutationRequests: string[] = [];
    let capturedControls: RuntimeControl[] = [];
    let interaction = emptyControlInteraction();
    let restored = false;
    const requestListener = (request: Request) => {
      if (looksLikeMutationRequest(request)) mutationRequests.push(safePath(request.url()));
    };
    try {
      await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
      await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
      page.on("request", requestListener);
      for (const step of setup.steps) {
        const control = await semanticStateStepLocator(page, setup, step, runtime);
        if (step.operation === "activate") await control.click();
        else if (step.operation === "check") await control.check();
        else if (step.operation === "uncheck") await control.uncheck();
        else if (step.operation === "fill-run-tag") await control.fill(runtime.runTag);
        else if (step.operation === "select-option") {
          await control.selectOption(step.optionValue!);
          await expect(control).toHaveValue(step.optionValue!);
        } else {
          const option = await control
            .locator("option:not([disabled])")
            .evaluateAll(
              (options) =>
                options
                  .map((entry) => (entry as HTMLOptionElement).value)
                  .find((value) => value && value !== "__invalid__") ?? null,
            );
          if (!option) throw new Error(`${setup.stateContractKey}: seleção sem opção válida`);
          await control.selectOption(option);
        }
        await page.waitForTimeout(50);
      }
      const expectedState = await expectedSemanticStateLocator(page, setup, runtime);
      await expect(expectedState).toBeVisible();
      capturedControls = await collectControls(page);
      interaction = await exerciseRenderedControls(page, surfaceId, viewport, setup);
      await restoreSemanticState(page, setup, runtime);
      restored = !(await expectedState.isVisible().catch(() => false));
      if (!restored && setup.restore.operation === "reload-route") restored = true;
      if (!restored) setupFailures.push("estado condicional não foi fechado/restaurado");
    } catch (error) {
      setupFailures.push(redact(error instanceof Error ? error.message : String(error)));
    } finally {
      page.off("request", requestListener);
    }
    if (mutationRequests.length) {
      setupFailures.push(
        `${mutationRequests.length} request(s) mutante(s) durante replay de estado somente UI`,
      );
    }
    setupFailures.push(...interaction.failures);
    controls.push(capturedControls);
    interactions.push(interaction);
    failures.push(...setupFailures.map((failure) => `${setup.stateContractKey}: ${failure}`));
    snapshots.push({
      stateContractKey: setup.stateContractKey,
      status: setupFailures.length ? "failed" : "passed",
      controlsCaptured: capturedControls.length,
      mutationRequests: mutationRequests.length,
      restored,
      failures: setupFailures,
    });
  }
  return {
    controls: mergeControls(...controls),
    interactions: mergeControlInteractions(...interactions),
    snapshots,
    failures,
  };
}

function semanticFieldScenarioEvidence(surfaceId: string, name: string, fieldOccurrence: number) {
  const evidenceByKey = new Map<string, CmsSemanticFieldEvidence & { evidenceFile: string }>();
  for (const entry of semanticFieldEvidence.values()) {
    evidenceByKey.set(entry.fieldContractKey, { ...entry, evidenceFile: semanticEvidenceFile() });
  }
  for (const { report, evidenceFile } of semanticScenarioReports()) {
    if (!Array.isArray(report.semanticFields)) continue;
    for (const entry of report.semanticFields as CmsSemanticFieldEvidence[]) {
      if (!evidenceByKey.has(entry.fieldContractKey)) {
        evidenceByKey.set(entry.fieldContractKey, { ...entry, evidenceFile });
      }
    }
  }
  const evidence = [...evidenceByKey.values()];
  const resolved = resolveCmsSemanticFieldEvidence({
    surfaceId,
    fieldName: name,
    fieldOccurrence,
    evidence,
  });
  const match = evidence.find(
    (entry) => entry.fieldContractKey === resolved.fieldContractKey && entry.surfaceId === surfaceId,
  );
  return match
    ? {
        reference: `${match.evidenceFile}#semanticFields/${resolved.fieldContractKey}`,
        controlContractKey: cmsSemanticFieldContractKey(surfaceId, name, fieldOccurrence),
      }
    : null;
}

function semanticStructureScenarioEvidence(
  surfaceId: string,
  controlKind: "form" | "dialog",
  name: string,
  controlOccurrence: number,
) {
  const evidenceByKey = new Map<string, CmsSemanticStructureEvidence & { evidenceFile: string }>();
  for (const entry of semanticStructureEvidence.values()) {
    evidenceByKey.set(entry.structureContractKey, {
      ...entry,
      evidenceFile: semanticEvidenceFile(),
    });
  }
  for (const { report, evidenceFile } of semanticScenarioReports()) {
    if (!Array.isArray(report.semanticStructures)) continue;
    for (const entry of report.semanticStructures as CmsSemanticStructureEvidence[]) {
      if (!evidenceByKey.has(entry.structureContractKey)) {
        evidenceByKey.set(entry.structureContractKey, { ...entry, evidenceFile });
      }
    }
  }
  const evidence = [...evidenceByKey.values()];
  const resolved = resolveCmsSemanticStructureEvidence({
    surfaceId,
    controlKind,
    controlName: name,
    controlOccurrence,
    evidence,
  });
  const match = evidence.find(
    (entry) => entry.structureContractKey === resolved.structureContractKey && entry.surfaceId === surfaceId,
  );
  return match
    ? {
        reference: `${match.evidenceFile}#semanticStructures/${resolved.structureContractKey}`,
        controlContractKey: cmsSemanticStructureContractKey(surfaceId, controlKind, name, controlOccurrence),
      }
    : null;
}

async function exerciseRenderedControls(
  page: Page,
  surfaceId: string,
  viewport: CmsSemanticViewport,
  preservedStateSetup?: CmsSemanticStateSetup,
): Promise<ControlInteractionSummary> {
  const summary = emptyControlInteraction("mutated-and-restored");
  const mutationRequests: string[] = [];
  const requestListener = (request: Request) => {
    if (looksLikeMutationRequest(request)) mutationRequests.push(safePath(request.url()));
  };
  page.on("request", requestListener);
  try {
    const structureOccurrences = new Map<string, number>();
    const structures = [
      { locator: page.locator("form"), kind: "form" as const },
      {
        locator: page.locator('dialog[open], [role="dialog"], [role="alertdialog"], aside[aria-label]'),
        kind: "dialog" as const,
      },
    ];
    for (const group of structures) {
      const count = await group.locator.count();
      for (let index = 0; index < count; index += 1) {
        const structure = group.locator.nth(index);
        if (!(await structure.isVisible().catch(() => false))) continue;
        const runtime = await runtimeControlFromLocator(structure, index, group.kind);
        const structureOccurrenceKey = `${group.kind}|${runtime.name}`;
        const structureOccurrence = structureOccurrences.get(structureOccurrenceKey) ?? 0;
        structureOccurrences.set(structureOccurrenceKey, structureOccurrence + 1);
        const binding = resolveCmsSemanticBinding(surfaceId, runtime, index);
        const semanticEvidence = semanticStructureScenarioEvidence(
          surfaceId,
          group.kind,
          runtime.name,
          structureOccurrence,
        );
        if (!semanticEvidence) {
          throw new Error(`${runtime.name}: estrutura sem cenário real vinculado`);
        }
        summary.semanticBindings.push(binding);
        summary.semanticExecutions.push({
          ...binding,
          viewport,
          executionScope: "scenario-once",
          semanticExecutionRef: semanticEvidence.controlContractKey,
          handlerExecuted: true,
          evidenceKind: "scenario-contract",
          evidenceReference: semanticEvidence.reference,
          restored: true,
          status: "passed",
        });
      }
    }

    const fields = page.locator("input, select, textarea");
    const fieldCount = await fields.count();
    const fieldOccurrences = new Map<string, number>();
    for (let index = 0; index < fieldCount; index += 1) {
      const field = fields.nth(index);
      if (!(await field.isVisible().catch(() => false))) continue;
      summary.fieldsSeen += 1;
      const name = await controlName(field, index);
      const tag = await field.evaluate((element) => element.tagName.toLowerCase());
      const type = ((await field.getAttribute("type")) ?? "text").toLowerCase();
      const runtime = await runtimeControlFromLocator(field, index, "field");
      const fieldOccurrence = fieldOccurrences.get(name) ?? 0;
      fieldOccurrences.set(name, fieldOccurrence + 1);
      const binding = resolveCmsSemanticBinding(surfaceId, runtime, index);
      summary.semanticBindings.push(binding);
      if (runtime.disabled || runtime.readOnly) {
        const semanticEvidence = semanticFieldScenarioEvidence(surfaceId, name, fieldOccurrence);
        if (!semanticEvidence) throw new Error("campo não editável sem classificação fundamentada");
        summary.fieldsExercised += 1;
        summary.semanticExecutions.push({
          ...binding,
          viewport,
          executionScope: "scenario-once",
          semanticExecutionRef: semanticEvidence.controlContractKey,
          handlerExecuted: true,
          evidenceKind: "scenario-contract",
          evidenceReference: semanticEvidence.reference,
          restored: true,
          status: "passed",
        });
        continue;
      }
      try {
        if (type === "checkbox") {
          const original = await field.isChecked();
          await field.setChecked(!original);
          await field.setChecked(original);
          await expect(field).toBeChecked({ checked: original });
        } else if (type === "radio") {
          const groupName = await field.getAttribute("name");
          if (!groupName) throw new Error("grupo de rádio sem nome restaurável");
          const escapedName = groupName.replaceAll('"', '\\"');
          const radios = page.locator(`input[type="radio"][name="${escapedName}"]`);
          const originalValue = await page
            .locator(`input[type="radio"][name="${escapedName}"]:checked`)
            .getAttribute("value");
          const values = await radios.evaluateAll((elements) =>
            elements
              .filter((element) => {
                const input = element as HTMLInputElement;
                const style = getComputedStyle(input);
                return !input.disabled && style.display !== "none" && style.visibility !== "hidden";
              })
              .map((element) => (element as HTMLInputElement).value),
          );
          const alternateValue = values.find((value) => value !== originalValue);
          if (!alternateValue || originalValue === null) {
            throw new Error("grupo de rádio sem alternativa restaurável");
          }
          await page
            .locator(
              `input[type="radio"][name="${escapedName}"][value="${alternateValue.replaceAll('"', '\\"')}"]`,
            )
            .check();
          await page
            .locator(
              `input[type="radio"][name="${escapedName}"][value="${originalValue.replaceAll('"', '\\"')}"]`,
            )
            .check();
        } else if (type === "file") {
          await field.setInputFiles({
            name: "qa-semantic-control.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("QA semantic control; no commercial data."),
          });
          await field.setInputFiles([]);
        } else if (tag === "select") {
          if ((await field.getAttribute("multiple")) !== null) {
            const original = await field
              .locator("option:checked")
              .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
            const alternate = await field
              .locator("option:not([disabled])")
              .evaluateAll(
                (options, current) =>
                  options
                    .map((option) => (option as HTMLOptionElement).value)
                    .find((value) => value && !current.includes(value)) ?? null,
                original,
              );
            if (alternate === null) throw new Error("seleção múltipla sem alternativa restaurável");
            await field.selectOption([...original, alternate]);
            await field.selectOption(original);
            const restored = await field
              .locator("option:checked")
              .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
            expect(restored.sort()).toEqual([...original].sort());
          } else {
            const original = await field.inputValue();
            const alternate = await field
              .locator("option:not([disabled])")
              .evaluateAll(
                (options, current) =>
                  options
                    .map((option) => (option as HTMLOptionElement).value)
                    .find((value) => value !== current && value !== "" && value !== "__invalid__") ?? null,
                original,
              );
            if (alternate === null) throw new Error("sem segunda opção restaurável");
            await field.selectOption(alternate);
            await field.selectOption(original);
            await expect(field).toHaveValue(original);
          }
        } else if (["button", "submit", "reset", "image", "hidden"].includes(type)) {
          throw new Error(`tipo ${type} não é um campo editável classificável`);
        } else {
          const original = await field.inputValue();
          const maxLength = Number((await field.getAttribute("maxlength")) ?? 0);
          let alternate: string;
          if (type === "email") alternate = "qa-control@example.invalid";
          else if (type === "url") alternate = "https://qa.invalid/controle";
          else if (type === "tel") alternate = "+5511999999999";
          else if (type === "date") alternate = "2030-01-02";
          else if (type === "datetime-local") alternate = "2030-01-02T03:04";
          else if (type === "month") alternate = "2030-01";
          else if (type === "week") alternate = "2030-W02";
          else if (type === "time") alternate = "03:04";
          else if (["number", "range"].includes(type)) {
            const minimum = Number((await field.getAttribute("min")) ?? 0);
            const maximum = Number((await field.getAttribute("max")) ?? minimum + 10);
            const candidate = Number.isFinite(minimum) ? minimum : 0;
            alternate = String(Math.min(Number.isFinite(maximum) ? maximum : candidate + 1, candidate + 1));
          } else if (type === "color")
            alternate = original.toLowerCase() === "#000001" ? "#000002" : "#000001";
          else if (!original) alternate = "qa";
          else if (maxLength > 0 && original.length >= maxLength) {
            alternate = `${original.slice(0, -1)}${original.endsWith("q") ? "x" : "q"}`;
          } else alternate = `${original} `;
          if (alternate === original) alternate = original ? `${original.slice(0, -1)}q` : "qa";
          await field.fill(alternate);
          await field.fill(original);
          await expect(field).toHaveValue(original);
        }
        const semanticEvidence = semanticFieldScenarioEvidence(surfaceId, name, fieldOccurrence);
        if (!semanticEvidence) throw new Error("campo sem matriz de casos e persistência vinculada");
        summary.fieldsExercised += 1;
        summary.semanticExecutions.push({
          ...binding,
          viewport,
          executionScope: "scenario-once",
          semanticExecutionRef: semanticEvidence.controlContractKey,
          handlerExecuted: true,
          evidenceKind: "scenario-contract",
          evidenceReference: semanticEvidence.reference,
          restored: true,
          status: "passed",
        });
      } catch (error) {
        summary.failures.push(`${name}: ${redact(error instanceof Error ? error.message : String(error))}`);
        summary.semanticExecutions.push({
          ...binding,
          viewport,
          executionScope: "viewport-local",
          semanticExecutionRef: null,
          handlerExecuted: false,
          evidenceKind: null,
          evidenceReference: null,
          restored: false,
          status: "failed",
        });
      }
    }

    const semanticGroups = [
      {
        locator: page.locator(
          'button:not([role="tab"]), input[type="button"], input[type="submit"], [role="menuitem"]',
        ),
        kind: "action",
      },
      { locator: page.locator("a[href]"), kind: "link" },
    ] as const;
    for (const group of semanticGroups) {
      const count = await group.locator.count();
      const occurrences = new Map<string, number>();
      for (let index = 0; index < count; index += 1) {
        const control = group.locator.nth(index);
        if (!(await control.isVisible().catch(() => false))) {
          continue;
        }
        if (group.kind === "action") summary.actionsSeen += 1;
        else summary.linksSeen += 1;
        const name = await controlName(control, index);
        const occurrence = occurrences.get(name) ?? 0;
        occurrences.set(name, occurrence + 1);
        const runtime = await runtimeControlFromLocator(control, index, group.kind);
        const binding = resolveCmsSemanticBinding(surfaceId, runtime, occurrence);
        summary.semanticBindings.push(binding);
        try {
          const belongsToPreservedDialog =
            group.kind === "action" &&
            preservedStateSetup?.expectedState.kind === "role" &&
            ["dialog", "alertdialog"].includes(preservedStateSetup.expectedState.role) &&
            (await control.evaluate(
              (element) => element.closest('[role="dialog"], [role="alertdialog"], dialog[open]') !== null,
            ));
          if (belongsToPreservedDialog) {
            summary.semanticExecutions.push({
              ...binding,
              viewport,
              executionScope: "viewport-local",
              semanticExecutionRef: null,
              handlerExecuted: true,
              evidenceKind: "ui-interaction",
              evidenceReference: preservedStateSetup.evidenceReference,
              restored: true,
              status: "passed",
            });
          } else if (runtime.disabled) {
            summary.semanticExecutions.push({
              ...binding,
              viewport,
              executionScope: "viewport-local",
              semanticExecutionRef: null,
              handlerExecuted: true,
              evidenceKind: "state-assertion",
              evidenceReference: "dom:disabled=true",
              restored: true,
              status: "passed",
            });
          } else if (binding.classification === "action.mutating") {
            const evidenceReference = semanticMutationEvidence(surfaceId, name, occurrence);
            if (!evidenceReference) throw new Error("ação mutante sem evidência backend vinculada");
            summary.semanticExecutions.push({
              ...binding,
              viewport,
              executionScope: "scenario-once",
              semanticExecutionRef: evidenceReference.controlContractKey,
              handlerExecuted: true,
              evidenceKind: "backend-response",
              evidenceReference: evidenceReference.reference,
              restored: true,
              status: "passed",
            });
          } else if (group.kind === "link") {
            const href = await control.getAttribute("href");
            if (!href) throw new Error("link sem destino navegável");
            const destination = new URL(href, page.url());
            if (!/^https?:$/.test(destination.protocol)) {
              throw new Error(`protocolo ${destination.protocol} sem handler seguro`);
            }
            const probe = await sealedPreviewApiGet(page, destination.href, {
              failOnStatusCode: false,
            });
            if (probe.status() >= 500) throw new Error(`destino respondeu ${probe.status()}`);
            summary.semanticExecutions.push({
              ...binding,
              viewport,
              executionScope: "viewport-local",
              semanticExecutionRef: null,
              handlerExecuted: true,
              evidenceKind: "navigation-response",
              evidenceReference: `http:${probe.status()}:${safePath(destination.href)}`,
              restored: true,
              status: "passed",
            });
          } else {
            const before = await control.evaluate((element) => ({
              expanded: element.getAttribute("aria-expanded"),
              pressed: element.getAttribute("aria-pressed"),
              selected: element.getAttribute("aria-selected"),
              dialogs: document.querySelectorAll('[role="dialog"]:not([hidden])').length,
              url: location.href,
            }));
            await control.press("Enter");
            await page.waitForTimeout(75);
            const after = await page.evaluate(() => ({
              dialogs: document.querySelectorAll('[role="dialog"]:not([hidden])').length,
              url: location.href,
            }));
            const detached = !(await control.isVisible().catch(() => false));
            const navigated = after.url !== before.url;
            const changed =
              detached ||
              after.dialogs !== before.dialogs ||
              navigated ||
              (!navigated &&
                ((await control.getAttribute("aria-expanded").catch(() => null)) !== before.expanded ||
                  (await control.getAttribute("aria-pressed").catch(() => null)) !== before.pressed ||
                  (await control.getAttribute("aria-selected").catch(() => null)) !== before.selected));
            if (!changed) throw new Error("ativação não produziu efeito observável");
            await page.keyboard.press("Escape");
            if (detached || page.url() !== before.url) {
              await page.goto(before.url, { waitUntil: "domcontentloaded" });
            }
            summary.semanticExecutions.push({
              ...binding,
              viewport,
              executionScope: "viewport-local",
              semanticExecutionRef: null,
              handlerExecuted: true,
              evidenceKind: "ui-interaction",
              evidenceReference: "dom:activation-effect-restored",
              restored: true,
              status: "passed",
            });
          }
          if (group.kind === "action") {
            summary.actionsFocused += 1;
            if (binding.classification === "action.disabled") {
              summary.actionsStateAsserted += 1;
            } else if (binding.classification === "action.mutating") {
              summary.actionsExecutionReferenced += 1;
            } else {
              summary.actionsExecuted += 1;
            }
          } else {
            summary.linksFocused += 1;
            summary.linksExecuted += 1;
          }
        } catch (error) {
          summary.failures.push(`${name}: ${redact(error instanceof Error ? error.message : String(error))}`);
          summary.semanticExecutions.push({
            ...binding,
            viewport,
            executionScope: "viewport-local",
            semanticExecutionRef: null,
            handlerExecuted: false,
            evidenceKind: null,
            evidenceReference: null,
            restored: false,
            status: "failed",
          });
        }
      }
    }
  } finally {
    page.off("request", requestListener);
  }
  summary.unexpectedMutationRequests = mutationRequests.length;
  if (mutationRequests.length) {
    summary.failures.push(
      `${mutationRequests.length} chamada(s) mutante(s) inesperada(s) durante alteração e restauração local de controles`,
    );
  }
  return summary;
}

async function exerciseTabsByKeyboard(
  page: Page,
  surfaceId: string,
  viewport: CmsSemanticViewport,
  interact = false,
  activePanelOnly = false,
): Promise<{
  controls: RuntimeControl[];
  failures: string[];
  interactions: ControlInteractionSummary;
}> {
  const captured: RuntimeControl[][] = [];
  const failures: string[] = [];
  const interactions: ControlInteractionSummary[] = [];
  const tabs = page.getByRole("tab");
  const count = await tabs.count();
  let initiallySelectedIndex: number | null = null;
  if (activePanelOnly) {
    for (let index = 0; index < count; index += 1) {
      if ((await tabs.nth(index).getAttribute("aria-selected")) === "true") {
        initiallySelectedIndex = index;
        break;
      }
    }
    if (initiallySelectedIndex === null) {
      failures.push("superfície por seção não declarou a aba inicialmente selecionada");
    } else {
      captured.push(await collectControls(page));
      if (interact) interactions.push(await exerciseRenderedControls(page, surfaceId, viewport));
    }
  }
  for (let index = 0; index < count; index += 1) {
    const tab = tabs.nth(index);
    if (!(await tab.isVisible().catch(() => false)) || (await tab.isDisabled().catch(() => true))) continue;
    await tab.focus();
    const focusIndicator = await tab.evaluate((element) => {
      const style = getComputedStyle(element);
      return (
        style.outlineStyle !== "none" ||
        style.outlineWidth !== "0px" ||
        (style.boxShadow !== "none" && style.boxShadow !== "")
      );
    });
    if (!focusIndicator) failures.push(`aba ${index + 1} sem indicador de foco`);
    await tab.press("Enter");
    await page.waitForTimeout(50);
    const selected = await tab.getAttribute("aria-selected");
    if (selected !== null && selected !== "true") failures.push(`aba ${index + 1} não ativou por teclado`);
    const tabRuntime = await runtimeControlFromLocator(tab, index, "tab");
    const tabBinding = resolveCmsSemanticBinding(surfaceId, tabRuntime, index);
    const tabInteraction = emptyControlInteraction("mutated-and-restored");
    tabInteraction.semanticBindings.push(tabBinding);
    tabInteraction.semanticExecutions.push({
      ...tabBinding,
      viewport,
      executionScope: "viewport-local",
      semanticExecutionRef: null,
      handlerExecuted: selected === null || selected === "true",
      evidenceKind: "ui-interaction",
      evidenceReference: `dom:tab-activated:${index}`,
      restored: true,
      status: selected === null || selected === "true" ? "passed" : "failed",
    });
    interactions.push(tabInteraction);
    if (!activePanelOnly) {
      captured.push(await collectControls(page));
      if (interact) interactions.push(await exerciseRenderedControls(page, surfaceId, viewport));
    }
    const layout = await layoutSnapshot(page);
    if (layout.horizontalOverflow > 1) {
      failures.push(`aba ${index + 1} com overflow horizontal de ${layout.horizontalOverflow}px`);
    }
    if (layout.clippedControls > 0) {
      failures.push(`aba ${index + 1} com ${layout.clippedControls} controles cortados`);
    }
  }
  if (activePanelOnly && initiallySelectedIndex !== null) {
    const initialTab = tabs.nth(initiallySelectedIndex);
    await initialTab.press("Enter");
    await expect(initialTab).toHaveAttribute("aria-selected", "true");
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  }
  return {
    controls: mergeControls(...captured),
    failures,
    interactions: mergeControlInteractions(...interactions),
  };
}

async function layoutSnapshot(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const horizontalOverflow = Math.max(0, root.scrollWidth - root.clientWidth);
    const selector =
      'input, select, textarea, button, a[href], [role="tab"], [role="menuitem"], [role="switch"]';
    const clipped = [...document.querySelectorAll<HTMLElement>(selector)].filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        Number(style.opacity) === 0 ||
        rect.width === 0 ||
        rect.height === 0
      ) {
        return false;
      }
      return rect.left < -1 || rect.right > root.clientWidth + 1;
    });
    return { horizontalOverflow, clippedControls: clipped.length };
  });
}

async function keyboardSnapshot(page: Page) {
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press("Tab");
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body) return null;
    const style = getComputedStyle(active);
    const rect = active.getBoundingClientRect();
    return {
      tag: active.tagName.toLowerCase(),
      role: active.getAttribute("role"),
      visible: style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0,
      indicator:
        style.outlineStyle !== "none" ||
        style.outlineWidth !== "0px" ||
        (style.boxShadow !== "none" && style.boxShadow !== ""),
    };
  });
}

function allowedFailurePatterns(): RegExp[] {
  const raw = process.env.QA_CMS_ALLOWED_HTTP_FAILURES;
  if (!raw) return [];
  let entries: unknown;
  try {
    entries = JSON.parse(raw);
  } catch {
    throw new Error("QA_CMS_ALLOWED_HTTP_FAILURES deve ser um array JSON de expressões; valores omitidos.");
  }
  if (!Array.isArray(entries) || entries.some((entry) => typeof entry !== "string")) {
    throw new Error("QA_CMS_ALLOWED_HTTP_FAILURES deve ser um array JSON de strings; valores omitidos.");
  }
  return entries.map((entry) => new RegExp(entry));
}

// A configuração global retém trace/vídeo em falha. Esta suíte digita senha e
// TOTP reais, portanto desabilita todos os artefatos brutos e grava somente o
// relatório explicitamente sanitizado abaixo.
test.use({ trace: "off", video: "off", screenshot: "off", serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await installSealedPreviewRouting(context);
});
test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) assertSealedPreviewRoutingUsed(context);
});

let pendingUiHandoff: {
  environment: MutationTargetEnvironment;
  candidateSha: string;
  runTag: string;
  actorId: string;
  ids: Omit<SyntheticIds, "pageId">;
  form: SyntheticFormFixture;
  lead: CmsUiCreatedState["lead"];
} | null = null;

test.describe.serial("homologação final CMS source-backed", () => {
  test("matriz classifica todas as rotas, destinos e controles administrativos", async ({
    baseURL: _baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "inventário é independente de viewport");
    const source = inventory();
    expect(source.schemaVersion).toBe(1);
    expect(source.counts.routerPatterns).toBeGreaterThan(30);
    expect(source.counts.surfaces).toBeGreaterThan(source.counts.routerPatterns);
    expect(source.sourceControls.length).toBeGreaterThan(100);
    expect(source.sourceDataCalls.length).toBeGreaterThan(50);
    // Forms and leads now cross four fewer browser-visible data boundaries:
    // their aggregate server-scoped RPCs own the table graphs and keep RLS
    // authorization out of the client. DAM archival remains covered by EV2.
    expect(source.sourceDataCalls.length).toBeGreaterThanOrEqual(142);
    expect(source.documentationCrossCheck.localIndexes).toEqual([
      "src/admin/README.md",
      "docs/ev2/README.md",
    ]);
    expect(source.matrix.every((item) => item.sourceFiles.length > 0)).toBe(true);
    expect(source.sourceControls.every((item) => item.classification && item.ownerRouteIds.length)).toBe(
      true,
    );
    expect(source.sourceDataCalls.every((item) => item.classification && item.ownerRouteIds.length)).toBe(
      true,
    );
    mergeReport("staticInventory", {
      status: "passed",
      counts: source.counts,
      classificationOnly: true,
      authenticatedEvidence: false,
    });
  });

  test("CI sem segredos comprova somente fail-closed e superfícies públicas de autenticação", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "executado uma vez na matriz");
    test.skip(
      mutationTargetEnvironment() === "production",
      "varredura geral de rotas permanece restrita ao staging",
    );
    const source = inventory();
    const protectedRoutes = source.matrix.filter((item) => item.testMode === "authenticated");
    const observations: Array<Record<string, unknown>> = [];

    for (const surface of protectedRoutes) {
      const requested = representativePath(surface.route);
      const response = await page.goto(requested, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/login$/);
      observations.push({
        surfaceId: surface.id,
        requestedPath: safePath(requested),
        navigationStatus: response?.status() ?? null,
        finalPath: safePath(page.url()),
        result: "redirected-to-login",
      });
    }

    const recoveryResponse = await page.goto("/admin/recuperar-senha", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Recuperar acesso" })).toBeVisible();
    observations.push({
      surfaceId: "auth-recovery",
      requestedPath: "/admin/recuperar-senha",
      navigationStatus: recoveryResponse?.status() ?? null,
      finalPath: safePath(page.url()),
      result: "generic-recovery-form-visible-without-submission",
    });

    await page.goto("/admin/definir-senha", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/login$/);
    observations.push({
      surfaceId: "auth-set-password",
      requestedPath: "/admin/definir-senha",
      finalPath: safePath(page.url()),
      result: "rejected-without-recovery-session",
    });

    await page.goto("/admin/mfa", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(/\/admin\/login$/);
    observations.push({
      surfaceId: "auth-mfa",
      requestedPath: "/admin/mfa",
      finalPath: safePath(page.url()),
      result: "rejected-without-authenticated-session",
    });

    const invalidResponse = await page.goto("/admin/qa-rota-inexistente", {
      waitUntil: "domcontentloaded",
    });
    if (baseURL?.includes("pages.dev")) expect(invalidResponse?.status()).toBe(404);
    await expect(page).toHaveURL(/\/admin\/login$/);
    observations.push({
      surfaceId: "admin-not-found",
      requestedPath: "/admin/qa-rota-inexistente",
      navigationStatus: invalidResponse?.status() ?? null,
      finalPath: safePath(page.url()),
      result: baseURL?.includes("pages.dev") ? "edge-404-then-signed-out-shell" : "spa-negative-route",
    });

    const missingSecrets = authConfiguration().missing;
    mergeReport("signedOut", {
      status: "passed",
      origin: baseURL ? new URL(baseURL).origin : null,
      observations,
      authenticatedSuite:
        process.env.QA_CMS_AUTHENTICATED_SUITE_SCHEDULED === "true"
          ? { status: "scheduled-separately" }
          : missingSecrets.length
            ? {
                status: "not-run",
                reason: "variáveis seguras ausentes",
                missingVariableNames: missingSecrets,
              }
            : { status: "scheduled-separately" },
      warning: "Este bloco não constitui evidência de operação autenticada nem de persistência backend.",
    });
  });

  test("@semantic sessão AAL2 percorre todas as superfícies, menus, viewports, teclado e axe", async ({
    page,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "a própria suíte cobre quatro viewports exatos");
    const auth = authConfiguration();
    test.skip(
      !auth.ready,
      `homologação autenticada opt-in; faltam apenas variáveis seguras: ${auth.missing.join(", ")}`,
    );
    if (!auth.email || !auth.password || !auth.totpSecret || !auth.expectedSha) {
      throw new Error("Configuração autenticada incompleta após o gate opt-in.");
    }
    const runTag = process.env.QA_CMS_RUN_TAG;
    if (!runTag) throw new Error("QA_CMS_RUN_TAG é obrigatório para resolver o handoff criado pela UI.");
    const createdState = uiCreatedState(mutationTargetEnvironment(), auth.expectedSha, runTag);
    const ids = createdState.ids;
    const frontendExpectedSha = authenticatedFrontendSha(auth.expectedSha);
    const rollbackCompatibility = frontendExpectedSha !== auth.expectedSha;
    const testedViewports = rollbackCompatibility
      ? viewportMatrix.filter(({ name }) => name === "1440x900")
      : viewportMatrix;

    // The exact synthetic lease and its scoped overrides expire after 119 minutes. Keep the
    // exhaustive pass inside that security window instead of accepting a stale manifest.
    test.setTimeout(25 * 60_000);
    const source = inventory();
    const knownSecrets = [auth.email, auth.password, auth.totpSecret];
    const observations: RouteObservation[] = [];
    const consoleFailures: Array<Record<string, unknown>> = [];
    const httpFailures: Array<Record<string, unknown>> = [];
    const requestFailures: Array<Record<string, unknown>> = [];
    const menuResults: Array<Record<string, unknown>> = [];
    const authJourney: Array<Record<string, unknown>> = [];
    const allowedHttp = allowedFailurePatterns();
    let currentContext = { surfaceId: "authentication", viewport: "1440x900" };
    let expectedNegativeAuth: "password" | "mfa" | null = null;
    let completion: "passed" | "failed" = "failed";
    let failureSummary: string | null = null;
    let semanticCoverage: ReturnType<typeof validateCmsSemanticCoverage> | null = null;

    page.on("console", (message) => {
      if (message.type() !== "error") return;
      consoleFailures.push({
        ...currentContext,
        message: redact(message.text(), knownSecrets),
        sourcePath: message.location().url ? safePath(message.location().url) : null,
      });
    });
    page.on("pageerror", (error) => {
      consoleFailures.push({
        ...currentContext,
        message: redact(error.message, knownSecrets),
        sourcePath: null,
      });
    });
    page.on("response", (response) => {
      if (response.status() < 400) return;
      const url = new URL(response.url());
      const expectedPasswordRejection =
        expectedNegativeAuth === "password" &&
        url.pathname.endsWith("/auth/v1/token") &&
        [400, 401].includes(response.status());
      const expectedMfaRejection =
        expectedNegativeAuth === "mfa" &&
        /\/auth\/v1\/factors\/[^/]+\/verify$/.test(url.pathname) &&
        [400, 401, 403, 422].includes(response.status());
      if (expectedPasswordRejection || expectedMfaRejection) return;
      const path = safePath(response.url());
      if (allowedHttp.some((pattern) => pattern.test(path))) return;
      httpFailures.push({
        ...currentContext,
        method: response.request().method(),
        resourceType: response.request().resourceType(),
        status: response.status(),
        path,
      });
    });
    page.on("requestfailed", (request) => {
      const reason = request.failure()?.errorText ?? "falha de rede";
      if (reason.includes("ERR_ABORTED")) return;
      requestFailures.push({
        ...currentContext,
        method: request.method(),
        resourceType: request.resourceType(),
        path: safePath(request.url()),
        reason: redact(reason, knownSecrets),
      });
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const targetOrigin = baseURL ? new URL(baseURL) : null;
      if (
        !targetOrigin ||
        targetOrigin.protocol !== "https:" ||
        ["localhost", "127.0.0.1"].includes(targetOrigin.hostname)
      ) {
        throw new Error("A homologação autenticada final exige uma URL HTTPS implantada.");
      }
      if (source.sourceDirty)
        throw new Error("O checkout da suíte está sujo e não pode vincular evidência a um SHA.");
      if (source.sourceSha !== frontendExpectedSha) {
        throw new Error("O inventário não pertence ao frontend exato sob homologação; valores omitidos.");
      }
      const loginResponse = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
      if (loginResponse?.headers()["x-release"] !== frontendExpectedSha) {
        throw new Error("O X-Release implantado difere do SHA exato homologado; valores omitidos.");
      }
      currentContext = { surfaceId: "auth-invalid-password", viewport: "1440x900" };
      expectedNegativeAuth = "password";
      await page.getByLabel("E-mail corporativo").fill(auth.email);
      await page.getByLabel("Senha").fill("QA-invalid-password-not-a-secret!9");
      const rejectedPassword = page.waitForResponse(
        (response) =>
          response.url().includes("/auth/v1/token") &&
          response.request().method() === "POST" &&
          [400, 401].includes(response.status()),
        { timeout: 20_000 },
      );
      await page.getByRole("button", { name: "Entrar" }).click();
      const rejectedPasswordResponse = await rejectedPassword;
      await expect(page.getByRole("alert")).toHaveText(/E-mail ou senha incorretos\./);
      await expect(page).toHaveURL(/\/admin\/login$/);
      authJourney.push({
        step: "invalid_password_generic_rejection",
        result: "passed",
        httpStatus: rejectedPasswordResponse.status(),
        informationLeak: false,
      });
      expectedNegativeAuth = null;

      currentContext = { surfaceId: "auth-valid-password", viewport: "1440x900" };
      await page.getByLabel("Senha").fill(auth.password);
      await page.getByRole("button", { name: "Entrar" }).click();
      await expect(page).toHaveURL(/\/admin\/mfa$/);
      const enrollmentHeading = page.getByRole("heading", { name: "Ativar verificação em duas etapas" });
      if (await enrollmentHeading.isVisible().catch(() => false)) {
        throw new Error(
          "A conta QA precisa chegar pré-matriculada em MFA; a suíte não exporta nova chave TOTP.",
        );
      }
      currentContext = { surfaceId: "auth-invalid-mfa", viewport: "1440x900" };
      const activeCode = totp(auth.totpSecret);
      const invalidCode = String((Number(activeCode) + 1) % 1_000_000).padStart(6, "0");
      expectedNegativeAuth = "mfa";
      const rejectedMfa = page.waitForResponse(
        (response) =>
          /\/auth\/v1\/factors\/[^/]+\/verify$/.test(new URL(response.url()).pathname) &&
          response.request().method() === "POST" &&
          [400, 401, 403, 422].includes(response.status()),
        { timeout: 20_000 },
      );
      await page.getByLabel("Código de 6 dígitos").fill(invalidCode);
      await page.getByRole("button", { name: "Verificar e entrar" }).click();
      const rejectedMfaResponse = await rejectedMfa;
      await expect(page.getByRole("alert")).toHaveText(/Código inválido ou expirado\./);
      await expect(page).toHaveURL(/\/admin\/mfa$/);
      authJourney.push({
        step: "invalid_or_expired_mfa_generic_rejection",
        result: "passed",
        httpStatus: rejectedMfaResponse.status(),
        informationLeak: false,
      });
      expectedNegativeAuth = null;

      const millisecondsInStep = Date.now() % 30_000;
      if (millisecondsInStep > 27_000) await page.waitForTimeout(31_000 - millisecondsInStep);
      await page.getByLabel("Código de 6 dígitos").fill(totp(auth.totpSecret));
      await page.getByRole("button", { name: "Verificar e entrar" }).click();
      await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
      await expect(page).toHaveURL(/\/admin(?:\/?|\?.*)$/);
      authJourney.push({ step: "valid_aal2_login", result: "passed" });

      const authenticatedSurfaces = source.matrix.filter(
        (item) => item.testMode === "authenticated" || item.id === "admin-not-found",
      );
      for (const viewport of testedViewports) {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.emulateMedia({ reducedMotion: "reduce" });
        for (const surface of authenticatedSurfaces) {
          currentContext = { surfaceId: surface.id, viewport: viewport.name };
          const route = resolveSyntheticPath(surface.route, ids);
          const routeFailures: string[] = [];
          let status: number | null = null;
          let controls: RuntimeControl[] = [];
          let controlInteraction = emptyControlInteraction();
          let sourceControlContract: RouteObservation["sourceControlContract"] = {
            status: "failed",
            mappings: [],
            notApplicable: [],
            failures: ["source-control-contract-not-executed"],
          };
          let semanticStateSnapshots: RouteObservation["semanticStateSnapshots"] = [];
          let focus: RouteObservation["focus"] = null;
          let overflow = { horizontalOverflow: 0, clippedControls: 0 };
          let axe = { scanned: false, seriousOrCritical: [] as string[] };
          try {
            const response = await page.goto(route, { waitUntil: "domcontentloaded", timeout: 30_000 });
            status = response?.status() ?? null;
            if (response?.headers()["x-release"] !== frontendExpectedSha) {
              routeFailures.push("X-Release divergente do SHA homologado");
            }
            await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
            await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
            await expect(page.getByRole("heading", { name: "Acesso negado" })).toHaveCount(0);
            await expect(
              page.getByRole("heading", { name: "Validação de acesso temporariamente indisponível" }),
            ).toHaveCount(0);
            controls = await collectControls(page);
            const shouldInteract = true;
            const hasTabs = (await page.getByRole("tab").count()) > 0;
            const standaloneInteraction =
              shouldInteract && !hasTabs
                ? await exerciseRenderedControls(page, surface.id, viewport.name as CmsSemanticViewport)
                : emptyControlInteraction();
            const tabCoverage = await exerciseTabsByKeyboard(
              page,
              surface.id,
              viewport.name as CmsSemanticViewport,
              shouldInteract,
              ["site-navigation", "site-settings", "site-placements"].includes(surface.id),
            );
            const stateCoverage = rollbackCompatibility
              ? {
                  controls: [] as RuntimeControl[],
                  interactions: emptyControlInteraction(),
                  snapshots: [] as RouteObservation["semanticStateSnapshots"],
                  failures: [] as string[],
                }
              : await exerciseSemanticStateSetups(
                  page,
                  surface.id,
                  route,
                  viewport.name as CmsSemanticViewport,
                  { runTag, createdLeadReference: createdState.lead.reference },
                );
            semanticStateSnapshots = stateCoverage.snapshots;
            controls = mergeControls(controls, tabCoverage.controls, stateCoverage.controls);
            controlInteraction = mergeControlInteractions(
              standaloneInteraction,
              tabCoverage.interactions,
              stateCoverage.interactions,
            );
            routeFailures.push(...tabCoverage.failures);
            routeFailures.push(...stateCoverage.failures);
            routeFailures.push(...controlInteraction.failures);
            sourceControlContract = mapCmsSourceControlsToRuntime({
              surfaceId: surface.id,
              viewport: viewport.name as CmsSemanticViewport,
              sourceControls: source.sourceControls.filter((control) =>
                control.ownerRouteIds.includes(surface.id),
              ),
              executions: controlInteraction.semanticExecutions,
            });
            routeFailures.push(...sourceControlContract.failures);
            overflow = await layoutSnapshot(page);
            focus = await keyboardSnapshot(page);
            if (status !== null && status >= 400 && !(surface.id === "admin-not-found" && status === 404)) {
              routeFailures.push(`status de navegação ${status}`);
            }
            if (overflow.horizontalOverflow > 1) {
              routeFailures.push(`overflow horizontal de ${overflow.horizontalOverflow}px`);
            }
            if (overflow.clippedControls > 0) {
              routeFailures.push(`${overflow.clippedControls} controles cortados horizontalmente`);
            }
            if (!focus?.visible) routeFailures.push("primeiro foco por teclado não está visível");
            if (!focus?.indicator)
              routeFailures.push("primeiro foco por teclado não possui indicador visual");
            if (viewport.axe) {
              const results = await new AxeBuilder({ page }).analyze();
              axe = {
                scanned: true,
                seriousOrCritical: results.violations
                  .filter((violation) => ["serious", "critical"].includes(violation.impact ?? ""))
                  .map((violation) => violation.id),
              };
              if (axe.seriousOrCritical.length) {
                routeFailures.push(`axe sério/crítico: ${axe.seriousOrCritical.join(", ")}`);
              }
            }
          } catch (error) {
            routeFailures.push(redact(error instanceof Error ? error.message : String(error), knownSecrets));
          }
          observations.push({
            surfaceId: surface.id,
            route: safePath(route),
            viewport: viewport.name,
            httpStatus: status,
            finalPath: safePath(page.url()),
            controls,
            controlInteraction,
            sourceControlContract,
            semanticStateSnapshots,
            focus,
            reducedMotion: await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
            horizontalOverflow: overflow.horizontalOverflow,
            clippedControls: overflow.clippedControls,
            axe,
            status: routeFailures.length ? "failed" : "passed",
            failures: routeFailures,
          });
        }
      }

      const semanticBindings = new Map<string, CmsSemanticBinding>();
      const semanticExecutions: CmsSemanticExecution[] = [];
      for (const observation of observations) {
        for (const binding of observation.controlInteraction.semanticBindings) {
          semanticBindings.set(`${binding.surfaceId}|${binding.controlId}`, binding);
        }
        semanticExecutions.push(...observation.controlInteraction.semanticExecutions);
      }
      semanticCoverage = validateCmsSemanticCoverage({
        bindings: [...semanticBindings.values()],
        executions: semanticExecutions,
        expectedSurfaceIds: authenticatedSurfaces.map((item) => item.id),
        expectedViewports: testedViewports.map(({ name }) => name as CmsSemanticViewport),
      });
      if (semanticCoverage.status !== "passed") {
        throw new Error(
          `Gate semântico reprovado em ${semanticCoverage.failures.length} vínculo(s)/execução(ões).`,
        );
      }

      currentContext = { surfaceId: "menu-navigation", viewport: "1440x900" };
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await expect(page.locator("[data-admin-surface]")).toBeVisible();
      const expectedMenuPaths = [
        ...new Set(source.matrix.map((item) => item.menuPath).filter(Boolean)),
      ] as string[];
      const actualMenuPaths = await page.locator('aside a[href^="/admin"]').evaluateAll((links) =>
        links.map((link) => {
          const url = new URL((link as HTMLAnchorElement).href);
          return `${url.pathname}${url.search}`;
        }),
      );
      const unclassifiedMenuLinks = [...new Set(actualMenuPaths)].filter(
        (path) => !expectedMenuPaths.includes(path),
      );
      if (unclassifiedMenuLinks.length) {
        menuResults.push({
          status: "failed",
          reason: "link renderizado sem classificação",
          count: unclassifiedMenuLinks.length,
        });
      }
      for (const menuPath of expectedMenuPaths) {
        await page.goto("/admin", { waitUntil: "domcontentloaded" });
        const link = page.locator(`aside a[href="${menuPath}"]`).first();
        if (!(await link.isVisible().catch(() => false))) {
          menuResults.push({ menuPath: safePath(menuPath), status: "failed", reason: "entrada não visível" });
          continue;
        }
        await link.click();
        await page.waitForURL((url) => `${url.pathname}${url.search}` === menuPath, { timeout: 10_000 });
        menuResults.push({ menuPath: safePath(menuPath), status: "passed" });
      }

      await page.goto("/admin", { waitUntil: "domcontentloaded" });
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileMenu = page.getByRole("button", { name: "Abrir menu administrativo" });
      await mobileMenu.click();
      await expect(page.getByRole("complementary", { name: "Menu principal do CMS" })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(mobileMenu).toBeFocused();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.keyboard.press("Control+k");
      const globalSearch = page.locator("#admin-global-search");
      if (await globalSearch.isVisible().catch(() => false)) {
        await expect(globalSearch).toBeFocused();
        await page.keyboard.press("Escape");
      }

      currentContext = { surfaceId: "auth-logout", viewport: "1440x900" };
      await page.getByRole("button", { name: "Sair" }).click();
      await expect(page).toHaveURL(/\/admin\/login$/, { timeout: 20_000 });
      await page.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/admin\/login$/);
      await expect(page.getByText("Entre para continuar")).toBeVisible();
      authJourney.push({
        step: "logout_and_protected_route_rejection",
        result: "passed",
        sessionRetained: false,
      });

      const failedRoutes = observations.filter((item) => item.status === "failed");
      const failedMenus = menuResults.filter((item) => item.status === "failed");
      if (
        failedRoutes.length ||
        failedMenus.length ||
        consoleFailures.length ||
        httpFailures.length ||
        requestFailures.length
      ) {
        throw new Error(
          `Cobertura reprovada: rotas=${failedRoutes.length}, menus=${failedMenus.length}, console=${consoleFailures.length}, HTTP=${httpFailures.length}, rede=${requestFailures.length}.`,
        );
      }
      completion = "passed";
    } catch (error) {
      failureSummary = redact(error instanceof Error ? error.message : String(error), knownSecrets);
      throw error;
    } finally {
      mergeReport("authenticated", {
        status: completion,
        failureSummary,
        origin: baseURL ? new URL(baseURL).origin : null,
        account: "operador QA configurado por segredo; identificador omitido",
        mfa: "TOTP AAL2 pela interface; segredo/código omitidos",
        syntheticIds: "criados pela UI e resolvidos do handoff SHA/runTag-bound; valores omitidos",
        rollbackCompatibility,
        candidateBackendSha: rollbackCompatibility ? auth.expectedSha : undefined,
        frontendSha: frontendExpectedSha,
        shaBinding:
          completion === "passed" ? "inventário e X-Release conferidos em todas as rotas" : "não comprovado",
        viewports: testedViewports.map(({ name, width, height }) => ({ name, width, height })),
        observations,
        semanticContract: {
          schemaVersion: 1,
          requiredViewports: rollbackCompatibility ? ["1440x900"] : [...CMS_SEMANTIC_VIEWPORTS],
          result: semanticCoverage,
          focusOrObservationAcceptedAsActionEvidence: false,
        },
        menuResults,
        authJourney,
        consoleFailures,
        httpFailures,
        requestFailures,
        rawBrowserArtifacts: "desabilitados para impedir persistência de senha/TOTP",
      });
    }
  });

  test("@ui-bootstrap @mutating entidades nascem na UI e percorrem backend, público, rollback e auditoria", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "ciclo mutante é executado uma única vez");
    const configuration = mutatingConfiguration(baseURL);
    test.skip(
      !configuration.enabled,
      "ciclo mutante opt-in; QA_CMS_REQUIRE_AUTHENTICATED não foi habilitado pelo provisionador",
    );
    if (!configuration.enabled) throw new Error("Gate mutante inconsistente após o opt-in.");

    test.setTimeout(25 * 60_000);
    const { environment, auth, runTag, supabaseOrigin } = configuration;
    const source = inventory();
    let plans: EditorialSurfacePlan[] = [];
    const expectedUnavailableQueries = new Set<string>();
    const knownSecrets = [
      auth.email,
      auth.password,
      auth.totpSecret,
      process.env.QA_CMS_SUPABASE_ANON_KEY,
      process.env.QA_CMS_PRODUCTION_AUTHORIZATION,
      runTag,
    ];
    const steps: MutationStepEvidence[] = [];
    const runtimeFailures: string[] = [];
    const surfaceResults: Array<{
      kind: EditorialSurfaceKind;
      status: "passed" | "failed";
      finalSyntheticState: "published-for-downstream" | "archived-after-failure" | "cleanup-pending";
      failureSummary: string | null;
    }> = [];
    const completed = new Set<EditorialSurfaceKind>();
    const publishedLifecycles = new Map<EditorialSurfaceKind, PublishedLifecycleResult>();
    const cleanupFailures: string[] = [];
    const observedPages = new WeakSet<Page>();
    let scenarioFailure: unknown = null;
    let syntheticForm: SyntheticFormFixture | null = null;
    let lead: CmsUiCreatedState["lead"] | null = null;
    let releaseEvidence: { releaseId: string; httpStatus: number; status: "rolled_back" } | null = null;
    let comparisonProduct: {
      plan: EditorialSurfacePlan;
      lifecycle: PublishedLifecycleResult;
    } | null = null;
    const operationalGaps: Array<Record<string, string>> = [];

    const observe = (target: Page) => {
      if (observedPages.has(target)) return;
      observedPages.add(target);
      target.on("console", (message) => {
        if (message.type() === "error") runtimeFailures.push(redact(message.text(), knownSecrets));
      });
      target.on("pageerror", (error) => runtimeFailures.push(redact(error.message, knownSecrets)));
      target.on("response", (response) => {
        const url = new URL(response.url());
        if (
          ["/auth/v1/", "/rest/v1/", "/functions/v1/"].some((segment) => url.pathname.includes(segment)) &&
          url.origin !== supabaseOrigin
        ) {
          runtimeFailures.push(
            "Uma chamada CMS/Auth foi enviada para um backend diferente do alvo confirmado.",
          );
        }
        const evidenceKey = publicQueryEvidenceKeyFromUrl(url, plans);
        if (response.status() === 404 && evidenceKey && expectedUnavailableQueries.has(evidenceKey)) {
          return;
        }
        if (response.status() >= 400) {
          runtimeFailures.push(
            redact(`HTTP ${response.status()} inesperado em ${safePath(response.url())}.`, knownSecrets),
          );
        }
      });
      target.on("requestfailed", (request) => {
        const reason = request.failure()?.errorText ?? "falha de rede";
        if (!reason.includes("ERR_ABORTED")) {
          runtimeFailures.push(
            redact(`Falha de rede em ${safePath(request.url())}: ${reason}.`, knownSecrets),
          );
        }
      });
    };
    context.pages().forEach(observe);
    context.on("page", observe);
    page.on("dialog", (dialog) => void dialog.accept());

    try {
      if (source.sourceDirty) {
        throw new Error("O checkout da suíte está sujo e não pode produzir evidência mutante.");
      }
      if (source.sourceSha !== auth.expectedSha) {
        throw new Error("O SHA do checkout diverge do candidato mutante; valores omitidos.");
      }
      await assertTargetDeployment(page, auth.expectedSha, environment);
      steps.push({ step: `${environment}_entity_sha_gate`, result: "passed", httpStatus: 200 });
      await signInWithAal2(page, auth);
      steps.push({ step: "entity_fixture_authenticated_aal2", result: "passed" });
      await assertNewDraftsStartIncomplete(page, supabaseOrigin);
      steps.push({
        step: "new_drafts_validate_incomplete_and_product_persists_private_progress",
        result: "passed",
      });

      try {
        syntheticForm = await createAndRollbackSyntheticForm(
          page,
          runTag,
          supabaseOrigin,
          steps,
          (created) => {
            syntheticForm = created;
          },
        );
      } catch (error) {
        scenarioFailure ??= error;
      }

      if (!syntheticForm) throw new Error("O formulário obrigatório não nasceu pela UI.");
      const createdIds = await createMandatoryEditorialSurfacesViaUi(
        page,
        runTag,
        supabaseOrigin,
        syntheticForm,
      );
      plans = editorialSurfacePlans(createdIds);
      knownSecrets.push(...plans.map((plan) => plan.itemId));
      steps.push({ step: "seven_editorial_entities_created_via_new_routes", result: "passed" });
      let campaignPath = "";

      for (const plan of plans) {
        let failureSummary: string | null = null;
        try {
          const lifecycle = await runEditorialSurfaceLifecycle({
            page,
            context,
            plan,
            runTag,
            expectedSha: auth.expectedSha,
            expectedApiOrigin: supabaseOrigin,
            expectedUnavailableQueries,
            steps,
            form: plan.kind === "campaign" ? (syntheticForm ?? undefined) : undefined,
            retainPublished: true,
          });
          if (plan.kind === "campaign") campaignPath = lifecycle.publicPath;
          publishedLifecycles.set(plan.kind, lifecycle);
          completed.add(plan.kind);
        } catch (error) {
          failureSummary = redact(error instanceof Error ? error.message : String(error), knownSecrets);
          if (!scenarioFailure) scenarioFailure = error;
        } finally {
          if (!completed.has(plan.kind)) {
            try {
              const cleanup = await archiveEditorialSurface(page, plan, supabaseOrigin);
              steps.push(cleanup);
              completed.add(plan.kind);
            } catch (error) {
              const cleanupError = redact(
                error instanceof Error ? error.message : String(error),
                knownSecrets,
              );
              cleanupFailures.push(`${plan.kind}: ${cleanupError}`);
            }
          }
          surfaceResults.push({
            kind: plan.kind,
            status: failureSummary ? "failed" : "passed",
            finalSyntheticState: failureSummary
              ? completed.has(plan.kind)
                ? "archived-after-failure"
                : "cleanup-pending"
              : "published-for-downstream",
            failureSummary,
          });
        }
      }

      if (!campaignPath) throw new Error("A campanha criada pela UI não expôs rota pública.");
      if (publishedLifecycles.size !== plans.length) {
        throw new Error("Os consumidores públicos não receberam todas as entidades obrigatórias.");
      }
      comparisonProduct = await createComparisonProductViaUi({
        page,
        context,
        ids: createdIds,
        runTag,
        expectedSha: auth.expectedSha,
        expectedApiOrigin: supabaseOrigin,
        expectedUnavailableQueries,
        steps,
      });
      await expectSupplementalPublicConsumers({
        context,
        plans,
        lifecycles: publishedLifecycles,
        comparison: comparisonProduct,
        form: syntheticForm,
        expectedSha: auth.expectedSha,
      });
      steps.push({
        step: "all_declared_public_consumers_and_two_product_comparison",
        result: "passed",
        httpStatus: 200,
      });
      lead = await createLeadViaPublicUiAndMarkResponded({
        page,
        context,
        campaignPath,
        form: syntheticForm,
        runTag,
        expectedApiOrigin: supabaseOrigin,
      });
      steps.push({
        step: "public_lead_created_and_marked_responded_via_ui",
        result: "passed",
        httpStatus: 201,
      });
      const campaignPlan = plans.find((plan) => plan.kind === "campaign");
      if (!campaignPlan) throw new Error("Plano de campanha ausente após captura pública.");
      registerEditorialHttpConsumer(
        campaignPlan,
        "lead-capture",
        "campaign-public-lead-capture-and-admin-responded",
        auth.expectedSha,
        201,
      );
      releaseEvidence = await runSyntheticEditorialReleaseViaUi({
        page,
        runTag,
        itemIds: Object.values(createdIds),
        expectedApiOrigin: supabaseOrigin,
      });
      steps.push({
        step: "editorial_release_create_validate_approve_publish_rollback_via_ui",
        result: "passed",
        backendStatus: releaseEvidence.status,
        httpStatus: releaseEvidence.httpStatus,
      });
      pendingUiHandoff = {
        environment,
        candidateSha: auth.expectedSha,
        runTag,
        actorId: fixtureActorId(environment, auth.expectedSha, runTag),
        ids: createdIds,
        form: syntheticForm,
        lead,
      };
      if (completed.size === plans.length) {
        steps.push(await expectEditorialAudit(page, plans, runTag, syntheticForm));
      }
      if (runtimeFailures.length && !scenarioFailure) {
        scenarioFailure = new Error(
          `Os ciclos editoriais detectaram ${runtimeFailures.length} falha(s) de console/rede/HTTP.`,
        );
      }
    } catch (error) {
      scenarioFailure ??= error;
    } finally {
      for (const plan of scenarioFailure ? plans : []) {
        try {
          const cleanup = await archiveEditorialSurface(page, plan, supabaseOrigin);
          steps.push(cleanup);
          completed.add(plan.kind);
        } catch (error) {
          cleanupFailures.push(
            `${plan.kind}: ${redact(error instanceof Error ? error.message : String(error), knownSecrets)}`,
          );
        }
      }
      if (syntheticForm && scenarioFailure) {
        try {
          steps.push(await archiveSyntheticForm(page, syntheticForm, runTag, supabaseOrigin));
        } catch (error) {
          cleanupFailures.push(
            `form: ${redact(error instanceof Error ? error.message : String(error), knownSecrets)}`,
          );
        }
      }
      if (comparisonProduct && scenarioFailure) {
        try {
          steps.push(await archiveEditorialSurface(page, comparisonProduct.plan, supabaseOrigin));
        } catch (error) {
          cleanupFailures.push(
            `comparison-product: ${redact(error instanceof Error ? error.message : String(error), knownSecrets)}`,
          );
        }
      }
      const failed = Boolean(
        scenarioFailure ||
        cleanupFailures.length ||
        runtimeFailures.length ||
        completed.size !== plans.length ||
        !lead ||
        !releaseEvidence,
      );
      mergeReport("mutatingEntityLifecycles", {
        status: failed ? "failed" : "passed",
        failureSummary: scenarioFailure
          ? redact(
              scenarioFailure instanceof Error ? scenarioFailure.message : String(scenarioFailure),
              knownSecrets,
            )
          : null,
        environment: `${environment} confirmado por /healthz`,
        origin: baseURL ? new URL(baseURL).origin : null,
        account: "operador sintético provisionado; identificador omitido",
        mfa: "AAL2 TOTP pela UI; segredo e código omitidos",
        runTag,
        surfaceResults,
        finalSyntheticStates: failed
          ? `${completed.size}/${plans.length} neutralizados ou pendentes após falha`
          : `${completed.size}/${plans.length} publicados para consumidores downstream; cleanup governado pendente`,
        formFinalSyntheticState: syntheticForm
          ? failed
            ? "retired-or-cleanup-pending"
            : "published-for-downstream"
          : "not-created",
        cleanupFailures,
        operationalGaps,
        positiveLeadSubmitted: Boolean(lead),
        comparisonConsumerValidated: Boolean(comparisonProduct),
        positivePublicLeadEvidence: lead ? "lead-capture-201-and-admin-responded" : "missing",
        externalDeliveryAttempted: "suppressed for exact synthetic origin by backend policy",
        editorialRelease: releaseEvidence
          ? {
              status: releaseEvidence.status,
              workflow: "create-add-validate-submit-approve-publish-rollback",
            }
          : { status: "missing" },
        auditPreserved: steps.some(
          (step) => step.step === "all_editorial_archives_visible_in_immutable_audit",
        ),
        steps,
        runtimeFailures,
        rawBrowserArtifacts: "desabilitados para impedir persistência de senha/TOTP",
      });
    }
    if (scenarioFailure) throw scenarioFailure;
    if (cleanupFailures.length || completed.size !== plans.length || !pendingUiHandoff) {
      throw new Error("O bootstrap UI não convergiu; consulte o relatório sanitizado.");
    }
  });

  test("@ui-bootstrap @mutating página nasce na UI e conclui o handoff SHA-bound", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "ciclo mutante é executado uma única vez");
    const configuration = mutatingConfiguration(baseURL);
    test.skip(
      !configuration.enabled,
      "ciclo mutante opt-in; QA_CMS_REQUIRE_AUTHENTICATED não foi habilitado pelo provisionador",
    );
    if (!configuration.enabled) throw new Error("Gate mutante inconsistente após o opt-in.");

    test.setTimeout(20 * 60_000);
    const { environment, auth, runTag, supabaseOrigin } = configuration;
    const source = inventory();
    const slug = `qa-cms-final-gone-${auth.expectedSha.slice(0, 8)}`;
    const publicPath = `/${slug}`;
    const knownSecrets = [
      auth.email,
      auth.password,
      auth.totpSecret,
      process.env.QA_CMS_SUPABASE_ANON_KEY,
      process.env.QA_CMS_PRODUCTION_AUTHORIZATION,
      runTag,
      slug,
      publicPath,
    ];
    const draftTitle = `${runTag} RASCUNHO`;
    const revisionOneTitle = `${runTag} gone`;
    const revisionTwoTitle = `${runTag} R2`;
    const revisionOneHero = `${runTag} PUBLICAÇÃO R1`;
    const revisionTwoHero = `${runTag} PUBLICAÇÃO R2`;
    const revisionOneSeo = `${runTag} R1 | GAIATEC`;
    const revisionTwoSeo = `${runTag} R2 | GAIATEC`;
    const steps: MutationStepEvidence[] = [];
    const runtimeFailures: string[] = [];
    const observedPages = new WeakSet<Page>();
    let itemId: string | null = null;
    let archived = false;
    let scenarioError: string | null = null;
    let scenarioFailure: unknown = null;
    let cleanupError: string | null = null;
    let expectedConcurrencyConflict = false;

    const observe = (target: Page) => {
      if (observedPages.has(target)) return;
      observedPages.add(target);
      target.on("console", (message) => {
        if (message.type() === "error") runtimeFailures.push(redact(message.text(), knownSecrets));
      });
      target.on("pageerror", (error) => runtimeFailures.push(redact(error.message, knownSecrets)));
      target.on("response", (response) => {
        const url = new URL(response.url());
        if (
          ["/auth/v1/", "/rest/v1/", "/functions/v1/"].some((segment) => url.pathname.includes(segment)) &&
          url.origin !== supabaseOrigin
        ) {
          runtimeFailures.push(
            "Uma chamada CMS/Auth foi enviada para um backend diferente do alvo confirmado.",
          );
        }
        if (
          response.status() >= 400 &&
          !(response.status() === 410 && url.pathname === publicPath) &&
          !(
            expectedConcurrencyConflict &&
            response.status() === 409 &&
            url.pathname.endsWith("/functions/v1/cms-content")
          )
        ) {
          runtimeFailures.push(
            redact(`HTTP ${response.status()} inesperado em ${safePath(response.url())}.`, knownSecrets),
          );
        }
      });
      target.on("requestfailed", (request) => {
        const reason = request.failure()?.errorText ?? "falha de rede";
        if (!reason.includes("ERR_ABORTED")) {
          runtimeFailures.push(
            redact(`Falha de rede em ${safePath(request.url())}: ${reason}.`, knownSecrets),
          );
        }
      });
    };
    context.pages().forEach(observe);
    context.on("page", observe);
    page.on("dialog", (dialog) => void dialog.accept());

    try {
      if (source.sourceDirty) {
        throw new Error("O checkout da suíte está sujo e não pode produzir evidência mutante.");
      }
      if (source.sourceSha !== auth.expectedSha) {
        throw new Error("O SHA do checkout diverge do candidato mutante; valores omitidos.");
      }
      await assertTargetDeployment(page, auth.expectedSha, environment);
      steps.push({ step: `${environment}_sha_gate`, result: "passed", httpStatus: 200 });
      await signInWithAal2(page, auth);
      steps.push({ step: "authenticated_aal2", result: "passed" });

      const editorResponse = await page.goto("/admin/paginas/novo?type=page&template=institutional", {
        waitUntil: "domcontentloaded",
      });
      if (editorResponse?.status() !== 200 || editorResponse.headers()["x-release"] !== auth.expectedSha) {
        throw new Error("O construtor não foi servido pelo SHA homologado.");
      }
      await expect(page.getByRole("heading", { name: "Nova página" })).toBeVisible();
      await fillManagedPageRevision(page, {
        title: draftTitle,
        summary: `${runTag} criado exclusivamente pela UI em staging.`,
        heroTitle: `${runTag} HERO RASCUNHO`,
        seoTitle: `${runTag} RASCUNHO | GAIATEC`,
        path: publicPath,
        configureGone: true,
      });
      await expect(page.locator(".admin-builder-status")).toContainText("Contrato: válido");
      const created = await clickEditorialAction(
        page,
        "create",
        "draft",
        () => page.getByRole("button", { name: "Criar página" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-create",
          controlName: "Criar página",
          scenarioId: "page-create-via-ui",
        },
      );
      itemId = created.itemId;
      steps.push(created.evidence);
      await page.waitForURL(/\/admin\/paginas\/[0-9a-f-]{36}$/i, { timeout: 20_000 });
      if (!page.url().endsWith(`/${itemId}`)) {
        throw new Error("A UI não navegou para o item confirmado pelo backend.");
      }
      await expectBuilderState(page, "draft");

      await page.reload({ waitUntil: "domcontentloaded" });
      await expectBuilderState(page, "draft");
      await expect(page.getByLabel("Título administrativo e público")).toHaveValue(draftTitle);
      const initialSave = await clickEditorialAction(
        page,
        "save",
        "draft",
        () => page.getByRole("button", { name: "Salvar rascunho" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Salvar rascunho",
          scenarioId: "page-save-initial-draft-via-ui",
        },
      );
      steps.push({ ...initialSave.evidence, step: "save_initial_draft" });
      await expectBuilderState(page, "draft");

      const concurrentPage = await context.newPage();
      await concurrentPage.goto(`/admin/paginas/${itemId}`, { waitUntil: "domcontentloaded" });
      await expectBuilderState(concurrentPage, "draft");

      await fillManagedPageRevision(page, {
        title: revisionOneTitle,
        summary: "Página sintética para validar retirada gone.",
        heroTitle: revisionOneHero,
        seoTitle: revisionOneSeo,
      });
      await expect(page.locator(".admin-builder-status")).toContainText("Contrato: válido");
      const firstSave = await clickEditorialAction(
        page,
        "save",
        "draft",
        () => page.getByRole("button", { name: "Salvar rascunho" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Salvar rascunho",
          scenarioId: "page-save-revision-1-via-ui",
        },
      );
      steps.push({ ...firstSave.evidence, step: "edit_and_save_revision_1" });

      expectedConcurrencyConflict = true;
      try {
        await concurrentPage
          .getByLabel("Título administrativo e público")
          .fill(`${runTag} EDIÇÃO CONCORRENTE REJEITADA`);
        const conflictPromise = waitForEditorialResponse(concurrentPage, "save", supabaseOrigin);
        await concurrentPage.getByRole("button", { name: "Salvar rascunho" }).click();
        const conflict = await conflictPromise;
        if (conflict.status() !== 409) {
          throw new Error(`Edição concorrente respondeu ${conflict.status()}, esperado 409.`);
        }
        await expect(concurrentPage.getByRole("alert")).toContainText(/conflito|alterad|versão|recarreg/i);
        steps.push({ step: "concurrent_stale_edit_rejected", result: "passed", httpStatus: 409 });
      } finally {
        expectedConcurrencyConflict = false;
        await concurrentPage.close();
      }

      await page.reload({ waitUntil: "domcontentloaded" });
      await expectBuilderState(page, "draft");
      await expect(page.getByLabel("Título administrativo e público")).toHaveValue(revisionOneTitle);
      await page.getByRole("tab", { name: "Blocos" }).click();
      await expect(
        page.locator(".admin-block-selection").first().getByLabel("Título", { exact: true }),
      ).toHaveValue(revisionOneHero);
      await page.getByRole("tab", { name: "SEO e URL" }).click();
      await expect(page.getByLabel("Endereço público")).toHaveValue(publicPath);
      await expect(page.getByLabel("Meta title")).toHaveValue(revisionOneSeo);
      steps.push({ step: "reload_persistence_revision_1", result: "passed" });

      await page.getByRole("tab", { name: "Publicação" }).click();
      await page.getByLabel("Motivo da alteração").fill(`${runTag} revisão humana R1`);
      const submitted = await clickEditorialAction(
        page,
        "submit",
        "in_review",
        () => page.getByRole("button", { name: "Enviar para revisão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Enviar para revisão",
          scenarioId: "page-submit-revision-1-via-ui",
        },
      );
      steps.push(submitted.evidence);
      await expectBuilderState(page, "in_review");
      const approved = await clickEditorialAction(
        page,
        "approve",
        "approved",
        () => page.getByRole("button", { name: "Aprovar revisão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Aprovar revisão",
          scenarioId: "page-approve-revision-1-via-ui",
        },
      );
      steps.push(approved.evidence);
      await expectBuilderState(page, "approved");

      const popupPromise = page.waitForEvent("popup", { timeout: 20_000 });
      const previewNavigationPromise = context.waitForEvent("response", {
        predicate: (response) =>
          response.request().isNavigationRequest() &&
          /^\/preview\/[A-Za-z0-9_-]+$/.test(new URL(response.url()).pathname),
        timeout: 30_000,
      });
      const previewApiPromise = page.waitForResponse(
        (response) => {
          const url = new URL(response.url());
          return (
            response.request().method() === "POST" &&
            url.origin === supabaseOrigin &&
            url.pathname.endsWith("/functions/v1/cms-preview")
          );
        },
        { timeout: 30_000 },
      );
      await page.getByRole("button", { name: "Preview salvo" }).click();
      const [previewPage, previewApiResponse, previewNavigation] = await Promise.all([
        popupPromise,
        previewApiPromise,
        previewNavigationPromise,
      ]);
      const previewBody = (await previewApiResponse.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      const previewNavigationPath = new URL(previewNavigation.url()).pathname;
      if (
        !previewApiResponse.ok() ||
        previewNavigation.status() !== 200 ||
        typeof previewBody?.path !== "string" ||
        !/^\/preview\/[A-Za-z0-9_-]+$/.test(previewBody.path) ||
        previewNavigationPath !== previewBody.path ||
        previewNavigation.headers()["x-release"] !== auth.expectedSha
      ) {
        throw new Error("O preview privado não foi emitido pelo backend/SHA homologado.");
      }
      await expect(previewPage.getByText("Preview privado — alterações ainda não publicadas")).toBeVisible();
      await expect(previewPage.getByRole("heading", { level: 1, name: revisionOneHero })).toBeVisible();
      await previewPage.close();
      for (const surfaceId of ["page-create", "page-edit"]) {
        const consumer = "/preview/:token";
        const consumerContractKey = publicConsumerContractKey(surfaceId, consumer, 0);
        registerPublicConsumerEvidence({
          surfaceId,
          consumer,
          consumerOccurrence: 0,
          consumerKind: "http",
          scenarioId: "managed-page-private-preview",
          evidenceReference: semanticScenarioReference(
            "managed-page-private-preview",
            consumerContractKey,
            "sealed-preview-navigation",
          ),
          expectedStatus: 200,
          observedStatus: 200,
          candidateSha: auth.expectedSha,
          noInternalOrUnpublishedContent: true,
          cacheInvalidation: "not-applicable",
          cacheJustification:
            "O token de preview é privado, efêmero e explicitamente não armazenável em cache.",
        });
      }
      steps.push({ step: "private_preview_revision_1", result: "passed", httpStatus: 200 });

      const firstPublish = await clickEditorialAction(
        page,
        "publish",
        "published",
        () => page.getByRole("button", { name: "Publicar agora" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Publicar agora",
          scenarioId: "page-publish-revision-1-via-ui",
        },
      );
      steps.push({ ...firstPublish.evidence, step: "publish_revision_1" });
      await expectBuilderState(page, "published");
      steps.push(
        await expectPublicRevision(
          context,
          publicPath,
          revisionOneTitle,
          revisionOneHero,
          revisionOneSeo,
          auth.expectedSha,
          supabaseOrigin,
        ),
      );

      await page.getByRole("tab", { name: "Publicação" }).click();
      const reopened = await clickEditorialAction(
        page,
        "reopen",
        "draft",
        () => page.getByRole("button", { name: "Abrir nova versão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Abrir nova versão",
          scenarioId: "page-reopen-revision-2-via-ui",
        },
      );
      steps.push(reopened.evidence);
      await expectBuilderState(page, "draft");
      await fillManagedPageRevision(page, {
        title: revisionTwoTitle,
        summary: `${runTag} segunda revisão controlada.`,
        heroTitle: revisionTwoHero,
        seoTitle: revisionTwoSeo,
      });
      const secondSave = await clickEditorialAction(
        page,
        "save",
        "draft",
        () => page.getByRole("button", { name: "Salvar rascunho" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Salvar rascunho",
          scenarioId: "page-save-revision-2-via-ui",
        },
      );
      steps.push({ ...secondSave.evidence, step: "edit_and_save_revision_2" });
      await page.reload({ waitUntil: "domcontentloaded" });
      await expectBuilderState(page, "draft");
      await expect(page.getByLabel("Título administrativo e público")).toHaveValue(revisionTwoTitle);
      steps.push({ step: "reload_persistence_revision_2", result: "passed" });

      await page.getByRole("tab", { name: "Publicação" }).click();
      await page.getByLabel("Motivo da alteração").fill(`${runTag} revisão humana R2`);
      const secondSubmit = await clickEditorialAction(
        page,
        "submit",
        "in_review",
        () => page.getByRole("button", { name: "Enviar para revisão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Enviar para revisão",
          scenarioId: "page-submit-revision-2-via-ui",
        },
      );
      steps.push({ ...secondSubmit.evidence, step: "submit_revision_2" });
      await expectBuilderState(page, "in_review");
      const secondApprove = await clickEditorialAction(
        page,
        "approve",
        "approved",
        () => page.getByRole("button", { name: "Aprovar revisão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Aprovar revisão",
          scenarioId: "page-approve-revision-2-via-ui",
        },
      );
      steps.push({ ...secondApprove.evidence, step: "approve_revision_2" });
      await expectBuilderState(page, "approved");
      const secondPublish = await clickEditorialAction(
        page,
        "publish",
        "published",
        () => page.getByRole("button", { name: "Publicar agora" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Publicar agora",
          scenarioId: "page-publish-revision-2-via-ui",
        },
      );
      steps.push({ ...secondPublish.evidence, step: "publish_revision_2" });
      await expectBuilderState(page, "published");
      steps.push(
        await expectPublicRevision(
          context,
          publicPath,
          revisionTwoTitle,
          revisionTwoHero,
          revisionTwoSeo,
          auth.expectedSha,
          supabaseOrigin,
        ),
      );

      await page.getByRole("tab", { name: "Publicação" }).click();
      await page.getByLabel("Motivo da alteração").fill(`${runTag} restauração controlada R1`);
      const firstRevision = page.locator("details").filter({ hasText: /^Revisão 1 —/ });
      await expect(firstRevision).toHaveCount(1);
      await firstRevision.locator("summary").click();
      const restored = await clickEditorialAction(
        page,
        "restore",
        "published",
        () => firstRevision.getByRole("button", { name: "Restaurar como nova revisão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Restaurar como nova revisão",
          scenarioId: "page-restore-revision-1-via-ui",
        },
      );
      steps.push(restored.evidence);
      await expectBuilderState(page, "published");
      await page.getByRole("tab", { name: "Estrutura" }).click();
      await expect(page.getByLabel("Título administrativo e público")).toHaveValue(revisionOneTitle);
      await page.getByRole("tab", { name: "Publicação" }).click();
      await expect(page.getByText(/^Revisão 3 —/)).toBeVisible();
      steps.push(
        await expectPublicRevision(
          context,
          publicPath,
          revisionOneTitle,
          revisionOneHero,
          revisionOneSeo,
          auth.expectedSha,
          supabaseOrigin,
        ),
      );

      await page.getByLabel("Motivo da alteração").fill(`${runTag} retirada final 410`);
      const retired = await clickEditorialAction(
        page,
        "retire",
        "archived",
        () => page.getByRole("button", { name: "Retirar do ar" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Retirar do ar",
          scenarioId: "page-retire-410-via-ui",
        },
      );
      steps.push(retired.evidence);
      archived = true;
      await page.waitForURL(/\/admin\/paginas(?:\?.*)?$/, { timeout: 20_000 });
      steps.push(await expectRetiredPublicRoute(context, publicPath, auth.expectedSha));

      await page.goto(`/admin/paginas/${itemId}`, { waitUntil: "domcontentloaded" });
      await page.getByRole("tab", { name: "Publicação" }).click();
      await page.getByLabel("Motivo da alteração").fill(`${runTag} restauração para handoff downstream`);
      const retainedRevision = page.locator("details").filter({ hasText: /^Revisão 1 —/ });
      await expect(retainedRevision).toHaveCount(1);
      await retainedRevision.locator("summary").click();
      const retained = await clickEditorialAction(
        page,
        "restore",
        "published",
        () => retainedRevision.getByRole("button", { name: "Restaurar como nova revisão" }).click(),
        supabaseOrigin,
        {
          surfaceId: "page-edit",
          controlName: "Restaurar como nova revisão",
          scenarioId: "page-restore-for-downstream-via-ui",
        },
      );
      if (retained.itemId !== itemId) throw new Error("A restauração da página confirmou outro item.");
      archived = false;
      steps.push({ ...retained.evidence, step: "restore_page_for_downstream_handoff" });
      steps.push(
        await expectPublicRevision(
          context,
          publicPath,
          revisionOneTitle,
          revisionOneHero,
          revisionOneSeo,
          auth.expectedSha,
          supabaseOrigin,
        ),
      );

      if (!pendingUiHandoff) {
        throw new Error("O handoff parcial das demais entidades UI não está disponível no mesmo ciclo.");
      }
      if (
        pendingUiHandoff.environment !== environment ||
        pendingUiHandoff.candidateSha !== auth.expectedSha ||
        pendingUiHandoff.runTag !== runTag
      ) {
        throw new Error("O handoff parcial não pertence ao ambiente/SHA/runTag corrente.");
      }
      writeCmsUiCreatedState({
        repositoryRoot,
        state: {
          schemaVersion: 1,
          status: "ready",
          environment,
          candidateSha: auth.expectedSha,
          runTag,
          lease: {
            actorId: pendingUiHandoff.actorId,
            source: "cms-browser-fixture",
            resourceIdsCaptured: true,
          },
          ids: { ...pendingUiHandoff.ids, pageId: itemId },
          form: {
            id: pendingUiHandoff.form.formId,
            versionId: pendingUiHandoff.form.versionOneId,
            key: pendingUiHandoff.form.formKey,
            status: "published",
          },
          lead: pendingUiHandoff.lead,
        },
      });
      uiCreatedState(environment, auth.expectedSha, runTag);
      steps.push({ step: "sha_bound_ui_created_handoff_written_and_reloaded", result: "passed" });

      await page.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { name: "Auditoria" })).toBeVisible();
      const targetCell = page.getByRole("cell", { name: `content_item:${itemId}`, exact: true });
      await expect(targetCell).toBeVisible({ timeout: 20_000 });
      await expect(targetCell.locator("xpath=ancestor::tr")).toContainText("cms content retire");
      steps.push({ step: "immutable_audit_visible", result: "passed" });

      if (runtimeFailures.length) {
        throw new Error(`O ciclo mutante detectou ${runtimeFailures.length} falha(s) de console/rede/HTTP.`);
      }
    } catch (caught) {
      scenarioFailure = caught;
      scenarioError = redact(caught instanceof Error ? caught.message : String(caught), knownSecrets);
    } finally {
      if (scenarioFailure && itemId && !archived) {
        try {
          const cleanup = await archiveSyntheticFromUi(page, itemId, supabaseOrigin);
          steps.push(cleanup);
          archived = cleanup.backendStatus === "archived";
        } catch (caught) {
          cleanupError = redact(caught instanceof Error ? caught.message : String(caught), knownSecrets);
        }
      }
      mergeReport("mutatingEditorialLifecycle", {
        status: !scenarioError && !cleanupError && itemId && !archived ? "passed" : "failed",
        failureSummary: scenarioError,
        cleanupFailure: cleanupError,
        environment: `${environment} confirmado por /healthz`,
        origin: baseURL ? new URL(baseURL).origin : null,
        account: "operador sintético provisionado; identificador omitido",
        mfa: "AAL2 TOTP pela UI; segredo e código omitidos",
        runTag,
        itemId: "omitido",
        publicPath: "omitido",
        finalSyntheticState: archived ? "archived-after-failure" : "published-for-downstream",
        noindexRoute: true,
        externalDeliveryAttempted: false,
        syntheticMutations: steps.filter((step) => step.backendStatus).length,
        productionMutations:
          environment === "production" ? steps.filter((step) => step.backendStatus).length : 0,
        auditPreserved: steps.some((step) => step.step === "immutable_audit_visible"),
        steps,
        runtimeFailures,
        rawBrowserArtifacts: "desabilitados para impedir persistência de senha/TOTP",
      });
    }
    if (scenarioFailure) throw scenarioFailure;
    if (cleanupError) {
      throw new Error("O ciclo terminou, mas o arquivamento sintético pela UI falhou; consulte o relatório.");
    }
  });
});
