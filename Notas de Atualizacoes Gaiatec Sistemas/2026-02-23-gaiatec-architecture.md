# Arquitetura Técnica — GAIATEC SISTEMAS Website
**Data:** 2026-02-23
**Versão:** 1.0
**Status:** Referência para desenvolvimento
**Etapa:** 4 de N — Design System, Component Tree, Data Layer, API Routes, State Management, Performance

---

## Sumário

1. [Design System — Tokens e Fundação](#1-design-system--tokens-e-fundação)
2. [Component Tree — Hierarquia Completa](#2-component-tree--hierarquia-completa)
3. [Classificação Server vs Client Components](#3-classificação-server-vs-client-components)
4. [Interfaces TypeScript dos Componentes Críticos](#4-interfaces-typescript-dos-componentes-críticos)
5. [Data Layer — GROQ Queries e Tipos](#5-data-layer--groq-queries-e-tipos)
6. [Estratégia de Cache e ISR por Página](#6-estratégia-de-cache-e-isr-por-página)
7. [API Routes — Design e Contrato](#7-api-routes--design-e-contrato)
8. [State Management — Client-side](#8-state-management--client-side)
9. [Performance Architecture](#9-performance-architecture)
10. [Configuração do tailwind.config.ts](#10-configuração-do-tailwindconfigts)

---

## 1. Design System — Tokens e Fundação

### 1.1 Paleta de Cores

> **Nota:** Os valores HEX abaixo são placeholder até recebimento do brandbook da GAIATEC. Adaptar assim que o guia visual for entregue.

```
PRIMARY — Azul Industrial (identidade GAIATEC)
  primary-50:   #EFF6FF  ← backgrounds suaves, hover states
  primary-100:  #DBEAFE
  primary-200:  #BFDBFE
  primary-300:  #93C5FD
  primary-400:  #60A5FA
  primary-500:  #3B82F6  ← tom base
  primary-600:  #2563EB  ← CTA primário (botões, links)
  primary-700:  #1D4ED8  ← hover de CTA primário
  primary-800:  #1E40AF  ← texto em fundo claro
  primary-900:  #1E3A8A  ← headers, navbar sólida

SECONDARY — Laranja/Âmbar Técnico (destaque, badges, CTAs secundários)
  secondary-400: #FB923C
  secondary-500: #F97316  ← tom base
  secondary-600: #EA580C  ← hover

NEUTRAL — Cinzas (texto, backgrounds, bordas)
  neutral-50:   #F8FAFC  ← background de página
  neutral-100:  #F1F5F9  ← cards, inputs
  neutral-200:  #E2E8F0  ← bordas
  neutral-300:  #CBD5E1  ← separadores
  neutral-400:  #94A3B8  ← texto desabilitado
  neutral-500:  #64748B  ← texto secundário
  neutral-600:  #475569  ← texto de suporte
  neutral-700:  #334155  ← texto de corpo
  neutral-800:  #1E293B  ← texto principal
  neutral-900:  #0F172A  ← headings, títulos fortes

ESTADOS
  success-500:  #22C55E  ← confirmações, badges "ativo"
  warning-500:  #EAB308  ← alertas, badges "em breve"
  error-500:    #EF4444  ← erros de formulário
  info-500:     #3B82F6  ← informações (mesmo que primary-500)

ESPECIAIS
  white:        #FFFFFF
  black:        #000000
  overlay:      rgba(0, 0, 0, 0.6)   ← overlay do hero carrossel
  overlay-blur: rgba(15, 23, 42, 0.4) ← backdrop da seção de setores
```

### 1.2 Tipografia

```
FAMÍLIA DE FONTES
  font-sans:    Inter (Google Fonts) — corpo, UI
  font-display: Geist ou Outfit (Google Fonts) — títulos, hero
  font-mono:    JetBrains Mono — specs técnicas, tabelas, código no blog

ESCALA DE TAMANHOS (rem / px equivalente a 16px base)
  text-xs:    0.75rem  /  12px  ← labels, badges, captions
  text-sm:    0.875rem /  14px  ← texto de suporte, rodapés
  text-base:  1rem     /  16px  ← corpo de texto padrão
  text-lg:    1.125rem /  18px  ← descrições de card, subtítulos
  text-xl:    1.25rem  /  20px  ← títulos de card
  text-2xl:   1.5rem   /  24px  ← subtítulos de seção
  text-3xl:   1.875rem /  30px  ← títulos de seção
  text-4xl:   2.25rem  /  36px  ← H1 de página interna
  text-5xl:   3rem     /  48px  ← H1 de hero (tablet)
  text-6xl:   3.75rem  /  60px  ← H1 de hero (desktop)
  text-7xl:   4.5rem   /  72px  ← hero de impacto (wide)

PESOS
  font-normal:   400  ← corpo
  font-medium:   500  ← labels, badges
  font-semibold: 600  ← títulos de card, CTAs
  font-bold:     700  ← títulos de seção, H2/H3
  font-extrabold:800  ← H1 hero, números de destaque

LINE-HEIGHTS
  leading-none:   1    ← headings display grandes
  leading-tight:  1.25 ← headings H1-H3
  leading-snug:   1.375
  leading-normal: 1.5  ← corpo de texto
  leading-relaxed:1.625 ← textos longos de blog

LETTER-SPACING
  tracking-tight:  -0.025em ← headings grandes
  tracking-normal:  0em
  tracking-wide:   0.025em  ← labels, badges, botões uppercase
  tracking-widest: 0.1em    ← overlines, categorias
```

### 1.3 Espaçamentos (base 4px)

```
ESCALA DE ESPAÇAMENTO (Tailwind padrão — não alterar)
  0:   0px
  1:   4px   ← gaps mínimos
  2:   8px   ← padding interno de badges
  3:   12px
  4:   16px  ← padding padrão de elementos
  5:   20px
  6:   24px  ← gap entre cards em mobile
  8:   32px  ← gap entre cards em desktop
  10:  40px
  12:  48px  ← padding de seções (mobile)
  16:  64px  ← padding de seções (desktop)
  20:  80px  ← padding de seções (wide)
  24:  96px
  32:  128px ← espaçamento entre seções maiores
  40:  160px
  48:  192px ← altura de hero sections

TOKENS CUSTOMIZADOS (adicionar ao tailwind.config.ts)
  section-mobile:  48px   (py-12)
  section-desktop: 96px   (py-24)
  container-max:   1440px
  container-pad:   24px   (mobile) → 48px (desktop)
  card-radius:     12px
  input-radius:    8px
  button-radius:   8px
  badge-radius:    6px
```

### 1.4 Sombras

```typescript
// tailwind.config.ts — boxShadow customizado
boxShadow: {
  'card':      '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
  'card-hover':'0 4px 16px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
  'modal':     '0 20px 60px rgba(0,0,0,0.3)',
  'header':    '0 2px 8px rgba(0,0,0,0.08)',
  'dropdown':  '0 8px 24px rgba(0,0,0,0.12)',
  'button':    '0 2px 4px rgba(37, 99, 235, 0.3)',
  'none':      'none',
}
```

### 1.5 Z-Index Layers

```
z-index:
  base:      0    ← conteúdo padrão
  raised:    10   ← cards com hover
  dropdown:  100  ← megamenu, tooltips
  sticky:    200  ← header sticky
  overlay:   300  ← overlay de modal, backdrop de setor
  modal:     400  ← modal de orçamento
  toast:     500  ← notificações
  cookie:    600  ← cookie consent (sempre visível)
  whatsapp:  700  ← botão flutuante (sempre no topo)
```

### 1.6 Animações e Transições

```typescript
// tailwind.config.ts — animation customizado
animation: {
  'fade-in':       'fadeIn 0.3s ease-in-out',
  'fade-in-up':    'fadeInUp 0.4s ease-out',
  'slide-in-left': 'slideInLeft 0.3s ease-out',
  'counter':       'counter 2s ease-out forwards',
  'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
},
keyframes: {
  fadeIn:       { from: { opacity: '0' }, to: { opacity: '1' } },
  fadeInUp:     { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
  slideInLeft:  { from: { opacity: '0', transform: 'translateX(-16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
  counter:      { from: { '--num': '0' }, to: { '--num': 'var(--target)' } },
},
transitionDuration: {
  DEFAULT: '200ms',
  fast:    '100ms',
  normal:  '200ms',
  slow:    '350ms',
}
```

---

## 2. Component Tree — Hierarquia Completa

```
src/
├── app/
│   ├── layout.tsx                         [ROOT LAYOUT — Server]
│   │   ├── <GoogleTagManager />           [Client]
│   │   ├── <CookieConsent />              [Client]
│   │   └── <WhatsAppButton />             [Client]
│   │
│   └── (site)/
│       ├── layout.tsx                     [SITE LAYOUT — Server]
│       │   ├── <Header />                 [Server + Client islands]
│       │   │   ├── <HeaderLogo />         [Server]
│       │   │   ├── <HeaderNav />          [Client] ← hover states
│       │   │   │   ├── <MegamenuSetores /> [Client]
│       │   │   │   └── <MegamenuProdutos /> [Client]
│       │   │   ├── <HeaderSearch />       [Client] ← autocomplete
│       │   │   ├── <HeaderCTA />          [Client] ← abre modal
│       │   │   ├── <MobileMenuButton />   [Client]
│       │   │   └── <CredibilityBar />     [Server]
│       │   ├── <MobileMenu />             [Client] ← drawer
│       │   └── <Footer />                [Server]
│       │       ├── <FooterColumns />      [Server]
│       │       ├── <FooterCertifications /> [Server]
│       │       └── <FooterSocial />       [Server]
│       │
│       ├── page.tsx                       [HOMEPAGE — Server]
│       │   ├── <HeroCarousel />           [Client] ← autoplay, touch
│       │   │   ├── <HeroSlide />          [Server] (por slide)
│       │   │   └── <CarouselControls />   [Client]
│       │   ├── <SmartSearchBar />         [Client] ← autocomplete
│       │   │   ├── <SearchInput />        [Client]
│       │   │   ├── <SearchResults />      [Client]
│       │   │   └── <ProgressiveFilters /> [Client]
│       │   ├── <SectorTabs />             [Client] ← tabs interativas
│       │   │   ├── <SectorTabList />      [Client]
│       │   │   ├── <SectorBackground />   [Client] ← backdrop-blur
│       │   │   └── <CategoryCard />       [Server] (repetido)
│       │   ├── <FeaturedProducts />       [Client] ← tabs de setor
│       │   │   ├── <SectorTabBar />       [Client]
│       │   │   └── <ProductCard />        [Server] (repetido)
│       │   ├── <FeaturedServices />       [Client] ← mesma lógica
│       │   │   └── <ServiceCard />        [Server] (repetido)
│       │   ├── <FeaturedApplications />   [Server]
│       │   │   └── <ApplicationCard />    [Server]
│       │   ├── <WhyGaiatec />             [Client] ← counters animados
│       │   │   ├── <AnimatedCounter />    [Client]
│       │   │   └── <DifferentialItem />   [Server]
│       │   ├── <CertificationsSection />  [Server]
│       │   └── <HomeCTA />               [Client] ← abre modal
│       │
│       ├── setores/
│       │   ├── page.tsx                   [SETORES LISTING — Server]
│       │   │   ├── <SetoresHero />        [Server]
│       │   │   ├── <SetoresFilter />      [Client]
│       │   │   └── <SetorCard />          [Server] (repetido)
│       │   └── [setor]/page.tsx           [SETOR INDIVIDUAL — Server]
│       │       ├── <SetorHero />          [Server]
│       │       ├── <Breadcrumb />         [Server]
│       │       ├── <SetorDescription />   [Server]
│       │       ├── <SetorApplications />  [Server]
│       │       ├── <SetorCategories />    [Client] ← tabs/accordion
│       │       ├── <SetorProducts />      [Server]
│       │       ├── <SetorServices />      [Server]
│       │       ├── <SetorCases />         [Server]
│       │       ├── <SetorBenefits />      [Server]
│       │       ├── <CatalogDownload />    [Client] ← download link
│       │       └── <SetorCTA />           [Client] ← abre modal
│       │
│       ├── produtos/
│       │   ├── page.tsx                   [PRODUTOS LISTING — Server]
│       │   │   ├── <ProductsHero />       [Server]
│       │   │   ├── <ProductSearchBar />   [Client]
│       │   │   ├── <PrimaryFilters />     [Client] ← breadcrumb filtros
│       │   │   ├── <FiltersSidebar />     [Client] ← filtros secundários
│       │   │   │   └── <FilterGroup />    [Client] (por categoria)
│       │   │   ├── <MobileFiltersDrawer /> [Client]
│       │   │   ├── <ProductsGrid />       [Server] (com Suspense)
│       │   │   │   └── <ProductCard />    [Server] (repetido)
│       │   │   └── <Pagination />         [Client]
│       │   └── [slug]/page.tsx            [PRODUTO FICHA — Server]
│       │       ├── <Breadcrumb />         [Server]
│       │       ├── <ProductGallery />     [Client] ← zoom, miniaturas
│       │       ├── <ProductSidebar />     [Server + Client islands]
│       │       │   ├── <ProductInfo />    [Server]
│       │       │   ├── <OrcamentoCTA />   [Client] ← abre modal
│       │       │   ├── <WhatsAppCTA />    [Client]
│       │       │   └── <DatasheetCTA />   [Client] ← download/gated
│       │       ├── <ProductTabs />        [Client] ← aba ativa
│       │       │   ├── <SpecsTable />     [Server]
│       │       │   ├── <ProductApps />    [Server]
│       │       │   ├── <DocumentsList />  [Client]
│       │       │   └── <ProductVideo />   [Client] ← lazy iframe
│       │       ├── <ProductFAQ />         [Client] ← accordion
│       │       ├── <RelatedProducts />    [Server]
│       │       └── <ComplementaryServices /> [Server]
│       │
│       ├── servicos/
│       │   ├── page.tsx                   [SERVIÇOS — Server]
│       │   │   ├── <ServicesHero />       [Server]
│       │   │   ├── <ServicesFilter />     [Client]
│       │   │   └── <ServiceCard />        [Server] (repetido)
│       │   └── [slug]/page.tsx            [SERVIÇO INDIVIDUAL — Server]
│       │       ├── <Breadcrumb />         [Server]
│       │       ├── <ServiceDetail />      [Server]
│       │       ├── <ServiceFAQ />         [Client]
│       │       └── <ServiceCTA />         [Client]
│       │
│       ├── aplicacoes/
│       │   ├── page.tsx                   [APLICAÇÕES — Server]
│       │   │   ├── <ApplicationsHero />   [Server]
│       │   │   ├── <ApplicationsFilter /> [Client]
│       │   │   └── <ApplicationCard />    [Server] (repetido)
│       │   └── [slug]/page.tsx            [APLICAÇÃO INDIVIDUAL — Server]
│       │       ├── <Breadcrumb />         [Server]
│       │       ├── <ApplicationHero />    [Server]
│       │       ├── <RelatedProducts />    [Server]
│       │       ├── <RelatedServices />    [Server]
│       │       ├── <TelemetryPlatform />  [Server]
│       │       ├── <IntegratedSolution /> [Server]
│       │       ├── <ROIBenefits />        [Server]
│       │       └── <ApplicationCTA />     [Client]
│       │
│       ├── blog/
│       │   ├── page.tsx                   [BLOG LISTING — Server]
│       │   │   ├── <BlogHero />           [Server]
│       │   │   ├── <BlogFilter />         [Client]
│       │   │   └── <ArticleCard />        [Server] (repetido)
│       │   └── [slug]/page.tsx            [ARTIGO — Server]
│       │       ├── <Breadcrumb />         [Server]
│       │       ├── <ArticleBody />        [Server] ← PortableText
│       │       ├── <ArticleSidebar />     [Server]
│       │       └── <ArticleCTA />         [Client]
│       │
│       ├── sobre/page.tsx                 [SOBRE — Server]
│       │   ├── <SobreIntro />             [Server]
│       │   └── <Timeline />               [Client] ← animação scroll
│       │       └── <TimelineItem />       [Client]
│       │
│       ├── contato/page.tsx               [CONTATO — Server]
│       │   ├── <ContactForm />            [Client] ← React Hook Form
│       │   └── <ContactInfo />            [Server]
│       │
│       ├── minha-conta/page.tsx           [EM BREVE — Server]
│       └── politica-de-privacidade/page.tsx [LGPD — Server]
│
└── components/
    └── ui/                                [COMPONENTES ATÔMICOS]
        ├── Button.tsx                     [Client] ← variantes
        ├── Badge.tsx                      [Server]
        ├── Card.tsx                       [Server]
        ├── Input.tsx                      [Client]
        ├── Modal.tsx                      [Client]
        ├── Skeleton.tsx                   [Server]
        ├── Tabs.tsx                       [Client]
        ├── Accordion.tsx                  [Client]
        ├── Tooltip.tsx                    [Client]
        └── PortableText.tsx               [Server]
```

---

## 3. Classificação Server vs Client Components

### Regra Geral
> **Padrão Next.js App Router:** Tudo é Server Component por padrão. Adicionar `'use client'` apenas quando necessário.

### Quando usar `'use client'`

| Necessidade | Exemplo no Projeto |
|---|---|
| Estado interativo (`useState`, `useReducer`) | Filtros de produto, busca autocomplete, tabs |
| Efeitos (`useEffect`) | Animação de counters, Intersection Observer |
| Eventos do browser (`onClick`, `onChange`, `onScroll`) | Megamenu, modal, carrossel |
| APIs de browser (`localStorage`, `window`) | Cookie consent, WhatsApp redirect |
| Hooks de roteamento (`useSearchParams`, `useRouter`) | Filtros com URL params |
| Bibliotecas client-only (Embla Carousel, Framer Motion) | Carrossel hero, animações |

### Padrão de Islands Architecture

```
Página (Server) — busca dados, renderiza HTML
    └── Seção Estática (Server) — apenas exibe dados
    └── Seção Interativa (Client) ← 'use client' isolado aqui
        └── Componente Atômico (Server) — sem estado
```

**Exemplo correto:**
```typescript
// FeaturedProducts.tsx — Server Component
// Busca os produtos do Sanity no servidor
export default async function FeaturedProducts() {
  const products = await getFeaturedProducts()  // GROQ query server-side
  return <FeaturedProductsClient initialData={products} />
}

// FeaturedProductsClient.tsx — Client Component
'use client'
// Gerencia apenas as tabs e o estado de setor selecionado
export function FeaturedProductsClient({ initialData }: Props) {
  const [activeSetor, setActiveSetor] = useState('geral')
  // ...
}
```

---

## 4. Interfaces TypeScript dos Componentes Críticos

```typescript
// ─────────────────────────────────────────────
// TIPOS BASE DO SANITY
// ─────────────────────────────────────────────

export type SanityImage = {
  _type: 'image'
  asset: { _ref: string; _type: 'reference' }
  alt?: string
  hotspot?: { x: number; y: number; height: number; width: number }
}

export type SanityReference = {
  _type: 'reference'
  _ref: string
}

export type SanitySlug = {
  _type: 'slug'
  current: string
}

// ─────────────────────────────────────────────
// TIPOS DE DOMÍNIO
// ─────────────────────────────────────────────

export type SetorCard = {
  _id: string
  nome: string
  slug: string
  descricao: string
  iconeUrl: string
  imagemPrincipalUrl: string
}

export type CategoriaCard = {
  _id: string
  nome: string
  slug: string
  iconeUrl?: string
  setor: { nome: string; slug: string }
}

export type ProdutoCard = {
  _id: string
  nome: string
  slug: string
  descricaoResumida: string
  imagemPrincipalUrl: string
  setor: Array<{ nome: string; slug: string }>
  categoria: { nome: string; slug: string }
  badgeDestaque?: 'Mais pedido' | 'Novo' | null
}

export type ProdutoFull extends ProdutoCard = {
  imagens: string[]
  tecnologia?: string
  especificacoesTecnicas: Array<{ campo: string; valor: string }>
  certificacoes: string[]
  datasheet?: string
  manual?: string
  aplicacoes: ApplicationCard[]
  servicosRelacionados: ServicoCard[]
  produtosRelacionados: ProdutoCard[]
  faq: Array<{ pergunta: string; resposta: string }>
  seoTitle?: string
  seoDescription?: string
  altImagemPrincipal?: string
}

export type ServicoCard = {
  _id: string
  nome: string
  slug: string
  categoriaServico: 'Instalação' | 'Calibração' | 'Manutenção' | 'Consultoria' | 'Medições'
  descricao: string
  setor: Array<{ nome: string; slug: string }>
}

export type ApplicationCard = {
  _id: string
  nome: string
  slug: string
  descricao: string
  imagemUrl?: string
  setores: Array<{ nome: string; slug: string }>
}

export type SlideCarrossel = {
  _id: string
  titulo: string
  subtitulo?: string
  imagemUrl: string
  ctaTexto: string
  ctaHref: string
  ordem: number
}

export type ArtigoCard = {
  _id: string
  titulo: string
  slug: string
  thumbnail?: string
  dataPublicacao: string
  setor: Array<{ nome: string }>
  categoriaLabel?: string
}

// ─────────────────────────────────────────────
// INTERFACES DOS COMPONENTES
// ─────────────────────────────────────────────

// HeroCarousel
export interface HeroCarouselProps {
  slides: SlideCarrossel[]
  autoPlayInterval?: number  // default: 5000ms
}

// SmartSearchBar
export interface SmartSearchBarProps {
  placeholder?: string
  className?: string
  onSearch?: (term: string, filters: SearchFilters) => void
}

export type SearchFilters = {
  setor?: string
  categoria?: string
  tecnologia?: string
}

export type SearchResult = {
  _id: string
  _type: 'produto' | 'servico' | 'aplicacao'
  nome: string
  slug: string
  thumbnailUrl?: string
  label: string  // categoria ou setor para exibir no resultado
}

// SectorTabs (Homepage)
export interface SectorTabsProps {
  setores: SetorCard[]
  initialSetor?: string
  autoRotateInterval?: number  // default: 4000ms, 0 = desativado
}

// ProductCard
export interface ProductCardProps {
  product: ProdutoCard
  priority?: boolean  // para next/image priority nos primeiros cards
  variant?: 'default' | 'compact' | 'featured'
}

// FeaturedProducts (tabbed by setor)
export interface FeaturedProductsClientProps {
  setores: SetorCard[]
  productsBySetor: Record<string, ProdutoCard[]>
  defaultProducts: ProdutoCard[]  // cross-setor iniciais
}

// FiltersSidebar
export type FilterOption = {
  label: string
  value: string
  count?: number
}

export type FilterGroup = {
  id: string
  label: string
  type: 'checkbox' | 'range' | 'select'
  options: FilterOption[]
}

export interface FiltersSidebarProps {
  filterGroups: FilterGroup[]
  activeFilters: Record<string, string[]>
  onFilterChange: (groupId: string, values: string[]) => void
  onClear: () => void
  className?: string
}

// ProductGallery
export interface ProductGalleryProps {
  images: string[]
  productName: string
  priority?: boolean
}

// OrcamentoModal
export interface OrcamentoModalProps {
  isOpen: boolean
  onClose: () => void
  productName?: string  // pré-preenche "Produto de interesse"
  setorName?: string    // pré-preenche "Setor"
}

export type OrcamentoFormData = {
  nome: string
  empresa: string
  telefone: string
  email: string
  produtoInteresse: string
  setor?: string
  mensagem?: string
}

// AnimatedCounter
export interface AnimatedCounterProps {
  target: number
  prefix?: string   // ex.: "+"
  suffix?: string   // ex.: " anos"
  duration?: number // ms, default 2000
  label: string
}

// Timeline (Sobre)
export type TimelineItem = {
  ano: number
  titulo: string
  descricao: string
  icone?: string
}

export interface TimelineProps {
  items: TimelineItem[]
}

// Breadcrumb
export type BreadcrumbItem = {
  label: string
  href?: string  // undefined = item atual (sem link)
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[]
}

// ContactForm
export type ContactFormData = {
  nome: string
  empresa: string
  setor?: string
  telefone: string
  email: string
  mensagem: string
}
```

---

## 5. Data Layer — GROQ Queries e Tipos

### 5.1 Organização do arquivo queries.ts

```typescript
// src/lib/sanity/queries.ts
// Todas as queries GROQ centralizadas aqui.
// Convenção: nome da query descreve o dado + contexto de uso.

import { groq } from 'next-sanity'
```

### 5.2 Queries por Página

```typescript
// ─── HOMEPAGE ───────────────────────────────────────────────────────────────

// Slides do carrossel (ordenados, apenas ativos)
export const heroSlidesQuery = groq`
  *[_type == "slideCarrossel" && ativo == true] | order(ordem asc) {
    _id,
    titulo,
    subtitulo,
    "imagemUrl": imagem.asset->url,
    ctaTexto,
    tipoLink,
    "ctaHref": select(
      tipoLink == "produto"    => "/produtos/" + referencia->slug.current,
      tipoLink == "setor"      => "/setores/"  + referencia->slug.current,
      tipoLink == "aplicacao"  => "/aplicacoes/" + referencia->slug.current,
      tipoLink == "servico"    => "/servicos/"   + referencia->slug.current,
      tipoLink == "url"        => url
    ),
    ordem
  }
`
export type HeroSlideResult = Array<SlideCarrossel>

// Setores para seção interativa da homepage
export const setoresHomeQuery = groq`
  *[_type == "setor"] | order(nome asc) {
    _id,
    nome,
    "slug": slug.current,
    "iconeUrl": icone.asset->url,
    "imagemPrincipalUrl": imagemPrincipal.asset->url,
    "categorias": *[_type == "categoria" && setor._ref == ^._id] {
      _id,
      nome,
      "slug": slug.current,
      "iconeUrl": icone.asset->url
    }
  }
`

// Produtos em destaque (cross-setor geral, sem filtro de setor)
export const produtosDestaqueGeralQuery = groq`
  *[_type == "produtoDestaque" && !defined(setor)] | order(ordem asc) [0..4] {
    "produto": produto-> {
      _id,
      nome,
      "slug": slug.current,
      descricaoResumida,
      "imagemPrincipalUrl": imagens[0].asset->url,
      "setor": setor[]->{ nome, "slug": slug.current },
      "categoria": categoria->{ nome, "slug": slug.current },
      badgeDestaque
    }
  }.produto
`

// Produtos em destaque por setor específico
export const produtosDestaqueSetorQuery = groq`
  *[_type == "produtoDestaque" && setor->slug.current == $setor] | order(ordem asc) [0..4] {
    "produto": produto-> {
      _id,
      nome,
      "slug": slug.current,
      descricaoResumida,
      "imagemPrincipalUrl": imagens[0].asset->url,
      "setor": setor[]->{ nome, "slug": slug.current },
      badgeDestaque
    }
  }.produto
`

// ─── CATÁLOGO DE PRODUTOS ────────────────────────────────────────────────────

// Listagem com filtros (dinâmica, chamada client-side via API route ou SWR)
export const produtosListagemQuery = groq`
  *[
    _type == "produto"
    && ($setor == "" || $setor in setor[]->slug.current)
    && ($categoria == "" || categoria->slug.current == $categoria)
    && ($subCategoria == "" || subCategoria->slug.current == $subCategoria)
    && ($busca == "" || nome match $busca + "*" || descricaoResumida match $busca + "*")
  ] | order(nome asc) [$offset...$offset + $limit] {
    _id,
    nome,
    "slug": slug.current,
    descricaoResumida,
    "imagemPrincipalUrl": imagens[0].asset->url,
    "setor": setor[]->{ nome, "slug": slug.current },
    "categoria": categoria->{ nome, "slug": slug.current },
    badgeDestaque
  }
`
// Parâmetros: { setor: string, categoria: string, subCategoria: string, busca: string, offset: number, limit: number }

// Count para paginação
export const produtosCountQuery = groq`
  count(*[
    _type == "produto"
    && ($setor == "" || $setor in setor[]->slug.current)
    && ($categoria == "" || categoria->slug.current == $categoria)
    && ($subCategoria == "" || subCategoria->slug.current == $subCategoria)
  ])
`

// Ficha técnica completa do produto
export const produtoBySlugQuery = groq`
  *[_type == "produto" && slug.current == $slug][0] {
    _id,
    nome,
    "slug": slug.current,
    tecnologia,
    descricaoResumida,
    "imagens": imagens[].asset->url,
    "altImagemPrincipal": imagens[0].alt,
    especificacoesTecnicas,
    certificacoes,
    "datasheet": datasheet.asset->url,
    "manual": manual.asset->url,
    badgeDestaque,
    faq,
    "setor": setor[]->{ nome, "slug": slug.current },
    "categoria": categoria->{ nome, "slug": slug.current },
    "subCategoria": subCategoria->{ nome, "slug": slug.current },
    "aplicacoes": aplicacoes[]->{ _id, nome, "slug": slug.current, descricao },
    "servicosRelacionados": servicosRelacionados[]->{ _id, nome, "slug": slug.current, categoriaServico },
    "produtosRelacionados": produtosRelacionados[]->{ _id, nome, "slug": slug.current, descricaoResumida, "imagemPrincipalUrl": imagens[0].asset->url, badgeDestaque },
    seoTitle,
    seoDescription
  }
`

// Slugs estáticos para generateStaticParams
export const todosProdutosSlugsQuery = groq`
  *[_type == "produto"] { "slug": slug.current }
`

// ─── SETORES ─────────────────────────────────────────────────────────────────

export const setoresListagemQuery = groq`
  *[_type == "setor"] | order(nome asc) {
    _id,
    nome,
    "slug": slug.current,
    descricao,
    "iconeUrl": icone.asset->url,
    "imagemPrincipalUrl": imagemPrincipal.asset->url,
    metaDescription
  }
`

export const setorBySlugQuery = groq`
  *[_type == "setor" && slug.current == $slug][0] {
    _id,
    nome,
    "slug": slug.current,
    descricao,
    "imagemPrincipalUrl": imagemPrincipal.asset->url,
    metaDescription,
    "aplicacoes": *[_type == "aplicacao" && $slug in setor[]->slug.current] {
      _id, nome, "slug": slug.current, descricao
    },
    "categorias": *[_type == "categoria" && setor->slug.current == $slug] {
      _id, nome, "slug": slug.current, "iconeUrl": icone.asset->url
    },
    "produtos": *[_type == "produto" && $slug in setor[]->slug.current] | order(nome asc) [0..7] {
      _id, nome, "slug": slug.current, descricaoResumida,
      "imagemPrincipalUrl": imagens[0].asset->url, badgeDestaque
    },
    "servicos": *[_type == "servico" && $slug in setor[]->slug.current] {
      _id, nome, "slug": slug.current, categoriaServico
    }
  }
`

// ─── SERVIÇOS ────────────────────────────────────────────────────────────────

export const servicosListagemQuery = groq`
  *[_type == "servico"] | order(nome asc) {
    _id,
    nome,
    "slug": slug.current,
    categoriaServico,
    descricao,
    "setor": setor[]->{ nome, "slug": slug.current }
  }
`

export const servicoBySlugQuery = groq`
  *[_type == "servico" && slug.current == $slug][0] {
    _id,
    nome,
    "slug": slug.current,
    categoriaServico,
    descricao,
    beneficios,
    "setor": setor[]->{ nome, "slug": slug.current },
    "produtosRelacionados": produtosRelacionados[]->{ _id, nome, "slug": slug.current, "imagemPrincipalUrl": imagens[0].asset->url },
    seoTitle,
    seoDescription
  }
`

// ─── APLICAÇÕES ──────────────────────────────────────────────────────────────

export const aplicacoesListagemQuery = groq`
  *[_type == "aplicacao"] | order(nome asc) {
    _id,
    nome,
    "slug": slug.current,
    descricao,
    "setores": setor[]->{ nome, "slug": slug.current }
  }
`

export const aplicacaoBySlugQuery = groq`
  *[_type == "aplicacao" && slug.current == $slug][0] {
    _id,
    nome,
    "slug": slug.current,
    descricao,
    solucaoCompleta,
    roi,
    "setores": setor[]->{ nome, "slug": slug.current },
    "produtosRelacionados": produtosRelacionados[]->{ _id, nome, "slug": slug.current, descricaoResumida, "imagemPrincipalUrl": imagens[0].asset->url },
    "servicosRelacionados": servicosRelacionados[]->{ _id, nome, "slug": slug.current, categoriaServico, descricao },
    "plataformaTelemetria": plataformaTelemetria->{ _id, nome, "slug": slug.current, descricaoResumida, "imagemPrincipalUrl": imagens[0].asset->url },
    seoTitle,
    seoDescription
  }
`

// ─── BLOG ────────────────────────────────────────────────────────────────────

export const artigosListagemQuery = groq`
  *[_type == "artigo"] | order(dataPublicacao desc) {
    _id,
    titulo,
    "slug": slug.current,
    "thumbnail": thumbnail.asset->url,
    dataPublicacao,
    "setor": setor[]->{ nome, "slug": slug.current }
  }
`

export const artigoBySlugQuery = groq`
  *[_type == "artigo" && slug.current == $slug][0] {
    _id,
    titulo,
    "slug": slug.current,
    conteudo,
    "thumbnail": thumbnail.asset->url,
    dataPublicacao,
    "setor": setor[]->{ nome, "slug": slug.current },
    "produtosRelacionados": produtosRelacionados[]->{ _id, nome, "slug": slug.current, "imagemPrincipalUrl": imagens[0].asset->url },
    "aplicacoesRelacionadas": aplicacoesRelacionadas[]->{ _id, nome, "slug": slug.current },
    seoTitle,
    seoDescription
  }
`

// ─── BUSCA GLOBAL ────────────────────────────────────────────────────────────

export const globalSearchQuery = groq`
  {
    "produtos": *[_type == "produto" && nome match $q + "*"] | order(nome asc) [0..4] {
      _id, "_type": "produto", nome, "slug": slug.current,
      "thumbnailUrl": imagens[0].asset->url,
      "label": categoria->nome
    },
    "servicos": *[_type == "servico" && nome match $q + "*"] | order(nome asc) [0..3] {
      _id, "_type": "servico", nome, "slug": slug.current,
      "label": categoriaServico
    },
    "aplicacoes": *[_type == "aplicacao" && nome match $q + "*"] | order(nome asc) [0..3] {
      _id, "_type": "aplicacao", nome, "slug": slug.current,
      "label": setor[0]->nome
    }
  }
`
// Parâmetros: { q: string }

// ─── CATEGORIAS (para filtros progressivos) ───────────────────────────────────

export const categoriasBySetorQuery = groq`
  *[_type == "categoria" && setor->slug.current == $setor] | order(nome asc) {
    _id,
    nome,
    "slug": slug.current,
    filtrosSecundarios
  }
`

export const subCategoriasByCategoriaQuery = groq`
  *[_type == "subCategoria" && categoria->slug.current == $categoria] | order(nome asc) {
    _id,
    nome,
    "slug": slug.current
  }
`
```

---

## 6. Estratégia de Cache e ISR por Página

### 6.1 Tabela de Estratégia

| Página | Estratégia | revalidate | Justificativa |
|---|---|---|---|
| `/` (Homepage) | ISR | 60s | Slides e destaques mudam com frequência |
| `/setores` | ISR | 300s | Setores raramente mudam |
| `/setores/[setor]` | ISR | 300s | Conteúdo editorial estável |
| `/produtos` | ISR | 60s | Filtros dependem do catálogo atual |
| `/produtos/[slug]` | ISR | 60s | Specs e preços podem ser atualizados |
| `/servicos` | ISR | 300s | Portfólio de serviços estável |
| `/servicos/[slug]` | ISR | 300s | Raramente altera |
| `/aplicacoes` | ISR | 300s | Estável |
| `/aplicacoes/[slug]` | ISR | 300s | Estável |
| `/blog` | ISR | 60s | Novos artigos publicados |
| `/blog/[slug]` | ISR | 60s | Conteúdo editorial |
| `/sobre` | Static | — | Conteúdo quase imutável |
| `/contato` | Static | — | Dados de contato raramente mudam |
| `/minha-conta` | Static | — | Página estática simples |
| `/politica-de-privacidade` | Static | — | Documento legal |
| `/api/leads` | — | — | Rota dinâmica (não cacheada) |
| `/api/datasheet` | — | — | Rota dinâmica (não cacheada) |

### 6.2 Implementação no Next.js App Router

```typescript
// Para páginas ISR
export const revalidate = 60 // segundos

// Para páginas totalmente estáticas
export const dynamic = 'force-static'

// Para generateStaticParams (SSG de rotas dinâmicas)
export async function generateStaticParams() {
  const slugs = await client.fetch(todosProdutosSlugsQuery)
  return slugs.map(({ slug }: { slug: string }) => ({ slug }))
}

// Configuração do Sanity client para diferentes contextos
// src/lib/sanity/client.ts
import { createClient } from 'next-sanity'

export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production',
  apiVersion: '2024-01-01',
  useCdn: true,           // true = edge cache (para leitura em produção)
  perspective: 'published', // apenas conteúdo publicado
})

// Client com cache bust (para ISR on-demand via webhook Sanity)
export const clientWithRevalidation = createClient({
  ...client.config(),
  useCdn: false,  // bypass CDN para revalidação imediata
  token: process.env.SANITY_API_TOKEN, // necessário para draft preview
})
```

---

## 7. API Routes — Design e Contrato

### 7.1 `POST /api/leads`

**Responsabilidades:** Receber lead, validar, enviar ao CRM, disparar e-mail de notificação.

```typescript
// src/app/api/leads/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

// Schema de validação
const leadSchema = z.object({
  nome:             z.string().min(2).max(100),
  empresa:          z.string().min(2).max(100),
  telefone:         z.string().min(10).max(20),
  email:            z.string().email(),
  produtoInteresse: z.string().max(200).optional(),
  setor:            z.string().max(100).optional(),
  mensagem:         z.string().max(1000).optional(),
  origem:           z.string().max(200).optional(),  // URL da página
  tipo:             z.enum(['orcamento', 'contato', 'datasheet']),
})

export type LeadPayload = z.infer<typeof leadSchema>

// Response types
type LeadSuccessResponse = { success: true; message: string }
type LeadErrorResponse   = { success: false; error: string; details?: unknown }

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = await req.json()
    const lead = leadSchema.parse(body)  // valida — lança ZodError se inválido

    // 1. Enviar ao CRM (com retry)
    const crmResult = await sendToCRM(lead)

    // 2. Notificação interna por e-mail
    await sendNotificationEmail(lead)

    // 3. Log do lead (fallback de segurança)
    console.log('[LEAD]', JSON.stringify({ ...lead, timestamp: new Date().toISOString() }))

    return NextResponse.json<LeadSuccessResponse>(
      { success: true, message: 'Solicitação recebida com sucesso.' },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json<LeadErrorResponse>(
        { success: false, error: 'Dados inválidos.', details: error.errors },
        { status: 400 }
      )
    }
    console.error('[LEAD ERROR]', error)
    return NextResponse.json<LeadErrorResponse>(
      { success: false, error: 'Erro interno. Tente novamente ou entre em contato pelo WhatsApp.' },
      { status: 500 }
    )
  }
}

// Funções auxiliares com retry
async function sendToCRM(lead: LeadPayload, attempt = 1): Promise<void> {
  try {
    const provider = process.env.CRM_PROVIDER // 'rdstation' | 'hubspot'
    // Implementação específica por provider...
  } catch (err) {
    if (attempt < 3) {
      await new Promise(r => setTimeout(r, 1000 * attempt))
      return sendToCRM(lead, attempt + 1)
    }
    console.error('[CRM FALLBACK] Lead não enviado ao CRM após 3 tentativas:', lead)
    // Não relança — o lead foi salvo no log; notificação por e-mail ainda será enviada
  }
}

async function sendNotificationEmail(lead: LeadPayload): Promise<void> {
  // Implementação com Resend ou SendGrid...
}
```

---

### 7.2 `GET /api/datasheet`

**Responsabilidades:** Validar acesso, opcionalmente capturar e-mail (gated), redirecionar para URL do PDF no Sanity.

```typescript
// src/app/api/datasheet/route.ts
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const slug  = searchParams.get('produto')
  const email = searchParams.get('email')  // opcional (gated)

  if (!slug) {
    return NextResponse.json({ error: 'Produto não informado.' }, { status: 400 })
  }

  // Buscar URL do datasheet no Sanity
  const produto = await client.fetch(
    groq`*[_type == "produto" && slug.current == $slug][0] { "datasheetUrl": datasheet.asset->url }`,
    { slug }
  )

  if (!produto?.datasheetUrl) {
    return NextResponse.json({ error: 'Datasheet não encontrado.' }, { status: 404 })
  }

  // Se e-mail foi fornecido (gated) → registrar lead
  if (email) {
    await sendToCRM({ email, tipo: 'datasheet', produtoInteresse: slug, nome: '', empresa: '', telefone: '' })
  }

  // Redirect para o PDF (o browser fará o download)
  return NextResponse.redirect(produto.datasheetUrl, { status: 302 })
}
```

---

## 8. State Management — Client-side

### 8.1 Estratégia por Tipo de Estado

| Estado | Onde vive | Ferramenta | Justificativa |
|---|---|---|---|
| Filtros de produto (setor, categoria, sub) | URL query params | `useSearchParams` + `useRouter` | Compartilhável, bookmarkável, histórico do browser |
| Termo de busca | Local state + URL | `useState` + `useSearchParams` | Imediato no input, persiste na URL ao submeter |
| Setor ativo (tabs homepage) | Local state | `useState` | Efêmero, não precisa persistir |
| Modal de orçamento (aberto/fechado + dados) | Context global | `OrcamentoContext` | Disparado de qualquer componente da árvore |
| Cookie consent (aceito/rejeitado) | localStorage | Custom hook | Persiste entre sessões |
| Autocomplete (resultados da busca) | Local state | `useState` + SWR/fetch | Resultados em tempo real |
| Drawer de filtros mobile (aberto/fechado) | Local state | `useState` | Totalmente local |

### 8.2 Implementação dos Filtros com URL

```typescript
// hooks/useProductFilters.ts
'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useCallback } from 'react'

export type ProductFilters = {
  setor?:       string
  categoria?:   string
  subCategoria?: string
  busca?:       string
  // filtros secundários dinâmicos (ex.: dn, conexao, precisao)
  [key: string]: string | undefined
}

export function useProductFilters() {
  const router       = useRouter()
  const pathname     = usePathname()
  const searchParams = useSearchParams()

  const filters: ProductFilters = {
    setor:        searchParams.get('setor')        ?? undefined,
    categoria:    searchParams.get('categoria')    ?? undefined,
    subCategoria: searchParams.get('subCategoria') ?? undefined,
    busca:        searchParams.get('busca')        ?? undefined,
  }

  const setFilter = useCallback(
    (key: string, value: string | undefined) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      // Quando muda setor, limpa categoria e sub-categoria
      if (key === 'setor') {
        params.delete('categoria')
        params.delete('subCategoria')
      }
      if (key === 'categoria') {
        params.delete('subCategoria')
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false })
    },
    [router, pathname, searchParams]
  )

  const clearAll = useCallback(() => {
    router.push(pathname, { scroll: false })
  }, [router, pathname])

  return { filters, setFilter, clearAll }
}
```

### 8.3 Context do Modal de Orçamento

```typescript
// contexts/OrcamentoContext.tsx
'use client'
import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type OrcamentoContextType = {
  isOpen:       boolean
  productName:  string | undefined
  setorName:    string | undefined
  openModal:    (options?: { productName?: string; setorName?: string }) => void
  closeModal:   () => void
}

const OrcamentoContext = createContext<OrcamentoContextType | null>(null)

export function OrcamentoProvider({ children }: { children: ReactNode }) {
  const [isOpen,      setIsOpen]      = useState(false)
  const [productName, setProductName] = useState<string | undefined>()
  const [setorName,   setSetorName]   = useState<string | undefined>()

  const openModal = useCallback((options?: { productName?: string; setorName?: string }) => {
    setProductName(options?.productName)
    setSetorName(options?.setorName)
    setIsOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setIsOpen(false)
    // Delay para limpar após animação de fechamento
    setTimeout(() => { setProductName(undefined); setSetorName(undefined) }, 300)
  }, [])

  return (
    <OrcamentoContext.Provider value={{ isOpen, productName, setorName, openModal, closeModal }}>
      {children}
    </OrcamentoContext.Provider>
  )
}

export function useOrcamento() {
  const ctx = useContext(OrcamentoContext)
  if (!ctx) throw new Error('useOrcamento deve ser usado dentro de OrcamentoProvider')
  return ctx
}
```

### 8.4 Hook de Debounce para Busca

```typescript
// hooks/useDebounce.ts
import { useState, useEffect } from 'react'

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}

// Uso no SmartSearchBar:
// const debouncedTerm = useDebounce(inputValue, 300)
// useEffect(() => { fetchResults(debouncedTerm) }, [debouncedTerm])
```

### 8.5 Helpers para GTM (dataLayer)

```typescript
// src/lib/gtm.ts
declare global {
  interface Window { dataLayer: Record<string, unknown>[] }
}

type GTMEvent =
  | { event: 'solicitar_orcamento'; produto: string; setor: string; pagina: string }
  | { event: 'falar_especialista';  pagina: string; setor: string }
  | { event: 'download_datasheet';  produto: string; arquivo: string }
  | { event: 'whatsapp_click';      pagina: string }
  | { event: 'filtro_aplicado';     setor: string; categoria: string; filtro: string }
  | { event: 'busca_realizada';     termo: string }
  | { event: 'slide_interacao';     slide: string; tipo: string }
  | { event: 'setor_selecionado';   setor: string }

export function pushGTMEvent(eventData: GTMEvent): void {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer ?? []
  window.dataLayer.push(eventData)
}
```

---

## 9. Performance Architecture

### 9.1 Configuração `next/image` por Contexto

```typescript
// HERO DO CARROSSEL (LCP crítico — slide 1)
<Image
  src={slide.imagemUrl}
  alt={slide.titulo}
  fill
  priority={index === 0}        // priority APENAS no primeiro slide
  sizes="100vw"
  quality={90}
  className="object-cover"
/>

// CARD DE PRODUTO (grid: 3col desktop, 2 tablet, 1 mobile)
<Image
  src={product.imagemPrincipalUrl}
  alt={product.nome}
  width={400}
  height={300}
  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
  quality={80}
  className="object-cover"
/>

// GALERIA DO PRODUTO (imagem principal)
<Image
  src={imagens[activeIndex]}
  alt={`${productName} - Imagem ${activeIndex + 1}`}
  width={600}
  height={500}
  sizes="(max-width: 768px) 100vw, 50vw"
  quality={85}
  priority={activeIndex === 0}
  className="object-contain"
/>

// THUMBNAIL DE GALERIA (miniaturas)
<Image
  src={imagem}
  alt={`Miniatura ${i + 1}`}
  width={80}
  height={60}
  sizes="80px"
  quality={70}
/>

// ÍCONE DE SETOR (pequeno)
<Image
  src={setor.iconeUrl}
  alt={setor.nome}
  width={48}
  height={48}
  sizes="48px"
/>

// IMAGEM DE FUNDO DA SEÇÃO DE SETORES (backdrop)
<Image
  src={selectedSetor.imagemPrincipalUrl}
  alt=""                        // decorativa
  fill
  sizes="100vw"
  quality={75}
  className="object-cover blur-sm"
/>

// THUMBNAIL DE ARTIGO DO BLOG
<Image
  src={artigo.thumbnail}
  alt={artigo.titulo}
  width={400}
  height={225}
  sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
  quality={80}
/>
```

### 9.2 Estratégia de Preload

```typescript
// app/(site)/layout.tsx — preload da fonte e dos primeiros assets críticos
import { Inter, Outfit } from 'next/font/google'

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  preload: true,
})

const outfit = Outfit({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-outfit',
  weight: ['600', '700', '800'],
  preload: true,
})
```

### 9.3 Code Splitting — Lazy Loading de Componentes

```typescript
// Componentes pesados com lazy loading
import dynamic from 'next/dynamic'

// Carrossel (Embla) — client-only, não bloqueia SSR
const HeroCarouselDynamic = dynamic(
  () => import('@/components/home/HeroCarousel'),
  { ssr: false, loading: () => <HeroCarouselSkeleton /> }
)

// Modal de Orçamento — carregado apenas quando necessário
const OrcamentoModal = dynamic(
  () => import('@/components/global/OrcamentoModal'),
  { ssr: false }
)

// Mapa do Google (Contato) — pesado, carregar late
const GoogleMap = dynamic(
  () => import('@/components/contato/GoogleMap'),
  { ssr: false, loading: () => <div className="h-64 bg-neutral-100 animate-pulse rounded-xl" /> }
)

// Vídeo do produto — carregar somente na aba "Vídeo"
const ProductVideo = dynamic(
  () => import('@/components/produtos/ProductVideo'),
  { ssr: false }
)
```

### 9.4 Suspense e Loading States

```typescript
// app/(site)/produtos/page.tsx
import { Suspense } from 'react'

export default function ProdutosPage() {
  return (
    <>
      <ProductsHero />
      <ProductSearchBar />
      <PrimaryFilters />  {/* Client, leve */}
      <div className="flex gap-8">
        <FiltersSidebar />  {/* Client, leve */}
        <Suspense fallback={<ProductsGridSkeleton />}>
          <ProductsGrid />  {/* Server, pode demorar (fetch Sanity) */}
        </Suspense>
      </div>
    </>
  )
}
```

---

## 10. Configuração do tailwind.config.ts

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50:  '#EFF6FF', 100: '#DBEAFE', 200: '#BFDBFE',
          300: '#93C5FD', 400: '#60A5FA', 500: '#3B82F6',
          600: '#2563EB', 700: '#1D4ED8', 800: '#1E40AF', 900: '#1E3A8A',
        },
        secondary: {
          400: '#FB923C', 500: '#F97316', 600: '#EA580C',
        },
        neutral: {
          50:  '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0',
          300: '#CBD5E1', 400: '#94A3B8', 500: '#64748B',
          600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A',
        },
        success: { 500: '#22C55E' },
        warning: { 500: '#EAB308' },
        error:   { 500: '#EF4444' },
      },
      fontFamily: {
        sans:    ['var(--font-inter)', 'sans-serif'],
        display: ['var(--font-outfit)', 'sans-serif'],
        mono:    ['JetBrains Mono', 'monospace'],
      },
      maxWidth: {
        container: '1440px',
      },
      screens: {
        'xs':   '375px',
        'sm':   '640px',
        'md':   '768px',
        'lg':   '1024px',
        'xl':   '1280px',
        '2xl':  '1440px',
      },
      boxShadow: {
        'card':       '0 1px 3px rgba(0,0,0,0.08), 0 4px 12px rgba(0,0,0,0.06)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.08)',
        'modal':      '0 20px 60px rgba(0,0,0,0.3)',
        'header':     '0 2px 8px rgba(0,0,0,0.08)',
        'dropdown':   '0 8px 24px rgba(0,0,0,0.12)',
        'button':     '0 2px 4px rgba(37, 99, 235, 0.3)',
      },
      borderRadius: {
        'card':   '12px',
        'input':  '8px',
        'button': '8px',
        'badge':  '6px',
      },
      animation: {
        'fade-in':       'fadeIn 0.3s ease-in-out',
        'fade-in-up':    'fadeInUp 0.4s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-slow':    'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn:      { from: { opacity: '0' },                             to: { opacity: '1' } },
        fadeInUp:    { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideInLeft: { from: { opacity: '0', transform: 'translateX(-16px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
      },
      zIndex: {
        'dropdown': '100',
        'sticky':   '200',
        'overlay':  '300',
        'modal':    '400',
        'toast':    '500',
        'cookie':   '600',
        'whatsapp': '700',
      },
      transitionDuration: {
        'fast':   '100ms',
        'normal': '200ms',
        'slow':   '350ms',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),   // Para o blog (portableText)
    require('@tailwindcss/forms'),         // Reset de inputs
    require('@tailwindcss/line-clamp'),    // line-clamp para descrições de card
  ],
}

export default config
```

---

*Documento gerado em 2026-02-23 — Etapa 4 — Arquitetura Técnica.*
*Próxima etapa: Etapa 5 — Frontend Design (Protótipo Visual / UI Kit / Componentes Prioritários)*
