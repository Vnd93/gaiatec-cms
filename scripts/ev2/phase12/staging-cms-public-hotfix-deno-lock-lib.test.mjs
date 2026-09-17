import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assertCmsPublicBundleLock,
  CMS_PUBLIC_BUNDLE_LOCK,
  projectCmsPublicBundleLock,
  serializeCmsPublicBundleLock,
} from "./staging-cms-public-hotfix-deno-lock-lib.mjs";

const sourceLockBytes = await readFile(new URL("../../../deno.lock", import.meta.url));
const sourceLock = JSON.parse(sourceLockBytes.toString("utf8"));

const DEPENDENCY_FIELDS = ["dependencies", "optionalDependencies", "optionalPeers"];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function reversedRecord(value) {
  return Object.fromEntries(Object.entries(value).reverse());
}

function dependencyEdgeCount(npm) {
  return Object.values(npm).reduce(
    (total, entry) =>
      total + DEPENDENCY_FIELDS.reduce((entryTotal, field) => entryTotal + (entry[field] ?? []).length, 0),
    0,
  );
}

test("binds the projection to the exact repository lock bytes", () => {
  assert.equal(sha256(sourceLockBytes), CMS_PUBLIC_BUNDLE_LOCK.sourceSha256);
});

test("projects the frozen repository lock to the exact cms-public closure", () => {
  const projected = projectCmsPublicBundleLock(sourceLock);
  const bytes = serializeCmsPublicBundleLock(projected);
  assert.equal(bytes.byteLength, CMS_PUBLIC_BUNDLE_LOCK.serializedBytes);
  assert.equal(sha256(bytes), CMS_PUBLIC_BUNDLE_LOCK.sha256);
  assert.equal(Object.keys(projected.specifiers).length, CMS_PUBLIC_BUNDLE_LOCK.specifierCount);
  assert.equal(Object.keys(projected.jsr).length, CMS_PUBLIC_BUNDLE_LOCK.jsrPackageCount);
  assert.equal(Object.keys(projected.npm).length, CMS_PUBLIC_BUNDLE_LOCK.npmPackageCount);
  assert.equal(dependencyEdgeCount(projected.npm), 59);
  assert.equal(dependencyEdgeCount(projected.npm), CMS_PUBLIC_BUNDLE_LOCK.dependencyEdgeCount);
  assert.deepEqual(projected.workspace, { dependencies: ["npm:zod@4.4.3"] });
  assert.equal(Object.hasOwn(projected.workspace, "packageJson"), false);
  for (const refusedPackage of ["@playwright/test", "@radix-ui/react-dialog", "vite", "vitest", "wrangler"])
    assert.equal(
      Object.keys(projected.npm).some(
        (packageId) => packageId === refusedPackage || packageId.startsWith(`${refusedPackage}@`),
      ),
      false,
      refusedPackage,
    );
  assert.equal(assertCmsPublicBundleLock(projected), projected);
});

test("projection is deterministic when source maps arrive in another insertion order", () => {
  const reordered = structuredClone(sourceLock);
  reordered.specifiers = reversedRecord(reordered.specifiers);
  reordered.jsr = reversedRecord(reordered.jsr);
  reordered.npm = reversedRecord(reordered.npm);
  assert.deepEqual(projectCmsPublicBundleLock(reordered), projectCmsPublicBundleLock(sourceLock));
});

test("projection fails closed on missing, ambiguous, or modified dependency evidence", () => {
  const missingSpecifier = structuredClone(sourceLock);
  delete missingSpecifier.specifiers["npm:zod@4.4.3"];
  assert.throws(() => projectCmsPublicBundleLock(missingSpecifier), /BUNDLE_LOCK_SPECIFIER_REFUSED/);

  const missingPackage = structuredClone(sourceLock);
  delete missingPackage.npm["zod@4.4.3"];
  assert.throws(() => projectCmsPublicBundleLock(missingPackage), /BUNDLE_LOCK_NPM_ROOT_REFUSED/);

  const missingTransitiveDependency = structuredClone(sourceLock);
  delete missingTransitiveDependency.npm["tslib@2.8.1"];
  assert.throws(
    () => projectCmsPublicBundleLock(missingTransitiveDependency),
    /BUNDLE_LOCK_NPM_DEPENDENCY_REFUSED/,
  );

  const ambiguousDependency = structuredClone(sourceLock);
  ambiguousDependency.npm["zod@4.4.4"] = structuredClone(ambiguousDependency.npm["zod@4.4.3"]);
  assert.throws(() => projectCmsPublicBundleLock(ambiguousDependency), /BUNDLE_LOCK_NPM_DEPENDENCY_REFUSED/);

  const changedJsr = structuredClone(sourceLock);
  changedJsr.jsr["@supabase/supabase-js@2.112.4"].integrity = "0".repeat(64);
  assert.throws(() => projectCmsPublicBundleLock(changedJsr), /BUNDLE_LOCK_IDENTITY_REFUSED/);

  const changedNpmIntegrity = structuredClone(sourceLock);
  changedNpmIntegrity.npm["zod@4.4.3"].integrity = "sha512-refused";
  assert.throws(() => projectCmsPublicBundleLock(changedNpmIntegrity), /BUNDLE_LOCK_IDENTITY_REFUSED/);

  const missingOptionalPeer = structuredClone(sourceLock);
  delete missingOptionalPeer.npm["openai@4.104.0_zod@4.4.3"].optionalPeers;
  assert.throws(
    () => projectCmsPublicBundleLock(missingOptionalPeer),
    /BUNDLE_LOCK_(SHAPE|IDENTITY)_REFUSED/,
  );
});

test("projection traverses synthetic optionalDependencies and fails closed", () => {
  const optionalDependencyFixture = structuredClone(sourceLock);
  optionalDependencyFixture.npm["zod@4.4.3"].optionalDependencies = ["g12-missing-runtime-dependency"];
  assert.throws(
    () => projectCmsPublicBundleLock(optionalDependencyFixture),
    /BUNDLE_LOCK_NPM_DEPENDENCY_REFUSED/,
  );
});

test("projection and validation reject unrecognized top-level or projected extras", () => {
  const extraSourceKey = structuredClone(sourceLock);
  extraSourceKey.remote = {};
  assert.throws(() => projectCmsPublicBundleLock(extraSourceKey), /BUNDLE_LOCK_SOURCE_REFUSED/);

  const projected = projectCmsPublicBundleLock(sourceLock);
  const inheritedWorkspace = structuredClone(projected);
  inheritedWorkspace.workspace.packageJson = structuredClone(sourceLock.workspace.packageJson);
  assert.throws(() => assertCmsPublicBundleLock(inheritedWorkspace), /BUNDLE_LOCK_IDENTITY_REFUSED/);

  const extraPackage = structuredClone(projected);
  extraPackage.npm["vite@6.4.3_@types+node@26.4.0"] = structuredClone(
    sourceLock.npm["vite@6.4.3_@types+node@26.4.0"],
  );
  assert.throws(() => assertCmsPublicBundleLock(extraPackage), /BUNDLE_LOCK_IDENTITY_REFUSED/);
});
