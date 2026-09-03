import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g7-canary.gaiatec-cms-staging.pages.dev",
};
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const fixturePrefix = `g7x${suffix}`;
const ids = {
  page: randomUUID(),
  pageRevision: randomUUID(),
  navigation: randomUUID(),
  navigationRevision: randomUUID(),
  atomicFirst: randomUUID(),
  atomicFirstRevision: randomUUID(),
  atomicInvalid: randomUUID(),
  atomicInvalidRevision: randomUUID(),
};
const actorIds = [];
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
  const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g7-cleanup-"));
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
  results.push({ name, result: condition ? "PASS" : "FAIL", detail });
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

function envelope(schemaVersion, expectedVersion, environment = "staging") {
  return {
    schemaVersion,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment, siteKey: "main" },
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
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

async function createActor(context, role) {
  const email = `ev2-g7-${role}-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g7", role, expires_in_minutes: 30 },
    },
  });
  const actorId = created.json.id;
  actorIds.push(actorId);
  await rest(context, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: actorId,
      display_name: role === "admin" ? "OP-G7 sintético" : "REV-G7 sintético",
      display_email: email,
      status: "active",
    },
  });
  await rest(context, "cms_user_roles", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: actorId, role_key: role },
  });
  await rest(context, "cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.collaboration_bulk",
      environment: "staging",
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: "Canary sintético e segregado do Gate G7",
      starts_at: new Date(Date.now() - 5_000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      created_by: actorId,
    },
  });
  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error) throw signedIn.error;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `EV2 G7 ${role}` });
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
    if (!verified.error && token) return { id: actorId, token };
    lastError = verified.error ?? new Error("Sessão AAL2 ausente.");
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError;
}

function provenance() {
  return [
    {
      sourceKind: "owner_authored",
      authorizationReference: `synthetic://${fixturePrefix}`,
      rightsConfirmed: true,
    },
  ];
}

function pagePayload(pathname, title) {
  return {
    schemaVersion: 1,
    consumerId: "cms.managed-page.v1",
    contentType: "page",
    title,
    governanceState: "synthetic_test",
    approval: { businessOwner: "OP-G7", editorialReviewer: "REV-G7" },
    retirement: { mode: "not_found" },
    route: { path: pathname },
    blocks: [
      {
        id: randomUUID(),
        type: "rich_text",
        width: "content",
        tone: "light",
        data: { text: `${title} — conteúdo sintético descartável.` },
      },
    ],
    relations: {},
    provenance: provenance(),
  };
}

function navigationPayload(pagePath) {
  return {
    schemaVersion: 1,
    consumerId: "cms.site-navigation.v1",
    contentType: "navigation",
    blocks: [],
    provenance: provenance(),
    items: [
      { id: randomUUID(), label: "Página sintética G7", href: pagePath, location: "header", parentId: null },
    ],
  };
}

async function createContentFixture(context, operator, reviewer, fixture) {
  await rest(context, "cms_content_items", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id: fixture.itemId,
      content_type: fixture.contentType,
      slug: fixture.slug,
      workflow_status: "approved",
      created_by: operator.id,
      updated_by: operator.id,
    },
  });
  await rest(context, "cms_content_revisions", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id: fixture.revisionId,
      item_id: fixture.itemId,
      revision_number: 1,
      schema_version: 1,
      payload: fixture.payload,
      seo: fixture.seo,
      provenance: { synthetic: true, phase: "ev2-g7" },
      source_draft_version: 1,
      reason: "Fixture sintética descartável do canary G7",
      created_by: operator.id,
    },
  });
  await rest(context, "cms_content_approvals", {
    method: "POST",
    prefer: "return=representation",
    body: {
      item_id: fixture.itemId,
      revision_id: fixture.revisionId,
      reviewer_id: reviewer.id,
      decision: "approved",
      note: "Aprovação sintética segregada para o canary G7",
    },
  });
}

