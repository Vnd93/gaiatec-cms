import { ModuleTabs } from "./AdminUI";

export function ProductModuleTabs() {
  return (
    <ModuleTabs
      label="Ferramentas de produtos"
      items={[
        { label: "Catálogo", to: "/admin/produtos", end: true },
        { label: "Cadastro em massa", to: "/admin/produtos/importacao" },
        { label: "Listas mestras", to: "/admin/listas-mestras" },
        { label: "Busca e sinônimos", to: "/admin/busca" },
      ]}
    />
  );
}

export function DiscoveryModuleTabs({ kind }: { kind: "service" | "industry" | "application" | "solution" }) {
  const definitions = {
    service: ["Catálogo", "Vínculos com produtos", "Listas mestras"],
    industry: ["Setores", "Conteúdo por setor", "Ordem no site"],
    application: ["Aplicações", "Vínculos da aplicação", "Matriz produto × aplicação"],
    solution: ["Soluções", "Composição"],
  } as const;
  return (
    <ModuleTabs
      label="Ferramentas do cadastro"
      items={definitions[kind].map((label, index) => ({
        label,
        to: index === 0 ? `/admin/descoberta/${kind}` : `/admin/descoberta/${kind}?tab=${index}`,
        end: index === 0,
      }))}
    />
  );
}

export function PagesModuleTabs() {
  return (
    <ModuleTabs
      label="Ferramentas de páginas"
      items={[
        { label: "Páginas", to: "/admin/paginas", end: true },
        { label: "Modelos", to: "/admin/paginas?tab=modelos" },
        { label: "Blocos", to: "/admin/paginas?tab=blocos" },
        { label: "Tema do site", to: "/admin/paginas?tab=tema" },
      ]}
    />
  );
}
