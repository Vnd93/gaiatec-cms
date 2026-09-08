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
  z
    .object({
      action: z.literal("get_reconciliation_plan"),
      envelope: Envelope,
      productId: Uuid,
      contentItemId: Uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("reconcile_product"),
      envelope: Envelope.refine((value) => value.expectedVersion !== undefined, {
        path: ["expectedVersion"],
        message: "expected version required",
      }),
      productId: Uuid,
      contentItemId: Uuid,
      expectedDraftVersion: z.number().int().positive(),
      resolution: z.enum(["equivalence", "retire_acknowledged_gap"]),
      acknowledgedLegacySha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
      reason: z.string().trim().min(3).max(500),
    })
    .strict()
    .superRefine((command, context) => {
      if (
        command.resolution === "retire_acknowledged_gap" &&
        !command.acknowledgedLegacySha256
      ) {
        context.addIssue({
          code: "custom",
          path: ["acknowledgedLegacySha256"],
          message: "legacy snapshot acknowledgement required",
        });
      }
      if (command.resolution === "equivalence" && command.acknowledgedLegacySha256) {
        context.addIssue({
          code: "custom",
          path: ["acknowledgedLegacySha256"],
          message: "legacy snapshot acknowledgement forbidden",
        });
      }
    }),
]);

type PimCommand = z.infer<typeof Command>;
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
type Row = Record<string, any>;
type PimActorScope = {
  isQaActor: boolean;
  active: boolean;
  runTag: string | null;
  status: string | null;
};

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

