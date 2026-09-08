import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

type Configuration = {
  environment: "staging" | "production";
  expectedSha: string;
  runTag: string;
  siteOrigin: string;
  supabaseOrigin: string;
  anonKey: string;
  email: string;
  password: string;
  totpSecret: string;
  reviewer: IdentityCredentials;
  existingIdentity: IdentityCredentials;
};

type IdentityCredentials = {
  email: string;
  password: string;
  totpSecret: string;
};

type ContentAction = {
  body: Record<string, unknown>;
  requestBody: Record<string, unknown>;
  response: Response;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const reportPath = resolve(
  repositoryRoot,
  process.env.QA_CMS_SECURITY_REPORT_PATH ?? "outputs/cms-security-boundaries.json",
);
const STAGING_SITE = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const STAGING_SUPABASE = "https://glcqsosxwgmlhzgcsnzv.supabase.co";
const PRODUCTION_SUPABASE = "https://chfuhctnhqgyjowkvllv.supabase.co";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function configuration(
  baseURL: string | undefined,
  expectedEnvironment: "staging" | "production",
): Configuration | null {
  const requiredFlag =
    expectedEnvironment === "staging"
      ? process.env.QA_CMS_SECURITY_REQUIRED
      : process.env.QA_CMS_PRODUCTION_SECURITY_REQUIRED;
  if (requiredFlag !== "true") return null;
  const values = {
    expectedSha: process.env.QA_CMS_EXPECTED_SHA,
    runTag: process.env.QA_CMS_RUN_TAG,
    supabaseOrigin: process.env.QA_CMS_SUPABASE_URL,
    anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY,
    email: process.env.QA_CMS_EMAIL,
    password: process.env.QA_CMS_PASSWORD,
    totpSecret: process.env.QA_CMS_TOTP_SECRET,
    reviewerEmail: process.env.QA_CMS_REVIEWER_EMAIL,
    reviewerPassword: process.env.QA_CMS_REVIEWER_PASSWORD,
    reviewerTotpSecret: process.env.QA_CMS_REVIEWER_TOTP_SECRET,
    existingIdentityEmail: process.env.QA_CMS_EXISTING_IDENTITY_EMAIL,
    existingIdentityPassword: process.env.QA_CMS_EXISTING_IDENTITY_PASSWORD,
    existingIdentityTotpSecret: process.env.QA_CMS_EXISTING_IDENTITY_TOTP_SECRET,
  };
  if (Object.values(values).some((value) => !value)) {
    throw new Error("QA_CMS_SECURITY_CONFIGURATION_INCOMPLETE");
  }
  const site = new URL(baseURL ?? "https://invalid.invalid");
  const backend = new URL(values.supabaseOrigin!);
  if (
    process.env.QA_CMS_TARGET_ENVIRONMENT !== expectedEnvironment ||
    site.origin !== (expectedEnvironment === "staging" ? STAGING_SITE : "https://gaiatecsistemas.com.br") ||
    site.pathname !== "/" ||
    site.search ||
    site.hash ||
    backend.origin !== (expectedEnvironment === "staging" ? STAGING_SUPABASE : PRODUCTION_SUPABASE) ||
    backend.pathname !== "/" ||
    backend.search ||
    backend.hash
  ) {
    throw new Error("QA_CMS_SECURITY_TARGET_REFUSED");
  }
  if (!/^[a-f0-9]{40}$/.test(values.expectedSha!)) throw new Error("QA_CMS_SECURITY_SHA_INVALID");
  if (!/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(values.runTag!)) {
    throw new Error("QA_CMS_SECURITY_RUN_TAG_INVALID");
  }
  if (values.anonKey!.length < 24) throw new Error("QA_CMS_SECURITY_ANON_KEY_INVALID");
  if (
    expectedEnvironment === "production" &&
    process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${values.expectedSha}`
  ) {
    throw new Error("QA_CMS_SECURITY_PRODUCTION_AUTHORIZATION_REQUIRED");
  }
  return {
    environment: expectedEnvironment,
    expectedSha: values.expectedSha!,
    runTag: values.runTag!,
    siteOrigin: site.origin,
    supabaseOrigin: backend.origin,
    anonKey: values.anonKey!,
    email: values.email!,
    password: values.password!,
    totpSecret: values.totpSecret!,
    reviewer: {
      email: values.reviewerEmail!,
      password: values.reviewerPassword!,
      totpSecret: values.reviewerTotpSecret!,
    },
    existingIdentity: {
      email: values.existingIdentityEmail!,
      password: values.existingIdentityPassword!,
      totpSecret: values.existingIdentityTotpSecret!,
    },
  };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("QA_CMS_SECURITY_TOTP_INVALID");
  }
  let bits = "";
  for (const character of normalized) bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", base32Bytes(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const value =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(value % 1_000_000).padStart(6, "0");
}

async function signIn(page: Page, config: Configuration, identity: IdentityCredentials = config) {
  const response = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  expect(response?.headers()["x-release"]).toBe(config.expectedSha);
  await page.getByLabel("E-mail corporativo").fill(identity.email);
  await page.getByLabel("Senha").fill(identity.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/admin\/mfa$/);
  const windowPosition = Date.now() % 30_000;
  if (windowPosition > 27_000) await page.waitForTimeout(31_000 - windowPosition);
  await page.getByLabel("Código de 6 dígitos").fill(totp(identity.totpSecret));
  await page.getByRole("button", { name: "Verificar e entrar" }).click();
  await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
}

async function isolatedBrowserContext(
  ownerPage: Page,
  config: Configuration,
  observer: CmsBrowserObserver,
): Promise<BrowserContext> {
  const browser = ownerPage.context().browser();
  if (!browser) throw new Error("QA_CMS_SECURITY_BROWSER_UNAVAILABLE");
  const context = await browser.newContext({
    baseURL: config.siteOrigin,
    serviceWorkers: "block",
  });
  await installSealedPreviewRouting(context);
  observer.observeContext(context);
  return context;
}

async function proveAuthenticatedIdentityWithoutCmsProfile(
  ownerPage: Page,
  config: Configuration,
  observer: CmsBrowserObserver,
) {
  const context = await isolatedBrowserContext(ownerPage, config, observer);
  const page = await context.newPage();
  try {
    const login = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    expect(login?.status()).toBe(200);
    expect(login?.headers()["x-release"]).toBe(config.expectedSha);
    await page.getByLabel("E-mail corporativo").fill(config.existingIdentity.email);
    await page.getByLabel("Senha").fill(config.existingIdentity.password);
    const rejectedSession = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).origin === config.supabaseOrigin &&
        new URL(response.url()).pathname === "/functions/v1/cms-session" &&
        response.status() === 403,
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    expect((await rejectedSession).status()).toBe(403);
    await page.goto("/admin", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Acesso administrativo não autorizado" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("O acesso ao RDO não concede acesso administrativo.")).toBeVisible();
    await expect(page.locator(".admin-sidebar")).toHaveCount(0);
    assertSealedPreviewRoutingUsed(context);
  } finally {
    await context.close();
  }
}

async function invokeCmsUsersList(page: Page, config: Configuration) {
  return page.evaluate(
    async ({ anonKey, endpoint }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!accessToken) throw new Error("QA_CMS_SECURITY_SESSION_MISSING");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "list" }),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
      };
    },
    { anonKey: config.anonKey, endpoint: `${config.supabaseOrigin}/functions/v1/cms-users` },
  );
}

async function proveCmsActorWithoutUsersPermission(
  ownerPage: Page,
  config: Configuration,
  observer: CmsBrowserObserver,
) {
  const context = await isolatedBrowserContext(ownerPage, config, observer);
  const page = await context.newPage();
  try {
    await signIn(page, config, config.reviewer);
    const result = await invokeCmsUsersList(page, config);
    expect(result.status).toBe(403);
    expect(result.body).toEqual({ error: "Acesso administrativo insuficiente." });
    assertSealedPreviewRoutingUsed(context);
  } finally {
    await context.close();
  }
}

function contentResponse(page: Page, action: string, supabaseOrigin: string) {
  return page.waitForResponse(
    (response) => {
      if (
        response.request().method() !== "POST" ||
        new URL(response.url()).origin !== supabaseOrigin ||
        new URL(response.url()).pathname !== "/functions/v1/cms-content"
      ) {
        return false;
      }
      try {
        return (response.request().postDataJSON() as Record<string, unknown>).action === action;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
}

async function contentAction(
  page: Page,
  action: string,
  supabaseOrigin: string,
  trigger: () => Promise<void>,
): Promise<ContentAction> {
  const pending = contentResponse(page, action, supabaseOrigin);
  await trigger();
  const response = await pending;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const requestBody = response.request().postDataJSON() as Record<string, unknown>;
  expect(response.status()).toBeLessThan(300);
  expect(body).not.toBeNull();
  expect(uuidPattern.test(String(body?.correlationId ?? ""))).toBe(true);
  return { body: body!, requestBody, response };
}

async function fillGovernance(page: Page, config: Configuration) {
  await page.getByRole("tab", { name: "Governança" }).click();
  await page.getByLabel("Estado").selectOption("synthetic_test");
  await page.getByLabel("Owner de negócio").fill("QA CMS");
  await page.getByLabel("Revisor editorial").fill("QA CMS");
  const source = page
    .locator("fieldset")
    .filter({ has: page.locator("legend", { hasText: /^Fonte 1$/ }) })
    .first();
  const today = new Date().toISOString().slice(0, 10);
  await source.getByLabel("Referência da autorização").fill(config.runTag);
  await source.getByLabel("Data da autorização").fill(today);
  await source.getByLabel("Escopo dos direitos").fill("Homologação sintética de segurança");
  await source.getByLabel("Owner comercial").fill("QA CMS");
  await source.getByLabel("Owner técnico").fill("QA CMS");
  await source.getByLabel("Verificado em").fill(`${today}T12:00`);
  await source.getByLabel("Direitos de uso confirmados").check();
}

async function sendTamperedSave(
  page: Page,
  config: Configuration,
  createRequest: Record<string, unknown>,
  itemId: string,
  lockVersion: number,
) {
  const payload = structuredClone(createRequest.payload) as Record<string, unknown>;
  const blocks = structuredClone(payload.blocks) as Array<Record<string, unknown>>;
  blocks.push({
    id: "10000000-0000-4000-8000-000000000001",
    type: "cta",
    hidden: false,
    width: "content",
    tone: "light",
    data: {
      heading: "Payload adulterado",
      text: "não persistir",
      link: { label: "Executar", href: "javascript:window.__qaCmsXssExecuted=true" },
    },
  });
  payload.blocks = blocks;
  return page.evaluate(
    async ({ anonKey, endpoint, itemId, lockVersion, payload, slug }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!accessToken) throw new Error("QA_CMS_SECURITY_SESSION_MISSING");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          action: "save",
          itemId,
          contentType: null,
          slug,
          payload,
          expectedLockVersion: lockVersion,
          reason: "QA payload adulterado deve ser recusado",
        }),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
      };
    },
    {
      anonKey: config.anonKey,
      endpoint: `${config.supabaseOrigin}/functions/v1/cms-content`,
      itemId,
      lockVersion,
      payload,
      slug: String(createRequest.slug ?? ""),
    },
  );
}

async function sendMissingItemSave(
  page: Page,
  config: Configuration,
  createRequest: Record<string, unknown>,
  lockVersion: number,
) {
  return page.evaluate(
    async ({ anonKey, endpoint, requestBody, lockVersion }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!accessToken) throw new Error("QA_CMS_SECURITY_SESSION_MISSING");
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({
          ...requestBody,
          action: "save",
          itemId: crypto.randomUUID(),
          contentType: null,
          expectedLockVersion: lockVersion,
          reason: "QA UUID inexistente deve permanecer opaco",
        }),
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
      };
    },
    {
      anonKey: config.anonKey,
      endpoint: `${config.supabaseOrigin}/functions/v1/cms-content`,
      requestBody: createRequest,
      lockVersion,
    },
  );
}

async function authenticatedRestRows(page: Page, config: Configuration, path: string) {
  return page.evaluate(
    async ({ anonKey, endpoint }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!accessToken) throw new Error("QA_CMS_SECURITY_SESSION_MISSING");
      const response = await fetch(endpoint, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
    { anonKey: config.anonKey, endpoint: `${config.supabaseOrigin}${path}` },
  );
}

async function assertStoredDraftUnchanged(
  page: Page,
  config: Configuration,
  itemId: string,
  lockVersion: number,
  probeMarker: string,
) {
  const result = await page.evaluate(
    async ({ anonKey, endpoint }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!accessToken) throw new Error("QA_CMS_SECURITY_SESSION_MISSING");
      const response = await fetch(endpoint, {
        headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      });
      return {
        status: response.status,
        body: (await response.json().catch(() => null)) as unknown,
      };
    },
    {
      anonKey: config.anonKey,
      endpoint: `${config.supabaseOrigin}/rest/v1/cms_content_drafts?select=payload,lock_version&item_id=eq.${itemId}`,
    },
  );
  expect(result.status).toBe(200);
  expect(Array.isArray(result.body) ? result.body : []).toHaveLength(1);
  const draft = (result.body as Array<Record<string, unknown>>)[0]!;
  expect(draft.lock_version).toBe(lockVersion);
  const serializedPayload = JSON.stringify(draft.payload);
  expect(serializedPayload).toContain(probeMarker);
  expect(serializedPayload).not.toContain("javascript:window.__qaCmsXssExecuted");
}

async function advanceToPublished(page: Page, config: Configuration) {
  await page.getByRole("tab", { name: "Publicação" }).click();
  for (const [action, button, status] of [
    ["submit", "Enviar para revisão", "in_review"],
    ["approve", "Aprovar revisão", "approved"],
    ["publish", "Publicar agora", "published"],
  ] as const) {
    const result = await contentAction(page, action, config.supabaseOrigin, () =>
      page.getByRole("button", { name: button, exact: true }).click(),
    );
    expect(result.body.status).toBe(status);
  }
}

async function qaRateLimitProof(
  page: Page,
  config: Configuration,
  proofId: string,
  operation: "consume" | "cleanup",
  candidateSha = config.expectedSha,
) {
  const expectedUrl = new URL("/functions/v1/cms-public", config.supabaseOrigin);
  expectedUrl.searchParams.set("type", "qa-rate-limit-proof");
  const responsePromise = page.waitForResponse(
    (response) => response.request().method() === "GET" && response.url() === expectedUrl.href,
    { timeout: 30_000 },
  );
  const payloadPromise = page.evaluate(
    async ({ anonKey, endpoint, candidateSha, runTag, proofId, operation }) => {
      const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
      const stored = key
        ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
        : null;
      const accessToken = typeof stored?.access_token === "string" ? stored.access_token : null;
      if (!accessToken) throw new Error("QA_CMS_SECURITY_SESSION_MISSING");
      const response = await fetch(endpoint, {
        headers: {
          apikey: anonKey,
          Authorization: `Bearer ${accessToken}`,
          "X-CMS-QA-Candidate-Sha": candidateSha,
          "X-CMS-QA-Run-Tag": runTag,
          "X-CMS-QA-Proof": proofId,
          "X-CMS-QA-Operation": operation,
        },
      });
      return (await response.json().catch(() => null)) as Record<string, unknown> | null;
    },
    {
      anonKey: config.anonKey,
      endpoint: expectedUrl.href,
      candidateSha,
      runTag: config.runTag,
      proofId,
      operation,
    },
  );
  const [response, payload] = await Promise.all([responsePromise, payloadPromise]);
  return { response, payload };
}

function writeEvidence(value: Record<string, unknown>) {
  const fromRoot = relative(repositoryRoot, reportPath);
  if (!fromRoot || fromRoot === ".." || fromRoot.startsWith("../") || fromRoot.startsWith("..\\")) {
    throw new Error("QA_CMS_SECURITY_REPORT_PATH_REFUSED");
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
    throw new Error("QA_CMS_SECURITY_REPORT_SENSITIVE_VALUE_REFUSED");
  }
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, serialized, { encoding: "utf8", mode: 0o600 });
}

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });
test.beforeEach(async ({ context }) => {
  await installSealedPreviewRouting(context);
});
test.afterEach(async ({ context }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) assertSealedPreviewRoutingUsed(context);
});

test.describe.serial("CMS staging browser security boundaries", () => {
  test("@security-staging XSS e payload adulterado permanecem inertes; rate limit recupera", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "prova destrutiva controlada executada uma vez");
    const config = configuration(baseURL, "staging");
    test.skip(!config, "prova de segurança real de staging não habilitada");
    if (!config) throw new Error("QA_CMS_SECURITY_GATE_INCONSISTENT");
    test.setTimeout(6 * 60_000);

    const observer = createCmsBrowserObserver({
      suite: "cms-security-boundaries",
      expectedSha: config.expectedSha,
      sensitiveValues: [
        config.email,
        config.password,
        config.totpSecret,
        config.reviewer.email,
        config.reviewer.password,
        config.reviewer.totpSecret,
        config.existingIdentity.email,
        config.existingIdentity.password,
        config.existingIdentity.totpSecret,
        config.anonKey,
      ],
      expectedHttpFailures: [
        {
          id: "authenticated-rdo-only-identity-denied-cms-session",
          method: "POST",
          path: "/functions/v1/cms-session",
          statuses: [403],
          minOccurrences: 1,
          maxOccurrences: 4,
        },
        {
          id: "cms-editor-denied-user-administration",
          method: "POST",
          path: "/functions/v1/cms-users",
          statuses: [403],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "tampered-editorial-payload-rejected",
          method: "POST",
          path: "/functions/v1/cms-content",
          statuses: [422],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "unknown-editorial-uuid-remains-opaque",
          method: "POST",
          path: "/functions/v1/cms-content",
          statuses: [404],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "unbound-qa-rate-proof-hidden",
          method: "GET",
          path: "/functions/v1/cms-public",
          statuses: [404],
          minOccurrences: 2,
          maxOccurrences: 2,
        },
        {
          id: "isolated-qa-search-rate-limited",
          method: "GET",
          path: "/functions/v1/cms-public",
          statuses: [429],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
      ],
    });
    observer.observeContext(context);
    const probeMarker = `QA-XSS-PROBE-${config.expectedSha.slice(0, 8)}`;
    const hostileText = `<img src=x onerror="window.__qaCmsXssExecuted=true"><script>window.__qaCmsXssExecuted=true</script> ${probeMarker}`;
    const publicPath = `/qa-cms-security-${config.expectedSha.slice(0, 8)}`;
    let itemId = "";
    let finalState = "not-created";
    let status: "passed" | "failed" = "failed";
    let failure: string | null = null;
    const scenarios: Array<Record<string, unknown>> = [];

    await context.addInitScript(() => {
      (window as Window & { __qaCmsXssExecuted?: boolean }).__qaCmsXssExecuted = false;
    });

    try {
      const health = await sealedPreviewApiGet(page, "/healthz", { failOnStatusCode: false });
      expect(health.status()).toBe(200);
      expect(health.headers()["x-release"]).toBe(config.expectedSha);
      expect((await health.json()) as Record<string, unknown>).toMatchObject({
        environment: sealedPreviewDeploymentEnvironment(config.environment),
        release: config.expectedSha,
      });
      await signIn(page, config);
      await proveAuthenticatedIdentityWithoutCmsProfile(page, config, observer);
      scenarios.push({
        id: "authenticated-no-cms-profile-and-rdo-scope-separation",
        status: "passed",
        actorFixtureScope: "rdo-member-without-cms-profile-or-role",
        cmsSessionStatus: 403,
        protectedRouteStatus: "access-denied",
        cmsNavigationDisclosed: false,
      });
      await proveCmsActorWithoutUsersPermission(page, config, observer);
      scenarios.push({
        id: "authenticated-cms-actor-without-users-permission",
        status: "passed",
        actorFixtureRole: "editor",
        aal: "aal2",
        edgeFunction: "cms-users",
        responseStatus: 403,
        rowsDisclosed: 0,
      });

      await page.goto("/admin/paginas/novo?type=page&template=institutional", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
      await page.getByLabel("Título administrativo e público").fill(`${config.runTag} segurança XSS`);
      await page.getByLabel("Resumo").fill("Página sintética controlada para provar codificação de saída.");
      await page.getByRole("tab", { name: "Blocos" }).click();
      const richText = page.locator(".admin-block-selection").nth(1);
      if (!(await richText.locator("details").getAttribute("open")))
        await richText.locator("summary").click();
      await richText.getByLabel("Texto", { exact: true }).fill(hostileText);
      await page.getByRole("tab", { name: "SEO e URL" }).click();
      await page.getByLabel("Endereço público").fill(publicPath);
      await page.getByLabel("Meta title").fill(`Segurança ${config.expectedSha.slice(0, 8)} | GAIATEC`);
      await page
        .getByLabel("Meta description")
        .fill("Página sintética temporária e não indexável para homologação de segurança do CMS.");
      await fillGovernance(page, config);
      const created = await contentAction(page, "create", config.supabaseOrigin, () =>
        page.getByRole("button", { name: "Criar página", exact: true }).click(),
      );
      itemId = String(created.body.itemId ?? "");
      const lockVersion = Number(created.body.lockVersion);
      expect(uuidPattern.test(itemId)).toBe(true);
      expect(Number.isSafeInteger(lockVersion) && lockVersion > 0).toBe(true);
      expect(created.body.status).toBe("draft");
      await expect(page).toHaveURL(new RegExp(`/admin/paginas/${itemId}$`));

      const anonymousDraft = await sealedPreviewApiGet(
        page,
        `${config.supabaseOrigin}/rest/v1/cms_content_drafts?select=item_id&item_id=eq.${itemId}`,
        {
          failOnStatusCode: false,
          headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
        },
      );
      expect(anonymousDraft.status()).toBe(200);
      expect(await anonymousDraft.json()).toEqual([]);
      scenarios.push({
        id: "staging-anonymous-rls",
        status: "passed",
        anonymousStatus: 200,
        rowsDisclosed: 0,
      });

      const tampered = await sendTamperedSave(page, config, created.requestBody, itemId, lockVersion);
      expect(tampered.status).toBe(422);
      expect(tampered.body).toMatchObject({ code: "CMS_CONTENT_SCHEMA_INVALID" });
      expect(uuidPattern.test(String(tampered.body?.correlationId ?? ""))).toBe(true);
      await assertStoredDraftUnchanged(page, config, itemId, lockVersion, probeMarker);
      const missingItem = await sendMissingItemSave(page, config, created.requestBody, lockVersion);
      expect(missingItem.status).toBe(404);
      expect(missingItem.body).toMatchObject({ code: "CMS_CONTENT_NOT_FOUND" });
      await assertStoredDraftUnchanged(page, config, itemId, lockVersion, probeMarker);
      scenarios.push({
        id: "backend-tampering-rejection",
        status: "passed",
        responseStatus: 422,
        opaqueUnknownUuidStatus: 404,
        backendCode: "CMS_CONTENT_SCHEMA_INVALID",
        draftPreserved: true,
        identifiersPersisted: false,
      });

      await advanceToPublished(page, config);
      const publicPage = await context.newPage();
      try {
        await expect(async () => {
          const response = await publicPage.goto(publicPath, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          expect(response?.status()).toBe(200);
          expect(response?.headers()["x-release"]).toBe(config.expectedSha);
          await expect(publicPage.locator("main")).toContainText(probeMarker);
        }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
        const execution = await publicPage.evaluate(
          (marker) => ({
            flag: (window as Window & { __qaCmsXssExecuted?: boolean }).__qaCmsXssExecuted === true,
            executableScript: [...document.scripts].some((script) => script.textContent?.includes(marker)),
            eventHandler: Boolean(document.querySelector("[onerror], [onload], [onclick]")),
            visibleText: document.querySelector("main")?.textContent?.includes(marker) === true,
          }),
          probeMarker,
        );
        expect(execution).toEqual({
          flag: false,
          executableScript: false,
          eventHandler: false,
          visibleText: true,
        });
      } finally {
        await publicPage.close();
      }
      scenarios.push({
        id: "public-xss-inert-output",
        status: "passed",
        source: "real-page-builder-and-public-route",
        markerSha256: createHash("sha256").update(probeMarker).digest("hex"),
        executableNodes: 0,
        executionFlag: false,
      });

      await page.getByRole("tab", { name: "Publicação" }).click();
      const retired = await contentAction(page, "retire", config.supabaseOrigin, () =>
        page.getByRole("button", { name: "Retirar do ar", exact: true }).click(),
      );
      expect(retired.body.status).toBe("archived");
      finalState = "archived";
      await expect(async () => {
        const response = await sealedPreviewApiGet(page, publicPath, { failOnStatusCode: false });
        expect(response.status()).toBe(404);
      }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });

      const proofId = randomUUID();
      const wrongCandidate = `${config.expectedSha.slice(0, 39)}${config.expectedSha.endsWith("0") ? "1" : "0"}`;
      const productionProofUrl = new URL("/functions/v1/cms-public", PRODUCTION_SUPABASE);
      productionProofUrl.searchParams.set("type", "qa-rate-limit-proof");
      const productionHidden = await sealedPreviewApiGet(page, productionProofUrl.href, {
        failOnStatusCode: false,
        headers: {
          Origin: config.siteOrigin,
          "X-CMS-QA-Candidate-Sha": config.expectedSha,
          "X-CMS-QA-Run-Tag": config.runTag,
          "X-CMS-QA-Proof": proofId,
          "X-CMS-QA-Operation": "consume",
        },
      });
      expect(productionHidden.status()).toBe(404);
      expect(productionHidden.headers()["cache-control"]).toContain("no-store");
      const invalidCorsPreflight = await page.request.fetch(
        `${config.supabaseOrigin}/functions/v1/cms-public?type=qa-rate-limit-proof`,
        {
          method: "OPTIONS",
          failOnStatusCode: false,
          headers: {
            Origin: "https://attacker.invalid",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers":
              "authorization,x-cms-qa-candidate-sha,x-cms-qa-run-tag,x-cms-qa-proof,x-cms-qa-operation",
          },
        },
      );
      expect(invalidCorsPreflight.status()).toBe(403);
      expect(invalidCorsPreflight.headers()["access-control-allow-origin"]).toBeUndefined();
      const unboundProof = await qaRateLimitProof(page, config, "unbound", "consume");
      expect(unboundProof.response.status()).toBe(404);
      expect(unboundProof.payload).toEqual({ error: "Não encontrado." });
      const unbound = await qaRateLimitProof(page, config, proofId, "consume", wrongCandidate);
      expect(unbound.response.status()).toBe(404);
      expect(unbound.payload).toEqual({ error: "Não encontrado." });
      scenarios.push({
        id: "qa-rate-limit-proof-binding-negatives",
        status: "passed",
        unboundProofStatus: 404,
        unboundCandidateStatus: 404,
        productionHiddenStatus: 404,
        productionModeAccepted: false,
        productionPreAuthPolicy: "CMS_ENVIRONMENT=staging-and-configured-release-only",
        exactCorsOrigin: config.siteOrigin,
        invalidCorsPreflightStatus: 403,
        wildcardCorsAccepted: false,
      });

      let cleanupCompleted = false;
      let cleanupRemoved = false;
      let retryAfter = 0;
      try {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const allowed = await qaRateLimitProof(page, config, proofId, "consume");
          expect(allowed.response.status()).toBe(200);
          expect(allowed.payload).toMatchObject({
            schemaVersion: 1,
            status: "allowed",
            allowed: true,
            limit: 3,
            windowSeconds: 3,
            requestCount: attempt,
          });
        }
        const limited = await qaRateLimitProof(page, config, proofId, "consume");
        expect(limited.response.status()).toBe(429);
        retryAfter = Number(limited.response.headers()["retry-after"]);
        expect(Number.isInteger(retryAfter)).toBe(true);
        expect(retryAfter).toBeGreaterThan(0);
        expect(retryAfter).toBeLessThanOrEqual(3);
        expect(limited.response.headers()["cache-control"]).toContain("no-store");
        expect(limited.response.headers()["content-type"]).toContain("application/json");
        expect(limited.response.headers()["access-control-allow-origin"]).toBe(config.siteOrigin);
        expect(limited.response.headers().vary).toContain("Origin");
        expect(limited.payload).toEqual({
          error: "Muitas buscas. Aguarde antes de tentar novamente.",
          code: "CMS_QA_RATE_LIMIT_PROOF_LIMITED",
        });
        await page.waitForTimeout(retryAfter * 1_000 + 300);
        const recovered = await qaRateLimitProof(page, config, proofId, "consume");
        expect(recovered.response.status()).toBe(200);
        expect(recovered.payload).toMatchObject({
          status: "allowed",
          allowed: true,
          requestCount: 1,
        });
        scenarios.push({
          id: "public-search-rate-limit-and-recovery",
          status: "passed",
          bucketScope: "active-qa-lease-and-proof-hash",
          sharedPublicIpBucketConsumed: false,
          requestsUntil429: 4,
          limitedStatus: 429,
          retryAfterSeconds: retryAfter,
          cacheControl: "no-store",
          exactCorsOrigin: true,
          varyOrigin: true,
          recoveredStatus: 200,
          proofIdPersisted: false,
        });
      } finally {
        const cleanup = await qaRateLimitProof(page, config, proofId, "cleanup");
        expect(cleanup.response.status()).toBe(200);
        expect(cleanup.payload).toMatchObject({
          status: "cleaned",
          idempotent: true,
        });
        expect(typeof cleanup.payload?.removed).toBe("boolean");
        cleanupRemoved = cleanup.payload?.removed === true;
        const replayedCleanup = await qaRateLimitProof(page, config, proofId, "cleanup");
        expect(replayedCleanup.response.status()).toBe(200);
        expect(replayedCleanup.payload).toMatchObject({
          status: "cleaned",
          removed: false,
          idempotent: true,
        });
        cleanupCompleted = true;
      }
      expect(cleanupCompleted).toBe(true);
      expect(cleanupRemoved).toBe(true);
      scenarios.push({
        id: "qa-rate-limit-proof-cleanup",
        status: "passed",
        explicitCleanup: true,
        idempotentReplay: true,
        terminalLeaseFallback: true,
        proofIdPersisted: false,
      });

      await page.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
      await expect(page.locator("code").filter({ hasText: itemId }).first()).toBeVisible({ timeout: 20_000 });
      observer.assertClean();
      status = "passed";
    } catch (error) {
      failure = sanitizeBrowserDiagnostic(error, [
        config.email,
        config.password,
        config.totpSecret,
        config.reviewer.email,
        config.reviewer.password,
        config.reviewer.totpSecret,
        config.existingIdentity.email,
        config.existingIdentity.password,
        config.existingIdentity.totpSecret,
        config.anonKey,
      ]);
      throw error;
    } finally {
      writeEvidence({
        schemaVersion: 1,
        status,
        environment: "staging",
        candidateSha: config.expectedSha,
        runTag: config.runTag,
        browser: "desktop-chromium-real-network",
        scenarios,
        syntheticPage: { created: Boolean(itemId), finalState },
        browserObservability: observer.snapshot(),
        semanticActions: [],
        noIdentifiersPersisted: true,
        credentialsPersisted: false,
        rawBrowserArtifacts: "disabled",
        failure,
      });
    }
  });
});

test.describe.serial("CMS production browser security boundaries", () => {
  test("@security-production negativas CORS, RLS, UUID e XSS deixam zero resíduo ativo", async ({
    page,
    context,
    baseURL,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop-chromium", "prova controlada executada uma vez");
    const config = configuration(baseURL, "production");
    test.skip(!config, "prova de segurança real de produção não habilitada");
    if (!config) throw new Error("QA_CMS_PRODUCTION_SECURITY_GATE_INCONSISTENT");
    test.setTimeout(6 * 60_000);

    const observer = createCmsBrowserObserver({
      suite: "cms-security-boundaries-production",
      expectedSha: config.expectedSha,
      sensitiveValues: [
        config.email,
        config.password,
        config.totpSecret,
        config.reviewer.email,
        config.reviewer.password,
        config.reviewer.totpSecret,
        config.existingIdentity.email,
        config.existingIdentity.password,
        config.existingIdentity.totpSecret,
        config.anonKey,
      ],
      expectedHttpFailures: [
        {
          id: "production-authenticated-rdo-only-identity-denied-cms-session",
          method: "POST",
          path: "/functions/v1/cms-session",
          statuses: [403],
          minOccurrences: 1,
          maxOccurrences: 4,
        },
        {
          id: "production-cms-editor-denied-user-administration",
          method: "POST",
          path: "/functions/v1/cms-users",
          statuses: [403],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "production-tampered-payload-rejected",
          method: "POST",
          path: "/functions/v1/cms-content",
          statuses: [422],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
        {
          id: "production-missing-uuid-opaque",
          method: "POST",
          path: "/functions/v1/cms-content",
          statuses: [404],
          minOccurrences: 1,
          maxOccurrences: 1,
        },
      ],
    });
    observer.observeContext(context);
    const probeMarker = `QA-XSS-PROD-${config.expectedSha.slice(0, 8)}`;
    const hostileText = `<img src=x onerror="window.__qaCmsXssExecuted=true"><script>window.__qaCmsXssExecuted=true</script> ${probeMarker}`;
    const publicPath = `/qa-cms-security-prod-${config.expectedSha.slice(0, 8)}`;
    let itemId = "";
    let finalState = "not-created";
    let activeResidue = -1;
    let status: "passed" | "failed" = "failed";
    let failure: string | null = null;
    const scenarios: Array<Record<string, unknown>> = [];

    await context.addInitScript(() => {
      (window as Window & { __qaCmsXssExecuted?: boolean }).__qaCmsXssExecuted = false;
    });

    try {
      const health = await sealedPreviewApiGet(page, "/healthz", { failOnStatusCode: false });
      expect(health.status()).toBe(200);
      expect(health.headers()["x-release"]).toBe(config.expectedSha);
      expect((await health.json()) as Record<string, unknown>).toMatchObject({
        environment: sealedPreviewDeploymentEnvironment(config.environment),
        release: config.expectedSha,
      });
      await signIn(page, config);
      await proveAuthenticatedIdentityWithoutCmsProfile(page, config, observer);
      scenarios.push({
        id: "production-authenticated-no-cms-profile-and-rdo-scope-separation",
        status: "passed",
        actorFixtureScope: "rdo-member-without-cms-profile-or-role",
        cmsSessionStatus: 403,
        protectedRouteStatus: "access-denied",
        cmsNavigationDisclosed: false,
      });
      await proveCmsActorWithoutUsersPermission(page, config, observer);
      scenarios.push({
        id: "production-authenticated-cms-actor-without-users-permission",
        status: "passed",
        actorFixtureRole: "editor",
        aal: "aal2",
        edgeFunction: "cms-users",
        responseStatus: 403,
        rowsDisclosed: 0,
      });

      const deniedCors = await page.request.post(`${config.supabaseOrigin}/functions/v1/cms-content`, {
        failOnStatusCode: false,
        headers: { Origin: "https://attacker.invalid", apikey: config.anonKey },
        data: { action: "save" },
      });
      expect(deniedCors.status()).toBe(403);
      expect(deniedCors.headers()["access-control-allow-origin"]).not.toBe("https://attacker.invalid");
      const hiddenProof = await sealedPreviewApiGet(
        page,
        `${config.supabaseOrigin}/functions/v1/cms-public?type=qa-rate-limit-proof`,
        { failOnStatusCode: false, headers: { Origin: config.siteOrigin } },
      );
      expect(hiddenProof.status()).toBe(404);
      expect(hiddenProof.headers()["cache-control"]).toContain("no-store");
      expect(hiddenProof.headers()["access-control-allow-origin"]).toBeUndefined();
      scenarios.push({
        id: "production-cors-and-qa-mode-hidden",
        status: "passed",
        invalidOriginStatus: 403,
        qaRateProofStatus: 404,
        qaRateProofInvoked: false,
        wildcardCorsAccepted: false,
      });

      await page.goto("/admin/paginas/novo?type=page&template=institutional", {
        waitUntil: "domcontentloaded",
      });
      await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
      await page.getByLabel("Título administrativo e público").fill(`${config.runTag} segurança produção`);
      await page
        .getByLabel("Resumo")
        .fill("Página sintética controlada para a prova final de segurança em produção.");
      await page.getByRole("tab", { name: "Blocos" }).click();
      const richText = page.locator(".admin-block-selection").nth(1);
      if (!(await richText.locator("details").getAttribute("open"))) {
        await richText.locator("summary").click();
      }
      await richText.getByLabel("Texto", { exact: true }).fill(hostileText);
      await page.getByRole("tab", { name: "SEO e URL" }).click();
      await page.getByLabel("Endereço público").fill(publicPath);
      await page
        .getByLabel("Meta title")
        .fill(`Segurança produção ${config.expectedSha.slice(0, 8)} | GAIATEC`);
      await page
        .getByLabel("Meta description")
        .fill("Página sintética temporária e não indexável para homologação de segurança.");
      await fillGovernance(page, config);
      const created = await contentAction(page, "create", config.supabaseOrigin, () =>
        page.getByRole("button", { name: "Criar página", exact: true }).click(),
      );
      itemId = String(created.body.itemId ?? "");
      const lockVersion = Number(created.body.lockVersion);
      expect(uuidPattern.test(itemId)).toBe(true);
      expect(Number.isSafeInteger(lockVersion) && lockVersion > 0).toBe(true);
      expect(created.body.status).toBe("draft");

      const anonymousDraft = await sealedPreviewApiGet(
        page,
        `${config.supabaseOrigin}/rest/v1/cms_content_drafts?select=item_id&item_id=eq.${itemId}`,
        {
          failOnStatusCode: false,
          headers: { apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
        },
      );
      expect(anonymousDraft.status()).toBe(200);
      expect(await anonymousDraft.json()).toEqual([]);
      scenarios.push({
        id: "production-anonymous-rls",
        status: "passed",
        anonymousStatus: 200,
        rowsDisclosed: 0,
      });

      const tampered = await sendTamperedSave(page, config, created.requestBody, itemId, lockVersion);
      expect(tampered.status).toBe(422);
      expect(tampered.body).toMatchObject({ code: "CMS_CONTENT_SCHEMA_INVALID" });
      const missingItem = await sendMissingItemSave(page, config, created.requestBody, lockVersion);
      expect(missingItem.status).toBe(404);
      expect(missingItem.body).toMatchObject({ code: "CMS_CONTENT_NOT_FOUND" });
      await assertStoredDraftUnchanged(page, config, itemId, lockVersion, probeMarker);
      scenarios.push({
        id: "production-payload-and-uuid-tampering",
        status: "passed",
        schemaTamperStatus: 422,
        opaqueUuidStatus: 404,
        draftPreserved: true,
        identifiersPersisted: false,
      });

      await advanceToPublished(page, config);
      const publicPage = await context.newPage();
      try {
        await expect(async () => {
          const response = await publicPage.goto(publicPath, {
            waitUntil: "domcontentloaded",
            timeout: 30_000,
          });
          expect(response?.status()).toBe(200);
          expect(response?.headers()["x-release"]).toBe(config.expectedSha);
          await expect(publicPage.locator("main")).toContainText(probeMarker);
        }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
        const execution = await publicPage.evaluate(
          (marker) => ({
            flag: (window as Window & { __qaCmsXssExecuted?: boolean }).__qaCmsXssExecuted === true,
            executableScript: [...document.scripts].some((script) => script.textContent?.includes(marker)),
            eventHandler: Boolean(document.querySelector("[onerror], [onload], [onclick]")),
            visibleText: document.querySelector("main")?.textContent?.includes(marker) === true,
          }),
          probeMarker,
        );
        expect(execution).toEqual({
          flag: false,
          executableScript: false,
          eventHandler: false,
          visibleText: true,
        });
      } finally {
        await publicPage.close();
      }
      scenarios.push({
        id: "production-public-xss-inert-output",
        status: "passed",
        markerSha256: createHash("sha256").update(probeMarker).digest("hex"),
        executableNodes: 0,
        executionFlag: false,
      });

      await page.getByRole("tab", { name: "Publicação" }).click();
      const retired = await contentAction(page, "retire", config.supabaseOrigin, () =>
        page.getByRole("button", { name: "Retirar do ar", exact: true }).click(),
      );
      expect(retired.body.status).toBe("archived");
      finalState = "archived";
      await expect(async () => {
        const response = await sealedPreviewApiGet(page, publicPath, { failOnStatusCode: false });
        expect(response.status()).toBe(404);
      }).toPass({ timeout: 60_000, intervals: [1_000, 2_000, 5_000] });
      const publishedRows = await authenticatedRestRows(
        page,
        config,
        `/rest/v1/cms_published_projection?select=item_id&item_id=eq.${itemId}`,
      );
      const itemRows = await authenticatedRestRows(
        page,
        config,
        `/rest/v1/cms_content_items?select=id,workflow_status&id=eq.${itemId}`,
      );
      const draftRows = await authenticatedRestRows(
        page,
        config,
        `/rest/v1/cms_content_drafts?select=item_id,lock_version&item_id=eq.${itemId}`,
      );
      expect(publishedRows.status).toBe(200);
      expect(itemRows.status).toBe(200);
      expect(draftRows.status).toBe(200);
      expect(publishedRows.body).toEqual([]);
      expect(itemRows.body).toEqual([{ id: itemId, workflow_status: "archived" }]);
      expect(draftRows.body).toEqual([
        expect.objectContaining({ item_id: itemId, lock_version: expect.any(Number) }),
      ]);
      activeResidue = 0;
      await page.goto("/admin/auditoria", { waitUntil: "domcontentloaded" });
      await expect(page.locator("code").filter({ hasText: itemId }).first()).toBeVisible({ timeout: 20_000 });
      scenarios.push({
        id: "production-security-cleanup-and-audit",
        status: "passed",
        finalState: "archived",
        activePublicResidue: 0,
        activeEditorialResidue: 0,
        archivedSyntheticRowsAwaitingLeaseTeardown: 1,
        immutableAuditRetained: true,
      });

      observer.assertClean();
      status = "passed";
    } catch (error) {
      failure = sanitizeBrowserDiagnostic(error, [
        config.email,
        config.password,
        config.totpSecret,
        config.reviewer.email,
        config.reviewer.password,
        config.reviewer.totpSecret,
        config.existingIdentity.email,
        config.existingIdentity.password,
        config.existingIdentity.totpSecret,
        config.anonKey,
      ]);
      throw error;
    } finally {
      writeEvidence({
        schemaVersion: 1,
        status,
        environment: "production",
        candidateSha: config.expectedSha,
        runTag: config.runTag,
        browser: "desktop-chromium-real-network",
        securityProfile: "production-without-qa-rate-limit-proof",
        scenarios,
        syntheticPage: { created: Boolean(itemId), finalState, activeResidue },
        browserObservability: observer.snapshot(),
        semanticActions: [],
        rateLimitProofInvoked: false,
        noIdentifiersPersisted: true,
        credentialsPersisted: false,
        rawBrowserArtifacts: "disabled",
        failure,
      });
    }
  });
});
