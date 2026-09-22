import { captureStagingEnvironmentSnapshot } from "./staging-environment-snapshot-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const outputPath = argument("output");
const candidateSha = argument("candidate-sha");
const controlSha = argument("control-sha");
const projectRef = argument("project-ref");
const pagesDeployment = {
  id: argument("deployment-id"),
  branch: argument("deployment-branch"),
  commitSha: argument("deployment-commit-sha"),
  createdOn: argument("deployment-created-on"),
};

if (!outputPath) throw new Error("G12_STAGING_ENVIRONMENT_SNAPSHOT_ARGUMENTS_REQUIRED");

const capture = await captureStagingEnvironmentSnapshot({
  outputPath,
  candidateSha,
  controlSha,
  projectRef,
  pagesDeployment,
});
const { snapshot, snapshotSha256 } = capture;

console.log(
  JSON.stringify({
    event: "g12.staging.environment.snapshot_captured",
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
