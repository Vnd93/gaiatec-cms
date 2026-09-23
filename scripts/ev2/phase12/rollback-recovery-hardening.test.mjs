import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

test("staging rollback restores the retained sealed candidate instead of rebuilding the target", async () => {
  const [workflow, sealedDeploy] = await Promise.all([
    read(".github/workflows/rollback-staging.yml"),
    read("scripts/ev2/phase12/deploy-sealed-staging-dist.mjs"),
  ]);
  const resolve = workflow.indexOf("Resolve staging-candidate by source run, artifact ID and digest");
  const verify = workflow.indexOf(
    "Materialize the exact target package with bounded legacy read-only compatibility",
  );
  const recoveryUpload = workflow.indexOf(
    "Upload mandatory exact rollback recovery bytes before state or mutation",
  );
  const stateUpload = workflow.indexOf("Upload redundant staging rollback state");
  const stateDownload = workflow.indexOf(
    "Download the just-uploaded rollback state by immutable artifact ID",
  );
  const recoveryDownload = workflow.indexOf(
    "Download the just-uploaded recovery bytes by immutable artifact ID",
  );
  const durableVerification = workflow.indexOf(
    "Reverify downloaded state and exact recovery bytes before mutation",
  );
  const hmacState = workflow.indexOf(
    "Persist redundant HMAC rollback state after both durable uploads are verified",
  );
  const backendVerification = workflow.indexOf("Verify the retained staging backend without mutation");
  const pagesMutation = workflow.indexOf(
    "Restore only the exact retained and sealed staging-candidate bytes",
  );

  assert.ok(resolve >= 0 && resolve < verify && verify < recoveryUpload);
  assert.ok(recoveryUpload < stateUpload && stateUpload < stateDownload);
  assert.ok(stateDownload < recoveryDownload && recoveryDownload < durableVerification);
  assert.ok(durableVerification < hmacState && hmacState < backendVerification);
  assert.ok(backendVerification < pagesMutation);
  assert.match(workflow, /artifact-ids: \$\{\{ steps\.target_artifact\.outputs\.artifact_id \}\}/);
  assert.match(workflow, /digest-mismatch: error/);
  assert.match(workflow, /materialize-staging-candidate-artifact\.mjs/);
  assert.match(workflow, /steps\.target_package\.outputs\.archive_path/);
  assert.match(workflow, /steps\.target_package\.outputs\.seal_path/);
  assert.doesNotMatch(workflow, /path:\s+staging-candidate-dist\.tar/);
  assert.match(workflow, /deploy-sealed-staging-dist\.mjs/);
  assert.doesNotMatch(
    workflow,
    /supabase db push|configure-staging-ai-provider-secrets\.mjs|deploy-staging-functions\.mjs/,
  );
  assert.doesNotMatch(workflow, /Build the prior frontend against staging/);
  assert.match(workflow, /G12_STAGING_ROLLBACK_FAILED_COMPENSATED/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(sealedDeploy, /details\?\.production_branch !== "main"/);
  assert.match(sealedDeploy, /G12_STAGING_SEALED_DEPLOY_CANONICAL_CAS_REFUSED/);
  assert.match(sealedDeploy, /deployment\?\.environment !== "preview"/);
  const adjacentCas = sealedDeploy.indexOf("const before = await currentBranchDeployment();");
  const mutatingSpawn = sealedDeploy.indexOf("const result = spawnSync", adjacentCas);
  assert.ok(adjacentCas >= 0 && adjacentCas < mutatingSpawn);
  for (const name of [
    "STAGING_ORIGINAL_DEPLOYMENT",
    "STAGING_ORIGINAL_RELEASE",
    "STAGING_ORIGINAL_CREATED_ON",
    "STAGING_ORIGINAL_COMMIT_MESSAGE_B64",
  ])
    assert.match(workflow, new RegExp(name));
});

test("staging rollback proves immutable original bytes and both durable uploads before mutation", async () => {
  const workflow = await read(".github/workflows/rollback-staging.yml");
  const index = (name) => {
    const value = workflow.indexOf(name);
    assert.ok(value >= 0, `missing rollback step: ${name}`);
    return value;
  };
  const recoveryUpload = index("Upload mandatory exact rollback recovery bytes before state or mutation");
  const stateUpload = index("Upload redundant staging rollback state");
  const stateDownload = index("Download the just-uploaded rollback state by immutable artifact ID");
  const recoveryDownload = index("Download the just-uploaded recovery bytes by immutable artifact ID");
  const durableVerification = index("Reverify downloaded state and exact recovery bytes before mutation");
  const hmacState = index("Persist redundant HMAC rollback state after both durable uploads are verified");
  const backendVerification = index("Verify the retained staging backend without mutation");
  const pagesMutation = index("Restore only the exact retained and sealed staging-candidate bytes");

  assert.ok(
    recoveryUpload < stateUpload &&
      stateUpload < stateDownload &&
      stateDownload < recoveryDownload &&
      recoveryDownload < durableVerification &&
      durableVerification < hmacState &&
      hmacState < backendVerification &&
      backendVerification < pagesMutation,
  );
  assert.doesNotMatch(workflow, /npm run build:staging|npm run artifact:manifest|seal-production-dist\.mjs/);

  const producerResolution = workflow.slice(
    index("Classify the exact immutable producer of the live staging deployment"),
    recoveryUpload,
  );
  assert.match(
    producerResolution,
    /classify-staging-rollback-baseline\.mjs[\s\S]*--deployment-id[\s\S]*--release[\s\S]*--created-on[\s\S]*--commit-message-b64/,
  );
  assert.match(
    producerResolution,
    /resolve-staging-rollback-deploy-artifact\.mjs[\s\S]*--run-id[\s\S]*--run-attempt[\s\S]*--candidate[\s\S]*--deployment-id[\s\S]*--created-on[\s\S]*--commit-message-b64/,
  );
  assert.match(
    producerResolution,
    /Download deploy evidence that attests the candidate artifact tuple[\s\S]*artifact-ids: \$\{\{ steps\.baseline_deploy_source\.outputs\.evidence_artifact_id \}\}[\s\S]*digest-mismatch: error/,
  );
  assert.match(
    producerResolution,
    /verify-staging-rollback-deploy-evidence\.mjs[\s\S]*--candidate[\s\S]*--artifact-id[\s\S]*--artifact-digest/,
  );
  assert.match(
    producerResolution,
    /Bind materialized deploy bytes to the deployment run evidence[\s\S]*test "\$ACTUAL_ARCHIVE" = "\$ATTESTED_ARCHIVE"[\s\S]*test "\$ACTUAL_TREE" = "\$ATTESTED_TREE"/,
  );
  assert.match(
    producerResolution,
    /Verify bridge evidence against the exact live deployment identity[\s\S]*EXPECTED_DEPLOYMENT_ID:[\s\S]*EXPECTED_CANONICAL_CREATED_ON:/,
  );
  assert.match(
    producerResolution,
    /resolve-ci-staging-frontend-artifact\.mjs[\s\S]*--run-id[\s\S]*--run-attempt[\s\S]*--gate-run-attempt[\s\S]*Bind the resolved CI tuple to bridge evidence/,
  );
  for (const field of ["ID", "DIGEST", "NAME"])
    assert.match(producerResolution, new RegExp(`test "\\$RESOLVED_${field}" = "\\$ATTESTED_${field}"`));
  assert.match(producerResolution, /resolve-staging-baseline-bootstrap\.mjs/);
  assert.match(producerResolution, /resolve-staging-baseline-compensation\.mjs/);
  assert.match(producerResolution, /deploy-v4\) archive=/);
  assert.match(producerResolution, /bridge-v5\) archive=/);
  assert.match(producerResolution, /bootstrap\|legacy-bootstrap-compensation\)/);
  assert.match(producerResolution, /deploy-compensation\|bridge-compensation\)/);
  assert.match(producerResolution, /\*\) echo G12_STAGING_ROLLBACK_BASELINE_MODE_REFUSED/);

  const recoveryUploadBlock = workflow.slice(recoveryUpload, stateUpload);
  const stateUploadBlock = workflow.slice(stateUpload, stateDownload);
  for (const block of [recoveryUploadBlock, stateUploadBlock]) {
    assert.match(block, /actions\/upload-artifact@[a-f0-9]+/);
    assert.match(block, /if-no-files-found: error/);
    assert.doesNotMatch(block, /continue-on-error:/);
    assert.doesNotMatch(block, /if:\s*always\(\)/);
  }
  assert.match(
    workflow.slice(stateDownload, recoveryDownload),
    /artifact-ids: \$\{\{ steps\.rollback_state_upload\.outputs\.artifact-id \}\}[\s\S]*digest-mismatch: error/,
  );
  assert.match(
    workflow.slice(recoveryDownload, durableVerification),
    /artifact-ids: \$\{\{ steps\.recovery_artifact_upload\.outputs\.artifact-id \}\}[\s\S]*digest-mismatch: error/,
  );

  const durableBlock = workflow.slice(durableVerification, hmacState);
  assert.match(durableBlock, /cmp -s \.\.\/rollback-staging-state\.json/);
  assert.match(durableBlock, /cmp -s "\$local_archive" "\$remote_archive"/);
  assert.match(durableBlock, /cmp -s "\$local_seal" "\$remote_seal"/);
  assert.match(durableBlock, /G12_STAGING_ROLLBACK_REMOTE_ARCHIVE_REFUSED/);
  assert.match(durableBlock, /G12_STAGING_ROLLBACK_REMOTE_STATE_BINDING_REFUSED/);
  assert.match(durableBlock, /verify-staging-recovery-seal\.mjs/);
  assert.match(durableBlock, /verify-production-dist-seal\.mjs/);
  assert.match(
    workflow.slice(stateUpload, backendVerification),
    /state\.recovery\?\.artifact\?\.id !== process\.env\.RECOVERY_ARTIFACT_ID[\s\S]*state\.recovery\?\.artifact\?\.digest !== process\.env\.RECOVERY_ARTIFACT_DIGEST/,
  );

  // Any missing/failed upload skips every ordinary downstream step. Every `always()` path that can
  // reach Pages, including compensation, independently requires durable bytes and HMAC state.
  assert.doesNotMatch(workflow.slice(recoveryUpload, backendVerification), /if:\s*always\(\)/);
  const mainMutation = workflow.slice(
    pagesMutation,
    index("Confirm only this rollback target became canonical"),
  );
  for (const gate of [
    "steps.durable_recovery_remote.outcome == 'success'",
    "steps.hmac_state.outcome == 'success'",
    "steps.backend_convergence.outcome == 'success'",
    "steps.install_wrangler.outcome == 'success'",
    "steps.original_recheck.outcome == 'success'",
  ])
    assert.ok(mainMutation.includes(gate), `main mutation missing gate: ${gate}`);

  const compensationDecision = index("Decide compensation without overwriting an external deployment");
  const compensation = index("Compensate only the still-canonical rollback target");
  const compensationRetry = index("Retry ambiguous rollback compensation safely");
  const compensationProbe = index("Re-probe original staging after compensation");
  for (const block of [
    workflow.slice(compensationDecision, compensation),
    workflow.slice(compensation, compensationRetry),
    workflow.slice(compensationRetry, compensationProbe),
  ]) {
    assert.match(block, /steps\.durable_recovery_remote\.outcome == 'success'/);
    assert.match(block, /steps\.hmac_state\.outcome == 'success'/);
  }
  assert.equal(
    [...workflow.matchAll(/staging-pages-state\.mjs compensate/g)].length,
    2,
    "every compensating Pages mutation must remain inside an explicitly gated step",
  );
});