async function releaseCommand(
  context,
  actor,
  action,
  values = {},
  expectedVersion,
  allowed = [200],
  key = randomUUID(),
) {
  return invoke(
    context,
    actor,
    "cms-releases",
    {
      action,
      envelope: envelope(2, expectedVersion),
      ...values,
    },
    { idempotencyKey: ["list", "status"].includes(action) ? undefined : key, allowed },
  );
}

async function assembleRelease(context, operator, reviewer, title, fixtures) {
  let current = await releaseCommand(context, operator, "create", {
    title,
    reason: "Canary sintético de atomicidade e rollback G7",
  });
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    current = await releaseCommand(
      context,
      operator,
      "add_item",
      {
        releaseId: current.json.releaseId,
        itemId: fixture.itemId,
        revisionId: fixture.revisionId,
        dependencyIds: index === 0 ? [] : [fixtures[0].itemId],
      },
      current.json.lockVersion,
    );
  }
  current = await releaseCommand(
    context,
    operator,
    "validate",
    { releaseId: current.json.releaseId },
    current.json.lockVersion,
  );
  check(
    `${title}_validated`,
    current.json.status === "validated" && current.json.failureCount === 0,
    `release=${current.json.releaseId}`,
  );
  current = await releaseCommand(
    context,
    operator,
    "submit",
    { releaseId: current.json.releaseId },
    current.json.lockVersion,
  );
  const selfApproval = await releaseCommand(
    context,
    operator,
    "approve",
    {
      releaseId: current.json.releaseId,
      reason: "Tentativa negativa do próprio criador",
    },
    current.json.lockVersion,
    [422],
  );
  check(
    `${title}_self_approval_denied`,
    selfApproval.json.code === "CMS_RELEASE_SEGREGATION_CONFLICT",
    selfApproval.json.code,
  );
  current = await releaseCommand(
    context,
    reviewer,
    "approve",
    {
      releaseId: current.json.releaseId,
      reason: "Revisão segregada concluída por REV-G7",
    },
    current.json.lockVersion,
  );
  return current;
}

