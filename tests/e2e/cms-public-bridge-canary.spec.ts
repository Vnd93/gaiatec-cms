import { expect, test, type Page, type Request } from "@playwright/test";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertSealedPreviewRoutingUsed, installSealedPreviewRouting } from "./cms-sealed-preview-routing";

test.use({ trace: "off", screenshot: "off", video: "off" });

const FULL_SHA = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

type BridgeState = {
  schemaVersion: 1;
  status: "active";
  environment: "staging" | "production";
  candidateSha: string;
  runTag: string;
  instance: "preview" | "canonical" | "forward";
  nonce: string;
  actorId: string;
  form: { id: string; versionId: string; fieldId: string; key: string };
  page: { id: string; revisionId: string; slug: string; path: string; title: string };
  campaign: { id: string; revisionId: string; slug: string; path: string; title: string };
  formTitle: string;
  emailLabel: string;
};

type Configuration = {
  environment: "staging" | "production";
  expectedSha: string;
  origin: string;
  deploymentOrigin: string;
  deploymentId: string;
  supabaseOrigin: string;
  anonKey: string;
  reportPath: string;
  state: BridgeState;
};

function exactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expected].sort());
}

function containedFile(configured: string, label: string) {
  const file = resolve(root, configured);
  const fromRoot = relative(root, file);
  if (
    !fromRoot ||
    fromRoot === ".." ||
    fromRoot.startsWith("../") ||
    fromRoot.startsWith("..\\") ||
    isAbsolute(fromRoot)
  ) {
    throw new Error(`QA_CMS_PUBLIC_BRIDGE_${label}_PATH_REFUSED`);
  }
  const metadata = lstatSync(file);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > 64 * 1024) {
    throw new Error(`QA_CMS_PUBLIC_BRIDGE_${label}_FILE_REFUSED`);
  }
  const realFromRoot = relative(realpathSync(root), realpathSync(file));
  if (realFromRoot === ".." || realFromRoot.startsWith("../") || realFromRoot.startsWith("..\\")) {
    throw new Error(`QA_CMS_PUBLIC_BRIDGE_${label}_PATH_REFUSED`);
  }
  return file;
}

function loadConfiguration(baseURL: string | undefined): Configuration | null {
  if (process.env.QA_CMS_PUBLIC_BRIDGE_REQUIRED !== "true") return null;
  const environment = process.env.QA_CMS_BRIDGE_ENVIRONMENT;
  const expectedSha = process.env.QA_CMS_BRIDGE_CANDIDATE_SHA ?? "";
  const origin = new URL(baseURL ?? "https://invalid.invalid");
  const deploymentOrigin = new URL(process.env.QA_CMS_BRIDGE_DEPLOYMENT_ORIGIN ?? "https://invalid.invalid");
  const supabaseOrigin = new URL(process.env.QA_CMS_BRIDGE_SUPABASE_URL ?? "https://invalid.invalid");
  const anonKey = process.env.QA_CMS_BRIDGE_SUPABASE_ANON_KEY ?? "";
  const deploymentId = process.env.QA_CMS_BRIDGE_DEPLOYMENT_ID ?? "";
  const stateFile = containedFile(
    process.env.QA_CMS_BRIDGE_STATE_PATH ?? "outputs/cms-public-bridge-fixture-state.json",
    "STATE",
  );
  const reportPath = resolve(
    root,
    process.env.QA_CMS_BRIDGE_REPORT_PATH ?? "outputs/cms-public-bridge-functional-canary.json",
  );
  const reportFromRoot = relative(root, reportPath);
  if (
    !reportFromRoot ||
    reportFromRoot === ".." ||
    reportFromRoot.startsWith("../") ||
    reportFromRoot.startsWith("..\\") ||
    isAbsolute(reportFromRoot)
  ) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_REPORT_PATH_REFUSED");
  }
  const state = JSON.parse(readFileSync(stateFile, "utf8")) as BridgeState;
  const expectedOrigin =
    process.env.QA_CMS_BRIDGE_ORIGIN ??
    (environment === "production"
      ? "https://gaiatecsistemas.com.br"
      : "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev");
  const expectedSupabase =
    environment === "production"
      ? "https://chfuhctnhqgyjowkvllv.supabase.co"
      : "https://glcqsosxwgmlhzgcsnzv.supabase.co";
  const identifiers = [
    state.actorId,
    state.form?.id,
    state.form?.versionId,
    state.form?.fieldId,
    state.page?.id,
    state.page?.revisionId,
    state.campaign?.id,
    state.campaign?.revisionId,
  ];
  if (
    !["staging", "production"].includes(environment ?? "") ||
    !FULL_SHA.test(expectedSha) ||
    origin.origin !== expectedOrigin ||
    (environment === "staging" &&
      !/^https:\/\/(?:ev2-g17-canary|ev2-g12-canary)\.gaiatec-cms-staging\.pages\.dev$/.test(
        origin.origin,
      )) ||
    origin.pathname !== "/" ||
    deploymentOrigin.pathname !== "/" ||
    (environment === "production"
      ? !/^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/.test(deploymentOrigin.origin) &&
        deploymentOrigin.origin !== expectedOrigin
      : !/^https:\/\/[a-z0-9-]+\.gaiatec-cms-staging\.pages\.dev$/.test(deploymentOrigin.origin)) ||
    supabaseOrigin.origin !== expectedSupabase ||
    supabaseOrigin.pathname !== "/" ||
    !anonKey ||
    !UUID.test(deploymentId) ||
    !exactKeys(state as unknown as Record<string, unknown>, [
      "schemaVersion",
      "status",
      "environment",
      "candidateSha",
      "runTag",
      "instance",
      "nonce",
      "actorId",
      "form",
      "page",
      "campaign",
      "formTitle",
      "emailLabel",
    ]) ||
    state.schemaVersion !== 1 ||
    state.status !== "active" ||
    state.environment !== environment ||
    state.candidateSha !== expectedSha ||
    !/^QA-CMS-FINAL-[0-9]{8}-[a-f0-9]{8}$/.test(state.runTag) ||
    identifiers.some((value) => !UUID.test(value)) ||
    state.page.path !== `/${state.page.slug}` ||
    state.campaign.path !== `/campanhas/${state.campaign.slug}`
  ) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_CONFIGURATION_REFUSED");
  }
  return {
    environment: environment as "staging" | "production",
    expectedSha,
    origin: origin.origin,
    deploymentOrigin: deploymentOrigin.origin,
    deploymentId,
    supabaseOrigin: supabaseOrigin.origin,
    anonKey,
    reportPath,
    state,
  };
}

