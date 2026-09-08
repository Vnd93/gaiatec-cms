import { expect, test, type BrowserContext, type Route } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadCmsUiCreatedState, type CmsUiCreatedState } from "./cms-ui-created-state";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FULL_SHA = /^[a-f0-9]{40}$/;
const UUID_ANYWHERE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

type RecordValue = Record<string, unknown>;

function exactKeys(value: unknown, expected: readonly string[]): value is RecordValue {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    JSON.stringify(Object.keys(value as RecordValue).sort()) === JSON.stringify([...expected].sort())
  );
}

function configuration(baseURL: string | undefined) {
  test.skip(process.env.QA_CMS_PUBLIC_FORWARD_REQUIRED !== "true", "gate forward não exigido");
  const candidateSha = process.env.QA_CMS_EXPECTED_SHA ?? "";
  const origin = new URL(baseURL ?? "https://invalid.invalid");
  const supabase = new URL(process.env.QA_CMS_BRIDGE_SUPABASE_URL ?? "https://invalid.invalid");
  const anonKey = process.env.QA_CMS_BRIDGE_SUPABASE_ANON_KEY ?? "";
  const statePath = process.env.QA_CMS_UI_CREATED_STATE_PATH ?? "outputs/cms-ui-created-state.json";
  const stateFile = resolve(root, statePath);
  const stateFromRoot = relative(root, stateFile);
  const reportFile = resolve(
    root,
    process.env.QA_CMS_BRIDGE_REPORT_PATH ?? "outputs/cms-public-forward-compatibility.json",
  );
  const reportFromRoot = relative(root, reportFile);
  const runTag = (() => {
    try {
      return String(JSON.parse(readFileSync(stateFile, "utf8"))?.runTag ?? "");
    } catch {
      throw new Error("QA_CMS_FORWARD_STATE_UNREADABLE");
    }
  })();
  if (
    !FULL_SHA.test(candidateSha) ||
    origin.origin !== "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev" ||
    origin.pathname !== "/" ||
    supabase.origin !== "https://glcqsosxwgmlhzgcsnzv.supabase.co" ||
    supabase.pathname !== "/" ||
    !anonKey ||
    !stateFromRoot ||
    stateFromRoot === ".." ||
    stateFromRoot.startsWith("../") ||
    !reportFromRoot ||
    reportFromRoot === ".." ||
    reportFromRoot.startsWith("../")
  )
    throw new Error("QA_CMS_FORWARD_CONFIGURATION_REFUSED");
  return {
    candidateSha,
    origin: origin.origin,
    supabaseOrigin: supabase.origin,
    anonKey,
    reportFile,
    state: loadCmsUiCreatedState({
      repositoryRoot: root,
      expectedEnvironment: "staging",
      expectedSha: candidateSha,
      expectedRunTag: runTag,
      path: statePath,
    }),
  };
}

function assertModernRequest(value: unknown, state: CmsUiCreatedState) {
  if (
    !exactKeys(value, [
      "formKey",
      "formVersion",
      "submissionToken",
      "fields",
      "origin",
      "consent",
      "honeypot",
      "captchaToken",
    ]) ||
    value.formKey !== state.form.key ||
    value.formVersion !== 1 ||
    !/^[a-f0-9]{32}$/.test(String(value.submissionToken ?? "")) ||
    !exactKeys(value.origin, ["path", "source", "campaignPath", "utm"]) ||
    value.origin.path !== state.lead.campaignPath ||
    value.origin.source !== "campaign" ||
    value.origin.campaignPath !== state.lead.campaignPath ||
    !exactKeys(value.origin.utm, []) ||
    !exactKeys(value.consent, ["accepted", "text", "version"]) ||
    value.consent.accepted !== true ||
    typeof value.consent.text !== "string" ||
    typeof value.consent.version !== "string" ||
    value.honeypot !== "" ||
    typeof value.captchaToken !== "string" ||
    value.captchaToken.length < 10 ||
    !exactKeys(value.fields, ["email"])
  )
    throw new Error("QA_CMS_FORWARD_MODERN_ENVELOPE_REFUSED");
  return value;
}

function legacyCampaignBody(modern: RecordValue, state: CmsUiCreatedState) {
  return {
    formId: state.form.id,
    formVersionId: state.form.versionId,
    idempotencyKey: randomUUID(),
    fields: modern.fields,
    origin: {
      path: state.lead.campaignPath,
      source: "campaign",
      campaignId: state.ids.campaignId,
      utm: {},
    },
    consent: modern.consent,
    honeypot: "",
    captchaToken: modern.captchaToken,
  };
}

