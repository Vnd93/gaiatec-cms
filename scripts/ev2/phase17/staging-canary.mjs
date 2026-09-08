import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  assertQaActorLease,
  completeQaActorLease,
  createQaRunTag,
  qaActorMetadata,
  QA_ACTOR_LEASE_TTL_MINUTES,
} from "../../qa/qa-actor-lease.mjs";

const PROJECT_REF = "glcqsosxwgmlhzgcsnzv";
const PROJECT_NAME = "GAIATEC CMS Staging";
const ORIGIN = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const EXPECTED_SHA = process.env.EV2_G17_EXPECTED_SHA ?? "";
if (!/^[a-f0-9]{40}$/.test(EXPECTED_SHA)) throw new Error("EV2_G17_EXPECTED_SHA inválido.");
const QA_RUN_TAG = createQaRunTag(EXPECTED_SHA);
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN ?? "";

const checks = [];
let context;
let actor;

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_@./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function check(name, condition, detail) {
  checks.push({ name, result: condition ? "PASS" : "FAIL", detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
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
  });
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
  return result.stdout.trim();
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(35_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!allowed.includes(response.status))
    throw new Error(`${method} ${new URL(url).pathname}: ${response.status} ${JSON.stringify(payload)}`);
  return { status: response.status, json: payload };
}

async function loadContext() {
  if (SUPABASE_ACCESS_TOKEN.length < 24) throw new Error("Token de gestão de staging indisponível.");
  const projects = JSON.parse(runSupabase(["projects", "list", "--output", "json"]));
  const project = projects.find((entry) => entry.ref === PROJECT_REF);
  if (!project || project.name !== PROJECT_NAME || !project.linked) throw new Error("Alvo staging recusado.");
  const keys = JSON.parse(
    runSupabase(["projects", "api-keys", "--project-ref", PROJECT_REF, "--reveal", "--output", "json"]),
  );
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("Chaves de staging indisponíveis.");
  return {
    url: `https://${PROJECT_REF}.supabase.co`,
    anonKey,
    serviceKey,
    serviceHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  };
}

async function rest(table, { method = "GET", query = "", body, prefer } = {}) {
  return request(`${context.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: { ...context.serviceHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body,
    allowed:
      method === "POST" ? [200, 201] : method === "DELETE" || method === "PATCH" ? [200, 204] : [200, 206],
  });
}

async function rpc(name, body) {
  const result = await request(`${context.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: context.serviceHeaders,
    body,
    allowed: [200, 204],
  });
  return result.json;
}

async function managementQuery(query) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error("Consulta segura de gestão do staging falhou.");
  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload)) throw new Error("Resposta de gestão do staging inválida.");
  return payload;
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase().replaceAll("=", ""))
    bits += alphabet.indexOf(character).toString(2).padStart(5, "0");
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8)
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totp(secret, now = Date.now()) {
  const counter = Math.floor(now / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
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

async function createActor() {
  const email = `ev2-g17-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: qaActorMetadata(QA_RUN_TAG, EXPECTED_SHA, "staging"),
    },
  });
  actor = { id: created.json.id };
  const identity = {
    actorId: created.json.id,
    runTag: QA_RUN_TAG,
    candidateSha: EXPECTED_SHA,
    environment: "staging",
  };
  const lease = await assertQaActorLease(rpc, identity, "active");
  await rest("cms_profiles", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      user_id: created.json.id,
      display_name: "Operador G17 sintético",
      display_email: email,
      status: "active",
    },
  });
  await rest("cms_user_roles", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      user_id: created.json.id,
      role_key: "super_admin",
    },
  });
  const client = createClient(context.url, context.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (!signedIn.data.session) throw signedIn.error;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "EV2 G17" });
  if (!enrolled.data?.totp?.secret) throw enrolled.error;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenge.data.id,
      code: totp(enrolled.data.totp.secret, await authenticationClock()),
    });
    const token = verified.data?.session?.access_token ?? verified.data?.access_token;
    if (!verified.error && token) return { id: created.json.id, token, identity, lease };
    lastError = verified.error ?? new Error("AAL2 ausente.");
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

function envelope(environment = "staging") {
  return {
    schemaVersion: 1,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment, siteKey: "main" },
  };
}

async function edge(
  functionName,
  action,
  values = {},
  { allowed = [200], environment = "staging", idempotent = false } = {},
) {
  return request(`${context.url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: ORIGIN,
      ...(idempotent ? { "X-Idempotency-Key": randomUUID() } : {}),
    },
    body: { action, envelope: envelope(environment), ...values },
    allowed,
  });
}

