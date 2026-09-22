import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  canonicalStagingEnvironmentSnapshot,
  captureStagingEnvironmentSnapshot,
  evaluateStagingEnvironmentSnapshot,
  parseLinkedMigrationList,
  parseSupabaseFunctionList,
  STAGING_ENVIRONMENT_SNAPSHOT,
  verifyStagingEnvironmentSnapshot,
} from "./staging-environment-snapshot-lib.mjs";

const candidateSha = "a".repeat(40);
const controlSha = "b".repeat(40);
const pagesDeployment = {
  id: "848be723-25d4-4d3a-ae00-907e77fd98b6",
  branch: "ev2-g17-canary",
  commitSha: "e00e05ec696d206a046925281d9c2f06d060df5d",
  createdOn: "2026-09-22T11:00:00.000Z",
};
const generatedAt = "2026-09-22T12:00:00.000Z";
const migrationOutput = `
  Local          | Remote         | Time (UTC)
 ----------------|----------------|---------------------
  20260901000000 | 20260901000000 | 2026-09-01 00:00:00
                 | 20260902000000 | 2026-09-02 00:00:00
  20260903000000 |                | 2026-09-03 00:00:00
`;
const functionsOutput = JSON.stringify([
  { name: "cms-system", status: "ACTIVE", version: 8, verify_jwt: true, ignored: "safe" },
  { slug: "cms-public", status: "active", version: "7", verify_jwt: false },
]);

function expected() {
  return {
    candidateSha,
    controlSha,
    projectRef: STAGING_ENVIRONMENT_SNAPSHOT.projectRef,
    pagesDeployment,
  };
}

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-environment-snapshot-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const outputPath = join(root, "snapshot.json");
  const calls = [];
  const runCommand = (arguments_) => {
    calls.push(arguments_);
    if (arguments_[0] === "--version") return "2.116.0\n";
    if (arguments_[0] === "migration") return migrationOutput;
    if (arguments_[0] === "functions") return functionsOutput;
    throw new Error("unexpected command");
  };
  const capture = await captureStagingEnvironmentSnapshot(
    { ...expected(), outputPath, generatedAt },
    runCommand,
  );
  return { root, outputPath, calls, snapshot: capture.snapshot, snapshotSha256: capture.snapshotSha256 };
}

test("migration parser canonicalizes linked rows, including one-sided drift", () => {
  const parsed = parseLinkedMigrationList(migrationOutput.replaceAll("\n", "\r\n"));
  assert.equal(parsed.length, 3);
  assert.ok(parsed.some((entry) => entry.localVersion === null));
  assert.ok(parsed.some((entry) => entry.remoteVersion === null));
  for (const entry of parsed) assert.match(entry.sha256, /^[a-f0-9]{64}$/);

  const unicode = `Local │ Remote │ Time (UTC)\n──────┼────────┼──────────\n20260901000000 │ 20260901000000 │ 2026-09-01 00:00:00`;
  assert.equal(parseLinkedMigrationList(unicode).length, 1);
});

test("migration parser fails closed on banners, ANSI, duplicates and malformed rows", () => {
  const invalid = [
    `Connecting to postgres://secret\n${migrationOutput}`,
    `\u001b[31m${migrationOutput}`,
    `${migrationOutput}\n20260901000000 | 20260901000000 | 2026-09-01 00:00:00`,
    `Local | Remote | Time (UTC)\nnot-a-version | 20260901000000 | 2026-09-01 00:00:00`,
    `Local | Remote | Time (UTC)`,
  ];
  for (const value of invalid)
    assert.throws(() => parseLinkedMigrationList(value), /STAGING_ENVIRONMENT_SNAPSHOT_REFUSED/);
});

