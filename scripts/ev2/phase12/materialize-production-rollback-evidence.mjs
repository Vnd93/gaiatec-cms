import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { decodeProductionRollbackEvidenceBundle } from "./production-rollback-evidence-bundle-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
}

const statePath = argument("state");
const outputPath = argument("output");
if (!statePath || !outputPath) throw new Error("G12_PRODUCTION_ROLLBACK_EVIDENCE_INPUT_REQUIRED");

const state = JSON.parse(await readFile(resolve(statePath), "utf8"));
if (state?.schemaVersion !== 3 || state?.event !== "g12.production.rollback.prepared")
  throw new Error("G12_PRODUCTION_ROLLBACK_EVIDENCE_STATE_REFUSED");
const files = decodeProductionRollbackEvidenceBundle(state?.retainedBackend?.evidence);
const bindings = {
  manifest: state?.retainedBackend?.manifestSha256,
  functions: state?.retainedBackend?.functionsSha256,
  database: state?.retainedBackend?.databaseSha256,
};
for (const [name, bytes] of Object.entries(files)) {
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== bindings[name]) throw new Error(`G12_PRODUCTION_ROLLBACK_EVIDENCE_BINDING_REFUSED:${name}`);
}

const output = resolve(outputPath);
await mkdir(output, { recursive: true, mode: 0o700 });
for (const [name, bytes] of Object.entries(files))
  await writeFile(resolve(output, `${name}.json`), bytes, { mode: 0o600, flag: "wx" });

console.log(
  JSON.stringify({
    event: "g12.production.rollback.evidence_materialized",
    files: Object.fromEntries(
      Object.entries(files).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: bindings[name] }]),
    ),
    secretsDisclosed: false,
  }),
);
