import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { copyFile, cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";
import {
  productionFunctionSourceDigest,
  sourceDigestInventory,
} from "./production-function-deployment-lib.mjs";
import {
  planHotfixTerminalCleanup,
  recoveryStateVariableName,
  STAGING_RECOVERY_KINDS,
  verifyRecoveryStateVariable,
} from "./recovery-state-store-lib.mjs";
import {
  assertExactSourceIdentity,
  assertTrustedBaselineTuple,
  buildHotfixRecoveryState,
  buildRecoveryPackageManifest,
  canonicalSha256,
  classifyHotfixLiveState,
  executeHotfixRollbackTransition,
  frameRawEszip,
  functionInventorySnapshot,
  inspectEszipV2,
  normalizeGithubArtifactDigest,
  normalizeFunctionTuple,
  reconcileDownloadedBundleBody,
  sameFunctionTuple,
  selectHotfixWatchdogArtifactChain,
  sealHotfixIntent,
  sealHotfixProbeProof,
  sealHotfixReceipt,
  sha256Bytes,
  STAGING_CMS_PUBLIC_HOTFIX,
  validateCmsPublicHotfixCanary,
  validateCandidateBuildProvenance,
  validateCandidateBuildEvidenceFiles,
  validateHotfixFullProbe,
  validateHotfixPreProbe,
  validateHotfixRecoveryState,
  validateHotfixTerminalEvidence,
  validateRecoveryPackage,
  validateTrustedBaselineEvidence,
  verifyHotfixIntent,
  verifyHotfixProbeProof,
  verifyHotfixReceipt,
} from "./staging-cms-public-hotfix-lib.mjs";

function argument(name, { required = true } = {}) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : "";
  if (required && !value)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_${name.toUpperCase().replaceAll("-", "_")}_REQUIRED`);
  return value;
}

function exactRoot(value) {
  if (!value) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ROOT_REQUIRED");
  return resolve(value);
}

async function writeJson(path, value, { exclusive = true } = {}) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    ...(exclusive ? { flag: "wx" } : {}),
  });
}

async function writeBytes(path, value, { exclusive = true } = {}) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, value, { mode: 0o600, ...(exclusive ? { flag: "wx" } : {}) });
}

async function readBoundedFile(path, maximumBytes) {
  const target = resolve(path);
  const metadata = await lstat(target);
  if (
    !metadata.isFile() ||
    metadata.size < 1 ||
    metadata.size > maximumBytes ||
    !Number.isSafeInteger(metadata.size)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_SIZE_REFUSED");
  const bytes = await readFile(target);
  if (bytes.byteLength !== metadata.size)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_CHANGED_DURING_READ");
  return bytes;
}

function decodeUtf8(bytes, label = "FILE") {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_${label}_UTF8_REFUSED`, { cause: error });
  }
}

async function readJson(path, maximumBytes = 8 * 1024 * 1024) {
  return JSON.parse(decodeUtf8(await readBoundedFile(path, maximumBytes), "JSON"));
}

async function verifiedDirectoryRoot(value) {
  const target = exactRoot(value);
  const metadata = await lstat(target);
  if (!metadata.isDirectory() || metadata.isSymbolicLink())
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_DIRECTORY_ROOT_REFUSED");
  return target;
}

async function fileSha256(path) {
  return createHash("sha256")
    .update(await readBoundedFile(resolve(path), STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes))
    .digest("hex");
}

async function appendOutput(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  const lines = Object.entries(values).map(([name, value]) => `${name}=${value}\n`);
  await writeFile(process.env.GITHUB_OUTPUT, lines.join(""), { encoding: "utf8", flag: "a" });
}

function publicEvent(event, fields = {}) {
  console.log(JSON.stringify({ event, ...fields, secretsDisclosed: false }));
}

async function walkFiles(root, current = root, files = []) {
  if (current === root) {
    const rootMetadata = await lstat(root);
    if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink())
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_ROOT_REFUSED");
  }
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_SYMLINK_REFUSED");
    if (metadata.isDirectory()) await walkFiles(root, path, files);
    else if (metadata.isFile()) files.push(path);
    else throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_ENTRY_REFUSED");
  }
  return files;
}

async function findUnique(root, name) {
  const matches = (await walkFiles(root)).filter((path) => basename(path) === name);
  if (matches.length !== 1)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_FILE_REFUSED:${name}:${matches.length}`);
  return matches[0];
}

async function directoryRecords(root, { excluded = [] } = {}) {
  const base = exactRoot(root);
  const excludedSet = new Set(excluded);
  const records = [];
  for (const path of await walkFiles(base)) {
    const relativePath = relative(base, path).replaceAll("\\", "/");
    if (
      !relativePath ||
      relativePath.startsWith("../") ||
      relativePath.includes("/../") ||
      /[\r\n\0]/.test(relativePath)
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_PATH_REFUSED");
    if (excludedSet.has(relativePath)) continue;
    const bytes = await readBoundedFile(path, STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes);
    records.push({ path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) });
  }
  records.sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)));
  return { records, treeSha256: canonicalSha256(records) };
}

function parseBuildAttestation(value) {
  const text = String(value ?? "");
  if (!text.endsWith("\n") || Buffer.byteLength(text, "utf8") > 16_384 || /\r|\0/.test(text))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUILD_ATTESTATION_REFUSED");
  const entries = {};
  for (const line of text.slice(0, -1).split("\n")) {
    const match = /^([A-Z][A-Z0-9_]*)=([^\n]*)$/.exec(line);
    if (!match || Object.hasOwn(entries, match[1]))
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUILD_ATTESTATION_REFUSED");
    entries[match[1]] = match[2];
  }
  return entries;
}

function expectedAttestationKeys() {
  return [
    "BUNDLE_COMMAND_SHA256",
    "BUILDER_SCRIPT_SHA256",
    "CANDIDATE_SHA",
    "DENO_CONFIG_SHA256",
    "DENO_LOCK_SHA256",
    "EDGE_RUNTIME_AMD64_DIGEST",
    "EDGE_RUNTIME_INDEX_DIGEST",
    "ESZIP_VALIDATED",
    "EVENT",
    "IMPORT_MAP_SHA256",
    "INPUT_FILE_COUNT",
    "INPUT_FILES_MANIFEST_SHA256",
    "INPUT_MANIFEST_SHA256",
    "INPUT_TREE_SHA256",
    "MODE",
    "NETWORK",
    "PLATFORM",
    "RAW_ESZIP_BYTES",
    "RAW_ESZIP_SHA256",
    "SCHEMA_VERSION",
    "SOURCE_SHA256",
    "UNBUNDLED_COMMAND_SHA256",
    "UNBUNDLED_FILE_COUNT",
    "UNBUNDLED_FILES_SHA256",
  ].sort();
}

async function loadBundleInput(root) {
  const inputRoot = await verifiedDirectoryRoot(root);
  const manifestPath = join(inputRoot, "bundle-input-manifest.json");
  const filesPath = join(inputRoot, "bundle-input-files.json");
  const denoConfigPath = join(inputRoot, "deno.json");
  const denoLockPath = join(inputRoot, "deno.lock");
  const importMapPath = join(inputRoot, "supabase", "functions", "import_map.json");
  const [
    manifest,
    files,
    manifestSha256,
    filesManifestSha256,
    actual,
    denoConfig,
    denoConfigSha256,
    denoLockSha256,
    importMap,
    importMapSha256,
  ] = await Promise.all([
    readJson(manifestPath),
    readJson(filesPath),
    fileSha256(manifestPath),
    fileSha256(filesPath),
    directoryRecords(inputRoot, {
      excluded: ["bundle-input-manifest.json", "bundle-input-files.json"],
    }),
    readJson(denoConfigPath),
    fileSha256(denoConfigPath),
    fileSha256(denoLockPath),
    readJson(importMapPath),
    fileSha256(importMapPath),
  ]);
  const expectedImports = { zod: "npm:zod@4.4.3" };
  const expectedDenoConfig = {
    imports: expectedImports,
    lock: { path: "./deno.lock", frozen: true },
    nodeModulesDir: "none",
  };
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.event !== "g12.staging.cms_public_hotfix.bundle_input" ||
    manifest?.candidateSha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixSha ||
    manifest?.sourceSha256 !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256 ||
    productionFunctionSourceDigest(inputRoot, "cms-public") !==
      STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256 ||
    denoLockSha256 !== STAGING_CMS_PUBLIC_HOTFIX.denoLockSha256 ||
    manifest?.denoLockSha256 !== denoLockSha256 ||
    importMapSha256 !== STAGING_CMS_PUBLIC_HOTFIX.importMapSha256 ||
    manifest?.importMapSha256 !== importMapSha256 ||
    manifest?.denoConfigSha256 !== denoConfigSha256 ||
    canonicalSha256(denoConfig) !== canonicalSha256(expectedDenoConfig) ||
    canonicalSha256(importMap) !== canonicalSha256({ imports: expectedImports }) ||
    manifest?.filesManifestSha256 !== filesManifestSha256 ||
    manifest?.inputTreeSha256 !== actual.treeSha256 ||
    manifest?.inputFileCount !== actual.records.length ||
    files?.schemaVersion !== 1 ||
    files?.event !== "g12.staging.cms_public_hotfix.bundle_input_files" ||
    files?.treeSha256 !== actual.treeSha256 ||
    files?.count !== actual.records.length ||
    canonicalSha256(files?.files) !== canonicalSha256(actual.records) ||
    manifest?.edgeRuntimeIndexDigest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest ||
    manifest?.edgeRuntimeAmd64Digest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest ||
    manifest?.platform !== "linux/amd64" ||
    manifest?.lockFrozen !== true ||
    manifest?.entrypointPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath ||
    manifest?.importMapPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_INPUT_REFUSED");
  return {
    root: inputRoot,
    manifest,
    files,
    manifestSha256,
    filesManifestSha256,
    actual,
  };
}

async function validateUnbundledManifest(buildRoot) {
  const path = join(buildRoot, "unbundled-files.sha256");
  const bytes = await readBoundedFile(path, 20_000_000);
  const raw = decodeUtf8(bytes, "UNBUNDLED_MANIFEST");
  if (!raw.endsWith("\n") || /\r|\0/.test(raw))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MANIFEST_REFUSED");
  const actual = await directoryRecords(join(buildRoot, "unbundled"));
  if (actual.records.length < 1) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_EMPTY_REFUSED");
  const expected = actual.records.map((record) => `${record.sha256}  ./${record.path}\n`).join("");
  if (raw !== expected) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_UNBUNDLED_MANIFEST_REFUSED");
  return {
    text: raw,
    sha256: sha256Bytes(Buffer.from(raw, "utf8")),
    count: actual.records.length,
  };
}

async function loadCandidateBuildEvidence(root, provenance) {
  const base = await verifiedDirectoryRoot(root);
  const evidence = {};
  for (const mode of ["online", "offline"]) {
    const build = provenance?.builds?.[mode];
    if (
      build?.attestationFile !== `${mode}-build-attestation.env` ||
      build?.unbundledFilesFile !== `${mode}-unbundled-files.sha256`
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUILD_EVIDENCE_PATH_REFUSED");
    evidence[mode] = {
      attestation: await readBoundedFile(join(base, build.attestationFile), 16_384),
      unbundledFiles: await readBoundedFile(join(base, build.unbundledFilesFile), 20_000_000),
    };
  }
  const result = validateCandidateBuildEvidenceFiles(provenance, evidence);
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_BUILD_EVIDENCE_REFUSED:${result.violations.join(",")}`);
  return evidence;
}

async function loadCandidateArtifact(root) {
  const candidateRoot = await verifiedDirectoryRoot(root);
  const [manifest, body] = await Promise.all([
    readJson(join(candidateRoot, "candidate-manifest.json")),
    readBoundedFile(
      join(candidateRoot, "candidate-body.ezbr"),
      STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes,
    ),
  ]);
  if (
    manifest?.schemaVersion !== 1 ||
    manifest?.event !== "g12.staging.cms_public_hotfix.candidate_bundle" ||
    manifest?.candidateSha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixSha ||
    manifest?.sourceSha256 !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256 ||
    manifest?.sha256 !== sha256Bytes(body) ||
    manifest?.bytes !== body.byteLength ||
    !/^[a-f0-9]{64}$/.test(manifest?.rawEszipSha256 ?? "") ||
    manifest?.entrypointPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath ||
    manifest?.importMapPath !== STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath ||
    manifest?.verifyJwt !== false ||
    manifest?.edgeRuntimeIndexDigest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest ||
    manifest?.edgeRuntimeAmd64Digest !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest ||
    manifest?.lockFrozen !== true
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_ARTIFACT_REFUSED");
  const reconciled = reconcileDownloadedBundleBody(body, manifest.sha256);
  if (sha256Bytes(reconciled.rawEszip) !== manifest.rawEszipSha256)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_ESZIP_REFUSED");
  const provenance = validateCandidateBuildProvenance(manifest.provenance, {
    rawEszip: reconciled.rawEszip,
  });
  if (!provenance.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_PROVENANCE_REFUSED:${provenance.violations.join(",")}`,
    );
  const buildEvidence = await loadCandidateBuildEvidence(candidateRoot, manifest.provenance);
  return { root: candidateRoot, manifest, body, reconciled, buildEvidence };
}

async function materializeCandidateEszip() {
  const candidate = await loadCandidateArtifact(argument("candidate"));
  await writeBytes(argument("output"), candidate.reconciled.rawEszip);
  publicEvent("g12.staging.cms_public_hotfix.candidate_eszip_materialized", {
    rawEszipSha256: candidate.manifest.rawEszipSha256,
  });
}

async function verifyRuntimeUnbundle() {
  const candidate = await loadCandidateArtifact(argument("candidate"));
  const unbundledRoot = await verifiedDirectoryRoot(argument("unbundled"));
  const actual = await directoryRecords(unbundledRoot);
  if (actual.records.length < 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_RUNTIME_UNBUNDLE_EMPTY_REFUSED");
  const manifest = Buffer.from(
    actual.records.map((record) => `${record.sha256}  ./${record.path}\n`).join(""),
    "utf8",
  );
  if (
    !manifest.equals(candidate.buildEvidence.online.unbundledFiles) ||
    !manifest.equals(candidate.buildEvidence.offline.unbundledFiles)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_RUNTIME_UNBUNDLE_MISMATCH");
  publicEvent("g12.staging.cms_public_hotfix.runtime_unbundle_verified", {
    fileCount: actual.records.length,
    manifestSha256: sha256Bytes(manifest),
  });
}

function githubToken() {
  const token = process.env.GITHUB_TOKEN ?? "";
  if (token.length < 30 || process.env.GITHUB_REPOSITORY !== STAGING_CMS_PUBLIC_HOTFIX.repository)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_GITHUB_INPUT_REFUSED");
  return token;
}

async function github(path, { allowNotFound = false } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${githubToken()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 2_000_000)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_GITHUB_RESPONSE_SIZE_REFUSED");
  if (allowNotFound && response.status === 404) return null;
  if (!response.ok)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_GITHUB_REQUEST_REFUSED:${response.status}`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_GITHUB_RESPONSE_REFUSED", { cause: error });
  }
}

async function remoteRecoveryState(kind, expected) {
  const variable = recoveryStateVariableName(kind);
  const payload = await github(
    `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/variables/${variable}`,
    { allowNotFound: true },
  );
  if (payload === null) return null;
  if (
    payload?.name !== variable ||
    typeof payload?.value !== "string" ||
    Buffer.byteLength(payload.value, "utf8") > 47_000
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_REMOTE_STATE_REFUSED:${kind}`);
  let wrapper;
  try {
    wrapper = JSON.parse(payload.value);
  } catch (error) {
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_REMOTE_STATE_REFUSED:${kind}`, {
      cause: error,
    });
  }
  const result = verifyRecoveryStateVariable(wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    kind,
    ...expected,
  });
  if (!result.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_REMOTE_STATE_REFUSED:${kind}:${result.violations.join(",")}`,
    );
  return result.state;
}

async function assertRemoteTerminalDomain(state, outcome, chain) {
  const expected = {
    runId: state.workflow.runId,
    runAttempt: state.workflow.runAttempt,
    controlSha: state.workflow.controlSha,
  };
  const [main, candidateIntent, rollbackIntent] = await Promise.all([
    remoteRecoveryState("staging-cms-public-hotfix", expected),
    remoteRecoveryState("staging-cms-public-hotfix-candidate-intent", expected),
    remoteRecoveryState("staging-cms-public-hotfix-rollback-intent", expected),
  ]);
  const expectedCandidate = outcome === "baseline" ? null : chain.candidateIntent?.wrapper;
  const expectedRollback = outcome === "restored" ? chain.rollbackIntent?.wrapper : null;
  if (
    !main ||
    canonicalSha256(main) !== canonicalSha256(state) ||
    Boolean(candidateIntent) !== Boolean(expectedCandidate) ||
    (candidateIntent && canonicalSha256(candidateIntent) !== canonicalSha256(expectedCandidate)) ||
    Boolean(rollbackIntent) !== Boolean(expectedRollback) ||
    (rollbackIntent && canonicalSha256(rollbackIntent) !== canonicalSha256(expectedRollback))
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_REMOTE_DOMAIN_REFUSED:${outcome}`);
}

