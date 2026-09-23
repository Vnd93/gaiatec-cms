import { createHash } from "node:crypto";
import { lstat, mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { validateReleaseCheckpointPolicy } from "./release-checkpoint-lib.mjs";
import {
  RELEASE_PLAN_SCHEMA_VERSION,
  RELEASE_PROFILE_NAMES,
  hashReleaseProfileImplementation,
  selectReleaseProfile,
  validateReleaseGateMatrix,
} from "./release-profile-lib.mjs";
import { STAGING_FRONTEND_PACKAGE, stagingFrontendArtifactName } from "./staging-frontend-package-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const ZERO_SHA = /^0{40}$/;
const HEX_SHA256 = /^[a-f0-9]{64}$/;
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const MINIMUM_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_SELECTION_FILE_BYTES = 64 * 1024;
const MAX_RELEASE_PLAN_FILE_BYTES = 256 * 1024;
const MAX_CONTROL_FILE_BYTES = 1024 * 1024;
const PACKAGE_JOB_NAME = "package-staging";
const BUILD_STEP_NAME = "Build, seal and verify the immutable staging frontend package";
const UPLOAD_STEP_NAME = "Upload the only deployable staging frontend package";
const TERMINAL_RUN_CONCLUSIONS = new Set([
  "action_required",
  "cancelled",
  "failure",
  "neutral",
  "skipped",
  "stale",
  "success",
  "timed_out",
]);
const REUSABLE_DEPENDENCIES = Object.freeze(["source", "artifact"]);
const REUSABLE_GATES = Object.freeze(["artifact-seal", "immutable-provenance"]);

export const CI_STAGING_FRONTEND_SELECTION = Object.freeze({
  schemaVersion: 2,
  event: "g12.ci.staging_frontend.selected",
  artifactPrefix: "staging-frontend-selection",
  repository: STAGING_FRONTEND_PACKAGE.repository,
  workflowName: STAGING_FRONTEND_PACKAGE.workflowName,
  workflowPath: STAGING_FRONTEND_PACKAGE.workflowPath,
  environment: "staging",
});

export const CI_RELEASE_PLAN = Object.freeze({
  schemaVersion: RELEASE_PLAN_SCHEMA_VERSION,
  artifactPrefix: "release-plan",
  repository: STAGING_FRONTEND_PACKAGE.repository,
  workflowName: STAGING_FRONTEND_PACKAGE.workflowName,
  workflowPath: STAGING_FRONTEND_PACKAGE.workflowPath,
});

const RELEASE_PLAN_ROOT_KEYS = Object.freeze([
  "schemaVersion",
  "selectedProfile",
  "failClosed",
  "violations",
  "changedFiles",
  "matchesByFile",
  "jobs",
  "gates",
  "matrixSha256",
  "baseSha",
  "candidateSha",
  "controlSha",
  "trustMode",
  "controlImplementationSha256",
  "controlMatrixSha256",
  "candidateMatrixSha256",
  "controlCheckpointPolicySha256",
  "candidateCheckpointPolicySha256",
  "checkpointPolicySha256",
]);
const RELEASE_PLAN_MATCH_KEYS = Object.freeze(["path", "profiles", "reason"]);
const RELEASE_PLAN_CLASSIFICATION_VIOLATIONS = new Set([
  "changed_path_invalid",
  "changed_paths_empty",
  "control_critical_change",
  "unmatched_change",
  "overlapping_change",
  "mixed_release_domains",
]);
const RELEASE_PLAN_UPSTREAM_VIOLATIONS = new Set([
  "head_sha_invalid",
  "head_commit_missing",
  "base_sha_invalid",
  "change_range_untrusted",
  "control_plane_change",
  "control_bootstrap_required",
  "control_bundle_incomplete",
  "control_bundle_absent",
]);
const RELEASE_PLAN_TRUST_MODES = new Set(["base-controls", "bootstrap-full"]);
const RELEASE_PLAN_CONTROL_EXACT_PATHS = new Set([
  "scripts/ev2/phase12/release-profile-lib.mjs",
  "scripts/ev2/phase12/select-release-profile.mjs",
  ".github/release-controls/release-gate-matrix.json",
  ".github/workflows/ci.yml",
]);
const RELEASE_PLAN_CONTROL_PREFIXES = [".github/workflows/", ".github/release-controls/"];

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function deduplicate(values) {
  return [...new Set(values)];
}

function positiveInteger(value) {
  return POSITIVE_INTEGER.test(String(value ?? "")) && Number.isSafeInteger(Number(value));
}

function normalizeDigest(value) {
  const digest = String(value ?? "").toLowerCase();
  if (HEX_SHA256.test(digest)) return `sha256:${digest}`;
  return PREFIXED_SHA256.test(digest) ? digest : "";
}

function actorIsTrusted(actor) {
  return String(actor?.login ?? "").toLowerCase() === "vnd93";
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function safeRepositoryPath(value) {
  const path = String(value ?? "");
  return (
    path.length > 0 &&
    !path.includes("\\") &&
    !path.includes("\0") &&
    !path.startsWith("/") &&
    !path.endsWith("/") &&
    !path.split("/").some((segment) => segment.length === 0 || segment === "." || segment === "..")
  );
}

function sortedUniqueStrings(values, predicate = () => true) {
  return (
    Array.isArray(values) &&
    values.every((value) => typeof value === "string" && predicate(value)) &&
    new Set(values).size === values.length &&
    sameJson(values, [...values].sort())
  );
}

export function releasePlanArtifactName(candidateSha, runId, runAttempt) {
  return `${CI_RELEASE_PLAN.artifactPrefix}-${candidateSha}-${runId}-${runAttempt}`;
}

export function validateCiReleasePlan(value, expected = {}) {
  const violations = [];
  if (
    !exactKeys(value, RELEASE_PLAN_ROOT_KEYS) ||
    value?.schemaVersion !== CI_RELEASE_PLAN.schemaVersion ||
    !RELEASE_PROFILE_NAMES.includes(value?.selectedProfile) ||
    typeof value?.failClosed !== "boolean" ||
    !HEX_SHA256.test(value?.matrixSha256 ?? "") ||
    !FULL_SHA.test(value?.baseSha ?? "") ||
    !FULL_SHA.test(value?.candidateSha ?? "") ||
    ZERO_SHA.test(value?.candidateSha ?? "") ||
    value?.controlSha !== value?.baseSha ||
    !RELEASE_PLAN_TRUST_MODES.has(value?.trustMode) ||
    !HEX_SHA256.test(value?.controlImplementationSha256 ?? "") ||
    !HEX_SHA256.test(value?.controlMatrixSha256 ?? "") ||
    value?.matrixSha256 !== value?.controlMatrixSha256 ||
    !(value?.candidateMatrixSha256 === null || HEX_SHA256.test(value?.candidateMatrixSha256 ?? "")) ||
    !HEX_SHA256.test(value?.controlCheckpointPolicySha256 ?? "") ||
    value?.checkpointPolicySha256 !== value?.controlCheckpointPolicySha256 ||
    !(
      value?.candidateCheckpointPolicySha256 === null ||
      HEX_SHA256.test(value?.candidateCheckpointPolicySha256 ?? "")
    )
  ) {
    violations.push("release_plan_schema_invalid");
  }

  const allowedViolations = new Set([
    ...RELEASE_PLAN_CLASSIFICATION_VIOLATIONS,
    ...RELEASE_PLAN_UPSTREAM_VIOLATIONS,
  ]);
  if (!sortedUniqueStrings(value?.violations, (entry) => allowedViolations.has(entry)))
    violations.push("release_plan_violations_invalid");
  if (!sortedUniqueStrings(value?.changedFiles, safeRepositoryPath))
    violations.push("release_plan_changed_files_invalid");
  const controlPlaneChanged = Array.isArray(value?.changedFiles)
    ? value.changedFiles.some(
        (path) =>
          RELEASE_PLAN_CONTROL_EXACT_PATHS.has(path) ||
          RELEASE_PLAN_CONTROL_PREFIXES.some((prefix) => path.startsWith(prefix)),
      )
    : false;
  if (
    controlPlaneChanged !==
    (Array.isArray(value?.violations) && value.violations.includes("control_plane_change"))
  ) {
    violations.push("release_plan_control_change_binding_invalid");
  }
  const planViolations = Array.isArray(value?.violations) ? value.violations : [];
  if (
    value?.trustMode === "base-controls" &&
    (ZERO_SHA.test(value?.controlSha ?? "") ||
      planViolations.includes("control_bootstrap_required") ||
      planViolations.includes("control_bundle_incomplete") ||
      planViolations.includes("control_bundle_absent"))
  ) {
    violations.push("release_plan_trust_mode_invalid");
  }
  if (
    value?.trustMode === "bootstrap-full" &&
    (value?.selectedProfile !== "full-release" ||
      value?.failClosed !== true ||
      !planViolations.includes("control_bootstrap_required") ||
      !planViolations.includes("control_bundle_absent"))
  ) {
    violations.push("release_plan_trust_mode_invalid");
  }
  if (
    !Array.isArray(value?.jobs) ||
    value.jobs.length === 0 ||
    value.jobs.some((entry) => typeof entry !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(entry)) ||
    new Set(value.jobs).size !== value.jobs.length ||
    !Array.isArray(value?.gates) ||
    value.gates.length === 0 ||
    value.gates.some((entry) => typeof entry !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(entry)) ||
    new Set(value.gates).size !== value.gates.length
  ) {
    violations.push("release_plan_contract_invalid");
  }

  if (
    !Array.isArray(value?.matchesByFile) ||
    value.matchesByFile.length !== value?.changedFiles?.length ||
    value.matchesByFile.some(
      (entry, index) =>
        !exactKeys(entry, RELEASE_PLAN_MATCH_KEYS) ||
        entry?.path !== value.changedFiles[index] ||
        !Array.isArray(entry?.profiles) ||
        entry.profiles.some((profile) => !RELEASE_PROFILE_NAMES.includes(profile)) ||
        new Set(entry.profiles).size !== entry.profiles.length ||
        !["control-critical", "classified", "unmatched", "overlap"].includes(entry?.reason),
    )
  ) {
    violations.push("release_plan_matches_invalid");
  }

  const matrix = expected.matrix;
  if (!matrix) {
    violations.push("release_plan_matrix_required");
  } else {
    try {
      validateReleaseGateMatrix(matrix);
      const upstreamViolations = Array.isArray(value?.violations)
        ? value.violations.filter((entry) => RELEASE_PLAN_UPSTREAM_VIOLATIONS.has(entry))
        : [];
      const recomputed = selectReleaseProfile({
        matrix,
        changedFiles: Array.isArray(value?.changedFiles) ? value.changedFiles : [],
        upstreamViolations,
      });
      for (const [label, actual, wanted] of [
        ["profile", value?.selectedProfile, recomputed.selectedProfile],
        ["fail_closed", value?.failClosed, recomputed.failClosed],
        ["violations", value?.violations, recomputed.violations],
        ["changed_files", value?.changedFiles, recomputed.changedFiles],
        ["matches", value?.matchesByFile, recomputed.matchesByFile],
        ["jobs", value?.jobs, recomputed.jobs],
        ["gates", value?.gates, recomputed.gates],
      ]) {
        if (!sameJson(actual, wanted)) violations.push(`release_plan_${label}_recomputed_mismatch`);
      }
    } catch {
      violations.push("release_plan_matrix_invalid");
    }
  }

  if (
    expected.actualControlImplementationSha256 === undefined ||
    expected.actualControlMatrixSha256 === undefined ||
    expected.actualControlCheckpointPolicySha256 === undefined
  ) {
    violations.push("release_plan_control_files_required");
  }
  for (const [label, actual, wanted] of [
    [
      "control_implementation_sha256",
      value?.controlImplementationSha256,
      expected.actualControlImplementationSha256,
    ],
    ["control_matrix_sha256", value?.controlMatrixSha256, expected.actualControlMatrixSha256],
    [
      "control_checkpoint_policy_sha256",
      value?.controlCheckpointPolicySha256,
      expected.actualControlCheckpointPolicySha256,
    ],
    ["candidate_matrix_sha256", value?.candidateMatrixSha256, expected.actualCandidateMatrixSha256],
    [
      "candidate_checkpoint_policy_sha256",
      value?.candidateCheckpointPolicySha256,
      expected.actualCandidateCheckpointPolicySha256,
    ],
  ]) {
    if (wanted !== undefined && actual !== wanted) violations.push(`release_plan_${label}_mismatch`);
  }
  for (const [label, actual, wanted] of [
    ["base_sha", value?.baseSha, expected.baseSha],
    ["candidate_sha", value?.candidateSha, expected.candidateSha],
    ["profile", value?.selectedProfile, expected.profile],
    ["matrix_sha256", value?.matrixSha256, expected.matrixSha256],
    ["control_sha", value?.controlSha, expected.controlSha],
    ["trust_mode", value?.trustMode, expected.trustMode],
    ["checkpoint_policy_sha256", value?.checkpointPolicySha256, expected.checkpointPolicySha256],
    ["plan_sha256", expected.actualPlanSha256, expected.planSha256],
  ]) {
    if (wanted !== undefined && wanted !== "" && String(actual) !== String(wanted))
      violations.push(`release_plan_${label}_mismatch`);
  }

  const unique = deduplicate(violations);
  return { valid: unique.length === 0, violations: unique };
}

function validateRunIdentity(run, expected, { current }) {
  const violations = [];
  if (!Number.isSafeInteger(run?.id) || String(run.id) !== expected.runId)
    violations.push("run_identity_mismatch");
  if (!Number.isSafeInteger(run?.run_attempt) || run.run_attempt !== expected.runAttempt)
    violations.push("run_attempt_mismatch");
  if (
    run?.name !== CI_STAGING_FRONTEND_SELECTION.workflowName ||
    run?.path !== CI_STAGING_FRONTEND_SELECTION.workflowPath
  ) {
    violations.push("run_workflow_invalid");
  }
  if (run?.event !== "push") violations.push("run_event_invalid");
  if (run?.head_branch !== "main") violations.push("run_branch_invalid");
  if (run?.head_sha !== expected.headSha) violations.push("run_head_sha_mismatch");
  if (!actorIsTrusted(run?.actor)) violations.push("run_actor_invalid");
  if (!actorIsTrusted(run?.triggering_actor)) violations.push("run_triggering_actor_invalid");
  if (
    String(run?.repository?.full_name ?? "").toLowerCase() !==
    CI_STAGING_FRONTEND_SELECTION.repository.toLowerCase()
  ) {
    violations.push("run_repository_invalid");
  }
  if (
    String(run?.head_repository?.full_name ?? "").toLowerCase() !==
    CI_STAGING_FRONTEND_SELECTION.repository.toLowerCase()
  ) {
    violations.push("run_head_repository_invalid");
  }
  if (current) {
    if (run?.status !== "in_progress" || run?.conclusion !== null)
      violations.push("current_run_state_invalid");
  } else if (run?.status !== "completed" || !TERMINAL_RUN_CONCLUSIONS.has(String(run?.conclusion ?? ""))) {
    violations.push("prior_run_state_invalid");
  }
  return violations;
}

export function evaluateCiReleasePlanArtifact({
  repository,
  run,
  artifacts,
  expected,
  current = false,
  now = Date.now(),
}) {
  const violations = [];
  const runId = String(expected?.runId ?? "");
  const runAttempt = Number(expected?.runAttempt);
  const candidateSha = String(expected?.candidateSha ?? "");
  const expectedName = releasePlanArtifactName(candidateSha, runId, runAttempt);
  if (repository !== CI_RELEASE_PLAN.repository) violations.push("repository_input_invalid");
  if (!positiveInteger(runId)) violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 100)
    violations.push("run_attempt_invalid");
  if (!FULL_SHA.test(candidateSha) || ZERO_SHA.test(candidateSha)) violations.push("candidate_sha_invalid");
  violations.push(...validateRunIdentity(run, { runId, runAttempt, headSha: candidateSha }, { current }));
  if (!current && run?.conclusion !== "success") violations.push("release_plan_run_not_successful");

  const matches = (Array.isArray(artifacts) ? artifacts : []).filter(
    (artifact) => artifact?.name === expectedName,
  );
  if (matches.length !== 1) violations.push("release_plan_artifact_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1)
    violations.push("release_plan_artifact_id_invalid");
  const artifactDigest = normalizeDigest(artifact?.digest);
  if (!PREFIXED_SHA256.test(String(artifact?.digest ?? "")) || !artifactDigest)
    violations.push("release_plan_artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 1)
    violations.push("release_plan_artifact_size_invalid");
  if (artifact?.expired !== false) violations.push("release_plan_artifact_expired");
  const runCreatedAt = Date.parse(run?.created_at ?? "");
  const createdAt = Date.parse(artifact?.created_at ?? "");
  const updatedAt = Date.parse(artifact?.updated_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (
    !Number.isFinite(runCreatedAt) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt) ||
    !Number.isFinite(expiresAt) ||
    runCreatedAt > createdAt ||
    createdAt > updatedAt ||
    updatedAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - runCreatedAt < MINIMUM_RETENTION_MS
  ) {
    violations.push("release_plan_artifact_retention_invalid");
  }
  if (
    !Number.isSafeInteger(artifact?.workflow_run?.id) ||
    String(artifact.workflow_run.id) !== runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== candidateSha
  ) {
    violations.push("release_plan_artifact_run_binding_invalid");
  }
  const expectedApiUrl = `https://api.github.com/repos/${CI_RELEASE_PLAN.repository}/actions/artifacts/${artifact?.id}`;
  if (artifact?.url !== expectedApiUrl) violations.push("release_plan_artifact_api_url_invalid");
  if (artifact?.archive_download_url !== `${expectedApiUrl}/zip`)
    violations.push("release_plan_artifact_download_url_invalid");

  for (const [label, actual, wanted] of [
    ["id", artifact?.id, expected?.artifactId],
    ["digest", artifactDigest, normalizeDigest(expected?.artifactDigest)],
    ["name", artifact?.name, expected?.artifactName],
  ]) {
    if (wanted !== undefined && wanted !== "" && String(actual) !== String(wanted))
      violations.push(`release_plan_artifact_${label}_mismatch`);
  }

  const unique = deduplicate(violations);
  return {
    valid: unique.length === 0,
    violations: unique,
    artifact: unique.length === 0 ? artifact : null,
    artifactId: unique.length === 0 ? String(artifact.id) : "",
    artifactDigest: unique.length === 0 ? artifactDigest : "",
    artifactName: expectedName,
    runId,
    runAttempt,
    candidateSha,
  };
}

function stepState(job, name, violations, attempt) {
  const matches = Array.isArray(job?.steps) ? job.steps.filter((step) => step?.name === name) : [];
  if (job?.conclusion === "skipped" && matches.length === 0) {
    return { attempted: false, successful: false };
  }
  if (matches.length !== 1) {
    violations.push(`attempt_${attempt}_package_step_identity_invalid`);
    return { attempted: true, successful: false };
  }
  const step = matches[0];
  if (step?.status !== "completed" || typeof step?.conclusion !== "string") {
    violations.push(`attempt_${attempt}_package_step_state_invalid`);
  }
  return {
    attempted: step?.status === "completed" && step?.conclusion !== "skipped",
    successful: step?.status === "completed" && step?.conclusion === "success",
  };
}

function priorAttemptState(record, expected, violations) {
  const attempt = Number(record?.attempt);
  if (!Number.isSafeInteger(attempt) || attempt < 1 || attempt >= expected.currentRunAttempt) {
    violations.push("prior_attempt_identity_invalid");
    return null;
  }
  violations.push(
    ...validateRunIdentity(
      record?.run,
      { runId: expected.runId, runAttempt: attempt, headSha: expected.headSha },
      { current: false },
    ).map((violation) => `attempt_${attempt}_${violation}`),
  );
  if (!Array.isArray(record?.jobs)) {
    violations.push(`attempt_${attempt}_jobs_invalid`);
    return null;
  }
  const matches = record.jobs.filter((job) => job?.name === PACKAGE_JOB_NAME);
  if (matches.length !== 1) {
    violations.push(`attempt_${attempt}_package_job_identity_invalid`);
    return null;
  }
  const job = matches[0];
  if (
    !Number.isSafeInteger(job?.id) ||
    job.id < 1 ||
    String(job?.run_id ?? "") !== expected.runId ||
    job?.head_sha !== expected.headSha ||
    job?.status !== "completed" ||
    typeof job?.conclusion !== "string"
  ) {
    violations.push(`attempt_${attempt}_package_job_state_invalid`);
  }
  const build = stepState(job, BUILD_STEP_NAME, violations, attempt);
  const upload = stepState(job, UPLOAD_STEP_NAME, violations, attempt);
  if (upload.successful && !build.successful) violations.push(`attempt_${attempt}_upload_without_build`);
  return { attempt, run: record.run, job, build, upload };
}

function matchingPackageArtifacts(artifacts, expected) {
  const prefix = `staging-frontend-${expected.headSha}-${expected.runId}-`;
  return (Array.isArray(artifacts) ? artifacts : []).filter((artifact) =>
    String(artifact?.name ?? "").startsWith(prefix),
  );
}

function validatePackageArtifact(artifact, attemptState, expected, now, violations) {
  const expectedName = stagingFrontendArtifactName(expected.headSha, expected.runId, attemptState?.attempt);
  if (artifact?.name !== expectedName) violations.push("artifact_name_invalid");
  if (!attemptState?.build.successful || !attemptState?.upload.successful)
    violations.push("artifact_without_successful_producer");
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1) violations.push("artifact_id_invalid");
  const digest = normalizeDigest(artifact?.digest);
  if (!PREFIXED_SHA256.test(String(artifact?.digest ?? "")) || !digest)
    violations.push("artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 1)
    violations.push("artifact_size_invalid");
  if (artifact?.expired !== false) violations.push("artifact_expired");
  const runCreatedAt = Date.parse(attemptState?.run?.created_at ?? "");
  const createdAt = Date.parse(artifact?.created_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (
    !Number.isFinite(runCreatedAt) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    runCreatedAt > createdAt ||
    createdAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - runCreatedAt < MINIMUM_RETENTION_MS
  ) {
    violations.push("artifact_retention_invalid");
  }
  if (
    !Number.isSafeInteger(artifact?.workflow_run?.id) ||
    String(artifact.workflow_run.id) !== expected.runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== expected.headSha
  ) {
    violations.push("artifact_run_binding_invalid");
  }
  const expectedDownload = `https://api.github.com/repos/${CI_STAGING_FRONTEND_SELECTION.repository}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload) violations.push("artifact_download_url_invalid");
  return { digest, expectedName };
}

export function evaluateCiStagingFrontendPackageSelection({
  repository,
  currentRun,
  artifacts,
  priorAttempts,
  expected,
  now = Date.now(),
}) {
  const violations = [];
  const normalizedExpected = {
    runId: String(expected?.runId ?? ""),
    currentRunAttempt: Number(expected?.currentRunAttempt),
    headSha: String(expected?.headSha ?? ""),
  };
  if (repository !== CI_STAGING_FRONTEND_SELECTION.repository) violations.push("repository_input_invalid");
  if (!positiveInteger(normalizedExpected.runId)) violations.push("run_id_invalid");
  if (
    !Number.isSafeInteger(normalizedExpected.currentRunAttempt) ||
    normalizedExpected.currentRunAttempt < 1 ||
    normalizedExpected.currentRunAttempt > 100
  ) {
    violations.push("current_run_attempt_invalid");
  }
  if (!FULL_SHA.test(normalizedExpected.headSha)) violations.push("head_sha_invalid");
  if (!Array.isArray(artifacts)) violations.push("artifacts_invalid");
  if (!Array.isArray(priorAttempts)) violations.push("prior_attempts_invalid");

  const releasePlanArtifact = evaluateCiReleasePlanArtifact({
    repository,
    run: currentRun,
    artifacts,
    expected: {
      runId: normalizedExpected.runId,
      runAttempt: normalizedExpected.currentRunAttempt,
      candidateSha: normalizedExpected.headSha,
    },
    current: true,
    now,
  });
  violations.push(...releasePlanArtifact.violations);

  const records = Array.isArray(priorAttempts) ? priorAttempts : [];
  const expectedAttempts = Array.from(
    { length: Math.max(0, normalizedExpected.currentRunAttempt - 1) },
    (_, index) => index + 1,
  );
  const actualAttempts = records.map((record) => Number(record?.attempt)).sort((a, b) => a - b);
  if (JSON.stringify(actualAttempts) !== JSON.stringify(expectedAttempts))
    violations.push("prior_attempts_incomplete");
  const states = records
    .map((record) => priorAttemptState(record, normalizedExpected, violations))
    .filter(Boolean);
  const byAttempt = new Map(states.map((state) => [state.attempt, state]));
  const matches = matchingPackageArtifacts(artifacts, normalizedExpected);
  if (matches.length > 1) violations.push("artifact_identity_ambiguous");

  let artifact = null;
  let artifactDigest = "";
  let artifactName = stagingFrontendArtifactName(
    normalizedExpected.headSha,
    normalizedExpected.runId,
    normalizedExpected.currentRunAttempt,
  );
  let sourceRunAttempt = normalizedExpected.currentRunAttempt;
  let mode = "create";
  if (matches.length === 1) {
    artifact = matches[0];
    const match = /^staging-frontend-[a-f0-9]{40}-[1-9]\d*-([1-9]\d*)$/.exec(String(artifact?.name ?? ""));
    sourceRunAttempt = Number(match?.[1]);
    const state = byAttempt.get(sourceRunAttempt);
    if (!state || sourceRunAttempt >= normalizedExpected.currentRunAttempt)
      violations.push("artifact_producer_attempt_invalid");
    const checked = validatePackageArtifact(artifact, state, normalizedExpected, now, violations);
    artifactDigest = checked.digest;
    artifactName = checked.expectedName;
    mode = "reuse";
  } else if (matches.length === 0) {
    const previousAttempted = states.some((state) => state.build.attempted || state.upload.attempted);
    if (previousAttempted) violations.push("prior_package_missing");
  }

  const unique = deduplicate(violations);
  return {
    valid: unique.length === 0,
    violations: unique,
    mode: unique.length === 0 ? mode : "refuse",
    sourceRunId: normalizedExpected.runId,
    sourceRunAttempt,
    artifact,
    artifactId: artifact ? String(artifact.id) : "",
    artifactDigest,
    artifactName,
    controlSha: normalizedExpected.headSha,
    releasePlanArtifact: releasePlanArtifact.artifact,
    releasePlanArtifactId: releasePlanArtifact.artifactId,
    releasePlanArtifactDigest: releasePlanArtifact.artifactDigest,
    releasePlanArtifactName: releasePlanArtifact.artifactName,
  };
}

export function stagingFrontendSelectionArtifactName(candidateSha, runId, gateRunAttempt) {
  return `${CI_STAGING_FRONTEND_SELECTION.artifactPrefix}-${candidateSha}-${runId}-${gateRunAttempt}`;
}

export function createCiStagingFrontendSelection(input) {
  return {
    schemaVersion: CI_STAGING_FRONTEND_SELECTION.schemaVersion,
    event: CI_STAGING_FRONTEND_SELECTION.event,
    repository: CI_STAGING_FRONTEND_SELECTION.repository,
    checkpoint: {
      profile: input.profile,
      matrixSha256: input.matrixSha256,
      policySha256: input.policySha256,
      reusableDependencies: [...REUSABLE_DEPENDENCIES],
      reusableGates: [...REUSABLE_GATES],
      mutationGatesReusable: false,
    },
    workflow: {
      name: CI_STAGING_FRONTEND_SELECTION.workflowName,
      path: CI_STAGING_FRONTEND_SELECTION.workflowPath,
      runId: String(input.runId),
      gateRunAttempt: Number(input.gateRunAttempt),
      controlSha: input.candidateSha,
    },
    releasePlan: {
      baseSha: input.baseSha,
      candidateSha: input.candidateSha,
      controlSha: input.controlSha,
      trustMode: input.trustMode,
      controlImplementationSha256: input.controlImplementationSha256,
      controlMatrixSha256: input.controlMatrixSha256,
      candidateMatrixSha256: input.candidateMatrixSha256,
      controlCheckpointPolicySha256: input.controlCheckpointPolicySha256,
      candidateCheckpointPolicySha256: input.candidateCheckpointPolicySha256,
      checkpointPolicySha256: input.checkpointPolicySha256,
      planSha256: input.planSha256,
      artifactId: String(input.releasePlanArtifactId),
      artifactDigest: normalizeDigest(input.releasePlanArtifactDigest),
      artifactName: input.releasePlanArtifactName,
      matrixSha256: input.matrixSha256,
      profile: input.profile,
    },
    package: {
      sourceRunId: String(input.sourceRunId),
      sourceRunAttempt: Number(input.sourceRunAttempt),
      artifactId: String(input.artifactId),
      artifactDigest: normalizeDigest(input.artifactDigest),
      artifactName: input.artifactName,
      environment: CI_STAGING_FRONTEND_SELECTION.environment,
      profileSha256: input.profileSha256,
    },
    dist: {
      archiveSha256: input.archiveSha256,
      treeSha256: input.treeSha256,
      archiveBytes: Number(input.archiveBytes),
      fileCount: Number(input.fileCount),
      byteCount: Number(input.byteCount),
      sealSha256: input.sealSha256,
      provenanceSha256: input.provenanceSha256,
    },
  };
}

export function validateCiStagingFrontendSelection(value, expected = {}) {
  const violations = [];
  if (
    !exactKeys(value, [
      "schemaVersion",
      "event",
      "repository",
      "checkpoint",
      "workflow",
      "releasePlan",
      "package",
      "dist",
    ]) ||
    value?.schemaVersion !== CI_STAGING_FRONTEND_SELECTION.schemaVersion ||
    value?.event !== CI_STAGING_FRONTEND_SELECTION.event ||
    value?.repository !== CI_STAGING_FRONTEND_SELECTION.repository
  ) {
    violations.push("schema_invalid");
  }
  if (
    !exactKeys(value?.checkpoint, [
      "profile",
      "matrixSha256",
      "policySha256",
      "reusableDependencies",
      "reusableGates",
      "mutationGatesReusable",
    ]) ||
    !RELEASE_PROFILE_NAMES.includes(value?.checkpoint?.profile) ||
    !HEX_SHA256.test(value?.checkpoint?.matrixSha256 ?? "") ||
    !HEX_SHA256.test(value?.checkpoint?.policySha256 ?? "") ||
    JSON.stringify(value?.checkpoint?.reusableDependencies) !== JSON.stringify(REUSABLE_DEPENDENCIES) ||
    JSON.stringify(value?.checkpoint?.reusableGates) !== JSON.stringify(REUSABLE_GATES) ||
    value?.checkpoint?.mutationGatesReusable !== false
  ) {
    violations.push("checkpoint_invalid");
  }
  if (
    !exactKeys(value?.workflow, ["name", "path", "runId", "gateRunAttempt", "controlSha"]) ||
    value?.workflow?.name !== CI_STAGING_FRONTEND_SELECTION.workflowName ||
    value?.workflow?.path !== CI_STAGING_FRONTEND_SELECTION.workflowPath ||
    !positiveInteger(value?.workflow?.runId) ||
    !Number.isSafeInteger(value?.workflow?.gateRunAttempt) ||
    value.workflow.gateRunAttempt < 1 ||
    value.workflow.gateRunAttempt > 100 ||
    !FULL_SHA.test(value?.workflow?.controlSha ?? "")
  ) {
    violations.push("workflow_invalid");
  }
  if (
    !exactKeys(value?.releasePlan, [
      "baseSha",
      "candidateSha",
      "controlSha",
      "trustMode",
      "controlImplementationSha256",
      "controlMatrixSha256",
      "candidateMatrixSha256",
      "controlCheckpointPolicySha256",
      "candidateCheckpointPolicySha256",
      "checkpointPolicySha256",
      "planSha256",
      "artifactId",
      "artifactDigest",
      "artifactName",
      "matrixSha256",
      "profile",
    ]) ||
    !FULL_SHA.test(value?.releasePlan?.baseSha ?? "") ||
    !FULL_SHA.test(value?.releasePlan?.candidateSha ?? "") ||
    ZERO_SHA.test(value?.releasePlan?.candidateSha ?? "") ||
    value?.releasePlan?.candidateSha !== value?.workflow?.controlSha ||
    value?.releasePlan?.controlSha !== value?.releasePlan?.baseSha ||
    !RELEASE_PLAN_TRUST_MODES.has(value?.releasePlan?.trustMode) ||
    !HEX_SHA256.test(value?.releasePlan?.controlImplementationSha256 ?? "") ||
    !HEX_SHA256.test(value?.releasePlan?.controlMatrixSha256 ?? "") ||
    !(
      value?.releasePlan?.candidateMatrixSha256 === null ||
      HEX_SHA256.test(value?.releasePlan?.candidateMatrixSha256 ?? "")
    ) ||
    !HEX_SHA256.test(value?.releasePlan?.controlCheckpointPolicySha256 ?? "") ||
    value?.releasePlan?.checkpointPolicySha256 !== value?.releasePlan?.controlCheckpointPolicySha256 ||
    !(
      value?.releasePlan?.candidateCheckpointPolicySha256 === null ||
      HEX_SHA256.test(value?.releasePlan?.candidateCheckpointPolicySha256 ?? "")
    ) ||
    !HEX_SHA256.test(value?.releasePlan?.planSha256 ?? "") ||
    !positiveInteger(value?.releasePlan?.artifactId) ||
    !PREFIXED_SHA256.test(value?.releasePlan?.artifactDigest ?? "") ||
    value?.releasePlan?.artifactName !==
      releasePlanArtifactName(
        value?.workflow?.controlSha,
        value?.workflow?.runId,
        value?.workflow?.gateRunAttempt,
      ) ||
    value?.releasePlan?.matrixSha256 !== value?.checkpoint?.matrixSha256 ||
    value?.releasePlan?.controlMatrixSha256 !== value?.checkpoint?.matrixSha256 ||
    value?.releasePlan?.checkpointPolicySha256 !== value?.checkpoint?.policySha256 ||
    value?.releasePlan?.profile !== value?.checkpoint?.profile
  ) {
    violations.push("release_plan_invalid");
  }
  if (
    !exactKeys(value?.package, [
      "sourceRunId",
      "sourceRunAttempt",
      "artifactId",
      "artifactDigest",
      "artifactName",
      "environment",
      "profileSha256",
    ]) ||
    value?.package?.sourceRunId !== value?.workflow?.runId ||
    !Number.isSafeInteger(value?.package?.sourceRunAttempt) ||
    value.package.sourceRunAttempt < 1 ||
    value.package.sourceRunAttempt > 100 ||
    value.package.sourceRunAttempt > value?.workflow?.gateRunAttempt ||
    !positiveInteger(value?.package?.artifactId) ||
    !PREFIXED_SHA256.test(value?.package?.artifactDigest ?? "") ||
    value?.package?.artifactName !==
      stagingFrontendArtifactName(
        value?.workflow?.controlSha,
        value?.package?.sourceRunId,
        value?.package?.sourceRunAttempt,
      ) ||
    value?.package?.environment !== CI_STAGING_FRONTEND_SELECTION.environment ||
    !HEX_SHA256.test(value?.package?.profileSha256 ?? "")
  ) {
    violations.push("package_invalid");
  }
  if (
    !exactKeys(value?.dist, [
      "archiveSha256",
      "treeSha256",
      "archiveBytes",
      "fileCount",
      "byteCount",
      "sealSha256",
      "provenanceSha256",
    ]) ||
    !HEX_SHA256.test(value?.dist?.archiveSha256 ?? "") ||
    !HEX_SHA256.test(value?.dist?.treeSha256 ?? "") ||
    !Number.isSafeInteger(value?.dist?.archiveBytes) ||
    value.dist.archiveBytes < 1 ||
    !Number.isSafeInteger(value?.dist?.fileCount) ||
    value.dist.fileCount < 1 ||
    !Number.isSafeInteger(value?.dist?.byteCount) ||
    value.dist.byteCount < 1 ||
    !HEX_SHA256.test(value?.dist?.sealSha256 ?? "") ||
    !HEX_SHA256.test(value?.dist?.provenanceSha256 ?? "")
  ) {
    violations.push("dist_invalid");
  }
  const expectedPairs = [
    ["run_id", value?.workflow?.runId, expected.runId],
    ["gate_run_attempt", value?.workflow?.gateRunAttempt, expected.gateRunAttempt],
    ["candidate_sha", value?.workflow?.controlSha, expected.candidateSha],
    ["base_sha", value?.releasePlan?.baseSha, expected.baseSha],
    ["release_plan_control_sha", value?.releasePlan?.controlSha, expected.controlSha],
    ["release_plan_trust_mode", value?.releasePlan?.trustMode, expected.trustMode],
    [
      "release_plan_control_implementation_sha256",
      value?.releasePlan?.controlImplementationSha256,
      expected.controlImplementationSha256,
    ],
    [
      "release_plan_control_matrix_sha256",
      value?.releasePlan?.controlMatrixSha256,
      expected.controlMatrixSha256,
    ],
    [
      "release_plan_candidate_matrix_sha256",
      value?.releasePlan?.candidateMatrixSha256,
      expected.candidateMatrixSha256,
    ],
    [
      "release_plan_control_checkpoint_policy_sha256",
      value?.releasePlan?.controlCheckpointPolicySha256,
      expected.controlCheckpointPolicySha256,
    ],
    [
      "release_plan_candidate_checkpoint_policy_sha256",
      value?.releasePlan?.candidateCheckpointPolicySha256,
      expected.candidateCheckpointPolicySha256,
    ],
    [
      "release_plan_checkpoint_policy_sha256",
      value?.releasePlan?.checkpointPolicySha256,
      expected.checkpointPolicySha256,
    ],
    ["plan_sha256", value?.releasePlan?.planSha256, expected.planSha256],
    ["release_plan_artifact_id", value?.releasePlan?.artifactId, expected.releasePlanArtifactId],
    [
      "release_plan_artifact_digest",
      value?.releasePlan?.artifactDigest,
      normalizeDigest(expected.releasePlanArtifactDigest),
    ],
    ["release_plan_artifact_name", value?.releasePlan?.artifactName, expected.releasePlanArtifactName],
    ["source_run_id", value?.package?.sourceRunId, expected.sourceRunId],
    ["source_run_attempt", value?.package?.sourceRunAttempt, expected.sourceRunAttempt],
    ["artifact_id", value?.package?.artifactId, expected.artifactId],
    ["artifact_digest", value?.package?.artifactDigest, normalizeDigest(expected.artifactDigest)],
    ["artifact_name", value?.package?.artifactName, expected.artifactName],
    ["profile", value?.checkpoint?.profile, expected.profile],
    ["matrix_sha256", value?.checkpoint?.matrixSha256, expected.matrixSha256],
    ["policy_sha256", value?.checkpoint?.policySha256, expected.policySha256],
  ];
  for (const [label, actual, wanted] of expectedPairs) {
    if (wanted !== undefined && wanted !== "" && String(actual) !== String(wanted))
      violations.push(`${label}_mismatch`);
  }
  return { valid: violations.length === 0, violations: deduplicate(violations) };
}

async function readStableBytes(path, maximumBytes, refusedCode) {
  const filePath = resolve(path);
  const linkState = await lstat(filePath);
  if (linkState.isSymbolicLink() || !linkState.isFile()) throw new Error(refusedCode);
  const handle = await open(filePath, "r");
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      linkState.dev !== before.dev ||
      linkState.ino !== before.ino ||
      linkState.size !== before.size ||
      linkState.mtimeMs !== before.mtimeMs ||
      before.size < 2 ||
      before.size > maximumBytes
    )
      throw new Error(refusedCode);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    if (
      before.dev !== after.dev ||
      before.ino !== after.ino ||
      before.size !== after.size ||
      before.mtimeMs !== after.mtimeMs ||
      bytes.length !== before.size
    ) {
      throw new Error(`${refusedCode}_CHANGED`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

export async function verifyCiReleasePlan(path, expected = {}) {
  const bytes = await readStableBytes(path, MAX_RELEASE_PLAN_FILE_BYTES, "G12_CI_RELEASE_PLAN_FILE_REFUSED");
  const planSha256 = createHash("sha256").update(bytes).digest("hex");
  let plan;
  try {
    plan = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error("G12_CI_RELEASE_PLAN_JSON_REFUSED");
  }
  if (
    !expected.controlSelectorPath ||
    !expected.controlLibraryPath ||
    !expected.controlMatrixPath ||
    !expected.controlCheckpointPolicyPath
  ) {
    throw new Error("G12_CI_RELEASE_PLAN_CONTROL_FILES_REQUIRED");
  }
  const [controlSelectorBytes, controlLibraryBytes, controlMatrixBytes, controlCheckpointPolicyBytes] =
    await Promise.all([
      readStableBytes(
        expected.controlSelectorPath,
        MAX_CONTROL_FILE_BYTES,
        "G12_CI_RELEASE_PLAN_CONTROL_SELECTOR_REFUSED",
      ),
      readStableBytes(
        expected.controlLibraryPath,
        MAX_CONTROL_FILE_BYTES,
        "G12_CI_RELEASE_PLAN_CONTROL_LIBRARY_REFUSED",
      ),
      readStableBytes(
        expected.controlMatrixPath,
        MAX_CONTROL_FILE_BYTES,
        "G12_CI_RELEASE_PLAN_CONTROL_MATRIX_REFUSED",
      ),
      readStableBytes(
        expected.controlCheckpointPolicyPath,
        MAX_CONTROL_FILE_BYTES,
        "G12_CI_RELEASE_PLAN_CONTROL_CHECKPOINT_POLICY_REFUSED",
      ),
    ]);
  let matrix;
  let checkpointPolicy;
  try {
    matrix = JSON.parse(controlMatrixBytes.toString("utf8"));
    checkpointPolicy = JSON.parse(controlCheckpointPolicyBytes.toString("utf8"));
  } catch {
    throw new Error("G12_CI_RELEASE_PLAN_CONTROL_JSON_REFUSED");
  }
  validateReleaseCheckpointPolicy(checkpointPolicy);
  let actualCandidateMatrixSha256;
  if (expected.candidateMatrixPath) {
    const candidateMatrixBytes = await readStableBytes(
      expected.candidateMatrixPath,
      MAX_CONTROL_FILE_BYTES,
      "G12_CI_RELEASE_PLAN_CANDIDATE_MATRIX_REFUSED",
    );
    actualCandidateMatrixSha256 = createHash("sha256").update(candidateMatrixBytes).digest("hex");
  }
  let actualCandidateCheckpointPolicySha256;
  if (expected.candidateCheckpointPolicyPath) {
    const candidateCheckpointPolicyBytes = await readStableBytes(
      expected.candidateCheckpointPolicyPath,
      MAX_CONTROL_FILE_BYTES,
      "G12_CI_RELEASE_PLAN_CANDIDATE_CHECKPOINT_POLICY_REFUSED",
    );
    actualCandidateCheckpointPolicySha256 = createHash("sha256")
      .update(candidateCheckpointPolicyBytes)
      .digest("hex");
  }
  const result = validateCiReleasePlan(plan, {
    ...expected,
    matrix,
    actualPlanSha256: planSha256,
    actualControlImplementationSha256: hashReleaseProfileImplementation(
      controlSelectorBytes,
      controlLibraryBytes,
    ),
    actualControlMatrixSha256: createHash("sha256").update(controlMatrixBytes).digest("hex"),
    actualControlCheckpointPolicySha256: createHash("sha256")
      .update(controlCheckpointPolicyBytes)
      .digest("hex"),
    actualCandidateMatrixSha256,
    actualCandidateCheckpointPolicySha256,
  });
  if (!result.valid) throw new Error(`G12_CI_RELEASE_PLAN_REFUSED:${result.violations.join(",")}`);
  return { plan, planSha256, matrix };
}

export async function readCiStagingFrontendSelectionControls({
  matrixPath,
  policyPath,
  profile,
  expectedMatrixSha256,
  expectedPolicySha256,
}) {
  if (!RELEASE_PROFILE_NAMES.includes(profile))
    throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_PROFILE_REFUSED");
  const [matrixBytes, policyBytes] = await Promise.all([
    readStableBytes(matrixPath, MAX_CONTROL_FILE_BYTES, "G12_CI_STAGING_FRONTEND_SELECTION_MATRIX_REFUSED"),
    readStableBytes(policyPath, MAX_CONTROL_FILE_BYTES, "G12_CI_STAGING_FRONTEND_SELECTION_POLICY_REFUSED"),
  ]);
  let matrix;
  let policy;
  try {
    matrix = JSON.parse(matrixBytes.toString("utf8"));
    policy = JSON.parse(policyBytes.toString("utf8"));
  } catch {
    throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_CONTROL_JSON_REFUSED");
  }
  validateReleaseGateMatrix(matrix);
  validateReleaseCheckpointPolicy(policy);
  if (!matrix.profiles[profile]) throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_PROFILE_REFUSED");
  for (const gate of REUSABLE_GATES) {
    if (
      JSON.stringify(policy.reusableGates?.[gate]?.dependencies) !== JSON.stringify(REUSABLE_DEPENDENCIES)
    ) {
      throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_REUSE_POLICY_REFUSED");
    }
  }
  const matrixSha256 = createHash("sha256").update(matrixBytes).digest("hex");
  const policySha256 = createHash("sha256").update(policyBytes).digest("hex");
  if (expectedMatrixSha256 && matrixSha256 !== expectedMatrixSha256)
    throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_MATRIX_DIGEST_MISMATCH");
  if (expectedPolicySha256 && policySha256 !== expectedPolicySha256)
    throw new Error("G12_CI_STAGING_FRONTEND_SELECTION_POLICY_DIGEST_MISMATCH");
  return { profile, matrixSha256, policySha256, matrix };
}

async function readStableJson(path) {
  const bytes = await readStableBytes(
    path,
    MAX_SELECTION_FILE_BYTES,
    "G12_CI_STAGING_FRONTEND_SELECTION_FILE_REFUSED",
  );
  return JSON.parse(bytes.toString("utf8"));
}

export async function writeCiStagingFrontendSelection(path, input) {
  const value = createCiStagingFrontendSelection(input);
  const result = validateCiStagingFrontendSelection(value);
  if (!result.valid)
    throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_REFUSED:${result.violations.join(",")}`);
  const filePath = resolve(path);
  await mkdir(dirname(filePath), { recursive: true });
  const handle = await open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return value;
}

export async function verifyCiStagingFrontendSelection(path, expected = {}) {
  const value = await readStableJson(path);
  const result = validateCiStagingFrontendSelection(value, expected);
  if (!result.valid)
    throw new Error(`G12_CI_STAGING_FRONTEND_SELECTION_REFUSED:${result.violations.join(",")}`);
  return value;
}

export function evaluateCiStagingFrontendSelectionArtifact({
  repository,
  run,
  artifacts,
  expected,
  now = Date.now(),
}) {
  const violations = [];
  const runId = String(expected?.runId ?? "");
  const gateRunAttempt = Number(expected?.gateRunAttempt);
  const candidateSha = String(expected?.candidateSha ?? "");
  if (repository !== CI_STAGING_FRONTEND_SELECTION.repository) violations.push("repository_input_invalid");
  if (!positiveInteger(runId)) violations.push("run_id_invalid");
  if (!Number.isSafeInteger(gateRunAttempt) || gateRunAttempt < 1 || gateRunAttempt > 100)
    violations.push("gate_run_attempt_invalid");
  if (!FULL_SHA.test(candidateSha)) violations.push("candidate_sha_invalid");
  violations.push(
    ...validateRunIdentity(
      run,
      { runId, runAttempt: gateRunAttempt, headSha: candidateSha },
      { current: false },
    ),
  );
  if (run?.conclusion !== "success") violations.push("gate_run_not_successful");
  const releasePlanArtifact = evaluateCiReleasePlanArtifact({
    repository,
    run,
    artifacts,
    expected: {
      runId,
      runAttempt: gateRunAttempt,
      candidateSha,
      artifactId: expected?.releasePlanArtifactId,
      artifactDigest: expected?.releasePlanArtifactDigest,
      artifactName: expected?.releasePlanArtifactName,
    },
    now,
  });
  violations.push(...releasePlanArtifact.violations);
  const expectedName = stagingFrontendSelectionArtifactName(candidateSha, runId, gateRunAttempt);
  const matches = (Array.isArray(artifacts) ? artifacts : []).filter(
    (artifact) => artifact?.name === expectedName,
  );
  if (matches.length !== 1) violations.push("selection_artifact_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1)
    violations.push("selection_artifact_id_invalid");
  const digest = normalizeDigest(artifact?.digest);
  if (!PREFIXED_SHA256.test(String(artifact?.digest ?? "")) || !digest)
    violations.push("selection_artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 1)
    violations.push("selection_artifact_size_invalid");
  if (artifact?.expired !== false) violations.push("selection_artifact_expired");
  const runCreatedAt = Date.parse(run?.created_at ?? "");
  const createdAt = Date.parse(artifact?.created_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (
    !Number.isFinite(runCreatedAt) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    runCreatedAt > createdAt ||
    createdAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - runCreatedAt < MINIMUM_RETENTION_MS
  ) {
    violations.push("selection_artifact_retention_invalid");
  }
  if (
    String(artifact?.workflow_run?.id ?? "") !== runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== candidateSha
  ) {
    violations.push("selection_artifact_run_binding_invalid");
  }
  const expectedDownload = `https://api.github.com/repos/${CI_STAGING_FRONTEND_SELECTION.repository}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload)
    violations.push("selection_artifact_download_url_invalid");
  const unique = deduplicate(violations);
  return {
    valid: unique.length === 0,
    violations: unique,
    artifact,
    artifactId: artifact ? String(artifact.id) : "",
    artifactDigest: digest,
    artifactName: expectedName,
    gateRunId: runId,
    gateRunAttempt,
    controlSha: candidateSha,
    releasePlanArtifact: releasePlanArtifact.artifact,
    releasePlanArtifactId: releasePlanArtifact.artifactId,
    releasePlanArtifactDigest: releasePlanArtifact.artifactDigest,
    releasePlanArtifactName: releasePlanArtifact.artifactName,
  };
}

export const CI_STAGING_FRONTEND_PACKAGE_STEPS = Object.freeze({
  job: PACKAGE_JOB_NAME,
  build: BUILD_STEP_NAME,
  upload: UPLOAD_STEP_NAME,
});
