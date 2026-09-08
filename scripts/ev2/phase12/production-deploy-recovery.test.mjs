import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, root), "utf8");
}

function step(workflow, name, nextName) {
  const start = workflow.indexOf(`      - name: ${name}`);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const end = nextName
    ? workflow.indexOf(`      - name: ${nextName}`, start + 1)
    : workflow.indexOf("\n      - name:", start + 1);
  assert.notEqual(end, -1, `missing next workflow step: ${nextName}`);
  return workflow.slice(start, end);
}

test("deploy finalizer keeps compensation and terminal proof alive after intermediate failures", async () => {
  const [workflow, pagesRecovery, sealedDeploy, approvalVerifier, markerReader] = await Promise.all([
    read(".github/workflows/deploy-production.yml"),
    read("scripts/ev2/phase12/cloudflare-pages.mjs"),
    read("scripts/ev2/phase12/deploy-sealed-production-dist.mjs"),
    read("scripts/ev2/phase12/verify-approval.mjs"),
    read("scripts/ev2/phase12/read-production-mutation-marker.mjs"),
  ]);
  const finalizer = workflow.slice(workflow.indexOf("  finalize:"));

  const inlineAuthRecovery = step(
    workflow,
    "Reconverge production Auth policy after failure",
    "Reconverge production Vault outbox binding after failure",
  );
  const inlineVaultRecovery = step(
    workflow,
    "Reconverge production Vault outbox binding after failure",
    "Prove migrations, RLS, cron, outbox, Vault and Functions after recovery",
  );
  assert.match(inlineAuthRecovery, /steps\.recovery_functions\.outcome == 'success'/);
  assert.doesNotMatch(inlineAuthRecovery, /recovery_function_secrets\.outcome/);
  assert.match(inlineVaultRecovery, /steps\.recovery_functions\.outcome == 'success'/);
  assert.doesNotMatch(inlineVaultRecovery, /recovery_function_secrets\.outcome|recovery_auth\.outcome/);
  const markerUpload = workflow.indexOf("Persist the mutation marker before the first remote mutation");
  const markerRedundancy = workflow.indexOf(
    "Persist redundant marker in the locked production control variable",
  );
  const firstBackendMutation = workflow.indexOf(
    "Apply the exact candidate expand-only migrations to production",
  );
  assert.ok(markerUpload < markerRedundancy && markerRedundancy < firstBackendMutation);
  assert.match(workflow, /production-mutation-marker-store\.mjs put/);
  assert.match(finalizer, /--marker-fallback \.\.\/marker\/g12-production-mutation-marker\.json/);
  assert.match(finalizer, /id: marker_variable_fallback/);
  assert.match(
    step(
      finalizer,
      "Download the exact durable marker by artifact ID",
      "Recover marker from the redundant HMAC control after artifact download failure",
    ),
    /continue-on-error: true/,
  );
  assert.match(finalizer, /steps\.marker_download\.outcome != 'success'/);
  assert.match(finalizer, /--variable-only/);
  assert.match(finalizer, /EXPECTED_ARTIFACT_ID: \$\{\{ steps\.marker_meta\.outputs\.artifact_id \}\}/);
  assert.match(
    finalizer,
    /EXPECTED_ARTIFACT_DIGEST: \$\{\{ steps\.marker_meta\.outputs\.artifact_digest \}\}/,
  );
  assert.match(finalizer, /steps\.marker_variable_fallback\.outcome == 'success'/);
  assert.match(finalizer, /production-mutation-marker-store\.mjs clear/);
  assert.match(workflow, /promoted_deployment_id: \$\{\{ steps\.promote\.outputs\.deployment-id \}\}/);
  assert.match(
    workflow,
    /--commit-message "g12-production-run-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}"/,
  );
  assert.match(sealedDeploy, /deployment-id=\$\{canonical\.deploymentId\}/);
  assert.match(sealedDeploy, /deployment\.commitMessage === commitMessage/);
  assert.match(sealedDeploy, /normalizedUrl\(deployment\.url\) === normalizedUrl\(deploymentUrl\)/);
  assert.match(sealedDeploy, /details\?\.production_branch !== "main"/);
  assert.match(sealedDeploy, /deployment\?\.environment !== environment/);
  assert.match(sealedDeploy, /G12_PRODUCTION_PREFLIGHT_CHANGED_CANONICAL/);
  assert.match(sealedDeploy, /G12_PRODUCTION_SEALED_DEPLOY_CANONICAL_CAS_REFUSED/);
  const adjacentCas = sealedDeploy.indexOf("const projectBefore = await productionProjectDetails();");
  const mutatingSpawn = sealedDeploy.indexOf("const result = spawnSync", adjacentCas);
  assert.ok(adjacentCas >= 0 && adjacentCas < mutatingSpawn);
  for (const argument of [
    "--expected-canonical-id",
    "--expected-canonical-release",
    "--expected-canonical-created-on",
    "--expected-canonical-marker",
  ])
    assert.match(workflow, new RegExp(argument));

  for (const name of [
    "Restore the approved prior Pages deployment after any post-mutation failure",
    "Restore approved Pages baseline before backend recovery",
    "Compensate Pages if final verification or mandatory upload fails",
  ]) {
    const block = step(workflow, name, undefined);
    assert.match(block, /cloudflare-pages\.mjs reconcile/);
    assert.match(block, /CLOUDFLARE_BASELINE_DEPLOYMENT_ID/);
    assert.match(block, /CLOUDFLARE_BASELINE_CREATED_ON/);
    assert.match(block, /CLOUDFLARE_BASELINE_COMMIT_MESSAGE/);
    assert.match(block, /CLOUDFLARE_OWNED_RELEASE/);
    assert.match(block, /CLOUDFLARE_OWNED_RUN_MARKER/);
  }
  assert.doesNotMatch(workflow, /cloudflare-pages\.mjs rollback/);
  const secondCompare = pagesRecovery.indexOf(
    "current = await canonicalProductionDeployment();",
    pagesRecovery.indexOf("const target = await cloudflare"),
  );
  const recoveryPost = pagesRecovery.indexOf(
    "await cloudflare(`/deployments/${state.baseline.deploymentId}/rollback`",
  );
  assert.ok(secondCompare >= 0 && secondCompare < recoveryPost);
  assert.match(pagesRecovery, /G12_PRODUCTION_PAGES_EXTERNAL_DEPLOYMENT_PRESERVED/);
  assert.match(pagesRecovery, /\/deployments\?env=production&per_page=50/);
  assert.match(pagesRecovery, /bindProductionPagesOwnedDeployment/);

  assert.match(finalizer, /timeout-minutes: 240/);
  assert.match(markerReader, /armed_at=\$\{new Date\(marker\.armedAt\)\.toISOString\(\)\}/);
  assert.match(finalizer, /--effective-at "\$\{\{ steps\.marker\.outputs\.armed_at \}\}"/);
  assert.match(approvalVerifier, /const effectiveAt = argument\("effective-at"\)/);
  assert.match(approvalVerifier, /validationMode: effectiveAt \? "armed-recovery" : "current-window"/);
  assert.match(
    step(
      finalizer,
      "Restore approved Pages baseline before backend recovery",
      "Converge expand-only database after failure or timeout",
    ),
    /if: always\(\) && steps\.marker\.outcome == 'success'/,
  );
  assert.match(
    step(
      finalizer,
      "Converge expand-only database after failure or timeout",
      "Converge all Functions to the one candidate backend target",
    ),
    /always\(\).*finalizer_candidate_checkout\.outcome == 'success'/s,
  );
  assert.match(
    step(
      finalizer,
      "Converge all Functions to the one candidate backend target",
      "Converge candidate secrets only after Functions reached candidate",
    ),
    /always\(\).*finalizer_recovery_database\.outcome == 'success'.*finalizer_baseline_checkout\.outcome == 'success'/s,
  );
  for (const [name, nextName] of [
    [
      "Converge candidate secrets only after Functions reached candidate",
      "Converge Auth after the single candidate target is established",
    ],
    [
      "Converge Auth after the single candidate target is established",
      "Converge Vault after the single candidate target is established",
    ],
    [
      "Converge Vault after the single candidate target is established",
      "Retry credential-free QA cleanup during recovery",
    ],
    [
      "Recheck exact Functions, database, secrets, Auth and Vault",
      "Recheck public boundary and canonical Pages release",
    ],
    [
      "Recheck public boundary and canonical Pages release",
      "Prove terminal outbox/cache state with the real synthetic cycle",
    ],
    ["Prove zero terminal synthetic residue", "Write terminal evidence bound to artifact IDs and digests"],
    ["Write terminal evidence bound to artifact IDs and digests", "Upload mandatory terminal evidence"],
    [
      "Upload mandatory terminal evidence",
      "Compensate Pages if final verification or mandatory upload fails",
    ],
  ]) {
    assert.match(step(finalizer, name, nextName), /if: (?:>-\s+)?always\(\)/s, name);
  }
  assert.match(finalizer, /id: finalizer_recovery_secrets/);
  assert.match(finalizer, /id: finalizer_recovery_auth/);
  assert.match(finalizer, /id: finalizer_recovery_vault/);
  assert.match(finalizer, /steps\.terminal_evidence_upload\.outcome != 'success'/);
  assert.doesNotMatch(finalizer, /CMS_AI_EXTERNAL_PROVIDER_ENABLED:.*OPENROUTER_API_KEY/);
  assert.equal((workflow.match(/CMS_AI_EXTERNAL_PROVIDER_ENABLED: "true"/g) ?? []).length, 5);
});

