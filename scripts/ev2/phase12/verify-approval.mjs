import { appendFile, readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import {
  canonicalTextSha256,
  validateApprovalRecord,
  validateCanaryEvidenceBinding,
} from "./release-guard-lib.mjs";

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const relativeFile = argument("file");
const expectedSha = argument("candidate");
const expectedEnvironment = argument("environment");
const expectedChangeReference = argument("change-reference");
if (!relativeFile || !expectedSha || !expectedEnvironment || !expectedChangeReference)
  throw new Error(
    "G12_APPROVAL_INPUT_REQUIRED: --file, --candidate, --environment and --change-reference are mandatory.",
  );

const approvalsRoot = resolve("docs/ev2/fase-12/approvals");
const approvalPath = resolve(relativeFile);
if (
  !approvalPath.startsWith(`${approvalsRoot}${sep}`) ||
  !/^G12_[a-f0-9]{40}\.json$/.test(relativeFile.split(/[\\/]/).at(-1))
)
  throw new Error("G12_APPROVAL_PATH_REFUSED: use the immutable approvals/G12_<sha>.json convention.");

const record = JSON.parse(await readFile(approvalPath, "utf8"));
const result = validateApprovalRecord(record, {
  expectedSha,
  expectedEnvironment,
  expectedChangeReference,
  now: new Date(),
});
if (!result.valid) throw new Error(`G12_APPROVAL_REFUSED:${result.violations.join(",")}`);

const evidenceRoot = resolve("docs/ev2/fase-12/evidencias");
const evidencePath = resolve(record.g12Evidence.file);
if (!evidencePath.startsWith(`${evidenceRoot}${sep}`))
  throw new Error("G12_EVIDENCE_PATH_REFUSED: evidence must be versioned under fase-12/evidencias.");
const evidenceBytes = await readFile(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
const binding = validateCanaryEvidenceBinding(record, evidence, {
  reportSha256: canonicalTextSha256(evidenceBytes),
});
if (!binding.valid) throw new Error(`G12_EVIDENCE_REFUSED:${binding.violations.join(",")}`);

if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `rollback_deployment_id=${record.rollback.deploymentId}\nrollback_release=${record.rollback.release}\n`,
    "utf8",
  );

console.log(
  JSON.stringify({
    event: "g12.approval.verified",
    gate: record.gate,
    candidateSha: record.candidateSha,
    environment: record.environment,
    changeReference: record.changeReference,
    owners: Object.keys(record.owners).length,
    evidenceFile: record.g12Evidence.file,
    evidenceBound: true,
  }),
);
