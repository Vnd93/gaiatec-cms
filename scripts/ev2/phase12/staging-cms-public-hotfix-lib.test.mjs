import assert from "node:assert/strict";
import { createHash, randomFillSync } from "node:crypto";
import test from "node:test";

import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { CMS_PUBLIC_BUNDLE_LOCK } from "./staging-cms-public-hotfix-deno-lock-lib.mjs";
import { CMS_PUBLIC_JSR_MIRROR } from "./staging-cms-public-hotfix-jsr-mirror-lib.mjs";
import {
  assertBoundedFileByteLength,
  assertArtifactTreeByteLength,
  assertArtifactTreeEntryCount,
  assertArtifactTreeFileCount,
  assertArtifactTreePath,
  assertExactSourceIdentity,
  assertLiveBodyByteLength,
  assertRawEszipByteLength,
  assertWireBundleByteLength,
  buildHotfixRecoveryState,
  buildRecoveryPackageManifest,
  canonicalSha256,
  classifyHotfixLiveState,
  executeHotfixRollbackTransition,
  frameRawEszip,
  functionInventorySnapshot,
  hasExpectedCandidateEszipStructure,
  inspectEszipV2,
  normalizeGithubArtifactDigest,
  reconcileDownloadedBundleBody,
  safeArtifactTreeEvidencePath,
  selectHotfixWatchdogArtifactChain,
  sealHotfixIntent,
  sealHotfixProbeProof,
  sealHotfixReceipt,
  sha256Bytes,
  stagingCmsPublicPromotionConfirmation,
  stagingCmsPublicRecoveryConfirmation,
  STAGING_CMS_PUBLIC_HOTFIX,
  validateCmsPublicHotfixCanary,
  validateCandidateBuildProvenance,
  validateCandidateBuildEvidenceFiles,
  validateHotfixFullProbe,
  validateHotfixPreProbe,
  validateHotfixRecoveryState,
  validateHotfixTerminalEvidence,
  validateRecoveryPackage,
  validateRecoveredBaselineEvidence,
  validateTrustedBaselineEvidence,
  verifyHotfixIntent,
  verifyHotfixProbeProof,
  verifyHotfixReceipt,
} from "./staging-cms-public-hotfix-lib.mjs";

const key = "9".repeat(64);

test("manual recovery authorization is bound to the incident, fixed control, CI and rollback", () => {
  const controlSha = "7".repeat(40);
  const ciRunId = "35295987041";
  assert.equal(
    stagingCmsPublicRecoveryConfirmation({ controlSha, ciRunId }),
    `RECOVER_STAGING_CMS_PUBLIC_PARENT_RUN_35302861714_ATTEMPT_1_PARENT_CONTROL_351e0d3f8ece51db30abe000e9b562ec11ae1006_RECOVERY_CONTROL_${controlSha}_CI_${ciRunId}_ROLLBACK_c8aec5cad25830580bf9ca8a89594ebce1aa3570`,
  );
  assert.throws(
    () => stagingCmsPublicRecoveryConfirmation({ controlSha: "bad", ciRunId }),
    /RECOVERY_CONFIRMATION_INPUT_REFUSED/,
  );
  assert.throws(
    () => stagingCmsPublicRecoveryConfirmation({ controlSha, ciRunId: "0" }),
    /RECOVERY_CONFIRMATION_INPUT_REFUSED/,
  );
});

test("promotion authorization is freshly bound to control, CI and recovered baseline artifacts", () => {
  const controlSha = "6".repeat(40);
  const ciRunId = "35300000001";
  const recovered = STAGING_CMS_PUBLIC_HOTFIX.recoveredBaseline;
  assert.equal(Object.hasOwn(STAGING_CMS_PUBLIC_HOTFIX, "confirmation"), false);
  const expected =
    `PROMOTE_STAGING_CMS_PUBLIC_${STAGING_CMS_PUBLIC_HOTFIX.hotfixSha}` +
    `_CONTROL_${controlSha}_CI_${ciRunId}_RECOVERY_RUN_${recovered.runId}` +
    `_ATTEMPT_${recovered.runAttempt}_TERMINAL_${recovered.terminalArtifactId}` +
    `_RECEIPT_${recovered.receiptArtifactId}_ROLLBACK_${STAGING_CMS_PUBLIC_HOTFIX.rollbackSha}`;
  assert.equal(stagingCmsPublicPromotionConfirmation({ controlSha, ciRunId }), expected);
  assert.notEqual(stagingCmsPublicPromotionConfirmation({ controlSha: "7".repeat(40), ciRunId }), expected);
  assert.notEqual(stagingCmsPublicPromotionConfirmation({ controlSha, ciRunId: "35300000002" }), expected);
  assert.throws(
    () => stagingCmsPublicPromotionConfirmation({ controlSha: "bad", ciRunId }),
    /PROMOTION_CONFIRMATION_INPUT_REFUSED/,
  );
});

function be32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function sha256Buffer(value) {
  return createHash("sha256").update(value).digest();
}

function eszipSection(content) {
  return Buffer.concat([be32(content.byteLength), content, sha256Buffer(content)]);
}

function eszipFromModules(modules) {
  let sourceOffset = 0;
  const header = [];
  const sources = [];
  for (const module of modules) {
    const specifier = Buffer.from(module.specifier, "utf8");
    header.push(be32(specifier.byteLength), specifier, Buffer.from([module.entryKind]));
    if (module.entryKind === 1) {
      const target = Buffer.from(module.target, "utf8");
      header.push(be32(target.byteLength), target);
      continue;
    }
    if (module.entryKind === 2) {
      header.push(be32(0));
      continue;
    }
    header.push(
      be32(sourceOffset),
      be32(module.source.byteLength),
      be32(0),
      be32(0),
      Buffer.from([module.kind]),
    );
    sources.push(module.source, sha256Buffer(module.source));
    sourceOffset += module.source.byteLength + 32;
  }
  const options = Buffer.from([0, 1, 1, 32]);
  const sourceSection = Buffer.concat(sources);
  return Buffer.concat([
    Buffer.from("ESZIP2.3", "ascii"),
    eszipSection(options),
    eszipSection(Buffer.concat(header)),
    eszipSection(Buffer.alloc(0)),
    be32(sourceSection.byteLength),
    sourceSection,
    be32(0),
  ]);
}

function validEszip(
  label = "candidate",
  {
    metadataEntryKind = 0,
    entrypointSource,
    jsrRedirectTarget = "https://jsr.io/@supabase/functions-js/2.112.4/src/edge-runtime.d.ts",
    jsrModuleSpecifier = jsrRedirectTarget,
    includeSupabaseRedirect = true,
    supabaseRedirectTarget = "https://jsr.io/@supabase/supabase-js/2.112.4/src/index.ts",
    supabaseModuleSpecifier = supabaseRedirectTarget,
  } = {},
) {
  const modules = [
    {
      specifier: STAGING_CMS_PUBLIC_HOTFIX.candidateEszipEntrypointSpecifier,
      source:
        entrypointSource ?? Buffer.from(`Deno.serve(() => new Response(${JSON.stringify(label)}));`, "utf8"),
      kind: 0,
      entryKind: 0,
    },
    {
      specifier: "jsr:@supabase/functions-js/edge-runtime.d.ts",
      entryKind: 1,
      target: jsrRedirectTarget,
    },
    {
      specifier: jsrModuleSpecifier,
      source: Buffer.from("export {};", "utf8"),
      kind: 0,
      entryKind: 0,
    },
  ];
  if (includeSupabaseRedirect) {
    modules.push(
      {
        specifier: "jsr:@supabase/supabase-js@2",
        entryKind: 1,
        target: supabaseRedirectTarget,
      },
      {
        specifier: supabaseModuleSpecifier,
        source: Buffer.from("export const createClient = () => ({});", "utf8"),
        kind: 0,
        entryKind: 0,
      },
    );
  }
  modules.push({
    specifier: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeMetadataSpecifier,
    entryKind: metadataEntryKind,
    ...(metadataEntryKind === 0
      ? {
          source: Buffer.from('{"serializedWorkspaceResolver":{}}', "utf8"),
          kind: 3,
        }
      : {}),
  });
  return eszipFromModules(modules);
}

const candidateRawEszip = validEszip();
const candidateBody = frameRawEszip(candidateRawEszip);