async function assertRemoteTerminalCleanupDomain(state, outcome, chain) {
  const expected = {
    runId: state.workflow.runId,
    runAttempt: state.workflow.runAttempt,
    controlSha: state.workflow.controlSha,
  };
  const hotfixKinds = new Set([
    "staging-cms-public-hotfix",
    "staging-cms-public-hotfix-candidate-intent",
    "staging-cms-public-hotfix-rollback-intent",
  ]);
  const foreignKinds = STAGING_RECOVERY_KINDS.filter((kind) => !hotfixKinds.has(kind));
  const [main, candidateIntent, rollbackIntent, foreignStates] = await Promise.all([
    remoteRecoveryState("staging-cms-public-hotfix", expected),
    remoteRecoveryState("staging-cms-public-hotfix-candidate-intent", expected),
    remoteRecoveryState("staging-cms-public-hotfix-rollback-intent", expected),
    Promise.all(foreignKinds.map((kind) => remoteRecoveryState(kind, expected))),
  ]);
  const plan = planHotfixTerminalCleanup({
    outcome,
    main: Boolean(main),
    candidateIntent: Boolean(candidateIntent),
    rollbackIntent: Boolean(rollbackIntent),
  });
  const expectedCandidate = chain.candidateIntent?.wrapper;
  const expectedRollback = outcome === "restored" ? chain.rollbackIntent?.wrapper : null;
  if (
    !plan.valid ||
    plan.phase === "complete" ||
    foreignStates.some(Boolean) ||
    (main && canonicalSha256(main) !== canonicalSha256(state)) ||
    (candidateIntent &&
      (!expectedCandidate || canonicalSha256(candidateIntent) !== canonicalSha256(expectedCandidate))) ||
    (rollbackIntent &&
      (!expectedRollback || canonicalSha256(rollbackIntent) !== canonicalSha256(expectedRollback)))
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_CLEANUP_DOMAIN_REFUSED:${outcome}:${plan.phase}`);
  return plan;
}

async function assertRemoteMutationDomain(state, action, chain) {
  if (!["candidate", "rollback"].includes(action))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_MUTATION_ACTION_REFUSED");
  const expected = {
    runId: state.workflow.runId,
    runAttempt: state.workflow.runAttempt,
    controlSha: state.workflow.controlSha,
  };
  const [main, candidateIntent, rollbackIntent] = await Promise.all([
    remoteRecoveryState("staging-cms-public-hotfix", expected),
    remoteRecoveryState("staging-cms-public-hotfix-candidate-intent", expected),
    remoteRecoveryState("staging-cms-public-hotfix-rollback-intent", expected),
  ]);
  const expectedCandidate = chain.candidateIntent?.wrapper ?? chain.candidateIntent;
  const expectedRollback = chain.rollbackIntent?.wrapper ?? chain.rollbackIntent;
  const valid =
    main &&
    canonicalSha256(main) === canonicalSha256(state) &&
    expectedCandidate &&
    candidateIntent &&
    canonicalSha256(candidateIntent) === canonicalSha256(expectedCandidate) &&
    (action === "candidate"
      ? rollbackIntent === null
      : expectedRollback &&
        rollbackIntent &&
        canonicalSha256(rollbackIntent) === canonicalSha256(expectedRollback));
  if (!valid) throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_MUTATION_REMOTE_DOMAIN_REFUSED:${action}`);
}

function expectedRunArtifactNames(runId, runAttempt) {
  const suffix = `${runId}-${runAttempt}`;
  return {
    candidate: `staging-cms-public-hotfix-candidate-${suffix}`,
    recovery: `staging-cms-public-hotfix-recovery-${suffix}`,
    state: `staging-cms-public-hotfix-state-${suffix}`,
    candidateIntent: `staging-cms-public-hotfix-candidate-intent-${suffix}`,
    rollbackIntent: `staging-cms-public-hotfix-rollback-intent-${suffix}`,
    candidateReceipt: `staging-cms-public-hotfix-candidate-receipt-${suffix}`,
    rollbackReceipt: `staging-cms-public-hotfix-rollback-receipt-${suffix}`,
    promotedTerminal: `staging-cms-public-hotfix-promoted-${suffix}`,
    recoveryTerminal: `staging-cms-public-hotfix-recovered-${suffix}`,
  };
}

function workflowName(path) {
  return {
    [STAGING_CMS_PUBLIC_HOTFIX.workflowPath]: STAGING_CMS_PUBLIC_HOTFIX.workflowName,
    [STAGING_CMS_PUBLIC_HOTFIX.watchdogPath]: STAGING_CMS_PUBLIC_HOTFIX.watchdogName,
  }[path];
}

function validateControlRun(run, { runId, runAttempt, controlSha, workflowPath }) {
  const name = workflowName(workflowPath);
  const allowedEvents =
    workflowPath === STAGING_CMS_PUBLIC_HOTFIX.workflowPath ? ["workflow_dispatch"] : ["workflow_run"];
  return (
    Boolean(name) &&
    (workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.workflowPath || Number(runAttempt) === 1) &&
    String(run?.id ?? "") === String(runId) &&
    Number(run?.run_attempt) === Number(runAttempt) &&
    run?.name === name &&
    run?.path === workflowPath &&
    allowedEvents.includes(run?.event) &&
    run?.head_branch === "main" &&
    run?.head_sha === controlSha &&
    run?.repository?.full_name === STAGING_CMS_PUBLIC_HOTFIX.repository &&
    run?.head_repository?.full_name === STAGING_CMS_PUBLIC_HOTFIX.repository
  );
}

function validateRunArtifact(artifact, { id, name, digest, runId, controlSha }, run) {
  const createdAt = Date.parse(artifact?.created_at ?? "");
  const runStartedAt = Date.parse(run?.run_started_at ?? "");
  return (
    String(artifact?.id ?? "") === String(id) &&
    artifact?.name === name &&
    normalizeGithubArtifactDigest(artifact?.digest) === normalizeGithubArtifactDigest(digest) &&
    artifact?.expired === false &&
    Number.isSafeInteger(artifact?.size_in_bytes) &&
    artifact.size_in_bytes > 0 &&
    Number.isFinite(createdAt) &&
    Number.isFinite(runStartedAt) &&
    createdAt >= runStartedAt &&
    String(artifact?.workflow_run?.id ?? "") === String(runId) &&
    artifact?.workflow_run?.head_branch === "main" &&
    artifact?.workflow_run?.head_sha === controlSha
  );
}

