import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { CONTENT_SECURITY_POLICY } from "../../../cloudflare/_worker.js";
import {
  approvalRecordFilenameMatchesCandidate,
  canonicalTextSha256,
  resolveCspEvidenceBinding,
  resolveDpoEvidenceReference,
  resolveG12EvidenceRepositoryPath,
  validateApprovalRecord,
  validateCanaryEvidenceBinding,
  validateCspEvidenceBinding,
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

const approvalsRoot = resolve(".github/release-controls/approvals");
const approvalPath = resolve(relativeFile);
if (
  !approvalPath.startsWith(`${approvalsRoot}${sep}`) ||
  !/^G12_[a-f0-9]{40}\.json$/.test(relativeFile.split(/[\\/]/).at(-1))
)
  throw new Error("G12_APPROVAL_PATH_REFUSED: use the immutable approvals/G12_<sha>.json convention.");

const record = JSON.parse(await readFile(approvalPath, "utf8"));
if (!approvalRecordFilenameMatchesCandidate(relativeFile.replaceAll("\\", "/"), record.candidateSha))
  throw new Error("G12_APPROVAL_FILENAME_REFUSED: embedded SHA must match the approved candidate.");
const result = validateApprovalRecord(record, {
  expectedSha,
  expectedEnvironment,
  expectedChangeReference,
  now: new Date(),
});
if (!result.valid) throw new Error(`G12_APPROVAL_REFUSED:${result.violations.join(",")}`);

const evidenceRoot = resolve(".github/release-controls/evidence");
const evidenceRepositoryPath = resolveG12EvidenceRepositoryPath(record.g12Evidence.file);
if (!evidenceRepositoryPath)
  throw new Error("G12_EVIDENCE_PATH_REFUSED: invalid current path or historical evidence identifier.");
const evidencePath = resolve(evidenceRepositoryPath);
if (dirname(evidencePath) !== evidenceRoot)
  throw new Error("G12_EVIDENCE_PATH_REFUSED: evidence must be a versioned release control.");
const evidenceBytes = await readFile(evidencePath);
const evidence = JSON.parse(evidenceBytes.toString("utf8"));
const binding = validateCanaryEvidenceBinding(record, evidence, {
  reportSha256: canonicalTextSha256(evidenceBytes),
});
if (!binding.valid) throw new Error(`G12_EVIDENCE_REFUSED:${binding.violations.join(",")}`);

if (record.environment === "production") {
  const governanceDpoReference = resolveDpoEvidenceReference(record.operationalGovernance.evidenceReference, {
    candidateSha: record.candidateSha,
  });
  const legalDpoReference = resolveDpoEvidenceReference(
    record.productionReadiness.dpoLegal.evidenceReference,
    { candidateSha: record.candidateSha },
  );
  if (!governanceDpoReference || governanceDpoReference !== legalDpoReference)
    throw new Error("G12_DPO_EVIDENCE_REFUSED: governance references must resolve to one pinned document.");

  const dpoScopeBytes = await readFile(
    resolve(".github/release-controls/evidence/escopo-dpo-legal-39fd74f2.md"),
  );
  if (canonicalTextSha256(dpoScopeBytes) !== record.productionReadiness.dpoLegal.scopeSha256)
    throw new Error("G12_DPO_SCOPE_REFUSED: release-control hash does not match the approval.");

  const cspControl = record.productionReadiness.csp;
  const cspBinding = resolveCspEvidenceBinding(cspControl);
  if (!cspBinding) throw new Error("G12_CSP_EVIDENCE_REFUSED: invalid path or missing evidence digest.");
  const cspPath = resolve(cspBinding.repositoryPath);
  if (dirname(cspPath) !== evidenceRoot)
    throw new Error("G12_CSP_EVIDENCE_REFUSED: evidence must be a versioned release control.");
  const cspEvidenceBytes = await readFile(cspPath);
  const cspEvidence = JSON.parse(cspEvidenceBytes.toString("utf8"));
  const cspResult = validateCspEvidenceBinding(cspControl, cspEvidence, {
    reportSha256: canonicalTextSha256(cspEvidenceBytes),
    expectedPolicySha256: canonicalTextSha256(CONTENT_SECURITY_POLICY),
  });
  if (!cspResult.valid) throw new Error(`G12_CSP_EVIDENCE_REFUSED:${cspResult.violations.join(",")}`);
}

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
