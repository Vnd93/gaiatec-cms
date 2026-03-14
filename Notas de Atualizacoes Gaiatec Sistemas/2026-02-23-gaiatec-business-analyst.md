# Business Analyst — GAIATEC SISTEMAS Website
**Data:** 2026-02-23
**Versão:** 1.0
**Status:** Em elaboração
**Etapa:** 2 de N — Requisitos, Critérios de Aceite, Backlog

---

## Sumário

1. [Requisitos Funcionais](#1-requisitos-funcionais)
2. [Requisitos Não-Funcionais](#2-requisitos-não-funcionais)
3. [User Stories com Critérios de Aceite](#3-user-stories-com-critérios-de-aceite)
4. [Backlog Priorizado — MVP](#4-backlog-priorizado--mvp)
5. [Definition of Done](#5-definition-of-done)
6. [Glossário de Personas](#6-glossário-de-personas)

---

## 1. Requisitos Funcionais

### Módulo 01 — Homepage

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-001 | O sistema deve exibir um carrossel automático no hero com intervalo de 5 segundos entre slides | Alta | Pause no hover |
| RF-002 | O carrossel deve pausar ao passar o mouse e suportar controle manual (setas e dots) | Alta | Acessibilidade: aria-label em controles |
| RF-003 | Cada slide deve conter: imagem de fundo, overlay de degradê, título H1/H2, subtítulo (máx. 2 linhas) e CTA contextual | Alta | Conteúdo gerenciado via Sanity |
| RF-004 | No mobile, o carrossel deve suportar navegação por swipe touch | Alta | — |
| RF-005 | O sistema deve exibir uma barra de busca inteligente abaixo do hero com autocomplete em tempo real | Alta | Resultados: produtos + serviços + aplicações |
| RF-006 | A busca deve suportar filtros progressivos encadeados: Setor → Categoria → Tecnologia | Alta | Sem reload de página |
| RF-007 | O sistema deve exibir a seção de Setores com tabs horizontais (11 setores) | Alta | — |
| RF-008 | Ao selecionar um setor na seção de setores, o sistema deve exibir cards de categorias sobre imagem central com backdrop-blur | Alta | Hover: scale(1.04) + sombra |
| RF-009 | O sistema deve exibir a seção de Produtos em Destaque com tab-bar de setores e 5 produtos iniciais cross-setor | Alta | Fade-in ao trocar setor |
| RF-010 | O sistema deve exibir a seção de Serviços em Destaque com os 5 serviços principais | Alta | Mesma lógica de tabs |
| RF-011 | O sistema deve exibir a seção de Aplicações em Destaque com 3-4 cards estratégicos | Alta | — |
| RF-012 | O sistema deve exibir a seção "Por que GAIATEC" com contadores animados ao entrar na viewport | Média | Intersection Observer |
| RF-013 | O sistema deve exibir a seção de Certificações com logos RBC, INMETRO, ISO e parceiros | Média | — |
| RF-014 | O sistema deve exibir CTA final com botões [Falar com um Especialista] e [Ver Catálogo Completo] | Alta | — |

### Módulo 02 — Setores

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-015 | O sistema deve exibir uma página de listagem de setores com grid responsivo (3 → 2 → 1 colunas) | Alta | — |
| RF-016 | Cada card de setor deve conter: imagem/ícone, título, mini descrição, aplicações clicáveis e [Ver Mais] | Alta | — |
| RF-017 | A página de listagem deve incluir filtro horizontal com todos os setores | Média | — |
| RF-018 | O sistema deve gerar páginas individuais por setor com estrutura de 11 seções fixas | Alta | Ver design doc seção 6.2 |
| RF-019 | Cada página de setor deve exibir produtos, serviços e aplicações relacionados com links | Alta | Cross-links |
| RF-020 | Cada página de setor deve ter CTA final de especialista contextualizado ao setor | Alta | Ex.: "Fale com especialista em Saneamento" |
| RF-021 | As páginas de setor devem ter download de catálogo técnico do setor em PDF | Média | PDF via Sanity |

### Módulo 03 — Produtos

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-022 | O sistema deve exibir catálogo de produtos com busca inteligente por autocomplete | Alta | Miniatura + nome + categoria |
| RF-023 | O sistema deve implementar filtros primários multinível: Setor → Categoria → Sub-categoria | Alta | Breadcrumb interativo |
| RF-024 | Os filtros primários selecionados devem refletir na URL como query params | Alta | `/produtos?setor=saneamento&categoria=vazao` |
| RF-025 | O sistema deve implementar filtros secundários dinâmicos por categoria (ex.: DN, Conexão, Precisão para medição de vazão) | Alta | Sidebar colapsável no mobile |
| RF-026 | Os filtros devem atualizar a listagem de produtos sem reload da página | Alta | Client-side filtering |
| RF-027 | Cada card de produto deve exibir: imagem, nome, mini descrição técnica (2 linhas), setor, badge e [Ver Detalhes] | Alta | Badges: "Mais pedido" / "Novo" |
| RF-028 | A página de ficha técnica do produto deve exibir galeria de imagens com zoom no hover | Alta | Principal + miniaturas |
| RF-029 | A ficha técnica deve exibir sidebar com nome, tecnologia, setor, descrição, normas e 3 CTAs | Alta | Solicitar Orçamento / Falar com Especialista / Download Datasheet |
| RF-030 | A ficha técnica deve conter abas: Especificações Técnicas / Aplicações / Documentos / Vídeo | Alta | Tabela de specs |
| RF-031 | A ficha técnica deve exibir FAQ dinâmico em accordion | Média | Conteúdo via Sanity |
| RF-032 | A ficha técnica deve exibir produtos relacionados ("Complete sua solução") | Alta | — |
| RF-033 | A ficha técnica deve exibir serviços complementares relacionados | Alta | — |
| RF-034 | O botão [Download Datasheet] deve permitir download direto de PDF ou exigir e-mail antes (gated) | Alta | Configurável por produto no Sanity |
| RF-035 | Cards da homepage com link para produtos devem passar parâmetros de filtro pré-aplicados na URL | Alta | — |

### Módulo 04 — Serviços

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-036 | O sistema deve exibir catálogo de serviços com filtro por setor e categoria | Alta | Instalação/Calibração/Manutenção/Consultoria/Medições |
| RF-037 | Cada card de serviço deve exibir: ícone SVG, nome, descrição (2 linhas), setor e [Ver Detalhes] | Alta | Hover: ícone animado |
| RF-038 | A página individual do serviço deve conter: descrição, setores, produtos relacionados, benefícios, certificações, FAQ, downloads e CTAs | Alta | — |

### Módulo 05 — Aplicações

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-039 | O sistema deve exibir catálogo de aplicações com filtro horizontal por setor | Alta | Fade-in suave ao filtrar |
| RF-040 | Cada card de aplicação deve exibir: ícone/imagem, nome, descrição (2 linhas), badges de setores e [Ver Soluções] | Alta | — |
| RF-041 | A página individual da aplicação deve conter: hero, produtos relacionados, serviços, plataforma de telemetria, solução integrada, ROI/benefícios e CTAs | Alta | — |
| RF-042 | Cada aplicação deve conter cross-links bidirecionais com produtos, serviços e soluções | Alta | — |

### Módulo 06 — Blog

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-043 | O sistema deve exibir listagem de artigos com grid (thumbnail + categoria + título + data + [Ler Mais]) | Alta | — |
| RF-044 | A listagem deve permitir filtro por setor e categoria técnica | Alta | — |
| RF-045 | Cada artigo deve ter sidebar com produtos e aplicações relacionados | Alta | Cross-links automáticos via tags Sanity |
| RF-046 | Cada artigo deve ter CTA ao final: [Falar com Especialista sobre este tema] | Alta | — |

### Módulo 07 — Sobre

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-047 | A página Sobre deve exibir texto de introdução da empresa seguido de timeline histórica | Alta | — |
| RF-048 | A timeline deve ter 11 marcos (2004–2025) com ícone, ano e descrição | Alta | — |
| RF-049 | A timeline deve ser vertical no desktop e scroll horizontal no mobile | Alta | — |
| RF-050 | Cada marco da timeline deve aparecer com animação de fade-in ao entrar na viewport | Média | Intersection Observer |

### Módulo 08 — Contato

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-051 | O sistema deve exibir formulário geral de contato com campos: nome, empresa, setor, telefone, e-mail e mensagem | Alta | — |
| RF-052 | O formulário deve integrar com CRM (RD Station ou HubSpot) ao submeter | Alta | Definir CRM antes do launch |
| RF-053 | A página deve exibir Google Maps embed com a localização da empresa | Média | — |
| RF-054 | A página deve exibir dados de contato: telefone, e-mail, WhatsApp e horário de atendimento | Alta | — |

### Módulo 09 — Componentes Globais

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-055 | O header deve ser sticky com comportamento de scroll-shrink (encolhe ao rolar) | Alta | Logo e CTA sempre visíveis |
| RF-056 | O header deve exibir megamenu em Setores (grid 11 setores + ícone) e Produtos (acesso por setor) | Alta | Desktop apenas |
| RF-057 | No mobile, o header deve substituir megamenu por menu hambúrguer | Alta | — |
| RF-058 | O header deve exibir faixa de credibilidade abaixo do logo (RBC, INMETRO, ISO, +20 anos, 11 setores) | Média | Desktop apenas |
| RF-059 | O header deve exibir o item "Minha Conta" desabilitado com tooltip "Em breve" | Alta | Sem rota funcional no MVP |
| RF-060 | O sistema deve exibir botão flutuante de WhatsApp no canto inferior direito | Alta | Hover: expande com texto |
| RF-061 | O botão WhatsApp deve disparar evento GTM `whatsapp_click` ao ser clicado | Alta | — |
| RF-062 | O sistema deve exibir banner de Cookie Consent LGPD no primeiro acesso | Alta | Opções: Aceitar / Configurar / Rejeitar opcionais |
| RF-063 | O consentimento de cookies deve ser salvo em localStorage | Alta | — |
| RF-064 | O sistema deve exibir modal de solicitação de orçamento ao clicar em qualquer [Solicitar Orçamento] | Alta | Abre modal, não redireciona |
| RF-065 | O modal de orçamento deve pré-preencher o campo "produto de interesse" quando acionado da ficha do produto | Alta | — |
| RF-066 | O modal de orçamento ao submeter deve: enviar lead ao CRM + disparar notificação interna por e-mail | Alta | Resend ou SendGrid |
| RF-067 | O sistema deve exibir breadcrumb em todas as páginas internas com markup BreadcrumbList | Alta | Schema SEO |
| RF-068 | O footer deve conter colunas: Setores, Produtos, Serviços, Aplicações, Blog, A GAIATEC, Contato | Alta | — |
| RF-069 | O footer deve exibir logos de certificações, redes sociais, CNPJ, endereço e link para Política de Privacidade | Alta | — |

### Módulo 10 — CMS (Sanity Studio)

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-070 | O Sanity Studio deve ter nome customizado: "GAIATEC — Painel de Gestão" | Média | — |
| RF-071 | O Sanity Studio deve ter estrutura de menu: Produtos / Serviços / Aplicações / Setores / Blog / Configurações | Alta | — |
| RF-072 | Os schemas de produto devem validar campos obrigatórios: nome, slug, setor, imagem principal | Alta | — |
| RF-073 | O Sanity deve gerar slug automaticamente a partir do nome | Alta | — |
| RF-074 | O Sanity deve suportar upload de PDF para datasheets e manuais | Alta | — |
| RF-075 | O Sanity deve ter preview em tempo real para produtos e aplicações antes de publicar | Média | — |
| RF-076 | O slide do carrossel no Sanity deve ter campos `ativo` e `ordem` para gerenciamento pela equipe interna | Alta | — |
| RF-077 | O schema de artigo deve suportar portableText com imagens, código e tabelas | Alta | — |

### Módulo 11 — SEO e Analytics

| ID | Requisito | Prioridade | Notas |
|---|---|---|---|
| RF-078 | O sistema deve gerar sitemap automaticamente via `app/sitemap.ts` incluindo todos os tipos de conteúdo | Alta | — |
| RF-079 | O sistema deve implementar Open Graph, Twitter Cards e Canonical URLs em todas as páginas | Alta | — |
| RF-080 | O sistema deve implementar schema structured data por tipo de página: Organization, Product, Service, Article, BreadcrumbList | Alta | — |
| RF-081 | O sistema deve configurar 8 eventos GTM: solicitar_orcamento, falar_especialista, download_datasheet, whatsapp_click, filtro_aplicado, busca_realizada, slide_interacao, setor_selecionado | Alta | Ver design doc seção 13 |
| RF-082 | O sistema deve implementar ISR (revalidação a cada 60s) para as páginas de catálogo | Alta | — |

---

## 2. Requisitos Não-Funcionais

| ID | Categoria | Requisito | Métrica / Critério |
|---|---|---|---|
| RNF-001 | Performance | LCP (Largest Contentful Paint) deve ser inferior a 2.5s | Medido via Google PageSpeed Insights em produção |
| RNF-002 | Performance | CLS (Cumulative Layout Shift) deve ser inferior a 0.1 | Medido via Core Web Vitals |
| RNF-003 | Performance | INP (Interaction to Next Paint) deve ser inferior a 200ms | Medido via Core Web Vitals |
| RNF-004 | Performance | Todas as imagens devem usar Next/Image com formato WebP/AVIF | 100% das imagens — sem `<img>` nativo |
| RNF-005 | Performance | O hero (slide 1) deve ter `priority` ativado no Next/Image | Evitar LCP alto |
| RNF-006 | Performance | O JavaScript da aplicação deve usar tree-shaking e code splitting automático por rota | Padrão Next.js App Router |
| RNF-007 | Performance | O CSS em produção deve usar Tailwind purge automático | Build step |
| RNF-008 | SEO | Todas as páginas devem ter H1 único | Validado em code review |
| RNF-009 | SEO | Meta descriptions devem ter entre 155-160 caracteres | Validado via Sanity ou lint |
| RNF-010 | SEO | URLs devem ser amigáveis e em português com hífens | ex.: `/produtos/macromedidor-ultrassonico-gatsonic` |
| RNF-011 | Acessibilidade | Todos os botões sem texto descritivo devem ter ARIA labels | WCAG 2.1 AA |
| RNF-012 | Acessibilidade | Todas as imagens devem ter alt text obrigatório (campo required no Sanity) | WCAG 2.1 AA |
| RNF-013 | Acessibilidade | Contraste mínimo de 4.5:1 para textos sobre fundos | WCAG 2.1 AA |
| RNF-014 | Acessibilidade | Toda a navegação deve ser funcional via teclado | Foco visível em todos os elementos interativos |
| RNF-015 | Acessibilidade | Deve existir link "Skip to content" no início do documento | WCAG 2.1 AA |
| RNF-016 | Responsividade | O layout deve funcionar em Mobile (< 768px), Tablet (768-1024px), Desktop (> 1024px) e Wide (> 1440px) | Testado nos 4 breakpoints |
| RNF-017 | Responsividade | Largura máxima do container em telas wide: 1440px | CSS max-width |
| RNF-018 | Segurança | Variáveis de ambiente sensíveis (tokens, IDs) não devem ser expostas no cliente sem prefixo `NEXT_PUBLIC_` | Revisão de código |
| RNF-019 | Segurança | Formulários devem ter validação server-side além da client-side | React Hook Form + API Route validation |
| RNF-020 | Privacidade (LGPD) | Nenhum cookie de rastreamento deve ser ativado antes do consentimento do usuário | Cookie Consent integrado com GTM |
| RNF-021 | Manutenibilidade | Todo o conteúdo editorial (produtos, serviços, aplicações, setores, blog, carrossel) deve ser gerenciável via Sanity sem necessidade de deploy | CMS-driven |
| RNF-022 | Escalabilidade | A arquitetura deve suportar adição de Algolia como camada de busca na Fase 2 sem refatoração significativa | Interface de busca abstraída |
| RNF-023 | Internacionalização | O site deve estar preparado para suporte futuro a i18n (estrutura de rotas compatível) | Não obrigatório no MVP |
| RNF-024 | Deploy | O sistema deve ter deploy automático na Vercel a cada push na branch principal | CI/CD via Vercel |
| RNF-025 | Deploy | Deve haver preview automático por branch/PR para validação antes do merge | Vercel preview deploys |

---

## 3. User Stories com Critérios de Aceite

> **Convenção:** `US-[módulo]-[número]`
> **Personas:** ENG = Engenheiro Especificador | CPR = Comprador/Suprimentos | GES = Gestor Industrial | MAN = Gerente de Manutenção

---

### Módulo 01 — Homepage

---

#### US-HOME-001 — Explorar setores pela homepage
**Persona:** Todas
**Story:** Como visitante, quero visualizar rapidamente os setores atendidos pela GAIATEC para entender se há soluções para minha área de atuação.

**Critérios de Aceite:**

```gherkin
Dado que estou na homepage
Quando rolo até a seção de Setores Interativos
Então vejo tabs horizontais com os 11 setores da GAIATEC

Dado que clico em um setor (ex.: "Saneamento")
Quando o setor é selecionado
Então a imagem central é atualizada com imagem do setor com backdrop-blur
E vejo grid de cards de categorias pertencentes ao setor selecionado
E os cards exibem ícone representativo + nome da categoria

Dado que clico em um card de categoria
Quando o card é clicado
Então sou redirecionado para /produtos?setor=saneamento&categoria=vazao (com filtros pré-aplicados)

Dado que estou no mobile
Quando visualizo a seção de setores
Então as tabs de setor aparecem como carrossel horizontal deslizável
E os cards de categoria aparecem como carrossel horizontal
```

---

#### US-HOME-002 — Buscar produto pela homepage
**Persona:** ENG, CPR
**Story:** Como engenheiro ou comprador, quero usar a busca inteligente da homepage para encontrar rapidamente um produto específico sem precisar navegar pelos menus.

**Critérios de Aceite:**

```gherkin
Dado que estou na homepage
Quando começo a digitar na barra de busca inteligente
Então vejo resultados em autocomplete em tempo real
E os resultados incluem: miniatura, nome, categoria/setor do item
E os resultados cobrem: produtos, serviços e aplicações

Dado que seleciono filtro "Setor" na busca progressiva
Quando escolho "Gás e Petróleo"
Então o campo "Categoria" é atualizado com categorias desse setor
E o campo anterior "Tecnologia" é zerado/atualizado

Dado que clico em um resultado da busca
Quando seleciono o item
Então sou direcionado à ficha técnica do produto (ou serviço/aplicação)

Dado que submeto a busca sem usar autocomplete
Quando clico em [Buscar]
Então sou direcionado para /produtos com os filtros pré-aplicados e termo de busca ativo
```

---

#### US-HOME-003 — Visualizar produtos em destaque
**Persona:** GES, CPR
**Story:** Como gestor industrial ou comprador, quero ver os produtos estratégicos da GAIATEC na homepage para ter uma visão rápida do portfólio.

**Critérios de Aceite:**

```gherkin
Dado que estou na homepage sem ter selecionado setor
Quando visualizo a seção de Produtos em Destaque
Então vejo 5 produtos cross-setor estratégicos
E cada card exibe: imagem, nome, descrição (máx. 2 linhas) e [Saiba Mais]

Dado que clico em uma tab de setor na seção de produtos
Quando o setor é selecionado
Então a grade de produtos é atualizada com fade-in/fade-out
E exibe os 5 principais produtos daquele setor

Dado que clico em [Ver Todos os Produtos]
Quando o CTA é acionado
Então sou direcionado para /produtos

Dado que estou no mobile
Quando visualizo a seção de produtos em destaque
Então os cards aparecem como carrossel deslizável
```

---

### Módulo 02 — Setores

---

#### US-SET-001 — Explorar setor específico
**Persona:** MAN, GES
**Story:** Como gerente de manutenção ou gestor industrial, quero acessar a página de um setor específico para entender todas as soluções disponíveis para minha operação.

**Critérios de Aceite:**

```gherkin
Dado que acesso /setores/saneamento
Quando a página é carregada
Então vejo hero com imagem real do setor + H1 "Soluções para Saneamento" + subtítulo
E vejo breadcrumb: Setores > Saneamento

Quando rolo a página
Então vejo: descrição do setor, aplicações relacionadas, categorias de produtos, produtos principais, serviços aplicáveis, cases e CTA final

Dado que clico em um produto listado na página do setor
Quando o produto é clicado
Então sou direcionado à ficha técnica do produto

Dado que clico em [Fale com um Especialista em Saneamento]
Quando o CTA é acionado
Então o modal de orçamento abre com o setor pré-selecionado OU sou redirecionado para WhatsApp com mensagem contextual
```

---

#### US-SET-002 — Baixar catálogo do setor
**Persona:** CPR, MAN
**Story:** Como comprador ou gerente de manutenção, quero baixar o catálogo técnico de um setor específico para consulta offline.

**Critérios de Aceite:**

```gherkin
Dado que estou na página de um setor
Quando clico em [Baixar Catálogo Técnico]
Então o arquivo PDF do setor é baixado diretamente

Dado que o PDF não está disponível no Sanity para aquele setor
Quando clico em [Baixar Catálogo Técnico]
Então o botão está oculto ou desabilitado
E não gera erro 404
```

---

### Módulo 03 — Produtos

---

#### US-PRD-001 — Filtrar produtos por setor e categoria
**Persona:** ENG, CPR
**Story:** Como engenheiro especificador, quero filtrar o catálogo de produtos por setor, categoria e sub-categoria para encontrar rapidamente o produto correto para o meu projeto.

**Critérios de Aceite:**

```gherkin
Dado que estou em /produtos
Quando seleciono o setor "Saneamento" no filtro primário
Então o filtro de Categoria é atualizado com categorias de Saneamento
E a grade de produtos filtra automaticamente sem reload

Quando seleciono a categoria "Medição de Vazão"
Então o filtro de Sub-categoria é atualizado com sub-categorias correspondentes
E os filtros secundários na sidebar são atualizados (ex.: DN, Conexão, Precisão)
E a URL é atualizada para /produtos?setor=saneamento&categoria=medicao-de-vazao

Quando seleciono um valor no filtro secundário "DN" (ex.: DN 100mm)
Então a grade exibe apenas produtos compatíveis com DN 100mm

Dado que seleciono múltiplos filtros secundários
Quando os filtros são combinados
Então a grade exibe apenas produtos que satisfazem TODOS os filtros selecionados

Dado que limpo todos os filtros
Quando clico em [Limpar Filtros]
Então todos os filtros são removidos
E a URL volta para /produtos
E a grade exibe todos os produtos
```

---

#### US-PRD-002 — Acessar ficha técnica de produto
**Persona:** ENG
**Story:** Como engenheiro especificador, quero acessar a ficha técnica completa de um produto para verificar especificações técnicas, normas e compatibilidade com meu projeto.

**Critérios de Aceite:**

```gherkin
Dado que estou em /produtos/macromedidor-ultrassonico-gatsonic-p-clamp
Quando a página é carregada
Então vejo breadcrumb: Produtos > Saneamento > Medição de Vazão > Ultrassônico > GatSonic P-Clamp
E vejo galeria de imagens com imagem principal em destaque e miniaturas abaixo

Quando passo o mouse sobre a imagem principal
Então a imagem exibe zoom

Quando clico na aba "Especificações Técnicas"
Então vejo tabela completa com campos: faixa de medição, precisão, conexão, saída de sinal, etc.

Quando clico na aba "Documentos"
Então vejo lista de documentos disponíveis para download (datasheet, manual, certificados)

Quando clico em [Download Datasheet]
E o produto está configurado como download direto
Então o PDF é baixado imediatamente

Quando clico em [Download Datasheet]
E o produto está configurado como gated
Então um campo de e-mail é exibido antes do download
E após informar o e-mail, o PDF é baixado e o e-mail é capturado no CRM
```

---

#### US-PRD-003 — Solicitar orçamento de produto
**Persona:** CPR
**Story:** Como comprador, quero solicitar orçamento diretamente da ficha técnica do produto para agilizar o processo de cotação.

**Critérios de Aceite:**

```gherkin
Dado que estou na ficha técnica de um produto
Quando clico em [Solicitar Orçamento]
Então um modal é aberto sem redirecionar a página

Quando o modal abre
Então o campo "Produto de interesse" já está pré-preenchido com o nome do produto atual

Quando preencho todos os campos obrigatórios (nome, empresa, telefone, e-mail) e submeto
Então o formulário é enviado com sucesso
E uma mensagem de confirmação é exibida no modal
E o lead é enviado ao CRM configurado
E uma notificação interna é disparada por e-mail via Resend/SendGrid

Dado que submeto o formulário com e-mail inválido
Quando o campo de e-mail é inválido
Então é exibida mensagem de erro "E-mail inválido" abaixo do campo
E o formulário não é submetido
```

---

#### US-PRD-004 — Compartilhar URL de produto filtrado
**Persona:** ENG, CPR
**Story:** Como usuário, quero compartilhar um link do catálogo com os filtros aplicados para um colega acessar diretamente os mesmos resultados.

**Critérios de Aceite:**

```gherkin
Dado que apliquei filtros Setor=Saneamento, Categoria=Medição de Vazão, DN=100mm
Quando copio a URL da página
Então a URL contém os parâmetros: /produtos?setor=saneamento&categoria=medicao-de-vazao&dn=100mm

Dado que acesso essa URL compartilhada
Quando a página é carregada
Então os filtros correspondentes já aparecem selecionados
E a grade de produtos já está filtrada
```

---

### Módulo 04 — Serviços

---

#### US-SRV-001 — Encontrar serviço de calibração
**Persona:** MAN
**Story:** Como gerente de manutenção, quero encontrar serviços de calibração disponíveis para os equipamentos da minha operação.

**Critérios de Aceite:**

```gherkin
Dado que estou em /servicos
Quando seleciono o filtro de categoria "Calibração"
Então a grade exibe apenas serviços de calibração
E cada card exibe: ícone SVG, nome, descrição, setor e [Ver Detalhes]

Dado que clico em um serviço de calibração
Quando acesso a página individual
Então vejo: descrição completa, setores atendidos, produtos relacionados, benefícios, certificações, FAQ e CTAs

Quando clico em [Solicitar Proposta]
Então o modal de orçamento abre com o serviço pré-selecionado
```

---

### Módulo 05 — Aplicações

---

#### US-APL-001 — Explorar solução para controle de perdas em redes de água
**Persona:** MAN, GES
**Story:** Como gerente de manutenção, quero ver a solução completa de controle de perdas em redes de água para entender quais produtos e serviços são necessários de forma integrada.

**Critérios de Aceite:**

```gherkin
Dado que estou em /aplicacoes/controle-de-perdas-redes-de-agua
Quando a página é carregada
Então vejo hero com storytelling técnico: desafio + como a GAIATEC resolve

Quando rolo a página
Então vejo cards de produtos relacionados com formato "Problema → Como Resolvemos"
E vejo cards de serviços relacionados
E vejo card da Plataforma de Telemetria
E vejo seção "Solução Completa Integrada" com caso de uso
E vejo bullets de ROI (ex.: "Redução de perdas em até 20%")

Dado que clico em um produto da seção de aplicação
Quando clico em [Ver Produto]
Então a ficha técnica do produto abre em nova aba
```

---

### Módulo 06 — Sobre

---

#### US-SOB-001 — Conhecer a história da GAIATEC
**Persona:** GES
**Story:** Como diretor industrial, quero conhecer a história e marcos da GAIATEC para validar a credibilidade e experiência antes de fechar uma parceria.

**Critérios de Aceite:**

```gherkin
Dado que acesso /sobre
Quando a página é carregada
Então vejo texto de introdução da empresa seguido da timeline histórica

Quando rolo a timeline
Então cada marco aparece com animação de fade-in ao entrar na viewport
E cada marco exibe: ano, ícone ilustrativo e descrição do evento

Dado que estou no desktop
Quando visualizo a timeline
Então ela é apresentada verticalmente com marcadores laterais

Dado que estou no mobile
Quando visualizo a timeline
Então ela é apresentada como scroll horizontal
```

---

### Módulo 07 — Componentes Globais

---

#### US-GLB-001 — Consentimento de cookies (LGPD)
**Persona:** Todas
**Story:** Como visitante, quero ser informado sobre o uso de cookies para exercer meu direito de privacidade conforme a LGPD.

**Critérios de Aceite:**

```gherkin
Dado que acesso o site pela primeira vez
Quando a página é carregada
Então um banner de Cookie Consent aparece
E oferece opções: [Aceitar Todos] / [Configurar] / [Rejeitar Opcionais]

Dado que clico em [Aceitar Todos]
Quando o consentimento é dado
Então o banner desaparece
E o consentimento é salvo em localStorage
E os cookies de analytics e GTM são ativados

Dado que clico em [Rejeitar Opcionais]
Quando a rejeição é confirmada
Então apenas cookies essenciais permanecem ativos
E nenhum script de rastreamento é carregado

Dado que retorno ao site após aceitar
Quando a página é carregada novamente
Então o banner NÃO é exibido novamente
```

---

#### US-GLB-002 — Usar WhatsApp flutuante
**Persona:** Todas
**Story:** Como visitante, quero falar com a GAIATEC rapidamente via WhatsApp sem precisar procurar um número de contato.

**Critérios de Aceite:**

```gherkin
Dado que estou em qualquer página do site
Quando visualizo o canto inferior direito
Então vejo o botão flutuante de WhatsApp

Dado que passo o mouse sobre o botão
Quando o hover é ativado
Então o botão expande exibindo o texto "Fale conosco no WhatsApp"

Dado que clico no botão de WhatsApp
Quando o clique é realizado
Então o evento GTM `whatsapp_click` é disparado com o parâmetro `page` (URL atual)
E o WhatsApp Business é aberto (web ou app nativo no mobile)
```

---

#### US-GLB-003 — Navegar via megamenu
**Persona:** Todas
**Story:** Como visitante no desktop, quero usar o megamenu do header para navegar rapidamente entre setores e categorias de produtos.

**Critérios de Aceite:**

```gherkin
Dado que estou em qualquer página no desktop
Quando passo o mouse sobre "SETORES" no menu principal
Então um megamenu abre com grid dos 11 setores, cada um com ícone e nome

Dado que clico em um setor no megamenu
Quando o setor é clicado
Então sou direcionado para /setores/[setor]

Dado que rolo a página
Quando o header é ativado o scroll-shrink
Então o header encolhe levemente mas mantém logo e CTA [Solicitar Orçamento] sempre visíveis
E o fundo do header muda de transparente para sólido

Dado que estou no mobile
Quando acesso o menu
Então o megamenu é substituído por ícone de hambúrguer
E ao clicar, um menu mobile desliza
```

---

## 4. Backlog Priorizado — MVP

> **Convenção de Story Points:** 1 (trivial) | 2 (pequena) | 3 (média) | 5 (grande) | 8 (muito grande) | 13 (épica — dividir)
> **Épicas:** E01=Setup | E02=Homepage | E03=Setores | E04=Produtos | E05=Serviços | E06=Aplicações | E07=Blog | E08=Sobre/Contato | E09=Componentes Globais | E10=CMS | E11=SEO/Analytics | E12=Qualidade

---

### Sprint 0 — Setup e Infraestrutura (Semana 1)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | SETUP-001 | E01 | Criar projeto Next.js 14+ com TypeScript, App Router e Tailwind CSS | 2 | Crítica |
| 2 | SETUP-002 | E01 | Configurar Shadcn/UI com tema e tokens de design (cores, tipografia, espaçamentos) | 2 | Crítica |
| 3 | SETUP-003 | E01 | Configurar Sanity Studio com nome "GAIATEC — Painel de Gestão" e estrutura de menu | 3 | Crítica |
| 4 | SETUP-004 | E01 | Criar todos os schemas Sanity: produto, setor, categoria, subCategoria, servico, aplicacao, artigo, slideCarrossel, destaques | 8 | Crítica |
| 5 | SETUP-005 | E01 | Configurar Vercel com variáveis de ambiente: SANITY_PROJECT_ID, SANITY_API_TOKEN, GA4_ID, GTM_ID, WHATSAPP_NUMBER | 2 | Crítica |
| 6 | SETUP-006 | E01 | Configurar estrutura de pastas do projeto (app/, components/, lib/, types/, hooks/) | 1 | Alta |
| 7 | SETUP-007 | E01 | Criar tipos TypeScript globais derivados dos schemas Sanity (sanity.types.ts) | 3 | Alta |
| 8 | SETUP-008 | E01 | Configurar next/font com fontes da identidade visual GAIATEC | 1 | Alta |
| 9 | SETUP-009 | E01 | Criar arquivo de configuração de tema Tailwind com tokens customizados | 2 | Alta |
| 10 | SETUP-010 | E01 | Configurar ESLint, Prettier e Husky para qualidade de código | 1 | Média |
| **Total Sprint 0** | | | | **25** | |

---

### Sprint 1 — Layout Base e Componentes Globais (Semanas 2-3)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | GLB-001 | E09 | Desenvolver Header com: logo, nav principal, CTA [Solicitar Orçamento], busca | 5 | Crítica |
| 2 | GLB-002 | E09 | Implementar comportamento scroll-shrink + fundo transparente → sólido | 2 | Alta |
| 3 | GLB-003 | E09 | Desenvolver Megamenu de Setores (grid 11 setores + ícones) — desktop | 3 | Alta |
| 4 | GLB-004 | E09 | Desenvolver Megamenu de Produtos (acesso por setor + categorias) — desktop | 3 | Alta |
| 5 | GLB-005 | E09 | Desenvolver Menu Mobile (hambúrguer + drawer deslizante) | 3 | Alta |
| 6 | GLB-006 | E09 | Implementar item "Minha Conta" desabilitado com tooltip "Em breve" | 1 | Alta |
| 7 | GLB-007 | E09 | Desenvolver Footer completo (colunas, certificações, redes sociais, CNPJ) | 3 | Alta |
| 8 | GLB-008 | E09 | Implementar Cookie Consent LGPD com 3 opções + localStorage | 3 | Crítica |
| 9 | GLB-009 | E09 | Integrar Cookie Consent com GTM (bloquear scripts até consentimento) | 2 | Crítica |
| 10 | GLB-010 | E09 | Desenvolver botão flutuante WhatsApp com hover expand + evento GTM | 2 | Alta |
| 11 | GLB-011 | E09 | Desenvolver componente Breadcrumb com schema BreadcrumbList | 2 | Alta |
| 12 | GLB-012 | E09 | Desenvolver Modal de Orçamento com React Hook Form + validação + pré-preenchimento | 5 | Alta |
| 13 | GLB-013 | E09 | Integrar Modal de Orçamento com CRM (RD Station / HubSpot API) | 3 | Alta |
| 14 | GLB-014 | E09 | Integrar Modal de Orçamento com notificação por e-mail (Resend/SendGrid) | 2 | Alta |
| 15 | GLB-015 | E09 | Desenvolver componente Skip-to-Content para acessibilidade | 1 | Alta |
| **Total Sprint 1** | | | | **40** | |

---

### Sprint 2 — Homepage (Semanas 4-5)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | HOME-001 | E02 | Desenvolver carrossel hero (auto-advance 5s, pause hover, controle manual, swipe mobile) | 5 | Crítica |
| 2 | HOME-002 | E02 | Integrar slides do carrossel com Sanity (campos: imagem, título, subtítulo, CTA, ativo, ordem) | 3 | Crítica |
| 3 | HOME-003 | E02 | Implementar overlay de degradê no carrossel + otimização next/image (priority no slide 1) | 2 | Alta |
| 4 | HOME-004 | E02 | Desenvolver barra de busca inteligente com autocomplete GROQ (produtos + serviços + aplicações) | 8 | Crítica |
| 5 | HOME-005 | E02 | Implementar filtros progressivos na busca: Setor → Categoria → Tecnologia | 5 | Alta |
| 6 | HOME-006 | E02 | Desenvolver seção Setores Interativos (tabs + imagem central backdrop-blur + cards de categoria) | 5 | Crítica |
| 7 | HOME-007 | E02 | Implementar auto-rotation e carrossel mobile para seção de setores | 2 | Alta |
| 8 | HOME-008 | E02 | Desenvolver seção Produtos em Destaque (tabs de setor + grid 5 produtos + fade-in) | 5 | Alta |
| 9 | HOME-009 | E02 | Integrar Produtos em Destaque com Sanity (schema produtoDestaque) | 2 | Alta |
| 10 | HOME-010 | E02 | Desenvolver seção Serviços em Destaque (mesma lógica) | 3 | Alta |
| 11 | HOME-011 | E02 | Desenvolver seção Aplicações em Destaque (3-4 cards) | 2 | Alta |
| 12 | HOME-012 | E02 | Desenvolver seção "Por que GAIATEC" com contadores animados (Intersection Observer) | 3 | Média |
| 13 | HOME-013 | E02 | Desenvolver seção Certificações (logos RBC, INMETRO, ISO + parceiros) | 1 | Média |
| 14 | HOME-014 | E02 | Desenvolver seção CTA Final | 1 | Alta |
| 15 | HOME-015 | E02 | Faixa de credibilidade abaixo do header (desktop) | 1 | Média |
| **Total Sprint 2** | | | | **48** | |

---

### Sprint 3 — Catálogo de Produtos (Semanas 6-7)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | PRD-001 | E04 | Desenvolver página /produtos com layout grid responsivo (3→2→1 colunas) | 3 | Crítica |
| 2 | PRD-002 | E04 | Implementar barra de busca inteligente no catálogo (autocomplete) | 3 | Crítica |
| 3 | PRD-003 | E04 | Implementar filtros primários breadcrumb interativo: Setor → Categoria → Sub-categoria | 8 | Crítica |
| 4 | PRD-004 | E04 | Implementar sincronização de filtros com URL (query params) | 3 | Alta |
| 5 | PRD-005 | E04 | Implementar sidebar de filtros secundários dinâmicos por categoria (DN, Conexão, Precisão, etc.) | 8 | Alta |
| 6 | PRD-006 | E04 | Implementar drawer de filtros para mobile | 3 | Alta |
| 7 | PRD-007 | E04 | Desenvolver card de produto (imagem, nome, descrição, setor, badge, hover) | 2 | Alta |
| 8 | PRD-008 | E04 | Implementar client-side filtering sem reload de página | 5 | Alta |
| 9 | PRD-009 | E04 | Desenvolver página /produtos/[slug] com galeria de imagens + zoom no hover | 5 | Crítica |
| 10 | PRD-010 | E04 | Implementar sidebar da ficha técnica (nome, tecnologia, setor, CTAs: orçamento/especialista/datasheet) | 3 | Crítica |
| 11 | PRD-011 | E04 | Implementar abas da ficha técnica: Especificações / Aplicações / Documentos / Vídeo | 3 | Crítica |
| 12 | PRD-012 | E04 | Implementar FAQ dinâmico em accordion na ficha técnica | 2 | Média |
| 13 | PRD-013 | E04 | Implementar seção de Produtos Relacionados na ficha técnica | 2 | Alta |
| 14 | PRD-014 | E04 | Implementar seção de Serviços Complementares na ficha técnica | 2 | Alta |
| 15 | PRD-015 | E04 | Implementar download de datasheet (direto + gated com captura de e-mail) | 3 | Alta |
| 16 | PRD-016 | E04 | Implementar ISR (revalidate 60s) nas páginas de produto | 1 | Alta |
| **Total Sprint 3** | | | | **56** | |

---

### Sprint 4 — Setores, Serviços e Aplicações (Semanas 8-9)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | SET-001 | E03 | Desenvolver página /setores (hero, grid de cards, filtro horizontal) | 3 | Alta |
| 2 | SET-002 | E03 | Desenvolver página /setores/[setor] com 11 seções fixas | 8 | Alta |
| 3 | SET-003 | E03 | Integrar páginas de setor com dados Sanity (produtos, serviços, aplicações do setor) | 3 | Alta |
| 4 | SET-004 | E03 | Implementar CTA contextualizado por setor no [Fale com um Especialista] | 2 | Alta |
| 5 | SET-005 | E03 | Implementar download de catálogo por setor (PDF via Sanity) | 1 | Média |
| 6 | SRV-001 | E05 | Desenvolver página /servicos (listagem, filtro por setor e categoria) | 3 | Alta |
| 7 | SRV-002 | E05 | Desenvolver página /servicos/[slug] completa | 3 | Alta |
| 8 | APL-001 | E06 | Desenvolver página /aplicacoes (listagem, filtro por setor, fade-in) | 3 | Alta |
| 9 | APL-002 | E06 | Desenvolver página /aplicacoes/[slug] com storytelling técnico + ROI | 5 | Alta |
| 10 | APL-003 | E06 | Implementar cross-links bidirecionais aplicações ↔ produtos ↔ serviços | 3 | Alta |
| **Total Sprint 4** | | | | **34** | |

---

### Sprint 5 — Blog, Sobre, Contato e Minha Conta MVP (Semana 10)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | BLG-001 | E07 | Desenvolver página /blog (grid, filtro por setor) | 3 | Alta |
| 2 | BLG-002 | E07 | Desenvolver página /blog/[slug] com portableText + sidebar de relacionados + CTA | 3 | Alta |
| 3 | BLG-003 | E07 | Configurar portableText no Sanity (imagens, código, tabelas) | 2 | Alta |
| 4 | BLG-004 | E07 | Implementar ISR para artigos do blog | 1 | Alta |
| 5 | SOB-001 | E08 | Desenvolver página /sobre com introdução + timeline histórica animada | 5 | Alta |
| 6 | SOB-002 | E08 | Implementar comportamento responsive da timeline (vertical desktop / scroll horizontal mobile) | 2 | Alta |
| 7 | CNT-001 | E08 | Desenvolver página /contato com formulário + Google Maps + dados de contato | 3 | Alta |
| 8 | CNT-002 | E08 | Integrar formulário de contato com CRM | 2 | Alta |
| 9 | CNT-003 | E08 | Desenvolver página /minha-conta "Em breve" (sem rota funcional) | 1 | Alta |
| 10 | PRV-001 | E08 | Desenvolver página /politica-de-privacidade (conteúdo LGPD) | 1 | Alta |
| **Total Sprint 5** | | | | **23** | |

---

### Sprint 6 — SEO Técnico, Analytics e Qualidade (Semana 11)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | SEO-001 | E11 | Implementar metadata dinâmica por tipo de página (title, description) via Next.js Metadata API | 3 | Crítica |
| 2 | SEO-002 | E11 | Implementar schema structured data: Organization, Product, Service, Article, BreadcrumbList | 5 | Crítica |
| 3 | SEO-003 | E11 | Implementar Open Graph + Twitter Cards em todas as páginas | 2 | Alta |
| 4 | SEO-004 | E11 | Implementar Canonical URLs | 1 | Alta |
| 5 | SEO-005 | E11 | Gerar sitemap dinâmico via app/sitemap.ts (todos os tipos de conteúdo) | 3 | Alta |
| 6 | SEO-006 | E11 | Gerar robots.txt | 1 | Alta |
| 7 | ANA-001 | E11 | Configurar Google Tag Manager no projeto | 2 | Crítica |
| 8 | ANA-002 | E11 | Configurar Google Analytics 4 via GTM | 2 | Crítica |
| 9 | ANA-003 | E11 | Implementar 8 eventos GTM no código (dataLayer.push) | 5 | Alta |
| 10 | QLD-001 | E12 | Auditoria de acessibilidade (ARIA labels, alt text, contraste, foco, skip link) | 3 | Alta |
| 11 | QLD-002 | E12 | Auditoria de performance (Core Web Vitals, next/image em 100% das imagens, sizes corretos) | 3 | Alta |
| 12 | QLD-003 | E12 | Testes de responsividade nos 4 breakpoints (Mobile/Tablet/Desktop/Wide) | 2 | Alta |
| 13 | QLD-004 | E12 | Testes de formulários (validação, envio, CRM, e-mail) | 2 | Alta |
| 14 | QLD-005 | E12 | Revisão de segurança (variáveis de ambiente, validação server-side, sem tokens expostos) | 2 | Crítica |
| **Total Sprint 6** | | | | **36** | |

---

### Sprint 7 — Sanity Studio, Conteúdo Inicial e Launch (Semana 12)

| # | ID | Épica | User Story / Tarefa | SP | Prioridade |
|---|---|---|---|---|---|
| 1 | CMS-001 | E10 | Configurar preview em tempo real no Sanity para produtos e aplicações | 3 | Média |
| 2 | CMS-002 | E10 | Criar validações de campos obrigatórios no Sanity (nome, slug, setor, imagem) | 2 | Alta |
| 3 | CMS-003 | E10 | Treinar equipe interna no Sanity Studio | 2 | Alta |
| 4 | CNT-010 | E10 | Inserir conteúdo inicial: 11 setores, 5 aplicações, 10 produtos de destaque, 5 serviços no Sanity | 5 | Crítica |
| 5 | CNT-011 | E10 | Configurar slides do carrossel inicial (mínimo 3 slides ativos) | 1 | Crítica |
| 6 | LNC-001 | E01 | Revisão final de deploy em produção (Vercel): variáveis de ambiente, domínio, HTTPS | 2 | Crítica |
| 7 | LNC-002 | E01 | Configurar Google Search Console pós-lançamento | 1 | Alta |
| 8 | LNC-003 | E01 | Submeter sitemap ao Google Search Console | 1 | Alta |
| **Total Sprint 7** | | | | **17** | |

---

### Resumo do Backlog MVP

| Sprint | Período | Foco | Story Points | Acumulado |
|---|---|---|---|---|
| Sprint 0 | Semana 1 | Setup e Infraestrutura | 25 | 25 |
| Sprint 1 | Semanas 2-3 | Layout Base + Componentes Globais | 40 | 65 |
| Sprint 2 | Semanas 4-5 | Homepage | 48 | 113 |
| Sprint 3 | Semanas 6-7 | Catálogo de Produtos | 56 | 169 |
| Sprint 4 | Semanas 8-9 | Setores + Serviços + Aplicações | 34 | 203 |
| Sprint 5 | Semana 10 | Blog + Sobre + Contato | 23 | 226 |
| Sprint 6 | Semana 11 | SEO + Analytics + Qualidade | 36 | 262 |
| Sprint 7 | Semana 12 | CMS + Conteúdo + Launch | 17 | 279 |
| **TOTAL** | **12 semanas** | | **279 SP** | |

---

## 5. Definition of Done

### DoD Global (aplicável a toda User Story)

Uma User Story é considerada **DONE** quando:

#### Funcionalidade
- [ ] Todos os critérios de aceite (Given/When/Then) estão implementados e funcionando
- [ ] A funcionalidade foi testada manualmente nos 4 breakpoints: Mobile (375px), Tablet (768px), Desktop (1280px), Wide (1440px)
- [ ] A funcionalidade foi testada nos browsers: Chrome (latest), Firefox (latest), Safari (latest), Edge (latest)
- [ ] Nenhum console.error ou console.warn inesperado durante o uso

#### Qualidade de Código
- [ ] O código passou pelo linter (ESLint) sem erros
- [ ] O código está formatado com Prettier
- [ ] Não há `any` sem justificativa no TypeScript
- [ ] Sem variáveis ou imports não utilizados
- [ ] Sem hardcoded strings que deveriam vir do Sanity ou variáveis de ambiente

#### Performance
- [ ] Todas as imagens usam `next/image` (sem `<img>` nativo)
- [ ] Imagens de hero têm `priority={true}` definido
- [ ] Imagens têm `sizes` configurado corretamente para o contexto
- [ ] Sem bloqueadores de render (scripts síncronos no `<head>`)

#### Acessibilidade
- [ ] Todos os botões sem texto têm `aria-label` descritivo
- [ ] Todas as imagens têm `alt` preenchido (texto vazio `alt=""` apenas para imagens decorativas)
- [ ] Todos os elementos interativos são acessíveis por teclado
- [ ] Foco visível em todos os elementos interativos
- [ ] Contraste verificado (mínimo 4.5:1 para texto normal)

#### SEO
- [ ] H1 único na página
- [ ] Meta description presente (155-160 caracteres)
- [ ] Breadcrumb com schema BreadcrumbList implementado (páginas internas)
- [ ] Open Graph tags presentes

#### CMS
- [ ] Conteúdo da funcionalidade é gerenciável via Sanity (sem hardcoded editorial)
- [ ] Campos obrigatórios do schema estão validados no Sanity Studio
- [ ] Slugs são gerados automaticamente e estão em formato URL-friendly

#### Analytics
- [ ] Eventos GTM relevantes à funcionalidade estão implementados (dataLayer.push)
- [ ] Eventos foram verificados no GTM Preview Mode

#### Segurança
- [ ] Nenhuma variável de ambiente sensível exposta no cliente (sem token de API no NEXT_PUBLIC_)
- [ ] Formulários têm validação server-side além da client-side
- [ ] Sem XSS (sem `dangerouslySetInnerHTML` sem sanitização)

#### Deploy
- [ ] Preview deploy na Vercel funcionando sem erros de build
- [ ] Funcionalidade verificada no preview deploy (não apenas em localhost)

---

### DoD por Tipo de Entrega

#### Página completa
Além do DoD Global:
- [ ] Página renderiza corretamente em todas as rotas dinâmicas testadas
- [ ] ISR configurado onde aplicável (revalidate: 60 para catálogos)
- [ ] 404 tratado para slugs inexistentes (notFound() do Next.js)
- [ ] Canonical URL implementada

#### Integração com Sanity
- [ ] Query GROQ otimizada (projeções específicas, sem over-fetching)
- [ ] Dados ausentes tratados graciosamente (sem erros em campos opcionais vazios)
- [ ] Preview mode testado

#### Integração com CRM / E-mail
- [ ] Envio testado em ambiente de staging com dados de teste
- [ ] Mensagem de sucesso exibida ao usuário após envio
- [ ] Tratamento de erro exibido quando o envio falha
- [ ] Lead confirmado como recebido no CRM

---

## 6. Glossário de Personas

| ID | Nome | Perfil | Objetivo no Site | Comportamento |
|---|---|---|---|---|
| **ENG** | Engenheiro Técnico / Especificador | Nível técnico avançado, busca specs completas | Especificar o produto correto para um projeto de engenharia | Vai diretamente pela busca inteligente ou filtros técnicos avançados; baixa datasheet antes de qualquer contato |
| **CPR** | Comprador / Suprimentos | Tem especificação em mãos, precisa cotar | Solicitar orçamento rapidamente com o menor atrito possível | Navega pelo catálogo já sabendo o que quer; converte via modal de orçamento |
| **GES** | Diretor / Gestor Industrial | Visão estratégica, avalia parceiros de longo prazo | Validar credibilidade, portfólio e certificações da empresa | Faz percurso longo: Homepage → Sobre → Certificações → Cases → Contato |
| **MAN** | Gerente / Coordenador de Manutenção | Precisa de solução confiável com suporte técnico | Avaliar custo-benefício e prazo de atendimento | Navega pelas páginas de aplicações e serviços; valoriza a seção de serviços (calibração, manutenção) |

---

## Apêndice — Riscos e Dependências

| Risco | Impacto | Probabilidade | Mitigação |
|---|---|---|---|
| Escolha do CRM (RD Station vs HubSpot) não definida | Alto — bloqueia Modal de Orçamento e Formulário de Contato | Alta | Definir com cliente na Sprint 0 |
| Falta de imagens de alta qualidade para os 11 setores | Médio — compromete hero dos setores e carrossel | Média | Criar lista de assets necessários na Sprint 0; usar placeholders temporários |
| Quantidade de produtos e conteúdo inicial no Sanity | Médio — site parece vazio no lançamento | Alta | Definir com cliente mínimo de 10 produtos no Sanity antes do launch |
| Definição de número WhatsApp Business | Médio — bloqueia botão flutuante | Baixa | Coletar na Sprint 0 |
| Datasheet PDFs dos produtos (gated ou direto) | Baixo-Médio — afeta estratégia de captação de leads | Média | Definir política de gated content com cliente na Sprint 1 |
| Customização dos filtros secundários por categoria | Alto — sprint 3 mais longa que estimado | Média | Priorizar categorias de maior volume (Medição de Vazão, Detecção de Gases, Nível) |

---

*Documento gerado em 2026-02-23. Etapa 2 — Business Analyst.*
*Próxima etapa: Etapa 3 — Product Manager (PRD, Roadmap, Critérios de Launch)*