async function submitCampaign(
  context: BrowserContext,
  state: CmsUiCreatedState,
  rewrite?: (modern: RecordValue) => RecordValue,
) {
  const page = await context.newPage();
  let requestCount = 0;
  let original: RecordValue | null = null;
  let rewritten: RecordValue | null = null;
  if (rewrite) {
    await page.route("**/functions/v1/lead-capture", async (route: Route) => {
      requestCount += 1;
      original = assertModernRequest(route.request().postDataJSON(), state);
      rewritten = rewrite(original);
      const headers: Record<string, string> = {
        ...route.request().headers(),
        "content-type": "application/json",
      };
      delete headers["content-length"];
      await route.continue({ headers, postData: JSON.stringify(rewritten) });
    });
  } else {
    page.on("request", (request) => {
      if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/lead-capture")) {
        requestCount += 1;
        original = assertModernRequest(request.postDataJSON(), state);
      }
    });
  }
  try {
    const navigation = await page.goto(state.lead.campaignPath, { waitUntil: "domcontentloaded" });
    expect(navigation?.status()).toBe(200);
    const form = page.locator(`form[data-form-key="${state.form.key}"]`);
    await expect(form).toBeVisible({ timeout: 20_000 });
    await form.locator('input[type="email"]').fill(`qa-forward-${randomUUID()}@example.invalid`);
    await form.locator('input[name="consent"]').check();
    await expect(page.getByLabel("Verificação de segurança")).toBeVisible();
    const submit = form.getByRole("button", { name: "Enviar teste sintético" });
    await expect(submit).toBeEnabled({ timeout: 60_000 });
    const responsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        new URL(response.url()).pathname.endsWith("/functions/v1/lead-capture"),
      { timeout: 45_000 },
    );
    await submit.click();
    const response = await responsePromise;
    expect(requestCount).toBe(1);
    return { response, original: original!, rewritten };
  } finally {
    await page.close();
  }
}

test("@public-forward prova A e aba f48 contra backend candidato sem fallback frouxo", async ({
  browser,
  baseURL,
}) => {
  const config = configuration(baseURL);
  test.setTimeout(6 * 60_000);
  const context = await browser.newContext({ baseURL: config.origin, serviceWorkers: "block" });
  try {
    const modern = await submitCampaign(context, config.state);
    const modernPayload = (await modern.response.json()) as RecordValue;
    expect(modern.response.status()).toBe(201);
    expect(exactKeys(modernPayload, ["reference", "duplicate"])).toBe(true);
    expect(modernPayload.duplicate).toBe(false);

    let legacyBody: RecordValue | null = null;
    const legacy = await submitCampaign(context, config.state, (request) => {
      legacyBody = legacyCampaignBody(request, config.state);
      return legacyBody;
    });
    const legacyPayload = (await legacy.response.json()) as RecordValue;
    expect(legacy.response.status()).toBe(201);
    expect(exactKeys(legacyPayload, ["reference", "duplicate"])).toBe(true);
    expect(legacyPayload.duplicate).toBe(false);
    expect(legacyBody).not.toBeNull();

    const duplicate = await context.request.post(`${config.supabaseOrigin}/functions/v1/lead-capture`, {
      headers: { apikey: config.anonKey, Origin: config.origin, "Content-Type": "application/json" },
      data: legacyBody!,
    });
    const duplicatePayload = (await duplicate.json()) as RecordValue;
    expect(duplicate.status()).toBe(201);
    expect(exactKeys(duplicatePayload, ["reference", "duplicate"])).toBe(true);
    expect(duplicatePayload.reference).toBe(legacyPayload.reference);
    expect(duplicatePayload.duplicate).toBe(true);

    const productIdor = await submitCampaign(context, config.state, (request) => ({
      ...legacyCampaignBody(request, config.state),
      idempotencyKey: randomUUID(),
      origin: {
        path: `/produtos/${config.state.runTag.toLowerCase()}-produto`,
        source: "product",
        productId: config.state.ids.productId,
        utm: {},
      },
    }));
    expect(productIdor.response.status()).toBe(422);
    expect(await productIdor.response.json()).toEqual({ error: "Origem do formulário inválida." });

    const hybrid = await context.request.post(`${config.supabaseOrigin}/functions/v1/lead-capture`, {
      headers: { apikey: config.anonKey, Origin: config.origin, "Content-Type": "application/json" },
      data: { ...legacyBody!, formKey: config.state.form.key, formVersion: 1 },
    });
    expect(hybrid.status()).toBe(400);
    expect(await hybrid.json()).toEqual({ error: "Revise os campos do formulário." });

    const report = {
      schemaVersion: 1,
      event: "g12.public_bridge.forward_compatibility",
      status: "passed",
      environment: "staging",
      frontendSha: config.candidateSha,
      backendContract: "forward-expand-contract",
      origin: config.origin,
      fixtureBindingSha256: createHash("sha256")
        .update(`${config.state.runTag}:${config.state.form.key}:${config.candidateSha}`)
        .digest("hex"),
      contracts: {
        frontendAToCandidate: "public-v2-exact-201",
        loadedF48TabToCandidate: "legacy-f48-exact-201",
        duplicateReplay: "legacy-f48-same-idempotency-201-duplicate",
        productIdor: "legacy-product-id-unbound-422",
        hybridEnvelope: "mixed-generation-400",
      },
      observations: {
        modernAccepted: 1,
        legacyAccepted: 1,
        duplicateAccepted: 1,
        productIdorRejected: 1,
        hybridRejected: 1,
        automaticRetries: 0,
      },
      boundary: { responseIds: 0, secretsPersisted: false },
    };
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    if (UUID_ANYWHERE.test(serialized) || serialized.includes(config.anonKey)) {
      throw new Error("QA_CMS_FORWARD_EVIDENCE_SENSITIVE");
    }
    mkdirSync(dirname(config.reportFile), { recursive: true });
    writeFileSync(config.reportFile, serialized, { mode: 0o600 });
  } finally {
    await context.close();
  }
});
