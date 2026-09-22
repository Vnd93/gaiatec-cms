import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const watchdog = await readFile(".github/workflows/deploy-staging-watchdog.yml", "utf8");
const deploy = await readFile(".github/workflows/deploy-staging.yml", "utf8");
const artifactVerifier = await readFile(
  "scripts/ev2/phase12/verify-staging-deploy-recovery-artifact.mjs",
  "utf8",
);
const checkpointWriter = await readFile("scripts/ev2/phase12/write-staging-release-checkpoint.mjs", "utf8");
const checkpointVerifier = await readFile(
  "scripts/ev2/phase12/verify-staging-release-checkpoint.mjs",
  "utf8",
);
const checkpointLibrary = await readFile("scripts/ev2/phase12/staging-release-checkpoint-lib.mjs", "utf8");

function workflowStep(source, name) {
  const start = source.indexOf(`- name: ${name}`);
  assert.notEqual(start, -1, `missing step: ${name}`);
  const next = source.indexOf("\n      - name:", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

const step = (name) => workflowStep(watchdog, name);

test("watchdog validates v4 state with the reusable fail-closed verifier", () => {
  const validation = step("Validate incomplete-run state and immutable ancestry");
  assert.match(validation, /verify-staging-deploy-recovery-state\.mjs/);
  assert.match(validation, /--run-id "\$TRIGGER_RUN_ID"/);
  assert.match(validation, /--run-attempt "\$TRIGGER_RUN_ATTEMPT"/);
  assert.match(validation, /--control-sha "\$TRIGGER_HEAD_SHA"/);
  assert.doesNotMatch(validation, /state\.schemaVersion !== 1/);
});

test("watchdog recovers the exact state-bound staging browser fixture before clearing state", () => {
  const validationIndex = watchdog.indexOf("Validate incomplete-run state and immutable ancestry");
  const rendezvousIndex = watchdog.indexOf(
    "Retry both single-use staging browser rendezvous cleanups in the watchdog",
  );
  const fixtureRecoveryIndex = watchdog.indexOf(
    "Recover the persisted staging browser fixture from validated state",
  );
  const clearIndex = watchdog.indexOf("Compare and clear redundant deploy state after watchdog evidence");
  assert.ok(
    validationIndex >= 0 &&
      validationIndex < rendezvousIndex &&
      rendezvousIndex < fixtureRecoveryIndex &&
      fixtureRecoveryIndex < clearIndex,
  );

  const recovery = step("Recover the persisted staging browser fixture from validated state");
  assert.match(recovery, /if: always\(\) && steps\.watchdog_state\.outcome == 'success'/);
  assert.match(recovery, /continue-on-error: true/);
  assert.match(recovery, /SUPABASE_ACCESS_TOKEN: \$\{\{ secrets\.SUPABASE_ACCESS_TOKEN \}\}/);
  assert.match(
    recovery,
    /QA_CMS_EXPECTED_SHA: \$\{\{ steps\.watchdog_state\.outputs\.candidate_release \}\}/,
  );
  assert.match(
    recovery,
    /QA_CMS_TARGET_ENVIRONMENT: \$\{\{ steps\.watchdog_state\.outputs\.browser_environment \}\}/,
  );
  assert.match(recovery, /QA_CMS_RUN_TAG: \$\{\{ steps\.watchdog_state\.outputs\.browser_run_tag \}\}/);
  assert.doesNotMatch(recovery, /github\.event\.workflow_run\.head_sha|needs\.[^.]+\.outputs/);
  assert.match(recovery, /test "\$QA_CMS_TARGET_ENVIRONMENT" = staging/);
  assert.match(recovery, /node scripts\/qa\/cms-browser-fixture\.mjs recover/);
  assert.match(recovery, /report\.recovery\?\.remainingActiveLeases === 0/);
  assert.match(recovery, /report\.recovery\?\.sweeper\?\.failedLeases === 0/);
  assert.match(recovery, /report\.localStateRead === false/);
  assert.match(recovery, /report\.credentialsInStateOrReport === false/);
  assert.match(recovery, /g12-staging-browser-fixture-watchdog-recovery\.json/);

  const preMutation = step("Prove a pre-mutation parent is safe before clearing its recovery state");
  assert.match(
    preMutation,
    /BROWSER_FIXTURE_RECOVERY_OUTCOME: \$\{\{ steps\.watchdog_browser_fixture_recovery\.outcome \}\}/,
  );
  assert.match(preMutation, /test "\$BROWSER_FIXTURE_RECOVERY_OUTCOME" = success/);
  assert.match(preMutation, /test "\$BROWSER_FIXTURE_RECOVERY_OUTCOME" = skipped/);

  const clear = step("Compare and clear redundant deploy state after watchdog evidence");
  assert.match(clear, /steps\.watchdog_browser_fixture_recovery\.outcome == 'success'/);
  const terminal = step("Fail closed if the watchdog could not prove the original staging release");
  assert.match(terminal, /steps\.watchdog_browser_fixture_recovery\.outcome != 'success'/);
});

test("pre-mutation cleanup publishes immutable terminal evidence before either state clear", () => {
  const flows = [
    {
      source: deploy,
      names: [
        "Prove a deploy stopped safely before clearing its pre-mutation state",
        "Write mandatory terminal evidence for a pre-mutation deploy",
        "Upload mandatory terminal evidence for a pre-mutation deploy",
        "Verify pre-mutation terminal evidence artifact identity",
        "Clear redundant state after proving the deploy stopped before staging mutation",
        "Finalize a deploy that stopped before staging mutation was armed",
      ],
      event: "g12.staging.pre_mutation.terminal",
    },
    {
      source: watchdog,
      names: [
        "Prove a pre-mutation parent is safe before clearing its recovery state",
        "Write mandatory watchdog evidence for a pre-mutation parent",
        "Upload mandatory watchdog evidence for a pre-mutation parent",
        "Verify watchdog pre-mutation evidence artifact identity",
        "Clear redundant state after proving a pre-mutation parent is safe",
        "Finalize the watchdog without staging mutation for a pre-mutation parent",
      ],
      event: "g12.staging.watchdog.pre_mutation.terminal",
    },
  ];

  for (const flow of flows) {
    const indexes = flow.names.map((name) => {
      const index = flow.source.indexOf(name);
      assert.notEqual(index, -1, `missing pre-mutation step: ${name}`);
      return index;
    });
    assert.deepEqual(
      indexes,
      [...indexes].sort((left, right) => left - right),
    );

    const evidence = workflowStep(flow.source, flow.names[1]);
    assert.match(evidence, new RegExp(flow.event.replaceAll(".", "\\.")));
    assert.match(evidence, /present: statePresent/);
    assert.match(evidence, /source:/);
    assert.match(evidence, /sha256: stateSha256/);
    assert.match(evidence, /remainingActiveLeases/);
    assert.match(evidence, /failedLeases/);
    assert.match(evidence, /zeroResidue: true/);
    assert.match(evidence, /productionTouched: false/);
    assert.match(evidence, /secretsDisclosed: false/);
    assert.match(evidence, /statePresent \? "success" : "skipped"|statePresent \? "variable" : "absent"/);

    const upload = workflowStep(flow.source, flow.names[2]);
    assert.match(upload, /steps\.pre_mutation_evidence\.outcome == 'success'/);
    assert.match(upload, /if-no-files-found: error/);

    const identity = workflowStep(flow.source, flow.names[3]);
    assert.match(identity, /outputs\.artifact-id/);
    assert.match(identity, /outputs\.artifact-digest/);
    assert.match(identity, /\^\[1-9\]\[0-9\]\*\$/);
    assert.match(identity, /\^\(sha256:\)\?\[a-f0-9\]\{64\}\$/);

    const clear = workflowStep(flow.source, flow.names[4]);
    for (const required of [
      "pre_mutation_ready",
      "pre_mutation_evidence",
      "pre_mutation_evidence_upload",
      "pre_mutation_evidence_identity",
    ]) {
      assert.match(clear, new RegExp(`steps\\.${required}\\.outcome == 'success'`));
    }

    const finalize = workflowStep(flow.source, flow.names[5]);
    for (const outcome of [
      "PRE_MUTATION_READY_OUTCOME",
      "PRE_MUTATION_EVIDENCE_OUTCOME",
      "PRE_MUTATION_EVIDENCE_UPLOAD_OUTCOME",
      "PRE_MUTATION_EVIDENCE_IDENTITY_OUTCOME",
      "STATE_CLEAR_OUTCOME",
    ]) {
      assert.match(finalize, new RegExp(`test "\\$${outcome}" = success`));
    }
  }
});

test("recovery metadata tolerates only a bounded fresh-artifact visibility gap", () => {
  assert.match(artifactVerifier, /for \(let attempt = 1; attempt <= 4; attempt \+= 1\)/);
  assert.match(artifactVerifier, /!\[404, 408, 429\]\.includes\(response\.status\)/);
  assert.match(artifactVerifier, /G12_STAGING_DEPLOY_RECOVERY_GITHUB_RETRY_EXHAUSTED/);
});

test("watchdog selects recovery and the unified release package by immutable identities", () => {
  const download = step("Download the exact sealed recovery artifact before any watchdog mutation");
  assert.match(download, /artifact-ids: \$\{\{ steps\.watchdog_state\.outputs\.recovery_artifact_id \}\}/);
  assert.doesNotMatch(download, /name: staging-recovery-/);
  assert.match(download, /action == 'restore-original'/);
  assert.match(download, /action == 'already-original'/);

  const verification = step(
    "Verify recovery metadata, seal, provenance, snapshot and bytes before any watchdog mutation",
  );
  assert.match(verification, /verify-staging-deploy-recovery-artifact\.mjs/);
  assert.match(verification, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(verification, /--state "\$\{\{ steps\.watchdog_state\.outputs\.state_path \}\}"/);
  assert.match(verification, /action == 'restore-original'/);
  assert.match(verification, /action == 'already-original'/);

  const install = step("Install the exact locked Wrangler only when compensation is required");
  const compensation = step("Compensate only the still-canonical candidate owned by the incomplete run");
  const retry = step("Retry ambiguous watchdog compensation after a fresh canonical recheck");
  for (const body of [install, compensation, retry])
    assert.match(body, /steps\.recovery_artifact_verification\.outcome == 'success'/);
  assert.match(compensation, /steps\.watchdog_wrangler_install\.outcome == 'success'/);
  assert.match(retry, /steps\.watchdog_wrangler_install\.outcome == 'success'/);

  const downloadIndex = watchdog.indexOf(
    "Download the exact sealed recovery artifact before any watchdog mutation",
  );
  const verificationIndex = watchdog.indexOf(
    "Verify recovery metadata, seal, provenance, snapshot and bytes before any watchdog mutation",
  );
  const resolver = step("Resolve the persisted unified release package for watchdog recovery");
  assert.match(resolver, /resolve-ci-staging-frontend-artifact\.mjs/);
  assert.match(resolver, /watchdog_state\.outputs\.source_ci_run_id/);
  assert.match(resolver, /watchdog_state\.outputs\.source_ci_run_attempt/);
  assert.match(
    resolver,
    /--gate-run-attempt "\$\{\{ steps\.watchdog_state\.outputs\.gate_ci_run_attempt \}\}"/,
  );
  assert.match(resolver, /watchdog_state\.outputs\.candidate_release/);
  assert.match(resolver, /steps\.recovery_artifact_verification\.outcome == 'success'/);

  const binding = step("Bind the watchdog to the persisted unified package identity");
  for (const identity of [
    "STATE_RUN_ID",
    "STATE_RUN_ATTEMPT",
    "STATE_GATE_RUN_ATTEMPT",
    "STATE_ARTIFACT_ID",
    "STATE_ARTIFACT_DIGEST",
    "STATE_ARTIFACT_NAME",
    "RESOLVED_CONTROL_SHA",
  ]) {
    assert.match(binding, new RegExp(identity));
  }
  assert.match(binding, /RESOLVED_ARTIFACT_ID/);
  assert.match(binding, /RESOLVED_ARTIFACT_DIGEST/);
  assert.match(binding, /RESOLVED_ARTIFACT_NAME/);
  assert.match(binding, /RESOLVED_GATE_RUN_ATTEMPT/);

  const packageDownload = step("Download the persisted unified release package by immutable artifact ID");
  assert.match(
    packageDownload,
    /artifact-ids: \$\{\{ steps\.watchdog_state\.outputs\.source_artifact_id \}\}/,
  );
  assert.match(packageDownload, /run-id: \$\{\{ steps\.watchdog_state\.outputs\.source_ci_run_id \}\}/);
  assert.match(packageDownload, /digest-mismatch: error/);

  const profile = step("Derive the fail-closed recovery profile from the exact sealed package");
  assert.match(profile, /evaluateStagingReleasePackageManifest/);
  assert.match(profile, /readCiStagingFrontendSelectionControls/);
  assert.match(profile, /validateCiReleasePlan/);
  assert.match(profile, /plan\?\.selectedProfile !== manifest\.releaseProfile/);
  for (const supported of ["frontend-only", "edge-only", "database-auth", "full-release"])
    assert.match(profile, new RegExp(`"${supported}"`));

  const packageVerification = step("Verify the persisted unified release package before watchdog mutation");
  assert.match(packageVerification, /verify-staging-release-package\.mjs/);
  assert.match(packageVerification, /watchdog_release_profile\.outputs\.release_profile/);

  const auth = step("Converge exact candidate staging Auth in the watchdog");
  assert.match(
    auth,
    /working-directory: \$\{\{ steps\.watchdog_database_payload\.outputs\.project_directory \}\}/,
  );
  assert.match(auth, /node scripts\/ev2\/phase12\/configure-staging-auth\.mjs/);
  assert.doesNotMatch(auth, /working-directory: control/);

  const edgeConfiguration = step("Converge exact candidate staging Edge configuration in the watchdog");
  assert.match(
    edgeConfiguration,
    /STAGING_CANDIDATE_SHA: \$\{\{ steps\.watchdog_state\.outputs\.candidate_release \}\}/,
  );
  assert.match(
    edgeConfiguration,
    /g12-staging-watchdog-release-package\/edge\/source\/scripts\/ev2\/phase12\/configure-staging-edge-public-secrets\.mjs/,
  );
  assert.match(
    edgeConfiguration,
    /g12-staging-watchdog-release-package\/edge\/source\/scripts\/ev2\/phase12\/configure-staging-ai-provider-secrets\.mjs/,
  );
  assert.doesNotMatch(edgeConfiguration, /supabase secrets set|STAGING_ALLOWED_ORIGINS/);

  const aggregate = step(
    "Prove required watchdog backend domains recovered and omitted domains stayed skipped",
  );
  assert.match(aggregate, /test "\$DATABASE_PAYLOAD_OUTCOME" = skipped/);
  assert.match(aggregate, /test "\$EDGE_FUNCTIONS_OUTCOME" = skipped/);
  assert.match(aggregate, /test "\$RELEASE_PACKAGE_NAME" = "\$STATE_ARTIFACT_NAME"/);
  assert.match(compensation, /steps\.watchdog_backend_recovery\.outcome == 'success'/);
  assert.match(retry, /steps\.watchdog_backend_recovery\.outcome == 'success'/);

  const resolverIndex = watchdog.indexOf(
    "Resolve the persisted unified release package for watchdog recovery",
  );
  const packageVerificationIndex = watchdog.indexOf(
    "Verify the persisted unified release package before watchdog mutation",
  );
  const firstMutationIndex = watchdog.indexOf("Converge exact candidate staging migrations in the watchdog");
  assert.ok(
    downloadIndex < verificationIndex &&
      verificationIndex < resolverIndex &&
      resolverIndex < packageVerificationIndex &&
      packageVerificationIndex < firstMutationIndex,
  );
  assert.doesNotMatch(watchdog, /candidate-recovery|watchdog_backend_checkout/);
  assert.doesNotMatch(watchdog, /--source \. --rollback-source \./);
});

test("deploy persists and reverifies the full-context checkpoint bundle before the first mutation", () => {
  const orderedSteps = [
    "Upload mandatory sealed staging recovery artifact before mutation",
    "Prebind the durable browser recovery identity before mutation",
    "Persist credential-free staging recovery state v4 before mutation",
    "Download the just-uploaded recovery copy by immutable artifact ID",
    "Prove the remote recovery copy is recoverable before mutation",
    "Write the full-context pre-mutation release checkpoint",
    "Persist redundant HMAC staging state before mutation",
    "Upload mandatory pre-mutation staging state",
    "Download the pre-mutation state bundle by immutable artifact ID",
    "Reverify the downloaded full-context checkpoint before mutation",
    "Arm staging mutation only after every durable recovery proof exists",
    "Apply the exact candidate migrations to staging",
  ];
  const indexes = orderedSteps.map((name) => {
    const index = deploy.indexOf(name);
    assert.notEqual(index, -1, `missing ordered deploy step: ${name}`);
    return index;
  });
  assert.deepEqual(
    indexes,
    [...indexes].sort((left, right) => left - right),
  );

  const stateWriter = workflowStep(
    deploy,
    "Persist credential-free staging recovery state v4 before mutation",
  );
  assert.match(
    stateWriter,
    /GATE_CI_RUN_ATTEMPT: \$\{\{ steps\.frontend_source\.outputs\.gate_run_attempt \}\}/,
  );
  assert.match(
    stateWriter,
    /BROWSER_RUN_TAG: \$\{\{ steps\.browser_recovery_identity\.outputs\.run_tag \}\}/,
  );

  const writer = workflowStep(deploy, "Write the full-context pre-mutation release checkpoint");
  assert.match(writer, /write-staging-release-checkpoint\.mjs/);
  assert.match(writer, /--state \.\.\/candidate\/outputs\/staging-deploy-state\.json/);
  assert.match(writer, /--output \.\.\/candidate\/outputs\/staging-release-checkpoint\.json/);
  for (const argument of [
    "candidate-matrix",
    "control-matrix",
    "candidate-policy",
    "control-policy",
    "profile",
    "expected-matrix-sha256",
    "expected-policy-sha256",
  ]) {
    assert.match(writer, new RegExp(`--${argument}`));
  }

  const upload = workflowStep(deploy, "Upload mandatory pre-mutation staging state");
  assert.match(upload, /candidate\/outputs\/staging-deploy-state\.json/);
  assert.match(upload, /candidate\/outputs\/staging-release-checkpoint\.json/);
  assert.match(upload, /if-no-files-found: error/);
  assert.match(upload, /compression-level: 0/);

  const download = workflowStep(deploy, "Download the pre-mutation state bundle by immutable artifact ID");
  assert.match(download, /artifact-ids: \$\{\{ steps\.staging_state_artifact\.outputs\.artifact-id \}\}/);
  assert.match(download, /digest-mismatch: error/);
  assert.match(download, /run-id: \$\{\{ github\.run_id \}\}/);
  assert.match(download, /g12-staging-state-pre-mutation/);

  const verifier = workflowStep(deploy, "Reverify the downloaded full-context checkpoint before mutation");
  assert.match(verifier, /verify-staging-release-checkpoint\.mjs/);
  assert.match(verifier, /g12-staging-state-pre-mutation\/staging-deploy-state\.json/);
  assert.match(verifier, /g12-staging-state-pre-mutation\/staging-release-checkpoint\.json/);
  for (const argument of [
    "candidate-matrix",
    "control-matrix",
    "candidate-policy",
    "control-policy",
    "profile",
    "expected-matrix-sha256",
    "expected-policy-sha256",
  ]) {
    assert.match(verifier, new RegExp(`--${argument}`));
  }

  const boundary = workflowStep(
    deploy,
    "Arm staging mutation only after every durable recovery proof exists",
  );
  for (const output of [
    "verified",
    "binding_matches",
    "reusable_gates",
    "mutation_gates_reused",
    "candidate_sha",
    "artifact_id",
    "artifact_digest",
    "archive_sha256",
    "tree_sha256",
    "deployment_id",
    "environment_snapshot_sha256",
    "edge_baseline_manifest_sha256",
    "release_profile",
    "matrix_sha256",
    "policy_sha256",
  ]) {
    assert.match(boundary, new RegExp(`steps\\.staging_release_checkpoint_remote\\.outputs\\.${output}`));
  }
  assert.match(boundary, /test "\$CHECKPOINT_REUSABLE_GATES" = artifact-seal,immutable-provenance/);
  assert.match(boundary, /test "\$CHECKPOINT_MUTATION_GATES_REUSED" = false/);
  for (const binding of [
    "CANDIDATE_SHA",
    "SOURCE_ARTIFACT_ID",
    "SOURCE_ARTIFACT_DIGEST",
    "STATE_ARCHIVE_SHA256",
    "SOURCE_TREE_SHA256",
    "LIVE_DEPLOYMENT_ID",
    "SNAPSHOT_SHA256",
    "EDGE_BASELINE_MANIFEST_SHA256",
    "RELEASE_PROFILE",
    "MATRIX_SHA256",
    "POLICY_SHA256",
  ]) {
    assert.match(boundary, new RegExp(binding));
  }

  assert.match(checkpointWriter, /await writeStagingReleaseCheckpoint\(\{/);
  assert.match(checkpointVerifier, /await verifyStagingReleaseCheckpoint\(\{/);
  assert.match(checkpointLibrary, /const evaluation = evaluateReleaseCheckpoints\(\{/);
});

test("finalizer recovers required backend domains only from the persisted unified package", () => {
  const finalizer = deploy.slice(deploy.indexOf("\n  finalize:"));
  const orderedSteps = [
    "Reverify recovery metadata, snapshot, seal and bytes before compensation",
    "Resolve the persisted unified release package for forward-backend recovery",
    "Bind the finalizer to the persisted package identity and release profile",
    "Download the persisted unified release package by immutable artifact ID",
    "Verify the persisted unified release package before recovery mutation",
    "Materialize the persisted database payload only when the profile requires it",
    "Install pinned Supabase CLI for forward-backend recovery",
    "Converge exact candidate staging migrations after deploy failure",
    "Converge exact candidate staging Auth after deploy failure",
    "Converge exact candidate staging Edge configuration after deploy failure",
    "Converge exact candidate Edge Functions after deploy failure",
    "Prove required backend domains recovered and omitted domains stayed skipped",
    "Compensate only this run's still-canonical staging candidate",
  ];
  const indexes = orderedSteps.map((name) => {
    const index = finalizer.indexOf(name);
    assert.notEqual(index, -1, `missing finalizer step: ${name}`);
    return index;
  });
  assert.deepEqual(
    indexes,
    [...indexes].sort((left, right) => left - right),
  );

  const resolver = workflowStep(
    deploy,
    "Resolve the persisted unified release package for forward-backend recovery",
  );
  assert.match(resolver, /resolve-ci-staging-frontend-artifact\.mjs/);
  assert.match(resolver, /finalizer_state\.outputs\.source_ci_run_id/);
  assert.match(resolver, /finalizer_state\.outputs\.source_ci_run_attempt/);
  assert.match(
    resolver,
    /--gate-run-attempt "\$\{\{ steps\.finalizer_state\.outputs\.gate_ci_run_attempt \}\}"/,
  );
  assert.match(resolver, /finalizer_state\.outputs\.candidate_release/);
  assert.match(resolver, /steps\.recovery_artifact_verification\.outcome == 'success'/);

  const binding = workflowStep(
    deploy,
    "Bind the finalizer to the persisted package identity and release profile",
  );
  for (const identity of [
    "STATE_RUN_ID",
    "STATE_RUN_ATTEMPT",
    "STATE_GATE_RUN_ATTEMPT",
    "STATE_ARTIFACT_ID",
    "STATE_ARTIFACT_DIGEST",
    "STATE_ARTIFACT_NAME",
  ]) {
    assert.match(binding, new RegExp(identity));
  }
  assert.match(binding, /DEPLOY_ARTIFACT_ID/);
  assert.match(binding, /DEPLOY_GATE_RUN_ATTEMPT/);
  assert.match(binding, /RESOLVED_ARTIFACT_ID/);
  assert.match(binding, /RESOLVED_GATE_RUN_ATTEMPT/);
  assert.match(binding, /frontend-only\)/);
  assert.match(binding, /edge-only\)/);
  assert.match(binding, /database-auth\)/);
  assert.match(binding, /full-release\)/);
  assert.match(binding, /G12_STAGING_FINALIZER_RELEASE_PROFILE_REFUSED/);

  const download = workflowStep(
    deploy,
    "Download the persisted unified release package by immutable artifact ID",
  );
  assert.match(download, /artifact-ids: \$\{\{ steps\.finalizer_state\.outputs\.source_artifact_id \}\}/);
  assert.match(download, /run-id: \$\{\{ steps\.finalizer_state\.outputs\.source_ci_run_id \}\}/);
  assert.match(download, /digest-mismatch: error/);
  assert.match(download, /g12-staging-finalizer-release-package/);

  const verification = workflowStep(
    deploy,
    "Verify the persisted unified release package before recovery mutation",
  );
  assert.match(verification, /verify-staging-release-package\.mjs/);
  assert.match(verification, /finalizer_state\.outputs\.candidate_release/);
  assert.match(verification, /finalizer_release_contract\.outputs\.release_profile/);
  assert.match(verification, /finalizer_state\.outputs\.source_ci_run_id/);
  assert.match(verification, /finalizer_state\.outputs\.source_ci_run_attempt/);

  const database = workflowStep(
    deploy,
    "Materialize the persisted database payload only when the profile requires it",
  );
  assert.match(database, /database_required == 'true'/);
  assert.match(database, /g12-staging-finalizer-release-package\/database/);
  assert.match(database, /verify-database-release-payload\.mjs/);

  const auth = workflowStep(deploy, "Converge exact candidate staging Auth after deploy failure");
  assert.match(
    auth,
    /working-directory: \$\{\{ steps\.finalizer_database_payload\.outputs\.project_directory \}\}/,
  );
  assert.match(auth, /node scripts\/ev2\/phase12\/configure-staging-auth\.mjs/);
  assert.doesNotMatch(auth, /working-directory: control/);

  const edgeConfiguration = workflowStep(
    deploy,
    "Converge exact candidate staging Edge configuration after deploy failure",
  );
  assert.match(
    edgeConfiguration,
    /STAGING_CANDIDATE_SHA: \$\{\{ steps\.finalizer_state\.outputs\.candidate_release \}\}/,
  );
  assert.match(
    edgeConfiguration,
    /g12-staging-finalizer-release-package\/edge\/source\/scripts\/ev2\/phase12\/configure-staging-edge-public-secrets\.mjs/,
  );
  assert.match(
    edgeConfiguration,
    /g12-staging-finalizer-release-package\/edge\/source\/scripts\/ev2\/phase12\/configure-staging-ai-provider-secrets\.mjs/,
  );
  assert.doesNotMatch(edgeConfiguration, /supabase secrets set|STAGING_ALLOWED_ORIGINS/);

  const edge = workflowStep(deploy, "Converge exact candidate Edge Functions after deploy failure");
  assert.match(edge, /edge_required == 'true'/);
  assert.match(edge, /--candidate-artifact "\$package\/edge"/);
  assert.match(edge, /--baseline-artifact \.\.\/recovery\/edge-baseline/);
  assert.match(edge, /--baseline-manifest-sha256/);
  assert.match(edge, /--source "\$package\/edge\/source"/);

  const aggregate = workflowStep(
    deploy,
    "Prove required backend domains recovered and omitted domains stayed skipped",
  );
  assert.match(aggregate, /DATABASE_REQUIRED/);
  assert.match(aggregate, /EDGE_REQUIRED/);
  assert.match(aggregate, /test "\$DATABASE_PAYLOAD_OUTCOME" = skipped/);
  assert.match(aggregate, /test "\$EDGE_FUNCTIONS_OUTCOME" = skipped/);
  assert.match(aggregate, /test "\$RELEASE_PACKAGE_NAME" = "\$STATE_ARTIFACT_NAME"/);

  assert.doesNotMatch(finalizer, /candidate-recovery|finalizer_backend_checkout/);
  assert.doesNotMatch(finalizer, /--source \. --rollback-source \./);
  assert.match(
    workflowStep(deploy, "Compensate only this run's still-canonical staging candidate"),
    /steps\.finalizer_backend_recovery\.outcome == 'success'/,
  );
});
