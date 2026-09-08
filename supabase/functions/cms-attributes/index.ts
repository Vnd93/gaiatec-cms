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
const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z.object({ action: z.literal("list_catalog"), envelope: Envelope, categoryId: Uuid }).strict(),
]);

type AttributeCommand = z.infer<typeof Command>;
type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
type Row = Record<string, any>;
type AttributeActorScope = { isQaActor: boolean; active: boolean };

async function authorized(identity: Identity) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id,
    p_permission: "cms:attributes.read",
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

async function actorReadScope(
  identity: Identity,
  environment: "local" | "staging" | "production",
): Promise<AttributeActorScope> {
  const { data, error } = await identity.admin.rpc("cms_actor_scope_context", {
    p_actor_id: identity.user.id,
    p_environment: environment,
  });
  if (error || typeof data !== "object" || !data) throw new Error("CMS_ATTRIBUTES_SCOPE_UNAVAILABLE");
  return { isQaActor: data.isQaActor === true, active: data.active === true };
}

async function listCatalog(
  identity: Identity,
  categoryOptionId: string,
  environment: "local" | "staging" | "production",
  siteKey: string,
) {
  const { data, error } = await identity.admin.rpc("cms_product_attributes_catalog_scoped", {
    p_actor_id: identity.user.id,
    p_environment: environment,
    p_site_key: siteKey,
    p_category_option_id: categoryOptionId,
  });
  if (error) throw error;
  const catalog = data && typeof data === "object" ? (data as Row) : {};
  const attributeSet = catalog.attribute_set as Row | null | undefined;
  const definitions = Array.isArray(catalog.definitions) ? catalog.definitions : [];
  const units = Array.isArray(catalog.units) ? catalog.units : [];
  const controlledCategory = catalog.controlled_category as Row | null | undefined;
  const masterCategory = catalog.master_category as Row | null | undefined;
  return {
    controlledCategory: controlledCategory
      ? {
          id: controlledCategory.id,
          slug: controlledCategory.slug,
          label: controlledCategory.label,
          listKey: controlledCategory.listKey,
        }
      : null,
    masterCategory: masterCategory
      ? {
          id: masterCategory.id,
          name: masterCategory.name,
          entityType: masterCategory.entityType,
        }
      : null,
    attributeSet: attributeSet
      ? {
          id: attributeSet.id,
          categoryId: attributeSet.category_id,
          name: attributeSet.name,
          versionId: attributeSet.version_id,
          version: attributeSet.version,
        }
      : null,
    definitions: definitions.map((definition: Row) => ({
      id: definition.id,
      attributeKey: definition.attribute_key,
      label: definition.label,
      description: definition.description,
      dataType: definition.data_type,
      canonicalUnitCode: definition.canonical_unit_code,
      enumOptions: definition.enum_options,
      filterable: definition.filterable,
      comparable: definition.comparable,
      searchable: definition.searchable,
      required: definition.required,
      inherited: definition.inherited,
      position: definition.position,
    })),
    units: units.map(mapUnit),
  };
}

function mapUnit(unit: Row) {
  return {
    code: unit.code,
    label: unit.label,
    symbol: unit.symbol,
    dimensionKey: unit.dimension_key,
    canonicalCode: unit.canonical_code,
    factorToCanonical: Number(unit.factor_to_canonical),
    offsetToCanonical: Number(unit.offset_to_canonical),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: AttributeCommand;
  try {
    command = Command.parse(await readJsonLimited(req, 32 * 1024));
  } catch {
    return json(req, { error: "Comando de atributos inválido.", code: "CMS_ATTRIBUTES_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment)) {
    return json(
      req,
      { error: "Produção indisponível nesta fase.", code: "CMS_ATTRIBUTES_PRODUCTION_GATED", correlationId },
      403,
    );
  }
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment)) {
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  }
  if (configuredEnvironment !== environment || siteKey !== "main") {
    return json(req, { error: "Escopo não autorizado.", code: "CMS_ATTRIBUTES_SCOPE_MISMATCH", correlationId }, 403);
  }
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000) {
    return json(req, { error: "Comando expirado ou futuro.", code: "CMS_ATTRIBUTES_COMMAND_STALE", correlationId }, 409);
  }
  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_attributes_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      120,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas consultas. Aguarde.", correlationId }, 429);
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
    p_flag_key: "ev2.pim_v2",
  };
  const { data: capability, error: capabilityError } = await identity.admin.rpc(
    "cms_evaluate_feature_flag",
    common,
  );
  if (capabilityError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (command.action === "capability") {
    return json(req, {
      ...capability,
      schemaVersion: 1,
      commandId: command.envelope.commandId,
      correlationId,
    });
  }
  if (capability?.enabled !== true) {
    return json(req, { error: "Atributos PIM não habilitados.", code: "CMS_ATTRIBUTES_FEATURE_DISABLED", correlationId }, 403);
  }
  if (!(await authorized(identity))) {
    return json(req, { error: "Permissão insuficiente.", code: "CMS_ATTRIBUTES_FORBIDDEN", correlationId }, 403);
  }
  let actorScope: AttributeActorScope;
  try {
    actorScope = await actorReadScope(identity, environment);
  } catch {
    return json(
      req,
      { error: "Escopo de leitura temporariamente indisponível.", code: "CMS_ATTRIBUTES_SCOPE_UNAVAILABLE", correlationId },
      503,
    );
  }
  if (!actorScope.active) {
    return json(
      req,
      {
        error: "Operação indisponível ou sem permissão.",
        code: actorScope.isQaActor ? "CMS_ATTRIBUTES_QA_SCOPE_INACTIVE" : "CMS_ATTRIBUTES_SCOPE_INVALID",
        correlationId,
      },
      403,
    );
  }
  try {
    const catalog = await listCatalog(identity, command.categoryId, environment, siteKey);
    return json(req, {
      schemaVersion: 1,
      commandId: command.envelope.commandId,
      correlationId,
      ...catalog,
    });
  } catch {
    return json(
      req,
      { error: "Catálogo técnico indisponível.", code: "CMS_ATTRIBUTES_FAILURE", correlationId },
      500,
    );
  }
});
