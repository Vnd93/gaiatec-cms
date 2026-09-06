import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment, isProductionOperationEnabled } from "../_shared/ev2-environment.ts";
import {
  clientAddress,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
  sha256,
} from "../_shared/security.ts";

const Uuid = z.uuid();
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: z.enum(["local", "staging", "production"]),
        siteKey: z.string().regex(/^[a-z][a-z0-9_-]{1,63}$/),
      })
      .strict(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict();
const Axis = z
  .object({
    axisKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(60),
    axisLabel: z.string().trim().min(1).max(120),
    optionKey: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80),
    optionLabel: z.string().trim().min(1).max(120),
  })
  .strict();
const Variant = z
  .object({
    id: Uuid,
    name: z.string().trim().min(1).max(160),
    code: z.string().trim().max(120).optional(),
    status: z.enum(["active", "discontinued"]).default("active"),
    position: z.number().int().min(0).max(999),
    axes: z.array(Axis).min(1).max(12),
  })
  .strict();
const Model = z
  .object({
    id: Uuid,
    name: z.string().trim().min(1).max(160),
    mpn: z.string().trim().min(1).max(160).optional(),
    status: z.enum(["active", "discontinued"]).default("active"),
    primary: z.boolean().default(false),
    position: z.number().int().min(0).max(999),
    variants: z.array(Variant).max(200).default([]),
  })
  .strict();
const Attribute = z
  .object({
    id: Uuid,
    definitionId: Uuid,
    scope: z.enum(["product", "model", "variant"]),
    ownerId: Uuid,
    value: z.union([
      z.string().max(500),
      z.number().finite(),
      z.boolean(),
      z.array(z.string().trim().min(1).max(120)).max(30),
      z.object({ min: z.number().finite(), max: z.number().finite() }).strict(),
    ]),
    unitCode: z.string().trim().max(40).optional(),
    sourceType: z.enum(["manual", "import", "legacy"]).default("manual"),
    sourceRef: z.string().trim().max(300).optional(),
    confidence: z.number().min(0).max(1).default(1),
    homologated: z.boolean().default(false),
  })
  .strict();
const ExternalIdentifier = z
  .object({
    id: Uuid,
    ownerType: z.enum(["product", "model", "variant", "sku"]),
    ownerId: Uuid,
    kind: z.enum(["erp", "gtin", "ncm", "other"]),
    value: z.string().trim().min(1).max(180),
    issuer: z.string().trim().max(160).optional(),
    sourceType: z.enum(["manual", "import", "legacy"]).default("manual"),
    sourceRef: z.string().trim().max(300).optional(),
  })
  .strict();
const Provenance = z
  .object({
    id: Uuid,
    sourceKind: z.enum(["official_manufacturer", "owner_authored", "import", "legacy", "other"]),
    sourceRef: z.string().trim().min(1).max(500),
    sourceSha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
    confidence: z.number().min(0).max(1).default(1),
    rightsConfirmed: z.boolean(),
    verifiedAt: z.iso.datetime().optional(),
  })
  .strict();
const Product = z
  .object({
    id: Uuid,
    contentItemId: Uuid.optional(),
    name: z.string().trim().min(1).max(180),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(180),
    summary: z.string().trim().max(500).default(""),
    valueProposition: z.string().trim().max(500).default(""),
    status: z.enum(["draft", "active", "inactive", "archived"]).default("draft"),
    sourceType: z.enum(["manual", "import", "legacy"]).default("manual"),
    sourceRef: z.string().trim().max(300).optional(),
    masterData: z
      .object({
        manufacturerId: Uuid,
        brandId: Uuid.optional(),
        lineId: Uuid.optional(),
        categoryId: Uuid,
        magnitudeIds: z.array(Uuid).max(30).default([]),
        technologyIds: z.array(Uuid).max(30).default([]),
        installationIds: z.array(Uuid).max(30).default([]),
        monitoredElementIds: z.array(Uuid).min(1).max(30),
      })
      .strict(),
    models: z.array(Model).min(1).max(100),
    attributes: z.array(Attribute).max(500).default([]),
    externalIdentifiers: z.array(ExternalIdentifier).max(100).default([]),
    provenance: z.array(Provenance).min(1).max(50),
  })
  .strict()
  .superRefine((product, context) => {
    if (product.models.filter((model) => model.primary && model.status === "active").length !== 1) {
      context.addIssue({ code: "custom", path: ["models"], message: "one active primary model is required" });
    }
    const modelIds = product.models.map((model) => model.id);
    const variantIds = product.models.flatMap((model) => model.variants.map((variant) => variant.id));
    if (new Set(modelIds).size !== modelIds.length || new Set(variantIds).size !== variantIds.length) {
      context.addIssue({ code: "custom", path: ["models"], message: "PIM identities must be unique" });
    }
  });

