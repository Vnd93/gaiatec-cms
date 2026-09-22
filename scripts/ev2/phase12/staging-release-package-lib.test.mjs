import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { ALL_EDGE_RUNTIME_SMOKE } from "./all-edge-runtime-smoke-lib.mjs";
import {
  evaluateStagingReleasePackageManifest,
  STAGING_RELEASE_PACKAGE,
  verifyStagingReleasePackage,
  writeStagingReleasePackage,
} from "./staging-release-package-lib.mjs";

const candidateSha = "a".repeat(40);

async function writeFixtureFile(root, path, contents = `${path}\n`) {
  const file = join(root, ...path.split("/"));
  await mkdir(join(file, ".."), { recursive: true });
  await writeFile(file, contents, "utf8");
}

async function createEdgeFixture(directory) {
  for (const path of [
    "manifest.json",
    "artifact-files.sha256",
    "source/all-edge-runtime-smoke-input.json",
    "evidence/build-attestation.env",
    ...ALL_EDGE_RUNTIME_SMOKE.functions.flatMap((slug) => [`raw/${slug}.eszip`, `deployable/${slug}.ezbr`]),
  ]) {
    await writeFixtureFile(directory, path);
  }
}

async function fixture(profile = "full-release") {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-release-package-"));
  const components = {};
  const definitions = {
    controls: STAGING_RELEASE_PACKAGE.controlFiles,
    frontend: STAGING_RELEASE_PACKAGE.frontendFiles,
    database: ["database-release-staging.g12db"],
  };
  const required = {
    "frontend-only": ["controls", "frontend"],
    "edge-only": ["controls", "frontend", "edge"],
    "database-auth": ["controls", "frontend", "database"],
    "full-release": ["controls", "frontend", "edge", "database"],
  }[profile];
  for (const label of required) {
    const directory = join(root, `source-${label}`);
    components[label] = directory;
    if (label === "edge") {
      await createEdgeFixture(directory);
      continue;
    }
    for (const path of definitions[label]) {
      await writeFixtureFile(directory, path, `${label}:${path}\n`);
    }
  }
  return { root, components };
}

