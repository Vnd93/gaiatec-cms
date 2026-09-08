import assert from "node:assert/strict";
import test from "node:test";

import { canonicalTextSha256 } from "./release-guard-lib.mjs";
import { validateProductionEmailEvidence } from "./production-email-gate-lib.mjs";
import { emailEvidenceSha256, productionEmailIdempotencyKey } from "../phase16/verify-email-provider.mjs";

const sha = "a".repeat(40);
const from = "GAIATEC SISTEMAS <cms@gaiatecsistemas.com>";
const notificationTo = "comercial@gaiatecsistemas.com.br";
const deliveryHash = "d".repeat(64);

function fixture() {
  const control = {
    provider: "resend",
    sendingDomain: "gaiatecsistemas.com",
    from,
    notificationTo,
    candidateSha: sha,
    emailRunId: "34000214200",
    emailRunAttempt: 1,
    emailEvent: "workflow_dispatch",
    emailRef: "refs/heads/main",
    emailSourceSha: sha,
    syntheticDeliveryIdSha256: deliveryHash,
    verifiedAt: "2026-09-07T11:25:00.000Z",
    runCompletedAt: "2026-09-07T11:26:00.000Z",
  };
  const evidence = {
    schemaVersion: 3,
    event: "production.email.provider.verified",
    repository: "Vnd93/gaiatec-cms",
    workflow: {
      name: "Verify production email provider",
      path: ".github/workflows/verify-production-email.yml",
    },
    run: {
      id: control.emailRunId,
      attempt: control.emailRunAttempt,
      event: control.emailEvent,
      ref: control.emailRef,
      headSha: control.emailSourceSha,
    },
    provider: control.provider,
    sendingDomain: control.sendingDomain,
    domainVerification: "delivery-proven",
    approvalBindings: {
      fromSha256: emailEvidenceSha256(from),
      notificationToSha256: emailEvidenceSha256(notificationTo),
      syntheticDeliveryIdSha256: deliveryHash,
    },
    idempotencyKeySha256: emailEvidenceSha256(
      productionEmailIdempotencyKey(sha, control.emailRunId, control.emailRunAttempt),
    ),
    syntheticRecipientSha256: "e".repeat(64),
    verificationStartedAt: "2026-09-07T11:24:00.000Z",
    syntheticDeliveryCreatedAt: "2026-09-07T11:24:01.000Z",
    verifiedAt: control.verifiedAt,
    candidateSha: sha,
    remoteDeliveryAttempted: true,
    syntheticDeliveryStatus: "passed",
    syntheticDeliveryLastEvent: "delivered",
    deliveryProven: true,
    deliveryFreshnessProven: true,
    manualDeliveryVerificationRequired: false,
    realDataUsed: false,
    rawIdentifiersPersisted: false,
    secretsExposed: false,
  };
  const bytes = Buffer.from(`${JSON.stringify(evidence, null, 2)}\n`);
  control.evidenceSha256 = canonicalTextSha256(bytes);
  return { control, evidence, bytes };
}

test("email evidence requires a real terminal delivery and exact run/candidate/digest bindings", () => {
  const { control, evidence, bytes } = fixture();
  assert.equal(
    validateProductionEmailEvidence(control, evidence, {
      evidenceSha256: canonicalTextSha256(bytes),
    }).valid,
    true,
  );
  for (const [mutate, violation] of [
    [(value) => (value.manualDeliveryVerificationRequired = true), /email_evidence_delivery_not_proven/],
    [(value) => (value.syntheticDeliveryStatus = "accepted"), /email_evidence_delivery_not_proven/],
    [(value) => (value.syntheticDeliveryLastEvent = "sent"), /email_evidence_delivery_not_proven/],
    [(value) => (value.deliveryFreshnessProven = false), /email_evidence_delivery_not_proven/],
    [(value) => (value.idempotencyKeySha256 = "f".repeat(64)), /email_evidence_approval_binding_invalid/],
    [
      (value) => (value.syntheticDeliveryCreatedAt = "2026-09-07T11:20:00.000Z"),
      /email_evidence_timestamp_invalid/,
    ],
    [(value) => (value.run.headSha = "b".repeat(40)), /email_evidence_run_binding_invalid/],
    [(value) => (value.candidateSha = "b".repeat(40)), /email_evidence_run_binding_invalid/],
    [(value) => (value.realDataUsed = true), /email_evidence_privacy_boundary_invalid/],
  ]) {
    const changed = structuredClone(evidence);
    mutate(changed);
    const result = validateProductionEmailEvidence(control, changed, {
      evidenceSha256: canonicalTextSha256(bytes),
    });
    assert.match(result.violations.join(","), violation);
  }
  assert.match(
    validateProductionEmailEvidence(control, evidence, { evidenceSha256: "0".repeat(64) }).violations.join(
      ",",
    ),
    /email_evidence_digest_mismatch/,
  );
  assert.match(
    validateProductionEmailEvidence({ ...control, runCompletedAt: "not-an-iso-date" }, evidence, {
      evidenceSha256: canonicalTextSha256(bytes),
    }).violations.join(","),
    /email_evidence_timestamp_invalid/,
  );
});
