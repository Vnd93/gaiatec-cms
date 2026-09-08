import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildProductionRollbackEvidenceBundle,
  decodeProductionRollbackEvidenceBundle,
  validateProductionRollbackEvidenceBundle,
} from "./production-rollback-evidence-bundle-lib.mjs";
import { sealRecoveryStateVariable, verifyRecoveryStateVariable } from "./recovery-state-store-lib.mjs";

function sources() {
  return {
    manifest: Buffer.from('{"schemaVersion":1,"release":"' + "a".repeat(40) + '"}\n'),
    functions: Buffer.from('[{"name":"cms-public","sha256":"' + "b".repeat(64) + '"}]\n'),
    database: Buffer.from('{"fingerprint":"' + "c".repeat(64) + '"}\n'),
  };
}

test("production rollback evidence bundle round-trips exact HMAC-bound source bytes", () => {
  const input = sources();
  const bundle = buildProductionRollbackEvidenceBundle(input);
  const result = validateProductionRollbackEvidenceBundle(bundle);
  assert.equal(result.valid, true);
  const decoded = decodeProductionRollbackEvidenceBundle(bundle);
  for (const name of Object.keys(input)) assert.equal(decoded[name].equals(input[name]), true);
});

test("production rollback evidence bundle rejects content, digest and declared-size tampering", () => {
  for (const mutate of [
    (bundle) => (bundle.files.manifest.data = bundle.files.functions.data),
    (bundle) => (bundle.files.functions.sha256 = "0".repeat(64)),
    (bundle) => (bundle.files.database.bytes += 1),
    (bundle) => (bundle.files.extra = bundle.files.manifest),
  ]) {
    const bundle = structuredClone(buildProductionRollbackEvidenceBundle(sources()));
    mutate(bundle);
    assert.equal(validateProductionRollbackEvidenceBundle(bundle).valid, false);
    assert.throws(() => decodeProductionRollbackEvidenceBundle(bundle));
  }
});

test("production rollback evidence bundle enforces bounded non-empty canonical inputs", () => {
  assert.throws(
    () => buildProductionRollbackEvidenceBundle({ ...sources(), database: Buffer.alloc(0) }),
    /G12_PRODUCTION_ROLLBACK_EVIDENCE_SIZE_REFUSED/,
  );
  assert.throws(
    () => buildProductionRollbackEvidenceBundle({ ...sources(), database: "not bytes" }),
    /G12_PRODUCTION_ROLLBACK_EVIDENCE_SOURCE_REFUSED/,
  );
});

test("HMAC fallback materializes exact evidence for canonical live/source revalidation", async () => {
  const input = sources();
  const evidence = buildProductionRollbackEvidenceBundle(input);
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const state = {
    schemaVersion: 3,
    event: "g12.production.rollback.prepared",
    workflow: { runId: "123456", runAttempt: 2, controlSha: "d".repeat(40) },
    retainedBackend: {
      release: "a".repeat(40),
      runId: "123450",
      manifestSha256: sha256(input.manifest),
      functionsSha256: sha256(input.functions),
      databaseSha256: sha256(input.database),
      evidence,
    },
  };
  const key = "9".repeat(64);
  const sealed = sealRecoveryStateVariable("production-rollback", state, key);
  const tampered = structuredClone(sealed);
  tampered.state.retainedBackend.evidence.files.manifest.data =
    tampered.state.retainedBackend.evidence.files.functions.data;
  assert.equal(verifyRecoveryStateVariable(tampered, key).valid, false);
  const verified = verifyRecoveryStateVariable(sealed, key, {
    kind: "production-rollback",
    runId: "123456",
    runAttempt: 2,
    controlSha: "d".repeat(40),
  });
  assert.equal(verified.valid, true);

  const temporary = await mkdtemp(join(tmpdir(), "g12-production-rollback-evidence-"));
  try {
    const statePath = join(temporary, "state.json");
    const output = join(temporary, "evidence");
    await writeFile(statePath, JSON.stringify(verified.state));
    const materializer = fileURLToPath(
      new URL("./materialize-production-rollback-evidence.mjs", import.meta.url),
    );
    const result = spawnSync(process.execPath, [materializer, "--state", statePath, "--output", output], {
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    for (const name of Object.keys(input))
      assert.equal((await readFile(join(output, `${name}.json`))).equals(input[name]), true);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
