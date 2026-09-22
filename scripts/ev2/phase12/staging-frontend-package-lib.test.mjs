import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sealProductionDistArchive, snapshotProductionDist } from "./production-dist-seal-lib.mjs";
import {
  evaluateStagingFrontendPackageProvenance,
  evaluateStagingFrontendProfile,
  STAGING_FRONTEND_PACKAGE,
  stagingFrontendArtifactName,
  verifyStagingFrontendPackage,
  writeStagingFrontendPackage,
} from "./staging-frontend-package-lib.mjs";

const candidateSha = "a".repeat(40);
const runId = "35731735256";
const runAttempt = 2;
const environment = {
  VITE_RELEASE: candidateSha,
  VITE_CMS_ENVIRONMENT: "staging",
  VITE_SUPABASE_URL: "https://glcqsosxwgmlhzgcsnzv.supabase.co",
  VITE_SUPABASE_ANON_KEY: "sb_publishable_staging_fixture_1234567890",
  VITE_TURNSTILE_SITE_KEY: "0x4AAAAAAAstaging-real-widget-key",
  VITE_GOOGLE_MAPS_KEY: "AIzaSyStagingMapsFixtureKey",
  VITE_CONTACT_CAPTCHA_ALWAYS: "true",
  VITE_EV2_DRAFT_V2_CANDIDATE: "false",
};

function provenanceFixture() {
  const profile = evaluateStagingFrontendProfile(environment, candidateSha).profile;
  const archiveIdentity = { bytes: 2048, sha256: "b".repeat(64) };
  const sealIdentity = { bytes: 1024, sha256: "c".repeat(64) };
  const seal = {
    schemaVersion: 2,
    event: "g12.production.dist.sealed",
    candidateSha,
    archiveFile: STAGING_FRONTEND_PACKAGE.archiveFile,
    archiveBytes: archiveIdentity.bytes,
    archiveSha256: archiveIdentity.sha256,
    treeSha256: "d".repeat(64),
    fileCount: 3,
    byteCount: 512,
  };
  const provenance = {
    schemaVersion: 1,
    event: "g12.staging.frontend.package_provenance",
    repository: "Vnd93/gaiatec-cms",
    workflow: { name: "CI", path: ".github/workflows/ci.yml" },
    controlSha: candidateSha,
    sourceRunId: runId,
    sourceRunAttempt: runAttempt,
    artifactName: stagingFrontendArtifactName(candidateSha, runId, runAttempt),
    profile,
    archive: {
      file: STAGING_FRONTEND_PACKAGE.archiveFile,
      bytes: archiveIdentity.bytes,
      sha256: archiveIdentity.sha256,
    },
    seal: {
      file: STAGING_FRONTEND_PACKAGE.sealFile,
      bytes: sealIdentity.bytes,
      sha256: sealIdentity.sha256,
    },
    dist: { treeSha256: seal.treeSha256, fileCount: seal.fileCount, byteCount: seal.byteCount },
  };
  const snapshot = {
    treeSha256: seal.treeSha256,
    fileCount: seal.fileCount,
    byteCount: seal.byteCount,
  };
  return { profile, archiveIdentity, sealIdentity, seal, provenance, snapshot };
}

function evaluatePackage(overrides = {}) {
  const fixture = provenanceFixture();
  return evaluateStagingFrontendPackageProvenance({
    provenance: fixture.provenance,
    expected: { candidateSha, runId, runAttempt },
    profile: fixture.profile,
    archiveIdentity: fixture.archiveIdentity,
    sealIdentity: fixture.sealIdentity,
    seal: fixture.seal,
    snapshot: fixture.snapshot,
    ...overrides,
  });
}

test("staging frontend profile is exact, deterministic and represented only by SHA-256 fingerprints", () => {
  const first = evaluateStagingFrontendProfile(environment, candidateSha);
  const second = evaluateStagingFrontendProfile({ ...environment }, candidateSha);
  assert.equal(first.valid, true);
  assert.deepEqual(second, first);
  assert.match(first.profile.sha256, /^[a-f0-9]{64}$/);
  for (const fingerprint of Object.values(first.profile.fingerprints))
    assert.match(fingerprint, /^[a-f0-9]{64}$/);

  const serialized = JSON.stringify(provenanceFixture().provenance);
  for (const key of [
    "VITE_SUPABASE_URL",
    "VITE_SUPABASE_ANON_KEY",
    "VITE_TURNSTILE_SITE_KEY",
    "VITE_GOOGLE_MAPS_KEY",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(environment[key].replaceAll(".", "\\.")));
  }
});