test("staging rollback routes only the pinned legacy compensation through immutable bootstrap bytes", async () => {
  const workflow = await read(".github/workflows/rollback-staging.yml");
  const index = (name) => {
    const value = workflow.indexOf(name);
    assert.ok(value >= 0, `missing rollback step: ${name}`);
    return value;
  };
  const bootstrapRemote = index("Verify one-time bootstrap provenance against live GitHub metadata");
  const compensationRemote = index("Resolve exact failed run and immutable compensation artifacts");
  const stateDownload = index("Download exact deploy-compensation state by ID and digest");
  const recoveryDownload = index("Download exact compensation recovery bytes by ID and digest");
  const modernMaterialize = index("Verify compensation state and materialize exact recovery bytes");
  const legacyVerify = index("Verify pinned legacy bootstrap compensation before selecting bootstrap bytes");
  const bootstrapDownload = index("Download exact bootstrap bridge evidence by ID and digest");
  const bootstrapSourceDownload = index("Download exact bootstrap source bytes by ID and digest");
  const bootstrapMaterialize = index("Materialize exact bootstrap bytes without rebuilding");
  const normalize = index("Normalize only the selected immutable recovery archive and seal");
  const upload = index("Upload mandatory exact rollback recovery bytes before state or mutation");
  assert.ok(
    bootstrapRemote < compensationRemote &&
      compensationRemote < stateDownload &&
      stateDownload < recoveryDownload &&
      recoveryDownload < modernMaterialize &&
      modernMaterialize < legacyVerify &&
      legacyVerify < bootstrapDownload &&
      bootstrapDownload < bootstrapSourceDownload &&
      bootstrapSourceDownload < bootstrapMaterialize &&
      bootstrapMaterialize < normalize &&
      normalize < upload,
  );

  const producerRegion = workflow.slice(bootstrapRemote, normalize);
  assert.match(producerRegion, /legacy-bootstrap-compensation' && 'deploy-compensation'/);
  assert.match(producerRegion, /verify-staging-legacy-bootstrap-compensation\.mjs/);
  assert.match(
    producerRegion,
    /--state-artifact-id[\s\S]*--state-artifact-digest[\s\S]*--state-artifact-name/,
  );
  assert.match(
    producerRegion,
    /--recovery-artifact-id[\s\S]*--recovery-artifact-digest[\s\S]*--recovery-artifact-name/,
  );
  const modernBlock = workflow.slice(modernMaterialize, legacyVerify);
  assert.doesNotMatch(modernBlock, /legacy-bootstrap-compensation/);
  assert.match(modernBlock, /materialize-staging-baseline-compensation\.mjs/);
  for (const name of [
    "Verify one-time bootstrap provenance against live GitHub metadata",
    "Download exact bootstrap bridge evidence by ID and digest",
    "Download exact bootstrap source bytes by ID and digest",
    "Materialize exact bootstrap bytes without rebuilding",
  ]) {
    const start = index(name);
    const end = workflow.indexOf("\n      - name:", start + 1);
    assert.match(workflow.slice(start, end < 0 ? workflow.length : end), /legacy-bootstrap-compensation/);
  }
  const bootstrapMaterializeBlock = workflow.slice(bootstrapMaterialize, normalize);
  assert.match(
    bootstrapMaterializeBlock,
    /mkdir -p \.\.\/recovery-source[\s\S]*materialize-staging-baseline-bootstrap\.mjs/,
  );
  const normalizeBlock = workflow.slice(
    normalize,
    index("Verify exact recovered bytes before durable upload or mutation"),
  );
  assert.match(
    normalizeBlock,
    /bootstrap\|legacy-bootstrap-compensation\)[\s\S]*BOOTSTRAP_ARCHIVE[\s\S]*BOOTSTRAP_SEAL/,
  );
  assert.match(
    normalizeBlock,
    /deploy-compensation\|bridge-compensation\)[\s\S]*COMPENSATION_ARCHIVE[\s\S]*COMPENSATION_SEAL/,
  );
  assert.doesNotMatch(producerRegion, /npm run build|seal-production-dist|vite build/);
});

