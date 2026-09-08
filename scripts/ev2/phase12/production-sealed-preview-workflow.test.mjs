import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workflow = readFileSync(resolve(repositoryRoot, ".github/workflows/deploy-production.yml"), "utf8");
const watchdogWorkflow = readFileSync(
  resolve(repositoryRoot, ".github/workflows/finalize-production-deploy.yml"),
  "utf8",
);
const outboxCanary = readFileSync(
  resolve(repositoryRoot, "scripts/ev2/phase12/verify-production-outbox-canary.mjs"),
  "utf8",
);
const postdeploySmoke = readFileSync(
  resolve(repositoryRoot, "tests/e2e/cms-production-postdeploy-smoke.spec.ts"),
  "utf8",
);
const terminalStateMaterializer = readFileSync(
  resolve(repositoryRoot, "scripts/qa/materialize-cms-terminal-state.mjs"),
  "utf8",
);
const sealedPreviewSuites = [
  "cms-auth-lifecycle.spec.ts",
  "cms-admin-ops-cycles.spec.ts",
  "cms-secondary-ui-cycles.spec.ts",
  "cms-final-coverage.spec.ts",
  "cms-security-boundaries.spec.ts",
].map((name) => ({
  name,
  source: readFileSync(resolve(repositoryRoot, "tests/e2e", name), "utf8"),
}));

function position(fragment) {
  const index = workflow.indexOf(fragment);
  assert.notEqual(index, -1, `missing production workflow contract: ${fragment}`);
  return index;
}

