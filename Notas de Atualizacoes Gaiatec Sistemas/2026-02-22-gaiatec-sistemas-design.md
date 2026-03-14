# Design Document — GAIATEC SISTEMAS Website
**Data:** 2026-02-22
**Versão:** 1.0
**Status:** Aprovado pelo cliente

---

## 1. Visão Geral do Projeto

### 1.1 Empresa
**GAIATEC SISTEMAS** — Fundada em 2004. Mais de 20 anos de atuação em instrumentação industrial, controle e monitoramento para diferentes setores da indústria.

### 1.2 Objetivo do Site
Plataforma de catálogo técnico B2B com geração de leads qualificados. O visitante navega pelo portfólio técnico completo, encontra a solução ideal através de filtros inteligentes e solicita orçamento ou fala com um especialista.

### 1.3 Abordagem Arquitetural Escolhida
**Híbrida: Solução-First + Filtro Inteligente**
Homepage que comunica valor imediatamente, com barra de busca/filtro inteligente em destaque, entradas por Setor, Categoria e Aplicação. Cada persona encontra seu caminho natural sem escolha forçada.

### 1.4 Setores Atendidos
1. Saneamento
2. Gás e Petróleo
3. Biogás e Biometano
4. Proteção Catódica
5. HVAC
6. Controle Ambiental
7. Segurança Operacional
8. Agronegócio
9. Indústria
10. Instrumentação em Geral
11. Telemetria

---

## 2. Personas e Jornadas

### 2.1 Perfis de Usuário

| Persona | Perfil | Objetivo no Site | Entrada Principal |
|---|---|---|---|
| **Engenheiro Técnico / Especificador** | Busca specs técnicas, datasheet, compatibilidade | Especificar produto correto para o projeto | Busca inteligente ou filtro técnico avançado |
| **Gerente / Coordenador de Manutenção** | Precisa de solução confiável com suporte | Avaliar custo-benefício e prazo | Página de Aplicações ou Setor |
| **Comprador / Suprimentos** | Já tem especificação, precisa cotar | Solicitar orçamento rapidamente | Card de produto → Solicitar Orçamento |
| **Diretor / Gestor Industrial** | Avalia parceiros estratégicos | Validar credibilidade e portfólio | Homepage → Sobre → Certificações |

### 2.2 Jornadas Principais

**Jornada 1 — Engenheiro Especificador:**
Homepage → Busca Inteligente → Filtros Técnicos → Ficha de Produto → Download Datasheet → Solicitar Orçamento

**Jornada 2 — Comprador:**
Homepage → Setor → Categoria → Produto → Solicitar Orçamento (formulário rápido)

**Jornada 3 — Gestor Industrial:**
Homepage → Sobre → Certificações → Aplicações → Falar com Especialista

**Jornada 4 — Manutenção:**
Homepage → Aplicações → Pacote Integrado → Serviços → Solicitar Proposta

---

## 3. Stack Técnico

| Camada | Tecnologia | Justificativa |
|---|---|---|
| **Framework** | Next.js 14+ (App Router) + TypeScript | SSR/SSG para SEO, performance, escalabilidade |
| **Estilização** | Tailwind CSS + Shadcn/UI | Agilidade de desenvolvimento, consistência visual |
| **CMS** | Sanity Studio (customizado) | Interface visual intuitiva para equipe interna sem perfil técnico |
| **Busca / Filtros** | Sanity GROQ queries + Algolia (fase 2) | GROQ suficiente para MVP; Algolia para escala |
| **Formulários / Leads** | React Hook Form + integração CRM | RD Station ou HubSpot — definir com cliente |
| **Hospedagem** | Vercel | Deploy automático, edge network, preview por branch |
| **Analytics** | Google Analytics 4 + Google Tag Manager | Rastreamento de eventos por CTA |
| **Imagens** | Next/Image + WebP/AVIF | Otimização automática, lazy loading |
| **Email leads** | Resend ou SendGrid | Notificação interna para cada lead gerado |

---

