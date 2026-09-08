import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  expectedProductionControlPaths,
  validateProductionControlDelta,
} from "./production-control-delta-lib.mjs";

const candidateSha = "a".repeat(40);
const controlSha = "b".repeat(40);
const approvalPath = `.github/release-controls/approvals/G12_${candidateSha}.json`;
const record = {
  candidateSha,
  g12Evidence: { file: ".github/release-controls/evidence/G12_CANARY_aaaaaaa_2026-09-07.json" },
  productionReadiness: {
    backupRestore: {
      evidenceReference: ".github/release-controls/evidence/BACKUP_RESTORE_34000214134_1.json",
    },
    csp: { evidenceReference: ".github/release-controls/evidence/G16_CSP_BROWSER_aaaaaaa.json" },
  },
};

function validInput() {
  const expected = expectedProductionControlPaths(record, approvalPath);
  assert.equal(expected.valid, true);
  return {
    candidateSha,
    controlSha,
    parents: [candidateSha],
    commitsAhead: 1,
    expectedPaths: expected.paths,
    changes: expected.paths.map((path) => ({ status: "A", path, mode: "100644" })),
  };
}

test("production control B is one evidence-only direct child of candidate A", () => {
  assert.deepEqual(validateProductionControlDelta(validInput()), { valid: true, violations: [] });
});

test("production control delta refuses code drift, merge commits and altered evidence", () => {
  const drift = validInput();
  drift.changes.push({ status: "M", path: ".github/workflows/deploy-production.yml", mode: "100644" });
  drift.parents.push("c".repeat(40));
  drift.commitsAhead = 2;
  assert.deepEqual(validateProductionControlDelta(drift).violations.sort(), [
    "control_evidence_set_incomplete",
    "control_file_must_be_new",
    "control_file_not_allowlisted",
    "control_must_be_single_direct_child",
    "exactly_one_control_commit_required",
  ]);

  for (const mutate of [
    (input) => input.changes.pop(),
    (input) => (input.changes[0].status = "M"),
    (input) => (input.changes[0].mode = "120000"),
  ]) {
    const input = validInput();
    mutate(input);
    assert.equal(validateProductionControlDelta(input).valid, false);
  }
});

test("approval-derived allowlist is candidate-bound and accepts no historical fallback", () => {
  assert.equal(expectedProductionControlPaths(record, approvalPath).valid, true);
  assert.equal(
    expectedProductionControlPaths(record, approvalPath.replace(candidateSha, "b".repeat(40))).valid,
    false,
  );
  assert.equal(
    expectedProductionControlPaths(
      {
        ...record,
        productionReadiness: {
          ...record.productionReadiness,
          csp: { evidenceReference: "docs/ev2/fase-16/evidencias/G16_CSP_BROWSER_e52b25d.json" },
        },
      },
      approvalPath,
    ).valid,
    false,
  );
});

test("production deploy proves the evidence-only delta before validating both candidate and control CI", async () => {
  const workflow = await readFile(".github/workflows/deploy-production.yml", "utf8");
  const currentControl = workflow.indexOf(
    'test "$(git -C control rev-parse HEAD)" = "$(git -C control rev-parse origin/main)"',
  );
  const delta = workflow.indexOf("verify-production-control-delta.mjs");
  const firstControlCheck = workflow.indexOf("check-github-controls.mjs", delta);
  const secondControlCheck = workflow.indexOf("check-github-controls.mjs", firstControlCheck + 1);
  const firstRemoteMutation = workflow.indexOf("Deploy the single sealed artifact");
  const mutationMarker = workflow.indexOf("Arm the durable production mutation marker");
  const tipChecks = [...workflow.matchAll(/rev-parse origin\/main/g)].map((match) => match.index);
  assert.ok(
    currentControl > 0 &&
      delta > currentControl &&
      firstControlCheck > delta &&
      secondControlCheck > firstControlCheck,
  );
  assert.ok(firstRemoteMutation > secondControlCheck);
  assert.ok(tipChecks.length >= 3);
  assert.ok(tipChecks.some((offset) => offset > secondControlCheck && offset < firstRemoteMutation));
  assert.ok(tipChecks.some((offset) => offset > firstRemoteMutation && offset < mutationMarker));
  assert.match(workflow.slice(delta, firstControlCheck), /--candidate "\$CANDIDATE_SHA"/);
  assert.match(
    workflow.slice(firstControlCheck, secondControlCheck + 500),
    /CANDIDATE_SHA: \$\{\{ github\.sha \}\}/,
  );
});