for (const profile of ["frontend-only", "edge-only", "database-auth", "full-release"]) {
  test(`writes and verifies one deterministic ${profile} release artifact`, async () => {
    const { root, components } = await fixture(profile);
    try {
      const first = await writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(root, "package-one"),
        candidateSha,
        releaseProfile: profile,
        runId: "123",
        runAttempt: 1,
      });
      const second = await writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(root, "package-two"),
        candidateSha,
        releaseProfile: profile,
        runId: "123",
        runAttempt: 1,
      });
      assert.equal(first.manifestSha256, second.manifestSha256);
      assert.deepEqual(first.manifest, second.manifest);
      const verified = await verifyStagingReleasePackage({
        packageDirectory: join(root, "package-one"),
        outputDirectory: join(root, "materialized"),
        candidateSha,
        releaseProfile: profile,
        runId: "123",
        runAttempt: 1,
      });
      assert.equal(verified.manifestSha256, first.manifestSha256);
      assert.equal(
        await readFile(join(root, "materialized", STAGING_RELEASE_PACKAGE.manifestFile), "utf8"),
        await readFile(join(root, "package-one", STAGING_RELEASE_PACKAGE.manifestFile), "utf8"),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("refuses a component set that does not exactly match the selected profile", async () => {
  const { root, components } = await fixture("full-release");
  try {
    await assert.rejects(
      writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "frontend-only",
        runId: "123",
        runAttempt: 1,
      }),
      /component_sources_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("tampering after sealing is rejected", async () => {
  const { root, components } = await fixture("full-release");
  try {
    await writeStagingReleasePackage({
      componentDirectories: components,
      outputDirectory: join(root, "package"),
      candidateSha,
      releaseProfile: "full-release",
      runId: "123",
      runAttempt: 1,
    });
    const bundle = join(root, "package", "edge", "deployable", `${ALL_EDGE_RUNTIME_SMOKE.functions[0]}.ezbr`);
    await chmod(bundle, 0o600);
    await writeFile(bundle, "tampered\n");
    await assert.rejects(
      verifyStagingReleasePackage({
        packageDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "full-release",
        runId: "123",
        runAttempt: 1,
      }),
      /edge_identity_mismatch/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("unexpected package entries fail closed", async () => {
  const { root, components } = await fixture("frontend-only");
  try {
    await writeStagingReleasePackage({
      componentDirectories: components,
      outputDirectory: join(root, "package"),
      candidateSha,
      releaseProfile: "frontend-only",
      runId: "123",
      runAttempt: 1,
    });
    await writeFile(join(root, "package", "unexpected.txt"), "unexpected\n");
    await assert.rejects(
      verifyStagingReleasePackage({
        packageDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "frontend-only",
        runId: "123",
        runAttempt: 1,
      }),
      /package_contents_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("symlinks are never accepted as release bytes", async (context) => {
  const { root, components } = await fixture("edge-only");
  try {
    const target = join(components.edge, "manifest.json");
    const link = join(components.edge, "linked-manifest.json");
    try {
      await symlink(target, link, "file");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
        context.skip("Windows symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    await assert.rejects(
      writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "edge-only",
        runId: "123",
        runAttempt: 1,
      }),
      /symlink_forbidden/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("manifest evaluation rejects profile and identity substitution", async () => {
  const { root, components } = await fixture("frontend-only");
  try {
    const result = await writeStagingReleasePackage({
      componentDirectories: components,
      outputDirectory: join(root, "package"),
      candidateSha,
      releaseProfile: "frontend-only",
      runId: "123",
      runAttempt: 1,
    });
    const changed = structuredClone(result.manifest);
    changed.releaseProfile = "full-release";
    const evaluation = evaluateStagingReleasePackageManifest(changed, {
      candidateSha,
      releaseProfile: "frontend-only",
      runId: "123",
      runAttempt: 1,
    });
    assert.equal(evaluation.valid, false);
    assert.ok(evaluation.violations.includes("components_invalid"));
    assert.ok(evaluation.violations.includes("release_profile_mismatch"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("verification requires the exact canonical manifest serialization", async () => {
  const { root, components } = await fixture("frontend-only");
  try {
    await writeStagingReleasePackage({
      componentDirectories: components,
      outputDirectory: join(root, "package"),
      candidateSha,
      releaseProfile: "frontend-only",
      runId: "123",
      runAttempt: 1,
    });
    const manifestPath = join(root, "package", STAGING_RELEASE_PACKAGE.manifestFile);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    await chmod(manifestPath, 0o600);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await assert.rejects(
      verifyStagingReleasePackage({
        packageDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "frontend-only",
        runId: "123",
        runAttempt: 1,
      }),
      /manifest_canonical_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Edge release components require the exact all-function artifact layout", async () => {
  assert.equal(ALL_EDGE_RUNTIME_SMOKE.functions.length, 34);
  const { root, components } = await fixture("edge-only");
  try {
    const missing = ALL_EDGE_RUNTIME_SMOKE.functions[0];
    await rm(join(components.edge, "raw", `${missing}.eszip`));
    await writeFixtureFile(components.edge, "raw/not-a-release-function.eszip");
    await assert.rejects(
      writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "edge-only",
        runId: "123",
        runAttempt: 1,
      }),
      /edge_bundle_inventory_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("database release components contain exactly one root g12db payload", async () => {
  const { root, components } = await fixture("database-auth");
  try {
    await writeFixtureFile(components.database, "unexpected.txt");
    await assert.rejects(
      writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(root, "package"),
        candidateSha,
        releaseProfile: "database-auth",
        runId: "123",
        runAttempt: 1,
      }),
      /database_contents_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical output resolution blocks a symlink or junction ancestor from escaping overlap checks", async (context) => {
  const { root, components } = await fixture("frontend-only");
  const alias = join(root, "frontend-alias");
  try {
    try {
      await symlink(components.frontend, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
        context.skip("Windows junction privilege is unavailable");
        return;
      }
      throw error;
    }
    await assert.rejects(
      writeStagingReleasePackage({
        componentDirectories: components,
        outputDirectory: join(alias, "nested-output"),
        candidateSha,
        releaseProfile: "frontend-only",
        runId: "123",
        runAttempt: 1,
      }),
      /output_path_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("canonical materialization resolution blocks a symlink or junction ancestor into the package", async (context) => {
  const { root, components } = await fixture("frontend-only");
  const packageDirectory = join(root, "package");
  const alias = join(root, "package-alias");
  try {
    await writeStagingReleasePackage({
      componentDirectories: components,
      outputDirectory: packageDirectory,
      candidateSha,
      releaseProfile: "frontend-only",
      runId: "123",
      runAttempt: 1,
    });
    try {
      await symlink(packageDirectory, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error?.code)) {
        context.skip("Windows junction privilege is unavailable");
        return;
      }
      throw error;
    }
    await assert.rejects(
      verifyStagingReleasePackage({
        packageDirectory,
        outputDirectory: join(alias, "nested-output"),
        candidateSha,
        releaseProfile: "frontend-only",
        runId: "123",
        runAttempt: 1,
      }),
      /output_path_invalid/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

for (const cli of ["write-staging-release-package.mjs", "verify-staging-release-package.mjs"]) {
  test(`${cli} refuses unknown and duplicate flags`, () => {
    const script = resolve("scripts", "ev2", "phase12", cli);
    const unknown = spawnSync(process.execPath, [script, "--unknown", "value"], {
      encoding: "utf8",
    });
    assert.notEqual(unknown.status, 0);
    assert.match(unknown.stderr, /unknown argument --unknown/u);

    const duplicate = spawnSync(
      process.execPath,
      [script, "--candidate", candidateSha, "--candidate", candidateSha],
      { encoding: "utf8" },
    );
    assert.notEqual(duplicate.status, 0);
    assert.match(duplicate.stderr, /duplicate argument --candidate/u);
  });
}
