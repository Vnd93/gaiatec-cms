import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CMS_PUBLIC_BUNDLE_LOCK } from "./staging-cms-public-hotfix-deno-lock-lib.mjs";
import { STAGING_CMS_PUBLIC_HOTFIX } from "./staging-cms-public-hotfix-lib.mjs";
import { directoryRecords, readBoundedFile, walkFiles } from "./staging-cms-public-hotfix.mjs";

const mainWorkflowPath = new URL(
  "../../../.github/workflows/promote-staging-cms-public-hotfix.yml",
  import.meta.url,
);
const watchdogWorkflowPath = new URL(
  "../../../.github/workflows/promote-staging-cms-public-hotfix-watchdog.yml",
  import.meta.url,
);
const ciWorkflowPath = new URL("../../../.github/workflows/ci.yml", import.meta.url);
const runnerPath = new URL("./staging-cms-public-hotfix.mjs", import.meta.url);
const libraryPath = new URL("./staging-cms-public-hotfix-lib.mjs", import.meta.url);
const builderPath = new URL("./staging-cms-public-hotfix-bundle.sh", import.meta.url);

const [mainWorkflow, watchdogWorkflow, ciWorkflow, runner, library, builder] = await Promise.all([
  readFile(mainWorkflowPath, "utf8"),
  readFile(watchdogWorkflowPath, "utf8"),
  readFile(ciWorkflowPath, "utf8"),
  readFile(runnerPath, "utf8"),
  readFile(libraryPath, "utf8"),
  readFile(builderPath, "utf8"),
]);

