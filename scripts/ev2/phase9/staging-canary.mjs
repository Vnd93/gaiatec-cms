import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g9-canary.gaiatec-cms-staging.pages.dev",
};
const expectedSha = process.env.EV2_G9_EXPECTED_SHA;
if (!/^[0-9a-f]{40}$/.test(expectedSha ?? ""))
  throw new Error("Defina EV2_G9_EXPECTED_SHA com o SHA completo explicitamente autorizado.");

const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const fixturePrefix = `g9x-${suffix}`;
const contentItemId = randomUUID();
const actorIds = [];
const siteKeys = [`${fixturePrefix}-a`, `${fixturePrefix}-b`];
const attemptedSiteKeys = [...siteKeys, `${fixturePrefix}-mfa`];
const checks = [];

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
    maxBuffer: 25 * 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error([result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n"));
  return result.stdout;
}

function supabaseJson(args) {
  return JSON.parse(runSupabase([...args, "--output", "json"]));
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
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
  return { status: response.status, json: payload, durationMs: performance.now() - started };
}

function check(name, condition, detail) {
  const result = condition ? "PASS" : "FAIL";
  checks.push({ name, result, detail });
  console.log(JSON.stringify({ event: "g9.check", name, result, detail }));
  if (!condition) throw new Error(`${name}: ${detail}`);
}

function exactMutationEvidence(receipts, events, expectedActions, eventByAction) {
  if (receipts.length !== expectedActions.length || events.length !== expectedActions.length) return false;
  const observedActions = receipts.map((receipt) => receipt.action).sort();
  if (JSON.stringify(observedActions) !== JSON.stringify([...expectedActions].sort())) return false;
  if (receipts.some((receipt) => !receipt.response || !receipt.completed_at)) return false;
  return (
    receipts.every(
      (receipt) =>
        events.filter(
          (event) =>
            event.actor_id === receipt.actor_id &&
            event.correlation_id === receipt.correlation_id &&
            event.event_type === eventByAction[receipt.action],
        ).length === 1,
    ) &&
    events.every(
      (event) =>
        receipts.filter(
          (receipt) =>
            receipt.actor_id === event.actor_id &&
            receipt.correlation_id === event.correlation_id &&
            event.event_type === eventByAction[receipt.action],
        ).length === 1,
    )
  );
}

async function loadContext() {
  const project = supabaseJson(["projects", "list"]).find((entry) => entry.ref === TARGET.ref);
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

function executeCleanupSql(sql) {
  const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g9-cleanup-"));
  const file = path.join(directory, "cleanup.sql");
  const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
  try {
    writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
    runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
  const value = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return value.toString().padStart(6, "0");
}

async function authenticationClock(context) {
  const response = await fetch(`${context.url}/auth/v1/health`, {
    headers: { apikey: context.anonKey },
    signal: AbortSignal.timeout(10_000),
  });
  const date = Date.parse(response.headers.get("date") ?? "");
  return Number.isFinite(date) ? date : Date.now();
}

async function createActor(context, roles, label) {
  const email = `ev2-g9-${label}-${randomUUID()}@example.invalid`;
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g9", label, expires_in_minutes: 30 },
    },
  });
  actorIds.push(created.json.id);
  await rest(context, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: created.json.id,
      display_name: `${label.toUpperCase()}-G9 sintético`,
      display_email: email,
      status: "active",
    },
  });
  await rest(context, "cms_user_roles", {
    method: "POST",
    prefer: "return=representation",
    body: roles.map((roleKey) => ({ user_id: created.json.id, role_key: roleKey })),
  });
  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Sessão AAL1 ausente.");
  const aal1Token = signedIn.data.session.access_token;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: `EV2 G9 ${label}` });
  if (enrolled.error) throw enrolled.error;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenge = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenge.error) throw challenge.error;
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenge.data.id,
      code: totp(enrolled.data.totp.secret, await authenticationClock(context)),
    });
    const token = verified.data?.session?.access_token ?? verified.data?.access_token;
    if (!verified.error && token) {
      await rest(context, "cms_profiles", {
        method: "PATCH",
        query: `user_id=eq.${created.json.id}`,
        prefer: "return=minimal",
        body: { mfa_enrolled_at: new Date().toISOString() },
      });
      return { id: created.json.id, token, aal1Token };
    }
    lastError = verified.error ?? new Error("Sessão AAL2 ausente.");
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastError;
}