function candidateEvidence() {
  const unbundledFiles = Buffer.from(`${sha256Bytes(Buffer.alloc(0))}  ./edge-runtime.d.ts\n`, "utf8");
  const inspection = inspectEszipV2(candidateRawEszip);
  const attestation = (mode, network) =>
    Buffer.from(
      [
        "SCHEMA_VERSION=2",
        "EVENT=g12.staging.cms_public_hotfix.bundle_attestation",
        `MODE=${mode}`,
        `NETWORK=${network}`,
        `CANDIDATE_SHA=${STAGING_CMS_PUBLIC_HOTFIX.hotfixSha}`,
        `SOURCE_SHA256=${STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256}`,
        `SOURCE_DENO_LOCK_SHA256=${STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256}`,
        `BUNDLE_DENO_LOCK_SHA256=${STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256}`,
        `BUNDLE_DENO_LOCK_NPM_ROOT_SPECIFIERS=${JSON.stringify(CMS_PUBLIC_BUNDLE_LOCK.npmRootSpecifiers)}`,
        `BUNDLE_DENO_LOCK_EVIDENCE_JSON=${JSON.stringify(CMS_PUBLIC_BUNDLE_LOCK.evidence)}`,
        `DENO_CONFIG_SHA256=${"4".repeat(64)}`,
        `IMPORT_MAP_SHA256=${STAGING_CMS_PUBLIC_HOTFIX.importMapSha256}`,
        `INPUT_MANIFEST_SHA256=${"1".repeat(64)}`,
        `INPUT_FILES_MANIFEST_SHA256=${"2".repeat(64)}`,
        `INPUT_TREE_SHA256=${"3".repeat(64)}`,
        "INPUT_FILE_COUNT=4",
        `JSR_URL=${CMS_PUBLIC_JSR_MIRROR.runtimeUrl}`,
        `JSR_MIRROR_MANIFEST_SHA256=${"5".repeat(64)}`,
        `JSR_MIRROR_FILES_MANIFEST_SHA256=${"6".repeat(64)}`,
        `JSR_MIRROR_TREE_SHA256=${"6".repeat(64)}`,
        "JSR_MIRROR_FILE_COUNT=168",
        "JSR_MIRROR_BYTES=712180",
        `RAW_ESZIP_SHA256=${inspection.sha256}`,
        `RAW_ESZIP_BYTES=${inspection.bytes}`,
        `UNBUNDLED_FILES_SHA256=${sha256Bytes(unbundledFiles)}`,
        "UNBUNDLED_FILE_COUNT=1",
        "UNBUNDLED_TOTAL_BYTES=0",
        "UNBUNDLED_ZERO_BYTE_FILE_COUNT=1",
        "UNBUNDLED_LARGEST_FILE_BYTES=0",
        `EDGE_RUNTIME_INDEX_DIGEST=${STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest}`,
        `EDGE_RUNTIME_AMD64_DIGEST=${STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest}`,
        "PLATFORM=linux/amd64",
        `BUNDLE_COMMAND_SHA256=${sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.bundleCommand))}`,
        `UNBUNDLED_COMMAND_SHA256=${sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.unbundleCommand))}`,
        `BUILDER_SCRIPT_SHA256=${STAGING_CMS_PUBLIC_HOTFIX.builderScriptSha256}`,
        "ESZIP_VALIDATED=true",
        "",
      ].join("\n"),
      "utf8",
    );
  return {
    primary: {
      attestation: attestation("online-primary", "default"),
      unbundledFiles,
    },
    rebuild: {
      attestation: attestation("online-rebuild", "default"),
      unbundledFiles,
    },
  };
}

function candidateProvenance(evidence = candidateEvidence()) {
  const inspection = inspectEszipV2(candidateRawEszip);
  const build = (key, mode, network) => ({
    mode,
    network,
    attestationFile: `${key}-build-attestation.env`,
    attestationSha256: sha256Bytes(evidence[key].attestation),
    unbundledFilesFile: `${key}-unbundled-files.sha256`,
    unbundledFilesSha256: sha256Bytes(evidence[key].unbundledFiles),
    unbundledFileCount: 1,
    unbundledTotalBytes: 0,
    unbundledZeroByteFileCount: 1,
    unbundledLargestFileBytes: 0,
    rawEszipSha256: inspection.sha256,
    rawEszipBytes: inspection.bytes,
  });
  return {
    schemaVersion: 2,
    event: "g12.staging.cms_public_hotfix.bundle_provenance",
    input: {
      manifestSha256: "1".repeat(64),
      filesManifestSha256: "2".repeat(64),
      treeSha256: "3".repeat(64),
      fileCount: 4,
      denoConfigSha256: "4".repeat(64),
      sourceDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256,
      bundleDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256,
      bundleDenoLock: structuredClone(CMS_PUBLIC_BUNDLE_LOCK.evidence),
      importMapSha256: STAGING_CMS_PUBLIC_HOTFIX.importMapSha256,
      jsrMirror: {
        runtimeUrl: CMS_PUBLIC_JSR_MIRROR.runtimeUrl,
        manifestSha256: "5".repeat(64),
        filesManifestSha256: "6".repeat(64),
        treeSha256: "6".repeat(64),
        fileCount: 168,
        bytes: 712180,
        moduleImportMetaAbsent: true,
      },
    },
    builder: {
      edgeRuntimeIndexDigest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest,
      edgeRuntimeAmd64Digest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest,
      platform: "linux/amd64",
      bundleCommandSha256: sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.bundleCommand)),
      unbundleCommandSha256: sha256Bytes(Buffer.from(STAGING_CMS_PUBLIC_HOTFIX.unbundleCommand)),
      builderScriptSha256: STAGING_CMS_PUBLIC_HOTFIX.builderScriptSha256,
      checksum: "sha256",
      lockFrozen: true,
    },
    rawEszip: inspection,
    builds: {
      primary: build("primary", "online-primary", "default"),
      rebuild: build("rebuild", "online-rebuild", "default"),
    },
    reproducible: true,
  };
}

function remoteRecord(name, index) {
  const suffix = String(index + 1).padStart(12, "0");
  return {
    id: `00000000-0000-4000-8000-${suffix}`,
    name,
    slug: name,
    status: "ACTIVE",
    verify_jwt: !PUBLIC_FUNCTIONS.has(name),
    version: 100 + index,
    ezbr_sha256: index.toString(16).padStart(64, "a").slice(-64),
    created_at: "2026-09-01T10:00:00.000Z",
    updated_at: "2026-09-14T20:00:00.000Z",
    entrypoint_path: `file:///baseline/supabase/functions/${name}/index.ts`,
    import_map: true,
    import_map_path: "file:///baseline/supabase/functions/import_map.json",
  };
}

function baselineInventory(baseline = STAGING_CMS_PUBLIC_HOTFIX.baselineFunction) {
  const records = PRODUCTION_FUNCTIONS.map(remoteRecord);
  const target = records.find((record) => record.name === "cms-public");
  Object.assign(target, {
    id: baseline.id,
    version: baseline.version,
    ezbr_sha256: baseline.bundleSha256,
    created_at: baseline.createdAt,
    updated_at: baseline.updatedAt,
    verify_jwt: false,
    entrypoint_path: baseline.entrypointPath,
    import_map: baseline.importMap,
    import_map_path: baseline.importMapPath,
  });
  return records;
}

function probe({ failedContactTail = false } = {}) {
  const routeMetrics = Object.fromEntries(
    ["/", "/produtos", "/contato", "/admin/login"].map((route) => [
      route,
      {
        samples: 20,
        availabilityPercent: 100,
        p50Ms: 100,
        p95Ms: failedContactTail && route === "/contato" ? 3_125 : 500,
        maxMs: failedContactTail && route === "/contato" ? 4_258 : 700,
      },
    ]),
  );
  return {
    schemaVersion: 1,
    event: "g12.rollout.probe",
    probeProfile: "full",
    warmupSamplesPerRoute: 20,
    origin: STAGING_CMS_PUBLIC_HOTFIX.origin,
    candidateSha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
    environment: "staging",
    measuredResponses: 82,
    sampleCount: 20,
    availabilityPercent: 100,
    http5xxRatePercent: 0,
    publicP95Ms: 500,
    requestTimeoutMs: 10_000,
    routeMetrics,
    routeBudgetsValid: !failedContactTail,
    releaseHeadersExact: true,
    healthContractValid: true,
    manifestReleaseExact: true,
    nonProductionNoindexValid: true,
    cspPolicyValid: true,
    outcome: failedContactTail ? "pause" : "pass",
    violations: failedContactTail ? ["route_latency_budget_exceeded:/contato"] : [],
  };
}

function packageAndState() {
  const inventory = baselineInventory();
  const target = functionInventorySnapshot(inventory).target;
  const baselineBody = Buffer.alloc(32, 7);
  const baselineDigest = STAGING_CMS_PUBLIC_HOTFIX.baselineFunction.bundleSha256;
  // buildRecoveryPackageManifest intentionally requires the real historical hash. Construct the
  // equivalent validated manifest directly for state-machine tests; byte reconciliation is covered
  // independently below.
  const snapshot = functionInventorySnapshot(inventory);
  const manifest = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.recovery_package",
    repository: STAGING_CMS_PUBLIC_HOTFIX.repository,
    release: {
      hotfixSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixSha,
      parentSha: STAGING_CMS_PUBLIC_HOTFIX.hotfixParentSha,
      rollbackSha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
    },
    target: { environment: "staging", projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef, slug: "cms-public" },
    source: {
      baselineSha256: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
      candidateSha256: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
      sourceDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256,
      bundleDenoLockSha256: STAGING_CMS_PUBLIC_HOTFIX.bundleDenoLockSha256,
      bundleDenoLock: structuredClone(CMS_PUBLIC_BUNDLE_LOCK.evidence),
      importMapSha256: STAGING_CMS_PUBLIC_HOTFIX.importMapSha256,
    },
    builder: {
      edgeRuntimeIndexDigest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeIndexDigest,
      edgeRuntimeAmd64Digest: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeAmd64Digest,
      lockFrozen: true,
      platform: "linux/amd64",
    },
    baseline: {
      file: "baseline-body.ezbr",
      sha256: baselineDigest,
      bytes: baselineBody.length,
      tuple: target,
    },
    candidate: {
      file: "candidate-body.ezbr",
      sha256: "2".repeat(64),
      bytes: candidateBody.length,
      entrypointPath: STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath,
      importMapPath: STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath,
      verifyJwt: false,
      bundleDenoLock: structuredClone(CMS_PUBLIC_BUNDLE_LOCK.evidence),
      provenance: candidateProvenance(),
    },
    inventory: {
      file: "baseline-inventory.json",
      sha256: snapshot.inventorySha256,
      nonTargetSha256: snapshot.nonTargetSha256,
      count: snapshot.records.length,
    },
  };
  const state = buildHotfixRecoveryState({
    workflow: { runId: "35000000001", runAttempt: 1, controlSha: "f".repeat(40) },
    artifact: {
      id: "10400000001",
      name: "staging-cms-public-hotfix-recovery-35000000001-1",
      digest: `sha256:${"3".repeat(64)}`,
    },
    manifest,
  });
  return { state, manifest, inventory, target, snapshot };
}

function liveCandidate(fixture) {
  const inventory = structuredClone(fixture.inventory);
  const target = inventory.find((record) => record.name === "cms-public");
  Object.assign(target, {
    version: fixture.target.version + 1,
    ezbr_sha256: fixture.state.candidate.bodySha256,
    updated_at: "2026-09-18T04:00:00.000Z",
    entrypoint_path: STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath,
    import_map_path: STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath,
    import_map: true,
    verify_jwt: false,
  });
  return inventory;
}

