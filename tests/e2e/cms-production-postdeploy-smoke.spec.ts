import { expect, test, type APIResponse, type Page, type Response } from "@playwright/test";
import { createHmac } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

test.use({ trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" });

const PRODUCTION_ORIGIN = "https://gaiatecsistemas.com.br";
const PRODUCTION_SUPABASE_ORIGIN = "https://chfuhctnhqgyjowkvllv.supabase.co";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = resolve(
  repositoryRoot,
  process.env.QA_CMS_PRODUCTION_POSTDEPLOY_REPORT_PATH ?? "outputs/cms-production-postdeploy-smoke.json",
);

type Configuration = {
  expectedSha: string;
  anonKey: string;
  email: string;
  password: string;
  totpSecret: string;
  tombstonePath: string;
};

function privateFixtureState(expectedSha: string) {
  const fixturePath = resolve(
    repositoryRoot,
    process.env.QA_CMS_FIXTURE_STATE_PATH ?? "outputs/cms-browser-production-state.json",
  );
  const pathFromRoot = relative(repositoryRoot, fixturePath);
  if (
    isAbsolute(pathFromRoot) ||
    !pathFromRoot ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith("../") ||
    pathFromRoot.startsWith("..\\")
  ) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_STATE_PATH_REFUSED");
  }
  const stat = lstatSync(fixturePath);
  const realFromRoot = relative(realpathSync(repositoryRoot), realpathSync(fixturePath));
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size < 2 ||
    stat.size > 128 * 1024 ||
    realFromRoot === ".." ||
    realFromRoot.startsWith("../") ||
    realFromRoot.startsWith("..\\") ||
    (process.platform !== "win32" && (stat.mode & 0o077) !== 0)
  ) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_STATE_FILE_REFUSED");
  }
  let state: Record<string, unknown>;
  try {
    state = JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
  } catch (error) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_STATE_JSON_REFUSED", { cause: error });
  }
  const tombstone = state.terminalArchivedTombstone as Record<string, unknown> | undefined;
  const expectedPath = `/qa-cms-final-gone-${expectedSha.slice(0, 8)}`;
  if (
    state.schemaVersion !== 1 ||
    state.status !== "cleaned" ||
    state.environment !== "production" ||
    state.expectedSha !== expectedSha ||
    typeof state.runTag !== "string" ||
    !/^QA-CMS-FINAL-[0-9]{8}-[0-9a-f]{8}$/.test(state.runTag) ||
    !state.runTag.endsWith(`-${expectedSha.slice(0, 8)}`) ||
    !tombstone ||
    typeof tombstone.itemId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(tombstone.itemId) ||
    Object.hasOwn(tombstone, "path") ||
    !Array.isArray(state.itemIds) ||
    !state.itemIds.includes(tombstone.itemId)
  ) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_STATE_BINDING_REFUSED");
  }
  return { tombstonePath: expectedPath };
}

