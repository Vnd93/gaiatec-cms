import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRE_MUTATION_OUTCOMES = new Set(["skipped", "failure", "cancelled"]);
const TERMINAL_DEPLOY_RESULTS = new Set(["success", "failure", "cancelled"]);
const WATCHDOG_DEPLOY_RESULTS = new Set(["success", "failure", "cancelled", "timed_out"]);
export const STAGING_MUTATION_BOUNDARY_STEP_NAME =
  "Arm staging mutation only after both durable recovery copies exist";

export function classifyStagingMutationBoundary({ deployResult, armed, boundaryOutcome }) {
  if (!TERMINAL_DEPLOY_RESULTS.has(deployResult)) throw new Error("G12_STAGING_MUTATION_BOUNDARY_AMBIGUOUS");
  if (armed === "true" && boundaryOutcome === "success") return "armed";
  if (armed === "" && PRE_MUTATION_OUTCOMES.has(boundaryOutcome)) {
    if (deployResult === "success") throw new Error("G12_STAGING_MUTATION_BOUNDARY_CONTRADICTS_SUCCESS");
    return "pre-mutation";
  }
  throw new Error("G12_STAGING_MUTATION_BOUNDARY_AMBIGUOUS");
}

export function classifyStagingWatchdogParent(payload) {
  if (!Array.isArray(payload?.jobs)) throw new Error("G12_STAGING_WATCHDOG_JOBS_REFUSED");
  const deployJobs = payload.jobs.filter((job) => job?.name === "deploy");
  const finalizeJobs = payload.jobs.filter((job) => job?.name === "finalize");
  const deploy = deployJobs[0];
  const boundaries = Array.isArray(deploy?.steps)
    ? deploy.steps.filter((step) => step?.name === STAGING_MUTATION_BOUNDARY_STEP_NAME)
    : [];
  let mutationMode = "ambiguous";
  if (deployJobs.length === 1 && boundaries.length === 1) {
    const deployResult = deploy?.conclusion ?? "";
    const boundaryOutcome = boundaries[0]?.conclusion ?? "";
    if (WATCHDOG_DEPLOY_RESULTS.has(deployResult) && boundaryOutcome === "success") mutationMode = "armed";
    else if (
      deployResult !== "success" &&
      WATCHDOG_DEPLOY_RESULTS.has(deployResult) &&
      PRE_MUTATION_OUTCOMES.has(boundaryOutcome)
    )
      mutationMode = "pre-mutation";
  }
  const unstartedDeploy =
    deployJobs.length === 1 &&
    deploy?.conclusion === "skipped" &&
    Array.isArray(deploy.steps) &&
    deploy.steps.length === 0;
  const recoveryRequired = !(
    unstartedDeploy ||
    (deployJobs.length === 1 && finalizeJobs.length === 1 && finalizeJobs[0]?.conclusion === "success")
  );
  return { recoveryRequired, mutationMode };
}

async function main() {
  if (process.argv[2] === "watchdog-jobs") {
    if (process.argv.length !== 3 || !process.env.MUTATION_BOUNDARY_JOBS_FILE)
      throw new Error("G12_STAGING_MUTATION_BOUNDARY_ARGUMENTS_REFUSED");
    const runId = process.env.PARENT_RUN_ID ?? "";
    const runAttempt = process.env.PARENT_RUN_ATTEMPT ?? "";
    if (!/^[1-9]\d*$/.test(runId) || !/^[1-9]\d*$/.test(runAttempt))
      throw new Error("G12_STAGING_MUTATION_BOUNDARY_ARGUMENTS_REFUSED");
    const payload = JSON.parse(await readFile(resolve(process.env.MUTATION_BOUNDARY_JOBS_FILE), "utf8"));
    const result = classifyStagingWatchdogParent(payload);
    if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_MUTATION_BOUNDARY_OUTPUT_REQUIRED");
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `recovery_required=${result.recoveryRequired}\nmutation_mode=${result.mutationMode}\n`,
      "utf8",
    );
    console.log(
      JSON.stringify({
        event: "g12.staging.watchdog.parent-classified",
        runId,
        runAttempt,
        recoveryRequired: result.recoveryRequired,
        mutationMode: result.mutationMode,
      }),
    );
    return;
  }
  if (process.argv.length !== 2) throw new Error("G12_STAGING_MUTATION_BOUNDARY_ARGUMENTS_REFUSED");
  const mode = classifyStagingMutationBoundary({
    deployResult: process.env.DEPLOY_RESULT ?? "",
    armed: process.env.MUTATION_ARMED ?? "",
    boundaryOutcome: process.env.MUTATION_BOUNDARY_OUTCOME ?? "",
  });
  if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_MUTATION_BOUNDARY_OUTPUT_REQUIRED");
  await appendFile(process.env.GITHUB_OUTPUT, `mode=${mode}\n`, "utf8");
  console.log(JSON.stringify({ event: "g12.staging.mutation_boundary.classified", mode }));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
