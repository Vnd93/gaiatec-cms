import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { validateHealthContract, validateReleaseManifest } from "../phase12/release-guard-lib.mjs";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  candidateOrigin:
    process.env.EV2_G13_CANDIDATE_ORIGIN ?? "https://ev2-g13-canary.gaiatec-cms-staging.pages.dev",
  stableOrigin: "https://gaiatec-cms-staging.pages.dev",
};
const expectedSha = process.env.EV2_G13_EXPECTED_SHA ?? "";
if (TARGET.candidateOrigin !== "https://ev2-g13-canary.gaiatec-cms-staging.pages.dev")
  throw new Error("ALVO RECUSADO: o G13 opera somente no alias isolado ev2-g13-canary.");
if (!/^[a-f0-9]{40}$/.test(expectedSha))
  throw new Error("Defina EV2_G13_EXPECTED_SHA com o SHA completo explicitamente autorizado.");

const FEATURE_KEYS = [
  "ev2.release_skeleton",
  "ev2.draft_v2",
  "ev2.master_data",
  "ev2.pim_v2",
  "ev2.dam",
  "ev2.search_quality",
  "ev2.collaboration_bulk",
  "ev2.rbac_scoped",
  "ev2.visual_studio",
  "ev2.multisite",
  "ev2.ai_assist",
  "ev2.ai_execute",
  "ev2.system_assurance",
];
const startedAt = new Date().toISOString();
const runId = randomUUID();
const checks = [];
const actorIds = [];
const overrideIds = [];
let context;
let operator;
let reviewer;

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_@./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function runCommand(binary, args) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : binary;
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", [binary, ...args].map(quoteWindowsArgument).join(" ")]
      : args;
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

function supabaseJson(args) {
  return JSON.parse(runCommand("npx", ["--yes", "supabase@2.116.0", ...args, "--output", "json"]));
}

function check(name, condition, detail) {
  const result = condition ? "PASS" : "FAIL";
  checks.push({ name, result, detail });
  console.log(JSON.stringify({ event: "g13.check", name, result, detail }));
  if (!condition) throw new Error(`${name}: ${detail}`);
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
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
  return { status: response.status, json: payload, headers: response.headers };
}

async function loadContext() {
  const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
  if (!project || project.name !== TARGET.name || project.region !== TARGET.region || !project.linked)
    throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado.");
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

async function rpc(ctx, name, body) {
  return request(`${ctx.url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: ctx.serviceHeaders,
    body,
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
  const email = `ev2-g13-${label}-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${ctx.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: ctx.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g13", label, expires_in_minutes: 30 },
    },
  });
  actorIds.push(created.json.id);
  await rest(ctx, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: created.json.id,
      display_name: `${label.toUpperCase()}-G13 sintético`,
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
  const enrolled = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `EV2 G13 ${label}`,
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
      return { id: created.json.id, token };
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
      reason: "Canary sintético EV2.13 autorizado por 30 minutos.",
      starts_at: new Date(now - 1000).toISOString(),
      expires_at: new Date(now + 29 * 60_000).toISOString(),
      created_by: createdBy,
    },
  });
  overrideIds.push(created.json[0].id);
}

async function session(ctx, actor, allowed = [200]) {
  return request(`${ctx.url}/functions/v1/cms-session`, {
    method: "POST",
    headers: {
      apikey: ctx.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: TARGET.candidateOrigin,
    },
    body: { action: "resolve" },
    allowed,
  });
}

function capability(manifest, key) {
  return manifest?.capabilities?.[key];
}

function manifestIsComplete(manifest, environment, status) {
  return (
    manifest?.schemaVersion === 1 &&
    manifest.environment === environment &&
    manifest.siteKey === "main" &&
    manifest.status === status &&
    Number.isFinite(Date.parse(manifest.evaluatedAt ?? "")) &&
    Object.keys(manifest.capabilities ?? {}).length === FEATURE_KEYS.length &&
    FEATURE_KEYS.every((key) => manifest.capabilities?.[key]?.key === key)
  );
}

async function closeSyntheticResidue(ctx) {
  if (overrideIds.length)
    await rest(ctx, "cms_feature_flag_overrides", {
      method: "DELETE",
      query: `id=in.(${overrideIds.join(",")})`,
    });
  if (!actorIds.length) return;
  const now = new Date().toISOString();
  for (const actorId of actorIds)
    await rest(ctx, "cms_profiles", {
      method: "PATCH",
      query: `user_id=eq.${actorId}`,
      prefer: "return=minimal",
      body: { status: "suspended", suspended_at: now, suspended_by: operator?.id ?? actorId },
    });
  for (const actorId of actorIds)
    await request(`${ctx.url}/auth/v1/admin/users/${actorId}`, {
      method: "PUT",
      headers: ctx.serviceHeaders,
      body: { ban_duration: "876000h" },
    });
}

