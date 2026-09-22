import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

import { materializeProductionDistArchive } from "./production-dist-seal-lib.mjs";
import {
  STAGING_FRONTEND_PACKAGE,
  verifyStagingFrontendPackage,
  verifyStagingFrontendPackageIdentity,
} from "./staging-frontend-package-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

export const STAGING_CANDIDATE_HANDOFF = Object.freeze({
  schemaVersion: 2,
  event: "g12.staging.candidate_handoff",
  archiveFile: STAGING_FRONTEND_PACKAGE.archiveFile,
  sealFile: STAGING_FRONTEND_PACKAGE.sealFile,
  provenanceFile: STAGING_FRONTEND_PACKAGE.provenanceFile,
  manifestFile: "staging-candidate-handoff.json",
  legacyArchiveFile: "staging-candidate-dist.tar",
  legacySealFile: "staging-candidate-dist-seal.json",
});

const HANDOFF_FILES = Object.freeze([
  STAGING_CANDIDATE_HANDOFF.archiveFile,
  STAGING_CANDIDATE_HANDOFF.sealFile,
  STAGING_CANDIDATE_HANDOFF.provenanceFile,
  STAGING_CANDIDATE_HANDOFF.manifestFile,
]);
const PACKAGE_FILES = Object.freeze([
  STAGING_CANDIDATE_HANDOFF.archiveFile,
  STAGING_CANDIDATE_HANDOFF.sealFile,
  STAGING_CANDIDATE_HANDOFF.provenanceFile,
]);
const LEGACY_FILES = Object.freeze([
  STAGING_CANDIDATE_HANDOFF.legacyArchiveFile,
  STAGING_CANDIDATE_HANDOFF.legacySealFile,
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function isWithin(root, candidate) {
  const relation = relative(resolve(root), resolve(candidate));
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

async function requireNewDirectory(path, forbidden = []) {
  const target = resolve(path);
  if (
    target === parse(target).root ||
    target === resolve(".") ||
    forbidden.some((item) => isWithin(item, target))
  ) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:output_path_invalid");
  }
  try {
    await lstat(target);
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:output_must_be_new");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  return target;
}

async function readStableRegularFile(path) {
  const source = resolve(path);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:not_regular");
  }
  const handle = await open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const buffer = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      BigInt(buffer.length) !== before.size
    ) {
      throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:changed_while_reading");
    }
    return { buffer, bytes: buffer.length, sha256: sha256(buffer) };
  } finally {
    await handle.close();
  }
}

function parseJson(identity, label) {
  try {
    return JSON.parse(identity.buffer.toString("utf8"));
  } catch {
    throw new Error(`G12_STAGING_CANDIDATE_HANDOFF_REFUSED:${label}_json_invalid`);
  }
}

async function assertExactFiles(directory, expectedFiles, label) {
  const root = resolve(directory);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`G12_STAGING_CANDIDATE_HANDOFF_REFUSED:${label}_root_invalid`);
  }
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
    JSON.stringify(names) !== JSON.stringify([...expectedFiles].sort())
  ) {
    throw new Error(`G12_STAGING_CANDIDATE_HANDOFF_REFUSED:${label}_contents_invalid`);
  }
  return root;
}

function assertExpected(expected, candidateSha) {
  if (
    !FULL_SHA.test(String(candidateSha ?? "")) ||
    !expected ||
    !POSITIVE_INTEGER.test(String(expected.sourceRunId ?? "")) ||
    !Number.isSafeInteger(expected.sourceRunAttempt) ||
    expected.sourceRunAttempt < 1 ||
    !SHA256.test(String(expected.archiveSha256 ?? "")) ||
    !SHA256.test(String(expected.sealSha256 ?? "")) ||
    !SHA256.test(String(expected.provenanceSha256 ?? "")) ||
    !SHA256.test(String(expected.profileSha256 ?? "")) ||
    !SHA256.test(String(expected.treeSha256 ?? "")) ||
    !Number.isSafeInteger(expected.archiveBytes) ||
    expected.archiveBytes < 1 ||
    !Number.isSafeInteger(expected.fileCount) ||
    expected.fileCount < 1 ||
    !Number.isSafeInteger(expected.byteCount) ||
    expected.byteCount < 1
  ) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:expected_identity_invalid");
  }
}