const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z
    .object({
      action: z.literal("list_products"),
      envelope: Envelope,
      query: z.string().trim().max(180).default(""),
      includeArchived: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal("get_product"), envelope: Envelope, productId: Uuid }).strict(),
  z
    .object({
      action: z.literal("save_product"),
      envelope: Envelope,
      mode: z.enum(["create", "update"]),
      product: Product,
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (command.mode === "update" && command.envelope.expectedVersion === undefined) {
        context.addIssue({ code: "custom", path: ["envelope", "expectedVersion"], message: "expected version required" });
      }
      if (command.mode === "create" && command.envelope.expectedVersion !== undefined) {
        context.addIssue({ code: "custom", path: ["envelope", "expectedVersion"], message: "expected version forbidden" });
      }
    }),
  z
    .object({
      action: z.literal("archive_product"),
      envelope: Envelope,
      productId: Uuid,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("generate_sku"),
      envelope: Envelope,
      productId: Uuid,
      modelId: Uuid,
      variantId: Uuid.optional(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("preview_v1_adapter"),
      envelope: Envelope,
      productId: Uuid,
      basePayload: z.record(z.string(), z.unknown()),
    })
    .strict(),
]);

type PimCommand = z.infer<typeof Command>;
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
type Row = Record<string, any>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function logPim(level: "info" | "warn" | "error", event: string, correlationId: string, context: object) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      correlationId,
      route: "/functions/v1/cms-pim",
      context,
    }),
  );
}

async function authorized(identity: Identity, permission: string) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id,
    p_permission: permission,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

function mapSku(row: Row) {
  return {
    id: row.id,
    productId: row.product_id,
    modelId: row.model_id,
    variantId: row.variant_id,
    sku: row.sku,
    status: row.status,
    createdAt: row.created_at,
    retiredAt: row.retired_at,
  };
}

function mapProduct(row: Row) {
  const links = row.cms_pim_product_master_links ?? [];
  const models = (row.cms_pim_models ?? []).map((model: Row) => ({
    id: model.id,
    name: model.name,
    mpn: model.mpn ?? undefined,
    status: model.status,
    primary: model.is_primary,
    position: model.position,
    variants: (model.cms_pim_variants ?? []).map((variant: Row) => ({
      id: variant.id,
      name: variant.name,
      code: variant.code ?? undefined,
      axes: variant.axes,
      status: variant.status,
      position: variant.position,
    })),
  }));
  return {
    id: row.id,
    contentItemId: row.content_item_id ?? undefined,
    name: row.name,
    slug: row.slug,
    summary: row.summary,
    valueProposition: row.value_proposition,
    status: row.status,
    sourceType: row.source_type,
    sourceRef: row.source_ref ?? undefined,
    lockVersion: row.lock_version,
    masterData: {
      manufacturerId: row.manufacturer_id,
      brandId: row.brand_id ?? undefined,
      lineId: row.line_id ?? undefined,
      categoryId: row.category_id,
      magnitudeIds: links.filter((link: Row) => link.dimension === "magnitude" && link.status === "active").map((link: Row) => link.entity_id),
      technologyIds: links.filter((link: Row) => link.dimension === "technology" && link.status === "active").map((link: Row) => link.entity_id),
      installationIds: links.filter((link: Row) => link.dimension === "installation" && link.status === "active").map((link: Row) => link.entity_id),
      monitoredElementIds: links.filter((link: Row) => link.dimension === "monitored_element" && link.status === "active").map((link: Row) => link.entity_id),
    },
    models,
    skus: (row.cms_pim_skus ?? []).map(mapSku),
    attributes: (row.cms_pim_attribute_values ?? []).filter((entry: Row) => entry.active).map((entry: Row) => ({
      id: entry.id,
      definitionId: entry.definition_id,
      scope: entry.owner_scope,
      ownerId: entry.owner_id,
      value: entry.value,
      unitCode: entry.unit_code ?? undefined,
      sourceType: entry.source_type,
      sourceRef: entry.source_ref ?? undefined,
      confidence: Number(entry.confidence),
      homologated: entry.homologated,
    })),
    externalIdentifiers: (row.cms_pim_external_identifiers ?? []).map((entry: Row) => ({
      id: entry.id,
      ownerType: entry.owner_type,
      ownerId: entry.owner_id,
      kind: entry.identifier_kind,
      value: entry.identifier_value,
      issuer: entry.issuer ?? undefined,
      sourceType: entry.source_type,
      sourceRef: entry.source_ref ?? undefined,
    })),
    provenance: (row.cms_pim_provenance ?? []).filter((entry: Row) => entry.active).map((entry: Row) => ({
      id: entry.id,
      sourceKind: entry.source_kind,
      sourceRef: entry.source_ref,
      sourceSha256: entry.source_sha256 ?? undefined,
      confidence: Number(entry.confidence),
      rightsConfirmed: entry.rights_confirmed,
      verifiedAt: entry.verified_at ?? undefined,
    })),
  };
}

