import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const read = (path) => readFile(new URL(`../../../${path}`, import.meta.url), "utf8");

function nodeHeredocs(workflow) {
  return [...workflow.matchAll(/^\s*node <<'NODE'\r?\n([\s\S]*?)^\s*NODE\s*$/gm)].map((match) => match[1]);
}

test("staging rollback restores the retained sealed candidate instead of rebuilding the target", async () => {
  const [workflow, sealedDeploy] = await Promise.all([
    read(".github/workflows/rollback-staging.yml"),
    read("scripts/ev2/phase12/deploy-sealed-staging-dist.mjs"),
  ]);
  const resolve = workflow.indexOf("Resolve staging-candidate by source run, artifact ID and digest");
  const verify = workflow.indexOf("Verify the downloaded target archive and seal before any mutation");
  const state = workflow.indexOf("Persist redundant HMAC rollback state before the first remote mutation");
  const backendMutation = workflow.indexOf("Converge the retained staging schema and Edge Functions");
  const pagesMutation = workflow.indexOf(
    "Restore only the exact retained and sealed staging-candidate bytes",
  );

  assert.ok(resolve >= 0 && resolve < verify && verify < state && state < backendMutation);
  assert.ok(backendMutation < pagesMutation);
  assert.match(workflow, /artifact-ids: \$\{\{ steps\.target_artifact\.outputs\.artifact_id \}\}/);
  assert.match(workflow, /digest-mismatch: error/);
  assert.match(workflow, /staging-candidate-dist\.tar/);
  assert.match(workflow, /deploy-sealed-staging-dist\.mjs/);
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
    "STAGING_ORIGINAL_COMMIT_MESSAGE",
  ])
    assert.match(workflow, new RegExp(name));
});

test("staging baseline inventory uses candidate tooling with a fail-closed explicit repository root", async () => {
  const workflow = await read(".github/workflows/deploy-staging.yml");
  assert.match(
    workflow,
    /working-directory: baseline[\s\S]*node \.\.\/candidate\/scripts\/qa\/cms-coverage-inventory\.mjs \\\r?\n\s+--repository-root \. \\\r?\n\s+--output outputs\/cms-coverage-rollback\.json/,
  );
  assert.doesNotMatch(
    workflow,
    /working-directory: baseline[\s\S]{0,400}node scripts\/qa\/cms-coverage-inventory\.mjs/,
  );

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
  assert.match(workflow, /verify-staging-recovery-seal\.mjs/);
  assert.match(workflow, /Rebuild only the original fallback and require its signed seal identity/);
  assert.match(workflow, /Compare and clear HMAC state after terminal recovery evidence/);
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

test("every deploy-staging inline Node program parses and the finalizer validates a sealed fixture", async () => {
  const workflow = await read(".github/workflows/deploy-staging.yml");
  const programs = nodeHeredocs(workflow);
  assert.ok(programs.length >= 2, "expected deploy-staging inline Node programs");
  for (const [index, program] of programs.entries()) {
    const parsed = spawnSync(process.execPath, ["--check"], {
      input: program,
      encoding: "utf8",
    });
    assert.equal(parsed.status, 0, `inline Node program ${index + 1}: ${parsed.stderr}`);
  }

  const finalizer = programs.find((program) => program.includes("G12_STAGING_FINALIZER_STATE_REFUSED"));
  assert.ok(finalizer, "missing executable staging finalizer program");
  const fixtureRoot = await mkdtemp(join(tmpdir(), "g12-staging-finalizer-"));
  const controlDir = join(fixtureRoot, "control");
  const stateDir = join(fixtureRoot, "state");
  const outputPath = join(fixtureRoot, "github-output.txt");
  const candidateSha = "b".repeat(40);
  const rollbackSha = "c".repeat(40);
  const controlSha = "a".repeat(40);
  try {
    await mkdir(controlDir);
    await mkdir(stateDir);
    await writeFile(
      join(stateDir, "staging-deploy-state.json"),
      JSON.stringify({
        schemaVersion: 1,
        event: "g12.staging.deploy.prepared",
        workflow: { runId: "123", runAttempt: 1, controlSha },
        candidateRelease: candidateSha,
        original: {
          release: rollbackSha,
          deploymentId: "123e4567-e89b-42d3-a456-426614174000",
          createdOn: "2026-09-07T10:00:00.000Z",
          commitMessage: "prior staging",
        },
        runMarker: "g12-staging-run-123-1",
        compensationMarker: "g12-staging-deploy-compensation-123-1",
        project: "gaiatec-cms-staging",
        branch: "ev2-g17-canary",
      }),
    );
    const executed = spawnSync(process.execPath, ["-e", finalizer], {
      cwd: controlDir,
      encoding: "utf8",
      env: {
        ...process.env,
        STATE_ARTIFACT_OUTCOME: "success",
        STATE_VARIABLE_OUTCOME: "skipped",
        EXPECTED_RUN_ID: "123",
        EXPECTED_RUN_ATTEMPT: "1",
        EXPECTED_CONTROL_SHA: controlSha,
        EXPECTED_CANDIDATE_SHA: candidateSha,
        EXPECTED_ROLLBACK_SHA: rollbackSha,
        EXPECTED_RUN_MARKER: "g12-staging-run-123-1",
        EXPECTED_STATE_ARTIFACT_ID: "42",
        EXPECTED_STATE_ARTIFACT_DIGEST: "d".repeat(64),
        GITHUB_OUTPUT: outputPath,
      },
    });
    assert.equal(executed.status, 0, executed.stderr);
    assert.match(await readFile(outputPath, "utf8"), new RegExp(`candidate_release=${candidateSha}`));
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
