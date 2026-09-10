import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import worker, { contentSecurityPolicy } from "../../../cloudflare/_worker.js";
import {
  approvalRecordFilenameMatchesCandidate,
  buildPinnedDpoEvidenceReference,
  CANONICAL_DOCUMENTATION_SHA,
  CANONICAL_DPO_EVIDENCE_REFERENCE,
  canonicalTextSha256,
  CSP_CANARY_ROUTES,
  evaluateCodeOwners,
  evaluateGithubControls,
  evaluateProbeWindow,
  evaluateRolloutAdvance,
  evaluateRolloutWindow,
  HISTORICAL_DPO_EVIDENCE_REFERENCE,
  HISTORICAL_G16_CSP_CANDIDATE_SHA,
  HISTORICAL_G16_CSP_EVIDENCE_REFERENCE,
  HISTORICAL_G16_CSP_EVIDENCE_SHA256,
  resolveCspEvidenceBinding,
  resolveCspEvidenceRepositoryPath,
  resolveDpoEvidenceReference,
  retryStrictBoundaryWindow,
  selectLatestCiWorkflowRun,
  resolveG12EvidenceRepositoryPath,
  validateApprovalRecord,
  validateCanaryEvidenceBinding,
  validateCspEvidenceBinding,
  validateHealthContract,
  validateProductionConfig,
  validateReleaseManifest,
} from "./release-guard-lib.mjs";
import {
  evaluateFunctionInventory,
  productionCloudflareApprovalTarget,
  PRODUCTION_FUNCTIONS,
  PUBLIC_FUNCTIONS,
  validateProductionBackendConfig,
} from "./production-backend-lib.mjs";
import { PRODUCTION_RELEASE_EVIDENCE_PATHS } from "./production-release-evidence-lib.mjs";
import { stagingReconcileDecision } from "./staging-pages-state.mjs";

const read = (path) => readFile(path, "utf8");
const sha = "a".repeat(40);
const cspPolicySha256 = createHash("sha256").update(contentSecurityPolicy()).digest("hex");
const cspAdminPolicySha256 = createHash("sha256").update(contentSecurityPolicy("/admin")).digest("hex");

