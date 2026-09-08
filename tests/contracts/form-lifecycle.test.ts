import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("contrato de retirada de formulários", () => {
  it("expõe somente comandos estritos com lock, motivo e idempotência", async () => {
    const source = await readFile("supabase/functions/cms-leads/index.ts", "utf8");

    expect(source).toContain('action:z.literal("archive_form")');
    expect(source).toContain('action:z.literal("restore_form")');
    expect(source).toContain("expectedLockVersion:z.number().int().positive()");
    expect(source).toContain('rpc("cms_execute_form_lifecycle_command_scoped"');
    expect(source).toContain("p_environment:environment");
    expect(source).toContain("p_idempotency_key:idempotencyKey");
    expect(source).toContain("p_request_hash:await sha256(JSON.stringify(input))");
    expect(source).toContain("p_expected_lock_version:input.expectedLockVersion");
  });

  it("preserva histórico, bloqueia captura retirada e exige a permissão crítica", async () => {
    const migration = await readFile("supabase/migrations/0058_cms_form_lifecycle.sql", "utf8");

    expect(migration).toContain("p_actor_id, 'cms:forms.publish'");
    expect(migration).toContain("set status = 'retired', active_version_id = null");
    expect(migration).toContain("'cms:form.archive'");
    expect(migration).toContain("'cms:form.restore'");
    expect(migration).toContain("CMS_FORM_VERSION_CONFLICT");
    expect(migration).toContain("CMS_FORM_IDEMPOTENCY_CONFLICT");
    expect(migration).toMatch(
      /revoke all on function public\.cms_execute_form_lifecycle_command\([\s\S]+?\) from public, anon, authenticated;/,
    );
  });
});
