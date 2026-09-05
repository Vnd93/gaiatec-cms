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
const branchProtection = await github("/branches/main/protection");
const associatedPulls = await github(`/commits/${candidateSha}/pulls`);
const pullRequest = associatedPulls.find(
  (item) =>
    item?.merged_at &&
    item?.base?.ref === "main" &&
    (item?.merge_commit_sha === candidateSha || item?.head?.sha === candidateSha),
);
const reviews = pullRequest ? await github(`/pulls/${pullRequest.number}/reviews?per_page=100`) : [];
const codeOwners = await readFile(".github/CODEOWNERS", "utf8").catch(() => "");
const result = evaluateGithubControls({
  environment,
  branchProtection,
  codeOwners,
  pullRequest,
  reviews,
});
if (!result.valid) throw new Error(`G12_GITHUB_CONTROLS_BLOCKED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "g12.github.controls.verified",
    environment: "production",
    branch: "main",
    candidateSha,
    pullRequest: pullRequest.number,
    independentApprovals: 2,
  }),
);