test("production function inventory exactly matches the source directories in canonical order", async () => {
  const sourceFunctions = (await readdir("supabase/functions", { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();

  assert.deepEqual(PRODUCTION_FUNCTIONS, sourceFunctions);
});

test("text evidence digest is stable across Git and Windows line endings", () => {
  const lf = Buffer.from('{"gate":"G12"}\n{"decision":"approved"}\n', "utf8");
  const crlf = Buffer.from('{"gate":"G12"}\r\n{"decision":"approved"}\r\n', "utf8");
  assert.equal(canonicalTextSha256(lf), canonicalTextSha256(crlf));
});

test("DPO evidence resolves only the exact legacy id or the trusted SHA-pinned canonical URL", () => {
  const documentationSha = "b".repeat(40);
  const canonicalReference = buildPinnedDpoEvidenceReference(documentationSha);
  assert.equal(
    canonicalReference,
    `https://github.com/Vnd93/gaiatec-documentacao/blob/${documentationSha}/docs/80-evolucao/ev2/fase-16/registro-declaracao-governanca-dpo-risco-2026-09-06.md`,
  );
  assert.equal(
    resolveDpoEvidenceReference(HISTORICAL_DPO_EVIDENCE_REFERENCE, {
      documentationSha,
      candidateSha: HISTORICAL_G16_CSP_CANDIDATE_SHA,
    }),
    canonicalReference,
  );
  assert.equal(
    resolveDpoEvidenceReference(HISTORICAL_DPO_EVIDENCE_REFERENCE, {
      documentationSha,
      candidateSha: sha,
    }),
    null,
  );
  assert.equal(resolveDpoEvidenceReference(canonicalReference, { documentationSha }), canonicalReference);
  for (const invalidReference of [
    canonicalReference.replace(`/blob/${documentationSha}/`, "/blob/main/"),
    canonicalReference.replace(documentationSha, "c".repeat(40)),
    canonicalReference.replace("github.com/Vnd93", "github.com/another-owner"),
    `${canonicalReference}?raw=1`,
    "docs/ev2/fase-16/registro_declaracao_governanca_dpo_risco_2026-09-05.md",
  ])
    assert.equal(resolveDpoEvidenceReference(invalidReference, { documentationSha }), null, invalidReference);
  assert.equal(buildPinnedDpoEvidenceReference("not-a-full-sha"), null);
  assert.equal(
    CANONICAL_DPO_EVIDENCE_REFERENCE,
    buildPinnedDpoEvidenceReference(CANONICAL_DOCUMENTATION_SHA),
  );
  assert.equal(
    resolveDpoEvidenceReference(HISTORICAL_DPO_EVIDENCE_REFERENCE, {
      candidateSha: HISTORICAL_G16_CSP_CANDIDATE_SHA,
    }),
    CANONICAL_DPO_EVIDENCE_REFERENCE,
  );
  assert.equal(
    resolveDpoEvidenceReference(CANONICAL_DPO_EVIDENCE_REFERENCE),
    CANONICAL_DPO_EVIDENCE_REFERENCE,
  );
});

test("production workflow binds manifest identity and runs full preview without rewriting content", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");
  const bridge = await read(".github/workflows/promote-production-frontend-bridge.yml");
  assert.match(bridge, /env -u GITHUB_SHA npm run artifact:manifest/);
  assert.match(bridge, /VITE_RELEASE: \$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(workflow, /Materialize the exact bridge artifact without rebuilding/);
  assert.doesNotMatch(workflow, /npm run build(?::production)?\b/);
  assert.match(workflow, /EV2_G12_PROBE_PROFILE: technical/);
  assert.doesNotMatch(workflow, /GAIATEC_SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(workflow, /projects api-keys.*--reveal/);
  assert.doesNotMatch(workflow, /publish-staging-clean-room-pages\.mjs/);
  assert.doesNotMatch(workflow, /configure-staging-forms\.mjs/);
  assert.match(workflow, /EV2_G12_PROBE_PROFILE: full/);
  assert.ok(
    workflow.indexOf("verify-production-database.mjs") < workflow.indexOf("EV2_G12_PROBE_PROFILE: full"),
  );
  assert.ok(
    workflow.indexOf("EV2_G12_PROBE_PROFILE: full") <
      workflow.indexOf("Promote the exact same single sealed artifact"),
  );
  assert.match(workflow, /Install the isolated browser before any production mutation/);
  assert.match(workflow, /scripts\/qa\/cms-browser-fixture\.mjs setup/);
  assert.match(workflow, /scripts\/qa\/cms-browser-fixture\.mjs cleanup/);
  assert.match(workflow, /QA_CMS_TARGET_ENVIRONMENT: production/);
  assert.match(workflow, /QA_CMS_PRODUCTION_AUTHORIZATION: \$\{\{ inputs\.confirmation \}\}/);
  assert.match(workflow, /--workers=1 --retries=0 --grep @mutating/);
  assert.match(workflow, /if: always\(\) && steps\.production_browser_fixture\.outcome != 'skipped'/);
  const uiBootstrap = workflow.indexOf(
    "Create the complete UI-owned production fixture on the exact sealed preview",
  );
  const semantic = workflow.indexOf("Execute every semantic route control on the exact sealed preview");
  const terminal = workflow.indexOf(
    "Materialize the exact terminal production coverage matrix before promotion",
  );
  const cleanup = workflow.indexOf("Revoke the production browser actor after sealed-preview homologation");
  const residue = workflow.indexOf("Recheck zero active synthetic residue against production");
  const promote = workflow.indexOf("Promote the exact same single sealed artifact after every preview gate");
  assert.ok(uiBootstrap >= 0 && uiBootstrap < semantic);
  assert.ok(semantic < cleanup && cleanup < residue && residue < terminal && terminal < promote);
  assert.ok(promote < workflow.indexOf("Probe production after promotion"));
  assert.match(workflow, /--grep @ui-bootstrap/);
  assert.match(workflow, /--grep @semantic/);
  assert.match(workflow, /--grep @security-production/);
  assert.match(workflow, /cms-terminal-coverage-matrix-production\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-final-coverage-production\.json/);
  assert.match(workflow, /QA_CMS_FIXTURE_STATE_PATH: outputs\/cms-browser-production-state\.json/);
  assert.equal((workflow.match(/git status --porcelain --untracked-files=all/g) ?? []).length, 2);
  assert.match(workflow, /id: production_browser_cleanup/);
  assert.match(workflow, /Retry production browser cleanup after rollback and backend recovery/);
  assert.match(workflow, /steps\.production_browser_cleanup\.outcome == 'failure'/);
  assert.match(workflow, /cms-browser-production-cleanup-retry\.json/);
  assert.doesNotMatch(workflow, /candidate\/g12-backend-compatibility\.json/);
});

test("production dispatch authorization cannot skip into a green finalizer", async () => {
  const workflow = await read(".github/workflows/deploy-production.yml");
  const deployHeader = workflow.slice(workflow.indexOf("  deploy:"), workflow.indexOf("    steps:"));
  const authorizationGate = workflow.indexOf(
    "Validate production dispatch authorization before any mutation",
  );
  const firstCheckout = workflow.indexOf("Checkout release controls from main");
  const skippedGate = workflow.indexOf("Fail closed when the production deploy job was skipped");

  assert.doesNotMatch(deployHeader, /\n {4}if:/);
  assert.ok(authorizationGate >= 0 && authorizationGate < firstCheckout);
  assert.match(workflow, /test "\$DISPATCH_REF" = refs\/heads\/main/);
  assert.match(workflow, /grep -E '\^\[a-f0-9\]\{40\}\$'/);
  assert.match(workflow, /test "\$PRODUCTION_AUTHORIZATION" = "AUTORIZO-G12-PRODUCAO:\$CANDIDATE_SHA"/);
  assert.ok(skippedGate > workflow.indexOf("  finalize:"));
  assert.match(workflow, /if: always\(\) && needs\.deploy\.result == 'skipped'/);
  assert.match(workflow.slice(skippedGate), /G12_PRODUCTION_DEPLOY_SKIPPED[\s\S]*exit 1/);
});

test("manual production rollback is age-bound, independently finalized and backend-sealed", async () => {
  const workflow = await read(".github/workflows/rollback-production.yml");
  const prepareHeader = workflow.slice(workflow.indexOf("  prepare:"), workflow.indexOf("    steps:"));
  const authorizationGate = workflow.indexOf(
    "Validate production rollback dispatch authorization before any external request",
  );
  const firstCheckout = workflow.indexOf("Checkout current release controls");
  const stepBlock = (id) => {
    const start = workflow.indexOf(`id: ${id}`);
    const end = workflow.indexOf("\n      - ", start);
    return workflow.slice(start, end < 0 ? workflow.length : end);
  };
  const capture = workflow.indexOf("Capture the exact canonical production deployment before mutation");
  const persist = workflow.indexOf("Validate target chronology and persist immutable pre-mutation state");
  const handoff = workflow.indexOf("Upload mandatory original state before mutation");
  const recheck = workflow.indexOf("Reconfirm the canonical deployment immediately before mutation");
  const mutation = workflow.indexOf("Restore exact prior production Pages deployment");
  const targetBackend = workflow.indexOf(
    "Repeat immutable retained backend evidence after target activation",
  );
  const targetGate = workflow.indexOf("Evaluate the target rollback and its evidence");
  const finalizer = workflow.indexOf("  finalize:");
  const finalizerCanonical = workflow.indexOf("Observe canonical production before compensation decision");
  const earlyCompensation = workflow.indexOf(
    "Immediately compensate an unvalidated target before backend tooling",
  );
  const finalizerBackendCheckout = workflow.indexOf(
    "Checkout exact forward-compatible backend for independent finalization",
  );
  const compensation = workflow.indexOf(
    "Restore the exact original production deployment after target failure",
  );
  const finalTargetBackend = workflow.indexOf("Repeat immutable backend evidence before finalizer decision");
  const compensationBackend = workflow.indexOf("Repeat immutable backend evidence after compensation");
  const finalUpload = workflow.indexOf("Upload compensation evidence before reporting failure");
  const terminalRecheck = workflow.indexOf("Recheck canonical production immediately before terminal gate");
  const finalReport = workflow.indexOf("Report target failure and compensation outcome");

  assert.doesNotMatch(prepareHeader, /\n {4}if:/);
  assert.ok(authorizationGate >= 0 && authorizationGate < firstCheckout);
  assert.match(workflow, /DISPATCH_REF: \$\{\{ github\.ref \}\}/);
  assert.match(
    workflow,
    /ROLLBACK-G12-PRODUCTION:\$EXPECTED_RELEASE:\$DEPLOYMENT_ID:\$FORWARD_BACKEND_RELEASE:\$FORWARD_BACKEND_RUN_ID/,
  );
  assert.match(workflow, /\^\[a-f0-9\]\{40\}\$/);
  assert.match(workflow, /forward_backend_run_id must be a positive Actions run ID/);
  assert.ok(capture >= 0 && capture < persist && persist < handoff);
  assert.ok(handoff < recheck && recheck < mutation);
  assert.ok(mutation < targetBackend && targetBackend < targetGate && targetGate < finalizer);
  assert.ok(
    finalizer < finalizerCanonical &&
      finalizerCanonical < earlyCompensation &&
      earlyCompensation < finalizerBackendCheckout,
  );
  assert.ok(finalizer < finalTargetBackend && finalTargetBackend < compensation);
  assert.ok(compensation < compensationBackend && compensationBackend < finalUpload);
  assert.ok(finalUpload < terminalRecheck && terminalRecheck < finalReport);
  assert.match(
    workflow,
    / {2}finalize:\n {4}needs: \[prepare, rollback\]\n {4}if: always\(\) && needs\.prepare\.result == 'success'/,
  );
  assert.equal((workflow.match(/cloudflare-pages\.mjs rollback/g) ?? []).length, 4);
  assert.equal((workflow.match(/verify-production-backend-evidence\.mjs/g) ?? []).length, 4);
  assert.equal((workflow.match(/supabase functions list/g) ?? []).length, 4);
  assert.doesNotMatch(workflow, /run: node scripts\/ev2\/phase12\/cloudflare-pages\.mjs/);
  assert.match(workflow, /timeout 4m node scripts\/ev2\/phase12\/cloudflare-pages\.mjs rollback/);
  assert.match(
    workflow,
    /name: production-rollback-state-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(workflow, /handoff\/rollback-production-state\.json/);
  assert.match(workflow, /if-no-files-found: error/);

  assert.match(workflow, /git merge-base --is-ancestor "\$TARGET_RELEASE" "\$ORIGINAL_RELEASE"/);
  assert.match(workflow, /git merge-base --is-ancestor "\$ORIGINAL_RELEASE" "\$FORWARD_BACKEND_RELEASE"/);
  assert.match(workflow, /targetCreated > originalCreated/);
  assert.match(workflow, /G12_ROLLBACK_TARGET_IS_NOT_PRIOR/);
  assert.match(workflow, /createdOn: original\.created_on/);
  assert.match(workflow, /createdOn: target\.created_on/);

  for (const id of [
    "original_production",
    "original_recheck",
    "restore_target",
    "target_backend_evidence",
    "target_frontend_probe",
    "target_boundary_probe",
    "target_canonical",
    "seal_target_evidence",
    "target_evidence_upload",
    "target_gate",
    "finalizer_initial_canonical",
    "early_restore_original",
    "finalizer_backend_checkout",
    "finalizer_supabase_cli",
    "final_target_backend_evidence",
    "finalizer_mode",
    "restore_original",
    "restore_original_retry",
    "compensation_canonical",
    "compensation_frontend_probe",
    "compensation_boundary_probe",
    "compensation_backend_evidence",
    "seal_compensation_evidence",
    "compensation_evidence_upload",
    "terminal_canonical",
  ]) {
    assert.match(workflow, new RegExp(`id: ${id}`));
  }
  for (const id of [
    "restore_target",
    "target_backend_evidence",
    "target_frontend_probe",
    "target_boundary_probe",
    "target_canonical",
    "seal_target_evidence",
    "target_evidence_upload",
    "finalizer_initial_canonical",
    "early_restore_original",
    "finalizer_backend_checkout",
    "finalizer_supabase_cli",
    "final_target_backend_evidence",
    "restore_original",
    "restore_original_retry",
    "compensation_canonical",
    "compensation_frontend_probe",
    "compensation_boundary_probe",
    "compensation_backend_evidence",
    "seal_compensation_evidence",
    "compensation_evidence_upload",
    "terminal_canonical",
  ]) {
    assert.match(stepBlock(id), /continue-on-error: true/);
  }
  assert.match(stepBlock("restore_original"), /needs\.rollback\.result != 'success'/);
  assert.match(stepBlock("restore_original"), /steps\.final_target_backend_evidence\.outcome != 'success'/);
  assert.match(stepBlock("restore_original"), /steps\.finalizer_mode\.outputs\.mode != 'target'/);
  assert.match(stepBlock("early_restore_original"), /needs\.rollback\.result != 'success'/);
  assert.match(stepBlock("early_restore_original"), /unresolved-owned-target/);
  assert.match(stepBlock("early_restore_original"), /external-conflict/);
  assert.match(stepBlock("restore_original"), /OWNED_TARGET_DEPLOYMENT/);
  assert.match(stepBlock("restore_original"), /action=already-original/);
  assert.match(stepBlock("restore_original"), /action=restore-original/);
  assert.match(stepBlock("restore_original"), /action=external-conflict/);
  assert.match(stepBlock("restore_original"), /\[ "\$current_deployment" = "\$OWNED_TARGET_DEPLOYMENT" \]/);
  assert.match(stepBlock("restore_original"), /\[ "\$current_release" = "\$OWNED_TARGET_RELEASE" \]/);
  assert.match(
    stepBlock("restore_original_retry"),
    /if: always\(\) && steps\.restore_original\.outcome == 'failure'/,
  );
  assert.match(stepBlock("restore_original_retry"), /action=confirmed-original/);
  assert.match(stepBlock("restore_original_retry"), /action=retry-restore-original/);
  assert.match(stepBlock("restore_original_retry"), /action=external-conflict/);
  assert.match(workflow, /mode=external_conflict/);
  assert.match(workflow, /G12_PRODUCTION_ROLLBACK_EXTERNAL_DEPLOYMENT/);
  assert.match(workflow, /external deployment was not overwritten/);

  assert.match(workflow, /buildProductionRollbackEvidenceBundle/);
  assert.match(workflow, /manifestSha256: evidence\.files\.manifest\.sha256/);
  assert.match(workflow, /functionsSha256: evidence\.files\.functions\.sha256/);
  assert.match(workflow, /databaseSha256: evidence\.files\.database\.sha256/);
  assert.match(workflow, /schemaVersion: 3/);
  assert.match(workflow, /materialize-production-rollback-evidence\.mjs/g);
  assert.match(workflow, /recovered-backend-evidence\/manifest\.json/);
  assert.match(workflow, /EXPECTED_MANIFEST_SHA256/);
  assert.match(workflow, /EXPECTED_FUNCTIONS_SHA256/);
  assert.match(workflow, /EXPECTED_DATABASE_SHA256/);
  assert.match(workflow, /state_release.*FORWARD_BACKEND_RELEASE/);
  assert.match(workflow, /state_run_id.*FORWARD_BACKEND_RUN_ID/);
  assert.match(workflow, /FINAL_TARGET_BACKEND_EVIDENCE_OUTCOME/);
  assert.match(workflow, /COMPENSATION_BACKEND_EVIDENCE_OUTCOME/);
  assert.match(workflow, /g12-production-rollback-compensation-boundary\.json/);
  assert.match(workflow, /g12-production-rollback-compensation-probe\.json/);
  assert.match(workflow, /G12_PRODUCTION_ROLLBACK_TARGET_FAILED_COMPENSATED/);
  assert.match(workflow, /sensitiveValuesLogged: false/);
  assert.doesNotMatch(
    workflow.slice(
      workflow.indexOf("Seal non-sensitive target outcome evidence"),
      workflow.indexOf("Upload target rollback evidence before deciding success"),
    ),
    /secrets\./,
  );
  assert.doesNotMatch(
    workflow.slice(workflow.indexOf("Seal non-sensitive compensation evidence"), finalUpload),
    /secrets\./,
  );
});

test("production rollback watchdog compensates failed, timed-out and cancelled runs idempotently", async () => {
  const workflow = await read(".github/workflows/rollback-production-watchdog.yml");
  const reconcileStart = workflow.indexOf(
    "Reconcile incomplete rollback without overwriting external production",
  );
  const retryStart = workflow.indexOf("Retry an ambiguous watchdog compensation safely");
  const backendCheckoutStart = workflow.indexOf(
    "Checkout exact retained backend after watchdog reconciliation",
  );
  const backendStart = workflow.indexOf("Repeat immutable backend evidence after watchdog compensation");
  const terminalStart = workflow.indexOf("Recheck canonical production immediately before watchdog gate");
  const gateStart = workflow.indexOf("Enforce incomplete rollback compensation");

  assert.match(workflow, /workflow_run:\n {4}workflows: \["Rollback production"\]\n {4}types: \[completed\]/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'cancelled'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'timed_out'/);
  assert.doesNotMatch(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /github\.event\.workflow_run\.event == 'workflow_dispatch'/);
  assert.match(workflow, /github\.event\.workflow_run\.head_branch == 'main'/);
  assert.match(
    workflow,
    /github\.event\.workflow_run\.path == '\.github\/workflows\/rollback-production\.yml'/,
  );
  assert.match(workflow, /github\.event\.workflow_run\.head_repository\.full_name == github\.repository/);
  assert.match(workflow, /concurrency:\n {2}group: production\n {2}cancel-in-progress: false/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(
    workflow,
    /name: production-rollback-state-\$\{\{ github\.event\.workflow_run\.id \}\}-\$\{\{ github\.event\.workflow_run\.run_attempt \}\}/,
  );
  assert.match(workflow, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(workflow, /G12_ROLLBACK_WATCHDOG_HANDOFF_REJECTED/);
  assert.match(workflow, /\["cancelled", "failure", "timed_out"\]/);
  assert.match(workflow, /targetCreated > originalCreated/);
  assert.match(workflow, /git merge-base --is-ancestor "\$target_release" "\$original_release"/);
  assert.match(workflow, /git merge-base --is-ancestor "\$original_release" "\$forward_release"/);
  assert.match(
    workflow,
    /git merge-base --is-ancestor "\$forward_release" "\$\{\{ github\.event\.workflow_run\.head_sha \}\}"/,
  );

  assert.ok(
    reconcileStart >= 0 &&
      reconcileStart < retryStart &&
      retryStart < backendCheckoutStart &&
      backendCheckoutStart < backendStart,
  );
  assert.ok(backendStart < terminalStart && terminalStart < gateStart);
  assert.equal((workflow.match(/cloudflare-pages\.mjs rollback/g) ?? []).length, 2);
  assert.equal((workflow.match(/verify-production-backend-evidence\.mjs/g) ?? []).length, 1);
  assert.equal((workflow.match(/supabase functions list/g) ?? []).length, 1);
  assert.match(workflow, /action=already-original/);
  assert.match(workflow, /action=restore-original/);
  assert.match(workflow, /action=confirmed-original/);
  assert.match(workflow, /action=retry-restore-original/);
  assert.equal((workflow.match(/action=external-conflict/g) ?? []).length, 2);
  assert.equal(
    (workflow.match(/\[ "\$current_deployment" = "\$OWNED_TARGET_DEPLOYMENT" \]/g) ?? []).length,
    2,
  );
  assert.equal((workflow.match(/\[ "\$current_release" = "\$OWNED_TARGET_RELEASE" \]/g) ?? []).length, 2);
  assert.match(workflow, /if: always\(\) && steps\.watchdog_reconcile\.outcome == 'failure'/);
  assert.match(workflow, /id: watchdog_backend_checkout/);
  assert.match(workflow, /id: watchdog_supabase_cli/);
  assert.match(workflow, /test "\$BACKEND_CHECKOUT_OUTCOME" = success/);
  assert.match(workflow, /test "\$SUPABASE_CLI_OUTCOME" = success/);
  assert.match(workflow, /G12_PRODUCTION_ROLLBACK_EXTERNAL_DEPLOYMENT/);
  assert.match(workflow, /watchdog retry preserved the external canonical deployment/);
  assert.match(workflow, /g12-production-rollback-watchdog-backend-evidence\.json/);
  assert.match(workflow, /FINAL_BACKEND_EVIDENCE_OUTCOME|BACKEND_OUTCOME/);
  assert.match(workflow, /EXPECTED_MANIFEST_SHA256/);
  assert.match(workflow, /EXPECTED_FUNCTIONS_SHA256/);
  assert.match(workflow, /EXPECTED_DATABASE_SHA256/);
  assert.match(workflow, /TERMINAL_DEPLOYMENT.*ORIGINAL_DEPLOYMENT/s);
  assert.match(workflow, /TERMINAL_RELEASE.*ORIGINAL_RELEASE/s);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /sensitiveValuesLogged: false/);
  assert.doesNotMatch(workflow, /run: node scripts\/ev2\/phase12\/cloudflare-pages\.mjs/);
});

test("staging workflow exercises the exact-SHA governed lifecycle with disposable fixtures", async () => {
  const workflow = await read(".github/workflows/deploy-staging.yml");
  assert.match(workflow, /concurrency:\s+group: staging\s+cancel-in-progress: false/);
  assert.match(workflow, /--branch ev2-g12-canary/);
  assert.match(workflow, /canary:ev2:phase12/);
  assert.match(workflow, /--branch ev2-g16-csp-canary/);
  assert.match(workflow, /canary:ev2:phase16:csp/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /tests\/e2e\/products-catalog\.spec\.ts/);
  assert.match(workflow, /tests\/e2e\/routes-and-a11y\.spec\.ts/);
  assert.match(workflow, /scripts\/qa\/cms-browser-fixture\.mjs setup/);
  assert.match(workflow, /scripts\/qa\/cms-browser-fixture\.mjs cleanup/);
  assert.match(workflow, /scripts\/qa\/cms-browser-fixture\.mjs residue/);
  assert.match(workflow, /QA_CMS_TARGET_ENVIRONMENT: staging/);
  assert.match(workflow, /--workers=1 --retries=0 --grep @ui-bootstrap/);
  assert.match(workflow, /--workers=1 --retries=0 --grep @semantic/);
  // One independently leased actor proves the retained rollback frontend. One
  // exact-candidate actor then owns bootstrap, all mutating suites, the semantic
  // traversal and terminal cleanup/residue under the same SHA/runTag.
  assert.equal((workflow.match(/cms-browser-fixture\.mjs setup/g) ?? []).length, 2);
  assert.equal((workflow.match(/cms-browser-fixture\.mjs cleanup/g) ?? []).length, 4);
  assert.equal((workflow.match(/cms-browser-fixture\.mjs residue/g) ?? []).length, 1);
  assert.ok(
    workflow.indexOf("Run the complete authenticated mutating editorial cycle first") <
      workflow.indexOf("Traverse every authenticated route, menu and required viewport on the same lease"),
  );
  assert.ok(
    workflow.indexOf("Traverse every authenticated route, menu and required viewport on the same lease") <
      workflow.indexOf("Revoke the mutating browser actor and verify zero active residue"),
  );
  assert.ok(
    workflow.indexOf("Revoke the mutating browser actor and verify zero active residue") <
      workflow.indexOf("Prove terminal zero residue for the same isolated browser lease"),
  );
  assert.ok(
    workflow.indexOf("Prove terminal zero residue for the same isolated browser lease") <
      workflow.indexOf("Materialize fail-closed terminal CMS coverage from the single bound run"),
  );
  assert.match(workflow, /scripts\/phase7\/staging-roundtrip\.mjs/);
  assert.match(workflow, /GAIATEC_EXPECTED_SHA: \$\{\{ steps\.candidate\.outputs\.sha \}\}/);
  assert.match(workflow, /QA-CMS-FINAL-\$\{qa_date\}-\$\{GAIATEC_EXPECTED_SHA:0:8\}/);
  assert.ok(
    workflow.indexOf("rollout-probe.mjs") < workflow.indexOf("staging-roundtrip.mjs"),
    "the immutable shell must pass its probe before the synthetic lifecycle starts",
  );
  assert.match(workflow, /g12-staging-lifecycle\.json/);
  assert.match(workflow, /^\s+g12-canary\.json$/m);
  assert.match(workflow, /^\s+g16-csp-browser\.json$/m);
  assert.match(workflow, /candidate\/outputs\/cms-final-coverage\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-auth-lifecycle\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-admin-ops-cycles\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-secondary-ui-cycles\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-security-boundaries\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-ui-created-state\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-browser-mutating-residue\.json/);
  assert.match(workflow, /candidate\/outputs\/cms-terminal-coverage-matrix\.json/);
  assert.match(workflow, /candidate\/outputs\/g12-cms-coverage-matrix\.json/);
  assert.match(workflow, /CMS_RELEASE_SHA="\$\{\{ steps\.candidate\.outputs\.sha \}\}"/);
  const mutatingAuth = workflow.indexOf("cms-auth-lifecycle.spec.ts");
  const uiBootstrap = workflow.indexOf("cms-final-coverage.spec.ts", mutatingAuth);
  const adminOps = workflow.indexOf("cms-admin-ops-cycles.spec.ts", uiBootstrap);
  const secondaryUi = workflow.indexOf("cms-secondary-ui-cycles.spec.ts", adminOps);
  const securityBoundaries = workflow.indexOf("cms-security-boundaries.spec.ts", secondaryUi);
  assert.ok(mutatingAuth >= 0 && mutatingAuth < uiBootstrap);
  assert.ok(uiBootstrap < adminOps && adminOps < secondaryUi && secondaryUi < securityBoundaries);
  assert.match(workflow, /QA_CMS_FIXTURE_STATE_PATH: outputs\/cms-browser-mutating-state\.json/);
  assert.doesNotMatch(workflow, /QA_CMS_FIXTURE_STATE_PATH: outputs\/cms-browser-routes-state\.json/);
  assert.doesNotMatch(workflow, /QA_CMS_(?:FIXTURE_STATE|FIXTURE_REPORT|REPORT)_PATH: test-results\//);
  assert.match(workflow, /Upload mandatory pre-mutation staging state/);
  assert.match(
    workflow,
    /name: staging-deploy-state-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.ok(
    workflow.indexOf("Upload mandatory pre-mutation staging state") <
      workflow.indexOf("Apply the exact candidate migrations to staging"),
  );
  assert.match(workflow, /Upload mandatory sealed staging recovery artifact/);
  assert.match(workflow, /Upload mandatory immutable staging candidate artifact/);
  const candidateUploadStart = workflow.indexOf("Upload mandatory immutable staging candidate artifact");
  const candidateUploadEnd = workflow.indexOf(
    "Revalidate the immutable staging candidate",
    candidateUploadStart,
  );
  const candidateUpload = workflow.slice(candidateUploadStart, candidateUploadEnd);
  assert.match(candidateUpload, /candidate\/outputs\/staging-candidate-dist\.tar/);
  assert.match(candidateUpload, /candidate\/outputs\/staging-candidate-dist-seal\.json/);
  assert.doesNotMatch(candidateUpload, /candidate\/dist/);
  assert.ok(
    workflow.indexOf("Upload mandatory sealed staging recovery artifact") <
      workflow.indexOf("Deploy the immutable staging candidate"),
  );
  assert.ok(
    workflow.indexOf("Upload mandatory immutable staging candidate artifact") <
      workflow.indexOf("Deploy the immutable staging candidate"),
  );
  assert.match(workflow, /--commit-message "\$\{\{ steps\.staging_state\.outputs\.run_marker \}\}"/);
  assert.match(workflow, /needs: deploy\s+if: always\(\)/);
  assert.match(workflow, /staging-pages-state\.mjs compensate/);
  assert.match(workflow, /staging-pages-state\.mjs assert-owned/);
  assert.match(workflow, /staging-pages-state\.mjs assert-original/);
  assert.doesNotMatch(workflow, /if: failure\(\) && steps\.deploy\.outcome == 'success'/);
  assert.match(workflow, /--branch ev2-g17-canary/);
  assert.match(workflow, /staging-candidate-dist-seal\.json/);
  assert.ok((workflow.match(/verify-production-dist-seal\.mjs/g) ?? []).length >= 5);
  assert.match(workflow, /STATE_ARTIFACT_DIGEST/);
  assert.match(workflow, /CANDIDATE_ARTIFACT_DIGEST/);
  assert.match(workflow, /staging-artifact-bindings\.json/);
  assert.doesNotMatch(workflow, /if-no-files-found: warn/);
  assert.match(workflow, /Prove the live staging alias matches the approved rollback SHA/);
  assert.match(workflow, /g12-staging-live-baseline\.json/);
  assert.ok(
    workflow.indexOf("Prove the live staging alias matches the approved rollback SHA") <
      workflow.indexOf("Apply the exact candidate migrations to staging"),
  );
  assert.match(workflow, /Configure the exact staging browser origins without wildcard trust/);
  assert.match(workflow, /CONTACT_CAPTCHA_ALWAYS=true/);
  assert.match(workflow, /TURNSTILE_EXPECTED_ACTION=lead_capture/);
  assert.match(workflow, /ev2-g17-canary\.gaiatec-cms-staging\.pages\.dev/);
  assert.match(workflow, /ev2-g12-canary\.gaiatec-cms-staging\.pages\.dev/);
  assert.match(workflow, /ev2-g16-csp-canary\.gaiatec-cms-staging\.pages\.dev/);
  assert.doesNotMatch(workflow, /ALLOWED_ORIGINS[^\n]*\*/);
  assert.doesNotMatch(workflow, /candidate\/g12-(?:canary|backend-compatibility|cms-coverage-matrix)\.json/);
  assert.doesNotMatch(workflow, /candidate\/g16-csp-browser\.json/);
  assert.equal((workflow.match(/git status --porcelain --untracked-files=all/g) ?? []).length, 3);
  assert.match(workflow, /id: browser_mutating_cleanup/);
  assert.doesNotMatch(workflow, /id: browser_routes_cleanup/);
  assert.match(workflow, /Retry cleanup for the same isolated browser lease/);
  assert.doesNotMatch(workflow, /cms-browser-(?:mutating|routes)-cleanup-retry\.json/);
  assert.match(workflow, /materialize-cms-terminal-coverage\.mjs/);
  const forwardStart = workflow.indexOf(
    "Prove legacy-shaped and hybrid envelopes fail closed against the exact candidate",
  );
  const forwardEnd = workflow.indexOf("\n      - name:", forwardStart + 1);
  const forwardBlock = workflow.slice(forwardStart, forwardEnd);
  assert.ok(workflow.indexOf('wait "$real_browser_consumer_pid"') < forwardStart);
  assert.match(
    forwardBlock,
    /--deployment-id "\$\{\{ steps\.staging_owned_deployment\.outputs\.deployment_id \}\}"/,
  );
  assert.match(
    forwardBlock,
    /QA_CMS_FORWARD_DEPLOYMENT_ID: \$\{\{ steps\.staging_owned_deployment\.outputs\.deployment_id \}\}/,
  );
  assert.match(forwardBlock, /QA_CMS_EXPECTED_SHA: \$\{\{ steps\.candidate\.outputs\.sha \}\}/);
  assert.match(
    forwardBlock,
    /PLAYWRIGHT_BASE_URL: https:\/\/ev2-g17-canary\.gaiatec-cms-staging\.pages\.dev/,
  );
});

test("staging watchdog compensates cancelled, timed-out and ambiguous deploys without external overwrite", async () => {
  const [workflow, watchdog, pagesState, fixture] = await Promise.all([
    read(".github/workflows/deploy-staging.yml"),
    read(".github/workflows/deploy-staging-watchdog.yml"),
    read("scripts/ev2/phase12/staging-pages-state.mjs"),
    read("scripts/qa/cms-browser-fixture.mjs"),
  ]);
  assert.match(watchdog, /workflow_run:\s+workflows: \["Deploy staging"\]\s+types: \[completed\]/);
  assert.match(watchdog, /github\.event\.workflow_run\.conclusion == 'cancelled'/);
  assert.match(watchdog, /github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(watchdog, /github\.event\.workflow_run\.conclusion == 'timed_out'/);
  assert.match(watchdog, /github\.event\.workflow_run\.path == '\.github\/workflows\/deploy-staging\.yml'/);
  assert.match(watchdog, /concurrency:\s+group: staging\s+cancel-in-progress: false/);
  assert.match(watchdog, /staging-deploy-state-\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(watchdog, /staging-recovery-\$\{\{ github\.event\.workflow_run\.id \}\}/);
  assert.match(watchdog, /staging-pages-state\.mjs compensate/);
  assert.match(watchdog, /staging-pages-state\.mjs assert-original/);
  assert.match(pagesState, /G12_STAGING_EXTERNAL_DEPLOYMENT_PRESERVED/);
  assert.match(pagesState, /current\.commitMessage === state\.runMarker/);
  assert.match(pagesState, /AbortSignal\.timeout\(30_000\)/);
  assert.match(pagesState, /timeout: 10 \* 60_000/);
  assert.match(fixture, /timeout: 2 \* 60_000/);
  assert.ok(
    workflow.indexOf("Capture immutable live staging state before any remote mutation") <
      workflow.indexOf("Apply the exact candidate migrations to staging"),
  );
});

test("staging reconciliation is idempotent and refuses a concurrent external deployment", () => {
  const state = {
    originalRelease: "a".repeat(40),
    originalDeployment: "00000000-0000-4000-8000-000000000001",
    originalCreatedOn: "2026-09-07T10:00:00.000Z",
    originalCommitMessage: "prior staging",
    candidateRelease: "b".repeat(40),
    runMarker: "g12-staging-run-123456-1",
    compensationMarker: "g12-staging-deploy-compensation-123456-1",
  };
  const original = {
    deploymentId: state.originalDeployment,
    release: state.originalRelease,
    createdOn: state.originalCreatedOn,
    commitMessage: state.originalCommitMessage,
  };
  const candidate = {
    deploymentId: "00000000-0000-4000-8000-000000000002",
    release: state.candidateRelease,
    createdOn: "2026-09-07T11:00:00.000Z",
    commitMessage: state.runMarker,
  };
  assert.equal(stagingReconcileDecision(original, state), "already-original");
  assert.equal(stagingReconcileDecision(candidate, state), "restore-original");
  assert.equal(
    stagingReconcileDecision({ ...candidate, commitMessage: "external" }, state),
    "external-conflict",
  );
  assert.equal(
    stagingReconcileDecision({ ...candidate, release: "c".repeat(40), commitMessage: "external" }, state),
    "external-conflict",
  );
  for (const replacement of [
    { ...original, deploymentId: "00000000-0000-4000-8000-000000000099" },
    { ...original, createdOn: "2026-09-07T10:00:01.000Z" },
    { ...original, commitMessage: "external same-SHA deploy" },
  ])
    assert.equal(stagingReconcileDecision(replacement, state), "external-conflict");
});

test("staging deploy and rollback serialize mutations against the same environment", async () => {
  const deploy = await read(".github/workflows/deploy-staging.yml");
  const rollback = await read(".github/workflows/rollback-staging.yml");
  const stagingConcurrency = /concurrency:\s+group: staging\s+cancel-in-progress: false/;
  const rollbackHeader = rollback.slice(rollback.indexOf("  rollback:"), rollback.indexOf("    steps:"));
  const authorizationGate = rollback.indexOf(
    "Validate staging rollback dispatch authorization before any mutation",
  );
  const firstCheckout = rollback.indexOf("Checkout exact frontend rollback target");
  assert.match(deploy, stagingConcurrency);
  assert.match(rollback, stagingConcurrency);
  assert.doesNotMatch(rollbackHeader, /\n {4}if:/);
  assert.ok(authorizationGate >= 0 && authorizationGate < firstCheckout);
  assert.match(rollback, /DISPATCH_REF: \$\{\{ github\.ref \}\}/);
  assert.match(rollback, /\[ "\$DISPATCH_REF" != "refs\/heads\/main" \]/);
  assert.match(
    rollback,
    /ROLLBACK-STAGING:\$FRONTEND_REF:\$BACKEND_REF:\$SOURCE_RUN_ID:\$SOURCE_RUN_ATTEMPT:\$CANDIDATE_ARTIFACT_ID/,
  );
  assert.equal((rollback.match(/\^\[a-f0-9\]\{40\}\$/g) ?? []).length >= 2, true);
});

test("rollout probe waits for a stable boundary before starting its strict measurement window", async () => {
  const probe = await read("scripts/ev2/phase12/rollout-probe.mjs");
  assert.match(probe, /EV2_G12_READINESS_ATTEMPTS/);
  assert.match(probe, /boundaryHeadersValid/);
  assert.match(probe, /G12_PROBE_NOT_READY/);
  assert.match(probe, /EV2_G12_WARMUP_SAMPLES_PER_ROUTE/);
  assert.match(probe, /EV2_G12_WARMUP_ATTEMPTS/);
  assert.match(probe, /G12_PROBE_WARMUP_FAILED/);
  assert.match(probe, /retryStrictBoundaryWindow/);
  assert.ok(probe.indexOf("if (!ready)") < probe.indexOf("async function request"));
  assert.ok(probe.indexOf("retryStrictBoundaryWindow({") < probe.indexOf("async function request"));
});

test("strict boundary warmup retries a whole failed window and still fails after bounded exhaustion", async () => {
  const waits = [];
  let attempts = 0;
  await retryStrictBoundaryWindow({
    attempts: 3,
    verify: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("G12_PROBE_WARMUP_FAILED: transient alias boundary");
    },
    wait: async () => waits.push(attempts),
  });
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [1]);

  const terminal = new Error("G12_PROBE_WARMUP_FAILED: persistent alias boundary");
  attempts = 0;
  await assert.rejects(
    retryStrictBoundaryWindow({
      attempts: 3,
      verify: async () => {
        attempts += 1;
        throw terminal;
      },
      wait: async () => waits.push(attempts),
    }),
    (error) => error === terminal,
  );
  assert.equal(attempts, 3);
});

function rolloutWindow(offsetMinutes = 0) {
  const startedAt = new Date(Date.UTC(2026, 8, 4, 10, offsetMinutes));
  const endedAt = new Date(startedAt.getTime() + 5 * 60_000);
  return {
    candidateSha: sha,
    environment: "staging",
    stage: "staging-canary",
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    sampleCount: 20,
    availabilityPercent: 100,
    http5xxRatePercent: 0,
    publicP95Ms: 500,
    releaseHeadersExact: true,
    healthContractValid: true,
    manifestReleaseExact: true,
    routeBudgetsValid: true,
    nonProductionNoindexValid: true,
    p0Count: 0,
    p1Count: 0,
    securityIncidentCount: 0,
    projectionDivergenceCount: 0,
    accessibilityCriticalCount: 0,
    accessibilitySeriousCount: 0,
    securityReviewStatus: "passed",
    privacyReviewStatus: "passed",
    projectionComparisonStatus: "passed",
    restoreStatus: "passed",
    adminReadP95Ms: 400,
    commandP95Ms: 650,
    outboxLagP95Ms: 0,
  };
}

function approvedRecord() {
  return {
    schemaVersion: 3,
    gate: "G12",
    decision: "approved",
    candidateSha: sha,
    environment: "production",
    requestedBy: "Vnd93",
    changeReference: "CHG-EV2-12",
    g11EvidenceRunId: "7466a0d3-021f-4c60-ad82-61e76b93844f",
    g12Evidence: {
      file: `docs/ev2/fase-12/evidencias/G12_CANARY_${sha}.json`,
      canaryRunId: "12345678-1234-4234-9234-123456789abc",
      candidateSha: sha,
      reportSha256: "c".repeat(64),
      repository: "Vnd93/gaiatec-cms",
      workflow: ".github/workflows/deploy-staging.yml",
      workflowName: "Deploy staging",
      runId: "34000214001",
      runAttempt: 1,
      event: "workflow_dispatch",
      ref: "refs/heads/main",
      headSha: sha,
      completedAt: "2026-09-04T10:15:30.000Z",
      artifactName: `staging-${sha}`,
      artifactId: "900000001",
      artifactDigest: `sha256:${"1".repeat(64)}`,
      candidateArtifactName: `staging-candidate-${sha}-34000214001-1`,
      candidateArtifactId: "900000002",
      candidateArtifactDigest: `sha256:${"2".repeat(64)}`,
      candidateArchiveSha256: "3".repeat(64),
      candidateTreeSha256: "4".repeat(64),
      healthyWindowIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333",
      ],
      syntheticOnly: true,
      realDataUsed: false,
      productionMutations: 0,
    },
    productionAuthorized: true,
    productionAuthorizationText: `AUTORIZO-G12-PRODUCAO:${sha}`,
    productionAuthorizationSha: sha,
    productionAuthorizedBy: "Vnd93",
    productionAuthorizedAt: "2026-09-04T10:33:00.000Z",
    target: {
      cloudflareAccountId: "1".repeat(32),
      cloudflareProject: "gaiatec-website",
      cloudflareZoneId: "2".repeat(32),
      cachePurgeTokenId: "3".repeat(32),
      domains: ["gaiatecsistemas.com.br", "www.gaiatecsistemas.com.br"],
    },
    changeWindow: {
      startsAt: "2026-09-04T09:00:00.000Z",
      endsAt: "2026-09-04T12:00:00.000Z",
    },
    rollback: {
      deploymentId: "ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf",
      release: "b".repeat(40),
    },
    productionReadiness: {
      githubProtection: {
        status: "verified",
        candidateSha: sha,
        governanceMode: "sole-maintainer",
        maintainerLogin: "Vnd93",
        requiredPullRequestApprovals: 0,
        codeOwnersCount: 1,
        branchProtected: true,
        requiredChecksPassed: true,
        soleMaintainerRiskAccepted: true,
        evidenceReference: "actions/github-controls-123",
        verifiedAt: "2026-09-04T08:30:00.000Z",
      },
      backupRestore: {
        status: "passed",
        projectRef: "chfuhctnhqgyjowkvllv",
        externalTarget: "github-actions-encrypted-artifact",
        encryptedArchiveSha256: "d".repeat(64),
        backupRunId: "34000214134",
        backupRunAttempt: 1,
        restoreDrillRunId: "34000214134",
        backupWorkflow: ".github/workflows/backup-supabase-production.yml",
        backupWorkflowName: "Backup Supabase production",
        backupEvent: "workflow_dispatch",
        backupRef: "refs/heads/main",
        backupSourceSha: sha,
        artifactName: "supabase-production-backup-34000214134-1",
        artifactId: "900000003",
        artifactDigest: `sha256:${"5".repeat(64)}`,
        manifestSha256: "a".repeat(64),
        rpoMinutes: 1440,
        rtoMinutes: 30,
        evidenceReference: ".github/release-controls/evidence/BACKUP_RESTORE_34000214134_1.json",
        evidenceSha256: "e".repeat(64),
        completedAt: "2026-09-04T10:20:00.000Z",
        runCompletedAt: "2026-09-04T10:21:00.000Z",
      },
      dpoLegal: {
        status: "approved",
        approverId: "Vnd93",
        scopeSha256: "e".repeat(64),
        evidenceReference: CANONICAL_DPO_EVIDENCE_REFERENCE,
        approvedAt: "2026-09-04T10:22:00.000Z",
      },
      emailProvider: {
        status: "verified",
        provider: "resend",
        sendingDomain: "gaiatecsistemas.com",
        from: "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>",
        notificationTo: "comercial@gaiatecsistemas.com.br",
        syntheticDeliveryStatus: "passed",
        syntheticDeliveryIdSha256: "6".repeat(64),
        candidateSha: sha,
        emailRunId: "34000214200",
        emailRunAttempt: 1,
        emailWorkflow: ".github/workflows/verify-production-email.yml",
        emailWorkflowName: "Verify production email provider",
        emailEvent: "workflow_dispatch",
        emailRef: "refs/heads/main",
        emailSourceSha: sha,
        artifactName: `production-email-evidence-${sha}`,
        artifactId: "900000004",
        artifactDigest: `sha256:${"7".repeat(64)}`,
        evidenceSha256: "8".repeat(64),
        realDataUsed: false,
        evidenceReference: "https://github.com/Vnd93/gaiatec-cms/actions/runs/34000214200",
        verifiedAt: "2026-09-04T10:25:00.000Z",
        runCompletedAt: "2026-09-04T10:26:00.000Z",
      },
      csp: {
        status: "passed",
        mode: "enforce",
        candidateSha: sha,
        policySha256: cspPolicySha256,
        adminPolicySha256: cspAdminPolicySha256,
        criticalViolations: 0,
        evidenceReference: `.github/release-controls/evidence/G16_CSP_BROWSER_${sha.slice(0, 7)}.json`,
        evidenceSha256: "9".repeat(64),
        verifiedAt: "2026-09-04T10:27:00.000Z",
      },
    },
    operationalGovernance: {
      mode: "sole-operator",
      responsibleId: "Vnd93",
      riskAccepted: true,
      acceptedAt: "2026-09-04T10:28:00.000Z",
      evidenceReference: CANONICAL_DPO_EVIDENCE_REFERENCE,
    },
    owners: {
      changeOwner: {
        id: "Vnd93",
        approvedAt: "2026-09-04T10:29:00.000Z",
        evidenceReference: "approval/Vnd93/change",
      },
      technicalReviewer: {
        id: "Vnd93",
        approvedAt: "2026-09-04T10:30:00.000Z",
        evidenceReference: "approval/Vnd93/technical",
      },
      securityPrivacyOwner: {
        id: "Vnd93",
        approvedAt: "2026-09-04T10:31:00.000Z",
        evidenceReference: "approval/Vnd93/security-privacy",
      },
      businessOwner: {
        id: "Vnd93",
        approvedAt: "2026-09-04T10:32:00.000Z",
        evidenceReference: "approval/Vnd93/business",
      },
    },
  };
}

function boundCanaryEvidence(record) {
  return {
    schemaVersion: 1,
    outcome: "G12_CANARY_PASS",
    suiteKey: "g12-staging-integrated-reduced-v2",
    environment: "staging",
    canaryRunId: record.g12Evidence.canaryRunId,
    candidateSha: record.candidateSha,
    candidateOrigin: "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
    stableOrigin: "https://gaiatec-cms-staging.pages.dev",
    startedAt: "2026-09-04T09:59:30.000Z",
    finishedAt: "2026-09-04T10:15:15.000Z",
    g11AssuranceRunId: record.g11EvidenceRunId,
    inheritedG11Checks: 27,
    inheritedG11Passed: 27,
    p0Count: 0,
    p1Count: 0,
    securityStatus: "passed",
    restoreStatus: "passed",
    stablePromoted: false,
    syntheticOnly: true,
    realDataUsed: false,
    productionMutations: 0,
    syntheticResidue: {
      activeActors: 0,
      activeCredentials: 0,
      activeOverrides: 0,
      personalLeadPayloads: 0,
      retainedSyntheticActors: 2,
      retainedAnonymizedLeads: 1,
    },
    healthyWindows: record.g12Evidence.healthyWindowIds.map((id, index) => {
      const routeMetrics = Object.fromEntries(
        ["/", "/produtos", "/contato", "/admin/login"].map((route) => [
          route,
          { samples: 5, availabilityPercent: 100, p50Ms: 250, p95Ms: 500, maxMs: 500 },
        ]),
      );
      const probe = {
        schemaVersion: 1,
        event: "g12.rollout.probe",
        origin: "https://ev2-g12-canary.gaiatec-cms-staging.pages.dev",
        candidateSha: record.candidateSha,
        environment: "staging",
        measuredResponses: 22,
        sampleCount: 5,
        availabilityPercent: 100,
        http5xxRatePercent: 0,
        publicP95Ms: 500,
        requestTimeoutMs: 10_000,
        routeMetrics,
        routeBudgetsValid: true,
        releaseHeadersExact: true,
        healthContractValid: true,
        manifestReleaseExact: true,
        nonProductionNoindexValid: true,
        outcome: "pass",
        violations: [],
      };
      return {
        id,
        startedAt: new Date(Date.UTC(2026, 8, 4, 10, index * 5)).toISOString(),
        endedAt: new Date(Date.UTC(2026, 8, 4, 10, index * 5 + 5)).toISOString(),
        outcome: probe.outcome,
        measuredResponses: probe.measuredResponses,
        availabilityPercent: probe.availabilityPercent,
        http5xxRatePercent: probe.http5xxRatePercent,
        publicP95Ms: probe.publicP95Ms,
        evidenceHash: createHash("sha256").update(JSON.stringify(probe)).digest("hex"),
        probe,
      };
    }),
  };
}

test("health endpoint exposes only immutable, non-cacheable release state", async () => {
  const env = {
    CF_PAGES_COMMIT_SHA: sha,
    CF_PAGES_BRANCH: "ev2-g12-canary",
    ASSETS: { fetch: async () => new Response("unexpected", { status: 500 }) },
  };
  const staging = await worker.fetch(
    new Request("https://ev2-g12-canary.gaiatec-cms-staging.pages.dev/healthz"),
    env,
  );
  assert.equal(staging.status, 200);
  assert.equal(staging.headers.get("x-release"), sha);
  assert.match(staging.headers.get("cache-control") ?? "", /no-store/);
  assert.match(staging.headers.get("x-robots-tag") ?? "", /noindex/);
  assert.deepEqual(await staging.json(), {
    schemaVersion: 1,
    status: "ready",
    release: sha,
    environment: "staging",
  });

  const production = await worker.fetch(new Request("https://gaiatecsistemas.com.br/healthz"), {
    ...env,
    CF_PAGES_BRANCH: "main",
  });
  assert.equal(production.status, 200);
  assert.equal((await production.json()).environment, "production");
  assert.equal(production.headers.has("x-robots-tag"), false);

  const unknown = await worker.fetch(new Request("https://untrusted.example/healthz"), env);
  assert.equal(unknown.status, 503);
  assert.equal((await unknown.json()).status, "degraded");
});

test("probe and full rollout budgets fail closed", () => {
  const healthy = rolloutWindow();
  assert.equal(evaluateProbeWindow(healthy).healthy, true);
  assert.equal(evaluateRolloutWindow(healthy).decision, "continue");
  assert.equal(evaluateRolloutWindow({ ...healthy, p0Count: 1 }).decision, "pause");
  assert.equal(evaluateRolloutWindow({ ...healthy, securityReviewStatus: "pending" }).healthy, false);
  assert.equal(evaluateProbeWindow({ ...healthy, candidateSha: "a" }).healthy, false);
  assert.equal(evaluateProbeWindow({ ...healthy, routeBudgetsValid: false }).healthy, false);
});

test("health and release manifests reject HTML, incomplete entries and mismatched releases", () => {
  const manifest = {
    schemaVersion: 1,
    release: sha,
    files: [{ path: "index.html", bytes: 123, sha256: "f".repeat(64) }],
  };
  assert.equal(validateReleaseManifest(manifest, { expectedRelease: sha }).valid, true);
  assert.match(
    validateReleaseManifest({ ...manifest, files: [] }, { expectedRelease: sha }).violations.join(","),
    /manifest_files_invalid/,
  );
  assert.match(
    validateReleaseManifest(
      { ...manifest, release: "b".repeat(40) },
      { expectedRelease: sha },
    ).violations.join(","),
    /manifest_release_mismatch/,
  );
  for (const invalidPath of [
    "dir/file:stream",
    "//server/share/file.js",
    "C:/temp/file.js",
    "/absolute/file.js",
    "./relative.js",
    "a//b.js",
    "a/../b.js",
    "a\\b.js",
  ]) {
    assert.match(
      validateReleaseManifest(
        { ...manifest, files: [{ ...manifest.files[0], path: invalidPath }] },
        { expectedRelease: sha },
      ).violations.join(","),
      /manifest_file_entry_invalid/,
      invalidPath,
    );
  }
  assert.equal(
    validateHealthContract(
      { schemaVersion: 1, status: "ready", release: sha, environment: "staging" },
      { expectedRelease: sha, expectedEnvironment: "staging" },
    ).valid,
    true,
  );
  assert.match(validateHealthContract("<!doctype html>").violations.join(","), /health_schema_invalid/);
});

test("rollout needs three consecutive healthy windows and cannot skip a stage", () => {
  const windows = [rolloutWindow(0), rolloutWindow(10), rolloutWindow(20)];
  assert.equal(
    evaluateRolloutAdvance({
      candidateSha: sha,
      currentStage: "staging-canary",
      nextStage: "production-shell",
      windows,
    }).allowed,
    true,
  );
  assert.equal(
    evaluateRolloutAdvance({
      candidateSha: sha,
      currentStage: "staging-canary",
      nextStage: "production-5",
      windows,
    }).decision,
    "pause",
  );
  assert.equal(
    evaluateRolloutAdvance({
      candidateSha: sha,
      currentStage: "staging-canary",
      nextStage: "production-shell",
      windows: windows.slice(0, 2),
    }).allowed,
    false,
  );
});

test("G12 approval requires an exact candidate, live window and the declared sole operator", () => {
  const record = approvedRecord();
  assert.equal(
    approvalRecordFilenameMatchesCandidate(`.github/release-controls/approvals/G12_${sha}.json`, sha),
    true,
  );
  assert.equal(
    approvalRecordFilenameMatchesCandidate(
      `.github/release-controls/approvals/G12_${"b".repeat(40)}.json`,
      sha,
    ),
    false,
  );
  assert.equal(approvalRecordFilenameMatchesCandidate(`C:\\approvals\\G12_${sha}.json`, sha), false);
  assert.equal(
    validateApprovalRecord(record, {
      expectedSha: sha,
      expectedEnvironment: "production",
      expectedChangeReference: "CHG-EV2-12",
      now: "2026-09-04T10:00:00.000Z",
    }).valid,
    true,
  );
  assert.equal(
    resolveG12EvidenceRepositoryPath(record.g12Evidence.file),
    `.github/release-controls/evidence/G12_CANARY_${sha}.json`,
  );
  const currentPathRecord = structuredClone(record);
  currentPathRecord.g12Evidence.file = `.github/release-controls/evidence/G12_CANARY_${sha}.json`;
  assert.equal(validateApprovalRecord(currentPathRecord).valid, true);
  assert.equal(resolveG12EvidenceRepositoryPath("../G12_CANARY_escape.json"), null);
  assert.equal(
    resolveCspEvidenceRepositoryPath(HISTORICAL_G16_CSP_EVIDENCE_REFERENCE),
    ".github/release-controls/evidence/G16_CSP_BROWSER_e52b25d.json",
  );
  assert.equal(
    resolveCspEvidenceRepositoryPath("docs/ev2/fase-16/evidencias/G16_CSP_BROWSER_a1b2c3d.json"),
    null,
  );
  assert.equal(resolveCspEvidenceRepositoryPath("../G16_CSP_BROWSER_escape.json"), null);
  const foreignOwner = structuredClone(record);
  foreignOwner.owners.technicalReviewer.id = "another-user";
  assert.match(
    validateApprovalRecord(foreignOwner).violations.join(","),
    /technicalReviewer_must_match_sole_operator/,
  );
  const unacceptedRisk = structuredClone(record);
  unacceptedRisk.operationalGovernance.riskAccepted = false;
  assert.match(
    validateApprovalRecord(unacceptedRisk).violations.join(","),
    /sole_operator_risk_not_accepted/,
  );
  assert.match(
    validateApprovalRecord({ ...record, productionAuthorized: false }).violations.join(","),
    /production_not_authorized/,
  );
  assert.match(
    validateApprovalRecord({ ...record, productionAuthorizationSha: "b".repeat(40) }).violations.join(","),
    /production_authorization_sha_mismatch/,
  );
  for (const mutate of [
    (value) => (value.g12Evidence.completedAt = "2026-09-04T10:21:30.000Z"),
    (value) => (value.productionReadiness.backupRestore.runCompletedAt = "2026-09-04T10:25:30.000Z"),
    (value) => (value.productionReadiness.emailProvider.runCompletedAt = "2026-09-04T10:34:00.000Z"),
  ]) {
    const outOfOrder = structuredClone(record);
    mutate(outOfOrder);
    assert.match(
      validateApprovalRecord(outOfOrder).violations.join(","),
      /production_prerequisite_chronology_invalid/,
    );
  }
  const wrongStagingArtifact = structuredClone(record);
  wrongStagingArtifact.g12Evidence.candidateArtifactDigest = "0".repeat(64);
  assert.match(
    validateApprovalRecord(wrongStagingArtifact).violations.join(","),
    /g12_staging_candidate_artifact_digest_invalid/,
  );
  const substitutedCloudflareIdentity = structuredClone(record);
  substitutedCloudflareIdentity.target.cachePurgeTokenId = "4".repeat(32);
  assert.match(
    validateApprovalRecord({
      ...substitutedCloudflareIdentity,
      target: { ...substitutedCloudflareIdentity.target, cloudflareZoneId: "invalid" },
    }).violations.join(","),
    /production_cloudflare_identity_invalid/,
  );
  assert.match(
    validateApprovalRecord({
      ...record,
      productionAuthorizationText: `AUTORIZO-G12-PRODUCAO:${"b".repeat(40)}`,
    }).violations.join(","),
    /production_authorization_text_invalid/,
  );
  const mutableDpoReference = structuredClone(record);
  mutableDpoReference.productionReadiness.dpoLegal.evidenceReference =
    CANONICAL_DPO_EVIDENCE_REFERENCE.replace(CANONICAL_DOCUMENTATION_SHA, "main");
  assert.match(
    validateApprovalRecord(mutableDpoReference).violations.join(","),
    /readiness_dpo_legal_evidence_invalid/,
  );
  const foreignGovernanceReference = structuredClone(record);
  foreignGovernanceReference.operationalGovernance.evidenceReference =
    "docs/ev2/fase-16/REGISTRO_DECLARACAO_GOVERNANCA_DPO_RISCO_2026-09-05.md?raw=1";
  assert.match(
    validateApprovalRecord(foreignGovernanceReference).violations.join(","),
    /sole_operator_evidence_invalid/,
  );
});

test("CSP evidence requires a digest and permits fallback only for the exact historical control", () => {
  const record = approvedRecord();
  const control = record.productionReadiness.csp;
  const evidence = {
    schemaVersion: 1,
    event: "ev2.phase16.csp.browser-canary",
    origin: `https://${sha.slice(0, 8)}.gaiatec-cms-staging.pages.dev`,
    candidateSha: sha,
    executedAt: "2026-09-04T08:50:00.000Z",
    routes: CSP_CANARY_ROUTES.map((path) => ({
      path,
      status: 200,
      release: sha,
      cspEnforced: true,
      policySha256: path === "/admin/login" ? cspAdminPolicySha256 : cspPolicySha256,
      violations: [],
    })),
    policySha256: cspPolicySha256,
    adminPolicySha256: cspAdminPolicySha256,
    outcome: "pass",
    criticalViolations: 0,
    realDataUsed: false,
    productionMutations: 0,
  };
  const reportSha256 = canonicalTextSha256(JSON.stringify(evidence));
  control.evidenceSha256 = reportSha256;
  assert.deepEqual(resolveCspEvidenceBinding(control), {
    repositoryPath: `.github/release-controls/evidence/G16_CSP_BROWSER_${sha.slice(0, 7)}.json`,
    evidenceSha256: reportSha256,
    historicalFallback: false,
  });
  assert.equal(
    validateCspEvidenceBinding(control, evidence, {
      reportSha256,
      expectedPolicySha256: cspPolicySha256,
      expectedAdminPolicySha256: cspAdminPolicySha256,
    }).valid,
    true,
  );

  const tamperedEvidence = { ...evidence, origin: "https://tampered.invalid" };
  assert.match(
    validateCspEvidenceBinding(control, tamperedEvidence, {
      reportSha256: canonicalTextSha256(JSON.stringify(tamperedEvidence)),
      expectedPolicySha256: cspPolicySha256,
      expectedAdminPolicySha256: cspAdminPolicySha256,
    }).violations.join(","),
    /csp_evidence_digest_mismatch/,
  );

  const semanticCases = [
    ["origin", (value) => (value.origin = "https://staging.example.invalid"), /csp_evidence_origin_invalid/],
    ["routes", (value) => value.routes.reverse(), /csp_evidence_routes_invalid/],
    ["status", (value) => (value.routes[0].status = 204), /csp_evidence_route_status_invalid/],
    ["release", (value) => (value.routes[0].release = "b".repeat(40)), /csp_evidence_route_release_invalid/],
    [
      "enforcement",
      (value) => (value.routes[0].cspEnforced = false),
      /csp_evidence_route_enforcement_invalid/,
    ],
    [
      "violations",
      (value) => value.routes[0].violations.push({ type: "console", text: "blocked" }),
      /csp_evidence_route_violations_present/,
    ],
    [
      "report policy",
      (value) => (value.policySha256 = "0".repeat(64)),
      /csp_evidence_policy_digest_mismatch/,
    ],
    [
      "route policy",
      (value) => (value.routes[0].policySha256 = "0".repeat(64)),
      /csp_evidence_route_policy_digest_mismatch/,
    ],
    [
      "admin report policy",
      (value) => (value.adminPolicySha256 = "0".repeat(64)),
      /csp_evidence_admin_policy_digest_mismatch/,
    ],
    [
      "admin route policy",
      (value) => (value.routes.find((route) => route.path === "/admin/login").policySha256 = "0".repeat(64)),
      /csp_evidence_route_policy_digest_mismatch/,
    ],
    ["outcome", (value) => (value.outcome = "pause"), /csp_evidence_outcome_invalid/],
  ];
  for (const [name, mutate, expectedViolation] of semanticCases) {
    const forgedEvidence = structuredClone(evidence);
    mutate(forgedEvidence);
    const forgedDigest = canonicalTextSha256(JSON.stringify(forgedEvidence));
    const forgedControl = { ...control, evidenceSha256: forgedDigest };
    assert.match(
      validateCspEvidenceBinding(forgedControl, forgedEvidence, {
        reportSha256: forgedDigest,
        expectedPolicySha256: cspPolicySha256,
        expectedAdminPolicySha256: cspAdminPolicySha256,
      }).violations.join(","),
      expectedViolation,
      name,
    );
  }
  assert.match(
    validateCspEvidenceBinding({ ...control, policySha256: "0".repeat(64) }, evidence, {
      reportSha256,
      expectedPolicySha256: cspPolicySha256,
      expectedAdminPolicySha256: cspAdminPolicySha256,
    }).violations.join(","),
    /csp_policy_digest_mismatch/,
  );
  assert.match(
    validateCspEvidenceBinding({ ...control, adminPolicySha256: "0".repeat(64) }, evidence, {
      reportSha256,
      expectedPolicySha256: cspPolicySha256,
      expectedAdminPolicySha256: cspAdminPolicySha256,
    }).violations.join(","),
    /csp_admin_policy_digest_mismatch/,
  );
  for (const invalidReference of [
    "../G16_CSP_BROWSER_aaaaaaa.json",
    `docs/ev2/fase-16/evidencias/G16_CSP_BROWSER_${sha.slice(0, 7)}.json`,
    `https://github.com/Vnd93/gaiatec-cms/blob/${sha}/.github/release-controls/evidence/G16_CSP_BROWSER_${sha.slice(0, 7)}.json`,
  ])
    assert.equal(resolveCspEvidenceBinding({ ...control, evidenceReference: invalidReference }), null);
  assert.equal(resolveCspEvidenceBinding({ ...control, evidenceSha256: undefined }), null);

  const historicalControl = {
    candidateSha: "e52b25d903251cf538918d89049a58524c3c9911",
    evidenceReference: HISTORICAL_G16_CSP_EVIDENCE_REFERENCE,
  };
  assert.deepEqual(resolveCspEvidenceBinding(historicalControl), {
    repositoryPath: ".github/release-controls/evidence/G16_CSP_BROWSER_e52b25d.json",
    evidenceSha256: HISTORICAL_G16_CSP_EVIDENCE_SHA256,
    historicalFallback: true,
  });
  assert.equal(resolveCspEvidenceBinding({ ...historicalControl, candidateSha: sha }), null);
  assert.equal(resolveCspEvidenceBinding({ ...historicalControl, evidenceSha256: "0".repeat(64) }), null);
});

test("G12 approval is cryptographically and semantically bound to its canary report", () => {
  const record = approvedRecord();
  const evidence = boundCanaryEvidence(record);
  assert.equal(
    validateCanaryEvidenceBinding(record, evidence, { reportSha256: record.g12Evidence.reportSha256 }).valid,
    true,
  );
  assert.match(
    validateCanaryEvidenceBinding(
      record,
      { ...evidence, candidateSha: "b".repeat(40) },
      {
        reportSha256: record.g12Evidence.reportSha256,
      },
    ).violations.join(","),
    /g12_report_candidate_mismatch/,
  );
  assert.match(
    validateCanaryEvidenceBinding(record, evidence, { reportSha256: "e".repeat(64) }).violations.join(","),
    /g12_evidence_digest_mismatch/,
  );
  const forgedWindow = structuredClone(evidence);
  forgedWindow.healthyWindows[1].outcome = "pause";
  assert.match(
    validateCanaryEvidenceBinding(record, forgedWindow, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_invalid/,
  );
  const tamperedProbe = structuredClone(evidence);
  tamperedProbe.healthyWindows[0].probe.publicP95Ms = 501;
  assert.match(
    validateCanaryEvidenceBinding(record, tamperedProbe, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_hash_mismatch|g12_window_summary_mismatch/,
  );
  const forgedProbe = structuredClone(evidence);
  forgedProbe.healthyWindows[0].probe.healthContractValid = false;
  forgedProbe.healthyWindows[0].evidenceHash = createHash("sha256")
    .update(JSON.stringify(forgedProbe.healthyWindows[0].probe))
    .digest("hex");
  assert.match(
    validateCanaryEvidenceBinding(record, forgedProbe, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_invalid/,
  );
  const unpinnedLegacySampleContract = structuredClone(evidence);
  unpinnedLegacySampleContract.healthyWindows[0].probe.sampleCount =
    unpinnedLegacySampleContract.healthyWindows[0].probe.measuredResponses;
  unpinnedLegacySampleContract.healthyWindows[0].evidenceHash = createHash("sha256")
    .update(JSON.stringify(unpinnedLegacySampleContract.healthyWindows[0].probe))
    .digest("hex");
  assert.match(
    validateCanaryEvidenceBinding(record, unpinnedLegacySampleContract, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_invalid/,
  );
  const reboundProbe = structuredClone(evidence);
  reboundProbe.healthyWindows[0].probe.candidateSha = "b".repeat(40);
  reboundProbe.healthyWindows[0].evidenceHash = createHash("sha256")
    .update(JSON.stringify(reboundProbe.healthyWindows[0].probe))
    .digest("hex");
  assert.match(
    validateCanaryEvidenceBinding(record, reboundProbe, {
      reportSha256: record.g12Evidence.reportSha256,
    }).violations.join(","),
    /g12_window_probe_binding_mismatch/,
  );
});

test("production configuration refuses staging and direct-main controls remain strict", () => {
  assert.equal(
    validateProductionConfig({
      supabaseProjectRef: "chfuhctnhqgyjowkvllv",
      supabaseUrl: "https://chfuhctnhqgyjowkvllv.supabase.co/",
      supabaseAnonKey: "sb_publishable_example_key_with_safe_length",
      siteOrigin: "https://gaiatecsistemas.com.br",
      cloudflareProject: "gaiatec-website",
    }).valid,
    true,
  );
  assert.match(
    validateProductionConfig({
      supabaseProjectRef: "glcqsosxwgmlhzgcsnzv",
      supabaseUrl: "https://glcqsosxwgmlhzgcsnzv.supabase.co/",
      supabaseAnonKey: "sb_publishable_example_key_with_safe_length",
      siteOrigin: "https://gaiatecsistemas.com.br",
      cloudflareProject: "gaiatec-website",
    }).violations.join(","),
    /staging_project_ref_forbidden/,
  );
  const controlInput = {
    environment: {
      protection_rules: [],
      deployment_branch_policy: { protected_branches: true, custom_branch_policies: false },
    },
    comparison: { base_commit: { sha: "a".repeat(40) }, status: "ahead" },
    candidateSha: "a".repeat(40),
    branchProtection: {
      enforce_admins: { enabled: true },
      allow_force_pushes: { enabled: false },
      allow_deletions: { enabled: false },
      required_conversation_resolution: { enabled: false },
      required_linear_history: { enabled: true },
    },
    codeOwners: ["* @Vnd93", "/.github/workflows/** @Vnd93", "/.github/release-controls/** @Vnd93"].join(
      "\n",
    ),
    repository: "Vnd93/gaiatec-cms",
    ciWorkflow: { id: 55, path: ".github/workflows/ci.yml", state: "active" },
    ciWorkflowRun: {
      id: 120,
      run_number: 40,
      run_attempt: 2,
      workflow_id: 55,
      path: ".github/workflows/ci.yml",
      head_sha: sha,
      head_branch: "main",
      event: "push",
      status: "completed",
      conclusion: "success",
      head_repository: { full_name: "Vnd93/gaiatec-cms" },
      repository: { full_name: "Vnd93/gaiatec-cms" },
    },
    checkRuns: [
      { id: 1, run_id: 120, name: "quality", status: "completed", conclusion: "success" },
      { id: 2, run_id: 120, name: "database", status: "completed", conclusion: "success" },
      { id: 3, run_id: 120, name: "browser", status: "completed", conclusion: "success" },
    ],
  };
  const controls = evaluateGithubControls(controlInput);
  assert.equal(controls.valid, true);
  assert.equal(evaluateGithubControls({ environment: {}, branchProtection: {} }).valid, false);
  const failedCheck = structuredClone(controlInput);
  failedCheck.checkRuns[0].conclusion = "failure";
  assert.match(evaluateGithubControls(failedCheck).violations.join(","), /actual_check_quality/);
  const replacedByFailedRerun = structuredClone(controlInput);
  replacedByFailedRerun.ciWorkflowRun.run_attempt = 3;
  replacedByFailedRerun.ciWorkflowRun.conclusion = "failure";
  assert.match(
    evaluateGithubControls(replacedByFailedRerun).violations.join(","),
    /latest_exact_ci_run_not_successful/,
  );
  assert.equal(
    selectLatestCiWorkflowRun([
      { id: 120, run_number: 40, run_attempt: 2, conclusion: "success" },
      { id: 120, run_number: 40, run_attempt: 3, conclusion: "failure" },
      { id: 119, run_number: 39, run_attempt: 9, conclusion: "success" },
    ]).conclusion,
    "failure",
  );
  const mixedRunJobs = structuredClone(controlInput);
  mixedRunJobs.checkRuns[2].run_id = 119;
  assert.match(
    evaluateGithubControls(mixedRunJobs).violations.join(","),
    /ci_job_run_identity_mismatch.*actual_check_browser_not_successful/,
  );
  const staleCandidate = structuredClone(controlInput);
  staleCandidate.comparison.base_commit.sha = "b".repeat(40);
  assert.match(evaluateGithubControls(staleCandidate).violations.join(","), /candidate_must_belong_to_main/);
  const pullRequestPolicy = structuredClone(controlInput);
  pullRequestPolicy.branchProtection.required_pull_request_reviews = {
    required_approving_review_count: 0,
  };
  assert.match(
    evaluateGithubControls(pullRequestPolicy).violations.join(","),
    /pull_request_rule_incompatible_with_direct_main/,
  );
  assert.deepEqual(
    evaluateCodeOwners(
      [
        "* @Vnd93 @another-user",
        "/.github/workflows-backup/** @Vnd93",
        "/.github/release-controls-old/** @Vnd93",
      ].join("\n"),
    ).violations,
    [
      "global_vnd93_codeowner_required",
      "workflow_vnd93_codeowner_required",
      "approval_record_vnd93_codeowner_required",
    ],
  );
  assert.match(
    evaluateCodeOwners(
      [
        "* @Vnd93",
        "/.github/workflows/** @Vnd93",
        "/.github/release-controls/** @Vnd93 @gaiatec/security",
      ].join("\n"),
    ).violations.join(","),
    /approval_record_vnd93_codeowner_required/,
  );
  assert.deepEqual(
    evaluateCodeOwners(
      [
        "* @Vnd93",
        "/.github/workflows/** @Vnd93",
        "/.github/release-controls/** @Vnd93",
        "/.github/** @another-org/security",
      ].join("\n"),
    ).violations,
    [
      "global_vnd93_codeowner_required",
      "workflow_vnd93_codeowner_required",
      "approval_record_vnd93_codeowner_required",
    ],
  );
  assert.deepEqual(
    evaluateCodeOwners(
      [
        "* @Vnd93",
        "/.github/** @another-org/security",
        "/.github/workflows/** @Vnd93",
        "/.github/release-controls/** @Vnd93",
      ].join("\n"),
    ).violations,
    ["global_vnd93_codeowner_required"],
  );
  assert.equal(
    evaluateCodeOwners(
      [
        "* @Vnd93 # all repository files",
        "/.github/workflows/** @Vnd93 # deployment definitions",
        "/.github/release-controls/** @Vnd93 # immutable controls",
      ].join("\n"),
    ).valid,
    true,
  );
  assert.equal(
    evaluateCodeOwners(
      [
        "* @Vnd93",
        "/docs/** @another-user",
        "/docs/** @Vnd93",
        "/.github/workflows/** @Vnd93",
        "/.github/release-controls/** @Vnd93",
      ].join("\n"),
    ).valid,
    true,
  );
  assert.deepEqual(
    evaluateCodeOwners(
      [
        "* @Vnd93",
        "/.github/workflows/** @Vnd93",
        "/.github/release-controls/** @Vnd93",
        "/.github/workflow?/** @another-org/security",
      ].join("\n"),
    ).violations,
    ["global_vnd93_codeowner_required", "workflow_vnd93_codeowner_required"],
  );
  assert.deepEqual(
    evaluateCodeOwners(
      [
        "* @Vnd93",
        "/.github/workflows/** @Vnd93",
        "/.github/release-controls/** @Vnd93",
        "/.github/release-controls/private/**",
      ].join("\n"),
    ).violations,
    ["global_vnd93_codeowner_required", "approval_record_vnd93_codeowner_required"],
  );
  assert.match(
    evaluateCodeOwners(
      ["* @Vnd93", "/.github/workflows/** @Vnd93", "/.github/release-controls/* @Vnd93"].join("\n"),
    ).violations.join(","),
    /approval_record_vnd93_codeowner_required/,
  );
});

test("production backend configuration is exact, complete and fail-closed", () => {
  const backendEnv = {
    PRODUCTION_SUPABASE_PROJECT_REF: "chfuhctnhqgyjowkvllv",
    PRODUCTION_SUPABASE_URL: "https://chfuhctnhqgyjowkvllv.supabase.co",
    PRODUCTION_SUPABASE_ANON_KEY: "sb_publishable_example_key_with_safe_length",
    PRODUCTION_SUPABASE_DB_URL:
      "postgresql://postgres:example-secure-password@db.chfuhctnhqgyjowkvllv.supabase.co:5432/postgres?sslmode=require",
    SUPABASE_ACCESS_TOKEN: "sbp_example_management_token_long_enough",
    PRODUCTION_SITE_ORIGIN: "https://gaiatecsistemas.com.br",
    ALLOWED_ORIGINS: "https://www.gaiatecsistemas.com.br,https://gaiatecsistemas.com.br",
    TURNSTILE_ALLOWED_HOSTNAMES: "www.gaiatecsistemas.com.br,gaiatecsistemas.com.br",
    RESEND_API_KEY: "re_example_production_key_long_enough",
    EMAIL_FROM: "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>",
    LEAD_NOTIFICATION_TO: "comercial@gaiatecsistemas.com.br",
    TURNSTILE_SECRET_KEY: "turnstile_secret_key",
    RATE_LIMIT_SALT: "a".repeat(64),
    EVIDENCE_SALT: "b".repeat(64),
    LEAD_EVIDENCE_SALT: "c".repeat(64),
    OUTBOX_WORKER_SECRET: "d".repeat(64),
    CMS_EV2_PRODUCTION_ENABLED: "true",
    CMS_AI_EXTERNAL_PROVIDER_ENABLED: "true",
    OPENROUTER_API_KEY: "sk-or-example-production-key-long-enough",
    OPENROUTER_MODEL: "nvidia/nemotron-3.5-lightning:free",
    CONTACT_CAPTCHA_ALWAYS: "true",
  };
  assert.equal(validateProductionBackendConfig(backendEnv).valid, true);
  const approvalBoundBackendEnv = {
    ...backendEnv,
    REQUIRE_APPROVAL_BINDINGS: "true",
    APPROVED_EMAIL_FROM_SHA256: createHash("sha256").update(backendEnv.EMAIL_FROM).digest("hex"),
    APPROVED_LEAD_NOTIFICATION_TO_SHA256: createHash("sha256")
      .update(backendEnv.LEAD_NOTIFICATION_TO)
      .digest("hex"),
    CLOUDFLARE_API_TOKEN: "cloudflare-pages-token-with-zone-read-long",
    CLOUDFLARE_ACCOUNT_ID: "1".repeat(32),
    CLOUDFLARE_ZONE_ID: "2".repeat(32),
    CLOUDFLARE_CACHE_PURGE_TOKEN_ID: "3".repeat(32),
    CLOUDFLARE_CACHE_PURGE_TOKEN: "dedicated-cloudflare-cache-purge-token-long",
  };
  approvalBoundBackendEnv.APPROVED_CLOUDFLARE_TARGET_SHA256 = createHash("sha256")
    .update(
      productionCloudflareApprovalTarget({
        accountId: approvalBoundBackendEnv.CLOUDFLARE_ACCOUNT_ID,
        zoneId: approvalBoundBackendEnv.CLOUDFLARE_ZONE_ID,
        cachePurgeTokenId: approvalBoundBackendEnv.CLOUDFLARE_CACHE_PURGE_TOKEN_ID,
      }),
    )
    .digest("hex");
  assert.equal(validateProductionBackendConfig(approvalBoundBackendEnv).valid, true);
  assert.match(
    validateProductionBackendConfig({
      ...approvalBoundBackendEnv,
      CLOUDFLARE_CACHE_PURGE_TOKEN_ID: "",
    }).violations.join(","),
    /dedicated_cloudflare_cache_purge_token_invalid/,
  );
  assert.match(
    validateProductionBackendConfig({
      ...approvalBoundBackendEnv,
      CLOUDFLARE_CACHE_PURGE_TOKEN_ID: "4".repeat(32),
    }).violations.join(","),
    /cloudflare_target_approval_mismatch/,
  );
  assert.match(
    validateProductionBackendConfig({
      ...backendEnv,
      PRODUCTION_SUPABASE_DB_URL:
        "postgresql://postgres:example-secure-password@db.glcqsosxwgmlhzgcsnzv.supabase.co:5432/postgres?sslmode=require",
      CMS_EV2_PRODUCTION_ENABLED: "false",
    }).violations.join(","),
    /production_database_url_invalid.*ev2_production_switch_must_be_enabled/,
  );
  assert.match(
    validateProductionBackendConfig({ ...backendEnv, EVIDENCE_SALT: "a".repeat(64) }).violations.join(","),
    /operational_secrets_must_be_unique/,
  );
  assert.match(
    validateProductionBackendConfig({
      ...backendEnv,
      TURNSTILE_ALLOWED_HOSTNAMES:
        "gaiatecsistemas.com.br,www.gaiatecsistemas.com.br,preview.gaiatec-website.pages.dev",
    }).violations.join(","),
    /turnstile_allowed_hostnames_invalid/,
  );
  assert.match(
    validateProductionBackendConfig({
      ...backendEnv,
      TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    }).violations.join(","),
    /turnstile_test_credential_forbidden/,
  );
});

test("production Edge Function inventory fixes JWT mode for every exact-candidate function", () => {
  const inventory = PRODUCTION_FUNCTIONS.map((name, index) => ({
    name,
    status: "ACTIVE",
    version: index + 1,
    verify_jwt: !PUBLIC_FUNCTIONS.has(name),
  }));
  assert.equal(evaluateFunctionInventory(inventory).valid, true);
  const unsafe = structuredClone(inventory);
  unsafe.find((record) => record.name === "cms-public").verify_jwt = true;
  assert.match(evaluateFunctionInventory(unsafe).violations.join(","), /cms-public:verify_jwt_invalid/);
  assert.match(evaluateFunctionInventory(inventory.slice(1)).violations.join(","), /cms-ai:missing/);
});

test("G12 boundary evals contain no false acceptance or remote mutation", () => {
  const result = spawnSync(process.execPath, ["scripts/ev2/phase12/run-evals.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.outcome, "G12_RULES_PASS");
  assert.equal(report.scenarios, 18);
  assert.equal(report.falseAcceptances, 0);
  assert.equal(report.productionMutations, 0);
  assert.equal(report.realDataUsed, false);
});

test("release workflows and reduced canary are immutable, staged and production fail-closed", async () => {
  const [
    ci,
    preview,
    production,
    rollback,
    githubGuard,
    cloudflare,
    canary,
    g11Canary,
    stableBaseline,
    verifier,
    template,
    backendConfig,
    functionDeploy,
    functionVerify,
    databaseVerify,
    authConfig,
    vaultConfig,
    functionRestore,
    deployStaging,
    productionBridge,
    stagingFunctionDeploy,
    stagingDatabaseVerify,
    backendCompatibility,
    backendBoundaryProbe,
    backendEvidenceCreate,
    backendEvidenceVerify,
    functionDeploymentLib,
    functionSecretsConfig,
    distSeal,
    distSealVerify,
    releaseEvidenceIndex,
    migrationManifest,
  ] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read(".github/workflows/preview-ev2-phase12.yml"),
    read(".github/workflows/deploy-production.yml"),
    read(".github/workflows/rollback-production.yml"),
    read("scripts/ev2/phase12/check-github-controls.mjs"),
    read("scripts/ev2/phase12/cloudflare-pages.mjs"),
    read("scripts/ev2/phase12/staging-canary.mjs"),
    read("scripts/ev2/phase11/staging-canary.mjs"),
    read("scripts/ev2/phase11/stable-baseline-lib.mjs"),
    read("scripts/ev2/phase12/verify-approval.mjs"),
    read(".github/release-controls/templates/g12-approval.template.json"),
    read("scripts/ev2/phase12/validate-production-backend-config.mjs"),
    read("scripts/ev2/phase12/deploy-production-functions.mjs"),
    read("scripts/ev2/phase12/verify-production-functions.mjs"),
    read("scripts/ev2/phase12/verify-production-database.mjs"),
    read("scripts/ev2/phase12/configure-production-auth.mjs"),
    read("scripts/ev2/phase12/configure-production-vault.mjs"),
    read("scripts/ev2/phase12/restore-production-functions.mjs"),
    read(".github/workflows/deploy-staging.yml"),
    read(".github/workflows/promote-production-frontend-bridge.yml"),
    read("scripts/ev2/phase12/deploy-staging-functions.mjs"),
    read("scripts/ev2/phase12/verify-staging-database.mjs"),
    read("scripts/ev2/phase12/verify-backend-forward-compatibility.mjs"),
    read("scripts/ev2/phase12/probe-supabase-boundary.mjs"),
    read("scripts/ev2/phase12/create-production-backend-evidence.mjs"),
    read("scripts/ev2/phase12/verify-production-backend-evidence.mjs"),
    read("scripts/ev2/phase12/production-function-deployment-lib.mjs"),
    read("scripts/ev2/phase12/configure-production-function-secrets.mjs"),
    read("scripts/ev2/phase12/seal-production-dist.mjs"),
    read("scripts/ev2/phase12/verify-production-dist-seal.mjs"),
    read("scripts/ev2/phase12/index-production-release-evidence.mjs"),
    read("scripts/ev2/phase12/migration-manifest-lib.mjs"),
  ]);
  assert.match(ci, /branches: \[main, Remodelagem, "ev2\/\*\*"\]/);
  assert.match(ci, /version: 2\.116\.0/);
  assert.match(preview, /CANARY-G12-STAGING:<SHA>:FULL/);
  assert.match(preview, /gaiatec-cms-staging --branch ev2-g12-canary/);
  assert.doesNotMatch(preview, /project-name gaiatec-website/);
  const previewHeader = preview.slice(preview.indexOf("  preview:"), preview.indexOf("    steps:"));
  const previewDispatchGate = preview.indexOf("Validate G12 canary dispatch authorization before checkout");
  const previewCheckout = preview.indexOf("actions/checkout@");
  assert.doesNotMatch(previewHeader, /\n {4}if:/);
  assert.ok(previewDispatchGate >= 0 && previewDispatchGate < previewCheckout);
  assert.match(preview, /\[ "\$CONFIRMATION" != "CANARY-G12-STAGING:\$EXPECTED_SHA:FULL" \]/);
  assert.match(preview, /\[ "\$FULL_CANDIDATE" != "true" \]/);
  assert.match(production, /AUTORIZO-G12-PRODUCAO/);
  assert.match(production, /git -C control merge-base --is-ancestor/);
  assert.match(production, /check-github-controls\.mjs/);
  assert.match(production, /secrets\.RELEASE_GUARD_TOKEN/);
  assert.match(githubGuard, /\/actions\/workflows\/ci\.yml/);
  assert.match(githubGuard, /event=push/);
  assert.match(
    githubGuard,
    /\/actions\/runs\/\$\{ciWorkflowRun\.id\}\/attempts\/\$\{ciWorkflowRun\.run_attempt\}\/jobs/,
  );
  assert.doesNotMatch(githubGuard, /successfulRuns|flatMap/);
  assert.doesNotMatch(production, /secrets\.GITHUB_RELEASE_GUARD_TOKEN/);
  assert.match(production, /validate-production-config\.mjs/);
  assert.match(production, /validate-production-backend-config\.mjs/);
  assert.match(production, /actions: read/);
  assert.match(production, /verify-staging-run\.mjs/);
  assert.match(production, /steps\.staging_run\.outputs\.evidence_artifact_id/);
  assert.match(production, /steps\.staging_run\.outputs\.candidate_artifact_id/);
  assert.match(production, /verify-staging-artifact\.mjs/);
  assert.match(production, /verify-staging-candidate-artifact\.mjs/);
  assert.match(production, /verify-production-backup-run\.mjs/);
  assert.match(production, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/);
  assert.match(production, /artifact-ids: \$\{\{ steps\.backup_run\.outputs\.artifact_id \}\}/);
  assert.match(production, /digest-mismatch: error/);
  assert.match(production, /verify-production-backup-artifact\.mjs/);
  assert.match(production, /verify-production-email-run\.mjs/);
  assert.match(production, /steps\.email_run\.outputs\.artifact_id/);
  assert.match(production, /verify-production-email-artifact\.mjs/);
  const stagingGate = production.indexOf("verify-staging-artifact.mjs");
  const backupGate = production.indexOf("verify-production-backup-artifact.mjs");
  const emailGate = production.indexOf("verify-production-email-artifact.mjs");
  const firstDatabaseMutation = production.indexOf("supabase db push");
  assert.ok(
    stagingGate >= 0 &&
      stagingGate < backupGate &&
      backupGate < emailGate &&
      emailGate < firstDatabaseMutation,
    "remote staging, backup and delivered-email artifacts must be checked in chronological order before mutation",
  );
  assert.ok(
    production.indexOf("verify-production-backup-artifact.mjs") < production.indexOf("ev2-g12-preflight"),
    "the exact backup artifact must be verified before any Pages publication",
  );
  assert.ok(
    production.indexOf("verify-production-backup-artifact.mjs") < production.indexOf("supabase db push"),
    "the exact backup artifact must be verified before database mutation",
  );
  assert.match(production, /supabase db push --db-url "\$PRODUCTION_SUPABASE_DB_URL" --include-all --yes/);
  assert.match(production, /--source \.\.\/candidate --rollback-source \.\.\/rollback-backend/);
  assert.equal(
    (production.match(/--source \.\.\/candidate --rollback-source \.\.\/rollback-backend/g) ?? []).length,
    3,
  );
  assert.match(production, /create-production-backend-evidence\.mjs/);
  assert.match(production, /production-backend-\$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(production, /candidate\/outputs\/production-backend-evidence/);
  assert.match(production, /\$evidence_dir\/manifest\.json/);
  assert.match(production, /configure-production-auth\.mjs/);
  assert.match(production, /configure-production-vault\.mjs/);
  assert.equal((production.match(/configure-production-function-secrets\.mjs/g) ?? []).length, 4);
  assert.equal((production.match(/configure-production-auth\.mjs/g) ?? []).length, 4);
  assert.equal((production.match(/configure-production-vault\.mjs/g) ?? []).length, 4);
  assert.match(production, /verify-production-database\.mjs/);
  assert.doesNotMatch(production, /VITE_TURNSTILE_SITE_KEY:/);
  assert.match(productionBridge, /VITE_TURNSTILE_SITE_KEY: \$\{\{ secrets\.VITE_TURNSTILE_SITE_KEY \}\}/);
  assert.match(productionBridge, /VITE_CONTACT_CAPTCHA_ALWAYS: "true"/);
  assert.match(production, /version: 2\.116\.0/);
  assert.match(production, /ev2-g12-preflight/);
  assert.match(production, /Confirm live baseline is the immutable frontend bridge A/);
  assert.match(production, /Restore the approved prior Pages deployment after any post-mutation failure/);
  assert.match(production, /verify-backend-forward-compatibility\.mjs/);
  assert.match(production, /Converge the forward-compatible candidate Edge Functions after failure/);
  assert.match(production, /id: recovery_database/);
  assert.match(production, /id: recovery_functions/);
  assert.match(production, /id: recovery_function_secrets/);
  assert.match(production, /id: recovery_auth/);
  assert.match(production, /id: recovery_vault/);
  assert.match(production, /id: recovery_verification/);
  assert.match(production, /steps\.database_migration\.outcome != 'skipped'/);
  assert.match(production, /steps\.recovery_database\.outcome == 'success'/);
  assert.match(production, /steps\.promote\.outcome != 'skipped'/);
  assert.match(production, /steps\.production_release_evidence\.outcome == 'failure'/);
  assert.match(production, /steps\.production_backend_evidence\.outcome == 'failure'/);
  assert.match(production, /steps\.production_evidence_index\.outcome == 'failure'/);
  assert.equal((production.match(/if-no-files-found: error/g) ?? []).length, 6);
  assert.equal(new Set(PRODUCTION_RELEASE_EVIDENCE_PATHS).size, PRODUCTION_RELEASE_EVIDENCE_PATHS.length);
  assert.match(production, /index-production-release-evidence\.mjs/);
  assert.match(production, /seal-production-release-evidence\.mjs/);
  assert.match(production, /name: production-failure-\$\{\{ inputs\.candidate_sha \}\}/);
  assert.match(production, /if-no-files-found: ignore/);
  assert.match(production, /Prove the live approved baseline against the candidate backend/);
  assert.match(production, /EV2_G12_EXPECTED_SHA: \$\{\{ steps\.baseline\.outputs\.release \}\}/);
  assert.match(production, /g12-production-baseline-forward-backend\.json/);
  assert.doesNotMatch(production, /restore-production-functions\.mjs/);
  assert.ok(production.indexOf("ev2-g12-preflight") < production.indexOf("--branch main"));
  assert.ok(production.indexOf("ev2-g12-preflight") < production.indexOf("supabase db push"));
  assert.ok(production.indexOf("verify-production-database.mjs") < production.indexOf("--branch main"));
  assert.ok(
    production.indexOf("Prove the live approved baseline against the candidate backend") <
      production.indexOf("--branch main"),
    "the live baseline must be probed against the forward backend before promotion",
  );
  assert.ok(
    production.indexOf("id: recovery_database") < production.indexOf("id: recovery_functions"),
    "partial database mutations must converge before Edge Functions are recovered",
  );
  assert.ok(
    production.indexOf("id: production_evidence_index") <
      production.indexOf("id: production_release_evidence") &&
      production.indexOf("id: production_release_evidence") < production.indexOf("id: pages_recovery") &&
      production.indexOf("id: production_backend_evidence") < production.indexOf("id: pages_recovery"),
    "every mandatory file and both upload outcomes must be captured before terminal compensation",
  );
  assert.ok(
    production.indexOf("id: recovery_functions") < production.indexOf("id: recovery_verification") &&
      production.indexOf("id: recovery_function_secrets") < production.indexOf("id: recovery_verification") &&
      production.indexOf("id: recovery_auth") < production.indexOf("id: recovery_verification") &&
      production.indexOf("id: recovery_vault") < production.indexOf("id: recovery_verification"),
    "recovery must reconverge every mutable backend control before verification",
  );
  assert.equal((production.match(/deploy-sealed-production-dist\.mjs/g) ?? []).length, 2);
  assert.ok(
    production.indexOf("seal-production-dist.mjs") < production.indexOf("ev2-g12-preflight") &&
      production.lastIndexOf("deploy-sealed-production-dist.mjs") <= production.indexOf("--branch main"),
    "the immutable dist archive must be created once and deployed through its verifier to both targets",
  );
  assert.doesNotMatch(production, /VITE_EV2_[A-Z0-9_]+: ["']true["']/);
  const deployJobPreamble = production.slice(
    production.indexOf("  deploy:"),
    production.indexOf("    steps:"),
  );
  assert.doesNotMatch(deployJobPreamble, /secrets\.|CLOUDFLARE_|PRODUCTION_SUPABASE_/);
  const previewPublication = production.indexOf(
    "Deploy the single sealed artifact to an isolated production-project preview",
  );
  const candidateValidation = production.slice(
    production.indexOf("Install and validate exact candidate"),
    previewPublication,
  );
  assert.ok(previewPublication >= 0);
  assert.doesNotMatch(candidateValidation, /secrets\.|CLOUDFLARE_|PRODUCTION_SUPABASE_/);
  assert.doesNotMatch(production, /workingDirectory: candidate/);
  assert.match(
    production,
    /working-directory: control\r?\n\s+run: node scripts\/ev2\/phase12\/rollout-probe\.mjs/,
  );
  assert.match(
    rollback,
    /ROLLBACK-G12-PRODUCTION:\$EXPECTED_RELEASE:\$DEPLOYMENT_ID:\$FORWARD_BACKEND_RELEASE:\$FORWARD_BACKEND_RUN_ID/,
  );
  assert.match(rollback, /CANDIDATE_SHA: \$\{\{ inputs\.expected_release \}\}/);
  assert.match(githubGuard, /head_sha=\$\{candidateSha\}/);
  assert.match(
    githubGuard,
    /\/actions\/runs\/\$\{ciWorkflowRun\.id\}\/attempts\/\$\{ciWorkflowRun\.run_attempt\}\/jobs/,
  );
  assert.doesNotMatch(githubGuard, /\/check-runs/);
  const rollbackJobPreamble = rollback.slice(rollback.indexOf("  rollback:"), rollback.indexOf("    steps:"));
  assert.doesNotMatch(rollbackJobPreamble, /secrets\.|CLOUDFLARE_/);
  assert.doesNotMatch(rollback, /npm ci|actions\/setup-node/);
  assert.match(rollback, /supabase\/setup-cli@/);
  assert.match(rollback, /forward_backend_release/);
  assert.match(rollback, /forward_backend_run_id/);
  assert.match(rollback, /actions\/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c/);
  assert.match(rollback, /verify-backend-forward-compatibility\.mjs/);
  assert.match(rollback, /verify-production-backend-evidence\.mjs/);
  assert.match(rollback, /g12-production-rollback-preflight-backend-evidence\.json/);
  assert.match(rollback, /g12-production-rollback-target-backend-evidence\.json/);
  assert.match(rollback, /g12-production-rollback-final-target-backend-evidence\.json/);
  assert.match(rollback, /g12-production-rollback-compensation-backend-evidence\.json/);
  assert.match(rollback, /g12-production-rollback-preflight-functions\.json/);
  assert.match(rollback, /node \.\.\/backend\/scripts\/ev2\/phase12\/verify-production-functions\.mjs/);
  assert.match(rollback, /node \.\.\/backend\/scripts\/ev2\/phase12\/verify-production-database\.mjs/);
  assert.doesNotMatch(rollback, /deploy-production-functions\.mjs/);
  assert.match(rollback, /verify-production-database\.mjs/);
  assert.doesNotMatch(rollback, /restore-production-functions\.mjs/);
  assert.ok(
    rollback.indexOf("verify-production-backend-evidence.mjs") <
      rollback.indexOf("cloudflare-pages.mjs rollback"),
    "the retained backend identity and live schema must pass before Pages mutates",
  );
  assert.match(deployStaging, /supabase db push --linked --include-all --yes/);
  assert.match(deployStaging, /deploy-staging-functions\.mjs[\s\S]*--rollback-source \.\.\/baseline/);
  assert.match(deployStaging, /g12-staging-function-deployment\.json/);
  assert.match(deployStaging, /--environment staging --project-ref/);
  assert.match(deployStaging, /verify-staging-database\.mjs/);
  assert.match(deployStaging, /canary:ev2:phase17/);
  assert.match(deployStaging, /--branch ev2-g17-canary/);
  assert.match(deployStaging, /Build the approved rollback frontend against the candidate backend/);
  assert.match(deployStaging, /working-directory: baseline/);
  assert.match(deployStaging, /--branch ev2-g12-rollback-compat/);
  assert.match(deployStaging, /--commit-hash \$\{\{ inputs\.rollback_ref \}\}/);
  assert.match(deployStaging, /g12-staging-rollback-compatibility\.json/);
  assert.ok(
    deployStaging.indexOf("verify-staging-database.mjs") <
      deployStaging.indexOf("--branch ev2-g12-rollback-compat"),
    "the rollback frontend must target the verified candidate backend",
  );
  assert.ok(
    deployStaging.indexOf("--branch ev2-g12-rollback-compat") <
      deployStaging.indexOf("--branch ev2-g17-canary"),
    "rollback compatibility must pass before the candidate deployment",
  );
  assert.match(stagingFunctionDeploy, /G12_STAGING_FUNCTION_INVENTORY_MISMATCH/);
  assert.match(stagingFunctionDeploy, /deployWithVerifiedCompensation/);
  assert.match(stagingFunctionDeploy, /STAGING_CANDIDATE_RECONVERGENCE_OR_VERIFICATION_FAILED/);
  assert.match(stagingFunctionDeploy, /g12\.staging\.functions\.deployment_verified/);
  assert.match(stagingDatabaseVerify, /migration_history_exact/);
  assert.match(stagingDatabaseVerify, /sourceMigrationManifest\(sourceRoot\)/);
  assert.match(stagingDatabaseVerify, /exactMigrationHistorySql\(migrations\)/);
  assert.match(migrationManifest, /array_agg\(version order by version\)/);
  assert.match(migrationManifest, /G12_MIGRATION_MANIFEST_INVALID/);
  assert.match(stagingDatabaseVerify, /qa_actor_watchdog_cron_active/);
  assert.match(stagingDatabaseVerify, /documents_bucket_private/);
  assert.match(backendCompatibility, /migration_rewritten/);
  assert.match(backendCompatibility, /migration_destructive/);
  assert.match(backendCompatibility, /migration_test_not_executed/);
  assert.match(backendCompatibility, /edge_function_removed/);
  assert.match(backendCompatibility, /"0061": \["supabase\/tests\/rls_qa_actor_lease\.test\.sql"/);
  assert.match(backendCompatibility, /"0063": \["supabase\/tests\/rls_cms_documents\.test\.sql"/);
  assert.match(
    backendCompatibility,
    /"0064": \[\s*"supabase\/tests\/rls_qa_mutation_compensation\.test\.sql"/,
  );
  assert.match(
    backendCompatibility,
    /"0080": \[\s*"supabase\/tests\/rls_cms_qa_rate_limit_proof\.test\.sql",\s*"tests\/contracts\/cms-qa-rate-limit-proof\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0081": \[\s*"supabase\/tests\/rls_cms_collaboration_assignee_directory\.test\.sql",\s*"tests\/contracts\/cms-collaboration-assignee-directory\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0082": \[\s*"supabase\/tests\/rls_cms_media_upload_abort\.test\.sql",\s*"tests\/components\/admin-media-upload-compensation\.test\.tsx"/,
  );
  assert.match(
    backendCompatibility,
    /"0083": \[\s*"supabase\/tests\/rls_cms_session_security_finalization\.test\.sql",\s*"tests\/contracts\/cms-users-auth-scope\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0084": \[\s*"supabase\/tests\/rls_cms_lead_origin_form_binding\.test\.sql",\s*"tests\/contracts\/cms-lead-origin-binding\.test\.ts",\s*"tests\/contracts\/cms-lead-capture-expand-contract\.test\.ts",\s*"tests\/unit\/cms-lead-capture-envelope\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0085": \[\s*"supabase\/tests\/rls_cms_public_relation_limit\.test\.sql",\s*"tests\/contracts\/cms-public-relation-limit\.test\.ts",\s*"tests\/unit\/cms-public-relations\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0086": \[\s*"supabase\/tests\/rls_qa_actor_lease\.test\.sql",\s*"supabase\/tests\/rls_qa_mutation_compensation\.test\.sql",\s*"supabase\/tests\/rls_cms_forms_leads_scope\.test\.sql",\s*"supabase\/tests\/rls_cms_ai_authoritative_scope\.test\.sql",\s*"tests\/contracts\/cms-qa-actor-runtime-repairs\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0087": \[\s*"supabase\/tests\/rls_cms_session_security_finalization\.test\.sql",\s*"supabase\/tests\/rls_cms_system_rbac_scope\.test\.sql",\s*"supabase\/tests\/rls_cms_visual_multisite_scope\.test\.sql",\s*"supabase\/tests\/rls_cms_collaboration_release_bulk_scope\.test\.sql",\s*"tests\/contracts\/cms-runtime-integrity-repairs\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0088": \[\s*"supabase\/tests\/rls_cms_media_upload_abort\.test\.sql",\s*"supabase\/tests\/rls_ev2_phase10_ai\.test\.sql",\s*"supabase\/tests\/rls_ev2_phase5_dam\.test\.sql",\s*"supabase\/tests\/rls_ev2_phase11_system\.test\.sql",\s*"supabase\/tests\/rls_cms_deployed_command_actor_context\.test\.sql",\s*"tests\/contracts\/cms-runtime-integrity-followup\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0089": \[\s*"supabase\/tests\/rls_cms_operational_events_read_scale\.test\.sql",\s*"tests\/contracts\/cms-operational-events-read-scale\.test\.ts"/,
  );
  assert.match(
    backendCompatibility,
    /"0090": \[\s*"supabase\/tests\/rls_cms_qa_lease_document_canonical_fence\.test\.sql",\s*"tests\/contracts\/cms-qa-lease-document-canonical-fence\.test\.ts"/,
  );
  // A travessia autenticada do frontend de rollback le o handoff das entidades nascidas na UI. Esse
  // handoff so pode ser criado contra a origem canonica de staging, porque o ciclo mutante recusa
  // qualquer origem diferente da fixada para o ambiente, inclusive a URL efemera do canario de
  // rollback. Logo a travessia tem de rodar depois do ciclo do candidato e antes de o ator mutante
  // ser revogado, que e a unica janela em que as entidades existem.
  {
    const candidateCycle = deployStaging.indexOf(
      "Run the complete authenticated mutating editorial cycle first",
    );
    const rollbackTraversal = deployStaging.indexOf(
      "Traverse the rollback frontend with an AAL2 session against the candidate backend",
    );
    const revoke = deployStaging.indexOf("Revoke the mutating browser actor and verify zero active residue");
    assert.ok(candidateCycle > 0 && rollbackTraversal > 0 && revoke > 0);
    assert.ok(candidateCycle < rollbackTraversal, "the handoff must exist before the rollback traversal");
    assert.ok(rollbackTraversal < revoke, "the entities must still exist when the rollback traversal runs");

    // O bloco de rollback nao pode mutar: a origem efemera nao e a fixada e o proprio teste recusaria.
    const rollbackBlock = deployStaging.slice(
      deployStaging.indexOf("Install the isolated browser for authenticated rollback compatibility"),
      revoke,
    );
    assert.doesNotMatch(rollbackBlock, /--grep @ui-bootstrap/);
    assert.doesNotMatch(rollbackBlock, /--grep @mutating/);
    assert.match(rollbackBlock, /QA_CMS_ROLLBACK_COMPATIBILITY: "true"/);
  }
  assert.match(stagingDatabaseVerify, /media_upload_abort_0082_rpcs_privileges_exact/);
  assert.match(stagingDatabaseVerify, /media_upload_abort_0082_helpers_locked/);
  assert.match(stagingDatabaseVerify, /session_refresh_revocation_0083_semantics_exact/);
  assert.match(stagingDatabaseVerify, /lead_origin_binding_0084_helpers_locked/);
  assert.match(stagingDatabaseVerify, /lead_origin_binding_0084_semantics_exact/);
  assert.match(stagingDatabaseVerify, /public_relation_limit_0085_helpers_locked/);
  assert.match(stagingDatabaseVerify, /public_relation_limit_0085_semantics_exact/);
  assert.match(stagingDatabaseVerify, /public_relation_limit_0085_existing_rows_valid/);
  assert.match(stagingDatabaseVerify, /qa_actor_runtime_repairs_0086_functions_locked/);
  assert.match(stagingDatabaseVerify, /qa_actor_runtime_repairs_0086_semantics_exact/);
  assert.match(stagingDatabaseVerify, /runtime_integrity_repairs_0087_rpcs_privileges_exact/);
  assert.match(stagingDatabaseVerify, /runtime_integrity_repairs_0087_functions_locked/);
  assert.match(stagingDatabaseVerify, /runtime_integrity_repairs_0087_semantics_exact/);
  assert.match(stagingDatabaseVerify, /runtime_integrity_followup_0088_rpcs_privileges_exact/);
  assert.match(stagingDatabaseVerify, /runtime_integrity_followup_0088_functions_locked/);
  assert.match(stagingDatabaseVerify, /runtime_integrity_followup_0088_semantics_exact/);
  assert.match(backendCompatibility, /compatibilityEvidenceExecutionVerified: true/);
  assert.match(production, /probe-supabase-boundary\.mjs/);
  assert.match(deployStaging, /probe-supabase-boundary\.mjs/);
  assert.match(backendBoundaryProbe, /public_response_has_no_secret_material/);
  assert.match(backendBoundaryProbe, /arbitrary_pages_branch/);
  assert.match(backendBoundaryProbe, /suffix_spoof/);
  assert.match(backendBoundaryProbe, /origin !== expectedOrigin/);
  assert.match(functionRestore, /functions", "delete"/);
  assert.match(functionRestore, /G12_PRODUCTION_FUNCTION_ROLLBACK_LIVE_INVENTORY_UNMANAGED/);
  assert.match(functionRestore, /verifyJwt === PUBLIC_FUNCTIONS\.has/);
  assert.match(functionDeploy, /--rollback-source/);
  assert.match(functionDeploy, /deployWithVerifiedCompensation/);
  assert.match(functionDeploy, /CANDIDATE_RECONVERGENCE_OR_VERIFICATION_FAILED/);
  assert.doesNotMatch(functionDeploy, /restore-production-functions\.mjs/);
  assert.match(functionDeploy, /attempt <= 2/);
  assert.match(functionDeploymentLib, /errorPrefix = "G12_PRODUCTION_FUNCTION"/);
  assert.match(functionDeploymentLib, /\$\{errorPrefix\}_DEPLOY_FAILED_COMPENSATED/);
  assert.match(functionDeploymentLib, /\$\{errorPrefix\}_COMPENSATION_FAILED/);
  assert.match(backendEvidenceCreate, /g12\.production\.backend\.sealed/);
  assert.match(backendEvidenceVerify, /liveMigrations/);
  assert.match(backendEvidenceVerify, /actions\/runs\/\$\{expectedRunId\}/);
  assert.match(functionSecretsConfig, /evaluateProductionFunctionSecretInventory/);
  assert.match(functionSecretsConfig, /\/accounts\/\$\{accountId\}\/tokens\/verify/);
  assert.match(functionSecretsConfig, /CLOUDFLARE_CACHE_PURGE_TOKEN_ID/);
  assert.match(functionSecretsConfig, /__g12-purge-capability-/);
  assert.doesNotMatch(functionSecretsConfig, /console\.log\(secrets|JSON\.stringify\(secrets/);
  assert.match(distSeal, /sealProductionDistArchive/);
  assert.match(distSealVerify, /verifyProductionDistSeal/);
  assert.match(releaseEvidenceIndex, /buildProductionReleaseEvidenceIndex/);
  assert.match(
    backendConfig,
    /externalAiProviderEnabled: process\.env\.CMS_AI_EXTERNAL_PROVIDER_ENABLED === "true"/,
  );
  assert.match(cloudflare, /productionDeploymentIdentity\(projectDetails\.canonical_deployment\)/);
  assert.match(cloudflare, /projectDetails\?\.production_branch !== "main"/);
  assert.doesNotMatch(cloudflare, /deployments\?env=production&per_page=1/);
  assert.match(cloudflare, /target\?\.environment !== "production"/);
  assert.match(cloudflare, /deployments\/\$\{deploymentId\}\/rollback/);
  assert.match(canary, /g12-staging-integrated-reduced-v2/);
  assert.match(canary, /probe,/);
  assert.match(canary, /scripts\/ev2\/phase11\/staging-canary\.mjs/);
  assert.match(canary, /for \(let index = 0; index < 3; index \+= 1\)/);
  assert.match(canary, /syntheticOnly: true/);
  assert.match(canary, /productionMutations: 0/);
  assert.match(g11Canary, /EV2_G11_CANDIDATE_ORIGIN/);
  assert.match(g11Canary, /validateReleaseManifest/);
  assert.match(g11Canary, /resolveStableBaseline/);
  assert.match(stableBaseline, /stable_release_contract_mismatch/);
  assert.match(stableBaseline, /legacy-root-fingerprint/);
  assert.match(verifier, /canonicalTextSha256\(evidenceBytes\)/);
  assert.match(verifier, /validateCanaryEvidenceBinding/);
  assert.match(verifier, /validateBackupEvidenceBinding/);
  assert.match(verifier, /production deploys require schemaVersion 3/);
  assert.match(backendConfig, /G12_PRODUCTION_BACKEND_CONFIG_BLOCKED/);
  assert.match(functionDeploy, /G12_PRODUCTION_FUNCTION_INVENTORY_MISMATCH/);
  assert.match(functionDeploy, /--no-verify-jwt/);
  assert.match(functionVerify, /evaluateFunctionInventory/);
  assert.match(databaseVerify, /all_public_tables_rls/);
  assert.match(databaseVerify, /migration_history_exact/);
  assert.match(databaseVerify, /sourceMigrationManifest\(sourceRoot\)/);
  assert.match(databaseVerify, /exactMigrationHistorySql\(migrations\)/);
  assert.match(databaseVerify, /qa_actor_watchdog_cron_active/);
  assert.match(databaseVerify, /outbox_cron_exact/);
  assert.match(databaseVerify, /schedule = '\*\/5 \* \* \* \*'/);
  assert.match(databaseVerify, /command = 'select private\.invoke_outbox_worker\(\);'/);
  assert.match(databaseVerify, /worker_url_exact/);
  assert.match(databaseVerify, /worker_secret_exact/);
  assert.match(databaseVerify, /media_upload_abort_0082_rpcs_privileges_exact/);
  assert.match(databaseVerify, /media_upload_abort_0082_helpers_locked/);
  assert.match(databaseVerify, /session_refresh_revocation_0083_semantics_exact/);
  assert.match(databaseVerify, /lead_origin_binding_0084_helpers_locked/);
  assert.match(databaseVerify, /lead_origin_binding_0084_semantics_exact/);
  assert.match(databaseVerify, /public_relation_limit_0085_helpers_locked/);
  assert.match(databaseVerify, /public_relation_limit_0085_semantics_exact/);
  assert.match(databaseVerify, /public_relation_limit_0085_existing_rows_valid/);
  assert.match(databaseVerify, /qa_actor_runtime_repairs_0086_functions_locked/);
  assert.match(databaseVerify, /qa_actor_runtime_repairs_0086_semantics_exact/);
  assert.match(databaseVerify, /runtime_integrity_repairs_0087_rpcs_privileges_exact/);
  assert.match(databaseVerify, /runtime_integrity_repairs_0087_functions_locked/);
  assert.match(databaseVerify, /runtime_integrity_repairs_0087_semantics_exact/);
  assert.match(databaseVerify, /runtime_integrity_followup_0088_rpcs_privileges_exact/);
  assert.match(databaseVerify, /runtime_integrity_followup_0088_functions_locked/);
  assert.match(databaseVerify, /runtime_integrity_followup_0088_semantics_exact/);
  assert.match(authConfig, /disable_signup: true/);
  assert.match(vaultConfig, /cms_outbox_worker_secret/);
  const approvalTemplate = JSON.parse(template);
  assert.equal(approvalTemplate.decision, "pending");
  assert.equal(approvalTemplate.productionAuthorized, false);
  assert.equal(approvalTemplate.schemaVersion, 3);
  assert.equal(approvalTemplate.productionAuthorizationSha, null);
  assert.equal(approvalTemplate.productionReadiness.dpoLegal.status, "approved");
  assert.equal(approvalTemplate.productionReadiness.dpoLegal.approverId, "Vnd93");
  assert.match(approvalTemplate.productionReadiness.dpoLegal.scopeSha256, /^[a-f0-9]{64}$/);
  assert.equal(
    approvalTemplate.productionReadiness.dpoLegal.evidenceReference,
    CANONICAL_DPO_EVIDENCE_REFERENCE,
  );
  assert.equal(approvalTemplate.operationalGovernance.evidenceReference, CANONICAL_DPO_EVIDENCE_REFERENCE);
  assert.equal(approvalTemplate.productionReadiness.csp.evidenceSha256, null);
  assert.equal(approvalTemplate.productionReadiness.csp.adminPolicySha256, null);
  assert.equal(
    approvalTemplate.productionReadiness.backupRestore.backupWorkflow,
    ".github/workflows/backup-supabase-production.yml",
  );
  assert.equal(approvalTemplate.target.cloudflareAccountId, null);
  assert.equal(approvalTemplate.target.cloudflareZoneId, null);
  assert.equal(approvalTemplate.target.cachePurgeTokenId, null);
  assert.equal(approvalTemplate.productionReadiness.backupRestore.backupRef, "refs/heads/main");
  assert.equal(approvalTemplate.productionReadiness.backupRestore.evidenceSha256, null);
  assert.equal(approvalTemplate.productionReadiness.githubProtection.governanceMode, "sole-maintainer");
  assert.equal(approvalTemplate.productionReadiness.githubProtection.maintainerLogin, "Vnd93");
  assert.equal(approvalTemplate.productionReadiness.githubProtection.requiredPullRequestApprovals, 0);
  assert.equal(approvalTemplate.operationalGovernance.mode, "sole-operator");
  assert.equal(approvalTemplate.operationalGovernance.responsibleId, "Vnd93");
  assert.equal(approvalTemplate.operationalGovernance.riskAccepted, true);
  assert.equal(approvalTemplate.candidateSha, null);
  assert.equal(approvalTemplate.g12Evidence.file, null);
});

test("versioned release controls bind the completed G12 approval to immutable evidence", async () => {
  const [approvalRaw, evidenceRaw, cspEvidenceRaw] = await Promise.all([
    read(".github/release-controls/approvals/G12_e52b25d903251cf538918d89049a58524c3c9911.json"),
    read(".github/release-controls/evidence/G12_CANARY_e52b25d_2026-09-05.json"),
    read(".github/release-controls/evidence/G16_CSP_BROWSER_e52b25d.json"),
  ]);
  const approval = JSON.parse(approvalRaw);
  const evidence = JSON.parse(evidenceRaw);
  const cspEvidence = JSON.parse(cspEvidenceRaw);
  assert.equal(
    validateApprovalRecord(approval).valid,
    true,
    "schema v2 remains readable for historical audit",
  );
  assert.equal(approval.decision, "approved");
  assert.equal(approval.productionAuthorized, true);
  assert.equal(approval.candidateSha, "e52b25d903251cf538918d89049a58524c3c9911");
  assert.equal(
    approval.productionAuthorizationText,
    "AUTORIZO-G12-PRODUCAO:e52b25d903251cf538918d89049a58524c3c9911",
  );
  assert.equal(approval.g12Evidence.productionMutations, 0);
  assert.equal(
    resolveDpoEvidenceReference(approval.operationalGovernance.evidenceReference, {
      candidateSha: approval.candidateSha,
    }),
    CANONICAL_DPO_EVIDENCE_REFERENCE,
  );
  assert.equal(
    resolveDpoEvidenceReference(approval.productionReadiness.dpoLegal.evidenceReference, {
      candidateSha: approval.candidateSha,
    }),
    CANONICAL_DPO_EVIDENCE_REFERENCE,
  );
  assert.equal(
    resolveG12EvidenceRepositoryPath(approval.g12Evidence.file),
    ".github/release-controls/evidence/G12_CANARY_e52b25d_2026-09-05.json",
  );
  assert.deepEqual(
    validateCanaryEvidenceBinding(approval, evidence, {
      reportSha256: canonicalTextSha256(evidenceRaw),
    }),
    { valid: true, violations: [] },
  );
  assert.equal(evidence.outcome, "G12_CANARY_PASS");
  assert.equal(evidence.productionMutations, 0);
  assert.deepEqual(
    validateCspEvidenceBinding(approval.productionReadiness.csp, cspEvidence, {
      reportSha256: canonicalTextSha256(cspEvidenceRaw),
      expectedPolicySha256: cspPolicySha256,
      expectedAdminPolicySha256: cspAdminPolicySha256,
    }),
    {
      valid: true,
      violations: [],
      binding: {
        repositoryPath: ".github/release-controls/evidence/G16_CSP_BROWSER_e52b25d.json",
        evidenceSha256: HISTORICAL_G16_CSP_EVIDENCE_SHA256,
        historicalFallback: true,
      },
    },
  );
});