function intent(action, state, before) {
  const baseline = state.baseline.tuple;
  const expected =
    action === "candidate"
      ? {
          ...baseline,
          version: baseline.version + 1,
          bundleSha256: state.candidate.bodySha256,
          updatedAt: "",
          entrypointPath: state.candidate.entrypointPath,
          importMap: true,
          importMapPath: state.candidate.importMapPath,
          verifyJwt: false,
        }
      : { ...baseline, version: before.version + 1, updatedAt: "" };
  return sealHotfixIntent(
    {
      schemaVersion: 1,
      event: `g12.staging.cms_public_hotfix.${action}_intent`,
      action,
      workflow: state.workflow,
      preparedBy: {
        runId: "35000000001",
        runAttempt: 1,
        runSha: state.workflow.controlSha,
        controlSha: state.workflow.controlSha,
        workflowPath: STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
      },
      projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
      slug: "cms-public",
      state,
      before,
      expected,
      preparedAt: action === "candidate" ? "2026-09-18T03:59:00.000Z" : "2026-09-18T04:01:30.000Z",
    },
    key,
  );
}

function receipt(action, state, boundIntent, before, after) {
  const preparedBy = boundIntent.intent.preparedBy;
  return {
    schemaVersion: 1,
    event: `g12.staging.cms_public_hotfix.${action}_applied`,
    action,
    workflow: state.workflow,
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    slug: "cms-public",
    intentSha256: canonicalSha256(boundIntent),
    preparedBy,
    intentPreparedAt: boundIntent.intent.preparedAt,
    completedBy: preparedBy,
    completionMode: "patched",
    state,
    before,
    after,
    nonTargetSha256: state.baseline.nonTargetSha256,
    appliedAt: action === "candidate" ? "2026-09-18T04:01:00.000Z" : "2026-09-18T04:03:00.000Z",
  };
}

test("raw and wire bundle limits remain finite, closed and independently enforced", () => {
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileBytes, 2 * 1024 * 1024);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactTreeBytes, 64 * 1024 * 1024);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileCount, 65_536);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactEntryCount, 65_536);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactPathBytes, 4_096);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactDepth, 64);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumEszipModuleCount, 65_536);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes, 20 * 1024 * 1024);
  assert.equal(STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes, 64 * 1024 * 1024);
  assert.ok(
    STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes < STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes,
  );
  assert.equal(
    assertRawEszipByteLength(STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes),
    STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes,
  );
  assert.throws(
    () => assertRawEszipByteLength(STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes + 1),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SIZE_REFUSED/,
  );
  assert.equal(
    assertWireBundleByteLength(STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes),
    STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes,
  );
  assert.throws(
    () => assertWireBundleByteLength(STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes + 1),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_SIZE_REFUSED/,
  );
  assert.equal(
    assertLiveBodyByteLength(STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes),
    STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes,
  );
  assert.throws(
    () => assertLiveBodyByteLength(STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes + 1),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_LIVE_BODY_SIZE_REFUSED/,
  );
});

test("artifact tree count, byte, path and depth helpers enforce exact caps", () => {
  const limits = STAGING_CMS_PUBLIC_HOTFIX;
  assert.equal(assertArtifactTreeFileCount(limits.maximumArtifactFileCount), 65_536);
  assert.throws(
    () => assertArtifactTreeFileCount(limits.maximumArtifactFileCount + 1),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_FILE_COUNT_REFUSED/,
  );
  assert.equal(assertArtifactTreeEntryCount(limits.maximumArtifactEntryCount), 65_536);
  assert.throws(
    () => assertArtifactTreeEntryCount(limits.maximumArtifactEntryCount + 1),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_ENTRY_COUNT_REFUSED/,
  );
  assert.equal(assertArtifactTreeByteLength(limits.maximumArtifactTreeBytes), 64 * 1024 * 1024);
  assert.throws(
    () => assertArtifactTreeByteLength(limits.maximumArtifactTreeBytes + 1),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_TOO_LARGE_REFUSED/,
  );

  const exactPath = "é".repeat(2_048);
  const oversizedPath = `${exactPath}a`;
  assert.equal(assertArtifactTreePath(exactPath).bytes, limits.maximumArtifactPathBytes);
  assert.throws(
    () => assertArtifactTreePath(oversizedPath),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_PATH_SIZE_REFUSED/,
  );
  assert.equal(safeArtifactTreeEvidencePath(oversizedPath), undefined);
  assert.equal(safeArtifactTreeEvidencePath("C:/private/payload"), undefined);

  const exactDepth = Array.from({ length: limits.maximumArtifactDepth }, () => "a").join("/");
  const excessiveDepth = `${exactDepth}/a`;
  assert.equal(assertArtifactTreePath(exactDepth).depth, limits.maximumArtifactDepth);
  assert.throws(
    () => assertArtifactTreePath(excessiveDepth),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_TREE_DEPTH_REFUSED/,
  );
});

test("artifact file boundaries accept attested empty files only through explicit opt-in", () => {
  const maximum = STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileBytes;
  assert.equal(assertBoundedFileByteLength(0, maximum, { allowEmpty: true }), 0);
  assert.equal(assertBoundedFileByteLength(maximum, maximum), maximum);
  assert.throws(
    () => assertBoundedFileByteLength(0, maximum),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_EMPTY_REFUSED/,
  );
  assert.throws(
    () => assertBoundedFileByteLength(maximum + 1, maximum),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_TOO_LARGE_REFUSED/,
  );
  assert.throws(
    () => assertBoundedFileByteLength(64 * 1024 * 1024 + 1, maximum),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_FILE_TOO_LARGE_REFUSED/,
  );
});

test("ESZIP parsing rejects duplicate specifiers and a module-count cap plus one", () => {
  const duplicate = eszipFromModules([
    { specifier: "workspace/entry.ts", source: Buffer.from("export {};"), kind: 0, entryKind: 0 },
    { specifier: "workspace/entry.ts", entryKind: 2 },
  ]);
  assert.throws(() => inspectEszipV2(duplicate), /G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_SPECIFIER_REFUSED/);

  const modules = [
    { specifier: "workspace/entry.ts", source: Buffer.from("export {};"), kind: 0, entryKind: 0 },
  ];
  for (let index = 0; index < STAGING_CMS_PUBLIC_HOTFIX.maximumEszipModuleCount; index += 1)
    modules.push({ specifier: `vfs://g12/${index}`, entryKind: 2 });
  const overCount = eszipFromModules(modules);
  assert.ok(overCount.byteLength < STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes);
  assert.throws(() => inspectEszipV2(overCount), /G12_STAGING_CMS_PUBLIC_HOTFIX_ESZIP_MODULE_COUNT_REFUSED/);
});

test("EZBR framing refuses incompressible output before allocating beyond the wire cap", () => {
  const incompressibleSource = randomFillSync(
    Buffer.allocUnsafe(STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes + 1024 * 1024),
  );
  const raw = validEszip("incompressible", { entrypointSource: incompressibleSource });
  assert.ok(raw.byteLength < STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes);
  assert.throws(() => frameRawEszip(raw), /G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_SIZE_REFUSED/);
});

test("EZBR framing is deterministic and downloaded raw or framed bodies reconcile to one exact digest", () => {
  const raw = validEszip("exact-baseline");
  const framed = frameRawEszip(raw);
  const digest = sha256Bytes(framed);
  const fromRaw = reconcileDownloadedBundleBody(raw, digest);
  const fromFramed = reconcileDownloadedBundleBody(framed, digest);
  assert.deepEqual(fromRaw.deploymentBody, framed);
  assert.deepEqual(fromFramed.rawEszip, raw);
  assert.throws(() => reconcileDownloadedBundleBody(Buffer.alloc(32, 7), digest), /ESZIP_VERSION_REFUSED/);
  assert.throws(() => reconcileDownloadedBundleBody(raw, "0".repeat(64)), /BASELINE_BODY_MISMATCH/);
});

test("downloaded raw ESZIP may exceed the wire cap without relaxing the framed EZBR cap", () => {
  const raw = validEszip("raw-over-wire", {
    entrypointSource: Buffer.alloc(STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes, 65),
  });
  assert.ok(raw.byteLength > STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes);
  assert.ok(raw.byteLength < STAGING_CMS_PUBLIC_HOTFIX.maximumRawEszipBytes);
  const framed = frameRawEszip(raw);
  assert.ok(framed.byteLength <= STAGING_CMS_PUBLIC_HOTFIX.maximumWireBundleBytes);
  const reconciled = reconcileDownloadedBundleBody(raw, sha256Bytes(framed));
  assert.deepEqual(reconciled.rawEszip, raw);
  assert.deepEqual(reconciled.deploymentBody, framed);
  assert.equal(reconciled.deploymentSha256, sha256Bytes(framed));
});

test("inventory snapshots preserve the complete target tuple and detect every non-target drift", () => {
  const inventory = baselineInventory();
  const snapshot = functionInventorySnapshot(inventory);
  assert.equal(snapshot.valid, true, snapshot.violations.join(","));
  assert.equal(snapshot.records.length, PRODUCTION_FUNCTIONS.length);
  assert.equal(snapshot.target.bundleSha256, STAGING_CMS_PUBLIC_HOTFIX.baselineFunction.bundleSha256);

  const drift = structuredClone(inventory);
  drift.find((record) => record.name !== "cms-public").version += 1;
  assert.notEqual(functionInventorySnapshot(drift).nonTargetSha256, snapshot.nonTargetSha256);

  const missing = inventory.slice(1);
  assert.match(functionInventorySnapshot(missing).violations.join(","), /inventory_names_invalid/);

  const missingName = structuredClone(inventory);
  delete missingName[0].name;
  assert.equal(functionInventorySnapshot(missingName).valid, false);
  const missingSlug = structuredClone(inventory);
  delete missingSlug[0].slug;
  assert.equal(functionInventorySnapshot(missingSlug).valid, false);
});