async function verifyRunArtifact() {
  const runId = argument("run-id");
  const runAttempt = Number(argument("run-attempt"));
  const kind = argument("kind");
  const workflowPath = argument("workflow-path");
  const derivedName = expectedRunArtifactNames(runId, runAttempt)[kind];
  const suppliedName = argument("artifact-name");
  const boundRecoveryTerminal = new RegExp(
    `^staging-cms-public-hotfix-recovered-${runId}-${runAttempt}-receipt-([1-9]\\d*)$`,
  ).exec(suppliedName);
  const expectedReceiptArtifactId = argument("receipt-artifact-id", { required: false });
  const validName =
    (suppliedName === derivedName && !expectedReceiptArtifactId) ||
    (kind === "recoveryTerminal" &&
      workflowPath === STAGING_CMS_PUBLIC_HOTFIX.watchdogPath &&
      Boolean(boundRecoveryTerminal) &&
      boundRecoveryTerminal[1] === expectedReceiptArtifactId);
  const expected = {
    id: argument("artifact-id"),
    name: suppliedName,
    digest: normalizeGithubArtifactDigest(argument("artifact-digest")),
    runId,
    runAttempt,
    controlSha: argument("control-sha"),
    workflowPath,
  };
  if (
    !derivedName ||
    !validName ||
    !/^[1-9]\d*$/.test(expected.id) ||
    !/^sha256:[a-f0-9]{64}$/.test(expected.digest) ||
    !/^[1-9]\d*$/.test(expected.runId) ||
    !Number.isSafeInteger(expected.runAttempt) ||
    expected.runAttempt < 1 ||
    !workflowName(expected.workflowPath) ||
    !/^[a-f0-9]{40}$/.test(expected.controlSha)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_INPUT_REFUSED");
  const [artifact, run] = await Promise.all([
    github(`/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/artifacts/${expected.id}`),
    github(`/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${runId}/attempts/${runAttempt}`),
  ]);
  if (!validateRunArtifact(artifact, expected, run) || !validateControlRun(run, expected))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_REFUSED");
  publicEvent("g12.staging.cms_public_hotfix.artifact_verified", {
    artifactId: expected.id,
    artifactName: expected.name,
  });
}

async function fetchResolvedRunArtifacts({
  runId,
  runAttempt,
  controlSha,
  path: workflowPath = STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
}) {
  if (
    !/^[1-9]\d*$/.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt < 1 ||
    !/^[a-f0-9]{40}$/.test(controlSha)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_RUN_REFUSED");
  const run = await github(
    `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${runId}/attempts/${runAttempt}`,
  );
  if (
    !validateControlRun(run, {
      runId,
      runAttempt,
      controlSha,
      workflowPath,
    })
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_RUN_METADATA_REFUSED");
  const artifacts = [];
  let totalCount;
  for (let page = 1; page <= 100; page += 1) {
    const response = await github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${runId}/artifacts?per_page=100&page=${page}`,
    );
    const pageArtifacts = Array.isArray(response?.artifacts) ? response.artifacts : null;
    if (
      !pageArtifacts ||
      !Number.isSafeInteger(response?.total_count) ||
      response.total_count < 0 ||
      (totalCount !== undefined && response.total_count !== totalCount)
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_INVENTORY_REFUSED");
    totalCount ??= response.total_count;
    artifacts.push(...pageArtifacts);
    if (artifacts.length >= totalCount || pageArtifacts.length === 0) break;
  }
  if (
    artifacts.length !== totalCount ||
    new Set(artifacts.map((artifact) => String(artifact?.id ?? ""))).size !== artifacts.length
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_INVENTORY_REFUSED");
  const names = expectedRunArtifactNames(runId, runAttempt);
  const knownName =
    /^staging-cms-public-hotfix-(candidate|recovery|state|candidate-intent|rollback-intent|candidate-receipt|rollback-receipt|promoted|recovered)-([1-9]\d*)-([1-9]\d*)(?:-receipt-([1-9]\d*))?$/;
  for (const artifact of artifacts) {
    const match = knownName.exec(String(artifact?.name ?? ""));
    if (artifact?.name?.startsWith("staging-cms-public-hotfix-") && !match)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_NAME_REFUSED");
    if (
      match &&
      (match[2] !== String(runId) ||
        (match[4] && (match[1] !== "recovered" || workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.watchdogPath)))
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_RUN_NAME_REFUSED");
  }
  const resolved = {};
  for (const [kind, name] of Object.entries(names)) {
    const matches = artifacts.filter((artifact) => artifact?.name === name);
    if (matches.length > 1) throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_DUPLICATE:${kind}`);
    const artifact = matches[0];
    if (!artifact) {
      resolved[kind] = null;
      continue;
    }
    const expected = {
      id: String(artifact.id ?? ""),
      name,
      digest: artifact.digest,
      runId,
      controlSha,
    };
    if (
      !/^[1-9]\d*$/.test(expected.id) ||
      !/^sha256:[a-f0-9]{64}$/.test(expected.digest ?? "") ||
      !validateRunArtifact(artifact, expected, run)
    )
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_METADATA_REFUSED:${kind}`);
    resolved[kind] = { id: expected.id, name, digest: expected.digest };
  }
  return {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.artifacts_resolved",
    workflow: { runId, runAttempt, controlSha, path: workflowPath },
    artifacts: resolved,
  };
}

async function resolveRunArtifacts() {
  const report = {
    ...(await fetchResolvedRunArtifacts({
      runId: argument("run-id"),
      runAttempt: Number(argument("run-attempt")),
      controlSha: argument("control-sha"),
      path: argument("workflow-path", { required: false }) || STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
    })),
    resolvedAt: new Date().toISOString(),
  };
  await writeJson(argument("output"), report);
  const outputs = {};
  for (const [kind, artifact] of Object.entries(report.artifacts)) {
    const prefix = kind.replaceAll(/[A-Z]/g, (character) => `_${character.toLowerCase()}`);
    outputs[`${prefix}_present`] = Boolean(artifact);
    if (artifact) {
      outputs[`${prefix}_id`] = artifact.id;
      outputs[`${prefix}_digest`] = artifact.digest;
    }
  }
  await appendOutput(outputs);
  await appendOutput({ artifact_inventory_sha256: canonicalSha256(report.artifacts) });
  publicEvent(report.event, {
    runId: report.workflow.runId,
    artifactCount: Object.values(report.artifacts).filter(Boolean).length,
  });
}

async function fetchWatchdogArtifacts(state, rollbackIntentWrapper) {
  const stateResult = validateHotfixRecoveryState(state);
  if (!stateResult.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STATE_REFUSED:${stateResult.violations.join(",")}`);
  const intentResult = verifyHotfixIntent(rollbackIntentWrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action: "rollback",
  });
  if (!intentResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_INTENT_REFUSED:${intentResult.violations.join(",")}`,
    );
  const owner = intentResult.intent.preparedBy;
  if (owner.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.watchdogPath)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_OWNER_REFUSED");
  const ownerRun = await github(
    `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${owner.runId}/attempts/${owner.runAttempt}`,
  );
  if (!validateControlRun(ownerRun, { ...owner, controlSha: owner.runSha }))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_RUN_REFUSED");
  const artifacts = [];
  let totalCount;
  for (let page = 1; page <= 100; page += 1) {
    const response = await github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${owner.runId}/artifacts?per_page=100&page=${page}`,
    );
    const pageArtifacts = Array.isArray(response?.artifacts) ? response.artifacts : null;
    if (
      !pageArtifacts ||
      !Number.isSafeInteger(response?.total_count) ||
      response.total_count < 0 ||
      (totalCount !== undefined && response.total_count !== totalCount)
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_INVENTORY_REFUSED");
    totalCount ??= response.total_count;
    artifacts.push(...pageArtifacts);
    if (artifacts.length >= totalCount || pageArtifacts.length === 0) break;
  }
  if (
    artifacts.length !== totalCount ||
    new Set(artifacts.map((artifact) => String(artifact?.id ?? ""))).size !== artifacts.length
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_INVENTORY_REFUSED");
  const intentName = expectedRunArtifactNames(owner.runId, owner.runAttempt).rollbackIntent;
  const intentMatches = artifacts.filter((artifact) => artifact?.name === intentName);
  const receiptPattern = new RegExp(
    `^staging-cms-public-hotfix-rollback-receipt-${owner.runId}-([1-9]\\d*)$`,
  );
  const terminalPattern = new RegExp(
    `^staging-cms-public-hotfix-recovered-${owner.runId}-([1-9]\\d*)-receipt-([1-9]\\d*)$`,
  );
  const receiptMatches = artifacts
    .map((artifact) => ({ artifact, match: receiptPattern.exec(String(artifact?.name ?? "")) }))
    .filter((entry) => entry.match);
  const terminalMatches = artifacts
    .map((artifact) => ({ artifact, match: terminalPattern.exec(String(artifact?.name ?? "")) }))
    .filter((entry) => entry.match);
  if (
    intentMatches.length !== 1 ||
    new Set(receiptMatches.map((entry) => entry.match[1])).size !== receiptMatches.length ||
    new Set(terminalMatches.map((entry) => entry.match[1])).size !== terminalMatches.length
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_CARDINALITY_REFUSED");
  const validateOwnedArtifact = async (artifact, runAttempt, name) => {
    const run = await github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${owner.runId}/attempts/${runAttempt}`,
    );
    const expected = {
      id: String(artifact?.id ?? ""),
      name,
      digest: artifact?.digest,
      runId: owner.runId,
      runAttempt,
      controlSha: owner.runSha,
      workflowPath: STAGING_CMS_PUBLIC_HOTFIX.watchdogPath,
    };
    if (
      !/^[1-9]\d*$/.test(expected.id) ||
      !/^sha256:[a-f0-9]{64}$/.test(expected.digest ?? "") ||
      !validateControlRun(run, expected) ||
      !validateRunArtifact(artifact, expected, run)
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_REFUSED");
    return {
      id: expected.id,
      name,
      digest: expected.digest,
      owner: {
        runId: String(owner.runId),
        runAttempt: Number(runAttempt),
        runSha: owner.runSha,
        controlSha: owner.controlSha,
        workflowPath: STAGING_CMS_PUBLIC_HOTFIX.watchdogPath,
      },
    };
  };
  const rollbackIntent = await validateOwnedArtifact(intentMatches[0], owner.runAttempt, intentName);
  const rollbackReceipts = await Promise.all(
    receiptMatches.map(({ artifact, match }) =>
      validateOwnedArtifact(artifact, Number(match[1]), artifact.name),
    ),
  );
  const recoveryTerminals = await Promise.all(
    terminalMatches.map(async ({ artifact, match }) => ({
      ...(await validateOwnedArtifact(artifact, Number(match[1]), artifact.name)),
      receiptArtifactId: match[2],
    })),
  );
  const chain = selectHotfixWatchdogArtifactChain({ rollbackReceipts, recoveryTerminals });
  if (!chain.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_CHAIN_REFUSED:${chain.violations.join(",")}`,
    );
  const { rollbackReceipt, recoveryTerminal } = chain;
  return {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.watchdog_artifacts_resolved",
    stateSha256: canonicalSha256(state),
    rollbackIntentSha256: canonicalSha256(rollbackIntentWrapper),
    preparedBy: owner,
    artifacts: { rollbackIntent, rollbackReceipt, recoveryTerminal },
  };
}

async function resolveWatchdogArtifacts() {
  const state = await readJson(argument("state"));
  const rollbackIntent = await readJson(argument("rollback-intent"));
  const report = {
    ...(await fetchWatchdogArtifacts(state, rollbackIntent)),
    resolvedAt: new Date().toISOString(),
  };
  await writeJson(argument("output"), report);
  await appendOutput({
    rollback_intent_present: "true",
    rollback_intent_id: report.artifacts.rollbackIntent.id,
    rollback_intent_digest: report.artifacts.rollbackIntent.digest,
    rollback_intent_owner_run_id: report.artifacts.rollbackIntent.owner.runId,
    rollback_intent_owner_run_attempt: report.artifacts.rollbackIntent.owner.runAttempt,
    rollback_intent_owner_run_sha: report.artifacts.rollbackIntent.owner.runSha,
    rollback_intent_owner_control_sha: report.artifacts.rollbackIntent.owner.controlSha,
    rollback_intent_owner_workflow_path: report.artifacts.rollbackIntent.owner.workflowPath,
    rollback_receipt_present: String(Boolean(report.artifacts.rollbackReceipt)),
    ...(report.artifacts.rollbackReceipt
      ? {
          rollback_receipt_id: report.artifacts.rollbackReceipt.id,
          rollback_receipt_digest: report.artifacts.rollbackReceipt.digest,
          rollback_receipt_owner_run_id: report.artifacts.rollbackReceipt.owner.runId,
          rollback_receipt_owner_run_attempt: report.artifacts.rollbackReceipt.owner.runAttempt,
          rollback_receipt_owner_run_sha: report.artifacts.rollbackReceipt.owner.runSha,
          rollback_receipt_owner_control_sha: report.artifacts.rollbackReceipt.owner.controlSha,
          rollback_receipt_owner_workflow_path: report.artifacts.rollbackReceipt.owner.workflowPath,
          rollback_receipt_run_attempt: report.artifacts.rollbackReceipt.owner.runAttempt,
        }
      : {}),
    recovery_terminal_present: String(Boolean(report.artifacts.recoveryTerminal)),
    ...(report.artifacts.recoveryTerminal
      ? {
          recovery_terminal_id: report.artifacts.recoveryTerminal.id,
          recovery_terminal_digest: report.artifacts.recoveryTerminal.digest,
          recovery_terminal_owner_run_id: report.artifacts.recoveryTerminal.owner.runId,
          recovery_terminal_owner_run_attempt: report.artifacts.recoveryTerminal.owner.runAttempt,
          recovery_terminal_owner_run_sha: report.artifacts.recoveryTerminal.owner.runSha,
          recovery_terminal_owner_control_sha: report.artifacts.recoveryTerminal.owner.controlSha,
          recovery_terminal_owner_workflow_path: report.artifacts.recoveryTerminal.owner.workflowPath,
        }
      : {}),
  });
  publicEvent(report.event, {
    ownerRunId: report.preparedBy.runId,
    ownerRunAttempt: report.preparedBy.runAttempt,
    receiptPresent: Boolean(report.artifacts.rollbackReceipt),
    terminalPresent: Boolean(report.artifacts.recoveryTerminal),
  });
}

async function loadWatchdogArtifactInventory(path, state, rollbackIntentPath) {
  const [report, rollbackIntent] = await Promise.all([readJson(path), readJson(rollbackIntentPath)]);
  const fresh = await fetchWatchdogArtifacts(state, rollbackIntent);
  if (
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.staging.cms_public_hotfix.watchdog_artifacts_resolved" ||
    report?.stateSha256 !== fresh.stateSha256 ||
    report?.rollbackIntentSha256 !== fresh.rollbackIntentSha256 ||
    canonicalSha256(report?.preparedBy) !== canonicalSha256(fresh.preparedBy) ||
    canonicalSha256(report?.artifacts) !== canonicalSha256(fresh.artifacts)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_ARTIFACT_INVENTORY_STALE_REFUSED");
  return fresh.artifacts;
}

async function loadResolvedArtifactInventory(path, expectedWorkflow, { requireCore = false } = {}) {
  const report = await readJson(path);
  const fresh = await fetchResolvedRunArtifacts(expectedWorkflow);
  if (
    report?.schemaVersion !== 1 ||
    report?.event !== "g12.staging.cms_public_hotfix.artifacts_resolved" ||
    canonicalSha256(report?.workflow) !== canonicalSha256(fresh.workflow) ||
    canonicalSha256(report?.artifacts) !== canonicalSha256(fresh.artifacts)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_INVENTORY_STALE_REFUSED");
  if (requireCore)
    for (const kind of ["candidate", "recovery", "state"])
      if (!fresh.artifacts[kind]) throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_REQUIRED:${kind}`);
  return fresh.artifacts;
}

async function artifactBoundEvidence(state, argumentNames) {
  const stateResult = validateHotfixRecoveryState(state);
  if (!stateResult.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STATE_REFUSED:${stateResult.violations.join(",")}`);
  const parentArtifacts = await loadResolvedArtifactInventory(argument("artifacts"), state.workflow, {
    requireCore: true,
  });
  let successorArtifacts = Object.fromEntries(
    Object.keys(expectedRunArtifactNames("1", 1)).map((name) => [name, null]),
  );
  const successorPath = argument("successor-artifacts", { required: false });
  if (successorPath) {
    const successorReport = await readJson(successorPath);
    if (successorReport?.event === "g12.staging.cms_public_hotfix.watchdog_artifacts_resolved") {
      const rollbackIntentPath = argument(argumentNames.rollbackIntent, { required: false });
      if (!rollbackIntentPath) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_WATCHDOG_INTENT_PATH_REQUIRED");
      Object.assign(
        successorArtifacts,
        await loadWatchdogArtifactInventory(successorPath, state, rollbackIntentPath),
      );
    } else {
      const executor = currentExecutor(argument("executor-workflow"), state.workflow.controlSha);
      if (executor.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.watchdogPath)
        throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_SUCCESSOR_ROLE_REFUSED");
      successorArtifacts = await loadResolvedArtifactInventory(successorPath, {
        runId: executor.runId,
        runAttempt: executor.runAttempt,
        controlSha: executor.runSha,
        path: executor.workflowPath,
      });
    }
  }
  for (const kind of ["candidate", "recovery", "state", "candidateIntent", "candidateReceipt"])
    if (successorArtifacts[kind])
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_SUCCESSOR_ARTIFACT_ROLE_REFUSED:${kind}`);
  const artifacts = {};
  for (const kind of Object.keys(parentArtifacts)) {
    if (parentArtifacts[kind] && successorArtifacts[kind])
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_PROVENANCE_AMBIGUOUS:${kind}`);
    artifacts[kind] = parentArtifacts[kind] ?? successorArtifacts[kind];
  }
  const ignoreUncommittedCandidateIntent =
    argument("ignore-uncommitted-candidate-intent", { required: false }) === "true";
  if (ignoreUncommittedCandidateIntent && artifacts.candidateIntent) {
    const executor = currentExecutor(argument("executor-workflow"), state.workflow.controlSha);
    if (
      executor.workflowPath !== STAGING_CMS_PUBLIC_HOTFIX.watchdogPath ||
      artifacts.candidateReceipt ||
      artifacts.rollbackIntent ||
      artifacts.rollbackReceipt ||
      artifacts.promotedTerminal ||
      artifacts.recoveryTerminal ||
      argument(argumentNames.candidateIntent, { required: false })
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_UNCOMMITTED_INTENT_IGNORE_REFUSED");
    const expected = {
      runId: state.workflow.runId,
      runAttempt: state.workflow.runAttempt,
      controlSha: state.workflow.controlSha,
    };
    const [main, candidateIntent, rollbackIntent] = await Promise.all([
      remoteRecoveryState("staging-cms-public-hotfix", expected),
      remoteRecoveryState("staging-cms-public-hotfix-candidate-intent", expected),
      remoteRecoveryState("staging-cms-public-hotfix-rollback-intent", expected),
    ]);
    if (
      !main ||
      canonicalSha256(main) !== canonicalSha256(state) ||
      candidateIntent !== null ||
      rollbackIntent !== null
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_UNCOMMITTED_INTENT_REMOTE_REFUSED");
    artifacts.candidateIntent = null;
  }
  const paths = {};
  for (const [kind, argumentName] of Object.entries(argumentNames)) {
    const path = argument(argumentName, { required: false });
    if (Boolean(artifacts[kind]) !== Boolean(path))
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ARTIFACT_EVIDENCE_MISMATCH:${kind}`);
    paths[kind] = path;
  }
  return { artifacts, paths };
}

function supabaseToken() {
  const token = process.env.SUPABASE_ACCESS_TOKEN ?? "";
  if (!token.startsWith("sbp_") || token.length < 24)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_SUPABASE_TOKEN_REFUSED");
  return token;
}

function managementUrl(path, query = {}) {
  const url = new URL(`https://api.supabase.com${path}`);
  for (const [name, value] of Object.entries(query)) url.searchParams.set(name, String(value));
  return url;
}

async function managementRequest(
  path,
  { method = "GET", query, body, contentType, accept, retries = method === "GET" ? 4 : 1 } = {},
) {
  if (method !== "GET" && retries !== 1)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_MUTATION_RETRY_REFUSED");
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(managementUrl(path, query), {
        method,
        headers: {
          Authorization: `Bearer ${supabaseToken()}`,
          Accept: accept ?? "application/json",
          "Accept-Encoding": "identity",
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        ...(body === undefined ? {} : { body }),
        signal: AbortSignal.timeout(method === "GET" ? 30_000 : 90_000),
      });
      if (response.ok) return response;
      lastError = new Error(`HTTP_${response.status}`);
      if (method !== "GET" || (![408, 429].includes(response.status) && response.status < 500)) break;
    } catch (error) {
      lastError = error;
      if (method !== "GET") break;
    }
    if (attempt < retries)
      await new Promise((done) => setTimeout(done, Math.min(1_000 * 2 ** (attempt - 1), 8_000)));
  }
  const label = String(lastError instanceof Error ? lastError.message : lastError)
    .replace(/[^A-Za-z0-9_.:-]/g, "_")
    .slice(0, 80);
  throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_MANAGEMENT_REQUEST_FAILED:${method}:${label}`);
}

const functionsPath = `/v1/projects/${STAGING_CMS_PUBLIC_HOTFIX.projectRef}/functions`;
const targetPath = `${functionsPath}/${STAGING_CMS_PUBLIC_HOTFIX.functionSlug}`;

async function liveInventory() {
  return (await managementRequest(functionsPath)).json();
}

async function downloadedLiveBody() {
  const response = await managementRequest(`${targetPath}/body`, {
    // The pinned Supabase CLI also overrides this generated JSON contract with */* so the
    // Management API returns the raw body. Structure plus the trusted SHA are checked afterwards.
    accept: "*/*",
  });
  const maximum = STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes;
  const contentLengthHeader = response.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const contentLength = Number(contentLengthHeader);
    if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > maximum)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BODY_SIZE_REFUSED");
  }
  if (!response.body) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BODY_MISSING");
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximum) {
      await reader.cancel();
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BODY_SIZE_REFUSED");
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BODY_SIZE_REFUSED");
  return Buffer.concat(chunks, total);
}

async function stableLiveRead(expectedBodySha256, { initialInventory, expectedNonTargetSha256 } = {}) {
  const first = functionInventorySnapshot(initialInventory ?? (await liveInventory()));
  if (!first.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STABLE_INVENTORY_REFUSED:${first.violations.join(",")}`);
  if (expectedNonTargetSha256 && first.nonTargetSha256 !== expectedNonTargetSha256)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_STABLE_NON_TARGET_DRIFT");
  const body = reconcileDownloadedBundleBody(await downloadedLiveBody(), expectedBodySha256);
  const second = functionInventorySnapshot(await liveInventory());
  if (!second.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STABLE_INVENTORY_REFUSED:${second.violations.join(",")}`);
  if (
    first.inventorySha256 !== second.inventorySha256 ||
    first.nonTargetSha256 !== second.nonTargetSha256 ||
    !sameFunctionTuple(first.target, second.target) ||
    (expectedNonTargetSha256 && second.nonTargetSha256 !== expectedNonTargetSha256)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_STABLE_READ_DRIFT");
  return { snapshot: second, body };
}

async function loadPackage(root, state) {
  const packageRoot = await verifiedDirectoryRoot(root);
  const manifest = await readJson(join(packageRoot, "package-manifest.json"));
  const [baselineBody, candidateBody, inventory, buildEvidence] = await Promise.all([
    readBoundedFile(
      join(packageRoot, "baseline-body.ezbr"),
      STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes,
    ),
    readBoundedFile(
      join(packageRoot, "candidate-body.ezbr"),
      STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes,
    ),
    readJson(join(packageRoot, "baseline-inventory.json")),
    loadCandidateBuildEvidence(packageRoot, manifest?.candidate?.provenance),
  ]);
  const result = validateRecoveryPackage({
    manifest,
    baselineBody,
    candidateBody,
    inventory,
    buildEvidence,
  });
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PACKAGE_REFUSED:${result.violations.join(",")}`);
  if (state) {
    const stateResult = validateHotfixRecoveryState(state);
    if (!stateResult.valid)
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STATE_REFUSED:${stateResult.violations.join(",")}`);
    if (state.recoveryArtifact.packageManifestSha256 !== canonicalSha256(manifest))
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PACKAGE_STATE_MISMATCH");
    if (
      state.baseline.bodySha256 !== manifest.baseline.sha256 ||
      state.candidate.bodySha256 !== manifest.candidate.sha256 ||
      state.baseline.inventorySha256 !== manifest.inventory.sha256 ||
      state.baseline.nonTargetSha256 !== manifest.inventory.nonTargetSha256
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PACKAGE_BINDING_MISMATCH");
  }
  return {
    root: packageRoot,
    manifest,
    baselineBody,
    candidateBody,
    inventory,
    buildEvidence,
    snapshot: result.snapshot,
  };
}

async function verifySources() {
  const roots = [
    exactRoot(argument("candidate")),
    exactRoot(argument("parent")),
    exactRoot(argument("rollback")),
  ];
  const sourceDigests = roots.map((root) => productionFunctionSourceDigest(root, "cms-public"));
  const lockDigests = await Promise.all(roots.map((root) => fileSha256(join(root, "deno.lock"))));
  const importMapDigests = await Promise.all(
    roots.map((root) => fileSha256(join(root, "supabase", "functions", "import_map.json"))),
  );
  assertExactSourceIdentity({
    candidateSource: sourceDigests[0],
    parentSource: sourceDigests[1],
    rollbackSource: sourceDigests[2],
    lockDigests,
    importMapDigests,
  });
  const inventories = roots.map((root) => sourceDigestInventory(root, PRODUCTION_FUNCTIONS));
  const changedFromParent = PRODUCTION_FUNCTIONS.filter(
    (name) => inventories[0][name] !== inventories[1][name],
  );
  const changedBaselineFromParent = PRODUCTION_FUNCTIONS.filter(
    (name) => inventories[2][name] !== inventories[1][name],
  );
  if (
    JSON.stringify(changedFromParent) !== JSON.stringify(["cms-public"]) ||
    changedBaselineFromParent.length !== 0
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_FUNCTION_SCOPE_REFUSED");
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.sources_verified",
    release: {
      hotfixSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
      parentSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixParentSha,
      rollbackSha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
    },
    cmsPublicSourceDigests: {
      candidate: sourceDigests[0],
      parent: sourceDigests[1],
      rollback: sourceDigests[2],
    },
    lockSha256: lockDigests[0],
    importMapSha256: importMapDigests[0],
    changedFunctions: changedFromParent,
  };
  await writeJson(argument("output"), report);
  publicEvent(report.event, { changedFunctions: report.changedFunctions });
}

async function prepareBundleInput() {
  const source = exactRoot(argument("source"));
  const output = exactRoot(argument("output"));
  if (
    productionFunctionSourceDigest(source, "cms-public") !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_SOURCE_REFUSED");
  if (
    (await fileSha256(join(source, "deno.lock"))) !== STAGING_CMS_PUBLIC_HOTFIX.denoLockSha256 ||
    (await fileSha256(join(source, "supabase", "functions", "import_map.json"))) !==
      STAGING_CMS_PUBLIC_HOTFIX.importMapSha256
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_DEPENDENCY_LOCK_REFUSED");
  for (const name of [".env.local", ".env.staging.local", ".env.production.local"]) {
    try {
      await lstat(join(source, name));
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LOCAL_ENV_REFUSED");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await mkdir(output, { recursive: false, mode: 0o700 });
  await cp(
    join(source, "supabase", "functions", "_shared"),
    join(output, "supabase", "functions", "_shared"),
    {
      recursive: true,
      errorOnExist: true,
      force: false,
    },
  );
  await cp(
    join(source, "supabase", "functions", "cms-public"),
    join(output, "supabase", "functions", "cms-public"),
    {
      recursive: true,
      errorOnExist: true,
      force: false,
    },
  );
  await mkdir(join(output, "src", "shared", "contracts"), { recursive: true, mode: 0o700 });
  await copyFile(
    join(source, "src", "shared", "contracts", "cms-content.ts"),
    join(output, "src", "shared", "contracts", "cms-content.ts"),
  );
  await copyFile(
    join(source, "supabase", "functions", "import_map.json"),
    join(output, "supabase", "functions", "import_map.json"),
  );
  await copyFile(join(source, "deno.lock"), join(output, "deno.lock"));
  const importMap = JSON.parse(
    await readFile(join(source, "supabase", "functions", "import_map.json"), "utf8"),
  );
  if (
    JSON.stringify(Object.keys(importMap).sort()) !== JSON.stringify(["imports"]) ||
    JSON.stringify(importMap.imports) !== JSON.stringify({ zod: "npm:zod@4.4.3" })
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_IMPORT_MAP_REFUSED");
  const denoConfig = {
    imports: importMap.imports,
    lock: { path: "./deno.lock", frozen: true },
    nodeModulesDir: "none",
  };
  await writeJson(join(output, "deno.json"), denoConfig);
  const inputTree = await directoryRecords(output);
  const filesManifest = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.bundle_input_files",
    treeSha256: inputTree.treeSha256,
    count: inputTree.records.length,
    files: inputTree.records,
  };
  const filesManifestPath = join(output, "bundle-input-files.json");
  await writeJson(filesManifestPath, filesManifest);
  const manifest = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.bundle_input",
    candidateSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
    sourceSha256: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
    denoLockSha256: await fileSha256(join(output, "deno.lock")),
    denoConfigSha256: await fileSha256(join(output, "deno.json")),
    importMapSha256: await fileSha256(join(output, "supabase", "functions", "import_map.json")),
    filesManifestSha256: await fileSha256(filesManifestPath),
    inputTreeSha256: inputTree.treeSha256,
    inputFileCount: inputTree.records.length,
    edgeRuntimeIndexDigest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest,
    edgeRuntimeAmd64Digest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest,
    platform: "linux/amd64",
    lockFrozen: true,
    entrypointPath: STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath,
    importMapPath: STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath,
  };
  await writeJson(join(output, "bundle-input-manifest.json"), manifest);
  publicEvent(manifest.event, { candidateSha: manifest.candidateSha, lockFrozen: true });
}

async function sealCandidate() {
  const input = await loadBundleInput(argument("bundle-input"));
  const builderScriptPath = join(
    dirname(fileURLToPath(import.meta.url)),
    "staging-cms-public-hotfix-bundle.sh",
  );
  const builderScriptSha256 = await fileSha256(builderScriptPath);
  if (builderScriptSha256 !== STAGING_CMS_PUBLIC_HOTFIX.builderScriptSha256)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BUILDER_SCRIPT_REFUSED");
  const validateBuild = async (root, mode, network) => {
    const buildRoot = await verifiedDirectoryRoot(root);
    const [eszip, attestationBytes, unbundled] = await Promise.all([
      readBoundedFile(join(buildRoot, "output.eszip"), STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes),
      readBoundedFile(join(buildRoot, "build-attestation.env"), 16_384),
      validateUnbundledManifest(buildRoot),
    ]);
    const attestationText = decodeUtf8(attestationBytes, "BUILD_ATTESTATION");
    const attestation = parseBuildAttestation(attestationText);
    if (
      JSON.stringify(Object.keys(attestation).sort()) !== JSON.stringify(expectedAttestationKeys()) ||
      attestation.SCHEMA_VERSION !== "1" ||
      attestation.EVENT !== "g12.staging.cms_public_hotfix.bundle_attestation" ||
      attestation.MODE !== mode ||
      attestation.NETWORK !== network ||
      attestation.CANDIDATE_SHA !== STAGING_CMS_PUBLIC_HOTFIX.hotfixSha ||
      attestation.SOURCE_SHA256 !== STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256 ||
      attestation.DENO_LOCK_SHA256 !== STAGING_CMS_PUBLIC_HOTFIX.denoLockSha256 ||
      attestation.DENO_CONFIG_SHA256 !== input.manifest.denoConfigSha256 ||
      attestation.IMPORT_MAP_SHA256 !== STAGING_CMS_PUBLIC_HOTFIX.importMapSha256 ||
      attestation.INPUT_MANIFEST_SHA256 !== input.manifestSha256 ||
      attestation.INPUT_FILES_MANIFEST_SHA256 !== input.filesManifestSha256 ||
      attestation.INPUT_TREE_SHA256 !== input.actual.treeSha256 ||
      Number(attestation.INPUT_FILE_COUNT) !== input.actual.records.length ||
      attestation.RAW_ESZIP_SHA256 !== sha256Bytes(eszip) ||
      Number(attestation.RAW_ESZIP_BYTES) !== eszip.byteLength ||
      attestation.UNBUNDLED_FILES_SHA256 !== unbundled.sha256 ||
      Number(attestation.UNBUNDLED_FILE_COUNT) !== unbundled.count ||
      attestation.EDGE_RUNTIME_INDEX_DIGEST !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest ||
      attestation.EDGE_RUNTIME_AMD64_DIGEST !== STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest ||
      attestation.PLATFORM !== "linux/amd64" ||
      attestation.BUNDLE_COMMAND_SHA256 !==
        sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.bundleCommand, "utf8")) ||
      attestation.BUILDER_SCRIPT_SHA256 !== builderScriptSha256 ||
      attestation.UNBUNDLED_COMMAND_SHA256 !==
        sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.unbundleCommand, "utf8")) ||
      attestation.ESZIP_VALIDATED !== "true"
    )
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_${mode.toUpperCase()}_BUILD_REFUSED`);
    const inspection = inspectEszipV2(eszip);
    if (
      inspection.checksum !== "sha256" ||
      !inspection.moduleSpecifiers.includes(STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath) ||
      !inspection.moduleSpecifiers.includes(STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath)
    )
      throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_${mode.toUpperCase()}_ESZIP_REFUSED`);
    return {
      eszip,
      inspection,
      evidence: {
        mode,
        network,
        attestationFile: `${mode}-build-attestation.env`,
        attestationSha256: sha256Bytes(Buffer.from(attestationText, "utf8")),
        unbundledFilesFile: `${mode}-unbundled-files.sha256`,
        unbundledFilesSha256: unbundled.sha256,
        unbundledFileCount: unbundled.count,
        rawEszipSha256: inspection.sha256,
        rawEszipBytes: inspection.bytes,
      },
      attestationText,
      unbundledText: unbundled.text,
    };
  };
  const [online, offline] = await Promise.all([
    validateBuild(argument("online"), "online", "default"),
    validateBuild(argument("offline"), "offline", "none"),
  ]);
  if (
    !online.eszip.equals(offline.eszip) ||
    canonicalSha256(online.inspection) !== canonicalSha256(offline.inspection)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_REPRODUCIBILITY_REFUSED");
  const body = frameRawEszip(online.eszip);
  const provenance = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.bundle_provenance",
    input: {
      manifestSha256: input.manifestSha256,
      filesManifestSha256: input.filesManifestSha256,
      treeSha256: input.actual.treeSha256,
      fileCount: input.actual.records.length,
      denoConfigSha256: input.manifest.denoConfigSha256,
      denoLockSha256: input.manifest.denoLockSha256,
      importMapSha256: input.manifest.importMapSha256,
    },
    builder: {
      edgeRuntimeIndexDigest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest,
      edgeRuntimeAmd64Digest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest,
      platform: "linux/amd64",
      bundleCommandSha256: sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.bundleCommand, "utf8")),
      unbundleCommandSha256: sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.unbundleCommand, "utf8")),
      checksum: "sha256",
      lockFrozen: true,
      builderScriptSha256,
    },
    rawEszip: online.inspection,
    builds: { online: online.evidence, offline: offline.evidence },
    reproducible: true,
  };
  const provenanceResult = validateCandidateBuildProvenance(provenance, {
    rawEszip: online.eszip,
  });
  if (!provenanceResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_BUILD_PROVENANCE_REFUSED:${provenanceResult.violations.join(",")}`,
    );
  const output = exactRoot(argument("output"));
  await mkdir(output, { recursive: true, mode: 0o700 });
  await writeBytes(join(output, "candidate-body.ezbr"), body);
  await Promise.all([
    writeBytes(join(output, online.evidence.attestationFile), Buffer.from(online.attestationText, "utf8")),
    writeBytes(join(output, online.evidence.unbundledFilesFile), Buffer.from(online.unbundledText, "utf8")),
    writeBytes(join(output, offline.evidence.attestationFile), Buffer.from(offline.attestationText, "utf8")),
    writeBytes(join(output, offline.evidence.unbundledFilesFile), Buffer.from(offline.unbundledText, "utf8")),
  ]);
  const manifest = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.candidate_bundle",
    candidateSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
    sourceSha256: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
    sha256: sha256Bytes(body),
    bytes: body.byteLength,
    rawEszipSha256: sha256Bytes(online.eszip),
    entrypointPath: STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath,
    importMapPath: STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath,
    verifyJwt: false,
    edgeRuntimeIndexDigest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest,
    edgeRuntimeAmd64Digest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest,
    lockFrozen: true,
    provenance,
  };
  await writeJson(join(output, "candidate-manifest.json"), manifest);
  publicEvent(manifest.event, { candidateSha: manifest.candidateSha, bundleSha256: manifest.sha256 });
}

async function verifyCandidateCi() {
  const expected = STAGING_CMS_PUBLIC_HOTFIX.candidateCi;
  const [run, jobs] = await Promise.all([
    github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
    ),
    github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}/jobs?per_page=100`,
    ),
  ]);
  const actualJobs = Array.isArray(jobs?.jobs) ? jobs.jobs : [];
  const names = actualJobs.map((job) => job?.name).sort();
  const runStartedAt = Date.parse(run?.run_started_at ?? "");
  const runUpdatedAt = Date.parse(run?.updated_at ?? "");
  if (
    String(run?.id ?? "") !== expected.runId ||
    Number(run?.run_attempt) !== expected.runAttempt ||
    run?.name !== expected.workflowName ||
    run?.path !== expected.workflowPath ||
    run?.event !== "push" ||
    run?.head_branch !== "main" ||
    run?.head_sha !== STAGING_CMS_PUBLIC_HOTFIX.hotfixSha ||
    run?.status !== "completed" ||
    run?.conclusion !== "success" ||
    run?.actor?.login?.toLowerCase() !== "vnd93" ||
    run?.triggering_actor?.login?.toLowerCase() !== "vnd93" ||
    run?.repository?.full_name !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    run?.head_repository?.full_name !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    !Number.isFinite(runStartedAt) ||
    !Number.isFinite(runUpdatedAt) ||
    runUpdatedAt < runStartedAt ||
    Number(jobs?.total_count) !== expected.jobs.length ||
    JSON.stringify(names) !== JSON.stringify(expected.jobs) ||
    actualJobs.some((job) => {
      const startedAt = Date.parse(job?.started_at ?? "");
      const completedAt = Date.parse(job?.completed_at ?? "");
      return (
        job?.status !== "completed" ||
        job?.conclusion !== "success" ||
        Number(job?.run_attempt) !== expected.runAttempt ||
        !Number.isFinite(startedAt) ||
        !Number.isFinite(completedAt) ||
        startedAt < runStartedAt ||
        completedAt < startedAt ||
        completedAt > runUpdatedAt
      );
    })
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_CI_REFUSED");
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.candidate_ci_verified",
    run: {
      id: expected.runId,
      attempt: expected.runAttempt,
      headSha: run.head_sha,
      workflow: expected.workflowPath,
      conclusion: run.conclusion,
    },
    jobs: actualJobs.map((job) => ({ name: job.name, conclusion: job.conclusion })),
    verifiedAt: new Date().toISOString(),
  };
  await writeJson(argument("output"), report);
  publicEvent(report.event, { runId: report.run.id, jobCount: report.jobs.length });
}

async function verifyTrustedBaseline() {
  const evidenceRoot = exactRoot(argument("evidence"));
  const expected = STAGING_CMS_PUBLIC_HOTFIX.trustedBaseline;
  const [run, jobs, artifact, probePath, inventoryPath, receiptPath] = await Promise.all([
    github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
    ),
    github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}/jobs?per_page=100`,
    ),
    github(`/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/artifacts/${expected.artifactId}`),
    findUnique(evidenceRoot, "g12-staging-terminal-probe.json"),
    findUnique(evidenceRoot, "g12-staging-functions-finalizer-recovery.json"),
    findUnique(evidenceRoot, "g12-staging-function-finalizer-recovery.json"),
  ]);
  const [probe, inventory, receipt] = await Promise.all([
    readJson(probePath),
    readJson(inventoryPath),
    readJson(receiptPath),
  ]);
  const result = validateTrustedBaselineEvidence({ run, jobs, artifact, probe, inventory, receipt });
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_TRUSTED_BASELINE_REFUSED:${result.violations.join(",")}`);
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.trusted_baseline_verified",
    trustedRun: expected,
    inventory,
    inventorySha256: result.snapshot.inventorySha256,
    nonTargetSha256: result.snapshot.nonTargetSha256,
    target: result.snapshot.target,
    probeSha256: await fileSha256(probePath),
    receiptSha256: await fileSha256(receiptPath),
    verifiedAt: new Date().toISOString(),
  };
  await writeJson(argument("output"), report);
  publicEvent(report.event, { runId: expected.runId, artifactId: expected.artifactId });
}

async function captureBaseline() {
  const trusted = await readJson(argument("trusted"));
  if (
    trusted?.schemaVersion !== 1 ||
    trusted?.event !== "g12.staging.cms_public_hotfix.trusted_baseline_verified" ||
    JSON.stringify(trusted?.trustedRun) !== JSON.stringify(STAGING_CMS_PUBLIC_HOTFIX.trustedBaseline)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TRUSTED_SUMMARY_REFUSED");
  const live = await liveInventory();
  const stable = await stableLiveRead(STAGING_CMS_PUBLIC_HOTFIX.baselineFunction.bundleSha256, {
    initialInventory: live,
    expectedNonTargetSha256: trusted.nonTargetSha256,
  });
  const liveSnapshot = stable.snapshot;
  if (!liveSnapshot.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_INVENTORY_REFUSED:${liveSnapshot.violations.join(",")}`,
    );
  if (
    liveSnapshot.inventorySha256 !== trusted.inventorySha256 ||
    liveSnapshot.nonTargetSha256 !== trusted.nonTargetSha256 ||
    !sameFunctionTuple(liveSnapshot.target, trusted.target)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BASELINE_DRIFT");
  assertTrustedBaselineTuple(liveSnapshot.target);
  const reconciled = stable.body;
  const candidate = await loadCandidateArtifact(argument("candidate"));
  const candidateManifest = candidate.manifest;
  const candidateBody = candidate.body;
  const candidateBuildEvidence = candidate.buildEvidence;
  const output = exactRoot(argument("output"));
  await mkdir(output, { recursive: true, mode: 0o700 });
  const manifest = buildRecoveryPackageManifest({
    baseline: { body: reconciled.deploymentBody, tuple: liveSnapshot.target },
    candidate: {
      body: candidateBody,
      sha256: candidateManifest.sha256,
      sourceSha256: candidateManifest.sourceSha256,
      provenance: candidateManifest.provenance,
    },
    inventory: liveSnapshot.records,
  });
  await Promise.all([
    writeBytes(join(output, "baseline-body.ezbr"), reconciled.deploymentBody),
    writeBytes(join(output, "candidate-body.ezbr"), candidateBody),
    writeBytes(
      join(output, candidateManifest.provenance.builds.online.attestationFile),
      candidateBuildEvidence.online.attestation,
    ),
    writeBytes(
      join(output, candidateManifest.provenance.builds.online.unbundledFilesFile),
      candidateBuildEvidence.online.unbundledFiles,
    ),
    writeBytes(
      join(output, candidateManifest.provenance.builds.offline.attestationFile),
      candidateBuildEvidence.offline.attestation,
    ),
    writeBytes(
      join(output, candidateManifest.provenance.builds.offline.unbundledFilesFile),
      candidateBuildEvidence.offline.unbundledFiles,
    ),
    writeJson(join(output, "baseline-inventory.json"), liveSnapshot.records),
    writeJson(join(output, "package-manifest.json"), manifest),
  ]);
  publicEvent("g12.staging.cms_public_hotfix.baseline_captured", {
    baselineBundleSha256: manifest.baseline.sha256,
    candidateBundleSha256: manifest.candidate.sha256,
    nonTargetFunctions: liveSnapshot.nonTarget.length,
  });
}