## 4. Escopo MVP vs Fase 2

### MVP (Lançamento)
- [x] Catálogo de produtos com filtros inteligentes multinível
- [x] Fichas técnicas de produtos com specs e downloads
- [x] Sistema de serviços por setor
- [x] Aplicações integradas (pacotes consultivos)
- [x] Páginas individuais de cada setor (landing pages)
- [x] Formulários de solicitação de orçamento
- [x] Blog (SEO e autoridade técnica)
- [x] Página Sobre + Timeline
- [x] Sanity Studio customizado para gestão de conteúdo
- [x] LGPD / Cookie consent
- [x] WhatsApp flutuante
- [x] Analytics + GTM
- [x] SEO técnico completo (sitemap, meta tags, schema)
- [x] "Minha Conta" — aparece no menu mas leva a página "Em breve"

### Fase 2 (Pós-lançamento)
- [ ] Comparador de produtos (até 3 produtos lado a lado)
- [ ] Portal do cliente / Minha Conta (histórico, downloads, OS)
- [ ] Algolia para busca avançada em escala
- [ ] Calculadora técnica de dimensionamento (ex.: seletor de medidor por DN e vazão)
- [ ] Chat ao vivo / chatbot de qualificação de leads

---

## 5. Estrutura de Navegação

### 5.1 Menu Principal (Header)

```
[LOGO GAIATEC]
HOME | SETORES ▼ | PRODUTOS ▼ | SERVIÇOS | APLICAÇÕES | BLOG | A GAIATEC | MINHA CONTA*
                                        [🔍 Buscar]  [Solicitar Orçamento] ← CTA primário
```

*"Minha Conta" — link desabilitado no MVP, exibe tooltip "Em breve"

**Faixa de credibilidade abaixo do header (desktop):**
```
✔ RBC Acreditado  |  ✔ INMETRO  |  ✔ ISO  |  +20 anos de experiência  |  11 Setores
```

**Comportamento do Header:**
- Sticky com scroll-shrink: encolhe levemente ao rolar, mantém logo e CTA sempre visíveis
- Megamenu em SETORES: grid com 11 setores + ícone
- Megamenu em PRODUTOS: acesso rápido por setor + categorias principais
- Background: transparente no topo → sólido ao rolar

### 5.2 Sitemap Completo

```
/                          → Homepage
/setores                   → Listagem de todos os setores
/setores/[setor]           → Página individual do setor
/produtos                  → Catálogo com filtros
/produtos/[slug]           → Ficha técnica do produto
/servicos                  → Listagem de serviços
/servicos/[slug]           → Página individual do serviço
/aplicacoes                → Catálogo de aplicações integradas
/aplicacoes/[slug]         → Página individual da aplicação
/blog                      → Listagem de artigos
/blog/[slug]               → Artigo individual
/sobre                     → Sobre a GAIATEC + Timeline
/contato                   → Formulário de contato geral
/politica-de-privacidade   → LGPD
/minha-conta               → Página "Em breve" (MVP)
```

---

## 6. Páginas — Especificações Detalhadas

### 6.1 HOMEPAGE (`/`)

#### Hero — Carrossel Dinâmico
- Formato: carrossel automático (auto-advance 5s, pause no hover, controle manual)
- Cada slide apresenta: produto, serviço, aplicação ou setor em destaque
- Conteúdo de cada slide:
  - Imagem de campo em alta qualidade (WebP/AVIF)
  - Overlay de degradê escuro (bottom-to-top, opacity 60%)
  - Título H1/H2 grande
  - Subtítulo (máx. 2 linhas)
  - CTA contextual: [Ver Produto] / [Conhecer Setor] / [Ver Aplicação]
- Mobile: swipe touch + dots de controle visíveis
- Performance: imagens otimizadas + lazy loading (exceto slide 1)

#### Barra de Busca Inteligente Global
- Posicionada imediatamente abaixo do hero
- Autocomplete com resultados em tempo real (produtos + serviços + aplicações)
- Filtros progressivos encadeados:
  - [Setor ▼] → atualiza → [Categoria ▼] → atualiza → [Tecnologia ▼] → [Buscar]
