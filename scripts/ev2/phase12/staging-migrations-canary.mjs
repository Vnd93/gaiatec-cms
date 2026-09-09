import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { QA_ACTOR_LEASE_TTL_MINUTES } from "../../qa/qa-actor-lease.mjs";
import {
  CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
  CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
  CMS_QA_ACTOR_RUNTIME_REPAIRS_0086_OWNER_ONLY_FUNCTIONS,
  CMS_RUNTIME_INTEGRITY_REPAIRS_0087_OWNER_ONLY_FUNCTIONS,
  CMS_RUNTIME_INTEGRITY_REPAIRS_0087_SERVICE_ONLY_RPCS,
  CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_OWNER_ONLY_FUNCTIONS,
  CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_SERVICE_ONLY_RPCS,
  CMS_MEDIA_UPLOAD_ABORT_0082_RPCS,
  CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
  CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
  exactMigrationHistorySql,
  leadOriginBindingSemanticSql,
  mediaUploadAbortSchemaContractSql,
  ownerOnlyFunctionContractSql,
  publicRelationLimitSemanticSql,
  qaActorRuntimeRepairsSemanticSql,
  runtimeIntegrityRepairsSemanticSql,
  runtimeIntegrityFollowupSemanticSql,
  sessionRefreshRevocationSemanticSql,
  serviceOnlyRpcContractSql,
  sourceMigrationManifest,
} from "./migration-manifest-lib.mjs";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev",
};
const DOCUMENT_BUCKET = "cms-documents-private";
const PRODUCT_CONTROLLED_DIMENSIONS = [
  {
    field: "productCategory",
    listKey: "product.category",
    masterType: "category",
    suffix: "categoria",
  },
  {
    field: "applicationMagnitude",
    listKey: "product.application_magnitude",
    masterType: "magnitude",
    suffix: "grandeza",
  },
  {
    field: "technology",
    listKey: "product.technology",
    masterType: "technology",
    suffix: "tecnologia",
  },
  {
    field: "installationOperation",
    listKey: "product.installation_operation",
    masterType: "installation",
    suffix: "instalacao",
  },
  {
    field: "monitoredElement",
    listKey: "product.monitored_element",
    masterType: "monitored_element",
    suffix: "elemento",
  },
];
const sourceMigrations = sourceMigrationManifest(process.cwd());
const scenarioCoverage = [
  "0057",
  "0058",
  "0059",
  "0060",
  "0061",
  "0062",
  "0063",
  "0064",
  "0078",
  "0080",
  "0081",
  "0082",
  "0083",
  "0084",
  "0085",
  "0086",
  "0087",
  "0088",
];
const accessToken = process.env.SUPABASE_ACCESS_TOKEN ?? "";
const expectedSha = process.env.G12_MIGRATION_CANARY_EXPECTED_SHA ?? "";
const reportPath = path.resolve(
  process.env.G12_MIGRATION_CANARY_REPORT_PATH ?? "g12-staging-migrations-canary.json",
);
if (!accessToken.startsWith("sbp_") || accessToken.length < 24)
  throw new Error("G12_STAGING_MIGRATION_CANARY_ACCESS_TOKEN_INVALID");
if (!/^[a-f0-9]{40}$/.test(expectedSha)) throw new Error("G12_STAGING_MIGRATION_CANARY_SHA_INVALID");

const qaDate = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const qaTag = `QA-CMS-FINAL-${qaDate}-${expectedSha.slice(0, 8)}`;
const checks = [];
const actors = [];
let context;
let operator;
let dualScopeActor;
let documentFixture;
let mediaFixture;
let contentFixture;
let overrideId;
let projectionCreated = false;
let operationError;
let cleanupError;
let finalResidue;
let revocationLatencyMs;
let sessionRevocationLatencyMs;

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_@./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function runSupabase(args) {
  const binary = "npx";
  const pinned = ["--yes", "supabase@2.116.0", ...args];
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : binary;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [binary, ...pinned].map(quoteWindowsArgument).join(" ")]
      : pinned;
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, SUPABASE_ACCESS_TOKEN: accessToken },
  });
  if (result.error || result.status !== 0)
    throw new Error(`G12_STAGING_SUPABASE_CLI_FAILED:${args.slice(0, 2).join("_")}`);
  return result.stdout.trim();
}

function supabaseJson(args) {
  try {
    return JSON.parse(runSupabase([...args, "--output", "json"]));
  } catch {
    throw new Error(`G12_STAGING_SUPABASE_JSON_FAILED:${args.slice(0, 2).join("_")}`);
  }
}

function check(name, condition, detail = "contract") {
  const result = condition ? "PASS" : "FAIL";
  checks.push({ name, result, detail });
  if (!condition) throw new Error(`G12_STAGING_MIGRATION_CANARY_FAILED:${name}`);
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!allowed.includes(response.status))
    throw new Error(`G12_STAGING_HTTP_FAILED:${method}:${new URL(url).pathname}:${response.status}`);
  return { status: response.status, json: payload, headers: response.headers };
}

async function managementQuery(query) {
  const response = await request(`https://api.supabase.com/v1/projects/${TARGET.ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { query },
  });
  return response.json;
}

async function loadContext() {
  const projects = supabaseJson(["projects", "list"]);
  const project = projects.find((entry) => entry.ref === TARGET.ref);
  if (!project || project.name !== TARGET.name || project.region !== TARGET.region || project.linked !== true)
    throw new Error("G12_STAGING_MIGRATION_CANARY_TARGET_REFUSED");
  const keys = supabaseJson(["projects", "api-keys", "--project-ref", TARGET.ref, "--reveal"]);
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("G12_STAGING_MIGRATION_CANARY_KEYS_UNAVAILABLE");
  const url = `https://${TARGET.ref}.supabase.co`;
  return {
    url,
    anonKey,
    serviceKey,
    serviceHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    admin: createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    }),
  };
}

async function rest(table, { method = "GET", query = "", body, prefer, allowed } = {}) {
  const accepted =
    allowed ??
    (method === "POST" ? [200, 201] : method === "PATCH" || method === "DELETE" ? [200, 204] : [200, 206]);
  return request(`${context.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: { ...context.serviceHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body,
    allowed: accepted,
  });
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("G12_STAGING_TOTP_SECRET_INVALID");
    bits += index.toString(2).padStart(5, "0");
  }
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, now) {
  const counter = Math.floor(now / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function authenticationClock() {
  const response = await fetch(`${context.url}/auth/v1/health`, {
    headers: { apikey: context.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const serverDate = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(serverDate) ? serverDate : Date.now();
}

async function actorLeaseStatus(actorId) {
  const result = await context.admin.rpc("cms_qa_actor_lease_status", {
    p_actor_id: actorId,
    p_run_tag: qaTag,
    p_candidate_sha: expectedSha,
    p_environment: "staging",
  });
  if (result.error || !result.data || typeof result.data !== "object")
    throw new Error("G12_STAGING_SYNTHETIC_LEASE_UNAVAILABLE");
  return result.data;
}

async function assertActorLease(actorId, expectedStatus) {
  const lease = await actorLeaseStatus(actorId);
  if (
    lease.schemaVersion !== 1 ||
    lease.status !== expectedStatus ||
    lease.environment !== "staging" ||
    lease.candidateSha !== expectedSha ||
    lease.runTag !== qaTag ||
    !Number.isInteger(lease.ttlSeconds) ||
    lease.ttlSeconds !== QA_ACTOR_LEASE_TTL_MINUTES * 60
  )
    throw new Error("G12_STAGING_SYNTHETIC_LEASE_INVALID");
  return lease;
}

async function completeActorLease(actorId) {
  const result = await context.admin.rpc("cms_complete_qa_actor_lease", {
    p_actor_id: actorId,
    p_run_tag: qaTag,
    p_candidate_sha: expectedSha,
    p_environment: "staging",
  });
  if (
    result.error ||
    result.data?.schemaVersion !== 1 ||
    result.data?.status !== "cleaned" ||
    typeof result.data?.replayed !== "boolean"
  )
    throw new Error("G12_STAGING_SYNTHETIC_LEASE_COMPLETION_FAILED");
  await assertActorLease(actorId, "cleaned");
}

async function createActor(label) {
  const email = `g12-migrations-${label}-${randomUUID()}@example.invalid`;
  const password = `Qa!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        synthetic: true,
        purpose: "qa-cms-browser",
        runTag: qaTag,
        candidateSha: expectedSha,
        environment: "staging",
      },
    },
  });
  if (!/^[0-9a-f-]{36}$/i.test(created.json?.id ?? ""))
    throw new Error("G12_STAGING_SYNTHETIC_ACTOR_INVALID");
  const actor = {
    id: created.json.id,
    email,
    password,
    token: "",
    refreshToken: "",
    factorId: "",
    totpSecret: "",
    lastTotpCounter: -1,
  };
  actors.push(actor);
  await assertActorLease(actor.id, "active");
  await rest("cms_profiles", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      user_id: actor.id,
      display_name: `${qaTag}-${label}`.slice(0, 120),
      display_email: email,
      status: "active",
    },
  });
  await rest("cms_user_roles", {
    method: "POST",
    prefer: "return=minimal",
    body: { user_id: actor.id, role_key: "super_admin" },
  });
  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw new Error("G12_STAGING_SYNTHETIC_SIGN_IN_FAILED");
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `G12 ${label}`,
  });
  if (enrolled.error || !enrolled.data?.totp?.secret)
    throw new Error("G12_STAGING_SYNTHETIC_MFA_ENROLL_FAILED");
  let lastFailure = false;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error) throw new Error("G12_STAGING_SYNTHETIC_MFA_CHALLENGE_FAILED");
    const clock = await authenticationClock();
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenge.data.id,
      code: totp(enrolled.data.totp.secret, clock),
    });
    const session = verified.data?.session;
    actor.token = session?.access_token ?? verified.data?.access_token ?? "";
    actor.refreshToken = session?.refresh_token ?? "";
    actor.factorId = enrolled.data.id;
    actor.totpSecret = enrolled.data.totp.secret;
    actor.lastTotpCounter = Math.floor(clock / 30_000);
    if (!verified.error && actor.token && actor.refreshToken) {
      await rest("cms_profiles", {
        method: "PATCH",
        query: `user_id=eq.${actor.id}`,
        prefer: "return=minimal",
        body: { mfa_enrolled_at: new Date().toISOString() },
      });
      return actor;
    }
    lastFailure = true;
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  if (lastFailure) throw new Error("G12_STAGING_SYNTHETIC_MFA_VERIFY_FAILED");
  return actor;
}