async function buildState() {
  const packageRoot = exactRoot(argument("package"));
  const loaded = await loadPackage(packageRoot);
  const runId = argument("run-id");
  const runAttempt = Number(argument("run-attempt"));
  if (runAttempt !== 1) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_RERUN_REFUSED");
  const artifactName = `staging-cms-public-hotfix-recovery-${runId}-${runAttempt}`;
  const state = buildHotfixRecoveryState({
    workflow: { runId, runAttempt, controlSha: argument("control-sha") },
    artifact: {
      id: argument("artifact-id"),
      name: artifactName,
      digest: normalizeGithubArtifactDigest(argument("artifact-digest")),
    },
    manifest: loaded.manifest,
  });
  await writeJson(argument("output"), state);
  publicEvent("g12.staging.cms_public_hotfix.state_built", { runId, runAttempt });
}

async function verifyArtifactAndPackage() {
  const state = await readJson(argument("state"));
  const stateResult = validateHotfixRecoveryState(state, {
    runId: argument("run-id", { required: false }) || undefined,
    runAttempt: argument("run-attempt", { required: false }) || undefined,
    controlSha: argument("control-sha", { required: false }) || undefined,
  });
  if (!stateResult.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_STATE_REFUSED:${stateResult.violations.join(",")}`);
  const [artifact, run] = await Promise.all([
    github(`/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/artifacts/${state.recoveryArtifact.id}`),
    github(
      `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${state.workflow.runId}/attempts/${state.workflow.runAttempt}`,
    ),
  ]);
  if (
    !validateRunArtifact(
      artifact,
      {
        id: state.recoveryArtifact.id,
        name: state.recoveryArtifact.name,
        digest: state.recoveryArtifact.digest,
        runId: state.workflow.runId,
        controlSha: state.workflow.controlSha,
      },
      run,
    ) ||
    !validateControlRun(run, {
      runId: state.workflow.runId,
      runAttempt: state.workflow.runAttempt,
      controlSha: state.workflow.controlSha,
      workflowPath: STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
    })
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_RECOVERY_ARTIFACT_REFUSED");
  await loadPackage(argument("package"), state);
  publicEvent("g12.staging.cms_public_hotfix.recovery_artifact_verified", {
    artifactId: state.recoveryArtifact.id,
  });
}

function expectedCandidateTuple(state, baseline) {
  return {
    ...normalizeFunctionTuple(baseline),
    version: baseline.version + 1,
    bundleSha256: state.candidate.bodySha256,
    updatedAt: "",
    entrypointPath: state.candidate.entrypointPath,
    importMap: true,
    importMapPath: state.candidate.importMapPath,
    verifyJwt: false,
  };
}

function expectedRollbackTuple(state, candidate) {
  const baseline = normalizeFunctionTuple(state.baseline.tuple);
  return { ...baseline, version: candidate.version + 1, updatedAt: "" };
}

function currentExecutor(workflowPath, controlSha) {
  const executor = {
    runId: String(process.env.GITHUB_RUN_ID ?? ""),
    runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
    runSha: String(process.env.GITHUB_SHA ?? ""),
    controlSha,
    workflowPath,
  };
  const expectedWorkflowRef = `${STAGING_CMS_PUBLIC_HOTFIX.repository}/${workflowPath}@refs/heads/main`;
  if (
    process.env.GITHUB_REPOSITORY !== STAGING_CMS_PUBLIC_HOTFIX.repository ||
    process.env.GITHUB_REF !== "refs/heads/main" ||
    process.env.GITHUB_WORKFLOW_REF !== expectedWorkflowRef ||
    !/^[1-9]\d*$/.test(executor.runId) ||
    !Number.isSafeInteger(executor.runAttempt) ||
    executor.runAttempt < 1 ||
    (workflowPath === STAGING_CMS_PUBLIC_HOTFIX.workflowPath && executor.runAttempt !== 1) ||
    !/^[a-f0-9]{40}$/.test(executor.runSha) ||
    !/^[a-f0-9]{40}$/.test(executor.controlSha) ||
    !workflowName(workflowPath)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EXECUTOR_IDENTITY_REFUSED");
  return executor;
}

async function checkoutHead() {
  const workspace = exactRoot(process.env.GITHUB_WORKSPACE);
  const controlRoot = resolve(workspace, "control");
  if (resolve(process.cwd()) !== controlRoot)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CONTROL_CHECKOUT_REFUSED");
  const environment = Object.fromEntries(
    Object.entries({ PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }).filter(
      ([, value]) => typeof value === "string" && value.length > 0,
    ),
  );
  const runGit = (args, limit = 2_000) =>
    new Promise((resolveRun, rejectRun) => {
      let stdout = "";
      let stderr = "";
      const child = spawn("git", args, {
        cwd: controlRoot,
        env: environment,
        windowsHide: true,
      });
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
        if (stdout.length > limit) child.kill();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
        if (stderr.length > 1_000) child.kill();
      });
      child.once("error", rejectRun);
      child.once("exit", (code, signal) => {
        if (code === 0 && signal === null) resolveRun(stdout);
        else rejectRun(new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CHECKOUT_HEAD_REFUSED"));
      });
    });
  const revision = await runGit(["rev-parse", "--show-toplevel", "HEAD"], 500);
  const [topLevel, head, ...rest] = revision.trim().split(/\r?\n/);
  if (rest.length !== 0 || resolve(topLevel) !== controlRoot || !/^[a-f0-9]{40}$/.test(head?.toLowerCase()))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CHECKOUT_HEAD_REFUSED");
  const status = await runGit(["status", "--porcelain=v1", "--untracked-files=all"], 10_000);
  if (status.length !== 0) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CONTROL_CHECKOUT_DIRTY_REFUSED");
  return head.toLowerCase();
}

async function verifiedCurrentExecutor(state, workflowPath = argument("executor-workflow")) {
  const executor = currentExecutor(workflowPath, state?.workflow?.controlSha);
  if (
    workflowPath === STAGING_CMS_PUBLIC_HOTFIX.workflowPath &&
    executor.runSha !== state?.workflow?.controlSha
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EXECUTOR_RELEASE_SHA_REFUSED");
  if ((await checkoutHead()) !== state?.workflow?.controlSha)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EXECUTOR_CONTROL_SHA_REFUSED");
  const run = await github(
    `/repos/${STAGING_CMS_PUBLIC_HOTFIX.repository}/actions/runs/${executor.runId}/attempts/${executor.runAttempt}`,
  );
  if (!validateControlRun(run, { ...executor, controlSha: executor.runSha }))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EXECUTOR_RUN_REFUSED");
  return executor;
}

async function optionalIntent(path, state, action, preparedBy) {
  if (!path) return undefined;
  const wrapper = await readJson(path);
  const result = verifyHotfixIntent(wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action,
    ...(preparedBy ? { preparedBy } : {}),
  });
  if (!result.valid)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_INTENT_REFUSED:" + result.violations.join(","));
  return { wrapper, key: process.env.RECOVERY_STATE_HMAC_KEY, intent: result.intent };
}

async function prepareIntent() {
  const action = argument("action");
  if (!["candidate", "rollback"].includes(action))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_INTENT_ACTION_REFUSED");
  const state = await readJson(argument("state"));
  await loadPackage(argument("package"), state);
  const executor = await verifiedCurrentExecutor(state);
  const bound = await artifactBoundEvidence(state, {
    candidateIntent: "candidate-intent",
    rollbackIntent: "rollback-intent",
    candidateReceipt: "candidate-receipt",
    rollbackReceipt: "rollback-receipt",
  });
  if (
    (action === "candidate" && Object.values(bound.paths).some(Boolean)) ||
    (action === "rollback" &&
      (!bound.paths.candidateIntent || bound.paths.rollbackIntent || bound.paths.rollbackReceipt))
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_INTENT_ARTIFACT_STATE_REFUSED");
  const candidateIntent = await optionalIntent(bound.paths.candidateIntent, state, "candidate");
  const candidateReceipt = await optionalReceipt(
    bound.paths.candidateReceipt,
    state,
    "candidate",
    candidateIntent,
  );
  const inventory = await liveInventory();
  const stable = await stableLiveRead(
    action === "candidate" ? state.baseline.bodySha256 : state.candidate.bodySha256,
    { initialInventory: inventory, expectedNonTargetSha256: state.baseline.nonTargetSha256 },
  );
  const classification = classifyHotfixLiveState({
    state,
    inventory: stable.snapshot.records,
    candidateIntent,
    candidateReceipt,
  });
  const expectedClassification =
    action === "candidate" ? "baseline" : ["candidate-intended", "candidate-receipted"];
  if (
    (action === "candidate" && classification.classification !== expectedClassification) ||
    (action === "rollback" && !expectedClassification.includes(classification.classification))
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_INTENT_CAS_REFUSED:" + classification.classification);
  const before = classification.snapshot.target;
  const intent = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix." + action + "_intent",
    action,
    workflow: state.workflow,
    preparedBy: executor,
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    slug: STAGING_CMS_PUBLIC_HOTFIX.functionSlug,
    state,
    before,
    expected:
      action === "candidate" ? expectedCandidateTuple(state, before) : expectedRollbackTuple(state, before),
    preparedAt: new Date().toISOString(),
  };
  const sealed = sealHotfixIntent(intent, process.env.RECOVERY_STATE_HMAC_KEY);
  await writeJson(argument("output"), sealed);
  publicEvent("g12.staging.cms_public_hotfix.intent_prepared", {
    action,
    executorRunId: intent.preparedBy.runId,
  });
}

function transitionMatches(actual, expected, previousUpdatedAt) {
  const value = normalizeFunctionTuple(actual);
  return (
    value.id === expected.id &&
    value.name === expected.name &&
    value.slug === expected.slug &&
    value.createdAt === expected.createdAt &&
    value.status === expected.status &&
    value.verifyJwt === expected.verifyJwt &&
    value.version === expected.version &&
    value.bundleSha256 === expected.bundleSha256 &&
    value.entrypointPath === expected.entrypointPath &&
    value.importMap === expected.importMap &&
    value.importMapPath === expected.importMapPath &&
    Boolean(value.updatedAt) &&
    Date.parse(value.updatedAt) > Date.parse(previousUpdatedAt)
  );
}

async function observeTransition(state, beforeSnapshot, expectedTuple, expectedBodySha256) {
  let lastSnapshot;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const snapshot = functionInventorySnapshot(await liveInventory());
    if (!snapshot.valid)
      throw new Error(
        `G12_STAGING_CMS_PUBLIC_HOTFIX_POST_INVENTORY_REFUSED:${snapshot.violations.join(",")}`,
      );
    if (snapshot.nonTargetSha256 !== state.baseline.nonTargetSha256)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_NON_TARGET_DRIFT");
    if (transitionMatches(snapshot.target, expectedTuple, beforeSnapshot.target.updatedAt)) {
      const stable = await stableLiveRead(expectedBodySha256, {
        initialInventory: snapshot.records,
        expectedNonTargetSha256: state.baseline.nonTargetSha256,
      });
      if (!transitionMatches(stable.snapshot.target, expectedTuple, beforeSnapshot.target.updatedAt))
        throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_POST_TRANSITION_DRIFT");
      return stable.snapshot;
    }
    lastSnapshot = snapshot;
    if (!sameFunctionTuple(snapshot.target, beforeSnapshot.target)) break;
    if (attempt < 6) await new Promise((done) => setTimeout(done, 1_500 * attempt));
  }
  const label = lastSnapshot?.target?.bundleSha256 ?? "missing";
  throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_TRANSITION_AMBIGUOUS:${label}`);
}

