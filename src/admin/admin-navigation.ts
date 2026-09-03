import type { LucideIcon } from "lucide-react";
import {
  BookOpenText,
  Bot,
  Boxes,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  ContactRound,
  Database,
  FileStack,
  FolderCog,
  FormInput,
  Gauge,
  Image,
  Inbox,
  Layers3,
  LayoutTemplate,
  Megaphone,
  PackageSearch,
  SearchCheck,
  Settings2,
  ShieldCheck,
  UserRound,
  UsersRound,
  Wrench,
} from "lucide-react";

export type AdminNavigationItem = {
  to: string;
  label: string;
  description: string;
  icon: LucideIcon;
  permissions?: string[];
  permissionMode?: "all" | "any";
  candidate?: "visual-studio" | "multisite" | "ai-assist";
  match?: RegExp;
};

export type AdminNavigationGroup = {
  id: string;
  label: string;
  icon: LucideIcon;
  items: AdminNavigationItem[];
};

export const adminNavigation: AdminNavigationGroup[] = [
  {
    id: "painel",
    label: "Painel",
    icon: Gauge,
    items: [
      {
        to: "/admin",
        label: "Visão geral",
        description: "Indicadores, próximas ações e pendências operacionais.",
        icon: ChartNoAxesCombined,
        match: /^\/admin\/?$/,
      },
      {
        to: "/admin/meu-trabalho",
        label: "Meu trabalho",
        description: "Inbox, releases compostos e operações em massa.",
        icon: Inbox,
        permissions: ["cms:collaboration.read", "cms:releases.read", "cms:bulk.read"],
        permissionMode: "any",
        match: /^\/admin\/meu-trabalho(?:\/.*)?$/,
      },
      {
        to: "/admin/assistente",
        label: "Assistente controlada",
        description: "Localize, explique, extraia e prepare propostas com fonte e revisão humana.",
        icon: Bot,
        permissions: ["cms:ai.read"],
        candidate: "ai-assist",
        match: /^\/admin\/assistente(?:\/.*)?$/,
      },
    ],
  },
  {
    id: "conteudo",
    label: "Conteúdo do site",
    icon: Layers3,
    items: [
      {
        to: "/admin/paginas",
        label: "Páginas e homepage",
        description: "Páginas montadas por blocos e homepage.",
        icon: LayoutTemplate,
        permissions: ["cms:pages.read", "cms:homepage.read"],
        match: /^\/admin\/paginas(?:\/.*)?$/,
      },
      {
        to: "/admin/estudio-visual",
        label: "Estúdio Visual",
        description: "Componentes, branches e snapshots responsivos governados.",
        icon: LayoutTemplate,
        permissions: ["cms:visual.read"],
        candidate: "visual-studio",
        match: /^\/admin\/estudio-visual(?:\/.*)?$/,
      },
      {
        to: "/admin/conteudo",
        label: "Conteúdo editorial",
        description: "Artigos, blog e histórico editorial.",
        icon: BookOpenText,
        permissions: ["cms:posts.read"],
        match: /^\/admin\/conteudo(?:\/.*)?$/,
      },
      {
        to: "/admin/descoberta/service",
        label: "Serviços",
        description: "Serviços oferecidos e suas páginas públicas.",
        icon: Wrench,
        permissions: ["cms:services.read"],
        match: /^\/admin\/descoberta\/service(?:\/.*)?$/,
      },
      {
        to: "/admin/descoberta/industry",
        label: "Indústrias",
        description: "Setores e segmentos atendidos.",
        icon: Building2,
        permissions: ["cms:industries.read"],
        match: /^\/admin\/descoberta\/industry(?:\/.*)?$/,
      },
      {
        to: "/admin/descoberta/application",
        label: "Aplicações",
        description: "Cenários de uso das soluções.",
        icon: Boxes,
        permissions: ["cms:applications.read"],
        match: /^\/admin\/descoberta\/application(?:\/.*)?$/,
      },
      {
        to: "/admin/descoberta/solution",
        label: "Soluções",
        description: "Soluções completas e relacionamentos.",
        icon: BriefcaseBusiness,
        permissions: ["cms:solutions.read"],
        match: /^\/admin\/descoberta\/solution(?:\/.*)?$/,
      },
    ],
  },
  {
    id: "catalogo",
    label: "Catálogo",
    icon: PackageSearch,
    items: [
      {
        to: "/admin/produtos",
        label: "Produtos",
        description: "Catálogo, atributos e publicação de produtos.",
        icon: PackageSearch,
        permissions: ["cms:products.read"],
        match: /^\/admin\/produtos(?:\/(?!importacao(?:\/|$)).*)?$/,
      },
      {
        to: "/admin/produtos/importacao",
        label: "Cadastro em massa",
        description: "Validação e criação governada de lotes.",
        icon: FileStack,
        permissions: ["cms:products.edit"],
        match: /^\/admin\/produtos\/importacao(?:\/.*)?$/,
      },
      {
        to: "/admin/pim",
        label: "PIM EV2",
        description: "Produto, modelo, variante, SKU e proveniência normalizados.",
        icon: Boxes,
        permissions: ["cms:pim.read"],
        match: /^\/admin\/pim(?:\/.*)?$/,
      },
      {
        to: "/admin/busca",
        label: "Busca e sinônimos",
        description: "Dicionário, consultas sem resultado e descoberta.",
        icon: SearchCheck,
        permissions: ["cms:search.read"],
        match: /^\/admin\/busca(?:\/.*)?$/,
      },
      {
        to: "/admin/qualidade",
        label: "Centro de Qualidade",
        description: "SEO, acessibilidade, links, mídia, conteúdo e PIM.",
        icon: ShieldCheck,
        permissions: ["cms:quality.read"],
        match: /^\/admin\/qualidade(?:\/.*)?$/,
      },
      {
        to: "/admin/listas-mestras",
        label: "Listas mestras",
        description: "Categorias e classificações padronizadas do CMS.",
        icon: ClipboardList,
        permissions: ["cms:vocabularies.read"],
        match: /^\/admin\/listas-mestras(?:\/.*)?$/,
      },
      {
        to: "/admin/dados-mestres",
        label: "Dados mestres EV2",
        description: "Entidades, aliases e compatibilidades versionadas.",
        icon: Database,
        permissions: ["cms:masterdata.read"],
        match: /^\/admin\/dados-mestres(?:\/.*)?$/,
      },
    ],
  },
  {
    id: "marketing",
    label: "Marketing e relacionamento",
    icon: Megaphone,
    items: [
      {
        to: "/admin/marketing",
        label: "Campanhas e landing pages",
        description: "Campanhas, páginas de destino e posicionamentos.",
        icon: Megaphone,
        permissions: ["cms:campaigns.read"],
        match: /^\/admin\/marketing(?:\/campanhas(?:\/.*)?)?$/,
      },
      {
        to: "/admin/marketing/formularios",
        label: "Formulários",
        description: "Definições versionadas, consentimento e publicação.",
        icon: FormInput,
        permissions: ["cms:forms.read"],
        match: /^\/admin\/marketing\/formularios(?:\/.*)?$/,
      },
      {
        to: "/admin/leads",
        label: "Leads",
        description: "Atendimento, histórico, exportação e anonimização.",
        icon: ContactRound,
        permissions: ["cms:leads.read"],
        match: /^\/admin\/leads(?:\/.*)?$/,
      },
    ],
  },
  {
    id: "estrutura",
    label: "Estrutura e identidade do site",
    icon: FolderCog,
    items: [
      {
        to: "/admin/site?section=navigation",
        label: "Navegação",
        description: "Header, menu móvel, rodapé e hierarquia.",
        icon: ClipboardList,
        permissions: ["cms:navigation.read"],
      },
      {
        to: "/admin/site?section=site_settings",
        label: "Dados globais",
        description: "Empresa, contato, redes sociais e chamada principal.",
        icon: Settings2,
        permissions: ["cms:settings.read"],
      },
      {
        to: "/admin/site?section=placement",
        label: "Posicionamentos",
        description: "Destaques, locais de exibição e vigência.",
        icon: Layers3,
        permissions: ["cms:placements.read"],
      },
      {
        to: "/admin/midia",
        label: "Mídia",
        description: "Imagens, documentos, direitos e usos.",
        icon: Image,
        permissions: ["cms:media.read"],
        match: /^\/admin\/midia(?:\/.*)?$/,
      },
      {
        to: "/admin/sites",
        label: "Sites e ambientes",
        description: "Preparação multisite isolada, sem ativação operacional.",
        icon: Building2,
        permissions: ["cms:sites.read"],
        candidate: "multisite",
        match: /^\/admin\/sites(?:\/.*)?$/,
      },
    ],
  },
  {
    id: "administracao",
    label: "Administração",
    icon: ShieldCheck,
    items: [
      {
        to: "/admin/usuarios",
        label: "Usuários e acessos",
        description: "Usuários, papéis, sessões e permissões.",
        icon: UsersRound,
        permissions: ["cms:users.read"],
        match: /^\/admin\/usuarios(?:\/.*)?$/,
      },
      {
        to: "/admin/perfil",
        label: "Perfil e sessão",
        description: "Identidade, sessão atual e permissões efetivas.",
        icon: UserRound,
        match: /^\/admin\/perfil(?:\/.*)?$/,
      },
      {
        to: "/admin/diagnosticos",
        label: "Diagnósticos",
        description: "Falhas operacionais e códigos de acompanhamento.",
        icon: Gauge,
        permissions: ["cms:diagnostics.read"],
        match: /^\/admin\/diagnosticos(?:\/.*)?$/,
      },
    ],
  },
];