const graphSelect = [
  "id,content_item_id,name,slug,summary,value_proposition,manufacturer_id,brand_id,line_id,category_id,status,source_type,source_ref,lock_version,updated_at",
  "cms_pim_product_master_links(id,dimension,entity_id,status)",
  "cms_pim_models(id,name,mpn,status,is_primary,position,lock_version,cms_pim_variants(id,name,code,axes,status,position,lock_version))",
  "cms_pim_skus(id,product_id,model_id,variant_id,sku,status,created_at,retired_at)",
  "cms_pim_attribute_values(id,definition_id,owner_scope,owner_id,value,unit_code,canonical_min,canonical_max,source_type,source_ref,confidence,homologated,active)",
  "cms_pim_external_identifiers(id,owner_type,owner_id,identifier_kind,identifier_value,issuer,source_type,source_ref)",
  "cms_pim_provenance(id,source_kind,source_ref,source_sha256,confidence,rights_confirmed,verified_at,active)",
].join(",");

async function loadProduct(identity: Identity, productId: string) {
  const { data, error } = await identity.admin.from("cms_pim_products").select(graphSelect).eq("id", productId).maybeSingle();
  if (error) throw error;
  return data ? mapProduct(data) : null;
}

async function queryPim(identity: Identity, command: PimCommand) {
  if (command.action === "list_products") {
    let query = identity.admin
      .from("cms_pim_products")
      .select("id,content_item_id,name,slug,status,lock_version,updated_at,cms_pim_models(id,cms_pim_variants(id)),cms_pim_skus(id,status)")
      .eq("site_key", command.envelope.actorContext.siteKey)
      .order("updated_at", { ascending: false })
      .limit(500);
    if (!command.includeArchived) query = query.neq("status", "archived");
    const normalizedQuery = normalizeSearch(command.query);
    if (normalizedQuery) query = query.ilike("normalized_name", `%${normalizedQuery}%`);
    const { data, error } = await query;
    if (error) throw error;
    return {
      products: (data ?? []).map((row: Row) => ({
        id: row.id,
        contentItemId: row.content_item_id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        lockVersion: row.lock_version,
        modelCount: row.cms_pim_models?.length ?? 0,
        variantCount: (row.cms_pim_models ?? []).reduce((sum: number, model: Row) => sum + (model.cms_pim_variants?.length ?? 0), 0),
        skuCount: (row.cms_pim_skus ?? []).filter((sku: Row) => sku.status === "active").length,
        updatedAt: row.updated_at,
      })),
    };
  }
  if (command.action === "get_product") return { product: await loadProduct(identity, command.productId) };
  throw new Error("query not supported");
}

