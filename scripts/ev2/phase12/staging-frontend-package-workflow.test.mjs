import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [workflow, resolver, verifier, matrix, baselineResolver, baselineLibrary, selectionLibrary] =
  await Promise.all([
    readFile(new URL("../../../.github/workflows/ci.yml", import.meta.url), "utf8"),
    readFile(new URL("./resolve-ci-staging-frontend-artifact.mjs", import.meta.url), "utf8"),
    readFile(new URL("./verify-staging-frontend-package.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../.github/release-controls/release-gate-matrix.json", import.meta.url), "utf8"),
    readFile(new URL("./resolve-staging-release-baseline.mjs", import.meta.url), "utf8"),
    readFile(new URL("./staging-release-baseline-lib.mjs", import.meta.url), "utf8"),
    readFile(new URL("./ci-staging-frontend-selection-lib.mjs", import.meta.url), "utf8"),
  ]);

function job(name, nextName) {
  const start = workflow.indexOf(`  ${name}:`);
  const end = workflow.indexOf(`\n  ${nextName}:`, start);
  assert.notEqual(start, -1, `${name} job missing`);
  assert.notEqual(end, -1, `${nextName} boundary missing`);
  return workflow.slice(start, end);
}

function assertInOrder(source, labels) {
  const positions = labels.map((label) => source.indexOf(label));
  assert.ok(
    positions.every((position) => position >= 0),
    `missing ordered label: ${labels.join(", ")}`,
  );
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index - 1] < positions[index], `${labels[index - 1]} must precede ${labels[index]}`);
  }
}

test("quality keeps all validation and build checks without publishing raw deployable dist", () => {
  const quality = job("quality", "package-staging");
  for (const command of [
    "npm ci",
    "npm run check",
    "npm audit --audit-level=high",
    "npm run build:staging",
    "npm run artifact:manifest",
  ]) {
    assert.match(quality, new RegExp(command.replaceAll(" ", "\\s+")));
  }
  assert.doesNotMatch(quality, /actions\/upload-artifact@/);
  assert.doesNotMatch(quality, /name: site-/);
});

test("release-plan trusts an all-or-nothing four-file bundle from the proven staging baseline", () => {
  const releasePlan = job("release-plan", "quality");
  assert.match(releasePlan, /timeout-minutes: 5/);
  assert.match(releasePlan, /fetch-depth: 0/);
  assert.match(releasePlan, /resolve-staging-release-baseline\.mjs/);
  assert.match(
    releasePlan,
    /EVENT_BASE_SHA: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/,
  );
  assert.match(
    releasePlan,
    /git show "\$\{EVENT_BASE_SHA\}:scripts\/ev2\/phase12\/resolve-staging-release-baseline\.mjs"/,
  );
  assert.match(
    releasePlan,
    /git show "\$\{EVENT_BASE_SHA\}:scripts\/ev2\/phase12\/staging-release-baseline-lib\.mjs"/,
  );
  assert.match(releasePlan, /complete trusted staging-baseline resolver is unavailable/);
  assert.match(releasePlan, /BASE_SHA: \$\{\{ steps\.staging-baseline\.outputs\.baseline_sha \}\}/);
  assert.match(releasePlan, /BASELINE_PROVEN: \$\{\{ steps\.staging-baseline\.outputs\.baseline_proven \}\}/);
  for (const control of [
    "scripts/ev2/phase12/select-release-profile.mjs",
    "scripts/ev2/phase12/release-profile-lib.mjs",
    ".github/release-controls/release-gate-matrix.json",
    ".github/release-controls/release-checkpoint-policy.json",
  ]) {
    assert.ok(releasePlan.includes(control), `base control bundle is missing ${control}`);
  }
  assert.match(releasePlan, /if \[ "\$present" -eq 4 \]; then/);
  assert.match(releasePlan, /git show "\$\{BASE_SHA\}:scripts\/ev2\/phase12\/select-release-profile\.mjs"/);
  assert.match(releasePlan, /git show "\$\{BASE_SHA\}:scripts\/ev2\/phase12\/release-profile-lib\.mjs"/);
  assert.match(releasePlan, /trust_route=base-controls/);
  assert.match(releasePlan, /elif \[ "\$present" -eq 0 \]; then/);
  assert.match(releasePlan, /echo "::error::The base release-control bundle is incomplete/);
  assert.match(releasePlan, /plan\.controlSha !== process\.env\.BASE_SHA/);
  assert.match(releasePlan, /plan\.trustMode !== "base-controls"/);
  assert.match(releasePlan, /process\.env\.EXPECTED_BASELINE_PROVEN !== "true"/);
});

test("release-plan producer and verifier enforce the same bounded per-file ceiling", () => {
  const releasePlan = job("release-plan", "quality");
  assert.match(releasePlan, /metadata\.size > 1_048_576/);
  assert.match(selectionLibrary, /const MAX_RELEASE_PLAN_FILE_BYTES = 1024 \* 1024;/);
});

test("staging profile baseline requires a successful exact-attempt checkpoint and terminal chain", () => {
  for (const marker of [
    "staging-deploy-state-${run.id}-${run.run_attempt}",
    "staging-terminal-${run.id}-${run.run_attempt}",
    "pipeline-end-to-end-",
    'run.conclusion !== "success"',
    "run.path !== WORKFLOW_PATH",
    'run.event !== "workflow_dispatch"',
    "staging_baseline_ancestry_unproved",
    "staging_control_ancestry_unproved",
  ]) {
    assert.ok(baselineLibrary.includes(marker), `baseline proof is missing ${marker}`);
  }
  assert.match(baselineResolver, /status=completed&per_page=1/);
  assert.match(baselineResolver, /baseline_sha=\$\{valid \? result\.baselineSha : ZERO_SHA\}/);
  assert.match(baselineResolver, /baseline_proven=\$\{String\(valid\)\}/);
  assert.match(baselineResolver, /\.catch\(\(\) => \(\{ valid: false \}\)\)/);

  const releasePlan = job("release-plan", "quality");
  assert.match(releasePlan, /false\) test "\$BASE_SHA" = 0000000000000000000000000000000000000000/);
  assert.match(releasePlan, /process\.env\.EXPECTED_BASELINE_PROVEN !== "false"/);
  assert.match(releasePlan, /plan\.selectedProfile !== "full-release"/);
});

