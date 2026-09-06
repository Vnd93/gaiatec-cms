import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "glcqsosxwgmlhzgcsnzv";
const PROJECT_NAME = "GAIATEC CMS Staging";
const ORIGIN = "https://ev2-g17-canary.gaiatec-cms-staging.pages.dev";
const EXPECTED_SHA = process.env.EV2_G17_EXPECTED_SHA ?? "";
if (!/^[a-f0-9]{40}$/.test(EXPECTED_SHA)) throw new Error("EV2_G17_EXPECTED_SHA inválido.");

const checks = [];
let context;
let actor;

function check(name, condition, detail) {
  checks.push({ name, result: condition ? "PASS" : "FAIL", detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

function runSupabase(args) {
  const binary = "npx";
  const pinned = ["--yes", "supabase@2.116.0", ...args];
  const result = spawnSync(
    process.env.ComSpec ?? "cmd.exe",
    ["/d", "/s", "/c", [binary, ...pinned].join(" ")],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024,
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
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
    allowed: method === "POST" ? [200, 201] : method === "DELETE" ? [200, 204] : [200, 206],
  });
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

function totp(secret) {
  const counter = Math.floor(Date.now() / 30_000);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(buffer).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function createActor() {
  const email = `ev2-g17-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: { email, password, email_confirm: true, user_metadata: { synthetic: true, phase: "ev2-g17" } },
  });
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
  const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
  const verified = await client.auth.mfa.verify({
    factorId: enrolled.data.id,
    challengeId: challenge.data.id,
    code: totp(enrolled.data.totp.secret),
  });
  if (!verified.data.access_token) throw verified.error;
  return { id: created.json.id, token: verified.data.access_token };
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

async function cleanup() {
  if (!actor) return;
  const sessions = await rest("cms_ai_sessions", { query: `actor_id=eq.${actor.id}&select=id` });
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
    "cms_ai_messages",
    "cms_ai_proposals",
    "cms_ai_sources",
    "cms_ai_tool_calls",
  ])
    await rest(table, { method: "DELETE", query: `actor_id=eq.${actor.id}` });
  await rest("cms_ai_command_receipts", { method: "DELETE", query: `actor_id=eq.${actor.id}` });
  await rest("cms_ai_sessions", { method: "DELETE", query: `actor_id=eq.${actor.id}` });
  await rest("cms_feature_flag_overrides", {
    method: "DELETE",
    query: `scope_type=eq.user&scope_key=eq.${actor.id}`,
  });
  await rest("cms_user_roles", { method: "DELETE", query: `user_id=eq.${actor.id}` });
  await rest("cms_profiles", { method: "DELETE", query: `user_id=eq.${actor.id}` });
  await request(`${context.url}/auth/v1/admin/users/${actor.id}`, {
    method: "DELETE",
    headers: context.serviceHeaders,
    allowed: [200, 204],
  });
}

let operationError;
try {
  context = await loadContext();
  const health = await request(`${ORIGIN}/healthz`);
  check("immutable_candidate", health.json.release === EXPECTED_SHA, health.json.release);
  actor = await createActor();
  const now = Date.now();
  await rest("cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=minimal",
    body: {
      flag_key: "ev2.ai_assist",
      environment: "staging",
      site_key: "main",
      scope_type: "user",
      scope_key: actor.id,
      enabled: true,
      reason: "Canary sintético G17",
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + 29 * 60_000).toISOString(),
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
    await cleanup();
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
  }),
);
