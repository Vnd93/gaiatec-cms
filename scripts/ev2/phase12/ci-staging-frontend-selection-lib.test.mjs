import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  CI_STAGING_FRONTEND_PACKAGE_STEPS,
  createCiStagingFrontendSelection,
  evaluateCiReleasePlanArtifact,
  evaluateCiStagingFrontendPackageSelection,
  evaluateCiStagingFrontendSelectionArtifact,
  releasePlanArtifactName,
  readCiStagingFrontendSelectionControls,
  stagingFrontendSelectionArtifactName,
  validateCiReleasePlan,
  validateCiStagingFrontendSelection,
  verifyCiReleasePlan,
  verifyCiStagingFrontendSelection,
  writeCiStagingFrontendSelection,
} from "./ci-staging-frontend-selection-lib.mjs";
import {
  createBootstrapReleaseCheckpointPolicyBytes,
  createBootstrapReleaseGateMatrixBytes,
  hashReleaseProfileImplementation,
  selectReleaseProfile,
} from "./release-profile-lib.mjs";

const repository = "Vnd93/gaiatec-cms";
const headSha = "a".repeat(40);
const runId = "35731735256";
const now = Date.parse("2026-09-22T12:00:00.000Z");
const baseSha = "8".repeat(40);
const matrixPath = fileURLToPath(
  new URL("../../../.github/release-controls/release-gate-matrix.json", import.meta.url),
);
const policyPath = fileURLToPath(
  new URL("../../../.github/release-controls/release-checkpoint-policy.json", import.meta.url),
);

function workflowRun(attempt, { current = false, conclusion = "success" } = {}) {
  return {
    id: Number(runId),
    run_attempt: attempt,
    name: "CI",
    path: ".github/workflows/ci.yml",
    event: "push",
    head_branch: "main",
    head_sha: headSha,
    created_at: "2026-09-20T12:00:00.000Z",
    status: current ? "in_progress" : "completed",
    conclusion: current ? null : conclusion,
    actor: { login: "Vnd93" },
    triggering_actor: { login: "Vnd93" },
    repository: { full_name: repository },
    head_repository: { full_name: repository },
  };
}

function packageJob(attempt, { conclusion = "success", build = "success", upload = "success" } = {}) {
  return {
    id: 9000 + attempt,
    run_id: Number(runId),
    head_sha: headSha,
    name: CI_STAGING_FRONTEND_PACKAGE_STEPS.job,
    status: "completed",
    conclusion,
    steps: [
      {
        name: CI_STAGING_FRONTEND_PACKAGE_STEPS.build,
        status: "completed",
        conclusion: build,
      },
      {
        name: CI_STAGING_FRONTEND_PACKAGE_STEPS.upload,
        status: "completed",
        conclusion: upload,
      },
    ],
  };
}