function createManifest({ candidateSha, runId, runAttempt, packageIdentity, identities }) {
  return {
    schemaVersion: STAGING_CANDIDATE_HANDOFF.schemaVersion,
    event: STAGING_CANDIDATE_HANDOFF.event,
    candidateSha,
    source: {
      runId: String(runId),
      runAttempt: Number(runAttempt),
      artifactName: packageIdentity.artifactName,
    },
    package: {
      archive: {
        file: STAGING_CANDIDATE_HANDOFF.archiveFile,
        bytes: identities.archive.bytes,
        sha256: identities.archive.sha256,
      },
      seal: {
        file: STAGING_CANDIDATE_HANDOFF.sealFile,
        bytes: identities.seal.bytes,
        sha256: identities.seal.sha256,
      },
      provenance: {
        file: STAGING_CANDIDATE_HANDOFF.provenanceFile,
        bytes: identities.provenance.bytes,
        sha256: identities.provenance.sha256,
      },
      profileSha256: packageIdentity.profileSha256,
      dist: {
        treeSha256: packageIdentity.treeSha256,
        fileCount: packageIdentity.fileCount,
        byteCount: packageIdentity.byteCount,
      },
    },
  };
}

function assertManifest(manifest, candidateSha, expected, identities) {
  if (
    !exactKeys(manifest, ["schemaVersion", "event", "candidateSha", "source", "package"]) ||
    manifest.schemaVersion !== STAGING_CANDIDATE_HANDOFF.schemaVersion ||
    manifest.event !== STAGING_CANDIDATE_HANDOFF.event ||
    manifest.candidateSha !== candidateSha ||
    !exactKeys(manifest.source, ["runId", "runAttempt", "artifactName"]) ||
    manifest.source.runId !== String(expected.sourceRunId) ||
    manifest.source.runAttempt !== expected.sourceRunAttempt ||
    manifest.source.artifactName !==
      `staging-frontend-${candidateSha}-${expected.sourceRunId}-${expected.sourceRunAttempt}` ||
    !exactKeys(manifest.package, ["archive", "seal", "provenance", "profileSha256", "dist"]) ||
    !exactKeys(manifest.package.archive, ["file", "bytes", "sha256"]) ||
    manifest.package.archive.file !== STAGING_CANDIDATE_HANDOFF.archiveFile ||
    manifest.package.archive.bytes !== expected.archiveBytes ||
    manifest.package.archive.sha256 !== expected.archiveSha256 ||
    manifest.package.archive.bytes !== identities.archive.bytes ||
    manifest.package.archive.sha256 !== identities.archive.sha256 ||
    !exactKeys(manifest.package.seal, ["file", "bytes", "sha256"]) ||
    manifest.package.seal.file !== STAGING_CANDIDATE_HANDOFF.sealFile ||
    manifest.package.seal.bytes !== identities.seal.bytes ||
    manifest.package.seal.sha256 !== expected.sealSha256 ||
    manifest.package.seal.sha256 !== identities.seal.sha256 ||
    !exactKeys(manifest.package.provenance, ["file", "bytes", "sha256"]) ||
    manifest.package.provenance.file !== STAGING_CANDIDATE_HANDOFF.provenanceFile ||
    manifest.package.provenance.bytes !== identities.provenance.bytes ||
    manifest.package.provenance.sha256 !== expected.provenanceSha256 ||
    manifest.package.provenance.sha256 !== identities.provenance.sha256 ||
    manifest.package.profileSha256 !== expected.profileSha256 ||
    !exactKeys(manifest.package.dist, ["treeSha256", "fileCount", "byteCount"]) ||
    manifest.package.dist.treeSha256 !== expected.treeSha256 ||
    manifest.package.dist.fileCount !== expected.fileCount ||
    manifest.package.dist.byteCount !== expected.byteCount
  ) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:manifest_invalid");
  }
}

async function copyPackageBytes(identities, destination) {
  await mkdir(destination, { mode: 0o700 });
  for (const [label, filename] of [
    ["archive", STAGING_CANDIDATE_HANDOFF.archiveFile],
    ["seal", STAGING_CANDIDATE_HANDOFF.sealFile],
    ["provenance", STAGING_CANDIDATE_HANDOFF.provenanceFile],
  ]) {
    await writeFile(resolve(destination, filename), identities[label].buffer, {
      flag: "wx",
      mode: 0o400,
    });
  }
}

