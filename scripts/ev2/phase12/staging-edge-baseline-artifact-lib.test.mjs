import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { PRODUCTION_FUNCTIONS, PUBLIC_FUNCTIONS } from "./production-backend-lib.mjs";
import { frameRawEszip } from "./staging-cms-public-hotfix-lib.mjs";
import {
  buildStagingEdgeBaselineManifest,
  loadAndVerifyStagingEdgeBaselineArtifact,
  STAGING_EDGE_BASELINE_ARTIFACT,
  writeStagingEdgeBaselineArtifact,
} from "./staging-edge-baseline-artifact-lib.mjs";

function be32(value) {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
}

function digest(value) {
  return createHash("sha256").update(value).digest();
}

function section(value) {
  return Buffer.concat([be32(value.byteLength), value, digest(value)]);
}

function rawEszip() {
  const specifier = Buffer.from("file:///workspace/supabase/functions/test/index.ts", "utf8");
  const source = Buffer.from("Deno.serve(() => new Response('ok'));", "utf8");
  const header = Buffer.concat([
    be32(specifier.byteLength),
    specifier,
    Buffer.from([0]),
    be32(0),
    be32(source.byteLength),
    be32(0),
    be32(0),
    Buffer.from([0]),
  ]);
  const sourceSection = Buffer.concat([source, digest(source)]);
  return Buffer.concat([
    Buffer.from("ESZIP2.3", "ascii"),
    section(Buffer.from([0, 1, 1, 32])),
    section(header),
    section(Buffer.alloc(0)),
    be32(sourceSection.byteLength),
    sourceSection,
    be32(0),
  ]);
}

function fixture() {
  const body = frameRawEszip(rawEszip());
  const bodySha256 = createHash("sha256").update(body).digest("hex");
  const createdAt = "2026-09-22T12:00:00.000Z";
  const records = [...PRODUCTION_FUNCTIONS]
    .sort((left, right) => left.localeCompare(right))
    .map((name, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name,
      slug: name,
      status: "ACTIVE",
      verify_jwt: !PUBLIC_FUNCTIONS.has(name),
      version: index + 1,
      ezbr_sha256: bodySha256,
      created_at: createdAt,
      updated_at: createdAt,
      entrypoint_path: `file:///workspace/supabase/functions/${name}/index.ts`,
      import_map: true,
      import_map_path: "file:///workspace/deno.json",
    }));
  return {
    workflow: { runId: "123", runAttempt: 1, controlSha: "a".repeat(40) },
    candidateSha: "b".repeat(40),
    projectRef: "glcqsosxwgmlhzgcsnzv",
    capturedAt: "2026-09-22T12:01:00.000Z",
    beforePayload: records,
    afterPayload: structuredClone(records),
    bodies: Object.fromEntries(records.map(({ name }) => [name, body])),
  };
}

test("exact live Edge baseline accepts stable raw bodies and seals every function", () => {
  const value = fixture();
  value.bodies = Object.fromEntries(PRODUCTION_FUNCTIONS.map((name) => [name, rawEszip()]));
  const manifest = buildStagingEdgeBaselineManifest(value);
  assert.equal(manifest.functionCount, PRODUCTION_FUNCTIONS.length);
  assert.equal(
    manifest.functions.every(({ body }) => body.path.endsWith(".ezbr")),
    true,
  );
  assert.equal(
    manifest.aggregateRawEszipBytes,
    manifest.functions.reduce((total, record) => total + record.body.rawEszipBytes, 0),
  );
  assert.match(manifest.inventorySha256, /^[a-f0-9]{64}$/);
});

test("baseline keeps download, raw ESZIP, and deployable EZBR limits distinct", () => {
  assert.equal(STAGING_EDGE_BASELINE_ARTIFACT.maximumDownloadBytes, 64 * 1024 * 1024);
  assert.equal(STAGING_EDGE_BASELINE_ARTIFACT.maximumRawEszipBytes, 64 * 1024 * 1024);
  assert.equal(STAGING_EDGE_BASELINE_ARTIFACT.maximumDeployableBodyBytes, 20 * 1024 * 1024);
  assert.equal(
    STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateDeployableBytes,
    PRODUCTION_FUNCTIONS.length * 20 * 1024 * 1024,
  );
  assert.equal(STAGING_EDGE_BASELINE_ARTIFACT.maximumAggregateRawEszipBytes, 1024 * 1024 * 1024);
});