export function canAccessNavigationItem(item: AdminNavigationItem, permissions: readonly string[]): boolean {
  if (!item.permissions?.length) return true;
  return item.permissionMode === "all"
    ? item.permissions.every((permission) => permissions.includes(permission))
    : item.permissions.some((permission) => permissions.includes(permission));
}

export function isNavigationItemActive(item: AdminNavigationItem, pathname: string, search: string): boolean {
  const [targetPath, targetQuery = ""] = item.to.split("?");
  if (targetQuery) return pathname === targetPath && new URLSearchParams(search).toString() === targetQuery;
  return item.match?.test(pathname) ?? pathname === targetPath;
}

export type AdminBreadcrumb = { label: string; to?: string };

export function resolveAdminBreadcrumbs(pathname: string, search = ""): AdminBreadcrumb[] {
  const root: AdminBreadcrumb[] = [{ label: "Painel", to: "/admin" }];
  if (/^\/admin\/?$/.test(pathname)) return [{ label: "Visão geral" }];

  const visibleItem = adminNavigation
    .flatMap((group) => group.items)
    .find((item) => isNavigationItemActive(item, pathname, search));
  if (!visibleItem) return [...root, { label: "Área administrativa" }];

  const crumbs = [...root, { label: visibleItem.label, to: visibleItem.to }];
  const dynamicEditor =
    /^\/admin\/(?:conteudo|paginas|produtos)\/[^/]+$/.test(pathname) ||
    /^\/admin\/estudio-visual\/[^/]+$/.test(pathname) ||
    /^\/admin\/descoberta\/[^/]+\/[^/]+$/.test(pathname) ||
    /^\/admin\/marketing\/campanhas\/[^/]+$/.test(pathname);
  if (dynamicEditor) {
    crumbs[crumbs.length - 1] = { label: visibleItem.label, to: visibleItem.to };
    crumbs.push({ label: pathname.endsWith("/novo") ? "Novo cadastro" : "Editar" });
  } else {
    delete crumbs[crumbs.length - 1].to;
  }
  return crumbs;
}

