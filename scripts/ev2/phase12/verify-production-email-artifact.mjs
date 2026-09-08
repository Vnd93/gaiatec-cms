import { readdir, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { canonicalTextSha256 } from "./release-guard-lib.mjs";
import { validateProductionEmailEvidence } from "./production-email-gate-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const relativeFile = argument("file");
const artifactDirectory = argument("artifact-dir");
if (!relativeFile || !artifactDirectory) throw new Error("PRODUCTION_EMAIL_ARTIFACT_INPUT_REQUIRED");
const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (!approvalPath.startsWith(`${approvalsRoot}${sep}`))
  throw new Error("PRODUCTION_EMAIL_APPROVAL_PATH_REFUSED");
const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (record?.schemaVersion !== 3 || record?.environment !== "production")
  throw new Error("PRODUCTION_EMAIL_APPROVAL_SCHEMA_REFUSED");
const artifactRoot = resolve(artifactDirectory);
const entries = await readdir(artifactRoot, { withFileTypes: true });
if (entries.length !== 1 || entries[0]?.name !== "production-email-evidence.json" || !entries[0]?.isFile())
  throw new Error("PRODUCTION_EMAIL_ARTIFACT_CONTENTS_REFUSED");
const evidenceBytes = await readFile(resolve(artifactRoot, "production-email-evidence.json"));
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
const result = validateProductionEmailEvidence(record.productionReadiness.emailProvider, evidence, {
  evidenceSha256: canonicalTextSha256(evidenceBytes),
});
if (!result.valid) throw new Error(`PRODUCTION_EMAIL_ARTIFACT_REFUSED:${result.violations.join(",")}`);
console.log(
  JSON.stringify({
    event: "production.email.artifact.verified",
    candidateSha: record.candidateSha,
    evidenceSha256: record.productionReadiness.emailProvider.evidenceSha256,
    deliveryProven: true,
    secretsExposed: false,
  }),
);
