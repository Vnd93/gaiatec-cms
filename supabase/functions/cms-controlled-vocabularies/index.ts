import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { z } from "npm:zod@4.4.3";
import { authenticateCms } from "../_shared/cms-auth.ts";
import { isConfiguredCmsEnvironment } from "../_shared/ev2-environment.ts";
import {
  clientAddress,
  consumeRateLimit,
  corsHeaders,
  isAllowedOrigin,
  json,
  readJsonLimited,
} from "../_shared/security.ts";

const Uuid = z.uuid();
const LockVersion = z.number().int().positive();
const List = z
  .object({
    id: Uuid.optional(),
    lockVersion: LockVersion.optional(),
    listKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
    entityType: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
    dimensionKey: z.string().regex(/^[a-z][a-z0-9_-]{1,79}$/),
    label: z.string().trim().min(1).max(120),
    description: z.string().max(500).default(""),
    publicVisible: z.boolean().default(true),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
const Option = z
  .object({
    id: Uuid.optional(),
    lockVersion: LockVersion.optional(),
    listId: Uuid,
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    label: z.string().trim().min(1).max(160),
    description: z.string().max(500).default(""),
    publicVisible: z.boolean().default(true),
    active: z.boolean().default(true),
    sortOrder: z.number().int().min(0).max(9999).default(0),
  })
  .strict();
const Command = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      entityType: z.string().max(80).optional(),
      includeInactive: z.boolean().default(false),
    })
    .strict(),
  z.object({ action: z.literal("upsert_list"), list: List }).strict(),
  z.object({ action: z.literal("upsert_option"), option: Option }).strict(),
  z
    .object({
      action: z.literal("set_option_active"),
      option: z.object({ id: Uuid, active: z.boolean(), lockVersion: LockVersion }).strict(),
    })
    .strict(),
]);

type Identity = NonNullable<Awaited<ReturnType<typeof authenticateCms>>>;
type VocabularyCommand = z.infer<typeof Command>;
type VocabularyActorScope = { isQaActor: boolean; active: boolean };

async function actorScope(
  identity: Identity,
  environment: "local" | "staging" | "production",
): Promise<VocabularyActorScope> {
  const { data, error } = await identity.admin.rpc("cms_actor_scope_context", {
    p_actor_id: identity.user.id,
    p_environment: environment,
  });
  if (error || typeof data !== "object" || !data) throw new Error("CMS_CONTROLLED_SCOPE_UNAVAILABLE");
  return { isQaActor: data.isQaActor === true, active: data.active === true };
}

async function canRead(identity: Identity) {
  const { data } = await identity.admin.rpc("cms_actor_authorized", {
    p_actor_id: identity.user.id,
    p_permission: "cms:vocabularies.read",
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  });
  return data === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: VocabularyCommand;
  try {
    command = Command.parse(await readJsonLimited(req, 128 * 1024));
  } catch {
    return json(req, { error: "Comando de lista mestra inválido." }, 400);
  }
  try {
    if (
      !(await consumeRateLimit(
        identity.admin,
        req,
        "cms_vocabularies",
        `${identity.user.id}:${clientAddress(req)}`,
        120,
        900,
      ))
    ) {
      return json(req, { error: "Muitas operações. Aguarde." }, 429);
    }
  } catch {
    return json(req, { error: "Proteção temporariamente indisponível." }, 503);
  }

  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment)) {
    return json(req, { error: "Ambiente do CMS não configurado." }, 503);
  }
  let scope: VocabularyActorScope;
  try {
    scope = await actorScope(identity, configuredEnvironment);
  } catch {
    return json(
      req,
      { error: "Escopo de listas mestras temporariamente indisponível.", code: "CMS_CONTROLLED_SCOPE_UNAVAILABLE" },
      503,
    );
  }
  if (!scope.active) {
    return json(
      req,
      {
        error: "Operação indisponível ou sem permissão.",
        code: scope.isQaActor ? "CMS_CONTROLLED_QA_SCOPE_INACTIVE" : "CMS_CONTROLLED_SCOPE_INVALID",
      },
      403,
    );
  }

  if (command.action === "list") {
    if (!(await canRead(identity))) return json(req, { error: "Permissão insuficiente." }, 403);
    const { data, error } = await identity.admin.rpc("cms_controlled_vocabularies_scoped", {
      p_actor_id: identity.user.id,
      p_environment: configuredEnvironment,
      p_entity_type: command.entityType ?? null,
      p_include_inactive: command.includeInactive,
      p_limit: 500,
    });
    if (error) return json(req, { error: "Listas mestras indisponíveis." }, 503);
    const items = (data ?? []).map((row: Record<string, unknown> & { cms_controlled_options?: unknown }) => {
      const { cms_controlled_options: options, ...list } = row;
      return { ...list, options: Array.isArray(options) ? options : [] };
    });
    return json(req, { items });
  }

  const correlationId = crypto.randomUUID();
  const { data, error } = await identity.admin.rpc("cms_manage_controlled_vocabulary_scoped", {
    p_actor_id: identity.user.id,
    p_environment: configuredEnvironment,
    p_action: command.action,
    p_list: command.action === "upsert_list" ? command.list : null,
    p_option: command.action === "upsert_list" ? null : command.option,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
    p_correlation_id: correlationId,
  });
  if (error) {
    const message = error.message ?? "";
    const forbidden = message.includes("FORBIDDEN");
    const conflict = message.includes("CONFLICT") || error.code === "40001" || error.code === "23505";
    return json(
      req,
      {
        error: forbidden
          ? "Permissão insuficiente."
          : conflict
            ? "A lista foi alterada ou uma chave equivalente já existe."
            : "Não foi possível atualizar a lista mestra.",
        correlationId,
        code: error.code,
      },
      forbidden ? 403 : conflict ? 409 : 422,
    );
  }
  return json(req, { ...data, correlationId });
});
