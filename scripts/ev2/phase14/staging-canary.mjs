import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { validateHealthContract, validateReleaseManifest } from "../phase12/release-guard-lib.mjs";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  candidateOrigin: "https://ev2-g14-canary.gaiatec-cms-staging.pages.dev",
  stableOrigin: "https://gaiatec-cms-staging.pages.dev",
};
const expectedSha = process.env.EV2_G14_EXPECTED_SHA ?? "";
const authorization = process.env.EV2_G14_CANARY_AUTHORIZED ?? "";
const reportPath = process.env.EV2_G14_REPORT_PATH ?? "";

if (!/^[a-f0-9]{40}$/.test(expectedSha))
  throw new Error("Defina EV2_G14_EXPECTED_SHA com o SHA completo explicitamente autorizado.");
if (authorization !== "STAGING-G14-SYNTHETIC")
  throw new Error(
    "Canary G14 bloqueado. Defina EV2_G14_CANARY_AUTHORIZED=STAGING-G14-SYNTHETIC somente após autorização explícita.",
  );

const startedAt = new Date().toISOString();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const targetRef = `g14x-canary-${suffix}`;
const actorIds = [];
const checks = [];
let context;
let operator;
let reviewer;

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
    maxBuffer: 25 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(
      [result.error?.message, result.stdout?.trim(), result.stderr?.trim()].filter(Boolean).join("\n"),
    );
  return result.stdout.trim();
}

function supabaseJson(args) {
  return JSON.parse(runSupabase([...args, "--output", "json"]));
}

function check(name, condition, detail) {
  const result = condition ? "PASS" : "FAIL";
  checks.push({ name, result, detail });
  console.log(JSON.stringify({ event: "g14.check", name, result, detail }));
  if (!condition) throw new Error(`${name}: ${detail}`);
}

function reportableFailure(error, fallback) {
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return message.match(/CMS_AI_EXECUTE_[A-Z0-9_]+/)?.[0] ?? fallback;
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  if (!allowed.includes(response.status))
    throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status} ${JSON.stringify(payload)}`);
  return {
    status: response.status,
    json: payload,
    headers: response.headers,
    durationMs: performance.now() - started,
  };
}

async function loadContext() {
  const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
  if (!project || project.name !== TARGET.name || project.region !== TARGET.region || !project.linked)
    throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado para o G14.");
  const keys = supabaseJson(["projects", "api-keys", "--project-ref", TARGET.ref, "--reveal"]);
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("Chaves exclusivas do staging indisponíveis.");
  return {
    anonKey,
    serviceKey,
    url: `https://${TARGET.ref}.supabase.co`,
    serviceHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  };
}