function writeEvidence(config: Configuration, value: Record<string, unknown>) {
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  const sensitive = [
    config.anonKey,
    config.state.actorId,
    config.state.form.id,
    config.state.form.versionId,
    config.state.form.fieldId,
    config.state.page.id,
    config.state.page.revisionId,
    config.state.campaign.id,
    config.state.campaign.revisionId,
  ];
  if (sensitive.some((entry) => serialized.includes(entry)) || UUID_ANYWHERE.test(serialized)) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_EVIDENCE_SENSITIVE");
  }
  mkdirSync(dirname(config.reportPath), { recursive: true });
  writeFileSync(config.reportPath, serialized, { encoding: "utf8", mode: 0o600 });
}

function legacyRequestBody(request: Request, config: Configuration) {
  const value = request.postDataJSON() as Record<string, unknown>;
  const origin = value.origin as Record<string, unknown>;
  const consent = value.consent as Record<string, unknown>;
  if (
    !exactKeys(value, [
      "formId",
      "formVersionId",
      "idempotencyKey",
      "fields",
      "origin",
      "consent",
      "honeypot",
      "captchaToken",
    ]) ||
    value.formId !== config.state.form.id ||
    value.formVersionId !== config.state.form.versionId ||
    !UUID.test(String(value.idempotencyKey ?? "")) ||
    !exactKeys(origin, ["path", "source", "campaignId", "utm"]) ||
    origin.path !== config.state.campaign.path ||
    origin.source !== "campaign" ||
    origin.campaignId !== config.state.campaign.id ||
    !exactKeys(consent, ["accepted", "text", "version"]) ||
    consent.accepted !== true ||
    consent.version !== config.state.runTag ||
    value.honeypot !== "" ||
    typeof value.captchaToken !== "string" ||
    value.captchaToken.length < 10 ||
    !exactKeys(value.fields as Record<string, unknown>, ["email"])
  ) {
    throw new Error("QA_CMS_PUBLIC_BRIDGE_LEGACY_REQUEST_INVALID");
  }
  return value;
}

async function browserStateContainsUuid(page: Page) {
  return page.evaluate(() => {
    const values = [document.documentElement.outerHTML];
    for (const storage of [localStorage, sessionStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key) values.push(key, storage.getItem(key) ?? "");
      }
    }
    return /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i.test(
      values.join("\n"),
    );
  });
}

