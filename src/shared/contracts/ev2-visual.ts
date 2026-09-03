import { z } from "zod";
import { CmsPageBlockSchema } from "./cms-content";

export const EV2_VISUAL_COMPONENT_KEYS = [
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
] as const;

export const Ev2VisualComponentKeySchema = z.enum(EV2_VISUAL_COMPONENT_KEYS);
export const Ev2VisualEnvironmentSchema = z.enum(["local", "staging", "production"]);
export const Ev2VisualModeSchema = z.enum(["guided", "designer"]);
export const Ev2VisualBreakpointSchema = z.enum(["desktop", "tablet", "mobile"]);
export const Ev2SiteKeySchema = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/);

const VisualBindingSchema = z
  .object({
    id: z.uuid(),
    nodeId: z.uuid(),
    property: z.string().regex(/^[a-z][a-zA-Z0-9.]{0,119}$/),
    source: z.enum(["content", "site", "static"]),
    sourceId: z.uuid().optional(),
    path: z.string().regex(/^[a-z][a-zA-Z0-9.[\]_-]{0,199}$/),
  })
  .strict();

function executablePath(value: unknown, path: Array<string | number> = []): Array<string | number> | null {
  if (typeof value === "string")
    return /<\s*\/?\s*(script|style|iframe|object|embed|svg|math|link|meta|base|template)\b|(?:javascript|vbscript)\s*:|data\s*:\s*text\/html|\bon[a-z]+\s*=/i.test(
      value,
    )
      ? path
      : null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = executablePath(value[index], [...path, index]);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;
  for (const [key, item] of Object.entries(value)) {
    if (
      [
        "html",
        "rawhtml",
        "css",
        "javascript",
        "script",
        "style",
        "srcdoc",
        "dangerouslysetinnerhtml",
      ].includes(key.toLowerCase()) ||
      /^on[a-z]+$/i.test(key)
    )
      return [...path, key];
    const found = executablePath(item, [...path, key]);
    if (found) return found;
  }
  return null;
}

