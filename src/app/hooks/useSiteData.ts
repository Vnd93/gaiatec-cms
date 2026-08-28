'use client'

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
// CMS/painel DESCONTINUADO (2026-05-29): o site não usa mais o painel de
// conteúdo. O conteúdo passa a vir SEMPRE do código (fallback hardcoded),
// sem nenhuma requisição ao Supabase — zero erros de console e menos rede.
// A assinatura é mantida para não alterar os hooks/chamadas existentes.
// ---------------------------------------------------------------------------

function useCachedFetch<T>(
  _cacheKey: string,
  _fetcher: () => Promise<T>,
  fallback: T,
): { data: T; loading: boolean } {
  return { data: fallback, loading: false }
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

/**
 * Fetch hero slides for the home page.
 * Prefers the new CMS blocks (`site_blocos` with type `hero_slides`); falls
 * back to the legacy key/value `home.hero.slide_N.*` shape if the page has
 * no hero block (so the site never goes blank during rollout).
 */
export function useHeroSlides(): { slides: HeroSlide[]; loading: boolean } {
  const FIELDS = ['label', 'titulo', 'descricao', 'cta_texto', 'cta_link', 'imagem'] as const

  const { data, loading } = useCachedFetch<HeroSlide[]>(
    'heroSlides',
    async () => {
      // ─── 1) Try new block model ──────────────────────────────────────
      try {
        const home = await fetchPagina('home')
        const heroBlock = home.blocos.find((b) => b.tipo === 'hero_slides')
        const blockSlides = (heroBlock?.dados as { slides?: Array<Record<string, string>> } | undefined)?.slides
        if (Array.isArray(blockSlides) && blockSlides.length > 0) {
          return blockSlides.map((s) => ({
            label: s.label ?? '',
            titulo: s.titulo ?? '',
            descricao: s.descricao ?? '',
            cta_texto: s.cta_texto ?? '',
            cta_link: s.cta_link ?? '',
            // The CMS field is `imagem_url`; older entries also used `imagem`.
            imagem: s.imagem_url ?? s.imagem ?? '',
          }))
        }
      } catch {
        // Block fetch failed — fall through to legacy.
      }

      // ─── 2) Legacy fallback (key/value flat) ────────────────────────
      const raw = await fetchConteudo('home.hero')
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

/* ─────────────────────────────────────────────────────────
   APLICAÇÕES (TASK 26a)
   ───────────────────────────────────────────────────────── */
export interface AplicacaoListAPI {
  slug: string
  nome: string
  descricao_curta: string | null
  imagem_url: string | null
  icone: string | null
  setores: string[]
  destaque: boolean
  ordem: number
}

export interface AplicacaoDetailAPI extends AplicacaoListAPI {
  descricao_completa: string | null
  beneficios: string[]
  casos_uso: string[]
  produtos_relacionados: string[]
  servicos_relacionados: string[]
  seo_title: string | null
  seo_description: string | null
}

/** Lista todas as aplicações publicadas (CMS-driven, fallback no caller). */
export function useAplicacoes(filtros?: { setor?: string; busca?: string; destaque?: boolean }): {
  aplicacoes: AplicacaoListAPI[]
  loading: boolean
} {
  const cacheKey = `aplicacoes:${filtros?.setor ?? 'all'}:${filtros?.busca ?? ''}:${filtros?.destaque ? 'destaque' : 'all'}`
  const { data, loading } = useCachedFetch<AplicacaoListAPI[]>(
    cacheKey,
    () =>
      fetchSiteContent<AplicacaoListAPI[]>({
        type: 'aplicacoes',
        ...(filtros?.setor ? { setor: filtros.setor } : {}),
        ...(filtros?.busca ? { q: filtros.busca } : {}),
        ...(filtros?.destaque ? { destaque: 'true' } : {}),
      }),
    [],
  )
  return { aplicacoes: data, loading }
}

/** Detalhe de uma aplicação por slug. */
export function useAplicacao(slug: string): {
  aplicacao: AplicacaoDetailAPI | null
  loading: boolean
} {
  const { data, loading } = useCachedFetch<AplicacaoDetailAPI | null>(
    `aplicacao:${slug}`,
    () => fetchSiteContent<AplicacaoDetailAPI>({ type: 'aplicacao', slug }),
    null,
  )
  return { aplicacao: data, loading }
}

/* ─────────────────────────────────────────────────────────
   TIMELINE (TASK 24)
   ───────────────────────────────────────────────────────── */
export interface TimelineItemAPI {
  ano: number
  titulo: string
  texto: string | null
  icone: string | null
  ordem: number
}

/** Linha do tempo da Gaiatec (renderizado em /sobre).
 *  Editável pelo painel ERP em /marketing/site → tab Linha do Tempo. */
export function useTimeline(): { timeline: TimelineItemAPI[]; loading: boolean } {
  const { data, loading } = useCachedFetch<TimelineItemAPI[]>(
    'timeline',
    () => fetchSiteContent<TimelineItemAPI[]>({ type: 'timeline' }),
    [],
  )
  return { timeline: data, loading }
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

export interface ContactInfo {
  telefone: string
  fax: string
  whatsapp: string
  whatsapp_horario: string
  email: string
  endereco: string
  bairro_cidade: string
  lgpd: string
}

const EMPTY_CONTACT: ContactInfo = {
  telefone: '', fax: '', whatsapp: '', whatsapp_horario: '',
  email: '', endereco: '', bairro_cidade: '', lgpd: '',
}

// ---------------------------------------------------------------------------
// Sobre — adapter hook que mapeia blocos do CMS pros 3 arrays usados
// pela SobrePage (principles, timeline, diferenciais), preservando o
// design horizontal/timeline animada.
// ---------------------------------------------------------------------------

export interface SobrePrinciple {
  num: string
  title: string
  text: string
}
export interface SobreTimelineEntry {
  year: string
  title: string
  desc: string
}
export interface SobreDiferencial {
  iconName: string  // emoji/string que SobrePage renderiza como texto
  title: string
  desc: string
}

interface SobreContent {
  principles: SobrePrinciple[]
  timeline: SobreTimelineEntry[]
  diferenciais: SobreDiferencial[]
  loading: boolean
}

// ---------------------------------------------------------------------------
// Home — hooks adapter por componente
// Cada um lê só o que faz sentido pro design existente. Caem pro
// fallback hardcoded se nada vier do CMS.
// ---------------------------------------------------------------------------

interface ContentSectionData {
  intro: string
  services: Array<{ title: string; href: string; desc: string; cta: string; ctaHref: string }>
  loading: boolean
}

/**
 * ContentSection (a seção lindona com sticky title + 4 serviços).
 * - intro: vem do text_block "Manchete Principal" da home (campo `paragrafo`)
 * - services: vem do feature_grid "Soluções Inovadoras" da home — cada
 *   item vira um service card com title + descricao. icone do bloco
 *   é ignorado (ContentSection não tem ícones no design).
 * Fallback hardcoded preserva o design caso o CMS esteja vazio.
 */
export function useContentSection(fallback: {
  intro: string
  services: Array<{ title: string; href: string; desc: string; cta: string; ctaHref: string }>
}): ContentSectionData {
  const { pagina, loading } = usePagina('home')

  if (!pagina) return { ...fallback, loading }

  const blocos = pagina.blocos

  const introBlock = blocos.find(
    (b) => b.tipo === 'text_block' && (b.nome ?? '').toLowerCase().includes('manchete')
  )
  const introData = introBlock?.dados as { paragrafo?: string } | undefined
  const intro = introData?.paragrafo ?? fallback.intro

  const servicesBlock = blocos.find(
    (b) =>
      b.tipo === 'feature_grid' &&
      ((b.nome ?? '').toLowerCase().includes('solu') ||
        (b.nome ?? '').toLowerCase().includes('serv'))
  )
  const servicesItems = (servicesBlock?.dados as { items?: Array<{ titulo?: string; descricao?: string }> } | undefined)?.items
  const services =
    servicesItems && servicesItems.length > 0
      ? servicesItems.slice(0, 4).map((it) => ({
          title: it.titulo ?? '',
          href: '/servicos',
          desc: it.descricao ?? '',
          cta: 'Ver Serviço →',
          ctaHref: '/contato',
        }))
      : fallback.services

  return { intro, services, loading }
}

interface InnovativeSolutionsData {
  subtitle: string
  title: string
  blocks: Array<{ title: string; description: string }>
  loading: boolean
}

/**
 * InnovativeSolutions (sticky title à esquerda, 3 cards à direita).
 * Lê o feature_grid "Soluções Inovadoras". Pega `titulo` e `subtitulo`
 * do bloco e os 3 primeiros items pros cards.
 */
export function useInnovativeSolutions(fallback: {
  subtitle: string
  title: string
  blocks: Array<{ title: string; description: string }>
}): InnovativeSolutionsData {
  const { pagina, loading } = usePagina('home')

  if (!pagina) return { ...fallback, loading }

  const block = pagina.blocos.find(
    (b) =>
      b.tipo === 'feature_grid' &&
      ((b.nome ?? '').toLowerCase().includes('inovador') ||
        (b.nome ?? '').toLowerCase().includes('solu'))
  )
  if (!block) return { ...fallback, loading }

  const d = block.dados as {
    titulo?: string
    subtitulo?: string
    items?: Array<{ titulo?: string; descricao?: string }>
  }

  return {
    subtitle: d.subtitulo || fallback.subtitle,
    title: d.titulo || fallback.title,
    blocks:
      d.items && d.items.length > 0
        ? d.items.slice(0, 3).map((it) => ({
            title: it.titulo ?? '',
            description: it.descricao ?? '',
          }))
        : fallback.blocks,
    loading,
  }
}

interface PartnersLogosData {
  certifications: Array<{ name: string; label: string; image?: string | null }>
  loading: boolean
}

/**
 * PartnersLogos — lê o bloco partners_logos "Certificações" da home.
 * Cada logo tem: nome (label curto), label (descrição), imagem_url
 * opcional. Fallback hardcoded RBC/INMETRO/ISO.
 */
export function usePartnersLogos(fallback: {
  certifications: Array<{ name: string; label: string; image?: string | null }>
}): PartnersLogosData {
  const { pagina, loading } = usePagina('home')

  if (!pagina) return { ...fallback, loading }

  const block = pagina.blocos.find((b) => b.tipo === 'partners_logos')
  if (!block) return { ...fallback, loading }

  const d = block.dados as { items?: Array<{ nome?: string; label?: string; imagem_url?: string | null }> }
  const items = d.items
  if (!items || items.length === 0) return { ...fallback, loading }

  return {
    certifications: items.map((it) => ({
      name: it.nome ?? '',
      label: it.label ?? '',
      image: it.imagem_url ?? null,
    })),
    loading,
  }
}

/**
 * Mapeia blocos da página `sobre` em arrays prontos pra SobrePage.
 * - principles: vem dos blocos rich_text "Missão", "Visão", "Valores"
 *   na ordem em que aparecem (paragrafo_1 vira o text).
 * - timeline: vem do bloco timeline (1º que existir).
 * - diferenciais: vem do bloco feature_grid "Diferenciais" (ou 1º que
 *   exista). icone do bloco vira string passada adiante (SobrePage
 *   pode ignorar e usar o ícone Lucide do fallback).
 * Retorna fallback hardcoded enquanto loading ou se nenhum bloco
 * existir.
 */
export function useSobreContent(fallback: {
  principles: SobrePrinciple[]
  timeline: SobreTimelineEntry[]
  diferenciais: SobreDiferencial[]
}): SobreContent {
  const { pagina, loading } = usePagina('sobre')

  if (!pagina) {
    return { ...fallback, loading }
  }

  const blocos = pagina.blocos

  // ── Principles (Missão / Visão / Valores) ───────────────────────
  const principleNames = ['missão', 'visao', 'visão', 'valores', 'mission']
  const principleBlocks = blocos
    .filter(
      (b) =>
        b.tipo === 'rich_text' &&
        b.nome &&
        principleNames.some((p) => b.nome!.toLowerCase().includes(p.replace('ã', 'a')))
    )
    // Order: Missão, Visão, Valores
    .sort((a, b) => {
      const order = ['miss', 'vis', 'val']
      const ai = order.findIndex((o) => (a.nome || '').toLowerCase().includes(o))
      const bi = order.findIndex((o) => (b.nome || '').toLowerCase().includes(o))
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  const principles: SobrePrinciple[] =
    principleBlocks.length > 0
      ? principleBlocks.slice(0, 3).map((b, i) => {
          const d = b.dados as { titulo?: string; paragrafo_1?: string; paragrafo_2?: string }
          return {
            num: String(i + 1).padStart(2, '0'),
            title: d.titulo ?? b.nome ?? '',
            text: [d.paragrafo_1, d.paragrafo_2].filter(Boolean).join(' '),
          }
        })
      : fallback.principles

  // ── Timeline ────────────────────────────────────────────────────
  const timelineBlock = blocos.find((b) => b.tipo === 'timeline')
  const timeline: SobreTimelineEntry[] = timelineBlock
    ? ((timelineBlock.dados as { items?: Array<{ ano?: string; titulo?: string; descricao?: string }> }).items ?? []).map(
        (it) => ({
          year: it.ano ?? '',
          title: it.titulo ?? '',
          desc: it.descricao ?? '',
        })
      )
    : fallback.timeline

  // ── Diferenciais ────────────────────────────────────────────────
  const diferenciaisBlock = blocos.find(
    (b) => b.tipo === 'feature_grid' && (b.nome ?? '').toLowerCase().includes('diferencia')
  )
  const diferenciais: SobreDiferencial[] = diferenciaisBlock
    ? ((diferenciaisBlock.dados as { items?: Array<{ icone?: string; titulo?: string; descricao?: string }> }).items ?? []).map(
        (it) => ({
          iconName: it.icone ?? '★',
          title: it.titulo ?? '',
          desc: it.descricao ?? '',
        })
      )
    : fallback.diferenciais

  return {
    principles: principles.length > 0 ? principles : fallback.principles,
    timeline: timeline.length > 0 ? timeline : fallback.timeline,
    diferenciais: diferenciais.length > 0 ? diferenciais : fallback.diferenciais,
    loading,
  }
}

/**
 * Fetch contact info. Prefers the new CMS block (page `contato`, type
 * `contact_info`); falls back to legacy `conteudo_site` keys (`contato.*`)
 * during rollout.
 */
export function useContactInfo(): { contact: ContactInfo; loading: boolean } {
  const { data, loading } = useCachedFetch<ContactInfo>(
    'contactInfo',
    async () => {
      try {
        const page = await fetchPagina('contato')
        const block = page.blocos.find((b) => b.tipo === 'contact_info')
        if (block) {
          const d = block.dados as Partial<ContactInfo>
          return {
            telefone: d.telefone ?? '',
            fax: d.fax ?? '',
            whatsapp: d.whatsapp ?? '',
            whatsapp_horario: d.whatsapp_horario ?? '',
            email: d.email ?? '',
            endereco: d.endereco ?? '',
            bairro_cidade: d.bairro_cidade ?? '',
            lgpd: d.lgpd ?? '',
          }
        }
      } catch {
        // fall through to legacy
      }

      const raw = await fetchConteudo('contato')
      return {
        telefone: raw['contato.telefone'] ?? '',
        fax: raw['contato.fax'] ?? '',
        whatsapp: raw['contato.whatsapp'] ?? '',
        whatsapp_horario: raw['contato.whatsapp_horario'] ?? '',
        email: raw['contato.email'] ?? '',
        endereco: raw['contato.endereco'] ?? '',
        bairro_cidade: raw['contato.bairro_cidade'] ?? '',
        lgpd: raw['contato.lgpd'] ?? '',
      }
    },
    EMPTY_CONTACT,
  )
  return { contact: data, loading }
}