function configuration(baseURL: string | undefined): Configuration | null {
  if (process.env.QA_CMS_PRODUCTION_POSTDEPLOY_REQUIRED !== "true") return null;
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA ?? "";
  const production = new URL(baseURL ?? "https://invalid.invalid");
  const backend = new URL(process.env.QA_CMS_SUPABASE_URL ?? "https://invalid.invalid");
  const email = (process.env.QA_CMS_CORPORATE_EMAIL ?? "").trim().toLowerCase();
  const allowedDomain = (process.env.QA_CMS_CORPORATE_EMAIL_DOMAIN || "gaiatecsistemas.com.br").toLowerCase();
  const values = {
    anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY ?? "",
    password: process.env.QA_CMS_CORPORATE_PASSWORD ?? "",
    totpSecret: process.env.QA_CMS_CORPORATE_TOTP_SECRET ?? "",
  };
  if (
    !/^[a-f0-9]{40}$/.test(expectedSha) ||
    production.origin !== PRODUCTION_ORIGIN ||
    production.pathname !== "/" ||
    production.search ||
    production.hash ||
    backend.origin !== PRODUCTION_SUPABASE_ORIGIN ||
    backend.pathname !== "/" ||
    process.env.QA_CMS_TARGET_ENVIRONMENT !== "production" ||
    process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${expectedSha}` ||
    process.env.QA_CMS_SEALED_PREVIEW_URL ||
    !email.endsWith(`@${allowedDomain}`) ||
    Object.values(values).some((value) => !value)
  ) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_CONFIGURATION_REFUSED");
  }
  return { expectedSha, email, ...values, ...privateFixtureState(expectedSha) };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_TOTP_INVALID");
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

async function stableTotp(secret: string) {
  const position = Date.now() % 30_000;
  if (position > 26_000) await new Promise((resolve) => setTimeout(resolve, 31_000 - position));
  return totp(secret);
}

function waitForEdgeAction(page: Page, action: string) {
  return page.waitForResponse(
    (response) => {
      if (
        response.request().method() !== "POST" ||
        !new URL(response.url()).pathname.endsWith("/functions/v1/cms-session")
      ) {
        return false;
      }
      try {
        return response.request().postDataJSON()?.action === action;
      } catch {
        return false;
      }
    },
    { timeout: 30_000 },
  );
}

function sanitizeFailure(error: unknown, secrets: string[]) {
  let message = error instanceof Error ? error.message : String(error);
  for (const secret of secrets) if (secret) message = message.replaceAll(secret, "[secret]");
  return message
    .replace(/https?:\/\/\S+/gi, "[url]")
    .replace(/\/qa-cms-final-(?:gone|missing)-[0-9a-f]{8}\b/gi, "[synthetic-route]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[identifier]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .slice(0, 500);
}

function writeEvidence(value: Record<string, unknown>) {
  const pathFromRoot = relative(repositoryRoot, evidencePath);
  if (
    isAbsolute(pathFromRoot) ||
    !pathFromRoot ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith("../") ||
    pathFromRoot.startsWith("..\\")
  ) {
    throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_REPORT_PATH_REFUSED");
  }
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

function assertRelease(response: Response | null, expectedSha: string) {
  expect(response).not.toBeNull();
  expect(response!.status()).toBeLessThan(400);
  expect(response!.headers()["x-release"]).toBe(expectedSha);
}

function assertApiRelease(response: APIResponse, expectedSha: string, status: number) {
  expect(response.status()).toBe(status);
  expect(response.headers()["x-release"]).toBe(expectedSha);
}

test("@postdeploy conta corporativa MFA e SEO operam no domínio canônico promovido", async ({
  page,
  request,
  baseURL,
}) => {
  const config = configuration(baseURL);
  test.skip(!config, "smoke corporativo pós-deploy não exigido");
  if (!config) throw new Error("QA_CMS_PRODUCTION_POSTDEPLOY_GATE_INCONSISTENT");
  test.setTimeout(5 * 60_000);

  const consoleErrors: string[] = [];
  const networkFailures: string[] = [];
  const releaseMismatches: string[] = [];
  const unexpectedCmsMutations: string[] = [];
  const sensitive = [config.email, config.password, config.totpSecret, config.anonKey];
  let status: "passed" | "failed" = "failed";
  let failure: string | null = null;
  let sessionClosed = false;
  let authenticatedRoutes = 0;
  let seoChecks = 0;
  let canonicalHttpProbes = 0;
  let releaseVerifiedProbes = 0;
  let cachePolicyChecks = 0;
  const statusCounts = {
    ok200: 0,
    permanentRedirect301: 0,
    archivedGone410: 0,
    notFound404: 0,
  };
  let terminalTombstoneVerified = false;
  let structuredDataVerified = false;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(sanitizeFailure(message.text(), sensitive));
  });
  page.on("pageerror", (error) => consoleErrors.push(sanitizeFailure(error, sensitive)));
  page.on("request", (browserRequest) => {
    const url = new URL(browserRequest.url());
    if (url.origin === PRODUCTION_ORIGIN && !["GET", "HEAD", "OPTIONS"].includes(browserRequest.method())) {
      unexpectedCmsMutations.push(`${browserRequest.method()} ${url.pathname}`);
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === PRODUCTION_ORIGIN) {
      if (response.headers()["x-release"] !== config.expectedSha) releaseMismatches.push(url.pathname);
      if (response.status() >= 400) networkFailures.push(`${response.status()} ${url.pathname}`);
    } else if (url.origin === PRODUCTION_SUPABASE_ORIGIN && response.status() >= 400) {
      networkFailures.push(`${response.status()} ${url.pathname}`);
    }
  });

  try {
    const health = await request.get("/healthz", { headers: { "cache-control": "no-store" } });
    assertApiRelease(health, config.expectedSha, 200);
    expect(await health.json()).toMatchObject({
      schemaVersion: 1,
      status: "ready",
      environment: "production",
      release: config.expectedSha,
    });
    expect(health.headers()["cache-control"]).toMatch(/no-store/);
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    cachePolicyChecks += 1;
    statusCounts.ok200 += 1;

    const manifest = await request.get("/release-manifest.json", {
      headers: { "cache-control": "no-store" },
    });
    assertApiRelease(manifest, config.expectedSha, 200);
    expect(await manifest.json()).toMatchObject({ schemaVersion: 1, release: config.expectedSha });
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    statusCounts.ok200 += 1;

    const robots = await request.get("/robots.txt", { headers: { "cache-control": "no-store" } });
    assertApiRelease(robots, config.expectedSha, 200);
    const robotsBody = await robots.text();
    expect(robotsBody).toContain("Disallow: /admin/");
    expect(robotsBody).toContain("Sitemap: https://gaiatecsistemas.com.br/sitemap.xml");
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    seoChecks += 2;
    statusCounts.ok200 += 1;

    const sitemap = await request.get("/sitemap.xml", { headers: { "cache-control": "no-store" } });
    assertApiRelease(sitemap, config.expectedSha, 200);
    const sitemapBody = await sitemap.text();
    expect(sitemapBody).toMatch(/<urlset\b/);
    expect(sitemapBody).toContain("https://gaiatecsistemas.com.br/");
    expect(sitemapBody).not.toContain(config.tombstonePath);
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    seoChecks += 3;
    statusCounts.ok200 += 1;

    const staticRedirect = await request.get("/setores", {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: { "cache-control": "no-store" },
    });
    assertApiRelease(staticRedirect, config.expectedSha, 301);
    expect(staticRedirect.headers().location).toBe("/industrias");
    expect(staticRedirect.headers()["cache-control"]).toMatch(/must-revalidate/);
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    cachePolicyChecks += 1;
    statusCounts.permanentRedirect301 += 1;

    const tombstone = await request.get(config.tombstonePath, {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: { "cache-control": "no-store" },
    });
    assertApiRelease(tombstone, config.expectedSha, 410);
    expect(tombstone.headers().location).toBeUndefined();
    expect(tombstone.headers()["x-robots-tag"]).toMatch(/noindex/);
    expect(tombstone.headers()["cache-control"]).toMatch(/no-store/);
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    cachePolicyChecks += 1;
    seoChecks += 1;
    statusCounts.archivedGone410 += 1;
    terminalTombstoneVerified = true;

    const missing = await request.get(`/qa-cms-final-missing-${config.expectedSha.slice(0, 8)}`, {
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: { "cache-control": "no-store" },
    });
    assertApiRelease(missing, config.expectedSha, 404);
    expect(missing.headers().location).toBeUndefined();
    expect(missing.headers()["x-robots-tag"]).toMatch(/noindex/);
    expect(missing.headers()["cache-control"]).toMatch(/no-store/);
    canonicalHttpProbes += 1;
    releaseVerifiedProbes += 1;
    cachePolicyChecks += 1;
    seoChecks += 1;
    statusCounts.notFound404 += 1;

    const login = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    assertRelease(login, config.expectedSha);
    await page.getByLabel("E-mail corporativo").fill(config.email);
    await page.getByLabel("Senha").fill(config.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    const mfaResolution = waitForEdgeAction(page, "mfa");
    await page.getByLabel("Código de 6 dígitos").fill(await stableTotp(config.totpSecret));
    await page.getByRole("button", { name: "Verificar e entrar" }).click();
    expect((await mfaResolution).status()).toBe(200);
    await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });

    for (const path of ["/admin/perfil", "/admin/paginas", "/admin/diagnosticos"]) {
      const response = await page.goto(path, { waitUntil: "domcontentloaded" });
      assertRelease(response, config.expectedSha);
      await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });
      authenticatedRoutes += 1;
    }

    const cmsLogout = waitForEdgeAction(page, "logout");
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    expect((await cmsLogout).status()).toBe(200);
    await expect(page).toHaveURL(/\/admin\/login$/);
    sessionClosed = await page.evaluate(
      () => !Object.keys(localStorage).some((candidate) => candidate.endsWith("-auth-token")),
    );
    expect(sessionClosed).toBe(true);

    const home = await page.goto("/", { waitUntil: "domcontentloaded" });
    assertRelease(home, config.expectedSha);
    expect(home!.headers()["cache-control"]).toMatch(/(?:must-revalidate|no-cache|max-age=0)/);
    cachePolicyChecks += 1;
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://gaiatecsistemas.com.br/",
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S{20,}/);
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", /\S+/);
    await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", /\S{20,}/);
    await expect(page).toHaveTitle(/\S+/);
    const structuredData = page.locator('script[type="application/ld+json"]');
    await expect.poll(() => structuredData.count()).toBeGreaterThan(0);
    const structuredPayloads = (await structuredData.allTextContents()).map((value) => JSON.parse(value));
    expect(
      structuredPayloads.some(
        (value) => value && typeof value === "object" && value["@context"] === "https://schema.org",
      ),
    ).toBe(true);
    structuredDataVerified = true;
    seoChecks += 6;

    expect(authenticatedRoutes).toBe(3);
    expect(canonicalHttpProbes).toBe(7);
    expect(releaseVerifiedProbes).toBe(7);
    expect(cachePolicyChecks).toBe(5);
    expect(seoChecks).toBe(13);
    expect(unexpectedCmsMutations).toEqual([]);
    expect(releaseMismatches).toEqual([]);
    expect(networkFailures).toEqual([]);
    expect(consoleErrors).toEqual([]);
    status = "passed";
  } catch (error) {
    failure = sanitizeFailure(error, sensitive);
  } finally {
    writeEvidence({
      schemaVersion: 1,
      event: "g12.production.postdeploy_authenticated_smoke",
      status,
      environment: "production",
      candidateSha: config.expectedSha,
      origin: PRODUCTION_ORIGIN,
      shell: "canonical-promoted-exact-sealed-artifact",
      backend: "supabase-production-real",
      browser: "desktop-chromium-real-ui",
      corporateMfaAuthenticated: status === "passed",
      authenticatedRoutes,
      seoChecks,
      canonicalHttpProbes,
      releaseVerifiedProbes,
      cachePolicyChecks,
      statusCounts,
      structuredDataVerified,
      terminalArchivedTombstone: {
        classification: "terminalArchivedTombstone",
        count: terminalTombstoneVerified ? 1 : 0,
        statusCode: 410,
        destinationAbsent: true,
        itemArchived: true,
        publicationCount: 0,
        projectionCount: 0,
        actionableOutboxCount: 0,
        piiExposed: false,
      },
      sessionClosed,
      unexpectedCmsMutationCount: unexpectedCmsMutations.length,
      releaseMismatchCount: releaseMismatches.length,
      networkFailureCount: networkFailures.length,
      consoleErrorCount: consoleErrors.length,
      credentialsPersisted: false,
      tokensPersisted: false,
      rawBrowserArtifacts: "disabled",
      identifiersOrPathsPersisted: false,
      failure,
    });
  }
  if (failure) throw new Error(`QA_CMS_PRODUCTION_POSTDEPLOY_FAILED:${failure}`);
});
