import { expect, test, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

test.use({ trace: "off", screenshot: "off", video: "off" });

const PRODUCTION_ORIGIN = "https://gaiatecsistemas.com.br";
const PRODUCTION_SUPABASE_ORIGIN = "https://chfuhctnhqgyjowkvllv.supabase.co";
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const evidencePath = resolve(
  repositoryRoot,
  process.env.QA_CMS_PRODUCTION_PREFLIGHT_REPORT_PATH ?? "outputs/cms-production-readonly-preflight.json",
);

type Configuration = {
  expectedSha: string;
  baselineSha: string;
  previewOrigin: string;
  anonKey: string;
  email: string;
  password: string;
  totpSecret: string;
};

function configuration(baseURL: string | undefined): Configuration | null {
  if (process.env.QA_CMS_PRODUCTION_READONLY_PREFLIGHT_REQUIRED !== "true") return null;
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA ?? "";
  const baselineSha = process.env.QA_CMS_CANONICAL_BASELINE_SHA ?? "";
  const preview = new URL(process.env.QA_CMS_SEALED_PREVIEW_URL ?? "https://invalid.invalid");
  const backend = new URL(process.env.QA_CMS_SUPABASE_URL ?? "https://invalid.invalid");
  const production = new URL(baseURL ?? "https://invalid.invalid");
  const email = (process.env.QA_CMS_CORPORATE_EMAIL ?? "").trim().toLowerCase();
  const allowedDomain = (process.env.QA_CMS_CORPORATE_EMAIL_DOMAIN || "gaiatecsistemas.com.br").toLowerCase();
  const values = {
    anonKey: process.env.QA_CMS_SUPABASE_ANON_KEY ?? "",
    password: process.env.QA_CMS_CORPORATE_PASSWORD ?? "",
    totpSecret: process.env.QA_CMS_CORPORATE_TOTP_SECRET ?? "",
  };
  if (
    !/^[a-f0-9]{40}$/.test(expectedSha) ||
    !/^[a-f0-9]{40}$/.test(baselineSha) ||
    baselineSha === expectedSha ||
    preview.pathname !== "/" ||
    preview.search ||
    preview.hash ||
    !/^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/.test(preview.origin) ||
    production.origin !== PRODUCTION_ORIGIN ||
    production.pathname !== "/" ||
    backend.origin !== PRODUCTION_SUPABASE_ORIGIN ||
    backend.pathname !== "/" ||
    process.env.QA_CMS_TARGET_ENVIRONMENT !== "production" ||
    process.env.QA_CMS_PRODUCTION_AUTHORIZATION !== `AUTORIZO-G12-PRODUCAO:${expectedSha}` ||
    !email.endsWith(`@${allowedDomain}`) ||
    Object.values(values).some((value) => !value)
  ) {
    throw new Error("QA_CMS_PRODUCTION_READONLY_PREFLIGHT_CONFIGURATION_REFUSED");
  }
  return { expectedSha, baselineSha, previewOrigin: preview.origin, email, ...values };
}

function base32Bytes(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const normalized = value.toUpperCase().replace(/[\s=-]/g, "");
  if (!normalized || [...normalized].some((character) => !alphabet.includes(character))) {
    throw new Error("QA_CMS_PRODUCTION_READONLY_PREFLIGHT_TOTP_INVALID");
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
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .slice(0, 500);
}

function writeEvidence(value: Record<string, unknown>) {
  const relativePath = relative(repositoryRoot, evidencePath);
  if (
    isAbsolute(relativePath) ||
    !relativePath ||
    relativePath === ".." ||
    relativePath.startsWith("../") ||
    relativePath.startsWith("..\\")
  ) {
    throw new Error("QA_CMS_PRODUCTION_PREFLIGHT_REPORT_PATH_REFUSED");
  }
  mkdirSync(dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function closeCurrentAuthSession(page: Page, anonKey: string) {
  return page
    .evaluate(
      async ({ anonKey, endpoint }) => {
        const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
        const stored = key
          ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
          : null;
        const token = typeof stored?.access_token === "string" ? stored.access_token : null;
        if (!key || !token) return true;
        const response = await fetch(`${endpoint}/auth/v1/logout?scope=local`, {
          method: "POST",
          headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
        });
        localStorage.removeItem(key);
        return response.ok;
      },
      { anonKey, endpoint: PRODUCTION_SUPABASE_ORIGIN },
    )
    .catch(() => false);
}

test("@preflight autentica conta corporativa com MFA no tar selado sem mutação CMS", async ({
  browser,
  baseURL,
}) => {
  const config = configuration(baseURL);
  test.skip(!config, "canary corporativo read-only não exigido pela política de produção");
  if (!config) throw new Error("QA_CMS_PRODUCTION_READONLY_PREFLIGHT_GATE_INCONSISTENT");
  test.setTimeout(3 * 60_000);

  const context = await browser.newContext({ baseURL: PRODUCTION_ORIGIN, serviceWorkers: "block" });
  const page = await context.newPage();
  const unexpectedMutations: string[] = [];
  const networkFailures: string[] = [];
  const consoleErrors: string[] = [];
  let mappedFirstPartyRequests = 0;
  let status: "passed" | "failed" = "failed";
  let failure: string | null = null;
  let sessionClosed = false;
  let operatorRoles: string[] = [];
  const sensitive = [config.email, config.password, config.totpSecret, config.anonKey];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(sanitizeFailure(message.text(), sensitive));
  });
  page.on("pageerror", (error) => consoleErrors.push(sanitizeFailure(error, sensitive)));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (
      response.status() >= 400 &&
      (url.origin === PRODUCTION_ORIGIN || url.origin === PRODUCTION_SUPABASE_ORIGIN)
    ) {
      networkFailures.push(`${response.status()} ${url.pathname}`);
    }
  });

  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.origin === PRODUCTION_ORIGIN) {
      if (method !== "GET" && method !== "HEAD") {
        unexpectedMutations.push(`${method} ${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      const mapped = new URL(`${url.pathname}${url.search}`, config.previewOrigin);
      const response = await route.fetch({ url: mapped.toString() });
      if (new URL(response.url()).origin !== config.previewOrigin) {
        networkFailures.push(`preview_redirect_refused ${url.pathname}`);
        await route.abort("blockedbyclient");
        return;
      }
      mappedFirstPartyRequests += 1;
      await route.fulfill({ response });
      return;
    }
    let allowedAuthenticationWrite = false;
    if (url.origin === PRODUCTION_SUPABASE_ORIGIN && method === "POST") {
      if (url.pathname === "/auth/v1/token") allowedAuthenticationWrite = true;
      else if (/^\/auth\/v1\/factors\/[^/]+\/(?:challenge|verify)$/.test(url.pathname)) {
        allowedAuthenticationWrite = true;
      } else if (url.pathname === "/auth/v1/logout" && url.searchParams.get("scope") === "local") {
        allowedAuthenticationWrite = true;
      } else if (url.pathname === "/functions/v1/cms-session") {
        try {
          allowedAuthenticationWrite = ["resolve", "mfa", "logout"].includes(request.postDataJSON()?.action);
        } catch {
          allowedAuthenticationWrite = false;
        }
      }
    }
    if (
      url.origin === PRODUCTION_SUPABASE_ORIGIN &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      !allowedAuthenticationWrite
    ) {
      unexpectedMutations.push(`${method} ${url.pathname}`);
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  try {
    const shell = await page.goto("/admin/login", { waitUntil: "domcontentloaded" });
    expect(shell?.headers()["x-release"]).toBe(config.expectedSha);
    await page.getByLabel("E-mail corporativo").fill(config.email);
    await page.getByLabel("Senha").fill(config.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page).toHaveURL(/\/admin\/mfa$/);
    await expect(page.getByRole("heading", { name: "Confirmar sua identidade" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ativar verificação em duas etapas" })).toHaveCount(0);
    const mfaResolution = waitForEdgeAction(page, "mfa");
    await page.getByLabel("Código de 6 dígitos").fill(await stableTotp(config.totpSecret));
    await page.getByRole("button", { name: "Verificar e entrar" }).click();
    expect((await mfaResolution).status()).toBe(200);
    await expect(page.locator("[data-admin-surface]")).toBeVisible({ timeout: 20_000 });

    const profileShell = await page.goto("/admin/perfil", { waitUntil: "domcontentloaded" });
    expect(profileShell?.headers()["x-release"]).toBe(config.expectedSha);
    await expect(page.getByRole("heading", { name: "Perfil e acesso" })).toBeVisible();
    const ownProfile = await page.evaluate(
      async ({ anonKey, endpoint }) => {
        const key = Object.keys(localStorage).find((candidate) => candidate.endsWith("-auth-token"));
        const stored = key
          ? (JSON.parse(localStorage.getItem(key) ?? "null") as Record<string, unknown>)
          : null;
        const token = typeof stored?.access_token === "string" ? stored.access_token : null;
        if (!token) throw new Error("corporate-browser-session-unavailable");
        const jwtPayload = token.split(".")[1];
        if (!jwtPayload) throw new Error("corporate-browser-subject-unavailable");
        const normalizedPayload = jwtPayload
          .replace(/-/g, "+")
          .replace(/_/g, "/")
          .padEnd(Math.ceil(jwtPayload.length / 4) * 4, "=");
        const payload = JSON.parse(atob(normalizedPayload)) as Record<string, unknown>;
        if (typeof payload.sub !== "string") throw new Error("corporate-browser-subject-unavailable");
        const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
        const [profileResponse, rolesResponse] = await Promise.all([
          fetch(
            `${endpoint}/rest/v1/cms_profiles?select=status,mfa_enrolled_at&user_id=eq.${encodeURIComponent(payload.sub)}`,
            { headers },
          ),
          fetch(
            `${endpoint}/rest/v1/cms_user_roles?select=role_key&user_id=eq.${encodeURIComponent(payload.sub)}&order=role_key.asc`,
            { headers },
          ),
        ]);
        const rows = (await profileResponse.json().catch(() => null)) as Array<
          Record<string, unknown>
        > | null;
        const roleRows = (await rolesResponse.json().catch(() => null)) as Array<
          Record<string, unknown>
        > | null;
        return {
          profileStatus: profileResponse.status,
          rolesStatus: rolesResponse.status,
          exactlyOneActiveMfaProfile:
            Array.isArray(rows) &&
            rows.length === 1 &&
            rows[0]?.status === "active" &&
            Boolean(rows[0]?.mfa_enrolled_at),
          roles: Array.isArray(roleRows)
            ? roleRows.map((row) => row.role_key).filter((role): role is string => typeof role === "string")
            : [],
        };
      },
      { anonKey: config.anonKey, endpoint: PRODUCTION_SUPABASE_ORIGIN },
    );
    expect(ownProfile.profileStatus).toBe(200);
    expect(ownProfile.rolesStatus).toBe(200);
    expect(ownProfile.exactlyOneActiveMfaProfile).toBe(true);
    expect(ownProfile.roles.length).toBeGreaterThan(0);
    expect(ownProfile.roles.every((role) => /^[a-z][a-z0-9_]{1,63}$/.test(role))).toBe(true);
    operatorRoles = ownProfile.roles;

    const cmsLogout = waitForEdgeAction(page, "logout");
    const authLogout = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "POST" &&
          url.pathname.endsWith("/auth/v1/logout") &&
          url.searchParams.get("scope") === "local"
        );
      },
      { timeout: 30_000 },
    );
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    expect((await cmsLogout).status()).toBe(200);
    expect((await authLogout).status()).toBeLessThan(300);
    await expect(page).toHaveURL(/\/admin\/login$/);
    sessionClosed = await page.evaluate(
      () => !Object.keys(localStorage).some((candidate) => candidate.endsWith("-auth-token")),
    );
    expect(sessionClosed).toBe(true);
    expect(mappedFirstPartyRequests).toBeGreaterThan(1);
    if (unexpectedMutations.length) {
      throw new Error(`QA_CMS_PRODUCTION_PREFLIGHT_MUTATION_BLOCKED:${unexpectedMutations.length}`);
    }
    if (networkFailures.length) {
      throw new Error(`QA_CMS_PRODUCTION_PREFLIGHT_NETWORK_FAILURE:${networkFailures.length}`);
    }
    if (consoleErrors.length) {
      throw new Error(`QA_CMS_PRODUCTION_PREFLIGHT_CONSOLE_FAILURE:${consoleErrors.length}`);
    }
    status = "passed";
  } catch (error) {
    failure = sanitizeFailure(error, sensitive);
  } finally {
    if (!sessionClosed) sessionClosed = await closeCurrentAuthSession(page, config.anonKey);
    await context.close().catch(() => undefined);
    writeEvidence({
      schemaVersion: 1,
      event: "g12.production.authenticated_readonly_preflight",
      status,
      policyRequired: true,
      candidateSha: config.expectedSha,
      sealedFrontendCandidateSha: config.expectedSha,
      preparedBackendCandidateSha: config.expectedSha,
      canonicalFrontendDuringPreflightSha: config.baselineSha,
      shell: "exact-sealed-cloudflare-preview-mapped-under-production-origin",
      backend: "supabase-production-real",
      browser: "desktop-chromium-real-ui",
      scenarios: [
        {
          id: "corporate_login_mfa_readonly_exact_sealed_preview",
          status,
          exactReleaseHeader: status === "passed",
          activeMfaProfileRead: status === "passed",
          roles: operatorRoles,
          sessionClosed,
        },
      ],
      mappedFirstPartyRequests,
      cmsMutations: 0,
      authAuditWritesOnly: true,
      credentialsPersisted: false,
      tokensPersisted: false,
      rawBrowserArtifacts: "disabled",
      unexpectedMutationCount: unexpectedMutations.length,
      unexpectedNetworkFailureCount: networkFailures.length,
      consoleErrorCount: consoleErrors.length,
      failure,
    });
  }
  if (failure) throw new Error(`QA_CMS_PRODUCTION_READONLY_PREFLIGHT_FAILED:${failure}`);
});