test("release-plan bootstrap is an explicit fail-closed full release", () => {
  const releasePlan = job("release-plan", "quality");
  assert.match(releasePlan, /bootstrap=\(--bootstrap-mode full-release\)/);
  assert.match(releasePlan, /EXPECTED_TRUST_ROUTE="\$trust_route"/);
  assert.match(releasePlan, /plan\.trustMode !== "bootstrap-full"/);
  assert.match(releasePlan, /plan\.selectedProfile !== "full-release"/);
  assert.match(releasePlan, /plan\.failClosed !== true/);
  assert.match(releasePlan, /plan\.violations\?\.includes\("control_bootstrap_required"\)/);
  assert.match(releasePlan, /plan\.violations\?\.includes\("control_bundle_absent"\)/);
  for (const requiredJob of ["quality", "package-staging", "hotfix-bundle-smoke", "database", "browser"]) {
    assert.match(releasePlan, new RegExp(`requiredJobs = \\[[\\s\\S]*"${requiredJob}"`));
  }
  for (const output of [
    "run_quality",
    "run_package_staging",
    "run_edge",
    "run_database_auth",
    "run_browser",
  ]) {
    assert.match(releasePlan, new RegExp(`${output}=\\$\\{String\\(runJobs\\.has\\(`));
  }
  assert.match(matrix, /"ambiguityPolicy": "full-release"/);
});

test("release-plan publishes exactly the five trusted files with immutable identity", () => {
  const releasePlan = job("release-plan", "quality");
  for (const filename of [
    "release-checkpoint-policy.json",
    "release-control-library.mjs",
    "release-control-selector.mjs",
    "release-gate-matrix.json",
    "release-plan.json",
  ]) {
    assert.match(releasePlan, new RegExp(`"${filename.replaceAll(".", "\\.")}"`));
  }
  assert.match(releasePlan, /JSON\.stringify\(actualFiles\) !== JSON\.stringify\(expectedFiles\)/);
  assert.match(releasePlan, /path: \$\{\{ runner\.temp \}\}\/g12-release-plan/);
  assert.match(releasePlan, /id: upload-release-plan/);
  assert.match(releasePlan, /artifact_id: \$\{\{ steps\.release-plan-source\.outputs\.artifact_id \}\}/);
  assert.match(
    releasePlan,
    /artifact_digest: \$\{\{ steps\.release-plan-source\.outputs\.artifact_digest \}\}/,
  );
  assert.match(releasePlan, /artifact_name: \$\{\{ steps\.release-plan-source\.outputs\.artifact_name \}\}/);
  assert.match(releasePlan, /id: release-plan-source/);
  assert.match(
    releasePlan,
    /UPLOADED_ARTIFACT_ID: \$\{\{ steps\.upload-release-plan\.outputs\.artifact-id \}\}/,
  );
  assert.match(
    releasePlan,
    /UPLOADED_ARTIFACT_DIGEST: \$\{\{ steps\.upload-release-plan\.outputs\.artifact-digest \}\}/,
  );
  assert.match(
    releasePlan,
    /artifact_name=release-plan-\$\{GITHUB_SHA\}-\$\{GITHUB_RUN_ID\}-\$\{GITHUB_RUN_ATTEMPT\}/,
  );
  assert.match(releasePlan, /if-no-files-found: error/);
  assert.match(releasePlan, /overwrite: false/);
  assert.match(releasePlan, /retention-days: (?:9\d|[1-9]\d{2,})/);
});

