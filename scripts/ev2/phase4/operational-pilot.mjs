import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TARGET = {
  ref: "glcqsosxwgmlhzgcsnzv",
  name: "GAIATEC CMS Staging",
  region: "us-east-2",
  origin: "https://ev2-g4-canary.gaiatec-cms-staging.pages.dev",
};
const PILOT_NAMESPACE = "b36f7ad3-c48a-5c9e-9e94-38dc65748940";
const ACTOR_EMAIL = "ev2-g4-operational-pilot-op01@example.invalid";
const EXPECTED_BLOCKED = ["GAI-0691", "GAI-0696"];
const CRITICAL_FIELDS = ["masterId", "name", "model", "manufacturer", "category"];
const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultManifestPath = path.join(currentDirectory, "operational-pilot.json");

function parseUuid(value) {
  return Buffer.from(value.replaceAll("-", ""), "hex");
}

export function uuidV5(name, namespace = PILOT_NAMESPACE) {
  const digest = createHash("sha1").update(parseUuid(namespace)).update(name).digest().subarray(0, 16);
  digest[6] = (digest[6] & 0x0f) | 0x50;
  digest[8] = (digest[8] & 0x3f) | 0x80;
  const value = digest.toString("hex");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function normalizeName(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function slugify(value) {
  return normalizeName(value).replaceAll(" ", "-");
}

export function validateManifest(manifest) {
  const errors = [];
  if (manifest?.schemaVersion !== 1) errors.push("schemaVersion deve ser 1");
  if (manifest?.environment !== "staging" || manifest?.siteKey !== "main") {
    errors.push("o manifesto deve permanecer limitado a staging/main");
  }
  if (!/^[0-9a-f]{64}$/.test(manifest?.source?.sha256 ?? "")) errors.push("SHA-256 da fonte inválido");
  if (!Array.isArray(manifest?.products) || manifest.products.length < 20 || manifest.products.length > 50) {
    errors.push("o lote operacional deve conter entre 20 e 50 produtos");
  }
  if (
    manifest?.authority?.mpn !== "manufacturer" ||
    manifest?.authority?.gtin !== "gs1_or_erp" ||
    manifest?.authority?.ncm !== "erp_or_fiscal" ||
    manifest?.authority?.sku !== "cms_generated"
  ) {
    errors.push("hierarquia de autoridade divergente da decisão operacional");
  }

  const products = Array.isArray(manifest?.products) ? manifest.products : [];
  const ids = products.map((product) => product.masterId);
  if (new Set(ids).size !== ids.length) errors.push("IDs mestres duplicados");
  for (const [index, product] of products.entries()) {
    if (!/^GAI-\d{4}$/.test(product.masterId ?? "")) errors.push(`produto ${index + 1}: ID mestre inválido`);
    if (!Number.isInteger(product.sourceRow) || product.sourceRow < 2)
      errors.push(`${product.masterId}: linha-fonte inválida`);
    for (const field of ["name", "model", "segment", "category", "subcategory", "family", "qualityStatus"]) {
      if (typeof product[field] !== "string" || !product[field].trim())
        errors.push(`${product.masterId}: ${field} ausente`);
    }
    for (const forbidden of ["mpn", "gtin", "ncm", "sku"]) {
      if (Object.hasOwn(product, forbidden))
        errors.push(`${product.masterId}: ${forbidden} não pode ser pré-preenchido`);
    }
    if (!["review_ready", "incomplete", "source_blocked"].includes(product.qualityStatus)) {
      errors.push(`${product.masterId}: qualityStatus inválido`);
    }
    if (product.qualityStatus !== "review_ready" && !product.qualityReason) {
      errors.push(`${product.masterId}: justificativa de qualidade ausente`);
    }
    if (product.range) {
      if (
        !Number.isFinite(product.range.min) ||
        !Number.isFinite(product.range.max) ||
        product.range.min > product.range.max ||
        product.range.unit !== "mg/L" ||
        product.range.homologated !== false
      ) {
        errors.push(`${product.masterId}: faixa documental inválida ou homologada sem revisão`);
      }
    }
  }

  const blocked = products
    .filter((product) => product.qualityStatus === "source_blocked")
    .map((product) => product.masterId)
    .sort();
  if (JSON.stringify(blocked) !== JSON.stringify([...EXPECTED_BLOCKED].sort())) {
    errors.push("os bloqueios documentais obrigatórios GAI-0691/GAI-0696 foram alterados");
  }
  const completedCritical = products.reduce(
    (total, product) => total + CRITICAL_FIELDS.filter((field) => Boolean(product[field])).length,
    0,
  );
  const criticalTotal = products.length * CRITICAL_FIELDS.length;
  const completeness = criticalTotal ? Number(((completedCritical / criticalTotal) * 100).toFixed(2)) : 0;
  return {
    valid: errors.length === 0,
    errors,
    productCount: products.length,
    blocked,
    incomplete: products
      .filter((product) => product.qualityStatus === "incomplete")
      .map((product) => product.masterId),
    completeness,
    criticalTotal,
    completedCritical,
  };
}

function parseArguments(argv) {
  const result = { apply: false, rollback: false, manifestPath: defaultManifestPath, sourcePath: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--apply") result.apply = true;
    else if (argument === "--rollback") result.rollback = true;
    else if (argument === "--manifest") result.manifestPath = path.resolve(argv[++index] ?? "");
    else if (argument === "--source") result.sourcePath = path.resolve(argv[++index] ?? "");
    else if (argument === "--help") result.help = true;
    else throw new Error(`Argumento desconhecido: ${argument}`);
  }
  if (result.apply && result.rollback) throw new Error("Use --apply ou --rollback, nunca ambos.");
  return result;
}

function supabaseJson(args) {
  const windows = process.platform === "win32";
  const command = windows ? (process.env.ComSpec ?? "cmd.exe") : "npx";
  const commandArguments = windows
    ? ["/d", "/s", "/c", `npx supabase ${args.join(" ")}`]
    : ["supabase", ...args];
  const execution = spawnSync(command, commandArguments, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (execution.error || execution.status !== 0) {
    throw new Error(
      `Supabase CLI indisponível: ${execution.error?.message ?? execution.stderr?.trim() ?? "erro desconhecido"}`,
    );
  }
  return JSON.parse(execution.stdout);
}

async function requestJson(url, { method = "GET", headers = {}, body, allowed = [200] } = {}) {
  const response = await fetch(url, {
    method,
    headers: { ...headers, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
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
    const detail = typeof json === "string" ? json : JSON.stringify(json);
    throw new Error(`${method} ${new URL(url).pathname} falhou com HTTP ${response.status}: ${detail}`);
  }
  return { status: response.status, json, headers: response.headers };
}

async function loadRemoteContext() {
  const projects = supabaseJson(["projects", "list", "--output", "json"]);
  const project = projects.find((item) => item.ref === TARGET.ref);
  if (!project || project.name !== TARGET.name || project.region !== TARGET.region) {
    throw new Error("ALVO RECUSADO: ref, nome ou região não correspondem ao staging autorizado.");
  }
  const keys = supabaseJson([
    "projects",
    "api-keys",
    "--project-ref",
    TARGET.ref,
    "--reveal",
    "--output",
    "json",
  ]);
  const anonKey = keys.find((key) => key.id === "anon")?.api_key;
  const serviceKey = keys.find((key) => key.id === "service_role")?.api_key;
  if (!anonKey || !serviceKey) throw new Error("Chaves exclusivas do staging indisponíveis.");
  return {
    project,
    projectUrl: `https://${TARGET.ref}.supabase.co`,
    anonKey,
    serviceKey,
    serviceHeaders: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  };
}

async function restSelect(context, table, query) {
  const response = await requestJson(`${context.projectUrl}/rest/v1/${table}?${query}`, {
    headers: context.serviceHeaders,
  });
  return response.json;
}

async function restWrite(
  context,
  table,
  { method = "POST", query = "", body, prefer = "return=representation" },
) {
  const suffix = query ? `?${query}` : "";
  return requestJson(`${context.projectUrl}/rest/v1/${table}${suffix}`, {
    method,
    headers: { ...context.serviceHeaders, Prefer: prefer },
    body,
    allowed: method === "POST" ? [200, 201] : [200, 204],
  });
}

async function snapshot(context, pilotId) {
  const [products, models, skus, masters, compatibilities, contents, flags] = await Promise.all([
    restSelect(
      context,
      "cms_pim_products",
      `source_ref=like.${encodeURIComponent(`${pilotId}%`)}&select=id,status,content_item_id`,
    ),
    restSelect(context, "cms_pim_models", "select=id,product_id,mpn,status"),
    restSelect(context, "cms_pim_skus", "select=id,product_id,status"),
    restSelect(
      context,
      "cms_master_entities",
      `source_ref=eq.${encodeURIComponent(pilotId)}&select=id,entity_type,status`,
    ),
    restSelect(
      context,
      "cms_master_compatibilities",
      `source_ref=eq.${encodeURIComponent(pilotId)}&select=id,status`,
    ),
    restSelect(context, "cms_content_items", "content_type=eq.product&select=id"),
    restSelect(
      context,
      "cms_feature_flags",
      "flag_key=in.(ev2.pim_v2,ev2.master_data)&select=flag_key,default_enabled,kill_switch",
    ),
  ]);
  return {
    products: products.length,
    models: models.filter((model) => products.some((product) => product.id === model.product_id)).length,
    skus: skus.filter(
      (sku) => products.some((product) => product.id === sku.product_id) && sku.status === "active",
    ).length,
    masters: masters.filter((master) => master.status === "active").length,
    compatibilities: compatibilities.filter((item) => item.status === "active").length,
    v1Products: contents.length,
    linkedToV1: products.filter((product) => product.content_item_id).length,
    flags,
  };
}

function verifySource(manifest, sourcePath) {
  if (!sourcePath) throw new Error("Informe a planilha-fonte com --source.");
  const source = readFileSync(sourcePath);
  const sourceHash = createHash("sha256").update(source).digest("hex");
  const sourceStat = statSync(sourcePath);
  if (sourceHash !== manifest.source.sha256)
    throw new Error("SHA-256 da planilha diverge do manifesto aprovado.");
  if (path.basename(sourcePath) !== manifest.source.fileName)
    throw new Error("Nome da planilha diverge do manifesto aprovado.");
  return { sha256: sourceHash, bytes: sourceStat.size, lastWriteTimeUtc: sourceStat.mtime.toISOString() };
}

async function findActor(context) {
  const response = await requestJson(`${context.projectUrl}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: context.serviceHeaders,
  });
  return response.json.users.find((user) => user.email?.toLowerCase() === ACTOR_EMAIL) ?? null;
}

async function prepareActor(context, pilotId) {
  const password = `Ev2!${randomBytes(24).toString("base64url")}`;
  let actor = await findActor(context);
  const metadata = {
    system_actor: true,
    synthetic: false,
    purpose: pilotId,
    operator_role: "OP-01",
    reviewer_role: "REV-01",
  };
  if (actor) {
    const updated = await requestJson(`${context.projectUrl}/auth/v1/admin/users/${actor.id}`, {
      method: "PUT",
      headers: context.serviceHeaders,
      body: { password, email_confirm: true, ban_duration: "none", user_metadata: metadata },
    });
    actor = updated.json;
  } else {
    const created = await requestJson(`${context.projectUrl}/auth/v1/admin/users`, {
      method: "POST",
      headers: context.serviceHeaders,
      body: { email: ACTOR_EMAIL, password, email_confirm: true, user_metadata: metadata },
      allowed: [200],
    });
    actor = created.json;
  }

  await restWrite(context, "cms_profiles", {
    query: "on_conflict=user_id",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      user_id: actor.id,
      display_name: "Operador técnico OP-01 — piloto G4",
      display_email: ACTOR_EMAIL,
      status: "active",
      suspended_at: null,
      suspended_by: null,
    },
  });
  await restWrite(context, "cms_user_roles", {
    query: "on_conflict=user_id,role_key",
    prefer: "resolution=ignore-duplicates,return=representation",
    body: { user_id: actor.id, role_key: "technical" },
  });
  const startsAt = new Date(Date.now() - 5_000).toISOString();
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  await restWrite(context, "cms_feature_flag_overrides", {
    query: "on_conflict=flag_key,environment,scope_type,scope_key",
    prefer: "resolution=merge-duplicates,return=representation",
    body: ["ev2.pim_v2", "ev2.master_data"].map((flagKey) => ({
      flag_key: flagKey,
      environment: "staging",
      scope_type: "user",
      scope_key: actor.id,
      enabled: true,
      reason: `Piloto operacional real ${pilotId}; somente staging`,
      starts_at: startsAt,
      expires_at: expiresAt,
      created_by: actor.id,
    })),
  });
  const signIn = await requestJson(`${context.projectUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: context.anonKey },
    body: { email: ACTOR_EMAIL, password },
  });
  return { id: actor.id, token: signIn.json.access_token };
}

async function deactivateActor(context, actorId, reason) {
  if (!actorId) return;
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  await restWrite(context, "cms_feature_flag_overrides", {
    method: "PATCH",
    query: `scope_type=eq.user&scope_key=eq.${actorId}&flag_key=in.(ev2.pim_v2,ev2.master_data)`,
    body: { enabled: false, reason, expires_at: expiresAt },
  });
  await restWrite(context, "cms_user_roles", {
    method: "DELETE",
    query: `user_id=eq.${actorId}&role_key=eq.technical`,
    body: undefined,
    prefer: "return=minimal",
  });
  await restWrite(context, "cms_profiles", {
    method: "PATCH",
    query: `user_id=eq.${actorId}`,
    body: {
      status: "suspended",
      suspended_at: new Date().toISOString(),
      suspended_by: actorId,
      sessions_valid_after: new Date().toISOString(),
    },
  });
  await requestJson(`${context.projectUrl}/auth/v1/admin/users/${actorId}`, {
    method: "PUT",
    headers: context.serviceHeaders,
    body: { ban_duration: "876000h" },
  });
}

async function actorIsolation(context, actorId) {
  if (!actorId) {
    return { profileSuspended: true, activeRoles: 0, enabledOverrides: 0, authBanned: true };
  }
  const [profiles, roles, overrides, authUser] = await Promise.all([
    restSelect(
      context,
      "cms_profiles",
      `user_id=eq.${actorId}&select=status,suspended_at,sessions_valid_after`,
    ),
    restSelect(context, "cms_user_roles", `user_id=eq.${actorId}&select=role_key`),
    restSelect(
      context,
      "cms_feature_flag_overrides",
      `scope_type=eq.user&scope_key=eq.${actorId}&enabled=eq.true&select=id`,
    ),
    requestJson(`${context.projectUrl}/auth/v1/admin/users/${actorId}`, {
      headers: context.serviceHeaders,
    }),
  ]);
  return {
    profileSuspended:
      profiles.length === 1 && profiles[0].status === "suspended" && Boolean(profiles[0].suspended_at),
    activeRoles: roles.length,
    enabledOverrides: overrides.length,
    authBanned: Date.parse(authUser.json.banned_until ?? "") > Date.now(),
  };
}

function assertActorIsolation(isolation) {
  if (
    !isolation.profileSuspended ||
    isolation.activeRoles !== 0 ||
    isolation.enabledOverrides !== 0 ||
    !isolation.authBanned
  ) {
    throw new Error(`Isolamento final do operador técnico falhou: ${JSON.stringify(isolation)}`);
  }
}

function envelope(expectedVersion) {
  const result = {
    schemaVersion: 1,
    commandId: randomUUID(),
    correlationId: randomUUID(),
    occurredAt: new Date().toISOString(),
    actorContext: { environment: "staging", siteKey: "main" },
  };
  if (expectedVersion !== undefined) result.expectedVersion = expectedVersion;
  return result;
}

async function invokeFunction(context, actor, name, body, idempotencyKey) {
  return requestJson(`${context.projectUrl}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      apikey: context.anonKey,
      Authorization: `Bearer ${actor.token}`,
      Origin: TARGET.origin,
      ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
    },
    body,
  });
}

function desiredMasters(manifest) {
  const result = new Map();
  const include = (entityType, name, description = "") => {
    if (!name) return;
    result.set(`${entityType}:${normalizeName(name)}`, { entityType, name, description });
  };
  include(
    "manufacturer",
    manifest.placeholders.manufacturer,
    "Placeholder controlado: a fonte não identifica o fabricante original.",
  );
  include(
    "monitored_element",
    manifest.placeholders.monitoredElement,
    "Placeholder controlado: classificação pendente de revisão técnica.",
  );
  for (const product of manifest.products) {
    include("manufacturer", product.manufacturer);
    include("brand", product.brand);
    include("category", product.category);
    include("magnitude", product.magnitude);
    include("technology", product.technology);
  }
  return [...result.values()];
}

async function ensureMasters(context, actor, manifest) {
  const existing = await restSelect(
    context,
    "cms_master_entities",
    "site_key=eq.main&status=eq.active&select=id,entity_type,canonical_name,normalized_name,lock_version&limit=500",
  );
  const byKey = new Map(existing.map((item) => [`${item.entity_type}:${item.normalized_name}`, item]));
  let created = 0;
  for (const desired of desiredMasters(manifest)) {
    const key = `${desired.entityType}:${normalizeName(desired.name)}`;
    if (byKey.has(key)) continue;
    const response = await invokeFunction(
      context,
      actor,
      "cms-master-data",
      {
        action: "create_entity",
        envelope: envelope(),
        entityType: desired.entityType,
        name: desired.name,
        description: desired.description,
        sourceType: "import",
        sourceRef: manifest.pilotId,
      },
      randomUUID(),
    );
    byKey.set(key, {
      id: response.json.entityId,
      entity_type: desired.entityType,
      canonical_name: desired.name,
      normalized_name: normalizeName(desired.name),
      lock_version: response.json.lockVersion,
    });
    created += 1;
  }
  return { byKey, created, reused: desiredMasters(manifest).length - created };
}

function masterId(masterCatalog, type, name) {
  const entity = masterCatalog.byKey.get(`${type}:${normalizeName(name)}`);
  if (!entity) throw new Error(`Dado mestre não resolvido: ${type}/${name}`);
  return entity.id;
}

function desiredCompatibilities(manifest, masterCatalog) {
  const result = new Map();
  const include = (relationType, sourceType, sourceName, targetType, targetName) => {
    if (!sourceName || !targetName) return;
    const sourceEntityId = masterId(masterCatalog, sourceType, sourceName);
    const targetEntityId = masterId(masterCatalog, targetType, targetName);
    const key = `${relationType}:${sourceEntityId}:${targetEntityId}`;
    result.set(key, { relationType, sourceEntityId, targetEntityId });
  };
  for (const product of manifest.products) {
    const manufacturer = product.manufacturer ?? manifest.placeholders.manufacturer;
    include("manufacturer_brand", "manufacturer", manufacturer, "brand", product.brand);
    include("category_magnitude", "category", product.category, "magnitude", product.magnitude);
    include("category_technology", "category", product.category, "technology", product.technology);
    include(
      "category_monitored_element",
      "category",
      product.category,
      "monitored_element",
      manifest.placeholders.monitoredElement,
    );
  }
  return [...result.values()];
}

async function ensureCompatibilities(context, actor, manifest, masterCatalog) {
  const existing = await restSelect(
    context,
    "cms_master_compatibilities",
    "site_key=eq.main&status=eq.active&select=id,relation_type,source_entity_id,target_entity_id&limit=500",
  );
  const keys = new Set(
    existing.map((item) => `${item.relation_type}:${item.source_entity_id}:${item.target_entity_id}`),
  );
  let created = 0;
  for (const desired of desiredCompatibilities(manifest, masterCatalog)) {
    const key = `${desired.relationType}:${desired.sourceEntityId}:${desired.targetEntityId}`;
    if (keys.has(key)) continue;
    await invokeFunction(
      context,
      actor,
      "cms-master-data",
      {
        action: "upsert_compatibility",
        envelope: envelope(),
        ...desired,
        sourceType: "import",
        sourceRef: manifest.pilotId,
      },
      randomUUID(),
    );
    keys.add(key);
    created += 1;
  }
  return { created, reused: desiredCompatibilities(manifest, masterCatalog).length - created };
}

async function ensureAttributeCatalog(context, actorId, manifest, masterCatalog) {
  const categoryId = masterId(masterCatalog, "category", "Análise de Água");
  const definitionId = uuidV5(`${manifest.pilotId}:attribute:largest-documented-range`);
  const attributeSetId = uuidV5(`${manifest.pilotId}:attribute-set:${categoryId}`);
  const versionId = uuidV5(`${manifest.pilotId}:attribute-set-version:${categoryId}:1`);
  const source = manifest.pilotId;
  await restWrite(context, "cms_pim_units", {
    query: "on_conflict=code",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      code: "mg/L",
      label: "Miligrama por litro",
      symbol: "mg/L",
      dimension_key: "mass_concentration",
      canonical_code: "mg/L",
      factor_to_canonical: 1,
      offset_to_canonical: 0,
      created_by: actorId,
      updated_by: actorId,
    },
  });
  await restWrite(context, "cms_pim_units", {
    query: "on_conflict=code",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      code: "g/L",
      label: "Grama por litro",
      symbol: "g/L",
      dimension_key: "mass_concentration",
      canonical_code: "mg/L",
      factor_to_canonical: 1000,
      offset_to_canonical: 0,
      created_by: actorId,
      updated_by: actorId,
    },
  });
  await restWrite(context, "cms_pim_attribute_definitions", {
    query: "on_conflict=id",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      id: definitionId,
      attribute_key: "largest_documented_range",
      label: "Maior faixa documentada",
      description:
        "Maior faixa explicitamente listada na fonte do lote; requer homologação REV-01 antes de alimentar facetas públicas.",
      data_type: "range",
      canonical_unit_code: "mg/L",
      filterable: true,
      comparable: true,
      searchable: true,
      created_by: actorId,
      updated_by: actorId,
    },
  });
  await restWrite(context, "cms_pim_attribute_sets", {
    query: "on_conflict=id",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      id: attributeSetId,
      category_id: categoryId,
      name: "Atributos documentais — Análise de Água",
      created_by: actorId,
      updated_by: actorId,
    },
  });
  await restWrite(context, "cms_pim_attribute_set_versions", {
    query: "on_conflict=id",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      id: versionId,
      attribute_set_id: attributeSetId,
      version: 1,
      status: "active",
      effective_from: new Date().toISOString(),
      created_by: actorId,
    },
  });
  await restWrite(context, "cms_pim_attribute_set_definitions", {
    query: "on_conflict=attribute_set_version_id,definition_id",
    prefer: "resolution=merge-duplicates,return=representation",
    body: {
      attribute_set_version_id: versionId,
      definition_id: definitionId,
      required: false,
      inherited: true,
      position: 0,
    },
  });
  return { definitionId, categoryId, source };
}

export function buildProductInput(product, manifest, masterCatalog, attributeCatalog, verifiedAt) {
  const productId = uuidV5(`${manifest.pilotId}:product:${product.masterId}`);
  const modelId = uuidV5(`${manifest.pilotId}:model:${product.masterId}:${product.model}`);
  const manufacturerName = product.manufacturer ?? manifest.placeholders.manufacturer;
  const sourceRef = `${manifest.pilotId}|${product.masterId}|${product.qualityStatus}`;
  const attributes = product.range
    ? [
        {
          id: uuidV5(`${manifest.pilotId}:attribute-value:${product.masterId}:largest-documented-range`),
          definitionId: attributeCatalog.definitionId,
          scope: "product",
          ownerId: productId,
          value: { min: product.range.min, max: product.range.max },
          unitCode: product.range.unit,
          sourceType: "import",
          sourceRef,
          confidence: 0.9,
          homologated: false,
        },
      ]
    : [];
  return {
    id: productId,
    name: product.name,
    slug: slugify(product.name),
    summary: "",
    valueProposition: "",
    status: "draft",
    sourceType: "import",
    sourceRef,
    masterData: {
      manufacturerId: masterId(masterCatalog, "manufacturer", manufacturerName),
      ...(product.brand ? { brandId: masterId(masterCatalog, "brand", product.brand) } : {}),
      categoryId: masterId(masterCatalog, "category", product.category),
      magnitudeIds: product.magnitude ? [masterId(masterCatalog, "magnitude", product.magnitude)] : [],
      technologyIds: product.technology ? [masterId(masterCatalog, "technology", product.technology)] : [],
      installationIds: [],
      monitoredElementIds: [
        masterId(masterCatalog, "monitored_element", manifest.placeholders.monitoredElement),
      ],
    },
    models: [
      { id: modelId, name: product.model, status: "active", primary: true, position: 0, variants: [] },
    ],
    attributes,
    externalIdentifiers: [
      {
        id: uuidV5(`${manifest.pilotId}:external-id:${product.masterId}`),
        ownerType: "product",
        ownerId: productId,
        kind: "other",
        value: product.masterId,
        issuer: "Portfólio Mestre GAIATEC",
        sourceType: "import",
        sourceRef,
      },
    ],
    provenance: [
      {
        id: uuidV5(`${manifest.pilotId}:provenance:${product.masterId}`),
        sourceKind: "import",
        sourceRef: `${manifest.source.fileName}#${manifest.source.sheet}!linha-${product.sourceRow}:${product.masterId}`,
        sourceSha256: manifest.source.sha256,
        confidence:
          product.qualityStatus === "source_blocked"
            ? 0.5
            : product.qualityStatus === "incomplete"
              ? 0.7
              : 0.9,
        rightsConfirmed: true,
        verifiedAt,
      },
    ],
  };
}

async function saveProducts(context, actor, manifest, masterCatalog, attributeCatalog) {
  const verifiedAt = new Date().toISOString();
  const existing = await restSelect(
    context,
    "cms_pim_products",
    `source_ref=like.${encodeURIComponent(`${manifest.pilotId}%`)}&select=id,name,slug,status,lock_version&limit=100`,
  );
  const byId = new Map(existing.map((product) => [product.id, product]));
  const products = [];
  let created = 0;
  let reused = 0;
  for (const sourceProduct of manifest.products) {
    const input = buildProductInput(sourceProduct, manifest, masterCatalog, attributeCatalog, verifiedAt);
    const current = byId.get(input.id);
    if (current) {
      if (current.name !== input.name || current.slug !== input.slug || current.status !== "draft") {
        throw new Error(
          `${sourceProduct.masterId}: produto existente diverge do manifesto; atualização automática recusada.`,
        );
      }
      reused += 1;
    } else {
      await invokeFunction(
        context,
        actor,
        "cms-pim",
        {
          action: "save_product",
          envelope: envelope(),
          mode: "create",
          product: input,
          reason: `Carga operacional autorizada ${manifest.pilotId}`,
        },
        randomUUID(),
      );
      created += 1;
    }
    products.push({ source: sourceProduct, input });
  }
  return { products, created, reused };
}

async function generateSkus(context, actor, loadedProducts) {
  const existing = await restSelect(
    context,
    "cms_pim_skus",
    "status=eq.active&select=id,product_id,model_id,sku&limit=100",
  );
  const byModel = new Map(existing.map((sku) => [sku.model_id, sku]));
  let created = 0;
  let reused = 0;
  const skus = new Map();
  for (const product of loadedProducts) {
    if (!product.source.skuEligible) continue;
    const model = product.input.models[0];
    let sku = byModel.get(model.id);
    if (!sku) {
      const response = await invokeFunction(
        context,
        actor,
        "cms-pim",
        {
          action: "generate_sku",
          envelope: envelope(),
          productId: product.input.id,
          modelId: model.id,
          reason: `SKU gerado pelo CMS para ${product.source.masterId}`,
        },
        randomUUID(),
      );
      sku = response.json.sku;
      created += 1;
    } else {
      reused += 1;
    }
    if (!/^GAI-[A-Z0-9]+-\d{6}$/.test(sku.sku))
      throw new Error(`${product.source.masterId}: SKU fora do padrão.`);
    skus.set(model.id, sku.sku);
  }
  return { skus, created, reused };
}

async function reconcile(
  context,
  actor,
  manifest,
  loadedProducts,
  generatedSkus,
  attributeCatalog,
  baseline,
) {
  const details = [];
  let divergenceCount = 0;
  for (const item of loadedProducts) {
    const detail = await invokeFunction(context, actor, "cms-pim", {
      action: "get_product",
      envelope: envelope(),
      productId: item.input.id,
    });
    const actual = detail.json.product;
    const expectedSku = generatedSkus.skus.get(item.input.models[0].id);
    const mismatches = [];
    if (actual.name !== item.input.name) mismatches.push("name");
    if (actual.status !== "draft") mismatches.push("status");
    if (actual.models.length !== 1 || actual.models[0].name !== item.input.models[0].name)
      mismatches.push("model");
    if (actual.models[0]?.mpn !== undefined) mismatches.push("mpn_inferred");
    if (actual.externalIdentifiers[0]?.value !== item.source.masterId) mismatches.push("master_id");
    if (actual.provenance[0]?.sourceSha256 !== manifest.source.sha256) mismatches.push("provenance");
    if (item.source.qualityStatus === "source_blocked" && actual.skus.length !== 0)
      mismatches.push("blocked_sku");
    if (item.source.skuEligible && actual.skus[0]?.sku !== expectedSku) mismatches.push("cms_sku");

    const preview = await invokeFunction(context, actor, "cms-pim", {
      action: "preview_v1_adapter",
      envelope: envelope(),
      productId: item.input.id,
      basePayload: {
        summary: "",
        manufacturer: {},
        classification: { subcategory: item.source.subcategory },
        commercial: { valueProposition: "" },
        specifications: [],
      },
    });
    const payload = preview.json.payload;
    const expectedManufacturer = item.source.manufacturer ?? manifest.placeholders.manufacturer;
    const expectedBrand = item.source.brand ?? "Marca não informada";
    if (payload.title !== item.source.name) mismatches.push("adapter_title");
    if (payload.manufacturer?.name !== expectedManufacturer) mismatches.push("adapter_manufacturer");
    if (payload.brand?.name !== expectedBrand) mismatches.push("adapter_brand");
    if (payload.models?.[0]?.model !== item.source.model) mismatches.push("adapter_model");
    if (payload.models?.[0]?.manufacturerReference !== "Não informado") mismatches.push("adapter_mpn");
    if (payload.classification?.subcategory !== item.source.subcategory)
      mismatches.push("adapter_subcategory");
    if (item.source.skuEligible && payload.models?.[0]?.sku !== expectedSku) mismatches.push("adapter_sku");
    divergenceCount += mismatches.length;
    details.push({ masterId: item.source.masterId, qualityStatus: item.source.qualityStatus, mismatches });
  }

  const queryMin = 0.1 * 1000;
  const queryMax = 0.3 * 1000;
  const rangeRows = await restSelect(
    context,
    "cms_pim_attribute_values",
    `definition_id=eq.${attributeCatalog.definitionId}&active=eq.true&canonical_min=lte.${queryMax}&canonical_max=gte.${queryMin}&select=product_id,canonical_min,canonical_max`,
  );
  const productById = new Map(loadedProducts.map((item) => [item.input.id, item.source.masterId]));
  const rangeMatches = rangeRows
    .map((row) => productById.get(row.product_id))
    .filter(Boolean)
    .sort();
  if (JSON.stringify(rangeMatches) !== JSON.stringify(["GAI-0007"])) {
    throw new Error(`Busca por faixa divergente: ${JSON.stringify(rangeMatches)}`);
  }

  const finalSnapshot = await snapshot(context, manifest.pilotId);
  const expectedSkuCount = manifest.products.filter((product) => product.skuEligible).length;
  if (
    finalSnapshot.products !== manifest.products.length ||
    finalSnapshot.models !== manifest.products.length ||
    finalSnapshot.skus !== expectedSkuCount ||
    finalSnapshot.linkedToV1 !== 0 ||
    finalSnapshot.v1Products !== baseline.v1Products
  ) {
    throw new Error(`Reconciliação quantitativa divergente: ${JSON.stringify(finalSnapshot)}`);
  }
  if (divergenceCount !== 0) throw new Error(`Round-trip com ${divergenceCount} divergência(s) crítica(s).`);
  return {
    divergenceCount,
    productsReconciled: details.length,
    sourceBlocked: details
      .filter((item) => item.qualityStatus === "source_blocked")
      .map((item) => item.masterId),
    incomplete: details.filter((item) => item.qualityStatus === "incomplete").map((item) => item.masterId),
    rangeSearch: {
      input: { min: 0.1, max: 0.3, unit: "g/L" },
      canonical: { min: queryMin, max: queryMax, unit: "mg/L" },
      intersection: rangeMatches,
      homologated: false,
    },
    snapshot: finalSnapshot,
  };
}

async function verifyCapabilities(context, actor) {
  const [pim, masters] = await Promise.all([
    invokeFunction(context, actor, "cms-pim", { action: "capability", envelope: envelope() }),
    invokeFunction(context, actor, "cms-master-data", { action: "capability", envelope: envelope() }),
  ]);
  if (pim.json.enabled !== true || masters.json.enabled !== true)
    throw new Error("Overrides individuais não habilitaram as capacidades.");
}

async function runRollback(context, manifest) {
  const actor = await findActor(context);
  if (actor)
    await deactivateActor(context, actor.id, `Rollback lógico ${manifest.pilotId}; dados preservados`);
  const isolation = await actorIsolation(context, actor?.id);
  assertActorIsolation(isolation);
  const state = await snapshot(context, manifest.pilotId);
  if (state.flags.some((flag) => flag.default_enabled || flag.kill_switch)) {
    throw new Error("Flags globais divergiram durante o rollback lógico.");
  }
  return {
    mode: "logical-rollback",
    actorDisabled: Boolean(actor),
    dataPreserved: true,
    isolation,
    state,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log("Uso: node operational-pilot.mjs --source <xlsx> [--apply | --rollback]");
    return;
  }
  const manifest = JSON.parse(readFileSync(options.manifestPath, "utf8"));
  const validation = validateManifest(manifest);
  if (!validation.valid) throw new Error(`Manifesto inválido:\n- ${validation.errors.join("\n- ")}`);
  const context = await loadRemoteContext();
  if (options.rollback) {
    console.log(JSON.stringify(await runRollback(context, manifest), null, 2));
    return;
  }
  const source = verifySource(manifest, options.sourcePath);
  const baseline = await snapshot(context, manifest.pilotId);
  if (baseline.flags.some((flag) => flag.default_enabled || flag.kill_switch)) {
    throw new Error("Flags globais do PIM/dados mestres não estão no estado seguro esperado.");
  }
  const dryRun = {
    mode: options.apply ? "apply-authorized" : "dry-run",
    target: { ref: context.project.ref, name: context.project.name, region: context.project.region },
    manifest: validation,
    source,
    baseline,
    planned: {
      products: manifest.products.length,
      models: manifest.products.length,
      skus: manifest.products.filter((product) => product.skuEligible).length,
      rangeAttributes: manifest.products.filter((product) => product.range).length,
      publication: 0,
      productionMutations: 0,
    },
  };
  if (!options.apply) {
    console.log(JSON.stringify(dryRun, null, 2));
    return;
  }

  let actor;
  let result;
  try {
    actor = await prepareActor(context, manifest.pilotId);
    await verifyCapabilities(context, actor);
    const masterCatalog = await ensureMasters(context, actor, manifest);
    const compatibilities = await ensureCompatibilities(context, actor, manifest, masterCatalog);
    const attributeCatalog = await ensureAttributeCatalog(context, actor.id, manifest, masterCatalog);
    const loaded = await saveProducts(context, actor, manifest, masterCatalog, attributeCatalog);
    const generatedSkus = await generateSkus(context, actor, loaded.products);
    const reconciliation = await reconcile(
      context,
      actor,
      manifest,
      loaded.products,
      generatedSkus,
      attributeCatalog,
      baseline,
    );
    result = {
      ...dryRun,
      outcome: "applied-and-reconciled",
      masterData: { created: masterCatalog.created, reused: masterCatalog.reused, compatibilities },
      productWrites: { created: loaded.created, reused: loaded.reused },
      skuWrites: { created: generatedSkus.created, reused: generatedSkus.reused },
      reconciliation,
    };
  } finally {
    if (actor?.id) {
      await deactivateActor(
        context,
        actor.id,
        `Piloto ${manifest.pilotId} encerrado; escopo individual desligado`,
      );
    }
  }
  const isolation = await actorIsolation(context, actor?.id);
  assertActorIsolation(isolation);
  console.log(JSON.stringify({ ...result, isolation }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
