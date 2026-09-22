const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;
const REPOSITORY = "Vnd93/gaiatec-cms";
const WORKFLOW_NAME = "Deploy staging";
const WORKFLOW_PATH = ".github/workflows/deploy-staging.yml";

function positiveSafeInteger(value, maximum = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value > 0 && value <= maximum;
}

function exactArtifact(artifacts, name, violation, violations) {
  const matches = artifacts.filter((artifact) => artifact?.name === name);
  if (matches.length !== 1) {
    violations.push(violation);
    return null;
  }
  return matches[0];
}

function validateArtifact({ artifact, repository, run, violations, label }) {
  if (!artifact) return;
  const expectedUrl = `https://api.github.com/repos/${repository}/actions/artifacts/${artifact.id}`;
  if (
    !positiveSafeInteger(artifact.id) ||
    artifact.expired !== false ||
    !positiveSafeInteger(artifact.size_in_bytes, 2_147_483_648) ||
    !SHA256_DIGEST.test(String(artifact.digest ?? "")) ||
    artifact.url !== expectedUrl ||
    artifact.archive_download_url !== `${expectedUrl}/zip` ||
    artifact.workflow_run?.id !== run.id ||
    artifact.workflow_run?.head_branch !== "main" ||
    artifact.workflow_run?.head_sha !== run.head_sha
  ) {
    violations.push(`${label}_artifact_invalid`);
  }
}

function terminalChainArtifact(artifacts, run, violations) {
  const suffix = `-${run.id}-${run.run_attempt}`;
  const matches = artifacts.filter(
    (artifact) =>
      typeof artifact?.name === "string" &&
      artifact.name.startsWith("pipeline-end-to-end-") &&
      artifact.name.endsWith(suffix),
  );
  if (matches.length !== 1) {
    violations.push("staging_terminal_chain_artifact_not_unique");
    return { artifact: null, baselineSha: "" };
  }
  const match = matches[0].name.match(/^pipeline-end-to-end-([a-f0-9]{40})-([1-9]\d*)-([1-9]\d*)$/);
  if (
    !match ||
    Number(match[2]) !== run.id ||
    Number(match[3]) !== run.run_attempt ||
    !FULL_SHA.test(match[1])
  ) {
    violations.push("staging_terminal_chain_name_invalid");
    return { artifact: matches[0], baselineSha: "" };
  }
  return { artifact: matches[0], baselineSha: match[1] };
}

export function evaluateStagingReleaseBaseline({ repository, run, artifacts, candidateSha, isAncestor }) {
  const violations = [];
  const currentCandidate = String(candidateSha ?? "").toLowerCase();
  const repositoryName = String(repository ?? "");
  if (repositoryName !== REPOSITORY) violations.push("staging_baseline_repository_invalid");
  if (!FULL_SHA.test(currentCandidate)) violations.push("staging_baseline_candidate_sha_invalid");
  if (!run || typeof run !== "object" || Array.isArray(run)) {
    return {
      valid: false,
      baselineSha: "",
      violations: ["staging_baseline_run_invalid", ...violations].sort(),
    };
  }
  if (
    !positiveSafeInteger(run.id) ||
    !positiveSafeInteger(run.run_attempt, 100) ||
    run.name !== WORKFLOW_NAME ||
    run.path !== WORKFLOW_PATH ||
    run.event !== "workflow_dispatch" ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    run.head_branch !== "main" ||
    !FULL_SHA.test(String(run.head_sha ?? "")) ||
    run.repository?.full_name !== REPOSITORY ||
    run.head_repository?.full_name !== REPOSITORY ||
    String(run.actor?.login ?? "").toLowerCase() !== "vnd93" ||
    String(run.triggering_actor?.login ?? "").toLowerCase() !== "vnd93"
  ) {
    violations.push("staging_baseline_run_invalid");
  }
  if (!Array.isArray(artifacts) || artifacts.length > 1000) {
    return {
      valid: false,
      baselineSha: "",
      violations: [...new Set([...violations, "staging_baseline_artifact_list_invalid"])].sort(),
    };
  }

  const checkpoint = exactArtifact(
    artifacts,
    `staging-deploy-state-${run.id}-${run.run_attempt}`,
    "staging_checkpoint_artifact_not_unique",
    violations,
  );
  const terminal = exactArtifact(
    artifacts,
    `staging-terminal-${run.id}-${run.run_attempt}`,
    "staging_terminal_artifact_not_unique",
    violations,
  );
  const chain = terminalChainArtifact(artifacts, run, violations);
  validateArtifact({
    artifact: checkpoint,
    repository: repositoryName,
    run,
    violations,
    label: "staging_checkpoint",
  });
  validateArtifact({
    artifact: terminal,
    repository: repositoryName,
    run,
    violations,
    label: "staging_terminal",
  });
  validateArtifact({
    artifact: chain.artifact,
    repository: repositoryName,
    run,
    violations,
    label: "staging_terminal_chain",
  });

  if (typeof isAncestor !== "function") {
    violations.push("staging_baseline_ancestry_unproved");
  } else if (FULL_SHA.test(currentCandidate) && FULL_SHA.test(String(run.head_sha ?? ""))) {
    try {
      if (!isAncestor(run.head_sha, currentCandidate)) {
        violations.push("staging_control_ancestry_unproved");
      }
      if (!chain.baselineSha || !isAncestor(chain.baselineSha, currentCandidate)) {
        violations.push("staging_baseline_ancestry_unproved");
      }
    } catch {
      violations.push("staging_baseline_ancestry_unproved");
    }
  }

  const uniqueViolations = [...new Set(violations)].sort();
  return {
    valid: uniqueViolations.length === 0,
    baselineSha: uniqueViolations.length === 0 ? chain.baselineSha : "",
    runId: run.id,
    runAttempt: run.run_attempt,
    checkpointArtifactId: checkpoint?.id ?? null,
    terminalArtifactId: terminal?.id ?? null,
    chainArtifactId: chain.artifact?.id ?? null,
    violations: uniqueViolations,
  };
}

export const STAGING_RELEASE_BASELINE_REPOSITORY = REPOSITORY;
export const STAGING_RELEASE_BASELINE_WORKFLOW_PATH = WORKFLOW_PATH;
