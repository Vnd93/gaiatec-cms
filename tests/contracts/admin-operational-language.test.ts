import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

describe("linguagem operacional das áreas administrativas", () => {
  it("traduz situações editoriais nas listas de conteúdo e produtos", () => {
    const content = source("src/admin/pages/AdminContentPage.tsx");
    const products = source("src/admin/pages/AdminProductsPage.tsx");

    expect(content).toContain("contentStatusLabel(item.workflow_status)");
    expect(content).toContain("contentStatusLabel(selected?.workflow_status)");
    expect(content).not.toContain("{item.workflow_status}");
    expect(content).not.toContain('workflow_status.replaceAll("_", " ")');

    expect(products).toContain("productStatusLabel(item.workflow_status)");
    expect(products).toContain("productStatusLabel(selected?.workflow_status)");
    expect(products).not.toMatch(/CATÁLOGO CLEAN-ROOM|workflow_status\.replace/);
  });

  it("não mostra enums, ambiente, fornecedor ou unidade de custo internos na assistente", () => {
    const assistant = source("src/admin/pages/AdminAiAssistantPage.tsx");

    expect(assistant).toContain("sessionStatusLabel(item.status)");
    expect(assistant).toContain("proposalKindLabel(proposal.kind)");
    expect(assistant).toContain("proposalStatusLabel(proposal.status)");
    expect(assistant).toContain("environmentLabels[CMS_ENVIRONMENT]");
    expect(assistant).toContain("operatorErrorMessage");
    expect(assistant).not.toMatch(/\{item\.status\}|\{proposal\.kind\}|\{proposal\.status\}/);
    expect(assistant).not.toMatch(
      /EV2\.10|canary individual|NVIDIA NEMOTRON|via OpenRouter| tokens|\} µ|Diff proposto/,
    );
  });

  it("mantém leads e sites em linguagem humana e protege mensagens remotas", () => {
    const leads = source("src/admin/pages/AdminLeadsPage.tsx");
    const sites = source("src/admin/pages/AdminSitesPage.tsx");

    expect(leads).toContain("operatorErrorMessage");
    expect(leads).toContain('return "Outra informação"');
    expect(leads).not.toMatch(/caught instanceof Error\s*\?\s*caught\.message/);
    expect(leads).not.toMatch(/Entrega e resiliência|recolocada na fila|MFA, idempotência|<th>SLA<\/th>/);

    expect(sites).toContain("operatorErrorMessage");
    expect(sites).not.toMatch(/caught instanceof Error\s*\?\s*caught\.message/);
    expect(sites).not.toMatch(/capacidade multisite|preparação multisite|exige MFA/);
  });

  it("traduz ações, áreas, papéis e permissões desconhecidas com fallback fechado", () => {
    const audit = source("src/admin/pages/AdminAuditPage.tsx");
    const home = source("src/admin/pages/AdminHomePage.tsx");
    const profile = source("src/admin/pages/AdminProfilePage.tsx");
    const users = source("src/admin/pages/AdminUsersPage.tsx");

    expect(audit).toContain("auditActionLabel(item.action)");
    expect(audit).toContain("auditAreaLabel(areaFor(item.action))");
    expect(audit).not.toContain('item.action.replaceAll(/[.:_-]+/g, " ")');
    expect(home).toContain("activityActionLabel(item.action)");
    expect(home).not.toContain("humanLabel(item.target_type)");
    expect(profile).toContain('permissionAreaLabels[area] ?? "Outra área administrativa"');
    expect(profile).toContain('roleLabels[role] ?? "Papel não reconhecido"');
    expect(users).toContain('roleLabels[role] ?? "Papel não reconhecido"');
    expect(users).toContain("operatorErrorMessage");
    expect(users).not.toMatch(/caught instanceof Error\s*\?\s*caught\.message/);
  });
});
