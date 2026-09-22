import { appendFile, readFile } from "node:fs/promises";

import { verifyStagingRollbackDeployEvidence } from "./staging-rollback-deploy-evidence-lib.mjs";

function argument(name) {
  const indexes = process.argv.flatMap((value, index) => (value === `--${name}` ? [index] : []));
  if (indexes.length !== 1) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_EVIDENCE_INPUT_REFUSED");
  const value = process.argv[indexes[0] + 1];
  if (!value || value.startsWith("--")) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_EVIDENCE_INPUT_REFUSED");
  return value;
}

const result = verifyStagingRollbackDeployEvidence({
  evidence: JSON.parse(await readFile(argument("file"), "utf8")),
  expected: {
    candidateSha: argument("candidate"),
    artifactId: argument("artifact-id"),
    artifactDigest: argument("artifact-digest"),
  },
});
if (!result.valid)
  throw new Error(`G12_STAGING_ROLLBACK_DEPLOY_EVIDENCE_REFUSED:${result.violations.join(",")}`);
if (!process.env.GITHUB_OUTPUT) throw new Error("G12_STAGING_ROLLBACK_DEPLOY_EVIDENCE_OUTPUT_REQUIRED");
await appendFile(
  process.env.GITHUB_OUTPUT,
  [`archive_sha256=${result.archiveSha256}`, `tree_sha256=${result.treeSha256}`, ""].join("\n"),
  "utf8",
);
console.log(
  JSON.stringify({
    event: "g12.staging.rollback.deploy_evidence_verified",
    candidateSha: argument("candidate"),
    artifactId: argument("artifact-id"),
    artifactDigestPresent: true,
    archiveSha256: result.archiveSha256,
    treeSha256: result.treeSha256,
  }),
);