async function patchExactBundle({ body, sha256, entrypointPath, importMapPath }) {
  return managementRequest(targetPath, {
    method: "PATCH",
    query: {
      verify_jwt: "false",
      entrypoint_path: entrypointPath,
      import_map_path: importMapPath,
      ezbr_sha256: sha256,
    },
    body,
    contentType: "application/vnd.denoland.eszip",
    retries: 1,
  });
}

function receiptPayload({
  action,
  state,
  intent,
  before,
  after,
  nonTargetSha256,
  completedBy,
  completionMode,
}) {
  return {
    schemaVersion: 1,
    event: `g12.staging.cms_public_hotfix.${action}_applied`,
    action,
    workflow: state.workflow,
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    slug: STAGING_CMS_PUBLIC_HOTFIX.functionSlug,
    intentSha256: canonicalSha256(intent.wrapper ?? intent),
    preparedBy: (intent.wrapper ?? intent).intent?.preparedBy ?? intent.intent?.preparedBy,
    intentPreparedAt: (intent.wrapper ?? intent).intent?.preparedAt ?? intent.intent?.preparedAt,
    completedBy,
    completionMode,
    state,
    before: normalizeFunctionTuple(before),
    after: normalizeFunctionTuple(after),
    nonTargetSha256,
    appliedAt: new Date().toISOString(),
  };
}