async function rest(ctx, table, { method = "GET", query = "", body, prefer } = {}) {
  return request(`${ctx.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: { ...ctx.serviceHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body,
    allowed:
      method === "POST" ? [200, 201] : method === "DELETE" || method === "PATCH" ? [200, 204] : [200, 206],
  });
}

async function restCount(ctx, table) {
  const response = await request(`${ctx.url}/rest/v1/${table}?select=id&limit=1`, {
    headers: { ...ctx.serviceHeaders, Prefer: "count=exact", Range: "0-0" },
    allowed: [200, 206],
  });
  return Number(response.headers.get("content-range")?.split("/")[1]);
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

async function ai(ctx, actor, action, values = {}, options = {}) {
  const commandEnvelope = options.envelope ?? envelope(options.environment ?? "staging");
  return request(`${ctx.url}/functions/v1/cms-ai-execute`, {
    method: "POST",
    headers: {
      apikey: ctx.anonKey,
      Authorization: `Bearer ${options.aal1 ? actor.aal1Token : actor.token}`,
      Origin: TARGET.candidateOrigin,
      ...(options.idempotencyKey ? { "X-Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: { envelope: commandEnvelope, action, ...values },
    allowed: options.allowed ?? [200],
  });
}

function decodeBase32(value) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const character of value.toUpperCase().replaceAll("=", "")) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Segredo TOTP inválido.");
    bits += index.toString(2).padStart(5, "0");
  }
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
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function authenticationClock(ctx) {
  const response = await fetch(`${ctx.url}/auth/v1/health`, {
    headers: { apikey: ctx.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const date = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(date) ? date : Date.now();
}

async function createActor(ctx, roleKey, label) {
  const email = `ev2-g14-${label}-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${ctx.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: ctx.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g14", label, expires_in_minutes: 30 },
    },
  });
  actorIds.push(created.json.id);
  await rest(ctx, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: created.json.id,
      display_name: `${label.toUpperCase()}-G14 sintético`,
      display_email: email,
      status: "active",
    },
  });
  await rest(ctx, "cms_user_roles", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: created.json.id, role_key: roleKey },
  });

  const client = createClient(ctx.url, ctx.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("AAL1 ausente.");
  const aal1Token = signedIn.data.session.access_token;
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `EV2 G14 ${label}`,
  });
  if (enrolled.error) throw enrolled.error;

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenge.data.id,
      code: totp(enrolled.data.totp.secret, await authenticationClock(ctx)),
    });
    const token = verified.data?.session?.access_token ?? verified.data?.access_token;
    if (!verified.error && token) {
      await rest(ctx, "cms_profiles", {
        method: "PATCH",
        query: `user_id=eq.${created.json.id}`,
        prefer: "return=minimal",
        body: { mfa_enrolled_at: new Date().toISOString() },
      });
      return { id: created.json.id, token, aal1Token };
    }
    lastError = verified.error ?? new Error("AAL2 ausente.");
    await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
  }
  throw lastError;
}

async function installOverride(ctx, actorId, flagKey, createdBy) {
  const now = await authenticationClock(ctx);
  const created = await rest(ctx, "cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: flagKey,
      environment: "staging",
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: "Canary sintético EV2.14 autorizado por 30 minutos.",
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + 29 * 60_000).toISOString(),
      created_by: createdBy,
    },
  });
  return created.json[0].id;
}

async function baseline(ctx) {
  const [stableManifest, flags, revisions, outbox] = await Promise.all([
    request(`${TARGET.stableOrigin}/release-manifest.json`),
    rest(ctx, "cms_feature_flags", {
      query:
        "flag_key=in.(ev2.ai_assist,ev2.ai_execute)&select=flag_key,default_enabled,kill_switch&order=flag_key.asc",
    }),
    restCount(ctx, "cms_content_revisions"),
    restCount(ctx, "cms_publication_outbox"),
  ]);
  return {
    stableRelease: stableManifest.json.release,
    flags: flags.json,
    revisions,
    outbox,
  };
}

async function cleanup(ctx) {
  if (!ctx || !actorIds.length) return;
  const ids = actorIds.join(",");
  const plans = await rest(ctx, "cms_ai_execution_plans", {
    query: `created_by=in.(${ids})&select=id`,
  });
  const planIds = plans.json.map((plan) => plan.id);
  if (planIds.length) {
    const joinedPlans = planIds.join(",");
    const runs = await rest(ctx, "cms_ai_execution_runs", {
      query: `plan_id=in.(${joinedPlans})&select=id`,
    });
    const runIds = runs.json.map((run) => run.id);
    await rest(ctx, "cms_ai_execution_policy_decisions", {
      method: "DELETE",
      query: `actor_id=in.(${ids})`,
    });
    if (runIds.length)
      await rest(ctx, "cms_ai_execution_run_steps", {
        method: "DELETE",
        query: `run_id=in.(${runIds.join(",")})`,
      });
    await rest(ctx, "cms_ai_execution_runs", {
      method: "DELETE",
      query: `plan_id=in.(${joinedPlans})`,
    });
    await rest(ctx, "cms_ai_execution_approvals", {
      method: "DELETE",
      query: `plan_id=in.(${joinedPlans})`,
    });
    await rest(ctx, "cms_ai_execution_plans", {
      method: "DELETE",
      query: `id=in.(${joinedPlans})`,
    });
  } else {
    await rest(ctx, "cms_ai_execution_policy_decisions", {
      method: "DELETE",
      query: `actor_id=in.(${ids})`,
    });
  }
  await rest(ctx, "cms_ai_synthetic_targets", {
    method: "DELETE",
    query: `created_by=in.(${ids})`,
  });
  await rest(ctx, "cms_ai_command_receipts", {
    method: "DELETE",
    query: `actor_id=in.(${ids})`,
  });
  await rest(ctx, "cms_feature_flag_overrides", {
    method: "DELETE",
    query: `scope_type=eq.user&scope_key=in.(${ids})`,
  });
  await rest(ctx, "cms_feature_flag_overrides", {
    method: "DELETE",
    query: `created_by=in.(${ids})&scope_type=neq.user`,
  });
  await rest(ctx, "cms_user_roles", { method: "DELETE", query: `user_id=in.(${ids})` });
  await rest(ctx, "cms_profiles", { method: "DELETE", query: `user_id=in.(${ids})` });
  for (const actorId of actorIds)
    await request(`${ctx.url}/auth/v1/admin/users/${actorId}`, {
      method: "DELETE",
      headers: ctx.serviceHeaders,
      allowed: [200, 204, 404],
    });
}

