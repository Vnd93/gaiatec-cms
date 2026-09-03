import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g8-canary.gaiatec-cms-staging.pages.dev",
};
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const fixturePrefix = `g8x${suffix}`;
const contentItemId = randomUUID();
const actorIds = [];
const policyCorrelations = [];
const results = [];

function quoteWindowsArgument(value) {
  if (/^[A-Za-z0-9_./:\\=-]+$/.test(value)) return value;
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

function runSupabase(args) {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const commandArgs =
    process.platform === "win32"
      ? ["/d", "/s", "/c", ["npx", "supabase", ...args].map(quoteWindowsArgument).join(" ")]
      : ["supabase", ...args];
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 20 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const details = [result.error?.message, result.stdout?.trim(), result.stderr?.trim()]
      .filter(Boolean)
      .join("\n");
    throw new Error(details || "Supabase CLI falhou.");
  }
  return result.stdout;
}

function supabaseJson(args) {
  return JSON.parse(runSupabase([...args, "--output", "json"]));
}

function executeCleanupSql(sql) {
  const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g8-cleanup-"));
  const file = path.join(directory, "cleanup.sql");
  const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
  try {
    writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
    runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function check(name, condition, detail) {
  const result = condition ? "PASS" : "FAIL";
  results.push({ name, result, detail });
  console.log(JSON.stringify({ event: "g8.check", name, result, detail }));
  if (!condition) throw new Error(`${name}: ${detail}`);
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  if (!allowed.includes(response.status))
    throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status} ${JSON.stringify(json)}`);
  return { status: response.status, json, durationMs: performance.now() - startedAt };
}

async function loadContext() {
  const projects = supabaseJson(["projects", "list"]);
  const project = projects.find((entry) => entry.ref === TARGET.ref);
  if (!project || project.name !== TARGET.name || project.region !== TARGET.region || project.linked !== true)
    throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado.");
  const keys = supabaseJson(["projects", "api-keys", "--project-ref", TARGET.ref, "--reveal"]);
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("Chaves exclusivas do staging indisponíveis.");
  return {
    project,
    anonKey,
    serviceKey,
    url: `https://${TARGET.ref}.supabase.co`,
    serviceHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  };
}

async function rest(context, table, { method = "GET", query = "", body, prefer } = {}) {
  return request(`${context.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: { ...context.serviceHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body,
    allowed: method === "POST" ? [200, 201] : method === "DELETE" ? [200, 204] : [200, 204],
  });
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

async function invoke(context, actor, functionName, body, { idempotencyKey, allowed = [200] } = {}) {
  return request(`${context.url}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: TARGET.origin,
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body,
    allowed,
  });
}

