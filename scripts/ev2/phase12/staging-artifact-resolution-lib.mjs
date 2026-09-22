const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function normalizeStagingArtifactDigest(value) {
  const digest = String(value ?? "").toLowerCase();
  if (/^[a-f0-9]{64}$/.test(digest)) return `sha256:${digest}`;
  return SHA256.test(digest) ? digest : "";
}

const PIPELINE_DURATION_COMPONENTS = Object.freeze({
  ci: Object.freeze({
    workflowName: "CI",
    workflowPath: ".github/workflows/ci.yml",
    event: "push",
  }),
  bridge: Object.freeze({
    workflowName: "Promote staging frontend bridge",
    workflowPath: ".github/workflows/promote-staging-frontend-bridge.yml",
    event: "workflow_dispatch",
  }),
});

const STAGING_CANDIDATE_WORKFLOW_NAME = "Deploy staging";
const STAGING_CANDIDATE_WORKFLOW_PATH = ".github/workflows/deploy-staging.yml";

export function evaluatePipelineDurationArtifact({
  component,
  repository,
  run,
  artifacts,
  expected,
  now = Date.now(),
}) {
  const violations = [];
  const definition = PIPELINE_DURATION_COMPONENTS[component];
  const runId = String(expected?.runId ?? "");
  const runAttempt = Number(expected?.runAttempt);
  const candidateSha = String(expected?.candidateSha ?? expected?.headSha ?? "");
  const controlSha = String(expected?.controlSha ?? expected?.headSha ?? "");
  const expectedName = `pipeline-duration-${component}-${candidateSha}-${runId}-${runAttempt}`;

  if (!definition) violations.push("component_invalid");
  if (repository !== CI_REPOSITORY) violations.push("repository_input_invalid");
  if (!POSITIVE_INTEGER.test(runId) || !Number.isSafeInteger(Number(runId)))
    violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 100)
    violations.push("run_attempt_invalid");
  if (!FULL_SHA.test(candidateSha)) violations.push("candidate_sha_invalid");
  if (!FULL_SHA.test(controlSha)) violations.push("control_sha_invalid");
  if (String(run?.id ?? "") !== runId) violations.push("run_identity_mismatch");
  if (run?.run_attempt !== runAttempt) violations.push("run_attempt_mismatch");
  if (run?.name !== definition?.workflowName || run?.path !== definition?.workflowPath)
    violations.push("run_workflow_invalid");
  if (run?.event !== definition?.event) violations.push("run_event_invalid");
  if (run?.head_branch !== "main") violations.push("run_branch_invalid");
  if (run?.head_sha !== controlSha) violations.push("run_head_sha_mismatch");
  if (run?.status !== "completed" || run?.conclusion !== "success") violations.push("run_not_successful");
  if (String(run?.actor?.login ?? "").toLowerCase() !== "vnd93") violations.push("run_actor_invalid");
  if (String(run?.triggering_actor?.login ?? "").toLowerCase() !== "vnd93")
    violations.push("run_triggering_actor_invalid");
  for (const key of ["repository", "head_repository"]) {
    if (String(run?.[key]?.full_name ?? "").toLowerCase() !== CI_REPOSITORY.toLowerCase())
      violations.push(`run_${key}_invalid`);
  }

  const matches = (Array.isArray(artifacts) ? artifacts : []).filter(
    (artifact) => artifact?.name === expectedName,
  );
  if (matches.length !== 1) violations.push("artifact_name_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1) violations.push("artifact_id_invalid");
  const normalizedDigest = normalizeStagingArtifactDigest(artifact?.digest);
  if (!SHA256.test(String(artifact?.digest ?? "")) || !normalizedDigest)
    violations.push("artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 1)
    violations.push("artifact_size_invalid");
  if (artifact?.expired !== false) violations.push("artifact_expired");
  const createdAt = Date.parse(artifact?.created_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    createdAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - createdAt < MINIMUM_RETENTION_MS
  ) {
    violations.push("artifact_retention_invalid");
  }
  if (
    String(artifact?.workflow_run?.id ?? "") !== runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== controlSha
  ) {
    violations.push("artifact_run_binding_invalid");
  }
  const expectedDownload = `https://api.github.com/repos/${CI_REPOSITORY}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload) violations.push("artifact_download_url_invalid");

  const unique = [...new Set(violations)];
  return {
    valid: unique.length === 0,
    violations: unique,
    artifact: unique.length === 0 ? artifact : null,
    artifactId: unique.length === 0 ? String(artifact.id) : "",
    artifactDigest: unique.length === 0 ? normalizedDigest : "",
    artifactName: expectedName,
    runId,
    runAttempt,
    candidateSha,
    controlSha,
    headSha: controlSha,
  };
}

export function evaluateStagingCandidateArtifact({ repository, run, artifacts, expected, now = Date.now() }) {
  const violations = [];
  const runId = String(expected?.runId ?? "");
  const runAttempt = Number(expected?.runAttempt);
  const artifactId = String(expected?.artifactId ?? "");
  const artifactDigest = normalizeStagingArtifactDigest(expected?.artifactDigest);
  const candidateSha = String(expected?.candidateSha ?? "");
  const expectedControlSha = String(expected?.controlSha ?? "");
  const controlSha = String(run?.head_sha ?? "");
  const expectedName = `staging-candidate-${candidateSha}-${runId}-${runAttempt}`;

  if (repository !== CI_REPOSITORY) violations.push("repository_input_invalid");
  if (!POSITIVE_INTEGER.test(runId) || !Number.isSafeInteger(Number(runId)))
    violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 100)
    violations.push("run_attempt_invalid");
  if (!POSITIVE_INTEGER.test(artifactId) || !Number.isSafeInteger(Number(artifactId)))
    violations.push("artifact_id_invalid");
  if (!artifactDigest) violations.push("artifact_digest_invalid");
  if (!FULL_SHA.test(candidateSha)) violations.push("candidate_sha_invalid");
  if (expectedControlSha && !FULL_SHA.test(expectedControlSha)) violations.push("control_sha_invalid");
  if (!Number.isSafeInteger(run?.id) || run.id < 1 || String(run.id) !== runId)
    violations.push("run_identity_mismatch");
  if (!Number.isSafeInteger(run?.run_attempt) || run.run_attempt !== runAttempt)
    violations.push("run_attempt_mismatch");
  if (run?.name !== STAGING_CANDIDATE_WORKFLOW_NAME || run?.path !== STAGING_CANDIDATE_WORKFLOW_PATH) {
    violations.push("run_workflow_invalid");
  }
  if (run?.status !== "completed" || run?.conclusion !== "success") violations.push("run_not_successful");
  if (run?.event !== "workflow_dispatch") violations.push("run_event_invalid");
  if (run?.head_branch !== "main") violations.push("run_branch_invalid");
  if (!FULL_SHA.test(controlSha)) violations.push("run_control_sha_invalid");
  if (expectedControlSha && controlSha !== expectedControlSha) violations.push("run_control_sha_mismatch");
  if (String(run?.actor?.login ?? "").toLowerCase() !== "vnd93") violations.push("run_actor_invalid");
  if (String(run?.triggering_actor?.login ?? "").toLowerCase() !== "vnd93")
    violations.push("run_triggering_actor_invalid");
  if (String(run?.repository?.full_name ?? "").toLowerCase() !== CI_REPOSITORY.toLowerCase())
    violations.push("run_repository_invalid");
  if (String(run?.head_repository?.full_name ?? "").toLowerCase() !== CI_REPOSITORY.toLowerCase())
    violations.push("run_head_repository_invalid");

  const candidates = Array.isArray(artifacts) ? artifacts : [];
  const identityMatches = candidates.filter((artifact) => String(artifact?.id ?? "") === artifactId);
  if (identityMatches.length !== 1) violations.push("artifact_identity_ambiguous");
  const nameMatches = candidates.filter((artifact) => artifact?.name === expectedName);
  if (nameMatches.length !== 1) violations.push("artifact_name_not_unique");
  const artifact = identityMatches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1 || String(artifact.id) !== artifactId)
    violations.push("artifact_id_invalid");
  if (artifact?.name !== expectedName) violations.push("artifact_name_invalid");
  if (artifact?.expired !== false) violations.push("artifact_expired");
  const normalizedRemoteDigest = normalizeStagingArtifactDigest(artifact?.digest);
  if (!SHA256.test(String(artifact?.digest ?? "")) || !normalizedRemoteDigest)
    violations.push("artifact_digest_invalid");
  if (normalizedRemoteDigest !== artifactDigest) violations.push("artifact_digest_mismatch");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes <= 0)
    violations.push("artifact_size_invalid");

  const createdAt = Date.parse(artifact?.created_at ?? "");
  const updatedAt = Date.parse(artifact?.updated_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(updatedAt) ||
    !Number.isFinite(expiresAt) ||
    createdAt > updatedAt ||
    updatedAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - createdAt < MINIMUM_RETENTION_MS
  ) {
    violations.push("artifact_retention_invalid");
  }
  if (
    !Number.isSafeInteger(artifact?.workflow_run?.id) ||
    artifact.workflow_run.id < 1 ||
    String(artifact.workflow_run.id) !== runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== controlSha
  ) {
    violations.push("artifact_run_binding_invalid");
  }
  const expectedApiUrl = `https://api.github.com/repos/${CI_REPOSITORY}/actions/artifacts/${artifact?.id}`;
  const expectedDownloadUrl = `${expectedApiUrl}/zip`;
  if (artifact?.url !== expectedApiUrl) violations.push("artifact_api_url_invalid");
  if (artifact?.archive_download_url !== expectedDownloadUrl)
    violations.push("artifact_download_url_invalid");

  const unique = [...new Set(violations)];
  return {
    valid: unique.length === 0,
    violations: unique,
    artifact: unique.length === 0 ? artifact : null,
    expectedName,
    normalizedDigest: artifactDigest,
    controlSha,
  };
}

const CI_REPOSITORY = "Vnd93/gaiatec-cms";
const CI_WORKFLOW_NAME = "CI";
const CI_WORKFLOW_PATH = ".github/workflows/ci.yml";
const MINIMUM_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
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

export function evaluateCiStagingFrontendArtifact({
  repository,
  run,
  gateRun = run,
  producerRun = run,
  producerJobs,
  artifacts,
  expected,
  now = Date.now(),
}) {
  const violations = [];
  const runId = String(expected?.runId ?? "");
  const runAttempt = Number(expected?.runAttempt);
  const gateRunAttempt = Number(expected?.gateRunAttempt ?? runAttempt);
  const headSha = String(expected?.headSha ?? "");
  const expectedName = `staging-frontend-${headSha}-${runId}-${runAttempt}`;

  if (repository !== CI_REPOSITORY) violations.push("repository_input_invalid");
  if (!POSITIVE_INTEGER.test(runId) || !Number.isSafeInteger(Number(runId)))
    violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1 || runAttempt > 100)
    violations.push("run_attempt_invalid");
  if (!Number.isSafeInteger(gateRunAttempt) || gateRunAttempt < runAttempt || gateRunAttempt > 100)
    violations.push("gate_run_attempt_invalid");
  if (!FULL_SHA.test(headSha)) violations.push("head_sha_invalid");
  for (const [label, value, attempt, requireSuccess] of [
    ["gate", gateRun, gateRunAttempt, true],
    ["producer", producerRun, runAttempt, false],
  ]) {
    if (!Number.isSafeInteger(value?.id) || value.id < 1 || String(value.id) !== runId)
      violations.push(`${label}_run_identity_mismatch`);
    if (!Number.isSafeInteger(value?.run_attempt) || value.run_attempt !== attempt)
      violations.push(`${label}_run_attempt_mismatch`);
    if (value?.name !== CI_WORKFLOW_NAME || value?.path !== CI_WORKFLOW_PATH)
      violations.push(`${label}_run_workflow_invalid`);
    if (value?.event !== "push") violations.push(`${label}_run_event_invalid`);
    if (value?.head_branch !== "main") violations.push(`${label}_run_branch_invalid`);
    if (value?.head_sha !== headSha) violations.push(`${label}_run_head_sha_mismatch`);
    if (
      value?.status !== "completed" ||
      (requireSuccess && value?.conclusion !== "success") ||
      (!requireSuccess && !TERMINAL_RUN_CONCLUSIONS.has(String(value?.conclusion ?? "")))
    ) {
      violations.push(`${label}_run_not_successful`);
    }
    if (String(value?.actor?.login ?? "").toLowerCase() !== "vnd93")
      violations.push(`${label}_run_actor_invalid`);
    if (String(value?.triggering_actor?.login ?? "").toLowerCase() !== "vnd93")
      violations.push(`${label}_run_triggering_actor_invalid`);
    if (String(value?.repository?.full_name ?? "").toLowerCase() !== CI_REPOSITORY.toLowerCase())
      violations.push(`${label}_run_repository_invalid`);
    if (String(value?.head_repository?.full_name ?? "").toLowerCase() !== CI_REPOSITORY.toLowerCase()) {
      violations.push(`${label}_run_head_repository_invalid`);
    }
  }

  const packageJobs = Array.isArray(producerJobs)
    ? producerJobs.filter((job) => job?.name === "package-staging")
    : [];
  if (packageJobs.length !== 1) violations.push("producer_package_job_not_unique");
  const packageJob = packageJobs[0];
  if (
    !Number.isSafeInteger(packageJob?.id) ||
    packageJob.id < 1 ||
    String(packageJob?.run_id ?? "") !== runId ||
    packageJob?.head_sha !== headSha ||
    packageJob?.status !== "completed" ||
    packageJob?.conclusion !== "success"
  ) {
    violations.push("producer_package_job_not_successful");
  }
  for (const [name, violation] of [
    ["Build, seal and verify the immutable staging frontend package", "producer_build_not_successful"],
    ["Upload the only deployable staging frontend package", "producer_upload_not_successful"],
  ]) {
    const steps = Array.isArray(packageJob?.steps)
      ? packageJob.steps.filter((step) => step?.name === name)
      : [];
    if (steps.length !== 1 || steps[0]?.status !== "completed" || steps[0]?.conclusion !== "success") {
      violations.push(violation);
    }
  }

  const matches = (Array.isArray(artifacts) ? artifacts : []).filter(
    (artifact) => artifact?.name === expectedName,
  );
  if (matches.length !== 1) violations.push("artifact_name_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || artifact.id < 1) violations.push("artifact_id_invalid");
  const normalizedDigest = normalizeStagingArtifactDigest(artifact?.digest);
  if (!SHA256.test(String(artifact?.digest ?? "")) || !normalizedDigest)
    violations.push("artifact_digest_invalid");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes < 1)
    violations.push("artifact_size_invalid");
  if (artifact?.expired !== false) violations.push("artifact_expired");

  const createdAt = Date.parse(artifact?.created_at ?? "");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    createdAt > now + 5 * 60 * 1000 ||
    expiresAt <= now ||
    expiresAt - createdAt < MINIMUM_RETENTION_MS
  ) {
    violations.push("artifact_retention_invalid");
  }
  if (
    !Number.isSafeInteger(artifact?.workflow_run?.id) ||
    artifact.workflow_run.id < 1 ||
    String(artifact.workflow_run.id) !== runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== headSha
  ) {
    violations.push("artifact_run_binding_invalid");
  }
  const expectedDownload = `https://api.github.com/repos/${CI_REPOSITORY}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload) violations.push("artifact_download_url_invalid");

  const unique = [...new Set(violations)];
  return {
    valid: unique.length === 0,
    violations: unique,
    artifact,
    expectedName,
    normalizedDigest,
    sourceRunId: runId,
    sourceRunAttempt: runAttempt,
    gateRunAttempt,
    controlSha: headSha,
  };
}
