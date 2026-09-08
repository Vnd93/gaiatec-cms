const FULL_SHA = /^[a-f0-9]{40}$/;
const APPROVAL_PATH = /^\.github\/release-controls\/approvals\/G12_([a-f0-9]{40})\.json$/;
const G12_EVIDENCE_PATH = /^\.github\/release-controls\/evidence\/G12_CANARY_[a-f0-9_-]+\.json$/;
const BACKUP_EVIDENCE_PATH =
  /^\.github\/release-controls\/evidence\/BACKUP_RESTORE_[1-9]\d{5,19}_[1-9]\d*\.json$/;
const CSP_EVIDENCE_PATH = /^\.github\/release-controls\/evidence\/G16_CSP_BROWSER_([a-f0-9]{7})\.json$/;

export function expectedProductionControlPaths(record, approvalPath) {
  const violations = [];
  const approvalMatch = String(approvalPath ?? "").match(APPROVAL_PATH);
  const candidateSha = String(record?.candidateSha ?? "");
  if (!approvalMatch || approvalMatch[1] !== candidateSha || !FULL_SHA.test(candidateSha))
    violations.push("approval_path_candidate_invalid");

  const g12Evidence = String(record?.g12Evidence?.file ?? "");
  if (!G12_EVIDENCE_PATH.test(g12Evidence)) violations.push("g12_evidence_path_invalid");

  const backupEvidence = String(record?.productionReadiness?.backupRestore?.evidenceReference ?? "");
  if (!BACKUP_EVIDENCE_PATH.test(backupEvidence)) violations.push("backup_evidence_path_invalid");

  const cspEvidence = String(record?.productionReadiness?.csp?.evidenceReference ?? "");
  const cspMatch = cspEvidence.match(CSP_EVIDENCE_PATH);
  if (!cspMatch || cspMatch[1] !== candidateSha.slice(0, 7)) violations.push("csp_evidence_path_invalid");

  const paths = [String(approvalPath ?? ""), g12Evidence, backupEvidence, cspEvidence];
  if (new Set(paths).size !== paths.length) violations.push("control_path_duplicate");
  return { valid: violations.length === 0, violations, paths };
}

export function validateProductionControlDelta({
  candidateSha,
  controlSha,
  parents,
  commitsAhead,
  changes,
  expectedPaths,
}) {
  const violations = [];
  if (!FULL_SHA.test(candidateSha ?? "")) violations.push("candidate_sha_invalid");
  if (!FULL_SHA.test(controlSha ?? "")) violations.push("control_sha_invalid");
  if (!Array.isArray(parents) || parents.length !== 1 || parents[0] !== candidateSha)
    violations.push("control_must_be_single_direct_child");
  if (commitsAhead !== 1) violations.push("exactly_one_control_commit_required");

  const expected = new Set(expectedPaths ?? []);
  if (expected.size !== 4) violations.push("control_path_set_invalid");
  const seen = new Set();
  for (const change of Array.isArray(changes) ? changes : []) {
    if (change?.status !== "A") violations.push("control_file_must_be_new");
    if (!expected.has(change?.path)) violations.push("control_file_not_allowlisted");
    if (change?.mode !== "100644") violations.push("control_file_mode_invalid");
    if (seen.has(change?.path)) violations.push("control_file_duplicate");
    seen.add(change?.path);
  }
  if (seen.size !== expected.size || [...expected].some((path) => !seen.has(path)))
    violations.push("control_evidence_set_incomplete");

  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}
