export const PRODUCTION_MARKER_UPLOAD_STEP = "Persist the mutation marker before the first remote mutation";
export const PRODUCTION_MARKER_REDUNDANCY_STEP =
  "Persist redundant marker in the locked production control variable";

const PRODUCTION_MUTATION_STEPS = new Set([
  "Apply the exact candidate expand-only migrations to production",
  "Configure production Edge Function secrets without exposing their values",
  "Deploy the complete exact-candidate Edge Function inventory",
  "Lock production authentication to approved domains",
  "Bind the scheduled outbox worker through Supabase Vault",
  "Promote the exact tested artifact to production",
  "Restore the approved prior Pages deployment after any post-mutation failure",
  "Converge all candidate migrations after any failed production mutation",
  "Converge the forward-compatible candidate Edge Functions after failure",
  "Reconverge production Edge Function secrets after failure",
  "Reconverge production Auth policy after failure",
  "Reconverge production Vault outbox binding after failure",
]);

const SAFE_NON_MUTATING_CONCLUSIONS = new Set(["failure", "cancelled", "skipped"]);

export function evaluateProductionMarkerAbsenceProof(payload) {
  const jobs = Array.isArray(payload) ? payload : (payload?.jobs ?? []);
  const deployJobs = jobs.filter((job) => job?.name === "deploy");
  const violations = [];
  if (deployJobs.length !== 1) violations.push("deploy_job_identity_invalid");
  const job = deployJobs[0];
  if (job?.status !== "completed" || job?.conclusion === "success")
    violations.push("deploy_job_not_terminal_failure");

  const steps = Array.isArray(job?.steps) ? job.steps : [];
  const markerSteps = steps.filter((step) => step?.name === PRODUCTION_MARKER_UPLOAD_STEP);
  const redundancySteps = steps.filter((step) => step?.name === PRODUCTION_MARKER_REDUNDANCY_STEP);
  if (markerSteps.length !== 1) violations.push("marker_step_identity_invalid");
  if (redundancySteps.length !== 1) violations.push("redundancy_step_identity_invalid");
  const marker = markerSteps[0];
  const redundancy = redundancySteps[0];
  const markerConclusion = String(marker?.conclusion ?? "");
  const redundancyConclusion = String(redundancy?.conclusion ?? "");
  if (
    marker?.status !== "completed" ||
    !["success", ...SAFE_NON_MUTATING_CONCLUSIONS].includes(markerConclusion)
  )
    violations.push("marker_step_ambiguous");
  if (
    redundancy?.status !== "completed" ||
    !["success", ...SAFE_NON_MUTATING_CONCLUSIONS].includes(redundancyConclusion)
  )
    violations.push("redundancy_step_ambiguous");
  if (markerConclusion === "success" && redundancyConclusion === "success")
    violations.push("marker_absence_not_proven");

  const successfulMutations = steps
    .filter(
      (step) => PRODUCTION_MUTATION_STEPS.has(String(step?.name ?? "")) && step?.conclusion === "success",
    )
    .map((step) => step.name);
  if (successfulMutations.length > 0) violations.push("production_mutation_observed_without_marker");

  return {
    valid: violations.length === 0,
    violations,
    markerConclusion,
    redundancyConclusion,
    successfulMutations,
  };
}
