import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  classifyStagingMutationBoundary,
  classifyStagingWatchdogParent,
  STAGING_MUTATION_BOUNDARY_STEP_NAME,
} from "./staging-mutation-boundary.mjs";

test("staging watchdog classifier uses the exact workflow mutation boundary name", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
    "utf8",
  );
  const marker = `- name: ${STAGING_MUTATION_BOUNDARY_STEP_NAME}`;
  assert.equal(workflow.split(marker).length - 1, 1);
});

test("an unstarted deploy skips finalization without approving a failed baseline or skipping watchdog proof", async () => {
  const workflow = await readFile(
    new URL("../../../.github/workflows/deploy-staging.yml", import.meta.url),
    "utf8",
  );
  const finalizer = workflow.split("\n  finalize:")[1].split("\n  pipeline-metrics:")[0];
  const browser = workflow.split("\n  browser_attestation:")[1].split("\n  evidence:")[0];
  assert.ok(finalizer.includes("if: always() && !inputs.diagnostic_run && needs.deploy.result != 'skipped'"));
  assert.ok(finalizer.includes("needs: [deploy, browser_attestation, evidence]"));
  assert.ok(finalizer.includes("Classify the staging mutation boundary without trusting an empty output"));
  assert.ok(browser.includes("needs.deploy.result == 'success'"));
  // GitHub's trusted job result, not empty outputs, prevents an unstarted lane from
  // reaching recovery. The separate watchdog still requires exactly zero steps.
  assert.equal(
    classifyStagingWatchdogParent(parentJobs({ deployConclusion: "skipped" })).recoveryRequired,
    false,
  );
  assert.equal(
    classifyStagingWatchdogParent({ jobs: [{ name: "deploy", conclusion: "skipped" }] }).recoveryRequired,
    true,
  );
  for (const deployResult of ["success", "failure", "cancelled"])
    assert.equal(
      classifyStagingMutationBoundary({ deployResult, armed: "true", boundaryOutcome: "success" }),
      "armed",
    );
});

test("staging mutation boundary accepts only consistent armed and pre-mutation states", () => {
  for (const deployResult of ["success", "failure", "cancelled"])
    assert.equal(
      classifyStagingMutationBoundary({ deployResult, armed: "true", boundaryOutcome: "success" }),
      "armed",
    );
  for (const deployResult of ["failure", "cancelled"])
    for (const boundaryOutcome of ["skipped", "failure", "cancelled"])
      assert.equal(
        classifyStagingMutationBoundary({ deployResult, armed: "", boundaryOutcome }),
        "pre-mutation",
      );
});

test("staging mutation boundary fails closed on missing or contradictory evidence", () => {
  assert.throws(
    () =>
      classifyStagingMutationBoundary({
        deployResult: "success",
        armed: "",
        boundaryOutcome: "skipped",
      }),
    /G12_STAGING_MUTATION_BOUNDARY_CONTRADICTS_SUCCESS/,
  );
  for (const input of [
    { deployResult: "failure", armed: "", boundaryOutcome: "" },
    { deployResult: "failure", armed: "", boundaryOutcome: "success" },
    { deployResult: "failure", armed: "true", boundaryOutcome: "failure" },
    { deployResult: "failure", armed: "false", boundaryOutcome: "skipped" },
    { deployResult: "", armed: "", boundaryOutcome: "skipped" },
    { deployResult: "skipped", armed: "", boundaryOutcome: "skipped" },
  ])
    assert.throws(() => classifyStagingMutationBoundary(input), /G12_STAGING_MUTATION_BOUNDARY_AMBIGUOUS/);
});

function parentJobs({
  deployConclusion = "failure",
  boundaryConclusions = [],
  finalizeConclusions = [],
} = {}) {
  return {
    jobs: [
      {
        name: "deploy",
        conclusion: deployConclusion,
        steps: boundaryConclusions.map((conclusion) => ({
          name: STAGING_MUTATION_BOUNDARY_STEP_NAME,
          conclusion,
        })),
      },
      ...finalizeConclusions.map((conclusion) => ({ name: "finalize", conclusion })),
    ],
  };
}

test("staging watchdog classifies the complete observed boundary matrix", () => {
  for (const deployConclusion of ["success", "failure", "cancelled", "timed_out"])
    assert.deepEqual(
      classifyStagingWatchdogParent(parentJobs({ deployConclusion, boundaryConclusions: ["success"] })),
      { recoveryRequired: true, mutationMode: "armed" },
    );
  for (const deployConclusion of ["failure", "cancelled", "timed_out"])
    for (const boundaryConclusion of ["skipped", "failure", "cancelled"])
      assert.deepEqual(
        classifyStagingWatchdogParent(
          parentJobs({ deployConclusion, boundaryConclusions: [boundaryConclusion] }),
        ),
        { recoveryRequired: true, mutationMode: "pre-mutation" },
      );
});

test("staging watchdog skips only an unstarted deploy or one successful finalizer", () => {
  assert.deepEqual(classifyStagingWatchdogParent(parentJobs({ deployConclusion: "skipped" })), {
    recoveryRequired: false,
    mutationMode: "ambiguous",
  });
  assert.deepEqual(
    classifyStagingWatchdogParent(
      parentJobs({ boundaryConclusions: ["success"], finalizeConclusions: ["success"] }),
    ),
    { recoveryRequired: false, mutationMode: "armed" },
  );
});

test("staging watchdog recovers ambiguously for every incomplete observation", () => {
  for (const payload of [
    parentJobs(),
    parentJobs({ boundaryConclusions: ["success", "success"] }),
    parentJobs({ boundaryConclusions: ["missing"] }),
    parentJobs({ deployConclusion: "success", boundaryConclusions: ["skipped"] }),
    parentJobs({ deployConclusion: "skipped", boundaryConclusions: ["success"] }),
    {
      jobs: [{ name: "deploy", conclusion: "skipped", steps: [{ name: "Checkout", conclusion: "success" }] }],
    },
    { jobs: [{ name: "deploy", conclusion: "skipped" }] },
    { jobs: [] },
    { jobs: [...parentJobs({ boundaryConclusions: ["success"] }).jobs, parentJobs().jobs[0]] },
  ])
    assert.deepEqual(classifyStagingWatchdogParent(payload), {
      recoveryRequired: true,
      mutationMode: "ambiguous",
    });
  assert.throws(() => classifyStagingWatchdogParent({}), /G12_STAGING_WATCHDOG_JOBS_REFUSED/);
});