async function applyCandidate() {
  const state = await readJson(argument("state"));
  const loaded = await loadPackage(argument("package"), state);
  const executor = await verifiedCurrentExecutor(state);
  const bound = await artifactBoundEvidence(state, {
    candidateIntent: "candidate-intent",
    rollbackIntent: "rollback-intent",
    candidateReceipt: "candidate-receipt",
    rollbackReceipt: "rollback-receipt",
  });
  if (
    !bound.paths.candidateIntent ||
    bound.paths.rollbackIntent ||
    bound.paths.candidateReceipt ||
    bound.paths.rollbackReceipt
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_ARTIFACT_STATE_REFUSED");
  const candidateIntent = await optionalIntent(bound.paths.candidateIntent, state, "candidate", executor);
  const stableBefore = await stableLiveRead(state.baseline.bodySha256, {
    expectedNonTargetSha256: state.baseline.nonTargetSha256,
  });
  const before = stableBefore.snapshot;
  const classification = classifyHotfixLiveState({
    state,
    inventory: before.records,
    candidateIntent,
  });
  if (classification.classification !== "baseline-with-candidate-intent")
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_CAS_REFUSED:${classification.classification}`);
  const intentResult = verifyHotfixIntent(candidateIntent.wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action: "candidate",
    preparedBy: executor,
    live: before.target,
  });
  if (!intentResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CANDIDATE_INTENT_REFUSED:${intentResult.violations.join(",")}`,
    );
  await assertRemoteMutationDomain(state, "candidate", { candidateIntent });
  let patchFailure;
  try {
    const response = await patchExactBundle({
      body: loaded.candidateBody,
      sha256: state.candidate.bodySha256,
      entrypointPath: state.candidate.entrypointPath,
      importMapPath: state.candidate.importMapPath,
    });
    await response.body?.cancel();
  } catch (error) {
    patchFailure = error;
  }
  const after = await observeTransition(
    state,
    before,
    expectedCandidateTuple(state, before.target),
    state.candidate.bodySha256,
  );
  const receipt = receiptPayload({
    action: "candidate",
    state,
    intent: candidateIntent,
    before: before.target,
    after: after.target,
    nonTargetSha256: after.nonTargetSha256,
    completedBy: executor,
    completionMode: "patched",
  });
  const sealed = sealHotfixReceipt(receipt, process.env.RECOVERY_STATE_HMAC_KEY);
  await writeJson(argument("receipt"), sealed);
  await appendOutput({
    applied: "true",
    version: after.target.version,
    bundle_sha256: after.target.bundleSha256,
  });
  publicEvent("g12.staging.cms_public_hotfix.candidate_verified", {
    version: after.target.version,
    bundleSha256: after.target.bundleSha256,
    responseAmbiguous: Boolean(patchFailure),
  });
}

async function optionalReceipt(path, state, action, intent) {
  if (!path) return undefined;
  const wrapper = await readJson(path);
  const result = verifyHotfixReceipt(wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action,
    ...(intent ? { intent: intent.wrapper ?? intent } : {}),
  });
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_RECEIPT_REFUSED:${result.violations.join(",")}`);
  return { wrapper, key: process.env.RECOVERY_STATE_HMAC_KEY };
}

async function restoreBaseline() {
  const state = await readJson(argument("state"));
  const loaded = await loadPackage(argument("package"), state);
  const executor = await verifiedCurrentExecutor(state);
  const bound = await artifactBoundEvidence(state, {
    candidateIntent: "candidate-intent",
    rollbackIntent: "rollback-intent",
    candidateReceipt: "candidate-receipt",
    rollbackReceipt: "existing-rollback-receipt",
  });
  if (!bound.paths.candidateIntent || !bound.paths.rollbackIntent)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_ARTIFACT_STATE_REFUSED");
  const candidateIntent = await optionalIntent(bound.paths.candidateIntent, state, "candidate");
  const rollbackIntent = await optionalIntent(bound.paths.rollbackIntent, state, "rollback");
  const candidateReceiptPath = bound.paths.candidateReceipt;
  const rollbackReceiptPath = bound.paths.rollbackReceipt;
  const candidateReceipt = await optionalReceipt(candidateReceiptPath, state, "candidate", candidateIntent);
  const rollbackReceipt = await optionalReceipt(rollbackReceiptPath, state, "rollback", rollbackIntent);
  const beforePayload = await liveInventory();
  let classification = classifyHotfixLiveState({
    state,
    inventory: beforePayload,
    candidateIntent,
    rollbackIntent,
    candidateReceipt,
    rollbackReceipt,
  });
  const stableDigest = ["rollback-intended", "rollback-receipted"].includes(classification.classification)
    ? state.baseline.bodySha256
    : classification.classification === "candidate-with-rollback-intent"
      ? state.candidate.bodySha256
      : null;
  if (stableDigest) {
    const stable = await stableLiveRead(stableDigest, {
      initialInventory: beforePayload,
      expectedNonTargetSha256: state.baseline.nonTargetSha256,
    });
    classification = classifyHotfixLiveState({
      state,
      inventory: stable.snapshot.records,
      candidateIntent,
      rollbackIntent,
      candidateReceipt,
      rollbackReceipt,
    });
  }
  if (classification.classification === "rollback-receipted") {
    await appendOutput({ restored: "false", mode: classification.classification });
    publicEvent("g12.staging.cms_public_hotfix.rollback_noop", { mode: classification.classification });
    return;
  }
  if (classification.classification === "rollback-intended") {
    const receipt = receiptPayload({
      action: "rollback",
      state,
      intent: rollbackIntent,
      before: rollbackIntent.intent.before,
      after: classification.snapshot.target,
      nonTargetSha256: classification.snapshot.nonTargetSha256,
      completedBy: executor,
      completionMode: "reconciled",
    });
    const sealed = sealHotfixReceipt(receipt, process.env.RECOVERY_STATE_HMAC_KEY);
    await writeJson(argument("rollback-receipt"), sealed);
    await appendOutput({
      restored: "true",
      mode: "rollback-reconciled",
      version: classification.snapshot.target.version,
    });
    publicEvent("g12.staging.cms_public_hotfix.rollback_reconciled", {
      version: classification.snapshot.target.version,
      bundleSha256: classification.snapshot.target.bundleSha256,
    });
    return;
  }
  if (classification.classification !== "candidate-with-rollback-intent")
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_CAS_REFUSED:${classification.classification}`);
  const before = classification.snapshot;
  const verifiedIntent = verifyHotfixIntent(rollbackIntent.wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action: "rollback",
    live: before.target,
  });
  if (!verifiedIntent.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_INTENT_REFUSED:${verifiedIntent.violations.join(",")}`,
    );
  await assertRemoteMutationDomain(state, "rollback", {
    candidateIntent,
    rollbackIntent,
  });
  const allowPatchArgument = argument("allow-patch", { required: false });
  if (allowPatchArgument && allowPatchArgument !== "true")
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_PATCH_AUTHORIZATION_REFUSED");
  const allowPatch = allowPatchArgument === "true";
  const expectedRollback = expectedRollbackTuple(state, before.target);
  const patchAuthorization = verifyHotfixIntent(rollbackIntent.wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action: "rollback",
    live: before.target,
    preparedBy: executor,
  });
  // PATCH has no documented replay key or compare-and-swap precondition. Only the
  // attempt that prepared this exact intent may issue it, exactly once. Every later
  // attempt is observation-only and can only certify an already completed request.
  let transition;
  try {
    transition = await executeHotfixRollbackTransition({
      allowPatch,
      intentOwnedByExecutor: patchAuthorization.valid,
      patch: async () => {
        const baseline = normalizeFunctionTuple(state.baseline.tuple);
        const response = await patchExactBundle({
          body: loaded.baselineBody,
          sha256: state.baseline.bodySha256,
          entrypointPath: baseline.entrypointPath,
          importMapPath: baseline.importMapPath,
        });
        await response.body?.cancel();
      },
      observe: () => observeTransition(state, before, expectedRollback, state.baseline.bodySha256),
    });
  } catch (error) {
    if (!allowPatch || !patchAuthorization.valid)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_PATCH_REPLAY_REFUSED", {
        cause: error,
      });
    throw error;
  }
  const after = transition.snapshot;
  const receipt = receiptPayload({
    action: "rollback",
    state,
    intent: rollbackIntent,
    before: before.target,
    after: after.target,
    nonTargetSha256: after.nonTargetSha256,
    completedBy: executor,
    completionMode: transition.completionMode,
  });
  const sealed = sealHotfixReceipt(receipt, process.env.RECOVERY_STATE_HMAC_KEY);
  await writeJson(argument("rollback-receipt"), sealed);
  if (transition.completionMode === "reconciled") {
    await appendOutput({ restored: "true", mode: "rollback-reconciled", version: after.target.version });
    publicEvent("g12.staging.cms_public_hotfix.rollback_reconciled", {
      version: after.target.version,
      bundleSha256: after.target.bundleSha256,
      ambiguousDispatch: true,
    });
  } else {
    await appendOutput({ restored: "true", mode: "rollback-receipted", version: after.target.version });
    publicEvent("g12.staging.cms_public_hotfix.rollback_verified", {
      version: after.target.version,
      bundleSha256: after.target.bundleSha256,
      responseAmbiguous: transition.responseAmbiguous,
    });
  }
}

async function observeState() {
  const state = await readJson(argument("state"));
  const loaded = await loadPackage(argument("package"), state);
  const bound = await artifactBoundEvidence(state, {
    candidateIntent: "candidate-intent",
    rollbackIntent: "rollback-intent",
    candidateReceipt: "candidate-receipt",
    rollbackReceipt: "rollback-receipt",
  });
  const candidateIntent = await optionalIntent(bound.paths.candidateIntent, state, "candidate");
  const rollbackIntent = await optionalIntent(bound.paths.rollbackIntent, state, "rollback");
  const candidateReceipt = await optionalReceipt(
    bound.paths.candidateReceipt,
    state,
    "candidate",
    candidateIntent,
  );
  const rollbackReceipt = await optionalReceipt(
    bound.paths.rollbackReceipt,
    state,
    "rollback",
    rollbackIntent,
  );
  const initialInventory = await liveInventory();
  let classification = classifyHotfixLiveState({
    state,
    inventory: initialInventory,
    candidateIntent,
    rollbackIntent,
    candidateReceipt,
    rollbackReceipt,
  });
  const expectedBodySha256 = [
    "baseline",
    "baseline-with-candidate-intent",
    "baseline-with-rollback-intent",
  ].includes(classification.classification)
    ? state.baseline.bodySha256
    : ["candidate-intended", "candidate-receipted", "candidate-with-rollback-intent"].includes(
          classification.classification,
        )
      ? state.candidate.bodySha256
      : ["rollback-intended", "rollback-receipted"].includes(classification.classification)
        ? state.baseline.bodySha256
        : null;
  let bodySha256 = null;
  if (expectedBodySha256) {
    const stable = await stableLiveRead(expectedBodySha256, {
      initialInventory,
      expectedNonTargetSha256: state.baseline.nonTargetSha256,
    });
    classification = classifyHotfixLiveState({
      state,
      inventory: stable.snapshot.records,
      candidateIntent,
      rollbackIntent,
      candidateReceipt,
      rollbackReceipt,
    });
    bodySha256 = stable.body.deploymentSha256;
  }
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.observed",
    workflow: state.workflow,
    stateSha256: canonicalSha256(state),
    recoveryArtifact: state.recoveryArtifact,
    packageManifestSha256: canonicalSha256(loaded.manifest),
    classification: classification.classification,
    violations: classification.violations,
    target: classification.snapshot?.target ?? null,
    nonTargetSha256: classification.snapshot?.nonTargetSha256 ?? null,
    bodySha256,
    candidateIntentSha256: candidateIntent ? canonicalSha256(candidateIntent.wrapper) : null,
    rollbackIntentSha256: rollbackIntent ? canonicalSha256(rollbackIntent.wrapper) : null,
    candidateReceiptSha256: candidateReceipt ? canonicalSha256(candidateReceipt.wrapper) : null,
    rollbackReceiptSha256: rollbackReceipt ? canonicalSha256(rollbackReceipt.wrapper) : null,
    observedAt: new Date().toISOString(),
  };
  await writeJson(argument("output"), report);
  await appendOutput({ classification: report.classification });
  if (
    [
      "state-invalid",
      "external-drift",
      "candidate-intent-invalid",
      "rollback-intent-invalid",
      "candidate-receipt-invalid",
      "ambiguous-after-rollback",
      "rollback-receipt-invalid",
    ].includes(report.classification)
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_OBSERVATION_REFUSED:${report.classification}`);
  publicEvent(report.event, { classification: report.classification });
}

