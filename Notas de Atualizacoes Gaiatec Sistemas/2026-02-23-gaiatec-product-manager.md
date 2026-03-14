# Product Requirements Document — GAIATEC SISTEMAS Website
**Data:** 2026-02-23
**Versão:** 1.0
**Status:** Aprovado para desenvolvimento
**Etapa:** 3 de N — PRD, Roadmap, Critérios de Launch, Handoff

---

## Sumário

1. [Visão do Produto](#1-visão-do-produto)
2. [Objetivos de Negócio e KPIs](#2-objetivos-de-negócio-e-kpis)
3. [Escopo — Matriz MoSCoW](#3-escopo--matriz-moscow)
4. [Integrações com Sistemas Externos](#4-integrações-com-sistemas-externos)
5. [Roadmap — 12 Semanas](#5-roadmap--12-semanas)
6. [Checklist de Launch](#6-checklist-de-launch)
7. [Matriz de Riscos e Contingências](#7-matriz-de-riscos-e-contingências)
8. [Handoff para Desenvolvimento](#8-handoff-para-desenvolvimento)
9. [Decisões Pendentes — Requer Cliente](#9-decisões-pendentes--requer-cliente)

---

## 1. Visão do Produto

### 1.1 Declaração de Visão

> **"Ser a melhor plataforma de catálogo técnico B2B do setor de instrumentação industrial brasileiro — onde engenheiros encontram a solução exata para o seu projeto e compradores fecham orçamentos com zero atrito."**

### 1.2 Problema que o Site Resolve

A GAIATEC SISTEMAS possui 20+ anos de portfólio técnico de alta qualidade e credibilidade consolidada no mercado. Porém, sem uma presença digital estruturada:

- Engenheiros e compradores não encontram informações técnicas online → perda de oportunidades para concorrentes com melhor presença digital
- A equipe comercial perde tempo respondendo manualmente perguntas que poderiam ser respondidas pelo site
- Leads qualificados chegam sem contexto → ciclo de vendas mais longo
- A empresa não tem visibilidade do comportamento e interesse dos visitantes

### 1.3 Solução

Plataforma de catálogo técnico B2B com:
- **Busca inteligente** para que o engenheiro encontre o produto correto em < 3 cliques
- **Fichas técnicas completas** com specs, datasheets e normas — eliminando a necessidade de contato para informação técnica básica
- **CTAs de conversão em cada ponto de decisão** — orçamento, WhatsApp, especialista
- **Conteúdo orientado por setor** para cada persona encontrar seu caminho natural
- **CMS gerenciável** pela equipe interna sem dependência técnica

### 1.4 Personas e North Star Metric por Persona

| Persona | Jornada no Site | North Star Metric |
|---|---|---|
| **ENG** — Engenheiro Especificador | Busca → Ficha Técnica → Download Datasheet | Downloads de datasheet por mês |
| **CPR** — Comprador / Suprimentos | Catálogo → Produto → Solicitar Orçamento | Formulários de orçamento enviados por mês |
| **GES** — Gestor / Diretor Industrial | Homepage → Sobre → Aplicações → Contato | Tempo médio de sessão > 3 min |
| **MAN** — Gerente de Manutenção | Aplicações → Serviços → Solicitar Proposta | Formulários de serviço enviados por mês |

### 1.5 North Star Metric Global

> **Leads qualificados gerados por mês** (orçamentos + datasheets gated + WhatsApp + formulários)

---

## 2. Objetivos de Negócio e KPIs

### 2.1 OKRs do Lançamento (Mês 1-3 pós-launch)

#### Objetivo 1 — Gerar Leads Qualificados
| Key Result | Meta Mês 1 | Meta Mês 3 |
|---|---|---|
| Formulários de orçamento enviados/mês | ≥ 15 | ≥ 40 |
| Downloads de datasheet/mês | ≥ 30 | ≥ 80 |
| Cliques no WhatsApp/mês | ≥ 50 | ≥ 120 |
| Formulários de contato/mês | ≥ 10 | ≥ 25 |

#### Objetivo 2 — Tráfego Orgânico e Autoridade Técnica
| Key Result | Meta Mês 1 | Meta Mês 3 |
|---|---|---|
| Sessões orgânicas/mês | ≥ 500 | ≥ 1.500 |
| Páginas de produto indexadas pelo Google | ≥ 80% do catálogo | 100% |
| Artigos de blog publicados | ≥ 2 | ≥ 8 |
| Posição média no Google (GSC) | < 30 | < 15 |

#### Objetivo 3 — Experiência do Usuário
| Key Result | Meta |
|---|---|
| Taxa de rejeição (bounce rate) | < 55% |
| Tempo médio de sessão | > 2 min |
| Páginas por sessão | > 2,5 |
| Core Web Vitals: LCP | < 2,5s |
| Core Web Vitals: CLS | < 0,1 |
| Core Web Vitals: INP | < 200ms |

### 2.2 Funil de Conversão — Metas

```
Visitantes únicos/mês
        100%
          │
          ▼
  Engajam com catálogo ou busca
        ~45%
          │
          ▼
  Acessam página de produto/serviço/aplicação
        ~25%
          │
          ▼
  Interagem com CTA (orçamento, WhatsApp, datasheet)
         ~8%
          │
          ▼
  Convertem (lead qualificado)
         ~4%
```

### 2.3 Métricas por Evento GTM (Baseline Mês 1)

| Evento | Meta Mínima Mensal |
|---|---|
| `solicitar_orcamento` | ≥ 15 |
| `download_datasheet` | ≥ 30 |
| `whatsapp_click` | ≥ 50 |
| `falar_especialista` | ≥ 20 |
| `busca_realizada` | ≥ 100 |
| `filtro_aplicado` | ≥ 200 |

---

## 3. Escopo — Matriz MoSCoW

### MUST HAVE — MVP (sem isso, o site não vai ao ar)

| # | Feature | Justificativa |
|---|---|---|
| M01 | Header com megamenu + CTA [Solicitar Orçamento] | Navegação e conversão primária |
| M02 | Footer completo | Credibilidade e navegação secundária |
| M03 | Cookie Consent LGPD integrado com GTM | Obrigação legal — compliance |
| M04 | Homepage com hero carrossel + busca + setores + produtos em destaque | Primeira impressão e orientação do visitante |
| M05 | Catálogo de produtos /produtos com filtros primários (Setor → Categoria → Sub-categoria) | Core da plataforma |
| M06 | Fichas técnicas de produto /produtos/[slug] com specs, galeria, CTAs e download | Conteúdo técnico — razão principal de visita do ENG |
| M07 | Modal de Solicitação de Orçamento integrado com CRM + notificação e-mail | Geração de leads — razão de existir do site |
| M08 | Páginas individuais de setor /setores/[setor] para todos os 11 setores | SEO + jornada do MAN e GES |
| M09 | Página /servicos com listagem e filtros | Portfólio completo |
| M10 | Páginas individuais de serviço /servicos/[slug] | SEO + jornada do MAN |
| M11 | Página /aplicacoes com listagem e filtros | Diferencial estratégico — solução integrada |
| M12 | Páginas individuais de aplicação /aplicacoes/[slug] com ROI e cross-links | Storytelling técnico que diferencia da concorrência |
| M13 | Botão WhatsApp flutuante com rastreamento GTM | Canal de conversão imediata |
| M14 | Breadcrumb com schema BreadcrumbList em todas as páginas internas | SEO e usabilidade |
| M15 | Sanity Studio configurado com todos os schemas e validações | Autonomia da equipe interna |
| M16 | SEO técnico: H1, meta description, Open Graph, schema structured data, sitemap, robots.txt | Visibilidade orgânica |
| M17 | GA4 + GTM com os 8 eventos configurados | Inteligência de dados para decisões |
| M18 | Responsividade completa: Mobile/Tablet/Desktop/Wide | 50%+ do tráfego B2B vem de mobile |
| M19 | Página /sobre com timeline histórica | Credibilidade e autoridade |
| M20 | Página /contato com formulário integrado ao CRM | Canal de contato direto |
| M21 | Página /minha-conta — "Em breve" (sem funcionalidade) | Menu já visível para o futuro |
| M22 | Página /politica-de-privacidade | Obrigação legal — LGPD |
| M23 | ISR (Incremental Static Regeneration) no catálogo | Performance e atualização automática de conteúdo |
| M24 | Conteúdo mínimo inserido no Sanity antes do launch | Site não pode ir ao ar vazio |

### SHOULD HAVE — MVP (importante, pode ser entregue pós-semana 10 sem bloquear launch)

| # | Feature | Justificativa |
|---|---|---|
| S01 | Filtros secundários completos para todas as categorias (sidebar dinâmica) | Melhora conversão do ENG — pode iniciar com filtros primários e expandir |
| S02 | Blog /blog com listagem e páginas de artigo | SEO de longo prazo — crítico mas não bloqueia launch |
| S03 | Download de datasheet gated (com captura de e-mail) | Estratégia de captação de lead do ENG — pode iniciar com download direto |
| S04 | Seção de Produtos Relacionados na ficha técnica | Cross-selling — pode ser adicionado pós-launch sem custo alto |
| S05 | FAQ em accordion nas fichas de produto | Reduz dúvidas — pode iniciar sem e adicionar via Sanity |
| S06 | Contadores animados (seção "Por que GAIATEC") | Impacto emocional — cosmético, não bloqueia launch |
| S07 | Preview em tempo real no Sanity Studio | Conforto da equipe interna — Sanity funciona sem isso |

### COULD HAVE — Pós-MVP imediato (2-4 semanas pós-launch)

| # | Feature | Justificativa |
|---|---|---|
| C01 | Auto-rotation entre setores na homepage | Melhoria UX — não bloqueia launch |
| C02 | Seção de cases/projetos de referência por setor | Prova social — depende de conteúdo do cliente |
| C03 | Download de catálogo por setor (PDF) | Útil mas depende de PDFs prontos do cliente |
| C04 | Logo de clientes como prova social | Depende de autorização dos clientes |
| C05 | Artigos de blog linkados automaticamente por produto/aplicação (tags Sanity) | Feature avançada de cross-link do CMS |

### WON'T HAVE — Fase 2 (não entra no MVP)

| # | Feature | Justificativa |
|---|---|---|
| W01 | Comparador de produtos (até 3 side-by-side) | Complexidade alta — Fase 2 |
| W02 | Portal do cliente / Minha Conta funcional | Alta complexidade de autenticação e dados — Fase 2 |
| W03 | Algolia para busca avançada em escala | GROQ suficiente para MVP — Fase 2 |
| W04 | Calculadora técnica de dimensionamento | Feature especializada — Fase 2 |
| W05 | Chat ao vivo / chatbot de qualificação | Dependência de ferramenta de chat — Fase 2 |

---

## 4. Integrações com Sistemas Externos

### 4.1 Mapa de Integrações

```
┌─────────────────────────────────────────────────────────────┐
│                    GAIATEC SITE (Next.js)                    │
│                                                             │
│  [Modal Orçamento] ──────────────────► [CRM API]           │
│  [Form Contato]    ──────────────────► [CRM API]           │
│  [Download Gated]  ──────────────────► [CRM API]           │
│                                                             │
│  [Modal Orçamento] ──────────────────► [Resend/SendGrid]   │
│  [Form Contato]    ──────────────────► [Resend/SendGrid]   │
│                                                             │
│  [WhatsApp Button] ──────────────────► [WhatsApp Business] │
│                                                             │
│  [Cookie Consent ✓] ─────────────────► [GTM]              │
│  [GTM] ──────────────────────────────► [GA4]              │
│                                                             │
│  [Conteúdo Editorial] ◄──────────────► [Sanity CMS]       │
│                                                             │
│  [Build / Deploy] ───────────────────► [Vercel]           │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Especificação por Integração

#### CRM — RD Station ou HubSpot
| Campo | Detalhe |
|---|---|
| **Finalidade** | Captura e qualificação de leads (orçamento, contato, datasheet gated) |
| **Dados enviados** | Nome, empresa, e-mail, telefone, setor, produto de interesse, mensagem, URL da página de origem |
| **Quando acionar** | Submit do Modal de Orçamento / Submit do Form Contato / E-mail gated no datasheet |
| **Decisão pendente** | RD Station vs HubSpot — requer decisão do cliente na Sprint 0 |
| **Variável de ambiente** | `CRM_API_KEY`, `CRM_FORM_ID` |
| **Fallback** | Se CRM indisponível, lead é salvo em log e notificação por e-mail é enviada |

#### Resend / SendGrid — Notificação de Leads
| Campo | Detalhe |
|---|---|
| **Finalidade** | Notificação interna para cada lead gerado |
| **Destinatário** | E-mail comercial da GAIATEC (a confirmar) |
| **Conteúdo do e-mail** | Nome, empresa, telefone, produto de interesse, URL da origem |
| **Decisão pendente** | Resend vs SendGrid — recomendamos Resend por facilidade de setup |
| **Variável de ambiente** | `RESEND_API_KEY` ou `SENDGRID_API_KEY`, `NOTIFICATION_EMAIL` |

#### Google Tag Manager
| Campo | Detalhe |
|---|---|
| **Finalidade** | Gerenciar todos os scripts de rastreamento sem deploy |
| **Ativação** | Somente após consentimento LGPD (via dataLayer trigger de consent) |
| **Container** | A criar — ID será inserido como `NEXT_PUBLIC_GTM_ID` |
| **Eventos** | 8 eventos via `dataLayer.push()` — ver Etapa 2 seção 13 |

#### Google Analytics 4
| Campo | Detalhe |
|---|---|
| **Finalidade** | Analytics de comportamento e conversão |
| **Configuração** | Via GTM (não instalar diretamente no código) |
| **ID** | `NEXT_PUBLIC_GA4_ID` — a criar no cliente |

#### WhatsApp Business
| Campo | Detalhe |
|---|---|
| **Finalidade** | Canal de atendimento rápido via botão flutuante |
| **URL formato** | `https://wa.me/[número]?text=[mensagem pré-formatada]` |
| **Decisão pendente** | Número WhatsApp Business da GAIATEC — requer cliente |
| **Variável de ambiente** | `NEXT_PUBLIC_WHATSAPP_NUMBER` |

#### Sanity CMS
| Campo | Detalhe |
|---|---|
| **Finalidade** | Gestão de todo o conteúdo editorial |
| **Projeto** | A criar em sanity.io — organização GAIATEC |
| **Dataset** | `production` (e `staging` para testes) |
| **Variáveis** | `NEXT_PUBLIC_SANITY_PROJECT_ID`, `NEXT_PUBLIC_SANITY_DATASET`, `SANITY_API_TOKEN` |
| **CORS** | Adicionar domínio gaiatec.com.br e preview da Vercel nas origens permitidas |

#### Vercel
| Campo | Detalhe |
|---|---|
| **Finalidade** | Hospedagem, CI/CD e edge network |
| **Domínio** | gaiatec.com.br (a configurar DNS) |
| **Branch de produção** | `main` |
| **Preview deploys** | Ativado para todas as branches/PRs |
| **Regiões** | São Paulo (GRU1) — edge para latência mínima no Brasil |

---

## 5. Roadmap — 12 Semanas

### 5.1 Visão Geral das 12 Semanas

```
SEMANA  01 02 03 04 05 06 07 08 09 10 11 12
        ──────────────────────────────────────
SPRINT  ├─S0─┤├────S1────┤├────S2────┤├─S3─┐
                                           ├─S3─┤├────S4────┤├─S5─┤├─S6─┤├─S7─┤

Marcos:    ▲          ▲          ▲          ▲          ▲     ▲
           Setup      Header+    Homepage   Produtos   SetSrvApl  Launch!
           Completo   Globais    ✓          ✓          ✓
```

### 5.2 Roadmap Detalhado por Sprint

---

#### SPRINT 0 — Setup e Infraestrutura
**Semana:** 1
**Objetivo:** Ambiente de desenvolvimento pronto, todos os schemas do Sanity criados, projeto configurado e deployado no Vercel.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Projeto Next.js 14+ inicializado com TypeScript + Tailwind + Shadcn/UI | Técnico | `npm run dev` funciona sem erros |
| Sanity Studio criado com nome "GAIATEC — Painel de Gestão" | CMS | Studio acessível em `studio.gaiatec.com.br` ou subpath |
| Todos os 10 schemas Sanity criados e validados | CMS | Schemas criam/editam documentos sem erro |
| Tipos TypeScript gerados a partir dos schemas | Técnico | `sanity.types.ts` disponível |
| Deploy inicial no Vercel com variáveis de ambiente | Infra | URL de preview funciona em produção |
| Tokens de design configurados (cores, tipografia) no Tailwind | Design | Paleta GAIATEC aplicada |
| **Decisão do CRM confirmada com cliente** | Negócio | RD Station ou HubSpot definido |
| **Número WhatsApp Business coletado** | Negócio | Variável configurada |

**Milestone:** `v0.1 — Ambiente pronto`

---

#### SPRINT 1 — Layout Base e Componentes Globais
**Semanas:** 2–3
**Objetivo:** Header, footer, megamenu, cookie consent LGPD, WhatsApp, modal de orçamento e breadcrumb funcionando.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Header sticky com scroll-shrink (transparente → sólido) | Frontend | Comportamento correto em scroll |
| Megamenu de Setores (11 setores + ícones) — desktop | Frontend | Abre/fecha sem erro, links funcionam |
| Megamenu de Produtos — desktop | Frontend | Abre/fecha, links funcionam |
| Menu hambúrguer mobile com drawer | Frontend | Funciona em < 768px |
| Item "Minha Conta" desabilitado com tooltip "Em breve" | Frontend | Não navega, tooltip visível |
| Footer completo com todas as colunas | Frontend | Todos os links funcionam |
| Cookie Consent LGPD (3 opções + localStorage + GTM) | Frontend | Scripts GTM bloqueados sem consentimento |
| Botão WhatsApp flutuante + hover + evento GTM | Frontend | `whatsapp_click` disparado no GTM Preview |
| Modal de Orçamento (form + validação + pré-preenchimento) | Frontend | Validação client-side funcionando |
| Modal de Orçamento integrado com CRM | Integração | Lead aparece no CRM em staging |
| Modal de Orçamento com notificação por e-mail | Integração | E-mail recebido no destinatário configurado |
| Breadcrumb com schema BreadcrumbList | Frontend | Schema validado no Rich Results Test |
| Skip-to-Content link | Acessibilidade | Funcional via teclado |

**Milestone:** `v0.2 — Shell do site pronto`

---

#### SPRINT 2 — Homepage
**Semanas:** 4–5
**Objetivo:** Homepage completa e integrada com Sanity — carrossel, busca, setores interativos, produtos/serviços/aplicações em destaque, "Por que GAIATEC", certificações.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Carrossel hero (auto 5s, pause hover, swipe mobile) | Frontend | Funciona em todos os breakpoints |
| Slides carregados do Sanity (ativo/ordem) | CMS | Equipe consegue gerenciar slides sem dev |
| Busca inteligente com autocomplete GROQ | Frontend | Resultados em < 500ms |
| Filtros progressivos na busca (Setor → Categoria → Tecnologia) | Frontend | Atualização sem reload |
| Seção Setores Interativos (tabs + backdrop-blur + cards de categoria) | Frontend | Cards clicáveis com filtros pré-aplicados na URL |
| Seção Produtos em Destaque (tabs de setor + fade-in) | Frontend | Transição suave entre setores |
| Produtos em destaque integrados com Sanity | CMS | Configurável via `produtoDestaque` schema |
| Seção Serviços em Destaque | Frontend | Mesma lógica de tabs |
| Seção Aplicações em Destaque (3-4 cards) | Frontend | Cards com links funcionais |
| Seção "Por que GAIATEC" com contadores animados | Frontend | Animação trigger no scroll |
| Seção Certificações | Frontend | Logos exibidos corretamente |
| CTA Final | Frontend | Botões com links corretos |
| Faixa de credibilidade abaixo do header (desktop) | Frontend | Visível somente em > 768px |

**Milestone:** `v0.3 — Homepage completa`

---

#### SPRINT 3 — Catálogo de Produtos
**Semanas:** 6–7
**Objetivo:** Listagem de produtos com filtros completos e fichas técnicas individuais funcionando.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Página /produtos com grid responsivo | Frontend | 3→2→1 colunas |
| Barra de busca no catálogo com autocomplete | Frontend | — |
| Filtros primários breadcrumb (Setor → Categoria → Sub) | Frontend | Sincronizados com URL |
| URL com query params refletindo filtros | Frontend | Link compartilhável funciona |
| Sidebar de filtros secundários dinâmicos por categoria | Frontend | Mínimo: Vazão, Gases, Nível, Pressão |
| Drawer de filtros mobile | Frontend | Abre/fecha sem bug de layout |
| Client-side filtering sem reload | Frontend | < 300ms de resposta |
| Card de produto (imagem, nome, descrição, badge, hover) | Frontend | Badges "Mais pedido" / "Novo" funcionais |
| Página /produtos/[slug] com galeria + zoom | Frontend | Zoom funciona no hover desktop |
| Sidebar da ficha (nome, specs resumidas, 3 CTAs) | Frontend | CTA orçamento pré-preenche produto |
| Abas da ficha: Especificações / Aplicações / Documentos / Vídeo | Frontend | Conteúdo via Sanity |
| FAQ accordion na ficha | Frontend | Abre/fecha suavemente |
| Seção Produtos Relacionados | Frontend | — |
| Seção Serviços Complementares | Frontend | — |
| Download datasheet direto | Frontend | PDF baixa corretamente |
| Download datasheet gated (e-mail antes) | Frontend | Lead capturado no CRM |
| ISR revalidate 60s nas páginas de produto | Técnico | Conteúdo atualiza sem rebuild |

**Milestone:** `v0.4 — Catálogo de produtos completo`

---

#### SPRINT 4 — Setores, Serviços e Aplicações
**Semanas:** 8–9
**Objetivo:** Toda a estrutura de setores, serviços e aplicações completa.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Página /setores (hero, grid 3col, filtro horizontal) | Frontend | — |
| Páginas /setores/[setor] para os 11 setores (11 seções fixas) | Frontend | 11 páginas geradas via Sanity |
| CTA contextualizado por setor ("Fale com especialista em [Setor]") | Frontend | Texto muda conforme setor |
| Download catálogo por setor (quando PDF disponível) | Frontend | Oculto quando PDF ausente |
| Página /servicos com filtros por setor e categoria | Frontend | — |
| Páginas /servicos/[slug] completas | Frontend | — |
| Página /aplicacoes com filtro + fade-in | Frontend | — |
| Páginas /aplicacoes/[slug] com storytelling + ROI | Frontend | — |
| Cross-links bidirecionais (aplicações ↔ produtos ↔ serviços) | Frontend | Links abrem em nova aba |

**Milestone:** `v0.5 — Setores, serviços e aplicações completos`

---

#### SPRINT 5 — Blog, Sobre, Contato e Páginas Auxiliares
**Semana:** 10
**Objetivo:** Todas as páginas restantes do MVP entregues.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Página /blog com grid e filtros por setor | Frontend | — |
| Páginas /blog/[slug] com portableText + sidebar + CTA | Frontend | — |
| portableText configurado (imagens, código, tabelas) | CMS | Equipe insere conteúdo rich text |
| ISR para artigos de blog | Técnico | — |
| Página /sobre com introdução + timeline animada | Frontend | Animação via Intersection Observer |
| Timeline vertical desktop / scroll horizontal mobile | Frontend | Testado nos breakpoints |
| Página /contato com form + Google Maps + dados | Frontend | — |
| Form contato integrado com CRM | Integração | Lead no CRM de staging |
| Página /minha-conta "Em breve" | Frontend | Sem rota funcional |
| Página /politica-de-privacidade | Frontend | Conteúdo LGPD inserido |

**Milestone:** `v0.6 — Todas as páginas do MVP entregues`

---

#### SPRINT 6 — SEO, Analytics e Qualidade
**Semana:** 11
**Objetivo:** Site pronto para indexação, rastreamento completo e qualidade validada.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Metadata dinâmica por tipo de página (Next.js Metadata API) | SEO | title + description únicos por página |
| Schema: Organization, Product, Service, Article, BreadcrumbList | SEO | Validado em schema.org Rich Results |
| Open Graph + Twitter Cards em todas as páginas | SEO | Testado com Facebook Debugger |
| Canonical URLs implementadas | SEO | — |
| Sitemap dinâmico gerado (app/sitemap.ts) | SEO | Acessível em /sitemap.xml |
| robots.txt | SEO | — |
| GTM configurado no projeto com consentimento | Analytics | GTM Preview sem erros |
| GA4 via GTM | Analytics | Sessões aparecem em GA4 Realtime |
| 8 eventos GTM implementados e verificados | Analytics | Todos os eventos disparam no GTM Preview |
| Auditoria de acessibilidade (ARIA, alt, contraste, teclado) | Qualidade | Sem erros WCAG 2.1 AA críticos |
| Auditoria de performance (PageSpeed Insights) | Qualidade | LCP < 2,5s / CLS < 0,1 / INP < 200ms |
| Testes de responsividade nos 4 breakpoints | Qualidade | Sem quebras visuais |
| Testes de formulários (validação, envio, CRM, e-mail) | Qualidade | Todos os fluxos funcionam |
| Revisão de segurança (env vars, validação server-side) | Segurança | Sem tokens expostos no cliente |

**Milestone:** `v0.9 — Release Candidate`

---

#### SPRINT 7 — Conteúdo, CMS Handoff e Launch
**Semana:** 12
**Objetivo:** Conteúdo mínimo inserido, equipe treinada no Sanity e site no ar no domínio gaiatec.com.br.

| Entregável | Tipo | Critério de Conclusão |
|---|---|---|
| Preview em tempo real configurado no Sanity | CMS | Equipe consegue pré-visualizar antes de publicar |
| Treinamento da equipe interna no Sanity Studio | Capacitação | Equipe insere/edita produto de forma autônoma |
| Conteúdo mínimo inserido: 10+ produtos com specs e imagens | Conteúdo | Fichas técnicas completas no Sanity |
| Conteúdo mínimo: 5+ serviços | Conteúdo | — |
| Conteúdo mínimo: 5+ aplicações | Conteúdo | — |
| Conteúdo mínimo: 11 setores com descrição e imagem | Conteúdo | Páginas de setor com conteúdo real |
| Conteúdo mínimo: 3 slides do carrossel ativos | Conteúdo | — |
| Conteúdo mínimo: 2 artigos de blog publicados | Conteúdo | — |
| Configuração de DNS do domínio gaiatec.com.br no Vercel | Infra | HTTPS funcionando |
| Google Search Console configurado e sitemap submetido | SEO | — |
| Revisão final do deploy de produção | Infra | Sem erros de build ou 404s críticos |
| **LAUNCH** 🚀 | Negócio | Site ao vivo em gaiatec.com.br |

**Milestone:** `v1.0 — LAUNCH`

---

### 5.3 Resumo Visual do Roadmap

```
Sem  1    │ SPRINT 0 — Setup + Infra + Schemas Sanity
──────────┼──────────────────────────────────────────
Sem  2-3  │ SPRINT 1 — Header + Footer + Megamenu + Cookie + WhatsApp + Modal + Breadcrumb
──────────┼──────────────────────────────────────────
Sem  4-5  │ SPRINT 2 — Homepage Completa
──────────┼──────────────────────────────────────────
Sem  6-7  │ SPRINT 3 — Catálogo de Produtos + Fichas Técnicas + Filtros
──────────┼──────────────────────────────────────────
Sem  8-9  │ SPRINT 4 — Setores (11) + Serviços + Aplicações + Cross-links
──────────┼──────────────────────────────────────────
Sem  10   │ SPRINT 5 — Blog + Sobre/Timeline + Contato + Páginas Auxiliares
──────────┼──────────────────────────────────────────
Sem  11   │ SPRINT 6 — SEO + Analytics (GTM/GA4) + Qualidade + Segurança
──────────┼──────────────────────────────────────────
Sem  12   │ SPRINT 7 — Conteúdo + Treinamento CMS + DNS + LAUNCH 🚀
──────────┴──────────────────────────────────────────
```

---

## 6. Checklist de Launch

> O site só vai ao ar quando **todos os itens críticos** estiverem marcados.

### 6.1 Técnico

- [ ] Build de produção sem erros (`npm run build` passa sem warnings críticos)
- [ ] Preview deploy na Vercel funcionando sem 404s ou erros de console
- [ ] Domínio gaiatec.com.br configurado com HTTPS (certificado SSL ativo)
- [ ] Redirecionamento www → raiz (ou raiz → www) configurado
- [ ] Variáveis de ambiente de produção configuradas no Vercel (todas as 8 variáveis)
- [ ] ISR funcionando: editar produto no Sanity e verificar atualização em < 120s no site
- [ ] robots.txt acessível em /robots.txt e sem bloqueio de páginas públicas
- [ ] sitemap.xml acessível em /sitemap.xml e contendo todas as URLs do catálogo
- [ ] Core Web Vitals medidos em produção: LCP < 2,5s, CLS < 0,1, INP < 200ms
- [ ] Nenhum `<img>` nativo no codebase (todos são `next/image`)
- [ ] 404 page customizada funcionando

### 6.2 SEO

- [ ] H1 único em cada página (verificado via Screaming Frog ou similar)
- [ ] Meta descriptions presentes em todas as páginas (155-160 chars)
- [ ] Open Graph tags testadas (Facebook Sharing Debugger)
- [ ] Twitter Cards testadas
- [ ] Schema Product validado para pelo menos 3 produtos (Google Rich Results Test)
- [ ] Schema Organization validado na homepage
- [ ] Google Search Console: domínio verificado
- [ ] Sitemap submetido ao Google Search Console
- [ ] Indexação solicitada para homepage, /produtos, /setores

### 6.3 Analytics

- [ ] GTM configurado e carregando corretamente (GTM Preview sem erros)
- [ ] GA4 recebendo sessões em tempo real (GA4 Realtime Report)
- [ ] Cookie Consent bloqueando GTM/GA4 antes do consentimento (verificado em aba anônima)
- [ ] Evento `solicitar_orcamento` disparando corretamente no GTM Preview
- [ ] Evento `whatsapp_click` disparando corretamente
- [ ] Evento `download_datasheet` disparando corretamente
- [ ] Conversões configuradas no GA4 (solicitar_orcamento, download_datasheet, whatsapp_click)

### 6.4 Integrações

- [ ] Modal de Orçamento: lead aparece no CRM de produção após envio de teste
- [ ] Modal de Orçamento: e-mail de notificação interna recebido
- [ ] Formulário de Contato: lead aparece no CRM de produção
- [ ] Download gated (se ativado): e-mail capturado no CRM
- [ ] Botão WhatsApp: abre conversa no número correto com mensagem pré-formatada
- [ ] CORS do Sanity: domínio de produção e preview da Vercel nas origens permitidas

### 6.5 Conteúdo (Mínimo para Launch)

- [ ] 11 setores com: nome, descrição, imagem de qualidade, meta description
- [ ] ≥ 10 produtos com: imagens, specs técnicas, setor/categoria/sub, datasheet (PDF), SEO
- [ ] ≥ 5 serviços com: descrição, setor, categoria, benefícios, CTAs
- [ ] ≥ 5 aplicações com: descrição, produtos/serviços relacionados, ROI, CTAs
- [ ] ≥ 3 slides do carrossel: ativos, com imagem de alta qualidade, CTA e link
- [ ] ≥ 2 artigos de blog publicados
- [ ] Página Sobre: texto de introdução e 11 marcos da timeline preenchidos
- [ ] Página Contato: endereço, telefone, e-mail, WhatsApp, horário de atendimento reais
- [ ] Política de Privacidade: conteúdo LGPD aprovado pelo jurídico/cliente
- [ ] Footer: CNPJ, endereço, links de redes sociais preenchidos

### 6.6 Legal e Compliance (LGPD)

- [ ] Cookie Consent funcional com as 3 opções (Aceitar / Configurar / Rejeitar)
- [ ] Política de Privacidade linkada no Cookie Consent e no footer
- [ ] Nenhum cookie de rastreamento ativado antes do consentimento (verificado com browser devtools)
- [ ] Download gated (se implementado): informação de uso do e-mail clara para o usuário
- [ ] CNPJ da empresa visível no footer

### 6.7 Qualidade e UX

- [ ] Testado em Chrome, Firefox, Safari e Edge (versões recentes)
- [ ] Testado em dispositivo móvel real (iOS e Android)
- [ ] Navegação por teclado funcional em todas as páginas (Tab, Enter, Escape)
- [ ] Foco visível em todos os elementos interativos
- [ ] Nenhum link quebrado nas páginas de conteúdo inicial
- [ ] Imagens de todos os produtos e setores com alt text preenchido
- [ ] Skip-to-Content link presente e funcional

---

## 7. Matriz de Riscos e Contingências

| ID | Risco | Impacto | Probabilidade | Severidade | Plano de Contingência |
|---|---|---|---|---|---|
| R01 | **Decisão do CRM atrasada** — cliente não escolhe RD Station ou HubSpot a tempo | Alto | Alta | 🔴 Crítico | Desenvolver Modal de Orçamento com fallback: salvar lead em arquivo CSV + notificação por e-mail via Resend. Integrar CRM no Sprint 1 assim que decisão for tomada |
| R02 | **Imagens de qualidade insuficientes** — cliente não fornece fotos reais dos setores/produtos | Alto | Alta | 🔴 Crítico | Mapear assets necessários na Sprint 0. Usar imagens de banco (Unsplash/Freepik) como placeholder temporário apenas nos setores. Priorizar imagens reais dos produtos |
| R03 | **Conteúdo mínimo não entregue a tempo** — 10+ produtos sem specs completas no Sanity antes da Sprint 7 | Alto | Média | 🔴 Crítico | Criar cronograma de inserção de conteúdo paralelo ao desenvolvimento (não depender da Sprint 7). Designar responsável na equipe GAIATEC para inserção a partir da Sprint 3 |
| R04 | **Filtros secundários subestimados** — quantidade de variações por categoria maior que prevista | Médio | Média | 🟡 Moderado | Priorizar as 4 categorias de maior volume (Vazão, Gases, Nível, Pressão). Demais categorias com filtros básicos no MVP e expandir pós-launch |
| R05 | **Integração com CRM instável** — API do CRM com falhas intermitentes | Alto | Baixa | 🟡 Moderado | Implementar retry automático (3 tentativas) + fallback de e-mail. Logar todos os leads em arquivo de log server-side |
| R06 | **Performance abaixo do alvo** — LCP > 2,5s em dispositivos mobile mais lentos | Alto | Média | 🟡 Moderado | Priorizar imagens com `priority` e `sizes` corretos desde Sprint 1. Auditoria de performance na Sprint 6 com tempo para correções |
| R07 | **DNS/domínio com propagação lenta** — configuração de gaiatec.com.br demora > 48h | Médio | Baixa | 🟢 Baixo | Iniciar configuração de DNS na Sprint 6 (não na Sprint 7). Manter URL da Vercel como fallback temporário |
| R08 | **Número WhatsApp Business não coletado a tempo** | Médio | Baixa | 🟢 Baixo | Coletar na Sprint 0. Botão WhatsApp pode usar número de telefone fixo como placeholder temporário |
| R09 | **Política de gated content não decidida** — download direto ou com e-mail | Baixo | Alta | 🟢 Baixo | Iniciar com download direto (sem gated). Implementar gated como feature posterior se o cliente decidir |
| R10 | **Scope creep** — cliente solicita funcionalidades de Fase 2 durante o MVP | Alto | Média | 🟡 Moderado | Matriz MoSCoW documentada (seção 3 deste documento) serve como referência de escopo. Qualquer solicitação nova entra no backlog de Fase 2 |

---

## 8. Handoff para Desenvolvimento

> Este documento é o **briefing de entrada** para o desenvolvedor. Leia antes de abrir qualquer editor de código.

### 8.1 Documentos de Referência (Ler Nesta Ordem)

| # | Documento | Caminho | Contém |
|---|---|---|---|
| 1 | **Design Document** | `docs/plans/2026-02-22-gaiatec-sistemas-design.md` | Arquitetura, specs de todas as páginas, schemas CMS, SEO, performance, responsividade |
| 2 | **Business Analyst** | `docs/plans/2026-02-23-gaiatec-business-analyst.md` | 82 Requisitos Funcionais, 25 RNFs, 12 User Stories com critérios de aceite, Backlog por Sprint, DoD |
| 3 | **Product Manager (este)** | `docs/plans/2026-02-23-gaiatec-product-manager.md` | PRD executivo, KPIs, MoSCoW, integrações, roadmap, checklist de launch |

### 8.2 Setup do Ambiente de Desenvolvimento

```bash
# 1. Criar projeto Next.js
npx create-next-app@latest gaiatec-site \
  --typescript \
  --tailwind \
  --app \
  --src-dir \
  --import-alias "@/*"

# 2. Instalar dependências principais
npm install \
  @sanity/client \
  @sanity/image-url \
  next-sanity \
  sanity \
  react-hook-form \
  @hookform/resolvers \
  zod \
  lucide-react \
  clsx \
  tailwind-merge

# 3. Instalar Shadcn/UI
npx shadcn-ui@latest init

# 4. Criar projeto Sanity
npm create sanity@latest -- \
  --project-name "GAIATEC" \
  --dataset production \
  --output-path ./sanity

# 5. Configurar variáveis de ambiente
cp .env.example .env.local
# Preencher: NEXT_PUBLIC_SANITY_PROJECT_ID, SANITY_API_TOKEN,
#             NEXT_PUBLIC_GA4_ID, NEXT_PUBLIC_GTM_ID,
#             NEXT_PUBLIC_WHATSAPP_NUMBER, CRM_API_KEY,
#             RESEND_API_KEY, NOTIFICATION_EMAIL
```

### 8.3 Estrutura de Pastas Recomendada

```
gaiatec-site/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── (site)/                   # Route group para o site público
│   │   │   ├── layout.tsx            # Layout raiz (Header + Footer)
│   │   │   ├── page.tsx              # Homepage
│   │   │   ├── setores/
│   │   │   │   ├── page.tsx          # /setores
│   │   │   │   └── [setor]/page.tsx  # /setores/[setor]
│   │   │   ├── produtos/
│   │   │   │   ├── page.tsx          # /produtos
│   │   │   │   └── [slug]/page.tsx   # /produtos/[slug]
│   │   │   ├── servicos/
│   │   │   ├── aplicacoes/
│   │   │   ├── blog/
│   │   │   ├── sobre/page.tsx
│   │   │   ├── contato/page.tsx
│   │   │   ├── minha-conta/page.tsx
│   │   │   └── politica-de-privacidade/page.tsx
│   │   ├── api/                      # API Routes
│   │   │   ├── leads/route.ts        # Integração CRM + e-mail
│   │   │   └── datasheet/route.ts    # Download gated
│   │   ├── sitemap.ts
│   │   └── robots.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── Megamenu.tsx
│   │   │   └── MobileMenu.tsx
│   │   ├── global/
│   │   │   ├── WhatsAppButton.tsx
│   │   │   ├── CookieConsent.tsx
│   │   │   ├── OrcamentoModal.tsx
│   │   │   └── Breadcrumb.tsx
│   │   ├── home/
│   │   ├── produtos/
│   │   ├── setores/
│   │   ├── servicos/
│   │   ├── aplicacoes/
│   │   └── ui/                       # Componentes Shadcn/UI customizados
│   ├── lib/
│   │   ├── sanity/
│   │   │   ├── client.ts             # Sanity client config
│   │   │   ├── queries.ts            # Todas as GROQ queries
│   │   │   └── image.ts              # urlFor helper
│   │   ├── gtm.ts                    # dataLayer helpers
│   │   ├── crm.ts                    # CRM integration
│   │   └── email.ts                  # Resend/SendGrid
│   ├── types/
│   │   └── sanity.types.ts           # Tipos gerados dos schemas
│   └── hooks/
│       ├── useIntersectionObserver.ts
│       └── useDebounce.ts
├── sanity/
│   ├── schemas/                      # Todos os schemas Sanity
│   └── sanity.config.ts
├── public/
│   └── icons/                        # SVGs dos setores
├── docs/
│   └── plans/                        # Documentação do projeto
└── .env.local                        # Variáveis de ambiente (não commitar)
```

### 8.4 Primeiras Tarefas — Sprint 0 (Semana 1)

Ordem de execução:

1. **Criar repositório Git** (GitHub/GitLab) e convidar stakeholders relevantes
2. **Iniciar projeto Next.js** com o comando da seção 8.2
3. **Criar projeto Sanity** e configurar dataset `production`
4. **Criar os 10 schemas Sanity** (ver seção 8 do Design Document para estrutura detalhada):
   - `produto`, `setor`, `categoria`, `subCategoria`, `servico`, `aplicacao`, `artigo`, `slideCarrossel`, `produtoDestaque`, `servicoDestaque`
5. **Configurar Tailwind** com tokens da identidade GAIATEC (aguardar briefing visual/brandbook se disponível)
6. **Deploy inicial no Vercel** com domínio de preview
7. **Coletar do cliente** (URGENTE):
   - Decisão CRM (RD Station ou HubSpot) + credenciais de API
   - Número WhatsApp Business
   - E-mail para notificações de leads
   - Brandbook / guia de identidade visual (se disponível)
   - Acesso ao domínio gaiatec.com.br para futura configuração de DNS

### 8.5 Decisões Técnicas Recomendadas

| Decisão | Recomendação | Alternativa | Motivo |
|---|---|---|---|
| Client-side filtering | React `useState` + GROQ no carregamento inicial | SWR + API route | Simplicidade para MVP; catálogo < 500 produtos |
| Filtros na URL | `useSearchParams` + `useRouter` do Next.js | query-string lib | Nativo, sem dependência extra |
| Autocomplete | GROQ query com `match` operator | Algolia | GROQ suficiente para MVP |
| Formulários | React Hook Form + Zod | Formik | Performance superior + TS nativo |
| Animações | Framer Motion | CSS transitions | Mais controle; usar apenas onde necessário |
| Carrossel | Embla Carousel | Swiper | Mais leve, sem opinionated styles |
| Contadores animados | Custom hook + Intersection Observer | CountUp.js | Evitar dependência desnecessária |

### 8.6 Padrão de GROQ Queries

```typescript
// Padrão recomendado: sempre projetar apenas os campos necessários
// ❌ Evitar:
const query = `*[_type == "produto"]`

// ✅ Correto:
const produtoCardQuery = groq`
  *[_type == "produto" && setor[]->slug.current match $setor] {
    _id,
    nome,
    "slug": slug.current,
    descricaoResumida,
    "imagemPrincipal": imagens[0].asset->url,
    "setor": setor[]->nome,
    "categoria": categoria->nome,
    badgeDestaque
  }
`
```

### 8.7 Variáveis de Ambiente — Referência Completa

```env
# Sanity
NEXT_PUBLIC_SANITY_PROJECT_ID=           # ID do projeto Sanity
NEXT_PUBLIC_SANITY_DATASET=production    # Dataset
SANITY_API_TOKEN=                        # Token de leitura (server-side only)

# Analytics
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX          # Container GTM
NEXT_PUBLIC_GA4_ID=G-XXXXXXXXXX         # GA4 Measurement ID

# WhatsApp
NEXT_PUBLIC_WHATSAPP_NUMBER=5511XXXXXXXXX # DDD + número sem espaços

# CRM (apenas server-side)
CRM_PROVIDER=rdstation                   # ou: hubspot
CRM_API_KEY=                             # Chave da API do CRM
CRM_FORM_ID=                             # ID do formulário no CRM

# E-mail (apenas server-side)
RESEND_API_KEY=                          # ou SENDGRID_API_KEY
NOTIFICATION_EMAIL=comercial@gaiatec.com.br

# App
NEXT_PUBLIC_SITE_URL=https://gaiatec.com.br
```

---

## 9. Decisões Pendentes — Requer Cliente

> Estas decisões **bloqueiam** ou **impactam** entregas específicas. Recolher na Sprint 0.

| # | Decisão | Impacto se Não Resolvida | Sprint Bloqueada | Urgência |
|---|---|---|---|---|
| D01 | **CRM:** RD Station ou HubSpot? | Modal de orçamento sem integração real | Sprint 1 (integração) | 🔴 URGENTE |
| D02 | **Número WhatsApp Business** da GAIATEC | Botão WhatsApp sem destino correto | Sprint 1 | 🔴 URGENTE |
| D03 | **E-mail de notificação** para receber leads | Notificações não chegam | Sprint 1 | 🔴 URGENTE |
| D04 | **Política de datasheet:** download direto ou gated (captura de e-mail antes)? | Estratégia de captação do ENG indefinida | Sprint 3 | 🟡 IMPORTANTE |
| D05 | **Imagens reais dos 11 setores** (fotos de campo de alta qualidade) | Páginas de setor com placeholders no launch | Sprint 4 | 🟡 IMPORTANTE |
| D06 | **Imagens dos produtos** (profissional, fundo branco ou em campo) | Fichas técnicas sem imagem real | Sprint 3 | 🟡 IMPORTANTE |
| D07 | **PDFs dos datasheets** de cada produto | Download de datasheet não funcional | Sprint 3 | 🟡 IMPORTANTE |
| D08 | **Brandbook / guia de identidade visual** (paleta de cores, tipografia, logo em SVG) | Tokens de design baseados em suposição | Sprint 0 | 🟡 IMPORTANTE |
| D09 | **Conteúdo da Política de Privacidade** (LGPD) — aprovado pelo jurídico | Página em branco no launch | Sprint 5 | 🟡 IMPORTANTE |
| D10 | **Credenciais de acesso ao domínio** gaiatec.com.br para configuração de DNS | Launch no domínio correto bloqueado | Sprint 6-7 | 🟡 IMPORTANTE |
| D11 | **Casos de sucesso / projetos de referência** — clientes que autorizam uso de nome/logo | Seção de prova social vazia no launch | Sprint 4 | 🟢 DESEJÁVEL |
| D12 | **Redes sociais** da GAIATEC (LinkedIn, Instagram, YouTube) — URLs confirmadas | Links do footer incorretos | Sprint 1 | 🟢 DESEJÁVEL |

---

*Documento gerado em 2026-02-23 — Etapa 3 — Product Manager.*
*Próxima etapa: Etapa 4 — Arquitetura Técnica (Frontend Design System, Component Tree, API Design)*
