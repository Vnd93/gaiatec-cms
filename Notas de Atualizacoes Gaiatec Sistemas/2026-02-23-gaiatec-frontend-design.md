# Frontend Design — GAIATEC SISTEMAS Website
**Data:** 2026-02-23
**Versão:** 1.0
**Etapa:** 5 de N — UI Kit, Protótipos, Especificações Visuais

---

## Direção Estética

**Tom:** Industrial refinado — precisão técnica com autoridade visual.
**Conceito:** O site deve transmitir a sensação de um painel de controle de alta precisão. Azul profundo como estrutura principal (confiança, tecnologia, indústria), laranja como sinal de ação (alertas, CTAs, destaques). Tipografia robusta nos títulos, leitura clara no corpo.
**O que o visitante deve sentir:** "Esta empresa sabe o que faz. Posso confiar."
**O que NÃO fazer:** gradientes pastéis, rounded excessivos, ícones ilustrativos fofinhos, tom startup.

---

## Sumário

1. [UI Kit — Componentes Atômicos](#1-ui-kit--componentes-atômicos)
2. [Componentes de Layout — Header e Footer](#2-componentes-de-layout--header-e-footer)
3. [Seções da Homepage](#3-seções-da-homepage)
4. [Páginas de Alta Prioridade](#4-páginas-de-alta-prioridade)
5. [Componentes Globais Críticos](#5-componentes-globais-críticos)

---

## 1. UI Kit — Componentes Atômicos

### 1.1 Button

#### Protótipo ASCII — Variantes

```
PRIMARY (solid)       SECONDARY (outline)    GHOST             DESTRUCTIVE
┌──────────────────┐  ┌──────────────────┐   ──────────────    ┌──────────────────┐
│ Solicitar Orçam. │  │ Solicitar Orçam. │  Falar c/ Espec.   │ Remover Produto  │
└──────────────────┘  └──────────────────┘   ──────────────    └──────────────────┘
bg-primary-600        border-primary-600      text-primary-600  bg-error-500
text-white            text-primary-600        hover:bg-prim-50  text-white

TAMANHOS:
[sm: px-3 py-1.5 text-sm]   [md: px-5 py-2.5 text-sm]   [lg: px-7 py-3.5 text-base]

ESTADOS:
Normal   → Hover     → Active    → Disabled   → Loading
───────    ───────     ───────     ───────       ───────
solid      darker      darker+     opacity-50    spinner
           -700        scale .98   cursor-not    + disabled
```

#### Código de Implementação

```typescript
// src/components/ui/Button.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

const buttonVariants = cva(
  // Base — aplicado em TODAS as variantes
  [
    'inline-flex items-center justify-center gap-2',
    'font-semibold font-sans tracking-wide',
    'rounded-button border-2',
    'transition-all duration-normal',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.98]',
  ],
  {
    variants: {
      variant: {
        primary: [
          'bg-primary-600 border-primary-600 text-white',
          'hover:bg-primary-700 hover:border-primary-700',
          'shadow-button',
        ],
        secondary: [
          'bg-transparent border-primary-600 text-primary-600',
          'hover:bg-primary-50',
        ],
        ghost: [
          'bg-transparent border-transparent text-primary-600',
          'hover:bg-primary-50 hover:border-primary-50',
        ],
        outline: [
          'bg-transparent border-neutral-300 text-neutral-700',
          'hover:border-neutral-400 hover:bg-neutral-50',
        ],
        destructive: [
          'bg-error-500 border-error-500 text-white',
          'hover:bg-red-600 hover:border-red-600',
        ],
      },
      size: {
        sm:  'px-3 py-1.5 text-sm h-8',
        md:  'px-5 py-2.5 text-sm h-10',
        lg:  'px-7 py-3.5 text-base h-12',
        icon:'w-10 h-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size:    'md',
    },
  }
)

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export function Button({ variant, size, loading, leftIcon, rightIcon, children, className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
}
```

---

### 1.2 Badge

#### Protótipo ASCII

```
[● Saneamento]   [Medição de Vazão]   [★ Mais pedido]   [✦ Novo]   [○ Em breve]
bg-blue-100      bg-neutral-100       bg-secondary-100  bg-green   bg-yellow
text-blue-800    text-neutral-700     text-orange-800   text-green  text-yellow-800
rounded-full     rounded-badge        rounded-badge
```

#### Código de Implementação

```typescript
// src/components/ui/Badge.tsx
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 font-medium font-sans text-xs tracking-wide rounded-badge px-2.5 py-1 whitespace-nowrap',
  {
    variants: {
      variant: {
        setor: [
          'bg-primary-50 text-primary-700 border border-primary-200',
        ],
        categoria: [
          'bg-neutral-100 text-neutral-600 border border-neutral-200',
        ],
        destaque: [
          'bg-secondary-100 text-secondary-700 border border-secondary-200',
        ],
        novo: [
          'bg-emerald-50 text-emerald-700 border border-emerald-200',
        ],
        'em-breve': [
          'bg-warning-50 text-yellow-700 border border-yellow-200',
        ],
        certificacao: [
          'bg-primary-900 text-white border border-primary-800',
        ],
      },
    },
    defaultVariants: { variant: 'setor' },
  }
)

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  icon?: React.ReactNode
}

export function Badge({ variant, icon, children, className, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {icon}
      {children}
    </span>
  )
}
```

---

### 1.3 Cards

#### Protótipo ASCII — ProductCard

```
DESKTOP (3 colunas)                      HOVER STATE
┌─────────────────────────────────┐      ┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │      │ ┌─────────────────────────────┐ │
│ │                             │ │      │ │    [imagem zoom leve]        │ │
│ │      [imagem produto]       │ │  →   │ │                             │ │
│ │         240px h             │ │      │ │         240px h             │ │
│ │                      [NOVO] │ │      │ │                      [NOVO] │ │
│ └─────────────────────────────┘ │      └─────────────────────────────────┘
│ [● Saneamento]                  │      border-primary-300 (top highlight)
│                                 │      shadow-card-hover
│ GatSonic P-Clamp                │
│ Ultrassônico                    │
│                                 │
│ Macromedidor ultrassônico para  │
│ instalação externa sem corte... │
│                                 │
│          [Ver Detalhes →]       │
└─────────────────────────────────┘
border border-neutral-200 rounded-card shadow-card
```

#### Código de Implementação — ProductCard

```typescript
// src/components/produtos/ProductCard.tsx
import Image from 'next/image'
import Link from 'next/link'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ArrowRight } from 'lucide-react'
import type { ProdutoCard } from '@/types/sanity.types'

interface ProductCardProps {
  product: ProdutoCard
  priority?: boolean
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  return (
    <Link
      href={`/produtos/${product.slug}`}
      className={[
        'group flex flex-col',
        'bg-white border border-neutral-200 rounded-card shadow-card',
        'hover:shadow-card-hover hover:border-primary-200',
        'transition-all duration-normal overflow-hidden',
      ].join(' ')}
    >
      {/* Imagem */}
      <div className="relative h-56 overflow-hidden bg-neutral-50">
        <Image
          src={product.imagemPrincipalUrl}
          alt={product.nome}
          fill
          priority={priority}
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          quality={80}
          className="object-contain p-4 transition-transform duration-slow group-hover:scale-105"
        />
        {/* Badge de destaque (canto superior direito) */}
        {product.badgeDestaque && (
          <span className="absolute top-3 right-3">
            <Badge variant={product.badgeDestaque === 'Novo' ? 'novo' : 'destaque'}>
              {product.badgeDestaque === 'Novo' ? '✦ Novo' : '★ Mais pedido'}
            </Badge>
          </span>
        )}
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col flex-1 p-5 gap-3">
        {/* Setor badge */}
        {product.setor?.[0] && (
          <Badge variant="setor">{product.setor[0].nome}</Badge>
        )}

        {/* Nome */}
        <h3 className="font-display font-bold text-neutral-800 text-lg leading-tight line-clamp-2 group-hover:text-primary-700 transition-colors duration-normal">
          {product.nome}
        </h3>

        {/* Categoria */}
        {product.categoria && (
          <p className="text-xs font-medium text-neutral-400 uppercase tracking-widest">
            {product.categoria.nome}
          </p>
        )}

        {/* Descrição */}
        <p className="text-sm text-neutral-600 leading-relaxed line-clamp-2 flex-1">
          {product.descricaoResumida}
        </p>

        {/* CTA */}
        <div className="flex items-center justify-end mt-1">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-600 group-hover:gap-2.5 transition-all duration-normal">
            Ver Detalhes
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* Borda de destaque inferior no hover */}
      <div className="h-0.5 w-0 bg-primary-600 group-hover:w-full transition-all duration-slow" />
    </Link>
  )
}
```

#### Protótipo ASCII — ServiceCard

```
┌─────────────────────────────────┐
│  ┌────┐                         │
│  │ ⚙  │  Calibração RBC         │   ← ícone SVG 48px + nome
│  └────┘  [● Saneamento]         │
│                                 │
│  Calibração laboratorial        │
│  acreditada pelo INMETRO com    │   ← 2 linhas max
│  certificado RBC.               │
│                                 │
│          [Ver Detalhes →]       │
└─────────────────────────────────┘
hover: ícone muda de neutral-500 → primary-600
       sombra eleva: shadow-card → shadow-card-hover
```

#### Protótipo ASCII — SetorCard

```
┌─────────────────────────────────┐
│ ┌─────────────────────────────┐ │
│ │                             │ │
│ │    [imagem do setor]        │ │  160px h
│ │                             │ │
│ └─────────────────────────────┘ │
│                                 │
│  💧 Saneamento                  │  ← ícone + título H3
│                                 │
│  Soluções completas para redes  │
│  de distribuição de água...     │
│                                 │
│  [Vazão] [Nível] [Qualidade]    │  ← aplicações como badges clicáveis
│                                 │
│  ──────────────────────────     │
│  [Ver Setor →]                  │
└─────────────────────────────────┘
```

---

### 1.4 Input + Label + FieldError

```typescript
// src/components/ui/FormField.tsx
import { cn } from '@/lib/utils'
import { AlertCircle } from 'lucide-react'

interface FormFieldProps {
  label:       string
  id:          string
  error?:      string
  required?:   boolean
  className?:  string
  children:    React.ReactNode
}

export function FormField({ label, id, error, required, className, children }: FormFieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-sm font-medium text-neutral-700 font-sans"
      >
        {label}
        {required && <span className="text-error-500 ml-1" aria-hidden="true">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1.5 text-xs text-error-500 font-sans" role="alert">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

// Classes do Input (aplicar via register do React Hook Form)
export const inputClasses = [
  'w-full px-4 py-2.5',
  'bg-white border border-neutral-300 rounded-input',
  'text-sm text-neutral-800 font-sans placeholder:text-neutral-400',
  'transition-colors duration-fast',
  'hover:border-neutral-400',
  'focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-100',
  'aria-[invalid=true]:border-error-500 aria-[invalid=true]:focus:ring-red-100',
  'disabled:bg-neutral-50 disabled:text-neutral-400 disabled:cursor-not-allowed',
].join(' ')

// Select
export const selectClasses = cn(inputClasses, 'cursor-pointer appearance-none bg-no-repeat bg-[right_12px_center]')

// Textarea
export const textareaClasses = cn(inputClasses, 'resize-none min-h-[100px]')
```

---

### 1.5 Modal

```typescript
// src/components/ui/Modal.tsx
'use client'
import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ModalProps {
  isOpen:      boolean
  onClose:     () => void
  title:       string
  description?: string
  size?:       'sm' | 'md' | 'lg' | 'xl'
  children:    React.ReactNode
}

const sizeClasses = {
  sm:  'max-w-md',
  md:  'max-w-lg',
  lg:  'max-w-2xl',
  xl:  'max-w-4xl',
}

export function Modal({ isOpen, onClose, title, description, size = 'md', children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  // Fechar com Escape
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (isOpen) {
      dialog.showModal()
      document.body.style.overflow = 'hidden'
    } else {
      dialog.close()
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    // Overlay
    <div
      className="fixed inset-0 z-modal bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Container */}
      <div
        className={cn(
          'relative w-full bg-white rounded-card shadow-modal',
          'animate-fade-in-up',
          sizeClasses[size]
        )}
      >
        {/* Header do modal */}
        <div className="flex items-start justify-between p-6 border-b border-neutral-200">
          <div>
            <h2 className="font-display font-bold text-xl text-neutral-900">{title}</h2>
            {description && (
              <p className="text-sm text-neutral-500 mt-1 font-sans">{description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            className="ml-4 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  )
}
```

---

### 1.6 Tabs

```typescript
// src/components/ui/Tabs.tsx
'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

interface Tab { id: string; label: string; icon?: React.ReactNode }

interface TabsProps {
  tabs:         Tab[]
  defaultTab?:  string
  onChange?:    (tabId: string) => void
  variant?:     'underline' | 'pills'
  children:     (activeTab: string) => React.ReactNode
}

export function Tabs({ tabs, defaultTab, onChange, variant = 'underline', children }: TabsProps) {
  const [active, setActive] = useState(defaultTab ?? tabs[0]?.id)

  const handleChange = (id: string) => {
    setActive(id)
    onChange?.(id)
  }

  return (
    <div>
      {/* Lista de tabs */}
      <div
        role="tablist"
        className={cn(
          'flex gap-0 overflow-x-auto scrollbar-none',
          variant === 'underline' && 'border-b border-neutral-200',
          variant === 'pills'     && 'gap-2 p-1 bg-neutral-100 rounded-lg w-fit'
        )}
      >
        {tabs.map((tab) => {
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => handleChange(tab.id)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap font-sans font-medium text-sm',
                'transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500',
                variant === 'underline' && [
                  'px-4 py-3 border-b-2 -mb-px',
                  isActive
                    ? 'border-primary-600 text-primary-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800 hover:border-neutral-300',
                ],
                variant === 'pills' && [
                  'px-4 py-2 rounded-md',
                  isActive
                    ? 'bg-white text-neutral-900 shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-700',
                ]
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Conteúdo da tab ativa */}
      <div role="tabpanel" className="mt-6 animate-fade-in">
        {children(active)}
      </div>
    </div>
  )
}
```

---

### 1.7 Accordion (FAQ)

```typescript
// src/components/ui/Accordion.tsx
'use client'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccordionItem { id: string; question: string; answer: string }

export function Accordion({ items }: { items: AccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  return (
    <div className="divide-y divide-neutral-200 border border-neutral-200 rounded-card overflow-hidden">
      {items.map((item) => {
        const isOpen = openId === item.id
        return (
          <div key={item.id}>
            <button
              onClick={() => setOpenId(isOpen ? null : item.id)}
              aria-expanded={isOpen}
              className={cn(
                'w-full flex items-center justify-between gap-4',
                'px-5 py-4 text-left',
                'font-sans font-semibold text-sm text-neutral-800',
                'hover:bg-neutral-50 transition-colors duration-fast',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500',
                isOpen && 'bg-primary-50 text-primary-700'
              )}
            >
              {item.question}
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-normal', isOpen && 'rotate-180 text-primary-600')} />
            </button>
            {isOpen && (
              <div className="px-5 py-4 bg-neutral-50 text-sm text-neutral-600 font-sans leading-relaxed animate-fade-in-up">
                {item.answer}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
```

---

### 1.8 Skeleton (Loading State)

```typescript
// src/components/ui/Skeleton.tsx
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('animate-pulse rounded bg-neutral-200', className)} />
  )
}

// ProductCard Skeleton
export function ProductCardSkeleton() {
  return (
    <div className="bg-white border border-neutral-200 rounded-card overflow-hidden">
      <Skeleton className="h-56 w-full rounded-none" />
      <div className="p-5 flex flex-col gap-3">
        <Skeleton className="h-5 w-24 rounded-badge" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <div className="flex justify-end mt-1">
          <Skeleton className="h-5 w-24" />
        </div>
      </div>
    </div>
  )
}

// ProductsGrid Skeleton (3 colunas)
export function ProductsGridSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  )
}
```

---

## 2. Componentes de Layout — Header e Footer

### 2.1 Header Desktop — Com Megamenu Aberto

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [GAIATEC LOGO]  HOME  SETORES ▼  PRODUTOS ▼  SERVIÇOS  APLICAÇÕES  BLOG  A GAIATEC  👤    │  ← nav principal
│                                             [🔍 Buscar produtos...]  [Solicitar Orçamento] │  ← 44px altura
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  ✔ RBC Acreditado  │  ✔ INMETRO Homologado  │  ✔ ISO  │  +20 anos de experiência  │  11 Setores  │  ← faixa credibilidade
└───────────────────────────────────────────────────────────────────────────────────────────┘

MEGAMENU (ao hover em "SETORES"):
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [GAIATEC LOGO]  HOME  [SETORES ▲]  PRODUTOS ▼  ...                [🔍]  [Solicitar Orç.]  │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│ │  SETORES ATENDIDOS                                                                   │  │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐│  │
│ │  │ 💧       │  │ 🛢        │  │ 🌿       │  │ ⚡       │  │ 🌡        │  │ 🌍       ││  │
│ │  │Saneamento│  │Gás e     │  │Biogás e  │  │Proteção  │  │ HVAC     │  │Controle  ││  │
│ │  │          │  │Petróleo  │  │Biometano │  │Catódica  │  │          │  │Ambiental ││  │
│ │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘│  │
│ │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐              │  │
│ │  │ 🔒       │  │ 🌾       │  │ 🏭       │  │ 📡       │  │ 🔧       │              │  │
│ │  │Segurança │  │Agroneg.  │  │Indústria │  │Telemetria│  │Instrumen.│              │  │
│ │  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘              │  │
│ └──────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Código Header

```typescript
// src/components/layout/Header.tsx
import Link from 'next/link'
import Image from 'next/image'
import { HeaderNav } from './HeaderNav'
import { CredibilityBar } from './CredibilityBar'

export function Header() {
  return (
    <header className="sticky top-0 z-sticky w-full">
      {/* Barra principal */}
      <div className="bg-primary-900 shadow-header transition-all duration-normal">
        <div className="max-w-container mx-auto px-6 h-16 flex items-center justify-between gap-6">
          {/* Logo */}
          <Link href="/" className="shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary-900 rounded">
            <Image
              src="/logo-gaiatec-white.svg"
              alt="GAIATEC SISTEMAS"
              width={160}
              height={36}
              priority
            />
          </Link>

          {/* Nav (Client — hover states do megamenu) */}
          <HeaderNav />

          {/* Busca + CTA */}
          <div className="flex items-center gap-3 shrink-0">
            <HeaderSearchTrigger />
            <OrcamentoCTAButton />
          </div>
        </div>
      </div>

      {/* Faixa de credibilidade (desktop only) */}
      <CredibilityBar />
    </header>
  )
}

// CredibilityBar
export function CredibilityBar() {
  const items = [
    '✔ RBC Acreditado',
    '✔ INMETRO Homologado',
    '✔ ISO',
    '+20 anos de experiência',
    '11 Setores Atendidos',
  ]
  return (
    <div className="hidden md:flex bg-primary-800 border-t border-primary-700">
      <div className="max-w-container mx-auto px-6 h-8 flex items-center gap-6 overflow-x-auto scrollbar-none">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-6 text-xs text-primary-200 font-sans font-medium whitespace-nowrap">
            {i > 0 && <span className="text-primary-600 select-none">│</span>}
            {item}
          </span>
        ))}
      </div>
    </div>
  )
}
```

---

### 2.2 Header Mobile — Drawer Aberto

```
┌──────────────────────────────────┐
│ [GAIATEC LOGO]            [☰]   │  ← header mobile 60px
└──────────────────────────────────┘

DRAWER (desliza da esquerda):
┌──────────────────────────────────┐
│ [GAIATEC LOGO]             [✕]  │  ← header do drawer
├──────────────────────────────────┤
│                                  │
│ ○ Home                           │
│                                  │
│ ○ Setores                    ›   │
│   └─ Saneamento                  │  ← expand inline
│   └─ Gás e Petróleo              │
│   └─ Biogás e Biometano          │
│   └─ + 8 mais...                 │
│                                  │
│ ○ Produtos                   ›   │
│ ○ Serviços                       │
│ ○ Aplicações                     │
│ ○ Blog                           │
│ ○ A GAIATEC                      │
│ ○ Minha Conta (Em breve)         │
│                                  │
├──────────────────────────────────┤
│ [WhatsApp]  [Solicitar Orçamento]│  ← CTAs fixos no bottom
└──────────────────────────────────┘
bg-white, width: 320px, shadow-modal
overlay: bg-black/50
```

---

### 2.3 Footer

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ bg-primary-900                                                                              │
│                                                                                             │
│ [GAIATEC LOGO]                                                                              │
│ Soluções técnicas em instrumentação                                                         │
│ industrial desde 2004.                                                                      │
│                                                                                             │
│ [LinkedIn] [Instagram] [YouTube]                                                            │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  SETORES           PRODUTOS           SERVIÇOS           EMPRESA                           │
│  Saneamento        Medição Vazão       Instalação         A GAIATEC                        │
│  Gás e Petróleo    Detecção Gases      Calibração RBC     Blog                             │
│  Biogás            Nível              Manutenção         Aplicações                        │
│  Proteção Cat.     Pressão            Consultoria        Contato                           │
│  HVAC              Temperatura        Medições           Política Privacidade              │
│  + 6 setores       Ver catálogo        Ver todos                                            │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                             │
│  [RBC]  [INMETRO]  [ISO]                     GAIATEC SISTEMAS LTDA                         │
│                                              CNPJ: XX.XXX.XXX/0001-XX                      │
│                                              Endereço completo                              │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│  © 2026 GAIATEC SISTEMAS. Todos os direitos reservados.   Política de Privacidade          │
└────────────────────────────────────────────────────────────────────────────────────────────┘
text-neutral-400 base, text-white para títulos de seção
links: text-neutral-400 hover:text-white transition
```

---

## 3. Seções da Homepage

### 3.1 Hero Carrossel — Desktop

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                             │
│                                                                                             │
│  [IMAGEM DE CAMPO — FULL WIDTH, 580px HEIGHT]                                              │
│  overlay: linear-gradient(to top, rgba(15,23,42,0.85) 0%, rgba(15,23,42,0.3) 60%, transparent 100%)
│                                                                                             │
│                                                                                             │
│   SANEAMENTO                        ← overline: text-secondary-400, tracking-widest, uppercase │
│                                                                                             │
│   Macromedição Ultrassônica         ← H1: font-display, text-5xl lg:text-6xl, text-white   │
│   para Redes de Distribuição                                                                │
│                                                                                             │
│   Tecnologia não-invasiva para monitoramento ← text-lg text-white/80, max-w-lg            │
│   preciso de vazão em grandes diâmetros.                                                    │
│                                                                                             │
│   [Ver Produto →]  [Falar com Especialista]  ← CTAs                                       │
│                                                                                             │
│   ●  ○  ○  ○  ○                             ← dots de controle, canto inferior esquerdo   │
│                          [‹]   [›]           ← setas, canto inferior direito               │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Código HeroSlide

```typescript
// src/components/home/HeroSlide.tsx
import Image from 'next/image'
import { Button } from '@/components/ui/Button'
import { ArrowRight } from 'lucide-react'
import type { SlideCarrossel } from '@/types/sanity.types'

export function HeroSlide({ slide, isActive, priority }: { slide: SlideCarrossel; isActive: boolean; priority: boolean }) {
  return (
    <div
      className={[
        'relative w-full flex-shrink-0 h-[520px] md:h-[600px] lg:h-[640px]',
        'transition-opacity duration-slow',
        isActive ? 'opacity-100' : 'opacity-0 pointer-events-none absolute inset-0',
      ].join(' ')}
      aria-hidden={!isActive}
    >
      {/* Imagem de fundo */}
      <Image
        src={slide.imagemUrl}
        alt={slide.titulo}
        fill
        priority={priority}
        sizes="100vw"
        quality={90}
        className="object-cover"
      />

      {/* Overlay gradiente */}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(to top, rgba(15,23,42,0.88) 0%, rgba(15,23,42,0.4) 55%, transparent 100%)' }}
      />

      {/* Conteúdo sobreposto */}
      <div className="relative z-10 h-full max-w-container mx-auto px-6 flex flex-col justify-end pb-16 md:pb-20">
        {/* Overline */}
        <p className="text-secondary-400 text-xs md:text-sm font-semibold tracking-widest uppercase mb-3 font-sans">
          {slide.overline ?? 'GAIATEC SISTEMAS'}
        </p>

        {/* Título */}
        <h2 className="font-display font-extrabold text-white text-4xl md:text-5xl lg:text-6xl leading-tight max-w-2xl mb-4">
          {slide.titulo}
        </h2>

        {/* Subtítulo */}
        {slide.subtitulo && (
          <p className="text-white/80 text-base md:text-lg font-sans leading-relaxed max-w-xl mb-8">
            {slide.subtitulo}
          </p>
        )}

        {/* CTAs */}
        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            size="lg"
            rightIcon={<ArrowRight className="h-5 w-5" />}
            onClick={() => window.location.href = slide.ctaHref}
          >
            {slide.ctaTexto}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="border-white text-white hover:bg-white/10 hover:border-white"
          >
            Falar com Especialista
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

### 3.2 Barra de Busca Inteligente

```
DESKTOP:
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  bg-white, shadow-lg, border-t-4 border-primary-600, rounded-b-2xl, max-w-4xl, mx-auto    │
│  -mt-8 (sobrepõe ligeiramente o hero — z-10)                                               │
│                                                                                             │
│  ┌────────────────────────────────────────────────────────────────────────┐  ┌──────────┐ │
│  │ 🔍  O que você está buscando? (produto, serviço, aplicação...)         │  │  Buscar  │ │
│  └────────────────────────────────────────────────────────────────────────┘  └──────────┘ │
│                                                                                             │
│  [Setor ▼]           [Categoria ▼]           [Tecnologia ▼]                                │
│  Todos os setores    Todas as categorias      Todas as tecnologias                          │
└────────────────────────────────────────────────────────────────────────────────────────────┘

AUTOCOMPLETE (aberto):
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  🔍  gatsonic p-clamp                                                          [×] [Buscar] │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  PRODUTOS                                                                             │  │
│  │  ┌──────┐  GatSonic P-Clamp                          Medição de Vazão / Saneamento   │  │
│  │  │ IMG  │  Macromedidor ultrassônico não-invasivo                                    │  │
│  │  └──────┘                                                                             │  │
│  │  SERVIÇOS                                                                             │  │
│  │  ⚙  Instalação de Macromedidores                     Saneamento                      │  │
│  │  APLICAÇÕES                                                                           │  │
│  │  ◈  Controle de Perdas em Redes de Água              Saneamento                      │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

```typescript
// src/components/home/SmartSearchBar.tsx — estrutura visual
// bg-white border-t-4 border-primary-600 rounded-b-2xl shadow-xl
// relative z-10 -mt-8 max-w-4xl mx-auto px-6 pt-6 pb-5
//
// Input: rounded-xl border border-neutral-200 h-12 pl-11 pr-4 text-base
// Ícone lupa: absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400
// Botão buscar: h-12 px-8 bg-primary-600 text-white rounded-xl font-semibold
//
// Filtros progressivos:
// mt-4 flex flex-wrap gap-3
// Cada select: h-10 px-4 text-sm border border-neutral-200 rounded-lg bg-white
// Placeholder: text-neutral-500, selecionado: text-neutral-800
//
// Resultado autocomplete:
// absolute top-full left-0 right-0 bg-white border border-neutral-200
// rounded-xl shadow-dropdown mt-2 z-dropdown overflow-hidden
// max-h-96 overflow-y-auto
```

---

### 3.3 Seção Setores Interativos

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  bg-neutral-50, py-24                                                                       │
│                                                                                             │
│  SETORES ATENDIDOS                  ← overline: secondary-500, tracking-widest uppercase   │
│  Soluções especializadas para cada setor da indústria                                       │
│                                                                                             │
│  [Saneamento] [Gás e Pet.] [Biogás] [Prot.Cat.] [HVAC] [Amb.] [Segur.] [Agro] [Ind.] [...]  ← tabs
│   ───────────                       ← underline ativo: primary-600, 3px                    │
│                                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│  │  [IMAGEM DO SETOR SELECIONADO — com backdrop-blur e overlay primary-900/70]          │  │
│  │  480px height                                                                         │  │
│  │                                                                                       │  │
│  │   ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐                   │  │
│  │   │ 💧         │  │ 📊         │  │ 🔬          │  │ 📡         │                   │  │
│  │   │ Medição    │  │ Qualidade  │  │ Detecção   │  │ Telemetria │                   │  │
│  │   │ de Vazão   │  │ da Água    │  │ de Gases   │  │            │                   │  │
│  │   └────────────┘  └────────────┘  └────────────┘  └────────────┘                   │  │
│  │   cards: bg-white/10 backdrop-blur border border-white/20                            │  │
│  │   hover: bg-white/20 scale-[1.04] shadow-lg                                          │  │
│  └──────────────────────────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

### 3.4 Seção Produtos em Destaque

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  bg-white, py-24                                                                            │
│                                                                                             │
│  PRODUTOS EM DESTAQUE               ← overline secondary-500                               │
│  Alta performance para sua operação                                                         │
│                                                                                             │
│  [Geral] [Saneamento] [Gás e Pet.] [Biogás] [Telemetria]    ← Pills variant               │
│   ● ativo                                                                                   │
│                                                                                             │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐           │
│  │  produto   │  │  produto   │  │  produto   │  │  produto   │  │  produto   │           │
│  │   card     │  │   card     │  │   card     │  │   card     │  │   card     │           │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘  └────────────┘           │
│  5 colunas desktop → 2 tablet → carrossel mobile                                           │
│                                                                                             │
│                    [Ver Todos os Produtos →]                                                │
└────────────────────────────────────────────────────────────────────────────────────────────┘
transição entre setores: opacity-0 → opacity-100 (200ms)
```

---

### 3.5 Seção "Por que GAIATEC"

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  bg-primary-900, py-24                                                                      │
│                                                                                             │
│  Por que escolher a GAIATEC SISTEMAS?    ← font-display, text-3xl, text-white              │
│  Mais de duas décadas de excelência técnica e inovação industrial.                          │
│                                                                                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │
│  │                 │  │                 │  │                 │  │                 │       │
│  │   +20           │  │   11            │  │   +500          │  │   RBC           │       │
│  │   anos          │  │   setores       │  │   biodigestores │  │   Acreditado    │       │
│  │   counter anim. │  │   counter anim. │  │   instalados    │  │   Certificação  │       │
│  │                 │  │                 │  │                 │  │   Oficial       │       │
│  │ De experiência  │  │ Atendidos com   │  │ Instalados em   │  │ INMETRO + ISO   │       │
│  │ em instrumen.   │  │ soluções ded.   │  │ todo o Brasil   │  │                 │       │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  └─────────────────┘       │
│  4 colunas desktop → 2 tablet → 1 mobile                                                   │
│  bg-primary-800, border border-primary-700, rounded-card                                   │
│  número: font-display text-5xl font-extrabold text-secondary-400                           │
│  label:  text-lg font-semibold text-white mt-1                                             │
│  desc:   text-sm text-primary-200 mt-2                                                     │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

```typescript
// src/components/home/AnimatedCounter.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver'

interface AnimatedCounterProps {
  target: number; prefix?: string; suffix?: string; duration?: number; label: string; description?: string
}

export function AnimatedCounter({ target, prefix = '', suffix = '', duration = 2000, label, description }: AnimatedCounterProps) {
  const [count, setCount]   = useState(0)
  const [started, setStarted] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const isVisible = useIntersectionObserver(ref, { threshold: 0.3 })

  useEffect(() => {
    if (!isVisible || started) return
    setStarted(true)
    const steps     = 60
    const stepTime  = duration / steps
    const increment = target / steps
    let current     = 0
    const timer = setInterval(() => {
      current += increment
      if (current >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(current))
      }
    }, stepTime)
    return () => clearInterval(timer)
  }, [isVisible, started, target, duration])

  return (
    <div ref={ref} className="flex flex-col items-center text-center p-8 bg-primary-800 border border-primary-700 rounded-card">
      <span className="font-display font-extrabold text-5xl text-secondary-400 tabular-nums">
        {prefix}{count.toLocaleString('pt-BR')}{suffix}
      </span>
      <span className="text-lg font-semibold text-white mt-2 font-display">{label}</span>
      {description && <span className="text-sm text-primary-200 mt-1.5 font-sans">{description}</span>}
    </div>
  )
}
```

---

## 4. Páginas de Alta Prioridade

### 4.1 /produtos — Listagem com Filtros

```
DESKTOP (> 1024px):
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [HEADER]                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐   │
│ │ Produtos > [Saneamento ×] > [Medição de Vazão ×]             ← breadcrumb-filtro     │   │
│ └──────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                             │
│ [🔍 Buscar no catálogo...]                               [32 produtos encontrados]          │
│                                                                                             │
│ ┌────────────────┐  ┌──────────────────────────────────────────────────────────────┐       │
│ │ FILTROS        │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  [SKELETON×3]     │       │
│ │                │  │  │  card    │  │  card    │  │  card    │                   │       │
│ │ SETOR          │  │  └──────────┘  └──────────┘  └──────────┘                   │       │
│ │ ○ Saneamento ● │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │       │
│ │ ○ Gás e Pet.   │  │  │  card    │  │  card    │  │  card    │                   │       │
│ │ ○ Biogás       │  │  └──────────┘  └──────────┘  └──────────┘                   │       │
│ │                │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │       │
│ │ CATEGORIA      │  │  │  card    │  │  card    │  │  card    │                   │       │
│ │ ● Medição Vaz. │  │  └──────────┘  └──────────┘  └──────────┘                   │       │
│ │ ○ Detecção Gás │  │                                                               │       │
│ │                │  │  [1] [2] [3] ... [8]    ← paginação                          │       │
│ │ DIÂMETRO (DN)  │  └──────────────────────────────────────────────────────────────┘       │
│ │ □ DN 50mm      │                                                                          │
│ │ □ DN 80mm      │                                                                          │
│ │ ■ DN 100mm     │  ← checkbox checked: bg-primary-600 border-primary-600                  │
│ │ □ DN 150mm     │                                                                          │
│ │                │                                                                          │
│ │ CONEXÃO        │                                                                          │
│ │ □ Flangeada    │                                                                          │
│ │ □ Solda        │                                                                          │
│ │                │                                                                          │
│ │ [Limpar Filtros│                                                                          │
│ └────────────────┘                                                                          │
│ 240px sidebar    80px gap    1fr grid                                                       │
└────────────────────────────────────────────────────────────────────────────────────────────┘

MOBILE (< 768px):
┌──────────────────────────────────┐
│ [🔍 Buscar...]  [Filtrar ⊟ 2]   │  ← badge mostra qtd de filtros ativos
│                                  │
│ Produtos > Saneamento > Vazão    │  ← breadcrumb compacto
│ 32 produtos encontrados          │
│                                  │
│ ┌──────────────────────────────┐ │
│ │  [card produto — full width] │ │
│ └──────────────────────────────┘ │
│ ┌──────────────────────────────┐ │
│ │  [card produto — full width] │ │
│ └──────────────────────────────┘ │
│                                  │
│ DRAWER DE FILTROS (slide-up):    │
│ ┌──────────────────────────────┐ │
│ │ Filtros              [✕]     │ │
│ │ ─────────────────────────── │ │
│ │ SETOR: [Select ▼]           │ │
│ │ CATEGORIA: [Select ▼]       │ │
│ │ DN: □ 50 □ 80 ■ 100 □ 150   │ │
│ │ [Aplicar Filtros]            │ │
│ └──────────────────────────────┘ │
└──────────────────────────────────┘
```

#### Classes Layout da Página de Produtos

```typescript
// Layout principal
// <div className="max-w-container mx-auto px-6 py-10">
//   {/* Breadcrumb filtros */}
//   <BreadcrumbFilters />
//   {/* Busca */}
//   <ProductSearchBar />
//   {/* Grid principal */}
//   <div className="flex gap-8 mt-6">
//     {/* Sidebar — hidden md:block */}
//     <aside className="hidden lg:block w-60 shrink-0">
//       <FiltersSidebar />
//     </aside>
//     {/* Grid de produtos */}
//     <main className="flex-1 min-w-0">
//       <div className="flex justify-between items-center mb-6">
//         <p className="text-sm text-neutral-500">{count} produtos encontrados</p>
//         <MobileFiltersButton />  {/* lg:hidden */}
//       </div>
//       <Suspense fallback={<ProductsGridSkeleton />}>
//         <ProductsGrid />
//       </Suspense>
//     </main>
//   </div>
// </div>

// Sidebar de filtros:
// bg-white border border-neutral-200 rounded-card p-5 sticky top-24

// FilterGroup:
// <div>
//   <button className="w-full flex justify-between py-3 text-sm font-semibold text-neutral-700 border-b border-neutral-100">
//     {label} <ChevronDown />
//   </button>
//   <div className="pt-3 flex flex-col gap-2">
//     {options.map(opt => (
//       <label className="flex items-center gap-2.5 cursor-pointer">
//         <input type="checkbox" className="w-4 h-4 rounded accent-primary-600" />
//         <span className="text-sm text-neutral-600">{opt.label}</span>
//         {opt.count && <span className="ml-auto text-xs text-neutral-400">{opt.count}</span>}
//       </label>
//     ))}
//   </div>
// </div>
```

---

### 4.2 /produtos/[slug] — Ficha Técnica do Produto

```
DESKTOP (2 colunas):
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [HEADER]                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Produtos > Saneamento > Medição de Vazão > Ultrassônico > GatSonic P-Clamp ← breadcrumb    │
│                                                                                             │
│ ┌──────────────────────────────────────────┐  ┌──────────────────────────────────────────┐ │
│ │  GALERIA                                 │  │  SIDEBAR                                 │ │
│ │                                          │  │                                          │ │
│ │  ┌──────────────────────────────────┐    │  │  [★ Mais pedido]  [● Saneamento]         │ │
│ │  │                                  │    │  │                                          │ │
│ │  │     [imagem principal]           │    │  │  GatSonic P-Clamp                        │ │
│ │  │     480px × 400px                │    │  │  Macromedidor Ultrassônico                │ │
│ │  │     object-contain               │    │  │                                          │ │
│ │  │     hover: cursor-zoom-in        │    │  │  Medição de Vazão | Ultrassônico         │ │
│ │  │                                  │    │  │                                          │ │
│ │  └──────────────────────────────────┘    │  │  Macromedidor ultrassônico para          │ │
│ │                                          │  │  instalação externa sem corte de pipe... │ │
│ │  ┌────┐  ┌────┐  ┌────┐  ┌────┐         │  │                                          │ │
│ │  │img1│  │img2│  │img3│  │img4│         │  │  [INMETRO] [ISO] [OIML]                  │ │
│ │  └────┘  └────┘  └────┘  └────┘         │  │  ─────────────────────────────────────   │ │
│ │  miniaturas 80×60 border ativo prim-600  │  │                                          │ │
│ │                                          │  │  [Solicitar Orçamento]  ← primary, full  │ │
│ │                                          │  │  [Falar com Especialista] ← secondary    │ │
│ │                                          │  │  [↓ Download Datasheet]  ← ghost         │ │
│ │                                          │  │                                          │ │
│ │                                          │  │  ─────────────────────────────────────   │ │
│ │                                          │  │  Dúvidas? WhatsApp: [número]             │ │
│ └──────────────────────────────────────────┘  └──────────────────────────────────────────┘ │
│  col: 55%                                        col: 42%    (gap: 3%)                      │
│                                                                                             │
│ ┌──────────────────────────────────────────────────────────────────────────────────────┐   │
│ │  [Especificações]  [Aplicações]  [Documentos]  [Vídeo]    ← Tabs underline          │   │
│ ├──────────────────────────────────────────────────────────────────────────────────────┤   │
│ │  ESPECIFICAÇÕES TÉCNICAS                                                              │   │
│ │  ┌────────────────────────────┬────────────────────────────┐                         │   │
│ │  │ Faixa de Medição           │ 0,3 a 10 m/s               │                         │   │
│ │  ├────────────────────────────┼────────────────────────────┤                         │   │
│ │  │ Precisão                   │ ±1%                        │                         │   │
│ │  ├────────────────────────────┼────────────────────────────┤                         │   │
│ │  │ Diâmetro (DN)              │ DN 50 a DN 2000            │                         │   │
│ │  ├────────────────────────────┼────────────────────────────┤                         │   │
│ │  │ Sinal de Saída             │ 4-20mA, HART, Pulso        │                         │   │
│ │  └────────────────────────────┴────────────────────────────┘                         │   │
│ │  linhas ímpares: bg-neutral-50, pares: bg-white                                      │   │
│ └──────────────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                             │
│ FAQ  ─────────────────────────────────────────────────────────────────────────────────     │
│ ▶  Este macromedidor precisa de corte no pipe?                                             │
│ ▶  Qual a garantia do equipamento?                                                         │
│                                                                                             │
│ PRODUTOS RELACIONADOS                                                                       │
│ Complete sua solução de Medição de Vazão                                                    │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐                                                  │
│ │  card    │  │  card    │  │  card    │   variant compact                                │
│ └──────────┘  └──────────┘  └──────────┘                                                  │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Estrutura da Página

```typescript
// src/app/(site)/produtos/[slug]/page.tsx — estrutura de layout

// Container: max-w-container mx-auto px-6 py-8

// Breadcrumb: mb-8

// Grid principal: grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-10 xl:gap-16

// Galeria (coluna esquerda):
//   sticky top-24 — fica fixo enquanto sidebar rola
//   Imagem principal: relative aspect-[4/3] overflow-hidden rounded-xl bg-neutral-50 border border-neutral-200 cursor-zoom-in
//   Miniaturas: flex gap-2 mt-3 — grid-cols-5
//     thumb ativo: ring-2 ring-primary-600 ring-offset-2
//     thumb hover: opacity-80

// Sidebar (coluna direita):
//   top: badges de setor + destaque
//   Título: font-display font-extrabold text-3xl text-neutral-900 leading-tight mt-3
//   Subcategoria: text-sm text-neutral-500 uppercase tracking-widest mt-1
//   Descrição: text-base text-neutral-600 leading-relaxed mt-4
//   Certificações: flex gap-3 mt-4
//   Divisor: border-t border-neutral-200 my-5
//   CTAs: flex flex-col gap-3
//     [Solicitar Orçamento] — w-full, primary, lg
//     [Falar com Especialista] — w-full, secondary, lg
//     [Download Datasheet] — w-full, ghost, lg, ícone download
//   Rodapé sidebar: mt-5 pt-5 border-t border-neutral-100 text-sm text-neutral-500

// Tabs (full width, abaixo do grid):
//   mt-12
//   Specs table: w-full border border-neutral-200 rounded-card overflow-hidden
//     thead: bg-neutral-50 text-sm font-semibold text-neutral-700
//     tr zebra: even:bg-neutral-50 odd:bg-white
//     td: px-5 py-3.5 text-sm border-b border-neutral-100

// FAQ: mt-10
// Related products: mt-12
```

---

### 4.3 /setores/[setor] — Página de Setor

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ [HEADER]                                                                                    │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ HERO (h-96, imagem do setor + overlay primary-900/75)                                       │
│   SANEAMENTO          ← overline: text-secondary-400 uppercase tracking-widest             │
│   Soluções Completas  ← font-display text-5xl font-extrabold text-white                    │
│   para Saneamento     ← H1                                                                  │
│   Medição, controle e monitoramento de redes...                                             │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ Setores > Saneamento  ← breadcrumb                                                         │
│                                                                                             │
│ SOBRE O SETOR         ← H2, font-display, primary-900                                      │
│ [texto descritivo 2 colunas]                                                               │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ APLICAÇÕES EM SANEAMENTO                                                                    │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│ │ Controle de  │  │ Medição de   │  │ Qualidade    │  │ Telemetria   │                    │
│ │ Perdas       │  │ Consumo      │  │ da Água      │  │ Hídrica      │                    │
│ └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘                    │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ PRODUTOS PARA SANEAMENTO                                                                    │
│ [Medição de Vazão] [Nível] [Qualidade] [Pressão]  ← Tabs pills                            │
│                                                                                             │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐  [Ver todos em Saneamento →]                    │
│ │  card    │  │  card    │  │  card    │                                                  │
│ └──────────┘  └──────────┘  └──────────┘                                                  │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ SERVIÇOS APLICÁVEIS                                                                         │
│ ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                                      │
│ │ ⚙ Calibração │  │ 🔧 Instalação │  │ 📋 Consultoria│                                    │
│ └──────────────┘  └──────────────┘  └──────────────┘                                      │
│                                                                                             │
├────────────────────────────────────────────────────────────────────────────────────────────┤
│ bg-primary-900, py-20                                                                       │
│                                                                                             │
│ Pronto para elevar a eficiência do seu sistema de saneamento?                               │
│ Nossa equipe técnica especializada está pronta para ajudar.                                 │
│                                                                                             │
│ [Fale com um Especialista em Saneamento]  [Solicitar Proposta]                             │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Componentes Globais Críticos

### 5.1 Modal de Orçamento

```
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│  OVERLAY: fixed inset-0 bg-black/60 backdrop-blur-sm z-modal                               │
│                                                                                             │
│         ┌────────────────────────────────────────────────────────────┐                     │
│         │ Solicitar Orçamento                                    [✕] │  ← modal header     │
│         │ Preencha os dados abaixo e retornaremos em até 24h.        │                     │
│         ├────────────────────────────────────────────────────────────┤                     │
│         │                                                            │                     │
│         │  Nome completo *              Empresa *                    │                     │
│         │  [________________________]  [________________________]    │                     │
│         │                                                            │                     │
│         │  Telefone / WhatsApp *        E-mail *                     │                     │
│         │  [________________________]  [________________________]    │                     │
│         │                                                            │                     │
│         │  Produto de interesse                                      │                     │
│         │  [GatSonic P-Clamp ─ pré-preenchido ──────────────────]   │                     │
│         │                                                            │                     │
│         │  Setor                                                     │                     │
│         │  [Saneamento ────────────────────────────────────── ▼]    │                     │
│         │                                                            │                     │
│         │  Mensagem (opcional)                                       │                     │
│         │  [____________________________________________]            │                     │
│         │  [____________________________________________]            │                     │
│         │                                                            │                     │
│         │  🔒 Seus dados estão protegidos pela LGPD.                 │  ← micro-copy       │
│         │                                                            │                     │
│         │            [Cancelar]  [Enviar Solicitação →]             │                     │
│         └────────────────────────────────────────────────────────────┘                     │
│         max-w-lg, bg-white, rounded-card, shadow-modal, animate-fade-in-up                 │
└────────────────────────────────────────────────────────────────────────────────────────────┘

ESTADO SUCESSO (após envio):
│         ┌────────────────────────────────────────────────────────────┐                     │
│         │                       ✓                              [✕]  │                     │
│         │               Solicitação enviada!                         │                     │
│         │                                                            │                     │
│         │    Recebemos sua solicitação e retornaremos em             │                     │
│         │    até 1 dia útil pelo e-mail ou telefone informado.       │                     │
│         │                                                            │                     │
│         │    Precisa de atendimento imediato?                        │                     │
│         │    [Fale pelo WhatsApp agora]                              │                     │
│         │                                                            │                     │
│         │                    [Fechar]                                │                     │
│         └────────────────────────────────────────────────────────────┘                     │
ícone check: w-16 h-16 bg-success-50 text-success-500 rounded-full mx-auto mb-4
```

---

### 5.2 WhatsApp Flutuante

```
NORMAL:                          HOVER:
  ┌────┐                           ┌─────────────────────────┬────┐
  │ W  │  ← 56px, rounded-full    │ Fale conosco no WhatsApp │ W  │
  └────┘  bg-[#25D366]            └─────────────────────────┴────┘
  shadow-lg                        overflow: hidden, max-w-0 → max-w-xs
  fixed bottom-6 right-6           transition-all duration-normal
  z-whatsapp
```

```typescript
// src/components/global/WhatsAppButton.tsx
'use client'
import { useState } from 'react'
import { pushGTMEvent } from '@/lib/gtm'
import { usePathname } from 'next/navigation'

export function WhatsAppButton() {
  const [hovered, setHovered] = useState(false)
  const pathname = usePathname()
  const number   = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  const message  = encodeURIComponent('Olá! Gostaria de mais informações sobre os produtos e serviços da GAIATEC.')
  const href     = `https://wa.me/${number}?text=${message}`

  const handleClick = () => {
    pushGTMEvent({ event: 'whatsapp_click', pagina: pathname })
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Fale conosco no WhatsApp"
      className="fixed bottom-6 right-6 z-whatsapp flex items-center gap-3 group"
    >
      {/* Texto expandível */}
      <span
        className={[
          'bg-white text-neutral-800 text-sm font-semibold font-sans shadow-card',
          'px-4 py-2.5 rounded-full whitespace-nowrap',
          'transition-all duration-normal overflow-hidden',
          hovered ? 'max-w-xs opacity-100' : 'max-w-0 opacity-0 px-0',
        ].join(' ')}
      >
        Fale conosco no WhatsApp
      </span>

      {/* Botão circular */}
      <span className="flex items-center justify-center w-14 h-14 bg-[#25D366] rounded-full shadow-lg group-hover:scale-110 transition-transform duration-normal">
        {/* WhatsApp SVG Icon */}
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      </span>
    </a>
  )
}
```

---

### 5.3 Cookie Consent LGPD

```
BOTTOM BANNER:
┌────────────────────────────────────────────────────────────────────────────────────────────┐
│ fixed bottom-0 left-0 right-0 z-cookie                                                      │
│ bg-neutral-900 border-t-2 border-primary-600                                               │
│ px-6 py-4                                                                                   │
│                                                                                             │
│ 🍪 Utilizamos cookies para melhorar sua experiência. Ao continuar, você concorda com nossa   │
│    [Política de Privacidade].                                                               │
│                                                            [Configurar]  [Rejeitar]  [Aceitar Todos] │
│                                                                                             │
│  mobile: layout vertical (texto → botões em coluna)                                         │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

```typescript
// src/components/global/CookieConsent.tsx
'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Cookie } from 'lucide-react'

const STORAGE_KEY = 'gaiatec_cookie_consent'

export function CookieConsent() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem(STORAGE_KEY)
    if (!consent) setVisible(true)
  }, [])

  const accept = (type: 'all' | 'essential') => {
    localStorage.setItem(STORAGE_KEY, type)
    setVisible(false)
    if (type === 'all') {
      // Ativar GTM
      window.dataLayer = window.dataLayer ?? []
      window.dataLayer.push({ event: 'cookie_consent_granted' })
    }
  }

  if (!visible) return null

  return (
    <div
      role="dialog"
      aria-label="Consentimento de cookies"
      className="fixed bottom-0 left-0 right-0 z-cookie bg-neutral-900 border-t-2 border-primary-600 animate-slide-in-up"
    >
      <div className="max-w-container mx-auto px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        {/* Texto */}
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <Cookie className="h-5 w-5 text-secondary-400 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-neutral-300 font-sans leading-relaxed">
            Utilizamos cookies para melhorar sua experiência e analisar o tráfego do site. Ao continuar, você concorda com nossa{' '}
            <Link href="/politica-de-privacidade" className="text-primary-400 hover:text-primary-300 underline underline-offset-2 transition-colors">
              Política de Privacidade
            </Link>.
          </p>
        </div>

        {/* Botões */}
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-neutral-400 hover:text-white border-neutral-700 hover:bg-neutral-800"
            onClick={() => {/* Abrir modal de configurações */}}
          >
            Configurar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="border-neutral-600 text-neutral-300 hover:bg-neutral-800"
            onClick={() => accept('essential')}
          >
            Rejeitar opcionais
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => accept('all')}
          >
            Aceitar Todos
          </Button>
        </div>
      </div>
    </div>
  )
}
```

---

### 5.4 Breadcrumb

```
Início  >  Produtos  >  Saneamento  >  Medição de Vazão  >  GatSonic P-Clamp
home          link          link              link              texto atual (bold)
text-neutral-400  text-neutral-500 hover:text-primary-600  text-neutral-800
```

```typescript
// src/components/global/Breadcrumb.tsx
import Link from 'next/link'
import { ChevronRight, Home } from 'lucide-react'
import type { BreadcrumbItem } from '@/types/sanity.types'

export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  const allItems = [{ label: 'Início', href: '/' }, ...items]

  // Schema JSON-LD para SEO
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: allItems.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      ...(item.href && { item: `${process.env.NEXT_PUBLIC_SITE_URL}${item.href}` }),
    })),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <nav aria-label="Navegação estrutural" className="py-3">
        <ol className="flex flex-wrap items-center gap-1 text-sm font-sans">
          {allItems.map((item, index) => {
            const isLast = index === allItems.length - 1
            return (
              <li key={index} className="flex items-center gap-1">
                {index === 0 ? (
                  <Link href="/" className="text-neutral-400 hover:text-primary-600 transition-colors" aria-label="Início">
                    <Home className="h-3.5 w-3.5" />
                  </Link>
                ) : isLast ? (
                  <span className="text-neutral-700 font-medium truncate max-w-[200px]" aria-current="page">
                    {item.label}
                  </span>
                ) : (
                  <Link href={item.href!} className="text-neutral-500 hover:text-primary-600 transition-colors truncate max-w-[140px]">
                    {item.label}
                  </Link>
                )}
                {!isLast && <ChevronRight className="h-3.5 w-3.5 text-neutral-300 shrink-0" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      </nav>
    </>
  )
}
```

---

## Referência Rápida — Padrões de Classe

### Seções de Página

```css
/* Seção clara (default) */
.section        { @apply py-16 md:py-24 bg-white }

/* Seção com fundo suave */
.section-muted  { @apply py-16 md:py-24 bg-neutral-50 }

/* Seção escura (primária) */
.section-dark   { @apply py-16 md:py-24 bg-primary-900 }

/* Container padrão */
.container      { @apply max-w-container mx-auto px-4 sm:px-6 }

/* Overline de seção */
.overline       { @apply text-secondary-500 text-xs font-semibold uppercase tracking-widest font-sans mb-3 }

/* Título de seção */
.section-title  { @apply font-display font-bold text-3xl md:text-4xl text-neutral-900 leading-tight }

/* Descrição de seção */
.section-desc   { @apply text-neutral-600 text-lg font-sans leading-relaxed max-w-2xl }
```

### Hierarquia Tipográfica

```
H1 hero:      font-display extrabold text-5xl lg:text-6xl text-white
H1 página:    font-display bold text-4xl text-neutral-900
H2 seção:     font-display bold text-3xl text-neutral-900
H3 card:      font-display semibold text-xl text-neutral-800
H4 subtítulo: font-sans semibold text-base text-neutral-700
Corpo:        font-sans normal text-base text-neutral-600 leading-relaxed
Caption:      font-sans normal text-sm text-neutral-500
Label:        font-sans medium text-sm text-neutral-700
Overline:     font-sans semibold text-xs uppercase tracking-widest text-secondary-500
```

---

*Documento gerado em 2026-02-23 — Etapa 5 — Frontend Design.*
*Próxima etapa: Etapa 6 — Implementação (Código da aplicação Next.js)*
