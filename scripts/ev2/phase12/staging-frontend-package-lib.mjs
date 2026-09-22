import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, mkdtemp, open, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, parse, relative, resolve } from "node:path";

import {
  copyStableProductionDistArchive,
  materializeProductionDistArchive,
} from "./production-dist-seal-lib.mjs";

const FULL_SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;
const STAGING_SUPABASE_URL = "https://glcqsosxwgmlhzgcsnzv.supabase.co";
const TURNSTILE_TEST_SITE_KEYS = new Set([
  "1x00000000000000000000AA",
  "2x00000000000000000000AB",
  "1x00000000000000000000BB",
  "2x00000000000000000000BB",
  "3x00000000000000000000FF",
]);

export const STAGING_FRONTEND_PACKAGE = Object.freeze({
  repository: "Vnd93/gaiatec-cms",
  workflowName: "CI",
  workflowPath: ".github/workflows/ci.yml",
  archiveFile: "staging-frontend-dist.tar",
  sealFile: "staging-frontend-dist-seal.json",
  provenanceFile: "staging-frontend-provenance.json",
});

export const STAGING_FRONTEND_PROFILE_KEYS = Object.freeze([
  "VITE_RELEASE",
  "VITE_CMS_ENVIRONMENT",
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_TURNSTILE_SITE_KEY",
  "VITE_GOOGLE_MAPS_KEY",
  "VITE_CONTACT_CAPTCHA_ALWAYS",
  "VITE_EV2_DRAFT_V2_CANDIDATE",
]);

