import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(path, "utf8");

test("staging proves the approved rollback frontend through an isolated AAL2 browser session", async () => {
  const [workflow, browser, verifier] = await Promise.all([
    read(".github/workflows/deploy-staging.yml"),
    read("tests/e2e/cms-final-coverage.spec.ts"),
    read("scripts/ev2/phase12/verify-staging-artifact.mjs"),
  ]);
  const rollbackDeploy = workflow.indexOf(
    "Publish the rollback frontend to an isolated compatibility canary",
  );
  const fixture = workflow.indexOf(
    "Provision an isolated MFA actor for authenticated rollback compatibility",
  );
  const traversal = workflow.indexOf(
    "Traverse the rollback frontend with an AAL2 session against the candidate backend",
  );
  const cleanup = workflow.indexOf("Revoke the rollback compatibility actor and verify zero active residue");
  const candidateDeploy = workflow.indexOf("Deploy the immutable staging candidate");
  assert.ok(rollbackDeploy >= 0 && rollbackDeploy < fixture);
  assert.ok(fixture < traversal && traversal < cleanup && cleanup < candidateDeploy);
  assert.match(workflow, /QA_CMS_FRONTEND_EXPECTED_SHA: \$\{\{ inputs\.rollback_ref \}\}/);
  assert.match(workflow, /QA_CMS_EXPECTED_SHA: \$\{\{ steps\.candidate\.outputs\.sha \}\}/);
  assert.match(workflow, /QA_CMS_ROLLBACK_COMPATIBILITY: "true"/);
  assert.match(
    workflow,
    /QA_CMS_COVERAGE_INVENTORY_PATH: \.\.\/baseline\/outputs\/cms-coverage-rollback\.json/,
  );
  assert.match(workflow, /cms-browser-rollback-cleanup-retry\.json/);
  for (const evidence of [
    "cms-coverage-rollback.json",
    "cms-browser-rollback-setup.json",
    "cms-browser-rollback-cleanup.json",
    "cms-rollback-authenticated-compatibility.json",
  ]) {
    assert.ok(workflow.includes(evidence), `missing durable rollback evidence ${evidence}`);
  }

  assert.match(browser, /authenticatedFrontendSha/);
  assert.match(browser, /rollbackCompatibility/);
  assert.match(browser, /candidateBackendSha/);
  assert.match(browser, /frontendSha/);
  assert.match(browser, /QA_CMS_COVERAGE_INVENTORY_PATH/);
  assert.match(verifier, /rollbackCoverage\?\.authenticated\?\.status !== "passed"/);
  assert.match(verifier, /rollbackCleanup\?\.activeResidue !== 0/);
  assert.match(verifier, /rollbackCleanup\?\.auditRetained !== true/);
});
