import assert from "node:assert/strict";
import test from "node:test";

import { evaluateProductionBackendEvidence } from "./production-backend-evidence-lib.mjs";

const release = "a".repeat(40);
const controlSha = "b".repeat(40);
const runId = "123456";
const repository = "Vnd93/gaiatec-cms";
const projectRef = "chfuhctnhqgyjowkvllv";
const source = {
  migrations: [{ version: "0061", file: "0061_example.sql", sha256: "1".repeat(64) }],
  functions: ["cms-public"],
  functionsTreeSha256: "2".repeat(64),
};
const liveFunctions = [{ name: "cms-public", status: "ACTIVE", verifyJwt: false, version: 17 }];
const workflowRun = {
  id: Number(runId),
  head_sha: controlSha,
  head_branch: "main",
  event: "workflow_dispatch",
  status: "completed",
  conclusion: "success",
  path: ".github/workflows/deploy-production.yml@main",
  name: "Deploy production",
  run_attempt: 1,
  repository: { full_name: repository },
};
const manifest = {
  schemaVersion: 1,
  event: "g12.production.backend.sealed",
  outcome: "active",
  environment: "production",
  projectRef,
  release,
  github: {
    repository,
    controlSha,
    runId,
    runAttempt: 1,
    workflow: ".github/workflows/deploy-production.yml",
  },
  source,
  liveFunctions,
  evidence: { functionsSha256: "3".repeat(64), databaseSha256: "4".repeat(64) },
};

function evaluate(overrides = {}) {
  return evaluateProductionBackendEvidence({
    manifest,
    expectedRelease: release,
    expectedRunId: runId,
    expectedRepository: repository,
    expectedProjectRef: projectRef,
    sourceSnapshot: source,
    sealedFunctionsSha256: "3".repeat(64),
    sealedDatabaseSha256: "4".repeat(64),
    liveFunctionRecords: liveFunctions,
    liveMigrationVersions: ["0061"],
    workflowRun,
    ...overrides,
  });
}

test("accepts only an exact successful production run whose backend remains live", () => {
  assert.deepEqual(evaluate(), { valid: true, violations: [] });
});

test("rejects an arbitrary run or workflow even when its SHA is valid", () => {
  const result = evaluate({
    workflowRun: { ...workflowRun, id: 654321, path: ".github/workflows/ci.yml", name: "CI" },
  });
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /workflow_run_id_mismatch/);
  assert.match(result.violations.join(","), /workflow_run_path_invalid/);
  assert.match(result.violations.join(","), /workflow_run_name_invalid/);
});

test("rejects stale evidence after a function version or migration changes", () => {
  const result = evaluate({
    liveFunctionRecords: [{ ...liveFunctions[0], version: 18 }],
    liveMigrationVersions: ["0061", "0062"],
  });
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /live_function_versions_mismatch/);
  assert.match(result.violations.join(","), /live_migration_history_mismatch/);
});

test("rejects modified source and artifact evidence", () => {
  const result = evaluate({
    sourceSnapshot: { ...source, functionsTreeSha256: "9".repeat(64) },
    sealedFunctionsSha256: "8".repeat(64),
    sealedDatabaseSha256: "7".repeat(64),
  });
  assert.equal(result.valid, false);
  assert.match(result.violations.join(","), /manifest_source_digest_mismatch/);
  assert.match(result.violations.join(","), /sealed_function_evidence_digest_mismatch/);
  assert.match(result.violations.join(","), /sealed_database_evidence_digest_mismatch/);
});