test("staging frontend profile rejects every wrong environment, missing value and test widget", () => {
  const cases = [
    ["release_invalid", { VITE_RELEASE: "b".repeat(40) }, candidateSha],
    ["candidate_sha_invalid", {}, "short"],
    ["environment_invalid", { VITE_CMS_ENVIRONMENT: "production" }, candidateSha],
    ["supabase_url_invalid", { VITE_SUPABASE_URL: "https://example.supabase.co" }, candidateSha],
    ["supabase_anon_key_invalid", { VITE_SUPABASE_ANON_KEY: "short" }, candidateSha],
    ["turnstile_site_key_invalid", { VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA" }, candidateSha],
    ["turnstile_site_key_invalid", { VITE_TURNSTILE_SITE_KEY: "" }, candidateSha],
    ["google_maps_key_invalid", { VITE_GOOGLE_MAPS_KEY: "" }, candidateSha],
    ["captcha_profile_invalid", { VITE_CONTACT_CAPTCHA_ALWAYS: "false" }, candidateSha],
    ["draft_profile_invalid", { VITE_EV2_DRAFT_V2_CANDIDATE: "true" }, candidateSha],
  ];
  for (const [violation, changes, sha] of cases) {
    const result = evaluateStagingFrontendProfile({ ...environment, ...changes }, sha);
    assert.ok(result.violations.includes(violation), violation);
  }
});

test("staging frontend package provenance binds the workflow, current profile, seal and archive", () => {
  const result = evaluatePackage();
  assert.deepEqual(result, {
    valid: true,
    violations: [],
    artifactName: stagingFrontendArtifactName(candidateSha, runId, runAttempt),
  });
});

test("staging frontend package provenance rejects adversarial substitutions and extensions", () => {
  const fixture = provenanceFixture();
  const changedProvenance = (change) => ({
    provenance: { ...fixture.provenance, ...change },
  });
  const cases = [
    ["provenance_keys_invalid", changedProvenance({ unexpected: true })],
    ["provenance_schema_invalid", changedProvenance({ schemaVersion: 2 })],
    ["provenance_event_invalid", changedProvenance({ event: "attacker" })],
    ["provenance_repository_invalid", changedProvenance({ repository: "attacker/repository" })],
    [
      "provenance_workflow_invalid",
      changedProvenance({ workflow: { name: "CI", path: ".github/workflows/other.yml" } }),
    ],
    ["provenance_sha_invalid", changedProvenance({ controlSha: "b".repeat(40) })],
    ["provenance_run_id_invalid", changedProvenance({ sourceRunId: "7" })],
    ["provenance_run_attempt_invalid", changedProvenance({ sourceRunAttempt: 3 })],
    ["provenance_artifact_name_invalid", changedProvenance({ artifactName: "substituted" })],
    [
      "profile_fingerprint_mismatch",
      changedProvenance({
        profile: {
          ...fixture.profile,
          fingerprints: {
            ...fixture.profile.fingerprints,
            VITE_SUPABASE_URL: "e".repeat(64),
          },
        },
      }),
    ],
    [
      "profile_fingerprint_keys_invalid",
      changedProvenance({
        profile: {
          ...fixture.profile,
          fingerprints: { ...fixture.profile.fingerprints, EXTRA: "f".repeat(64) },
        },
      }),
    ],
    [
      "profile_sha256_mismatch",
      changedProvenance({ profile: { ...fixture.profile, sha256: "f".repeat(64) } }),
    ],
    ["archive_binding_invalid", changedProvenance({ archive: { ...fixture.provenance.archive, bytes: 1 } })],
    [
      "seal_binding_invalid",
      changedProvenance({ seal: { ...fixture.provenance.seal, sha256: "f".repeat(64) } }),
    ],
    ["dist_binding_invalid", changedProvenance({ dist: { ...fixture.provenance.dist, fileCount: 4 } })],
    ["production_dist_seal_invalid", { seal: { ...fixture.seal, candidateSha: "b".repeat(40) } }],
    ["production_dist_seal_invalid", { seal: { ...fixture.seal, archiveSha256: "f".repeat(64) } }],
    ["materialized_dist_invalid", { snapshot: { ...fixture.snapshot, treeSha256: "f".repeat(64) } }],
  ];
  for (const [violation, overrides] of cases) {
    assert.ok(evaluatePackage(overrides).violations.includes(violation), violation);
  }
});

test("writer creates exactly three files and verifier materializes the exact sealed tree", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "g12-staging-frontend-package-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const dist = join(root, "dist");
  const source = join(root, "source");
  const packageDirectory = join(root, "package");
  const materialized = join(root, "materialized");
  await mkdir(join(dist, "assets"), { recursive: true });
  await mkdir(source);
  await writeFile(join(dist, "index.html"), "<main>staging</main>");
  await writeFile(join(dist, "assets", "app.js"), "console.log('staging')");
  await writeFile(
    join(dist, "release-manifest.json"),
    JSON.stringify({ schemaVersion: 1, release: candidateSha, files: [] }),
  );
  const archivePath = join(source, STAGING_FRONTEND_PACKAGE.archiveFile);
  const sealPath = join(source, STAGING_FRONTEND_PACKAGE.sealFile);
  let seal;
  if (process.platform === "win32") {
    const archived = spawnSync("tar", ["-cf", archivePath, "-C", dist, "."], { encoding: "utf8" });
    assert.equal(archived.status, 0, archived.stderr);
    const archiveBytes = await readFile(archivePath);
    seal = {
      ...(await snapshotProductionDist(dist, candidateSha)),
      schemaVersion: 2,
      archiveFile: STAGING_FRONTEND_PACKAGE.archiveFile,
      archiveBytes: archiveBytes.length,
      archiveSha256: createHash("sha256").update(archiveBytes).digest("hex"),
    };
  } else {
    seal = await sealProductionDistArchive(dist, archivePath, candidateSha);
  }
  await writeFile(sealPath, `${JSON.stringify(seal, null, 2)}\n`);

  const written = await writeStagingFrontendPackage({
    archivePath,
    sealPath,
    outputDirectory: packageDirectory,
    candidateSha,
    runId,
    runAttempt,
    environment,
  });
  assert.deepEqual(
    (await readdir(packageDirectory)).sort(),
    [
      STAGING_FRONTEND_PACKAGE.archiveFile,
      STAGING_FRONTEND_PACKAGE.sealFile,
      STAGING_FRONTEND_PACKAGE.provenanceFile,
    ].sort(),
  );
  assert.equal(written.provenance.archive.sha256, seal.archiveSha256);
  const verified = await verifyStagingFrontendPackage({
    packageDirectory,
    outputDirectory: materialized,
    candidateSha,
    runId,
    runAttempt,
    environment,
  });
  assert.equal(verified.archiveSha256, seal.archiveSha256);
  assert.equal(verified.treeSha256, seal.treeSha256);
  assert.equal(await readFile(join(materialized, "index.html"), "utf8"), "<main>staging</main>");

  await writeFile(join(packageDirectory, "unexpected.txt"), "refused");
  await assert.rejects(
    () =>
      verifyStagingFrontendPackage({
        packageDirectory,
        outputDirectory: join(root, "extra-output"),
        candidateSha,
        runId,
        runAttempt,
        environment,
      }),
    /package_contents_invalid/,
  );
  await rm(join(packageDirectory, "unexpected.txt"));
  await assert.rejects(
    () =>
      verifyStagingFrontendPackage({
        packageDirectory,
        outputDirectory: join(root, "wrong-profile-output"),
        candidateSha,
        runId,
        runAttempt,
        environment: { ...environment, VITE_GOOGLE_MAPS_KEY: "AIzaSubstitutedMapsKey" },
      }),
    /profile_fingerprint_mismatch/,
  );

  const provenancePath = join(packageDirectory, STAGING_FRONTEND_PACKAGE.provenanceFile);
  const originalProvenance = await readFile(provenancePath);
  await chmod(provenancePath, 0o600);
  await writeFile(
    provenancePath,
    `${JSON.stringify({ ...written.provenance, artifactName: "substituted" }, null, 2)}\n`,
  );
  await assert.rejects(
    () =>
      verifyStagingFrontendPackage({
        packageDirectory,
        outputDirectory: join(root, "tampered-provenance-output"),
        candidateSha,
        runId,
        runAttempt,
        environment,
      }),
    /provenance_artifact_name_invalid/,
  );
  await writeFile(provenancePath, originalProvenance);

  const packagedSeal = join(packageDirectory, STAGING_FRONTEND_PACKAGE.sealFile);
  const originalSeal = await readFile(packagedSeal);
  await chmod(packagedSeal, 0o600);
  await writeFile(packagedSeal, Buffer.concat([originalSeal, Buffer.from("\n")]));
  await assert.rejects(
    () =>
      verifyStagingFrontendPackage({
        packageDirectory,
        outputDirectory: join(root, "tampered-seal-output"),
        candidateSha,
        runId,
        runAttempt,
        environment,
      }),
    /seal_binding_invalid/,
  );
  await writeFile(packagedSeal, originalSeal);

  const packagedArchive = join(packageDirectory, STAGING_FRONTEND_PACKAGE.archiveFile);
  await chmod(packagedArchive, 0o600);
  await writeFile(packagedArchive, "tampered");
  await assert.rejects(
    () =>
      verifyStagingFrontendPackage({
        packageDirectory,
        outputDirectory: join(root, "tampered-output"),
        candidateSha,
        runId,
        runAttempt,
        environment,
      }),
    /archive_binding_invalid|production_dist_seal_invalid/,
  );
});
