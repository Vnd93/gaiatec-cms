import { describe, expect, it } from "vitest";
import {
  Ev2PermissionEvaluationSchema,
  Ev2PolicyDecisionSchema,
  Ev2RbacCapabilitySchema,
  Ev2RbacEnvelopeSchema,
  Ev2ScopeCommandResultSchema,
} from "@/shared/contracts/ev2-rbac";

const id = "48000000-0000-4000-8000-000000000001";

describe("EV2 scoped RBAC contracts", () => {
  it("accepts an individual capability result", () => {
    expect(
      Ev2RbacCapabilitySchema.parse({
        schemaVersion: 1,
        key: "ev2.rbac_scoped",
        enabled: true,
        source: "user_override",
        reasonCode: "enabled",
        environment: "staging",
        siteKey: "main",
        evaluatedAt: "2026-09-03T12:00:00.000Z",
        correlationId: id,
      }).enabled,
    ).toBe(true);
  });

  it("rejects an envelope with an implicit or extended scope", () => {
    const base = {
      schemaVersion: 1,
      commandId: id,
      correlationId: "48000000-0000-4000-8000-000000000002",
      occurredAt: "2026-09-03T12:00:00.000Z",
      actorContext: { environment: "staging", siteKey: "main" },
    };
    expect(Ev2RbacEnvelopeSchema.safeParse(base).success).toBe(true);
    expect(
      Ev2RbacEnvelopeSchema.safeParse({ ...base, actorContext: { ...base.actorContext, tenantId: id } })
        .success,
    ).toBe(false);
    expect(
      Ev2RbacEnvelopeSchema.safeParse({ ...base, actorContext: { environment: "qa", siteKey: "main" } })
        .success,
    ).toBe(false);
  });

  it("keeps denied decisions explicit and correlated", () => {
    const decision = Ev2PermissionEvaluationSchema.parse({
      schemaVersion: 1,
      decisionId: id,
      allowed: false,
      reasonCode: "permission_missing",
      roleKey: null,
      scopeSource: "none",
      environment: "staging",
      siteKey: "main",
      correlationId: "48000000-0000-4000-8000-000000000003",
      evaluatedAt: "2026-09-03T12:00:00.000Z",
    });
    expect(decision).toMatchObject({ allowed: false, reasonCode: "permission_missing" });
  });

  it("accepts an unknown permission as auditable input without accepting a malformed key", () => {
    const base = {
      id,
      actorId: id,
      permissionKey: "cms:synthetic_unknown.execute",
      decision: "deny",
      reasonCode: "permission_unknown",
      roleKey: null,
      scopeSource: "none",
      aal: "aal2",
      targetType: "administrative_screen",
      targetId: "g8-negative",
      correlationId: "48000000-0000-4000-8000-000000000004",
      occurredAt: "2026-09-03T12:00:00.000Z",
    };
    expect(Ev2PolicyDecisionSchema.safeParse(base).success).toBe(true);
    expect(Ev2PolicyDecisionSchema.safeParse({ ...base, permissionKey: "admin:*" }).success).toBe(false);
  });

  it("requires a positive optimistic version in mutation results", () => {
    const base = {
      schemaVersion: 1,
      commandId: id,
      correlationId: "48000000-0000-4000-8000-000000000005",
      assignmentId: "48000000-0000-4000-8000-000000000006",
      userId: "48000000-0000-4000-8000-000000000007",
      roleKey: "editor",
      siteKey: "main",
      environment: "staging",
      grantType: "direct",
      status: "active",
      expiresAt: null,
      lockVersion: 1,
      duplicate: false,
    };
    expect(Ev2ScopeCommandResultSchema.safeParse(base).success).toBe(true);
    expect(Ev2ScopeCommandResultSchema.safeParse({ ...base, lockVersion: 0 }).success).toBe(false);
  });
});