async function residue(ctx) {
  if (!actorIds.length) return 0;
  const ids = actorIds.join(",");
  const responses = await Promise.all([
    rest(ctx, "cms_ai_execution_policy_decisions", { query: `actor_id=in.(${ids})&select=id` }),
    rest(ctx, "cms_ai_synthetic_targets", { query: `created_by=in.(${ids})&select=target_ref` }),
    rest(ctx, "cms_ai_execution_plans", { query: `created_by=in.(${ids})&select=id` }),
    rest(ctx, "cms_ai_command_receipts", { query: `actor_id=in.(${ids})&select=id` }),
    rest(ctx, "cms_feature_flag_overrides", {
      query: `or=(scope_key.in.(${ids}),created_by.in.(${ids}))&select=id`,
    }),
    rest(ctx, "cms_user_roles", { query: `user_id=in.(${ids})&select=user_id` }),
    rest(ctx, "cms_profiles", { query: `user_id=in.(${ids})&select=user_id` }),
  ]);
  const authUsers = await Promise.all(
    actorIds.map((actorId) =>
      request(`${ctx.url}/auth/v1/admin/users/${actorId}`, {
        headers: ctx.serviceHeaders,
        allowed: [200, 404],
      }),
    ),
  );
  return (
    responses.reduce((total, response) => total + response.json.length, 0) +
    authUsers.filter((response) => response.status === 200).length
  );
}