async function cleanupActor(actorId) {
  const owned = await rest("cms_content_items", { query: `created_by=eq.${actorId}&select=id` });
  const ownedItemIds = owned.json.map((item) => item.id);
  if (ownedItemIds.length) {
    const itemFilter = ownedItemIds.join(",");
    const projections = await rest("cms_published_projection", {
      query: `item_id=in.(${itemFilter})&select=item_id,revision_id`,
    });
    if (projections.json.length)
      await rest("cms_publication_outbox", {
        method: "POST",
        query: "on_conflict=item_id,revision_id,event_type",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: projections.json.map((projection) => ({
          item_id: projection.item_id,
          revision_id: projection.revision_id,
          event_type: "unpublish",
          correlation_id: randomUUID(),
        })),
      });
    await rest("cms_publications", { method: "DELETE", query: `item_id=in.(${itemFilter})` });
    await rest("cms_published_projection", { method: "DELETE", query: `item_id=in.(${itemFilter})` });
    await rest("cms_route_rules", {
      method: "PATCH",
      query: `item_id=in.(${itemFilter})&active=eq.true`,
      prefer: "return=minimal",
      body: { active: false },
    });
    await rest("cms_content_items", {
      method: "PATCH",
      query: `id=in.(${itemFilter})&workflow_status=neq.archived`,
      prefer: "return=minimal",
      body: {
        workflow_status: "archived",
        archived_at: new Date().toISOString(),
        scheduled_for: null,
        deleted_at: null,
        deleted_by: null,
      },
    });
  }
  const sessions = await rest("cms_ai_sessions", { query: `actor_id=eq.${actorId}&select=id` });
  const sessionIds = sessions.json.map((item) => item.id);
  const proposals = sessionIds.length
    ? await rest("cms_ai_proposals", { query: `session_id=in.(${sessionIds.join(",")})&select=id` })
    : { json: [] };
  const proposalIds = proposals.json.map((item) => item.id);
  if (proposalIds.length)
    await rest("cms_ai_approvals", { method: "DELETE", query: `proposal_id=in.(${proposalIds.join(",")})` });
  for (const table of [
    "cms_ai_provider_calls",
    "cms_ai_events",
    "cms_ai_eval_runs",
    "cms_ai_messages",
    "cms_ai_proposals",
    "cms_ai_sources",
    "cms_ai_tool_calls",
  ])
    await rest(table, { method: "DELETE", query: `actor_id=eq.${actorId}` });
  await rest("cms_ai_command_receipts", { method: "DELETE", query: `actor_id=eq.${actorId}` });
  await rest("cms_ai_sessions", { method: "DELETE", query: `actor_id=eq.${actorId}` });
  await rest("cms_feature_flag_overrides", {
    method: "DELETE",
    query: `scope_type=eq.user&scope_key=eq.${actorId}`,
  });
  const now = new Date().toISOString();
  await rest("cms_scoped_role_assignments", {
    method: "PATCH",
    query: `user_id=eq.${actorId}&revoked_at=is.null`,
    prefer: "return=minimal",
    body: {
      revoked_at: now,
      revoked_by: actorId,
      revocation_reason: "QA synthetic G17 cleanup",
    },
  });
  await rest("cms_user_roles", { method: "DELETE", query: `user_id=eq.${actorId}` });
  await rest("rdo_user_access", {
    method: "PATCH",
    query: `user_id=eq.${actorId}&active=eq.true`,
    prefer: "return=minimal",
    body: {
      active: false,
      suspended_at: now,
      suspended_by: actorId,
      updated_at: now,
    },
  });
  await rest("cms_profiles", {
    method: "PATCH",
    query: `user_id=eq.${actorId}`,
    prefer: "return=minimal",
    body: {
      status: "suspended",
      suspended_at: now,
      suspended_by: actorId,
      sessions_valid_after: now,
    },
  });
  await managementQuery(`delete from auth.sessions where user_id = '${actorId}'::uuid`);
  await request(`${context.url}/auth/v1/admin/users/${actorId}`, {
    method: "PUT",
    headers: context.serviceHeaders,
    body: {
      password: `Revoked!${randomBytes(32).toString("base64url")}9Z`,
      ban_duration: "876000h",
    },
  });
  const identity = {
    actorId,
    runTag: QA_RUN_TAG,
    candidateSha: EXPECTED_SHA,
    environment: "staging",
  };
  const lease = await completeQaActorLease(rpc, identity);
  const audit = await rest("cms_audit_log", {
    query: `actor_id=eq.${actorId}&target_type=eq.qa_fixture&target_id=eq.${QA_RUN_TAG}&select=id`,
  });
  if (audit.json.length < 2) throw new Error("Auditoria imutável da lease G17 não foi preservada.");
  return { status: lease.status, retainedAuditEvents: audit.json.length };
}