async function createFreshMfaSession(actor) {
  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({
    email: actor.email,
    password: actor.password,
  });
  if (signedIn.error || !signedIn.data.session) throw new Error("G12_STAGING_SYNTHETIC_FRESH_SIGN_IN_FAILED");
  let clock = await authenticationClock();
  const currentCounter = Math.floor(clock / 30_000);
  if (currentCounter <= actor.lastTotpCounter) {
    const waitMs = (actor.lastTotpCounter + 1) * 30_000 - clock + 750;
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, waitMs)));
    clock = await authenticationClock();
  }
  const challenge = await client.auth.mfa.challenge({ factorId: actor.factorId });
  if (challenge.error) throw new Error("G12_STAGING_SYNTHETIC_FRESH_MFA_CHALLENGE_FAILED");
  const verified = await client.auth.mfa.verify({
    factorId: actor.factorId,
    challengeId: challenge.data.id,
    code: totp(actor.totpSecret, clock),
  });
  const session = verified.data?.session;
  if (verified.error || !session?.access_token || !session.refresh_token)
    throw new Error("G12_STAGING_SYNTHETIC_FRESH_MFA_VERIFY_FAILED");
  actor.token = session.access_token;
  actor.refreshToken = session.refresh_token;
  actor.lastTotpCounter = Math.floor(clock / 30_000);
}

function envelope(expectedVersion) {
  return {
    schemaVersion: 1,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: "staging", siteKey: "main" },
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}

async function edgeCommand(
  actor,
  functionName,
  action,
  values = {},
  { allowed = [200], idempotent = false, expectedVersion } = {},
) {
  const commandEnvelope = envelope(expectedVersion);
  return request(`${context.url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: TARGET.origin,
      ...(idempotent ? { "X-Idempotency-Key": commandEnvelope.commandId } : {}),
    },
    body: { action, envelope: commandEnvelope, ...values },
    allowed,
  });
}

async function edgeRaw(actor, functionName, body, allowed = [200]) {
  return request(`${context.url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: TARGET.origin,
    },
    body,
    allowed,
  });
}

async function contentCommand(actor, action, values = {}, allowed = [200]) {
  return request(`${context.url}/functions/v1/cms-content`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: TARGET.origin,
      "X-Idempotency-Key": randomUUID(),
    },
    body: { action, ...values },
    allowed,
  });
}