test("pre-probe allows only a clean pass or the single known contato tail and full probes stay strict", () => {
  assert.equal(validateHotfixPreProbe(probe()).valid, true);
  assert.equal(validateHotfixPreProbe(probe({ failedContactTail: true })).valid, true);
  assert.equal(validateHotfixFullProbe(probe()).valid, true);
  assert.equal(validateHotfixFullProbe(probe({ failedContactTail: true })).valid, false);

  const relaxed = probe({ failedContactTail: true });
  relaxed.violations.push("health_contract_invalid");
  assert.equal(validateHotfixPreProbe(relaxed).valid, false);
  const short = probe();
  short.sampleCount = 5;
  assert.equal(validateHotfixFullProbe(short).valid, false);
  const inverted = probe({ failedContactTail: true });
  inverted.routeMetrics["/produtos"].p50Ms = 800;
  assert.equal(validateHotfixPreProbe(inverted).valid, false);
  const impossiblePublicP95 = probe({ failedContactTail: true });
  impossiblePublicP95.publicP95Ms = 10_000;
  assert.equal(validateHotfixPreProbe(impossiblePublicP95).valid, false);
});

test("trusted failed baseline is accepted only with the exact successful finalizer and artifact", () => {
  const inventory = baselineInventory(STAGING_CMS_PUBLIC_HOTFIX.sourceBaselineFunction);
  const snapshot = functionInventorySnapshot(inventory);
  const target = snapshot.target;
  const input = {
    run: {
      id: 34908383307,
      run_attempt: 1,
      name: "Deploy staging",
      path: ".github/workflows/deploy-staging.yml",
      event: "workflow_dispatch",
      status: "completed",
      conclusion: "failure",
      head_branch: "main",
      head_sha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
      repository: { full_name: STAGING_CMS_PUBLIC_HOTFIX.repository },
      head_repository: { full_name: STAGING_CMS_PUBLIC_HOTFIX.repository },
      actor: { login: "Vnd93" },
      triggering_actor: { login: "Vnd93" },
    },
    jobs: {
      jobs: [
        { name: "deploy", status: "completed", conclusion: "failure", run_attempt: 1 },
        { name: "diagnostic", status: "completed", conclusion: "skipped", run_attempt: 1 },
        { name: "finalize", status: "completed", conclusion: "success", run_attempt: 1 },
      ],
    },
    artifact: {
      id: 10373653337,
      name: "staging-terminal-34908383307-1",
      digest: STAGING_CMS_PUBLIC_HOTFIX.trustedBaseline.artifactDigest,
      expired: false,
      expires_at: "2099-10-14T23:41:36Z",
      size_in_bytes: 9_340,
      workflow_run: { id: 34908383307, head_branch: "main", head_sha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha },
    },
    probe: probe(),
    inventory,
    receipt: {
      schemaVersion: 1,
      event: "g12.staging.functions.deployment_verified",
      candidateSha: STAGING_CMS_PUBLIC_HOTFIX.rollbackSha,
      projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
      target: "candidate",
      deployments: [
        {
          name: "cms-public",
          sourceSha256: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
          bundleSha256: target.bundleSha256,
          version: target.version,
          updatedAt: target.updatedAt,
          verifyJwt: false,
        },
      ],
    },
  };
  assert.equal(validateTrustedBaselineEvidence(input).valid, true);
  const noFinalizer = structuredClone(input);
  noFinalizer.jobs.jobs[2].conclusion = "failure";
  assert.match(validateTrustedBaselineEvidence(noFinalizer).violations.join(","), /trusted_jobs_invalid/);
  const wrongArtifact = structuredClone(input);
  wrongArtifact.artifact.digest = `sha256:${"0".repeat(64)}`;
  assert.match(
    validateTrustedBaselineEvidence(wrongArtifact).violations.join(","),
    /trusted_artifact_invalid/,
  );
});

test("recovered baseline requires the exact successful recovery, artifacts, receipt and v287 tuple", () => {
  const expected = STAGING_CMS_PUBLIC_HOTFIX.recoveredBaseline;
  const sourceBaseline = STAGING_CMS_PUBLIC_HOTFIX.sourceBaselineFunction;
  const sourceSnapshot = functionInventorySnapshot(baselineInventory(sourceBaseline));
  const recoverySourceBaseline = STAGING_CMS_PUBLIC_HOTFIX.recoverySourceBaselineFunction;
  const recoverySourceSnapshot = functionInventorySnapshot(baselineInventory(recoverySourceBaseline));
  const fixture = packageAndState();
  const state = structuredClone(fixture.state);
  state.workflow = {
    runId: STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentRunId,
    runAttempt: STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentRunAttempt,
    controlSha: STAGING_CMS_PUBLIC_HOTFIX.recoveryIncident.parentControlSha,
    path: STAGING_CMS_PUBLIC_HOTFIX.workflowPath,
  };
  state.recoveryArtifact = {
    id: "10528426197",
    name: `staging-cms-public-hotfix-recovery-${state.workflow.runId}-${state.workflow.runAttempt}`,
    digest: `sha256:${"e".repeat(64)}`,
    packageManifestSha256: "7".repeat(64),
  };
  state.baseline.tuple = recoverySourceSnapshot.target;
  state.baseline.inventorySha256 = recoverySourceSnapshot.inventorySha256;
  state.baseline.nonTargetSha256 = recoverySourceSnapshot.nonTargetSha256;
  assert.equal(validateHotfixRecoveryState(state, { baselineFunction: recoverySourceBaseline }).valid, true);
  const executor = {
    runId: expected.runId,
    runAttempt: expected.runAttempt,
    runSha: expected.controlSha,
    controlSha: state.workflow.controlSha,
    workflowPath: expected.workflowPath,
  };
  const before = {
    ...recoverySourceSnapshot.target,
    version: recoverySourceBaseline.version + 1,
    bundleSha256: state.candidate.bodySha256,
    updatedAt: "2026-09-18T03:23:56.211Z",
    entrypointPath: state.candidate.entrypointPath,
    importMap: true,
    importMapPath: state.candidate.importMapPath,
    verifyJwt: false,
  };
  const receiptPayload = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.rollback_applied",
    action: "rollback",
    workflow: state.workflow,
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    slug: STAGING_CMS_PUBLIC_HOTFIX.functionSlug,
    intentSha256: "9".repeat(64),
    preparedBy: executor,
    intentPreparedAt: "2026-09-18T03:24:59.229Z",
    completedBy: executor,
    completionMode: "patched",
    state,
    before,
    after: STAGING_CMS_PUBLIC_HOTFIX.baselineFunction,
    nonTargetSha256: recoverySourceSnapshot.nonTargetSha256,
    appliedAt: "2026-09-18T03:25:10.890Z",
  };
  const recoveredReceipt = sealHotfixReceipt(receiptPayload, key, {
    stateBaselineFunction: recoverySourceBaseline,
  });
  const fileDigests = {
    terminal: "3".repeat(64),
    probe: "4".repeat(64),
    canary: "5".repeat(64),
    probeProof: "6".repeat(64),
    receipt: "7".repeat(64),
  };
  const recoveredCanary = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.cms_public_canary",
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    functionUrl: `https://${STAGING_CMS_PUBLIC_HOTFIX.projectRef}.supabase.co/functions/v1/cms-public`,
    origin: STAGING_CMS_PUBLIC_HOTFIX.origin,
    outcome: "restored",
    stateSha256: canonicalSha256(state),
    classification: "rollback-receipted",
    target: STAGING_CMS_PUBLIC_HOTFIX.baselineFunction,
    warmupSamples: 20,
    measuredSamples: 20,
    managedPath: "/contato",
    managedLatency: { samples: 20, p50Ms: 300, p95Ms: 600, maxMs: 700 },
    scenarios: {
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
    },
    startedAt: "2026-09-18T03:25:12.000Z",
    completedAt: "2026-09-18T03:26:24.000Z",
  };
  const receiptSha256 = canonicalSha256(recoveredReceipt);
  const recoveredProof = sealHotfixProbeProof(
    {
      schemaVersion: 1,
      event: "g12.staging.cms_public_hotfix.probe_verified",
      mode: "full",
      outcome: "restored",
      workflow: state.workflow,
      executor,
      stateSha256: canonicalSha256(state),
      packageManifestSha256: state.recoveryArtifact.packageManifestSha256,
      classification: "rollback-receipted",
      target: STAGING_CMS_PUBLIC_HOTFIX.baselineFunction,
      nonTargetSha256: recoverySourceSnapshot.nonTargetSha256,
      candidateIntentSha256: "8".repeat(64),
      rollbackIntentSha256: "9".repeat(64),
      receiptSha256,
      startedAt: "2026-09-18T03:25:12.000Z",
      completedAt: "2026-09-18T03:26:24.000Z",
      probeSha256: fileDigests.probe,
      cmsPublicCanarySha256: fileDigests.canary,
    },
    key,
  );
  const recoveredTerminal = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.terminal",
    outcome: "restored",
    workflow: state.workflow,
    release: state.release,
    target: state.target,
    recoveryArtifact: state.recoveryArtifact,
    packageManifestSha256: state.recoveryArtifact.packageManifestSha256,
    probeSha256: fileDigests.probe,
    cmsPublicCanarySha256: fileDigests.canary,
    probeProofSha256: fileDigests.probeProof,
    liveObservation: {
      classification: "rollback-receipted",
      target: STAGING_CMS_PUBLIC_HOTFIX.baselineFunction,
      nonTargetSha256: recoverySourceSnapshot.nonTargetSha256,
      bodySha256: STAGING_CMS_PUBLIC_HOTFIX.baselineFunction.bundleSha256,
      observedAt: "2026-09-18T03:26:27.387Z",
    },
    receiptSha256,
    completedAt: "2026-09-18T03:26:27.387Z",
    productionMutations: 0,
    nonTargetFunctionMutations: 0,
  };
  const artifact = (kind) => ({
    id: Number(expected[`${kind}ArtifactId`]),
    name: expected[`${kind}ArtifactName`],
    digest: expected[`${kind}ArtifactDigest`],
    expired: false,
    expires_at: "2099-12-17T02:14:37Z",
    size_in_bytes: 9_218,
    workflow_run: { id: Number(expected.runId), head_branch: "main", head_sha: expected.controlSha },
  });
  const input = {
    run: {
      id: Number(expected.runId),
      run_attempt: expected.runAttempt,
      name: expected.workflowName,
      path: expected.workflowPath,
      event: expected.event,
      status: "completed",
      conclusion: "success",
      head_branch: "main",
      head_sha: expected.controlSha,
      repository: { full_name: STAGING_CMS_PUBLIC_HOTFIX.repository },
      head_repository: { full_name: STAGING_CMS_PUBLIC_HOTFIX.repository },
      actor: { login: "Vnd93" },
      triggering_actor: { login: "Vnd93" },
    },
    jobs: {
      jobs: [
        {
          name: expected.jobName,
          status: "completed",
          conclusion: "success",
          run_attempt: expected.runAttempt,
        },
      ],
    },
    terminalArtifact: artifact("terminal"),
    receiptArtifact: artifact("receipt"),
    terminal: recoveredTerminal,
    probe: probe(),
    canary: recoveredCanary,
    probeProof: recoveredProof,
    receipt: recoveredReceipt,
    sourceSnapshot,
    fileDigests,
    key,
  };
  const result = validateRecoveredBaselineEvidence(input);
  assert.equal(result.valid, true, result.violations.join(","));
  assert.equal(result.snapshot.target.version, 287);

  const mismatchedIntent = structuredClone(input);
  mismatchedIntent.receipt = sealHotfixReceipt({ ...receiptPayload, intentSha256: "1".repeat(64) }, key, {
    stateBaselineFunction: recoverySourceBaseline,
  });
  const mismatchedReceiptSha256 = canonicalSha256(mismatchedIntent.receipt);
  mismatchedIntent.probeProof = sealHotfixProbeProof(
    { ...recoveredProof.proof, receiptSha256: mismatchedReceiptSha256 },
    key,
  );
  mismatchedIntent.terminal.receiptSha256 = mismatchedReceiptSha256;
  assert.match(
    validateRecoveredBaselineEvidence(mismatchedIntent).violations.join(","),
    /recovered_probe_proof_rollback_intent_sha256_mismatch/,
  );
  const wrongTerminalOrder = structuredClone(input);
  wrongTerminalOrder.terminal.liveObservation.observedAt = "2026-09-18T03:26:23.999Z";
  wrongTerminalOrder.terminal.completedAt = "2026-09-18T03:26:24.500Z";
  assert.match(
    validateRecoveredBaselineEvidence(wrongTerminalOrder).violations.join(","),
    /recovered_terminal_order_invalid/,
  );

  const wrongVersion = structuredClone(input);
  wrongVersion.terminal.liveObservation.target.version = 286;
  assert.match(
    validateRecoveredBaselineEvidence(wrongVersion).violations.join(","),
    /terminal_live_target_mismatch/,
  );
  const wrongArtifact = structuredClone(input);
  wrongArtifact.terminalArtifact.digest = `sha256:${"0".repeat(64)}`;
  assert.match(
    validateRecoveredBaselineEvidence(wrongArtifact).violations.join(","),
    /recovered_terminal_artifact_invalid/,
  );
  const wrongRun = structuredClone(input);
  wrongRun.run.id += 1;
  assert.match(validateRecoveredBaselineEvidence(wrongRun).violations.join(","), /recovered_run_invalid/);
});

