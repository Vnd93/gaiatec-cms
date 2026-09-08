import { describe, expect, it } from "vitest";
import {
  adminNavigation,
  canAccessAdminRoute,
  canAccessNavigationItem,
  globalSearchTarget,
  isNavigationItemActive,
  resolveAdminBreadcrumbs,
  resolveAdminRouteAccess,
} from "@/admin/admin-navigation";

function item(label: string) {
  const found = adminNavigation.flatMap((group) => group.items).find((entry) => entry.label === label);
  if (!found) throw new Error(`Item não encontrado: ${label}`);
  return found;
}

function groupFor(label: string) {
  const found = adminNavigation.find((group) => group.items.some((entry) => entry.label === label));
  if (!found) throw new Error(`Grupo não encontrado para: ${label}`);
  return found.label;
}

describe("arquitetura de informação administrativa", () => {
  it("expõe somente itens permitidos e mantém perfil disponível a toda sessão ativa", () => {
    expect(canAccessNavigationItem(item("Produtos"), [])).toBe(false);
    expect(canAccessNavigationItem(item("Produtos"), ["cms:products.read"])).toBe(true);
    expect(canAccessNavigationItem(item("Perfil e sessão"), [])).toBe(true);
    expect(canAccessNavigationItem(item("Páginas e homepage"), ["cms:homepage.read"])).toBe(true);
  });

  it("distingue cadastro em massa, editores e seções da estrutura sem alterar rotas", () => {
    expect(isNavigationItemActive(item("Produtos"), "/admin/produtos/123", "")).toBe(true);
    expect(isNavigationItemActive(item("Produtos"), "/admin/produtos/importacao", "")).toBe(false);
    expect(isNavigationItemActive(item("Cadastro em massa"), "/admin/produtos/importacao", "")).toBe(true);
    expect(isNavigationItemActive(item("Dados globais"), "/admin/site", "?section=site_settings")).toBe(true);
    expect(isNavigationItemActive(item("Navegação"), "/admin/site", "?section=site_settings")).toBe(false);
  });

  it("produz breadcrumbs amigáveis sem UUID ou segmentos técnicos", () => {
    const crumbs = resolveAdminBreadcrumbs("/admin/descoberta/service/9586623e-9110-4d17-86d0-f5bdb1dfe353");
    expect(crumbs.map((entry) => entry.label)).toEqual(["Painel", "Serviços", "Editar"]);
    expect(JSON.stringify(crumbs)).not.toContain("9586623e");
    expect(resolveAdminBreadcrumbs("/admin/site", "?section=placement").at(-1)?.label).toBe(
      "Posicionamentos",
    );
  });

  it("direciona a busca apenas para um domínio que o usuário pode consultar", () => {
    expect(globalSearchTarget("sensor gás", ["cms:products.read"])).toBe(
      "/admin/produtos?q=sensor%20g%C3%A1s",
    );
    expect(globalSearchTarget("campanha", ["cms:posts.read"])).toBe("/admin/conteudo?q=campanha");
    expect(globalSearchTarget("restrito", [])).toBe("/admin");
  });

  it("mantém as seis seções e organiza todos os destinos operacionais no primeiro nível", () => {
    const visibleGroups = adminNavigation.filter((group) =>
      group.items.some((entry) => entry.menu !== false),
    );
    expect(visibleGroups.map((group) => group.label)).toEqual([
      "Trabalho",
      "Catálogo",
      "Conteúdo",
      "Marketing",
      "Site",
      "Administração",
    ]);
    expect(
      visibleGroups.flatMap((group) => group.items.filter((entry) => entry.menu !== false)),
    ).toHaveLength(28);
  });

  it.each([
    ["Leads", "cms:leads.read"],
    ["Assistente IA", "cms:ai.read"],
    ["Centro de Qualidade", "cms:quality.read"],
    ["Produtos", "cms:products.read"],
    ["Serviços", "cms:services.read"],
    ["Indústrias", "cms:industries.read"],
    ["Aplicações", "cms:applications.read"],
    ["Soluções", "cms:solutions.read"],
    ["Páginas", "cms:pages.read"],
    ["Editorial", "cms:posts.read"],
    ["Mídia", "cms:media.read"],
    ["Campanhas", "cms:campaigns.read"],
    ["Formulários", "cms:forms.read"],
    ["Navegação", "cms:navigation.read"],
    ["Dados globais", "cms:settings.read"],
    ["Posicionamentos", "cms:placements.read"],
    ["Usuários e acessos", "cms:users.read"],
    ["Auditoria", "cms:audit.read"],
    ["Diagnósticos", "cms:diagnostics.read"],
  ])("%s falha fechado sem %s", (label, permission) => {
    expect(canAccessNavigationItem(item(label), [])).toBe(false);
    expect(canAccessNavigationItem(item(label), [permission])).toBe(true);
  });

  it("posiciona ferramentas avançadas junto do fluxo a que pertencem", () => {
    expect(groupFor("Meu trabalho")).toBe("Trabalho");
    for (const label of [
      "Cadastro em massa",
      "Cadastro técnico",
      "Dados mestres",
      "Listas mestras",
      "Busca e sinônimos",
    ])
      expect(groupFor(label)).toBe("Catálogo");
    expect(groupFor("Estúdio Visual")).toBe("Conteúdo");
    expect(groupFor("Sites e ambientes")).toBe("Site");
  });

  it("nega a URL direta quando a sessão não possui a permissão da rota", () => {
    expect(canAccessAdminRoute("/admin/produtos", "", ["cms:products.read"])).toBe(true);
    expect(canAccessAdminRoute("/admin/usuarios", "", ["cms:products.read"])).toBe(false);
    expect(canAccessAdminRoute("/admin/meu-trabalho", "", ["cms:bulk.read"])).toBe(true);
    expect(canAccessAdminRoute("/admin/meu-trabalho", "", [])).toBe(false);
    expect(canAccessAdminRoute("/admin/site", "?section=site_settings", ["cms:navigation.read"])).toBe(false);
    expect(canAccessAdminRoute("/admin/site", "?section=site_settings", ["cms:settings.read"])).toBe(true);
    expect(resolveAdminRouteAccess("/admin/site", "")?.permissions).toEqual(["cms:navigation.read"]);
    expect(canAccessAdminRoute("/admin/auditoria", "", ["cms:diagnostics.read"])).toBe(false);
    expect(canAccessAdminRoute("/admin/auditoria", "", ["cms:audit.read"])).toBe(true);
  });

  it.each([
    ["/admin/meu-trabalho", "", "cms:collaboration.read"],
    ["/admin/leads", "", "cms:leads.read"],
    ["/admin/assistente/execucao", "", "cms:ai.read"],
    ["/admin/qualidade", "", "cms:quality.read"],
    ["/admin/produtos/00000000-0000-4000-8000-000000000001", "", "cms:products.read"],
    ["/admin/produtos/importacao", "", "cms:products.edit"],
    ["/admin/pim", "", "cms:pim.read"],
    ["/admin/dados-mestres", "", "cms:masterdata.read"],
    ["/admin/descoberta/service/00000000-0000-4000-8000-000000000001", "", "cms:services.read"],
    ["/admin/descoberta/industry", "", "cms:industries.read"],
    ["/admin/descoberta/application", "", "cms:applications.read"],
    ["/admin/descoberta/solution", "", "cms:solutions.read"],
    ["/admin/listas-mestras", "", "cms:vocabularies.read"],
    ["/admin/busca", "", "cms:search.read"],
    ["/admin/paginas/00000000-0000-4000-8000-000000000001", "", "cms:pages.read"],
    ["/admin/estudio-visual/00000000-0000-4000-8000-000000000001", "", "cms:visual.read"],
    ["/admin/conteudo/00000000-0000-4000-8000-000000000001", "", "cms:posts.read"],
    ["/admin/midia", "", "cms:media.read"],
    ["/admin/marketing/campanhas/00000000-0000-4000-8000-000000000001", "", "cms:campaigns.read"],
    ["/admin/marketing/formularios", "", "cms:forms.read"],
    ["/admin/site", "?section=navigation", "cms:navigation.read"],
    ["/admin/site", "?section=site_settings", "cms:settings.read"],
    ["/admin/site", "?section=placement", "cms:placements.read"],
    ["/admin/sites", "", "cms:sites.read"],
    ["/admin/usuarios", "", "cms:users.read"],
    ["/admin/auditoria", "", "cms:audit.read"],
    ["/admin/diagnosticos", "", "cms:diagnostics.read"],
  ])("classifica a rota protegida %s", (pathname, search, permission) => {
    expect(resolveAdminRouteAccess(pathname, search)?.permissions).toContain(permission);
  });
});
