export const RELEASE_EVIDENCE_REPOSITORY = "Vnd93/gaiatec-cms";
export const STAGING_WORKFLOW_NAME = "Deploy staging";
export const STAGING_WORKFLOW_PATH = ".github/workflows/deploy-staging.yml";
export const EMAIL_WORKFLOW_NAME = "Verify production email provider";
export const EMAIL_WORKFLOW_PATH = ".github/workflows/verify-production-email.yml";

const parseDate = (value) => (typeof value === "string" ? Date.parse(value) : Number.NaN);

export function validateGitHubPrerequisiteRun({
  repository,
  run,
  expected,
  now = new Date(),
  violationPrefix,
}) {
  const violations = [];
  const fail = (suffix) => violations.push(`${violationPrefix}_${suffix}`);
  const nowAt = now instanceof Date ? now.getTime() : parseDate(now);
  const completedAt = parseDate(run?.updated_at);
  if (repository !== RELEASE_EVIDENCE_REPOSITORY) fail("repository_input_invalid");
  if (String(run?.repository?.full_name ?? "").toLowerCase() !== RELEASE_EVIDENCE_REPOSITORY.toLowerCase())
    fail("repository_invalid");
  if (String(run?.id ?? "") !== expected?.runId) fail("run_id_mismatch");
  if (run?.run_attempt !== expected?.runAttempt) fail("run_attempt_mismatch");
  if (run?.name !== expected?.workflowName || run?.path !== expected?.workflowPath) fail("workflow_mismatch");
  if (
    run?.head_branch !== "main" ||
    expected?.ref !== "refs/heads/main" ||
    run?.head_sha !== expected?.headSha
  )
    fail("main_sha_mismatch");
  if (run?.event !== expected?.event) fail("event_mismatch");
  if (run?.status !== "completed" || run?.conclusion !== "success") fail("run_not_successful");
  if (
    !Number.isFinite(completedAt) ||
    !Number.isFinite(nowAt) ||
    completedAt > nowAt + 5 * 60_000 ||
    run?.updated_at !== expected?.completedAt
  )
    fail("completed_at_mismatch");
  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}

export function selectGitHubPrerequisiteArtifact({
  repository,
  run,
  artifacts,
  expected,
  now = new Date(),
  violationPrefix,
}) {
  const violations = [];
  const fail = (suffix) => violations.push(`${violationPrefix}_${suffix}`);
  const nowAt = now instanceof Date ? now.getTime() : parseDate(now);
  const matches = Array.isArray(artifacts)
    ? artifacts.filter((artifact) => artifact?.name === expected?.name)
    : [];
  if (matches.length !== 1) fail("artifact_not_unique");
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact?.id) || String(artifact.id) !== expected?.id)
    fail("artifact_id_mismatch");
  if (artifact?.digest !== expected?.digest || !/^sha256:[a-f0-9]{64}$/.test(artifact?.digest ?? ""))
    fail("artifact_digest_mismatch");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes <= 0)
    fail("artifact_size_invalid");
  const expiresAt = parseDate(artifact?.expires_at);
  if (
    artifact?.expired !== false ||
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(nowAt) ||
    expiresAt <= nowAt
  )
    fail("artifact_expired");
  if (
    String(artifact?.workflow_run?.id ?? "") !== expected?.runId ||
    artifact?.workflow_run?.head_branch !== "main" ||
    artifact?.workflow_run?.head_sha !== expected?.headSha ||
    String(run?.id ?? "") !== expected?.runId
  )
    fail("artifact_run_binding_invalid");
  const expectedDownload = `https://api.github.com/repos/${repository}/actions/artifacts/${artifact?.id}/zip`;
  if (artifact?.archive_download_url !== expectedDownload) fail("artifact_download_url_invalid");
  const uniqueViolations = [...new Set(violations)];
  return {
    valid: uniqueViolations.length === 0,
    violations: uniqueViolations,
    artifact: uniqueViolations.length === 0 ? artifact : null,
  };
}
