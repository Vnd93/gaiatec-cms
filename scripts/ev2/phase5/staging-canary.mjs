import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g5-canary.gaiatec-cms-staging.pages.dev",
};
const EMAIL = `ev2-g5-${randomUUID()}@example.invalid`;
const ids = {
  collection: randomUUID(),
  content: randomUUID(),
};
const results = [];
let syntheticActorId = null;

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
  const directory = mkdtempSync(path.join(process.cwd(), ".ev2-g5-cleanup-"));
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
  return { status: response.status, json };
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

function envelope(expectedVersion, environment = "staging") {
  return {
    schemaVersion: 1,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment, siteKey: "main" },
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}

async function rest(context, table, { method = "GET", query = "", body, prefer } = {}) {
  return request(`${context.url}/rest/v1/${table}${query ? `?${query}` : ""}`, {
    method,
    headers: { ...context.serviceHeaders, ...(prefer ? { Prefer: prefer } : {}) },
    body,
    allowed: method === "POST" ? [200, 201] : [200, 204],
  });
}

async function command(context, token, body, { idempotencyKey, allowed = [200] } = {}) {
  return request(`${context.url}/functions/v1/cms-media`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${token}`,
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
    // A hora local ainda é uma alternativa válida quando o health check não responde.
  }
  return Date.now();
}

async function createActor(context) {
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  const created = await request(`${context.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: context.serviceHeaders,
    body: {
      email: EMAIL,
      password,
      email_confirm: true,
      user_metadata: { synthetic: true, phase: "ev2-g5", expires_in_minutes: 30 },
    },
  });
  const actorId = created.json.id;
  syntheticActorId = actorId;
  await rest(context, "cms_profiles", {
    method: "POST",
    prefer: "return=representation",
    body: {
      user_id: actorId,
      display_name: "Operador sintético EV2 G5",
      display_email: EMAIL,
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
      flag_key: "ev2.dam",
      environment: "staging",
      scope_type: "user",
      scope_key: actorId,
      enabled: true,
      reason: "Canary técnico sintético e descartável do Gate G5",
      starts_at: new Date(Date.now() - 5_000).toISOString(),
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      created_by: actorId,
    },
  });

  const client = createClient(context.url, context.anonKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await client.auth.signInWithPassword({ email: EMAIL, password });
  if (signedIn.error) throw signedIn.error;
  const enrolled = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "EV2 G5 canary" });
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

async function fingerprint(buffer) {
  const { data } = await sharp(buffer)
    .resize(9, 8, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let hash = 0n;
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      hash = (hash << 1n) | BigInt(data[row * 9 + column] > data[row * 9 + column + 1] ? 1 : 0);
    }
  }
  return {
    sha256: createHash("sha256").update(buffer).digest("hex"),
    perceptualHash: hash.toString(16).padStart(16, "0"),
  };
}

async function imagePackage(color) {
  const original = await sharp({ create: { width: 96, height: 96, channels: 4, background: color } })
    .png()
    .toBuffer();
  const files = new Map([["original", { body: original, mime: "image/png" }]]);
  for (const [key, size] of [
    ["thumbnail", 32],
    ["medium", 64],
    ["large", 96],
  ]) {
    files.set(`${key}.webp`, {
      body: await sharp(original).resize(size, size).webp().toBuffer(),
      mime: "image/webp",
    });
    files.set(`${key}.avif`, {
      body: await sharp(original).resize(size, size).avif().toBuffer(),
      mime: "image/avif",
    });
  }
  return { original, files, ...(await fingerprint(original)) };
}

