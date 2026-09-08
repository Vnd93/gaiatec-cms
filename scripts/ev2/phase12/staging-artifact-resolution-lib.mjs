const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export function normalizeStagingArtifactDigest(value) {
  const digest = String(value ?? "").toLowerCase();
  if (/^[a-f0-9]{64}$/.test(digest)) return `sha256:${digest}`;
  return SHA256.test(digest) ? digest : "";
}

export function evaluateStagingCandidateArtifact({ run, artifacts, expected, now = Date.now() }) {
  const violations = [];
  const runId = String(expected?.runId ?? "");
  const runAttempt = Number(expected?.runAttempt);
  const artifactId = String(expected?.artifactId ?? "");
  const artifactDigest = normalizeStagingArtifactDigest(expected?.artifactDigest);
  const candidateSha = String(expected?.candidateSha ?? "");
  const expectedName = `staging-candidate-${candidateSha}-${runId}-${runAttempt}`;

  if (!POSITIVE_INTEGER.test(runId)) violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) violations.push("run_attempt_invalid");
  if (!POSITIVE_INTEGER.test(artifactId)) violations.push("artifact_id_invalid");
  if (!artifactDigest) violations.push("artifact_digest_invalid");
  if (!FULL_SHA.test(candidateSha)) violations.push("candidate_sha_invalid");
  if (String(run?.id ?? "") !== runId) violations.push("run_identity_mismatch");
  if (Number(run?.run_attempt) !== runAttempt) violations.push("run_attempt_mismatch");
  if (run?.status !== "completed" || run?.conclusion !== "success") violations.push("run_not_successful");
  if (run?.event !== "workflow_dispatch") violations.push("run_event_invalid");
  if (run?.head_branch !== "main") violations.push("run_branch_invalid");
  if (run?.path !== ".github/workflows/deploy-staging.yml") violations.push("run_workflow_invalid");
  if (run?.head_repository?.full_name !== "Vnd93/gaiatec-cms") violations.push("run_repository_invalid");
  if (!FULL_SHA.test(String(run?.head_sha ?? ""))) violations.push("run_control_sha_invalid");

  const matches = (Array.isArray(artifacts) ? artifacts : []).filter(
    (artifact) => String(artifact?.id ?? "") === artifactId,
  );
  if (matches.length !== 1) violations.push("artifact_identity_ambiguous");
  const artifact = matches[0];
  if (artifact?.name !== expectedName) violations.push("artifact_name_invalid");
  if (artifact?.expired !== false) violations.push("artifact_expired");
  if (normalizeStagingArtifactDigest(artifact?.digest) !== artifactDigest)
    violations.push("artifact_digest_mismatch");
  if (String(artifact?.workflow_run?.id ?? "") !== runId) violations.push("artifact_run_mismatch");
  if (!Number.isSafeInteger(artifact?.size_in_bytes) || artifact.size_in_bytes <= 0)
    violations.push("artifact_size_invalid");
  const expiresAt = Date.parse(artifact?.expires_at ?? "");
  if (!Number.isFinite(expiresAt) || expiresAt <= now) violations.push("artifact_retention_invalid");

  return {
    valid: violations.length === 0,
    violations,
    artifact,
    expectedName,
    normalizedDigest: artifactDigest,
  };
}