test("state machine requires durable intents and receipts for every owned transition", () => {
  const fixture = packageAndState();
  assert.equal(validateHotfixRecoveryState(fixture.state).valid, true);
  assert.equal(
    classifyHotfixLiveState({ state: fixture.state, inventory: fixture.inventory }).classification,
    "baseline",
  );

  const candidateInventory = liveCandidate(fixture);
  assert.equal(
    classifyHotfixLiveState({ state: fixture.state, inventory: candidateInventory }).classification,
    "external-drift",
  );
  const candidateTarget = functionInventorySnapshot(candidateInventory).target;
  const candidateIntent = intent("candidate", fixture.state, fixture.target);
  assert.equal(
    verifyHotfixIntent(candidateIntent, key, { state: fixture.state, action: "candidate" }).valid,
    true,
  );
  assert.equal(
    classifyHotfixLiveState({
      state: fixture.state,
      inventory: fixture.inventory,
      candidateIntent: { wrapper: candidateIntent, key },
    }).classification,
    "baseline-with-candidate-intent",
  );
  assert.equal(
    classifyHotfixLiveState({
      state: fixture.state,
      inventory: candidateInventory,
      candidateIntent: { wrapper: candidateIntent, key },
    }).classification,
    "candidate-intended",
  );
  const candidateReceipt = sealHotfixReceipt(
    receipt("candidate", fixture.state, candidateIntent, fixture.target, candidateTarget),
    key,
  );
  const receiptedClassification = classifyHotfixLiveState({
    state: fixture.state,
    inventory: candidateInventory,
    candidateIntent: { wrapper: candidateIntent, key },
    candidateReceipt: { wrapper: candidateReceipt, key },
  });
  assert.equal(
    receiptedClassification.classification,
    "candidate-receipted",
    receiptedClassification.violations.join(","),
  );

  const rollbackInventory = structuredClone(fixture.inventory);
  const rollbackTargetRaw = rollbackInventory.find((record) => record.name === "cms-public");
  rollbackTargetRaw.version = fixture.target.version + 2;
  rollbackTargetRaw.updated_at = "2026-09-18T04:02:00.000Z";
  const rollbackTarget = functionInventorySnapshot(rollbackInventory).target;
  const rollbackIntent = intent("rollback", fixture.state, candidateTarget);
  assert.equal(
    classifyHotfixLiveState({
      state: fixture.state,
      inventory: candidateInventory,
      candidateIntent: { wrapper: candidateIntent, key },
      rollbackIntent: { wrapper: rollbackIntent, key },
    }).classification,
    "candidate-with-rollback-intent",
  );
  assert.equal(
    classifyHotfixLiveState({ state: fixture.state, inventory: rollbackInventory }).classification,
    "ambiguous-after-rollback",
  );
  const rollbackReceipt = sealHotfixReceipt(
    receipt("rollback", fixture.state, rollbackIntent, candidateTarget, rollbackTarget),
    key,
  );
  assert.equal(
    classifyHotfixLiveState({
      state: fixture.state,
      inventory: rollbackInventory,
      candidateIntent: { wrapper: candidateIntent, key },
      rollbackIntent: { wrapper: rollbackIntent, key },
    }).classification,
    "rollback-intended",
  );
  assert.equal(
    classifyHotfixLiveState({
      state: fixture.state,
      inventory: rollbackInventory,
      candidateIntent: { wrapper: candidateIntent, key },
      rollbackIntent: { wrapper: rollbackIntent, key },
      rollbackReceipt: { wrapper: rollbackReceipt, key },
    }).classification,
    "rollback-receipted",
  );

  const drift = structuredClone(candidateInventory);
  drift.find((record) => record.name !== "cms-public").version += 1;
  assert.equal(
    classifyHotfixLiveState({ state: fixture.state, inventory: drift }).classification,
    "external-drift",
  );
});

test("receipt HMAC binds action, state, tuple and live result", () => {
  const fixture = packageAndState();
  const candidateInventory = liveCandidate(fixture);
  const candidateTarget = functionInventorySnapshot(candidateInventory).target;
  const candidateIntent = intent("candidate", fixture.state, fixture.target);
  const wrapper = sealHotfixReceipt(
    receipt("candidate", fixture.state, candidateIntent, fixture.target, candidateTarget),
    key,
  );
  const verified = verifyHotfixReceipt(wrapper, key, {
    state: fixture.state,
    action: "candidate",
    intent: candidateIntent,
  });
  assert.equal(verified.valid, true, verified.violations.join(","));

  const tampered = structuredClone(wrapper);
  tampered.receipt.after.bundleSha256 = "0".repeat(64);
  assert.equal(verifyHotfixReceipt(tampered, key, { state: fixture.state }).valid, false);
  assert.equal(verifyHotfixReceipt(wrapper, "8".repeat(64), { state: fixture.state }).valid, false);

  const otherValidState = structuredClone(fixture.state);
  otherValidState.recoveryArtifact.id = "10400000002";
  const mixedState = verifyHotfixReceipt(wrapper, key, {
    state: otherValidState,
    action: "candidate",
  });
  assert.equal(mixedState.valid, false);
  assert.match(mixedState.violations.join(","), /receipt_state_mismatch/);

  const incompleteAfter = receipt(
    "candidate",
    fixture.state,
    candidateIntent,
    fixture.target,
    candidateTarget,
  );
  incompleteAfter.after.createdAt = "2026-09-01T00:00:00.000Z";
  assert.throws(() => sealHotfixReceipt(incompleteAfter, key), /receipt_candidate_after_invalid/);
});

