import { appendFile, readFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { contentSecurityPolicy } from "../../../cloudflare/_worker.js";
import { backupEvidenceRepositoryPath, validateBackupEvidenceBinding } from "../phase16/readiness-lib.mjs";
import { productionCloudflareApprovalTarget } from "./production-backend-lib.mjs";
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
const effectiveAt = argument("effective-at");
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

const approvalBytes = await readFile(approvalPath);
const record = JSON.parse(approvalBytes.toString("utf8"));
if (expectedEnvironment === "production" && record?.schemaVersion !== 3)
  throw new Error("G12_APPROVAL_SCHEMA_REFUSED: production deploys require schemaVersion 3.");
if (!approvalRecordFilenameMatchesCandidate(relativeFile.replaceAll("\\", "/"), record.candidateSha))
  throw new Error("G12_APPROVAL_FILENAME_REFUSED: embedded SHA must match the approved candidate.");
let validationTime = new Date();
if (effectiveAt) {
  const parsedEffectiveAt = new Date(effectiveAt);
  if (!Number.isFinite(parsedEffectiveAt.getTime()) || parsedEffectiveAt.toISOString() !== effectiveAt)
    throw new Error("G12_APPROVAL_EFFECTIVE_AT_REFUSED: recovery time must be a canonical marker timestamp.");
  validationTime = parsedEffectiveAt;
}
const result = validateApprovalRecord(record, {
  expectedSha,
  expectedEnvironment,
  expectedChangeReference,
  now: validationTime,
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
  const backupControl = record.productionReadiness.backupRestore;
  const backupEvidenceFile = backupEvidenceRepositoryPath(backupControl);
  if (!backupEvidenceFile)
    throw new Error("G12_BACKUP_EVIDENCE_REFUSED: invalid path or missing evidence digest.");
  const backupEvidencePath = resolve(backupEvidenceFile);
  if (dirname(backupEvidencePath) !== evidenceRoot)
    throw new Error("G12_BACKUP_EVIDENCE_REFUSED: evidence must be a versioned release control.");
  const backupEvidenceBytes = await readFile(backupEvidencePath);
  const backupEvidence = JSON.parse(backupEvidenceBytes.toString("utf8"));
  const backupResult = validateBackupEvidenceBinding(backupControl, backupEvidence, {
    evidenceSha256: canonicalTextSha256(backupEvidenceBytes),
  });
  if (!backupResult.valid)
    throw new Error(`G12_BACKUP_EVIDENCE_REFUSED:${backupResult.violations.join(",")}`);

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
    expectedPolicySha256: canonicalTextSha256(contentSecurityPolicy()),
    expectedAdminPolicySha256: canonicalTextSha256(contentSecurityPolicy("/admin")),
  });
  if (!cspResult.valid) throw new Error(`G12_CSP_EVIDENCE_REFUSED:${cspResult.violations.join(",")}`);
}

if (process.env.GITHUB_OUTPUT)
  await appendFile(
    process.env.GITHUB_OUTPUT,
    [
      `rollback_deployment_id=${record.rollback.deploymentId}`,
      `rollback_release=${record.rollback.release}`,
      `approval_record_sha256=${canonicalTextSha256(approvalBytes)}`,
      `approved_email_from_sha256=${canonicalTextSha256(record.productionReadiness.emailProvider.from.trim())}`,
      `approved_notification_to_sha256=${canonicalTextSha256(record.productionReadiness.emailProvider.notificationTo.trim())}`,
      `approved_cloudflare_target_sha256=${canonicalTextSha256(
        productionCloudflareApprovalTarget({
          accountId: record.target.cloudflareAccountId,
          zoneId: record.target.cloudflareZoneId,
          cachePurgeTokenId: record.target.cachePurgeTokenId,
        }),
      )}`,
      ...(record.schemaVersion === 3
        ? [
            `backup_run_id=${record.productionReadiness.backupRestore.backupRunId}`,
            `backup_run_attempt=${record.productionReadiness.backupRestore.backupRunAttempt}`,
            `backup_artifact_name=${record.productionReadiness.backupRestore.artifactName}`,
            `staging_run_id=${record.g12Evidence.runId}`,
            `email_run_id=${record.productionReadiness.emailProvider.emailRunId}`,
          ]
        : []),
      "",
    ].join("\n"),
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
    validationMode: effectiveAt ? "armed-recovery" : "current-window",
    effectiveAt: validationTime.toISOString(),
  }),
);
