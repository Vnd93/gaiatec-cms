import { z } from "zod";

export const Ev2SearchContentTypeSchema = z.enum([
  "product",
  "service",
  "industry",
  "application",
  "solution",
  "post",
  "page",
  "homepage",
]);

export const Ev2SearchFacetSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9]{1,63}$/),
    values: z.array(z.string().min(1).max(160)).max(50),
  })
  .strict();

export const Ev2SearchRangeSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_.-]{1,79}$/),
    min: z.number().finite().optional(),
    max: z.number().finite().optional(),
    unit: z.string().min(1).max(24).optional(),
  })
  .strict()
  .refine((range) => range.min !== undefined || range.max !== undefined, "Informe pelo menos um limite.")
  .refine(
    (range) => range.min === undefined || range.max === undefined || range.min <= range.max,
    "Faixa invertida.",
  );

export const Ev2SearchRequestSchema = z
  .object({
    query: z.string().trim().max(300).default(""),
    contentTypes: z.array(Ev2SearchContentTypeSchema).max(8).default([]),
    facets: z.array(Ev2SearchFacetSchema).max(12).default([]),
    ranges: z.array(Ev2SearchRangeSchema).max(12).default([]),
    limit: z.number().int().min(1).max(100).default(24),
    offset: z.number().int().min(0).max(10_000).default(0),
  })
  .strict();

export const Ev2SearchRuleSchema = z
  .object({
    id: z.string().uuid().optional(),
    kind: z.enum(["pin", "bury", "redirect"]),
    query: z.string().trim().min(1).max(300),
    targetItemId: z.string().uuid().nullable().optional(),
    redirectPath: z
      .string()
      .regex(/^\/[a-z0-9/_-]*$/)
      .nullable()
      .optional(),
    reason: z.string().trim().min(3).max(500),
    owner: z.string().trim().min(2).max(120),
    startsAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((rule) => Date.parse(rule.expiresAt) > Date.parse(rule.startsAt), "Vigência inválida.")
  .refine(
    (rule) => (rule.kind === "redirect" ? Boolean(rule.redirectPath) : Boolean(rule.targetItemId)),
    "Destino obrigatório.",
  );

export const Ev2QualitySeveritySchema = z.enum(["error", "warning", "recommendation"]);
export const Ev2QualityCategorySchema = z.enum(["seo", "accessibility", "links", "media", "content", "pim"]);
export const Ev2QualityFindingSchema = z
  .object({
    ruleKey: z.string().regex(/^[a-z][a-z0-9_.-]{2,119}$/),
    category: Ev2QualityCategorySchema,
    severity: Ev2QualitySeveritySchema,
    fieldPath: z.string().min(1).max(300),
    message: z.string().min(3).max(500),
  })
  .strict();

export const Ev2QualityRunResultSchema = z
  .object({
    schemaVersion: z.literal(1),
    runId: z.string().uuid(),
    itemId: z.string().uuid(),
    rulesetVersion: z.string().regex(/^v\d+$/),
    status: z.enum(["passed", "warning", "blocked"]),
    findings: z.array(Ev2QualityFindingSchema),
    checkedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type Ev2SearchRequest = z.infer<typeof Ev2SearchRequestSchema>;
export type Ev2SearchRule = z.infer<typeof Ev2SearchRuleSchema>;
export type Ev2QualityFinding = z.infer<typeof Ev2QualityFindingSchema>;