test("a verified watchdog can complete a predecessor rollback intent without erasing provenance", () => {
  const fixture = packageAndState();
  const candidateInventory = liveCandidate(fixture);
  const candidateTarget = functionInventorySnapshot(candidateInventory).target;
  const rollbackInventory = structuredClone(fixture.inventory);
  const rollbackTargetRaw = rollbackInventory.find((record) => record.name === "cms-public");
  rollbackTargetRaw.version = fixture.target.version + 2;
  rollbackTargetRaw.updated_at = "2026-09-18T04:02:00.000Z";
  const rollbackTarget = functionInventorySnapshot(rollbackInventory).target;
  const predecessorIntent = intent("rollback", fixture.state, candidateTarget);
  const watchdog = {
    runId: "35000000002",
    runAttempt: 1,
    runSha: "9".repeat(40),
    controlSha: fixture.state.workflow.controlSha,
    workflowPath: STAGING_CMS_PUBLIC_HOTFIX.watchdogPath,
  };
  assert.equal(
    verifyHotfixIntent(predecessorIntent, key, {
      state: fixture.state,
      action: "rollback",
      live: candidateTarget,
    }).valid,
    true,
  );
  assert.equal(
    verifyHotfixIntent(predecessorIntent, key, {
      state: fixture.state,
      action: "rollback",
      preparedBy: watchdog,
    }).valid,
    false,
  );
  const successorReceipt = receipt(
    "rollback",
    fixture.state,
    predecessorIntent,
    candidateTarget,
    rollbackTarget,
  );
  successorReceipt.completedBy = watchdog;
  const sealed = sealHotfixReceipt(successorReceipt, key);
  const verified = verifyHotfixReceipt(sealed, key, {
    state: fixture.state,
    action: "rollback",
    intent: predecessorIntent,
    completedBy: watchdog,
    live: rollbackTarget,
  });
  assert.equal(verified.valid, true, verified.violations.join(","));
  assert.notDeepEqual(sealed.receipt.preparedBy, sealed.receipt.completedBy);

  const candidateIntent = intent("candidate", fixture.state, fixture.target);
  const invalidCandidateReceipt = receipt(
    "candidate",
    fixture.state,
    candidateIntent,
    fixture.target,
    candidateTarget,
  );
  invalidCandidateReceipt.completedBy = watchdog;
  assert.throws(() => sealHotfixReceipt(invalidCandidateReceipt, key), /receipt_candidate_executor_invalid/);
  const watchdogCandidateIntent = structuredClone(candidateIntent.intent);
  watchdogCandidateIntent.preparedBy = watchdog;
  assert.throws(() => sealHotfixIntent(watchdogCandidateIntent, key), /intent_candidate_role_invalid/);
});

test("watchdog terminals select the exact receipt artifact id across retries", () => {
  const artifact = (id, runAttempt, extra = {}) => ({
    id: String(id),
    owner: { runId: "35000000002", runAttempt },
    ...extra,
  });
  const receipt1 = artifact(4101, 1);
  const receipt2 = artifact(4102, 2);
  const terminalForReceipt1 = artifact(4202, 2, { receiptArtifactId: receipt1.id });
  const terminalForReceipt2 = artifact(4203, 3, { receiptArtifactId: receipt2.id });

  const beforeTerminal = selectHotfixWatchdogArtifactChain({
    rollbackReceipts: [receipt1, receipt2],
  });
  assert.equal(beforeTerminal.valid, true);
  assert.equal(beforeTerminal.rollbackReceipt.id, receipt2.id);
  assert.equal(beforeTerminal.recoveryTerminal, null);

  const boundToFirst = selectHotfixWatchdogArtifactChain({
    rollbackReceipts: [receipt1, receipt2],
    recoveryTerminals: [terminalForReceipt1],
  });
  assert.equal(boundToFirst.valid, true, boundToFirst.violations.join(","));
  assert.equal(boundToFirst.rollbackReceipt.id, receipt1.id);

  const boundToSecond = selectHotfixWatchdogArtifactChain({
    rollbackReceipts: [receipt1, receipt2],
    recoveryTerminals: [terminalForReceipt1, terminalForReceipt2],
  });
  assert.equal(boundToSecond.valid, true, boundToSecond.violations.join(","));
  assert.equal(boundToSecond.recoveryTerminal.id, terminalForReceipt2.id);
  assert.equal(boundToSecond.rollbackReceipt.id, receipt2.id);

  for (const invalid of [
    selectHotfixWatchdogArtifactChain({
      rollbackReceipts: [receipt1],
      recoveryTerminals: [artifact(4204, 2, { receiptArtifactId: "4999" })],
    }),
    selectHotfixWatchdogArtifactChain({
      rollbackReceipts: [receipt1, structuredClone(receipt1)],
      recoveryTerminals: [terminalForReceipt1],
    }),
    selectHotfixWatchdogArtifactChain({
      rollbackReceipts: [artifact(4103, 3)],
      recoveryTerminals: [artifact(4205, 2, { receiptArtifactId: "4103" })],
    }),
    selectHotfixWatchdogArtifactChain({ rollbackReceipts: [{}] }),
  ]) {
    assert.equal(invalid.valid, false);
    assert.equal(invalid.rollbackReceipt, null);
  }
});

test("manual recovery attempt 1 patches once and attempt 2 reconciles the same run chain", async () => {
  let patchCalls = 0;
  const attempt1 = await executeHotfixRollbackTransition({
    allowPatch: true,
    intentOwnedByExecutor: true,
    patch: async () => {
      patchCalls += 1;
    },
    observe: async () => ({ classification: "rollback-intended" }),
  });
  const attempt2 = await executeHotfixRollbackTransition({
    allowPatch: false,
    intentOwnedByExecutor: false,
    patch: async () => {
      patchCalls += 1;
    },
    observe: async () => ({ classification: "rollback-receipted" }),
  });
  assert.equal(patchCalls, 1);
  assert.equal(attempt1.patchAttempted, true);
  assert.equal(attempt1.completionMode, "patched");
  assert.equal(attempt2.patchAttempted, false);
  assert.equal(attempt2.completionMode, "reconciled");

  const runId = "35000000002";
  const receipt = { id: "5101", owner: { runId, runAttempt: 2 } };
  const terminal = {
    id: "5201",
    owner: { runId, runAttempt: 2 },
    receiptArtifactId: receipt.id,
  };
  const resolved = selectHotfixWatchdogArtifactChain({
    rollbackReceipts: [receipt],
    recoveryTerminals: [terminal],
  });
  assert.equal(resolved.valid, true, resolved.violations.join(","));
  assert.equal(resolved.rollbackReceipt.id, receipt.id);
  assert.equal(resolved.recoveryTerminal.id, terminal.id);

  const orphanedCrossRun = selectHotfixWatchdogArtifactChain({
    rollbackReceipts: [{ ...receipt, owner: { runId: "35000000003", runAttempt: 1 } }],
    recoveryTerminals: [terminal],
  });
  assert.equal(orphanedCrossRun.valid, false);
  assert.match(orphanedCrossRun.violations.join(","), /watchdog_terminal_receipt_binding_invalid/);
});

test("rollback transition permits exactly one PATCH only for the intent owner", async () => {
  for (const [allowPatch, intentOwnedByExecutor] of [
    [false, false],
    [false, true],
    [true, false],
  ]) {
    let patchCalls = 0;
    let observeCalls = 0;
    const result = await executeHotfixRollbackTransition({
      allowPatch,
      intentOwnedByExecutor,
      patch: async () => {
        patchCalls += 1;
      },
      observe: async () => {
        observeCalls += 1;
        return { target: { version: 71 } };
      },
    });
    assert.equal(patchCalls, 0);
    assert.equal(observeCalls, 1);
    assert.equal(result.completionMode, "reconciled");
    assert.equal(result.patchAttempted, false);
    assert.equal(result.responseAmbiguous, false);
  }

  let patchCalls = 0;
  let observeCalls = 0;
  const ambiguous = await executeHotfixRollbackTransition({
    allowPatch: true,
    intentOwnedByExecutor: true,
    patch: async () => {
      patchCalls += 1;
      throw new Error("response lost after dispatch");
    },
    observe: async () => {
      observeCalls += 1;
      return { target: { version: 72 } };
    },
  });
  assert.equal(patchCalls, 1);
  assert.equal(observeCalls, 1);
  assert.equal(ambiguous.completionMode, "patched");
  assert.equal(ambiguous.patchAttempted, true);
  assert.equal(ambiguous.responseAmbiguous, true);

  patchCalls = 0;
  await assert.rejects(
    executeHotfixRollbackTransition({
      allowPatch: false,
      intentOwnedByExecutor: true,
      patch: async () => {
        patchCalls += 1;
      },
      observe: async () => {
        throw new Error("candidate still live");
      },
    }),
    /candidate still live/,
  );
  assert.equal(patchCalls, 0);
});

test("rollback transition refuses incomplete authorization inputs", async () => {
  await assert.rejects(
    executeHotfixRollbackTransition({
      allowPatch: true,
      intentOwnedByExecutor: "true",
      patch: async () => {},
      observe: async () => ({}),
    }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_ROLLBACK_TRANSITION_INPUT_REFUSED/,
  );
});

test("probe proof binds the post-transition window to state, intent, receipt, target, and executor", () => {
  const fixture = packageAndState();
  const candidateInventory = liveCandidate(fixture);
  const candidateTarget = functionInventorySnapshot(candidateInventory).target;
  const candidateIntent = intent("candidate", fixture.state, fixture.target);
  const candidateReceipt = sealHotfixReceipt(
    receipt("candidate", fixture.state, candidateIntent, fixture.target, candidateTarget),
    key,
  );
  const executor = candidateIntent.intent.preparedBy;
  const proof = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.probe_verified",
    mode: "full",
    outcome: "promoted",
    workflow: fixture.state.workflow,
    executor,
    stateSha256: canonicalSha256(fixture.state),
    packageManifestSha256: canonicalSha256(fixture.manifest),
    classification: "candidate-receipted",
    target: candidateTarget,
    nonTargetSha256: fixture.state.baseline.nonTargetSha256,
    candidateIntentSha256: canonicalSha256(candidateIntent),
    rollbackIntentSha256: null,
    receiptSha256: canonicalSha256(candidateReceipt),
    startedAt: "2026-09-18T04:01:30.000Z",
    completedAt: "2026-09-18T04:02:00.000Z",
    probeSha256: "4".repeat(64),
    cmsPublicCanarySha256: "5".repeat(64),
  };
  const wrapper = sealHotfixProbeProof(proof, key);
  assert.equal(
    verifyHotfixProbeProof(wrapper, key, {
      state: fixture.state,
      executor,
      packageManifestSha256: canonicalSha256(fixture.manifest),
      target: candidateTarget,
      receiptSha256: canonicalSha256(candidateReceipt),
      minimumStartedAt: candidateReceipt.receipt.appliedAt,
    }).valid,
    true,
  );
  const wrongExecutor = verifyHotfixProbeProof(wrapper, key, {
    state: fixture.state,
    executor: { ...executor, runAttempt: executor.runAttempt + 1 },
  });
  assert.equal(wrongExecutor.valid, false);
  assert.match(wrongExecutor.violations.join(","), /probe_proof_executor_mismatch/);
  const staleProof = {
    ...proof,
    startedAt: "2026-09-18T03:00:00.000Z",
    completedAt: "2026-09-18T03:00:30.000Z",
  };
  const stale = sealHotfixProbeProof(staleProof, key);
  const staleResult = verifyHotfixProbeProof(stale, key, {
    minimumStartedAt: candidateReceipt.receipt.appliedAt,
  });
  assert.equal(staleResult.valid, false);
  assert.match(staleResult.violations.join(","), /probe_proof_order_invalid/);
  const watchdogPromotion = structuredClone(proof);
  watchdogPromotion.executor.workflowPath = STAGING_CMS_PUBLIC_HOTFIX.watchdogPath;
  assert.throws(() => sealHotfixProbeProof(watchdogPromotion, key), /probe_proof_candidate_role_invalid/);
});

