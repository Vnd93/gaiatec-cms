import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  sealProductionReleaseEvidenceArchive,
  verifyProductionReleaseEvidenceArchive,
} from "./production-release-archive-lib.mjs";
import { buildProductionReleaseEvidenceIndex } from "./production-release-evidence-lib.mjs";

const candidateSha = "c".repeat(40);
const binding = {
  candidateSha,
  runId: "123456",
  runAttempt: 2,
  controlSha: "d".repeat(40),
  baselineRelease: "e".repeat(40),
};

test(
  "sealed release archive verifies its internal index, exact files and materialized bytes",
  { skip: process.platform === "win32" },
  async (context) => {
    const root = await mkdtemp(join(tmpdir(), "g12-release-archive-"));
    const archive = `${root}.tar`;
    const output = `${root}.materialized`;
    context.after(() => rm(root, { recursive: true, force: true }));
    context.after(() => rm(archive, { force: true }));
    context.after(() => rm(output, { recursive: true, force: true }));

    await writeFile(join(root, "one.json"), '{"event":"synthetic"}\n');
    const index = await buildProductionReleaseEvidenceIndex(root, candidateSha, ["one.json"], binding);
    const indexFile = join(root, "index.json");
    await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`);
    const seal = await sealProductionReleaseEvidenceArchive({ root, indexFile, archiveFile: archive });
    const verified = await verifyProductionReleaseEvidenceArchive({
      archiveFile: archive,
      seal,
      binding,
      materializeDirectory: output,
    });
    assert.deepEqual(verified, { valid: true, violations: [] });
    assert.equal(await readFile(join(output, "one.json"), "utf8"), '{"event":"synthetic"}\n');
    assert.match(await readFile(join(output, "g12-production-evidence-index.json"), "utf8"), /123456/);

    const substitutedIndex = await verifyProductionReleaseEvidenceArchive({
      archiveFile: archive,
      seal: { ...seal, indexSha256: "0".repeat(64) },
      binding,
    });
    assert.match(substitutedIndex.violations.join(","), /index_digest_mismatch/);
    await writeFile(archive, "tampered");
    const tampered = await verifyProductionReleaseEvidenceArchive({ archiveFile: archive, seal, binding });
    assert.match(tampered.violations.join(","), /archive_(?:size|digest)_mismatch/);
  },
);