- Resultados mostram: miniatura, nome, categoria/setor correspondente

#### Seção Setores Interativos
- Tabs horizontais com os 11 setores
- Ao selecionar setor: imagem central de fundo desfocada (backdrop-blur)
- Sobre a imagem: grid de cards de categorias do setor
  - Card: ícone representativo + nome da categoria (ex.: "💧 Medição de Vazão")
  - Hover: elevação + sombra + leve aumento de escala (transform: scale(1.04))
  - Clique: navega para `/produtos?setor=[setor]&categoria=[categoria]` (filtros pré-aplicados)
- Auto-rotation entre setores (pausa ao interagir)
- Mobile: carrossel horizontal das tabs de setor + carrossel horizontal dos cards de categoria

#### Seção Produtos em Destaque
- Tab-bar horizontal de setores
- Visão inicial (sem seleção): 5 produtos estratégicos cross-setor
  - Macromedidor Ultrassônico (Saneamento)
  - Biodigestor GT-BIODIGEST (Biogás)
  - Detector Multigás Portátil (Segurança Operacional)
  - Junta de Isolamento Monobloco (Proteção Catódica / Gás e Petróleo)
  - Sistema de Telemetria GATCONNECT (Telemetria)
- Ao selecionar setor: fade-in com 5 produtos principais do setor
- Card de produto: imagem + nome + descrição (máx. 2 linhas) + [Saiba Mais]
- Hover: zoom leve na imagem + sombra + borda destacada
- Layout: 5 colunas desktop → 2 tablet → carrossel mobile
- Transição entre setores: fade-in/fade-out suave
- CTA fixo abaixo: [Ver Todos os Produtos]

#### Seção Serviços em Destaque
- Mesma lógica da seção de produtos (tabs de setor)
- Visão inicial: Instalação Técnica | Calibração RBC | Manutenção | Consultoria | Medições em Campo
- Card: ícone SVG + nome + descrição (máx. 2 linhas) + [Saiba Mais]
- Hover: elevação + ícone animado
- CTA fixo abaixo: [Ver Todos os Serviços]

#### Seção Aplicações em Destaque
- 3-4 cards de pacotes integrados estratégicos
- Card: imagem representativa + nome + setores relacionados + [Ver Solução Completa]

#### Seção Por que GAIATEC
- Números com counter animado (Intersection Observer ao entrar na viewport):
  - +20 anos de experiência
  - 11 setores atendidos
  - +500 biodigestores instalados
  - RBC Acreditado
- Ícones personalizados para cada diferencial

#### Seção Certificações
- Logos: RBC / INMETRO / ISO + selos de parceiros internacionais

#### CTA Final
- Texto: "Precisa de uma solução técnica para sua operação?"
- Botões: [Falar com um Especialista] | [Ver Catálogo Completo]

---

### 6.2 PÁGINA SETORES (`/setores` e `/setores/[setor]`)

#### Listagem (`/setores`)
- Hero: H1 "Principais Setores Atendidos pela GAIATEC SISTEMAS" + subtítulo + mosaico de imagens
- Filtro horizontal: todos os setores + "Ver Todos"
- Card de setor: imagem/ícone + título + mini descrição (2 frases) + aplicações clicáveis + soluções clicáveis + [Ver Mais]
- Animação sutil: hover com ícone escalando levemente
- Prova social na base: "Empresas que confiam na GAIATEC" (logos de clientes)
- Download: [Baixar Catálogo por Setor]
- Responsividade: 3 colunas desktop → 2 tablet → 1 mobile