async function installOverrides(context, actorId, createdBy) {
  const now = await authenticationClock(context);
  for (const flag of ["ev2.visual_studio", "ev2.multisite"])
    await rest(context, "cms_feature_flag_overrides", {
      method: "POST",
      prefer: "return=representation",
      body: {
        flag_key: flag,
        environment: "staging",
        scope_type: "user",
        scope_key: actorId,
        enabled: true,
        reason: `Canary individual sintético do Gate G9 para ${flag}`,
        starts_at: new Date(now - 1_000).toISOString(),
        expires_at: new Date(now + 29 * 60_000).toISOString(),
        created_by: createdBy,
      },
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

const visual = (context, actor, action, body = {}, options = {}) =>
  invoke(context, actor, "cms-visual", { action, envelope: envelope(options.environment), ...body }, options);
const sites = (context, actor, action, body = {}, options = {}) =>
  invoke(context, actor, "cms-sites", { action, envelope: envelope(options.environment), ...body }, options);

async function createSyntheticPage(context, actorId) {
  const blockId = randomUUID();
  const payload = {
    consumerId: "cms.managed-page.v1",
    contentType: "page",
    schemaVersion: 1,
    title: `G9 ${suffix}`,
    pageKind: "institutional",
    templateKey: "standard",
    route: { path: `/g9-${suffix}` },
    blocks: [
      {
        id: blockId,
        type: "rich_text",
        hidden: false,
        width: "content",
        tone: "light",
        data: { heading: "Canary G9", text: "Conteúdo exclusivamente sintético." },
      },
    ],
    seo: {
      title: `Canary G9 ${suffix}`,
      description: "Fixture sintética, não indexável e sem dados reais.",
      canonicalPath: `/g9-${suffix}`,
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        rightsConfirmed: true,
        commercialOwner: "OP-G9 sintético",
        technicalOwner: "REV-G9 sintético",
        verifiedAt: new Date().toISOString(),
      },
    ],
    governanceState: "synthetic_test",
    relations: { productIds: [], serviceIds: [], industryIds: [], applicationIds: [], solutionIds: [] },
    retirement: { mode: "not_found" },
    approval: { businessOwner: "OP-G9 sintético", editorialReviewer: "REV-G9 sintético" },
  };
  await rest(context, "cms_content_items", {
    method: "POST",
    prefer: "return=representation",
    body: {
      id: contentItemId,
      content_type: "page",
      slug: `g9-${suffix}`,
      workflow_status: "draft",
      created_by: actorId,
      updated_by: actorId,
    },
  });
  await rest(context, "cms_content_drafts", {
    method: "POST",
    prefer: "return=representation",
    body: {
      item_id: contentItemId,
      payload,
      seo: payload.seo,
      provenance: payload.provenance,
      updated_by: actorId,
    },
  });
}

async function cleanup(context) {
  if (!actorIds.length) return;
  const actors = actorIds.map((id) => `'${id}'::uuid`).join(",");
  const actorKeys = actorIds.map((id) => `'${id}'`).join(",");
  const sitesSql = attemptedSiteKeys.map((key) => `'${key}'`).join(",");
  executeCleanupSql(`
begin;
delete from public.cms_visual_command_receipts where actor_id in (${actors});
alter table public.cms_visual_events disable trigger cms_visual_events_immutable;
delete from public.cms_visual_events where actor_id in (${actors});
alter table public.cms_visual_events enable trigger cms_visual_events_immutable;
alter table public.cms_visual_snapshots disable trigger cms_visual_snapshots_immutable;
delete from public.cms_visual_snapshots where created_by in (${actors});
alter table public.cms_visual_snapshots enable trigger cms_visual_snapshots_immutable;
delete from public.cms_visual_symbols where created_by in (${actors});
delete from public.cms_visual_documents where created_by in (${actors});
delete from public.cms_page_branches where created_by in (${actors});
delete from public.cms_site_command_receipts where actor_id in (${actors});
alter table public.cms_site_events disable trigger cms_site_events_immutable;
delete from public.cms_site_events where actor_id in (${actors});
alter table public.cms_site_events enable trigger cms_site_events_immutable;
delete from public.cms_site_domains where created_by in (${actors});
alter table public.cms_design_tokens disable trigger cms_design_tokens_immutable;
delete from public.cms_design_tokens where created_by in (${actors});
alter table public.cms_design_tokens enable trigger cms_design_tokens_immutable;
delete from public.cms_themes where created_by in (${actors});
delete from public.cms_site_environments where site_id in (select id from public.cms_sites where site_key in (${sitesSql}));
delete from public.cms_sites where site_key in (${sitesSql}) and is_synthetic;
delete from public.cms_content_drafts where item_id = '${contentItemId}'::uuid;
delete from public.cms_content_items where id = '${contentItemId}'::uuid;
delete from public.cms_feature_flag_overrides
where flag_key in ('ev2.visual_studio','ev2.multisite')
  and (created_by in (${actors}) or scope_key in (${actorKeys}) or scope_key = '${fixturePrefix}');
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id in (${actors});
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
alter table public.cms_login_events disable trigger cms_login_events_immutable;
delete from public.cms_login_events where user_id in (${actors});
alter table public.cms_login_events enable trigger cms_login_events_immutable;
delete from public.cms_session_revocations where user_id in (${actors});
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
  const actorFilter = actorIds.join(",");
  const siteFilter = attemptedSiteKeys.join(",");
  const probes = await Promise.all([
    rest(context, "cms_content_items", { query: `id=eq.${contentItemId}&select=id` }),
    rest(context, "cms_sites", { query: `site_key=in.(${siteFilter})&select=id` }),
    rest(context, "cms_feature_flag_overrides", {
      query: `scope_key=in.(${actorFilter},${fixturePrefix})&select=id`,
    }),
    rest(context, "cms_visual_command_receipts", { query: `actor_id=in.(${actorFilter})&select=actor_id` }),
    rest(context, "cms_visual_events", { query: `actor_id=in.(${actorFilter})&select=id` }),
    rest(context, "cms_visual_snapshots", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_visual_symbols", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_visual_documents", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_page_branches", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_site_command_receipts", { query: `actor_id=in.(${actorFilter})&select=actor_id` }),
    rest(context, "cms_site_events", { query: `actor_id=in.(${actorFilter})&select=id` }),
    rest(context, "cms_site_domains", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_design_tokens", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_themes", { query: `created_by=in.(${actorFilter})&select=id` }),
    rest(context, "cms_audit_log", { query: `actor_id=in.(${actorFilter})&select=id` }),
    rest(context, "cms_login_events", { query: `user_id=in.(${actorFilter})&select=id` }),
    rest(context, "cms_session_revocations", { query: `user_id=in.(${actorFilter})&select=id` }),
    rest(context, "cms_user_roles", { query: `user_id=in.(${actorFilter})&select=user_id` }),
    ...actorIds.map((id) => rest(context, "cms_profiles", { query: `user_id=eq.${id}&select=user_id` })),
  ]);
  const authProbes = await Promise.all(
    actorIds.map((id) =>
      request(`${context.url}/auth/v1/admin/users/${id}`, {
        headers: context.serviceHeaders,
        allowed: [404],
      }),
    ),
  );
  return (
    probes.every((probe) => Array.isArray(probe.json) && probe.json.length === 0) &&
    authProbes.every((probe) => probe.status === 404)
  );
}

async function loadSentinels(context) {
  const [productionSites, realDomains, nonSyntheticSites, stableManifest] = await Promise.all([
    rest(context, "cms_sites", { query: "production_enabled=eq.true&select=id" }),
    rest(context, "cms_site_domains", { query: "hostname=not.like.*.invalid&select=id" }),
    rest(context, "cms_sites", { query: "is_synthetic=eq.false&select=id" }),
    request("https://gaiatec-cms-staging.pages.dev/release-manifest.json"),
  ]);
  return {
    productionEnabledCount: productionSites.json.length,
    realDomainCount: realDomains.json.length,
    nonSyntheticSiteIds: nonSyntheticSites.json.map((site) => site.id).sort(),
    stableManifest: stableManifest.json,
  };
}

async function main() {
  const context = await loadContext();
  const baseline = await loadSentinels(context);
  const [manifest, login, studioRoute, sitesRoute, flags, overrides, schema] = await Promise.all([
    request(`${TARGET.origin}/release-manifest.json`),
    request(`${TARGET.origin}/admin/login`),
    request(`${TARGET.origin}/admin/estudio-visual/${contentItemId}`),
    request(`${TARGET.origin}/admin/sites`),
    rest(context, "cms_feature_flags", {
      query: "flag_key=in.(ev2.visual_studio,ev2.multisite)&select=flag_key,default_enabled,kill_switch",
    }),
    rest(context, "cms_feature_flag_overrides", {
      query: `flag_key=in.(ev2.visual_studio,ev2.multisite)&enabled=eq.true&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id`,
    }),
    rest(context, "cms_visual_documents", { query: "select=id&limit=1" }),
  ]);
  check("exact_candidate_sha", manifest.json.release === expectedSha, manifest.json.release);
  check(
    "staging_target_and_alias",
    login.status === 200 &&
      studioRoute.status === 200 &&
      sitesRoute.status === 200 &&
      Array.isArray(schema.json),
    `${TARGET.origin}; rotas=${studioRoute.status}/${sitesRoute.status}`,
  );
  check(
    "flags_default_off",
    flags.json.length === 2 && flags.json.every((flag) => !flag.default_enabled && !flag.kill_switch),
    JSON.stringify(flags.json),
  );
  check("no_preexisting_override", overrides.json.length === 0, `ativos=${overrides.json.length}`);

  let operationError;
  let finalSentinels;
  let residueZero = false;
  try {
    const operator = await createActor(context, ["site_pilot_manager"], "op");
    const designer = await createActor(context, ["designer", "site_pilot_manager"], "designer");
    const operatorAal1 = { ...operator, token: operator.aal1Token };
    const designerAal1 = { ...designer, token: designer.aal1Token };

    const unauthenticated = await request(`${context.url}/functions/v1/cms-visual`, {
      method: "POST",
      headers: { apikey: context.anonKey, Origin: TARGET.origin },
      body: { action: "capability", envelope: envelope() },
      allowed: [401],
    });
    check("unauthenticated_denied", unauthenticated.status === 401, unauthenticated.status);

    const before = await visual(context, designer, "capability");
    check("candidate_off_before_override", before.json.enabled === false, before.json.source);
    await installOverrides(context, operator.id, operator.id);
    await installOverrides(context, designer.id, operator.id);
    const [visualCapability, siteCapability] = await Promise.all([
      visual(context, designer, "capability"),
      sites(context, operator, "capability"),
    ]);
    check(
      "individual_overrides_only",
      visualCapability.json.enabled === true && siteCapability.json.enabled === true,
      `${visualCapability.json.source}/${siteCapability.json.source}`,
    );
    const production = await visual(
      context,
      designer,
      "catalog",
      {},
      { environment: "production", allowed: [403] },
    );
    check("production_denied", production.json.code === "CMS_VISUAL_PRODUCTION_GATED", production.json.code);

    await createSyntheticPage(context, operator.id);
    const catalog = await visual(context, designer, "catalog");
    check("registry_exactly_twenty", catalog.json.components.length === 20, catalog.json.components.length);

    const createBody = {
      action: "create_branch",
      envelope: envelope(),
      itemId: contentItemId,
      branchKey: `${fixturePrefix}-visual`,
      mode: "designer",
    };
    const createKey = randomUUID();
    const firstCreate = await invoke(context, designer, "cms-visual", createBody, {
      idempotencyKey: createKey,
    });
    const replayCreate = await invoke(context, designer, "cms-visual", createBody, {
      idempotencyKey: createKey,
    });
    check(
      "branch_idempotency",
      firstCreate.json.branchId === replayCreate.json.branchId && replayCreate.json.replayed === true,
      firstCreate.json.branchId,
    );
    let current = await visual(context, designer, "get_document", { branchId: firstCreate.json.branchId });
    const updatedDocument = {
      ...current.json.document,
      nodes: [
        ...current.json.document.nodes,
        {
          id: randomUUID(),
          type: "alert",
          hidden: false,
          width: "content",
          tone: "muted",
          componentVersion: 1,
          layout: {
            desktop: { span: 12, hidden: false },
            tablet: { span: 8, hidden: false },
            mobile: { span: 4, hidden: false },
          },
          data: { heading: "Canary G9", text: "Aviso sintético.", severity: "info" },
        },
      ],
    };
    const saved = await visual(
      context,
      designer,
      "save_document",
      { branchId: firstCreate.json.branchId, expectedVersion: 1, document: updatedDocument },
      { idempotencyKey: randomUUID() },
    );
    check("optimistic_save", saved.json.documentVersion === 2, saved.json.documentVersion);
    const aal1Save = await visual(
      context,
      designerAal1,
      "save_document",
      { branchId: firstCreate.json.branchId, expectedVersion: 2, document: updatedDocument },
      { idempotencyKey: randomUUID(), allowed: [412] },
    );
    check(
      "all_visual_mutations_require_mfa",
      aal1Save.status === 412 && aal1Save.json.code === "CMS_VISUAL_MFA_REQUIRED",
      `${aal1Save.status}/${aal1Save.json.code}`,
    );
    const stale = await visual(
      context,
      designer,
      "save_document",
      { branchId: firstCreate.json.branchId, expectedVersion: 1, document: updatedDocument },
      { idempotencyKey: randomUUID(), allowed: [409] },
    );
    check("stale_write_preserved", stale.status === 409 && stale.json.preserved === true, stale.json.code);

    const snapshot = await visual(
      context,
      designer,
      "snapshot",
      { branchId: firstCreate.json.branchId, expectedVersion: 2 },
      { idempotencyKey: randomUUID() },
    );
    check("three_responsive_snapshots", snapshot.json.snapshotCount === 3, snapshot.json.snapshotCount);
    current = await visual(context, designer, "get_document", { branchId: firstCreate.json.branchId });
    check(
      "snapshot_breakpoints_complete",
      new Set(current.json.snapshots.map((item) => item.breakpoint)).size === 3,
      current.json.snapshots.map((item) => item.breakpoint).join(","),
    );

    const aal1Symbol = await visual(
      context,
      designerAal1,
      "create_symbol",
      {
        branchId: firstCreate.json.branchId,
        expectedVersion: 2,
        nodeId: updatedDocument.nodes[0].id,
        symbolKey: `${fixturePrefix}-symbol`,
        name: "Símbolo sintético G9",
      },
      { idempotencyKey: randomUUID(), allowed: [412] },
    );
    check("critical_visual_requires_mfa", aal1Symbol.status === 412, aal1Symbol.status);
    const symbol = await visual(
      context,
      designer,
      "create_symbol",
      {
        branchId: firstCreate.json.branchId,
        expectedVersion: 2,
        nodeId: updatedDocument.nodes[0].id,
        symbolKey: `${fixturePrefix}-symbol`,
        name: "Símbolo sintético G9",
      },
      { idempotencyKey: randomUUID() },
    );
    check("same_site_symbol", Boolean(symbol.json.symbolId), symbol.json.symbolId);
    const applied = await visual(
      context,
      designer,
      "apply_to_draft",
      { branchId: firstCreate.json.branchId, expectedVersion: 2, expectedDraftVersion: 1 },
      { idempotencyKey: randomUUID() },
    );
    const [publication, projection, revisions, publicationOutbox] = await Promise.all([
      rest(context, "cms_publications", { query: `item_id=eq.${contentItemId}&select=item_id` }),
      rest(context, "cms_published_projection", { query: `item_id=eq.${contentItemId}&select=item_id` }),
      rest(context, "cms_content_revisions", { query: `item_id=eq.${contentItemId}&select=id` }),
      rest(context, "cms_publication_outbox", { query: `item_id=eq.${contentItemId}&select=id` }),
    ]);
    check(
      "apply_draft_never_publishes",
      applied.json.published === false &&
        publication.json.length === 0 &&
        projection.json.length === 0 &&
        revisions.json.length === 0 &&
        publicationOutbox.json.length === 0,
      `draft=${applied.json.draftLockVersion};revision=${revisions.json.length};outbox=${publicationOutbox.json.length}`,
    );

    const aal1Site = await sites(
      context,
      operatorAal1,
      "create_candidate",
      { targetSiteKey: `${fixturePrefix}-mfa`, name: "Negativo MFA", purpose: "Teste sintético" },
      { idempotencyKey: randomUUID(), allowed: [412] },
    );
    check("critical_site_requires_mfa", aal1Site.status === 412, aal1Site.status);
    const siteABody = {
      action: "create_candidate",
      envelope: envelope(),
      targetSiteKey: siteKeys[0],
      name: "Tenant A sintético",
      purpose: "Tenant escape A",
    };
    const siteAKey = randomUUID();
    const siteA = await invoke(context, operator, "cms-sites", siteABody, {
      idempotencyKey: siteAKey,
    });
    const siteAReplay = await invoke(context, operator, "cms-sites", siteABody, {
      idempotencyKey: siteAKey,
    });
    const siteAConflict = await invoke(
      context,
      operator,
      "cms-sites",
      { ...siteABody, name: "Payload conflitante" },
      { idempotencyKey: siteAKey, allowed: [409] },
    );
    check(
      "site_idempotency_and_conflict",
      siteA.json.siteId === siteAReplay.json.siteId &&
        siteAReplay.json.replayed === true &&
        siteAConflict.status === 409,
      `${siteAReplay.json.replayed}/${siteAConflict.status}`,
    );
    const siteB = await sites(
      context,
      designer,
      "create_candidate",
      { targetSiteKey: siteKeys[1], name: "Tenant B sintético", purpose: "Tenant escape B" },
      { idempotencyKey: randomUUID() },
    );
    check(
      "two_locked_synthetic_sites",
      siteA.json.multisiteOperational === false && siteB.json.productionEnabled === false,
      `${siteA.json.siteKey}/${siteB.json.siteKey}`,
    );
    const domain = await sites(
      context,
      operator,
      "add_domain",
      { targetSiteKey: siteKeys[0], hostname: `${siteKeys[0]}.invalid`, expectedVersion: 1 },
      { idempotencyKey: randomUUID() },
    );
    const invalidDomain = await sites(
      context,
      operator,
      "add_domain",
      { targetSiteKey: siteKeys[1], hostname: `${siteKeys[1]}.example.com`, expectedVersion: 1 },
      { idempotencyKey: randomUUID(), allowed: [400] },
    );
    check(
      "reserved_domain_only",
      Boolean(domain.json.domainId) && invalidDomain.json.code === "CMS_SITES_COMMAND_INVALID",
      `${domain.json.domainId}/${invalidDomain.status}`,
    );
    const [registryA, registryB] = await Promise.all([
      sites(context, operator, "registry"),
      sites(context, designer, "registry"),
    ]);
    const tenantA = registryA.json.sites.find((site) => site.key === siteKeys[0]);
    const tenantB = registryB.json.sites.find((site) => site.key === siteKeys[1]);
    const escapedToB = registryA.json.sites.some((site) => site.key === siteKeys[1]);
    const escapedToA = registryB.json.sites.some((site) => site.key === siteKeys[0]);
    const crossMutation = await sites(
      context,
      operator,
      "suspend_candidate",
      { targetSiteKey: siteKeys[1], expectedVersion: 1 },
      { idempotencyKey: randomUUID(), allowed: [404] },
    );
    check(
      "tenant_identity_isolation",
      tenantA?.domains.length === 1 &&
        tenantB?.domains.length === 0 &&
        !escapedToA &&
        !escapedToB &&
        crossMutation.status === 404,
      `A=${tenantA?.domains.length};B=${tenantB?.domains.length};escape=${escapedToA}/${escapedToB};cross=${crossMutation.status}`,
    );
    const versionedTokens = catalog.json.theme.tokens.map((token) =>
      token.key === "color.brand" ? { ...token, value: "#0757d8" } : token,
    );
    const tokenResult = await sites(
      context,
      operator,
      "update_tokens",
      { targetSiteKey: siteKeys[0], tokens: versionedTokens, expectedVersion: 2 },
      { idempotencyKey: randomUUID() },
    );
    check(
      "tokens_are_versioned_per_site",
      tokenResult.json.tokenVersion === 2 && tokenResult.json.lockVersion === 3,
      `${tokenResult.json.tokenVersion}/${tokenResult.json.lockVersion}`,
    );
    const suspended = await sites(
      context,
      operator,
      "suspend_candidate",
      { targetSiteKey: siteKeys[0], expectedVersion: 3 },
      { idempotencyKey: randomUUID() },
    );
    check(
      "synthetic_site_suspends_without_activation",
      suspended.json.status === "suspended" && suspended.json.productionEnabled === false,
      `${suspended.json.status}/${suspended.json.productionEnabled}`,
    );
    const direct = await request(`${context.url}/rest/v1/cms_sites?select=id`, {
      headers: { apikey: context.anonKey, Authorization: `Bearer ${designer.token}` },
      allowed: [401, 403],
    });
    check("direct_tenant_enumeration_denied", [401, 403].includes(direct.status), direct.status);

    const broadNow = await authenticationClock(context);
    const broadOverrides = [];
    for (const flagKey of ["ev2.visual_studio", "ev2.multisite"]) {
      const broad = await rest(context, "cms_feature_flag_overrides", {
        method: "POST",
        prefer: "return=representation",
        body: {
          flag_key: flagKey,
          environment: "staging",
          scope_type: "site",
          scope_key: fixturePrefix,
          enabled: true,
          reason: `Prova fail-closed de ativação ampla G9 para ${flagKey}`,
          starts_at: new Date(broadNow - 1_000).toISOString(),
          expires_at: new Date(broadNow + 5 * 60_000).toISOString(),
          created_by: operator.id,
        },
      });
      broadOverrides.push(broad.json[0].id);
    }
    const [closedVisual, closedSites] = await Promise.all([
      visual(context, designer, "capability"),
      sites(context, operator, "capability"),
    ]);
    check(
      "broad_override_fails_closed",
      closedVisual.json.enabled === false && closedSites.json.enabled === false,
      `${closedVisual.json.source}/${closedSites.json.source}`,
    );
    for (const overrideId of broadOverrides)
      await rest(context, "cms_feature_flag_overrides", {
        method: "DELETE",
        query: `id=eq.${overrideId}`,
        prefer: "return=minimal",
      });
    const [recoveredVisual, recoveredSites] = await Promise.all([
      visual(context, designer, "capability"),
      sites(context, operator, "capability"),
    ]);
    check(
      "individual_canary_recovers",
      recoveredVisual.json.enabled === true && recoveredSites.json.enabled === true,
      `${recoveredVisual.json.source}/${recoveredSites.json.source}`,
    );

    const actorFilter = `${operator.id},${designer.id}`;
    const [visualReceipts, visualEvents, siteReceipts, siteEvents, flagsAfter] = await Promise.all([
      rest(context, "cms_visual_command_receipts", {
        query: `actor_id=eq.${designer.id}&select=actor_id,action,correlation_id,response,completed_at`,
      }),
      rest(context, "cms_visual_events", {
        query: `actor_id=eq.${designer.id}&select=actor_id,event_type,correlation_id`,
      }),
      rest(context, "cms_site_command_receipts", {
        query: `actor_id=in.(${actorFilter})&select=actor_id,action,correlation_id,response,completed_at`,
      }),
      rest(context, "cms_site_events", {
        query: `actor_id=in.(${actorFilter})&select=actor_id,event_type,correlation_id`,
      }),
      rest(context, "cms_feature_flags", {
        query: "flag_key=in.(ev2.visual_studio,ev2.multisite)&select=default_enabled,kill_switch",
      }),
    ]);
    const visualEvidence = exactMutationEvidence(
      visualReceipts.json,
      visualEvents.json,
      ["create_branch", "save_document", "snapshot", "create_symbol", "apply_to_draft"],
      {
        create_branch: "branch_created",
        save_document: "document_saved",
        snapshot: "snapshot_created",
        create_symbol: "symbol_created",
        apply_to_draft: "applied_to_draft",
      },
    );
    const siteEvidence = exactMutationEvidence(
      siteReceipts.json,
      siteEvents.json,
      ["create_candidate", "create_candidate", "add_domain", "update_tokens", "suspend_candidate"],
      {
        create_candidate: "candidate_created",
        add_domain: "domain_added",
        update_tokens: "tokens_versioned",
        suspend_candidate: "candidate_suspended",
      },
    );
    check(
      "receipts_and_events_complete",
      visualEvidence && siteEvidence,
      `visual=${visualReceipts.json.length}/${visualEvents.json.length};sites=${siteReceipts.json.length}/${siteEvents.json.length}`,
    );
    check(
      "global_flags_unchanged",
      flagsAfter.json.every((flag) => !flag.default_enabled && !flag.kill_switch),
      JSON.stringify(flagsAfter.json),
    );
  } catch (error) {
    operationError = error;
    console.error(`OPERAÇÃO G9 FALHOU: ${error instanceof Error ? error.message : String(error)}`);
  }

  let cleanupError;
  try {
    await cleanup(context);
    if (actorIds.length) {
      residueZero = await verifyResidue(context);
      check("synthetic_residue_zero", residueZero, "usuários, sites, conteúdo e overrides removidos");
    }
    finalSentinels = await loadSentinels(context);
    check(
      "production_and_real_state_unchanged",
      finalSentinels.productionEnabledCount === baseline.productionEnabledCount &&
        finalSentinels.realDomainCount === baseline.realDomainCount &&
        JSON.stringify(finalSentinels.nonSyntheticSiteIds) === JSON.stringify(baseline.nonSyntheticSiteIds) &&
        JSON.stringify(finalSentinels.stableManifest) === JSON.stringify(baseline.stableManifest),
      JSON.stringify({ baseline, final: finalSentinels }),
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
  console.table(checks);
  console.log(
    JSON.stringify(
      {
        outcome: "G9_CANARY_PASS",
        target: TARGET,
        expectedSha,
        fixturePrefix,
        checks: checks.length,
        responsiveSnapshots: 3,
        productionMutations: finalSentinels.productionEnabledCount - baseline.productionEnabledCount,
        realDataMutations:
          finalSentinels.realDomainCount -
          baseline.realDomainCount +
          (JSON.stringify(finalSentinels.nonSyntheticSiteIds) === JSON.stringify(baseline.nonSyntheticSiteIds)
            ? 0
            : 1),
        stableStagingPromoted:
          JSON.stringify(finalSentinels.stableManifest) !== JSON.stringify(baseline.stableManifest),
        syntheticResidue: residueZero ? 0 : 1,
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
