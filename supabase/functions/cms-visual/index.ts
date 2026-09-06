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
const ComponentKey = z.enum([
  "hero",
  "rich_text",
  "image",
  "gallery",
  "benefit_grid",
  "content_grid",
  "steps",
  "metrics",
  "testimonial",
  "faq",
  "form",
  "cta",
  "related_content",
  "split_content",
  "logo_cloud",
  "tabs",
  "comparison_table",
  "alert",
  "timeline",
  "link_list",
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
        siteKey: z.literal("main"),
      })
      .strict(),
  })
  .strict();
const LayoutSlot = (max: number) =>
  z
    .object({
      span: z.number().int().min(1).max(max),
      start: z.number().int().min(1).max(max).optional(),
      hidden: z.boolean(),
    })
    .strict()
    .refine((slot) => !slot.start || slot.start + slot.span - 1 <= max);
const Required = z.string().trim().min(1);
const Slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(160);
const InternalPath = z
  .string()
  .regex(/^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/)
  .max(300);
const HttpUrl = z
  .url()
  .max(500)
  .refine((value) => /^https?:\/\//i.test(value));
const Href = z.union([InternalPath, HttpUrl]);
const Link = z.object({ label: Required.max(120), href: Href }).strict();
const RepeaterId = z.object({ id: Uuid }).passthrough();
const ComponentDataSchemas = {
  hero: z
    .object({
      eyebrow: z.string().trim().max(120).optional(),
      title: Required.max(220),
      text: z.string().trim().max(1200).optional(),
      primaryCta: Link.optional(),
      secondaryCta: Link.optional(),
      assetId: Uuid.optional(),
      alt: z.string().trim().max(300).optional(),
      alignment: z.enum(["left", "center"]),
    })
    .strict(),
  rich_text: z
    .object({
      eyebrow: z.string().trim().max(120).optional(),
      heading: z.string().trim().max(220).optional(),
      text: Required.max(20_000),
    })
    .strict(),
  image: z
    .object({ assetId: Uuid, alt: Required.max(300), caption: z.string().trim().max(500).optional(), fit: z.enum(["cover", "contain"]) })
    .strict(),
  gallery: z
    .object({ heading: z.string().trim().max(220).optional(), assetIds: z.array(Uuid).min(1).max(24), columns: z.number().int().min(2).max(4) })
    .strict(),
  benefit_grid: z
    .object({
      eyebrow: z.string().trim().max(120).optional(),
      heading: Required.max(220),
      items: z.array(z.object({ id: Uuid, title: Required.max(160), text: Required.max(800) }).strict()).min(1).max(12),
    })
    .strict(),
  content_grid: z
    .object({
      eyebrow: z.string().trim().max(120).optional(),
      heading: Required.max(220),
      items: z
        .array(
          z
            .object({
              id: Uuid,
              title: Required.max(160),
              text: z.string().trim().max(800).optional(),
              href: InternalPath.optional(),
              assetId: Uuid.optional(),
            })
            .strict(),
        )
        .min(1)
        .max(24),
      columns: z.number().int().min(2).max(4),
    })
    .strict(),
  steps: z
    .object({
      heading: Required.max(220),
      items: z.array(z.object({ id: Uuid, title: Required.max(160), text: Required.max(800) }).strict()).min(1).max(20),
    })
    .strict(),
  metrics: z
    .object({
      heading: z.string().trim().max(220).optional(),
      items: z.array(z.object({ id: Uuid, value: Required.max(80), label: Required.max(160) }).strict()).min(1).max(12),
    })
    .strict(),
  testimonial: z.object({ quote: Required.max(2000), author: Required.max(160), role: z.string().trim().max(160).optional() }).strict(),
  faq: z
    .object({
      heading: Required.max(220),
      items: z.array(z.object({ id: Uuid, question: Required.max(300), answer: Required.max(3000) }).strict()).min(1).max(30),
    })
    .strict(),
  form: z
    .object({
      heading: Required.max(220),
      text: z.string().trim().max(1000).optional(),
      formKey: Slug,
      formId: Uuid.optional(),
      formVersionId: Uuid.optional(),
      buttonLabel: Required.max(120),
    })
    .strict(),
  cta: z.object({ heading: Required.max(220), text: z.string().trim().max(1000).optional(), link: Link }).strict(),
  related_content: z
    .object({ heading: Required.max(220), itemIds: z.array(Uuid).min(1).max(24), presentation: z.enum(["cards", "list"]) })
    .strict(),
  split_content: z
    .object({
      eyebrow: z.string().trim().max(120).optional(),
      heading: Required.max(220),
      text: Required.max(5000),
      assetId: Uuid,
      alt: Required.max(300),
      imagePosition: z.enum(["left", "right"]),
      link: Link.optional(),
    })
    .strict(),
  logo_cloud: z
    .object({
      heading: z.string().trim().max(220).optional(),
      items: z
        .array(z.object({ id: Uuid, assetId: Uuid, alt: Required.max(300), href: Href.optional() }).strict())
        .min(1)
        .max(24),
    })
    .strict(),
  tabs: z
    .object({
      heading: z.string().trim().max(220).optional(),
      items: z
        .array(z.object({ id: Uuid, label: Required.max(80), heading: Required.max(180), text: Required.max(3000) }).strict())
        .min(2)
        .max(8),
    })
    .strict(),
  comparison_table: z
    .object({
      heading: Required.max(220),
      caption: Required.max(500),
      columns: z.array(Required.max(100)).min(2).max(5),
      rows: z
        .array(z.object({ id: Uuid, label: Required.max(160), values: z.array(z.string().trim().max(500)).min(2).max(5) }).strict())
        .min(1)
        .max(30),
    })
    .strict()
    .refine((data) => data.rows.every((row) => row.values.length === data.columns.length)),
  alert: z
    .object({ heading: Required.max(180), text: Required.max(2000), severity: z.enum(["info", "success", "warning"]), link: Link.optional() })
    .strict(),
  timeline: z
    .object({
      heading: Required.max(220),
      items: z
        .array(z.object({ id: Uuid, label: Required.max(80), title: Required.max(180), text: Required.max(1500) }).strict())
        .min(2)
        .max(20),
    })
    .strict(),
  link_list: z
    .object({
      heading: Required.max(220),
      items: z
        .array(z.object({ id: Uuid, label: Required.max(160), href: Href, description: z.string().trim().max(500).optional() }).strict())
        .min(1)
        .max(30),
    })
    .strict(),
} satisfies Record<z.infer<typeof ComponentKey>, z.ZodType>;
const VisualNode = z
  .object({
    id: Uuid,
    type: ComponentKey,
    hidden: z.boolean(),
    anchor: Slug.optional(),
    width: z.enum(["content", "wide", "full"]),
    tone: z.enum(["light", "muted", "dark", "brand"]),
    componentVersion: z.literal(1),
    layout: z
      .object({ desktop: LayoutSlot(12), tablet: LayoutSlot(8), mobile: LayoutSlot(4) })
      .strict(),
    groupId: Uuid.optional(),
    symbolId: Uuid.optional(),
    data: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((node, context) => {
    const parsed = ComponentDataSchemas[node.type].safeParse(node.data);
    if (!parsed.success)
      for (const issue of parsed.error.issues)
        context.addIssue({ code: "custom", path: ["data", ...issue.path], message: issue.message });
    const repeaters = [
      node.data && typeof node.data === "object" && "items" in node.data && Array.isArray(node.data.items)
        ? node.data.items
        : [],
      node.data && typeof node.data === "object" && "rows" in node.data && Array.isArray(node.data.rows)
        ? node.data.rows
        : [],
    ];
    for (const items of repeaters) {
      const ids = items.flatMap((item) => {
        const result = RepeaterId.safeParse(item);
        return result.success ? [result.data.id] : [];
      });
      if (new Set(ids).size !== ids.length)
        context.addIssue({ code: "custom", path: ["data"], message: "Identidades internas duplicadas." });
    }
  });
const VisualDocument = z
  .object({
    schemaVersion: z.literal(1),
    registryVersion: z.literal(1),
    itemId: Uuid,
    siteKey: z.literal("main"),
    environment: z.enum(["local", "staging", "production"]),
    branchKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    themeKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    mode: z.enum(["guided", "designer"]),
    grid: z.object({ desktop: z.literal(12), tablet: z.literal(8), mobile: z.literal(4) }).strict(),
    nodes: z.array(VisualNode).min(1).max(80),
    bindings: z
      .array(
        z
          .object({
            id: Uuid,
            nodeId: Uuid,
            property: z.string().regex(/^[a-z][a-zA-Z0-9.]{0,119}$/),
            source: z.enum(["content", "site", "static"]),
            sourceId: Uuid.optional(),
            path: z.string().regex(/^[a-z][a-zA-Z0-9.[\]_-]{0,199}$/),
          })
          .strict(),
      )
      .max(200),
  })
  .strict()
  .superRefine((document, context) => {
    const nodeIds = new Set<string>();
    const groups = new Map<string, number[]>();
    document.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id))
        context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "Identidade duplicada." });
      nodeIds.add(node.id);
      if (node.type === "comparison_table") {
        const parsed = ComponentDataSchemas.comparison_table.safeParse(node.data);
        const columns = parsed.success
          ? parsed.data.columns.map((column) => column.trim().toLocaleLowerCase("pt-BR"))
          : [];
        if (parsed.success && new Set(columns).size !== columns.length)
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "data", "columns"],
            message: "Colunas duplicadas.",
          });
      }
      if (node.groupId) groups.set(node.groupId, [...(groups.get(node.groupId) ?? []), index]);
    });
    if (document.nodes.filter((node) => node.type === "hero").length > 1)
      context.addIssue({ code: "custom", path: ["nodes"], message: "Apenas um hero é permitido." });
    const bindingIds = new Set<string>();
    const bindingTargets = new Set<string>();
    document.bindings.forEach((binding, index) => {
      if (!nodeIds.has(binding.nodeId))
        context.addIssue({
          code: "custom",
          path: ["bindings", index, "nodeId"],
          message: "Componente de destino inexistente.",
        });
      const target = `${binding.nodeId}:${binding.property}`;
      if (bindingIds.has(binding.id) || bindingTargets.has(target))
        context.addIssue({ code: "custom", path: ["bindings", index], message: "Binding duplicado." });
      bindingIds.add(binding.id);
      bindingTargets.add(target);
    });
    for (const [groupId, indexes] of groups) {
      if (indexes.length < 2 || indexes.at(-1)! - indexes[0] + 1 !== indexes.length)
        context.addIssue({
          code: "custom",
          path: ["nodes", indexes[0], "groupId"],
          message: `Grupo ${groupId} não é adjacente.`,
        });
      for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
        const nodes = indexes.map((index) => document.nodes[index]);
        if (
          nodes.some((node) => node.layout[breakpoint].start !== undefined) ||
          nodes.reduce((sum, node) => sum + node.layout[breakpoint].span, 0) > document.grid[breakpoint]
        )
          context.addIssue({
            code: "custom",
            path: ["nodes", indexes[0], "layout", breakpoint],
            message: "Layout de grupo inválido.",
          });
      }
    }
  });