#### Página Individual do Setor (`/setores/[setor]`)
Estrutura fixa para todos os setores:
1. Hero com imagem real do setor + H1 + subtítulo
2. Breadcrumb: Setores > [Nome do Setor]
3. Descrição geral (contexto, importância, desafios, como a GAIATEC atua)
4. Aplicações do setor (cards clicáveis)
5. Categorias de produtos (tabs ou accordion)
6. Produtos principais relacionados (cards com link)
7. Serviços aplicáveis (cards com ícone)
8. Cases / Projetos de Referência (breve relato + logos)
9. Benefícios para o setor (bullets)
10. Download catálogo técnico do setor
11. CTA final: [Fale com um Especialista em (Setor)] | [Solicitar Proposta]

**SEO por setor:** H1 único + meta description + URL canônica

---

### 6.3 PÁGINA PRODUTOS (`/produtos` e `/produtos/[slug]`)

#### Listagem com Filtros (`/produtos`)
- Hero: H1 "Produtos de Alta Performance para Medição, Controle e Segurança" + texto de valor + imagem/vídeo
- Barra de busca inteligente: autocomplete com miniatura + nome + categoria
- **Filtros Primários** (breadcrumb interativo, topo da página):
  - Nível 1: Setor
  - Nível 2: Categoria
  - Nível 3: Sub-categoria
  - Resultado: produtos compatíveis carregados dinamicamente
- **Filtros Secundários** (sidebar, dinâmicos por aplicação selecionada):
  - Medição de Vazão: Diâmetro (DN), Conexão, Faixa de Medição, Precisão, Sinal de Saída, Montagem
  - Detecção de Gases: Tipo de Gás, Faixa (ppm/%LEL), Método de Detecção, Instalação
  - Nível: Princípio de medição, Faixa, Material, Saída
  - Pressão: Tipo (manométrica/diferencial/absoluta), Faixa, Conexão, Classe de precisão
  - (cada categoria tem filtros contextuais específicos)
- Grid de produtos: 3 colunas desktop → 2 tablet → 1 mobile
- Card: imagem profissional + nome + mini descrição técnica (2 linhas) + setor + badge ("Mais pedido" / "Novo") + [Ver Detalhes]
- Hover: zoom leve + sombra + borda colorida da categoria
- Paginação ou infinite scroll (definir com desenvolvedor)
- Resultado da busca atualizado sem reload de página (client-side filtering)

#### Ficha Técnica do Produto (`/produtos/[slug]`)
1. Breadcrumb: Produtos > [Setor] > [Categoria] > [Sub-categoria] > [Produto]
2. Galeria de imagens (principal + miniaturas, zoom no hover)
3. Sidebar direita:
   - Nome do produto
   - Tecnologia e setor de aplicação
   - Descrição técnica resumida
   - Normas e certificações (ícones INMETRO, ISO, OIML, ABNT)
   - **CTA 1:** [Solicitar Orçamento] — abre modal com formulário
   - **CTA 2:** [Falar com Especialista] — redireciona para WhatsApp ou formulário
   - **CTA 3:** [Download Datasheet] — PDF direto ou gated (email antes de baixar)
4. Abas de conteúdo:
   - **Especificações Técnicas:** tabela completa (faixa, precisão, conexão, etc.)
   - **Aplicações:** setores e casos de uso
   - **Documentos:** manual, catálogo, certificados disponíveis
   - **Vídeo:** (quando disponível)
5. FAQ dinâmico (accordion) — perguntas frequentes do produto
6. Produtos Relacionados: "Complete sua solução" (produtos complementares)
7. Serviços Complementares: calibração, instalação, manutenção relacionados
8. "Ver onde este produto é utilizado" → link para aplicações correspondentes

**SEO por produto:** H1 único + meta description + alt text otimizado + Product schema

---

### 6.4 PÁGINA SERVIÇOS (`/servicos` e `/servicos/[slug]`)

#### Listagem (`/servicos`)
- Hero: H1 "Serviços Especializados para Garantir Eficiência e Confiabilidade" + texto de valor + CTA [Solicitar Atendimento]
- Barra de busca inteligente (acima do filtro)
- Filtro de setor: barra horizontal + "Ver Todos"
- Agrupamento adicional por categoria: Instalação | Calibração | Manutenção | Consultoria | Medições
- Grid 3 colunas: card com ícone SVG + nome + descrição (2 linhas) + setor + [Ver Detalhes]
- Hover: elevação + ícone animado
- Prova social: certificados emitidos + logos de clientes
- CTA flutuante: WhatsApp [Solicitar Atendimento Rápido]