async function cleanup() {
  if (!actor?.id) return { status: "not-created", retainedAuditEvents: 0 };
  return cleanupActor(actor.id);
}

let operationError;
let cleanupEvidence;
try {
  context = await loadContext();
  const health = await request(`${ORIGIN}/healthz`);
  check("immutable_candidate", health.json.release === EXPECTED_SHA, health.json.release);
  actor = await createActor();
  check(
    "qa_actor_watchdog_lease_active",
    actor.lease.status === "active" && actor.lease.ttlSeconds === QA_ACTOR_LEASE_TTL_MINUTES * 60,
    actor.lease.status,
  );
  const now = Date.now();
  await rest("cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      flag_key: "ev2.ai_assist",
      environment: "staging",
      scope_type: "user",
      scope_key: actor.id,
      enabled: true,
      reason: "Canary sintético G17",
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + QA_ACTOR_LEASE_TTL_MINUTES * 60_000).toISOString(),
      created_by: actor.id,
    },
  });
  const session = await request(`${context.url}/functions/v1/cms-session`, {
    method: "POST",
    headers: { apikey: context.anonKey, Authorization: `Bearer ${actor.token}`, Origin: ORIGIN },
    body: { action: "resolve" },
  });
  check(
    "runtime_individual_override",
    session.json.ev2Capabilities?.capabilities?.["ev2.ai_assist"]?.enabled === true,
    "manifest",
  );
  const capability = await edge("cms-ai", "capability");
  check(
    "openrouter_ready",
    capability.json.providerMode === "openrouter" && capability.json.externalProviderReady === true,
    capability.json.providerMode,
  );
  const opened = await edge(
    "cms-ai",
    "start_session",
    { mode: "draft", title: "Cadastro sintético G17" },
    { idempotent: true },
  );
  const generated = await edge(
    "cms-ai",
    "generate_proposal",
    {
      sessionId: opened.json.sessionId,
      proposalKind: "draft_patch",
      prompt: "Crie um resumo técnico curto e fiel à fonte.",
      targetRef: `g10x-draft-${randomUUID().slice(0, 8)}`,
      source: {
        kind: "synthetic_document",
        reference: `g10x-source-${randomUUID().slice(0, 8)}`,
        title: "Manual sintético G17",
        version: "v1",
        locator: "seção 1",
        page: 1,
        excerpt:
          "O instrumento sintético mede pressão de zero a dez bar e possui saída de quatro a vinte miliampères.",
      },
    },
    { idempotent: true },
  );
  check(
    "nemotron_proposal",
    Boolean(generated.json.proposalId) &&
      generated.json.applied === false &&
      generated.json.published === false,
    generated.json.proposalId,
  );
  const workspace = await edge("cms-ai", "workspace");
  const sessionItem = workspace.json.sessions.find((item) => item.id === opened.json.sessionId);
  const proposal = sessionItem.proposals.find((item) => item.id === generated.json.proposalId);
  check(
    "human_review_ready",
    sessionItem.providerMode === "openrouter" && sessionItem.reviewable === true,
    sessionItem.providerMode,
  );
  const decision = await edge(
    "cms-ai",
    "decide_proposal",
    {
      proposalId: proposal.id,
      expectedProposalHash: proposal.proposalHash,
      decision: "edited",
      rationale: "Proposta sintética conferida pelo operador humano com MFA.",
      editedFields: proposal.fields.map((field) => ({ path: field.path, value: field.value })),
    },
    { idempotent: true },
  );
  check(
    "human_decision_no_publish",
    decision.json.decision === "edited" &&
      decision.json.applied === false &&
      decision.json.published === false,
    decision.json.decision,
  );
  const productionAttempt = await edge(
    "cms-ai",
    "capability",
    {},
    { environment: "production", allowed: [403] },
  );
  check("production_scope_isolated", productionAttempt.status === 403, productionAttempt.status);
} catch (error) {
  operationError = error;
} finally {
  try {
    cleanupEvidence = await cleanup();
  } catch (cleanupError) {
    operationError ??= cleanupError;
  }
}

if (operationError) throw operationError;
console.log(
  JSON.stringify({
    outcome: "G17_CANARY_PASS",
    candidateSha: EXPECTED_SHA,
    checks: checks.length,
    provider: "openrouter",
    model: "nvidia/nemotron-3.5-lightning:free",
    syntheticUsers: 1,
    productionMutations: 0,
    realDataUsed: false,
    watchdogLease: cleanupEvidence,
  }),
);
