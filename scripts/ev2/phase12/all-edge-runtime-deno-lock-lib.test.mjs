import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ALL_EDGE_RUNTIME_FUNCTION_LOCK_PROFILE_IDS,
  ALL_EDGE_RUNTIME_LOCK_PROFILES,
  ALL_EDGE_RUNTIME_SOURCE_LOCK,
  allEdgeRuntimeBundleLockEvidence,
  allEdgeRuntimeDenoConfig,
  allEdgeRuntimeLockProfile,
  assertAllEdgeRuntimeSourceLock,
  materializeAllEdgeRuntimeBundleLock,
  serializeAllEdgeRuntimeSourceLock,
} from "./all-edge-runtime-deno-lock-lib.mjs";
import { PRODUCTION_FUNCTIONS } from "./production-backend-lib.mjs";

const sourceBytes = await readFile(new URL("./all-edge-runtime-source-deno.lock", import.meta.url));
const sourceLock = JSON.parse(sourceBytes.toString("utf8"));
const rootLock = JSON.parse(await readFile(new URL("../../../deno.lock", import.meta.url), "utf8"));
const dependencyFields = ["dependencies", "optionalDependencies", "optionalPeers"];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function dependencyEdgeCount(lock) {
  return Object.values(lock.npm).reduce(
    (total, entry) =>
      total + dependencyFields.reduce((entryTotal, field) => entryTotal + (entry[field] ?? []).length, 0),
    0,
  );
}

function packageNameFromId(packageId) {
  const versionSeparator = packageId.startsWith("@") ? packageId.lastIndexOf("@") : packageId.indexOf("@");
  return versionSeparator > 0 ? packageId.slice(0, versionSeparator) : packageId;
}

function hasPackage(lock, packagePattern) {
  const prefix = packagePattern.endsWith("*") ? packagePattern.slice(0, -1) : null;
  return Object.keys(lock.npm).some((packageId) => {
    const packageName = packageNameFromId(packageId);
    return prefix === null ? packageName === packagePattern : packageName.startsWith(prefix);
  });
}

test("the dedicated Edge source lock is byte-pinned to the complete bounded closure", () => {
  assert.equal(sourceBytes.byteLength, ALL_EDGE_RUNTIME_SOURCE_LOCK.serializedBytes);
  assert.equal(sha256(sourceBytes), ALL_EDGE_RUNTIME_SOURCE_LOCK.sha256);
  assert.equal(assertAllEdgeRuntimeSourceLock(sourceLock), sourceLock);
  assert.deepEqual(serializeAllEdgeRuntimeSourceLock(sourceLock), sourceBytes);
  assert.equal(Object.keys(sourceLock.specifiers).length, ALL_EDGE_RUNTIME_SOURCE_LOCK.specifierCount);
  assert.equal(Object.keys(sourceLock.jsr).length, ALL_EDGE_RUNTIME_SOURCE_LOCK.jsrPackageCount);
  assert.equal(Object.keys(sourceLock.npm).length, ALL_EDGE_RUNTIME_SOURCE_LOCK.npmPackageCount);
  assert.equal(dependencyEdgeCount(sourceLock), ALL_EDGE_RUNTIME_SOURCE_LOCK.dependencyEdgeCount);
  for (const packageId of ALL_EDGE_RUNTIME_SOURCE_LOCK.requiredPdfPackages)
    assert.ok(Object.hasOwn(sourceLock.npm, packageId), packageId);
  for (const packageName of ALL_EDGE_RUNTIME_SOURCE_LOCK.forbiddenFullLockPackages)
    assert.equal(hasPackage(sourceLock, packageName), false, packageName);
});

