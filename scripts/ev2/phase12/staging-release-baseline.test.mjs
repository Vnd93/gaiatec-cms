import assert from "node:assert/strict";
import test from "node:test";

import { evaluateStagingReleaseBaseline } from "./staging-release-baseline-lib.mjs";

const repository = "Vnd93/gaiatec-cms";
const currentCandidateSha = "d".repeat(40);
const baselineSha = "a".repeat(40);
const controlSha = "b".repeat(40);
const runId = 35_347_256_421;
const runAttempt = 2;

function runFixture() {
  return {
    id: runId,
    run_attempt: runAttempt,
    name: "Deploy staging",
    path: ".github/workflows/deploy-staging.yml",
    event: "workflow_dispatch",
    status: "completed",
    conclusion: "success",
    head_branch: "main",
    head_sha: controlSha,
    repository: { full_name: repository },
    head_repository: { full_name: repository },
    actor: { login: "Vnd93" },
    triggering_actor: { login: "Vnd93" },
  };
}

function artifact(id, name) {
  const url = `https://api.github.com/repos/${repository}/actions/artifacts/${id}`;
  return {
    id,
    name,
    expired: false,
    size_in_bytes: 1024,
    digest: `sha256:${String(id).slice(-1).repeat(64)}`,
    url,
    archive_download_url: `${url}/zip`,
    workflow_run: {
      id: runId,
      head_branch: "main",
      head_sha: controlSha,
    },
  };
}

function artifactFixture() {
  return [
    artifact(101, `staging-deploy-state-${runId}-${runAttempt}`),
    artifact(102, `staging-terminal-${runId}-${runAttempt}`),
    artifact(103, `pipeline-end-to-end-${baselineSha}-${runId}-${runAttempt}`),
  ];
}

function evaluate(overrides = {}) {
  return evaluateStagingReleaseBaseline({
    repository,
    run: runFixture(),
    artifacts: artifactFixture(),
    candidateSha: currentCandidateSha,
    isAncestor: () => true,
    ...overrides,
  });
}

test("selects only a terminal-green staging SHA with its exact durable checkpoint", () => {
  const result = evaluate();
  assert.equal(result.valid, true);
  assert.equal(result.baselineSha, baselineSha);
  assert.equal(result.runId, runId);
  assert.equal(result.runAttempt, runAttempt);
  assert.equal(result.checkpointArtifactId, 101);
  assert.equal(result.terminalArtifactId, 102);
  assert.equal(result.chainArtifactId, 103);
  assert.deepEqual(result.violations, []);
});

test("refuses a nominally successful run without unique checkpoint and terminal proof", () => {
  for (const [missingName, violation] of [
    [`staging-deploy-state-${runId}-${runAttempt}`, "staging_checkpoint_artifact_not_unique"],
    [`staging-terminal-${runId}-${runAttempt}`, "staging_terminal_artifact_not_unique"],
    [
      `pipeline-end-to-end-${baselineSha}-${runId}-${runAttempt}`,
      "staging_terminal_chain_artifact_not_unique",
    ],
  ]) {
    const artifacts = artifactFixture().filter((candidate) => candidate.name !== missingName);
    const result = evaluate({ artifacts });
    assert.equal(result.valid, false);
    assert.equal(result.baselineSha, "");
    assert.ok(result.violations.includes(violation));
  }
});

test("refuses expired, substituted or attempt-mismatched checkpoint evidence", () => {
  const expired = artifactFixture();
  expired[0] = { ...expired[0], expired: true };
  assert.ok(evaluate({ artifacts: expired }).violations.includes("staging_checkpoint_artifact_invalid"));

  const substituted = artifactFixture();
  substituted[1] = {
    ...substituted[1],
    workflow_run: { ...substituted[1].workflow_run, head_sha: "f".repeat(40) },
  };
  assert.ok(evaluate({ artifacts: substituted }).violations.includes("staging_terminal_artifact_invalid"));

  const wrongAttempt = artifactFixture();
  wrongAttempt[2] = artifact(103, `pipeline-end-to-end-${baselineSha}-${runId}-${runAttempt + 1}`);
  assert.ok(
    evaluate({ artifacts: wrongAttempt }).violations.includes("staging_terminal_chain_artifact_not_unique"),
  );
});

test("fails closed when either the staging control or deployed SHA ancestry is unproved", () => {
  const result = evaluate({
    isAncestor: (base) => base === controlSha,
  });
  assert.equal(result.valid, false);
  assert.deepEqual(result.violations, ["staging_baseline_ancestry_unproved"]);

  const noControlAncestry = evaluate({
    isAncestor: (base) => base === baselineSha,
  });
  assert.equal(noControlAncestry.valid, false);
  assert.deepEqual(noControlAncestry.violations, ["staging_control_ancestry_unproved"]);
});

test("refuses noncanonical workflow, actor, status and repository metadata", () => {
  for (const mutate of [
    (value) => (value.path = ".github/workflows/other.yml"),
    (value) => (value.actor.login = "attacker"),
    (value) => (value.conclusion = "failure"),
    (value) => (value.repository.full_name = "Vnd93/other"),
  ]) {
    const run = runFixture();
    mutate(run);
    const result = evaluate({ run });
    assert.equal(result.valid, false);
    assert.ok(result.violations.includes("staging_baseline_run_invalid"));
  }
});