const PACKAGE_FILES = Object.freeze([
  STAGING_FRONTEND_PACKAGE.archiveFile,
  STAGING_FRONTEND_PACKAGE.sealFile,
  STAGING_FRONTEND_PACKAGE.provenanceFile,
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}

function deduplicate(values) {
  return [...new Set(values)];
}

function profileValue(environment, key) {
  return typeof environment?.[key] === "string" ? environment[key] : "";
}

function profileFingerprint(fingerprints) {
  return sha256(JSON.stringify(STAGING_FRONTEND_PROFILE_KEYS.map((key) => [key, fingerprints[key]])));
}

export function stagingFrontendArtifactName(candidateSha, runId, runAttempt) {
  return `staging-frontend-${candidateSha}-${runId}-${runAttempt}`;
}

export function evaluateStagingFrontendProfile(environment, candidateSha) {
  const values = Object.fromEntries(
    STAGING_FRONTEND_PROFILE_KEYS.map((key) => [key, profileValue(environment, key)]),
  );
  const fingerprints = Object.fromEntries(
    STAGING_FRONTEND_PROFILE_KEYS.map((key) => [key, sha256(values[key])]),
  );
  const violations = [];

  if (!FULL_SHA.test(String(candidateSha ?? ""))) violations.push("candidate_sha_invalid");
  if (values.VITE_RELEASE !== candidateSha) violations.push("release_invalid");
  if (values.VITE_CMS_ENVIRONMENT !== "staging") violations.push("environment_invalid");
  if (values.VITE_SUPABASE_URL !== STAGING_SUPABASE_URL) violations.push("supabase_url_invalid");
  if (
    values.VITE_SUPABASE_ANON_KEY.length < 20 ||
    values.VITE_SUPABASE_ANON_KEY !== values.VITE_SUPABASE_ANON_KEY.trim() ||
    /\s/.test(values.VITE_SUPABASE_ANON_KEY)
  ) {
    violations.push("supabase_anon_key_invalid");
  }
  if (
    values.VITE_TURNSTILE_SITE_KEY.length < 10 ||
    values.VITE_TURNSTILE_SITE_KEY !== values.VITE_TURNSTILE_SITE_KEY.trim() ||
    TURNSTILE_TEST_SITE_KEYS.has(values.VITE_TURNSTILE_SITE_KEY)
  ) {
    violations.push("turnstile_site_key_invalid");
  }
  if (
    values.VITE_GOOGLE_MAPS_KEY.length < 10 ||
    values.VITE_GOOGLE_MAPS_KEY !== values.VITE_GOOGLE_MAPS_KEY.trim()
  ) {
    violations.push("google_maps_key_invalid");
  }
  if (values.VITE_CONTACT_CAPTCHA_ALWAYS !== "true") violations.push("captcha_profile_invalid");
  if (values.VITE_EV2_DRAFT_V2_CANDIDATE !== "false") violations.push("draft_profile_invalid");

  return {
    valid: violations.length === 0,
    violations,
    profile: {
      algorithm: "sha256",
      fingerprints,
      sha256: profileFingerprint(fingerprints),
    },
  };
}

async function readStableRegularFile(path) {
  const source = resolve(path);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:not_regular");
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
      throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:changed_while_reading");
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
    throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${label}_json_invalid`);
  }
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
  )
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:output_path_invalid");
  try {
    await lstat(target);
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:output_must_be_new");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await mkdir(dirname(target), { recursive: true });
  return target;
}

async function assertPackageFiles(packageDirectory) {
  const root = resolve(packageDirectory);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:package_root_invalid");
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (JSON.stringify(names) !== JSON.stringify([...PACKAGE_FILES].sort()))
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:package_contents_invalid");
  for (const entry of entries) {
    const entryMetadata = await lstat(resolve(root, entry.name));
    if (!entry.isFile() || entryMetadata.isSymbolicLink() || !entryMetadata.isFile())
      throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:package_entry_invalid");
  }
  return root;
}

function validateIdentity({ candidateSha, runId, runAttempt }) {
  const violations = [];
  if (!FULL_SHA.test(String(candidateSha ?? ""))) violations.push("candidate_sha_invalid");
  if (!POSITIVE_INTEGER.test(String(runId ?? "")) || !Number.isSafeInteger(Number(runId)))
    violations.push("run_id_invalid");
  if (!Number.isSafeInteger(runAttempt) || runAttempt < 1) violations.push("run_attempt_invalid");
  return violations;
}

export function evaluateStagingFrontendPackageProvenance({
  provenance,
  expected,
  profile,
  archiveIdentity,
  sealIdentity,
  seal,
  snapshot,
}) {
  const violations = validateIdentity(expected ?? {});
  const candidateSha = String(expected?.candidateSha ?? "");
  const runId = String(expected?.runId ?? "");
  const runAttempt = Number(expected?.runAttempt);
  const artifactName = stagingFrontendArtifactName(candidateSha, runId, runAttempt);

  if (
    !exactKeys(provenance, [
      "schemaVersion",
      "event",
      "repository",
      "workflow",
      "controlSha",
      "sourceRunId",
      "sourceRunAttempt",
      "artifactName",
      "profile",
      "archive",
      "seal",
      "dist",
    ])
  ) {
    violations.push("provenance_keys_invalid");
  }
  if (provenance?.schemaVersion !== 1) violations.push("provenance_schema_invalid");
  if (provenance?.event !== "g12.staging.frontend.package_provenance")
    violations.push("provenance_event_invalid");
  if (provenance?.repository !== STAGING_FRONTEND_PACKAGE.repository)
    violations.push("provenance_repository_invalid");
  if (
    !exactKeys(provenance?.workflow, ["name", "path"]) ||
    provenance?.workflow?.name !== STAGING_FRONTEND_PACKAGE.workflowName ||
    provenance?.workflow?.path !== STAGING_FRONTEND_PACKAGE.workflowPath
  ) {
    violations.push("provenance_workflow_invalid");
  }
  if (provenance?.controlSha !== candidateSha) violations.push("provenance_sha_invalid");
  if (provenance?.sourceRunId !== runId) violations.push("provenance_run_id_invalid");
  if (provenance?.sourceRunAttempt !== runAttempt) violations.push("provenance_run_attempt_invalid");
  if (provenance?.artifactName !== artifactName) violations.push("provenance_artifact_name_invalid");

  if (!exactKeys(provenance?.profile, ["algorithm", "fingerprints", "sha256"]))
    violations.push("profile_keys_invalid");
  if (provenance?.profile?.algorithm !== "sha256") violations.push("profile_algorithm_invalid");
  if (!exactKeys(provenance?.profile?.fingerprints, STAGING_FRONTEND_PROFILE_KEYS))
    violations.push("profile_fingerprint_keys_invalid");
  for (const key of STAGING_FRONTEND_PROFILE_KEYS) {
    if (
      !SHA256.test(String(provenance?.profile?.fingerprints?.[key] ?? "")) ||
      provenance?.profile?.fingerprints?.[key] !== profile?.fingerprints?.[key]
    ) {
      violations.push("profile_fingerprint_mismatch");
    }
  }
  if (
    !SHA256.test(String(provenance?.profile?.sha256 ?? "")) ||
    provenance?.profile?.sha256 !== profile?.sha256 ||
    provenance?.profile?.sha256 !== profileFingerprint(provenance?.profile?.fingerprints ?? {})
  )
    violations.push("profile_sha256_mismatch");

  if (
    !exactKeys(provenance?.archive, ["file", "bytes", "sha256"]) ||
    provenance?.archive?.file !== STAGING_FRONTEND_PACKAGE.archiveFile ||
    provenance?.archive?.bytes !== archiveIdentity?.bytes ||
    provenance?.archive?.sha256 !== archiveIdentity?.sha256
  ) {
    violations.push("archive_binding_invalid");
  }
  if (
    !exactKeys(provenance?.seal, ["file", "bytes", "sha256"]) ||
    provenance?.seal?.file !== STAGING_FRONTEND_PACKAGE.sealFile ||
    provenance?.seal?.bytes !== sealIdentity?.bytes ||
    provenance?.seal?.sha256 !== sealIdentity?.sha256
  ) {
    violations.push("seal_binding_invalid");
  }
  if (
    !exactKeys(provenance?.dist, ["treeSha256", "fileCount", "byteCount"]) ||
    provenance?.dist?.treeSha256 !== seal?.treeSha256 ||
    provenance?.dist?.fileCount !== seal?.fileCount ||
    provenance?.dist?.byteCount !== seal?.byteCount
  ) {
    violations.push("dist_binding_invalid");
  }

  if (
    seal?.schemaVersion !== 2 ||
    seal?.event !== "g12.production.dist.sealed" ||
    seal?.candidateSha !== candidateSha ||
    seal?.archiveFile !== STAGING_FRONTEND_PACKAGE.archiveFile ||
    seal?.archiveBytes !== archiveIdentity?.bytes ||
    seal?.archiveSha256 !== archiveIdentity?.sha256 ||
    !SHA256.test(String(seal?.treeSha256 ?? "")) ||
    !Number.isSafeInteger(seal?.fileCount) ||
    seal.fileCount < 1 ||
    !Number.isSafeInteger(seal?.byteCount) ||
    seal.byteCount < 1
  ) {
    violations.push("production_dist_seal_invalid");
  }
  if (
    snapshot &&
    (snapshot.treeSha256 !== seal?.treeSha256 ||
      snapshot.fileCount !== seal?.fileCount ||
      snapshot.byteCount !== seal?.byteCount)
  ) {
    violations.push("materialized_dist_invalid");
  }

  const unique = deduplicate(violations);
  return { valid: unique.length === 0, violations: unique, artifactName };
}

function packageProvenance({
  candidateSha,
  runId,
  runAttempt,
  profile,
  archiveIdentity,
  sealIdentity,
  seal,
}) {
  return {
    schemaVersion: 1,
    event: "g12.staging.frontend.package_provenance",
    repository: STAGING_FRONTEND_PACKAGE.repository,
    workflow: {
      name: STAGING_FRONTEND_PACKAGE.workflowName,
      path: STAGING_FRONTEND_PACKAGE.workflowPath,
    },
    controlSha: candidateSha,
    sourceRunId: String(runId),
    sourceRunAttempt: Number(runAttempt),
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
    dist: {
      treeSha256: seal.treeSha256,
      fileCount: seal.fileCount,
      byteCount: seal.byteCount,
    },
  };
}

export async function writeStagingFrontendPackage({
  archivePath,
  sealPath,
  outputDirectory,
  candidateSha,
  runId,
  runAttempt,
  environment = process.env,
}) {
  const identityViolations = validateIdentity({ candidateSha, runId, runAttempt });
  const profileResult = evaluateStagingFrontendProfile(environment, candidateSha);
  if (identityViolations.length > 0 || !profileResult.valid) {
    throw new Error(
      `G12_STAGING_FRONTEND_PACKAGE_REFUSED:${deduplicate([
        ...identityViolations,
        ...profileResult.violations,
      ]).join(",")}`,
    );
  }
  if (
    basename(resolve(archivePath)) !== STAGING_FRONTEND_PACKAGE.archiveFile ||
    basename(resolve(sealPath)) !== STAGING_FRONTEND_PACKAGE.sealFile
  ) {
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:source_filename_invalid");
  }

  const [archiveIdentity, sealIdentity] = await Promise.all([
    readStableRegularFile(archivePath),
    readStableRegularFile(sealPath),
  ]);
  const seal = parseJson(sealIdentity, "seal");
  const output = await requireNewDirectory(outputDirectory, [resolve(archivePath), resolve(sealPath)]);
  const temporary = await mkdtemp(join(tmpdir(), "g12-staging-frontend-writer-"));
  let outputCreated = false;
  try {
    const snapshot = await materializeProductionDistArchive(
      archivePath,
      seal,
      candidateSha,
      resolve(temporary, "dist"),
    );
    const provenance = packageProvenance({
      candidateSha,
      runId,
      runAttempt,
      profile: profileResult.profile,
      archiveIdentity,
      sealIdentity,
      seal,
    });
    const provenanceResult = evaluateStagingFrontendPackageProvenance({
      provenance,
      expected: { candidateSha, runId, runAttempt },
      profile: profileResult.profile,
      archiveIdentity,
      sealIdentity,
      seal,
      snapshot,
    });
    if (!provenanceResult.valid)
      throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${provenanceResult.violations.join(",")}`);

    await mkdir(output, { mode: 0o700 });
    outputCreated = true;
    const copiedArchive = await copyStableProductionDistArchive(
      archivePath,
      resolve(output, STAGING_FRONTEND_PACKAGE.archiveFile),
    );
    if (copiedArchive.bytes !== archiveIdentity.bytes || copiedArchive.sha256 !== archiveIdentity.sha256) {
      throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:archive_copy_invalid");
    }
    await writeFile(resolve(output, STAGING_FRONTEND_PACKAGE.sealFile), sealIdentity.buffer, {
      flag: "wx",
      mode: 0o400,
    });
    await writeFile(
      resolve(output, STAGING_FRONTEND_PACKAGE.provenanceFile),
      `${JSON.stringify(provenance, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o400 },
    );
    await assertPackageFiles(output);
    return { provenance, snapshot };
  } catch (error) {
    if (outputCreated) await rm(output, { recursive: true, force: true });
    throw error;
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

export async function verifyStagingFrontendPackage({
  packageDirectory,
  outputDirectory,
  candidateSha,
  runId,
  runAttempt,
  environment = process.env,
}) {
  const identityViolations = validateIdentity({ candidateSha, runId, runAttempt });
  const profileResult = evaluateStagingFrontendProfile(environment, candidateSha);
  if (identityViolations.length > 0 || !profileResult.valid) {
    throw new Error(
      `G12_STAGING_FRONTEND_PACKAGE_REFUSED:${deduplicate([
        ...identityViolations,
        ...profileResult.violations,
      ]).join(",")}`,
    );
  }

  const packageRoot = await assertPackageFiles(packageDirectory);
  const archivePath = resolve(packageRoot, STAGING_FRONTEND_PACKAGE.archiveFile);
  const [archiveIdentity, sealIdentity, provenanceIdentity] = await Promise.all([
    readStableRegularFile(archivePath),
    readStableRegularFile(resolve(packageRoot, STAGING_FRONTEND_PACKAGE.sealFile)),
    readStableRegularFile(resolve(packageRoot, STAGING_FRONTEND_PACKAGE.provenanceFile)),
  ]);
  const seal = parseJson(sealIdentity, "seal");
  const provenance = parseJson(provenanceIdentity, "provenance");
  const preliminary = evaluateStagingFrontendPackageProvenance({
    provenance,
    expected: { candidateSha, runId, runAttempt },
    profile: profileResult.profile,
    archiveIdentity,
    sealIdentity,
    seal,
  });
  if (!preliminary.valid)
    throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${preliminary.violations.join(",")}`);

  const output = await requireNewDirectory(outputDirectory, [packageRoot]);
  try {
    const snapshot = await materializeProductionDistArchive(archivePath, seal, candidateSha, output);
    const final = evaluateStagingFrontendPackageProvenance({
      provenance,
      expected: { candidateSha, runId, runAttempt },
      profile: profileResult.profile,
      archiveIdentity,
      sealIdentity,
      seal,
      snapshot,
    });
    if (!final.valid) throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${final.violations.join(",")}`);
    return {
      archiveSha256: archiveIdentity.sha256,
      sealSha256: sealIdentity.sha256,
      provenanceSha256: provenanceIdentity.sha256,
      treeSha256: snapshot.treeSha256,
      profileSha256: profileResult.profile.sha256,
      archiveBytes: archiveIdentity.bytes,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
      artifactName: final.artifactName,
    };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}

export async function verifyStagingFrontendPackageIdentity({
  packageDirectory,
  outputDirectory,
  candidateSha,
  runId,
  runAttempt,
  expectedProfileSha256 = "",
}) {
  const identityViolations = validateIdentity({ candidateSha, runId, runAttempt });
  if (identityViolations.length > 0) {
    throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${identityViolations.join(",")}`);
  }
  if (expectedProfileSha256 && !SHA256.test(expectedProfileSha256)) {
    throw new Error("G12_STAGING_FRONTEND_PACKAGE_REFUSED:expected_profile_invalid");
  }

  const packageRoot = await assertPackageFiles(packageDirectory);
  const archivePath = resolve(packageRoot, STAGING_FRONTEND_PACKAGE.archiveFile);
  const [archiveIdentity, sealIdentity, provenanceIdentity] = await Promise.all([
    readStableRegularFile(archivePath),
    readStableRegularFile(resolve(packageRoot, STAGING_FRONTEND_PACKAGE.sealFile)),
    readStableRegularFile(resolve(packageRoot, STAGING_FRONTEND_PACKAGE.provenanceFile)),
  ]);
  const seal = parseJson(sealIdentity, "seal");
  const provenance = parseJson(provenanceIdentity, "provenance");
  const preliminary = evaluateStagingFrontendPackageProvenance({
    provenance,
    expected: { candidateSha, runId, runAttempt },
    profile: provenance?.profile,
    archiveIdentity,
    sealIdentity,
    seal,
  });
  if (
    !preliminary.valid ||
    (expectedProfileSha256 && provenance?.profile?.sha256 !== expectedProfileSha256)
  ) {
    const violations = [
      ...preliminary.violations,
      ...(expectedProfileSha256 && provenance?.profile?.sha256 !== expectedProfileSha256
        ? ["profile_sha256_mismatch"]
        : []),
    ];
    throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${deduplicate(violations).join(",")}`);
  }

  const output = await requireNewDirectory(outputDirectory, [packageRoot]);
  try {
    const snapshot = await materializeProductionDistArchive(archivePath, seal, candidateSha, output);
    const final = evaluateStagingFrontendPackageProvenance({
      provenance,
      expected: { candidateSha, runId, runAttempt },
      profile: provenance.profile,
      archiveIdentity,
      sealIdentity,
      seal,
      snapshot,
    });
    if (!final.valid) {
      throw new Error(`G12_STAGING_FRONTEND_PACKAGE_REFUSED:${final.violations.join(",")}`);
    }
    return {
      archiveSha256: archiveIdentity.sha256,
      sealSha256: sealIdentity.sha256,
      provenanceSha256: provenanceIdentity.sha256,
      treeSha256: snapshot.treeSha256,
      profileSha256: provenance.profile.sha256,
      archiveBytes: archiveIdentity.bytes,
      sealBytes: sealIdentity.bytes,
      provenanceBytes: provenanceIdentity.bytes,
      fileCount: snapshot.fileCount,
      byteCount: snapshot.byteCount,
      artifactName: final.artifactName,
    };
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}