async function scopeCommand(
  context,
  actor,
  action,
  values = {},
  { allowed = [200], idempotencyKey, environment = "staging", expectPolicy = true } = {},
) {
  const commandEnvelope = envelope(environment);
  if (expectPolicy && action !== "capability") policyCorrelations.push(commandEnvelope.correlationId);
  return invoke(
    context,
    actor,
    "cms-scopes",
    { envelope: commandEnvelope, action, ...values },
    { idempotencyKey, allowed },
  );
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

function totp(secret, at = Date.now()) {
  const counter = Math.floor(at / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

async function authenticationClock(context) {
  const response = await fetch(`${context.url}/auth/v1/health`, {
    headers: { apikey: context.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const serverDate = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(serverDate) ? serverDate : Date.now();
}

async function createActor(context, legacyRole, label) {
  const email = `ev2-g8-${label}-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g8", label, expires_in_minutes: 30 },
    },
  });
  const actorId = created.json.id;
  actorIds.push(actorId);
  await rest(context, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: actorId,
      display_name: `${label.toUpperCase()}-G8 sintético`,
      display_email: email,
      status: "active",
    },
  });
  await rest(context, "cms_user_roles", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: actorId, role_key: legacyRole },
  });
  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sessão AAL1 ausente.");
  const aal1Token = signedIn.data.session.access_token;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `EV2 G8 ${label}` });
  if (enrolled.error) throw enrolled.error;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenged = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenged.error) throw challenged.error;
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenged.data.id,
      code: totp(enrolled.data.totp.secret, await authenticationClock(context)),
    });
    const token = verified.data?.session?.access_token ?? verified.data?.access_token;
    if (!verified.error && token) return { id: actorId, token, aal1Token };
    lastError = verified.error ?? new Error("Sessão AAL2 ausente.");
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError;
}

async function installIndividualOverride(context, actorId, createdBy) {
  return rest(context, "cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.rbac_scoped",
      environment: "staging",
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: "Canary sintético individual do Gate G8",
      starts_at: new Date(Date.now() - 5_000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      created_by: createdBy,
    },
  });
}

async function cleanup(context) {
  if (actorIds.length === 0) return;
  const actors = actorIds.map((id) => `'${id}'::uuid`).join(",");
  const actorKeys = actorIds.map((id) => `'${id}'`).join(",");
  executeCleanupSql(`
begin;
delete from public.cms_scope_command_receipts where actor_id in (${actors}) or target_user_id in (${actors});
alter table public.cms_policy_decisions disable trigger cms_policy_decisions_immutable;
delete from public.cms_policy_decisions where actor_id in (${actors});
alter table public.cms_policy_decisions enable trigger cms_policy_decisions_immutable;
delete from public.cms_scoped_role_assignments where user_id in (${actors});
delete from public.cms_feature_flag_overrides
where flag_key = 'ev2.rbac_scoped'
  and (created_by in (${actors}) or scope_key in (${actorKeys}) or scope_key = '${fixturePrefix}');
delete from public.cms_editorial_command_receipts where actor_id in (${actors}) or item_id = '${contentItemId}'::uuid;
delete from public.cms_content_items where id = '${contentItemId}'::uuid;
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id in (${actors});
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
alter table public.cms_login_events disable trigger cms_login_events_immutable;
delete from public.cms_login_events where user_id in (${actors});
alter table public.cms_login_events enable trigger cms_login_events_immutable;
delete from public.cms_session_revocations where user_id in (${actors});
delete from public.cms_command_receipts where actor_id in (${actors}) or target_user_id in (${actors});
delete from public.cms_user_roles where user_id in (${actors});
delete from public.cms_profiles where user_id in (${actors});
commit;
  `);
  for (const actorId of actorIds)
    await request(`${context.url}/auth/v1/admin/users/${actorId}`, {
      method: "DELETE",
      headers: context.serviceHeaders,
      allowed: [200, 204],
    });
}

async function verifyResidue(context) {
  const checks = await Promise.all([
    ...actorIds.map((id) => rest(context, "cms_profiles", { query: `user_id=eq.${id}&select=user_id` })),
    ...actorIds.map((id) =>
      rest(context, "cms_scoped_role_assignments", { query: `user_id=eq.${id}&select=id` }),
    ),
    ...actorIds.map((id) =>
      rest(context, "cms_feature_flag_overrides", { query: `scope_key=eq.${id}&select=id` }),
    ),
    rest(context, "cms_content_items", { query: `id=eq.${contentItemId}&select=id` }),
    rest(context, "cms_feature_flag_overrides", { query: `scope_key=eq.${fixturePrefix}&select=id` }),
  ]);
  return checks.every((entry) => Array.isArray(entry.json) && entry.json.length === 0);
}

async function main() {
  const context = await loadContext();
  const [alias, flag, activeOverrides, schemaProbe] = await Promise.all([
    request(`${TARGET.origin}/admin/login`),
    rest(context, "cms_feature_flags", {
      query: "flag_key=eq.ev2.rbac_scoped&select=default_enabled,kill_switch",
    }),
    rest(context, "cms_feature_flag_overrides", {
      query: `flag_key=eq.ev2.rbac_scoped&enabled=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`,
    }),
    rest(context, "cms_scoped_role_assignments", { query: "select=id&limit=1" }),
  ]);
  check(
    "staging_target_and_candidate_alias",
    alias.status === 200 && Array.isArray(schemaProbe.json),
    TARGET.origin,
  );
  check(
    "global_flag_default_off",
    flag.json.length === 1 && flag.json[0].default_enabled === false && flag.json[0].kill_switch === false,
    `${context.project.name}/${context.project.region}`,
  );
  check(
    "no_preexisting_active_override",
    activeOverrides.json.length === 0,
    `ativos=${activeOverrides.json.length}`,
  );

  let operationError;
  try {
    const operator = await createActor(context, "super_admin", "op");
    const delegated = await createActor(context, "editor", "usr");
    const operatorAal1 = { ...operator, token: operator.aal1Token };

    const beforeOverride = await scopeCommand(context, operator, "capability", {}, { expectPolicy: false });
    check(
      "legacy_fallback_before_override",
      beforeOverride.json.enabled === false && beforeOverride.json.reasonCode === "feature_disabled",
      beforeOverride.json.reasonCode,
    );

    await rest(context, "cms_scoped_role_assignments", {
      method: "POST",
      prefer: "return=representation",
      body: [
        {
          user_id: operator.id,
          role_key: "super_admin",
          site_key: "main",
          environment: "staging",
          grant_type: "direct",
          reason: "Bootstrap sintético segregado do operador G8",
          valid_from: new Date(Date.now() - 5_000).toISOString(),
          granted_by: operator.id,
        },
        {
          user_id: delegated.id,
          role_key: "editor",
          site_key: "main",
          environment: "staging",
          grant_type: "direct",
          reason: "Papel mínimo sintético para os testes negativos G8",
          valid_from: new Date(Date.now() - 5_000).toISOString(),
          granted_by: operator.id,
        },
      ],
    });
    await Promise.all([
      installIndividualOverride(context, operator.id, operator.id),
      installIndividualOverride(context, delegated.id, operator.id),
    ]);

    const [operatorCapability, delegatedCapability] = await Promise.all([
      scopeCommand(context, operator, "capability", {}, { expectPolicy: false }),
      scopeCommand(context, delegated, "capability", {}, { expectPolicy: false }),
    ]);
    check(
      "individual_override_only",
      operatorCapability.json.enabled === true && delegatedCapability.json.enabled === true,
      `OP=${operator.id}; USR=${delegated.id}`,
    );

    const [operatorSession, delegatedSession] = await Promise.all([
      invoke(context, operator, "cms-session", { action: "resolve" }),
      invoke(context, delegated, "cms-session", { action: "resolve" }),
    ]);
    check(
      "session_resolves_effective_scoped_roles",
      operatorSession.json.rbacScoped === true &&
        operatorSession.json.roles.includes("super_admin") &&
        delegatedSession.json.rbacScoped === true &&
        delegatedSession.json.roles.length === 1 &&
        delegatedSession.json.roles[0] === "editor",
      "sessões usam somente papéis efetivos de main/staging",
    );

    const anonymous = await request(`${context.url}/functions/v1/cms-scopes`, {
      method: "POST",
      headers: { apikey: context.anonKey, Origin: TARGET.origin },
      body: { envelope: envelope(), action: "list" },
      allowed: [401],
    });
    check("anonymous_denied_401", anonymous.status === 401, "sessão obrigatória");

    const aal1List = await scopeCommand(context, operatorAal1, "list", {}, { allowed: [412] });
    check(
      "critical_access_requires_aal2_412",
      aal1List.status === 412 && aal1List.json.code === "CMS_SCOPE_AAL2_REQUIRED",
      aal1List.json.code,
    );

    const unauthorizedGrant = await scopeCommand(
      context,
      delegated,
      "grant",
      {
        targetUserId: operator.id,
        roleKey: "auditor",
        grantType: "direct",
        expiresAt: null,
        reason: "Tentativa negativa sem privilégio",
      },
      { allowed: [403], idempotencyKey: randomUUID() },
    );
    check(
      "direct_scope_api_bypass_denied_403",
      unauthorizedGrant.status === 403 && unauthorizedGrant.json.code === "CMS_SCOPE_FORBIDDEN",
      unauthorizedGrant.json.reasonCode,
    );

    const rlsDenied = await request(
      `${context.url}/rest/v1/cms_scoped_role_assignments?select=id,user_id,role_key`,
      {
        headers: { apikey: context.anonKey, Authorization: `Bearer ${delegated.token}` },
        allowed: [401, 403],
      },
    );
    check("direct_rls_bypass_denied", [401, 403].includes(rlsDenied.status), `HTTP ${rlsDenied.status}`);

    await rest(context, "cms_content_items", {
      method: "POST",
      prefer: "return=representation",
      body: {
        id: contentItemId,
        content_type: "page",
        slug: `${fixturePrefix}-deny-publish`,
        workflow_status: "approved",
        created_by: operator.id,
        updated_by: operator.id,
      },
    });
    const publishDenied = await invoke(
      context,
      delegated,
      "cms-content",
      { action: "publish", itemId: contentItemId, reason: "Tentativa negativa de publicação G8" },
      { idempotencyKey: randomUUID(), allowed: [403] },
    );
    const unchangedContent = await rest(context, "cms_content_items", {
      query: `id=eq.${contentItemId}&select=workflow_status`,
    });
    const publication = await rest(context, "cms_published_projection", {
      query: `item_id=eq.${contentItemId}&select=item_id`,
    });
    check(
      "publication_permission_denied_zero_effect",
      publishDenied.status === 403 &&
        unchangedContent.json[0]?.workflow_status === "approved" &&
        publication.json.length === 0,
      publishDenied.json.code,
    );

    const list = await scopeCommand(context, operator, "list");
    check(
      "scoped_catalog_and_assignments_visible",
      list.json.items.length === 2 && list.json.roles.some((role) => role.roleKey === "auditor"),
      `concessões=${list.json.items.length}; papéis=${list.json.roles.length}`,
    );

    const delegationExpiresAt = new Date(Date.now() + 15_000).toISOString();
    const delegationKey = randomUUID();
    const delegationEnvelope = envelope();
    const delegationBody = {
      envelope: delegationEnvelope,
      action: "grant",
      targetUserId: delegated.id,
      roleKey: "support",
      grantType: "delegated",
      expiresAt: delegationExpiresAt,
      reason: "Delegação sintética temporária para testar expiração",
    };
    policyCorrelations.push(delegationEnvelope.correlationId);
    const delegatedGrant = await invoke(context, operator, "cms-scopes", delegationBody, {
      idempotencyKey: delegationKey,
    });
    policyCorrelations.push(delegationEnvelope.correlationId);
    const delegatedReplay = await invoke(context, operator, "cms-scopes", delegationBody, {
      idempotencyKey: delegationKey,
    });
    policyCorrelations.push(delegationEnvelope.correlationId);
    const replayConflict = await invoke(
      context,
      operator,
      "cms-scopes",
      { ...delegationBody, reason: "Payload diferente com a mesma chave" },
      { idempotencyKey: delegationKey, allowed: [409] },
    );
    check(
      "idempotent_replay_and_conflict",
      delegatedGrant.json.assignmentId === delegatedReplay.json.assignmentId &&
        delegatedReplay.json.duplicate === true &&
        replayConflict.status === 409,
      replayConflict.json.code,
    );

    const selfElevation = await scopeCommand(
      context,
      operator,
      "grant",
      {
        targetUserId: operator.id,
        roleKey: "auditor",
        grantType: "direct",
        expiresAt: null,
        reason: "Tentativa negativa de autoelevação",
      },
      { allowed: [409], idempotencyKey: randomUUID() },
    );
    check("self_elevation_denied_409", selfElevation.status === 409, selfElevation.json.code);

    const delegatedSuper = await scopeCommand(
      context,
      operator,
      "grant",
      {
        targetUserId: delegated.id,
        roleKey: "super_admin",
        grantType: "delegated",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        reason: "Tentativa negativa de super admin temporário",
      },
      { allowed: [422], idempotencyKey: randomUUID() },
    );
    check("delegated_super_admin_denied", delegatedSuper.status === 422, delegatedSuper.json.code);

    const beforeExpiry = await scopeCommand(context, delegated, "evaluate", {
      permissionKey: "cms:sessions.revoke",
      targetType: "profile",
      targetId: operator.id,
    });
    check(
      "delegated_permission_effective_before_expiry",
      beforeExpiry.json.allowed === true,
      beforeExpiry.json.reasonCode,
    );
    const waitMilliseconds = Math.max(0, Date.parse(delegationExpiresAt) - Date.now() + 1_500);
    await new Promise((resolve) => setTimeout(resolve, waitMilliseconds));
    const afterExpiry = await scopeCommand(context, delegated, "evaluate", {
      permissionKey: "cms:sessions.revoke",
      targetType: "profile",
      targetId: operator.id,
    });
    check(
      "delegation_expiry_enforced",
      afterExpiry.json.allowed === false && afterExpiry.json.reasonCode === "permission_missing",
      afterExpiry.json.reasonCode,
    );

    const unknownPermission = await scopeCommand(context, delegated, "evaluate", {
      permissionKey: "cms:synthetic_unknown.execute",
      targetType: "administrative_screen",
      targetId: "g8-policy-negative",
    });
    check(
      "unknown_permission_denied_and_auditable",
      unknownPermission.json.allowed === false && unknownPermission.json.reasonCode === "permission_unknown",
      unknownPermission.json.reasonCode,
    );

    const auditorGrant = await scopeCommand(
      context,
      operator,
      "grant",
      {
        targetUserId: delegated.id,
        roleKey: "auditor",
        grantType: "direct",
        expiresAt: null,
        reason: "Concessão sintética para validar revogação e auditoria",
      },
      { idempotencyKey: randomUUID() },
    );
    const auditorRevoke = await scopeCommand(
      context,
      operator,
      "revoke",
      {
        targetUserId: delegated.id,
        roleKey: "auditor",
        expectedVersion: auditorGrant.json.lockVersion,
        reason: "Revogação sintética após validação do Gate G8",
      },
      { idempotencyKey: randomUUID() },
    );
    check(
      "grant_and_revoke_use_optimistic_version",
      auditorRevoke.json.status === "revoked" && auditorRevoke.json.lockVersion === 2,
      `versão=${auditorRevoke.json.lockVersion}`,
    );

    const expiredRevoke = await scopeCommand(
      context,
      operator,
      "revoke",
      {
        targetUserId: delegated.id,
        roleKey: "support",
        expectedVersion: delegatedGrant.json.lockVersion,
        reason: "Tentativa negativa de revogar concessão já expirada",
      },
      { allowed: [404], idempotencyKey: randomUUID() },
    );
    check("expired_grant_is_not_active", expiredRevoke.status === 404, expiredRevoke.json.code);

    const broad = await rest(context, "cms_feature_flag_overrides", {
      method: "POST",
      prefer: "return=representation",
      body: {
        flag_key: "ev2.rbac_scoped",
        environment: "staging",
        scope_type: "site",
        scope_key: fixturePrefix,
        enabled: true,
        reason: "Prova sintética fail-closed para ativação não individual",
        starts_at: new Date(Date.now() - 5_000).toISOString(),
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
        created_by: operator.id,
      },
    });
    const broadCapability = await scopeCommand(context, operator, "capability", {}, { expectPolicy: false });
    const broadSession = await invoke(
      context,
      operator,
      "cms-session",
      { action: "resolve" },
      { allowed: [403] },
    );
    check(
      "broad_override_fail_closed",
      broadCapability.json.enabled === false &&
        broadCapability.json.reasonCode === "scope_context_ambiguous" &&
        broadSession.status === 403,
      `${broadCapability.json.reasonCode}; sessão=${broadSession.status}`,
    );
    await rest(context, "cms_feature_flag_overrides", {
      method: "DELETE",
      query: `id=eq.${broad.json[0].id}`,
      prefer: "return=minimal",
    });
    const recovered = await scopeCommand(context, operator, "capability", {}, { expectPolicy: false });
    check(
      "kill_path_recovers_without_global_change",
      recovered.json.enabled === true,
      recovered.json.reasonCode,
    );

    const production = await scopeCommand(
      context,
      operator,
      "list",
      {},
      { allowed: [403], environment: "production", expectPolicy: false },
    );
    check("production_denied", production.json.code === "CMS_SCOPE_PRODUCTION_GATED", production.json.code);

    await scopeCommand(context, operator, "decisions", { limit: 50 });
    const uniqueCorrelations = [...new Set(policyCorrelations)];
    const policyRows = await rest(context, "cms_policy_decisions", {
      query: `correlation_id=in.(${uniqueCorrelations.join(",")})&select=id,correlation_id,decision,reason_code,session_id_hash`,
    });
    check(
      "policy_decisions_complete",
      policyRows.json.length === policyCorrelations.length &&
        policyRows.json.every(
          (row) =>
            ["allow", "deny"].includes(row.decision) &&
            typeof row.reason_code === "string" &&
            /^[0-9a-f]{64}$/.test(row.session_id_hash),
        ),
      `esperadas=${policyCorrelations.length}; registradas=${policyRows.json.length}`,
    );

    const [mutationAudits, receipts, flagAfter] = await Promise.all([
      rest(context, "cms_audit_log", {
        query: `actor_id=eq.${operator.id}&action=in.(cms:scopes.grant,cms:scopes.revoke)&select=action,event_data,correlation_id`,
      }),
      rest(context, "cms_scope_command_receipts", {
        query: `actor_id=eq.${operator.id}&select=action,response,completed_at`,
      }),
      rest(context, "cms_feature_flags", {
        query: "flag_key=eq.ev2.rbac_scoped&select=default_enabled,kill_switch",
      }),
    ]);
    check(
      "scope_mutations_audited_100_percent",
      mutationAudits.json.length === 3 &&
        receipts.json.length === 3 &&
        receipts.json.every((receipt) => receipt.response && receipt.completed_at) &&
        mutationAudits.json.every(
          (event) =>
            event.event_data?.siteKey === "main" &&
            event.event_data?.environment === "staging" &&
            event.event_data?.after,
        ),
      `mutações=3; auditoria=${mutationAudits.json.length}; recibos=${receipts.json.length}`,
    );
    check(
      "global_flag_unchanged",
      flagAfter.json[0].default_enabled === false && flagAfter.json[0].kill_switch === false,
      "default-off; kill-switch=false",
    );
  } catch (error) {
    operationError = error;
    console.error(`OPERAÇÃO G8 FALHOU: ${error instanceof Error ? error.message : String(error)}`);
  }

  let cleanupError;
  try {
    await cleanup(context);
    if (actorIds.length)
      check(
        "synthetic_residue_zero",
        await verifyResidue(context),
        "usuários, concessões, decisões, conteúdo e overrides removidos",
      );
  } catch (error) {
    cleanupError = error;
    console.error(`LIMPEZA MANUAL NECESSÁRIA: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (operationError || cleanupError)
    throw new AggregateError(
      [operationError, cleanupError].filter(Boolean),
      cleanupError
        ? "O canary falhou e requer reconciliação da limpeza sintética."
        : "O canary falhou, mas a limpeza sintética foi executada.",
    );
  console.table(results);
  console.log(
    JSON.stringify(
      {
        outcome: "G8_CANARY_PASS",
        target: TARGET,
        fixturePrefix,
        checks: results.length,
        productionMutations: 0,
        realDataMutations: 0,
        syntheticResidue: 0,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