#### Página Individual do Serviço (`/servicos/[slug]`)
1. Breadcrumb: Serviços > [Categoria] > [Serviço]
2. Descrição clara (o que é e por que é importante)
3. Setores atendidos
4. Produtos relacionados (link para fichas de produto)
5. Benefícios diretos (bullets)
6. Certificações e normas aplicáveis
7. FAQ curto (perguntas frequentes do serviço)
8. Downloads: Portfólio de Serviços / Escopo Técnico
9. CTA final: [Solicitar Proposta] | [Falar com um Especialista]

---

### 6.5 PÁGINA APLICAÇÕES (`/aplicacoes` e `/aplicacoes/[slug]`)

#### Listagem (`/aplicacoes`)
- Hero moderno: H1 + subtítulo ("Soluções completas para cada necessidade operacional")
- Filtro horizontal: setores + "Ver Todas" + barra de pesquisa
- Ao selecionar setor: apenas aplicações relacionadas (fade-in suave)
- Card de aplicação:
  - Ícone ou imagem representativa
  - Nome da aplicação
  - Mini descrição (máx. 2 linhas)
  - Setores atendidos (badges)
  - CTA: [Ver Soluções]
- Hover: elevação + sombra + cor no ícone
- Mobile: filtros em carrossel horizontal

#### Página Individual da Aplicação (`/aplicacoes/[slug]`)
1. Breadcrumb: Aplicações > [Setor] > [Aplicação]
2. Hero: nome + contexto (desafio + solução GAIATEC — storytelling técnico)
3. **Produtos Relacionados:** cards com "Problema/Necessidade → Como Resolvemos" → clique abre nova aba da ficha do produto
4. **Serviços Relacionados:** cards com problema → solução → clique abre nova aba do serviço
5. **Plataforma de Telemetria:** card dedicado → clique abre nova aba
6. **Solução Completa Integrada:** exemplo de caso de uso ou pacote (ex.: Controle de perdas em redes de água com macromedição + telemetria + análise)
7. **ROI / Benefícios Diretos** (bullets):
   - Redução de perdas em até 20%
   - Automação completa via telemetria
   - Conformidade com normas técnicas vigentes
8. CTA final: [Solicitar Orçamento] | [Falar com um Especialista]

**Cross-links:** cada aplicação linkada com produtos, serviços e soluções correspondentes
**SEO:** cada aplicação indexada como página própria (H1 + meta description + Article schema)

---

### 6.6 PÁGINA BLOG (`/blog` e `/blog/[slug]`)

#### Listagem (`/blog`)
- Grid de artigos: thumbnail + categoria (setor) + título + data + [Ler Mais]
- Filtro por setor / categoria técnica
- Artigos vinculados a produtos e aplicações (cross-link automático via Sanity tags)

#### Artigo (`/blog/[slug]`)
- H1 + meta description + Article schema
- Conteúdo técnico com imagens + referências
- Sidebar: produtos relacionados + aplicações relacionadas
- CTA ao final: [Falar com Especialista sobre este tema]

---

### 6.7 PÁGINA SOBRE (`/sobre`)

- **Texto de Introdução** (conforme fornecido pelo cliente — desde 2004 até autoridade nacional)
- **Timeline — Principais Marcos:**
  - 2004 — Fundação
  - 2006 — Desenvolvimento de Soluções Industriais
  - 2009 — Parcerias Internacionais
  - 2010 — Referência em Instrumentação
  - 2013 — Presença Nacional
  - 2015 — Projetos de Combate a Perdas
  - 2017 — Inovação em Macromedição
  - 2018 — Expansão para Biogás
  - 2022 — Resiliência e Compromisso
  - 2024 — +500 Biodigestores Instalados
  - 2025 — Excelência e Inovação Contínua