async function preflightMigrations() {
  const result = await managementQuery(`select
    ${exactMigrationHistorySql(sourceMigrations)},
    exists(select 1 from storage.buckets where id = '${DOCUMENT_BUCKET}' and public = false) as private_bucket,
    to_regprocedure('public.cms_reserve_document_asset(uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean,text,text,timestamptz,uuid,text,uuid)') is not null as document_rpc,
    to_regprocedure('public.cms_claim_document_finalization(uuid,uuid,uuid,text,text,timestamptz,uuid)') is not null as document_finalization_claim,
    to_regprocedure('public.cms_public_document_download_target(uuid,text)') is not null as document_public_proxy,
    to_regprocedure('public.cms_review_document_security(uuid,uuid,text,text,text,text,text,text,text,text,text,timestamptz,uuid,text,uuid)') is not null as document_review_rpc,
    to_regprocedure('public.cms_document_qa_attestation_allowed(uuid,uuid,text)') is not null as document_qa_attestation_gate,
    to_regprocedure('public.cms_prepare_synthetic_document_neutralization(uuid,uuid,text,text,text,timestamptz,uuid)') is not null as document_neutralization_prepare,
    to_regprocedure('public.cms_confirm_synthetic_document_removal(uuid,uuid,text,text,text,text,timestamptz,uuid,text,uuid)') is not null as document_neutralization_confirm,
    to_regprocedure('public.cms_fixture_neutralize_synthetic_document(uuid,uuid,text,text,text,boolean,uuid)') is not null as document_fixture_neutralization,
    to_regprocedure('public.cms_execute_form_lifecycle_command(uuid,text,uuid,uuid,bigint,text,text,text,timestamptz,uuid,text,uuid)') is not null as form_rpc,
    to_regprocedure('public.rdo_apply_team_member_command(uuid,uuid,text,text,uuid,uuid)') is not null as rdo_rpc,
    to_regprocedure('public.cms_require_pim_active_skus_for_publication()') is not null as pim_guard,
    to_regclass('public.cms_pim_content_reconciliation_events') is not null as pim_reconciliation_events,
    obj_description(
      to_regprocedure('public.cms_execute_pim_command(uuid,text,jsonb,text,text,text,text,timestamptz,uuid,uuid,text,uuid)'),
      'pg_proc'
    ) = 'Read-only tombstone for legacy PIM mutations; use cms-content.' as pim_legacy_read_only,
    to_regclass('private.cms_qa_actor_leases') is not null as qa_actor_lease,
    to_regprocedure('public.cms_qa_actor_lease_status(uuid,text,text,text)') is not null as qa_actor_lease_status,
    to_regprocedure('public.cms_complete_qa_actor_lease(uuid,text,text,text)') is not null as qa_actor_lease_completion,
    to_regprocedure('private.cms_sweep_expired_qa_actor_leases(integer)') is not null as qa_actor_watchdog,
    to_regclass('private.cms_qa_rate_limit_proof_buckets') is not null as qa_rate_limit_proof_buckets,
    to_regprocedure('public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)') is not null as qa_rate_limit_proof_rpc,
    to_regprocedure('public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)') is not null
      as collaboration_assignee_directory,
    has_function_privilege(
      'service_role',
      'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
      'EXECUTE'
    )
      and not has_function_privilege(
        'authenticated',
        'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
        'EXECUTE'
      )
      and not has_function_privilege(
        'anon',
        'public.cms_list_collaboration_assignees(uuid,text,text,text,text,timestamptz,integer)',
        'EXECUTE'
      ) as collaboration_assignee_directory_privileges,
    ${serviceOnlyRpcContractSql("media_upload_abort_0082_rpcs", CMS_MEDIA_UPLOAD_ABORT_0082_RPCS)},
    ${ownerOnlyFunctionContractSql(
      "media_upload_abort_0082_helpers_locked",
      CMS_MEDIA_UPLOAD_ABORT_0082_OWNER_ONLY_HELPERS,
    )},
    ${serviceOnlyRpcContractSql(
      "session_refresh_revocation_0083_rpcs",
      CMS_SESSION_REFRESH_REVOCATION_0083_RPCS,
    )},
    ${mediaUploadAbortSchemaContractSql("media_upload_abort_0082_schema")},
    (
      select count(*) = 1
      from cron.job
      where jobname = 'cms-dam-stale-upload-watchdog-v1'
        and schedule = '*/15 * * * *'
        and command = 'select private.cms_watchdog_stale_dam_uploads(100);'
        and active
    ) as media_upload_watchdog_0082_exact,
    ${sessionRefreshRevocationSemanticSql("session_refresh_revocation_0083_semantics_exact")},
    ${ownerOnlyFunctionContractSql(
      "lead_origin_binding_0084_helpers_locked",
      CMS_LEAD_ORIGIN_BINDING_0084_OWNER_ONLY_HELPERS,
    )},
    ${leadOriginBindingSemanticSql("lead_origin_binding_0084_semantics_exact")},
    ${ownerOnlyFunctionContractSql(
      "public_relation_limit_0085_helpers_locked",
      CMS_PUBLIC_RELATION_LIMIT_0085_OWNER_ONLY_HELPERS,
    )},
    ${publicRelationLimitSemanticSql("public_relation_limit_0085_semantics_exact")},
    not exists (
      select 1
      from public.cms_published_projection projection
      where private.cms_public_relation_count_0085(projection.payload) > 500
    ) as public_relation_limit_0085_existing_rows_valid,
    ${ownerOnlyFunctionContractSql(
      "qa_actor_runtime_repairs_0086_functions_locked",
      CMS_QA_ACTOR_RUNTIME_REPAIRS_0086_OWNER_ONLY_FUNCTIONS,
    )},
    ${qaActorRuntimeRepairsSemanticSql("qa_actor_runtime_repairs_0086_semantics_exact")},
    ${serviceOnlyRpcContractSql(
      "runtime_integrity_repairs_0087_rpcs",
      CMS_RUNTIME_INTEGRITY_REPAIRS_0087_SERVICE_ONLY_RPCS,
    )},
    ${ownerOnlyFunctionContractSql(
      "runtime_integrity_repairs_0087_functions_locked",
      CMS_RUNTIME_INTEGRITY_REPAIRS_0087_OWNER_ONLY_FUNCTIONS,
    )},
    ${runtimeIntegrityRepairsSemanticSql("runtime_integrity_repairs_0087_semantics_exact")},
    ${serviceOnlyRpcContractSql(
      "runtime_integrity_followup_0088_rpcs",
      CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_SERVICE_ONLY_RPCS,
    )},
    ${ownerOnlyFunctionContractSql(
      "runtime_integrity_followup_0088_functions_locked",
      CMS_RUNTIME_INTEGRITY_FOLLOWUP_0088_OWNER_ONLY_FUNCTIONS,
    )},
    ${runtimeIntegrityFollowupSemanticSql("runtime_integrity_followup_0088_semantics_exact")},
    has_function_privilege('service_role', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE')
      and not has_function_privilege('authenticated', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE')
      and not has_function_privilege('anon', 'public.cms_qa_rate_limit_proof(uuid,text,text,text,text,text)', 'EXECUTE')
      as qa_rate_limit_proof_privileges,
    exists(
      select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = 'private.cms_qa_actor_leases'::regclass
        and t.tgname = 'cms_05_qa_rate_limit_proof_cleanup_0080'
        and not t.tgisinternal
    ) as qa_rate_limit_proof_cleanup,
    exists(
      select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = 'auth.users'::regclass
        and t.tgname in ('cms_capture_qa_actor_lease', 'cms_protect_active_qa_actor_marker')
        and not t.tgisinternal
      group by t.tgrelid
      having count(*) = 2
    ) as qa_actor_auth_triggers,
    to_regprocedure('public.cms_legacy_documents_promotion_ready()') is not null as legacy_promotion_gate,
    not exists (
      select 1
      from public.cms_document_assets asset
      where asset.source_kind = 'legacy_import'
        and not (
          (
            asset.processing_status = 'quarantined'
            and asset.scan_status = 'pending'
            and asset.scan_engine is null
            and asset.security_reviewed_by is null
            and asset.security_reviewed_at is null
            and asset.scanner_evidence_sha256 is null
            and asset.scanner_evidence_reference is null
            and asset.processed_at is null
          )
          or (
            asset.processing_status = 'ready'
            and asset.scan_status = 'clean'
            and asset.scan_engine in ('clamav-corporate-v1', 'microsoft-defender-corporate-v1')
            and asset.security_reviewed_by is not null
            and asset.security_reviewed_by is distinct from asset.created_by
            and exists (
              select 1
              from public.cms_document_security_reviews review
              where review.document_id = asset.id
                and review.document_sha256 = asset.sha256
                and review.reviewer_id = asset.security_reviewed_by
                and review.decision = 'approve'
                and review.scanner_engine = asset.scan_engine
                and review.scanner_verdict = 'clean'
                and review.evidence_sha256 = asset.scanner_evidence_sha256
                and review.evidence_reference = asset.scanner_evidence_reference
            )
          )
        )
    ) as legacy_documents_fail_closed,
    not exists (
      select 1
      from public.cms_document_assets asset
      where asset.source_kind = 'legacy_import'
        and not exists (
          select 1
          from public.cms_audit_log audit
          where audit.action = 'cms:documents.legacy_quarantined'
            and audit.target_type = 'document_asset'
            and audit.target_id = asset.id::text
            and audit.event_data ->> 'securityReviewRequired' = 'true'
        )
    ) as legacy_quarantine_audited,
    public.cms_legacy_documents_promotion_ready() as legacy_documents_reattested,
    (
      select count(*)::integer
      from public.cms_document_assets
      where source_kind = 'legacy_import'
    ) as legacy_document_count,
    exists(
      select 1 from cron.job
      where jobname = 'cms-qa-actor-lease-sweeper-every-1m'
        and schedule = '* * * * *'
        and command = 'select private.cms_sweep_expired_qa_actor_leases(25);'
        and active
    ) as qa_actor_watchdog_cron`);
  const row = Array.isArray(result) ? result[0] : null;
  check("candidate_migration_history_exact", row?.migration_history_exact === true);
  check("documents_private_bucket_present", row?.private_bucket === true);
  check("documents_rpc_present", row?.document_rpc === true);
  check("documents_finalization_claim_present", row?.document_finalization_claim === true);
  check("documents_public_proxy_present", row?.document_public_proxy === true);
  check("documents_security_review_rpc_present", row?.document_review_rpc === true);
  check("documents_qa_attestation_gate_present", row?.document_qa_attestation_gate === true);
  check("documents_neutralization_prepare_present", row?.document_neutralization_prepare === true);
  check("documents_neutralization_confirm_present", row?.document_neutralization_confirm === true);
  check("documents_fixture_neutralization_present", row?.document_fixture_neutralization === true);
  check("legacy_document_promotion_gate_present", row?.legacy_promotion_gate === true);
  check("legacy_documents_fail_closed", row?.legacy_documents_fail_closed === true);
  check("legacy_document_quarantine_audited", row?.legacy_quarantine_audited === true);
  check(
    "legacy_documents_reattested_for_promotion",
    row?.legacy_documents_reattested === true,
    `legacyDocumentCount=${Number(row?.legacy_document_count ?? 0)}`,
  );
  check("form_lifecycle_0058_present", row?.form_rpc === true);
  check("rdo_scope_rpc_present", row?.rdo_rpc === true);
  check("pim_publication_guard_present", row?.pim_guard === true);
  check("pim_reconciliation_events_0078_present", row?.pim_reconciliation_events === true);
  check("pim_legacy_mutations_0078_read_only", row?.pim_legacy_read_only === true);
  check("qa_actor_lease_0061_present", row?.qa_actor_lease === true);
  check("qa_actor_lease_status_0061_present", row?.qa_actor_lease_status === true);
  check("qa_actor_lease_completion_0061_present", row?.qa_actor_lease_completion === true);
  check("qa_actor_watchdog_0061_present", row?.qa_actor_watchdog === true);
  check("qa_rate_limit_proof_buckets_0080_present", row?.qa_rate_limit_proof_buckets === true);
  check("qa_rate_limit_proof_rpc_0080_present", row?.qa_rate_limit_proof_rpc === true);
  check("qa_rate_limit_proof_privileges_0080_exact", row?.qa_rate_limit_proof_privileges === true);
  check("qa_rate_limit_proof_cleanup_0080_present", row?.qa_rate_limit_proof_cleanup === true);
  check("collaboration_assignee_directory_0081_present", row?.collaboration_assignee_directory === true);
  check(
    "collaboration_assignee_directory_0081_privileges_exact",
    row?.collaboration_assignee_directory_privileges === true,
  );
  check("media_upload_abort_0082_rpcs_present", row?.media_upload_abort_0082_rpcs_present === true);
  check(
    "media_upload_abort_0082_rpcs_privileges_exact",
    row?.media_upload_abort_0082_rpcs_privileges_exact === true,
  );
  check("media_upload_abort_0082_helpers_locked", row?.media_upload_abort_0082_helpers_locked === true);
  check(
    "media_upload_abort_0082_schema_pixel_limit_exact",
    row?.media_upload_abort_0082_schema_pixel_limit_exact === true,
  );
  check(
    "media_upload_abort_0082_schema_upload_token_expiry_exact",
    row?.media_upload_abort_0082_schema_upload_token_expiry_exact === true,
  );
  check(
    "media_upload_abort_0082_schema_upload_token_column_exact",
    row?.media_upload_abort_0082_schema_upload_token_column_exact === true,
  );
  check("media_upload_watchdog_0082_exact", row?.media_upload_watchdog_0082_exact === true);
  check(
    "session_refresh_revocation_0083_rpcs_present",
    row?.session_refresh_revocation_0083_rpcs_present === true,
  );
  check(
    "session_refresh_revocation_0083_rpcs_privileges_exact",
    row?.session_refresh_revocation_0083_rpcs_privileges_exact === true,
  );
  check(
    "session_refresh_revocation_0083_semantics_exact",
    row?.session_refresh_revocation_0083_semantics_exact === true,
  );
  check("lead_origin_binding_0084_helpers_locked", row?.lead_origin_binding_0084_helpers_locked === true);
  check("lead_origin_binding_0084_semantics_exact", row?.lead_origin_binding_0084_semantics_exact === true);
  check("public_relation_limit_0085_helpers_locked", row?.public_relation_limit_0085_helpers_locked === true);
  check(
    "public_relation_limit_0085_semantics_exact",
    row?.public_relation_limit_0085_semantics_exact === true,
  );
  check(
    "public_relation_limit_0085_existing_rows_valid",
    row?.public_relation_limit_0085_existing_rows_valid === true,
  );
  check(
    "qa_actor_runtime_repairs_0086_functions_locked",
    row?.qa_actor_runtime_repairs_0086_functions_locked === true,
  );
  check(
    "qa_actor_runtime_repairs_0086_semantics_exact",
    row?.qa_actor_runtime_repairs_0086_semantics_exact === true,
  );
  check(
    "runtime_integrity_repairs_0087_rpcs_present",
    row?.runtime_integrity_repairs_0087_rpcs_present === true,
  );
  check(
    "runtime_integrity_repairs_0087_rpcs_privileges_exact",
    row?.runtime_integrity_repairs_0087_rpcs_privileges_exact === true,
  );
  check(
    "runtime_integrity_repairs_0087_functions_locked",
    row?.runtime_integrity_repairs_0087_functions_locked === true,
  );
  check(
    "runtime_integrity_repairs_0087_semantics_exact",
    row?.runtime_integrity_repairs_0087_semantics_exact === true,
  );
  check(
    "runtime_integrity_followup_0088_rpcs_present",
    row?.runtime_integrity_followup_0088_rpcs_present === true,
  );
  check(
    "runtime_integrity_followup_0088_rpcs_privileges_exact",
    row?.runtime_integrity_followup_0088_rpcs_privileges_exact === true,
  );
  check(
    "runtime_integrity_followup_0088_functions_locked",
    row?.runtime_integrity_followup_0088_functions_locked === true,
  );
  check(
    "runtime_integrity_followup_0088_semantics_exact",
    row?.runtime_integrity_followup_0088_semantics_exact === true,
  );
  check("qa_actor_auth_triggers_0061_present", row?.qa_actor_auth_triggers === true);
  check("qa_actor_watchdog_cron_0061_active", row?.qa_actor_watchdog_cron === true);
}

async function exerciseCollaborationAssigneeDirectory() {
  const now = await authenticationClock();
  const override = await rest("cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.collaboration_bulk",
      environment: "staging",
      scope_type: "user",
      scope_key: operator.id,
      enabled: true,
      reason: qaTag,
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + QA_ACTOR_LEASE_TTL_MINUTES * 60_000).toISOString(),
      created_by: operator.id,
    },
  });
  check("collaboration_assignee_directory_0081_override_created", Boolean(override.json?.[0]?.id));

  const anonymous = await request(`${context.url}/functions/v1/cms-collaboration`, {
    method: "POST",
    headers: { apikey: context.anonKey, Origin: TARGET.origin },
    body: { action: "assignees", envelope: envelope() },
    allowed: [401],
  });
  check("collaboration_assignee_directory_0081_anonymous_denied", anonymous.status === 401);

  const response = await edgeCommand(operator, "cms-collaboration", "assignees");
  const items = Array.isArray(response.json?.items) ? response.json.items : [];
  const visibleIds = items.map((item) => item?.userId).sort();
  const expectedIds = [operator.id, dualScopeActor.id].sort();
  check(
    "collaboration_assignee_directory_0081_same_run_only",
    response.json?.schemaVersion === 1 &&
      JSON.stringify(visibleIds) === JSON.stringify(expectedIds) &&
      items.every(
        (item) =>
          typeof item?.displayName === "string" &&
          item.displayName.startsWith(qaTag) &&
          Object.keys(item).sort().join(",") === "displayName,userId",
      ),
  );

  const mismatchedScope = await edgeRaw(
    operator,
    "cms-collaboration",
    {
      action: "assignees",
      envelope: {
        ...envelope(),
        actorContext: { environment: "local", siteKey: "main" },
      },
    },
    [403],
  );
  check(
    "collaboration_assignee_directory_0081_environment_forgery_denied",
    mismatchedScope.status === 403 && mismatchedScope.json?.code === "CMS_COLLABORATION_SCOPE_MISMATCH",
  );

  await rest("cms_user_roles", {
    method: "DELETE",
    query: `user_id=eq.${operator.id}&role_key=eq.super_admin`,
  });
  try {
    const unprivileged = await edgeCommand(
      operator,
      "cms-collaboration",
      "assignees",
      {},
      { allowed: [403] },
    );
    check("collaboration_assignee_directory_0081_unprivileged_denied", unprivileged.status === 403);
  } finally {
    await rest("cms_user_roles", {
      method: "POST",
      prefer: "return=minimal",
      body: { user_id: operator.id, role_key: "super_admin" },
    });
  }
}

