import { constants } from "node:fs";
import { appendFile, lstat, mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  STAGING_CANDIDATE_HANDOFF,
  verifyLegacyStagingCandidateHandoff,
  verifyStagingCandidateHandoff,
} from "./staging-candidate-handoff-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function stableBytes(path) {
  const file = resolve(path);
  const metadata = await lstat(file);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_CANDIDATE_MATERIALIZATION_REFUSED:not_regular");
  const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = await handle.stat({ bigint: true });
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (
      before.size !== after.size ||
      before.mtimeNs !== after.mtimeNs ||
      before.ino !== after.ino ||
      BigInt(bytes.length) !== before.size
    ) {
      throw new Error("G12_STAGING_CANDIDATE_MATERIALIZATION_REFUSED:changed_while_reading");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

const artifactDirectoryInput = argument("artifact-dir");
const outputDirectoryInput = argument("output-dist");
const candidateSha = argument("candidate");
if (!artifactDirectoryInput || !outputDirectoryInput || !/^[a-f0-9]{40}$/.test(candidateSha))
  throw new Error("G12_STAGING_CANDIDATE_MATERIALIZATION_ARGUMENTS_REQUIRED");
const artifactDirectory = resolve(artifactDirectoryInput);
const outputDirectory = resolve(outputDirectoryInput);

const artifactMetadata = await lstat(artifactDirectory);
if (!artifactMetadata.isDirectory() || artifactMetadata.isSymbolicLink()) {
  throw new Error("G12_STAGING_CANDIDATE_MATERIALIZATION_REFUSED:artifact_root_invalid");
}
const entries = await readdir(artifactDirectory, { withFileTypes: true });
const names = entries.map((entry) => entry.name).sort();
const newNames = [
  STAGING_CANDIDATE_HANDOFF.archiveFile,
  STAGING_CANDIDATE_HANDOFF.sealFile,
  STAGING_CANDIDATE_HANDOFF.provenanceFile,
  STAGING_CANDIDATE_HANDOFF.manifestFile,
].sort();
const legacyNames = [
  STAGING_CANDIDATE_HANDOFF.legacyArchiveFile,
  STAGING_CANDIDATE_HANDOFF.legacySealFile,
].sort();
const temporary = await mkdtemp(join(tmpdir(), "g12-staging-candidate-materialize-"));
let result;
let format;
try {
  if (JSON.stringify(names) === JSON.stringify(newNames)) {
    const manifest = JSON.parse(
      await readFile(resolve(artifactDirectory, STAGING_CANDIDATE_HANDOFF.manifestFile), "utf8"),
    );
    result = await verifyStagingCandidateHandoff({
      handoffDirectory: artifactDirectory,
      outputDirectory,
      candidateSha,
      expected: {
        sourceRunId: manifest?.source?.runId,
        sourceRunAttempt: manifest?.source?.runAttempt,
        archiveSha256: manifest?.package?.archive?.sha256,
        sealSha256: manifest?.package?.seal?.sha256,
        provenanceSha256: manifest?.package?.provenance?.sha256,
        profileSha256: manifest?.package?.profileSha256,
        treeSha256: manifest?.package?.dist?.treeSha256,
        archiveBytes: manifest?.package?.archive?.bytes,
        fileCount: manifest?.package?.dist?.fileCount,
        byteCount: manifest?.package?.dist?.byteCount,
      },
    });
    format = "v2-original-package";
  } else {
    const legacyRoot = resolve(temporary, "legacy");
    let archiveSource;
    let sealSource;
    if (JSON.stringify(names) === JSON.stringify(legacyNames)) {
      archiveSource = resolve(artifactDirectory, STAGING_CANDIDATE_HANDOFF.legacyArchiveFile);
      sealSource = resolve(artifactDirectory, STAGING_CANDIDATE_HANDOFF.legacySealFile);
    } else {
      if (
        entries.length !== 1 ||
        entries[0].name !== "outputs" ||
        !entries[0].isDirectory() ||
        entries[0].isSymbolicLink()
      ) {
        throw new Error("G12_STAGING_CANDIDATE_MATERIALIZATION_REFUSED:artifact_contents_invalid");
      }
      const nestedRoot = resolve(artifactDirectory, "outputs");
      const nestedEntries = await readdir(nestedRoot, { withFileTypes: true });
      if (
        nestedEntries.some((entry) => !entry.isFile() || entry.isSymbolicLink()) ||
        JSON.stringify(nestedEntries.map((entry) => entry.name).sort()) !== JSON.stringify(legacyNames)
      ) {
        throw new Error("G12_STAGING_CANDIDATE_MATERIALIZATION_REFUSED:legacy_contents_invalid");
      }
      archiveSource = resolve(nestedRoot, STAGING_CANDIDATE_HANDOFF.legacyArchiveFile);
      sealSource = resolve(nestedRoot, STAGING_CANDIDATE_HANDOFF.legacySealFile);
    }
    const [archiveBytes, sealBytes] = await Promise.all([
      stableBytes(archiveSource),
      stableBytes(sealSource),
    ]);
    await mkdir(legacyRoot, { mode: 0o700 });
    await writeFile(resolve(legacyRoot, STAGING_CANDIDATE_HANDOFF.legacyArchiveFile), archiveBytes, {
      flag: "wx",
      mode: 0o400,
    });
    await writeFile(resolve(legacyRoot, STAGING_CANDIDATE_HANDOFF.legacySealFile), sealBytes, {
      flag: "wx",
      mode: 0o400,
    });
    const seal = JSON.parse(sealBytes.toString("utf8"));
    result = await verifyLegacyStagingCandidateHandoff({
      handoffDirectory: legacyRoot,
      outputDirectory,
      candidateSha,
      expected: {
        archiveSha256: seal?.archiveSha256,
        treeSha256: seal?.treeSha256,
      },
    });
    result = {
      ...result,
      paths: { ...result.paths, archive: archiveSource, seal: sealSource },
    };
    format = "legacy-read-only";
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}

if (process.env.GITHUB_OUTPUT) {
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      "verified=true",
      `format=${format}`,
      `archive_path=${result.paths.archive}`,
      `seal_path=${result.paths.seal}`,
      `provenance_path=${result.paths.provenance ?? ""}`,
      `manifest_path=${result.paths.manifest ?? ""}`,
      `dist_path=${result.paths.dist}`,
      `archive_sha256=${result.archiveSha256}`,
      `tree_sha256=${result.treeSha256}`,
      `archive_bytes=${result.archiveBytes}`,
      `file_count=${result.fileCount}`,
      `byte_count=${result.byteCount}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

console.log(
  JSON.stringify({
    event: "g12.staging.candidate_artifact.materialized",
    candidateSha,
    format,
    legacyReadOnly: format === "legacy-read-only",
    archiveSha256: result.archiveSha256,
    treeSha256: result.treeSha256,
    fileCount: result.fileCount,
    byteCount: result.byteCount,
    secretsExposed: false,
  }),
);
