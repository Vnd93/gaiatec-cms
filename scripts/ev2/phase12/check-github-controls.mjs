import { evaluateGithubControls } from "./release-guard-lib.mjs";

const repository = process.env.GITHUB_REPOSITORY ?? "";
const token = process.env.GITHUB_TOKEN ?? "";
if (!/^[^/]+\/[^/]+$/.test(repository) || !token)
  throw new Error("G12_GITHUB_CONTEXT_REQUIRED: repository and token are mandatory.");

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
const result = evaluateGithubControls({ environment, branchProtection });
if (!result.valid) throw new Error(`G12_GITHUB_CONTROLS_BLOCKED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({ event: "g12.github.controls.verified", environment: "production", branch: "main" }),
);