async function residue(ctx) {
  const [profiles, overrides, authUsers, retainedActors] = await Promise.all([
    actorIds.length
      ? rest(ctx, "cms_profiles", {
          query: `user_id=in.(${actorIds.join(",")})&status=eq.active&select=user_id`,
        })
      : Promise.resolve({ json: [] }),
    actorIds.length
      ? rest(ctx, "cms_feature_flag_overrides", {
          query: `scope_type=eq.user&scope_key=in.(${actorIds.join(",")})&select=id`,
        })
      : Promise.resolve({ json: [] }),
    Promise.all(
      actorIds.map((actorId) =>
        request(`${ctx.url}/auth/v1/admin/users/${actorId}`, {
          headers: ctx.serviceHeaders,
          allowed: [200, 404],
        }),
      ),
    ),
    rest(ctx, "cms_profiles", {
      query: "display_email=like.ev2-g13-*@example.invalid&select=user_id",
    }),
  ]);
  return {
    activeActors: profiles.json.length,
    activeCredentials: authUsers.filter((response) => {
      if (response.status !== 200) return false;
      const bannedUntil = Date.parse(response.json?.banned_until ?? "");
      return !Number.isFinite(bannedUntil) || bannedUntil <= Date.now();
    }).length,
    activeOverrides: overrides.json.length,
    personalPayloads: 0,
    retainedSyntheticActors: retainedActors.json.length,
    semantics: "zero-active-residue; retained security tombstones counted separately",
  };
}

