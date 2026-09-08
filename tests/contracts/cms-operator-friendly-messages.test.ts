import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");

const commonOperationalPages = [
  "src/admin/pages/AdminEditorPage.tsx",
  "src/admin/pages/AdminDiscoveryPage.tsx",
  "src/admin/pages/AdminCampaignEditorPage.tsx",
  "src/admin/pages/AdminPageBuilderPage.tsx",
  "src/admin/pages/AdminSiteConfigurationPage.tsx",
  "src/admin/pages/AdminBulkImportPage.tsx",
  "src/admin/pages/AdminFormsPage.tsx",
  "src/admin/pages/AdminLeadsPage.tsx",
  "src/admin/pages/AdminMasterDataPage.tsx",
  "src/admin/pages/AdminSitesPage.tsx",
  "src/admin/pages/AdminControlledVocabulariesPage.tsx",
] as const;

const centrallyGuardedErrorSinks = [
  "src/admin/components/DamPicker.tsx",
  "src/admin/components/ScopedAccessPanel.tsx",
  "src/admin/pages/AdminBulkImportPage.tsx",
  "src/admin/pages/AdminMediaPage.tsx",
  "src/admin/pages/AdminWorkPage.tsx",
  "src/admin/pages/AdminAiAssistantPage.tsx",
  "src/admin/pages/AdminLeadsPage.tsx",
  "src/admin/pages/AdminSitesPage.tsx",
  "src/admin/pages/AdminUsersPage.tsx",
] as const;

function source(relativePath: string) {
  return readFileSync(resolve(repositoryRoot, relativePath), "utf8");
}

describe("mensagens operacionais amigáveis", () => {
  it.each(commonOperationalPages)("não expõe correlação ou código técnico em %s", (relativePath) => {
    const page = source(relativePath);
    expect(page).not.toMatch(/correlationId\.slice\s*\(/);
    expect(page).not.toMatch(/Código (?:de acompanhamento|de auditoria|técnico)\s*[:${]/i);
    expect(page).not.toMatch(/Correlação\s*[:${]/i);
  });

  it("gera referências da assistente internamente e mostra somente rótulos humanos", () => {
    const assistant = source("src/admin/pages/AdminAiAssistantPage.tsx");
    const execution = source("src/admin/pages/AdminAiExecutionPage.tsx");

    expect(assistant).toContain("internalAssistantReference");
    expect(assistant).not.toMatch(/Referência\s*<code>g10x|Referência interna do rascunho/);
    expect(execution).toContain("internalExecutionReference");
    expect(execution).not.toMatch(/Referência g14x|step\.toolKey\}\s*·\s*\{step\.targetRef/);
    expect(execution).not.toMatch(/espera v\{step\.expectedVersion\}|shortHash\(selectedPlan\.planHash\)/);
    expect(execution).not.toMatch(/Correlação:\s*\$\{result\.correlationId\}/);
    expect(execution).toContain("versão conferida automaticamente");
    expect(execution).toContain("plano conferido pelo servidor");
  });

  it("sanitiza a fronteira remota e a janela de preview antes de alcançar a interface", () => {
    const api = source("src/admin/api/cms-api.ts");
    const preview = source("src/admin/open-external-preview.ts");

    expect(api).toContain('operatorErrorMessage(message, { source: "remote", status })');
    expect(api).toContain('new CmsApiError("Falha de comunicação com o serviço remoto.", 0, {})');
    expect(preview).toContain("operatorErrorMessage(caught");
    expect(preview).not.toMatch(/body\.textContent\s*=\s*`\$\{caught\.message\}/);
    expect(preview).not.toContain("caught instanceof Error ? caught");
  });

  it("mantém códigos PIM como metadados tipados, não como mensagem ao operador", () => {
    const adapter = source("src/admin/pim-v1-adapter.ts");

    expect(adapter).toContain("class PimProjectionError extends Error");
    expect(adapter).not.toMatch(/throw new Error\(["'`]CMS_PIM_/);
    expect(adapter).not.toMatch(/`CMS_PIM_[A-Z0-9_]+:/);
  });

  it.each(centrallyGuardedErrorSinks)("não envia Error.message bruto à interface em %s", (relativePath) => {
    const page = source(relativePath);

    expect(page).toContain("operatorErrorMessage");
    expect(page).not.toMatch(/caught instanceof Error\s*\?\s*caught\.message/);
    expect(page).not.toMatch(/set(?:Error|Message)\(\s*(?:caught|error)\.message\s*\)/);
  });
});