test("inventory drift during body capture fails closed", () => {
  const value = fixture();
  value.afterPayload[0].version += 1;
  assert.throws(() => buildStagingEdgeBaselineManifest(value), /INVENTORY_DRIFT/);
});

test("written baseline verifies exact layout, body bytes and context", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "g12-edge-baseline-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(join(temporary, "parent"));
  const value = fixture();
  const written = writeStagingEdgeBaselineArtifact({
    ...value,
    outputDirectory: join(temporary, "parent", "edge-baseline"),
  });
  const verified = loadAndVerifyStagingEdgeBaselineArtifact({
    root: written.root,
    expectedManifestSha256: written.manifestSha256,
    expected: {
      projectRef: value.projectRef,
      candidateSha: value.candidateSha,
      controlSha: value.workflow.controlSha,
      runId: value.workflow.runId,
      runAttempt: value.workflow.runAttempt,
    },
  });
  assert.equal(verified.functions.length, PRODUCTION_FUNCTIONS.length);

  const bodyPath = verified.functions[0].bodyPath;
  const bytes = await readFile(bodyPath);
  bytes[bytes.length - 1] ^= 1;
  await chmod(bodyPath, 0o600);
  await writeFile(bodyPath, bytes);
  assert.throws(
    () =>
      loadAndVerifyStagingEdgeBaselineArtifact({
        root: written.root,
        expectedManifestSha256: written.manifestSha256,
      }),
    /BODY_IDENTITY_INVALID|body_identity_invalid/i,
  );
});

test("baseline loader rejects traversal-shaped manifest records before body access", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "g12-edge-baseline-traversal-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(join(temporary, "parent"));
  const written = writeStagingEdgeBaselineArtifact({
    ...fixture(),
    outputDirectory: join(temporary, "parent", "edge-baseline"),
  });
  const manifestPath = join(written.root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.functions[0].slug = "../../escape";
  manifest.functions[0].body.path = "bundles/../../escape.ezbr";
  await chmod(manifestPath, 0o600);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(temporary, "parent", "escape.ezbr"), Buffer.from("outside-artifact"));
  assert.throws(
    () => loadAndVerifyStagingEdgeBaselineArtifact({ root: written.root }),
    /function_names_invalid/i,
  );
});

test("baseline loader rejects a forged raw ESZIP aggregate", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "g12-edge-baseline-raw-aggregate-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(join(temporary, "parent"));
  const written = writeStagingEdgeBaselineArtifact({
    ...fixture(),
    outputDirectory: join(temporary, "parent", "edge-baseline"),
  });
  const manifestPath = join(written.root, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.aggregateRawEszipBytes += 1;
  await chmod(manifestPath, 0o600);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  assert.throws(
    () => loadAndVerifyStagingEdgeBaselineArtifact({ root: written.root }),
    /aggregate_raw_eszip_bytes_mismatch/i,
  );
});

test("baseline loader rejects symlinked bundle entries", async (context) => {
  const temporary = await mkdtemp(join(tmpdir(), "g12-edge-baseline-symlink-test-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  await mkdir(join(temporary, "parent"));
  const written = writeStagingEdgeBaselineArtifact({
    ...fixture(),
    outputDirectory: join(temporary, "parent", "edge-baseline"),
  });
  const bodyPath = join(written.root, written.manifest.functions[0].body.path);
  const outsidePath = join(temporary, "outside.ezbr");
  await writeFile(outsidePath, await readFile(bodyPath));
  await rm(bodyPath);
  try {
    await symlink(outsidePath, bodyPath, "file");
  } catch (error) {
    if (["EPERM", "EACCES"].includes(error?.code)) {
      context.skip("file symlinks require an unavailable Windows privilege");
      return;
    }
    throw error;
  }
  assert.throws(
    () => loadAndVerifyStagingEdgeBaselineArtifact({ root: written.root }),
    /G12_STAGING_EDGE_BASELINE_ARTIFACT_BUNDLE_LAYOUT_INVALID_REFUSED/i,
  );
});
