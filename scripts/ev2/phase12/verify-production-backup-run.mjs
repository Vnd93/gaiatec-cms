import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  backupEvidenceRepositoryPath,
  PRODUCTION_BACKUP_REPOSITORY,
  validateBackupEvidenceBinding,
} from "../phase16/readiness-lib.mjs";
import { backupTextSha256 } from "../phase16/production-backup-evidence-lib.mjs";
import { selectGitHubBackupArtifact, validateGitHubBackupRun } from "./production-backup-gate-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const relativeFile = argument("file");
const token = process.env.GITHUB_TOKEN;
if (!relativeFile || !token) throw new Error("PRODUCTION_BACKUP_RUN_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`))
  throw new Error("PRODUCTION_BACKUP_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (record?.schemaVersion !== 3 || record?.environment !== "production")
  throw new Error("PRODUCTION_BACKUP_APPROVAL_SCHEMA_REFUSED");
const control = record?.productionReadiness?.backupRestore;
const evidenceRepositoryPath = backupEvidenceRepositoryPath(control);
if (!evidenceRepositoryPath) throw new Error("PRODUCTION_BACKUP_EVIDENCE_PATH_REFUSED");
const evidencePath = resolve(evidenceRepositoryPath);
if (dirname(evidencePath) !== resolve(".github/release-controls/evidence"))
  throw new Error("PRODUCTION_BACKUP_EVIDENCE_PATH_REFUSED");
const evidenceBytes = await readFile(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
const binding = validateBackupEvidenceBinding(control, evidence, {
  evidenceSha256: backupTextSha256(evidenceBytes),
});
if (!binding.valid) throw new Error(`PRODUCTION_BACKUP_EVIDENCE_REFUSED:${binding.violations.join(",")}`);

const headers = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${token}`,
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "gaiatec-production-backup-gate",
};
async function githubJson(path) {
  const response = await fetch(`https://api.github.com/repos/${PRODUCTION_BACKUP_REPOSITORY}${path}`, {
    headers,
  });
  if (!response.ok) throw new Error(`PRODUCTION_BACKUP_GITHUB_API_FAILED:${response.status}`);
  return response.json();
}

const run = await githubJson(`/actions/runs/${control.backupRunId}`);
const runResult = validateGitHubBackupRun({
  control,
  evidence,
  run,
  repository: process.env.GITHUB_REPOSITORY,
});
if (!runResult.valid) throw new Error(`PRODUCTION_BACKUP_RUN_REFUSED:${runResult.violations.join(",")}`);
const artifactPayload = await githubJson(
  `/actions/runs/${control.backupRunId}/artifacts?per_page=100&name=${encodeURIComponent(control.artifactName)}`,
);
const artifactResult = selectGitHubBackupArtifact({
  control,
  run,
  artifacts: artifactPayload?.artifacts,
});
if (!artifactResult.valid)
  throw new Error(`PRODUCTION_BACKUP_ARTIFACT_REFUSED:${artifactResult.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("PRODUCTION_BACKUP_GITHUB_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  `artifact_id=${artifactResult.artifact.id}\nartifact_name=${control.artifactName}\n`,
  "utf8",
);
console.log(
  JSON.stringify({
    event: "production.backup.run.verified",
    runId: control.backupRunId,
    runAttempt: control.backupRunAttempt,
    artifactId: artifactResult.artifact.id,
    workflow: control.backupWorkflow,
    ref: control.backupRef,
    sourceSha: control.backupSourceSha,
    secretsExposed: false,
  }),
);