test("staging baseline inventory uses candidate tooling with a fail-closed explicit repository root", async () => {
  const [workflow, ci] = await Promise.all([
    read(".github/workflows/deploy-staging.yml"),
    read(".github/workflows/ci.yml"),
  ]);
  assert.match(ci, /\n {2}quality:\n[\s\S]*?actions\/checkout@[a-f0-9]+[\s\S]*?fetch-depth: 0/);

  // Todo job que roda `npm run check` precisa de historia completa. O teste logo abaixo clona o
  // proprio repositorio e faz `checkout --detach` num SHA historico; num clone raso esse objeto nao
  // existe e ele morre com "fatal: unable to read tree", sem relacao com o que o candidato mudou.
  const preview = await read(".github/workflows/preview.yml");
  assert.match(preview, /actions\/checkout@[a-f0-9]+[\s\S]{0,600}?fetch-depth: 0/);
  assert.ok(
    preview.indexOf("fetch-depth: 0") < preview.indexOf("- run: npm run check"),
    "a historia completa tem de ser pedida antes de `npm run check`",
  );

  // O contrato fixture x schema e prova de banco e roda no job que prova banco, com a historia que a
  // regra de acoplamento entre migration e fixture precisa para resolver o intervalo de diff.
  const database = ci.slice(ci.indexOf("  database:"), ci.indexOf("  browser:"));
  assert.match(database, /fetch-depth: 0/);
  assert.match(database, /run: npm run test:qa/);
  assert.ok(
    database.indexOf("npm run test:qa") < database.indexOf("supabase start"),
    "o contrato roda sem rede e deve reprovar antes de subir o banco local",
  );
  assert.match(
    workflow,
    /Run locked install, audit and source-only compatibility gates[\s\S]*working-directory: candidate[\s\S]*node scripts\/qa\/cms-coverage-inventory\.mjs \\\r?\n\s+--repository-root \.\.\/baseline \\\r?\n\s+--output \.\.\/baseline\/outputs\/cms-coverage-rollback\.json[\s\S]*Upload immutable source-validation handoff/,
  );
  assert.match(
    workflow,
    /Download immutable source validation by artifact ID[\s\S]*digest-mismatch: error[\s\S]*Reverify and materialize the source validation handoff/,
  );
  assert.doesNotMatch(
    workflow,
    /working-directory: baseline[\s\S]{0,400}(?:npm run build:staging|seal-production-dist\.mjs)/,
  );
  assert.doesNotMatch(workflow, /Build the approved rollback frontend/);

  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const inventoryScript = join(repositoryRoot, "scripts", "qa", "cms-coverage-inventory.mjs");
  const fixtureRoot = await mkdtemp(join(tmpdir(), "g12-inventory-root-"));
  const outputPath = join(fixtureRoot, "coverage.json");
  const historicalRoot = join(fixtureRoot, "historical");
  const historicalOutputPath = join(fixtureRoot, "historical-coverage.json");
  try {
    const valid = spawnSync(
      process.execPath,
      [inventoryScript, "--repository-root", repositoryRoot, "--output", outputPath],
      { cwd: fixtureRoot, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(valid.status, 0, valid.stderr || valid.stdout);
    const report = JSON.parse(await readFile(outputPath, "utf8"));
    assert.ok(report.counts?.surfaces > 0);

    const cloned = spawnSync(
      "git",
      ["clone", "--quiet", "--no-checkout", "--shared", repositoryRoot, historicalRoot],
      { encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(cloned.status, 0, cloned.stderr);
    const checkedOut = spawnSync(
      "git",
      ["checkout", "--quiet", "--detach", "f48bb4530566456a0090a98cd39caf1cacb51b09"],
      { cwd: historicalRoot, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(checkedOut.status, 0, checkedOut.stderr);
    const historical = spawnSync(
      process.execPath,
      [inventoryScript, "--repository-root", historicalRoot, "--output", historicalOutputPath],
      { cwd: fixtureRoot, encoding: "utf8", timeout: 60_000 },
    );
    assert.equal(historical.status, 0, historical.stderr || historical.stdout);
    const historicalReport = JSON.parse(await readFile(historicalOutputPath, "utf8"));
    assert.equal(historicalReport.sourceSha, "f48bb4530566456a0090a98cd39caf1cacb51b09");
    assert.equal(historicalReport.sourceDirty, false);
    assert.equal(historicalReport.inventoryMode, "historical-frontend-structural");
    assert.equal(historicalReport.coverageClaim?.structuralInventoryComplete, true);
    assert.equal(historicalReport.coverageClaim?.functionalCoverageClaimed, false);
    assert.equal(historicalReport.coverageClaim?.functionalEvidenceRequired, "authenticated-browser-canary");
    assert.ok(historicalReport.counts?.routerPatterns > 30);
    assert.ok(historicalReport.counts?.surfaces > historicalReport.counts?.routerPatterns);
    assert.ok(historicalReport.counts?.sourceControls > 100);

    const missingValue = spawnSync(process.execPath, [inventoryScript, "--repository-root"], {
      cwd: fixtureRoot,
      encoding: "utf8",
      timeout: 10_000,
    });
    assert.notEqual(missingValue.status, 0);
    assert.match(missingValue.stderr, /QA_CMS_ARGUMENT_VALUE_REQUIRED:repository-root/);

    const unavailable = spawnSync(
      process.execPath,
      [inventoryScript, "--repository-root", join(fixtureRoot, "missing")],
      { cwd: fixtureRoot, encoding: "utf8", timeout: 10_000 },
    );
    assert.notEqual(unavailable.status, 0);
    assert.match(unavailable.stderr, /QA_CMS_REPOSITORY_ROOT_UNAVAILABLE/);
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});

test("staging rollback watchdog handles every interrupted conclusion and preserves external deploys", async () => {
  const [workflow, pagesState] = await Promise.all([
    read(".github/workflows/rollback-staging-watchdog.yml"),
    read("scripts/ev2/phase12/staging-pages-state.mjs"),
  ]);
  assert.match(workflow, /workflow_run:\s+workflows: \["Rollback staging"\]\s+types: \[completed\]/);
  for (const conclusion of ["cancelled", "failure", "timed_out"])
    assert.match(workflow, new RegExp(`workflow_run\\.conclusion == '${conclusion}'`));
  assert.doesNotMatch(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /head_repository\.full_name == github\.repository/);
  assert.match(workflow, /recovery-state-store\.mjs get/);
  assert.match(workflow, /--allow-missing/);
  assert.doesNotMatch(workflow, /id: artifact_state|Fall back to the run state artifact/);
  assert.match(workflow, /id: rollback_no_state_evidence/);
  assert.match(workflow, /event: "g12\.staging\.rollback\.incomplete\.no-state"/);
  assert.match(workflow, /recoveryAttempted: false/);
  assert.match(workflow, /mutationsAttempted: false/);
  assert.match(
    workflow,
    /if \[ "\$STATE_PRESENT" = false \]; then[\s\S]*test "\$COMPENSATION_OUTCOME" = skipped[\s\S]*test "\$CLEAR_OUTCOME" = skipped[\s\S]*exit 0/,
  );
  assert.match(workflow, /verify-staging-recovery-seal\.mjs/);
  assert.match(workflow, /Download sealed original recovery bytes when available/);
  assert.doesNotMatch(workflow, /Rebuild only the original fallback/);
  assert.match(workflow, /Compare and clear HMAC state after terminal recovery evidence/);
  const decision = workflow.indexOf("id: watchdog_decision");
  const checkout = workflow.indexOf("id: watchdog_backend_checkout", decision);
  const cli = workflow.indexOf("id: watchdog_supabase_cli", checkout);
  const verification = workflow.indexOf("id: watchdog_backend_verification", cli);
  const compensation = workflow.indexOf("id: watchdog_compensation", verification);
  assert.ok(decision >= 0 && decision < checkout);
  assert.ok(checkout < cli && cli < verification && verification < compensation);
  const recovery = workflow.slice(checkout, compensation);
  assert.match(recovery, /ref: \$\{\{ steps\.watchdog_state\.outputs\.backend_release \}\}/);
  assert.match(recovery, /version: 2\.116\.0/);
  assert.match(recovery, /supabase functions list/);
  assert.match(recovery, /verify-production-functions\.mjs/);
  assert.match(recovery, /verify-staging-database\.mjs/);
  assert.doesNotMatch(
    recovery,
    /supabase db push|supabase functions deploy|configure-staging-ai-provider-secrets\.mjs|deploy-staging-functions\.mjs/,
  );
  assert.match(workflow, /id: watchdog_terminal_canonical/);
  assert.match(workflow, /retainedBackend: state\.retainedBackend/);
  assert.match(workflow, /g12-staging-rollback-functions-watchdog\.json/);
  const clear = workflow.slice(
    workflow.indexOf("id: clear_recovery_state"),
    workflow.indexOf("- name: Enforce interrupted rollback", workflow.indexOf("id: clear_recovery_state")),
  );
  for (const required of [
    "watchdog_backend_checkout",
    "watchdog_supabase_cli",
    "watchdog_backend_verification",
    "watchdog_terminal_canonical",
  ])
    assert.match(clear, new RegExp(`steps\\.${required}\\.outcome == 'success'`));
  assert.match(pagesState, /G12_STAGING_EXTERNAL_DEPLOYMENT_PRESERVED/);
  assert.match(pagesState, /sameStagingDeployment\(current, original\)/);
  assert.match(pagesState, /current\.commitMessage === state\.compensationMarker/);
  assert.match(pagesState, /stagingReconcileDecision\(current, state\) !== "already-original"/);
  const adjacentCompare = pagesState.indexOf("const adjacent = await currentBranchDeployment(context);");
  const compensationMutation = pagesState.indexOf("const result = spawnSync", adjacentCompare);
  assert.ok(adjacentCompare >= 0 && adjacentCompare < compensationMutation);
  assert.match(pagesState.slice(adjacentCompare, compensationMutation), /sameStagingDeployment/);
});

test("deploy staging and production rollback recovery have HMAC artifact-independent state", async () => {
  const [deploy, deployWatchdog, rollback, rollbackWatchdog] = await Promise.all([
    read(".github/workflows/deploy-staging.yml"),
    read(".github/workflows/deploy-staging-watchdog.yml"),
    read(".github/workflows/rollback-production.yml"),
    read(".github/workflows/rollback-production-watchdog.yml"),
  ]);
  assert.match(deploy, /recovery-state-store\.mjs put\s+--kind staging-deploy/);
  assert.match(deploy, /Recover signed staging state when artifact download is unavailable/);
  assert.doesNotMatch(deploy, /Reconstruct and seal original staging only after artifact-service failure/);
  assert.match(deploy, /--dist \.\.\/recovery\/dist/);
  assert.match(deploy, /--seal \.\.\/recovery\/outputs\/staging-baseline-dist-seal\.json/);
  assert.match(deployWatchdog, /Recover HMAC staging state independently of artifacts/);
  assert.doesNotMatch(deployWatchdog, /Reconstruct and seal original staging after artifact-service failure/);
  assert.doesNotMatch(deployWatchdog, /recovery-fallback/);
  assert.match(rollback, /recovery-state-store\.mjs put\s+--kind production-rollback/);
  assert.match(rollback, /Recover HMAC production rollback state after artifact failure/);
  assert.match(rollbackWatchdog, /Recover HMAC production rollback state after artifact failure/);
  assert.match(rollback, /buildProductionRollbackEvidenceBundle/);
  assert.match(rollback, /schemaVersion: 3/);
  for (const workflow of [rollback, rollbackWatchdog]) {
    assert.match(workflow, /Materialize HMAC-bound backend evidence/);
    assert.match(workflow, /materialize-production-rollback-evidence\.mjs/);
    assert.match(workflow, /recovered-backend-evidence\/manifest\.json/);
    assert.match(workflow, /recovered-backend-evidence\/functions\.json/);
    assert.match(workflow, /recovered-backend-evidence\/database\.json/);
  }
  assert.match(
    rollback,
    /steps\.finalizer_materialize_backend_evidence\.outcome == 'success'[\s\S]*steps\.final_target_backend_evidence\.outcome == 'success'/,
  );
  assert.match(
    rollbackWatchdog,
    /steps\.watchdog_materialize_backend_evidence\.outcome == 'success'[\s\S]*steps\.watchdog_backend_evidence\.outcome == 'success'/,
  );
  for (const workflow of [deploy, deployWatchdog, rollback, rollbackWatchdog]) {
    assert.match(workflow, /RECOVERY_STATE_HMAC_KEY: \$\{\{ secrets\.EVIDENCE_SALT \}\}/);
    assert.doesNotMatch(workflow, /echo[^\n]*(?:EVIDENCE_SALT|RECOVERY_STATE_HMAC_KEY)/);
  }
});

test("deploy staging uses the reusable v3 state and recovery verifiers at both mutation boundaries", async () => {
  const workflow = await read(".github/workflows/deploy-staging.yml");
  const beforeMutation = workflow.slice(
    workflow.indexOf("Capture and verify the exact remote staging snapshot before mutation"),
    workflow.indexOf("Apply the exact candidate migrations to staging"),
  );
  assert.match(beforeMutation, /capture-staging-environment-snapshot\.mjs/);
  assert.match(beforeMutation, /write-staging-deploy-recovery-state\.mjs/);
  assert.match(beforeMutation, /verify-staging-deploy-recovery-state\.mjs/);
  assert.match(beforeMutation, /verify-staging-deploy-recovery-artifact\.mjs/);
  assert.match(beforeMutation, /RECOVERY_ARTIFACT_ID/);
  assert.match(beforeMutation, /REMOTE_RECOVERY_VERIFIED/);
  assert.doesNotMatch(beforeMutation, /schemaVersion:\s*1/);

  const finalizer = workflow.slice(workflow.indexOf("\n  finalize:"));
  assert.match(finalizer, /verify-staging-deploy-recovery-state\.mjs/);
  assert.match(finalizer, /artifact-ids: \$\{\{ steps\.finalizer_state\.outputs\.recovery_artifact_id \}\}/);
  assert.match(finalizer, /verify-staging-deploy-recovery-artifact\.mjs/);
  assert.match(finalizer, /steps\.recovery_artifact_verification\.outcome == 'success'/);
  assert.match(finalizer, /G12_STAGING_FINALIZER_STATE_UNAVAILABLE/);

  const recoveryDownload = finalizer.slice(
    finalizer.indexOf("Download the exact recovery artifact before any compensating mutation"),
    finalizer.indexOf("Reverify recovery metadata, snapshot, seal and bytes before compensation"),
  );
  assert.match(recoveryDownload, /outputs\.action == 'restore-original'/);
  assert.match(recoveryDownload, /outputs\.action == 'already-original'/);
  const releaseRecovery = finalizer.slice(
    finalizer.indexOf("Resolve the persisted unified release package for forward-backend recovery"),
    finalizer.indexOf("Install the exact locked Wrangler only for compensation"),
  );
  assert.match(
    releaseRecovery,
    /\(steps\.finalizer_decision\.outputs\.action == 'already-original' \|\|[\s\S]*steps\.finalizer_decision\.outputs\.action == 'restore-original'\) &&[\s\S]*steps\.recovery_artifact_verification\.outcome == 'success'/,
  );
  assert.match(releaseRecovery, /resolve-ci-staging-frontend-artifact\.mjs/);
  assert.match(
    releaseRecovery,
    /artifact-ids: \$\{\{ steps\.finalizer_state\.outputs\.source_artifact_id \}\}/,
  );
  assert.match(releaseRecovery, /run-id: \$\{\{ steps\.finalizer_state\.outputs\.source_ci_run_id \}\}/);
  assert.match(releaseRecovery, /verify-staging-release-package\.mjs/);
  assert.match(releaseRecovery, /g12-staging-finalizer-release-package\/database/);
  assert.match(releaseRecovery, /--candidate-artifact "\$package\/edge"/);
  assert.doesNotMatch(releaseRecovery, /candidate-recovery|finalizer_backend_checkout/);
  const terminalFailure = finalizer.slice(
    finalizer.indexOf("Fail closed when staging did not finish in the required canonical state"),
  );
  assert.match(
    terminalFailure,
    /steps\.finalizer_backend_recovery\.outcome != 'success'[\s\S]*steps\.recovery_artifact_download\.outcome != 'success'[\s\S]*steps\.recovery_artifact_verification\.outcome != 'success'/,
  );
});