async function validateProbe() {
  const mode = argument("mode");
  const report = await readJson(argument("file"));
  const result =
    mode === "pre"
      ? validateHotfixPreProbe(report)
      : mode === "full"
        ? validateHotfixFullProbe(report)
        : null;
  if (!result) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_MODE_REFUSED");
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_REFUSED:${result.violations.join(",")}`);
  publicEvent("g12.staging.cms_public_hotfix.probe_verified", { mode, outcome: report.outcome });
}

async function evidenceChainForOutcome(state, outcome, additionalArtifactArguments = {}) {
  const bound = await artifactBoundEvidence(state, {
    candidateIntent: "candidate-intent",
    rollbackIntent: "rollback-intent",
    candidateReceipt: "candidate-receipt",
    rollbackReceipt: "rollback-receipt",
    ...additionalArtifactArguments,
  });
  const candidateIntentPath = bound.paths.candidateIntent;
  const rollbackIntentPath = bound.paths.rollbackIntent;
  if (outcome === "baseline") {
    if (
      candidateIntentPath ||
      rollbackIntentPath ||
      bound.paths.candidateReceipt ||
      bound.paths.rollbackReceipt
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_BASELINE_CHAIN_REFUSED");
    return { bound };
  }
  if (!candidateIntentPath) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EVIDENCE_CHAIN_REQUIRED");
  const candidateIntent = await optionalIntent(candidateIntentPath, state, "candidate");
  if (outcome === "promoted") {
    if (rollbackIntentPath || bound.paths.rollbackReceipt || !bound.paths.candidateReceipt)
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PROMOTED_ROLLBACK_INTENT_REFUSED");
    const candidateReceipt = await optionalReceipt(
      bound.paths.candidateReceipt,
      state,
      "candidate",
      candidateIntent,
    );
    return { candidateIntent, candidateReceipt, receipt: candidateReceipt, bound };
  }
  if (outcome !== "restored" || !rollbackIntentPath)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EVIDENCE_OUTCOME_REFUSED");
  const candidateReceipt = await optionalReceipt(
    bound.paths.candidateReceipt,
    state,
    "candidate",
    candidateIntent,
  );
  const rollbackIntent = await optionalIntent(rollbackIntentPath, state, "rollback");
  if (!bound.paths.rollbackReceipt) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_EVIDENCE_CHAIN_REQUIRED");
  const rollbackReceipt = await optionalReceipt(
    bound.paths.rollbackReceipt,
    state,
    "rollback",
    rollbackIntent,
  );
  return {
    candidateIntent,
    candidateReceipt,
    rollbackIntent,
    rollbackReceipt,
    receipt: rollbackReceipt,
    bound,
  };
}

function expectedOutcomeClassification(outcome) {
  return {
    promoted: "candidate-receipted",
    restored: "rollback-receipted",
    baseline: "baseline",
  }[outcome];
}

async function assertPathMissing(path) {
  try {
    await lstat(path);
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_OUTPUT_OCCUPIED");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function runRolloutProbe(reportPath, diagnosticsPath) {
  const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "rollout-probe.mjs");
  const childEnvironment = {};
  for (const name of [
    "PATH",
    "HOME",
    "SystemRoot",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
  ])
    if (process.env[name]) childEnvironment[name] = process.env[name];
  Object.assign(childEnvironment, {
    EV2_G12_ORIGIN: STAGING_CMS_PUBLIC_HOTFIX.origin,
    EV2_G12_EXPECTED_SHA: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
    EV2_G12_ENVIRONMENT: "staging",
    EV2_G12_PROBE_PROFILE: "full",
    EV2_G12_SAMPLE_COUNT: "20",
    EV2_G12_WARMUP_SAMPLES_PER_ROUTE: "20",
    EV2_G12_REQUEST_TIMEOUT_MS: "10000",
    EV2_G12_READINESS_ATTEMPTS: "10",
    EV2_G12_READINESS_INTERVAL_MS: "1500",
    EV2_G12_WARMUP_ATTEMPTS: "10",
    EV2_G12_CSP_MODE: "report-only",
    EV2_G12_REPORT_PATH: reportPath,
    ...(diagnosticsPath ? { EV2_G12_DIAGNOSTICS_PATH: diagnosticsPath } : {}),
  });
  await new Promise((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, [scriptPath], {
      env: childEnvironment,
      stdio: "inherit",
      windowsHide: true,
    });
    child.once("error", (error) => rejectProcess(error));
    child.once("exit", (code, signal) => {
      if (code === 0 && signal === null) resolveProcess();
      else
        rejectProcess(new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_PROCESS_REFUSED:${code ?? "signal"}`));
    });
  });
}

function cmsPublicCredentials() {
  const expectedUrl = `https://${STAGING_CMS_PUBLIC_HOTFIX.projectRef}.supabase.co`;
  const url = String(process.env.STAGING_SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = String(process.env.STAGING_SUPABASE_ANON_KEY ?? "");
  if (
    url !== expectedUrl ||
    anonKey.length < 30 ||
    !(anonKey.startsWith("eyJ") || anonKey.startsWith("sb_publishable_"))
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_CREDENTIALS_REFUSED");
  return { url, anonKey };
}

async function boundedPublicJson(url, { method = "GET", anonKey }) {
  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      Origin: STAGING_CMS_PUBLIC_HOTFIX.origin,
    },
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 2_000_000)
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_BODY_REFUSED");
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch (error) {
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_JSON_REFUSED", { cause: error });
    }
  }
  return {
    response,
    body,
    elapsedMs: Math.round((performance.now() - started) * 100) / 100,
  };
}

function publicScenario(result, expected) {
  const scenario = {
    status: result.response.status,
    kind:
      result.response.status === 404
        ? "not-found"
        : result.body === null
          ? "empty"
          : String(result.body?.kind ?? ""),
    cache: result.response.headers.get("cache-control") ?? "",
    cors: result.response.headers.get("access-control-allow-origin") ?? "",
    json: (result.response.headers.get("content-type") ?? "").startsWith("application/json"),
  };
  if (JSON.stringify(scenario) !== JSON.stringify(expected))
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_SCENARIO_REFUSED:${expected.kind}:${scenario.status}`,
    );
  return scenario;
}

function nearestRank(values, percentile) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)];
}

async function managementReadRows(query, label) {
  const response = await managementRequest(
    `/v1/projects/${STAGING_CMS_PUBLIC_HOTFIX.projectRef}/database/query`,
    {
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ query }),
    },
  );
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > 16_384)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_${label}_SIZE_REFUSED`);
  try {
    const rows = JSON.parse(text);
    if (!Array.isArray(rows)) throw new Error("invalid");
    return rows;
  } catch (error) {
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_${label}_JSON_REFUSED`, {
      cause: error,
    });
  }
}

async function runCmsPublicCanary({ state, outcome, classification, target, output }) {
  const { url, anonKey } = cmsPublicCredentials();
  const functionUrl = `${url}/functions/v1/${STAGING_CMS_PUBLIC_HOTFIX.functionSlug}`;
  const headers = { anonKey };
  const expected = {
    managed: { status: 200, kind: "page", cache: "private, no-store", cors: "*", json: true },
    fallback: {
      status: 200,
      kind: "fallback",
      cache: "public, max-age=0, must-revalidate",
      cors: "*",
      json: true,
    },
    managedRoute: {
      status: 200,
      kind: "route",
      cache: "public, max-age=0, must-revalidate",
      cors: "*",
      json: true,
    },
    legacyHit: {
      status: 200,
      kind: "route",
      cache: "public, max-age=0, must-revalidate",
      cors: "*",
      json: true,
    },
    legacyMiss: { status: 404, kind: "not-found", cache: "no-store", cors: "*", json: true },
    options: { status: 200, kind: "empty", cache: "no-store", cors: "*", json: false },
  };
  const startedAt = new Date().toISOString();
  const managedUrl = `${functionUrl}?${new URLSearchParams({ type: "page-by-path", path: "/contato" })}`;
  for (let sample = 0; sample < 20; sample += 1)
    publicScenario(await boundedPublicJson(managedUrl, headers), expected.managed);
  const latencies = [];
  for (let sample = 0; sample < 20; sample += 1) {
    const result = await boundedPublicJson(managedUrl, headers);
    publicScenario(result, expected.managed);
    if (
      !result.body?.page ||
      typeof result.body.page !== "object" ||
      result.body.page?.payload?.route?.path !== "/contato" ||
      typeof result.body.page?.payload?.title !== "string" ||
      result.body.page.payload.title.trim().length === 0
    )
      throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_MANAGED_BODY_REFUSED");
    latencies.push(result.elapsedMs);
  }
  const uniquePath = `/g12-hotfix-miss-${state.workflow.runId}-${state.workflow.runAttempt}`;
  const fallbackResult = await boundedPublicJson(
    `${functionUrl}?${new URLSearchParams({ type: "page-by-path", path: uniquePath })}`,
    headers,
  );
  if (JSON.stringify(fallbackResult.body) !== JSON.stringify({ kind: "fallback" }))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_FALLBACK_BODY_REFUSED");
  const fallback = publicScenario(fallbackResult, expected.fallback);
  const routeRows = await managementReadRows(
    `select route.source_path, route.destination_path, route.status_code
       from public.cms_route_rules route
      where route.active is true
        and not exists (
          select 1
            from public.cms_published_projection projection
           where projection.content_type in ('page', 'homepage')
             and projection.payload #>> '{route,path}' = route.source_path
        )
      order by route.created_at desc, route.source_path asc
      limit 1`,
    "ROUTE_FIXTURE",
  );
  const routePath = routeRows?.[0]?.source_path;
  const routeDestination = routeRows?.[0]?.destination_path ?? null;
  const routeStatus = routeRows?.[0]?.status_code;
  if (
    routeRows.length !== 1 ||
    typeof routePath !== "string" ||
    !/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/.test(routePath) ||
    ![301, 302, 404, 410].includes(routeStatus) ||
    ([301, 302].includes(routeStatus)
      ? typeof routeDestination !== "string" ||
        routeDestination.length < 1 ||
        routeDestination.length > 2_048 ||
        /[\r\n\0]/.test(routeDestination)
      : routeDestination !== null)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_ROUTE_DISCOVERY_REFUSED");
  const managedRouteResult = await boundedPublicJson(
    `${functionUrl}?${new URLSearchParams({ type: "page-by-path", path: routePath })}`,
    headers,
  );
  if (
    JSON.stringify(managedRouteResult.body?.rule) !==
    JSON.stringify({ destinationPath: routeDestination, status: routeStatus })
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_ROUTE_BODY_REFUSED");
  const managedRoute = publicScenario(managedRouteResult, expected.managedRoute);
  const legacyRows = await managementReadRows(
    `select legacy.source_path, legacy.destination_path, legacy.status_code
       from public.cms_redirects legacy
      where legacy.active is true
        and not exists (
          select 1
            from public.cms_published_projection projection
           where projection.content_type in ('page', 'homepage')
             and projection.payload #>> '{route,path}' = legacy.source_path
        )
        and not exists (
          select 1
            from public.cms_route_rules route
           where route.active is true
             and route.source_path = legacy.source_path
        )
      order by legacy.created_at desc, legacy.source_path asc
      limit 1`,
    "LEGACY_FIXTURE",
  );
  const legacyPath = legacyRows?.[0]?.source_path;
  const legacyDestination = legacyRows?.[0]?.destination_path;
  const legacyStatus = legacyRows?.[0]?.status_code;
  if (
    !Array.isArray(legacyRows) ||
    legacyRows.length !== 1 ||
    typeof legacyPath !== "string" ||
    !/^\/(?:[A-Za-z0-9._~-]+\/?)*$/.test(legacyPath) ||
    typeof legacyDestination !== "string" ||
    legacyDestination.length < 1 ||
    legacyDestination.length > 2_048 ||
    /[\r\n\0]/.test(legacyDestination) ||
    ![301, 302, 307, 308].includes(legacyStatus)
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_LEGACY_FIXTURE_REFUSED");
  const legacyHitResult = await boundedPublicJson(
    `${functionUrl}?${new URLSearchParams({ type: "page-by-path", path: legacyPath })}`,
    headers,
  );
  if (
    JSON.stringify(legacyHitResult.body?.rule) !==
    JSON.stringify({ destinationPath: legacyDestination, status: legacyStatus })
  )
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_LEGACY_HIT_BODY_REFUSED");
  const legacyHit = publicScenario(legacyHitResult, expected.legacyHit);
  const legacyMissResult = await boundedPublicJson(
    `${functionUrl}?${new URLSearchParams({ type: "redirect", path: uniquePath })}`,
    headers,
  );
  if (JSON.stringify(legacyMissResult.body) !== JSON.stringify({ error: "Não encontrado." }))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_LEGACY_MISS_BODY_REFUSED");
  const legacyMiss = publicScenario(legacyMissResult, expected.legacyMiss);
  const options = publicScenario(
    await boundedPublicJson(`${functionUrl}?type=page-by-path&path=%2Fcontato`, {
      ...headers,
      method: "OPTIONS",
    }),
    expected.options,
  );
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.cms_public_canary",
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    functionUrl,
    origin: STAGING_CMS_PUBLIC_HOTFIX.origin,
    outcome,
    stateSha256: canonicalSha256(state),
    classification,
    target,
    warmupSamples: 20,
    measuredSamples: 20,
    managedPath: "/contato",
    managedLatency: {
      samples: latencies.length,
      p50Ms: nearestRank(latencies, 50),
      p95Ms: nearestRank(latencies, 95),
      maxMs: Math.max(...latencies),
    },
    scenarios: { managed: expected.managed, fallback, managedRoute, legacyHit, legacyMiss, options },
    startedAt,
    completedAt: new Date().toISOString(),
  };
  const result = validateCmsPublicHotfixCanary(report, { state, outcome, classification, target });
  if (!result.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_CANARY_REFUSED:${result.violations.join(",")}`);
  await writeJson(output, report);
  return report;
}

