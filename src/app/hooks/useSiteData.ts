'use client'

import { useState, useEffect } from 'react'
import {
  fetchSiteContent,
  fetchConteudo,
  fetchMenu,
  fetchPagina,
  type SiteMenuItem,
  type PaginaResponse,
} from '../../lib/supabase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HeroSlide {
  label: string
  titulo: string
  descricao: string
  cta_texto: string
  cta_link: string
  imagem: string
}

export interface Servico {
  slug: string
  titulo: string
  overline: string
  descricao_curta: string
  imagem_url: string
  destaque: boolean
  ordem: number
}

export interface ServicoDetail extends Servico {
  descricao_completa: string
  inclui: string[]
  beneficios: string[]
  imagem_hero_url: string
  meta_title: string
  meta_description: string
}

export interface Setor {
  slug: string
  titulo: string
  descricao_curta: string
  imagem_url: string
  ordem: number
}

export interface SetorDetail extends Setor {
  descricao_completa: string
  servicos_relacionados: string[]
  imagem_hero_url: string
  meta_title: string
  meta_description: string
}

export interface BlogPost {
  slug: string
  titulo: string
  resumo: string
  imagem_url: string
  autor: string
  data_publicacao: string
  tags: string[]
}

// ---------------------------------------------------------------------------
// Module-level cache — survives across renders, cleared on page reload
// ---------------------------------------------------------------------------

const cache = new Map<string, unknown>()

// ---------------------------------------------------------------------------
// Generic fetcher helper
// ---------------------------------------------------------------------------

function useCachedFetch<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  fallback: T,
): { data: T; loading: boolean } {
  const cached = cache.get(cacheKey) as T | undefined
  const [data, setData] = useState<T>(cached ?? fallback)
  const [loading, setLoading] = useState(!cached)

  useEffect(() => {
    if (cache.has(cacheKey)) return

    let cancelled = false
    setLoading(true)

    fetcher()
      .then((result) => {
        if (cancelled) return
        cache.set(cacheKey, result)
        setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        console.error(`[useSiteData] ${cacheKey}:`, err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [cacheKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return { data, loading }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/** Fetch hero slides from conteudo_site grupo "home.hero" */
export function useHeroSlides(): { slides: HeroSlide[]; loading: boolean } {
  const FIELDS = ['label', 'titulo', 'descricao', 'cta_texto', 'cta_link', 'imagem'] as const

  const { data, loading } = useCachedFetch<HeroSlide[]>(
    'heroSlides',
    async () => {
      const raw = await fetchConteudo('home.hero')
      // Keys look like: home.hero.slide_1.titulo, home.hero.slide_2.imagem, etc.
      const slideMap = new Map<number, Partial<HeroSlide>>()

      for (const [chave, valor] of Object.entries(raw)) {
        const match = chave.match(/slide_(\d+)\.(\w+)$/)
        if (!match) continue
        const num = parseInt(match[1], 10)
        const field = match[2] as (typeof FIELDS)[number]
        if (!FIELDS.includes(field)) continue

        if (!slideMap.has(num)) slideMap.set(num, {})
        const slide = slideMap.get(num)!
        ;(slide as Record<string, string>)[field] = valor
      }

      return Array.from(slideMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([, s]) => ({
          label: s.label ?? '',
          titulo: s.titulo ?? '',
          descricao: s.descricao ?? '',
          cta_texto: s.cta_texto ?? '',
          cta_link: s.cta_link ?? '',
          imagem: s.imagem ?? '',
        }))
    },
    [],
  )

  return { slides: data, loading }
}

/** Fetch servicos list */
export function useServicos(): { servicos: Servico[]; loading: boolean } {
  const { data, loading } = useCachedFetch<Servico[]>(
    'servicos',
    () => fetchSiteContent<Servico[]>({ type: 'servicos' }),
    [],
  )
  return { servicos: data, loading }
}

/** Fetch single servico by slug */
export function useServico(slug: string): { servico: ServicoDetail | null; loading: boolean } {
  const { data, loading } = useCachedFetch<ServicoDetail | null>(
    `servico:${slug}`,
    () => fetchSiteContent<ServicoDetail>({ type: 'servicos', slug }),
    null,
  )
  return { servico: data, loading }
}

/** Fetch setores list */
export function useSetores(): { setores: Setor[]; loading: boolean } {
  const { data, loading } = useCachedFetch<Setor[]>(
    'setores',
    () => fetchSiteContent<Setor[]>({ type: 'setores' }),
    [],
  )
  return { setores: data, loading }
}

/** Fetch single setor by slug */
export function useSetor(slug: string): { setor: SetorDetail | null; loading: boolean } {
  const { data, loading } = useCachedFetch<SetorDetail | null>(
    `setor:${slug}`,
    () => fetchSiteContent<SetorDetail>({ type: 'setores', slug }),
    null,
  )
  return { setor: data, loading }
}

/** Fetch blog posts */
export function useBlogPosts(): { posts: BlogPost[]; loading: boolean } {
  const { data, loading } = useCachedFetch<BlogPost[]>(
    'blogPosts',
    () => fetchSiteContent<BlogPost[]>({ type: 'posts' }),
    [],
  )
  return { posts: data, loading }
}

/** Fetch conteudo_site by grupo and return as key-value map (legacy) */
export function useConteudo(grupo: string): { data: Record<string, string>; loading: boolean } {
  return useCachedFetch<Record<string, string>>(
    `conteudo:${grupo}`,
    () => fetchConteudo(grupo),
    {},
  )
}

// ---------------------------------------------------------------------------
// CMS v2: menu hierárquico + páginas com blocos
// ---------------------------------------------------------------------------

/** Fetch menu items (hierarquia já em árvore). */
export function useMenu(): { menu: SiteMenuItem[]; loading: boolean } {
  const { data, loading } = useCachedFetch<SiteMenuItem[]>(
    'menu',
    () => fetchMenu(),
    [],
  )
  return { menu: data, loading }
}

/** Fetch página completa (meta + blocos tipados). */
export function usePagina(slug: string): { pagina: PaginaResponse | null; loading: boolean } {
  const { data, loading } = useCachedFetch<PaginaResponse | null>(
    `pagina:${slug}`,
    () => fetchPagina(slug),
    null,
  )
  return { pagina: data, loading }
}
