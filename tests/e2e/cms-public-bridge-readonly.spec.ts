import { expect, test } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import { assertSealedPreviewRoutingUsed, installSealedPreviewRouting } from "./cms-sealed-preview-routing";

const SHA = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const routes = ["/", "/produtos", "/contato", "/admin/login"] as const;

test("@public-bridge-readonly renderiza produção sem mutação no backend legado", async ({
  browser,
  baseURL,
}) => {
  test.skip(process.env.QA_CMS_PUBLIC_BRIDGE_READONLY_REQUIRED !== "true", "gate não exigido");
  const expectedSha = process.env.QA_CMS_EXPECTED_SHA ?? "";
  const deploymentOrigin = new URL(process.env.QA_CMS_BRIDGE_DEPLOYMENT_ORIGIN ?? "https://invalid.invalid");
  const deploymentId = process.env.QA_CMS_BRIDGE_DEPLOYMENT_ID ?? "";
  const report = resolve(
    process.cwd(),
    process.env.QA_CMS_BRIDGE_REPORT_PATH ?? "outputs/bridge-readonly.json",
  );
  const fromRoot = relative(process.cwd(), report);
  if (
    baseURL !== "https://gaiatecsistemas.com.br" ||
    !SHA.test(expectedSha) ||
    !UUID.test(deploymentId) ||
    (deploymentOrigin.origin !== "https://gaiatecsistemas.com.br" &&
      !/^https:\/\/[a-z0-9-]+\.gaiatec-website\.pages\.dev$/.test(deploymentOrigin.origin)) ||
    deploymentOrigin.pathname !== "/" ||
    !fromRoot ||
    fromRoot.startsWith("..")
  )
    throw new Error("QA_CMS_PUBLIC_BRIDGE_READONLY_CONFIGURATION_REFUSED");
  const context = await browser.newContext({ baseURL, serviceWorkers: "block" });
  const preview = await installSealedPreviewRouting(context, process.env);
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  let backendMutationRequests = 0;
  let leadPosts = 0;
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.name));
  page.on("requestfailed", (request) => requestFailures.push(new URL(request.url()).pathname));
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith(".supabase.co") && !["GET", "HEAD", "OPTIONS"].includes(request.method()))
      backendMutationRequests += 1;
    if (request.method() === "POST" && url.pathname.endsWith("/functions/v1/lead-capture")) leadPosts += 1;
  });
  try {
    for (const route of routes) {
      const response = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(response?.status()).toBe(200);
      expect(response?.headers()["x-release"]).toBe(expectedSha);
      await expect(page.locator("body")).toBeVisible();
    }
    expect(backendMutationRequests).toBe(0);
    expect(leadPosts).toBe(0);
    expect(consoleErrors).toEqual([]);
    expect(requestFailures).toEqual([]);
    if (preview) assertSealedPreviewRoutingUsed(context);
    const evidence = {
      schemaVersion: 1,
      event: "g12.public_bridge.production_readonly",
      status: "passed",
      frontendSha: expectedSha,
      origin: baseURL,
      deploymentOrigin: deploymentOrigin.origin,
      deploymentIdentitySha256: createHash("sha256").update(deploymentId).digest("hex"),
      routes: [...routes],
      renderedRoutes: routes.length,
      backendMutationRequests,
      leadSubmissions: leadPosts,
      unexpectedConsole: consoleErrors.length,
      requestFailures: requestFailures.length,
      secretsPersisted: false,
    };
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(report, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  } finally {
    await context.close();
  }
});