function unsafeVisualValue(value: unknown): boolean {
  if (typeof value === "string")
    return /<\s*\/?\s*(script|style|iframe|object|embed|svg|math|link|meta|base|template)\b|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=/i.test(
      value,
    );
  if (Array.isArray(value)) return value.some(unsafeVisualValue);
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, item]) =>
      [
        "html",
        "rawhtml",
        "css",
        "javascript",
        "script",
        "style",
        "srcdoc",
        "dangerouslysetinnerhtml",
        "object",
        "embed",
        "svg",
        "math",
        "link",
        "meta",
        "base",
        "template",
      ].includes(key.toLowerCase()) ||
      /^on[a-z]+$/i.test(key) ||
      unsafeVisualValue(item),
  );
}

const VisualRequest = z
  .object({
    envelope: Envelope,
    action: z.enum([
      "capability",
      "catalog",
      "list_branches",
      "get_document",
      "create_branch",
      "save_document",
      "snapshot",
      "create_symbol",
      "apply_to_draft",
      "abandon",
    ]),
    branchId: Uuid.optional(),
    itemId: Uuid.optional(),
    branchKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/).optional(),
    mode: z.enum(["guided", "designer"]).optional(),
    document: VisualDocument.optional(),
    expectedVersion: z.number().int().positive().optional(),
    conflictResolution: z
      .object({
        strategy: z.literal("replace_remote"),
        staleVersion: z.number().int().positive(),
        remoteVersion: z.number().int().positive(),
      })
      .strict()
      .optional(),
    expectedDraftVersion: z.number().int().positive().optional(),
    nodeId: Uuid.optional(),
    symbolKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/).optional(),
    name: z.string().trim().min(2).max(120).optional(),
  })
  .strict()
  .superRefine((command, context) => {
    const issue = (path: string, message: string) =>
      context.addIssue({ code: "custom", path: [path], message });
    if (command.document && unsafeVisualValue(command.document))
      issue("document", "Código ou marcação arbitrária não é permitido.");
    if (command.action === "list_branches" && !command.itemId) issue("itemId", "Item obrigatório.");
    if (command.action === "get_document" && !command.branchId) issue("branchId", "Branch obrigatório.");
    if (
      command.action === "create_branch" &&
      (!command.itemId || !command.branchKey || !command.mode)
    )
      issue("branchKey", "Origem, branch e modo são obrigatórios.");
    if (
      command.action === "save_document" &&
      (!command.branchId || !command.document || !command.expectedVersion)
    )
      issue("document", "Documento, branch e versão são obrigatórios.");
    if (command.conflictResolution && command.action !== "save_document")
      issue("conflictResolution", "Resolução de conflito só é válida ao salvar.");
    if (
      command.conflictResolution &&
      (command.conflictResolution.remoteVersion !== command.expectedVersion ||
        command.conflictResolution.staleVersion >= command.conflictResolution.remoteVersion)
    )
      issue("conflictResolution", "As versões da resolução de conflito são inválidas.");
    if (
      ["snapshot", "abandon"].includes(command.action) &&
      (!command.branchId || !command.expectedVersion)
    )
      issue("expectedVersion", "Branch e versão são obrigatórios.");
    if (
      command.action === "create_symbol" &&
      (!command.branchId ||
        !command.expectedVersion ||
        !command.nodeId ||
        !command.symbolKey ||
        !command.name)
    )
      issue("symbolKey", "Componente, símbolo, nome e versão são obrigatórios.");
    if (
      command.action === "apply_to_draft" &&
      (!command.branchId || !command.expectedVersion || !command.expectedDraftVersion)
    )
      issue("expectedDraftVersion", "As versões do documento e do rascunho são obrigatórias.");
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

  let command: z.infer<typeof VisualRequest>;
  try {
    command = VisualRequest.parse(await readJsonLimited(req, 1_200_000));
  } catch {
    return json(req, { error: "Comando visual inválido.", code: "CMS_VISUAL_COMMAND_INVALID" }, 400);
  }
  const { environment, siteKey } = command.envelope.actorContext;
  const correlationId = command.envelope.correlationId;
  if (environment === "production" && !isProductionOperationEnabled(environment))
    return json(
      req,
      { error: "Produção não está disponível nesta fase.", code: "CMS_VISUAL_PRODUCTION_GATED", correlationId },
      403,
    );
  const configuredEnvironment = Deno.env.get("CMS_ENVIRONMENT");
  if (!isConfiguredCmsEnvironment(configuredEnvironment))
    return json(req, { error: "Ambiente do CMS não configurado.", correlationId }, 503);
  if (configuredEnvironment !== environment || siteKey !== "main")
    return json(
      req,
      { error: "Escopo visual não autorizado.", code: "CMS_VISUAL_SCOPE_MISMATCH", correlationId },
      403,
    );
  const occurredAt = Date.parse(command.envelope.occurredAt);
  if (occurredAt < Date.now() - 15 * 60_000 || occurredAt > Date.now() + 5 * 60_000)
    return json(
      req,
      { error: "Comando expirado ou futuro.", code: "CMS_VISUAL_COMMAND_STALE", correlationId },
      409,
    );
  try {
    const mutation = !["capability", "catalog", "list_branches", "get_document"].includes(command.action);
    const allowed = await consumeRateLimit(
      identity.admin,
      req,
      `cms_visual_${command.action}`,
      `${identity.user.id}:${clientAddress(req)}`,
      mutation ? 60 : 180,
      900,
    );
    if (!allowed) return json(req, { error: "Muitas operações. Aguarde.", correlationId }, 429);
  } catch {
    return json(req, { error: "Proteção temporariamente indisponível.", correlationId }, 503);
  }
  const mutation = !["capability", "catalog", "list_branches", "get_document"].includes(command.action);
  if (mutation && identity.claims.aal !== "aal2")
    return json(
      req,
      {
        error: "Eleve a sessão com MFA para continuar.",
        code: "CMS_VISUAL_MFA_REQUIRED",
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
    "cms_visual_capability",
    common,
  );
  if (capabilityError)
    return json(req, { enabled: false, source: "unavailable", correlationId }, 503);
  if (command.action === "capability") return json(req, { ...capability, correlationId });
  if (capability?.enabled !== true)
    return json(
      req,
      {
        error: "O Estúdio Visual não está habilitado para esta identidade.",
        code: "CMS_VISUAL_FEATURE_DISABLED",
        source: capability?.source,
        correlationId,
      },
      403,
    );

  if (command.action === "catalog") {
    const { data, error } = await identity.admin.rpc("cms_get_visual_catalog", {
      ...common,
      p_correlation_id: correlationId,
    });
    return error
      ? json(req, { error: "Catálogo visual indisponível.", correlationId }, 503)
      : json(req, data);
  }
  if (command.action === "list_branches") {
    const { data, error } = await identity.admin.rpc("cms_list_visual_branches", {
      ...common,
      p_item_id: command.itemId,
      p_correlation_id: correlationId,
    });
    return error
      ? json(req, { error: "Branches visuais indisponíveis.", correlationId }, 503)
      : json(req, data);
  }
  if (command.action === "get_document") {
    const { data, error } = await identity.admin.rpc("cms_get_visual_document", {
      ...common,
      p_branch_id: command.branchId,
      p_correlation_id: correlationId,
    });
    if (!error) return json(req, data);
    return json(
      req,
      {
        error: error.code === "P0002" ? "Documento visual não encontrado." : "Documento visual indisponível.",
        correlationId,
      },
      error.code === "P0002" ? 404 : 503,
    );
  }

  const idempotencyKey = req.headers.get("X-Idempotency-Key");
  if (!idempotencyKey || !Uuid.safeParse(idempotencyKey).success)
    return json(
      req,
      { error: "Chave idempotente obrigatória.", code: "CMS_VISUAL_IDEMPOTENCY_REQUIRED", correlationId },
      400,
    );
  const payload =
    command.action === "create_branch"
      ? { branchKey: command.branchKey, mode: command.mode }
      : command.action === "save_document"
        ? {
            document: command.document,
            ...(command.conflictResolution
              ? { conflictResolution: command.conflictResolution }
              : {}),
          }
        : command.action === "create_symbol"
          ? { nodeId: command.nodeId, symbolKey: command.symbolKey, name: command.name }
          : {};
  const requestHash = await sha256(JSON.stringify(canonicalize(command)));
  const { data, error } = await identity.admin.rpc("cms_execute_visual_command", {
    ...common,
    p_action: command.action,
    p_branch_id: command.branchId ?? null,
    p_item_id: command.itemId ?? null,
    p_payload: payload,
    p_expected_version: command.expectedVersion ?? null,
    p_expected_draft_version: command.expectedDraftVersion ?? null,
    p_command_id: command.envelope.commandId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
    p_correlation_id: correlationId,
  });
  if (!error) return json(req, data);

  const marker = error.message?.match(/CMS_[A-Z0-9_]+/)?.[0] ?? "CMS_VISUAL_FAILURE";
  const mfa = marker === "CMS_VISUAL_MFA_REQUIRED";
  const conflict =
    marker.includes("CONFLICT") ||
    marker.includes("IN_PROGRESS") ||
    error.code === "PT409" ||
    error.code === "23505";
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
          ? "O documento mudou. Atualize a versão e tente novamente; sua edição local foi preservada."
          : missing
            ? "Branch, documento ou rascunho não encontrado."
            : invalid
              ? "O documento não atende ao contrato visual governado."
              : forbidden
                ? "Operação visual não autorizada."
                : "Não foi possível concluir a operação visual.",
      code: marker,
      correlationId,
      preserved: conflict,
    },
    status,
  );
});
