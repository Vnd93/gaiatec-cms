import { appendFile, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import {
  EMAIL_WORKFLOW_NAME,
  EMAIL_WORKFLOW_PATH,
  RELEASE_EVIDENCE_REPOSITORY,
  selectGitHubPrerequisiteArtifact,
  validateGitHubPrerequisiteRun,
} from "./production-prerequisite-gate-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const relativeFile = argument("file");
const token = process.env.GITHUB_TOKEN;
if (!relativeFile || !token) throw new Error("PRODUCTION_EMAIL_RUN_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`))
  throw new Error("PRODUCTION_EMAIL_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (record?.schemaVersion !== 3 || record?.environment !== "production")
  throw new Error("PRODUCTION_EMAIL_APPROVAL_SCHEMA_REFUSED");
const control = record?.productionReadiness?.emailProvider;

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-production-email-gate",
};
async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${RELEASE_EVIDENCE_REPOSITORY}${path}`, {
    headers,
  });
  if (!response.ok) throw new Error(`PRODUCTION_EMAIL_GITHUB_API_FAILED:${response.status}`);
  return response.json();
}

const run = await githubJson(`/actions/runs/${control.emailRunId}`);
const runResult = validateGitHubPrerequisiteRun({
  repository: process.env.GITHUB_REPOSITORY,
  run,
  expected: {
    runId: control.emailRunId,
    runAttempt: control.emailRunAttempt,
    workflowName: EMAIL_WORKFLOW_NAME,
    workflowPath: EMAIL_WORKFLOW_PATH,
    event: control.emailEvent,
    ref: control.emailRef,
    headSha: control.emailSourceSha,
    completedAt: control.runCompletedAt,
  },
  violationPrefix: "email",
});
if (!runResult.valid) throw new Error(`PRODUCTION_EMAIL_RUN_REFUSED:${runResult.violations.join(",")}`);
const artifactPayload = await githubJson(
  `/actions/runs/${control.emailRunId}/artifacts?per_page=100&name=${encodeURIComponent(control.artifactName)}`,
);
const artifactResult = selectGitHubPrerequisiteArtifact({
  repository: RELEASE_EVIDENCE_REPOSITORY,
  run,
  artifacts: artifactPayload?.artifacts,
  expected: {
    name: control.artifactName,
    id: control.artifactId,
    digest: control.artifactDigest,
    runId: control.emailRunId,
    headSha: control.emailSourceSha,
  },
  violationPrefix: "email",
});
if (!artifactResult.valid)
  throw new Error(`PRODUCTION_EMAIL_ARTIFACT_REFUSED:${artifactResult.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("PRODUCTION_EMAIL_GITHUB_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  `run_id=${control.emailRunId}\nartifact_id=${artifactResult.artifact.id}\n`,
  "utf8",
);
console.log(
  JSON.stringify({
    event: "production.email.remote-run.verified",
    candidateSha: record.candidateSha,
    runId: control.emailRunId,
    runAttempt: control.emailRunAttempt,
    artifactId: artifactResult.artifact.id,
    secretsExposed: false,
  }),
);
