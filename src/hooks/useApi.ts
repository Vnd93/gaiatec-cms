import { useState, useEffect } from 'react';

const API_BASE = 'https://pbmyttjnqijdbscrjayk.supabase.co/functions/v1';

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ?? json;
  } catch {
    return null;
  }
}

// ---- Types matching the API response ----

export interface ApiServico {
  slug: string;
  titulo: string;
  overline: string | null;
  descricao_curta: string | null;
  imagem_url: string | null;
  destaque: boolean;
  ordem: number;
}

export interface ApiSetor {
  slug: string;
  titulo: string;
  overline: string | null;
  descricao_curta: string | null;
  imagem_url: string | null;
  destaque: boolean;
  ordem: number;
}

export interface ApiPost {
  slug: string;
  titulo: string;
  resumo: string | null;
  imagem_url: string | null;
  tags: string[] | null;
  publicado_em: string | null;
  destaque: boolean;
  autor_nome: string | null;
  categoria_nome: string | null;
  categoria_slug: string | null;
  categoria_cor: string | null;
}

export interface ApiProduto {
  slug: string;
  nome: string;
  titulo_site: string | null;
  descricao_curta: string | null;
  imagem_principal: string | null;
  categorias_site: string[] | null;
  tipo: string | null;
}

// ---- Hooks ----

export function useServicos() {
  const [data, setData] = useState<ApiServico[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<ApiServico[]>(`${API_BASE}/site-content?type=servicos`).then(result => {
      if (result) setData(result);
      setLoading(false);
    });
  }, []);

  return { servicos: data, loading };
}

export function useSetores() {
  const [data, setData] = useState<ApiSetor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<ApiSetor[]>(`${API_BASE}/site-content?type=setores`).then(result => {
      if (result) setData(result);
      setLoading(false);
    });
  }, []);

  return { setores: data, loading };
}

export function usePosts() {
  const [data, setData] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<ApiPost[]>(`${API_BASE}/site-content?type=posts`).then(result => {
      if (result) setData(result);
      setLoading(false);
    });
  }, []);

  return { posts: data, loading };
}

export function useProdutos() {
  const [data, setData] = useState<ApiProduto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<ApiProduto[]>(`${API_BASE}/catalogo-publico`).then(result => {
      if (result) setData(result);
      setLoading(false);
    });
  }, []);

  return { produtos: data, loading };
}