test("@public-bridge frontend A percorre page/campaign/form e lead idempotente no backend f48", async ({
  browser,
  baseURL,
}) => {
  const config = loadConfiguration(baseURL);
  test.skip(!config, "canário público da ponte não foi exigido");
  if (!config) throw new Error("QA_CMS_PUBLIC_BRIDGE_GATE_INCONSISTENT");
  test.setTimeout(3 * 60_000);

  const context = await browser.newContext({ baseURL: config.origin, serviceWorkers: "block" });
  await installSealedPreviewRouting(context, process.env);
  const page = await context.newPage();
  const consoleFailures: string[] = [];
  const requestFailures: string[] = [];
  let leadRequestCount = 0;
  page.on("console", (message) => {
    if (message.type() === "error") consoleFailures.push(message.text().slice(0, 160));
  });
  page.on("pageerror", (error) => consoleFailures.push(error.name));
  page.on("requestfailed", (request) => requestFailures.push(new URL(request.url()).pathname));
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/functions/v1/lead-capture")
    ) {
      leadRequestCount += 1;
    }
  });

  try {
    const pageResponse = await page.goto(config.state.page.path, { waitUntil: "domcontentloaded" });
    expect(pageResponse?.status()).toBe(200);
    expect(pageResponse?.headers()["x-release"]).toBe(config.expectedSha);
    await expect(page.getByRole("heading", { name: config.state.page.title })).toBeVisible({
      timeout: 20_000,
    });
    expect(await browserStateContainsUuid(page)).toBe(false);

    const campaignResponse = await page.goto(config.state.campaign.path, { waitUntil: "domcontentloaded" });
    expect(campaignResponse?.status()).toBe(200);
    expect(campaignResponse?.headers()["x-release"]).toBe(config.expectedSha);
    await expect(page.getByRole("heading", { name: config.state.campaign.title })).toBeVisible({
      timeout: 20_000,
    });
    const email = page.getByLabel(config.state.emailLabel, { exact: false });
    await expect(email).toBeVisible({ timeout: 20_000 });
    await email.fill(`qa-public-${config.state.nonce}@example.invalid`);
    await page.locator('input[name="consent"]').check();
    await expect(page.getByLabel("Verificação de segurança")).toBeVisible();
    const submit = page.getByRole("button", { name: "Enviar homologação sintética" });
    await expect(submit).toBeEnabled({ timeout: 60_000 });

    const firstResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/functions/v1/lead-capture"),
      { timeout: 45_000 },
    );
    await submit.click();
    const firstResponse = await firstResponsePromise;
    const requestBody = legacyRequestBody(firstResponse.request(), config);
    const firstPayload = (await firstResponse.json()) as Record<string, unknown>;
    expect(firstResponse.status()).toBe(201);
    expect(firstPayload.reference).toMatch(/^LD-[A-Z0-9]+$/);
    expect(firstPayload.duplicate).toBe(false);
    expect(firstPayload).not.toHaveProperty("leadId");
    await expect(page.locator('[data-form-submission-status="success"]')).toContainText(
      String(firstPayload.reference),
    );

    const replay = await context.request.post(firstResponse.url(), {
      headers: {
        apikey: config.anonKey,
        Origin: config.origin,
        "Content-Type": "application/json",
      },
      data: requestBody,
      timeout: 30_000,
    });
    const replayPayload = (await replay.json()) as Record<string, unknown>;
    expect(replay.status()).toBe(201);
    expect(replayPayload.reference).toBe(firstPayload.reference);
    expect(replayPayload.duplicate).toBe(true);
    expect(replayPayload).not.toHaveProperty("leadId");
    expect(leadRequestCount).toBe(1);
    expect(await browserStateContainsUuid(page)).toBe(false);
    expect(consoleFailures).toEqual([]);
    expect(requestFailures).toEqual([]);
    assertSealedPreviewRoutingUsed(context);

    writeEvidence(config, {
      schemaVersion: 1,
      event: "g12.public_bridge.functional_canary",
      status: "passed",
      environment: config.environment,
      frontendSha: config.expectedSha,
      backendContract: "legacy-f48",
      origin: config.origin,
      deploymentOrigin: config.deploymentOrigin,
      deploymentIdentitySha256: createHash("sha256").update(config.deploymentId).digest("hex"),
      fixtureBindingSha256: createHash("sha256")
        .update(`${config.state.runTag}:${config.state.nonce}`)
        .digest("hex"),
      contracts: {
        page: "legacy-row-normalized-and-rendered",
        campaign: "legacy-row-normalized-and-rendered",
        form: "legacy-f48-normalized-and-rendered",
        lead: "legacy-f48-exact-201",
        duplicate: "same-idempotency-key-201-duplicate",
      },
      observations: {
        renderedPages: 1,
        renderedCampaigns: 1,
        renderedForms: 1,
        browserLeadRequests: 1,
        acceptedLeads: 1,
        duplicateReplays: 1,
        unexpectedConsole: 0,
        requestFailures: 0,
      },
      boundary: {
        uuidInDomOrStorage: 0,
        legacyIdsPersisted: false,
        hybridPayloads: 0,
        retryPayloads: 0,
        secretsPersisted: false,
      },
      turnstile: `official-${config.environment}-widget-token`,
    });
  } finally {
    await context.close();
  }
});