export async function verifyStagingCandidateHandoff({
  handoffDirectory,
  outputDirectory,
  candidateSha,
  expected,
}) {
  assertExpected(expected, candidateSha);
  const handoffRoot = await assertExactFiles(handoffDirectory, HANDOFF_FILES, "handoff");
  const output = await requireNewDirectory(outputDirectory, [handoffRoot]);
  const identities = Object.fromEntries(
    await Promise.all(
      [
        ["archive", STAGING_CANDIDATE_HANDOFF.archiveFile],
        ["seal", STAGING_CANDIDATE_HANDOFF.sealFile],
        ["provenance", STAGING_CANDIDATE_HANDOFF.provenanceFile],
        ["manifest", STAGING_CANDIDATE_HANDOFF.manifestFile],
      ].map(async ([label, filename]) => [
        label,
        await readStableRegularFile(resolve(handoffRoot, filename)),
      ]),
    ),
  );
  const manifest = parseJson(identities.manifest, "manifest");
  assertManifest(manifest, candidateSha, expected, identities);

  const temporary = await mkdtemp(join(tmpdir(), "g12-staging-candidate-verify-"));
  let outputCreated = false;
  try {
    const packageDirectory = resolve(temporary, "package");
    await copyPackageBytes(identities, packageDirectory);
    outputCreated = true;
    const packageIdentity = await verifyStagingFrontendPackageIdentity({
      packageDirectory,
      outputDirectory: output,
      candidateSha,
      runId: expected.sourceRunId,
      runAttempt: expected.sourceRunAttempt,
      expectedProfileSha256: expected.profileSha256,
    });
    const finalIdentities = Object.fromEntries(
      await Promise.all(
        PACKAGE_FILES.map(async (filename) => [
          filename,
          await readStableRegularFile(resolve(handoffRoot, filename)),
        ]),
      ),
    );
    for (const [label, filename] of [
      ["archive", STAGING_CANDIDATE_HANDOFF.archiveFile],
      ["seal", STAGING_CANDIDATE_HANDOFF.sealFile],
      ["provenance", STAGING_CANDIDATE_HANDOFF.provenanceFile],
    ]) {
      if (
        finalIdentities[filename].bytes !== identities[label].bytes ||
        finalIdentities[filename].sha256 !== identities[label].sha256
      ) {
        throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:package_changed_during_verification");
      }
    }
    if (
      packageIdentity.archiveSha256 !== expected.archiveSha256 ||
      packageIdentity.sealSha256 !== expected.sealSha256 ||
      packageIdentity.provenanceSha256 !== expected.provenanceSha256 ||
      packageIdentity.profileSha256 !== expected.profileSha256 ||
      packageIdentity.treeSha256 !== expected.treeSha256 ||
      packageIdentity.archiveBytes !== expected.archiveBytes ||
      packageIdentity.fileCount !== expected.fileCount ||
      packageIdentity.byteCount !== expected.byteCount
    ) {
      throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:identity_mismatch");
    }
    return {
      ...packageIdentity,
      manifestSha256: identities.manifest.sha256,
      manifest,
      paths: {
        archive: resolve(handoffRoot, STAGING_CANDIDATE_HANDOFF.archiveFile),
        seal: resolve(handoffRoot, STAGING_CANDIDATE_HANDOFF.sealFile),
        provenance: resolve(handoffRoot, STAGING_CANDIDATE_HANDOFF.provenanceFile),
        manifest: resolve(handoffRoot, STAGING_CANDIDATE_HANDOFF.manifestFile),
        dist: output,
      },
    };
  } catch (error) {
    if (outputCreated) await rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyLegacyStagingCandidateHandoff({
  handoffDirectory,
  outputDirectory,
  candidateSha,
  expected,
}) {
  if (
    !FULL_SHA.test(String(candidateSha ?? "")) ||
    !SHA256.test(String(expected?.archiveSha256 ?? "")) ||
    !SHA256.test(String(expected?.treeSha256 ?? ""))
  ) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:legacy_expected_invalid");
  }
  const root = await assertExactFiles(handoffDirectory, LEGACY_FILES, "legacy_handoff");
  const archivePath = resolve(root, STAGING_CANDIDATE_HANDOFF.legacyArchiveFile);
  const sealIdentity = await readStableRegularFile(resolve(root, STAGING_CANDIDATE_HANDOFF.legacySealFile));
  const seal = parseJson(sealIdentity, "legacy_seal");
  if (
    seal?.schemaVersion !== 2 ||
    seal?.candidateSha !== candidateSha ||
    seal?.archiveFile !== STAGING_CANDIDATE_HANDOFF.legacyArchiveFile ||
    seal?.archiveSha256 !== expected.archiveSha256 ||
    seal?.treeSha256 !== expected.treeSha256
  ) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:legacy_seal_invalid");
  }
  const output = await requireNewDirectory(outputDirectory, [root]);
  try {
    const snapshot = await materializeProductionDistArchive(archivePath, seal, candidateSha, output);
    return {
      legacyReadOnly: true,
      archiveSha256: seal.archiveSha256,
      treeSha256: snapshot.treeSha256,
      archiveBytes: seal.archiveBytes,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
      paths: {
        archive: archivePath,
        seal: resolve(root, STAGING_CANDIDATE_HANDOFF.legacySealFile),
        dist: output,
      },
    };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

export async function writeStagingCandidateHandoff({
  packageDirectory,
  outputDirectory,
  candidateSha,
  runId,
  runAttempt,
  environment = process.env,
}) {
  if (!POSITIVE_INTEGER.test(String(runId ?? "")) || !Number.isSafeInteger(runAttempt) || runAttempt < 1) {
    throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:source_identity_invalid");
  }
  const packageRoot = resolve(packageDirectory);
  const output = await requireNewDirectory(outputDirectory, [packageRoot]);
  const temporary = await mkdtemp(join(tmpdir(), "g12-staging-candidate-handoff-"));
  let outputCreated = false;
  try {
    const packageIdentity = await verifyStagingFrontendPackage({
      packageDirectory: packageRoot,
      outputDirectory: resolve(temporary, "package-dist"),
      candidateSha,
      runId,
      runAttempt,
      environment,
    });
    const identities = Object.fromEntries(
      await Promise.all(
        [
          ["archive", STAGING_CANDIDATE_HANDOFF.archiveFile],
          ["seal", STAGING_CANDIDATE_HANDOFF.sealFile],
          ["provenance", STAGING_CANDIDATE_HANDOFF.provenanceFile],
        ].map(async ([label, filename]) => [
          label,
          await readStableRegularFile(resolve(packageRoot, filename)),
        ]),
      ),
    );
    if (
      identities.archive.sha256 !== packageIdentity.archiveSha256 ||
      identities.archive.bytes !== packageIdentity.archiveBytes ||
      identities.seal.sha256 !== packageIdentity.sealSha256 ||
      identities.provenance.sha256 !== packageIdentity.provenanceSha256
    ) {
      throw new Error("G12_STAGING_CANDIDATE_HANDOFF_REFUSED:source_changed_after_verification");
    }
    const manifest = createManifest({
      candidateSha,
      runId,
      runAttempt,
      packageIdentity,
      identities,
    });
    const expected = {
      sourceRunId: String(runId),
      sourceRunAttempt: runAttempt,
      archiveSha256: packageIdentity.archiveSha256,
      sealSha256: packageIdentity.sealSha256,
      provenanceSha256: packageIdentity.provenanceSha256,
      profileSha256: packageIdentity.profileSha256,
      treeSha256: packageIdentity.treeSha256,
      archiveBytes: packageIdentity.archiveBytes,
      fileCount: packageIdentity.fileCount,
      byteCount: packageIdentity.byteCount,
    };

    await mkdir(output, { mode: 0o700 });
    outputCreated = true;
    for (const [label, filename] of [
      ["archive", STAGING_CANDIDATE_HANDOFF.archiveFile],
      ["seal", STAGING_CANDIDATE_HANDOFF.sealFile],
      ["provenance", STAGING_CANDIDATE_HANDOFF.provenanceFile],
    ]) {
      await writeFile(resolve(output, filename), identities[label].buffer, { flag: "wx", mode: 0o400 });
    }
    await writeFile(
      resolve(output, STAGING_CANDIDATE_HANDOFF.manifestFile),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o400 },
    );
    await assertExactFiles(output, HANDOFF_FILES, "handoff");
    const verified = await verifyStagingCandidateHandoff({
      handoffDirectory: output,
      outputDirectory: resolve(temporary, "handoff-dist"),
      candidateSha,
      expected,
    });
    return {
      ...expected,
      manifestSha256: verified.manifestSha256,
      paths: verified.paths,
    };
  } catch (error) {
    if (outputCreated) await rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
