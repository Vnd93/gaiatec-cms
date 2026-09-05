import { SUPABASE_URL } from "@/lib/supabase";

// Adaptador isolado do CMS retirado. Somente páginas públicas ainda sem
// substituição clean-room podem importá-lo durante a retenção transitória.
const API_BASE = `${SUPABASE_URL}/functions/v1/site-content`;

export async function fetchSiteContent<T = unknown>(params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString();
  const response = await fetch(`${API_BASE}?${qs}`);
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Erro ao buscar conteúdo");
  return json as T;
}

export async function fetchConteudo(grupo: string): Promise<Record<string, string>> {
  const items = await fetchSiteContent<Array<{ chave: string; valor: string }>>({
    type: "conteudo",
    grupo,
  });
  return Object.fromEntries(items.map((item) => [item.chave, item.valor]));
}

export interface SiteMenuItem {
  id: string;
  parent_id: string | null;
  label: string;
  href: string | null;
  ordem: number;
  abrir_nova_aba: boolean;
  icone: string | null;
  children?: SiteMenuItem[];
}

export async function fetchMenu(): Promise<SiteMenuItem[]> {
  return fetchSiteContent<SiteMenuItem[]>({ type: "menu" });
}

export interface SiteBloco<T = Record<string, unknown>> {
  id: string;
  tipo: string;
  nome: string | null;
  dados: T;
  ordem: number;
}

export interface SitePagina {
  id: string;
  slug: string;
  titulo: string;
  descricao: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_image_url: string | null;
  publicada: boolean;
}

export interface PaginaResponse {
  pagina: SitePagina;
  blocos: SiteBloco[];
}

export async function fetchPagina(slug: string): Promise<PaginaResponse> {
  return fetchSiteContent<PaginaResponse>({ type: "pagina", slug });
}
