import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertRealBrowserLeadControls,
  REAL_BROWSER_LEAD_CHECKS,
  STAGING_LEAD_PROOF_MESSAGE,
} from "./real-browser-lead-controls-lib.mjs";

const expected = {
  candidateSha: "a".repeat(40),
  controlSha: "b".repeat(40),
  runId: "12345678",
  runAttempt: 1,
  runTag: "QA-CMS-FINAL-20260930-aaaaaaaa",
  deploymentId: "12345678-1234-4123-8123-123456789abc",
  reference: "LD-0123ABCDEF",
  challengeNonceSha256: "c".repeat(64),
  emailSha256: "d".repeat(64),
  screenshotSha256: "e".repeat(64),
};
const fixture = () => ({
  schemaVersion: 1,
  event: "g7.real_browser.lead_controls.passed",
  status: "passed",
  environment: "staging",
  ...expected,
  checks: Object.fromEntries(REAL_BROWSER_LEAD_CHECKS.map((key) => [key, true])),
  cleanup: { actorLeasesCleaned: 3, retainedLeaseAuditEvents: 6, watchdogFallbackOnCancellation: true },
  productionTouched: false,
  tokenCaptured: false,
});

test("requires every relocated control and the exact consumed Chrome binding", () => {
  assert.doesNotThrow(() => assertRealBrowserLeadControls(fixture(), expected));
  for (const key of REAL_BROWSER_LEAD_CHECKS) {
    for (const state of [false, undefined, "passed"]) {
      const report = fixture();
      report.checks[key] = state;
      assert.throws(() => assertRealBrowserLeadControls(report, expected), /checks/);
    }
  }
  for (const key of Object.keys(expected)) {
    const report = fixture();
    report[key] = typeof report[key] === "number" ? 2 : "different";
    assert.throws(() => assertRealBrowserLeadControls(report, expected), /binding/);
  }
});

test("refuses missing evidence, skipped gates, production, credentials and unfinished recovery", () => {
  for (const change of [
    (report) => {
      report.status = "skipped";
    },
    (report) => {
      report.environment = "production";
    },
    (report) => {
      report.tokenCaptured = true;
    },
    (report) => {
      report.productionTouched = true;
    },
    (report) => {
      report.cleanup.actorLeasesCleaned = 2;
    },
    (report) => {
      report.cleanup.retainedLeaseAuditEvents = 5;
    },
    (report) => {
      report.cleanup.watchdogFallbackOnCancellation = false;
    },
    (report) => {
      report.extra = { captchaToken: "not-a-real-token" };
    },
  ]) {
    const report = fixture();
    change(report);
    assert.throws(() => assertRealBrowserLeadControls(report, expected), /REFUSED/);
  }
  assert.throws(() => assertRealBrowserLeadControls(undefined, expected), /REFUSED/);
});

test("automatic lane retains captcha denials, never dummy success; Chrome owns all dependent checks", () => {
  const source = readFileSync("scripts/phase7/staging-roundtrip.mjs", "utf8");
  const automatic = source.slice(
    source.indexOf("async function run()"),
    source.indexOf("function readBrowserEvidence"),
  );
  const chrome = source.slice(
    source.indexOf("async function runRealBrowserLeadControls()"),
    source.indexOf("async function cleanup()"),
  );
  assert.match(automatic, /missingCaptchaResponse.status === 403/);
  assert.match(automatic, /invalidCaptchaResponse.status === 403/);
  assert.doesNotMatch(
    source,
    /XXXX\.DUMMY\.TOKEN\.XXXX|const firstCaptureResponse|const repeatCaptureResponse/,
  );
  assert.doesNotMatch(automatic, /export_leads|anonymize_lead|cms:leads\.(update|export|anonymize)/);
  assert.match(chrome, /assertConsumedRealBrowserEvidence/);
  assert.ok(chrome.indexOf("assertConsumedRealBrowserEvidence") < chrome.indexOf('createActor("admin")'));
  assert.match(chrome, /await assertQaActorLease/);
  assert.match(chrome, /stagingHttpIdempotencyVerified === true/);
  assert.match(chrome, /await leadCommand\(\s*marketing,[\s\S]*?\},\s*403,?\s*\)/);
  assert.match(
    chrome,
    /await leadCommand\(\s*commercial,[\s\S]*?action: "export_leads"[\s\S]*?\},\s*403,?\s*\)/,
  );
  assert.match(chrome, /await elevate\(commercial\)/);
  assert.match(chrome, /await elevate\(adminActor\)/);
  for (const action of ["cms:leads.update", "cms:leads.export", "cms:leads.anonymize"])
    assert.ok(chrome.includes(action));
  assert.match(chrome, /lead_received/);
  assert.match(chrome, /lead_assigned/);
  assert.doesNotMatch(chrome, /cms_capture_lead|cms_manage_lead|functions\/v1\/lead-capture/);
  assert.ok(readFileSync("src/public/staging-lead-proof.ts", "utf8").includes(STAGING_LEAD_PROOF_MESSAGE));
});

test("DAG makes Chrome controls mandatory after legacy compatibility and before terminal cleanup/sealing", () => {
  const workflow = readFileSync(".github/workflows/deploy-staging.yml", "utf8");
  const browser = workflow.slice(
    workflow.indexOf("  browser_attestation:"),
    workflow.indexOf("\n  evidence:"),
  );
  const controls = browser.indexOf("id: real_browser_lead_controls");
  assert.ok(controls > browser.indexOf("--grep @ui-bootstrap"));
  assert.ok(controls > browser.indexOf("cms-public-forward-compatibility.spec.ts"));
  assert.ok(controls > browser.indexOf("Traverse the rollback frontend"));
  assert.ok(controls < browser.indexOf("id: browser_mutating_cleanup"));
  assert.match(browser, /--lead-controls outputs\/cms-real-browser-lead-controls.json/);
  assert.match(browser, /GAIATEC_DEPLOYMENT_ID: \$\{\{ needs.deploy.outputs.canonical_deployment_id \}\}/);
  const step = browser.slice(
    browser.lastIndexOf("      - name:", controls),
    browser.indexOf("      - name:", controls),
  );
  assert.doesNotMatch(step, /continue-on-error|if:|\|\| true|--retries=[1-9]/);
  assert.match(step, /set -euo pipefail/);
  assert.match(step, /env -u SUPABASE_ACCESS_TOKEN npx playwright/);
  assert.match(step, /timeout-minutes: 30/);
  assert.ok(step.indexOf("--real-browser-lead-controls") > step.indexOf("--grep"));
  assert.match(browser, /candidate\/outputs\/cms-real-browser-lead-controls.json \\/);
});
