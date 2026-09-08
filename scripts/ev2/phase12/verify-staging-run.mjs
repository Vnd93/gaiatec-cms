import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  canonicalTextSha256,
  resolveG12EvidenceRepositoryPath,
  validateCanaryEvidenceBinding,
} from "./release-guard-lib.mjs";
import {
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
if (!relativeFile || !token) throw new Error("G12_STAGING_RUN_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`)) throw new Error("G12_STAGING_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (record?.schemaVersion !== 3 || record?.environment !== "production")
  throw new Error("G12_STAGING_APPROVAL_SCHEMA_REFUSED");
const control = record.g12Evidence;
const evidenceFile = resolveG12EvidenceRepositoryPath(control?.file);
if (!evidenceFile) throw new Error("G12_STAGING_EVIDENCE_PATH_REFUSED");
const evidencePath = resolve(evidenceFile);
if (dirname(evidencePath) !== resolve(".github/release-controls/evidence"))
  throw new Error("G12_STAGING_EVIDENCE_PATH_REFUSED");
const evidenceBytes = await readFile(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
const evidenceResult = validateCanaryEvidenceBinding(record, evidence, {
  reportSha256: canonicalTextSha256(evidenceBytes),
});
if (!evidenceResult.valid)
  throw new Error(`G12_STAGING_EVIDENCE_REFUSED:${evidenceResult.violations.join(",")}`);

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-production-staging-gate",
};
async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${RELEASE_EVIDENCE_REPOSITORY}${path}`, {
    headers,
  });
  if (!response.ok) throw new Error(`G12_STAGING_GITHUB_API_FAILED:${response.status}`);
  return response.json();
}

const run = await githubJson(`/actions/runs/${control.runId}`);
const expectedRun = {
  runId: control.runId,
  runAttempt: control.runAttempt,
  workflowName: control.workflowName,
  workflowPath: control.workflow,
  event: control.event,
  ref: control.ref,
  headSha: control.headSha,
  completedAt: control.completedAt,
};
const runResult = validateGitHubPrerequisiteRun({
  repository: process.env.GITHUB_REPOSITORY,
  run,
  expected: expectedRun,
  violationPrefix: "staging",
});
if (!runResult.valid) throw new Error(`G12_STAGING_RUN_REFUSED:${runResult.violations.join(",")}`);
const artifactPayload = await githubJson(`/actions/runs/${control.runId}/artifacts?per_page=100`);
const select = (kind, expected) => {
  const result = selectGitHubPrerequisiteArtifact({
    repository: RELEASE_EVIDENCE_REPOSITORY,
    run,
    artifacts: artifactPayload?.artifacts,
    expected: { ...expected, runId: control.runId, headSha: control.headSha },
    violationPrefix: `staging_${kind}`,
  });
  if (!result.valid) throw new Error(`G12_STAGING_ARTIFACT_REFUSED:${result.violations.join(",")}`);
  return result.artifact;
};
const evidenceArtifact = select("evidence", {
  name: control.artifactName,
  id: control.artifactId,
  digest: control.artifactDigest,
});
const candidateArtifact = select("candidate", {
  name: control.candidateArtifactName,
  id: control.candidateArtifactId,
  digest: control.candidateArtifactDigest,
});
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_GITHUB_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  [
    `run_id=${control.runId}`,
    `evidence_artifact_id=${evidenceArtifact.id}`,
    `candidate_artifact_id=${candidateArtifact.id}`,
    "",
  ].join("\n"),
  "utf8",
);
console.log(
  JSON.stringify({
    event: "g12.staging.remote-run.verified",
    candidateSha: record.candidateSha,
    runId: control.runId,
    runAttempt: control.runAttempt,
    evidenceArtifactId: evidenceArtifact.id,
    candidateArtifactId: candidateArtifact.id,
    secretsExposed: false,
  }),
);