test("independent validation lanes are selected by the trusted release plan", () => {
  for (const [name, nextName, output] of [
    ["quality", "package-staging", "run_quality"],
    ["hotfix-bundle-smoke", "database", "run_edge"],
    ["database", "browser", "run_database_auth"],
  ]) {
    const selected = job(name, nextName);
    assert.match(selected, /needs: release-plan/);
    assert.match(selected, new RegExp(`needs\\.release-plan\\.outputs\\.${output}`));
  }
  const browser = workflow.slice(workflow.indexOf("  browser:"));
  assert.match(browser, /needs: release-plan/);
  assert.match(browser, /needs\.release-plan\.outputs\.run_browser/);
});

test("package-staging is a post-lane fan-in and rejects missing selected lanes", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assert.match(packageJob, /needs: \[release-plan, quality, hotfix-bundle-smoke, database, browser\]/);
  assert.match(packageJob, /always\(\)/);
  assert.match(packageJob, /needs\.release-plan\.result == 'success'/);
  assert.match(packageJob, /github\.event_name == 'push'/);
  assert.match(packageJob, /github\.ref == 'refs\/heads\/main'/);
  assert.match(packageJob, /needs\.release-plan\.outputs\.run_package_staging == 'true'/);
  assert.match(packageJob, /QUALITY_RESULT: \$\{\{ needs\.quality\.result \}\}/);
  assert.match(packageJob, /EDGE_RESULT: \$\{\{ needs\.hotfix-bundle-smoke\.result \}\}/);
  assert.match(packageJob, /DATABASE_RESULT: \$\{\{ needs\.database\.result \}\}/);
  assert.match(packageJob, /BROWSER_RESULT: \$\{\{ needs\.browser\.result \}\}/);
  assert.match(packageJob, /true:success\|false:skipped/);
  assert.match(packageJob, /require_lane "\$EDGE_REQUIRED" "\$EDGE_RESULT"/);
  assert.match(packageJob, /require_lane "\$DATABASE_REQUIRED" "\$DATABASE_RESULT"/);
  assert.match(packageJob, /require_lane "\$BROWSER_REQUIRED" "\$BROWSER_RESULT"/);
});

test("package-staging downloads release-plan, Edge, and database artifacts by immutable ID", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assert.match(
    packageJob,
    /name: Download the exact trusted release plan by immutable artifact ID[\s\S]*?artifact-ids: \$\{\{ needs\.release-plan\.outputs\.artifact_id \}\}[\s\S]*?digest-mismatch: error/,
  );
  assert.match(
    packageJob,
    /name: Download the exact Edge artifact selected by the runtime gates[\s\S]*?artifact-ids: \$\{\{ needs\.hotfix-bundle-smoke\.outputs\.artifact_id \}\}[\s\S]*?digest-mismatch: error/,
  );
  assert.match(
    packageJob,
    /name: Download the exact database payload selected by the database gates[\s\S]*?artifact-ids: \$\{\{ needs\.database\.outputs\.artifact_id \}\}[\s\S]*?digest-mismatch: error/,
  );
});

