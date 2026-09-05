import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const origin = (process.env.CSP_CANARY_ORIGIN ?? "").replace(/\/$/, "");
const expectedSha = process.env.CSP_EXPECTED_SHA ?? "";
const reportPath = process.env.CSP_EVIDENCE_PATH;
if (
  !/^https:\/\/(?:ev2-g16-csp-canary|[a-f0-9]{8,40})\.gaiatec-cms-staging\.pages\.dev$/.test(origin) ||
  !/^[a-f0-9]{40}$/.test(expectedSha)
)
  throw new Error("CSP_CANARY_INPUT_REFUSED: isolated staging origin and full SHA are mandatory.");

const routes = ["/", "/contato", "/relatorio-de-obra/login", "/admin/login"];
const violations = [];
const results = [];
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  for (const path of routes) {
    const page = await context.newPage();
    const routeViolations = [];
    page.on("console", (message) => {
      const text = message.text();
      if (/content security policy|violates.*script-src|refused to (?:load|execute|frame)/i.test(text))
        routeViolations.push({ type: "console", text: text.slice(0, 500) });
    });
    page.on("pageerror", (error) => routeViolations.push({ type: "pageerror", text: error.message }));
    const response = await page.goto(`${origin}${path}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(1_000);
    const policy = response?.headers()["content-security-policy"] ?? "";
    const reportOnly = response?.headers()["content-security-policy-report-only"] ?? "";
    const release = response?.headers()["x-release"] ?? "";
    if (response?.status() !== 200)
      routeViolations.push({ type: "status", text: String(response?.status()) });
    if (release !== expectedSha) routeViolations.push({ type: "release", text: release });
    if (!policy || reportOnly)
      routeViolations.push({ type: "header", text: "CSP is not exclusively enforced" });
    if (policy.includes("https://api.resend.com"))
      routeViolations.push({ type: "policy", text: "Resend browser origin is forbidden" });
    results.push({
      path,
      status: response?.status() ?? 0,
      release,
      cspEnforced: Boolean(policy),
      violations: routeViolations,
    });
    violations.push(...routeViolations.map((item) => ({ path, ...item })));
    await page.close();
  }
} finally {
  await browser.close();
}

const report = {
  schemaVersion: 1,
  event: "ev2.phase16.csp.browser-canary",
  origin,
  candidateSha: expectedSha,
  executedAt: new Date().toISOString(),
  routes: results,
  criticalViolations: violations.length,
  outcome: violations.length === 0 ? "pass" : "pause",
  realDataUsed: false,
  productionMutations: 0,
};
if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
if (violations.length > 0) process.exitCode = 1;