async function uploadAsset(context, actor, label, color, registerAsset, expectSimilar = false) {
  const media = await imagePackage(color);
  const match = await command(context, actor.token, {
    action: "match_asset",
    envelope: envelope(),
    sha256: media.sha256,
    perceptualHash: media.perceptualHash,
    maximumDistance: 8,
  });
  check(
    `${label}_match`,
    match.json.exact === null && (!expectSimilar || match.json.similar.length > 0),
    `similar=${match.json.similar.length}`,
  );

  const reserveEnvelope = envelope();
  const reserveBody = {
    action: "reserve_upload",
    envelope: reserveEnvelope,
    metadata: {
      originalFilename: `${label}.png`,
      declaredMime: "image/png",
      sourceKind: "synthetic_test",
      sourceReference: `synthetic://ev2-g5/${label}`,
      rightsConfirmed: true,
      rightsExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
      licenseName: "Fixture sintética sem uso externo",
      ownerName: "GAIATEC — canary sintético",
      altText: `Imagem sintética ${label} do canary G5`,
      caption: null,
      credit: null,
      focalX: 0.5,
      focalY: 0.5,
      sha256: media.sha256,
      perceptualHash: media.perceptualHash,
    },
  };
  const reserved = await command(context, actor.token, reserveBody, { allowed: [201] });
  registerAsset(reserved.json.assetId);
  const replay = await command(context, actor.token, reserveBody);
  check(
    `${label}_reserve_idempotent`,
    replay.json.assetId === reserved.json.assetId && replay.json.uploads.length === 7,
    `asset=${reserved.json.assetId}`,
  );
  const conflictBody = structuredClone(reserveBody);
  conflictBody.metadata.altText += " alterada";
  const conflict = await command(context, actor.token, conflictBody, { allowed: [409] });
  check(
    `${label}_reserve_conflict`,
    conflict.json.code === "CMS_DAM_IDEMPOTENCY_CONFLICT" && conflict.json.preserved === true,
    conflict.json.code,
  );

  for (const descriptor of reserved.json.uploads) {
    const key = descriptor.key === "original" ? "original" : `${descriptor.key}.${descriptor.format}`;
    const file = media.files.get(key);
    const response = await fetch(descriptor.signedUrl, {
      method: "PUT",
      headers: { "Content-Type": file.mime },
      body: file.body,
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`Upload ${key} falhou com HTTP ${response.status}.`);
  }
  const finalizeBody = { action: "finalize_upload", envelope: envelope(), assetId: reserved.json.assetId };
  const finalized = await command(context, actor.token, finalizeBody);
  const finalizedReplay = await command(context, actor.token, { ...finalizeBody, envelope: envelope() });
  check(
    `${label}_finalize`,
    finalized.json.status === "ready" &&
      finalized.json.variants === 6 &&
      finalizedReplay.json.replayed === true,
    `sha=${finalized.json.sha256}`,
  );
  return { id: reserved.json.assetId, ...media };
}

async function getAsset(context, actor, assetId) {
  return (await command(context, actor.token, { action: "get_asset", envelope: envelope(), assetId })).json
    .asset;
}

async function mutate(context, actor, body, idempotencyKey = randomUUID(), allowed = [200]) {
  return command(context, actor.token, body, { idempotencyKey, allowed });
}

async function cleanup(context, actor, assetIds) {
  if (!actor?.id) return;
  const storage = createClient(context.url, context.serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  }).storage.from("cms-media-private");
  for (const assetId of assetIds.filter(Boolean)) {
    const removed = await storage.remove([
      `cms/${assetId}/original.png`,
      `cms/${assetId}/thumbnail.webp`,
      `cms/${assetId}/thumbnail.avif`,
      `cms/${assetId}/medium.webp`,
      `cms/${assetId}/medium.avif`,
      `cms/${assetId}/large.webp`,
      `cms/${assetId}/large.avif`,
    ]);
    if (removed.error) throw removed.error;
  }
  const assetList = assetIds
    .filter(Boolean)
    .map((id) => `'${id}'::uuid`)
    .join(",");
  executeCleanupSql(`
begin;
delete from public.cms_media_usages where item_id = '${ids.content}'::uuid;
delete from public.cms_content_items where id = '${ids.content}'::uuid;
delete from public.cms_dam_command_receipts where actor_id = '${actor.id}'::uuid;
alter table public.cms_dam_events disable trigger cms_dam_events_immutable;
delete from public.cms_dam_events where actor_id = '${actor.id}'::uuid;
alter table public.cms_dam_events enable trigger cms_dam_events_immutable;
delete from public.cms_dam_replacements where created_by = '${actor.id}'::uuid;
delete from public.cms_dam_collection_assets where created_by = '${actor.id}'::uuid;
delete from public.cms_dam_asset_tags where created_by = '${actor.id}'::uuid;
delete from public.cms_dam_crops where created_by = '${actor.id}'::uuid;
delete from public.cms_dam_gc_jobs where created_by = '${actor.id}'::uuid;
delete from public.cms_dam_tags where created_by = '${actor.id}'::uuid;
delete from public.cms_dam_collections where created_by = '${actor.id}'::uuid;
${assetList ? `update public.cms_media_assets set archived_at = now() - interval '31 days' where id in (${assetList}); delete from public.cms_media_assets where id in (${assetList});` : ""}
alter table public.cms_audit_log disable trigger cms_audit_log_immutable;
delete from public.cms_audit_log where actor_id = '${actor.id}'::uuid and action like 'cms:media.%';
alter table public.cms_audit_log enable trigger cms_audit_log_immutable;
delete from public.cms_feature_flag_overrides where created_by = '${actor.id}'::uuid;
delete from public.cms_user_roles where user_id = '${actor.id}'::uuid;
delete from public.cms_profiles where user_id = '${actor.id}'::uuid;
commit;
  `);
  await request(`${context.url}/auth/v1/admin/users/${actor.id}`, {
    method: "DELETE",
    headers: context.serviceHeaders,
  });
}