test("package-staging selects before build and creates exactly one unified wrapper", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assertInOrder(packageJob, [
    "select-ci-staging-frontend-package.mjs",
    "Download the previously sealed package by immutable artifact ID",
    "Verify the previously sealed package against the current staging profile",
    "Download the exact Edge artifact selected by the runtime gates",
    "Download the exact database payload selected by the database gates",
    "npm run build:staging",
    "write-staging-release-package.mjs",
    "Upload the only deployable staging frontend package",
    "Expose the exact original package producer without aliases",
    "Seal the current gate attempt to the exact original package",
  ]);
  assert.equal((packageJob.match(/npm run build:staging/g) ?? []).length, 1);
  assert.equal((packageJob.match(/seal-production-dist\.mjs/g) ?? []).length, 1);
  assert.equal((packageJob.match(/write-staging-release-package\.mjs/g) ?? []).length, 1);
  assert.match(packageJob, /release_args=\(/);
  assert.match(packageJob, /--frontend outputs\/staging-frontend-component/);
  assert.match(packageJob, /--controls "\$controls"/);
  assert.match(packageJob, /release_args\+=\(--edge "\$RUNNER_TEMP\/g12-edge-runtime-artifact"\)/);
  assert.match(packageJob, /release_args\+=\(--database "\$RUNNER_TEMP\/g12-database-release-artifact"\)/);
  assert.match(packageJob, /node scripts\/ev2\/phase12\/verify-staging-release-package\.mjs/);
});

test("package selection keeps the frontend identity output channel exclusive", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assert.equal((packageJob.match(/verify-database-release-payload\.mjs/g) ?? []).length, 2);
  assert.equal(
    (
      packageJob.match(
        /env -u GITHUB_OUTPUT node scripts\/ev2\/phase12\/verify-database-release-payload\.mjs/g,
      ) ?? []
    ).length,
    2,
  );

  const databaseJob = job("database", "browser");
  assert.match(databaseJob, /node scripts\/ev2\/phase12\/verify-database-release-payload\.mjs/);
  assert.doesNotMatch(
    databaseJob,
    /env -u GITHUB_OUTPUT node scripts\/ev2\/phase12\/verify-database-release-payload\.mjs/,
  );
});

test("package selection rebinds every frontend identity to the final seal and provenance", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  const start = packageJob.indexOf("name: Expose the exact original package producer without aliases");
  const end = packageJob.indexOf("name: Seal the current gate attempt to the exact original package", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const expose = packageJob.slice(start, end);

  for (const file of [
    "staging-frontend-dist.tar",
    "staging-frontend-dist-seal.json",
    "staging-frontend-provenance.json",
  ]) {
    assert.match(expose, new RegExp(file.replaceAll(".", "\\.")));
  }
  for (const identity of [
    "archiveSha256",
    "archiveBytes",
    "treeSha256",
    "fileCount",
    "byteCount",
    "profile.sha256",
    "seal.sha256",
  ]) {
    assert.match(expose, new RegExp(identity.replaceAll(".", "\\.")));
  }
  assert.match(expose, /sha256sum "\$frontend_archive"/);
  assert.match(expose, /stat -c '%s' "\$frontend_archive"/);
  assert.match(expose, /sha256sum "\$frontend_seal"/);
  assert.match(expose, /sha256sum "\$frontend_provenance"/);
});

test("reuse verifies the unified wrapper, trusted controls, and every selected component", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assert.match(
    packageJob,
    /name: Download the previously sealed package by immutable artifact ID[\s\S]*?artifact-ids: \$\{\{ steps\.select-package\.outputs\.artifact_id \}\}[\s\S]*?digest-mismatch: error/,
  );
  assert.match(packageJob, /--package outputs\/staging-release-package \\/);
  assert.match(
    packageJob,
    /for file in release-plan\.json release-gate-matrix\.json release-checkpoint-policy\.json; do/,
  );
  assert.match(packageJob, /outputs\/staging-release-package\/controls\/\$file/);
  assert.match(packageJob, /g12-release-plan-current\/\$file/);
  assert.match(
    packageJob,
    /verify-staging-frontend-package\.mjs \\\n\s+--package outputs\/staging-release-package\/frontend/,
  );
  assert.match(
    packageJob,
    /verify-all-edge-runtime-artifact\.mjs \\\n\s+--root outputs\/staging-release-package\/edge/,
  );
  assert.match(
    packageJob,
    /verify-database-release-payload\.mjs \\\n\s+--payload "outputs\/staging-release-package\/database\/\$database_path"/,
  );
  assert.match(packageJob, /edge-only\|full-release/);
  assert.match(packageJob, /database-auth\|full-release/);
});