export const Ev2VisualDocumentSchema = z
  .object({
    schemaVersion: z.literal(1),
    registryVersion: z.literal(1),
    itemId: z.uuid(),
    siteKey: Ev2SiteKeySchema,
    environment: z.enum(["local", "staging"]),
    branchKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    themeKey: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/),
    mode: Ev2VisualModeSchema,
    grid: z.object({ desktop: z.literal(12), tablet: z.literal(8), mobile: z.literal(4) }).strict(),
    nodes: z.array(CmsPageBlockSchema).min(1).max(80),
    bindings: z.array(VisualBindingSchema).max(200),
  })
  .strict()
  .superRefine((document, context) => {
    const ids = new Set<string>();
    const groups = new Map<string, number[]>();
    for (const [index, node] of document.nodes.entries()) {
      if (ids.has(node.id))
        context.addIssue({ code: "custom", path: ["nodes", index, "id"], message: "Identidade duplicada." });
      ids.add(node.id);
      if (node.componentVersion !== 1 || !node.layout)
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "layout"],
          message: "Versão e layout 12/8/4 são obrigatórios.",
        });
      if (node.type === "comparison_table")
        node.data.rows.forEach((row, rowIndex) => {
          if (row.values.length !== node.data.columns.length)
            context.addIssue({
              code: "custom",
              path: ["nodes", index, "data", "rows", rowIndex, "values"],
              message: "A linha deve acompanhar todas as colunas.",
            });
        });
      const repeaters = [
        "items" in node.data && Array.isArray(node.data.items) ? node.data.items : [],
        node.type === "comparison_table" ? node.data.rows : [],
      ];
      for (const items of repeaters) {
        const itemIds = items
          .map((item) => (item && typeof item === "object" && "id" in item ? String(item.id) : ""))
          .filter(Boolean);
        if (new Set(itemIds).size !== itemIds.length)
          context.addIssue({
            code: "custom",
            path: ["nodes", index, "data"],
            message: "Identidades internas do componente precisam ser únicas.",
          });
      }
      if (
        node.type === "comparison_table" &&
        new Set(node.data.columns.map((column) => column.trim().toLocaleLowerCase("pt-BR"))).size !==
          node.data.columns.length
      )
        context.addIssue({
          code: "custom",
          path: ["nodes", index, "data", "columns"],
          message: "Os títulos das colunas precisam ser únicos.",
        });
      if (node.groupId) groups.set(node.groupId, [...(groups.get(node.groupId) ?? []), index]);
    }
    if (document.nodes.filter((node) => node.type === "hero").length > 1)
      context.addIssue({ code: "custom", path: ["nodes"], message: "Uma página aceita no máximo um hero." });
    const bindingIds = new Set<string>();
    const bindingTargets = new Set<string>();
    for (const [index, binding] of document.bindings.entries()) {
      if (!ids.has(binding.nodeId))
        context.addIssue({
          code: "custom",
          path: ["bindings", index, "nodeId"],
          message: "Binding aponta para componente inexistente.",
        });
      const target = `${binding.nodeId}:${binding.property}`;
      if (bindingIds.has(binding.id) || bindingTargets.has(target))
        context.addIssue({
          code: "custom",
          path: ["bindings", index],
          message: "Identidade ou propriedade de binding duplicada.",
        });
      bindingIds.add(binding.id);
      bindingTargets.add(target);
    }
    for (const [groupId, indexes] of groups) {
      const contiguous = indexes.at(-1)! - indexes[0] + 1 === indexes.length;
      if (indexes.length < 2 || !contiguous)
        context.addIssue({
          code: "custom",
          path: ["nodes", indexes[0], "groupId"],
          message: `O grupo ${groupId} precisa ter ao menos dois componentes adjacentes.`,
        });
      for (const breakpoint of ["desktop", "tablet", "mobile"] as const) {
        const groupedNodes = indexes.map((index) => document.nodes[index]);
        if (groupedNodes.some((node) => node.layout?.[breakpoint].start !== undefined))
          context.addIssue({
            code: "custom",
            path: ["nodes", indexes[0], "layout", breakpoint],
            message: "Componentes agrupados usam posicionamento automático; remova a coluna inicial.",
          });
        if (
          groupedNodes.reduce(
            (total, node) => total + (node.layout?.[breakpoint].span ?? document.grid[breakpoint]),
            0,
          ) > document.grid[breakpoint]
        )
          context.addIssue({
            code: "custom",
            path: ["nodes", indexes[0], "layout", breakpoint],
            message: `O grupo excede as ${document.grid[breakpoint]} colunas do breakpoint.`,
          });
      }
    }
    const unsafe = executablePath(document);
    if (unsafe)
      context.addIssue({
        code: "custom",
        path: unsafe,
        message: "HTML, CSS e JavaScript arbitrários não são aceitos.",
      });
  });

export const Ev2VisualComponentDefinitionSchema = z.object({
  key: Ev2VisualComponentKeySchema,
  name: z.string(),
  category: z.enum(["structure", "content", "media", "conversion", "data"]),
  version: z.literal(1),
  rendererKey: z.string(),
  allowedModes: z.array(Ev2VisualModeSchema),
  budget: z.object({
    maxInstances: z.number().int().positive(),
    maxPayloadBytes: z.number().int().positive(),
  }),
  defaultProps: z.record(z.string(), z.unknown()),
});

export const Ev2VisualCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    registryVersion: z.literal(1),
    components: z.array(Ev2VisualComponentDefinitionSchema).length(20),
    theme: z.object({
      key: z.string(),
      version: z.number().int().positive(),
      tokens: z.array(
        z.object({ key: z.string(), kind: z.enum(["color", "space", "radius", "type"]), value: z.string() }),
      ),
    }),
    environment: Ev2VisualEnvironmentSchema,
    siteKey: Ev2SiteKeySchema,
    correlationId: z.uuid(),
  })
  .superRefine((catalog, context) => {
    const keys = new Set(catalog.components.map((component) => component.key));
    if (
      keys.size !== EV2_VISUAL_COMPONENT_KEYS.length ||
      EV2_VISUAL_COMPONENT_KEYS.some((key) => !keys.has(key))
    )
      context.addIssue({
        code: "custom",
        path: ["components"],
        message: "O catálogo precisa cobrir uma vez cada um dos 20 componentes do MVP.",
      });
  });

export const Ev2VisualCapabilityResultSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  source: z.string(),
  siteKey: Ev2SiteKeySchema,
  environment: Ev2VisualEnvironmentSchema,
  registryVersion: z.literal(1),
  componentCount: z.literal(20),
  multisiteOperational: z.literal(false),
  correlationId: z.uuid().optional(),
});

