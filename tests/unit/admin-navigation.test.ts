import { describe, expect, it } from "vitest";
import {
  adminNavigation,
  canAccessNavigationItem,
  globalSearchTarget,
  isNavigationItemActive,
  resolveAdminBreadcrumbs,
} from "@/admin/admin-navigation";

function item(label: string) {
  const found = adminNavigation.flatMap((group) => group.items).find((entry) => entry.label === label);
  if (!found) throw new Error(`Item não encontrado: ${label}`);
  return found;
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
});
