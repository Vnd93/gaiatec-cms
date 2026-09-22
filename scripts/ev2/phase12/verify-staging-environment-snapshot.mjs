import { appendFile } from "node:fs/promises";

import { verifyStagingEnvironmentSnapshot } from "./staging-environment-snapshot-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const snapshotPath = argument("snapshot");
const expected = {
  candidateSha: argument("candidate-sha"),
  controlSha: argument("control-sha"),
  projectRef: argument("project-ref"),
  pagesDeployment: {
    id: argument("deployment-id"),
    branch: argument("deployment-branch"),
    commitSha: argument("deployment-commit-sha"),
    createdOn: argument("deployment-created-on"),
  },
  observedAt: argument("observed-at") || new Date().toISOString(),
};

if (!snapshotPath) throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_VERIFICATION_ARGUMENTS_REQUIRED");

const verification = await verifyStagingEnvironmentSnapshot({ snapshotPath, expected });
const { snapshot, snapshotSha256 } = verification;
const outputs = {
  environment_snapshot_sha256: snapshotSha256,
  migrations_sha256: snapshot.supabase.migrations.sha256,
  functions_sha256: snapshot.supabase.functions.sha256,
  deployment_id: snapshot.pages.deployment.id,
};
if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `${Object.entries(outputs)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")}\n`,
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.staging.environment.snapshot_verified",
    candidateSha: snapshot.candidateSha,
    controlSha: snapshot.controlSha,
    projectRef: snapshot.supabase.projectRef,
    deploymentId: snapshot.pages.deployment.id,
    snapshotSha256,
    migrationsSha256: snapshot.supabase.migrations.sha256,
    functionsSha256: snapshot.supabase.functions.sha256,
    pagesSha256: snapshot.pages.sha256,
    credentialsExposed: false,
  }),
);
