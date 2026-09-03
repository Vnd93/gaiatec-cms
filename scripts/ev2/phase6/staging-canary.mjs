import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g6-canary.gaiatec-cms-staging.pages.dev",
};
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const fixturePrefix = `g6x${suffix}`;
const zeroQuery = `qzxv${randomBytes(16).toString("hex")}nomatch`;
const email = `ev2-g6-${randomUUID()}@example.invalid`;
const results = [];
let syntheticActorId = null;
let syntheticItemId = null;

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
    maxBuffer: 10 * 1024 * 1024,
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
  const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g6-cleanup-"));
  const file = path.join(directory, "cleanup.sql");
  const cliFile = path.relative(process.cwd(), file).replaceAll("\\", "/");
  try {
    writeFileSync(file, sql, { encoding: "utf8", mode: 0o600 });
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        runSupabase(["db", "query", "--linked", "--file", cliFile, "--output-format", "json"]);
        return;
      } catch (error) {
        lastError = error;
        if (attempt < 3) {
          const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
          Atomics.wait(waitBuffer, 0, 0, attempt * 1_000);
        }
      }
    }
    throw lastError;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function check(name, condition, detail) {
  const result = condition ? "PASS" : "FAIL";
  results.push({ name, result, detail });
  if (!condition) throw new Error(`${name}: ${detail}`);
}

async function request(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!allowed.includes(response.status)) {
    throw new Error(`${method} ${new URL(url).pathname}: HTTP ${response.status} ${JSON.stringify(json)}`);
  }
  return {
    status: response.status,
    json,
    headers: response.headers,
    durationMs: performance.now() - startedAt,
  };
}

async function loadContext() {
  const projects = supabaseJson(["projects", "list"]);
  const project = projects.find((item) => item.ref === TARGET.ref);
  if (
    !project ||
    project.name !== TARGET.name ||
    project.region !== TARGET.region ||
    project.linked !== true
  ) {
    throw new Error("ALVO RECUSADO: o projeto vinculado não é o staging autorizado.");
  }
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

function envelope(environment = "staging") {
  return {
    schemaVersion: 1,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment, siteKey: "main" },
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

async function invoke(context, actor, name, body, { idempotencyKey, allowed = [200] } = {}) {
  return request(`${context.url}/functions/v1/${name}`, {
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
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret, at = Date.now()) {
  const counter = Math.floor(at / 30_000);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", decodeBase32(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, "0");
}

async function authenticationClock(context) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${context.url}/auth/v1/health`, {
      headers: { apikey: context.anonKey },
      signal: AbortSignal.timeout(10_000),
    });
    const serverDate = Date.parse(response.headers.get("date") ?? "");
    if (Number.isFinite(serverDate)) return serverDate + Math.floor((Date.now() - startedAt) / 2);
  } catch {
    // A hora local é a alternativa segura quando o health check não responde.
  }
  return Date.now();
}

async function createActor(context) {
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g6", expires_in_minutes: 30 },
    },
  });
  const actorId = created.json.id;
  syntheticActorId = actorId;
  await rest(context, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: actorId,
      display_name: "Operador sintético EV2 G6",
      display_email: email,
      status: "active",
    },
  });
  await rest(context, "cms_user_roles", {
    method: "POST",
    prefer: "return=representation",
    body: { user_id: actorId, role_key: "admin" },
  });
  await rest(context, "cms_feature_flag_overrides", {
    method: "POST",
    prefer: "return=representation",
    body: {
      flag_key: "ev2.search_quality",
      environment: "staging",
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: "Canary técnico sintético e descartável do Gate G6",
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
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "EV2 G6 canary" });
  if (enrolled.error) throw enrolled.error;
  let lastVerificationError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const challenged = await client.auth.mfa.challenge({ factorId: enrolled.data.id });
    if (challenged.error) throw challenged.error;
    const verified = await client.auth.mfa.verify({
      factorId: enrolled.data.id,
      challengeId: challenged.data.id,
      code: totp(enrolled.data.totp.secret, await authenticationClock(context)),
    });
    const elevatedToken = verified.data?.session?.access_token ?? verified.data?.access_token;
    if (!verified.error && elevatedToken) return { id: actorId, token: elevatedToken };
    lastVerificationError = verified.error ?? new Error("Sessão AAL2 ausente.");
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }
  throw lastVerificationError;
}

function contentPayload(valid) {
  const slug = `${fixturePrefix}-industry`;
  const title = `${fixturePrefix} sensor técnico`;
  return {
    schemaVersion: 1,
    consumerId: "cms.industry.v1",
    contentType: "industry",
    title: valid ? title : "",
    summary: valid
      ? `Conteúdo sintético ${fixturePrefix} para validar busca, qualidade, governança e indexação sem dados reais.`
      : "",
    blocks: [
      {
        id: randomUUID(),
        type: "rich_text",
        data: { text: `${fixturePrefix}-pin ${fixturePrefix}-bury medição industrial totalmente sintética.` },
      },
    ],
    seo: {
      title: valid ? title : "",
      description: valid
        ? `Descrição sintética controlada do ${fixturePrefix}, criada exclusivamente para o canary técnico de staging.`
        : "",
      canonicalPath: valid ? `/industrias/${slug}` : "",
      indexable: false,
    },
    provenance: [
      {
        sourceKind: "owner_authored",
        authorizationReference: `synthetic://${fixturePrefix}`,
        authorizationDate: new Date().toISOString().slice(0, 10),
        rightsScope: "Teste descartável de staging",
        rightsConfirmed: true,
        commercialOwner: "Owner sintético G6",
        technicalOwner: "Owner sintético G6",
        verifiedAt: new Date().toISOString(),
      },
    ],
    governanceState: "synthetic_test",
    search: { synonyms: [], keywords: [`${fixturePrefix}-pin`, `${fixturePrefix}-bury`] },
    media: [],
    relations: {
      productIds: [],
      serviceIds: [],
      industryIds: [],
      applicationIds: [],
      solutionIds: [],
    },
    cta: { label: "Contato sintético", href: "/contato" },
    approval: {
      businessOwner: "Owner sintético G6",
      technicalReviewer: "Revisor sintético G6",
      commercialReviewer: "Revisor sintético G6",
      editorialReviewer: "Revisor sintético G6",
    },
    marketName: `${fixturePrefix} mercado`,
    challenges: ["Desafio sintético"],
    evidence: ["Evidência sintética"],
    processAreas: ["Processo sintético"],
  };
}