async function actorReadScope(
  identity: Identity,
  environment: "local" | "staging" | "production",
): Promise<PimActorScope> {
  const { data, error } = await identity.admin.rpc("cms_actor_scope_context", {
    p_actor_id: identity.user.id,
    p_environment: environment,
  });
  if (error || typeof data !== "object" || !data) throw new Error("CMS_PIM_ACTOR_SCOPE_UNAVAILABLE");
  return {
    isQaActor: data.isQaActor === true,
    active: data.active === true,
    runTag: typeof data.runTag === "string" ? data.runTag : null,
    status: typeof data.status === "string" ? data.status : null,
  };
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

async function loadProduct(
  identity: Identity,
  productId: string,
  environment: "local" | "staging" | "production",
  siteKey: string,
) {
  const { data, error } = await identity.admin.rpc("cms_pim_get_product_scoped", {
    p_actor_id: identity.user.id,
    p_product_id: productId,
    p_environment: environment,
    p_site_key: siteKey,
  });
  if (error) throw error;
  return data && typeof data === "object" ? mapProduct(data as Row) : null;
}

async function queryPim(identity: Identity, command: PimCommand) {
  if (command.action === "list_products") {
    const normalizedQuery = normalizeSearch(command.query);
    const { data, error } = await identity.admin.rpc("cms_pim_list_products_scoped", {
      p_actor_id: identity.user.id,
      p_environment: command.envelope.actorContext.environment,
      p_site_key: command.envelope.actorContext.siteKey,
      p_query: normalizedQuery,
      p_include_archived: command.includeArchived,
      p_limit: 500,
    });
    if (error) throw error;
    return {
      products: (data ?? []).map((row: Row) => ({
        id: row.id,
        contentItemId: row.content_item_id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        lockVersion: row.lock_version,
        modelCount: Number(row.model_count ?? 0),
        variantCount: Number(row.variant_count ?? 0),
        skuCount: Number(row.sku_count ?? 0),
        updatedAt: row.updated_at,
      })),
    };
  }
  if (command.action === "get_product") {
    return {
      product: await loadProduct(
        identity,
        command.productId,
        command.envelope.actorContext.environment,
        command.envelope.actorContext.siteKey,
      ),
    };
  }
  throw new Error("query not supported");
}

async function previewV1(identity: Identity, command: Extract<PimCommand, { action: "preview_v1_adapter" }>) {
  const product = await loadProduct(
    identity,
    command.productId,
    command.envelope.actorContext.environment,
    command.envelope.actorContext.siteKey,
  );
  if (!product) throw new Error("CMS_PIM_NOT_FOUND");
  const requiredMasterId = (id: string | null | undefined) => {
    if (!id) throw new Error("CMS_PIM_PUBLIC_DATA_REQUIRED");
    return id;
  };
  const brandId = requiredMasterId(product.masterData.brandId);
  const lineId = requiredMasterId(product.masterData.lineId);
  const magnitudeId = requiredMasterId(product.masterData.magnitudeIds[0]);
  const technologyId = requiredMasterId(product.masterData.technologyIds[0]);
  const installationId = requiredMasterId(product.masterData.installationIds[0]);
  const monitoredId = requiredMasterId(product.masterData.monitoredElementIds[0]);
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
  const controlledMasterIds = [
    product.masterData.categoryId,
    magnitudeId,
    technologyId,
    installationId,
    monitoredId,
  ];
  const [mastersResult, controlledResult, catalogResult] = await Promise.all([
    identity.admin.rpc("cms_pim_master_entities_scoped", {
      p_actor_id: identity.user.id,
      p_environment: command.envelope.actorContext.environment,
      p_site_key: command.envelope.actorContext.siteKey,
      p_entity_ids: ids,
    }),
    identity.admin.rpc("cms_pim_master_controlled_options_scoped", {
      p_actor_id: identity.user.id,
      p_environment: command.envelope.actorContext.environment,
      p_site_key: command.envelope.actorContext.siteKey,
      p_entity_ids: controlledMasterIds,
    }),
    identity.admin.rpc("cms_attributes_catalog_scoped", {
      p_actor_id: identity.user.id,
      p_environment: command.envelope.actorContext.environment,
      p_site_key: command.envelope.actorContext.siteKey,
      p_category_id: product.masterData.categoryId,
    }),
  ]);
  if (mastersResult.error) throw mastersResult.error;
  if (controlledResult.error) throw controlledResult.error;
  if (catalogResult.error) throw catalogResult.error;
  const masters = mastersResult.data;
  const labels = new Map<string, string>(
    (masters ?? []).map((entry: Row) => [String(entry.id), String(entry.canonical_name ?? "")]),
  );
  if (labels.size !== ids.length) throw new Error("CMS_PIM_MASTER_INVALID");
  const label = (id: string) => labels.get(id) ?? "";
  const slug = (id: string) => slugify(label(id));
  const controlledByMaster = new Map<string, Row>(
    (controlledResult.data ?? []).map((entry: Row) => [entry.master_entity_id, entry]),
  );
  if (controlledByMaster.size !== new Set(controlledMasterIds).size) {
    throw new Error("CMS_PIM_CONTROLLED_MAPPING_INVALID");
  }
  const controlled = (id: string) => {
    const option = controlledByMaster.get(id);
    if (!option) throw new Error("CMS_PIM_CONTROLLED_MAPPING_INVALID");
    return { id: option.option_id, slug: option.option_slug, label: option.option_label };
  };
  const catalog = catalogResult.data && typeof catalogResult.data === "object"
    ? (catalogResult.data as Row)
    : {};
  const definitions = new Map<string, Row>(
    (Array.isArray(catalog.definitions) ? catalog.definitions : []).map((definition: Row) => [
      definition.id,
      definition,
    ]),
  );
  const skuByOwner = new Map(product.skus.filter((entry: Row) => entry.status === "active").map((entry: Row) => [entry.variantId ?? entry.modelId, entry.sku]));
  const activeModels = product.models.filter((model: Row) => model.status === "active");
  if (activeModels.length === 0) throw new Error("CMS_PIM_ACTIVE_SKU_REQUIRED");
  const activeModelIds = new Set(activeModels.map((model: Row) => String(model.id).toLowerCase()));
  const activeVariantIds = new Set(
    activeModels.flatMap((model: Row) =>
      model.variants
        .filter((variant: Row) => variant.status === "active")
        .map((variant: Row) => String(variant.id).toLowerCase()),
    ),
  );
  if (activeModels.some((model: Row) => !String(model.mpn ?? "").trim())) {
    throw new Error("CMS_PIM_PUBLIC_DATA_REQUIRED");
  }
  const resolveModelSku = (model: Row) => {
    const activeVariants = model.variants.filter((variant: Row) => variant.status === "active");
    if (activeVariants.length === 0) throw new Error("CMS_PIM_PUBLIC_DATA_REQUIRED");
    if (activeVariants.some((variant: Row) => !String(skuByOwner.get(variant.id) ?? "").trim())) {
      throw new Error("CMS_PIM_ACTIVE_SKU_REQUIRED");
    }
    const sku = String(skuByOwner.get(model.id) ?? "").trim();
    if (!sku) throw new Error("CMS_PIM_ACTIVE_SKU_REQUIRED");
    return { activeVariants, sku };
  };
  const base = structuredClone(command.basePayload) as Record<string, any>;
  const manufacturerName = label(product.masterData.manufacturerId);
  const brandName = label(brandId);
  const categoryName = label(product.masterData.categoryId);
  const magnitudeName = label(magnitudeId);
  const technologyName = label(technologyId);
  const installationName = label(installationId);
  const monitoredName = label(monitoredId);
  const ownerSurvives = (scope: string, ownerId: unknown) => {
    if (scope === "product") {
      return ownerId === undefined || ownerId === null || ownerId === "" || ownerId === product.id;
    }
    if (typeof ownerId !== "string") return false;
    return scope === "model"
      ? activeModelIds.has(ownerId.toLowerCase())
      : scope === "variant" && activeVariantIds.has(ownerId.toLowerCase());
  };
  const payload = {
    ...base,
    title: product.name,
    summary: product.summary || base.summary,
    brand: { name: brandName, slug: slug(brandId) },
    manufacturer: { ...(base.manufacturer ?? {}), name: manufacturerName, slug: slug(product.masterData.manufacturerId) },
    productLine: { name: label(lineId), slug: slug(lineId) },
    classification: { ...(base.classification ?? {}), segment: categoryName, category: magnitudeName, family: installationName },
    controlledClassification: {
      productCategory: controlled(product.masterData.categoryId),
      applicationMagnitude: controlled(magnitudeId),
      technology: controlled(technologyId),
      installationOperation: controlled(installationId),
      monitoredElement: controlled(monitoredId),
    },
    technology: product.masterData.technologyIds.map((id: string) => label(id)).filter(Boolean).join(", "),
    models: activeModels.map((model: Row) => {
      const { activeVariants, sku } = resolveModelSku(model);
      return {
        id: model.id,
        model: model.name,
        manufacturerReference: String(model.mpn).trim(),
        sku,
        status: model.status,
        variants: activeVariants.map((variant: Row) => ({
          id: variant.id,
          name: variant.name,
          code: variant.code ?? variant.axes.map((axis: Row) => axis.optionKey).join("-"),
          sku: String(skuByOwner.get(variant.id) ?? "").trim(),
          order: variant.position,
        })),
      };
    }),
    specifications: product.attributes.map((attribute: Row) => {
      const definition = definitions.get(attribute.definitionId);
      if (!definition) throw new Error("CMS_PIM_ATTRIBUTE_INVALID");
      if (!ownerSurvives(attribute.scope, attribute.ownerId)) {
        throw new Error("CMS_PIM_ATTRIBUTE_OWNER_INVALID");
      }
      return {
        id: attribute.id,
        key: definition.attribute_key,
        label: definition.label,
        type: definition.data_type === "decimal" ? "number" : definition.data_type,
        value: attribute.value,
        ...(attribute.unitCode ? { unit: attribute.unitCode } : {}),
        required: definition.required,
        filterable: definition.filterable,
        comparable: definition.comparable,
        searchable: definition.searchable,
        definitionId: attribute.definitionId,
        scope: attribute.scope,
        ...(attribute.scope === "product" ? {} : { ownerId: attribute.ownerId }),
        sourceType: attribute.sourceType,
        ...(attribute.sourceRef ? { sourceRef: attribute.sourceRef } : {}),
        confidence: attribute.confidence,
        homologated: attribute.homologated,
      };
    }),
    externalIdentifiers: product.externalIdentifiers.map((identifier: Row) => {
      if (identifier.ownerType === "sku" || !ownerSurvives(identifier.ownerType, identifier.ownerId)) {
        throw new Error("CMS_PIM_IDENTIFIER_OWNER_UNREPRESENTABLE");
      }
      return {
        id: identifier.id,
        owner: identifier.ownerType === "product"
          ? { type: "product" }
          : { type: identifier.ownerType, id: identifier.ownerId },
        kind: identifier.kind,
        value: identifier.value,
        ...(identifier.issuer ? { issuer: identifier.issuer } : {}),
        visibility: "internal",
        sourceType: identifier.sourceType,
        ...(identifier.sourceRef ? { sourceRef: identifier.sourceRef } : {}),
      };
    }),
    provenance: product.provenance.map((source: Row) => {
      const baseSource = Array.isArray(base.provenance)
        ? base.provenance.find((candidate: Row) =>
            candidate.sourceKind === source.sourceKind &&
            [candidate.sourcePath, candidate.sourceUrl, candidate.authorizationReference]
              .includes(source.sourceRef)
          )
        : undefined;
      if (!baseSource || source.rightsConfirmed !== true || !source.verifiedAt) {
        throw new Error("CMS_PIM_PROVENANCE_UNREPRESENTABLE");
      }
      return {
        ...baseSource,
        sourceKind: source.sourceKind,
        ...(source.sourceSha256 ? { sourceSha256: source.sourceSha256 } : {}),
        rightsConfirmed: true,
        verifiedAt: source.verifiedAt,
      };
    }),
  };
  return {
    productId: product.id,
    payload,
    warnings: product.contentItemId
      ? ["Confira o plano autoritativo de reconciliação antes de salvar ou retirar o legado."]
      : ["O produto legado ainda não está vinculado a um item canônico."],
  };
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
  if (command.action === "capability") {
    return json(req, {
      ...capability,
      commandId: command.envelope.commandId,
      correlationId,
      canonicalWriter: "cms-content",
      legacyWriteMode: "read_only",
      legacyMutationsEnabled: false,
    });
  }
  if (capability?.enabled !== true) {
    return json(req, { error: "PIM v2 não habilitado.", code: "CMS_PIM_FEATURE_DISABLED", correlationId }, 403);
  }
  if (!(await authorized(identity, "cms:pim.read"))) {
    return json(req, { error: "Permissão insuficiente.", code: "CMS_PIM_FORBIDDEN", correlationId }, 403);
  }

  let actorScope: PimActorScope;
  try {
    actorScope = await actorReadScope(identity, environment);
  } catch {
    return json(req, { error: "Escopo de leitura temporariamente indisponível.", code: "CMS_PIM_ACTOR_SCOPE_UNAVAILABLE", correlationId }, 503);
  }
  if (actorScope.isQaActor && !actorScope.active) {
    return json(req, { error: "Operação indisponível ou sem permissão.", code: "CMS_PIM_QA_SCOPE_INACTIVE", correlationId }, 403);
  }

  try {
    if (command.action === "list_products" || command.action === "get_product") {
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, ...(await queryPim(identity, command)) });
    }
    if (command.action === "preview_v1_adapter") {
      return json(req, { schemaVersion: 1, commandId: command.envelope.commandId, correlationId, ...(await previewV1(identity, command)) });
    }
    if (command.action === "get_reconciliation_plan") {
      if (!(await authorized(identity, "cms:pim.archive"))) {
        return json(req, { error: "Permissão insuficiente.", code: "CMS_PIM_FORBIDDEN", correlationId }, 403);
      }
      const { data, error } = await identity.admin.rpc("cms_get_pim_reconciliation_plan", {
        ...common,
        p_product_id: command.productId,
        p_content_item_id: command.contentItemId,
        p_correlation_id: correlationId,
      });
      if (error) throw error;
      return json(req, {
        ...(data && typeof data === "object" ? data : {}),
        schemaVersion: 1,
        commandId: command.envelope.commandId,
        correlationId,
      });
    }
    if (command.action === "reconcile_product") {
      if (!(await authorized(identity, "cms:pim.archive"))) {
        return json(req, { error: "Permissão insuficiente.", code: "CMS_PIM_FORBIDDEN", correlationId }, 403);
      }
      const requestHash = await sha256(JSON.stringify(command));
      const { data, error } = await identity.admin.rpc("cms_reconcile_legacy_pim_product", {
        ...common,
        p_product_id: command.productId,
        p_content_item_id: command.contentItemId,
        p_expected_product_version: command.envelope.expectedVersion,
        p_expected_draft_version: command.expectedDraftVersion,
        p_resolution: command.resolution,
        p_acknowledged_legacy_sha256: command.acknowledgedLegacySha256 ?? null,
        p_reason: command.reason,
        p_command_id: command.envelope.commandId,
        p_idempotency_key: command.envelope.commandId,
        p_request_hash: requestHash,
        p_correlation_id: correlationId,
      });
      if (error) throw error;
      return json(req, data);
    }
    logPim("warn", "pim.legacy_mutation.blocked", correlationId, {
      action: command.action,
      canonicalWriter: "cms-content",
    });
    return json(req, {
      error: "O PIM legado está disponível somente para consulta.",
      code: "CMS_PIM_LEGACY_READ_ONLY",
      correlationId,
      canonicalWriter: "cms-content",
      preserved: true,
    }, 409);
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
      message.includes("SKU_REQUIRED") ||
      message.includes("PUBLIC_DATA_REQUIRED") ||
      message.includes("REQUIRES") ||
      message.includes("INACTIVE") ||
      ["22023", "23514"].includes(databaseCode);
    const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
    const code = [
      "CMS_PIM_FEATURE_DISABLED", "CMS_PIM_FORBIDDEN", "CMS_PIM_NOT_FOUND", "CMS_PIM_CONFLICT",
      "CMS_PIM_IDEMPOTENCY_CONFLICT", "CMS_PIM_MASTER_INVALID", "CMS_PIM_MASTER_INACTIVE",
      "CMS_PIM_COMPATIBILITY_INVALID", "CMS_PIM_PRIMARY_MODEL_INVALID", "CMS_PIM_VARIANT_AXES_INVALID",
      "CMS_PIM_ATTRIBUTE_TYPE_INVALID", "CMS_PIM_UNIT_INCOMPATIBLE", "CMS_PIM_SKU_OWNER_INVALID",
      "CMS_PIM_ACTIVE_SKU_REQUIRED", "CMS_PIM_PUBLIC_DATA_REQUIRED",
      "CMS_PIM_RECONCILIATION_INVALID", "CMS_PIM_RECONCILIATION_ACK_REQUIRED",
      "CMS_PIM_RECONCILIATION_ACK_MISMATCH", "CMS_PIM_RECONCILIATION_IDEMPOTENCY_CONFLICT",
      "CMS_PIM_RECONCILIATION_CONFLICT", "CMS_PIM_RECONCILIATION_FORBIDDEN",
      "CMS_PIM_RECONCILIATION_NOT_FOUND", "CMS_PIM_RECONCILIATION_REQUIRED",
    ].find((candidate) => message.includes(candidate)) ?? "CMS_PIM_FAILURE";
    logPim(status >= 500 ? "error" : "warn", "pim.command.failed", correlationId, { action: command.action, code, status });
    return json(req, { error: status === 409 ? "Existe uma versão ou identidade mais recente." : status === 422 ? "Os dados normalizados são incompatíveis." : status === 404 ? "Produto PIM não encontrado." : status === 403 ? "Operação indisponível ou sem permissão." : "Falha na operação PIM.", code, correlationId, preserved: true }, status);
  }
});
