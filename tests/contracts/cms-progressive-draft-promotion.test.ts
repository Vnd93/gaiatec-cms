import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Ev2DraftCommandResultSchema, Ev2DraftCommandSchema } from "../../src/shared/contracts/ev2-draft";
import { comprehensiveProductPayload } from "../fixtures/product-payload";

const migration = readFileSync("supabase/migrations/0079_cms_progressive_draft_atomic_promotion.sql", "utf8");
const edge = readFileSync("supabase/functions/cms-drafts-v2/index.ts", "utf8");
const hook = readFileSync("src/admin/hooks/useProgressiveDraftAutosave.ts", "utf8");
const editor = readFileSync("src/admin/pages/AdminProductEditorPage.tsx", "utf8");
const pgTap = readFileSync("supabase/tests/rls_cms_progressive_draft_promotion.test.sql", "utf8");

const envelope = {
  schemaVersion: 1 as const,
  commandId: "79000000-0000-4000-8000-000000000001",
  correlationId: "79000000-0000-4000-8000-000000000002",
  occurredAt: "2026-09-07T12:00:00.000Z",
  actorContext: { environment: "staging" as const, siteKey: "main" },
  expectedVersion: 2,
};

describe("atomic promotion of progressive drafts", () => {
  it("accepts a complete product promotion and requires optimistic concurrency", () => {
    const command = Ev2DraftCommandSchema.parse({
      action: "promote",
      envelope,
      draftId: "79000000-0000-4000-8000-000000000003",
      slug: "qa-cms-final-produto",
      payload: comprehensiveProductPayload(),
      reason: "Concluir cadastro sintético homologado",
    });
    expect(command.action).toBe("promote");
    if (command.action !== "promote") throw new Error("promotion command expected");
    expect(command.payload.contentType).toBe("product");
    expect(
      Ev2DraftCommandSchema.safeParse({
        ...command,
        envelope: { ...envelope, expectedVersion: undefined },
      }).success,
    ).toBe(false);
  });

  it("models the promoted receipt without exposing the progressive payload", () => {
    expect(
      Ev2DraftCommandResultSchema.parse({
        schemaVersion: 1,
        commandId: envelope.commandId,
        correlationId: envelope.correlationId,
        draftId: "79000000-0000-4000-8000-000000000003",
        status: "promoted",
        lockVersion: 3,
        savedAt: "2026-09-07T12:01:00.000Z",
        itemId: "79000000-0000-4000-8000-000000000004",
        replayed: false,
      }).status,
    ).toBe("promoted");
  });

  it("normalizes governed product references before the single promotion RPC", () => {
    expect(edge).toContain('command.action === "promote"');
    expect(edge).toContain('"cms_normalize_controlled_payload_scoped"');
    expect(edge).toContain('"cms_promote_draft_v2_to_content"');
    expect(edge).toContain("preserved: true");
    expect(edge).not.toMatch(/effectiveCommand\.action === "promote"[\s\S]*editorialCommand\(/);
  });

  it("creates canonical content and closes the shadow draft in one database transaction", () => {
    expect(migration).toContain("v_editorial := public.cms_execute_editorial_command(");
    expect(migration).toMatch(
      /v_editorial := public\.cms_execute_editorial_command\([\s\S]+update public\.cms_content_drafts_v2[\s\S]+set status = 'promoted'/,
    );
    expect(migration).toContain("promoted_item_id = v_item_id");
    expect(migration).toContain("event_type, from_version, to_version");
    expect(migration).toContain("'cms:drafts_v2.promote'");
    expect(migration).not.toMatch(/\bcommit\s*;/i);
  });

  it("keeps the RPC behind the service role and preserves idempotency", () => {
    expect(migration).toContain("CMS_DRAFT_V2_IDEMPOTENCY_CONFLICT");
    expect(migration).toContain("return v_receipt.response || jsonb_build_object('replayed', true)");
    expect(migration).toMatch(
      /revoke all on function public\.cms_promote_draft_v2_to_content\([\s\S]+from public, anon, authenticated;[\s\S]+grant execute[\s\S]+to service_role;/,
    );
  });

  it("allows production drafts only through the individual AAL2 rollout boundary", () => {
    expect(migration).toContain("check (environment in ('local', 'staging', 'production'))");
    expect(migration).toContain("p_environment = 'production' and p_aal <> 'aal2'");
    expect(migration).toContain("override.expires_at - override.starts_at <= interval '30 minutes'");
    expect(migration).toContain("v_individual_override_count <> 1 or v_broad_override_count <> 0");
  });

  it("promotes only after a successful flush and navigates to the canonical item", () => {
    expect(hook).toContain('action: "promote"');
    expect(hook).toContain("if (!result.itemId)");
    expect(editor).toMatch(
      /const synced = await progressiveDraft\.flush\(\);[\s\S]+const promotedItemId = await progressiveDraft\.promote/,
    );
    expect(editor).toContain("navigate(`/admin/produtos/${promotedItemId}`");
    expect(editor).toContain("Rascunho incompleto salvo de forma privada");
  });

  it("backs success, rollback, authorization, replay and production gates with pgTAP", () => {
    for (const evidence of [
      "promotion creates the canonical item and closes the shadow draft atomically",
      "a failed promotion leaves the progressive draft active",
      "a failed promotion leaves no canonical item behind",
      "a support actor with flag-read access but no editorial permission cannot promote a progressive draft",
      "an identical retry replays the original promotion receipt",
      "production progressive drafts reject an AAL1 session",
      "a broad production override fails closed",
      "one short individual production override enables the AAL2 operator",
      "an authenticated client cannot call the promotion RPC directly",
    ]) {
      expect(pgTap).toContain(evidence);
    }
    expect(pgTap).toContain("select * from finish()");
    expect(pgTap).toContain("rollback;");
  });
});
