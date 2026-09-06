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
const CandidateSiteKey = z.string().regex(/^g9x-[a-z0-9]+(?:-[a-z0-9]+)*$/);
const Envelope = z
  .object({
    schemaVersion: z.literal(1),
    commandId: Uuid,
    correlationId: Uuid,
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: z.enum(["local", "staging", "production"]),
        siteKey: z.literal("main"),
      })
      .strict(),
  })
  .strict();
const Token = z
  .object({
    key: z.string().regex(/^(color|space|radius|type)\.[a-z][a-z0-9.-]{0,62}$/),
    kind: z.enum(["color", "space", "radius", "type"]),
    value: z.string().trim().min(1).max(200),
  })
  .strict();
const SitesRequest = z
  .object({
    envelope: Envelope,
    action: z.enum([
      "capability",
      "registry",
      "create_candidate",
      "add_domain",
      "update_tokens",
      "suspend_candidate",
    ]),
    targetSiteKey: CandidateSiteKey.optional(),
    name: z.string().trim().min(2).max(120).optional(),
    purpose: z.string().trim().min(3).max(500).optional(),
    hostname: z
      .string()
      .regex(
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.invalid$/,
      )
      .optional(),
    tokens: z.array(Token).min(1).max(100).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((command, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (
      command.action === "create_candidate" &&
      (!command.targetSiteKey || !command.name || !command.purpose)
    )
      issue("targetSiteKey", "Chave, nome e finalidade sintética são obrigatórios.");
    if (
      command.action === "add_domain" &&
      (!command.targetSiteKey || !command.hostname || !command.expectedVersion)
    )
      issue("hostname", "Site, hostname .invalid e versão são obrigatórios.");
    if (
      command.action === "update_tokens" &&
      (!command.targetSiteKey || !command.tokens || !command.expectedVersion)
    )
      issue("tokens", "Site, tokens e versão são obrigatórios.");
    if (command.tokens) {
      const keys = command.tokens.map((token) => token.key);
      if (new Set(keys).size !== keys.length) issue("tokens", "As chaves de token precisam ser únicas.");
      command.tokens.forEach((token, index) => {
        if (token.key.split(".")[0] !== token.kind)
          context.addIssue({
            code: "custom",
            path: ["tokens", index, "kind"],
            message: "O tipo precisa corresponder ao prefixo do token.",
          });
      });
    }
    if (
      command.action === "suspend_candidate" &&
      (!command.targetSiteKey || !command.expectedVersion)
    )
      issue("expectedVersion", "Site e versão são obrigatórios.");
  });

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  return value;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (!isAllowedOrigin(req)) return json(req, { error: "Origem não autorizada." }, 403);
  if (req.method !== "POST") return json(req, { error: "Método não permitido." }, 405);
  const identity = await authenticateCms(req);
  if (!identity) return json(req, { error: "Sessão inválida." }, 401);

  let command: z.infer<typeof SitesRequest>;
  try {
    command = SitesRequest.parse(await readJsonLimited(req, 160 * 1024));
  } catch {
    return json(req, { error: "Comando de site inválido.", code: "CMS_SITES_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment))
    return json(
      req,
      { error: "Produção não está disponível nesta fase.", code: "CMS_SITES_PRODUCTION_GATED", correlationId },
      403,
    );
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(
      req,
      { error: "Escopo de site não autorizado.", code: "CMS_SITES_SCOPE_MISMATCH", correlationId },
      403,
    );
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(
      req,
      { error: "Comando expirado ou futuro.", code: "CMS_SITES_COMMAND_STALE", correlationId },
      409,
    );
  try {
    const mutation = !["capability", "registry"].includes(command.action);
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_sites_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      mutation ? 20 : 120,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch {
    return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503);
  }
  const mutation = !["capability", "registry"].includes(command.action);
  if (mutation && identity.claims.aal !== "aal2")
    return json(
      req,
      {
        error: "Eleve a sessão com MFA para continuar.",
        code: "CMS_SITES_MFA_REQUIRED",
        correlationId,
      },
      412,
    );

  const common = {
    p_actor_id: identity.user.id,
    p_environment: environment,
    p_site_key: siteKey,
    p_aal: identity.claims.aal,
    p_session_id: identity.claims.sessionId,
    p_issued_at: identity.claims.issuedAt,
  };
  const { data: capability, error: capabilityError } = await identity.admin.rpc(
    "cms_sites_capability",
    common,
  );
  if (capabilityError)
    return json(req, { enabled: false, source: "unavailable", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, correlationId });
  if (capability?.enabled !== true)
    return json(
      req,
      {
        error: "A preparação multisite não está habilitada para esta identidade.",
        code: "CMS_SITES_FEATURE_DISABLED",
        source: capability?.source,
        correlationId,
      },
      403,
    );
  if (command.action === "registry") {
    const { data, error } = await identity.admin.rpc("cms_get_site_registry", {
      ...common,
      p_correlation_id: correlationId,
    });
    return error
      ? json(req, { error: "Registro de sites indisponível.", correlationId }, 503)
      : json(req, data);
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success)
    return json(
      req,
      { error: "Chave idempotente obrigatória.", code: "CMS_SITES_IDEMPOTENCY_REQUIRED", correlationId },
      400,
    );
  const payload =
    command.action === "create_candidate"
      ? { name: command.name, purpose: command.purpose }
      : command.action === "add_domain"
        ? { environment, hostname: command.hostname }
        : command.action === "update_tokens"
          ? { tokens: command.tokens }
          : {};
  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_site_command", {
    ...common,
    p_action: command.action,
    p_target_site_key: command.targetSiteKey,
    p_payload: payload,
    p_expected_version: command.expectedVersion ?? null,
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (!error) return json(req, data);

  const marker = error.message?.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_SITES_FAILURE";
  const mfa = marker === "CMS_SITES_MFA_REQUIRED";
  const conflict = marker.includes("CONFLICT") || error.code === "PT409" || error.code === "23505";
  const missing = marker.includes("NOT_FOUND") || error.code === "P0002";
  const invalid = marker.includes("INVALID") || error.code === "22023" || error.code === "23514";
  const forbidden = marker.includes("FORBIDDEN") || marker.includes("DISABLED");
  const status = mfa ? 412 : forbidden ? 403 : missing ? 404 : conflict ? 409 : invalid ? 422 : 500;
  return json(
    req,
    {
      error: mfa
        ? "Eleve a sessão com MFA para continuar."
        : conflict
          ? "O site candidato mudou ou a chave já existe. Atualize e tente novamente."
          : missing
            ? "Site candidato não encontrado."
            : invalid
              ? "A configuração não atende ao contrato sintético e isolado."
              : forbidden
                ? "Operação de site não autorizada."
                : "Não foi possível concluir a operação de site.",
      code: marker,
      correlationId,
      preserved: conflict,
    },
    status,
  );
});
