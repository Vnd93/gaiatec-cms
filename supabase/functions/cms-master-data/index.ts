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
const EntityType = z.enum([
  "manufacturer",
  "brand",
  "line",
  "category",
  "magnitude",
  "technology",
  "installation",
  "monitored_element",
]);
const SourceType = z.enum(["manual", "import", "legacy"]);
const RelationType = z.enum([
  "manufacturer_brand",
  "brand_line",
  "category_magnitude",
  "category_technology",
  "category_installation",
  "category_monitored_element",
]);
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
const EntityFields = {
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(1000).default(""),
  externalDomain: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/)
    .optional(),
  sourceType: SourceType.default("manual"),
  sourceRef: z.string().trim().max(300).optional(),
};
const Command = z.discriminatedUnion("action", [
  z.object({ action: z.literal("capability"), envelope: Envelope }).strict(),
  z
    .object({
      action: z.literal("list_entities"),
      envelope: Envelope,
      entityType: EntityType.optional(),
      query: z.string().trim().max(180).default(""),
      includeInactive: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal("list_rules"), envelope: Envelope }).strict(),
  z
    .object({
      action: z.literal("get_dependencies"),
      envelope: Envelope,
      relationType: RelationType,
      sourceEntityId: Uuid,
      includeInactive: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal("create_entity"), envelope: Envelope, entityType: EntityType, ...EntityFields }).strict(),
  z.object({ action: z.literal("update_entity"), envelope: Envelope, entityId: Uuid, ...EntityFields }).strict(),
  z
    .object({
      action: z.literal("set_entity_status"),
      envelope: Envelope,
      entityId: Uuid,
      status: z.enum(["active", "inactive"]),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("merge_entities"),
      envelope: Envelope,
      sourceEntityId: Uuid,
      targetEntityId: Uuid,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("restore_merge"),
      envelope: Envelope,
      sourceEntityId: Uuid,
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
  z
    .object({
      action: z.literal("upsert_alias"),
      envelope: Envelope,
      entityId: Uuid,
      aliasId: Uuid.optional(),
      alias: z.string().trim().min(1).max(180),
      sourceType: SourceType.default("manual"),
    })
    .strict(),
  z
    .object({
      action: z.literal("upsert_compatibility"),
      envelope: Envelope,
      compatibilityId: Uuid.optional(),
      relationType: RelationType,
      sourceEntityId: Uuid,
      targetEntityId: Uuid,
      sourceType: SourceType.default("manual"),
      sourceRef: z.string().trim().max(300).optional(),
    })
    .strict(),
  z
    .object({
      action: z.literal("set_compatibility_status"),
      envelope: Envelope,
      compatibilityId: Uuid,
      status: z.enum(["active", "inactive"]),
      reason: z.string().trim().min(3).max(500),
    })
    .strict(),
]);

type MasterCommand = z.infer<typeof Command>;
type QueryCommand = Extract<
  MasterCommand,
  { action: "list_entities" | "list_rules" | "get_dependencies" }
>;

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

function logMasterData(
  level: "info" | "warn" | "error",
  event: string,
  correlationId: string,
  context: Record<string, unknown>,
) {
  console[level](
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      correlationId,
      route: "/functions/v1/cms-master-data",
      context,
    }),
  );
}

