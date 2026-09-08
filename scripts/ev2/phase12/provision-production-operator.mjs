import { createHash, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";

import { exactCorporateOperatorEmail } from "./production-operator-identity-lib.mjs";

const ALLOWED_FLAGS = [
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.ai_assist",
  "ev2.system_assurance",
];
const FORBIDDEN_FLAGS = new Set(["ev2.multisite", "ev2.ai_execute"]);

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function deterministicUuid(value) {
  const bytes = createHash("sha256").update(value, "utf8").digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`CMS_PRODUCTION_OPERATOR_CONFIGURATION_REQUIRED:${name}`);
  return value;
}

function rpcErrorCode(body) {
  const match = body.match(/CMS_[A-Z0-9_]+/);
  return match?.[0] ?? "CMS_PRODUCTION_OPERATOR_RPC_REFUSED";
}

const candidateSha = required("CANDIDATE_SHA");
const approvalRecordSha256 = required("G12_APPROVAL_RECORD_SHA256");
const authorization = required("G12_PRODUCTION_AUTHORIZATION");
const projectRef = required("PRODUCTION_SUPABASE_PROJECT_REF");
const serviceRoleKey = required("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY");
const rawEmail = required("PRODUCTION_OPERATOR_EMAIL");
const rawLoginEmail = required("PRODUCTION_AUTH_CANARY_EMAIL");
const allowedEmailDomain = required("PRODUCTION_AUTH_CANARY_EMAIL_DOMAIN");
const reportPath = required("PRODUCTION_OPERATOR_REPORT_PATH");
const requestId = required("PRODUCTION_OPERATOR_REQUEST_ID");
const windowMinutes = Number(required("PRODUCTION_OPERATOR_WINDOW_MINUTES"));
let serviceUrl;
try {
  serviceUrl = new URL(required("PRODUCTION_SUPABASE_URL"));
} catch {
  throw new Error("CMS_PRODUCTION_OPERATOR_TARGET_INVALID");
}

if (!/^[a-f0-9]{40}$/.test(candidateSha)) throw new Error("CMS_PRODUCTION_OPERATOR_CANDIDATE_INVALID");
if (!/^[a-f0-9]{64}$/.test(approvalRecordSha256)) throw new Error("CMS_PRODUCTION_OPERATOR_APPROVAL_INVALID");
if (!/^[a-z0-9]{20}$/.test(projectRef)) throw new Error("CMS_PRODUCTION_OPERATOR_PROJECT_REF_INVALID");
if (!/^[1-9][0-9]{0,19}$/.test(requestId)) throw new Error("CMS_PRODUCTION_OPERATOR_REQUEST_INVALID");
if (
  serviceUrl.protocol !== "https:" ||
  serviceUrl.hostname !== `${projectRef}.supabase.co` ||
  !["", "/"].includes(serviceUrl.pathname) ||
  serviceUrl.search ||
  serviceUrl.hash ||
  serviceUrl.username ||
  serviceUrl.password
)
  throw new Error("CMS_PRODUCTION_OPERATOR_TARGET_INVALID");
if (
  !Number.isInteger(windowMinutes) ||
  windowMinutes < 1440 ||
  windowMinutes > 525_600 ||
  windowMinutes % 1440 !== 0
)
  throw new Error("CMS_PRODUCTION_OPERATOR_WINDOW_INVALID");
const releaseAuthorization = `AUTORIZO-G12-PRODUCAO:${candidateSha}`;
const renewalAuthorization = `AUTORIZO-RENOVAR-OPERADOR-CMS:${candidateSha}:${windowMinutes / 1440}-DIAS`;
const authorizationKind =
  authorization === releaseAuthorization
    ? "release"
    : authorization === renewalAuthorization
      ? "renewal"
      : null;
if (!authorizationKind) throw new Error("CMS_PRODUCTION_OPERATOR_AUTHORIZATION_INVALID");

const normalizedEmail = exactCorporateOperatorEmail(rawEmail, rawLoginEmail, allowedEmailDomain);
const emailSha256 = sha256(normalizedEmail);
const authorizationSha256 = sha256(authorization);
const idempotencyKey = deterministicUuid(
  [candidateSha, approvalRecordSha256, emailSha256, String(windowMinutes), requestId].join("\0"),
);

const response = await fetch(new URL("/rest/v1/rpc/cms_provision_production_operator", serviceUrl), {
  method: "POST",
  headers: {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    p_email_sha256: emailSha256,
    p_candidate_sha: candidateSha,
    p_environment: "production",
    p_window_minutes: windowMinutes,
    p_idempotency_key: idempotencyKey,
    p_approval_record_sha256: approvalRecordSha256,
    p_authorization_sha256: authorizationSha256,
    p_correlation_id: randomUUID(),
    p_workflow_run_id: requestId,
  }),
  signal: AbortSignal.timeout(15_000),
});
const responseText = await response.text();
if (!response.ok) throw new Error(`${rpcErrorCode(responseText)}:${response.status}`);

let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  throw new Error("CMS_PRODUCTION_OPERATOR_RESPONSE_INVALID");
}
if (Array.isArray(payload) && payload.length === 1) [payload] = payload;
const enabledFlags = Array.isArray(payload?.enabledFlags) ? payload.enabledFlags : [];
const disabledFlags = Array.isArray(payload?.disabledFlags) ? payload.disabledFlags : [];
const expiresAt = Date.parse(payload?.overrideExpiresAt ?? "");
const maximumExpiry = Date.now() + windowMinutes * 60_000 + 30_000;
if (
  payload?.schemaVersion !== 1 ||
  payload?.status !== "provisioned" ||
  payload?.candidateSha !== candidateSha ||
  payload?.environment !== "production" ||
  payload?.authorizationKind !== authorizationKind ||
  payload?.validityDays !== windowMinutes / 1440 ||
  payload?.workflowRunId !== requestId ||
  !/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
    payload?.receiptId ?? "",
  ) ||
  payload?.totpVerified !== true ||
  payload?.legacySuperAdmin !== true ||
  payload?.scopedSuperAdmin !== true ||
  enabledFlags.length !== ALLOWED_FLAGS.length ||
  !ALLOWED_FLAGS.every((flag, index) => enabledFlags[index] === flag) ||
  enabledFlags.some((flag) => FORBIDDEN_FLAGS.has(flag)) ||
  !disabledFlags.every((flag) => typeof flag === "string") ||
  !Number.isFinite(expiresAt) ||
  expiresAt <= Date.now() ||
  expiresAt > maximumExpiry
)
  throw new Error("CMS_PRODUCTION_OPERATOR_RESPONSE_INVALID");

const safeReport = {
  schemaVersion: 1,
  event: "cms.production_operator.provisioned",
  status: "provisioned",
  candidateSha,
  environment: "production",
  authorizationKind,
  validityDays: windowMinutes / 1440,
  workflowRunId: requestId,
  receiptId: payload.receiptId,
  overrideExpiresAt: new Date(expiresAt).toISOString(),
  enabledFlags,
  disabledFlags,
  totpVerified: true,
  legacySuperAdmin: true,
  scopedSuperAdmin: true,
  replayed: payload.replayed === true,
  containsPii: false,
};
await writeFile(reportPath, `${JSON.stringify(safeReport, null, 2)}\n`, {
  encoding: "utf8",
  mode: 0o600,
});
console.log(JSON.stringify(safeReport));
