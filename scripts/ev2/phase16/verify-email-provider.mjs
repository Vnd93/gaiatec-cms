import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PRODUCTION_EMAIL_DOMAIN,
  classifyResendDeliveryStatus,
  validateEmailProviderConfig,
} from "./readiness-lib.mjs";

const SAFE_DELIVERY_EVENTS = new Set([
  "unknown",
  "scheduled",
  "queued",
  "sent",
  "delivered",
  "delivery_delayed",
  "complained",
  "bounced",
  "opened",
  "clicked",
  "canceled",
  "failed",
  "unreadable-by-sending-only-token",
]);
const PROVIDER_CLOCK_SKEW_MS = 60_000;

export function emailEvidenceSha256(value) {
  return createHash("sha256").update(String(value).trim(), "utf8").digest("hex");
}

export function productionEmailIdempotencyKey(candidateSha, runId, runAttempt) {
  return `g12-production-${candidateSha}-${runId}-${runAttempt}`;
}

export function serializeEmailEvidence(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function requestResend(fetchImpl, url, options, failureCode) {
  try {
    return await fetchImpl(url, options);
  } catch {
    throw new Error(failureCode);
  }
}

export async function verifyEmailProvider({
  environment = process.env,
  fetchImpl = globalThis.fetch,
  wait = (milliseconds) => new Promise((resolveWait) => setTimeout(resolveWait, milliseconds)),
  now = () => new Date(),
} = {}) {
  const config = {
    provider: environment.EMAIL_PROVIDER,
    from: environment.EMAIL_FROM,
    sendingDomain: environment.EMAIL_SENDING_DOMAIN,
    siteOrigin: environment.PRODUCTION_SITE_ORIGIN,
    notificationTo: environment.LEAD_NOTIFICATION_TO,
    apiKey: environment.RESEND_API_KEY,
  };
  const configResult = validateEmailProviderConfig(config);
  if (!configResult.valid)
    throw new Error(`PRODUCTION_EMAIL_CONFIG_REFUSED:${configResult.violations.join(",")}`);

  const candidateSha = environment.CANDIDATE_SHA ?? "";
  const syntheticTo = environment.EMAIL_SYNTHETIC_TO ?? "";
  const syntheticConfig = validateEmailProviderConfig({
    ...config,
    notificationTo: syntheticTo,
  });
  if (!/^[a-f0-9]{40}$/.test(candidateSha) || !syntheticConfig.valid)
    throw new Error(
      `PRODUCTION_EMAIL_SYNTHETIC_INPUT_REFUSED:${[
        ...syntheticConfig.violations,
        ...(!/^[a-f0-9]{40}$/.test(candidateSha) ? ["candidate_sha_invalid"] : []),
      ].join(",")}`,
    );

  const runId = environment.GITHUB_RUN_ID ?? "";
  const runAttempt = Number(environment.GITHUB_RUN_ATTEMPT);
  const repository = String(environment.GITHUB_REPOSITORY ?? "");
  const workflowRef = String(environment.GITHUB_WORKFLOW_REF ?? "");
  if (
    repository.toLowerCase() !== "vnd93/gaiatec-cms" ||
    environment.GITHUB_WORKFLOW !== "Verify production email provider" ||
    workflowRef.toLowerCase() !==
      "vnd93/gaiatec-cms/.github/workflows/verify-production-email.yml@refs/heads/main" ||
    environment.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    environment.GITHUB_REF !== "refs/heads/main" ||
    environment.GITHUB_SHA !== candidateSha ||
    !/^[1-9]\d{5,19}$/.test(runId) ||
    !Number.isSafeInteger(runAttempt) ||
    runAttempt <= 0
  )
    throw new Error("PRODUCTION_EMAIL_GITHUB_CONTEXT_REFUSED");

  const verificationStartedAt = now();
  const verificationStartedAtMs = verificationStartedAt?.getTime?.();
  if (!Number.isFinite(verificationStartedAtMs)) throw new Error("PRODUCTION_EMAIL_CLOCK_INVALID");
  const idempotencyKey = productionEmailIdempotencyKey(candidateSha, runId, runAttempt);
  const expectedSubject = `GAIATEC CMS — verificação sintética ${candidateSha.slice(0, 12)}`;

  const deliveryResponse = await requestResend(
    fetchImpl,
    "https://api.resend.com/emails",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [syntheticTo],
        subject: expectedSubject,
        html: `<p>Verificação sintética do provedor transacional.</p><p>SHA: <code>${candidateSha}</code></p>`,
      }),
      signal: AbortSignal.timeout(10_000),
    },
    "PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_REQUEST_FAILED",
  );
  if (!deliveryResponse.ok)
    throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_REFUSED:${deliveryResponse.status}`);
  const delivery = await deliveryResponse.json().catch(() => null);
  if (typeof delivery?.id !== "string" || delivery.id.length < 8)
    throw new Error("PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_ID_INVALID");

  let deliveryStatus = "unknown";
  let deliveryCreatedAt = "";
  let deliveryCreatedAtMs = Number.NaN;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    if (attempt > 0) await wait(5_000);
    const statusResponse = await requestResend(
      fetchImpl,
      `https://api.resend.com/emails/${delivery.id}`,
      {
        headers: { Authorization: `Bearer ${config.apiKey}` },
        signal: AbortSignal.timeout(10_000),
      },
      "PRODUCTION_EMAIL_SYNTHETIC_STATUS_REQUEST_FAILED",
    );
    const sentEmail = statusResponse.ok ? await statusResponse.json().catch(() => null) : null;
    const classification = classifyResendDeliveryStatus({
      httpStatus: statusResponse.status,
      lastEvent: sentEmail?.last_event,
    });
    deliveryStatus = SAFE_DELIVERY_EVENTS.has(classification.event) ? classification.event : "unknown";
    if (classification.outcome === "unreadable")
      throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_STATUS_UNREADABLE:${statusResponse.status}`);
    if (classification.outcome === "failed")
      throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_FAILED:${deliveryStatus}`);
    if (
      sentEmail?.id !== delivery.id ||
      sentEmail?.from !== config.from ||
      sentEmail?.subject !== expectedSubject ||
      !Array.isArray(sentEmail?.to) ||
      sentEmail.to.length !== 1 ||
      sentEmail.to[0]?.trim().toLowerCase() !== syntheticTo.trim().toLowerCase()
    )
      throw new Error("PRODUCTION_EMAIL_SYNTHETIC_REMOTE_IDENTITY_REFUSED");

    const observedAt = now();
    const observedAtMs = observedAt?.getTime?.();
    const currentCreatedAtMs = Date.parse(sentEmail?.created_at ?? "");
    if (
      !Number.isFinite(observedAtMs) ||
      !Number.isFinite(currentCreatedAtMs) ||
      currentCreatedAtMs < verificationStartedAtMs - PROVIDER_CLOCK_SKEW_MS ||
      currentCreatedAtMs > observedAtMs + PROVIDER_CLOCK_SKEW_MS ||
      (Number.isFinite(deliveryCreatedAtMs) && currentCreatedAtMs !== deliveryCreatedAtMs)
    )
      throw new Error("PRODUCTION_EMAIL_SYNTHETIC_REMOTE_TIMESTAMP_REFUSED");
    deliveryCreatedAtMs = currentCreatedAtMs;
    deliveryCreatedAt = new Date(currentCreatedAtMs).toISOString();
    if (classification.outcome === "delivered") break;
  }
  if (!["delivered", "opened", "clicked"].includes(deliveryStatus))
    throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_TIMEOUT:${deliveryStatus}`);

  const verifiedAt = now();
  const verifiedAtMs = verifiedAt?.getTime?.();
  if (
    !Number.isFinite(verifiedAtMs) ||
    verifiedAtMs < verificationStartedAtMs ||
    deliveryCreatedAtMs > verifiedAtMs + PROVIDER_CLOCK_SKEW_MS
  )
    throw new Error("PRODUCTION_EMAIL_CLOCK_INVALID");

  return {
    schemaVersion: 3,
    event: "production.email.provider.verified",
    repository: "Vnd93/gaiatec-cms",
    workflow: {
      name: environment.GITHUB_WORKFLOW,
      path: ".github/workflows/verify-production-email.yml",
    },
    run: {
      id: runId,
      attempt: runAttempt,
      event: environment.GITHUB_EVENT_NAME,
      ref: environment.GITHUB_REF,
      headSha: environment.GITHUB_SHA,
    },
    provider: "resend",
    sendingDomain: PRODUCTION_EMAIL_DOMAIN,
    domainVerification: "delivery-proven",
    approvalBindings: {
      fromSha256: emailEvidenceSha256(config.from),
      notificationToSha256: emailEvidenceSha256(config.notificationTo),
      syntheticDeliveryIdSha256: emailEvidenceSha256(delivery.id),
    },
    idempotencyKeySha256: emailEvidenceSha256(idempotencyKey),
    syntheticRecipientSha256: emailEvidenceSha256(syntheticTo),
    verificationStartedAt: verificationStartedAt.toISOString(),
    syntheticDeliveryCreatedAt: deliveryCreatedAt,
    verifiedAt: verifiedAt.toISOString(),
    candidateSha,
    remoteDeliveryAttempted: true,
    syntheticDeliveryStatus: "passed",
    syntheticDeliveryLastEvent: deliveryStatus,
    deliveryProven: true,
    deliveryFreshnessProven: true,
    manualDeliveryVerificationRequired: false,
    realDataUsed: false,
    rawIdentifiersPersisted: false,
    secretsExposed: false,
  };
}

export async function main() {
  const report = await verifyEmailProvider();
  const serialized = serializeEmailEvidence(report);
  if (process.env.EMAIL_EVIDENCE_PATH)
    await writeFile(process.env.EMAIL_EVIDENCE_PATH, serialized, { encoding: "utf8", mode: 0o600 });
  process.stdout.write(serialized);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