test("function parser emits only sorted credential-free remote identity fields", () => {
  const parsed = parseSupabaseFunctionList(functionsOutput);
  assert.deepEqual(
    parsed.map(({ name, status, version, verifyJwt }) => ({ name, status, version, verifyJwt })),
    [
      { name: "cms-public", status: "ACTIVE", version: 7, verifyJwt: false },
      { name: "cms-system", status: "ACTIVE", version: 8, verifyJwt: true },
    ],
  );
  assert.doesNotMatch(JSON.stringify(parsed), /ignored/);
  assert.throws(
    () =>
      parseSupabaseFunctionList(
        JSON.stringify([
          { name: "same", status: "ACTIVE", version: 1, verify_jwt: true },
          { name: "same", status: "ACTIVE", version: 2, verify_jwt: true },
        ]),
      ),
    /function_name_duplicate/,
  );
  assert.throws(
    () => parseSupabaseFunctionList(JSON.stringify([{ name: "unsafe", status: "ACTIVE", version: 1 }])),
    /function_record_invalid/,
  );
});

test("capture pins Supabase 2.116.0 and uses only the documented read-only commands", async (context) => {
  const { calls, outputPath, snapshot, snapshotSha256 } = await fixture(context);
  assert.deepEqual(calls, [
    ["--version"],
    [...STAGING_ENVIRONMENT_SNAPSHOT.migrationCommand],
    [...STAGING_ENVIRONMENT_SNAPSHOT.functionsCommand],
  ]);
  const content = await readFile(outputPath, "utf8");
  assert.equal(content, canonicalStagingEnvironmentSnapshot(snapshot));
  assert.deepEqual(evaluateStagingEnvironmentSnapshot(snapshot, expected()), {
    valid: true,
    violations: [],
  });
  assert.doesNotMatch(content, /https?:\/\/|postgres(?:ql)?:\/\/|secret|token|password/i);
  assert.equal(snapshot.supabase.cliVersion, "2.116.0");
  assert.equal(STAGING_ENVIRONMENT_SNAPSHOT.fileName, "staging-remote-environment-snapshot.json");
  assert.match(snapshot.supabase.migrations.sha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.supabase.functions.sha256, /^[a-f0-9]{64}$/);
  assert.match(snapshot.pages.sha256, /^[a-f0-9]{64}$/);
  assert.match(snapshotSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.coverage, {
    databaseMigrationIdentities: true,
    functionInventoryMetadata: true,
    pagesDeploymentIdentity: true,
    authConfiguration: false,
    configurationValues: false,
    functionBundleBytes: false,
    stateDependentGateReuseAllowed: false,
  });

  const malformed = structuredClone(snapshot);
  malformed.supabase.functions.entries[0] = null;
  const malformedResult = evaluateStagingEnvironmentSnapshot(malformed, expected());
  assert.equal(malformedResult.valid, false);
  assert.ok(malformedResult.violations.includes("function_entry_keys_invalid"));

  await assert.rejects(
    () =>
      captureStagingEnvironmentSnapshot(
        { ...expected(), outputPath: join(context.root ?? "", "unused"), generatedAt },
        () => "2.117.0\n",
      ),
    /supabase_cli_version_invalid/,
  );
});

test("snapshot freshness is bounded only at capture-time consumption", async (context) => {
  const { snapshot } = await fixture(context);
  assert.deepEqual(
    evaluateStagingEnvironmentSnapshot(snapshot, {
      ...expected(),
      observedAt: "2026-09-22T12:14:59.000Z",
    }),
    { valid: true, violations: [] },
  );
  const stale = evaluateStagingEnvironmentSnapshot(snapshot, {
    ...expected(),
    observedAt: "2026-09-22T12:15:01.000Z",
  });
  assert.equal(stale.valid, false);
  assert.ok(stale.violations.includes("snapshot_stale"));

  const future = evaluateStagingEnvironmentSnapshot(snapshot, {
    ...expected(),
    observedAt: "2026-09-22T11:59:59.000Z",
  });
  assert.equal(future.valid, false);
  assert.ok(future.violations.includes("snapshot_generated_in_future"));

  const broadened = structuredClone(snapshot);
  broadened.coverage.authConfiguration = true;
  const coverage = evaluateStagingEnvironmentSnapshot(broadened, expected());
  assert.equal(coverage.valid, false);
  assert.ok(coverage.violations.includes("snapshot_coverage_invalid"));
});

