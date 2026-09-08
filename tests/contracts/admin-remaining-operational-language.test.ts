import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "../..");
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), "utf8");

describe("linguagem operacional das superfícies administrativas restantes", () => {
  it("traduz a situação das campanhas sem renderizar o enum editorial", () => {
    const marketing = source("src/admin/pages/AdminMarketingPage.tsx");

    expect(marketing).toContain("campaignStatusLabel(item.workflow_status)");
    expect(marketing).toContain("campaignStatusLabel(selected?.workflow_status)");
    expect(marketing).not.toContain("{item.workflow_status}");
    expect(marketing).not.toContain('workflow_status.replaceAll("_", " ")');
    expect(marketing).not.toMatch(/landing pages|tracking consentido|Título ou URL/);
  });

  it("protege as mensagens de autenticação e usa linguagem compreensível", () => {
    const login = source("src/admin/pages/LoginPage.tsx");
    const mfa = source("src/admin/pages/MfaPage.tsx");
    const guard = source("src/admin/auth/RequireAdminAuth.tsx");

    expect(login).toContain("operatorErrorMessage(result.error");
    expect(mfa).toContain("operatorErrorMessage(result.error");
    expect(login).not.toContain("setError(result.error)");
    expect(mfa).not.toContain("setError(result.error)");
    expect(mfa).not.toMatch(/Este perfil exige MFA|Confirmar segundo fator|QR Code/);
    expect(guard).not.toContain("Confirmando sessão, MFA");
  });

  it("separa a leitura operacional dos detalhes técnicos de diagnóstico", () => {
    const diagnostics = source("src/admin/pages/AdminDiagnosticsPage.tsx");

    expect(diagnostics).toContain("operationalEventLabel(event.event_type)");
    expect(diagnostics).toContain("<summary>Detalhes para suporte</summary>");
    expect(diagnostics).toContain('checkLabels[key] ?? "Verificação não reconhecida"');
    expect(diagnostics).not.toContain("<strong>{event.event_type}</strong>");
    expect(diagnostics).not.toContain("checkLabels[check.key] ?? check.key");
    expect(diagnostics).not.toMatch(/EV2\.11|G11|Filas transacionais|<th>Acionáveis<\/th>/);
  });

  it("mantém modelos e atributos em controles semânticos e mensagens seguras", () => {
    const models = source("src/admin/components/ProductModelsEditor.tsx");
    const semantic = source("src/admin/components/ProductSemanticEditors.tsx");

    expect(models).toContain("Código comercial do modelo");
    expect(models).toContain("Situação do modelo");
    expect(models).not.toMatch(/>SKU<|placeholder="SKU|\bMPN\b/);
    expect(semantic).toContain("operatorErrorMessage(catalogError");
    expect(semantic).not.toMatch(/identidades internas|valores tipados|Mudança permanente \(301\)/);
  });

  it("usa seleção fechada para categoria e não exibe chaves internas nas listas mestras", () => {
    const discovery = source("src/admin/components/DiscoveryContentEditor.tsx");
    const vocabularies = source("src/admin/pages/AdminControlledVocabulariesPage.tsx");

    expect(discovery).toContain("activeServiceKindOptions.find");
    expect(discovery).not.toContain('list="service-kind-options"');
    expect(discovery).not.toMatch(/Busca, CTA e SEO|sustentam o workflow|Estado de governança/);
    expect(discovery).not.toContain("approvalLabels[key] ?? key");
    expect(vocabularies).toContain("operatorErrorMessage(caught");
    expect(vocabularies).not.toMatch(/caught instanceof Error\s*\?\s*caught\.message/);
    expect(vocabularies).not.toContain("<td>{option.slug}</td>");
  });
});