function percentile95(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)];
}

function serverTimingDuration(headers) {
  const value = headers.get("server-timing") ?? "";
  const match = value.match(/search;dur=([0-9.]+)/i);
  return match ? Number(match[1]) : Number.NaN;
}

async function cleanup(context, actorId, itemId) {
  if (!actorId) return;
  const itemPredicate = itemId ? `item_id = '${itemId}'::uuid` : "false";
  executeCleanupSql(`
begin;
delete from public.cms_search_events
where normalized_query like '${fixturePrefix}%'
   or normalized_query = '${zeroQuery}';
delete from public.cms_search_rules where created_by = '${actorId}'::uuid;
delete from public.cms_search_synonyms where created_by = '${actorId}'::uuid;
delete from public.cms_search_index_jobs where requested_by = '${actorId}'::uuid;
delete from public.cms_quality_command_receipts where actor_id = '${actorId}'::uuid;
delete from public.cms_quality_waivers where ${itemPredicate};
delete from public.cms_quality_runs where ${itemPredicate};
delete from public.cms_search_documents where ${itemPredicate};
delete from public.cms_discovery_projection where ${itemPredicate};
delete from public.cms_media_usages where ${itemPredicate};
delete from public.cms_preview_tokens where created_by = '${actorId}'::uuid;
delete from public.cms_publication_outbox where ${itemPredicate};
delete from public.cms_publications where ${itemPredicate};
delete from public.cms_published_projection where ${itemPredicate};
alter table public.cms_content_approvals disable trigger cms_approvals_immutable;
delete from public.cms_content_approvals where reviewer_id = '${actorId}'::uuid;
alter table public.cms_content_approvals enable trigger cms_approvals_immutable;
delete from public.cms_editorial_command_receipts where actor_id = '${actorId}'::uuid;
alter table public.cms_content_revisions disable trigger cms_revisions_immutable;
delete from public.cms_content_revisions where created_by = '${actorId}'::uuid;
alter table public.cms_content_revisions enable trigger cms_revisions_immutable;
delete from public.cms_content_drafts where updated_by = '${actorId}'::uuid;
delete from public.cms_content_items where created_by = '${actorId}'::uuid;
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id = '${actorId}'::uuid;
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
alter table public.cms_login_events disable trigger cms_login_events_immutable;
delete from public.cms_login_events where user_id = '${actorId}'::uuid;
alter table public.cms_login_events enable trigger cms_login_events_immutable;
delete from public.cms_session_revocations where user_id = '${actorId}'::uuid;
delete from public.cms_command_receipts where actor_id = '${actorId}'::uuid or target_user_id = '${actorId}'::uuid;
delete from public.cms_feature_flag_overrides where created_by = '${actorId}'::uuid;
delete from public.cms_user_roles where user_id = '${actorId}'::uuid;
delete from public.cms_profiles where user_id = '${actorId}'::uuid;
commit;
  `);
  await request(`${context.url}/auth/v1/admin/users/${actorId}`, {
    method: "DELETE",
    headers: context.serviceHeaders,
  });
}

