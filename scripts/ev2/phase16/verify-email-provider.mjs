import { writeFile } from "node:fs/promises";
import { PRODUCTION_EMAIL_DOMAIN, validateEmailProviderConfig } from "./readiness-lib.mjs";

const config = {
  provider: process.env.EMAIL_PROVIDER,
  from: process.env.EMAIL_FROM,
  sendingDomain: process.env.EMAIL_SENDING_DOMAIN,
  siteOrigin: process.env.PRODUCTION_SITE_ORIGIN,
  notificationTo: process.env.LEAD_NOTIFICATION_TO,
  apiKey: process.env.RESEND_API_KEY,
};
const configResult = validateEmailProviderConfig(config);
if (!configResult.valid)
  throw new Error(`PRODUCTION_EMAIL_CONFIG_REFUSED:${configResult.violations.join(",")}`);

const candidateSha = process.env.CANDIDATE_SHA ?? "";
const syntheticTo = process.env.EMAIL_SYNTHETIC_TO ?? "";
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
const deliveryResponse = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": `g12-production-${candidateSha}`,
  },
  body: JSON.stringify({
    from: config.from,
    to: [syntheticTo],
    subject: `GAIATEC CMS — verificação sintética ${candidateSha.slice(0, 12)}`,
    html: `<p>Verificação sintética do provedor transacional.</p><p>SHA: <code>${candidateSha}</code></p>`,
  }),
  signal: AbortSignal.timeout(10_000),
});
if (!deliveryResponse.ok)
  throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_REFUSED:${deliveryResponse.status}`);
const delivery = await deliveryResponse.json();
if (typeof delivery?.id !== "string" || delivery.id.length < 8)
  throw new Error("PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_ID_INVALID");

let deliveryStatus = "unknown";
for (let attempt = 0; attempt < 12; attempt += 1) {
  if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 5_000));
  const statusResponse = await fetch(`https://api.resend.com/emails/${delivery.id}`, {
    headers: { Authorization: `Bearer ${config.apiKey}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!statusResponse.ok)
    throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_STATUS_UNREADABLE:${statusResponse.status}`);
  const sentEmail = await statusResponse.json();
  deliveryStatus = String(sentEmail?.last_event ?? "unknown").toLowerCase();
  if (["delivered", "opened", "clicked"].includes(deliveryStatus)) break;
  if (["bounced", "complained", "canceled", "failed"].includes(deliveryStatus))
    throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_FAILED:${deliveryStatus}`);
}
if (!["delivered", "opened", "clicked"].includes(deliveryStatus))
  throw new Error(`PRODUCTION_EMAIL_SYNTHETIC_DELIVERY_TIMEOUT:${deliveryStatus}`);

const report = {
  schemaVersion: 1,
  event: "production.email.provider.verified",
  provider: "resend",
  sendingDomain: PRODUCTION_EMAIL_DOMAIN,
  domainVerification: "delivery-proven",
  from: config.from,
  notificationTo: config.notificationTo,
  syntheticTo,
  verifiedAt: new Date().toISOString(),
  candidateSha,
  remoteDeliveryAttempted: true,
  syntheticDeliveryStatus: "passed",
  syntheticDeliveryId: delivery.id,
  syntheticDeliveryLastEvent: deliveryStatus,
  realDataUsed: false,
  secretsExposed: false,
};
if (process.env.EMAIL_EVIDENCE_PATH)
  await writeFile(process.env.EMAIL_EVIDENCE_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report));