- **Formato da Timeline:**
  - Desktop: vertical (marcadores + texto lateral)
  - Mobile: horizontal scroll
  - Cada marco com ícone ilustrativo
  - Animação: fade-in ou slide-in ao rolar (Intersection Observer)
  - Design: minimalista, cores da identidade GAIATEC
- **CTA Final:**
  - "Mais de duas décadas de experiência, inovação e resultados comprovados."
  - [Conheça Nossas Soluções]

---

### 6.8 PÁGINA CONTATO (`/contato`)

- Formulário geral: nome, empresa, setor, telefone, e-mail, mensagem
- Integração com CRM (RD Station ou HubSpot — a definir)
- Mapa de localização (Google Maps embed)
- Dados de contato: telefone, e-mail, WhatsApp
- Horário de atendimento

---

## 7. Componentes Globais

### 7.1 WhatsApp Flutuante
- Botão fixo canto inferior direito
- Hover: expande com texto "Fale conosco no WhatsApp"
- Rastreamento via GTM: evento `whatsapp_click`

### 7.2 Cookie Consent (LGPD)
- Banner no primeiro acesso
- Opções: Aceitar Todos | Configurar | Rejeitar Opcionais
- Política de privacidade linkada
- Consentimento salvo em localStorage

### 7.3 Modal de Solicitação de Orçamento
- Abre ao clicar em qualquer [Solicitar Orçamento]
- Campos: nome, empresa, telefone, e-mail, produto de interesse (pré-preenchido), mensagem
- Envio → notificação interna + lead no CRM

### 7.4 Breadcrumb
- Presente em todas as páginas internas
- Markup schema BreadcrumbList para SEO

### 7.5 Footer
- Colunas: Setores | Produtos | Serviços | Aplicações | Blog | A GAIATEC | Contato
- Certificações: logos RBC, INMETRO, ISO
- Redes sociais
- CNPJ, endereço
- © GAIATEC SISTEMAS + Política de Privacidade

---

## 8. Sanity Studio — Estrutura do CMS

### 8.1 Schemas Necessários

```
produto {
  nome: string (required)
  slug: string (auto-gerado)
  setor: reference[] → setor
  categoria: reference → categoria
  subCategoria: reference → subCategoria
  tecnologia: string
  descricaoResumida: text
  especificacoesTecnicas: array of { campo, valor }
  imagens: image[]
  datasheet: file (PDF)
  manual: file (PDF)
  certificacoes: string[] (INMETRO, ISO, OIML, ABNT)
  aplicacoes: reference[] → aplicacao
  servicosRelacionados: reference[] → servico
  produtosRelacionados: reference[] → produto
  faq: array of { pergunta, resposta }
  badgeDestaque: enum (Mais Pedido | Novo | null)
  seoTitle: string
  seoDescription: string
  altImagemPrincipal: string
}

setor {
  nome: string
  slug: string
  descricao: text
  icone: image (SVG)
  imagemPrincipal: image
  metaDescription: string
}

categoria {
  nome: string
  slug: string
  setor: reference → setor
  icone: image (SVG)
  filtrosSecundarios: array of { nomeCampo, tipoCampo, opcoes[] }
}

subCategoria {
  nome: string
  slug: string
  categoria: reference → categoria
}

servico {
  nome: string
  slug: string
  setor: reference[] → setor
  categoriaServico: enum (Instalação | Calibração | Manutenção | Consultoria | Medições)
  descricao: text
  beneficios: string[]
  produtosRelacionados: reference[] → produto
  seoTitle: string
  seoDescription: string
}

aplicacao {
  nome: string
  slug: string
  setor: reference[] → setor
  descricao: text
  produtosRelacionados: reference[] → produto
  servicosRelacionados: reference[] → servico
  plataformaTelemetria: reference → produto
  solucaoCompleta: text
  roi: string[]
  seoTitle: string
  seoDescription: string
}

artigo {
  titulo: string
  slug: string
  setor: reference[] → setor
  conteudo: portableText
  thumbnail: image
  dataPublicacao: date
  produtosRelacionados: reference[] → produto
  aplicacoesRelacionadas: reference[] → aplicacao
  seoTitle: string
  seoDescription: string
}

slideCarrossel {
  titulo: string
  subtitulo: string
  imagem: image
  tipoLink: enum (produto | setor | aplicacao | servico | url)
  referencia: reference (dinâmica conforme tipoLink)
  ctaTexto: string
  ordem: number
  ativo: boolean
}

produtoDestaque {
  produto: reference → produto
  setor: reference → setor (null = geral)
  ordem: number
}

servicoDestaque {
  servico: reference → servico
  setor: reference → setor (null = geral)
  ordem: number
}
```

