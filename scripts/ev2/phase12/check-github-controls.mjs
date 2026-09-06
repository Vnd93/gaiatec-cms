import { evaluateGithubControls } from "./release-guard-lib.mjs";
import { readFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
const candidateSha = process.env.CANDIDATE_SHA ?? "";
if (!/^[^/]+\/[^/]+$/.test(repository) || !token || !/^[a-f0-9]{40}$/.test(candidateSha))
  throw new Error("G12_GITHUB_CONTEXT_REQUIRED: repository, token and candidate SHA are mandatory.");

async function github(path) {
  const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2026-03-10",
    },
  });
  if (!response.ok) throw new Error(`G12_GITHUB_CONTROL_UNREADABLE:${path}:${response.status}`);
  return response.json();
}

const environment = await github("/environments/production");
const comparison = await github(`/compare/${candidateSha}...main`);
const branchProtection = await github("/branches/main/protection");
const workflowRunsPayload = await github(
  `/actions/runs?head_sha=${candidateSha}&status=completed&per_page=100`,
);
const successfulRuns = (workflowRunsPayload?.workflow_runs ?? []).filter(
  (run) => run?.head_sha === candidateSha && run?.conclusion === "success",
);
const workflowJobsPayloads = await Promise.all(
  successfulRuns.map((run) => github(`/actions/runs/${run.id}/jobs?filter=latest&per_page=100`)),
);
const workflowJobs = workflowJobsPayloads.flatMap((payload) => payload?.jobs ?? []);
const codeOwners = await readFile(".github/CODEOWNERS", "utf8").catch(() => "");
const result = evaluateGithubControls({
  environment,
  comparison,
  branchProtection,
  codeOwners,
  candidateSha,
  checkRuns: workflowJobs,
});
if (!result.valid) throw new Error(`G12_GITHUB_CONTROLS_BLOCKED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "g12.github.controls.verified",
    environment: "production",
    branch: "main",
    candidateSha,
    governanceMode: "sole-maintainer-direct-main",
    maintainerLogin: "Vnd93",
    independentApprovals: 0,
    requiredChecks: ["quality", "database", "browser"],
  }),
);
