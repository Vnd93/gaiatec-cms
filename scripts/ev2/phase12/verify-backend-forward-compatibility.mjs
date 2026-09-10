import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { candidateTestIsCiExecuted } from "./backend-test-execution-lib.mjs";
import { sourceMigrationManifest } from "./migration-manifest-lib.mjs";

const argument = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const candidateRoot = resolve(argument("--candidate"));
const baselineRoot = resolve(argument("--baseline"));
const reportPath = argument("--report");
if (!argument("--candidate") || !argument("--baseline"))
  throw new Error("G12_BACKEND_COMPATIBILITY_INPUT_REQUIRED");

const listFunctions = (root) =>
  readdirSync(join(root, "supabase", "functions"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== "_shared")
    .map((entry) => entry.name)
    .sort();
const baselineMigrations = sourceMigrationManifest(baselineRoot);
const candidateMigrations = sourceMigrationManifest(candidateRoot);
const baselineVersions = new Set(baselineMigrations.map(({ version }) => version));
const baselineLatest = baselineMigrations.at(-1)?.version ?? "";
const candidatePackage = JSON.parse(readFileSync(join(candidateRoot, "package.json"), "utf8"));
const candidateCi = readFileSync(join(candidateRoot, ".github", "workflows", "ci.yml"), "utf8");
const violations = [];

for (const baselineMigration of baselineMigrations) {
  const candidateMigration = candidateMigrations.find(({ version }) => version === baselineMigration.version);
  if (!candidateMigration) violations.push(`migration_removed:${baselineMigration.file}`);
  else if (candidateMigration.file !== baselineMigration.file)
    violations.push(`migration_renamed:${baselineMigration.file}`);
  else if (candidateMigration.sha256 !== baselineMigration.sha256)
    violations.push(`migration_rewritten:${baselineMigration.file}`);
}

const additions = candidateMigrations.filter(({ version }) => !baselineVersions.has(version));
for (const migration of additions) {
  if (migration.version <= baselineLatest) violations.push(`migration_not_append_only:${migration.file}`);
  const sql = readFileSync(join(candidateRoot, "supabase", "migrations", migration.file), "utf8");
  const destructive = [
    /\bdrop\s+(?:table|schema|column)\b/i,
    /\bdrop\s+(?:extension|type)\b/i,
    /\btruncate\b/i,
    /\brename\s+(?:table|column)\b/i,
    /\balter\s+column\b[^;]*\btype\b/i,
  ];
  if (destructive.some((pattern) => pattern.test(sql)))
    violations.push(`migration_destructive:${migration.file}`);
}

const compatibilityTests = {
  "0057": ["supabase/tests/rls_cms_documents.test.sql", "tests/contracts/cms-documents.test.ts"],
  "0058": ["supabase/tests/rls_form_lifecycle.test.sql", "tests/contracts/form-lifecycle.test.ts"],
  "0059": ["supabase/tests/rls_rdo_team_scope.test.sql", "scripts/phase1/rdo-team-scope.test.mjs"],
  "0060": ["supabase/tests/rls_ev2_phase4_pim.test.sql", "tests/unit/pim-v1-adapter.test.ts"],
  "0061": ["supabase/tests/rls_qa_actor_lease.test.sql", "scripts/qa/cms-browser-fixture.test.mjs"],
  "0062": [
    "supabase/tests/rls_cms_existing_auth_invites.test.sql",
    "tests/unit/cms-existing-auth-user.test.ts",
  ],
  "0063": ["supabase/tests/rls_cms_documents.test.sql", "tests/contracts/cms-documents.test.ts"],
  "0064": [
    "supabase/tests/rls_qa_mutation_compensation.test.sql",
    "tests/contracts/cms-qa-mutation-compensation.test.ts",
  ],
  "0065": ["supabase/tests/rls_ev2_phase5_dam.test.sql", "tests/contracts/cms-dam-actor-scope.test.ts"],
  "0066": [
    "supabase/tests/rls_cms_deployed_command_actor_context.test.sql",
    "tests/contracts/cms-deployed-command-actor-context.test.ts",
  ],
  "0067": ["supabase/tests/rls_cms_pim_read_scope.test.sql", "tests/contracts/cms-pim-read-scope.test.ts"],
  "0068": [
    "supabase/tests/rls_cms_master_read_scope.test.sql",
    "tests/contracts/cms-master-read-scope.test.ts",
  ],
  "0069": [
    "supabase/tests/rls_cms_content_scope.test.sql",
    "tests/contracts/cms-content-actor-scope.test.ts",
  ],
  "0070": [
    "supabase/tests/rls_cms_users_auth_scope.test.sql",
    "tests/contracts/cms-users-auth-scope.test.ts",
  ],
  "0071": [
    "supabase/tests/rls_cms_attributes_vocab_scope.test.sql",
    "tests/contracts/cms-attributes-vocab-scope.test.ts",
  ],
  "0072": [
    "supabase/tests/rls_cms_forms_leads_scope.test.sql",
    "tests/contracts/cms-forms-leads-scope.test.ts",
  ],
  "0073": [
    "supabase/tests/rls_cms_collaboration_release_bulk_scope.test.sql",
    "tests/contracts/cms-collaboration-release-bulk-scope.test.ts",
  ],
  "0074": [
    "supabase/tests/rls_cms_visual_multisite_scope.test.sql",
    "tests/contracts/cms-visual-multisite-scope.test.ts",
  ],
  "0075": [
    "supabase/tests/rls_cms_ai_authoritative_scope.test.sql",
    "tests/contracts/cms-ai-authoritative-scope.test.ts",
  ],
  "0076": [
    "supabase/tests/rls_cms_system_rbac_scope.test.sql",
    "tests/contracts/cms-system-rbac-scope.test.ts",
  ],
  "0077": [
    "supabase/tests/rls_cms_production_operator_provisioning.test.sql",
    "tests/contracts/cms-production-operator-provisioning.test.ts",
  ],
  "0078": [
    "supabase/tests/rls_cms_product_pim_consolidation.test.sql",
    "tests/contracts/cms-product-pim-consolidation.test.ts",
  ],
  "0079": [
    "supabase/tests/rls_cms_progressive_draft_promotion.test.sql",
    "tests/contracts/cms-progressive-draft-promotion.test.ts",
  ],
  "0080": [
    "supabase/tests/rls_cms_qa_rate_limit_proof.test.sql",
    "tests/contracts/cms-qa-rate-limit-proof.test.ts",
  ],
  "0081": [
    "supabase/tests/rls_cms_collaboration_assignee_directory.test.sql",
    "tests/contracts/cms-collaboration-assignee-directory.test.ts",
  ],
  "0082": [
    "supabase/tests/rls_cms_media_upload_abort.test.sql",
    "tests/components/admin-media-upload-compensation.test.tsx",
  ],
  "0083": [
    "supabase/tests/rls_cms_session_security_finalization.test.sql",
    "tests/contracts/cms-users-auth-scope.test.ts",
  ],
  "0084": [
    "supabase/tests/rls_cms_lead_origin_form_binding.test.sql",
    "tests/contracts/cms-lead-origin-binding.test.ts",
    "tests/contracts/cms-lead-capture-expand-contract.test.ts",
    "tests/unit/cms-lead-capture-envelope.test.ts",
  ],
  "0085": [
    "supabase/tests/rls_cms_public_relation_limit.test.sql",
    "tests/contracts/cms-public-relation-limit.test.ts",
    "tests/unit/cms-public-relations.test.ts",
  ],
  "0086": [
    "supabase/tests/rls_qa_actor_lease.test.sql",
    "supabase/tests/rls_qa_mutation_compensation.test.sql",
    "supabase/tests/rls_cms_forms_leads_scope.test.sql",
    "supabase/tests/rls_cms_ai_authoritative_scope.test.sql",
    "tests/contracts/cms-qa-actor-runtime-repairs.test.ts",
  ],
  "0087": [
    "supabase/tests/rls_cms_session_security_finalization.test.sql",
    "supabase/tests/rls_cms_system_rbac_scope.test.sql",
    "supabase/tests/rls_cms_visual_multisite_scope.test.sql",
    "supabase/tests/rls_cms_collaboration_release_bulk_scope.test.sql",
    "tests/contracts/cms-runtime-integrity-repairs.test.ts",
  ],
  "0088": [
    "supabase/tests/rls_cms_media_upload_abort.test.sql",
    "supabase/tests/rls_ev2_phase10_ai.test.sql",
    "supabase/tests/rls_ev2_phase5_dam.test.sql",
    "supabase/tests/rls_ev2_phase11_system.test.sql",
    "supabase/tests/rls_cms_deployed_command_actor_context.test.sql",
    "tests/contracts/cms-runtime-integrity-followup.test.ts",
  ],
  "0089": [
    "supabase/tests/rls_cms_operational_events_read_scale.test.sql",
    "tests/contracts/cms-operational-events-read-scale.test.ts",
  ],
  "0090": [
    "supabase/tests/rls_cms_qa_lease_document_canonical_fence.test.sql",
    "tests/contracts/cms-qa-lease-document-canonical-fence.test.ts",
  ],
};
for (const migration of additions) {
  const version = migration.version;
  const tests = compatibilityTests[version];
  if (!tests) violations.push(`migration_policy_missing:${migration.file}`);
  else
    for (const relativePath of tests) {
      if (
        !existsSync(join(candidateRoot, relativePath)) ||
        !statSync(join(candidateRoot, relativePath)).isFile()
      )
        violations.push(`migration_test_missing:${version}:${relativePath}`);
      else if (!candidateTestIsCiExecuted(relativePath, candidatePackage, candidateCi))
        violations.push(`migration_test_not_executed:${version}:${relativePath}`);
    }
}

const baselineFunctions = listFunctions(baselineRoot);
const candidateFunctions = listFunctions(candidateRoot);
for (const name of baselineFunctions)
  if (!candidateFunctions.includes(name)) violations.push(`edge_function_removed:${name}`);

const report = {
  schemaVersion: 1,
  event: "g12.backend.forward-compatibility",
  rollbackMode: "pages-rollback-with-forward-backend",
  baselineLatestMigration: baselineLatest,
  candidateLatestMigration: candidateMigrations.at(-1)?.version ?? "",
  addedMigrations: additions.map(({ file }) => file),
  migrationDigestsPreserveRawBytes: true,
  compatibilityEvidenceExecutionVerified: true,
  baselineFunctionCount: baselineFunctions.length,
  candidateFunctionCount: candidateFunctions.length,
  violations,
  outcome: violations.length === 0 ? "pass" : "fail",
};
if (reportPath) {
  const absoluteReport = resolve(reportPath);
  if (!absoluteReport.startsWith(`${candidateRoot}\\`) && !absoluteReport.startsWith(`${candidateRoot}/`))
    throw new Error("G12_BACKEND_COMPATIBILITY_REPORT_REFUSED");
  await import("node:fs/promises").then(({ writeFile }) =>
    writeFile(absoluteReport, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
  );
}
console.log(JSON.stringify(report));
if (violations.length) process.exitCode = 1;