function stepBody(workflow, name) {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow step: ${name}`);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? workflow.length : next);
}

function exactEnvValue(workflow, key) {
  const pattern = new RegExp(`^[ \\t]+${key}:[ \\t]*(?:>-[ \\t]*\\r?\\n[ \\t]+)?([^\\r\\n]+)$`, "gm");
  const matches = [...workflow.matchAll(pattern)];
  assert.equal(matches.length, 1, `expected one ${key} assignment`);
  return matches[0][1].trim();
}

function assertOrdered(haystack, needles) {
  let cursor = -1;
  for (const needle of needles) {
    const next = haystack.indexOf(needle, cursor + 1);
    assert.notEqual(next, -1, `missing ordered token: ${needle}`);
    assert.ok(next > cursor, `out-of-order token: ${needle}`);
    cursor = next;
  }
}

test("main workflow refuses every rerun before checkout, artifacts, state, or mutation", () => {
  assert.doesNotMatch(mainWorkflow, /^\s*group:\s+staging\s*$/m);
  assert.doesNotMatch(watchdogWorkflow, /^\s*group:\s+staging\s*$/m);
  assert.match(
    mainWorkflow,
    /group: \$\{\{ github\.run_attempt == '1' && 'staging' \|\| format\('staging-hotfix-rerun-refused-\{0\}-\{1\}', github\.run_id, github\.run_attempt\) \}\}/,
  );
  const firstStep = stepBody(mainWorkflow, "Validate the exact operator, branch and literal authorization");
  assert.match(firstStep, /RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(firstStep, /test "\$RUN_ATTEMPT" = 1/);
  assert.doesNotMatch(firstStep, /continue-on-error:/);
  assert.ok(
    mainWorkflow.indexOf('test "$RUN_ATTEMPT" = 1') < mainWorkflow.indexOf("uses: actions/checkout@"),
  );
  const promotionGate = stepBody(mainWorkflow, "Validate the exact promotion identity");
  assert.match(promotionGate, /RUN_ATTEMPT: \$\{\{ github\.run_attempt \}\}/);
  assert.match(promotionGate, /test "\$RUN_ATTEMPT" = 1/);
  assert.match(runner, /if \(runAttempt !== 1\)[\s\S]*G12_STAGING_CMS_PUBLIC_HOTFIX_RERUN_REFUSED/);
  assert.match(
    runner,
    /workflowPath === STAGING_CMS_PUBLIC_HOTFIX\.workflowPath && executor\.runAttempt !== 1/,
  );
  assert.match(watchdogWorkflow, /if: >-\s+github\.event\.workflow_run\.run_attempt == 1 &&/);
  assert.match(
    watchdogWorkflow,
    /group: \$\{\{ github\.event\.workflow_run\.run_attempt == 1 && 'staging' \|\| format\('staging-hotfix-watchdog-refused-\{0\}-\{1\}', github\.event\.workflow_run\.id, github\.event\.workflow_run\.run_attempt\) \}\}/,
  );
});

test("candidate build uses only the read-only job token without environment secrets", () => {
  const buildStart = mainWorkflow.indexOf("  build-candidate:");
  const promoteStart = mainWorkflow.indexOf("\n  promote:", buildStart);
  assert.notEqual(buildStart, -1, "missing build-candidate job");
  assert.notEqual(promoteStart, -1, "missing promote job boundary");
  const buildCandidate = mainWorkflow.slice(buildStart, promoteStart);
  assert.doesNotMatch(buildCandidate, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(buildCandidate, /^\s+environment:/m);
  assert.equal((buildCandidate.match(/GITHUB_TOKEN: \$\{\{ github\.token \}\}/g) ?? []).length, 2);

  for (const name of [
    "Verify the exact successful CI run bound to the hotfix bytes",
    "Verify candidate artifact metadata against this exact run",
  ]) {
    assert.match(stepBody(mainWorkflow, name), /GITHUB_TOKEN: \$\{\{ github\.token \}\}/, name);
  }

  const permissionsStart = mainWorkflow.indexOf("permissions:");
  const concurrencyStart = mainWorkflow.indexOf("\nconcurrency:", permissionsStart);
  assert.notEqual(permissionsStart, -1, "missing global permissions");
  assert.notEqual(concurrencyStart, -1, "missing concurrency boundary");
  assert.equal(
    mainWorkflow.slice(permissionsStart, concurrencyStart).replaceAll("\r\n", "\n"),
    "permissions:\n  actions: read\n  contents: read\n",
  );
});

test("every hardened hotfix container runs as the host runner identity", () => {
  for (const name of [
    "Build once online with the immutable helper and frozen input",
    "Rebuild offline with Docker networking disabled",
  ]) {
    const step = stepBody(mainWorkflow, name);
    assert.match(step, /--user "\$\(id -u\):\$\(id -g\)"/);
    assert.match(step, /--cap-drop ALL --security-opt no-new-privileges/);
    assert.match(step, /--env HOME=\/tmp --env DENO_DIR=\/deno-cache/);
    assert.match(step, /:\/deno-cache:rw/);
    assert.doesNotMatch(step, /\/root\/\.cache\/deno/);
  }

  const consumer = stepBody(
    mainWorkflow,
    "Reparse every candidate module with the immutable runtime offline",
  );
  assert.match(consumer, /--user "\$\(id -u\):\$\(id -g\)"/);
  assert.match(consumer, /--cap-drop ALL --security-opt no-new-privileges/);
  assert.match(consumer, /--env HOME=\/tmp/);
  assert.match(
    consumer,
    /edge-runtime unbundle --eszip \/candidate\/output\.eszip --output \/output\/supabase\/functions\/cms-public/,
  );
});

test("the immutable builder reports every preflight and runtime boundary failure", () => {
  assert.equal(
    createHash("sha256").update(Buffer.from(builder, "utf8")).digest("hex"),
    STAGING_CMS_PUBLIC_HOTFIX.builderScriptSha256,
  );
  assert.match(builder, /refuse\(\) \{[\s\S]*printf '%s\\n' "\$1" >&2[\s\S]*exit 1/);
  for (const token of [
    "G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_INDEX_DIGEST_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_AMD64_DIGEST_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_PLATFORM_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_SOURCE_DENO_LOCK_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_ROOTS_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_EVIDENCE_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_TREE_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_FILE_COUNT_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_URL_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_SHA256_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILES_MANIFEST_SHA256_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TREE_SHA256_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_COUNT_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_BYTES_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_DIR_MISSING",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_DIRECTORY_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_OUTPUT_DIRECTORY_UNWRITABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_OUTPUT_PROBE_CLEANUP_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_DIR_UNWRITABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_DIR_PROBE_CLEANUP_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_TMP_DIRECTORY_UNWRITABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_TMP_PROBE_CLEANUP_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_MANIFEST_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_INPUT_FILES_MANIFEST_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_CONFIG_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_DENO_LOCK_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_DENO_LOCK_FILE_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_IMPORT_MAP_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_ENTRYPOINT_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_DIRECTORY_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILES_MANIFEST_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_REGISTRY_METADATA_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_VERSION_METADATA_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_REGISTRY_METADATA_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_VERSION_METADATA_UNREADABLE",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SYMLINK_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_ENTRY_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FIND_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SORT_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_HASH_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_INVENTORY_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_COUNT_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SIZE_SCAN_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_BYTES_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_MANIFEST_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILES_MANIFEST_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TREE_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FILE_COUNT_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_BYTES_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_REGISTRY_METADATA_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_FUNCTIONS_VERSION_METADATA_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_REGISTRY_METADATA_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_SUPABASE_VERSION_METADATA_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_JSR_MIRROR_TEMP_CLEANUP_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_BUNDLE_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_EDGE_RUNTIME_UNBUNDLE_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_FIND_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_SORT_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_HASH_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_SIZE_SCAN_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_METRICS_FAILED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_SIZE_COUNT_REFUSED",
    "G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_TEMP_CLEANUP_FAILED",
  ])
    assert.match(builder, new RegExp(token), token);
  assert.doesNotMatch(builder, /find .*\|.*sort .*\|.*xargs/);
  assert.equal(
    (builder.match(/--output \/output\/unbundled\/supabase\/functions\/cms-public/g) ?? []).length,
    2,
  );
  assert.match(builder, /find \. -type f -print0 > "\$\{unbundled_files\}"/);
  assert.match(builder, /sort -z "\$\{unbundled_files\}" > "\$\{unbundled_files_sorted\}"/);
  assert.match(builder, /xargs -0 -r sha256sum < "\$\{unbundled_files_sorted\}"/);
  assert.match(builder, /xargs -0 -r -n 1 wc -c < "\$\{unbundled_files_sorted\}"/);
  assert.equal((builder.match(/cd "\$\{unbundled\}" \|\| exit 1/g) ?? []).length, 3);
  assert.match(builder, /require_equal "\$\{JSR_URL:-\}" "file:\/\/\/workspace\/\.g12-jsr\/"/);
  assert.match(builder, /find \. -type f[\s\S]*\.g12-mirror-manifest\.json[\s\S]*-print0/);
  assert.match(builder, /xargs -0 -r sha256sum --text < "\$\{mirror_files_sorted\}"/);
  assert.match(builder, /cmp -s "\$\{mirror_files_actual\}" "\$\{jsr_mirror_files_manifest\}"/);
  assert.match(builder, /xargs -0 -r -n 1 wc -c < "\$\{mirror_files_sorted\}"/);
  assert.match(builder, /\) > "\$\{mirror_sizes\}"; then/);
  assert.match(builder, /awk '\{ total \+= \$1 \} END \{ print total \+ 0 \}' "\$\{mirror_sizes\}"/);
  assert.doesNotMatch(builder, /\)\s*\|\s*awk/);
  assert.match(builder, /printf 'SOURCE_DENO_LOCK_SHA256=%s\\n'/);
  assert.match(builder, /printf 'BUNDLE_DENO_LOCK_SHA256=%s\\n'/);
  assert.match(builder, /printf 'BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS=%s\\n'/);
  assert.match(builder, /printf 'BUNDLE_DENO_LOCK_EVIDENCE_JSON=%s\\n'/);
  assert.match(builder, /printf 'UNBUNDLED_TOTAL_BYTES=%s\\n'/);
  assert.match(builder, /printf 'UNBUNDLED_ZERO_BYTE_FILE_COUNT=%s\\n'/);
  assert.match(builder, /printf 'UNBUNDLED_LARGEST_FILE_BYTES=%s\\n'/);
  assert.match(builder, /require_uint "\$\{unbundled_total_bytes\}"/);
  assert.doesNotMatch(builder, /printf 'DENO_LOCK_SHA256=/);
});

test("the builder metrics program executes under the host awk and refuses bounded invalid inventories", async (t) => {
  const match = /if ! awk '\n([\s\S]*?)\n' "\$\{unbundled_sizes\}" > "\$\{unbundled_metrics\}"; then/.exec(
    builder,
  );
  assert.ok(match, "missing exact unbundled metrics awk program");
  const root = await mkdtemp(join(tmpdir(), "g12-cms-public-awk-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const program = join(root, "metrics.awk");
  const sizes = join(root, "sizes.txt");
  await writeFile(program, match[1], "utf8");
  const gitAwk = "C:\\Program Files\\Git\\usr\\bin\\awk.exe";
  const awk = process.platform === "win32" && existsSync(gitAwk) ? gitAwk : "awk";
  const run = async (input) => {
    await writeFile(sizes, input, "utf8");
    return spawnSync(awk, ["-f", program, sizes], { encoding: "utf8" });
  };

  const valid = await run("0 ./edge-runtime.d.ts\n12 ./index.ts\n");
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, "2\n1\n12\n12\n");

  const allEmpty = await run("0 ./a.d.ts\n0 ./b.d.ts\n");
  assert.equal(allEmpty.status, 0, allEmpty.stderr);
  assert.equal(allEmpty.stdout, "2\n2\n0\n0\n");

  assert.notEqual((await run("2097153 ./oversized.ts\n")).status, 0);
  assert.notEqual((await run("67108865 ./tree.ts\n")).status, 0);
  assert.notEqual((await run("0 ./empty.d.ts\n".repeat(65_537))).status, 0);
});

test("bundle input seals the lock-verified file JSR mirror and rejects import.meta", () => {
  assert.match(runner, /projectCmsPublicBundleLock\(sourceDenoLock\)/);
  assert.match(
    runner,
    /writeBytes\(join\(output, "deno\.lock"\), serializeCmsPublicBundleLock\(bundleDenoLock\)\)/,
  );
  assert.match(runner, /materializeCmsPublicJsrMirror\(\{[\s\S]*lock: bundleDenoLock[\s\S]*\.g12-jsr/);
  assert.match(runner, /loadCmsPublicJsrMirror\(\{[\s\S]*\.g12-jsr[\s\S]*lock: denoLock/);
  assert.match(runner, /G12_STAGING_CMS_PUBLIC_HOTFIX_IMPORT_META_REFUSED/);
  assert.match(runner, /sourceImportMetaAbsent: true/);
  assert.match(runner, /sourceDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX\.sourceDenoLockSha256/);
  assert.match(runner, /bundleDenoLockSha256: await fileSha256\(join\(output, "deno\.lock"\)\)/);
  assert.match(runner, /bundleDenoLock: structuredClone\(CMS_PUBLIC_BUNDLE_LOCK\.evidence\)/);
  assert.match(runner, /jsrMirror: \{[\s\S]*manifestSha256[\s\S]*treeSha256[\s\S]*fileCount[\s\S]*bytes/);
});

test("tree and ESZIP inventories stay bounded while only verified unbundles accept empty files", () => {
  const directoryStart = runner.indexOf("async function directoryRecords(");
  const directoryEnd = runner.indexOf("async function candidateSourceUsesImportMeta", directoryStart);
  const directoryBody = runner.slice(directoryStart, directoryEnd);
  assert.notEqual(directoryStart, -1);
  assert.notEqual(directoryEnd, -1);
  assert.match(directoryBody, /allowEmptyFiles = false/);
  assert.match(directoryBody, /maximumFileBytes = STAGING_CMS_PUBLIC_HOTFIX\.maximumArtifactFileBytes/);
  assert.match(directoryBody, /maximumTreeBytes = STAGING_CMS_PUBLIC_HOTFIX\.maximumArtifactTreeBytes/);
  assert.match(directoryBody, /maximumEntryCount = STAGING_CMS_PUBLIC_HOTFIX\.maximumArtifactEntryCount/);
  assert.doesNotMatch(directoryBody, /maximumRawEszipBytes/);
  assert.match(directoryBody, /emptyFileCount/);
  assert.match(directoryBody, /largestFileBytes/);
  assert.match(library, /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_TOO_LARGE_REFUSED/);
  assert.equal((runner.match(/allowEmptyFiles: true/g) ?? []).length, 2);
  assert.match(runner, /const directory = await opendir\(current\)/);
  assert.doesNotMatch(runner, /await readdir\(current/);

  const validationStart = runner.indexOf("async function validateUnbundledManifest");
  const validationEnd = runner.indexOf("async function loadCandidateBuildEvidence", validationStart);
  const runtimeStart = runner.indexOf("async function verifyRuntimeUnbundle");
  const runtimeEnd = runner.indexOf("function githubToken", runtimeStart);
  assert.match(runner.slice(validationStart, validationEnd), /allowEmptyFiles: true/);
  assert.match(runner.slice(runtimeStart, runtimeEnd), /allowEmptyFiles: true/);
  assert.match(runner, /g12\.staging\.cms_public_hotfix\.unbundled_file_boundary/);
  assert.match(runner, /g12\.staging\.cms_public_hotfix\.file_boundary_refused/);
  assert.match(library, /G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_EMPTY_REFUSED/);
  assert.match(library, /G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_TOO_LARGE_REFUSED/);

  assert.match(library, /const moduleSpecifiers = new Set\(\)/);
  assert.match(library, /moduleSpecifiers\.has\(specifier\)/);
  assert.match(library, /moduleSpecifiers\.add\(specifier\)/);
  assert.doesNotMatch(library, /modules\.some\(\(item\) => item\.specifier === specifier\)/);
  assert.match(library, /G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_MODULE_COUNT_REFUSED/);
});

test("artifact tree boundaries execute at exact limits and refuse cap plus one without path disclosure", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "g12-cms-public-tree-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  const totalRoot = join(root, "total");
  await mkdir(totalRoot);
  await writeFile(join(totalRoot, "payload"), Buffer.from("ab"));
  const exactTotal = await directoryRecords(totalRoot, {
    maximumFileBytes: 3,
    maximumTreeBytes: 2,
  });
  assert.equal(exactTotal.inventory.totalBytes, 2);
  await writeFile(join(totalRoot, "payload"), Buffer.from("abc"));
  await assert.rejects(
    () =>
      directoryRecords(totalRoot, {
        maximumFileBytes: 3,
        maximumTreeBytes: 2,
      }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_TOO_LARGE_REFUSED/,
  );

  const pathRoot = join(root, "path");
  await mkdir(pathRoot);
  await writeFile(join(pathRoot, "éé"), Buffer.from("x"));
  assert.equal((await walkFiles(pathRoot, { maximumPathBytes: 4 })).files.length, 1);
  await rm(join(pathRoot, "éé"));
  const oversizedName = "ééa";
  await writeFile(join(pathRoot, oversizedName), Buffer.from("x"));
  const logs = [];
  const originalLog = console.log;
  console.log = (...values) => logs.push(values.join(" "));
  try {
    await assert.rejects(
      () => walkFiles(pathRoot, { maximumPathBytes: 4 }),
      /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_PATH_SIZE_REFUSED/,
    );
  } finally {
    console.log = originalLog;
  }
  const refusalOutput = logs.join("\n");
  assert.match(refusalOutput, /tree_boundary_refused/);
  assert.doesNotMatch(refusalOutput, new RegExp(oversizedName));
  assert.equal(refusalOutput.includes(pathRoot), false);

  const depthRoot = join(root, "depth");
  await mkdir(depthRoot);
  let current = depthRoot;
  for (let depth = 0; depth < 64; depth += 1) {
    current = join(current, "a");
    await mkdir(current);
  }
  assert.equal((await walkFiles(depthRoot, { maximumDepth: 64 })).entryCount, 64);
  await mkdir(join(current, "a"));
  await assert.rejects(
    () => walkFiles(depthRoot, { maximumDepth: 64 }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_DEPTH_REFUSED/,
  );

  const entryRoot = join(root, "entries");
  await mkdir(entryRoot);
  await mkdir(join(entryRoot, "a"));
  await mkdir(join(entryRoot, "b"));
  assert.equal((await walkFiles(entryRoot, { maximumEntryCount: 2 })).entryCount, 2);
  await mkdir(join(entryRoot, "c"));
  await assert.rejects(
    () => walkFiles(entryRoot, { maximumEntryCount: 2 }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_ENTRY_COUNT_REFUSED/,
  );

  const fileRoot = join(root, "files");
  await mkdir(fileRoot);
  await writeFile(join(fileRoot, "a"), Buffer.from("a"));
  assert.equal((await walkFiles(fileRoot, { maximumFileCount: 1 })).files.length, 1);
  await writeFile(join(fileRoot, "b"), Buffer.from("b"));
  await assert.rejects(
    () => walkFiles(fileRoot, { maximumFileCount: 1 }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_FILE_COUNT_REFUSED/,
  );

  const boundedRoot = join(root, "bounded");
  await mkdir(boundedRoot);
  const boundedFile = join(boundedRoot, "payload");
  await writeFile(boundedFile, Buffer.from("ab"));
  assert.equal((await readBoundedFile(boundedFile, 2)).byteLength, 2);
  await writeFile(boundedFile, Buffer.from("abc"));
  await assert.rejects(
    () => readBoundedFile(boundedFile, 2, { relativePath: "payload" }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_TOO_LARGE_REFUSED/,
  );
});

test("both candidate workflows propagate the exact projected lock evidence into Docker", () => {
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256, CMS_PUBLIC_BUNDLE_LOCK.sourceSha256);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256, CMS_PUBLIC_BUNDLE_LOCK.sha256);

  for (const [workflow, stepNames] of [
    [
      mainWorkflow,
      [
        "Build once online with the immutable helper and frozen input",
        "Rebuild offline with Docker networking disabled",
      ],
    ],
    [
      ciWorkflow,
      [
        "Exercise the hardened online Docker bundle boundary",
        "Exercise the hardened offline Docker rebuild boundary",
      ],
    ],
  ]) {
    for (const name of stepNames) {
      const step = stepBody(workflow, name);
      assertOrdered(step, [
        'source_deno_lock_sha256="$(jq -r .sourceDenoLockSha256 bundle-input/bundle-input-manifest.json)"',
        'bundle_deno_lock_sha256="$(jq -r .bundleDenoLockSha256 bundle-input/bundle-input-manifest.json)"',
        'bundle_deno_lock_npm_roots="$(jq -c .bundleDenoLock.npmRootSpecifiers bundle-input/bundle-input-manifest.json)"',
        'bundle_deno_lock_evidence="$(jq -c .bundleDenoLock bundle-input/bundle-input-manifest.json)"',
        "docker run",
        '--env G12_SOURCE_DENO_LOCK_SHA256="$source_deno_lock_sha256"',
        '--env G12_BUNDLE_DENO_LOCK_SHA256="$bundle_deno_lock_sha256"',
        '--env G12_BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS="$bundle_deno_lock_npm_roots"',
        '--env G12_BUNDLE_DENO_LOCK_EVIDENCE_JSON="$bundle_deno_lock_evidence"',
      ]);
      assert.doesNotMatch(step, /--env G12_DENO_LOCK_SHA256=/);
    }
  }

  assert.match(runner, /"SOURCE_DENO_LOCK_SHA256"/);
  assert.match(runner, /"BUNDLE_DENO_LOCK_SHA256"/);
  assert.match(runner, /"BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS"/);
  assert.match(runner, /"BUNDLE_DENO_LOCK_EVIDENCE_JSON"/);
  assert.doesNotMatch(runner, /"DENO_LOCK_SHA256"/);
});

test("CI executes the real hardened Docker bundle twice and seals the result", () => {
  const jobStart = ciWorkflow.indexOf("  hotfix-bundle-smoke:");
  const databaseStart = ciWorkflow.indexOf("\n  database:", jobStart);
  assert.notEqual(jobStart, -1, "missing hotfix-bundle-smoke job");
  assert.notEqual(databaseStart, -1, "missing hotfix-bundle-smoke boundary");
  const job = ciWorkflow.slice(jobStart, databaseStart);
  assert.match(job, /timeout-minutes: 20/);
  for (const [key, immutableValue] of Object.entries({
    HOTFIX_SHA: "e40eb0c2cc81c27fbf8f23e8671136f9dfc6f282",
    EDGE_RUNTIME_IMAGE:
      "ghcr.io/supabase/edge-runtime:v1.74.3@sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c",
    EDGE_RUNTIME_INDEX_DIGEST: "sha256:c52405002a890ca9fcf77978671c57f3a988e03174afb277f84ac65bc917013c",
    EDGE_RUNTIME_AMD64_DIGEST: "sha256:cc355c3d0e9c063a351cad56d1c4c52a3c4d85aff4e1fad9d91688e75f9aad09",
  })) {
    assert.equal(exactEnvValue(job, key), immutableValue);
    assert.equal(exactEnvValue(mainWorkflow, key), immutableValue);
  }
  assertOrdered(job, [
    "Prepare the production-mode candidate input for the Docker smoke",
    "Verify and pull the immutable runtime for the Docker smoke",
    "Exercise the hardened online Docker bundle boundary",
    "Exercise the hardened offline Docker rebuild boundary",
    "Verify and report the bounded raw ESZIP sizes",
    "Seal the byte-identical Docker smoke builds",
  ]);
  assert.equal((job.match(/--user "\$\(id -u\):\$\(id -g\)"/g) ?? []).length, 2);
  assert.equal((job.match(/--cap-drop ALL --security-opt no-new-privileges/g) ?? []).length, 2);
  assert.equal((job.match(/--env HOME=\/tmp --env DENO_DIR=\/deno-cache/g) ?? []).length, 2);
  assert.equal((job.match(/--env JSR_URL=file:\/\/\/workspace\/\.g12-jsr\//g) ?? []).length, 2);
  assert.match(job, /--network bridge/);
  assert.match(job, /--network none/);
  assert.match(job, /staging-cms-public-hotfix\.mjs seal-candidate/);
  assert.doesNotMatch(job, /\$\{\{\s*secrets\.|environment:/);

  for (const [name, network, mode] of [
    ["Exercise the hardened online Docker bundle boundary", "bridge", "online default"],
    ["Exercise the hardened offline Docker rebuild boundary", "none", "offline none"],
  ]) {
    const step = stepBody(ciWorkflow, name);
    assert.match(step, /install -d -m 700/);
    assert.match(step, new RegExp(`--network ${network} --read-only`));
    assert.match(step, /--tmpfs \/tmp:rw,nosuid,nodev,size=67108864,mode=1777/);
    assert.match(step, /\/bundle-input:\/workspace:ro/);
    assert.match(step, /:\/output:rw/);
    assert.match(step, /:\/deno-cache:rw/);
    assert.match(step, /staging-cms-public-hotfix-bundle\.sh:\/g12-builder\.sh:ro/);
    assert.match(step, /--env G12_PLATFORM=linux\/amd64/);
    assert.match(step, /jq -r \.jsrMirror\.manifestSha256/);
    assert.match(step, /--env G12_JSR_MIRROR_TREE_SHA256="\$jsr_tree"/);
    assert.match(step, /--env G12_JSR_MIRROR_FILE_COUNT="\$jsr_count"/);
    assert.match(step, /--env G12_JSR_MIRROR_BYTES="\$jsr_bytes"/);
    assert.match(step, new RegExp(`/g12-builder\\.sh ${mode}`));
  }
});

test("both candidate paths prove and report the exact bounded raw ESZIP size before sealing", () => {
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes, 64 * 1024 * 1024);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes, 20 * 1024 * 1024);
  assert.ok(
    STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes < STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes,
  );
  for (const [workflow, prefix, sealName] of [
    [mainWorkflow, "g12", "Seal only byte-identical online and network-disabled builds"],
    [ciWorkflow, "g12-smoke", "Seal the byte-identical Docker smoke builds"],
  ]) {
    assertOrdered(workflow, ["Verify and report the bounded raw ESZIP sizes", sealName]);
    const step = stepBody(workflow, "Verify and report the bounded raw ESZIP sizes");
    assert.match(step, /maximum_raw_eszip_bytes=67108864/);
    assert.doesNotMatch(step, /maximum_raw_eszip_bytes=134217728/);
    assert.match(step, new RegExp(`online_eszip="\\$RUNNER_TEMP/${prefix}-online/output\\.eszip"`));
    assert.match(step, new RegExp(`offline_eszip="\\$RUNNER_TEMP/${prefix}-offline/output\\.eszip"`));
    assert.match(step, /stat -c %s -- "\$online_eszip"/);
    assert.match(step, /stat -c %s -- "\$offline_eszip"/);
    assert.match(step, /\$1 == "RAW_ESZIP_BYTES" \{ count \+= 1; value = \$2 \}/);
    assert.match(step, /test "\$online_bytes" = "\$online_attested_bytes"/);
    assert.match(step, /test "\$offline_bytes" = "\$offline_attested_bytes"/);
    assert.match(step, /test "\$online_bytes" = "\$offline_bytes"/);
    assert.match(step, /g12\.staging\.cms_public_hotfix\.raw_eszip_boundary/);
    assertOrdered(step, [
      "g12.staging.cms_public_hotfix.raw_eszip_boundary",
      'test "$online_bytes" -le "$maximum_raw_eszip_bytes"',
    ]);
    assert.doesNotMatch(step, /\$\{\{\s*secrets\./);
  }
});

test("offline rebuild copies only npm into a fresh cache and proves JSR never used remote", () => {
  for (const [workflow, name, prefix] of [
    [mainWorkflow, "Rebuild offline with Docker networking disabled", "g12"],
    [ciWorkflow, "Exercise the hardened offline Docker rebuild boundary", "g12-smoke"],
  ]) {
    const step = stepBody(workflow, name);
    assertOrdered(step, [
      `install -d -m 700 "$RUNNER_TEMP/${prefix}-offline" "$RUNNER_TEMP/${prefix}-offline-cache"`,
      `online_remote="$RUNNER_TEMP/${prefix}-online-cache/remote"`,
      'if ! online_remote_entry="$(find "$online_remote" -mindepth 1 -print -quit)"; then',
      'test -z "$online_remote_entry"',
      `source_dir="$RUNNER_TEMP/${prefix}-online-cache/npm"`,
      'test -d "$source_dir"',
      'test ! -L "$source_dir"',
      'if ! source_entry="$(find "$source_dir" -mindepth 1 -maxdepth 1 -print -quit)"; then',
      'test -n "$source_entry"',
      `if ! offline_entry="$(find "$RUNNER_TEMP/${prefix}-offline-cache" -mindepth 1 -maxdepth 1 -print -quit)"; then`,
      'test -z "$offline_entry"',
      "cp -a",
      `if ! offline_names="$(find "$RUNNER_TEMP/${prefix}-offline-cache" -mindepth 1 -maxdepth 1 -printf '%f\\n')"; then`,
      'test "$offline_names" = npm',
      "docker run",
    ]);
    assert.match(step, new RegExp(`cp -a -- "\\$source_dir" "\\$RUNNER_TEMP/${prefix}-offline-cache/"`));
    assert.doesNotMatch(step, /for cache_dir|\b(?:registries|gen)\b/);
    assert.doesNotMatch(step, /online-cache\/\."/);
    assert.doesNotMatch(step, /test[^\n]*\$\(find/);
    assert.match(step, /--network none --read-only/);
    assert.match(step, /--env JSR_URL=file:\/\/\/workspace\/\.g12-jsr\//);
  }
});

test("watchdog snapshots M/C/R before artifacts and treats an empty snapshot as a no-op", () => {
  assertOrdered(watchdogWorkflow, [
    "Recover the HMAC main state independently of artifacts",
    "Recover the candidate-intent variable independently of artifacts",
    "Recover the rollback-intent variable independently of artifacts",
    "Classify the authoritative remote marker snapshot",
    "Resolve the complete exact parent artifact inventory",
  ]);
  const classifier = stepBody(watchdogWorkflow, "Classify the authoritative remote marker snapshot");
  assert.match(classifier, /MAIN_PRESENT.*CANDIDATE_PRESENT.*ROLLBACK_PRESENT/s);
  assert.match(classifier, /echo 'required=false'/);
  assert.match(classifier, /echo 'mode=complete'/);
  const resolver = stepBody(watchdogWorkflow, "Resolve the complete exact parent artifact inventory");
  assert.match(resolver, /if: steps\.marker_context\.outputs\.required == 'true'/);
});

test("watchdog never rehydrates absent main or candidate markers from historical artifacts", () => {
  const puts = [
    ...watchdogWorkflow.matchAll(/recovery-state-store\.mjs put[\s\S]{0,220}?--kind ([^\s]+)/g),
  ].map((match) => match[1]);
  assert.deepEqual(puts, ["staging-cms-public-hotfix-rollback-intent"]);
  assert.doesNotMatch(
    watchdogWorkflow,
    /recovery-state-store\.mjs put[\s\S]{0,220}?--kind staging-cms-public-hotfix(?:\s|$)/,
  );
  assert.doesNotMatch(
    watchdogWorkflow,
    /recovery-state-store\.mjs put[\s\S]{0,220}?--kind staging-cms-public-hotfix-candidate-intent/,
  );
  assert.doesNotMatch(runner, /G12_STAGING_CMS_PUBLIC_HOTFIX_PREDECESSOR_ARTIFACT_UNBOUND/);
  assert.match(runner, /G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_RUN_NAME_REFUSED/);
});

test("terminal certificates are verified before interruption-safe cleanup", () => {
  assertOrdered(watchdogWorkflow, [
    "Revalidate a terminal certificate and fresh live state before resumed cleanup",
    "Resume only the remaining terminal compare-and-clears",
    "Prove the staging recovery fence is empty after resumed cleanup",
  ]);
  const resumed = stepBody(watchdogWorkflow, "Resume only the remaining terminal compare-and-clears");
  assertOrdered(resumed, [
    'if [ "$CLEANUP_MODE" = restored-cleanup ]; then',
    "--kind staging-cms-public-hotfix \\",
    "fi",
    "--kind staging-cms-public-hotfix-candidate-intent \\",
    'if [ "$CLEANUP_MODE" = restored-cleanup ]; then',
    "--kind staging-cms-public-hotfix-rollback-intent \\",
    "else",
    "--kind staging-cms-public-hotfix \\",
  ]);
  const completed = stepBody(watchdogWorkflow, "Clear terminal recovery state in interruption-safe order");
  assertOrdered(completed, [
    "--kind staging-cms-public-hotfix \\",
    "--kind staging-cms-public-hotfix-candidate-intent \\",
    "--kind staging-cms-public-hotfix-rollback-intent \\",
  ]);
  assert.match(runner, /async function verifyTerminalCleanup\(\)/);
  const verifier = runner.slice(
    runner.indexOf("async function verifyTerminalCleanup()"),
    runner.indexOf("async function writeTerminalEvidence()"),
  );
  assert.match(verifier, /assertRemoteTerminalCleanupDomain/);
  assert.match(verifier, /verifyHotfixProbeProof/);
  assert.match(verifier, /stableLiveRead/);
  assert.match(verifier, /verifiedDirectoryRoot\(argument\("terminal-artifact"\)\)/);
  assert.match(verifier, /findUnique\(terminalRoot, "g12-hotfix-probe-proof\.json"\)/);
  assert.match(verifier, /executor: proofExecutor/);
  assert.doesNotMatch(verifier, /Date\.now\(\)|proofAgeMs/);
});

test("watchdog routes terminal retries away from every recovery mutation", () => {
  const routing = stepBody(watchdogWorkflow, "Select recovery or certified terminal cleanup");
  assert.match(
    routing,
    /INITIAL_MODE.*ROLLBACK_PRESENT.*RECOVERY_TERMINAL_PRESENT[\s\S]*mode=restored-cleanup/s,
  );
  assert.match(routing, /INITIAL_MODE" = restored-cleanup[\s\S]*test "\$RECOVERY_TERMINAL_PRESENT" = true/);
  for (const name of [
    "Observe the exact live state before deciding recovery",
    "Preserve ambiguous baseline plus candidate intent for manual reconciliation",
    "Refuse every unowned live classification",
    "Prepare a rollback intent only while the exact candidate is live",
    "Resolve the exact rollback evidence owner across watchdog retries",
    "Select only a provable baseline or restored terminal outcome",
  ])
    assert.match(
      stepBody(watchdogWorkflow, name),
      /steps\.execution_context\.outputs\.mode == 'recovery'/,
      name,
    );
});

test("rollback PATCH remains single-owner and later watchdog attempts only reconcile", () => {
  const restoreStep = stepBody(watchdogWorkflow, "Restore or reconcile the exact baseline transition");
  assert.match(restoreStep, /ROLLBACK_INTENT_PREPARED: \$\{\{ steps\.prepare_rollback\.outcome \}\}/);
  assert.match(
    restoreStep,
    /if \[ "\$ROLLBACK_INTENT_PREPARED" = success \]; then\s+args\+=\(--allow-patch true\)/,
  );
  const restore = runner.slice(
    runner.indexOf("async function restoreBaseline()"),
    runner.indexOf("async function observeState()"),
  );
  assert.match(restore, /preparedBy: executor/);
  assertOrdered(restore, [
    'const allowPatchArgument = argument("allow-patch", { required: false })',
    "const patchAuthorization = verifyHotfixIntent(",
    "preparedBy: executor",
    "executeHotfixRollbackTransition({",
    "intentOwnedByExecutor: patchAuthorization.valid",
    "patch: async () =>",
    "await patchExactBundle(",
    "observe: () => observeTransition(",
  ]);
  assert.match(
    restore,
    /if \(!allowPatch \|\| !patchAuthorization\.valid\)[\s\S]*G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_PATCH_REPLAY_REFUSED/,
  );
  assert.match(restore, /completionMode: transition\.completionMode/);
});

test("watchdog artifact resolution tolerates retry receipts without mixing terminal chains", () => {
  const resolver = runner.slice(
    runner.indexOf("async function fetchWatchdogArtifacts("),
    runner.indexOf("async function resolveWatchdogArtifacts()"),
  );
  assert.doesNotMatch(resolver, /receiptMatches\.length > 1/);
  assert.match(
    resolver,
    /new Set\(receiptMatches\.map\(\(entry\) => entry\.match\[1\]\)\)\.size !==\s*receiptMatches\.length/,
  );
  assert.match(resolver, /const rollbackReceipts = await Promise\.all\(/);
  assert.match(resolver, /receiptArtifactId: match\[2\]/);
  assert.match(resolver, /selectHotfixWatchdogArtifactChain\(\{ rollbackReceipts, recoveryTerminals \}\)/);
  assert.doesNotMatch(resolver, /receipt\.owner\.runAttempt <= recoveryTerminal\.owner\.runAttempt/);
  const naming = stepBody(watchdogWorkflow, "Bind the terminal artifact name to its exact receipt chain");
  assert.match(
    naming,
    /staging-cms-public-hotfix-recovered-\$GITHUB_RUN_ID-\$GITHUB_RUN_ATTEMPT-receipt-\$ROLLBACK_RECEIPT_ID/,
  );
  const upload = stepBody(watchdogWorkflow, "Upload terminal recovery evidence before clearing any state");
  assert.match(upload, /name: \$\{\{ steps\.terminal_artifact_name\.outputs\.name \}\}/);
  const artifactVerifier = runner.slice(
    runner.indexOf("async function verifyRunArtifact()"),
    runner.indexOf("async function fetchResolvedRunArtifacts("),
  );
  assert.match(
    artifactVerifier,
    /kind === "recoveryTerminal"[\s\S]*workflowPath === STAGING_CMS_PUBLIC_HOTFIX\.watchdogPath[\s\S]*Boolean\(boundRecoveryTerminal\)[\s\S]*boundRecoveryTerminal\[1\] === expectedReceiptArtifactId/,
  );
  const metadataVerifier = stepBody(watchdogWorkflow, "Verify terminal recovery artifact metadata");
  assert.match(
    metadataVerifier,
    /--receipt-artifact-id "\$\{\{ steps\.final_rollback_artifacts\.outputs\.rollback_receipt_id \}\}"/,
  );
});

test("baseline recovery remains an explicit no-PATCH terminal with only main-state cleanup", () => {
  const selection = stepBody(
    watchdogWorkflow,
    "Select only a provable baseline or restored terminal outcome",
  );
  assert.match(selection, /INITIAL_CLASSIFICATION" = baseline/);
  assert.match(selection, /echo 'outcome=baseline'/);
  const cleanup = stepBody(watchdogWorkflow, "Clear terminal recovery state in interruption-safe order");
  const baselineBranch = cleanup.slice(cleanup.lastIndexOf("else"));
  assert.match(baselineBranch, /--kind staging-cms-public-hotfix \\/);
  assert.doesNotMatch(baselineBranch, /candidate-intent|rollback-intent/);
});