test("the selection binds the five-file control artifact and release plan identity", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  for (const argument of [
    '--control-selector "$RUNNER_TEMP/g12-release-plan-current/release-control-selector.mjs"',
    '--control-library "$RUNNER_TEMP/g12-release-plan-current/release-control-library.mjs"',
    '--control-matrix "$RUNNER_TEMP/g12-release-plan-current/release-gate-matrix.json"',
    '--control-checkpoint-policy "$RUNNER_TEMP/g12-release-plan-current/release-checkpoint-policy.json"',
    '--release-plan "$RUNNER_TEMP/g12-release-plan-current/release-plan.json"',
    '--expected-base-sha "${{ needs.release-plan.outputs.base_sha }}"',
    '--expected-plan-sha256 "${{ needs.release-plan.outputs.plan_sha256 }}"',
    '--release-plan-artifact-id "${{ needs.release-plan.outputs.artifact_id }}"',
    '--release-plan-artifact-digest "${{ needs.release-plan.outputs.artifact_digest }}"',
    '--release-plan-artifact-name "${{ needs.release-plan.outputs.artifact_name }}"',
  ]) {
    assert.ok(packageJob.includes(argument), `selection is missing ${argument}`);
  }
  assert.match(packageJob, /--candidate-matrix \.github\/release-controls\/release-gate-matrix\.json/);
  assert.match(
    packageJob,
    /--candidate-checkpoint-policy \.github\/release-controls\/release-checkpoint-policy\.json/,
  );
});

test("only the unified root is uploaded as the deployable artifact", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assert.match(
    packageJob,
    /name: Upload the only deployable staging frontend package\s+if: steps\.select-package\.outputs\.mode == 'create'/,
  );
  assert.match(
    packageJob,
    /name: staging-frontend-\$\{\{ github\.sha \}\}-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/,
  );
  assert.match(packageJob, /path: outputs\/staging-release-package/);
  assert.equal((packageJob.match(/id: upload-package/g) ?? []).length, 1);
  assert.match(packageJob, /compression-level: 0/);
  assert.match(packageJob, /overwrite: false/);
  assert.match(packageJob, /test "\$SELECTED_RUN_ATTEMPT" -lt "\$GITHUB_RUN_ATTEMPT"/);
  assert.doesNotMatch(packageJob, /name: staging-frontend-.*alias/i);
  assert.doesNotMatch(packageJob, /wrangler|pages deploy|deploy-staging/i);
});

test("package-staging keeps the protected staging frontend profile", () => {
  const packageJob = job("package-staging", "hotfix-bundle-smoke");
  assert.match(packageJob, /environment: staging/);
  assert.match(packageJob, /actions\/setup-node@[a-f0-9]+/);
  assert.match(packageJob, /node-version-file: \.nvmrc/);
  assert.match(packageJob, /find \.[^\n]+-name '\.env\*' ! -name '\.env\.example'/);
  for (const testKey of [
    "1x00000000000000000000AA",
    "2x00000000000000000000AB",
    "1x00000000000000000000BB",
    "2x00000000000000000000BB",
    "3x00000000000000000000FF",
  ]) {
    assert.match(packageJob, new RegExp(testKey));
  }
  for (const [key, value] of [
    ["VITE_RELEASE", "\\$\\{\\{ github\\.sha \\}\\}"],
    ["VITE_CMS_ENVIRONMENT", "staging"],
    ["VITE_SUPABASE_URL", "\\$\\{\\{ secrets\\.STAGING_SUPABASE_URL \\}\\}"],
    ["VITE_SUPABASE_ANON_KEY", "\\$\\{\\{ secrets\\.STAGING_SUPABASE_ANON_KEY \\}\\}"],
    ["VITE_TURNSTILE_SITE_KEY", "\\$\\{\\{ vars\\.TURNSTILE_STAGING_SITE_KEY \\}\\}"],
    ["VITE_GOOGLE_MAPS_KEY", "\\$\\{\\{ vars\\.GOOGLE_MAPS_BROWSER_KEY \\}\\}"],
    ["VITE_CONTACT_CAPTCHA_ALWAYS", '"true"'],
    ["VITE_EV2_DRAFT_V2_CANDIDATE", '"false"'],
  ]) {
    assert.match(packageJob, new RegExp(`${key}: ${value}`));
  }
});

test("resolver and frontend verifier preserve stable integration outputs", () => {
  for (const output of [
    "artifact_id",
    "artifact_digest",
    "artifact_name",
    "source_run_id",
    "source_run_attempt",
    "gate_run_attempt",
    "control_sha",
  ]) {
    assert.match(resolver, new RegExp(`${output}=\\$\\{`));
  }
  for (const output of [
    "archive_sha256",
    "tree_sha256",
    "profile_sha256",
    "archive_bytes",
    "file_count",
    "byte_count",
    "seal_sha256",
    "provenance_sha256",
  ]) {
    assert.match(verifier, new RegExp(`${output}=\\$\\{`));
  }
});
