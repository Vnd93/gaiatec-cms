import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateProductionMarkerAbsenceProof,
  PRODUCTION_MARKER_REDUNDANCY_STEP,
  PRODUCTION_MARKER_UPLOAD_STEP,
} from "./production-artifact-resolution-lib.mjs";

function jobs(markerConclusion, redundancyConclusion = "skipped", extraSteps = []) {
  return {
    jobs: [
      {
        name: "deploy",
        status: "completed",
        conclusion: markerConclusion === "success" ? "failure" : markerConclusion,
        steps: [
          {
            name: PRODUCTION_MARKER_UPLOAD_STEP,
            status: "completed",
            conclusion: markerConclusion,
          },
          {
            name: PRODUCTION_MARKER_REDUNDANCY_STEP,
            status: "completed",
            conclusion: redundancyConclusion,
          },
          ...extraSteps,
        ],
      },
    ],
  };
}

test("confirmed failed, cancelled or skipped arming proves no production mutation", () => {
  for (const conclusion of ["failure", "cancelled", "skipped"])
    assert.equal(evaluateProductionMarkerAbsenceProof(jobs(conclusion)).valid, true);
});

test("successful or ambiguous arming can never be downgraded to a safe no-op", () => {
  for (const [artifactConclusion, redundancyConclusion] of [
    ["success", "success"],
    ["success", null],
  ]) {
    const result = evaluateProductionMarkerAbsenceProof(jobs(artifactConclusion, redundancyConclusion));
    assert.equal(result.valid, false);
    assert.match(result.violations.join(","), /marker_absence_not_proven|redundancy_step_ambiguous/);
  }
});

test("any observed production mutation without the marker artifact fails closed", () => {
  const result = evaluateProductionMarkerAbsenceProof(
    jobs("failure", "skipped", [
      {
        name: "Apply the exact candidate expand-only migrations to production",
        status: "completed",
        conclusion: "success",
      },
    ]),
  );
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /production_mutation_observed_without_marker/);
});

test("job ambiguity never proves marker absence", () => {
  const result = evaluateProductionMarkerAbsenceProof({ jobs: [] });
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /deploy_job_identity_invalid/);
});