async function readAllowed(identity: Awaited<ReturnType<typeof authenticateCms>>) {
  if (!identity) return false;
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id,
    p_permission: "cms:masterdata.read",
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

type DatabaseRecord = Record<string, any>;
type MasterActorScope = {
  isQaActor: boolean;
  active: boolean;
};

async function actorReadScope(
  identity: NonNullable<Awaited<ReturnType<typeof authenticateCms>>>,
  environment: "local" | "staging" | "production",
): Promise<MasterActorScope> {
  const { data, error } = await identity.admin.rpc("cms_actor_scope_context", {
    p_actor_id: identity.user.id,
    p_environment: environment,
  });
  if (error || typeof data !== "object" || !data) {
    throw new Error("CMS_MASTER_DATA_ACTOR_SCOPE_UNAVAILABLE");
  }
  return {
    isQaActor: data.isQaActor === true,
    active: data.active === true,
  };
}

function mapAlias(alias: DatabaseRecord) {
  return {
    id: alias.id,
    alias: alias.alias,
    normalizedAlias: alias.normalized_alias,
    sourceType: alias.source_type,
    updatedAt: alias.updated_at,
  };
}

function mapEntity(entity: DatabaseRecord) {
  return {
    id: entity.id,
    entityType: entity.entity_type,
    canonicalName: entity.canonical_name,
    normalizedName: entity.normalized_name,
    description: entity.description,
    externalDomain: entity.external_domain,
    sourceType: entity.source_type,
    sourceRef: entity.source_ref,
    status: entity.status,
    mergedIntoId: entity.merged_into_id,
    lockVersion: entity.lock_version,
    updatedAt: entity.updated_at,
    aliases: (entity.cms_master_entity_aliases ?? []).map(mapAlias),
  };
}

function mapTarget(entity: DatabaseRecord | null | undefined) {
  if (!entity) return null;
  return {
    id: entity.id,
    entityType: entity.entity_type,
    canonicalName: entity.canonical_name,
    status: entity.status,
    lockVersion: entity.lock_version,
  };
}

async function queryMasterData(
  identity: NonNullable<Awaited<ReturnType<typeof authenticateCms>>>,
  command: QueryCommand,
) {
  if (command.action === "list_rules") {
    const { data, error } = await identity.admin.rpc("cms_master_list_rules_scoped", {
      p_actor_id: identity.user.id,
      p_environment: command.envelope.actorContext.environment,
    });
    if (error) throw error;
    return {
      rules: (data ?? []).map((rule: DatabaseRecord) => ({
        relationType: rule.relation_type,
        sourceType: rule.source_type,
        targetType: rule.target_type,
        label: rule.label,
        active: rule.active,
      })),
    };
  }

  if (command.action === "list_entities") {
    const { data, error } = await identity.admin.rpc("cms_master_list_entities_scoped", {
      p_actor_id: identity.user.id,
      p_environment: command.envelope.actorContext.environment,
      p_site_key: command.envelope.actorContext.siteKey,
      p_entity_type: command.entityType ?? null,
      p_query: command.query,
      p_include_inactive: command.includeInactive,
      p_limit: 500,
    });
    if (error) throw error;
    return { entities: (data ?? []).map(mapEntity) };
  }

  const { data: compatibilities, error } = await identity.admin.rpc("cms_master_get_dependencies_scoped", {
    p_actor_id: identity.user.id,
    p_environment: command.envelope.actorContext.environment,
    p_site_key: command.envelope.actorContext.siteKey,
    p_relation_type: command.relationType,
    p_source_entity_id: command.sourceEntityId,
    p_include_inactive: command.includeInactive,
  });
  if (error) throw error;
  return {
    compatibilities: (compatibilities ?? []).map((item: DatabaseRecord) => ({
      id: item.id,
      relationType: item.relation_type,
      sourceEntityId: item.source_entity_id,
      targetEntityId: item.target_entity_id,
      status: item.status,
      effectiveFrom: item.effective_from,
      effectiveTo: item.effective_to,
      version: item.version,
      lockVersion: item.lock_version,
      sourceType: item.source_type,
      sourceRef: item.source_ref,
      updatedAt: item.updated_at,
      target: mapTarget(item.target),
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);

  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: MasterCommand;
  try {
    command = Command.parse(await readJsonLimited(req, 128 * 1024));
  } catch {
    return json(req, { error: "Comando de dados mestres inválido.", code: "CMS_MASTER_DATA_COMMAND_INVALID" }, 400);
  }

  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (environment === "production" && !isProductionOperationEnabled(environment)) {
    return json(
      req,
      { error: "Produção não está disponível nesta fase.", code: "CMS_MASTER_DATA_PRODUCTION_GATED", correlationId },
      403,
    );
  }
  if (!isConfiguredCmsEnvironment(configuredEnvironment)) {
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  }
  if (environment !== configuredEnvironment || siteKey !== "main") {
    return json(
      req,
      { error: "Escopo do comando não autorizado.", code: "CMS_MASTER_DATA_SCOPE_MISMATCH", correlationId },
      403,
    );
  }
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000) {
    return json(
      req,
      { error: "Comando expirado ou datado no futuro.", code: "CMS_MASTER_DATA_COMMAND_STALE", correlationId },
      409,
    );
  }

  try {
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_master_data_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      command.action.startsWith("list") || command.action === "get_dependencies" ? 120 : 60,
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
    p_flag_key: "ev2.master_data",
  });
  if (capabilityError) return json(req, { error: "Capacidade indisponível.", correlationId }, 503);
  if (command.action === "capability") {
    return json(req, { ...capability, commandId: command.envelope.commandId, correlationId });
  }
  if (capability?.enabled !== true) {
    return json(
      req,
      { error: "Capacidade de dados mestres não habilitada.", code: "CMS_MASTER_DATA_FEATURE_DISABLED", correlationId },
      403,
    );
  }

  if (["list_entities", "list_rules", "get_dependencies"].includes(command.action)) {
    if (!(await readAllowed(identity))) return json(req, { error: "Permissão insuficiente.", correlationId }, 403);
    let actorScope: MasterActorScope;
    try {
      actorScope = await actorReadScope(identity, environment);
    } catch {
      return json(
        req,
        {
          error: "Escopo de leitura temporariamente indisponível.",
          code: "CMS_MASTER_DATA_ACTOR_SCOPE_UNAVAILABLE",
          correlationId,
        },
        503,
      );
    }
    if (!actorScope.active) {
      return json(
        req,
        {
          error: "Operação indisponível ou sem permissão.",
          code: actorScope.isQaActor ? "CMS_MASTER_DATA_QA_SCOPE_INACTIVE" : "CMS_MASTER_DATA_SCOPE_INVALID",
          correlationId,
        },
        403,
      );
    }
    try {
      return json(req, {
        schemaVersion: 1,
        commandId: command.envelope.commandId,
        correlationId,
        ...(await queryMasterData(identity, command as QueryCommand)),
      });
    } catch {
      return json(req, { error: "Dados mestres temporariamente indisponíveis.", correlationId }, 503);
    }
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success) {
    return json(req, { error: "Chave idempotente obrigatória.", correlationId }, 400);
  }
  if (
    command.envelope.expectedVersion === undefined &&
    command.action !== "create_entity" &&
    !(command.action === "upsert_compatibility" && !command.compatibilityId)
  ) {
    return json(
      req,
      { error: "Versão esperada obrigatória.", code: "CMS_MASTER_DATA_EXPECTED_VERSION_REQUIRED", correlationId },
      400,
    );
  }

  const { action: _action, envelope: _envelope, ...payload } = command;
  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_master_data_command", {
    ...common,
    p_action: command.action,
    p_payload: { ...payload, expectedVersion: command.envelope.expectedVersion },
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });

  if (error) {
    const message = error.message ?? "";
    const forbidden = message.includes("FORBIDDEN") || message.includes("FEATURE_DISABLED");
    const notFound = message.includes("NOT_FOUND");
    const conflict = message.includes("CONFLICT") || message.includes("DUPLICATE") || error.code === "23505";
    const invalid = message.includes("INVALID") || message.includes("REDUNDANT") || error.code === "22023" || error.code === "23514";
    const status = forbidden ? 403 : notFound ? 404 : conflict ? 409 : invalid ? 422 : 500;
    const code =
      [
        "CMS_MASTER_DATA_FEATURE_DISABLED",
        "CMS_MASTER_DATA_FORBIDDEN",
        "CMS_MASTER_DATA_NOT_FOUND",
        "CMS_MASTER_DATA_CONFLICT",
        "CMS_MASTER_DATA_DUPLICATE",
        "CMS_MASTER_DATA_IDEMPOTENCY_CONFLICT",
        "CMS_MASTER_DATA_ALIAS_REDUNDANT",
        "CMS_MASTER_DATA_RELATION_INVALID",
        "CMS_MASTER_DATA_MERGE_INVALID",
        "CMS_MASTER_DATA_RESTORE_INVALID",
        "CMS_MASTER_DATA_COMMAND_INVALID",
      ].find((candidate) => message.includes(candidate)) ?? "CMS_MASTER_DATA_FAILURE";
    logMasterData(status >= 500 ? "error" : "warn", "master_data.command.failed", correlationId, {
      action: command.action,
      code,
      status,
    });
    return json(
      req,
      {
        error: forbidden
          ? "Operação indisponível ou sem permissão."
          : notFound
            ? "Registro de dados mestres não encontrado."
            : conflict
              ? "Existe um registro equivalente ou uma versão mais recente."
              : invalid
                ? "A relação ou alteração informada é inválida."
                : "Falha ao atualizar dados mestres.",
        code,
        correlationId,
        preserved: true,
      },
      status,
    );
  }

  logMasterData("info", "master_data.command.completed", correlationId, {
    action: command.action,
    status: data?.status,
    lockVersion: data?.lockVersion,
  });
  return json(req, data);
});