export const Ev2VisualBranchSchema = z.object({
  id: z.uuid(),
  itemId: z.uuid(),
  branchKey: z.string(),
  status: z.enum(["draft", "submitted", "abandoned"]),
  baseRevisionId: z.uuid().nullable(),
  lockVersion: z.number().int().positive(),
  documentVersion: z.number().int().positive(),
  documentHash: z.string().regex(/^[0-9a-f]{64}$/),
  updatedAt: z.string(),
});

export const Ev2VisualDocumentResultSchema = z.object({
  schemaVersion: z.literal(1),
  branch: Ev2VisualBranchSchema,
  document: Ev2VisualDocumentSchema,
  snapshots: z.array(
    z.object({
      id: z.uuid(),
      breakpoint: Ev2VisualBreakpointSchema,
      sourceVersion: z.number().int().positive(),
      snapshotHash: z.string().regex(/^[0-9a-f]{64}$/),
      createdAt: z.string(),
    }),
  ),
  correlationId: z.uuid(),
});

export const Ev2VisualBranchListResultSchema = z.object({
  schemaVersion: z.literal(1),
  branches: z.array(Ev2VisualBranchSchema),
  correlationId: z.uuid(),
});

export const Ev2VisualMutationResultSchema = z.object({
  schemaVersion: z.literal(1),
  branchId: z.uuid(),
  status: z.enum(["draft", "submitted", "abandoned"]),
  branchLockVersion: z.number().int().positive().optional(),
  documentVersion: z.number().int().positive(),
  documentHash: z.string().regex(/^[0-9a-f]{64}$/),
  draftLockVersion: z.number().int().positive().optional(),
  snapshotGroupId: z.uuid().optional(),
  snapshotCount: z.literal(3).optional(),
  symbolId: z.uuid().optional(),
  published: z.literal(false).optional(),
  correlationId: z.uuid(),
  replayed: z.boolean(),
});

export const Ev2SiteSummarySchema = z.object({
  id: z.uuid(),
  key: Ev2SiteKeySchema,
  name: z.string(),
  purpose: z.string(),
  status: z.enum(["pilot", "active", "suspended", "archived"]),
  lockVersion: z.number().int().positive(),
  primary: z.boolean(),
  synthetic: z.boolean(),
  defaultLanguage: z.string(),
  timezone: z.string(),
  environments: z.array(
    z.object({ id: z.uuid(), key: Ev2VisualEnvironmentSchema, status: z.enum(["active", "locked"]) }),
  ),
  domains: z.array(
    z.object({
      id: z.uuid(),
      environment: Ev2VisualEnvironmentSchema,
      hostname: z.string(),
      status: z.string(),
    }),
  ),
  themeKey: z.string().nullable(),
});

export const Ev2SiteRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  sites: z.array(Ev2SiteSummarySchema),
  multisiteOperational: z.literal(false),
  productionEnabled: z.literal(false),
  correlationId: z.uuid(),
});

export const Ev2SitesCapabilityResultSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  source: z.string(),
  siteKey: Ev2SiteKeySchema,
  environment: Ev2VisualEnvironmentSchema,
  multisiteOperational: z.literal(false),
  productionEnabled: z.literal(false),
  correlationId: z.uuid().optional(),
});

export const Ev2SiteMutationResultSchema = z.object({
  schemaVersion: z.literal(1),
  siteId: z.uuid(),
  siteKey: Ev2SiteKeySchema,
  status: z.enum(["pilot", "active", "suspended", "archived"]),
  lockVersion: z.number().int().positive(),
  productionEnabled: z.literal(false),
  multisiteOperational: z.literal(false),
  domainId: z.uuid().nullable().optional(),
  tokenVersion: z.number().int().positive().nullable().optional(),
  correlationId: z.uuid(),
  replayed: z.boolean(),
});

export type Ev2VisualDocument = z.infer<typeof Ev2VisualDocumentSchema>;
export type Ev2VisualComponentKey = z.infer<typeof Ev2VisualComponentKeySchema>;
export type Ev2VisualCatalog = z.infer<typeof Ev2VisualCatalogSchema>;
export type Ev2VisualBranch = z.infer<typeof Ev2VisualBranchSchema>;
export type Ev2VisualDocumentResult = z.infer<typeof Ev2VisualDocumentResultSchema>;
export type Ev2SiteRegistry = z.infer<typeof Ev2SiteRegistrySchema>;
export type Ev2SiteSummary = z.infer<typeof Ev2SiteSummarySchema>;