async function previewV1(identity: Identity, command: Extract<PimCommand, { action: "preview_v1_adapter" }>) {
  const product = await loadProduct(identity, command.productId);
  if (!product) throw new Error("CMS_PIM_NOT_FOUND");
  const ids = [...new Set([
    product.masterData.manufacturerId,
    product.masterData.brandId,
    product.masterData.lineId,
    product.masterData.categoryId,
    ...product.masterData.magnitudeIds,
    ...product.masterData.technologyIds,
    ...product.masterData.installationIds,
    ...product.masterData.monitoredElementIds,
  ].filter(Boolean))] as string[];
  const { data: masters, error } = await identity.admin
    .from("cms_master_entities")
    .select("id,canonical_name,status")
    .in("id", ids);
  if (error) throw error;
  const labels = new Map((masters ?? []).map((entry) => [entry.id, entry.canonical_name]));
  if (labels.size !== ids.length) throw new Error("CMS_PIM_MASTER_INVALID");
  const label = (id: string | null, fallback: string) => (id ? labels.get(id) ?? fallback : fallback);
  const slug = (id: string | null, fallback: string) => slugify(label(id, fallback));
  const skuByOwner = new Map(product.skus.filter((entry: Row) => entry.status === "active").map((entry: Row) => [entry.variantId ?? entry.modelId, entry.sku]));
  const base = structuredClone(command.basePayload) as Record<string, any>;
  const manufacturerName = label(product.masterData.manufacturerId, "Fabricante");
  const brandName = label(product.masterData.brandId, "Marca não informada");
  const categoryName = label(product.masterData.categoryId, "Categoria");
  const magnitudeName = label(product.masterData.magnitudeIds[0] ?? null, categoryName);
  const technologyName = label(product.masterData.technologyIds[0] ?? null, categoryName);
  const installationName = label(product.masterData.installationIds[0] ?? null, categoryName);
  const monitoredName = label(product.masterData.monitoredElementIds[0] ?? null, categoryName);
  const payload = {
    ...base,
    title: product.name,
    summary: product.summary || base.summary,
    brand: { name: brandName, slug: slug(product.masterData.brandId, brandName) },
    manufacturer: { ...(base.manufacturer ?? {}), name: manufacturerName, slug: slug(product.masterData.manufacturerId, manufacturerName) },
    productLine: { name: label(product.masterData.lineId, "Linha geral"), slug: slug(product.masterData.lineId, "Linha geral") },
    classification: { ...(base.classification ?? {}), segment: categoryName, category: magnitudeName, family: installationName },
    controlledClassification: {
      productCategory: { id: product.masterData.categoryId, slug: slug(product.masterData.categoryId, categoryName), label: categoryName },
      applicationMagnitude: { id: product.masterData.magnitudeIds[0] ?? product.masterData.categoryId, slug: slug(product.masterData.magnitudeIds[0] ?? null, magnitudeName), label: magnitudeName },
      technology: { id: product.masterData.technologyIds[0] ?? product.masterData.categoryId, slug: slug(product.masterData.technologyIds[0] ?? null, technologyName), label: technologyName },
      installationOperation: { id: product.masterData.installationIds[0] ?? product.masterData.categoryId, slug: slug(product.masterData.installationIds[0] ?? null, installationName), label: installationName },
      monitoredElement: { id: product.masterData.monitoredElementIds[0], slug: slug(product.masterData.monitoredElementIds[0], monitoredName), label: monitoredName },
    },
    technology: product.masterData.technologyIds.map((id: string) => label(id, "")).filter(Boolean).join(", "),
    models: product.models.map((model: Row) => ({
      id: model.id,
      model: model.name,
      manufacturerReference: model.mpn ?? "Não informado",
      sku: skuByOwner.get(model.id) ?? model.variants.map((variant: Row) => skuByOwner.get(variant.id)).find(Boolean) ?? "PENDENTE",
      status: model.status,
      variants: model.variants.length ? model.variants.map((variant: Row) => ({ id: variant.id, name: variant.name, code: variant.code ?? variant.axes.map((axis: Row) => axis.optionKey).join("-"), order: variant.position })) : [{ id: model.id, name: model.name, code: model.mpn ?? model.name, order: model.position }],
    })),
  };
  return { productId: product.id, payload, warnings: product.skus.length ? [] : ["Há modelos sem SKU gerado."] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: PimCommand;
  try {
    command = Command.parse(await readJsonLimited(req, 384 * 1024));
  } catch {
    return json(req, { error: "Comando PIM inválido.", code: "CMS_PIM_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment)) {
    return json(req, { error: "Produção indisponível nesta fase.", code: "CMS_PIM_PRODUCTION_GATED", correlationId }, 403);
  }
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment)) {
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  }
  if (configuredEnvironment !== environment || siteKey !== "main") {
    return json(req, { error: "Escopo não autorizado.", code: "CMS_PIM_SCOPE_MISMATCH", correlationId }, 403);
  }
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000) {
    return json(req, { error: "Comando expirado ou futuro.", code: "CMS_PIM_COMMAND_STALE", correlationId }, 409);
  }
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_pim_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      command.action.startsWith("list") || command.action.startsWith("get") ? 120 : 60,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch {
    return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503);
  }

  const common = {
    p_actor_id: identity.user.id,
    p_environment: environment,
    p_site_key: siteKey,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  };
  const { data: capability, error: capabilityError } = await identity.admin.rpc("cms_evaluate_feature_flag", {
    ...common,
    p_flag_key: "ev2.pim_v2",
  });
  if (capabilityError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, commandId: command.envelope.commandId, correlationId });
  if (capability?.enabled !== true) {
    return json(req, { error: "PIM v2 não habilitado.", code: "CMS_PIM_FEATURE_DISABLED", correlationId }, 403);
  }
  if (!(await authorized(identity, "cms:pim.read"))) {
    return json(req, { error: "Permissão insuficiente.", code: "CMS_PIM_FORBIDDEN", correlationId }, 403);
  }

  try {
    if (command.action === "list_products" || command.action === "get_product") {
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, ...(await queryPim(identity, command)) });
    }
    if (command.action === "preview_v1_adapter") {
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, ...(await previewV1(identity, command)) });
    }
    const idempotencyKey = req.headers.get("X-Idempotency-Key");
    if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) {
      return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
    }
    if (command.action === "archive_product" && command.envelope.expectedVersion === undefined) {
      return json(req, { error: "Versão esperada obrigatória.", code: "CMS_PIM_EXPECTED_VERSION_REQUIRED", correlationId }, 400);
    }
    const payload = command.action === "save_product"
      ? { mode: command.mode, product: command.product, expectedVersion: command.envelope.expectedVersion, reason: command.reason }
      : { ...Object.fromEntries(Object.entries(command).filter(([key]) => !["action", "envelope"].includes(key))), expectedVersion: command.envelope.expectedVersion };
    const requestHash = await sha256(JSON.stringify(canonicalize(command)));
    const { data, error } = await identity.admin.rpc("cms_execute_pim_command", {
      ...common,
      p_action: command.action,
      p_payload: payload,
      p_command_id: command.envelope.commandId,
      p_idempotency_key: idempotencyKey,
      p_request_hash: requestHash,
      p_correlation_id: correlationId,
    });
    if (error) throw error;
    logPim("info", "pim.command.completed", correlationId, { action: command.action, productId: data?.productId });
    return json(req, data);
  } catch (error) {
    const errorRecord = error && typeof error === "object" ? (error as Record<string, unknown>) : {};
    const message =
      typeof errorRecord.message === "string"
        ? errorRecord.message
        : error instanceof Error
          ? error.message
          : String(error);
    const databaseCode = typeof errorRecord.code === "string" ? errorRecord.code : "";
    const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED");
    const notFound = message.includes("NOT_FOUND");
    const conflict =
      message.includes("CONFLICT") ||
      message.includes("DUPLICATE") ||
      ["P0001", "40001", "23505"].includes(databaseCode);
    const invalid =
      message.includes("INVALID") ||
      message.includes("REQUIRES") ||
      message.includes("INACTIVE") ||
      ["22023", "23514"].includes(databaseCode);
    const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
    const code = [
      "CMS_PIM_FEATURE_DISABLED", "CMS_PIM_FORBIDDEN", "CMS_PIM_NOT_FOUND", "CMS_PIM_CONFLICT",
      "CMS_PIM_IDEMPOTENCY_CONFLICT", "CMS_PIM_MASTER_INVALID", "CMS_PIM_MASTER_INACTIVE",
      "CMS_PIM_COMPATIBILITY_INVALID", "CMS_PIM_PRIMARY_MODEL_INVALID", "CMS_PIM_VARIANT_AXES_INVALID",
      "CMS_PIM_ATTRIBUTE_TYPE_INVALID", "CMS_PIM_UNIT_INCOMPATIBLE", "CMS_PIM_SKU_OWNER_INVALID",
    ].find((candidate) => message.includes(candidate)) ?? "CMS_PIM_FAILURE";
    logPim(status >= 500 ? "error" : "warn", "pim.command.failed", correlationId, { action: command.action, code, status });
    return json(req, { error: status === 409 ? "Existe uma versão ou identidade mais recente." : status === 422 ? "Os dados normalizados são incompatíveis." : status === 404 ? "Produto PIM não encontrado." : status === 403 ? "Operação indisponível ou sem permissão." : "Falha na operação PIM.", code, correlationId, preserved: true }, status);
  }
});