test("the exact function inventory assigns PDF only to source consumers and standard otherwise", async () => {
  assert.deepEqual(
    Object.keys(ALL_EDGE_RUNTIME_FUNCTION_LOCK_PROFILE_IDS).sort((left, right) => left.localeCompare(right)),
    [...PRODUCTION_FUNCTIONS].sort((left, right) => left.localeCompare(right)),
  );
  const pdfFunctions = PRODUCTION_FUNCTIONS.filter((name) => allEdgeRuntimeLockProfile(name).id === "pdf");
  const sourcePdfFunctions = [];
  for (const name of PRODUCTION_FUNCTIONS) {
    const entrypoint = await readFile(
      new URL(`../../../supabase/functions/${name}/index.ts`, import.meta.url),
      "utf8",
    );
    if (entrypoint.includes("../_shared/canonical-pdf.ts")) sourcePdfFunctions.push(name);
  }
  assert.match(
    await readFile(new URL("../../../supabase/functions/_shared/canonical-pdf.ts", import.meta.url), "utf8"),
    /npm:pdf-lib@1\.17\.1/,
  );
  assert.deepEqual(pdfFunctions, sourcePdfFunctions);
  assert.deepEqual(sourcePdfFunctions, ["rdo-command", "rdo-sign"]);
  assert.equal(PRODUCTION_FUNCTIONS.length - pdfFunctions.length, 32);

  for (const name of PRODUCTION_FUNCTIONS) {
    const materialized = materializeAllEdgeRuntimeBundleLock({
      rootLock,
      sourceLock,
      functionName: name,
    });
    const expectedProfile = ["rdo-command", "rdo-sign"].includes(name) ? "pdf" : "standard";
    assert.equal(materialized.profile.id, expectedProfile, name);
    assert.equal(sha256(materialized.bytes), ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].sha256);
    assert.deepEqual(
      allEdgeRuntimeBundleLockEvidence(materialized.lock, materialized.bytes, materialized.profile),
      {
        profileId: expectedProfile,
        sha256: ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].sha256,
        serializedBytes: ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].serializedBytes,
        specifierCount: ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].specifierCount,
        jsrPackageCount: ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].jsrPackageCount,
        npmPackageCount: ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].npmPackageCount,
        dependencyEdgeCount: ALL_EDGE_RUNTIME_LOCK_PROFILES[expectedProfile].dependencyEdgeCount,
      },
      name,
    );
    assert.equal(hasPackage(materialized.lock, "pdf-lib"), expectedProfile === "pdf", name);
    for (const packagePattern of ALL_EDGE_RUNTIME_SOURCE_LOCK.forbiddenFullLockPackages)
      assert.equal(hasPackage(materialized.lock, packagePattern), false, `${name}:${packagePattern}`);
  }
  assert.deepEqual(allEdgeRuntimeDenoConfig(), {
    imports: { zod: "npm:zod@4.4.3" },
    lock: { path: "./deno.lock", frozen: true },
    nodeModulesDir: "none",
  });
});

test("source identity, closure, function profile, and evidence drift fail closed", () => {
  const changedIntegrity = structuredClone(sourceLock);
  changedIntegrity.npm["pdf-lib@1.17.1"].integrity = "sha512-refused";
  assert.throws(
    () => assertAllEdgeRuntimeSourceLock(changedIntegrity),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_SOURCE_IDENTITY_REFUSED/,
  );

  const missingClosure = structuredClone(sourceLock);
  delete missingClosure.npm["@pdf-lib/upng@1.0.1"];
  assert.throws(
    () => assertAllEdgeRuntimeSourceLock(missingClosure),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_SOURCE_SHAPE_REFUSED/,
  );

  const missingStandardRoot = structuredClone(rootLock);
  delete missingStandardRoot.specifiers["npm:zod@4.4.3"];
  assert.throws(
    () =>
      materializeAllEdgeRuntimeBundleLock({
        rootLock: missingStandardRoot,
        sourceLock,
        functionName: "cms-ai",
      }),
    /G12_STAGING_CMS_PUBLIC_HOTFIX_BUNDLE_LOCK_SPECIFIER_REFUSED/,
  );
  assert.throws(
    () => allEdgeRuntimeLockProfile("RDO-SIGN"),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_FUNCTION_NAME_REFUSED/,
  );
  assert.throws(
    () => allEdgeRuntimeLockProfile("rdo-export"),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_FUNCTION_INVENTORY_REFUSED/,
  );

  const pdf = materializeAllEdgeRuntimeBundleLock({
    rootLock,
    sourceLock,
    functionName: "rdo-sign",
  });
  assert.throws(
    () =>
      allEdgeRuntimeBundleLockEvidence(
        pdf.lock,
        Buffer.concat([pdf.bytes, Buffer.from("drift")]),
        pdf.profile,
      ),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_PROFILE_BYTES_REFUSED/,
  );

  const changedEvidenceLock = structuredClone(pdf.lock);
  changedEvidenceLock.npm["pdf-lib@1.17.1"].integrity = "sha512-refused";
  assert.throws(
    () => allEdgeRuntimeBundleLockEvidence(changedEvidenceLock, pdf.bytes, pdf.profile),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_SOURCE_IDENTITY_REFUSED/,
  );
  assert.throws(
    () => allEdgeRuntimeBundleLockEvidence(pdf.lock, pdf.bytes, { ...pdf.profile }),
    /G12_ALL_EDGE_RUNTIME_BUNDLE_LOCK_PROFILE_REFUSED/,
  );
});