### 8.2 Customização do Sanity Studio
- Nome: "GAIATEC — Painel de Gestão"
- Estrutura de menu no Studio: Produtos | Serviços | Aplicações | Setores | Blog | Configurações (Carrossel, Destaques)
- Preview em tempo real para produtos e aplicações
- Campos obrigatórios validados (nome, slug, setor, imagem principal)
- Upload de PDF para datasheets e manuais
- Geração automática de slug a partir do nome

---

## 9. SEO Técnico

### 9.1 Requisitos por Tipo de Página

| Página | H1 | Meta Description | Schema | Sitemap |
|---|---|---|---|---|
| Homepage | 1 único | 155-160 chars | Organization | ✅ |
| Setor | Nome do setor | Descrição do setor | WebPage | ✅ |
| Produto | Nome do produto | Descrição técnica | Product | ✅ |
| Serviço | Nome do serviço | Descrição do serviço | Service | ✅ |
| Aplicação | Nome da aplicação | Descrição | WebPage | ✅ |
| Artigo blog | Título do artigo | Resumo | Article | ✅ |

### 9.2 URLs Amigáveis
```
/produtos/macromedidor-ultrassonico-gatsonic-p-clamp
/servicos/calibracao-laboratorial-rbc
/aplicacoes/controle-de-perdas-redes-de-agua
/setores/saneamento
/blog/como-selecionar-medidor-de-vazao-ultrassonico
```

### 9.3 Open Graph e Meta Tags
- og:title, og:description, og:image para todos os tipos de página
- Twitter Cards
- Canonical URLs

### 9.4 Sitemap
- Gerado automaticamente pelo Next.js (`app/sitemap.ts`)
- Inclui: todos os produtos, serviços, aplicações, setores, artigos

---

## 10. Performance

### 10.1 Metas Core Web Vitals
- LCP (Largest Contentful Paint): < 2.5s
- CLS (Cumulative Layout Shift): < 0.1
- FID / INP (Interaction to Next Paint): < 200ms

### 10.2 Estratégias
- Imagens: Next/Image com WebP/AVIF, `priority` no hero (slide 1), lazy loading nos demais
- Fontes: next/font com display: swap
- Ícones: SVG inline ou sprite (evitar icon fonts)
- JavaScript: tree-shaking + code splitting por rota (automático no Next.js App Router)
- CSS: Tailwind purge automático em produção
- ISR (Incremental Static Regeneration): revalidação a cada 60s para catálogo
- Preload: imagens dos 5 produtos iniciais da homepage

---

## 11. Responsividade

### 11.1 Breakpoints

| Breakpoint | Largura | Layout |
|---|---|---|
| Mobile | < 768px | 1 coluna, carrosséis horizontais |
| Tablet | 768px–1024px | 2 colunas, filtros colapsados |
| Desktop | > 1024px | 3-5 colunas, sidebar de filtros visível |
| Wide | > 1440px | Largura máxima do container: 1440px |

### 11.2 Comportamentos Específicos por Tela
- Carrossel hero: swipe touch no mobile
- Tabs de setor: carrossel horizontal no mobile
- Sidebar de filtros: drawer deslizante no mobile (botão "Filtrar")
- Megamenu: não aparece no mobile (substituído por menu hambúrguer)
- Timeline: vertical no desktop, scroll horizontal no mobile