async function exerciseSessionRefreshRevocation() {
  const malformed = await edgeRaw(
    operator,
    "cms-users",
    {
      action: "revoke_sessions",
      userId: dualScopeActor.id,
      idempotencyKey: "payload-invalido",
    },
    [400],
  );
  check("session_refresh_revocation_0083_invalid_payload_denied", malformed.status === 400);
  const invalidAction = await edgeRaw(
    operator,
    "cms-users",
    {
      action: "invalid_session_action",
      userId: dualScopeActor.id,
      idempotencyKey: randomUUID(),
    },
    [400],
  );
  check("session_refresh_revocation_0083_invalid_action_denied", invalidAction.status === 400);

  await rest("cms_user_roles", {
    method: "DELETE",
    query: `user_id=eq.${dualScopeActor.id}&role_key=eq.super_admin`,
  });
  try {
    const unprivileged = await edgeRaw(
      dualScopeActor,
      "cms-users",
      {
        action: "revoke_sessions",
        userId: operator.id,
        idempotencyKey: randomUUID(),
      },
      [403],
    );
    check("session_refresh_revocation_0083_unprivileged_actor_denied", unprivileged.status === 403);
  } finally {
    await rest("cms_user_roles", {
      method: "POST",
      prefer: "return=minimal",
      body: { user_id: dualScopeActor.id, role_key: "super_admin" },
    });
  }

  const initial = await edgeRaw(dualScopeActor, "cms-session", { action: "resolve" });
  check(
    "session_refresh_revocation_0083_initial_session_allowed",
    initial.status === 200 && initial.json?.accessGranted === true,
  );
  const revokeIdempotencyKey = randomUUID();
  const started = performance.now();
  const revoked = await edgeRaw(operator, "cms-users", {
    action: "revoke_sessions",
    userId: dualScopeActor.id,
    idempotencyKey: revokeIdempotencyKey,
  });
  check("session_refresh_revocation_0083_command_applied", revoked.json?.status === "sessions_revoked");

  const refreshClient = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const refreshed = await refreshClient.auth.refreshSession({
    refresh_token: dualScopeActor.refreshToken,
  });
  if (refreshed.error || !refreshed.data.session?.access_token)
    throw new Error("G12_STAGING_REVOKED_AUTH_REFRESH_FAILED");
  dualScopeActor.token = refreshed.data.session.access_token;
  dualScopeActor.refreshToken = refreshed.data.session.refresh_token;
  const refreshedDenied = await edgeRaw(dualScopeActor, "cms-session", { action: "resolve" }, [403]);
  sessionRevocationLatencyMs = Math.round(performance.now() - started);
  check(
    "session_refresh_revocation_0083_refreshed_jwt_denied",
    refreshedDenied.status === 403 && sessionRevocationLatencyMs < 10_000,
  );
  const identity = await request(`${context.url}/auth/v1/admin/users/${dualScopeActor.id}`, {
    headers: context.serviceHeaders,
  });
  const bannedUntil = Date.parse(identity.json?.banned_until ?? "");
  check(
    "session_refresh_revocation_0083_auth_identity_not_banned",
    !Number.isFinite(bannedUntil) || bannedUntil <= Date.now(),
  );

  await createFreshMfaSession(dualScopeActor);
  const freshAllowed = await edgeRaw(dualScopeActor, "cms-session", { action: "resolve" });
  check(
    "session_refresh_revocation_0083_new_session_allowed",
    freshAllowed.status === 200 && freshAllowed.json?.accessGranted === true,
  );
  const replay = await edgeRaw(operator, "cms-users", {
    action: "revoke_sessions",
    userId: dualScopeActor.id,
    idempotencyKey: revokeIdempotencyKey,
  });
  check("session_refresh_revocation_0083_replay_is_duplicate", replay.json?.duplicate === true);
  const freshAfterReplay = await edgeRaw(dualScopeActor, "cms-session", { action: "resolve" });
  check(
    "session_refresh_revocation_0083_replay_does_not_widen",
    freshAfterReplay.status === 200 && freshAfterReplay.json?.accessGranted === true,
  );
}

async function exerciseMediaUploadAbort() {
  const anonymous = await request(`${context.url}/functions/v1/cms-media`, {
    method: "POST",
    headers: { apikey: context.anonKey, Origin: TARGET.origin },
    body: {
      action: "abort_upload",
      envelope: envelope(),
      assetId: randomUUID(),
      reasonCode: "client_upload_failed",
    },
    allowed: [401],
  });
  check("media_upload_abort_0082_anonymous_denied", anonymous.status === 401);
  const malformed = await edgeRaw(
    operator,
    "cms-media",
    {
      action: "abort_upload",
      envelope: envelope(),
      assetId: "uuid-invalido",
      reasonCode: "client_upload_failed",
    },
    [400],
  );
  check("media_upload_abort_0082_invalid_payload_denied", malformed.status === 400);

  await rest("cms_user_roles", {
    method: "DELETE",
    query: `user_id=eq.${dualScopeActor.id}&role_key=eq.super_admin`,
  });
  try {
    const unprivileged = await edgeRaw(
      dualScopeActor,
      "cms-media",
      {
        action: "abort_upload",
        envelope: envelope(),
        assetId: randomUUID(),
        reasonCode: "client_upload_failed",
      },
      [403],
    );
    check("media_upload_abort_0082_unprivileged_actor_denied", unprivileged.status === 403);
  } finally {
    await rest("cms_user_roles", {
      method: "POST",
      prefer: "return=minimal",
      body: { user_id: dualScopeActor.id, role_key: "super_admin" },
    });
  }

  const now = await authenticationClock();
  const damOverride = await rest("cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.dam",
      environment: "staging",
      scope_type: "user",
      scope_key: operator.id,
      enabled: true,
      reason: qaTag,
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + QA_ACTOR_LEASE_TTL_MINUTES * 60_000).toISOString(),
      created_by: operator.id,
    },
  });
  check("media_upload_abort_0082_override_created", Boolean(damOverride.json?.[0]?.id));

  const reserved = await edgeCommand(
    operator,
    "cms-media",
    "reserve_upload",
    {
      metadata: {
        originalFilename: `${qaTag}-parcial.png`,
        declaredMime: "image/png",
        sourceKind: "synthetic_test",
        sourceReference: qaTag,
        rightsConfirmed: true,
        rightsExpiresAt: null,
        licenseName: "Uso sintético de homologação",
        ownerName: "GAIATEC QA",
        altText: "Imagem sintética parcial para validar compensação",
        caption: null,
        credit: null,
        focalX: 0.5,
        focalY: 0.5,
      },
    },
    { allowed: [201], idempotent: true },
  );
  if (!/^[0-9a-f-]{36}$/i.test(reserved.json?.assetId ?? ""))
    throw new Error("G12_STAGING_MEDIA_RESERVATION_INVALID");
  mediaFixture = { id: reserved.json.assetId, archived: false };
  check(
    "media_upload_abort_0082_reservation_created",
    reserved.json?.status === "awaiting_upload" && reserved.json?.uploads?.length === 7,
  );

  const idor = await edgeCommand(
    dualScopeActor,
    "cms-media",
    "abort_upload",
    { assetId: mediaFixture.id, reasonCode: "client_upload_failed" },
    { allowed: [404], idempotent: true },
  );
  check("media_upload_abort_0082_idor_denied", idor.status === 404);

  const aborted = await edgeCommand(
    operator,
    "cms-media",
    "abort_upload",
    { assetId: mediaFixture.id, reasonCode: "client_upload_failed" },
    { idempotent: true },
  );
  mediaFixture.archived = aborted.json?.archived === true;
  check(
    "media_upload_abort_0082_compensated",
    aborted.json?.status === "failed" &&
      aborted.json?.archived === true &&
      aborted.json?.gcScheduled === true,
  );
  const [assetState, gcState] = await Promise.all([
    rest("cms_media_assets", {
      query: `id=eq.${mediaFixture.id}&select=storage_path,processing_status,scan_status,archived_at,upload_token_expires_at`,
    }),
    rest("cms_dam_gc_jobs", {
      query: `asset_id=eq.${mediaFixture.id}&status=in.(pending,processing,blocked,failed)&select=status,execute_after,asset_snapshot`,
    }),
  ]);
  const asset = assetState.json?.[0];
  const job = gcState.json?.[0];
  const expectedPaths = [
    `cms/${mediaFixture.id}/original.png`,
    `cms/${mediaFixture.id}/thumbnail.webp`,
    `cms/${mediaFixture.id}/thumbnail.avif`,
    `cms/${mediaFixture.id}/medium.webp`,
    `cms/${mediaFixture.id}/medium.avif`,
    `cms/${mediaFixture.id}/large.webp`,
    `cms/${mediaFixture.id}/large.avif`,
  ];
  check(
    "media_upload_abort_0082_authoritative_state_closed",
    asset?.processing_status === "failed" &&
      asset?.scan_status === "failed" &&
      typeof asset?.archived_at === "string",
  );
  check(
    "media_upload_abort_0082_gc_manifest_server_derived",
    job?.asset_snapshot?.disposition === "incomplete_upload" &&
      JSON.stringify(job?.asset_snapshot?.paths) === JSON.stringify(expectedPaths) &&
      Date.parse(job?.execute_after ?? "") >= Date.parse(asset?.upload_token_expires_at ?? ""),
  );
}