async function verifyResidue(context, actorId, itemId) {
  const checks = await Promise.all([
    rest(context, "cms_profiles", { query: `user_id=eq.${actorId}&select=user_id` }),
    rest(context, "cms_feature_flag_overrides", { query: `created_by=eq.${actorId}&select=id` }),
    rest(context, "cms_content_items", { query: `id=eq.${itemId}&select=id` }),
    rest(context, "cms_search_rules", { query: `created_by=eq.${actorId}&select=id` }),
    rest(context, "cms_search_synonyms", { query: `created_by=eq.${actorId}&select=id` }),
    rest(context, "cms_quality_command_receipts", { query: `actor_id=eq.${actorId}&select=actor_id` }),
    rest(context, "cms_search_documents", { query: `item_id=eq.${itemId}&select=item_id` }),
  ]);
  return checks.every((entry) => Array.isArray(entry.json) && entry.json.length === 0);
}

async function main() {
  const context = await loadContext();
  const flags = await rest(context, "cms_feature_flags", {
    query: "flag_key=eq.ev2.search_quality&select=default_enabled,kill_switch",
  });
  check(
    "target_and_global_flag",
    flags.json.length === 1 && flags.json[0].default_enabled === false && flags.json[0].kill_switch === false,
    `${context.project.name}/${context.project.region}`,
  );
  let actor;
  let operationError;
  try {
    actor = await createActor(context);
    check("synthetic_mfa_aal2", Boolean(actor.token), `actor=${actor.id}`);

    const searchCapability = await invoke(context, actor, "cms-search-admin", {
      action: "capability",
      envelope: envelope(),
    });
    const qualityCapability = await invoke(context, actor, "cms-quality", {
      action: "capability",
      envelope: envelope(),
    });
    check(
      "individual_override",
      searchCapability.json.enabled === true && qualityCapability.json.enabled === true,
      "busca e qualidade habilitadas somente para o ator sintético",
    );

    const productionSearch = await invoke(
      context,
      actor,
      "cms-search-admin",
      { action: "capability", envelope: envelope("production") },
      { allowed: [403] },
    );
    const productionQuality = await invoke(
      context,
      actor,
      "cms-quality",
      { action: "capability", envelope: envelope("production") },
      { allowed: [403] },
    );
    check(
      "production_envelopes_denied",
      productionSearch.json.code === "CMS_SEARCH_PRODUCTION_GATED" &&
        productionQuality.json.code === "CMS_QUALITY_PRODUCTION_GATED",
      "dupla recusa explícita",
    );

    const workerDenied = await request(`${context.url}/functions/v1/cms-outbox-worker`, {
      method: "POST",
      headers: { apikey: context.anonKey, Origin: TARGET.origin },
      allowed: [401],
    });
    check("outbox_worker_secret_required", workerDenied.status === 401, "nenhuma fila reservada sem secret");

    const invalidPayload = contentPayload(false);
    const created = await invoke(
      context,
      actor,
      "cms-content",
      {
        action: "create",
        contentType: "industry",
        slug: `${fixturePrefix}-industry`,
        payload: invalidPayload,
      },
      { idempotencyKey: randomUUID() },
    );
    syntheticItemId = created.json.itemId;
    check("synthetic_draft_created", created.json.status === "draft", `item=${syntheticItemId}`);

    const qualityBody = {
      action: "run",
      envelope: envelope(),
      itemId: syntheticItemId,
      trigger: "manual",
    };
    const qualityKey = randomUUID();
    const blocked = await invoke(context, actor, "cms-quality", qualityBody, {
      idempotencyKey: qualityKey,
    });
    check(
      "quality_blocks_invalid_draft",
      blocked.json.status === "blocked" && blocked.json.counts.errors >= 2,
      `${blocked.json.counts.errors} erros determinísticos`,
    );
    const replay = await invoke(context, actor, "cms-quality", qualityBody, {
      idempotencyKey: qualityKey,
    });
    check("quality_run_idempotent", replay.json.runId === blocked.json.runId, `run=${blocked.json.runId}`);
    const collision = await invoke(
      context,
      actor,
      "cms-quality",
      { ...qualityBody, envelope: envelope() },
      { idempotencyKey: qualityKey, allowed: [409] },
    );
    check(
      "quality_idempotency_collision",
      collision.json.code === "CMS_QUALITY_IDEMPOTENCY_CONFLICT",
      collision.json.code,
    );

    const waiver = await invoke(
      context,
      actor,
      "cms-quality",
      {
        action: "waive",
        envelope: envelope(),
        itemId: syntheticItemId,
        ruleKey: "content.title_required",
        reason: "Exceção sintética temporária para comprovar governança do Gate G6",
        expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
      },
      { idempotencyKey: randomUUID(), allowed: [201] },
    );
    check("temporary_waiver_created", Boolean(waiver.json.waiver?.id), "MFA, motivo e expiração");
    const partiallyWaived = await invoke(
      context,
      actor,
      "cms-quality",
      { ...qualityBody, envelope: envelope() },
      { idempotencyKey: randomUUID() },
    );
    check(
      "waiver_does_not_hide_other_errors",
      partiallyWaived.json.status === "blocked" &&
        partiallyWaived.json.counts.waived === 1 &&
        partiallyWaived.json.counts.errors >= 1,
      `waived=${partiallyWaived.json.counts.waived}; errors=${partiallyWaived.json.counts.errors}`,
    );

    const validPayload = contentPayload(true);
    const saved = await invoke(
      context,
      actor,
      "cms-content",
      {
        action: "save",
        itemId: syntheticItemId,
        slug: `${fixturePrefix}-industry`,
        payload: validPayload,
        expectedLockVersion: 1,
      },
      { idempotencyKey: randomUUID() },
    );
    check("valid_draft_saved", saved.json.lockVersion === 2, `lock=${saved.json.lockVersion}`);
    const validRun = await invoke(
      context,
      actor,
      "cms-quality",
      { ...qualityBody, envelope: envelope() },
      { idempotencyKey: randomUUID() },
    );
    check("quality_passes_valid_draft", validRun.json.status === "passed", validRun.json.status);

    const submitted = await invoke(
      context,
      actor,
      "cms-content",
      {
        action: "submit",
        itemId: syntheticItemId,
        expectedLockVersion: 2,
        reason: "Revisão sintética do Gate G6",
      },
      { idempotencyKey: randomUUID() },
    );
    const revisionId = submitted.json.revisionId;
    check(
      "synthetic_revision_frozen",
      submitted.json.status === "in_review" && revisionId,
      `revision=${revisionId}`,
    );
    const approved = await invoke(
      context,
      actor,
      "cms-content",
      {
        action: "approve",
        itemId: syntheticItemId,
        revisionId,
        reason: "Aprovação sintética AAL2 do Gate G6",
      },
      { idempotencyKey: randomUUID() },
    );
    check("synthetic_revision_approved", approved.json.status === "approved", approved.json.status);

    const publishStartedAt = performance.now();
    const published = await invoke(
      context,
      actor,
      "cms-content",
      {
        action: "publish",
        itemId: syntheticItemId,
        revisionId,
        reason: "Publicação sintética isolada do Gate G6",
      },
      { idempotencyKey: randomUUID() },
    );
    check(
      "quality_gated_publish_indexes",
      published.json.status === "published" && published.json.searchIndex === "synced",
      `index=${published.json.searchIndex}`,
    );

    const directIndex = await rest(context, "cms_search_documents", {
      query: `item_id=eq.${syntheticItemId}&select=item_id,facets,technical_ranges,indexed_at`,
    });
    check(
      "shadow_index_contains_only_fixture",
      directIndex.json.length === 1 &&
        directIndex.json[0].facets?.market?.includes(`${fixturePrefix} mercado`) &&
        Object.keys(directIndex.json[0].technical_ranges ?? {}).length === 0,
      "faceta pública presente; ranges técnicos não inferidos",
    );

    const anonIndex = await request(
      `${context.url}/rest/v1/cms_search_documents?item_id=eq.${syntheticItemId}&select=item_id`,
      {
        headers: { apikey: context.anonKey, Authorization: `Bearer ${context.anonKey}` },
        allowed: [200, 401, 403],
      },
    );
    check(
      "shadow_index_denied_to_anon",
      anonIndex.status !== 200 || !Array.isArray(anonIndex.json) || anonIndex.json.length === 0,
      `HTTP ${anonIndex.status}`,
    );

    const startsAt = new Date(Date.now() - 5_000).toISOString();
    const expiresAt = new Date(Date.now() + 20 * 60_000).toISOString();
    const canonicalTerm = `${fixturePrefix} sensor técnico`;
    const alias = `${fixturePrefix}-alias`;
    const synonym = await invoke(
      context,
      actor,
      "cms-search-admin",
      {
        action: "upsert_synonym",
        envelope: envelope(),
        canonicalTerm,
        aliases: [alias],
        scope: "industry",
        sourceReference: `synthetic://${fixturePrefix}/synonym`,
        reason: "Sinônimo sintético com vigência controlada no Gate G6",
        owner: "REV-01 sintético",
        startsAt,
        expiresAt,
        active: true,
      },
      { allowed: [201] },
    );
    check("governed_synonym_created", Boolean(synonym.json.item?.id), `alias=${alias}`);

    const pinQuery = `${fixturePrefix}-pin`;
    const buryQuery = `${fixturePrefix}-bury`;
    const redirectQuery = `${fixturePrefix}-redirect`;
    const governedRules = [];
    for (const [kind, query, targetItemId, redirectPath] of [
      ["pin", pinQuery, syntheticItemId, null],
      ["bury", buryQuery, syntheticItemId, null],
      ["redirect", redirectQuery, null, `/industrias/${fixturePrefix}-industry`],
    ]) {
      const response = await invoke(
        context,
        actor,
        "cms-search-admin",
        {
          action: "upsert_rule",
          envelope: envelope(),
          kind,
          query,
          targetItemId,
          redirectPath,
          reason: `Regra ${kind} sintética e temporária do Gate G6`,
          owner: "REV-01 sintético",
          startsAt,
          expiresAt,
          active: true,
        },
        { allowed: [201] },
      );
      governedRules.push(response.json.item);
    }
    check(
      "pin_bury_redirect_governed",
      governedRules.every((item) => item?.id),
      "3 regras vigentes",
    );

    const publicSearch = async (query, extras = {}) => {
      const params = new URLSearchParams({ type: "search-v2", q: query, ...extras });
      return request(`${context.url}/functions/v1/cms-public?${params}`, {
        headers: { apikey: context.anonKey, Origin: TARGET.origin },
      });
    };
    const aliasResult = await publicSearch(alias);
    check(
      "governed_synonym_resolves_fixture",
      aliasResult.json.items?.some(
        (item) => item.item_id === syntheticItemId && item.matched_by === "governed_synonym",
      ),
      `total=${aliasResult.json.total}`,
    );
    const pinResult = await publicSearch(pinQuery);
    const buryResult = await publicSearch(buryQuery);
    check(
      "pin_and_bury_affect_score",
      pinResult.json.items?.[0]?.score > 900 && buryResult.json.items?.[0]?.score < -900,
      `pin=${pinResult.json.items?.[0]?.score}; bury=${buryResult.json.items?.[0]?.score}`,
    );
    const redirectResult = await publicSearch(redirectQuery);
    check(
      "governed_redirect_resolves",
      redirectResult.json.redirect === `/industrias/${fixturePrefix}-industry`,
      redirectResult.json.redirect,
    );
    const facetResult = await publicSearch(canonicalTerm, {
      "facet.market": `${fixturePrefix} mercado`,
    });
    check(
      "facet_filters_public_result",
      facetResult.json.items?.some((item) => item.item_id === syntheticItemId),
      `total=${facetResult.json.total}`,
    );

    const adminSearch = await invoke(context, actor, "cms-search-admin", {
      action: "admin_search",
      envelope: envelope(),
      query: canonicalTerm,
      contentTypes: ["industry"],
      limit: 10,
    });
    check(
      "permission_filtered_admin_search",
      adminSearch.json.items?.some((item) => item.item_id === syntheticItemId),
      `total=${adminSearch.json.total}`,
    );
    const governance = await invoke(context, actor, "cms-search-admin", {
      action: "list_governance",
      envelope: envelope(),
    });
    check(
      "governance_roundtrip",
      governance.json.rules?.filter((item) => item.created_by === actor.id).length === 3 &&
        governance.json.synonyms?.some((item) => item.id === synonym.json.item.id),
      "sinônimo e regras retornados com owner/vigência",
    );
    const qualityList = await invoke(context, actor, "cms-quality", {
      action: "list",
      envelope: envelope(),
      itemId: syntheticItemId,
      limit: 20,
    });
    check(
      "quality_history_visible",
      qualityList.json.items?.length >= 4,
      `${qualityList.json.items?.length} runs`,
    );

    const zeroResult = await publicSearch(zeroQuery);
    check(
      "zero_result_recovery_payload",
      zeroResult.json.total === 0,
      `total=${zeroResult.json.total}; zero explícito sem erro técnico`,
    );
    let zeroEvent;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
      zeroEvent = await rest(context, "cms_search_events", {
        query: `normalized_query=eq.${zeroQuery}&select=id,result_count,refinements`,
      });
      if (zeroEvent.json.length === 1) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    check(
      "anonymous_zero_result_analytics",
      zeroEvent?.json.length === 1 && zeroEvent.json[0].result_count === 0,
      "consulta, refinamentos e latência sem identidade",
    );

    const publicDurations = [];
    const adminDurations = [];
    for (let sample = 0; sample < 7; sample += 1) {
      const publicSample = await publicSearch(canonicalTerm);
      publicDurations.push(serverTimingDuration(publicSample.headers));
      const adminSample = await invoke(context, actor, "cms-search-admin", {
        action: "admin_search",
        envelope: envelope(),
        query: canonicalTerm,
        contentTypes: ["industry"],
        limit: 10,
      });
      adminDurations.push(adminSample.durationMs);
    }
    const publicP95 = percentile95(publicDurations);
    const adminP95 = percentile95(adminDurations);
    const indexLatencyMs = performance.now() - publishStartedAt;
    check(
      "public_search_slo",
      publicDurations.every(Number.isFinite) && publicP95 < 400,
      `p95=${publicP95.toFixed(1)}ms`,
    );
    check("admin_search_slo", adminP95 < 1_000, `p95=${adminP95.toFixed(1)}ms`);
    check("indexing_slo", indexLatencyMs < 60_000, `${Math.round(indexLatencyMs)}ms até busca confirmada`);

    const globalAfter = await rest(context, "cms_feature_flags", {
      query: "flag_key=eq.ev2.search_quality&select=default_enabled,kill_switch",
    });
    check(
      "global_flag_unchanged",
      globalAfter.json[0].default_enabled === false && globalAfter.json[0].kill_switch === false,
      "default-off; kill-switch=false",
    );
  } catch (error) {
    operationError = error;
    console.error(`OPERAÇÃO G6 FALHOU: ${error instanceof Error ? error.message : String(error)}`);
  }

  let cleanupError;
  try {
    await cleanup(context, actor?.id ?? syntheticActorId, syntheticItemId);
    if (syntheticActorId && syntheticItemId) {
      const clean = await verifyResidue(context, syntheticActorId, syntheticItemId);
      check("synthetic_residue_zero", clean, "usuário, conteúdo, busca, qualidade e override removidos");
    }
  } catch (error) {
    cleanupError = error;
    console.error(`LIMPEZA MANUAL NECESSÁRIA: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (operationError || cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError].filter(Boolean),
      cleanupError
        ? "O canary falhou e requer reconciliação da limpeza sintética."
        : "O canary falhou, mas a limpeza sintética foi executada.",
    );
  }

  console.table(results);
  console.log(
    JSON.stringify(
      {
        outcome: "G6_CANARY_PASS",
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