test("terminal evidence binds immutable hashes and live target without wall-clock expiry", () => {
  const fixture = packageAndState();
  const target = functionInventorySnapshot(liveCandidate(fixture)).target;
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.terminal",
    outcome: "promoted",
    workflow: fixture.state.workflow,
    release: fixture.state.release,
    target: fixture.state.target,
    recoveryArtifact: fixture.state.recoveryArtifact,
    packageManifestSha256: canonicalSha256(fixture.manifest),
    probeSha256: "4".repeat(64),
    cmsPublicCanarySha256: "5".repeat(64),
    probeProofSha256: "6".repeat(64),
    liveObservation: {
      classification: "candidate-receipted",
      target,
      nonTargetSha256: fixture.state.baseline.nonTargetSha256,
      bodySha256: fixture.state.candidate.bodySha256,
      observedAt: "2020-01-01T00:00:00.000Z",
    },
    receiptSha256: "7".repeat(64),
    completedAt: "2020-01-01T00:00:01.000Z",
    productionMutations: 0,
    nonTargetFunctionMutations: 0,
  };
  const expected = {
    state: fixture.state,
    outcome: "promoted",
    packageManifestSha256: canonicalSha256(fixture.manifest),
    probeSha256: report.probeSha256,
    cmsPublicCanarySha256: report.cmsPublicCanarySha256,
    probeProofSha256: report.probeProofSha256,
    receiptSha256: report.receiptSha256,
    live: target,
  };
  assert.equal(validateHotfixTerminalEvidence(report, expected).valid, true);
  const substituted = structuredClone(report);
  substituted.probeProofSha256 = "8".repeat(64);
  assert.match(
    validateHotfixTerminalEvidence(substituted, expected).violations.join(","),
    /terminal_probe_proof_sha256_mismatch/,
  );
});

test("cms-public canary evidence binds exact scenarios, managed latency, and the live target", () => {
  const fixture = packageAndState();
  const target = functionInventorySnapshot(liveCandidate(fixture)).target;
  const report = {
    schemaVersion: 1,
    event: "g12.staging.cms_public_hotfix.cms_public_canary",
    projectRef: STAGING_CMS_PUBLIC_HOTFIX.projectRef,
    functionUrl: `https://${STAGING_CMS_PUBLIC_HOTFIX.projectRef}.supabase.co/functions/v1/cms-public`,
    origin: STAGING_CMS_PUBLIC_HOTFIX.origin,
    outcome: "promoted",
    stateSha256: canonicalSha256(fixture.state),
    classification: "candidate-receipted",
    target,
    warmupSamples: 20,
    measuredSamples: 20,
    managedPath: "/contato",
    managedLatency: { samples: 20, p50Ms: 200, p95Ms: 700, maxMs: 900 },
    scenarios: {
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
    },
    startedAt: "2026-09-18T04:01:30.000Z",
    completedAt: "2026-09-18T04:02:30.000Z",
  };
  const result = validateCmsPublicHotfixCanary(report, {
    state: fixture.state,
    outcome: "promoted",
    classification: "candidate-receipted",
    target,
    minimumStartedAt: "2026-09-18T04:01:00.000Z",
    maximumCompletedAt: "2026-09-18T04:03:00.000Z",
  });
  assert.equal(result.valid, true, result.violations.join(","));
  const slow = structuredClone(report);
  slow.managedLatency.p95Ms = 1_501;
  assert.match(validateCmsPublicHotfixCanary(slow, { state: fixture.state }).violations.join(","), /latency/);
  const restored = structuredClone(report);
  restored.outcome = "restored";
  restored.classification = "rollback-receipted";
  restored.managedLatency = { samples: 20, p50Ms: 1_000, p95Ms: 4_000, maxMs: 4_000 };
  assert.equal(validateCmsPublicHotfixCanary(restored, { state: fixture.state }).valid, true);
  const wrongTarget = structuredClone(report);
  wrongTarget.target.version += 1;
  assert.match(
    validateCmsPublicHotfixCanary(wrongTarget, { state: fixture.state, target }).violations.join(","),
    /target_mismatch/,
  );
});

test("source identity requires the fixed three-way digest, frozen lock, and import map", () => {
  assert.equal(
    assertExactSourceIdentity({
      candidateSource: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
      parentSource: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
      rollbackSource: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
      lockDigests: Array(3).fill(STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256),
      importMapDigests: Array(3).fill(STAGING_CMS_PUBLIC_HOTFIX.importMapSha256),
    }),
    true,
  );
  assert.throws(
    () =>
      assertExactSourceIdentity({
        candidateSource: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
        parentSource: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
        rollbackSource: STAGING_CMS_PUBLIC_HOTFIX.baselineSourceSha256,
        lockDigests: ["0".repeat(64), ...Array(2).fill(STAGING_CMS_PUBLIC_HOTFIX.sourceDenoLockSha256)],
        importMapDigests: Array(3).fill(STAGING_CMS_PUBLIC_HOTFIX.importMapSha256),
      }),
    /deno_lock_invalid/,
  );
});