async function exerciseDocuments() {
  const anonymous = await request(`${context.url}/functions/v1/cms-documents`, {
    method: "POST",
    headers: { apikey: context.anonKey, Origin: TARGET.origin },
    body: {
      action: "list",
      envelope: envelope(),
      query: qaTag,
      page: 1,
      pageSize: 1,
      includeArchived: false,
    },
    allowed: [401],
  });
  check("documents_anonymous_edge_denied", anonymous.status === 401);

  const reserved = await edgeCommand(
    operator,
    "cms-documents",
    "reserve_upload",
    {
      metadata: {
        originalFilename: "qa-cms-final.pdf",
        declaredMime: "application/pdf",
        kind: "manual",
        title: qaTag,
        revision: "QA-1",
        language: "pt-BR",
        visibility: "private",
        sourceKind: "synthetic_test",
        sourceReference: qaTag,
        licenseName: "Uso sintético de homologação",
        ownerName: "GAIATEC QA",
        rightsConfirmed: true,
      },
    },
    { allowed: [201], idempotent: true },
  );
  if (
    !/^[0-9a-f-]{36}$/i.test(reserved.json?.documentId ?? "") ||
    typeof reserved.json?.storagePath !== "string" ||
    typeof reserved.json?.signedUrl !== "string"
  )
    throw new Error("G12_STAGING_DOCUMENT_RESERVATION_INVALID");
  documentFixture = {
    id: reserved.json.documentId,
    storagePath: reserved.json.storagePath,
    lockVersion: 1,
    archived: false,
  };
  check("documents_upload_reserved", reserved.status === 201);

  const pdf = Buffer.from(
    `%PDF-1.4\n% ${qaTag}\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<<>>\n%%EOF\n`,
    "latin1",
  );
  const upload = await fetch(reserved.json.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: pdf,
    signal: AbortSignal.timeout(30_000),
  });
  if (!upload.ok) throw new Error(`G12_STAGING_DOCUMENT_UPLOAD_FAILED:${upload.status}`);
  check("documents_private_pdf_uploaded", upload.ok);

  const finalized = await edgeCommand(
    operator,
    "cms-documents",
    "finalize_upload",
    { documentId: documentFixture.id },
    { idempotent: true },
  );
  check(
    "documents_pdf_quarantined_after_prefilter",
    finalized.json?.status === "quarantined" && finalized.json?.document?.visibility === "private",
  );
  const retiredTokenReplay = await fetch(reserved.json.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf" },
    body: Buffer.from("%PDF-1.4\n% replay bloqueado\n%%EOF\n", "latin1"),
    signal: AbortSignal.timeout(30_000),
  });
  check(
    "documents_retired_signed_upload_cannot_overwrite_guard",
    !retiredTokenReplay.ok,
    `status=${retiredTokenReplay.status}`,
  );
  const uploaderSelfApproval = await edgeCommand(
    operator,
    "cms-documents",
    "review_security",
    {
      documentId: documentFixture.id,
      expectedSha256: finalized.json?.document?.sha256,
      decision: "approve",
      scannerEngine: "qa-synthetic-attestation-v1",
      scannerVerdict: "clean",
      evidenceSha256: createHash("sha256").update(`${qaTag}:self-review`).digest("hex"),
      evidenceReference: `${qaTag}-SELF`,
    },
    { allowed: [409], idempotent: true },
  );
  check(
    "documents_uploader_self_approval_denied",
    uploaderSelfApproval.status === 409 &&
      uploaderSelfApproval.json?.code === "CMS_DOCUMENT_REVIEW_SEGREGATION_REQUIRED",
  );
  const reviewDownload = await edgeCommand(
    dualScopeActor,
    "cms-documents",
    "review_download",
    { documentId: documentFixture.id },
    { idempotent: true },
  );
  check(
    "documents_review_download_is_attachment",
    reviewDownload.json?.disposition === "attachment" &&
      reviewDownload.json?.expectedSha256 === finalized.json?.document?.sha256,
  );
  const reviewed = await edgeCommand(
    dualScopeActor,
    "cms-documents",
    "review_security",
    {
      documentId: documentFixture.id,
      expectedSha256: finalized.json?.document?.sha256,
      decision: "approve",
      scannerEngine: "qa-synthetic-attestation-v1",
      scannerVerdict: "clean",
      evidenceSha256: createHash("sha256").update(`${qaTag}:security-review`).digest("hex"),
      evidenceReference: `${qaTag}-SCAN`,
    },
    { idempotent: true },
  );
  documentFixture.lockVersion = reviewed.json?.lockVersion;
  check(
    "documents_second_actor_hash_attestation_releases",
    reviewed.json?.status === "ready" && reviewed.json?.scanStatus === "clean",
  );
  const anonymousStorage = await request(
    `${context.url}/storage/v1/object/${DOCUMENT_BUCKET}/${documentFixture.storagePath}`,
    { headers: { apikey: context.anonKey }, allowed: [400, 401, 403, 404] },
  );
  check("documents_anonymous_storage_denied", anonymousStorage.status !== 200);

  const archived = await edgeCommand(
    operator,
    "cms-documents",
    "archive_document",
    { documentId: documentFixture.id, expectedLockVersion: documentFixture.lockVersion },
    { idempotent: true },
  );
  documentFixture.lockVersion = archived.json?.lockVersion;
  documentFixture.archived = true;
  check("documents_archived", archived.json?.status === "archived" && archived.json?.archived === true);
  const restored = await edgeCommand(
    operator,
    "cms-documents",
    "restore_document",
    { documentId: documentFixture.id, expectedLockVersion: documentFixture.lockVersion },
    { idempotent: true },
  );
  documentFixture.lockVersion = restored.json?.lockVersion;
  documentFixture.archived = false;
  check("documents_restored", restored.json?.status === "ready" && restored.json?.archived === false);
  const finalArchive = await edgeCommand(
    operator,
    "cms-documents",
    "archive_document",
    { documentId: documentFixture.id, expectedLockVersion: documentFixture.lockVersion },
    { idempotent: true },
  );
  documentFixture.lockVersion = finalArchive.json?.lockVersion;
  documentFixture.archived = true;
  check("documents_fixture_closed", finalArchive.json?.status === "archived");
}

function projectionPayload({
  modelId,
  variantId,
  modelSku,
  variantSku,
  controlledClassification,
  attributeDefinition,
}) {
  return {
    schemaVersion: 1,
    consumerId: "cms.catalog-product.v1",
    contentType: "product",
    pilotState: "synthetic_test",
    title: qaTag,
    summary: "Produto sintético do canário de migrations.",
    fieldVisibility: {
      brand: "public",
      manufacturer: "internal",
      productLine: "public",
      commercialModel: "public",
      manufacturerReference: "internal",
      sku: "internal",
      classification: "public",
      function: "public",
      technology: "public",
      specifications: "public",
      relations: "public",
      documents: "public",
    },
    brand: { name: "GAIATEC QA", slug: "gaiatec-qa" },
    manufacturer: { name: "GAIATEC QA", slug: "gaiatec-qa" },
    productLine: { name: "Linha QA", slug: "linha-qa" },
    classification: { segment: "QA", category: "QA", family: "QA" },
    controlledClassification,
    commercial: {
      shortDescription: "Produto exclusivamente sintético.",
      valueProposition: "Validação automatizada.",
      benefits: ["Canário controlado"],
      differentiators: [],
    },
    function: "Validar integridade da publicação PIM",
    technology: "Sintética",
    models: [
      {
        id: modelId,
        model: "Modelo QA",
        manufacturerReference: "REF-QA",
        sku: modelSku,
        status: "active",
        variants: [
          {
            id: variantId,
            name: "Variante QA",
            code: "VAR-QA",
            sku: variantSku,
            order: 0,
          },
        ],
      },
    ],
    specifications: [
      {
        id: randomUUID(),
        definitionId: attributeDefinition.id,
        key: attributeDefinition.attributeKey,
        label: attributeDefinition.label,
        type: "boolean",
        value: true,
        required: true,
        filterable: false,
        comparable: true,
        searchable: false,
        scope: "product",
        sourceType: "manual",
        confidence: 1,
        homologated: true,
      },
    ],
    media: [],
    documents: [],
    relations: { productIds: [], applicationIds: [], sectorIds: [], serviceIds: [] },
    search: { synonyms: [], keywords: [qaTag.toLowerCase()] },
    redirects: [],
    blocks: [],
    seo: {
      title: "Produto sintético QA",
      description: "Produto temporário para validar a integridade PIM em staging.",
      canonicalPath: `/produtos/${contentFixture.slug}`,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        sourcePath: `synthetic/${qaTag}`,
        rightsConfirmed: true,
        commercialOwner: "GAIATEC QA",
        technicalOwner: "GAIATEC QA",
        verifiedAt: new Date().toISOString(),
      },
    ],
    approval: {
      portfolioOwner: "GAIATEC QA",
      technicalReviewer: "GAIATEC QA",
      commercialReviewer: "GAIATEC QA",
      editorialReviewer: "GAIATEC QA",
    },
  };
}