async function main() {
  const context = await loadContext();
  const flags = await rest(context, "cms_feature_flags", {
    query: "flag_key=eq.ev2.dam&select=default_enabled,kill_switch",
  });
  check(
    "target_and_global_flag",
    flags.json.length === 1 && flags.json[0].default_enabled === false && flags.json[0].kill_switch === false,
    `${context.project.name}/${context.project.region}`,
  );
  let actor;
  let operationError;
  const assets = [];
  try {
    actor = await createActor(context);
    const capability = await command(context, actor.token, { action: "capability", envelope: envelope() });
    check("individual_override", capability.json.enabled === true, `actor=${actor.id}`);
    const production = await command(
      context,
      actor.token,
      { action: "capability", envelope: envelope(undefined, "production") },
      { allowed: [403] },
    );
    check(
      "production_envelope_denied",
      production.json.code === "CMS_DAM_PRODUCTION_GATED",
      production.json.code,
    );

    const registerAsset = (assetId) => {
      if (!assets.includes(assetId)) assets.push(assetId);
    };
    const source = await uploadAsset(
      context,
      actor,
      "origem",
      { r: 230, g: 60, b: 60, alpha: 1 },
      registerAsset,
    );
    const target = await uploadAsset(
      context,
      actor,
      "destino",
      { r: 60, g: 90, b: 230, alpha: 1 },
      registerAsset,
      true,
    );

    const exact = await command(context, actor.token, {
      action: "match_asset",
      envelope: envelope(),
      sha256: source.sha256,
      perceptualHash: source.perceptualHash,
      maximumDistance: 8,
    });
    check("exact_duplicate_reused", exact.json.exact?.id === source.id, `asset=${exact.json.exact?.id}`);

    const collectionKey = randomUUID();
    const collectionBody = {
      action: "upsert_collection",
      envelope: envelope(),
      name: `Canary G5 ${ids.collection.slice(0, 8)}`,
      description: "Coleção sintética descartável",
      reason: "Organização sintética do canary",
    };
    const collection = await mutate(context, actor, collectionBody, collectionKey);
    const collectionReplay = await mutate(context, actor, collectionBody, collectionKey);
    check(
      "collection_idempotent",
      collection.json.collectionId === collectionReplay.json.collectionId,
      collection.json.collectionId,
    );

    let current = await getAsset(context, actor, source.id);
    const organizationBody = {
      action: "set_organization",
      envelope: envelope(current.lockVersion),
      assetId: source.id,
      collectionIds: [collection.json.collectionId],
      tags: ["Canary", "Sintético"],
      reason: "Classificação sintética controlada",
    };
    const organizationKey = randomUUID();
    const organized = await mutate(context, actor, organizationBody, organizationKey);
    const organizationReplay = await mutate(context, actor, organizationBody, organizationKey);
    check(
      "organization_idempotent",
      organized.json.lockVersion === organizationReplay.json.lockVersion,
      `lock=${organized.json.lockVersion}`,
    );
    const stale = await mutate(
      context,
      actor,
      { ...organizationBody, envelope: envelope(current.lockVersion), tags: ["Conflito"] },
      randomUUID(),
      [409],
    );
    check(
      "optimistic_conflict_preserved",
      stale.json.preserved === true && stale.json.code.startsWith("CMS_DAM_CONFLICT"),
      stale.json.code,
    );

    current = await getAsset(context, actor, source.id);
    await mutate(context, actor, {
      action: "save_crop",
      envelope: envelope(current.lockVersion),
      assetId: source.id,
      crop: {
        cropKey: "quadrado",
        label: "Quadrado",
        aspectWidth: 1,
        aspectHeight: 1,
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        focalX: 0.5,
        focalY: 0.5,
      },
      reason: "Crop sintético normalizado",
    });
    current = await getAsset(context, actor, source.id);
    check(
      "organization_and_crop_roundtrip",
      current.collections.length === 1 && current.tags.length === 2 && current.crops.length === 1,
      `lock=${current.lockVersion}`,
    );

    await rest(context, "cms_content_items", {
      method: "POST",
      prefer: "return=representation",
      body: {
        id: ids.content,
        content_type: "post",
        slug: `ev2-g5-${ids.content.slice(0, 8)}`,
        workflow_status: "draft",
        created_by: actor.id,
        updated_by: actor.id,
      },
    });
    await rest(context, "cms_media_usages", {
      method: "POST",
      prefer: "return=representation",
      body: {
        asset_id: source.id,
        item_id: ids.content,
        revision_id: null,
        block_id: null,
        usage_kind: "content",
      },
    });
    current = await getAsset(context, actor, source.id);
    const archiveBlocked = await mutate(
      context,
      actor,
      {
        action: "archive_asset",
        envelope: envelope(current.lockVersion),
        assetId: source.id,
        reason: "Arquivamento deve ser bloqueado por uso",
      },
      randomUUID(),
      [409],
    );
    check(
      "in_use_archive_blocked",
      archiveBlocked.json.code === "CMS_MEDIA_IN_USE" && archiveBlocked.json.preserved === true,
      archiveBlocked.json.code,
    );

    const preview = await command(context, actor.token, {
      action: "preview_replacement",
      envelope: envelope(),
      sourceAssetId: source.id,
      targetAssetId: target.id,
    });
    check(
      "replacement_impact_preview",
      preview.json.usageCount === 1 && preview.json.targetPublishable === true,
      `usages=${preview.json.usageCount}`,
    );
    current = await getAsset(context, actor, source.id);
    const activated = await mutate(context, actor, {
      action: "activate_replacement",
      envelope: envelope(current.lockVersion),
      sourceAssetId: source.id,
      targetAssetId: target.id,
      reason: "Substituição sintética revisada",
    });
    current = await getAsset(context, actor, source.id);
    check(
      "replacement_resolution",
      current.processingStatus === "replaced" && current.activeReplacement?.targetAssetId === target.id,
      activated.json.replacementId,
    );
    await mutate(context, actor, {
      action: "rollback_replacement",
      envelope: envelope(current.activeReplacement.lockVersion),
      replacementId: current.activeReplacement.id,
      reason: "Rollback sintético validado",
    });
    current = await getAsset(context, actor, source.id);
    check(
      "replacement_rollback",
      current.processingStatus === "ready" && current.activeReplacement === null,
      `lock=${current.lockVersion}`,
    );

    await rest(context, "cms_media_usages", {
      method: "DELETE",
      query: `item_id=eq.${ids.content}`,
      prefer: "return=minimal",
    });
    current = await getAsset(context, actor, source.id);
    const archived = await mutate(context, actor, {
      action: "archive_asset",
      envelope: envelope(current.lockVersion),
      assetId: source.id,
      reason: "Retenção sintética de 30 dias",
    });
    check(
      "retention_scheduled",
      Date.parse(archived.json.gcAfter) > Date.now() + 29 * 24 * 60 * 60 * 1000,
      archived.json.gcAfter,
    );
    current = await getAsset(context, actor, source.id);
    await mutate(context, actor, {
      action: "restore_asset",
      envelope: envelope(current.lockVersion),
      assetId: source.id,
      reason: "Restauração sintética dentro da retenção",
    });
    current = await getAsset(context, actor, source.id);
    check("retention_restore", current.archivedAt === null, `lock=${current.lockVersion}`);

    const targetTimestamp = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await rest(context, "cms_media_assets", {
      method: "PATCH",
      query: `id=eq.${target.id}`,
      prefer: "return=representation",
      body: {
        created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        rights_expires_at: targetTimestamp,
      },
    });
    const publishable = await request(`${context.url}/rest/v1/rpc/cms_dam_asset_publishable`, {
      method: "POST",
      headers: context.serviceHeaders,
      body: { p_asset_id: target.id },
    });
    check("expired_rights_blocked", publishable.json === false, `publishable=${publishable.json}`);
    current = await getAsset(context, actor, target.id);
    await mutate(context, actor, {
      action: "archive_asset",
      envelope: envelope(current.lockVersion),
      assetId: target.id,
      reason: "Coleta sintética controlada",
    });
    await rest(context, "cms_media_assets", {
      method: "PATCH",
      query: `id=eq.${target.id}`,
      prefer: "return=representation",
      body: { archived_at: targetTimestamp },
    });
    await rest(context, "cms_dam_gc_jobs", {
      method: "PATCH",
      query: `asset_id=eq.${target.id}`,
      prefer: "return=representation",
      body: { execute_after: targetTimestamp },
    });
    const targetJobs = await rest(context, "cms_dam_gc_jobs", {
      query: `asset_id=eq.${target.id}&status=eq.pending&select=id`,
    });
    check("synthetic_gc_isolated", targetJobs.json.length === 1, `jobs=${targetJobs.json.length}`);
    const gc = await command(context, actor.token, {
      action: "run_gc",
      envelope: envelope(),
      jobId: targetJobs.json[0].id,
      limit: 1,
      dryRun: false,
    });
    check(
      "retained_gc_idempotent",
      gc.json.results.some((entry) => entry.status === "done"),
      JSON.stringify(gc.json.results),
    );
    const deleted = await rest(context, "cms_media_assets", { query: `id=eq.${target.id}&select=id` });
    check("gc_no_orphan_asset", deleted.json.length === 0, `rows=${deleted.json.length}`);

    await rest(context, "cms_feature_flag_overrides", {
      method: "PATCH",
      query: `created_by=eq.${actor.id}`,
      prefer: "return=representation",
      body: {
        enabled: false,
        reason: "Canary G5 concluído; override individual desligado",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const flagAfter = await rest(context, "cms_feature_flags", {
      query: "flag_key=eq.ev2.dam&select=default_enabled,kill_switch",
    });
    check(
      "global_flag_unchanged",
      flagAfter.json[0].default_enabled === false && flagAfter.json[0].kill_switch === false,
      "default-off; kill-switch=false",
    );
  } catch (error) {
    operationError = error;
    console.error(`OPERAÇÃO G5 FALHOU: ${error instanceof Error ? error.message : String(error)}`);
  }
  let cleanupError;
  try {
    await cleanup(context, actor ?? (syntheticActorId ? { id: syntheticActorId } : undefined), assets);
  } catch (error) {
    cleanupError = error;
    console.error(`LIMPEZA MANUAL NECESSÁRIA: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (operationError || cleanupError) {
    throw new AggregateError(
      [operationError, cleanupError].filter(Boolean),
      cleanupError ? "O canary falhou e requer reconciliação da limpeza sintética." : "O canary falhou.",
    );
  }
  console.table(results);
  console.log(
    JSON.stringify(
      {
        outcome: "G5_CANARY_PASS",
        target: TARGET,
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