test("candidate provenance binds two reproducible builds and a structurally parsed ESZIP", () => {
  const evidence = candidateEvidence();
  const provenance = candidateProvenance(evidence);
  assert.deepEqual(provenance.rawEszip.moduleSpecifiers, [
    STAGING_CMS_PUBLIC_HOTFIX.candidateEszipEntrypointSpecifier,
    "jsr:@supabase/functions-js/edge-runtime.d.ts",
    "https://jsr.io/@supabase/functions-js/2.112.4/src/edge-runtime.d.ts",
    "jsr:@supabase/supabase-js@2",
    "https://jsr.io/@supabase/supabase-js/2.112.4/src/index.ts",
    STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeMetadataSpecifier,
  ]);
  assert.deepEqual(provenance.rawEszip.moduleDescriptors, [
    {
      specifier: STAGING_CMS_PUBLIC_HOTFIX.candidateEszipEntrypointSpecifier,
      entryKind: 0,
      moduleKind: 0,
    },
    {
      specifier: "jsr:@supabase/functions-js/edge-runtime.d.ts",
      entryKind: 1,
      target: "https://jsr.io/@supabase/functions-js/2.112.4/src/edge-runtime.d.ts",
    },
    {
      specifier: "https://jsr.io/@supabase/functions-js/2.112.4/src/edge-runtime.d.ts",
      entryKind: 0,
      moduleKind: 0,
    },
    {
      specifier: "jsr:@supabase/supabase-js@2",
      entryKind: 1,
      target: "https://jsr.io/@supabase/supabase-js/2.112.4/src/index.ts",
    },
    {
      specifier: "https://jsr.io/@supabase/supabase-js/2.112.4/src/index.ts",
      entryKind: 0,
      moduleKind: 0,
    },
    {
      specifier: STAGING_CMS_PUBLIC_HOTFIX.edgeRuntimeMetadataSpecifier,
      entryKind: 0,
      moduleKind: 3,
    },
  ]);
  assert.equal(hasExpectedCandidateEszipStructure(provenance.rawEszip), true);
  assert.equal(
    provenance.rawEszip.moduleSpecifiers.includes(STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath),
    false,
  );
  assert.equal(
    provenance.rawEszip.moduleSpecifiers.includes(STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath),
    false,
  );
  const valid = validateCandidateBuildProvenance(provenance, { rawEszip: candidateRawEszip });
  assert.equal(valid.valid, true, valid.violations.join(","));
  const evidenceResult = validateCandidateBuildEvidenceFiles(provenance, evidence);
  assert.equal(evidenceResult.valid, true, evidenceResult.violations.join(","));
  for (const [key, attestationKey, original, replacement] of [
    ["unbundledTotalBytes", "UNBUNDLED_TOTAL_BYTES", "0", "1"],
    ["unbundledZeroByteFileCount", "UNBUNDLED_ZERO_BYTE_FILE_COUNT", "1", "0"],
    ["unbundledLargestFileBytes", "UNBUNDLED_LARGEST_FILE_BYTES", "0", "1"],
  ]) {
    const alteredEvidence = candidateEvidence();
    alteredEvidence.primary.attestation = Buffer.from(
      alteredEvidence.primary.attestation
        .toString("utf8")
        .replace(`${attestationKey}=${original}`, `${attestationKey}=${replacement}`),
      "utf8",
    );
    const alteredProvenance = candidateProvenance(alteredEvidence);
    assert.equal(alteredProvenance.builds.primary[key], provenance.builds.primary[key]);
    assert.match(
      validateCandidateBuildEvidenceFiles(alteredProvenance, alteredEvidence).violations.join(","),
      /candidate_evidence_primary_attestation_invalid/,
      attestationKey,
    );
  }

  const missingMetricEvidence = candidateEvidence();
  missingMetricEvidence.primary.attestation = Buffer.from(
    missingMetricEvidence.primary.attestation.toString("utf8").replace("UNBUNDLED_TOTAL_BYTES=0\n", ""),
    "utf8",
  );
  assert.match(
    validateCandidateBuildEvidenceFiles(
      candidateProvenance(missingMetricEvidence),
      missingMetricEvidence,
    ).violations.join(","),
    /candidate_evidence_primary_attestation_invalid/,
  );

  const originalUnbundledSha256 = sha256Bytes(evidence.primary.unbundledFiles);
  const substitutedUnbundledFiles = Buffer.from(
    `${sha256Bytes(Buffer.from([0]))}  ./edge-runtime.d.ts\n`,
    "utf8",
  );
  const nonEmptySubstitution = {
    ...evidence,
    primary: {
      ...evidence.primary,
      attestation: Buffer.from(
        evidence.primary.attestation
          .toString("utf8")
          .replace(originalUnbundledSha256, sha256Bytes(substitutedUnbundledFiles)),
        "utf8",
      ),
      unbundledFiles: substitutedUnbundledFiles,
    },
  };
  assert.match(
    validateCandidateBuildEvidenceFiles(
      candidateProvenance(nonEmptySubstitution),
      nonEmptySubstitution,
    ).violations.join(","),
    /candidate_evidence_primary_unbundled_invalid/,
  );

  for (const [field, primaryMetrics, rebuildMetrics] of [
    [
      "unbundledTotalBytes",
      {
        unbundledFileCount: 2,
        unbundledTotalBytes: 3,
        unbundledZeroByteFileCount: 0,
        unbundledLargestFileBytes: 2,
      },
      {
        unbundledFileCount: 2,
        unbundledTotalBytes: 4,
        unbundledZeroByteFileCount: 0,
        unbundledLargestFileBytes: 2,
      },
    ],
    [
      "unbundledZeroByteFileCount",
      {
        unbundledFileCount: 3,
        unbundledTotalBytes: 4,
        unbundledZeroByteFileCount: 1,
        unbundledLargestFileBytes: 2,
      },
      {
        unbundledFileCount: 3,
        unbundledTotalBytes: 4,
        unbundledZeroByteFileCount: 0,
        unbundledLargestFileBytes: 2,
      },
    ],
    [
      "unbundledLargestFileBytes",
      {
        unbundledFileCount: 2,
        unbundledTotalBytes: 4,
        unbundledZeroByteFileCount: 0,
        unbundledLargestFileBytes: 2,
      },
      {
        unbundledFileCount: 2,
        unbundledTotalBytes: 4,
        unbundledZeroByteFileCount: 0,
        unbundledLargestFileBytes: 3,
      },
    ],
  ]) {
    const mismatch = structuredClone(provenance);
    Object.assign(mismatch.builds.primary, primaryMetrics);
    Object.assign(mismatch.builds.rebuild, rebuildMetrics);
    assert.match(
      validateCandidateBuildProvenance(mismatch).violations.join(","),
      /candidate_provenance_reproducibility_invalid/,
      field,
    );
  }

  for (const [field, value] of [
    ["unbundledFileCount", STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileCount + 1],
    ["unbundledTotalBytes", STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactTreeBytes + 1],
    ["unbundledZeroByteFileCount", 2],
    ["unbundledLargestFileBytes", STAGING_CMS_PUBLIC_HOTFIX.maximumArtifactFileBytes + 1],
  ]) {
    const outOfRange = structuredClone(provenance);
    outOfRange.builds.primary[field] = value;
    assert.match(
      validateCandidateBuildProvenance(outOfRange).violations.join(","),
      /candidate_provenance_primary_invalid/,
      field,
    );
  }
  const mirrorTreeSubstitution = structuredClone(provenance);
  mirrorTreeSubstitution.input.jsrMirror.treeSha256 = "7".repeat(64);
  assert.match(
    validateCandidateBuildProvenance(mirrorTreeSubstitution).violations.join(","),
    /candidate_provenance_identity_invalid/,
  );
  const bundleLockEvidenceExtension = structuredClone(provenance);
  bundleLockEvidenceExtension.input.bundleDenoLock.legacy = true;
  assert.match(
    validateCandidateBuildProvenance(bundleLockEvidenceExtension).violations.join(","),
    /candidate_provenance_identity_invalid/,
  );
  const substituted = structuredClone(provenance);
  substituted.builds.rebuild.rawEszipSha256 = "0".repeat(64);
  assert.match(
    validateCandidateBuildProvenance(substituted, { rawEszip: candidateRawEszip }).violations.join(","),
    /rebuild_invalid|reproducibility_invalid/,
  );
  const legacySpecifiers = structuredClone(provenance);
  legacySpecifiers.rawEszip.moduleSpecifiers = [
    STAGING_CMS_PUBLIC_HOTFIX.candidateEntrypointPath,
    STAGING_CMS_PUBLIC_HOTFIX.candidateImportMapPath,
  ];
  legacySpecifiers.rawEszip.moduleSpecifiersSha256 = canonicalSha256(
    legacySpecifiers.rawEszip.moduleSpecifiers,
  );
  assert.match(
    validateCandidateBuildProvenance(legacySpecifiers).violations.join(","),
    /candidate_provenance_identity_invalid/,
  );
  const npmMetadataRaw = validEszip("candidate", { metadataEntryKind: 2 });
  const npmMetadataInspection = inspectEszipV2(npmMetadataRaw);
  assert.equal(hasExpectedCandidateEszipStructure(npmMetadataInspection), false);
  const npmMetadataProvenance = structuredClone(provenance);
  npmMetadataProvenance.rawEszip = npmMetadataInspection;
  for (const build of Object.values(npmMetadataProvenance.builds)) {
    build.rawEszipSha256 = npmMetadataInspection.sha256;
    build.rawEszipBytes = npmMetadataInspection.bytes;
  }
  assert.match(
    validateCandidateBuildProvenance(npmMetadataProvenance, { rawEszip: npmMetadataRaw }).violations.join(
      ",",
    ),
    /candidate_provenance_identity_invalid/,
  );
  const malformed = Buffer.from(candidateRawEszip);
  malformed[malformed.length - 1] ^= 1;
  assert.match(
    validateCandidateBuildProvenance(provenance, { rawEszip: malformed }).violations.join(","),
    /eszip_invalid|eszip_mismatch/,
  );
});

test("candidate structure rejects the non-portable JSR redirect emitted by the failed build", () => {
  for (const options of [
    {
      jsrRedirectTarget: "file:///workspace/.g12-jsr/@supabase/functions-js/2.112.4/src/edge-runtime.d.ts",
      jsrModuleSpecifier: "workspace/.g12-jsr/@supabase/functions-js/2.112.4/src/edge-runtime.d.ts",
    },
    { includeSupabaseRedirect: false },
    {
      supabaseRedirectTarget: "https://jsr.io/@supabase/supabase-js/2.112.3/src/index.ts",
      supabaseModuleSpecifier: "https://jsr.io/@supabase/supabase-js/2.112.3/src/index.ts",
    },
    {
      supabaseModuleSpecifier: "https://jsr.io/@supabase/supabase-js/2.112.4/src/missing.ts",
    },
  ])
    assert.equal(hasExpectedCandidateEszipStructure(inspectEszipV2(validEszip("broken", options))), false);
});

test("package validation rejects byte, inventory, and immutable builder substitutions", () => {
  // Exercise the pure builder with a locally consistent digest by temporarily using its exact
  // checks through a deliberately rejected fixture, then verify the validator's failure matrix.
  const fixture = packageAndState();
  assert.throws(
    () =>
      buildRecoveryPackageManifest({
        baseline: { body: Buffer.from("EZBRbad"), tuple: fixture.target },
        candidate: {
          body: candidateBody,
          sha256: fixture.manifest.candidate.sha256,
          sourceSha256: STAGING_CMS_PUBLIC_HOTFIX.candidateSourceSha256,
          provenance: candidateProvenance(),
        },
        inventory: fixture.inventory,
      }),
    /BASELINE_PACKAGE_MISMATCH/,
  );
  const invalid = validateRecoveryPackage({
    manifest: fixture.manifest,
    baselineBody: Buffer.from("EZBRbad"),
    candidateBody,
    inventory: fixture.inventory,
  });
  assert.equal(invalid.valid, false);
  assert.match(invalid.violations.join(","), /package_baseline_body_invalid|package_candidate_body_invalid/);

  const tamperedManifest = structuredClone(fixture.manifest);
  tamperedManifest.builder.lockFrozen = false;
  assert.match(
    validateRecoveryPackage({
      manifest: tamperedManifest,
      baselineBody: Buffer.from("EZBRbad"),
      candidateBody,
      inventory: fixture.inventory,
    }).violations.join(","),
    /package_identity_invalid/,
  );
  assert.match(canonicalSha256(fixture.manifest), /^[a-f0-9]{64}$/);
  assert.equal(normalizeGithubArtifactDigest("a".repeat(64)), `sha256:${"a".repeat(64)}`);
  assert.equal(normalizeGithubArtifactDigest(`sha256:${"b".repeat(64)}`), `sha256:${"b".repeat(64)}`);

  const corruptCandidate = validateRecoveryPackage({
    manifest: fixture.manifest,
    baselineBody: Buffer.from("EZBRbad"),
    candidateBody: Buffer.from("EZBRnot-an-eszip"),
    inventory: fixture.inventory,
  });
  assert.match(corruptCandidate.violations.join(","), /package_candidate_eszip_invalid/);
});