async function createPimPublicationCatalog() {
  const vocabulary = await edgeRaw(operator, "cms-controlled-vocabularies", {
    action: "list",
    entityType: "product",
    includeInactive: false,
  });
  const lists = Array.isArray(vocabulary.json?.items) ? vocabulary.json.items : [];
  const listByKey = new Map(lists.map((list) => [list.list_key, list]));
  check(
    "pim_fixed_corporate_vocabulary_containers_visible",
    PRODUCT_CONTROLLED_DIMENSIONS.every((dimension) => {
      const list = listByKey.get(dimension.listKey);
      return typeof list?.id === "string" && list.active === true && list.public_visible === true;
    }),
  );

  const controlledClassification = {};
  const masterIds = {};
  const slugPrefix = qaTag.toLowerCase();
  for (const dimension of PRODUCT_CONTROLLED_DIMENSIONS) {
    const list = listByKey.get(dimension.listKey);
    const label = `${qaTag} ${dimension.suffix}`;
    const slug = `${slugPrefix}-${dimension.suffix}`;
    const option = await edgeRaw(operator, "cms-controlled-vocabularies", {
      action: "upsert_option",
      option: {
        listId: list.id,
        slug,
        label,
        description: `Termo sintético e temporário ${qaTag}`,
        publicVisible: false,
        active: true,
        sortOrder: 9999,
      },
    });
    if (!/^[0-9a-f-]{36}$/i.test(option.json?.optionId ?? ""))
      throw new Error("G12_STAGING_PIM_CONTROLLED_OPTION_FAILED");
    controlledClassification[dimension.field] = {
      id: option.json.optionId,
      slug,
      label,
      publicVisible: false,
    };

    const master = await edgeCommand(
      operator,
      "cms-master-data",
      "create_entity",
      {
        entityType: dimension.masterType,
        name: label,
        description: `Entidade sintética e temporária ${qaTag}`,
        sourceType: "manual",
        sourceRef: qaTag,
      },
      { idempotent: true },
    );
    if (!/^[0-9a-f-]{36}$/i.test(master.json?.entityId ?? ""))
      throw new Error("G12_STAGING_PIM_MASTER_ENTITY_FAILED");
    masterIds[dimension.field] = master.json.entityId;
  }

  const attributeDefinition = {
    id: randomUUID(),
    attributeKey: `qa-check-${expectedSha.slice(0, 8)}`,
    label: `${qaTag} validacao tecnica`,
  };
  const attributeSetId = randomUUID();
  const attributeSetVersionId = randomUUID();
  await managementQuery(`begin;
    select set_config('cms.qa_mutation_actor_id', '${operator.id}', true);
    insert into public.cms_pim_attribute_definitions (
      id, site_key, attribute_key, label, description, data_type,
      canonical_unit_code, enum_options, filterable, comparable, searchable,
      status, created_by, updated_by
    ) values (
      '${attributeDefinition.id}'::uuid, 'main', '${attributeDefinition.attributeKey}',
      '${attributeDefinition.label}', 'Definicao sintetica ${qaTag}', 'boolean',
      null, '[]'::jsonb, false, true, false, 'active',
      '${operator.id}'::uuid, '${operator.id}'::uuid
    );
    insert into public.cms_pim_attribute_sets (
      id, site_key, category_id, name, status, created_by, updated_by
    ) values (
      '${attributeSetId}'::uuid, 'main', '${masterIds.productCategory}'::uuid,
      '${qaTag} conjunto tecnico', 'active', '${operator.id}'::uuid, '${operator.id}'::uuid
    );
    insert into public.cms_pim_attribute_set_versions (
      id, attribute_set_id, version, status, effective_from, created_by
    ) values (
      '${attributeSetVersionId}'::uuid, '${attributeSetId}'::uuid, 1, 'active',
      statement_timestamp(), '${operator.id}'::uuid
    );
    insert into public.cms_pim_attribute_set_definitions (
      attribute_set_version_id, definition_id, required, inherited, position
    ) values (
      '${attributeSetVersionId}'::uuid, '${attributeDefinition.id}'::uuid, true, true, 0
    );
    commit;
    select true as configured;`);

  const catalog = await edgeCommand(operator, "cms-attributes", "list_catalog", {
    categoryId: controlledClassification.productCategory.id,
  });
  check(
    "pim_controlled_category_resolves_same_run_attribute_catalog",
    catalog.json?.controlledCategory?.id === controlledClassification.productCategory.id &&
      catalog.json?.masterCategory?.id === masterIds.productCategory &&
      catalog.json?.attributeSet?.id === attributeSetId &&
      catalog.json?.definitions?.some(
        (definition) =>
          definition.id === attributeDefinition.id &&
          definition.attributeKey === attributeDefinition.attributeKey &&
          definition.dataType === "boolean" &&
          definition.required === true,
      ),
  );

  return { controlledClassification, attributeDefinition };
}

async function exercisePimPublication() {
  const now = await authenticationClock();
  const override = await rest("cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.pim_v2",
      environment: "staging",
      scope_type: "user",
      scope_key: operator.id,
      enabled: true,
      reason: qaTag,
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + QA_ACTOR_LEASE_TTL_MINUTES * 60_000).toISOString(),
      created_by: operator.id,
    },
  });
  overrideId = override.json?.[0]?.id;
  if (!overrideId) throw new Error("G12_STAGING_PIM_OVERRIDE_FAILED");
  const masterOverride = await rest("cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.master_data",
      environment: "staging",
      scope_type: "user",
      scope_key: operator.id,
      enabled: true,
      reason: qaTag,
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + QA_ACTOR_LEASE_TTL_MINUTES * 60_000).toISOString(),
      created_by: operator.id,
    },
  });
  if (!masterOverride.json?.[0]?.id) throw new Error("G12_STAGING_MASTER_OVERRIDE_FAILED");

  contentFixture = {
    slug: `qa-cms-final-${expectedSha.slice(0, 8)}-${randomUUID().slice(0, 8)}`,
    itemId: null,
    revisionId: null,
    archived: false,
  };
  const modelId = randomUUID();
  const variantId = randomUUID();
  const legacyProductId = randomUUID();
  const legacyModelId = randomUUID();
  const legacyVariantId = randomUUID();
  const legacyProduct = {
    id: legacyProductId,
    name: qaTag,
    slug: contentFixture.slug,
    summary: "Fixture sintética",
    valueProposition: "Validação automatizada",
    status: "active",
    sourceType: "manual",
    sourceRef: qaTag,
    masterData: {
      manufacturerId: randomUUID(),
      categoryId: randomUUID(),
      monitoredElementIds: [randomUUID()],
    },
    models: [
      {
        id: legacyModelId,
        name: "Modelo legado bloqueado",
        mpn: "LEGACY-BLOCKED",
        status: "active",
        primary: true,
        position: 0,
        variants: [],
      },
    ],
    attributes: [],
    externalIdentifiers: [],
    provenance: [
      {
        id: randomUUID(),
        sourceKind: "owner_authored",
        sourceRef: qaTag,
        confidence: 1,
        rightsConfirmed: true,
      },
    ],
  };
  const blockedSave = await edgeCommand(
    operator,
    "cms-pim",
    "save_product",
    {
      mode: "create",
      product: legacyProduct,
      reason: `Criação sintética ${qaTag}`,
    },
    { allowed: [409], idempotent: true },
  );
  check(
    "pim_legacy_save_authoritatively_blocked",
    blockedSave.json?.code === "CMS_PIM_LEGACY_READ_ONLY" &&
      blockedSave.json?.canonicalWriter === "cms-content" &&
      blockedSave.json?.preserved === true,
  );
  const blockedSku = await edgeCommand(
    operator,
    "cms-pim",
    "generate_sku",
    {
      productId: legacyProductId,
      modelId: legacyModelId,
      variantId: legacyVariantId,
      reason: `SKU legado bloqueado ${qaTag}`,
    },
    { allowed: [409], idempotent: true },
  );
  check(
    "pim_legacy_sku_generation_authoritatively_blocked",
    blockedSku.json?.code === "CMS_PIM_LEGACY_READ_ONLY",
  );
  const blockedArchive = await edgeCommand(
    operator,
    "cms-pim",
    "archive_product",
    { productId: legacyProductId, reason: `Arquivo legado bloqueado ${qaTag}` },
    { allowed: [409], idempotent: true, expectedVersion: 1 },
  );
  check(
    "pim_legacy_archive_authoritatively_blocked",
    blockedArchive.json?.code === "CMS_PIM_LEGACY_READ_ONLY",
  );

  const catalog = await createPimPublicationCatalog();
  const initialPayload = projectionPayload({
    modelId,
    variantId,
    modelSku: `GAI-QA-M-${expectedSha.slice(0, 8).toUpperCase()}`,
    variantSku: `GAI-QA-V-${expectedSha.slice(0, 8).toUpperCase()}`,
    controlledClassification: catalog.controlledClassification,
    attributeDefinition: catalog.attributeDefinition,
  });
  const created = await contentCommand(operator, "create", {
    contentType: "product",
    slug: contentFixture.slug,
    payload: initialPayload,
    reason: `Produto canônico sintético ${qaTag}`,
  });
  contentFixture.itemId = created.json?.itemId;
  let lockVersion = created.json?.lockVersion;
  check(
    "canonical_product_created_through_cms_content",
    typeof contentFixture.itemId === "string" && lockVersion === 1,
  );
  const revisedPayload = {
    ...initialPayload,
    summary: "Produto canônico sintético revisado e persistido pelo cms-content.",
  };
  const saved = await contentCommand(operator, "save", {
    itemId: contentFixture.itemId,
    slug: contentFixture.slug,
    payload: revisedPayload,
    expectedLockVersion: lockVersion,
    reason: `Revisão canônica ${qaTag}`,
  });
  lockVersion = saved.json?.lockVersion;
  check("canonical_product_saved_through_cms_content", lockVersion === 2);
  const submitted = await contentCommand(operator, "submit", {
    itemId: contentFixture.itemId,
    expectedLockVersion: lockVersion,
    reason: `Submissão canônica ${qaTag}`,
  });
  contentFixture.revisionId = submitted.json?.revisionId;
  check(
    "canonical_product_submitted_through_cms_content",
    submitted.json?.status === "in_review" && typeof contentFixture.revisionId === "string",
  );
  const approved = await contentCommand(operator, "approve", {
    itemId: contentFixture.itemId,
    revisionId: contentFixture.revisionId,
    reason: `Aprovação canônica ${qaTag}`,
  });
  check("canonical_product_approved_through_cms_content", approved.json?.status === "approved");
  const published = await contentCommand(operator, "publish", {
    itemId: contentFixture.itemId,
    revisionId: contentFixture.revisionId,
    reason: `Publicação canônica ${qaTag}`,
  });
  projectionCreated = published.json?.status === "published";
  check("canonical_product_published_through_cms_content", projectionCreated);
  const projection = await rest("cms_published_projection", {
    query: `item_id=eq.${contentFixture.itemId}&select=payload,content_version`,
  });
  check(
    "canonical_product_projection_persisted",
    projection.json?.[0]?.payload?.summary === revisedPayload.summary &&
      projection.json?.[0]?.payload?.models?.[0]?.sku === initialPayload.models[0].sku &&
      projection.json?.[0]?.content_version === 1,
  );
  const archived = await contentCommand(operator, "archive", {
    itemId: contentFixture.itemId,
    reason: `Arquivamento canônico ${qaTag}`,
  });
  contentFixture.archived = archived.json?.status === "archived";
  projectionCreated = false;
  check("canonical_product_archived_through_cms_content", contentFixture.archived);
}