async function cleanup(context) {
  if (actorIds.length === 0) return;
  const actors = actorIds.map((id) => `'${id}'::uuid`).join(",");
  const content = Object.values(ids)
    .map((id) => `'${id}'::uuid`)
    .join(",");
  executeCleanupSql(`
begin;
delete from public.cms_collaboration_outbox where recipient_id in (${actors}) or task_id in (select id from public.cms_work_tasks where created_by in (${actors}));
delete from public.cms_work_mentions where mentioned_user_id in (${actors}) or comment_id in (select id from public.cms_work_comments where author_id in (${actors}));
alter table public.cms_work_comments disable trigger cms_work_comments_immutable;
delete from public.cms_work_comments where author_id in (${actors}) or task_id in (select id from public.cms_work_tasks where created_by in (${actors}));
alter table public.cms_work_comments enable trigger cms_work_comments_immutable;
alter table public.cms_work_task_events disable trigger cms_work_task_events_immutable;
delete from public.cms_work_task_events where actor_id in (${actors}) or task_id in (select id from public.cms_work_tasks where created_by in (${actors}));
alter table public.cms_work_task_events enable trigger cms_work_task_events_immutable;
delete from public.cms_saved_inbox_views where owner_id in (${actors});
delete from public.cms_work_tasks where created_by in (${actors}) or assigned_to in (${actors});
delete from public.cms_bulk_job_items where job_id in (select id from public.cms_bulk_jobs where requested_by in (${actors}));
delete from public.cms_bulk_jobs where requested_by in (${actors});
alter table public.cms_release_snapshots disable trigger cms_release_snapshots_immutable;
delete from public.cms_release_snapshots where release_id in (select id from public.cms_release_packages where created_by in (${actors}));
alter table public.cms_release_snapshots enable trigger cms_release_snapshots_immutable;
alter table public.cms_release_approvals disable trigger cms_release_approvals_immutable;
delete from public.cms_release_approvals where release_id in (select id from public.cms_release_packages where created_by in (${actors})) or approver_id in (${actors});
alter table public.cms_release_approvals enable trigger cms_release_approvals_immutable;
alter table public.cms_release_validations disable trigger cms_release_validations_immutable;
delete from public.cms_release_validations where release_id in (select id from public.cms_release_packages where created_by in (${actors}));
alter table public.cms_release_validations enable trigger cms_release_validations_immutable;
delete from public.cms_release_validation_runs where release_id in (select id from public.cms_release_packages where created_by in (${actors}));
alter table public.cms_release_events disable trigger cms_release_events_immutable;
delete from public.cms_release_events where release_id in (select id from public.cms_release_packages where created_by in (${actors}));
alter table public.cms_release_events enable trigger cms_release_events_immutable;
delete from public.cms_release_items where release_id in (select id from public.cms_release_packages where created_by in (${actors}));
delete from public.cms_release_packages where created_by in (${actors});
delete from public.cms_ev2_command_receipts where actor_id in (${actors});
delete from public.cms_search_documents where item_id in (${content});
delete from public.cms_search_index_jobs where requested_by in (${actors});
delete from public.cms_route_rules where item_id in (${content});
delete from public.cms_media_usages where item_id in (${content});
delete from public.cms_publication_outbox where item_id in (${content});
delete from public.cms_publications where item_id in (${content});
delete from public.cms_published_projection where item_id in (${content});
alter table public.cms_content_approvals disable trigger cms_approvals_immutable;
delete from public.cms_content_approvals where item_id in (${content}) or reviewer_id in (${actors});
alter table public.cms_content_approvals enable trigger cms_approvals_immutable;
delete from public.cms_editorial_command_receipts where actor_id in (${actors});
alter table public.cms_content_revisions disable trigger cms_revisions_immutable;
delete from public.cms_content_revisions where item_id in (${content}) or created_by in (${actors});
alter table public.cms_content_revisions enable trigger cms_revisions_immutable;
delete from public.cms_content_drafts where item_id in (${content}) or updated_by in (${actors});
delete from public.cms_content_items where id in (${content}) or created_by in (${actors});
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id in (${actors});
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
alter table public.cms_login_events disable trigger cms_login_events_immutable;
delete from public.cms_login_events where user_id in (${actors});
alter table public.cms_login_events enable trigger cms_login_events_immutable;
delete from public.cms_session_revocations where user_id in (${actors});
delete from public.cms_command_receipts where actor_id in (${actors}) or target_user_id in (${actors});
delete from public.cms_feature_flag_overrides where created_by in (${actors}) or scope_key in (${actorIds.map((id) => `'${id}'`).join(",")});
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
    ...Object.values(ids).map((id) => rest(context, "cms_content_items", { query: `id=eq.${id}&select=id` })),
    ...actorIds.map((id) =>
      rest(context, "cms_release_packages", { query: `created_by=eq.${id}&select=id` }),
    ),
    ...actorIds.map((id) =>
      rest(context, "cms_feature_flag_overrides", { query: `scope_key=eq.${id}&select=id` }),
    ),
  ]);
  return checks.every((entry) => Array.isArray(entry.json) && entry.json.length === 0);
}

async function main() {
  const context = await loadContext();
  const [flags, existingNavigation] = await Promise.all([
    rest(context, "cms_feature_flags", {
      query: "flag_key=eq.ev2.collaboration_bulk&select=default_enabled,kill_switch",
    }),
    rest(context, "cms_published_projection", {
      query: "content_type=eq.navigation&select=item_id,revision_id,content_version,etag",
    }),
  ]);
  check(
    "target_and_global_flag",
    flags.json.length === 1 && flags.json[0].default_enabled === false && flags.json[0].kill_switch === false,
    `${context.project.name}/${context.project.region}`,
  );
  check(
    "existing_navigation_registered_as_read_only_sentinel",
    existingNavigation.json.length === 1,
    `item=${existingNavigation.json[0]?.item_id ?? "ausente"}; não será alterado`,
  );
  const navigationSentinel = existingNavigation.json[0];

  let operator;
  let reviewer;
  let operationError;
  try {
    operator = await createActor(context, "admin");
    reviewer = await createActor(context, "reviewer");
    check(
      "two_synthetic_mfa_actors",
      Boolean(operator.token && reviewer.token),
      `OP=${operator.id}; REV=${reviewer.id}`,
    );
    const [operatorCapability, reviewerCapability] = await Promise.all([
      invoke(context, operator, "cms-collaboration", { action: "capability", envelope: envelope(1) }),
      invoke(context, reviewer, "cms-collaboration", { action: "capability", envelope: envelope(1) }),
    ]);
    check(
      "individual_overrides_only",
      operatorCapability.json.enabled === true && reviewerCapability.json.enabled === true,
      "flag ativa apenas para OP-G7 e REV-G7",
    );

    const anonymous = await request(`${context.url}/functions/v1/cms-collaboration`, {
      method: "POST",
      headers: { apikey: context.anonKey, Origin: TARGET.origin },
      body: { action: "list", envelope: envelope(1) },
      allowed: [401],
    });
    check("anonymous_denied", anonymous.status === 401, "inbox privada");
    const production = await invoke(
      context,
      operator,
      "cms-releases",
      { action: "list", envelope: envelope(2, undefined, "production") },
      { allowed: [403] },
    );
    check("production_denied", production.json.code === "CMS_RELEASE_PRODUCTION_GATED", production.json.code);

    const pagePath = `/${fixturePrefix}-page`;
    const fixtures = [
      {
        itemId: ids.page,
        revisionId: ids.pageRevision,
        contentType: "page",
        slug: `${fixturePrefix}-page`,
        payload: pagePayload(pagePath, "Página sintética G7"),
        seo: {
          title: "Página sintética G7",
          description: "Descrição sintética de validação do release composto G7.",
          canonicalPath: pagePath,
          indexable: false,
        },
      },
      {
        itemId: ids.navigation,
        revisionId: ids.navigationRevision,
        contentType: "navigation",
        slug: `${fixturePrefix}-navigation`,
        payload: navigationPayload(pagePath),
        seo: {},
      },
      {
        itemId: ids.atomicFirst,
        revisionId: ids.atomicFirstRevision,
        contentType: "page",
        slug: `${fixturePrefix}-atomic-first`,
        payload: pagePayload(`/${fixturePrefix}-atomic-first`, "Primeiro item atômico G7"),
        seo: {
          title: "Primeiro item atômico G7",
          description: "Primeiro item válido do cenário negativo atômico.",
          canonicalPath: `/${fixturePrefix}-atomic-first`,
          indexable: false,
        },
      },
      {
        itemId: ids.atomicInvalid,
        revisionId: ids.atomicInvalidRevision,
        contentType: "page",
        slug: `${fixturePrefix}-atomic-invalid`,
        payload: pagePayload(`/${fixturePrefix}-atomic-second`, "Segundo item atômico G7"),
        seo: {
          title: "Segundo item atômico G7",
          description: "Segundo item que recebe bloqueio de qualidade após aprovação do release.",
          canonicalPath: `/${fixturePrefix}-atomic-second`,
          indexable: false,
        },
      },
    ];
    for (const fixture of fixtures) await createContentFixture(context, operator, reviewer, fixture);

    let composed = await assembleRelease(
      context,
      operator,
      reviewer,
      "G7 composto com duas páginas sintéticas",
      [fixtures[0], fixtures[2]],
    );
    const reviewerPublish = await releaseCommand(
      context,
      reviewer,
      "publish",
      { releaseId: composed.json.releaseId },
      composed.json.lockVersion,
      [403],
    );
    check("reviewer_cannot_publish", reviewerPublish.status === 403, reviewerPublish.json.code);
    const publishStarted = performance.now();
    composed = await releaseCommand(
      context,
      operator,
      "publish",
      { releaseId: composed.json.releaseId },
      composed.json.lockVersion,
    );
    const publishDurationMs = performance.now() - publishStarted;
    const projections = await rest(context, "cms_published_projection", {
      query: `item_id=in.(${ids.page},${ids.atomicFirst})&select=item_id,revision_id`,
    });
    check(
      "two_synthetic_pages_published_atomically",
      composed.json.status === "published" && projections.json.length === 2,
      `${publishDurationMs.toFixed(1)}ms`,
    );
    const rollbackStarted = performance.now();
    composed = await releaseCommand(
      context,
      operator,
      "rollback",
      { releaseId: composed.json.releaseId, reason: "Rollback sintético medido do Gate G7" },
      composed.json.lockVersion,
    );
    const rollbackDurationMs = performance.now() - rollbackStarted;
    const afterRollback = await rest(context, "cms_published_projection", {
      query: `item_id=in.(${ids.page},${ids.atomicFirst})&select=item_id`,
    });
    check(
      "rollback_rpo0_under_5_minutes",
      composed.json.status === "rolled_back" &&
        afterRollback.json.length === 0 &&
        rollbackDurationMs < 300_000,
      `${rollbackDurationMs.toFixed(1)}ms`,
    );

    const atomic = await assembleRelease(
      context,
      operator,
      reviewer,
      "G7 falha sem parcial",
      fixtures.slice(2),
    );
    await rest(context, "cms_quality_runs", {
      method: "POST",
      prefer: "return=minimal",
      body: {
        item_id: ids.atomicInvalid,
        revision_id: ids.atomicInvalidRevision,
        ruleset_version: "v1",
        trigger_kind: "release",
        status: "blocked",
        finding_counts: { error: 1 },
        actor_id: operator.id,
        correlation_id: randomUUID(),
      },
    });
    const failedPublish = await releaseCommand(
      context,
      operator,
      "publish",
      { releaseId: atomic.json.releaseId },
      atomic.json.lockVersion,
      [422],
    );
    const atomicProjection = await rest(context, "cms_published_projection", {
      query: `item_id=in.(${ids.atomicFirst},${ids.atomicInvalid})&select=item_id`,
    });
    check(
      "second_item_failure_zero_partial_change",
      failedPublish.status === 422 && atomicProjection.json.length === 0,
      `${failedPublish.json.code}; projeções=${atomicProjection.json.length}`,
    );

    let navigationPlan = await assembleRelease(
      context,
      operator,
      reviewer,
      "G7 plano página e navegação sintética",
      fixtures.slice(0, 2),
    );
    navigationPlan = await releaseCommand(
      context,
      operator,
      "cancel",
      {
        releaseId: navigationPlan.json.releaseId,
        reason: "Plano sintético cancelado antes de tocar o singleton real",
      },
      navigationPlan.json.lockVersion,
    );
    const navigationAfterPlan = await rest(context, "cms_published_projection", {
      query: "content_type=eq.navigation&select=item_id,revision_id,content_version,etag",
    });
    check(
      "page_navigation_plan_validated_without_real_write",
      navigationPlan.json.status === "canceled" &&
        navigationAfterPlan.json.length === 1 &&
        ["item_id", "revision_id", "content_version", "etag"].every(
          (field) => navigationAfterPlan.json[0][field] === navigationSentinel[field],
        ),
      `singleton=${navigationAfterPlan.json[0]?.item_id ?? "ausente"}`,
    );

    const replayKey = randomUUID();
    const replayBody = {
      action: "create",
      envelope: envelope(2),
      title: "G7 replay idempotente",
      reason: "Prova sintética de recibo idempotente",
    };
    const replayOne = await invoke(context, operator, "cms-releases", replayBody, {
      idempotencyKey: replayKey,
    });
    const replayTwo = await invoke(context, operator, "cms-releases", replayBody, {
      idempotencyKey: replayKey,
    });
    const replayConflict = await invoke(
      context,
      operator,
      "cms-releases",
      { ...replayBody, title: "G7 payload divergente" },
      { idempotencyKey: replayKey, allowed: [409] },
    );
    check(
      "idempotent_replay_and_conflict",
      replayOne.json.releaseId === replayTwo.json.releaseId && replayConflict.status === 409,
      replayConflict.json.code,
    );

    let task = await invoke(
      context,
      operator,
      "cms-collaboration",
      {
        action: "create_task",
        envelope: envelope(1),
        title: "Revisar bloco sintético G7",
        sourceKind: "review",
        sourceId: ids.page,
        priority: "high",
        anchor: {
          itemId: ids.page,
          revisionId: ids.pageRevision,
          fieldPath: "blocks[0].data.text",
          route: `/admin/paginas/${ids.page}`,
        },
        assignedTo: operator.id,
      },
      { idempotencyKey: randomUUID() },
    );
    const comment = await invoke(
      context,
      operator,
      "cms-collaboration",
      {
        action: "add_comment",
        envelope: envelope(1),
        taskId: task.json.taskId,
        body: "Comentário sintético ancorado no primeiro bloco.",
        anchor: {
          itemId: ids.page,
          revisionId: ids.pageRevision,
          fieldPath: "blocks[0].data.text",
          route: `/admin/paginas/${ids.page}`,
        },
        mentions: [reviewer.id],
      },
      { idempotencyKey: randomUUID() },
    );
    task = await invoke(
      context,
      operator,
      "cms-collaboration",
      {
        action: "resolve_task",
        envelope: envelope(1),
        taskId: task.json.taskId,
        expectedVersion: task.json.lockVersion,
        reason: "Teste concluído",
      },
      { idempotencyKey: randomUUID() },
    );
    const taskDetail = await invoke(context, operator, "cms-collaboration", {
      action: "list",
      envelope: envelope(1),
      taskId: task.json.taskId,
      limit: 1,
    });
    task = await invoke(
      context,
      operator,
      "cms-collaboration",
      {
        action: "reopen_task",
        envelope: envelope(1),
        taskId: task.json.taskId,
        expectedVersion: task.json.lockVersion,
        reason: "Teste de reabertura",
      },
      { idempotencyKey: randomUUID() },
    );
    const mention = await rest(context, "cms_collaboration_outbox", {
      query: `task_id=eq.${task.json.taskId}&recipient_id=eq.${reviewer.id}&event_type=eq.mentioned&select=id,status,comment_id`,
    });
    check(
      "anchored_comment_mention_and_reopen",
      Boolean(comment.json.commentId) &&
        task.json.status === "open" &&
        mention.json.length === 1 &&
        taskDetail.json.items[0].comments.length === 1 &&
        taskDetail.json.items[0].history.length >= 4,
      `task=${task.json.taskId}`,
    );

    let concurrencyRelease = await releaseCommand(context, operator, "create", {
      title: "G7 concorrência após dry-run",
      reason: "Destino sintético da prova de conflito entre validação e execução",
    });
    const staleBulk = await invoke(
      context,
      operator,
      "cms-bulk",
      {
        action: "dry_run",
        envelope: envelope(1),
        operation: "add_to_release",
        targets: [{ id: ids.atomicFirst, revisionId: ids.atomicFirstRevision }],
        changes: { releaseId: concurrencyRelease.json.releaseId },
        reason: "Dry-run que será invalidado por mudança concorrente",
      },
      { idempotencyKey: randomUUID() },
    );
    concurrencyRelease = await releaseCommand(
      context,
      operator,
      "add_item",
      {
        releaseId: concurrencyRelease.json.releaseId,
        itemId: ids.atomicInvalid,
        revisionId: ids.atomicInvalidRevision,
        dependencyIds: [],
      },
      concurrencyRelease.json.lockVersion,
    );
    const staleExecution = await invoke(
      context,
      operator,
      "cms-bulk",
      {
        action: "execute",
        envelope: envelope(1),
        jobId: staleBulk.json.jobId,
        expectedVersion: staleBulk.json.lockVersion,
      },
      { idempotencyKey: randomUUID(), allowed: [409] },
    );
    const concurrencyItems = await rest(context, "cms_release_items", {
      query: `release_id=eq.${concurrencyRelease.json.releaseId}&select=item_id`,
    });
    check(
      "bulk_change_after_dry_run_blocks_all_targets",
      staleExecution.status === 409 &&
        concurrencyItems.json.length === 1 &&
        concurrencyItems.json[0].item_id === ids.atomicInvalid,
      `status=${staleExecution.status}; itens=${concurrencyItems.json.length}`,
    );

    const bulkRelease = await releaseCommand(context, operator, "create", {
      title: "G7 lote validado",
      reason: "Destino sintético do dry-run e execução em massa",
    });
    const invalidBulk = await invoke(
      context,
      operator,
      "cms-bulk",
      {
        action: "dry_run",
        envelope: envelope(1),
        operation: "add_to_release",
        targets: [{ id: ids.page, revisionId: randomUUID() }],
        changes: { releaseId: bulkRelease.json.releaseId },
        reason: "Dry-run negativo por revisão inexistente",
      },
      { idempotencyKey: randomUUID() },
    );
    check(
      "invalid_dry_run_zero_writes",
      invalidBulk.json.status === "failed" &&
        invalidBulk.json.report.writes === 0 &&
        invalidBulk.json.items[0].errors.length === 1,
      `errors=${invalidBulk.json.report.errors}`,
    );
    const validBulk = await invoke(
      context,
      operator,
      "cms-bulk",
      {
        action: "dry_run",
        envelope: envelope(1),
        operation: "add_to_release",
        targets: [{ id: ids.page, revisionId: ids.pageRevision }],
        changes: { releaseId: bulkRelease.json.releaseId },
        reason: "Dry-run positivo para inclusão no release",
      },
      { idempotencyKey: randomUUID() },
    );
    const executeBody = {
      action: "execute",
      envelope: envelope(1),
      jobId: validBulk.json.jobId,
      expectedVersion: validBulk.json.lockVersion,
    };
    const executeKey = randomUUID();
    const executed = await invoke(context, operator, "cms-bulk", executeBody, {
      idempotencyKey: executeKey,
      allowed: [202],
    });
    const executedReplay = await invoke(context, operator, "cms-bulk", executeBody, {
      idempotencyKey: executeKey,
      allowed: [202],
    });
    const bulkItems = await rest(context, "cms_release_items", {
      query: `release_id=eq.${bulkRelease.json.releaseId}&select=item_id`,
    });
    check(
      "bulk_atomic_execution_and_replay",
      executed.json.status === "completed" &&
        executed.json.jobId === executedReplay.json.jobId &&
        bulkItems.json.length === 1,
      `writes=${executed.json.report.writes}`,
    );

    const globalAfter = await rest(context, "cms_feature_flags", {
      query: "flag_key=eq.ev2.collaboration_bulk&select=default_enabled,kill_switch",
    });
    check(
      "global_flag_unchanged",
      globalAfter.json[0].default_enabled === false && globalAfter.json[0].kill_switch === false,
      "default-off; kill-switch=false",
    );
  } catch (error) {
    operationError = error;
    console.error(`OPERAÇÃO G7 FALHOU: ${error instanceof Error ? error.message : String(error)}`);
  }

  let cleanupError;
  try {
    await cleanup(context);
    if (actorIds.length)
      check(
        "synthetic_residue_zero",
        await verifyResidue(context),
        "usuários, conteúdo, releases e overrides removidos",
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
        outcome: "G7_CANARY_PASS",
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