test("workflow-run watchdog distinguishes marker absence and always retries terminal Pages recovery", async () => {
  const workflow = await read(".github/workflows/finalize-production-deploy.yml");

  assert.match(
    workflow,
    /workflow_run:\s+workflows: \[Deploy production\]\s+types: \[completed\]\s+branches: \[main\]/s,
  );
  assert.match(
    workflow,
    /if: >-\s+github\.event\.workflow_run\.conclusion != 'success' &&\s+github\.event\.workflow_run\.event == 'workflow_dispatch' &&\s+github\.event\.workflow_run\.head_branch == 'main' &&\s+github\.event\.workflow_run\.path == '\.github\/workflows\/deploy-production\.yml' &&\s+github\.event\.workflow_run\.head_repository\.full_name == github\.repository/s,
  );
  assert.match(workflow, /timeout-minutes: 240/);
  assert.match(workflow, /--effective-at "\$\{\{ steps\.marker\.outputs\.armed_at \}\}"/);
  assert.match(workflow, /resolve-production-run-artifact\.mjs[\s\S]*--allow-missing/);
  assert.match(workflow, /--run-attempt "\$\{\{ github\.event\.workflow_run\.run_attempt \}\}"/);
  assert.doesNotMatch(
    step(
      workflow,
      "Resolve exact marker artifact metadata",
      "No-op when the source run failed before mutation was armed",
    ),
    /continue-on-error/,
  );
  assert.match(
    step(workflow, "Restore approved Pages deployment idempotently", "Converge forward-only database target"),
    /if: always\(\) && steps\.marker\.outcome == 'success'/,
  );
  assert.match(
    step(
      workflow,
      "Converge forward-only database target",
      "Converge every Function to candidate and seal remote digests",
    ),
    /always\(\).*candidate_checkout\.outcome == 'success'/s,
  );
  assert.match(
    step(
      workflow,
      "Converge every Function to candidate and seal remote digests",
      "Converge exact secrets after candidate Functions",
    ),
    /always\(\).*database\.outcome == 'success'.*baseline_checkout\.outcome == 'success'/s,
  );
  for (const [name, nextName] of [
    ["Converge exact secrets after candidate Functions", "Converge exact Auth policy"],
    ["Converge exact Auth policy", "Converge exact Vault binding"],
    ["Converge exact Vault binding", "Complete credential-free QA cleanup when an actor existed"],
    [
      "Verify exact backend configuration and remote Function receipt",
      "Verify Pages, boundary and forward-backend compatibility",
    ],
    [
      "Verify Pages, boundary and forward-backend compatibility",
      "Verify real synthetic outbox/cache convergence",
    ],
    ["Verify zero active QA residue", "Seal watchdog terminal recovery evidence"],
    ["Seal watchdog terminal recovery evidence", "Upload mandatory watchdog recovery evidence"],
    ["Upload mandatory watchdog recovery evidence", "Retry Pages compensation after any watchdog failure"],
  ]) {
    assert.match(step(workflow, name, nextName), /if: (?:>-\s+)?always\(\)/s, name);
  }
  assert.match(workflow, /id: watchdog_evidence_upload/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(workflow, /id: terminal_pages_compensation/);
  assert.match(workflow, /failure\(\) \|\| steps\.watchdog_evidence_upload\.outcome != 'success'/);
  assert.match(workflow, /Fail closed when watchdog evidence was not captured/);
  assert.match(workflow, /--marker-fallback \.\.\/marker\/g12-production-mutation-marker\.json/);
  assert.match(workflow, /id: marker_variable_fallback/);
  assert.match(
    step(
      workflow,
      "Download exact marker artifact from the failed source run",
      "Recover marker from the redundant HMAC control after artifact download failure",
    ),
    /continue-on-error: true/,
  );
  assert.match(workflow, /steps\.marker_download\.outcome != 'success'/);
  assert.match(workflow, /--variable-only/);
  assert.match(workflow, /EXPECTED_ARTIFACT_ID: \$\{\{ steps\.marker_meta\.outputs\.artifact_id \}\}/);
  assert.match(
    workflow,
    /EXPECTED_ARTIFACT_DIGEST: \$\{\{ steps\.marker_meta\.outputs\.artifact_digest \}\}/,
  );
  assert.match(workflow, /steps\.marker_variable_fallback\.outcome == 'success'/);
  assert.match(workflow, /production-mutation-marker-store\.mjs clear/);
  assert.equal((workflow.match(/cloudflare-pages\.mjs reconcile/g) ?? []).length, 2);
  assert.doesNotMatch(workflow, /cloudflare-pages\.mjs rollback/);
  for (const name of [
    "Restore approved Pages deployment idempotently",
    "Retry Pages compensation after any watchdog failure",
  ]) {
    const block = step(workflow, name, undefined);
    assert.match(block, /CLOUDFLARE_BASELINE_DEPLOYMENT_ID/);
    assert.match(block, /CLOUDFLARE_BASELINE_CREATED_ON/);
    assert.match(block, /CLOUDFLARE_BASELINE_COMMIT_MESSAGE/);
    assert.match(block, /CLOUDFLARE_OWNED_RELEASE/);
    assert.match(block, /CLOUDFLARE_OWNED_RUN_MARKER/);
  }
  assert.match(workflow, /CMS_AI_EXTERNAL_PROVIDER_ENABLED: "true"/);
  assert.doesNotMatch(workflow, /CMS_AI_EXTERNAL_PROVIDER_ENABLED:.*OPENROUTER_API_KEY/);
});