async function runBoundFullProbe() {
  const outcome = argument("outcome");
  const expectedClassification = expectedOutcomeClassification(outcome);
  if (!expectedClassification) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_OUTCOME_REFUSED");
  const state = await readJson(argument("state"));
  const loaded = await loadPackage(argument("package"), state);
  const executor = await verifiedCurrentExecutor(state);
  const chain = await evidenceChainForOutcome(state, outcome);
  const expectedBodySha256 = outcome === "promoted" ? state.candidate.bodySha256 : state.baseline.bodySha256;
  const stableBefore = await stableLiveRead(expectedBodySha256, {
    expectedNonTargetSha256: state.baseline.nonTargetSha256,
  });
  const before = classifyHotfixLiveState({
    state,
    inventory: stableBefore.snapshot.records,
    candidateIntent: chain.candidateIntent,
    rollbackIntent: chain.rollbackIntent,
    candidateReceipt: chain.candidateReceipt,
    rollbackReceipt: chain.rollbackReceipt,
  });
  if (before.classification !== expectedClassification)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_STATE_REFUSED:${before.classification}`);
  const reportPath = resolve(argument("output"));
  const proofPath = resolve(argument("proof"));
  const canaryPath = resolve(argument("cms-public-canary"));
  const diagnosticsArgument = argument("diagnostics", { required: false });
  const diagnosticsPath = diagnosticsArgument ? resolve(diagnosticsArgument) : "";
  await mkdir(dirname(reportPath), { recursive: true, mode: 0o700 });
  await mkdir(dirname(proofPath), { recursive: true, mode: 0o700 });
  await mkdir(dirname(canaryPath), { recursive: true, mode: 0o700 });
  await assertPathMissing(reportPath);
  await assertPathMissing(proofPath);
  await assertPathMissing(canaryPath);
  if (diagnosticsPath) {
    await mkdir(dirname(diagnosticsPath), { recursive: true, mode: 0o700 });
    await assertPathMissing(diagnosticsPath);
  }
  const startedAt = new Date().toISOString();
  await runRolloutProbe(reportPath, diagnosticsPath);
  const report = await readJson(reportPath);
  const probeResult = validateHotfixFullProbe(report);
  if (!probeResult.valid)
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_REFUSED:${probeResult.violations.join(",")}`);
  await runCmsPublicCanary({
    state,
    outcome,
    classification: before.classification,
    target: before.snapshot.target,
    output: canaryPath,
  });
  const stableAfter = await stableLiveRead(expectedBodySha256, {
    expectedNonTargetSha256: state.baseline.nonTargetSha256,
  });
  const after = classifyHotfixLiveState({
    state,
    inventory: stableAfter.snapshot.records,
    candidateIntent: chain.candidateIntent,
    rollbackIntent: chain.rollbackIntent,
    candidateReceipt: chain.candidateReceipt,
    rollbackReceipt: chain.rollbackReceipt,
  });
  if (
    after.classification !== expectedClassification ||
    after.snapshot.nonTargetSha256 !== before.snapshot.nonTargetSha256 ||
    !sameFunctionTuple(after.snapshot.target, before.snapshot.target)
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_PROBE_POST_STATE_REFUSED:${after.classification}`);
  const completedAt = new Date().toISOString();
  const proof = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.probe_verified",
    mode: "full",
    outcome,
    workflow: state.workflow,
    executor,
    stateSha256: canonicalSha256(state),
    packageManifestSha256: canonicalSha256(loaded.manifest),
    classification: after.classification,
    target: after.snapshot.target,
    nonTargetSha256: after.snapshot.nonTargetSha256,
    candidateIntentSha256: chain.candidateIntent ? canonicalSha256(chain.candidateIntent.wrapper) : null,
    rollbackIntentSha256: chain.rollbackIntent ? canonicalSha256(chain.rollbackIntent.wrapper) : null,
    receiptSha256: chain.receipt ? canonicalSha256(chain.receipt.wrapper) : null,
    startedAt,
    completedAt,
    probeSha256: await fileSha256(reportPath),
    cmsPublicCanarySha256: await fileSha256(canaryPath),
  };
  const sealed = sealHotfixProbeProof(proof, process.env.RECOVERY_STATE_HMAC_KEY);
  await writeJson(proofPath, sealed);
  publicEvent("g12.staging.cms_public_hotfix.bound_probe_verified", {
    outcome,
    classification: after.classification,
  });
}

async function verifyTerminalCleanup() {
  const outcome = argument("outcome");
  if (!["promoted", "restored"].includes(outcome))
    throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_OUTCOME_REFUSED");
  const expectedClassification = expectedOutcomeClassification(outcome);
  const state = await readJson(argument("state"));
  const loaded = await loadPackage(argument("package"), state);
  await verifiedCurrentExecutor(state);
  const terminalKind = outcome === "promoted" ? "promotedTerminal" : "recoveryTerminal";
  const chain = await evidenceChainForOutcome(state, outcome, {
    [terminalKind]: "terminal-artifact",
  });
  const plan = await assertRemoteTerminalCleanupDomain(state, outcome, chain);
  const expectedBodySha256 = outcome === "promoted" ? state.candidate.bodySha256 : state.baseline.bodySha256;
  const stableLive = await stableLiveRead(expectedBodySha256, {
    expectedNonTargetSha256: state.baseline.nonTargetSha256,
  });
  const classification = classifyHotfixLiveState({
    state,
    inventory: stableLive.snapshot.records,
    candidateIntent: chain.candidateIntent,
    rollbackIntent: chain.rollbackIntent,
    candidateReceipt: chain.candidateReceipt,
    rollbackReceipt: chain.rollbackReceipt,
  });
  if (
    classification.classification !== expectedClassification ||
    classification.violations.length !== 0 ||
    classification.snapshot.nonTargetSha256 !== state.baseline.nonTargetSha256
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_LIVE_REFUSED:${classification.classification}`);
  const receiptArtifact =
    outcome === "promoted" ? chain.bound.artifacts.candidateReceipt : chain.bound.artifacts.rollbackReceipt;
  const receiptCompletedBy =
    outcome === "promoted"
      ? {
          runId: String(state.workflow.runId),
          runAttempt: Number(state.workflow.runAttempt),
          runSha: state.workflow.controlSha,
          controlSha: state.workflow.controlSha,
          workflowPath: STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
        }
      : {
          runId: String(receiptArtifact.owner.runId),
          runAttempt: Number(receiptArtifact.owner.runAttempt),
          runSha: receiptArtifact.owner.runSha,
          controlSha: receiptArtifact.owner.controlSha,
          workflowPath: receiptArtifact.owner.workflowPath,
        };
  const receiptResult = verifyHotfixReceipt(chain.receipt.wrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    action: outcome === "promoted" ? "candidate" : "rollback",
    intent: outcome === "promoted" ? chain.candidateIntent.wrapper : chain.rollbackIntent.wrapper,
    live: classification.snapshot.target,
    completedBy: receiptCompletedBy,
  });
  if (!receiptResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_RECEIPT_REFUSED:${receiptResult.violations.join(",")}`,
    );

  const terminalRoot = await verifiedDirectoryRoot(argument("terminal-artifact"));
  const [probePath, canaryPath, proofPath, terminalPath] = await Promise.all([
    findUnique(terminalRoot, "g12-hotfix-full-probe.json"),
    findUnique(terminalRoot, "g12-hotfix-cms-public-canary.json"),
    findUnique(terminalRoot, "g12-hotfix-probe-proof.json"),
    findUnique(terminalRoot, "g12-hotfix-terminal.json"),
  ]);
  const [probe, canary, proofWrapper, terminal] = await Promise.all([
    readJson(probePath),
    readJson(canaryPath),
    readJson(proofPath),
    readJson(terminalPath),
  ]);
  const probeResult = validateHotfixFullProbe(probe);
  if (!probeResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_PROBE_REFUSED:${probeResult.violations.join(",")}`,
    );
  const canaryResult = validateCmsPublicHotfixCanary(canary, {
    state,
    outcome,
    classification: expectedClassification,
    target: classification.snapshot.target,
    minimumStartedAt: chain.receipt.wrapper.receipt.appliedAt,
    maximumCompletedAt: proofWrapper?.proof?.completedAt,
  });
  if (!canaryResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_CANARY_REFUSED:${canaryResult.violations.join(",")}`,
    );
  const packageManifestSha256 = canonicalSha256(loaded.manifest);
  const probeSha256 = await fileSha256(probePath);
  const cmsPublicCanarySha256 = await fileSha256(canaryPath);
  const probeProofSha256 = await fileSha256(proofPath);
  const receiptSha256 = canonicalSha256(chain.receipt.wrapper);
  const terminalArtifact = chain.bound.artifacts[terminalKind];
  const proofExecutor =
    outcome === "promoted"
      ? {
          runId: String(state.workflow.runId),
          runAttempt: Number(state.workflow.runAttempt),
          runSha: state.workflow.controlSha,
          controlSha: state.workflow.controlSha,
          workflowPath: STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
        }
      : {
          runId: String(terminalArtifact.owner.runId),
          runAttempt: Number(terminalArtifact.owner.runAttempt),
          runSha: terminalArtifact.owner.runSha,
          controlSha: terminalArtifact.owner.controlSha,
          workflowPath: terminalArtifact.owner.workflowPath,
        };
  const proofResult = verifyHotfixProbeProof(proofWrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    executor: proofExecutor,
    packageManifestSha256,
    probeSha256,
    cmsPublicCanarySha256,
    classification: expectedClassification,
    target: classification.snapshot.target,
    nonTargetSha256: classification.snapshot.nonTargetSha256,
    candidateIntentSha256: canonicalSha256(chain.candidateIntent.wrapper),
    rollbackIntentSha256: outcome === "restored" ? canonicalSha256(chain.rollbackIntent.wrapper) : null,
    receiptSha256,
    minimumStartedAt: chain.receipt.wrapper.receipt.appliedAt,
  });
  if (!proofResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_PROOF_REFUSED:${proofResult.violations.join(",")}`,
    );
  const terminalResult = validateHotfixTerminalEvidence(terminal, {
    state,
    outcome,
    packageManifestSha256,
    probeSha256,
    cmsPublicCanarySha256,
    probeProofSha256,
    receiptSha256,
    live: classification.snapshot.target,
  });
  const proofCompletedAt = Date.parse(proofWrapper?.proof?.completedAt ?? "");
  const terminalObservedAt = Date.parse(terminal?.liveObservation?.observedAt ?? "");
  if (
    !terminalResult.valid ||
    !Number.isFinite(proofCompletedAt) ||
    !Number.isFinite(terminalObservedAt) ||
    terminalObservedAt < proofCompletedAt
  )
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_CLEANUP_TERMINAL_REFUSED:${terminalResult.violations.join(",")}`,
    );
  await appendOutput({
    cleanup_phase: plan.phase,
    remaining_clear_order: plan.remainingClearOrder.join(","),
  });
  publicEvent("g12.staging.cms_public_hotfix.terminal_cleanup_verified", {
    outcome,
    phase: plan.phase,
    remainingClearOrder: plan.remainingClearOrder,
  });
}

async function writeTerminalEvidence() {
  const state = await readJson(argument("state"));
  const loaded = await loadPackage(argument("package"), state);
  const executor = await verifiedCurrentExecutor(state);
  const probe = await readJson(argument("probe"));
  const canaryPath = argument("cms-public-canary");
  const canary = await readJson(canaryPath);
  const proofPath = argument("probe-proof");
  const proofWrapper = await readJson(proofPath);
  const probeResult = validateHotfixFullProbe(probe);
  if (!probeResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_PROBE_REFUSED:${probeResult.violations.join(",")}`,
    );
  const outcome = argument("outcome");
  const expectedClassification = expectedOutcomeClassification(outcome);
  if (!expectedClassification) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_OUTCOME_REFUSED");
  const chain = await evidenceChainForOutcome(state, outcome);
  await assertRemoteTerminalDomain(state, outcome, chain);
  const expectedBodySha256 = outcome === "promoted" ? state.candidate.bodySha256 : state.baseline.bodySha256;
  const stableLive = await stableLiveRead(expectedBodySha256, {
    expectedNonTargetSha256: state.baseline.nonTargetSha256,
  });
  const classification = classifyHotfixLiveState({
    state,
    inventory: stableLive.snapshot.records,
    candidateIntent: chain.candidateIntent,
    rollbackIntent: chain.rollbackIntent,
    candidateReceipt: chain.candidateReceipt,
    rollbackReceipt: chain.rollbackReceipt,
  });
  if (
    classification.classification !== expectedClassification ||
    classification.violations.length !== 0 ||
    classification.snapshot.nonTargetSha256 !== state.baseline.nonTargetSha256
  )
    throw new Error(`G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_LIVE_REFUSED:${classification.classification}`);
  const liveBody = stableLive.body;
  const canaryResult = validateCmsPublicHotfixCanary(canary, {
    state,
    outcome,
    classification: expectedClassification,
    target: classification.snapshot.target,
    minimumStartedAt: chain.receipt?.wrapper?.receipt?.appliedAt,
    maximumCompletedAt: proofWrapper?.proof?.completedAt,
  });
  if (!canaryResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_CANARY_REFUSED:${canaryResult.violations.join(",")}`,
    );
  const packageManifestSha256 = canonicalSha256(loaded.manifest);
  const probeSha256 = await fileSha256(argument("probe"));
  const cmsPublicCanarySha256 = await fileSha256(canaryPath);
  const probeProofSha256 = await fileSha256(proofPath);
  const receiptSha256 = chain.receipt ? canonicalSha256(chain.receipt.wrapper) : null;
  const completedAtMs = Date.parse(proofWrapper?.proof?.completedAt ?? "");
  const proofAgeMs = Date.now() - completedAtMs;
  const proofResult = verifyHotfixProbeProof(proofWrapper, process.env.RECOVERY_STATE_HMAC_KEY, {
    state,
    executor,
    packageManifestSha256,
    probeSha256,
    cmsPublicCanarySha256,
    classification: expectedClassification,
    target: classification.snapshot.target,
    nonTargetSha256: classification.snapshot.nonTargetSha256,
    candidateIntentSha256: chain.candidateIntent ? canonicalSha256(chain.candidateIntent.wrapper) : null,
    rollbackIntentSha256: chain.rollbackIntent ? canonicalSha256(chain.rollbackIntent.wrapper) : null,
    receiptSha256,
    minimumStartedAt: chain.receipt?.wrapper?.receipt?.appliedAt,
  });
  if (!proofResult.valid || !Number.isFinite(completedAtMs) || proofAgeMs < -30_000 || proofAgeMs > 300_000)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_PROOF_REFUSED:${proofResult.violations.join(",")}`,
    );
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.terminal",
    outcome,
    workflow: state.workflow,
    release: state.release,
    target: state.target,
    recoveryArtifact: state.recoveryArtifact,
    packageManifestSha256,
    probeSha256,
    cmsPublicCanarySha256,
    probeProofSha256,
    liveObservation: {
      classification: classification.classification,
      target: classification.snapshot.target,
      nonTargetSha256: classification.snapshot.nonTargetSha256,
      bodySha256: liveBody.deploymentSha256,
      observedAt: new Date().toISOString(),
    },
    receiptSha256,
    completedAt: new Date().toISOString(),
    productionMutations: 0,
    nonTargetFunctionMutations: 0,
  };
  const terminalResult = validateHotfixTerminalEvidence(report, {
    state,
    outcome,
    packageManifestSha256,
    probeSha256,
    cmsPublicCanarySha256,
    probeProofSha256,
    receiptSha256,
    live: classification.snapshot.target,
  });
  if (!terminalResult.valid)
    throw new Error(
      `G12_STAGING_CMS_PUBLIC_HOTFIX_TERMINAL_REPORT_REFUSED:${terminalResult.violations.join(",")}`,
    );
  await writeJson(argument("output"), report);
  publicEvent(report.event, { outcome });
}

const operation = process.argv[2];
const operations = {
  "verify-run-artifact": verifyRunArtifact,
  "resolve-run-artifacts": resolveRunArtifacts,
  "resolve-watchdog-artifacts": resolveWatchdogArtifacts,
  "verify-sources": verifySources,
  "prepare-bundle-input": prepareBundleInput,
  "seal-candidate": sealCandidate,
  "materialize-candidate-eszip": materializeCandidateEszip,
  "verify-runtime-unbundle": verifyRuntimeUnbundle,
  "verify-candidate-ci": verifyCandidateCi,
  "verify-trusted-baseline": verifyTrustedBaseline,
  "capture-baseline": captureBaseline,
  "build-state": buildState,
  "verify-artifact": verifyArtifactAndPackage,
  "prepare-intent": prepareIntent,
  "apply-candidate": applyCandidate,
  "restore-baseline": restoreBaseline,
  observe: observeState,
  "validate-probe": validateProbe,
  "run-bound-full-probe": runBoundFullProbe,
  "verify-terminal-cleanup": verifyTerminalCleanup,
  terminal: writeTerminalEvidence,
};

if (!Object.hasOwn(operations, operation)) throw new Error("G12_STAGING_CMS_PUBLIC_HOTFIX_OPERATION_REFUSED");
await operations[operation]();
