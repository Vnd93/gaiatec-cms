import { z } from "zod";

export const Ev2RbacEnvironmentSchema = z.enum(["local", "staging", "production"]);
export const Ev2RoleKeySchema = z.string().regex(/^[a-z][a-z0-9_]{1,63}$/);
export const Ev2PermissionKeySchema = z.string().regex(/^cms:[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);

export const Ev2RbacEnvelopeSchema = z
  .object({
    schemaVersion: z.literal(1),
    commandId: z.uuid(),
    correlationId: z.uuid(),
    occurredAt: z.iso.datetime(),
    actorContext: z
      .object({
        environment: Ev2RbacEnvironmentSchema,
        siteKey: z.literal("main"),
      })
      .strict(),
  })
  .strict();

export const Ev2RbacCapabilitySchema = z.object({
  schemaVersion: z.literal(1),
  key: z.literal("ev2.rbac_scoped"),
  enabled: z.boolean(),
  source: z.string(),
  reasonCode: z.string(),
  environment: Ev2RbacEnvironmentSchema.optional(),
  siteKey: z.literal("main").optional(),
  evaluatedAt: z.string(),
  correlationId: z.uuid(),
});

export const Ev2ScopedRoleAssignmentSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  displayName: z.string(),
  roleKey: Ev2RoleKeySchema,
  siteKey: z.literal("main"),
  environment: Ev2RbacEnvironmentSchema,
  grantType: z.enum(["direct", "delegated"]),
  reason: z.string(),
  validFrom: z.string(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  revocationReason: z.string().nullable(),
  lockVersion: z.number().int().positive(),
  effective: z.boolean(),
  updatedAt: z.string(),
});

export const Ev2RoleCatalogItemSchema = z.object({
  roleKey: Ev2RoleKeySchema,
  name: z.string(),
  description: z.string(),
  mfaRequired: z.boolean(),
  permissions: z.array(Ev2PermissionKeySchema),
});

export const Ev2ScopedRoleListSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(Ev2ScopedRoleAssignmentSchema),
  roles: z.array(Ev2RoleCatalogItemSchema),
  environment: Ev2RbacEnvironmentSchema,
  siteKey: z.literal("main"),
  correlationId: z.uuid(),
});

export const Ev2PolicyDecisionSchema = z.object({
  id: z.uuid(),
  actorId: z.uuid().nullable(),
  permissionKey: Ev2PermissionKeySchema,
  decision: z.enum(["allow", "deny"]),
  reasonCode: z.string(),
  roleKey: Ev2RoleKeySchema.nullable(),
  scopeSource: z.enum(["direct", "delegated", "legacy", "none"]),
  aal: z.enum(["aal1", "aal2"]),
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  correlationId: z.uuid(),
  occurredAt: z.string(),
});

export const Ev2PolicyDecisionListSchema = z.object({
  schemaVersion: z.literal(1),
  items: z.array(Ev2PolicyDecisionSchema),
  environment: Ev2RbacEnvironmentSchema,
  siteKey: z.literal("main"),
  correlationId: z.uuid(),
});

export const Ev2PermissionEvaluationSchema = z.object({
  schemaVersion: z.literal(1),
  decisionId: z.uuid(),
  allowed: z.boolean(),
  reasonCode: z.string(),
  roleKey: Ev2RoleKeySchema.nullable(),
  scopeSource: z.enum(["direct", "delegated", "legacy", "none"]),
  environment: Ev2RbacEnvironmentSchema,
  siteKey: z.literal("main"),
  correlationId: z.uuid(),
  evaluatedAt: z.string(),
});

export const Ev2ScopeCommandResultSchema = z.object({
  schemaVersion: z.literal(1),
  commandId: z.uuid(),
  correlationId: z.uuid(),
  assignmentId: z.uuid(),
  userId: z.uuid(),
  roleKey: Ev2RoleKeySchema,
  siteKey: z.literal("main"),
  environment: Ev2RbacEnvironmentSchema,
  grantType: z.enum(["direct", "delegated"]),
  status: z.enum(["active", "revoked"]),
  expiresAt: z.string().nullable(),
  lockVersion: z.number().int().positive(),
  duplicate: z.boolean(),
});

export type Ev2ScopedRoleAssignment = z.infer<typeof Ev2ScopedRoleAssignmentSchema>;
export type Ev2RoleCatalogItem = z.infer<typeof Ev2RoleCatalogItemSchema>;
export type Ev2PolicyDecision = z.infer<typeof Ev2PolicyDecisionSchema>;
export type Ev2ScopeCommandResult = z.infer<typeof Ev2ScopeCommandResultSchema>;
export type Ev2RbacCapability = z.infer<typeof Ev2RbacCapabilitySchema>;
export type Ev2ScopedRoleList = z.infer<typeof Ev2ScopedRoleListSchema>;
export type Ev2PolicyDecisionList = z.infer<typeof Ev2PolicyDecisionListSchema>;
export type Ev2PermissionEvaluation = z.infer<typeof Ev2PermissionEvaluationSchema>;

export const ev2PolicyReasonLabels: Record<string, string> = {
  allowed: "Permitido pela concessão efetiva",
  feature_disabled: "RBAC escopado desativado",
  mfa_required: "Sessão precisa de MFA",
  permission_missing: "Papel sem esta permissão",
  permission_unknown: "Permissão desconhecida",
  scope_context_ambiguous: "Ativação ampla recusada por segurança",
  scope_environment_mismatch: "Ambiente diferente da concessão",
  scope_missing: "Nenhuma concessão efetiva neste escopo",
  session_invalid: "Sessão inativa ou revogada",
};