function packageArtifact(attempt, overrides = {}) {
  const id = 10695766720 + attempt;
  return {
    id,
    name: `staging-frontend-${headSha}-${runId}-${attempt}`,
    digest: `sha256:${"b".repeat(64)}`,
    size_in_bytes: 4096,
    expired: false,
    created_at: "2026-09-20T12:01:00.000Z",
    expires_at: "2026-12-19T12:00:00.000Z",
    archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`,
    workflow_run: { id: Number(runId), head_branch: "main", head_sha: headSha },
    ...overrides,
  };
}

function releasePlanArtifact(attempt, overrides = {}) {
  const id = 11695766720 + attempt;
  return {
    id,
    name: releasePlanArtifactName(headSha, runId, attempt),
    digest: `sha256:${"7".repeat(64)}`,
    size_in_bytes: 2048,
    expired: false,
    created_at: "2026-09-20T12:01:00.000Z",
    updated_at: "2026-09-20T12:01:00.000Z",
    expires_at: "2026-12-19T12:00:00.000Z",
    url: `https://api.github.com/repos/${repository}/actions/artifacts/${id}`,
    archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`,
    workflow_run: { id: Number(runId), head_branch: "main", head_sha: headSha },
    ...overrides,
  };
}

function select({
  attempt = 2,
  artifacts = [packageArtifact(1)],
  includeReleasePlan = true,
  priorAttempts,
  currentRun,
} = {}) {
  return evaluateCiStagingFrontendPackageSelection({
    repository,
    currentRun: currentRun ?? workflowRun(attempt, { current: true }),
    artifacts: [...(includeReleasePlan ? [releasePlanArtifact(attempt)] : []), ...artifacts],
    priorAttempts:
      priorAttempts ??
      Array.from({ length: attempt - 1 }, (_, index) => ({
        attempt: index + 1,
        run: workflowRun(index + 1, { conclusion: index === 0 ? "failure" : "success" }),
        jobs: [packageJob(index + 1)],
      })),
    expected: { runId, currentRunAttempt: attempt, headSha },
    now,
  });
}

test("selector creates only when no prior attempt ever reached build or upload", () => {
  const result = select({ attempt: 1, artifacts: [], priorAttempts: [] });
  assert.equal(result.valid, true);
  assert.equal(result.mode, "create");
  assert.equal(result.sourceRunAttempt, 1);
  assert.equal(result.artifactId, "");
  assert.equal(result.artifactName, `staging-frontend-${headSha}-${runId}-1`);
  assert.equal(result.releasePlanArtifactId, String(releasePlanArtifact(1).id));
  assert.equal(result.releasePlanArtifactDigest, releasePlanArtifact(1).digest);
  assert.equal(result.releasePlanArtifactName, releasePlanArtifact(1).name);
});

test("selector reuses the one retained package from a failed prior gate attempt", () => {
  const artifact = packageArtifact(1);
  const result = select({ artifacts: [artifact] });
  assert.equal(result.valid, true);
  assert.equal(result.mode, "reuse");
  assert.equal(result.sourceRunId, runId);
  assert.equal(result.sourceRunAttempt, 1);
  assert.equal(result.artifactId, String(artifact.id));
  assert.equal(result.artifactDigest, artifact.digest);
  assert.equal(result.artifactName, artifact.name);
});

test("selector refuses rebuild after any prior package activity without an artifact", () => {
  const result = select({ artifacts: [] });
  assert.equal(result.valid, false);
  assert.equal(result.mode, "refuse");
  assert.ok(result.violations.includes("prior_package_missing"));
});

test("selector refuses a missing or substituted current-attempt release plan artifact", () => {
  const missing = select({ includeReleasePlan: false });
  assert.ok(missing.violations.includes("release_plan_artifact_not_unique"));

  const substituted = select({
    artifacts: [
      packageArtifact(1),
      releasePlanArtifact(2, {
        workflow_run: { id: Number(runId), head_branch: "main", head_sha: "f".repeat(40) },
      }),
    ],
    includeReleasePlan: false,
  });
  assert.ok(substituted.violations.includes("release_plan_artifact_run_binding_invalid"));
});

test("selector refuses ambiguous, substituted, expired, and unsuccessfully produced artifacts", () => {
  const artifact = packageArtifact(1);
  const cases = [
    ["artifact_identity_ambiguous", { artifacts: [artifact, packageArtifact(1, { id: artifact.id + 1 })] }],
    ["artifact_digest_invalid", { artifacts: [packageArtifact(1, { digest: "b".repeat(64) })] }],
    ["artifact_expired", { artifacts: [packageArtifact(1, { expired: true })] }],
    [
      "artifact_retention_invalid",
      { artifacts: [packageArtifact(1, { expires_at: "2026-12-19T11:59:59.999Z" })] },
    ],
    [
      "artifact_retention_invalid",
      {
        priorAttempts: [
          {
            attempt: 1,
            run: { ...workflowRun(1, { conclusion: "failure" }), created_at: "invalid" },
            jobs: [packageJob(1)],
          },
        ],
      },
    ],
    [
      "artifact_run_binding_invalid",
      {
        artifacts: [packageArtifact(1, { workflow_run: { id: 7, head_branch: "main", head_sha: headSha } })],
      },
    ],
    [
      "artifact_without_successful_producer",
      {
        priorAttempts: [
          {
            attempt: 1,
            run: workflowRun(1, { conclusion: "failure" }),
            jobs: [packageJob(1, { conclusion: "failure", build: "failure", upload: "skipped" })],
          },
        ],
      },
    ],
  ];
  for (const [violation, overrides] of cases) {
    const result = select(overrides);
    assert.equal(result.valid, false, violation);
    assert.ok(result.violations.includes(violation), violation);
  }
});

test("selector requires the complete bounded prior-attempt history and trusted current identity", () => {
  const incomplete = select({ attempt: 3, priorAttempts: [], artifacts: [] });
  assert.ok(incomplete.violations.includes("prior_attempts_incomplete"));

  const untrusted = select({
    currentRun: { ...workflowRun(2, { current: true }), triggering_actor: { login: "attacker" } },
  });
  assert.ok(untrusted.violations.includes("run_triggering_actor_invalid"));

  const missingRunTimestamp = select({
    currentRun: { ...workflowRun(2, { current: true }), created_at: undefined },
  });
  assert.ok(missingRunTimestamp.violations.includes("release_plan_artifact_retention_invalid"));

  const unbounded = evaluateCiStagingFrontendPackageSelection({
    repository,
    currentRun: workflowRun(101, { current: true }),
    artifacts: [],
    priorAttempts: [],
    expected: { runId, currentRunAttempt: 101, headSha },
    now,
  });
  assert.ok(unbounded.violations.includes("current_run_attempt_invalid"));
});

function selectionInput(overrides = {}) {
  return {
    baseSha,
    candidateSha: headSha,
    controlSha: baseSha,
    trustMode: "base-controls",
    controlImplementationSha256: "5".repeat(64),
    controlMatrixSha256: "2".repeat(64),
    candidateMatrixSha256: "6".repeat(64),
    controlCheckpointPolicySha256: "3".repeat(64),
    candidateCheckpointPolicySha256: "7".repeat(64),
    checkpointPolicySha256: "3".repeat(64),
    planSha256: "4".repeat(64),
    releasePlanArtifactId: String(releasePlanArtifact(2).id),
    releasePlanArtifactDigest: releasePlanArtifact(2).digest,
    releasePlanArtifactName: releasePlanArtifact(2).name,
    profile: "full-release",
    matrixSha256: "2".repeat(64),
    policySha256: "3".repeat(64),
    runId,
    gateRunAttempt: 2,
    sourceRunId: runId,
    sourceRunAttempt: 1,
    artifactId: "10695766721",
    artifactDigest: `sha256:${"b".repeat(64)}`,
    artifactName: `staging-frontend-${headSha}-${runId}-1`,
    profileSha256: "c".repeat(64),
    archiveSha256: "d".repeat(64),
    treeSha256: "e".repeat(64),
    archiveBytes: 4096,
    fileCount: 12,
    byteCount: 2048,
    sealSha256: "f".repeat(64),
    provenanceSha256: "1".repeat(64),
    ...overrides,
  };
}

test("selection manifest binds the green gate attempt to the original producer and exact bytes", () => {
  const value = createCiStagingFrontendSelection(selectionInput());
  assert.deepEqual(Object.keys(value).sort(), [
    "checkpoint",
    "dist",
    "event",
    "package",
    "releasePlan",
    "repository",
    "schemaVersion",
    "workflow",
  ]);
  assert.deepEqual(validateCiStagingFrontendSelection(value), { valid: true, violations: [] });
  assert.deepEqual(
    validateCiStagingFrontendSelection(value, {
      candidateSha: headSha,
      baseSha,
      planSha256: "4".repeat(64),
      releasePlanArtifactId: String(releasePlanArtifact(2).id),
      releasePlanArtifactDigest: releasePlanArtifact(2).digest,
      releasePlanArtifactName: releasePlanArtifact(2).name,
      runId,
      gateRunAttempt: 2,
      sourceRunId: runId,
      sourceRunAttempt: 1,
      artifactId: "10695766721",
      artifactDigest: `sha256:${"b".repeat(64)}`,
      artifactName: `staging-frontend-${headSha}-${runId}-1`,
      profile: "full-release",
      matrixSha256: "2".repeat(64),
      policySha256: "3".repeat(64),
    }),
    { valid: true, violations: [] },
  );

  const extra = structuredClone(value);
  extra.package.alias = "forbidden";
  assert.ok(validateCiStagingFrontendSelection(extra).violations.includes("package_invalid"));
  const legacyUnbound = structuredClone(value);
  legacyUnbound.schemaVersion = 1;
  delete legacyUnbound.releasePlan;
  assert.ok(validateCiStagingFrontendSelection(legacyUnbound).violations.includes("schema_invalid"));
  const futureProducer = structuredClone(value);
  futureProducer.package.sourceRunAttempt = 3;
  futureProducer.package.artifactName = `staging-frontend-${headSha}-${runId}-3`;
  assert.ok(validateCiStagingFrontendSelection(futureProducer).violations.includes("package_invalid"));
  assert.ok(
    validateCiStagingFrontendSelection(value, { artifactId: "7" }).violations.includes(
      "artifact_id_mismatch",
    ),
  );
  const unsafeReuse = structuredClone(value);
  unsafeReuse.checkpoint.mutationGatesReusable = true;
  assert.ok(validateCiStagingFrontendSelection(unsafeReuse).violations.includes("checkpoint_invalid"));

  const expectedReleasePlan = {
    baseSha,
    candidateSha: headSha,
    planSha256: "4".repeat(64),
    releasePlanArtifactId: String(releasePlanArtifact(2).id),
    releasePlanArtifactDigest: releasePlanArtifact(2).digest,
    releasePlanArtifactName: releasePlanArtifact(2).name,
  };
  for (const changed of [
    { key: "baseSha", value: "f".repeat(40), violation: "base_sha_mismatch" },
    { key: "candidateSha", value: "f".repeat(40), violation: "release_plan_invalid" },
    { key: "planSha256", value: "f".repeat(64), violation: "plan_sha256_mismatch" },
    { key: "artifactId", value: "7", violation: "release_plan_artifact_id_mismatch" },
    {
      key: "artifactDigest",
      value: `sha256:${"f".repeat(64)}`,
      violation: "release_plan_artifact_digest_mismatch",
    },
    {
      key: "artifactName",
      value: releasePlanArtifactName(headSha, runId, 1),
      violation: "release_plan_invalid",
    },
    { key: "matrixSha256", value: "f".repeat(64), violation: "release_plan_invalid" },
    { key: "profile", value: "frontend-only", violation: "release_plan_invalid" },
  ]) {
    const substituted = structuredClone(value);
    substituted.releasePlan[changed.key] = changed.value;
    assert.ok(
      validateCiStagingFrontendSelection(substituted, expectedReleasePlan).violations.includes(
        changed.violation,
      ),
      changed.key,
    );
  }
});

test("selection checkpoint hashes the validated matrix and fail-closed reuse policy", async () => {
  const controls = await readCiStagingFrontendSelectionControls({
    matrixPath,
    policyPath,
    profile: "full-release",
  });
  assert.match(controls.matrixSha256, /^[a-f0-9]{64}$/);
  assert.match(controls.policySha256, /^[a-f0-9]{64}$/);
  await assert.rejects(
    readCiStagingFrontendSelectionControls({
      matrixPath,
      policyPath,
      profile: "full-release",
      expectedMatrixSha256: "0".repeat(64),
    }),
    /MATRIX_DIGEST_MISMATCH/,
  );
  await assert.rejects(
    readCiStagingFrontendSelectionControls({
      matrixPath,
      policyPath,
      profile: "full-release",
      expectedPolicySha256: "0".repeat(64),
    }),
    /POLICY_DIGEST_MISMATCH/,
  );
});

test("downloaded release plan is schema-exact, recomputed from the matrix and bound to its bytes", async () => {
  const matrixBytes = await readFile(matrixPath);
  const policyBytes = await readFile(policyPath);
  const controlSelectorBytes = Buffer.from("// trusted selector\n", "utf8");
  const controlLibraryBytes = Buffer.from("// trusted library\n", "utf8");
  const matrix = JSON.parse(matrixBytes.toString("utf8"));
  const selection = selectReleaseProfile({
    matrix,
    changedFiles: [".github/workflows/ci.yml"],
    upstreamViolations: ["control_plane_change"],
  });
  const matrixSha256 = createHash("sha256").update(matrixBytes).digest("hex");
  const policySha256 = createHash("sha256").update(policyBytes).digest("hex");
  const controlImplementationSha256 = hashReleaseProfileImplementation(
    controlSelectorBytes,
    controlLibraryBytes,
  );
  const plan = {
    ...selection,
    schemaVersion: 2,
    matrixSha256,
    baseSha,
    candidateSha: headSha,
    controlSha: baseSha,
    trustMode: "base-controls",
    controlImplementationSha256,
    controlMatrixSha256: matrixSha256,
    candidateMatrixSha256: matrixSha256,
    controlCheckpointPolicySha256: policySha256,
    candidateCheckpointPolicySha256: policySha256,
    checkpointPolicySha256: policySha256,
  };
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  const planSha256 = createHash("sha256").update(serialized).digest("hex");
  const expected = {
    matrix,
    baseSha,
    candidateSha: headSha,
    profile: plan.selectedProfile,
    matrixSha256: plan.matrixSha256,
    planSha256,
    actualPlanSha256: planSha256,
    controlSha: baseSha,
    trustMode: "base-controls",
    actualControlImplementationSha256: controlImplementationSha256,
    actualControlMatrixSha256: matrixSha256,
    actualCandidateMatrixSha256: matrixSha256,
    actualControlCheckpointPolicySha256: policySha256,
    actualCandidateCheckpointPolicySha256: policySha256,
  };
  assert.deepEqual(validateCiReleasePlan(plan, expected), { valid: true, violations: [] });

  for (const [violation, mutate] of [
    ["release_plan_schema_invalid", (value) => (value.alias = "forbidden")],
    ["release_plan_matches_invalid", (value) => (value.matchesByFile[0].alias = "forbidden")],
    ["release_plan_profile_recomputed_mismatch", (value) => (value.selectedProfile = "frontend-only")],
    ["release_plan_jobs_recomputed_mismatch", (value) => value.jobs.pop()],
    ["release_plan_base_sha_mismatch", (value) => (value.baseSha = "f".repeat(40))],
  ]) {
    const changed = structuredClone(plan);
    mutate(changed);
    assert.ok(validateCiReleasePlan(changed, expected).violations.includes(violation), violation);
  }

  const directory = await mkdtemp(join(tmpdir(), "g12-ci-release-plan-"));
  try {
    const file = join(directory, "release-plan.json");
    const controlSelectorPath = join(directory, "release-control-selector.mjs");
    const controlLibraryPath = join(directory, "release-control-library.mjs");
    const controlMatrixPath = join(directory, "release-control-matrix.json");
    const controlCheckpointPolicyPath = join(directory, "release-control-checkpoint-policy.json");
    const candidateMatrixPath = join(directory, "candidate-release-gate-matrix.json");
    const candidateCheckpointPolicyPath = join(directory, "candidate-release-checkpoint-policy.json");
    await Promise.all([
      writeFile(file, serialized, "utf8"),
      writeFile(controlSelectorPath, controlSelectorBytes),
      writeFile(controlLibraryPath, controlLibraryBytes),
      writeFile(controlMatrixPath, matrixBytes),
      writeFile(controlCheckpointPolicyPath, policyBytes),
      writeFile(candidateMatrixPath, matrixBytes),
      writeFile(candidateCheckpointPolicyPath, policyBytes),
    ]);
    const fileExpected = {
      ...expected,
      controlSelectorPath,
      controlLibraryPath,
      controlMatrixPath,
      controlCheckpointPolicyPath,
      candidateMatrixPath,
      candidateCheckpointPolicyPath,
    };
    const verified = await verifyCiReleasePlan(file, fileExpected);
    assert.deepEqual(verified.plan, plan);
    assert.equal(verified.planSha256, planSha256);

    const fullRepositoryFiles = Array.from(
      { length: 2_585 },
      (_, index) => `src/styles/generated/component-${String(index).padStart(4, "0")}.css`,
    );
    const largeSelection = selectReleaseProfile({
      matrix,
      changedFiles: fullRepositoryFiles,
    });
    const largePlan = { ...plan, ...largeSelection, schemaVersion: plan.schemaVersion };
    const largeSerialized = `${JSON.stringify(largePlan, null, 2)}\n`;
    const largePlanSha256 = createHash("sha256").update(largeSerialized).digest("hex");
    assert.ok(Buffer.byteLength(largeSerialized) > 256 * 1024);
    assert.ok(Buffer.byteLength(largeSerialized) <= 1024 * 1024);
    await writeFile(file, largeSerialized, "utf8");
    const verifiedLargePlan = await verifyCiReleasePlan(file, {
      ...fileExpected,
      profile: largePlan.selectedProfile,
      planSha256: largePlanSha256,
      actualPlanSha256: largePlanSha256,
    });
    assert.equal(verifiedLargePlan.plan.changedFiles.length, 2_585);
    assert.equal(verifiedLargePlan.planSha256, largePlanSha256);

    await writeFile(file, Buffer.alloc(1024 * 1024 + 1, 0x20));
    await assert.rejects(verifyCiReleasePlan(file, fileExpected), /G12_CI_RELEASE_PLAN_FILE_REFUSED/);
    await writeFile(file, serialized, "utf8");

    await writeFile(controlSelectorPath, "// substituted selector\n", "utf8");
    await assert.rejects(
      verifyCiReleasePlan(file, fileExpected),
      /release_plan_control_implementation_sha256_mismatch/,
    );
    await writeFile(controlSelectorPath, controlSelectorBytes);

    const substitutedPolicy = JSON.parse(policyBytes.toString("utf8"));
    substitutedPolicy.reusableGates["artifact-seal"].maximumAgeSeconds -= 1;
    await writeFile(controlCheckpointPolicyPath, `${JSON.stringify(substitutedPolicy, null, 2)}\n`);
    await assert.rejects(
      verifyCiReleasePlan(file, fileExpected),
      /release_plan_control_checkpoint_policy_sha256_mismatch/,
    );
    await writeFile(controlCheckpointPolicyPath, policyBytes);

    await writeFile(candidateMatrixPath, `${matrixBytes.toString("utf8")}\n`, "utf8");
    await assert.rejects(
      verifyCiReleasePlan(file, fileExpected),
      /release_plan_candidate_matrix_sha256_mismatch/,
    );
    await writeFile(candidateMatrixPath, matrixBytes);

    await assert.rejects(
      verifyCiReleasePlan(file, { ...fileExpected, planSha256: "f".repeat(64) }),
      /release_plan_plan_sha256_mismatch/,
    );
    await writeFile(file, `${JSON.stringify({ ...plan, baseSha: "f".repeat(40) }, null, 2)}\n`, "utf8");
    await assert.rejects(verifyCiReleasePlan(file, fileExpected), /G12_CI_RELEASE_PLAN_REFUSED/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("bootstrap release plans are accepted only as explicit fail-closed full-release", () => {
  const matrixBytes = createBootstrapReleaseGateMatrixBytes();
  const policyBytes = createBootstrapReleaseCheckpointPolicyBytes();
  const bootstrapMatrix = JSON.parse(matrixBytes.toString("utf8"));
  const selectorBytes = Buffer.from("// bootstrap selector\n", "utf8");
  const libraryBytes = Buffer.from("// bootstrap library\n", "utf8");
  const selection = selectReleaseProfile({
    matrix: bootstrapMatrix,
    changedFiles: ["src/styles/theme.css"],
    upstreamViolations: ["control_bootstrap_required", "control_bundle_absent"],
  });
  const matrixSha256 = createHash("sha256").update(matrixBytes).digest("hex");
  const policySha256 = createHash("sha256").update(policyBytes).digest("hex");
  const implementationSha256 = hashReleaseProfileImplementation(selectorBytes, libraryBytes);
  const plan = {
    ...selection,
    schemaVersion: 2,
    baseSha,
    candidateSha: headSha,
    controlSha: baseSha,
    trustMode: "bootstrap-full",
    controlImplementationSha256: implementationSha256,
    controlMatrixSha256: matrixSha256,
    candidateMatrixSha256: null,
    controlCheckpointPolicySha256: policySha256,
    candidateCheckpointPolicySha256: null,
    checkpointPolicySha256: policySha256,
    matrixSha256,
  };
  const expected = {
    matrix: bootstrapMatrix,
    actualControlImplementationSha256: implementationSha256,
    actualControlMatrixSha256: matrixSha256,
    actualControlCheckpointPolicySha256: policySha256,
  };
  assert.deepEqual(validateCiReleasePlan(plan, expected), { valid: true, violations: [] });
  const narrowed = structuredClone(plan);
  narrowed.selectedProfile = "frontend-only";
  assert.ok(validateCiReleasePlan(narrowed, expected).violations.includes("release_plan_trust_mode_invalid"));
});

test("selection manifest writer is exclusive and verifier rejects symlink substitution", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "g12-ci-selection-"));
  try {
    const file = join(directory, "selection.json");
    await writeCiStagingFrontendSelection(file, selectionInput());
    const verified = await verifyCiStagingFrontendSelection(file, {
      candidateSha: headSha,
      runId,
      gateRunAttempt: 2,
      sourceRunAttempt: 1,
    });
    assert.equal(verified.package.artifactId, "10695766721");
    await assert.rejects(writeCiStagingFrontendSelection(file, selectionInput()), /EEXIST/);

    const alias = join(directory, "selection-link.json");
    try {
      await symlink(file, alias, "file");
    } catch (error) {
      if (["EPERM", "EACCES", "UNKNOWN"].includes(error?.code)) {
        t.skip(`symlink unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assert.rejects(
      verifyCiStagingFrontendSelection(alias),
      /G12_CI_STAGING_FRONTEND_SELECTION_FILE_REFUSED/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("release plan artifact resolver binds current and completed CI attempts without substitution", () => {
  const gateRunAttempt = 2;
  const artifact = releasePlanArtifact(gateRunAttempt);
  const expected = { runId, runAttempt: gateRunAttempt, candidateSha: headSha };
  for (const [current, run] of [
    [true, workflowRun(gateRunAttempt, { current: true })],
    [false, workflowRun(gateRunAttempt)],
  ]) {
    const result = evaluateCiReleasePlanArtifact({
      repository,
      run,
      artifacts: [artifact],
      expected,
      current,
      now,
    });
    assert.equal(result.valid, true);
    assert.equal(result.artifactId, String(artifact.id));
    assert.equal(result.artifactDigest, artifact.digest);
    assert.equal(result.artifactName, artifact.name);
  }

  const substitutions = [
    ["release_plan_artifact_not_unique", []],
    ["release_plan_artifact_not_unique", [artifact, { ...artifact, id: artifact.id + 1 }]],
    ["release_plan_artifact_digest_invalid", [{ ...artifact, digest: "7".repeat(64) }]],
    ["release_plan_artifact_retention_invalid", [{ ...artifact, expires_at: "2026-12-19T11:59:59.999Z" }]],
    ["release_plan_artifact_api_url_invalid", [{ ...artifact, url: "https://attacker.invalid" }]],
    [
      "release_plan_artifact_run_binding_invalid",
      [{ ...artifact, workflow_run: { ...artifact.workflow_run, head_sha: "f".repeat(40) } }],
    ],
  ];
  for (const [violation, artifacts] of substitutions) {
    const result = evaluateCiReleasePlanArtifact({
      repository,
      run: workflowRun(gateRunAttempt),
      artifacts,
      expected,
      now,
    });
    assert.ok(result.violations.includes(violation), violation);
  }
});

test("selection evidence resolves only with the exact release plan from the successful gate attempt", () => {
  const gateRunAttempt = 2;
  const name = stagingFrontendSelectionArtifactName(headSha, runId, gateRunAttempt);
  const id = 10695766799;
  const artifact = {
    id,
    name,
    digest: `sha256:${"9".repeat(64)}`,
    size_in_bytes: 2048,
    expired: false,
    created_at: "2026-09-20T12:01:00.000Z",
    expires_at: "2026-12-19T12:00:00.000Z",
    archive_download_url: `https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`,
    workflow_run: { id: Number(runId), head_branch: "main", head_sha: headSha },
  };
  const expected = { runId, gateRunAttempt, candidateSha: headSha };
  const planArtifact = releasePlanArtifact(gateRunAttempt);
  const valid = evaluateCiStagingFrontendSelectionArtifact({
    repository,
    run: workflowRun(gateRunAttempt),
    artifacts: [planArtifact, artifact],
    expected,
    now,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.artifactId, String(id));
  assert.equal(valid.releasePlanArtifactId, String(planArtifact.id));
  assert.equal(valid.releasePlanArtifactDigest, planArtifact.digest);

  const failedGate = evaluateCiStagingFrontendSelectionArtifact({
    repository,
    run: workflowRun(gateRunAttempt, { conclusion: "failure" }),
    artifacts: [planArtifact, artifact],
    expected,
    now,
  });
  assert.ok(failedGate.violations.includes("gate_run_not_successful"));

  const duplicate = evaluateCiStagingFrontendSelectionArtifact({
    repository,
    run: workflowRun(gateRunAttempt),
    artifacts: [planArtifact, artifact, { ...artifact, id: id + 1 }],
    expected,
    now,
  });
  assert.ok(duplicate.violations.includes("selection_artifact_not_unique"));

  const insufficientRetention = evaluateCiStagingFrontendSelectionArtifact({
    repository,
    run: workflowRun(gateRunAttempt),
    artifacts: [planArtifact, { ...artifact, expires_at: "2026-12-19T11:59:59.999Z" }],
    expected,
    now,
  });
  assert.ok(insufficientRetention.violations.includes("selection_artifact_retention_invalid"));

  const invalidRunTimestamp = evaluateCiStagingFrontendSelectionArtifact({
    repository,
    run: { ...workflowRun(gateRunAttempt), created_at: "invalid" },
    artifacts: [planArtifact, artifact],
    expected,
    now,
  });
  assert.ok(invalidRunTimestamp.violations.includes("selection_artifact_retention_invalid"));

  const substitutedPlan = evaluateCiStagingFrontendSelectionArtifact({
    repository,
    run: workflowRun(gateRunAttempt),
    artifacts: [{ ...planArtifact, digest: `sha256:${"f".repeat(64)}` }, artifact],
    expected: {
      ...expected,
      releasePlanArtifactDigest: planArtifact.digest,
    },
    now,
  });
  assert.ok(substitutedPlan.violations.includes("release_plan_artifact_digest_mismatch"));
});