test("verifier rejects substitutions, altered hashes, extra fields and non-canonical bytes", async (context) => {
  const { root, outputPath, snapshot } = await fixture(context);
  const verification = await verifyStagingEnvironmentSnapshot({
    snapshotPath: outputPath,
    expected: expected(),
  });
  assert.equal(verification.snapshot.event, STAGING_ENVIRONMENT_SNAPSHOT.event);
  assert.match(verification.snapshotSha256, /^[a-f0-9]{64}$/);
  const expectedCases = [
    { ...expected(), candidateSha: "c".repeat(40) },
    { ...expected(), controlSha: "c".repeat(40) },
    { ...expected(), projectRef: "wrongprojectrefvalue" },
    { ...expected(), pagesDeployment: { ...pagesDeployment, branch: "feature" } },
    {
      ...expected(),
      pagesDeployment: {
        ...pagesDeployment,
        id: "948be723-25d4-4d3a-ae00-907e77fd98b6",
      },
    },
    {
      ...expected(),
      pagesDeployment: { ...pagesDeployment, commitSha: "c".repeat(40) },
    },
  ];
  for (const [index, changedExpected] of expectedCases.entries()) {
    await assert.rejects(
      () => verifyStagingEnvironmentSnapshot({ snapshotPath: outputPath, expected: changedExpected }),
      /STAGING_ENVIRONMENT_SNAPSHOT_REFUSED/,
      `expected substitution ${index}`,
    );
  }

  const alteredHash = join(root, "altered-hash.json");
  await writeFile(
    alteredHash,
    canonicalStagingEnvironmentSnapshot({
      ...snapshot,
      pages: { ...snapshot.pages, sha256: "f".repeat(64) },
    }),
  );
  await assert.rejects(
    () => verifyStagingEnvironmentSnapshot({ snapshotPath: alteredHash, expected: expected() }),
    /pages_deployment_hash_invalid/,
  );

  const extra = join(root, "extra.json");
  await writeFile(extra, canonicalStagingEnvironmentSnapshot({ ...snapshot, unexpected: true }));
  await assert.rejects(
    () => verifyStagingEnvironmentSnapshot({ snapshotPath: extra, expected: expected() }),
    /snapshot_keys_invalid/,
  );

  const nonCanonical = join(root, "noncanonical.json");
  await writeFile(nonCanonical, JSON.stringify(snapshot));
  await assert.rejects(
    () => verifyStagingEnvironmentSnapshot({ snapshotPath: nonCanonical, expected: expected() }),
    /snapshot_not_canonical/,
  );
});

test("writer refuses to replace an existing snapshot", async (context) => {
  const { outputPath } = await fixture(context);
  await assert.rejects(
    () =>
      captureStagingEnvironmentSnapshot({ ...expected(), outputPath, generatedAt }, (arguments_) => {
        if (arguments_[0] === "--version") return "2.116.0\n";
        if (arguments_[0] === "migration") return migrationOutput;
        return functionsOutput;
      }),
    /EEXIST/,
  );
});

test("verifier refuses a symlink snapshot", async (context) => {
  const { root, outputPath } = await fixture(context);
  const link = join(root, "snapshot-link.json");
  try {
    await symlink(outputPath, link, "file");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      context.skip("symlinks are unavailable on this platform");
      return;
    }
    throw error;
  }
  await assert.rejects(
    () => verifyStagingEnvironmentSnapshot({ snapshotPath: link, expected: expected() }),
    /snapshot_not_regular/,
  );
});

test("writer refuses a snapshot beneath a symlinked parent", async (context) => {
  const { root } = await fixture(context);
  const parentTarget = join(root, "real-parent");
  const parentLink = join(root, "linked-parent");
  await mkdir(parentTarget);
  try {
    await symlink(parentTarget, parentLink, "junction");
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error?.code)) {
      context.skip("directory links are unavailable on this platform");
      return;
    }
    throw error;
  }
  await assert.rejects(
    () =>
      captureStagingEnvironmentSnapshot(
        { ...expected(), outputPath: join(parentLink, "snapshot.json"), generatedAt },
        (arguments_) => {
          if (arguments_[0] === "--version") return "2.116.0\n";
          if (arguments_[0] === "migration") return migrationOutput;
          return functionsOutput;
        },
      ),
    /path_parent_invalid/,
  );
});