let operationError;
let cleanupError;
let finalResidue;
let revocationLatencyMs;
try {
  context = await loadContext();
  const [health, releaseManifest, flags] = await Promise.all([
    request(`${TARGET.candidateOrigin}/healthz`),
    request(`${TARGET.candidateOrigin}/release-manifest.json`),
    rest(context, "cms_feature_flags", {
      query: "flag_key=in.(ev2.dam,ev2.ai_assist)&select=flag_key,default_enabled,kill_switch&order=flag_key",
    }),
  ]);
  const healthValidation = validateHealthContract(health.json, {
    expectedRelease: expectedSha,
    expectedEnvironment: "staging",
  });
  const manifestValidation = validateReleaseManifest(releaseManifest.json, {
    expectedRelease: expectedSha,
  });
  check(
    "immutable_candidate_contract",
    health.headers.get("content-type")?.includes("application/json") &&
      releaseManifest.headers.get("content-type")?.includes("application/json") &&
      healthValidation.valid &&
      manifestValidation.valid &&
      health.json.release === releaseManifest.json.release,
    JSON.stringify({ health: healthValidation.violations, manifest: manifestValidation.violations }),
  );
  check(
    "global_flags_default_off",
    flags.json.length === 2 &&
      flags.json.every((flag) => flag.default_enabled === false && flag.kill_switch === false),
    JSON.stringify(flags.json),
  );

  operator = await createActor(context, "super_admin", "operator");
  reviewer = await createActor(context, "technical", "reviewer");
  await installOverride(context, operator.id, "ev2.dam", operator.id);
  await installOverride(context, reviewer.id, "ev2.ai_assist", operator.id);

  const [operatorSession, reviewerSession] = await Promise.all([
    session(context, operator),
    session(context, reviewer),
  ]);
  const operatorManifest = operatorSession.json.ev2Capabilities;
  const reviewerManifest = reviewerSession.json.ev2Capabilities;
  check(
    "aggregate_manifest_complete",
    manifestIsComplete(operatorManifest, "staging", "ready") &&
      manifestIsComplete(reviewerManifest, "staging", "ready"),
    JSON.stringify({ operatorStatus: operatorManifest?.status, reviewerStatus: reviewerManifest?.status }),
  );
  check(
    "same_build_identity_isolation",
    capability(operatorManifest, "ev2.dam")?.enabled === true &&
      capability(operatorManifest, "ev2.dam")?.source === "override" &&
      capability(operatorManifest, "ev2.ai_assist")?.enabled === false &&
      capability(reviewerManifest, "ev2.ai_assist")?.enabled === true &&
      capability(reviewerManifest, "ev2.ai_assist")?.source === "override" &&
      capability(reviewerManifest, "ev2.dam")?.enabled === false,
    JSON.stringify({ operator: operatorManifest, reviewer: reviewerManifest }),
  );

  const anonymous = await request(`${context.url}/functions/v1/cms-session`, {
    method: "POST",
    headers: { apikey: context.anonKey, Origin: TARGET.candidateOrigin },
    body: { action: "resolve" },
    allowed: [401],
  });
  check("anonymous_session_denied", anonymous.status === 401, anonymous.status);

  const production = await rpc(context, "cms_runtime_capability_manifest", {
    p_actor_id: operator.id,
    p_environment: "production",
    p_site_key: "main",
    p_aal: "aal2",
    p_session_id: "g13-production-negative",
    p_issued_at: new Date().toISOString(),
  });
  check(
    "production_manifest_gated",
    manifestIsComplete(production.json, "production", "gated") &&
      FEATURE_KEYS.every((key) => capability(production.json, key)?.enabled === false),
    JSON.stringify(production.json),
  );

  const deniedSearch = await request(`${context.url}/functions/v1/cms-public?type=search-v2&q=g13`, {
    headers: { apikey: context.anonKey, Origin: TARGET.candidateOrigin },
    allowed: [404],
  });
  check("anonymous_search_v2_closed", deniedSearch.status === 404, deniedSearch.status);
  const publicV1 = await request(`${context.url}/functions/v1/cms-public?type=search&q=g13`, {
    headers: { apikey: context.anonKey, Origin: TARGET.candidateOrigin },
  });
  check("public_search_v1_preserved", Array.isArray(publicV1.json?.items), publicV1.status);

  const revokedAt = performance.now();
  const operatorOverride = overrideIds[0];
  await rest(context, "cms_feature_flag_overrides", {
    method: "DELETE",
    query: `id=eq.${operatorOverride}`,
  });
  overrideIds.shift();
  let revokedManifest;
  do {
    revokedManifest = (await session(context, operator)).json.ev2Capabilities;
    if (capability(revokedManifest, "ev2.dam")?.enabled === false) break;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  } while (performance.now() - revokedAt < 60_000);
  revocationLatencyMs = Math.round(performance.now() - revokedAt);
  check(
    "individual_revocation_within_60s",
    capability(revokedManifest, "ev2.dam")?.enabled === false && revocationLatencyMs <= 60_000,
    revocationLatencyMs,
  );
} catch (error) {
  operationError = error;
} finally {
  try {
    if (context) {
      await closeSyntheticResidue(context);
      finalResidue = await residue(context);
      check(
        "synthetic_active_residue_zero",
        finalResidue.activeActors === 0 &&
          finalResidue.activeCredentials === 0 &&
          finalResidue.activeOverrides === 0 &&
          finalResidue.personalPayloads === 0,
        JSON.stringify(finalResidue),
      );
    }
  } catch (error) {
    cleanupError = error;
  }
}

if (operationError || cleanupError)
  throw new AggregateError(
    [operationError, cleanupError].filter(Boolean),
    "Canary G13 falhou; consulte a operação e o encerramento seguro.",
  );

const evidence = {
  schemaVersion: 1,
  outcome: "G13_CANARY_PASS",
  suiteKey: "g13-runtime-eligibility-reduced-v1",
  environment: "staging",
  runId,
  candidateSha: expectedSha,
  candidateOrigin: TARGET.candidateOrigin,
  stableOrigin: TARGET.stableOrigin,
  startedAt,
  finishedAt: new Date().toISOString(),
  checks: checks.length,
  passed: checks.filter((item) => item.result === "PASS").length,
  revocationLatencyMs,
  syntheticOnly: true,
  realDataUsed: false,
  realDomainsUsed: false,
  productionMutations: 0,
  globalActivationMutations: 0,
  stablePromoted: false,
  syntheticResidue: finalResidue,
};
const report = {
  ...evidence,
  evidenceHash: createHash("sha256").update(JSON.stringify(evidence)).digest("hex"),
};

if (process.env.EV2_G13_REPORT_PATH) {
  const workspaceRoot = path.resolve(process.cwd());
  const reportPath = path.resolve(process.env.EV2_G13_REPORT_PATH);
  if (
    !reportPath.startsWith(`${workspaceRoot}${path.sep}`) ||
    reportPath.includes(`${path.sep}.git${path.sep}`)
  )
    throw new Error("G13_REPORT_PATH_REFUSED: o relatório deve permanecer dentro do workspace.");
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}
console.log(JSON.stringify(report, null, 2));