function writeReport(report) {
  if (!reportPath) return;
  const root = path.resolve(process.cwd());
  const resolved = path.resolve(root, reportPath);
  const evidenceRoot = path.resolve(root, "outputs/ev2/fase-14/evidencias");
  if (
    path.dirname(resolved) !== evidenceRoot ||
    !/^G14_CANARY_[a-f0-9_-]+\.json$/i.test(path.basename(resolved))
  )
    throw new Error("EV2_G14_REPORT_PATH deve apontar para outputs/ev2/fase-14/evidencias.");
  mkdirSync(evidenceRoot, { recursive: true });
  writeFileSync(resolved, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

let operationError;
let cleanupError;
let finalEvidence;
let residualEvidence = null;
try {
  context = await loadContext();
  const before = await baseline(context);
  check(
    "flags_default_off",
    before.flags.length === 2 && before.flags.every((flag) => flag.default_enabled === false),
    JSON.stringify(before.flags),
  );

  const [manifestResponse, healthResponse, loginResponse, executionRoute] = await Promise.all([
    request(`${TARGET.candidateOrigin}/release-manifest.json`),
    request(`${TARGET.candidateOrigin}/healthz`),
    request(`${TARGET.candidateOrigin}/admin/login`),
    request(`${TARGET.candidateOrigin}/admin/assistente/execucao`),
  ]);
  const manifest = validateReleaseManifest(manifestResponse.json, { expectedRelease: expectedSha });
  const health = validateHealthContract(healthResponse.json, {
    expectedRelease: expectedSha,
    expectedEnvironment: "staging",
  });
  check("candidate_release_exact", manifest.valid && health.valid, JSON.stringify({ manifest, health }));
  check(
    "candidate_private_route",
    loginResponse.status === 200 &&
      executionRoute.status === 200 &&
      /no-store/.test(executionRoute.headers.get("cache-control") ?? ""),
    `login=${loginResponse.status}; execution=${executionRoute.status}`,
  );

  const unauthenticated = await request(`${context.url}/functions/v1/cms-ai-execute`, {
    method: "POST",
    headers: { apikey: context.anonKey, Origin: TARGET.candidateOrigin },
    body: { envelope: envelope(), action: "capability" },
    allowed: [401],
  });
  check("authentication_required", unauthenticated.status === 401, unauthenticated.status);

  operator = await createActor(context, "super_admin", "operator");
  reviewer = await createActor(context, "reviewer", "reviewer");
  check("two_synthetic_mfa_users", Boolean(operator.token && reviewer.token), actorIds.length);

  const preOverride = await ai(context, operator, "capability");
  check("individual_flags_default_closed", preOverride.json.enabled === false, preOverride.json.source);

  const broadOverrides = await rest(context, "cms_feature_flag_overrides", {
    query:
      "flag_key=eq.ev2.ai_execute&scope_type=neq.user&enabled=eq.true&select=id,environment,starts_at,expires_at",
  });
  const overrideClock = await authenticationClock(context);
  const activeBroadOverrides = broadOverrides.json.filter(
    (entry) => Date.parse(entry.starts_at) <= overrideClock && Date.parse(entry.expires_at) > overrideClock,
  );
  check("no_broad_activation_present", activeBroadOverrides.length === 0, activeBroadOverrides.length);

  await installOverride(context, operator.id, "ev2.ai_assist", operator.id);
  const operatorExecute = await installOverride(context, operator.id, "ev2.ai_execute", operator.id);
  await installOverride(context, reviewer.id, "ev2.ai_assist", operator.id);
  await installOverride(context, reviewer.id, "ev2.ai_execute", operator.id);

  const [operatorCapability, reviewerCapability] = await Promise.all([
    ai(context, operator, "capability"),
    ai(context, reviewer, "capability"),
  ]);
  check(
    "dual_individual_overrides",
    operatorCapability.json.enabled === true &&
      reviewerCapability.json.enabled === true &&
      operatorCapability.json.source === "individual_overrides",
    `${operatorCapability.json.source}/${reviewerCapability.json.source}`,
  );
  check(
    "synthetic_provider_boundary",
    operatorCapability.json.providerMode === "synthetic" &&
      operatorCapability.json.externalProviderEnabled === false &&
      operatorCapability.json.realDataAllowed === false &&
      operatorCapability.json.syntheticOnly === true,
    JSON.stringify({
      providerMode: operatorCapability.json.providerMode,
      externalProviderEnabled: operatorCapability.json.externalProviderEnabled,
      realDataAllowed: operatorCapability.json.realDataAllowed,
    }),
  );

  await rest(context, "cms_feature_flag_overrides", {
    method: "PATCH",
    query: `id=eq.${operatorExecute}`,
    prefer: "return=minimal",
    body: { enabled: false },
  });
  const oneFlagOnly = await ai(context, operator, "capability");
  check("dual_flag_required", oneFlagOnly.json.enabled === false, oneFlagOnly.json.source);
  await rest(context, "cms_feature_flag_overrides", {
    method: "PATCH",
    query: `id=eq.${operatorExecute}`,
    prefer: "return=minimal",
    body: { enabled: true },
  });

  const workspace = await ai(context, operator, "workspace");
  check(
    "closed_tool_catalog",
    workspace.json.tools.length === 5 &&
      workspace.json.tools.every((tool) => tool.syntheticOnly && tool.reversible && tool.active),
    workspace.json.tools.map((tool) => tool.key).join(","),
  );
  check(
    "policy_contract",
    workspace.json.policy.gate === "G14" &&
      workspace.json.policy.productionAllowed === false &&
      workspace.json.policy.externalProviderEnabled === false &&
      workspace.json.policy.reviewerSeparationRequired === true,
    JSON.stringify(workspace.json.policy),
  );

  const aal1 = await ai(
    context,
    operator,
    "create_target",
    {
      targetRef: `${targetRef}-aal1`,
      targetTitle: "Alvo sintético AAL1",
      targetSummary: "Tentativa sintética sem MFA.",
    },
    { aal1: true, idempotencyKey: randomUUID(), allowed: [412] },
  );
  check("mfa_required", aal1.json.code === "CMS_AI_EXECUTE_MFA_REQUIRED", aal1.json.code);

  const production = await ai(
    context,
    operator,
    "capability",
    {},
    { environment: "production", allowed: [403] },
  );
  check(
    "production_denied",
    production.json.code === "CMS_AI_EXECUTE_PRODUCTION_GATED",
    production.json.code,
  );

  const unsafe = await ai(
    context,
    operator,
    "create_target",
    {
      targetRef: `${targetRef}-unsafe`,
      targetTitle: "Contato qa@example.com",
      targetSummary: "Carga negativa sintética.",
    },
    { idempotencyKey: randomUUID(), allowed: [400] },
  );
  check("personal_data_denied", unsafe.json.code === "CMS_AI_EXECUTE_INPUT_DENIED", unsafe.json.code);

  const targetCreationAttempts = [
    { envelope: envelope(), idempotencyKey: randomUUID() },
    { envelope: envelope(), idempotencyKey: randomUUID() },
  ];
  const targetCreations = await Promise.all(
    targetCreationAttempts.map((attempt) =>
      ai(
        context,
        operator,
        "create_target",
        {
          targetRef,
          targetTitle: "Alvo sintético do canary G14",
          targetSummary: "Estado sintético inicial do canary.",
        },
        { ...attempt, allowed: [200, 409] },
      ),
    ),
  );
  const createdTarget = targetCreations.find((response) => response.status === 200);
  const targetConflict = targetCreations.find((response) => response.status === 409);
  check(
    "concurrent_target_creation_single_winner",
    targetCreations.filter((response) => response.status === 200).length === 1 &&
      targetCreations.filter((response) => response.status === 409).length === 1 &&
      createdTarget?.json.targetRef === targetRef &&
      createdTarget?.json.applied === false &&
      targetConflict?.json.code === "CMS_AI_EXECUTE_TARGET_CONFLICT",
    targetCreations.map((response) => `${response.status}:${response.json.code ?? "created"}`).join(","),
  );
  if (!createdTarget) throw new Error("Criação concorrente do alvo G14 ficou sem vencedor.");

  const steps = [
    {
      stepKey: "step-canary-patch",
      toolKey: "draft.apply_patch",
      targetRef,
      expectedVersion: 1,
      arguments: { patch: { summary: "Estado sintético revisado pelo canary." } },
    },
    {
      stepKey: "step-canary-submit",
      toolKey: "workflow.submit",
      targetRef,
      expectedVersion: 2,
      arguments: {},
    },
    {
      stepKey: "step-canary-publish",
      toolKey: "release.publish",
      targetRef,
      expectedVersion: 3,
      arguments: {},
    },
  ];
  const createdPlan = await ai(
    context,
    operator,
    "create_plan",
    { title: "Plano crítico sintético G14", steps },
    { idempotencyKey: randomUUID() },
  );
  check(
    "dry_run_plan_created",
    createdPlan.json.status === "ready" && /^[a-f0-9]{64}$/.test(createdPlan.json.planHash),
    createdPlan.json.planHash,
  );

  const planId = createdPlan.json.planId;
  const planHash = createdPlan.json.planHash;
  const reviewerWorkspace = await ai(context, reviewer, "workspace");
  const reviewable = reviewerWorkspace.json.plans.find((plan) => plan.id === planId);
  check(
    "review_queue_segregated",
    reviewable?.owned === false && reviewable?.approvable === true,
    JSON.stringify({ owned: reviewable?.owned, approvable: reviewable?.approvable }),
  );

  const selfApproval = await ai(
    context,
    operator,
    "approve_plan",
    {
      planId,
      expectedPlanHash: planHash,
      decision: "approved",
      rationale: "Tentativa negativa de autoaprovação.",
    },
    { idempotencyKey: randomUUID(), allowed: [409] },
  );
  check(
    "self_approval_denied",
    selfApproval.json.code === "CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED",
    selfApproval.json.code,
  );

  const changedHash = await ai(
    context,
    reviewer,
    "approve_plan",
    {
      planId,
      expectedPlanHash: "f".repeat(64),
      decision: "approved",
      rationale: "Tentativa negativa com hash divergente.",
    },
    { idempotencyKey: randomUUID(), allowed: [409] },
  );
  check(
    "changed_hash_denied",
    changedHash.json.code === "CMS_AI_EXECUTE_PLAN_CONFLICT",
    changedHash.json.code,
  );

  const approval = await ai(
    context,
    reviewer,
    "approve_plan",
    {
      planId,
      expectedPlanHash: planHash,
      decision: "approved",
      rationale: "Dry-run e escopo sintético conferidos pelo revisor G14.",
    },
    { idempotencyKey: randomUUID() },
  );
  check("distinct_reviewer_approval", approval.json.status === "approved", approval.json.status);

  const reviewerExecution = await ai(
    context,
    reviewer,
    "execute_plan",
    { planId, expectedPlanHash: planHash },
    { idempotencyKey: randomUUID(), allowed: [403, 409] },
  );
  check(
    "approver_cannot_execute",
    ["CMS_AI_EXECUTE_FORBIDDEN", "CMS_AI_EXECUTE_OPERATOR_SEPARATION_REQUIRED"].includes(
      reviewerExecution.json.code,
    ),
    reviewerExecution.json.code,
  );

  const executionAttempts = [
    { envelope: envelope(), idempotencyKey: randomUUID() },
    { envelope: envelope(), idempotencyKey: randomUUID() },
  ];
  const concurrentExecutions = await Promise.all(
    executionAttempts.map((attempt) =>
      ai(
        context,
        operator,
        "execute_plan",
        { planId, expectedPlanHash: planHash },
        { ...attempt, allowed: [200, 409] },
      ),
    ),
  );
  const winnerIndex = concurrentExecutions.findIndex((response) => response.status === 200);
  const executed = concurrentExecutions[winnerIndex];
  const conflict = concurrentExecutions.find((response) => response.status === 409);
  check(
    "concurrent_execution_single_winner",
    concurrentExecutions.filter((response) => response.status === 200).length === 1 &&
      concurrentExecutions.filter((response) => response.status === 409).length === 1 &&
      conflict?.json.code === "CMS_AI_EXECUTE_PLAN_CONFLICT",
    concurrentExecutions
      .map((response) => `${response.status}:${response.json.code ?? "executed"}`)
      .join(","),
  );
  if (!executed || winnerIndex < 0) throw new Error("Execução concorrente G14 sem vencedor único.");
  const executionWinner = executionAttempts[winnerIndex];
  const replay = await ai(
    context,
    operator,
    "execute_plan",
    { planId, expectedPlanHash: planHash },
    executionWinner,
  );
  check(
    "atomic_idempotent_execution",
    executed.json.status === "executed" &&
      executed.json.applied === true &&
      executed.json.runId === replay.json.runId,
    executed.json.runId,
  );

  const runId = executed.json.runId;
  const postExecution = await ai(context, operator, "workspace");
  const publishedTarget = postExecution.json.targets.find((target) => target.reference === targetRef);
  check(
    "synthetic_publication_only",
    publishedTarget?.lifecycle === "published" && publishedTarget?.version === 4,
    JSON.stringify({ lifecycle: publishedTarget?.lifecycle, version: publishedTarget?.version }),
  );

  const selfCompensationApproval = await ai(
    context,
    operator,
    "approve_compensation",
    {
      runId,
      expectedPlanHash: planHash,
      rationale: "Tentativa negativa de aprovar a própria compensação.",
    },
    { idempotencyKey: randomUUID(), allowed: [409] },
  );
  check(
    "self_compensation_approval_denied",
    selfCompensationApproval.json.code === "CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED",
    selfCompensationApproval.json.code,
  );

  const compensationApproval = await ai(
    context,
    reviewer,
    "approve_compensation",
    {
      runId,
      expectedPlanHash: planHash,
      rationale: "Snapshots sintéticos e restauração conferidos.",
    },
    { idempotencyKey: randomUUID() },
  );
  check(
    "compensation_approved_by_other_actor",
    compensationApproval.json.status === "compensation_approved",
    compensationApproval.json.status,
  );

  const approvalClock = await authenticationClock(context);
  await rest(context, "cms_ai_execution_approvals", {
    method: "PATCH",
    query: `plan_id=eq.${planId}&purpose=eq.compensate&status=eq.active`,
    prefer: "return=minimal",
    body: {
      created_at: new Date(approvalClock - 10 * 60_000).toISOString(),
      expires_at: new Date(approvalClock - 1_000).toISOString(),
    },
  });
  const expiredCompensationWorkspace = await ai(context, operator, "workspace");
  const expiredCompensationPlan = expiredCompensationWorkspace.json.plans.find((plan) => plan.id === planId);
  check(
    "expired_compensation_approval_closed",
    expiredCompensationPlan?.runs[0]?.compensationApproved === false &&
      expiredCompensationPlan?.compensatable === false,
    JSON.stringify({
      compensationApproved: expiredCompensationPlan?.runs[0]?.compensationApproved,
      compensatable: expiredCompensationPlan?.compensatable,
    }),
  );

  const renewedCompensationApproval = await ai(
    context,
    reviewer,
    "approve_compensation",
    {
      runId,
      expectedPlanHash: planHash,
      rationale: "Renovação sintética após expiração conferida.",
    },
    { idempotencyKey: randomUUID() },
  );
  const compensationApprovalHistory = await rest(context, "cms_ai_execution_approvals", {
    query: `plan_id=eq.${planId}&purpose=eq.compensate&select=status`,
  });
  check(
    "expired_compensation_approval_renewed",
    renewedCompensationApproval.json.status === "compensation_approved" &&
      compensationApprovalHistory.json.length === 2 &&
      compensationApprovalHistory.json.filter((approval) => approval.status === "expired").length === 1 &&
      compensationApprovalHistory.json.filter((approval) => approval.status === "active").length === 1,
    compensationApprovalHistory.json.map((approval) => approval.status).join(","),
  );

  const reviewerCompensation = await ai(
    context,
    reviewer,
    "compensate_run",
    { runId, expectedPlanHash: planHash },
    { idempotencyKey: randomUUID(), allowed: [403, 409] },
  );
  check(
    "compensation_approver_cannot_execute",
    ["CMS_AI_EXECUTE_FORBIDDEN", "CMS_AI_EXECUTE_OPERATOR_SEPARATION_REQUIRED"].includes(
      reviewerCompensation.json.code,
    ),
    reviewerCompensation.json.code,
  );

  const [duplicateCompensationApproval, compensated] = await Promise.all([
    ai(
      context,
      reviewer,
      "approve_compensation",
      {
        runId,
        expectedPlanHash: planHash,
        rationale: "Tentativa concorrente com aprovação ativa.",
      },
      { idempotencyKey: randomUUID(), allowed: [404, 409] },
    ),
    ai(
      context,
      operator,
      "compensate_run",
      { runId, expectedPlanHash: planHash },
      { idempotencyKey: randomUUID() },
    ),
  ]);
  check(
    "concurrent_recovery_has_no_deadlock",
    compensated.status === 200 &&
      ["CMS_AI_EXECUTE_APPROVAL_CONFLICT", "CMS_AI_EXECUTE_RUN_NOT_FOUND"].includes(
        duplicateCompensationApproval.json.code,
      ),
    `${compensated.status}/${duplicateCompensationApproval.status}:${duplicateCompensationApproval.json.code}`,
  );
  const postCompensation = await ai(context, operator, "workspace");
  const restoredTarget = postCompensation.json.targets.find((target) => target.reference === targetRef);
  check(
    "monotonic_compensation",
    compensated.json.status === "compensated" &&
      restoredTarget?.lifecycle === "draft" &&
      restoredTarget?.version === 5 &&
      restoredTarget?.payload?.summary === "Estado sintético inicial do canary.",
    JSON.stringify({
      status: compensated.json.status,
      lifecycle: restoredTarget?.lifecycle,
      version: restoredTarget?.version,
    }),
  );

  const decisions = await rest(context, "cms_ai_execution_policy_decisions", {
    query: `actor_id=in.(${actorIds.join(",")})&select=action,decision,reason_code`,
  });
  check(
    "policy_audit_complete",
    decisions.json.some(
      (decision) =>
        decision.action === "record_denial" && decision.reason_code === "CMS_AI_EXECUTE_INPUT_DENIED",
    ) &&
      decisions.json.some(
        (decision) =>
          decision.action === "execute_plan" && decision.reason_code === "CMS_AI_EXECUTE_PLAN_EXECUTED",
      ) &&
      decisions.json.some(
        (decision) =>
          decision.action === "compensate_run" && decision.reason_code === "CMS_AI_EXECUTE_RUN_COMPENSATED",
      ) &&
      decisions.json.some(
        (decision) =>
          decision.action === "record_denial" &&
          decision.reason_code === "CMS_AI_EXECUTE_REVIEWER_SEPARATION_REQUIRED",
      ) &&
      decisions.json.some(
        (decision) =>
          decision.action === "record_denial" && decision.reason_code === "CMS_AI_EXECUTE_PLAN_CONFLICT",
      ),
    `decisions=${decisions.json.length}`,
  );

  const after = await baseline(context);
  check(
    "production_and_stable_state_unchanged",
    before.stableRelease === after.stableRelease &&
      before.revisions === after.revisions &&
      before.outbox === after.outbox &&
      JSON.stringify(before.flags) === JSON.stringify(after.flags),
    JSON.stringify({ before, after }),
  );
  finalEvidence = { before, after };
} catch (error) {
  operationError = error;
} finally {
  try {
    await cleanup(context);
    if (context) {
      const residual = await residue(context);
      residualEvidence = residual;
      check("synthetic_residue_zero", residual === 0, residual);
    }
  } catch (error) {
    cleanupError = error;
  }
}

const failed = Boolean(operationError || cleanupError);
const report = {
  schemaVersion: 1,
  gate: "G14",
  outcome: failed ? "G14_CANARY_FAIL" : "G14_CANARY_PASS",
  target: TARGET,
  candidateSha: expectedSha,
  startedAt,
  completedAt: new Date().toISOString(),
  checks: checks.length,
  passed: checks.filter((item) => item.result === "PASS").length,
  checkResults: checks,
  providerMode: "synthetic",
  externalProviderCalls: 0,
  realDataUsed: false,
  productionMutations: 0,
  stableState: finalEvidence ?? null,
  syntheticResidue: residualEvidence,
  failures: {
    operation: reportableFailure(operationError, "G14_CANARY_OPERATION_FAILED"),
    cleanup: reportableFailure(cleanupError, "G14_CANARY_CLEANUP_FAILED"),
  },
};
writeReport(report);
console.log(JSON.stringify(report, null, 2));

if (failed)
  throw new AggregateError(
    [operationError, cleanupError].filter(Boolean),
    "Canary G14 falhou; consulte os erros operacional e de limpeza.",
  );
