import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { symlink } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  DATABASE_RELEASE_PAYLOAD,
  databaseReleasePayloadArtifactName,
  databaseReleasePayloadRequirement,
  verifyDatabaseReleasePayload,
  writeDatabaseReleasePayload,
} from "./database-release-payload-lib.mjs";

const candidatePattern = /^[a-f0-9]{40}$/;
const scriptDirectory = dirname(fileURLToPath(import.meta.url));

function git(root, args) {
  return execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

async function fixture(context, migrations = undefined) {
  const root = await mkdtemp(join(tmpdir(), "g12-database-release-payload-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const migrationFiles =
    migrations ??
    new Map([
      ["20260101000000_initial.sql", "create table public.one(id bigint primary key);\n"],
      ["20260102000000_second.sql", "alter table public.one enable row level security;\n"],
    ]);
  await mkdir(join(root, "supabase", "migrations"), { recursive: true });
  await writeFile(
    join(root, "supabase", "config.toml"),
    'project_id = "fixture"\n\n[db.seed]\nenabled = false\n',
  );
  for (const path of DATABASE_RELEASE_PAYLOAD.authRuntimeFiles) {
    const target = join(root, ...path.split("/"));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `export const sealedFixture = ${JSON.stringify(path)};\n`);
  }
  for (const [name, contents] of migrationFiles) {
    await writeFile(join(root, "supabase", "migrations", name), contents);
  }
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Database Payload Fixture"]);
  git(root, ["config", "user.email", "fixture@example.invalid"]);
  git(root, ["config", "core.autocrlf", "false"]);
  git(root, [
    "add",
    "--",
    "supabase/config.toml",
    "supabase/migrations",
    ...DATABASE_RELEASE_PAYLOAD.authRuntimeFiles,
  ]);
  git(root, ["commit", "--quiet", "--no-gpg-sign", "-m", "fixture"]);
  const candidateSha = git(root, ["rev-parse", "HEAD"]);
  assert.match(candidateSha, candidatePattern);
  return { root, candidateSha, migrationFiles };
}

async function pathIsAbsent(path) {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((entry) => canonicalize(entry));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(canonicalize(value))}\n`, "utf8");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

test("database payload requirement is explicit and fail-closed for every release profile", () => {
  assert.deepEqual(databaseReleasePayloadRequirement("database-auth"), {
    required: true,
    omitted: false,
    reason: "database_mutation_profile",
  });
  assert.deepEqual(databaseReleasePayloadRequirement("full-release"), {
    required: true,
    omitted: false,
    reason: "database_mutation_profile",
  });
  for (const profile of ["frontend-only", "edge-only"]) {
    assert.deepEqual(databaseReleasePayloadRequirement(profile), {
      required: false,
      omitted: true,
      reason: "profile_without_database_mutation",
    });
  }
  assert.throws(
    () => databaseReleasePayloadRequirement("unknown"),
    /G12_DATABASE_RELEASE_PAYLOAD_PROFILE_REFUSED/,
  );
  assert.throws(
    () =>
      databaseReleasePayloadArtifactName({
        candidateSha: "a".repeat(40),
        environment: "staging",
        profile: "frontend-only",
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_ARTIFACT_NOT_REQUIRED/,
  );
});

test("writer is byte-deterministic and verifier materializes only the sealed database project", async (context) => {
  const { root, candidateSha, migrationFiles } = await fixture(context);
  const firstPath = join(root, "first.g12db");
  const secondPath = join(root, "second.g12db");
  const first = await writeDatabaseReleasePayload({
    sourceRoot: root,
    outputPath: firstPath,
    candidateSha,
    environment: "staging",
    profile: "database-auth",
  });
  const second = await writeDatabaseReleasePayload({
    sourceRoot: root,
    outputPath: secondPath,
    candidateSha,
    environment: "staging",
    profile: "database-auth",
  });
  assert.deepEqual(await readFile(secondPath), await readFile(firstPath));
  assert.equal(second.payloadSha256, first.payloadSha256);
  assert.equal(second.manifestSha256, first.manifestSha256);
  assert.equal(second.manifest.treeSha256, first.manifest.treeSha256);
  assert.deepEqual(
    second.manifest.files.map(({ path }) => path),
    [
      ...DATABASE_RELEASE_PAYLOAD.authRuntimeFiles,
      "supabase/config.toml",
      ...[...migrationFiles.keys()].map((name) => `supabase/migrations/${name}`),
    ].sort(),
  );
  assert.deepEqual(second.manifest.deployment, {
    cli: "supabase",
    version: "2.116.0",
    command: "db push",
    flags: ["--linked", "--include-all"],
    rolesIncluded: false,
    seedIncluded: false,
  });

  const materialized = join(root, "materialized");
  const verified = await verifyDatabaseReleasePayload({
    payloadPath: firstPath,
    outputDirectory: materialized,
    candidateSha,
    environment: "staging",
    profile: "database-auth",
    expectedPayloadSha256: first.payloadSha256,
  });
  assert.equal(verified.payloadSha256, first.payloadSha256);
  assert.equal(verified.manifestSha256, first.manifestSha256);
  assert.equal(verified.projectDirectory, await realpath(materialized));
  assert.deepEqual((await readdir(materialized)).sort(), [
    "database-release-manifest.json",
    "scripts",
    "supabase",
  ]);
  assert.deepEqual((await readdir(join(materialized, "supabase"))).sort(), ["config.toml", "migrations"]);
  assert.equal(
    await readFile(join(materialized, "supabase", "config.toml"), "utf8"),
    await readFile(join(root, "supabase", "config.toml"), "utf8"),
  );
  for (const [name, contents] of migrationFiles) {
    assert.equal(await readFile(join(materialized, "supabase", "migrations", name), "utf8"), contents);
  }
  for (const path of DATABASE_RELEASE_PAYLOAD.authRuntimeFiles) {
    assert.deepEqual(
      await readFile(join(materialized, ...path.split("/"))),
      await readFile(join(root, ...path.split("/"))),
    );
  }
  assert.deepEqual(
    JSON.parse(await readFile(join(materialized, DATABASE_RELEASE_PAYLOAD.manifestFile), "utf8")),
    first.manifest,
  );
});

test("profiles without database mutation require absence instead of accepting a stale payload", async (context) => {
  const { root, candidateSha } = await fixture(context);
  for (const profile of ["frontend-only", "edge-only"]) {
    const payloadPath = join(root, `${profile}.g12db`);
    const outputDirectory = join(root, `${profile}-materialized`);
    const written = await writeDatabaseReleasePayload({
      sourceRoot: root,
      outputPath: payloadPath,
      candidateSha,
      environment: "staging",
      profile,
    });
    assert.equal(written.omitted, true);
    assert.equal(await pathIsAbsent(payloadPath), true);
    const verified = await verifyDatabaseReleasePayload({
      payloadPath,
      outputDirectory,
      candidateSha,
      environment: "staging",
      profile,
    });
    assert.equal(verified.omitted, true);
    assert.equal(await pathIsAbsent(outputDirectory), true);
    await writeFile(payloadPath, "stale");
    await assert.rejects(
      () =>
        verifyDatabaseReleasePayload({
          payloadPath,
          outputDirectory,
          candidateSha,
          environment: "staging",
          profile,
        }),
      /G12_DATABASE_RELEASE_PAYLOAD_UNEXPECTED_FOR_PROFILE/,
    );
    await rm(payloadPath);
  }
});

test("verifier rejects digest substitution, tampering, trailing bytes and path traversal without residue", async (context) => {
  const { root, candidateSha } = await fixture(context);
  const payloadPath = join(root, "sealed.g12db");
  await writeDatabaseReleasePayload({
    sourceRoot: root,
    outputPath: payloadPath,
    candidateSha,
    environment: "staging",
    profile: "full-release",
  });
  const original = await readFile(payloadPath);
  await assert.rejects(
    () =>
      verifyDatabaseReleasePayload({
        payloadPath,
        outputDirectory: join(root, "missing-external-digest-output"),
        candidateSha,
        environment: "staging",
        profile: "full-release",
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_EXPECTED_SHA256_REFUSED/,
  );
  await assert.rejects(
    () =>
      verifyDatabaseReleasePayload({
        payloadPath,
        outputDirectory: join(root, "wrong-external-digest-output"),
        candidateSha,
        environment: "staging",
        profile: "full-release",
        expectedPayloadSha256: "f".repeat(64),
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_SHA256_MISMATCH/,
  );

  const tampered = Buffer.from(original);
  tampered[tampered.length - 1] ^= 1;
  const tamperedPath = join(root, "tampered.g12db");
  await writeFile(tamperedPath, tampered);
  const tamperedOutput = join(root, "tampered-output");
  await assert.rejects(
    () =>
      verifyDatabaseReleasePayload({
        payloadPath: tamperedPath,
        outputDirectory: tamperedOutput,
        candidateSha,
        environment: "staging",
        profile: "full-release",
        expectedPayloadSha256: sha256(tampered),
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_FILE_DIGEST_MISMATCH/,
  );
  assert.equal(await pathIsAbsent(tamperedOutput), true);

  const trailingPath = join(root, "trailing.g12db");
  const trailing = Buffer.concat([original, Buffer.from("trailing")]);
  await writeFile(trailingPath, trailing);
  await assert.rejects(
    () =>
      verifyDatabaseReleasePayload({
        payloadPath: trailingPath,
        outputDirectory: join(root, "trailing-output"),
        candidateSha,
        environment: "staging",
        profile: "full-release",
        expectedPayloadSha256: sha256(trailing),
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_TRAILING_BYTES_REFUSED/,
  );

  const magicBytes = Buffer.byteLength(DATABASE_RELEASE_PAYLOAD.magic, "ascii");
  const oldManifestLength = original.readUInt32BE(magicBytes);
  const oldManifestStart = magicBytes + 4;
  const oldManifestEnd = oldManifestStart + oldManifestLength;
  const maliciousManifest = JSON.parse(original.subarray(oldManifestStart, oldManifestEnd).toString("utf8"));
  const migrationIndex = maliciousManifest.files.findIndex(({ path }) =>
    path.startsWith(DATABASE_RELEASE_PAYLOAD.migrationsPrefix),
  );
  assert.ok(migrationIndex >= 0);
  maliciousManifest.files[migrationIndex].path = "supabase/migrations/../escape.sql";
  const maliciousManifestBytes = canonicalJsonBytes(maliciousManifest);
  const maliciousLength = Buffer.alloc(4);
  maliciousLength.writeUInt32BE(maliciousManifestBytes.length);
  const malicious = Buffer.concat([
    Buffer.from(DATABASE_RELEASE_PAYLOAD.magic, "ascii"),
    maliciousLength,
    maliciousManifestBytes,
    original.subarray(oldManifestEnd),
  ]);
  const maliciousPath = join(root, "path-traversal.g12db");
  const maliciousOutput = join(root, "path-traversal-output");
  await writeFile(maliciousPath, malicious);
  await assert.rejects(
    () =>
      verifyDatabaseReleasePayload({
        payloadPath: maliciousPath,
        outputDirectory: maliciousOutput,
        candidateSha,
        environment: "staging",
        profile: "full-release",
        expectedPayloadSha256: sha256(malicious),
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_PATH_REFUSED/,
  );
  assert.equal(await pathIsAbsent(maliciousOutput), true);
  assert.equal(await pathIsAbsent(join(root, "escape.sql")), true);
});

test("writer rejects symlinks, unapproved entries, duplicate versions and Git-byte drift", async (context) => {
  const symlinkFixture = await fixture(context);
  const linkPath = join(symlinkFixture.root, "supabase", "migrations", "20260103000000_link.sql");
  const linkTarget = join(symlinkFixture.root, "supabase", "migrations", "20260101000000_initial.sql");
  const symlinkCreated = await new Promise((resolvePromise, rejectPromise) => {
    symlink(linkTarget, linkPath, "file", (error) => {
      if (error && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) resolvePromise(false);
      else if (error) rejectPromise(error);
      else resolvePromise(true);
    });
  });
  if (symlinkCreated) {
    await assert.rejects(
      () =>
        writeDatabaseReleasePayload({
          sourceRoot: symlinkFixture.root,
          outputPath: join(symlinkFixture.root, "symlink.g12db"),
          candidateSha: symlinkFixture.candidateSha,
          environment: "staging",
          profile: "database-auth",
        }),
      /G12_DATABASE_RELEASE_PAYLOAD_MIGRATION_ENTRY_REFUSED/,
    );
    await rm(linkPath);
  }

  const outputLink = join(symlinkFixture.root, "output-link");
  const outputLinkCreated = await new Promise((resolvePromise, rejectPromise) => {
    symlink(join(symlinkFixture.root, "supabase"), outputLink, "junction", (error) => {
      if (error && ["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) resolvePromise(false);
      else if (error) rejectPromise(error);
      else resolvePromise(true);
    });
  });
  if (outputLinkCreated) {
    await assert.rejects(
      () =>
        writeDatabaseReleasePayload({
          sourceRoot: symlinkFixture.root,
          outputPath: join(outputLink, "escaped.g12db"),
          candidateSha: symlinkFixture.candidateSha,
          environment: "staging",
          profile: "database-auth",
        }),
      /G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_INSIDE_SOURCE_REFUSED/,
    );
    assert.equal(await pathIsAbsent(join(symlinkFixture.root, "supabase", "escaped.g12db")), true);
  }

  const extraFixture = await fixture(context);
  await writeFile(join(extraFixture.root, "supabase", "migrations", "README.md"), "not SQL");
  await assert.rejects(
    () =>
      writeDatabaseReleasePayload({
        sourceRoot: extraFixture.root,
        outputPath: join(extraFixture.root, "extra.g12db"),
        candidateSha: extraFixture.candidateSha,
        environment: "staging",
        profile: "database-auth",
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_MIGRATION_ENTRY_REFUSED/,
  );

  const duplicateFixture = await fixture(
    context,
    new Map([
      ["20260101000000_first.sql", "select 1;\n"],
      ["20260101000000_second.sql", "select 2;\n"],
    ]),
  );
  await assert.rejects(
    () =>
      writeDatabaseReleasePayload({
        sourceRoot: duplicateFixture.root,
        outputPath: join(duplicateFixture.root, "duplicate.g12db"),
        candidateSha: duplicateFixture.candidateSha,
        environment: "staging",
        profile: "database-auth",
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_MIGRATION_VERSION_DUPLICATED/,
  );

  const dirtyFixture = await fixture(context);
  const dirtyMigration = join(dirtyFixture.root, "supabase", "migrations", "20260101000000_initial.sql");
  await writeFile(dirtyMigration, "select 'changed after commit';\n");
  await assert.rejects(
    () =>
      writeDatabaseReleasePayload({
        sourceRoot: dirtyFixture.root,
        outputPath: join(dirtyFixture.root, "dirty.g12db"),
        candidateSha: dirtyFixture.candidateSha,
        environment: "staging",
        profile: "database-auth",
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_GIT_BYTES_MISMATCH/,
  );

  const gitModeFixture = await fixture(context);
  const gitModeName = "20260103000000_git_link.sql";
  const gitModeContents = "20260101000000_initial.sql";
  await writeFile(join(gitModeFixture.root, "supabase", "migrations", gitModeName), gitModeContents);
  const linkBlob = execFileSync("git", ["-C", gitModeFixture.root, "hash-object", "-w", "--stdin"], {
    encoding: "utf8",
    input: gitModeContents,
  }).trim();
  git(gitModeFixture.root, [
    "update-index",
    "--add",
    "--cacheinfo",
    `120000,${linkBlob},supabase/migrations/${gitModeName}`,
  ]);
  git(gitModeFixture.root, ["commit", "--quiet", "--no-gpg-sign", "-m", "symlink mode"]);
  const gitModeSha = git(gitModeFixture.root, ["rev-parse", "HEAD"]);
  await assert.rejects(
    () =>
      writeDatabaseReleasePayload({
        sourceRoot: gitModeFixture.root,
        outputPath: join(gitModeFixture.root, "git-mode.g12db"),
        candidateSha: gitModeSha,
        environment: "staging",
        profile: "database-auth",
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_GIT_FILE_MODE_REFUSED/,
  );
});

test("verifier never overlays an existing directory", async (context) => {
  const { root, candidateSha } = await fixture(context);
  const payloadPath = join(root, "sealed.g12db");
  const outputDirectory = join(root, "existing-output");
  const written = await writeDatabaseReleasePayload({
    sourceRoot: root,
    outputPath: payloadPath,
    candidateSha,
    environment: "staging",
    profile: "database-auth",
  });
  await mkdir(outputDirectory);
  await writeFile(join(outputDirectory, "preserve.txt"), "preserve");
  await assert.rejects(
    () =>
      verifyDatabaseReleasePayload({
        payloadPath,
        outputDirectory,
        candidateSha,
        environment: "staging",
        profile: "database-auth",
        expectedPayloadSha256: written.payloadSha256,
      }),
    /G12_DATABASE_RELEASE_PAYLOAD_OUTPUT_MUST_BE_NEW/,
  );
  assert.equal(await readFile(join(outputDirectory, "preserve.txt"), "utf8"), "preserve");
});

test("writer and verifier CLIs expose stable GitHub outputs for the sealed bytes", async (context) => {
  const { root, candidateSha } = await fixture(context);
  const payloadPath = join(root, "cli.g12db");
  const materialized = join(root, "cli-materialized");
  const writerOutput = join(root, "writer-output.txt");
  const verifierOutput = join(root, "verifier-output.txt");
  const writer = spawnSync(
    process.execPath,
    [
      join(scriptDirectory, "write-database-release-payload.mjs"),
      "--source",
      root,
      "--output",
      payloadPath,
      "--candidate",
      candidateSha,
      "--environment",
      "staging",
      "--profile",
      "database-auth",
    ],
    { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: writerOutput } },
  );
  assert.equal(writer.status, 0, writer.stderr);
  const writerEvent = JSON.parse(writer.stdout);
  assert.equal(writerEvent.event, "g12.database.release_payload.written");
  assert.match(writerEvent.payloadSha256, /^[a-f0-9]{64}$/);
  assert.match(await readFile(writerOutput, "utf8"), /required=true/);

  const verifier = spawnSync(
    process.execPath,
    [
      join(scriptDirectory, "verify-database-release-payload.mjs"),
      "--payload",
      payloadPath,
      "--output",
      materialized,
      "--candidate",
      candidateSha,
      "--environment",
      "staging",
      "--profile",
      "database-auth",
      "--expected-payload-sha256",
      writerEvent.payloadSha256,
    ],
    { encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: verifierOutput } },
  );
  assert.equal(verifier.status, 0, verifier.stderr);
  const verifierEvent = JSON.parse(verifier.stdout);
  assert.equal(verifierEvent.event, "g12.database.release_payload.verified");
  assert.equal(verifierEvent.payloadSha256, writerEvent.payloadSha256);
  const verifierOutputs = await readFile(verifierOutput, "utf8");
  assert.match(verifierOutputs, /required=true/);
  assert.match(verifierOutputs, /project_directory=/);
  assert.equal(await pathIsAbsent(join(materialized, ".git")), true);
});

test("materialized files are immutable by default on POSIX", async (context) => {
  if (process.platform === "win32") {
    context.skip("POSIX mode bits are not enforced on Windows");
    return;
  }
  const { root, candidateSha } = await fixture(context);
  const payloadPath = join(root, "sealed.g12db");
  const materialized = join(root, "materialized-mode");
  const written = await writeDatabaseReleasePayload({
    sourceRoot: root,
    outputPath: payloadPath,
    candidateSha,
    environment: "staging",
    profile: "database-auth",
  });
  await verifyDatabaseReleasePayload({
    payloadPath,
    outputDirectory: materialized,
    candidateSha,
    environment: "staging",
    profile: "database-auth",
    expectedPayloadSha256: written.payloadSha256,
  });
  const configPath = join(materialized, "supabase", "config.toml");
  const mode = (await lstat(configPath)).mode & 0o777;
  assert.equal(mode, 0o400);
  await chmod(configPath, 0o600);
});
