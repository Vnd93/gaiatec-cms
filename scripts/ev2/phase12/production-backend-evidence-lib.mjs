import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { sourceMigrationManifest } from "./migration-manifest-lib.mjs";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function filesUnder(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort();
}

export function digestFile(path) {
  return sha256(readFileSync(path));
}

export function sourceBackendSnapshot(sourceRoot) {
  const root = resolve(sourceRoot);
  const migrationsRoot = join(root, "supabase", "migrations");
  const functionsRoot = join(root, "supabase", "functions");
  if (!statSync(migrationsRoot).isDirectory() || !statSync(functionsRoot).isDirectory())
    throw new Error("G12_BACKEND_EVIDENCE_SOURCE_INVALID");

  const migrations = sourceMigrationManifest(root);

  const functions = readdirSync(functionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
  const functionFiles = filesUnder(functionsRoot).map((path) => ({
    path: relative(functionsRoot, path).replaceAll("\\", "/"),
    sha256: digestFile(path),
  }));
  const functionsTreeSha256 = sha256(
    functionFiles.map(({ path, sha256: digest }) => `${path}\0${digest}\0`).join(""),
  );

  return { migrations, functions, functionsTreeSha256 };
}

export function normalizedFunctionRecords(payload) {
  return (Array.isArray(payload) ? payload : (payload?.functions ?? []))
    .map((record) => ({
      name: String(record.name ?? record.slug ?? ""),
      id: String(record.id ?? ""),
      status: String(record.status ?? "").toUpperCase(),
      verifyJwt: Boolean(record.verify_jwt ?? record.verifyJwt),
      version: Number(record.version ?? 0),
      updatedAt: String(record.updated_at ?? record.updatedAt ?? ""),
      bundleSha256: String(record.ezbr_sha256 ?? record.sha256 ?? ""),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function evaluateProductionBackendEvidence({
  manifest,
  expectedRelease,
  expectedRunId,
  expectedRepository,
  expectedProjectRef,
  sourceSnapshot,
  sealedFunctionsSha256,
  sealedDatabaseSha256,
  liveFunctionRecords,
  liveMigrationVersions,
  workflowRun,
}) {
  const violations = [];
  const expectedWorkflow = ".github/workflows/deploy-production.yml";
  const workflowPath = String(workflowRun?.path ?? "").split("@", 1)[0];

  if (manifest?.schemaVersion !== 1) violations.push("manifest_schema_invalid");
  if (manifest?.event !== "g12.production.backend.sealed") violations.push("manifest_event_invalid");
  if (manifest?.outcome !== "active") violations.push("manifest_outcome_invalid");
  if (manifest?.environment !== "production") violations.push("manifest_environment_invalid");
  if (manifest?.projectRef !== expectedProjectRef) violations.push("manifest_project_ref_invalid");
  if (manifest?.release !== expectedRelease) violations.push("manifest_release_mismatch");
  if (String(manifest?.github?.runId ?? "") !== expectedRunId) violations.push("manifest_run_id_mismatch");
  if (manifest?.github?.repository !== expectedRepository) violations.push("manifest_repository_mismatch");
  if (manifest?.github?.workflow !== expectedWorkflow) violations.push("manifest_workflow_invalid");
  if (!same(manifest?.source, sourceSnapshot)) violations.push("manifest_source_digest_mismatch");
  if (manifest?.evidence?.functionsSha256 !== sealedFunctionsSha256)
    violations.push("sealed_function_evidence_digest_mismatch");
  if (manifest?.evidence?.databaseSha256 !== sealedDatabaseSha256)
    violations.push("sealed_database_evidence_digest_mismatch");
  if (!same(manifest?.liveFunctions, liveFunctionRecords)) violations.push("live_function_versions_mismatch");

  const expectedVersions = sourceSnapshot.migrations.map(({ version }) => version);
  if (!same(liveMigrationVersions, expectedVersions)) violations.push("live_migration_history_mismatch");

  if (String(workflowRun?.id ?? "") !== expectedRunId) violations.push("workflow_run_id_mismatch");
  if (!/^[a-f0-9]{40}$/.test(manifest?.github?.controlSha ?? ""))
    violations.push("manifest_control_sha_invalid");
  if (workflowRun?.head_sha !== manifest?.github?.controlSha)
    violations.push("workflow_run_control_sha_mismatch");
  if (workflowRun?.head_branch !== "main") violations.push("workflow_run_branch_invalid");
  if (workflowRun?.event !== "workflow_dispatch") violations.push("workflow_run_event_invalid");
  if (workflowRun?.status !== "completed" || workflowRun?.conclusion !== "success")
    violations.push("workflow_run_not_successful");
  if (workflowPath !== expectedWorkflow) violations.push("workflow_run_path_invalid");
  if (workflowRun?.name !== "Deploy production") violations.push("workflow_run_name_invalid");
  if (workflowRun?.repository?.full_name !== expectedRepository)
    violations.push("workflow_run_repository_invalid");
  if (Number(manifest?.github?.runAttempt) !== Number(workflowRun?.run_attempt))
    violations.push("workflow_run_attempt_mismatch");

  return { valid: violations.length === 0, violations };
}
