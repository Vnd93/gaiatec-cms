import assert from "node:assert/strict";
import test from "node:test";

import { stagingSealIdentity, verifyStagingSealIdentity } from "./staging-recovery-seal-lib.mjs";

const release = "a".repeat(40);
const seal = {
  schemaVersion: 2,
  candidateSha: release,
  fileCount: 12,
  byteCount: 4096,
  treeSha256: "b".repeat(64),
  archiveFile: "staging-recovery-dist.tar",
  archiveBytes: 8192,
  archiveSha256: "c".repeat(64),
  files: [{ path: "release-manifest.json" }],
};

test("staging recovery rebuild must match the signed immutable seal identity", () => {
  const identity = stagingSealIdentity(seal);
  assert.equal(verifyStagingSealIdentity(seal, identity, release).valid, true);
});

test("staging recovery seal refuses reconstructed byte and identity drift", () => {
  const identity = stagingSealIdentity(seal);
  for (const changed of [
    { ...seal, candidateSha: "d".repeat(40) },
    { ...seal, treeSha256: "e".repeat(64) },
    { ...seal, archiveSha256: "f".repeat(64) },
    { ...seal, byteCount: seal.byteCount + 1 },
    { ...seal, archiveFile: "substituted.tar" },
  ])
    assert.equal(verifyStagingSealIdentity(changed, identity, release).valid, false);
});