---

## 12. Acessibilidade

- ARIA labels em todos os botões sem texto descritivo
- Alt text obrigatório em todas as imagens (configurado no Sanity como campo required)
- Foco visível em todos os elementos interativos
- Contraste mínimo WCAG 2.1 AA (4.5:1 para texto)
- Navegação por teclado funcional
- Skip to content link
- Filtros e cards legíveis por leitores de tela

---

## 13. Analytics e Rastreamento

### 13.1 Eventos GTM a Configurar

| Evento | Trigger | Parâmetros |
|---|---|---|
| `solicitar_orcamento` | Clique em qualquer "Solicitar Orçamento" | produto, setor, página |
| `falar_especialista` | Clique em "Falar com Especialista" | página, setor |
| `download_datasheet` | Download de PDF | produto, arquivo |
| `whatsapp_click` | Clique no botão WhatsApp | página |
| `filtro_aplicado` | Seleção de filtro | setor, categoria, filtro |
| `busca_realizada` | Submit da busca | termo |
| `slide_interacao` | Clique em CTA do carrossel | slide, produto/setor |
| `setor_selecionado` | Clique em setor (homepage ou produtos) | setor |

---

## 14. Integrações Externas

| Sistema | Finalidade | Quando configurar |
|---|---|---|
| CRM (RD Station / HubSpot) | Captura e qualificação de leads | Antes do lançamento |
| Google Analytics 4 | Analytics e comportamento | Antes do lançamento |
| Google Tag Manager | Gerenciamento de eventos | Antes do lançamento |
| Google Search Console | Monitoramento SEO | Pós-lançamento |
| WhatsApp Business API | Botão flutuante e redirect | Antes do lançamento |
| Resend / SendGrid | Notificações de lead por e-mail | Antes do lançamento |

---

## 15. Considerações Finais para o Desenvolvedor

1. **Filtros progressivos:** ao selecionar Setor, a Categoria deve atualizar automaticamente (sem reload de página). Usar React state + GROQ queries do Sanity em client-side ou API Route handlers.

2. **URL de filtros:** os filtros selecionados devem refletir na URL como query params (`/produtos?setor=saneamento&categoria=vazao&subcategoria=ultrassonico`) para compartilhamento e SEO.

3. **Filtros pré-aplicados:** cards da homepage que levam ao catálogo devem passar os parâmetros na URL para que os filtros já apareçam aplicados ao carregar a página de produtos.

4. **Formulário de orçamento:** abrir como modal (não redireciona). Produto de interesse pré-preenchido quando acionado a partir de uma ficha de produto.

5. **"Minha Conta":** exibir no menu com cursor disabled + tooltip "Em breve". Não criar rota funcional no MVP.

6. **Sanity Studio:** customizar workspace name, logo, e estrutura de documentos. Criar validações de campos obrigatórios. Ativar preview do produto antes de publicar.

7. **Blog:** configurar portableText no Sanity com suporte a imagens, código e tabelas. Gerar páginas estáticas com ISR.

8. **Imagens do carrossel:** configurar no Sanity com campo `ativo` e `ordem` para que a equipe interna consiga gerenciar slides sem o desenvolvedor.

9. **Performance:** usar `next/image` em todas as imagens sem exceção. Configurar `sizes` adequado para cada contexto (hero, card, galeria).

10. **Deploy:** configurar Vercel com variáveis de ambiente para: `NEXT_PUBLIC_SANITY_PROJECT_ID`, `SANITY_API_TOKEN`, `NEXT_PUBLIC_GA4_ID`, `NEXT_PUBLIC_GTM_ID`, `NEXT_PUBLIC_WHATSAPP_NUMBER`.

---

*Documento gerado em 2026-02-22. Aprovado pelo cliente para desenvolvimento.*
*Próxima etapa: Etapa 2 — Business Analyst (Requisitos, Critérios de Aceite, Backlog)*