export function adminPageTitle(pathname: string, search = ""): string {
  const current = resolveAdminBreadcrumbs(pathname, search).at(-1)?.label ?? "CMS";
  return `${current} | CMS GAIATEC`;
}

export function globalSearchTarget(query: string, permissions: readonly string[], unified = false): string {
  const encoded = encodeURIComponent(query.trim());
  if (unified && permissions.includes("cms:search.read")) return `/admin/busca?q=${encoded}`;
  if (permissions.includes("cms:products.read")) return `/admin/produtos?q=${encoded}`;
  if (permissions.includes("cms:posts.read")) return `/admin/conteudo?q=${encoded}`;
  if (permissions.includes("cms:pages.read")) return `/admin/paginas?q=${encoded}`;
  return "/admin";
}

export const administrativeRouteInventory = [
  { surface: "Visão geral", route: "/admin", permission: "sessão CMS ativa" },
  {
    surface: "Meu trabalho",
    route: "/admin/meu-trabalho",
    permission: "cms:collaboration.read, cms:releases.read ou cms:bulk.read",
  },
  {
    surface: "Assistente controlada",
    route: "/admin/assistente",
    permission: "cms:ai.read e override individual EV2.10",
  },
  { surface: "Produtos", route: "/admin/produtos", permission: "cms:products.read" },
  { surface: "Cadastro em massa", route: "/admin/produtos/importacao", permission: "cms:products.edit" },
  { surface: "PIM EV2", route: "/admin/pim", permission: "cms:pim.read" },
  { surface: "Conteúdo editorial", route: "/admin/conteudo", permission: "cms:posts.read" },
  { surface: "Serviços", route: "/admin/descoberta/service", permission: "cms:services.read" },
  { surface: "Indústrias", route: "/admin/descoberta/industry", permission: "cms:industries.read" },
  { surface: "Aplicações", route: "/admin/descoberta/application", permission: "cms:applications.read" },
  { surface: "Soluções", route: "/admin/descoberta/solution", permission: "cms:solutions.read" },
  { surface: "Busca e sinônimos", route: "/admin/busca", permission: "cms:search.read" },
  { surface: "Centro de Qualidade", route: "/admin/qualidade", permission: "cms:quality.read" },
  { surface: "Listas mestras", route: "/admin/listas-mestras", permission: "cms:vocabularies.read" },
  { surface: "Dados mestres EV2", route: "/admin/dados-mestres", permission: "cms:masterdata.read" },
  {
    surface: "Páginas e homepage",
    route: "/admin/paginas",
    permission: "cms:pages.read ou cms:homepage.read",
  },
  { surface: "Estúdio Visual", route: "/admin/estudio-visual/:itemId", permission: "cms:visual.read" },
  { surface: "Campanhas", route: "/admin/marketing", permission: "cms:campaigns.read" },
  { surface: "Formulários", route: "/admin/marketing/formularios", permission: "cms:forms.read" },
  { surface: "Leads", route: "/admin/leads", permission: "cms:leads.read" },
  { surface: "Navegação", route: "/admin/site?section=navigation", permission: "cms:navigation.read" },
  { surface: "Dados globais", route: "/admin/site?section=site_settings", permission: "cms:settings.read" },
  { surface: "Posicionamentos", route: "/admin/site?section=placement", permission: "cms:placements.read" },
  { surface: "Mídia", route: "/admin/midia", permission: "cms:media.read" },
  { surface: "Sites e ambientes", route: "/admin/sites", permission: "cms:sites.read" },
  { surface: "Perfil e sessão", route: "/admin/perfil", permission: "sessão CMS ativa" },
  { surface: "Usuários e acessos", route: "/admin/usuarios", permission: "cms:users.read" },
  { surface: "Diagnósticos", route: "/admin/diagnosticos", permission: "cms:diagnostics.read" },
] as const;