test("the exact sealed preview completes every real-browser gate before canonical promotion", () => {
  const preview = position("Deploy the single sealed artifact to an isolated production-project preview");
  const technicalProbe = position("Probe immutable shell in the isolated production-project preview");
  const corporateConfiguration = position("Require the complete corporate MFA preflight configuration");
  const baseline = position("Capture approved rollback baseline");
  const marker = position("Arm the durable production mutation marker");
  const backend = position("Apply the exact candidate expand-only migrations to production");
  const functions = position("Deploy the complete exact-candidate Edge Function inventory");
  const fixture = position("Provision an isolated production MFA actor for the sealed preview cycle");
  const uiBootstrap = position("Create the complete UI-owned production fixture on the exact sealed preview");
  const semantic = position("Execute every semantic route control on the exact sealed preview");
  const terminal = position("Materialize the exact terminal production coverage matrix before promotion");
  const cleanup = position("Revoke the production browser actor after sealed-preview homologation");
  const outbox = position("Prove the sealed-preview publication outbox and cache invalidation converged");
  const residue = position("Recheck zero active synthetic residue against production");
  const promote = position("Promote the exact same single sealed artifact after every preview gate");
  assert.ok(preview < technicalProbe && technicalProbe < corporateConfiguration);
  assert.ok(corporateConfiguration < baseline);
  assert.ok(corporateConfiguration < marker);
  assert.ok(corporateConfiguration < backend);
  assert.ok(corporateConfiguration < functions);
  assert.ok(backend < fixture);
  assert.ok(fixture < uiBootstrap);
  assert.ok(uiBootstrap < semantic);
  assert.ok(semantic < cleanup);
  assert.ok(cleanup < outbox);
  assert.ok(outbox < residue);
  assert.ok(residue < terminal);
  assert.ok(terminal < promote);

  const prePromotion = workflow.slice(uiBootstrap, promote);
  for (const command of [
    "cms-auth-lifecycle.spec.ts",
    "cms-admin-ops-cycles.spec.ts",
    "cms-secondary-ui-cycles.spec.ts",
    "cms-security-boundaries.spec.ts",
    "cms-final-coverage.spec.ts",
    "--grep @ui-bootstrap",
    "--grep @security-production",
    "--grep @semantic",
    "materialize-cms-terminal-coverage.mjs",
    "--cleanup outputs/cms-browser-production-cleanup.json",
    "--residue ../g12-production-residue.json",
    "--state ../candidate/outputs/cms-browser-production-state.json",
    "QA_CMS_SEALED_PREVIEW_URL: ${{ steps.preflight.outputs.deployment-url }}",
  ]) {
    assert.match(prePromotion, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("promotion reuses the sealed tar and is followed by corporate MFA, SEO and canonical probes", () => {
  const validation = position("Install and validate exact candidate, then discard its non-release build");
  const materialize = position("Materialize the exact bridge artifact without rebuilding");
  const promote = position("Promote the exact same single sealed artifact after every preview gate");
  const postdeploy = position("Prove corporate MFA and canonical SEO after promotion");
  const probe = position("Probe production after promotion");
  const index = position("Verify every mandatory success evidence file before upload");
  assert.ok(
    validation < materialize &&
      materialize < promote &&
      promote < postdeploy &&
      postdeploy < probe &&
      probe < index,
  );
  const validationBlock = workflow.slice(validation, materialize);
  assert.match(validationBlock, /npm run check/);
  assert.match(validationBlock, /rm -rf -- dist/);
  assert.match(validationBlock, /test ! -e dist/);
  const promotionBlock = workflow.slice(promote, postdeploy);
  assert.match(promotionBlock, /--archive \.\.\/candidate\/outputs\/g12-production-dist\.tar/);
  assert.match(promotionBlock, /--seal \.\.\/candidate\/outputs\/g12-production-dist-seal\.json/);
  assert.match(promotionBlock, /--branch main/);
  assert.doesNotMatch(workflow.slice(materialize, index), /npm run build(?::production)?\b/);
  const postdeployBlock = workflow.slice(postdeploy, probe);
  assert.match(postdeployBlock, /cms-production-postdeploy-smoke\.spec\.ts/);
  assert.match(postdeployBlock, /PLAYWRIGHT_BASE_URL: https:\/\/gaiatecsistemas\.com\.br/);
  assert.match(postdeployBlock, /QA_CMS_FIXTURE_STATE_PATH: outputs\/cms-browser-production-state\.json/);
  assert.doesNotMatch(postdeployBlock, /QA_CMS_SEALED_PREVIEW_URL/);
  assert.match(postdeploySmoke, /terminalArchivedTombstone/);
  assert.match(postdeploySmoke, /\/qa-cms-final-\(\?:gone\|missing\)-\[0-9a-f\]\{8\}/);
  assert.doesNotMatch(postdeploySmoke, /terminalArchivedTombstone\.path/);
});

test("every production browser context uses the sealed route map without a request-context bypass", () => {
  for (const { name, source } of sealedPreviewSuites) {
    assert.match(source, /serviceWorkers:\s*"block"/, `${name} must block service workers`);
    assert.match(source, /sealedPreviewRoutingEvidence\(\)/, `${name} must persist aggregate routing proof`);
    assert.doesNotMatch(source, /page\.request\.(?:get|head)\(/, `${name} bypasses the sealed route map`);
    const isolatedContexts = [...source.matchAll(/browser\.newContext\(/g)].length;
    const mappedContexts = [...source.matchAll(/await installSealedPreviewRouting\(/g)].length;
    assert.ok(
      mappedContexts >= isolatedContexts + 1,
      `${name} must map its default context and every isolated context`,
    );
  }
});

test("operator duration and recovery approval bindings remain intact", () => {
  assert.match(workflow, /PRODUCTION_OPERATOR_WINDOW_MINUTES: "525600"/);
  assert.match(workflow, /PRODUCTION_OPERATOR_REQUEST_ID: \$\{\{ github\.run_id \}\}/);
  assert.match(workflow, /--effective-at "\$\{\{ steps\.marker\.outputs\.armed_at \}\}"/);
  for (const contract of [
    /Provision an isolated production MFA actor for the sealed preview cycle[\s\S]{0,160}timeout-minutes: 10/,
    /Persist the credential-free QA cleanup state for the finalizer[\s\S]{0,160}timeout-minutes: 5/,
    /Create the complete UI-owned production fixture on the exact sealed preview[\s\S]{0,160}timeout-minutes: 55/,
    /Execute every semantic route control on the exact sealed preview[\s\S]{0,160}timeout-minutes: 25/,
    /Materialize the exact terminal production coverage matrix before promotion[\s\S]{0,160}timeout-minutes: 5/,
  ]) {
    assert.match(workflow, contract);
  }
  const leaseBoundMaximumMinutes = 10 + 5 + 55 + 25 + 15;
  assert.equal(leaseBoundMaximumMinutes, 110);
  assert.ok(leaseBoundMaximumMinutes <= 115);
});

test("the outbox canary consumes the exact cleaned private state without persisting its identifier", () => {
  assert.match(outboxCanary, /state\?\.expectedSha !== candidateSha/);
  assert.match(outboxCanary, /state\?\.status !== "cleaned"/);
  assert.match(outboxCanary, /terminalArchivedTombstone/);
  assert.match(outboxCanary, /event_type in \('publish','restore','unpublish'\)/);
  assert.doesNotMatch(outboxCanary, /state\?\.candidateSha/);
  assert.doesNotMatch(outboxCanary, /terminalArchivedTombstone\.path/);
  assert.match(outboxCanary, /--recovery-no-tombstone/);
  assert.match(outboxCanary, /state\.terminalArchivedTombstone !== null/);
});

test("terminal QA state is distinct from the recovery seed and selected fail-closed", () => {
  const seedUpload = position("Persist the credential-free QA cleanup state for the finalizer");
  const cleanup = position("Revoke the production browser actor after sealed-preview homologation");
  const terminalMaterializer = position(
    "Materialize the sanitized terminal QA state for the successful finalizer",
  );
  const terminalUpload = position("Persist the credential-free terminal QA state after successful cleanup");
  const promote = position("Promote the exact same single sealed artifact after every preview gate");
  assert.ok(
    seedUpload < cleanup &&
      cleanup < terminalMaterializer &&
      terminalMaterializer < terminalUpload &&
      terminalUpload < promote,
  );

  const seedBlock = workflow.slice(seedUpload, workflow.indexOf("\n      - name:", seedUpload + 1));
  const terminalBlock = workflow.slice(
    terminalUpload,
    workflow.indexOf("\n      - name:", terminalUpload + 1),
  );
  assert.match(
    seedBlock,
    /name: production-qa-state-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(
    terminalBlock,
    /name: production-qa-terminal-state-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(seedBlock, /path: candidate\/outputs\/cms-browser-production-state\.json/);
  assert.match(terminalBlock, /path: candidate\/outputs\/terminal-state\/cms-browser-production-state\.json/);
  for (const block of [seedBlock, terminalBlock]) {
    assert.match(block, /if-no-files-found: error/);
    assert.match(block, /retention-days: 1/);
    assert.doesNotMatch(block, /run:|tee|cat|echo/);
  }
  assert.match(terminalStateMaterializer, /const OUTPUT_KEYS = Object\.freeze/);
  assert.match(terminalStateMaterializer, /flag: "wx"/);
  assert.doesNotMatch(terminalStateMaterializer, /leadCampaignPath:\s*value|documentIds:\s*value/);

  const terminalDownload = position(
    "Download the credential-free terminal QA state for a successful release",
  );
  const seedDownload = position(
    "Download the credential-free seed QA state only for failed-release compensation",
  );
  const selection = position("Fail closed on an absent or ambiguous QA state selection");
  assert.ok(terminalDownload < seedDownload && seedDownload < selection);
  const selectionBlock = workflow.slice(selection, workflow.indexOf("\n      - name:", selection + 1));
  assert.match(selectionBlock, /DEPLOY_RESULT: \$\{\{ needs\.deploy\.result \}\}/);
  assert.match(selectionBlock, /test "\$TERMINAL_STATE_OUTCOME" = success/);
  assert.match(selectionBlock, /test "\$SEED_STATE_OUTCOME" = skipped/);
  assert.match(selectionBlock, /test "\$TERMINAL_STATE_OUTCOME" = skipped/);
  assert.match(selectionBlock, /test "\$SEED_STATE_OUTCOME" = success/);

  assert.match(watchdogWorkflow, /github\.event\.workflow_run\.conclusion != 'success'/);
  assert.match(
    watchdogWorkflow,
    /Download the credential-free seed QA state for failed-release compensation[\s\S]*name: production-qa-state-/,
  );
  assert.match(watchdogWorkflow, /test "\$SOURCE_CONCLUSION" != success/);
  assert.match(watchdogWorkflow, /test "\$SEED_STATE_OUTCOME" = success/);
  assert.match(watchdogWorkflow, /verify-production-outbox-canary\.mjs\s+--recovery-no-tombstone\s+--state/);
  assert.match(
    watchdogWorkflow,
    /verify-production-residue\.mjs[\s\S]{0,180}--recovery-no-tombstone[\s\S]{0,180}--state/,
  );
  assert.doesNotMatch(watchdogWorkflow, /production-qa-terminal-state-/);

  const primaryOutbox = workflow.slice(
    position("Prove the sealed-preview publication outbox and cache invalidation converged"),
    position("Recheck zero active synthetic residue against production"),
  );
  assert.doesNotMatch(primaryOutbox, /--recovery-no-tombstone/);
  const finalizerOutbox = workflow.slice(
    position("Prove terminal outbox/cache state with the real synthetic cycle"),
    position("Prove zero terminal synthetic residue"),
  );
  assert.match(finalizerOutbox, /if \[ "\$\{\{ needs\.deploy\.result \}\}" != success \]/);
  assert.match(finalizerOutbox, /recovery_args=\(--recovery-no-tombstone\)/);
  assert.match(finalizerOutbox, /--state \.\.\/candidate\/outputs\/cms-browser-production-state\.json/);
});
