import assert from "node:assert/strict";
import test from "node:test";

import {
  RELEASE_EVIDENCE_REPOSITORY,
  selectGitHubPrerequisiteArtifact,
  validateGitHubPrerequisiteRun,
} from "./production-prerequisite-gate-lib.mjs";

const now = new Date("2026-09-07T12:00:00.000Z");
const runId = "34000214134";
const artifactId = "987654321";
const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const expected = {
  runId,
  runAttempt: 2,
  workflowName: "Deploy staging",
  workflowPath: ".github/workflows/deploy-staging.yml",
  event: "workflow_dispatch",
  ref: "refs/heads/main",
  headSha: sha,
  completedAt: "2026-09-07T11:30:00.000Z",
};
const run = {
  id: Number(runId),
  run_attempt: 2,
  name: expected.workflowName,
  path: expected.workflowPath,
  head_branch: "main",
  head_sha: sha,
  event: expected.event,
  status: "completed",
  conclusion: "success",
  updated_at: expected.completedAt,
  repository: { full_name: RELEASE_EVIDENCE_REPOSITORY },
};
const artifact = {
  id: Number(artifactId),
  name: `staging-${sha}`,
  expired: false,
  expires_at: "2026-10-07T11:30:00.000Z",
  size_in_bytes: 8192,
  digest,
  archive_download_url: `https://api.github.com/repos/${RELEASE_EVIDENCE_REPOSITORY}/actions/artifacts/${artifactId}/zip`,
  workflow_run: { id: Number(runId), head_branch: "main", head_sha: sha },
};

test("remote prerequisite run is bound to exact workflow, attempt, main SHA and completion", () => {
  assert.deepEqual(
    validateGitHubPrerequisiteRun({
      repository: RELEASE_EVIDENCE_REPOSITORY,
      run,
      expected,
      now,
      violationPrefix: "staging",
    }),
    { valid: true, violations: [] },
  );
  for (const [field, value, violation] of [
    ["run_attempt", 3, /staging_run_attempt_mismatch/],
    ["path", ".github/workflows/other.yml", /staging_workflow_mismatch/],
    ["head_sha", "c".repeat(40), /staging_main_sha_mismatch/],
    ["conclusion", "failure", /staging_run_not_successful/],
    ["updated_at", "2026-09-07T11:31:00.000Z", /staging_completed_at_mismatch/],
  ]) {
    const result = validateGitHubPrerequisiteRun({
      repository: RELEASE_EVIDENCE_REPOSITORY,
      run: { ...run, [field]: value },
      expected,
      now,
      violationPrefix: "staging",
    });
    assert.match(result.violations.join(","), violation);
  }
});

test("remote prerequisite artifact is unique and bound to exact id, digest, run and candidate", () => {
  const expectedArtifact = {
    name: artifact.name,
    id: artifactId,
    digest,
    runId,
    headSha: sha,
  };
  assert.equal(
    selectGitHubPrerequisiteArtifact({
      repository: RELEASE_EVIDENCE_REPOSITORY,
      run,
      artifacts: [artifact],
      expected: expectedArtifact,
      now,
      violationPrefix: "staging_evidence",
    }).valid,
    true,
  );
  for (const [change, violation] of [
    [{ id: Number(artifactId) + 1 }, /staging_evidence_artifact_id_mismatch/],
    [{ digest: `sha256:${"0".repeat(64)}` }, /staging_evidence_artifact_digest_mismatch/],
    [{ expired: true }, /staging_evidence_artifact_expired/],
    [
      { workflow_run: { ...artifact.workflow_run, head_sha: "c".repeat(40) } },
      /staging_evidence_artifact_run_binding_invalid/,
    ],
  ]) {
    const result = selectGitHubPrerequisiteArtifact({
      repository: RELEASE_EVIDENCE_REPOSITORY,
      run,
      artifacts: [{ ...artifact, ...change }],
      expected: expectedArtifact,
      now,
      violationPrefix: "staging_evidence",
    });
    assert.match(result.violations.join(","), violation);
  }
  assert.match(
    selectGitHubPrerequisiteArtifact({
      repository: RELEASE_EVIDENCE_REPOSITORY,
      run,
      artifacts: [artifact, artifact],
      expected: expectedArtifact,
      now,
      violationPrefix: "staging_evidence",
    }).violations.join(","),
    /staging_evidence_artifact_not_unique/,
  );
});
