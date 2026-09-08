import {
  PRODUCTION_EMAIL_DOMAIN,
  PRODUCTION_EMAIL_PROVIDER,
  PRODUCTION_EMAIL_WORKFLOW,
  PRODUCTION_EMAIL_WORKFLOW_NAME,
} from "../phase16/readiness-lib.mjs";
import { emailEvidenceSha256, productionEmailIdempotencyKey } from "../phase16/verify-email-provider.mjs";
import { RELEASE_EVIDENCE_REPOSITORY } from "./production-prerequisite-gate-lib.mjs";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function validateProductionEmailEvidence(control, evidence, { evidenceSha256 } = {}) {
  const violations = [];
  if (!SHA256_PATTERN.test(evidenceSha256 ?? "") || evidenceSha256 !== control?.evidenceSha256)
    violations.push("email_evidence_digest_mismatch");
  if (evidence?.schemaVersion !== 3 || evidence?.event !== "production.email.provider.verified")
    violations.push("email_evidence_schema_invalid");
  if (
    evidence?.repository !== RELEASE_EVIDENCE_REPOSITORY ||
    evidence?.workflow?.name !== PRODUCTION_EMAIL_WORKFLOW_NAME ||
    evidence?.workflow?.path !== PRODUCTION_EMAIL_WORKFLOW
  )
    violations.push("email_evidence_workflow_invalid");
  if (
    evidence?.run?.id !== control?.emailRunId ||
    evidence?.run?.attempt !== control?.emailRunAttempt ||
    evidence?.run?.event !== control?.emailEvent ||
    evidence?.run?.ref !== control?.emailRef ||
    evidence?.run?.headSha !== control?.emailSourceSha ||
    evidence?.candidateSha !== control?.candidateSha
  )
    violations.push("email_evidence_run_binding_invalid");
  if (
    evidence?.provider !== PRODUCTION_EMAIL_PROVIDER ||
    evidence?.sendingDomain !== PRODUCTION_EMAIL_DOMAIN ||
    evidence?.domainVerification !== "delivery-proven" ||
    evidence?.remoteDeliveryAttempted !== true ||
    evidence?.deliveryProven !== true ||
    evidence?.deliveryFreshnessProven !== true ||
    evidence?.syntheticDeliveryStatus !== "passed" ||
    !["delivered", "opened", "clicked"].includes(evidence?.syntheticDeliveryLastEvent) ||
    evidence?.manualDeliveryVerificationRequired !== false
  )
    violations.push("email_evidence_delivery_not_proven");
  if (
    evidence?.approvalBindings?.fromSha256 !== emailEvidenceSha256(control?.from ?? "") ||
    evidence?.approvalBindings?.notificationToSha256 !== emailEvidenceSha256(control?.notificationTo ?? "") ||
    evidence?.approvalBindings?.syntheticDeliveryIdSha256 !== control?.syntheticDeliveryIdSha256 ||
    evidence?.idempotencyKeySha256 !==
      emailEvidenceSha256(
        productionEmailIdempotencyKey(
          control?.candidateSha ?? "",
          control?.emailRunId ?? "",
          control?.emailRunAttempt ?? "",
        ),
      ) ||
    !SHA256_PATTERN.test(evidence?.syntheticRecipientSha256 ?? "")
  )
    violations.push("email_evidence_approval_binding_invalid");
  const verificationStartedAt = Date.parse(evidence?.verificationStartedAt ?? "");
  const deliveryCreatedAt = Date.parse(evidence?.syntheticDeliveryCreatedAt ?? "");
  const verifiedAt = Date.parse(evidence?.verifiedAt ?? "");
  const runCompletedAt = Date.parse(control?.runCompletedAt ?? "");
  if (
    evidence?.verifiedAt !== control?.verifiedAt ||
    ![verificationStartedAt, deliveryCreatedAt, verifiedAt, runCompletedAt].every(Number.isFinite) ||
    deliveryCreatedAt < verificationStartedAt - 60_000 ||
    deliveryCreatedAt > verifiedAt + 60_000 ||
    verifiedAt < verificationStartedAt ||
    verifiedAt > runCompletedAt
  )
    violations.push("email_evidence_timestamp_invalid");
  if (
    evidence?.realDataUsed !== false ||
    evidence?.rawIdentifiersPersisted !== false ||
    evidence?.secretsExposed !== false
  )
    violations.push("email_evidence_privacy_boundary_invalid");
  const uniqueViolations = [...new Set(violations)];
  return { valid: uniqueViolations.length === 0, violations: uniqueViolations };
}
