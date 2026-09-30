export const STAGING_LEAD_PROOF_MESSAGE = "Idempotência HTTP 201 confirmada.";

export const REAL_BROWSER_LEAD_CHECKS = Object.freeze([
  "firstCapture201",
  "duplicateCapture201",
  "sameReference",
  "unitaryPersistence",
  "consentPreserved",
  "rlsPersistence",
  "marketingAssignmentDenied",
  "commercialAssignment",
  "aal1ExportDenied",
  "aal2Export",
  "anonymized",
  "outboxPreserved",
  "immutableAudit",
]);

const bindingKeys = [
  "candidateSha",
  "controlSha",
  "runId",
  "runAttempt",
  "runTag",
  "deploymentId",
  "reference",
  "challengeNonceSha256",
  "emailSha256",
  "screenshotSha256",
];

export function assertRealBrowserLeadControls(report, expected) {
  const refused = (code) => {
    throw new Error(`G7_REAL_BROWSER_LEAD_CONTROLS_REFUSED:${code}`);
  };
  if (
    !report ||
    report.schemaVersion !== 1 ||
    report.status !== "passed" ||
    report.environment !== "staging" ||
    report.event !== "g7.real_browser.lead_controls.passed"
  )
    refused("status");
  const expectedKeys = [
    "schemaVersion",
    "event",
    "status",
    "environment",
    ...bindingKeys,
    "checks",
    "cleanup",
    "productionTouched",
    "tokenCaptured",
  ];
  if (JSON.stringify(Object.keys(report).sort()) !== JSON.stringify(expectedKeys.sort())) refused("keys");
  for (const key of bindingKeys) {
    if (expected?.[key] === undefined || report[key] !== expected[key]) refused(`binding_${key}`);
  }
  if (
    !/^[a-f0-9]{40}$/.test(report.candidateSha) ||
    !/^[a-f0-9]{40}$/.test(report.controlSha) ||
    !/^[1-9]\d*$/.test(report.runId) ||
    !Number.isSafeInteger(report.runAttempt) ||
    report.runAttempt < 1 ||
    !new RegExp(`^QA-CMS-FINAL-\\d{8}-${report.candidateSha.slice(0, 8)}$`).test(report.runTag) ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(report.deploymentId) ||
    !/^LD-[A-F0-9]{10}$/.test(report.reference) ||
    [report.challengeNonceSha256, report.emailSha256, report.screenshotSha256].some(
      (value) => !/^[a-f0-9]{64}$/.test(value),
    )
  )
    refused("identity");
  if (
    JSON.stringify(Object.keys(report.checks ?? {}).sort()) !==
      JSON.stringify([...REAL_BROWSER_LEAD_CHECKS].sort()) ||
    REAL_BROWSER_LEAD_CHECKS.some((key) => report.checks[key] !== true)
  )
    refused("checks");
  if (
    report.cleanup?.actorLeasesCleaned !== 3 ||
    !Number.isSafeInteger(report.cleanup?.retainedLeaseAuditEvents) ||
    report.cleanup.retainedLeaseAuditEvents < 6 ||
    report.cleanup?.watchdogFallbackOnCancellation !== true
  )
    refused("cleanup");
  if (report.productionTouched !== false || report.tokenCaptured !== false) refused("scope");
  if (/(?:captchaToken|access_token|refresh_token|@)/i.test(JSON.stringify(report)))
    refused("sensitive_material");
  return report;
}

export function leadControlsBinding(attestation, deploymentId) {
  return {
    candidateSha: attestation.candidateSha,
    controlSha: attestation.broker?.controlSha,
    runId: attestation.runId,
    runAttempt: attestation.runAttempt,
    runTag: attestation.runTag,
    deploymentId,
    reference: attestation.reference,
    challengeNonceSha256: attestation.challengeNonceSha256,
    emailSha256: attestation.emailSha256,
    screenshotSha256: attestation.screenshot?.sha256,
  };
}