async function proveLastAdminProtection() {
  if (!/^[0-9a-f-]{36}$/i.test(operator.id)) throw new Error("G12_STAGING_RDO_OPERATOR_INVALID");
  await managementQuery(`begin;
    update public.rdo_user_access set active = false where user_id <> '${operator.id}'::uuid;
    do $qa$
    declare v_message text;
    begin
      begin
        perform public.rdo_apply_team_member_command(
          '${operator.id}'::uuid, '${operator.id}'::uuid, 'suspend', null,
          gen_random_uuid(), gen_random_uuid()
        );
        raise exception 'QA_LAST_ADMIN_GUARD_MISSING';
      exception when insufficient_privilege then
        get stacked diagnostics v_message = message_text;
        if v_message <> 'RDO_TEAM_LAST_ADMIN_PROTECTED' then raise; end if;
      end;
      if not exists (
        select 1 from public.rdo_user_access
        where user_id = '${operator.id}'::uuid and active and role = 'rdo_admin'
      ) then raise exception 'QA_LAST_ADMIN_STATE_CHANGED'; end if;
    end $qa$;
    rollback;
    select true as protected;`);
  check("rdo_last_admin_protected", true);
}

async function exerciseRdoScope() {
  await rest("rdo_user_access", {
    method: "POST",
    prefer: "return=minimal",
    body: [
      { user_id: operator.id, role: "rdo_admin", active: true, invited_by: operator.id },
      { user_id: dualScopeActor.id, role: "rdo_admin", active: true, invited_by: operator.id },
    ],
  });
  const before = await edgeRaw(dualScopeActor, "rdo-team", { action: "list" });
  check("rdo_dual_scope_active_before_revocation", before.status === 200);

  const started = performance.now();
  const suspended = await edgeRaw(operator, "rdo-team", {
    action: "suspend",
    userId: dualScopeActor.id,
  });
  check("rdo_member_suspended", suspended.json?.ok === true && suspended.json?.active === false);
  const denied = await edgeRaw(dualScopeActor, "rdo-team", { action: "list" }, [403]);
  revocationLatencyMs = Math.round(performance.now() - started);
  check("rdo_revocation_immediate", denied.status === 403 && revocationLatencyMs < 10_000);

  const cmsSession = await edgeRaw(dualScopeActor, "cms-session", { action: "resolve" });
  check(
    "rdo_suspension_preserves_cms_scope",
    cmsSession.status === 200 && cmsSession.json?.accessGranted === true,
  );
  await proveLastAdminProtection();

  // Reproduce the exact Auth ban written by the legacy RDO suspension flow.
  // The candidate must reconcile that historical state without ever clearing
  // an unrelated global or CMS restriction.
  const legacyBan = await request(`${context.url}/auth/v1/admin/users/${dualScopeActor.id}`, {
    method: "PUT",
    headers: context.serviceHeaders,
    body: { ban_duration: "876000h" },
  });
  const legacyBannedUntil = Date.parse(legacyBan.json?.banned_until ?? "");
  check(
    "rdo_legacy_auth_ban_fixture_active",
    Number.isFinite(legacyBannedUntil) && legacyBannedUntil > Date.now(),
  );

  const reactivated = await edgeRaw(operator, "rdo-team", {
    action: "reactivate",
    userId: dualScopeActor.id,
  });
  check("rdo_member_reactivated_for_controlled_close", reactivated.json?.active === true);
  const reconciledIdentity = await request(`${context.url}/auth/v1/admin/users/${dualScopeActor.id}`, {
    headers: context.serviceHeaders,
  });
  const reconciledBan = Date.parse(reconciledIdentity.json?.banned_until ?? "");
  check("rdo_legacy_auth_ban_reconciled", !Number.isFinite(reconciledBan) || reconciledBan <= Date.now());
  const cmsProfile = await rest("cms_profiles", {
    query: `user_id=eq.${dualScopeActor.id}&select=status`,
  });
  check("rdo_legacy_reconciliation_preserves_cms_profile", cmsProfile.json?.[0]?.status === "active");
  const audits = await rest("rdo_audit_events", {
    query: `actor_id=eq.${operator.id}&action=in.(team.suspend.completed,team.reactivate.completed,team.reactivate.legacy_auth_ban_cleared)&select=action`,
  });
  check(
    "rdo_audit_preserved",
    audits.json?.length === 3 &&
      audits.json.some((event) => event.action === "team.reactivate.legacy_auth_ban_cleared"),
  );
}

async function closeDocumentFixture() {
  if (!documentFixture) return;
  const current = await rest("cms_document_assets", {
    query: `id=eq.${documentFixture.id}&select=processing_status,scan_status,archived_at,lock_version,storage_path`,
  });
  const asset = current.json?.[0];
  if (!asset) return;
  if (!operator?.token) throw new Error("documents_fixture_cleanup_session_missing");
  const neutralized = await edgeCommand(
    operator,
    "cms-documents",
    "neutralize_synthetic",
    { documentId: documentFixture.id },
    { allowed: [200, 503], idempotent: true },
  );
  check(
    "documents_fixture_neutralized_fenced",
    (neutralized.status === 200 &&
      neutralized.json?.status === "neutralized" &&
      neutralized.json?.blobDisposition === "removed") ||
      (neutralized.status === 503 && neutralized.json?.code === "CMS_DOCUMENT_BLOB_REMOVAL_PENDING"),
  );
  documentFixture.archived = true;
}

async function closeMediaFixture() {
  if (!mediaFixture || mediaFixture.archived || !operator?.token) return;
  const closed = await edgeCommand(
    operator,
    "cms-media",
    "abort_upload",
    { assetId: mediaFixture.id, reasonCode: "client_upload_failed" },
    { allowed: [200, 404], idempotent: true },
  );
  mediaFixture.archived = closed.status === 404 || closed.json?.archived === true;
  if (!mediaFixture.archived) throw new Error("G12_STAGING_MEDIA_FIXTURE_CLOSE_FAILED");
}

async function closePimFixture() {
  if (!contentFixture?.itemId) return;
  const current = await rest("cms_content_items", {
    query: `id=eq.${contentFixture.itemId}&select=workflow_status`,
  });
  if (current.json?.[0]?.workflow_status !== "archived") {
    const archived = await contentCommand(operator, "archive", {
      itemId: contentFixture.itemId,
      reason: `Encerramento canônico sintético ${qaTag}`,
    });
    contentFixture.archived = archived.json?.status === "archived";
  }
  projectionCreated = false;
}

async function closeActors() {
  if (overrideId)
    await rest("cms_feature_flag_overrides", { method: "DELETE", query: `id=eq.${overrideId}` });
  if (!actors.length) return;
  const now = new Date().toISOString();
  const ids = actors.map((actor) => actor.id);
  for (const actor of actors)
    await rest("cms_content_items", {
      method: "PATCH",
      query: `created_by=eq.${actor.id}&workflow_status=neq.archived`,
      body: {
        workflow_status: "archived",
        archived_at: now,
        scheduled_for: null,
        deleted_at: null,
        deleted_by: null,
        updated_by: actor.id,
      },
    });
  const ownedContent = await rest("cms_content_items", {
    query: `created_by=in.(${ids.join(",")})&select=id`,
  });
  const itemIds = [...new Set((ownedContent.json ?? []).map(({ id }) => id))];
  if (itemIds.length) {
    await rest("cms_publications", {
      method: "DELETE",
      query: `item_id=in.(${itemIds.join(",")})`,
    });
    await rest("cms_published_projection", {
      method: "DELETE",
      query: `item_id=in.(${itemIds.join(",")})`,
    });
    await rest("cms_route_rules", {
      method: "PATCH",
      query: `item_id=in.(${itemIds.join(",")})&active=eq.true`,
      body: { active: false },
    });
  }
  await rest("cms_feature_flag_overrides", {
    method: "DELETE",
    query: `scope_type=eq.user&scope_key=in.(${ids.join(",")})`,
  });
  for (const actor of actors)
    await rest("cms_scoped_role_assignments", {
      method: "PATCH",
      query: `user_id=eq.${actor.id}&revoked_at=is.null`,
      body: {
        revoked_at: now,
        revoked_by: actor.id,
        revocation_reason: "QA synthetic migration canary cleanup",
        updated_at: now,
      },
    });
  await rest("cms_user_roles", {
    method: "DELETE",
    query: `user_id=in.(${ids.join(",")})`,
  });
  await rest("rdo_user_access", {
    method: "PATCH",
    query: `user_id=in.(${ids.join(",")})`,
    body: {
      active: false,
      suspended_at: now,
      suspended_by: operator?.id ?? actors[0].id,
    },
  });
  await rest("cms_profiles", {
    method: "PATCH",
    query: `user_id=in.(${ids.join(",")})&status=eq.active`,
    body: {
      status: "suspended",
      suspended_at: now,
      suspended_by: operator?.id ?? actors[0].id,
    },
  });
  for (const actor of actors) {
    await managementQuery(`delete from auth.sessions where user_id = '${actor.id}'::uuid`);
    await request(`${context.url}/auth/v1/admin/users/${actor.id}`, {
      method: "PUT",
      headers: context.serviceHeaders,
      body: {
        password: `Revoked!${randomBytes(32).toString("base64url")}9Z`,
        ban_duration: "876000h",
      },
    });
  }
}

async function closeFixtures() {
  const failures = [];
  for (const close of [closeMediaFixture, closeDocumentFixture, closePimFixture, closeActors]) {
    try {
      await close();
    } catch {
      failures.push(true);
    }
  }
  if (failures.length) throw new Error("G12_STAGING_MIGRATION_CANARY_FIXTURE_CLOSE_FAILED");
}

