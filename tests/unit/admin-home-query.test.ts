import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("consultas do painel administrativo", () => {
  it("usa o timestamp canônico da trilha de auditoria", async () => {
    const source = await readFile("src/admin/pages/AdminHomePage.tsx", "utf8");

    expect(source).toContain('.select("id,action,target_type,target_id,occurred_at")');
    expect(source).toContain('.order("occurred_at", { ascending: false })');
    expect(source).not.toContain("cms_audit_log.created_at");
  });

  it("não classifica eventos informativos como alertas abertos", async () => {
    const source = await readFile("src/admin/pages/AdminHomePage.tsx", "utf8");

    expect(source).toMatch(
      /from\("cms_operational_events"\)[\s\S]*?\.eq\("severity", "critical"\)[\s\S]*?\.is\("resolved_at", null\)/,
    );
  });
});