async function residue() {
  const ids = actors.map((actor) => actor.id);
  const ownedContent = ids.length
    ? await rest("cms_content_items", {
        query: `created_by=in.(${ids.join(",")})&select=id,workflow_status`,
      })
    : { json: [] };
  const itemIds = (ownedContent.json ?? []).map(({ id }) => id);
  const activeContent = (ownedContent.json ?? []).filter(
    ({ workflow_status: workflowStatus }) => workflowStatus !== "archived",
  ).length;
  const [
    activeDocuments,
    activeMedia,
    retainedMedia,
    scheduledMediaGc,
    activeRdo,
    activeProfiles,
    overrides,
    legacyRoles,
    scopedRoles,
    publications,
    projections,
    routeRules,
    cmsAudit,
    rdoAudit,
  ] = await Promise.all([
    documentFixture
      ? rest("cms_document_assets", {
          query: `id=eq.${documentFixture.id}&archived_at=is.null&processing_status=eq.ready&select=id`,
        })
      : Promise.resolve({ json: [] }),
    mediaFixture
      ? rest("cms_media_assets", {
          query: `id=eq.${mediaFixture.id}&archived_at=is.null&select=id`,
        })
      : Promise.resolve({ json: [] }),
    mediaFixture
      ? rest("cms_media_assets", {
          query: `id=eq.${mediaFixture.id}&archived_at=not.is.null&select=id`,
        })
      : Promise.resolve({ json: [] }),
    mediaFixture
      ? rest("cms_dam_gc_jobs", {
          query: `asset_id=eq.${mediaFixture.id}&status=in.(pending,processing,blocked,failed)&select=id`,
        })
      : Promise.resolve({ json: [] }),
    ids.length
      ? rest("rdo_user_access", { query: `user_id=in.(${ids.join(",")})&active=eq.true&select=user_id` })
      : Promise.resolve({ json: [] }),
    ids.length
      ? rest("cms_profiles", { query: `user_id=in.(${ids.join(",")})&status=eq.active&select=user_id` })
      : Promise.resolve({ json: [] }),
    ids.length
      ? rest("cms_feature_flag_overrides", {
          query: `scope_type=eq.user&scope_key=in.(${ids.join(",")})&select=id`,
        })
      : Promise.resolve({ json: [] }),
    ids.length
      ? rest("cms_user_roles", { query: `user_id=in.(${ids.join(",")})&select=user_id` })
      : Promise.resolve({ json: [] }),
    ids.length
      ? rest("cms_scoped_role_assignments", {
          query: `user_id=in.(${ids.join(",")})&revoked_at=is.null&select=id`,
        })
      : Promise.resolve({ json: [] }),
    itemIds.length
      ? rest("cms_publications", { query: `item_id=in.(${itemIds.join(",")})&select=item_id` })
      : Promise.resolve({ json: [] }),
    itemIds.length
      ? rest("cms_published_projection", {
          query: `item_id=in.(${itemIds.join(",")})&select=item_id`,
        })
      : Promise.resolve({ json: [] }),
    itemIds.length
      ? rest("cms_route_rules", {
          query: `item_id=in.(${itemIds.join(",")})&active=eq.true&select=id`,
        })
      : Promise.resolve({ json: [] }),
    operator
      ? rest("cms_audit_log", { query: `actor_id=eq.${operator.id}&select=action` })
      : Promise.resolve({ json: [] }),
    operator
      ? rest("rdo_audit_events", { query: `actor_id=eq.${operator.id}&select=action` })
      : Promise.resolve({ json: [] }),
  ]);
  const sessionRows = ids.length
    ? await managementQuery(
        `select count(*)::integer as count from auth.sessions where user_id in (${ids
          .map((id) => `'${id}'::uuid`)
          .join(",")})`,
      )
    : [{ count: 0 }];
  const activeSessions = Number(sessionRows[0]?.count);
  if (!Number.isInteger(activeSessions)) throw new Error("G12_STAGING_SYNTHETIC_SESSION_RESIDUE_UNAVAILABLE");
  const authUsers = await Promise.all(
    ids.map((id) =>
      request(`${context.url}/auth/v1/admin/users/${id}`, {
        headers: context.serviceHeaders,
        allowed: [200, 404],
      }),
    ),
  );
  const activeCredentials = authUsers.filter((response) => {
    if (response.status !== 200) return false;
    const bannedUntil = Date.parse(response.json?.banned_until ?? "");
    return !Number.isFinite(bannedUntil) || bannedUntil <= Date.now();
  }).length;
  return {
    activeFixtures:
      activeContent +
      activeDocuments.json.length +
      activeMedia.json.length +
      activeRdo.json.length +
      activeProfiles.json.length +
      overrides.json.length +
      legacyRoles.json.length +
      scopedRoles.json.length +
      publications.json.length +
      projections.json.length +
      routeRules.json.length +
      activeSessions +
      activeCredentials,
    activeContent,
    activeDocuments: activeDocuments.json.length,
    activeMedia: activeMedia.json.length,
    retainedSyntheticMediaAssets: retainedMedia.json.length,
    scheduledSyntheticMediaGcJobs: scheduledMediaGc.json.length,
    activeProducts: 0,
    activeRdoActors: activeRdo.json.length,
    activeCmsProfiles: activeProfiles.json.length,
    activeOverrides: overrides.json.length,
    activeLegacyRoles: legacyRoles.json.length,
    activeScopedRoles: scopedRoles.json.length,
    activePublications: publications.json.length,
    activeProjections: projections.json.length,
    activeRouteRules: routeRules.json.length,
    activeSessions,
    activeCredentials,
    retainedCmsAuditEvents: cmsAudit.json.length,
    retainedRdoAuditEvents: rdoAudit.json.length,
    retainedSyntheticActors: ids.length,
    semantics: ids.length
      ? "zero-active-residue; archived fixtures and immutable audit retained"
      : "zero-active-residue; no synthetic actor or operation created",
  };
}

async function terminalPimResidue() {
  if (!actors.length) {
    return {
      controlledOptions: 0,
      activeMasterEntities: 0,
      attributeDefinitions: 0,
      attributeSets: 0,
      skuClaims: 0,
      identifierClaims: 0,
    };
  }
  const actorIds = actors.map(({ id }) => `'${id}'::uuid`).join(",");
  const result = await managementQuery(`select
    (select count(*)::integer from public.cms_controlled_options
      where created_by in (${actorIds})) as controlled_options,
    (select count(*)::integer from public.cms_master_entities
      where created_by in (${actorIds}) and status = 'active') as active_master_entities,
    (select count(*)::integer from public.cms_pim_attribute_definitions
      where created_by in (${actorIds})) as attribute_definitions,
    (select count(*)::integer from public.cms_pim_attribute_sets
      where created_by in (${actorIds})) as attribute_sets,
    (select count(*)::integer from public.cms_product_canonical_sku_registry
      where claimed_by in (${actorIds})) as sku_claims,
    (select count(*)::integer from public.cms_product_canonical_identifier_registry
      where claimed_by in (${actorIds})) as identifier_claims;`);
  const row = Array.isArray(result) ? result[0] : null;
  const counts = {
    controlledOptions: Number(row?.controlled_options),
    activeMasterEntities: Number(row?.active_master_entities),
    attributeDefinitions: Number(row?.attribute_definitions),
    attributeSets: Number(row?.attribute_sets),
    skuClaims: Number(row?.sku_claims),
    identifierClaims: Number(row?.identifier_claims),
  };
  if (Object.values(counts).some((value) => !Number.isInteger(value)))
    throw new Error("G12_STAGING_PIM_TERMINAL_RESIDUE_UNAVAILABLE");
  return counts;
}

try {
  context = await loadContext();
  await preflightMigrations();
  operator = await createActor("operator");
  dualScopeActor = await createActor("dual-scope");
  await exerciseCollaborationAssigneeDirectory();
  await exerciseSessionRefreshRevocation();
  await exerciseMediaUploadAbort();
  await exerciseDocuments();
  await exercisePimPublication();
  await exerciseRdoScope();
} catch (error) {
  operationError = error;
} finally {
  if (context) {
    try {
      await closeFixtures();
    } catch (error) {
      cleanupError = error;
    }
    try {
      finalResidue = await residue();
      check("synthetic_active_residue_zero", finalResidue.activeFixtures === 0);
      let cleanedActorLeases = 0;
      for (const actor of actors) {
        await completeActorLease(actor.id);
        cleanedActorLeases += 1;
      }
      finalResidue.cleanedActorLeases = cleanedActorLeases;
      check("synthetic_actor_leases_cleaned", cleanedActorLeases === actors.length);
      finalResidue.terminalPim = await terminalPimResidue();
      check(
        "synthetic_pim_business_residue_zero_after_terminal",
        Object.values(finalResidue.terminalPim).every((value) => value === 0),
      );
      if (actors.length > 0)
        check(
          "immutable_audit_retained",
          finalResidue.retainedCmsAuditEvents > 0 && finalResidue.retainedRdoAuditEvents > 0,
        );
    } catch (error) {
      cleanupError ??= error;
    }
  }
}

const passed = !operationError && !cleanupError;
const report = {
  schemaVersion: 1,
  outcome: passed ? "G12_STAGING_MIGRATIONS_CANARY_PASS" : "G12_STAGING_MIGRATIONS_CANARY_FAIL",
  target: "staging",
  projectRef: TARGET.ref,
  candidateSha: expectedSha,
  qaTag,
  appliedMigrations: sourceMigrations.map(({ version }) => version),
  migrationManifest: sourceMigrations,
  scenarioCoverage,
  checks,
  checkCount: checks.length,
  revocationLatencyMs: revocationLatencyMs ?? null,
  sessionRevocationLatencyMs: sessionRevocationLatencyMs ?? null,
  residue: finalResidue ?? null,
  syntheticOnly: true,
  realDataUsed: false,
  productionMutations: 0,
  secretsPersisted: false,
  completedAt: new Date().toISOString(),
};
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
console.log(JSON.stringify(report));
if (!passed)
  throw new Error(
    cleanupError
      ? "G12_STAGING_MIGRATION_CANARY_CLEANUP_FAILED"
      : "G12_STAGING_MIGRATION_CANARY_OPERATION_FAILED",
  );
