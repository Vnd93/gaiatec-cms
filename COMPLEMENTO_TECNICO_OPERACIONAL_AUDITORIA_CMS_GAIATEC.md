# Complemento técnico-operacional da auditoria e especificação do CMS GAIATEC

**Documento principal relacionado:** `AUDITORIA_CMS_GAIATEC.md`  
**Procedimento de execução relacionado:** `PROCEDIMENTO_AJUSTES_E_DESENVOLVIMENTO_PAINEL_ADMINISTRATIVO_GAIATEC.md`  
**Repositório examinado:** `website_gaiatecsistemas-main/website_gaiatecsistemas-main`  
**Site relacionado:** <https://www.gaiatecsistemas.com.br>  
**Data da consolidação:** 27 de agosto de 2026  
**Estado:** especificação para saneamento, desenho, implementação e homologação — não representa que o CMS já esteja implementado.

---

## 1. Resultado da avaliação

### 1.1 Resposta objetiva

Sim. A documentação utilizada até agora precisa ser complementada antes de iniciar a implementação do painel administrativo.

O requisito funcional enviado é amplo e bem orientado: define os módulos desejados, o princípio de não hardcodar conteúdo editorial e a necessidade de controlar o design por componentes aprovados. A auditoria externa também identificou corretamente a arquitetura geral e a duplicidade entre banco e código. Entretanto, o repositório mostra que ainda faltavam contratos técnicos, regras operacionais e critérios de aceite que tornassem a implementação inequívoca.

Sem este complemento, duas equipes poderiam construir soluções muito diferentes e ambas alegarem que atenderam ao pedido. O risco seria entregar muitas telas e campos no painel sem garantir que todos possuam persistência, autorização, renderização pública, cache invalidado, preview, histórico e teste automatizado.

### 1.2 Conclusão sobre o estado atual

O sistema atual possui boa base visual e componentes reaproveitáveis, mas **não possui hoje um CMS operacional conectado ao site público**. O código registra expressamente que o painel de conteúdo foi descontinuado em 29/05/2026 e que os hooks devem sempre devolver fallbacks hardcoded. Isso não é uma inferência: está documentado no próprio arquivo `src/app/hooks/useSiteData.ts`.

Consequências confirmadas:

- serviços, setores, aplicações, blog, menu, contato, timeline e blocos possuem uma camada de adaptação para dados dinâmicos, mas ela está neutralizada;
- produtos, detecção de gases, páginas de biodigestor e várias seções da homepage dependem de estruturas estáticas ou conteúdo embutido nos componentes;
- existem fontes duplicadas para produtos e serviços;
- existe um renderizador de blocos, mas ele não implementa todos os tipos previstos e ignora silenciosamente tipos desconhecidos;
- não existe rota `/admin` no código atual;
- o painel de marketing citado nos comentários fica em outro sistema/repositório, aparentemente no ERP, e não foi fornecido para esta auditoria;
- o aplicativo de Relatório Diário de Obra compartilha Supabase e repositório com o site, mas possui regras de segurança e ciclo de vida que exigem correções próprias.

### 1.3 Decisão arquitetural

O site não deve ser refeito indiscriminadamente. A solução indicada é:

1. estabilizar site, RDO, deploy e dados;
2. criar contratos de conteúdo versionados;
3. escolher uma única fonte canônica por domínio;
4. implantar o CMS de modo modular;
5. migrar cada área somente quando leitura, escrita, preview, publicação, cache, auditoria e testes estiverem completos;
6. eliminar os fallbacks duplicados depois da homologação e de um período seguro de observação.

“Poder mexer totalmente no site” deve significar **controle editorial e operacional amplo dentro de contratos seguros**, e não edição arbitrária de HTML, JavaScript ou CSS. Estrutura, comportamento, acessibilidade e responsividade continuam sob controle do código. Conteúdo, ordem, visibilidade, relações, mídia, SEO e presets aprovados passam a ser controlados pelo CMS.

---

## 2. Escopo, método e confiabilidade

### 2.1 Artefatos examinados

Foram confrontados:

- a auditoria externa do site publicada em `AUDITORIA_CMS_GAIATEC.md`;
- o requisito original de 52 seções;
- 146 arquivos TSX, 37 arquivos TS, 7 migrations SQL e as Edge Functions presentes;
- rotas, componentes, hooks, dados estáticos, configuração de build, PWA, headers e redirects;
- fluxo de contato/leads;
- autenticação, equipe, relatórios, fotos, PDFs, notificações e assinatura do RDO;
- documentos existentes no repositório.

### 2.2 Limites

Não foram fornecidos:

- repositório do ERP/painel `/marketing/site` citado no código;
- fonte da Edge Function `site-content` atualmente implantada;
- schema completo do Supabase, além das migrations de RDO;
- migrations da tabela `leads` e das tabelas de conteúdo;
- configurações dos projetos Supabase, Cloudflare/Vercel, Resend, DNS, backup e observabilidade;
- histórico Git, pois o diretório fornecido é uma exportação sem `.git`;
- credenciais ou ambiente de staging.

O build não pôde ser repetido nesta cópia porque `node_modules` não está instalado. `npm run build` falhou antes de compilar por ausência do executável local do Vite. Isso não prova erro no código; prova apenas que o pacote fornecido não é um ambiente reproduzível sem instalar dependências.

### 2.3 Classificação usada

| Classificação | Significado |
|---|---|
| Confirmado | Verificado diretamente no código, migration ou artefato publicado. |
| Risco confirmado | O comportamento vulnerável ou desconexo está implementado. |
| Dependência | Existe referência, mas o artefato necessário não foi fornecido. |
| Recomendação | Arquitetura ou regra proposta para o estado-alvo. |

---

## 3. Avaliação da documentação existente

### 3.1 Inventário documental

| Documento | Utilidade atual | Lacuna |
|---|---|---|
| `README.md` | Informa o link do Figma e comandos básicos. | Não descreve arquitetura, ambientes, variáveis, deploy, banco, testes, CMS ou RDO. |
| `guidelines/Guidelines.md` | Arquivo reservado para diretrizes. | Está essencialmente vazio. |
| `AUDIT-DELTA.md` | Registra uma migração visual parcial e tarefas históricas. | É fotografia de um momento, contém pendências já superadas e não é runbook nem especificação funcional. |
| `PROMPTS-IMAGENS*.md` | Apoia geração de imagens. | Não documenta uso, direitos, origem, aprovação, compressão ou vínculo da mídia com o CMS. |
| migrations `0001`–`0007` | Registram evolução do banco do RDO. | Comentários de rota estão desatualizados e não há especificação consolidada de estados, permissões e retenção. |
| Comentários em `useSiteData.ts` | Explicam a desativação do CMS e os fallbacks. | A decisão não está registrada em ADR e conflita com comentários de outros arquivos que ainda dizem “em produção vem do CMS”. |

### 3.2 Nota por dimensão

Escala: 0 = inexistente; 5 = completa, atualizada e verificável.

| Dimensão | Nota | Diagnóstico |
|---|---:|---|
| Requisitos de negócio do CMS | 4 | O objetivo original é abrangente e claro. |
| Arquitetura atual | 2 | A auditoria externa cobre a visão geral; faltava confrontá-la com o código. |
| Contratos de API e conteúdo | 1 | Há tipos TS parciais, mas não há OpenAPI/JSON Schema, versionamento nem validação runtime. |
| Modelo de dados | 1 | Apenas o RDO possui migrations no pacote; conteúdo e leads não são reproduzíveis. |
| Regras de autorização | 1 | Há RLS do RDO, mas não há matriz consolidada e o papel `admin` é amplo demais. |
| Fluxo editorial/publicação | 1 | Estados desejados estão descritos, mas faltam transações, conflitos, agendamento, rollback e cache. |
| RDO | 2 | O comportamento pode ser reconstruído do código, porém há regras perigosas e nenhuma política operacional. |
| Testes e qualidade | 0 | Não foram encontrados testes, configuração de testes, lint, typecheck ou CI. |
| Deploy e rollback | 1 | Existem artefatos de Vercel e Cloudflare, mas sem fonte canônica nem runbook. |
| Operação/observabilidade | 0 | Não há SLOs, alertas, dashboards, on-call, logs estruturados ou procedimento de incidente. |
| Segurança/LGPD | 1 | Há algumas proteções e termos, mas faltam threat model, retenção, evidência de consentimento e resposta a incidentes. |
| Onboarding/manutenção | 1 | O README não permite reproduzir e operar o sistema com segurança. |

**Síntese:** a documentação inicial explica muito bem *o que* a GAIATEC quer; faltava definir com precisão *como cada capacidade se conecta*, *quem pode executá-la*, *qual regra a valida* e *como provar que funciona*.

---

## 4. Arquitetura atual confirmada no código

### 4.1 Topologia

```text
Visitante
   |
   v
SPA React/Vite ── conteúdo hardcoded/fallback
   |                    ^
   |                    | hooks dinâmicos neutralizados
   |
   +── Supabase Auth ── aplicativo /relatorio-de-obra
   +── Edge Function submit-contact ── tabela leads ── ERP
   +── Edge Functions rdo-* ── tabelas/buckets RDO + Resend

API site-content implantada
   └── existe fora da fonte fornecida, mas o cliente atual não a consome

ERP /marketing/site
   └── mencionado em comentários, repositório e contrato não fornecidos
```

### 4.2 Frontend

- React 18.3.1, React Router 7.13 e Vite 6.3.5;
- Tailwind 4.1.12, Radix UI, Motion, Embla, Lucide, React PDF e Supabase JS;
- homepage carregada no entry point; demais páginas são lazy-loaded;
- não há `errorElement` nas rotas nem Error Boundary global;
- o Service Worker é registrado globalmente e não há exclusão explícita para CMS/RDO;
- o pacote ainda se chama `@figma/my-make-file`, versão `0.0.1`;
- não há `tsconfig`, scripts de `lint`, `typecheck`, `test` ou `test:e2e`;
- vários componentes e páginas são monolíticos: `ProdutosPage.tsx` possui 1.293 linhas e `Header.tsx`, 1.209 linhas.

### 4.3 Conteúdo e dados

Fontes locais relevantes:

- `products.ts`: produtos, categorias e especificações;
- `ProdutosPage.tsx`: outra estrutura extensa de produto/destaques;
- `servicesList.ts` e `services.ts`: lista e detalhe de serviços;
- `sectors.ts`: setores e conteúdo detalhado;
- `aplicacoes.ts`: aplicações, relações e destaques;
- `deteccaoGas.ts`, `dgTextos.ts`, `dgImagens.ts`, `dgGaleria.ts`: catálogo especializado separado;
- `timeline.ts`: história;
- `searchIndex.ts`: busca estática;
- componentes de homepage: grande parte dos textos, links e seções está embutida.

O resultado é um modelo híbrido: tipos e hooks sugerem um CMS antigo, mas a renderização efetiva usa fallback. Reativar apenas a chamada HTTP não resolveria o problema, porque os dados implantados e os dados locais já divergiram e alguns adaptadores geram `href: "#"`.

### 4.4 API e Supabase

`src/lib/supabase.ts` contém URL e chave anônima de fallback, além de um cliente para a Edge Function `site-content`. O método não envia os headers de autorização/API que o endpoint implantado exige atualmente. Logo, remover o `return fallback` dos hooks sem corrigir o contrato resultaria em falha de leitura.

A chave anônima do Supabase é, por natureza, utilizável no cliente público, mas a configuração deve ser controlada por ambiente e protegida por RLS. Ela não substitui autorização e não deve ser confundida com segredo.

### 4.5 Deploy, cache e PWA

- `vercel.json` reescreve todas as rotas para `index.html`;
- `public/_redirects` contém regra equivalente para Cloudflare Pages;
- `public/_headers` registra problemas históricos de cache em que um asset inexistente podia receber `index.html` com HTTP 200;
- o Service Worker aumenta a necessidade de versionamento e expurgo correto;
- não há definição documental de qual plataforma é canônica;
- os headers não registram CSP/HSTS no artefato fornecido;
- a SPA responde rotas desconhecidas com shell 200 e decide o 404 no cliente.

É obrigatório escolher uma plataforma canônica, versionar sua configuração e executar smoke tests pós-deploy. Manter configurações paralelas sem proprietário cria divergência operacional.

---

## 5. Achados prioritários baseados na fonte

### 5.1 P0 — bloquear ativação de CMS ou expansão do RDO

| ID | Achado | Efeito | Ação obrigatória |
|---|---|---|---|
| P0-01 | CMS desativado em `useSiteData.ts`. | Qualquer edição no banco pode não refletir no site. | Implementar leitura versionada, validar e migrar módulo por módulo. |
| P0-02 | Edge Function `site-content` implantada não está versionada no pacote. | Produção não é reproduzível; contrato pode mudar sem revisão. | Trazer função, migrations e contrato para controle de versão. |
| P0-03 | Conteúdo local e banco divergentes. | Publicação pode remover itens corretos ou reintroduzir dados de teste. | Reconciliar registro por registro e definir fonte canônica. |
| P0-04 | OTP do RDO cria usuário para qualquer e-mail. | Cadastro aberto em aplicação operacional interna. | Fechar autoinscrição; usar convite/allowlist e revogação. |
| P0-05 | Relatório assinado pode ser editado, reaberto e excluído. | Perda de integridade documental e jurídica. | Tornar versão assinada imutável e substituir exclusão por arquivamento. |
| P0-06 | Fotos do RDO usam bucket público. | Imagens de obra podem ser acessadas sem autorização se a URL for conhecida. | Migrar para bucket privado e URLs assinadas curtas. |
| P0-07 | `rdo-notify` confia em resumo, PDF, e-mail e link enviados pelo cliente autenticado. | Um membro pode produzir mensagem representacional ou enviar dados arbitrários. | Receber apenas `report_id`/ação; validar acesso e montar tudo no servidor. |
| P0-08 | Papéis usam apenas `app_metadata.role = admin/membro`. | Um papel global pode conceder privilégios a domínios diferentes. | Implementar RBAC por aplicação e escopo (`cms:*`, `rdo:*`). |
| P0-09 | Não há testes nem CI. | Regressões podem ir diretamente para produção. | Implantar gates mínimos antes de reconectar conteúdo dinâmico. |
| P0-10 | Não há ambiente reproduzível documentado. | Build, migration e rollback dependem de conhecimento informal. | Criar README operacional, `.env.example`, scripts e runbooks. |

### 5.2 P1 — alta prioridade

| ID | Achado | Ação |
|---|---|---|
| P1-01 | Tipos de bloco desconhecidos retornam `null` silenciosamente. | Falhar a publicação com mensagem clara; nunca publicar bloco sem renderer. |
| P1-02 | `linked_list` é reconhecido, mas não renderizado. | Implementar contrato/renderização ou removê-lo das opções administrativas. |
| P1-03 | JSONB é convertido diretamente para tipos TS. | Validar no servidor e no cliente com schema runtime versionado. |
| P1-04 | Há vários links `#` e fallbacks de link. | Proibir `#` em publicação, exceto âncoras existentes e validadas. |
| P1-05 | SEO não está aplicado a todas as rotas. | Criar contrato SEO obrigatório por tipo e `noindex` para rotas privadas. |
| P1-06 | Blog não possui rota de artigo individual. | Criar `/blog/:slug`, schema, sitemap e canonical por post. |
| P1-07 | Busca é baseada em índice estático. | Gerar índice a partir da mesma fonte publicada ou usar busca server-side. |
| P1-08 | Formulário de contato não possui rate limit/CAPTCHA/limites de tamanho. | Adicionar proteção contra abuso, validação estrita e consentimento estruturado. |
| P1-09 | Remoção de usuário do RDO é hard delete. | Criar suspensão/revogação; preservar autoria e auditoria. |
| P1-10 | E-mails interpolam conteúdo sem escape completo. | Escapar HTML, limitar campos e montar templates com dados canônicos. |

### 5.3 P2 — manutenibilidade e operação

- dividir componentes monolíticos por responsabilidade;
- gerar tipos do banco e evitar interfaces manuais divergentes;
- renomear/versionar o pacote;
- estabelecer ADRs para CMS, hosting, autenticação, mídia e RDO;
- adicionar tratamento de erro por rota e fallback de chunk;
- excluir `/admin` e `/relatorio-de-obra` do cache público do Service Worker;
- automatizar sitemap, redirects e diagnóstico de links;
- reduzir arquivos duplicados e criar inventário de uso das imagens;
- definir orçamento de performance e acessibilidade.

---

## 6. Regra de ouro para impedir controles desconexos

Cada capacidade administrativa deve possuir uma **cadeia de rastreabilidade completa**:

```text
campo do painel
  -> schema de formulário
  -> comando/API autorizada
  -> validação server-side
  -> transação e persistência
  -> revisão/versionamento
  -> projeção publicada
  -> cache invalidado
  -> componente consumidor
  -> preview
  -> teste automatizado
  -> evento de auditoria
```

Uma funcionalidade só é considerada implementada quando todos os elos existem.

### 6.1 Regras obrigatórias

1. Nenhum campo aparece no painel sem `consumer_id`, isto é, sem componente/serviço que o utilize.
2. Nenhum componente lê dado editorial sem schema, origem canônica e fallback documentado.
3. Nenhum tipo de bloco pode ser publicado sem renderer registrado e teste visual responsivo.
4. Nenhum link interno pode ser publicado se a rota/âncora de destino não existir.
5. Nenhuma mídia pode ser excluída enquanto houver referência ativa.
6. Nenhuma alteração publicada ocorre sem versão anterior restaurável.
7. Nenhuma permissão depende apenas de esconder botões; a API e o banco devem rejeitar a ação.
8. Nenhum status é alterado por update genérico; cada transição possui comando e regras próprias.
9. Nenhuma configuração visual aceita valor livre se puder quebrar contraste, layout ou performance.
10. Nenhuma integração é considerada concluída apenas porque o painel salvou: o teste deve confirmar a alteração no site publicado.

### 6.2 Registro de capacidades

Criar no código um registro versionado, por exemplo:

| `consumer_id` | Domínio | Campo/contrato | Componente | Rotas | Preview | Teste |
|---|---|---|---|---|---|---|
| `home.hero.slides` | homepage | `HeroSlideV1[]` | `HeroBanner` | `/` | sim | desktop/mobile |
| `global.menu.header` | navegação | `MenuTreeV1` | `Header` | todas públicas | sim | links/teclado |
| `catalog.product` | produto | `ProductV1` | `ProdutosPage`, `ProdutoPage` | `/produtos*` | sim | lista/detalhe/SEO |
| `content.service` | serviço | `ServiceV1` | `ServicosPage`, `ServicoPage` | `/servicos*` | sim | lista/detalhe |
| `content.sector` | setor | `SectorV1` | `SetoresPage`, `SectorPage` | `/setores*` | sim | lista/detalhe |
| `content.application` | aplicação | `ApplicationV1` | `AplicacoesPage`, `AplicacaoPage` | `/aplicacoes*` | sim | filtros/detalhe |
| `content.blog_post` | blog | `BlogPostV1` | lista e nova página de post | `/blog*` | sim | agendamento/SEO |
| `global.contact` | contato | `ContactSettingsV1` | header/footer/contato | múltiplas | sim | consistência global |

O CI deve validar que todo `consumer_id` usado pelo painel está registrado e que todo bloco publicado possui consumidor disponível na versão implantada do site.

---

## 7. Arquitetura-alvo do CMS

### 7.1 Princípios

- fonte canônica única por entidade;
- escrita exclusivamente autenticada e autorizada;
- conteúdo publicado separado de rascunhos;
- preview protegido por token curto e escopo;
- contratos versionados e validados em runtime;
- mídia privada durante rascunho e pública somente quando apropriado;
- publicação transacional com outbox para tarefas assíncronas;
- cache por versão, nunca por esperança;
- trilha de auditoria append-only;
- isolamento de autorização entre CMS, ERP e RDO;
- staging equivalente à produção, com dados sanitizados.

### 7.2 Topologia proposta

```text
CMS Admin (/admin ou admin.gaiatecsistemas.com.br)
   |
   +-- Auth + MFA + RBAC por escopo
   +-- API de comandos (criar, revisar, publicar, restaurar)
   +-- Preview autenticado
   |
   v
Banco canônico
   +-- drafts / revisions / relations
   +-- published projection
   +-- audit log / outbox
   +-- media registry
   |
   +-- worker: imagens, busca, sitemap, redirects, cache purge
   +-- API pública somente leitura
                    |
                    v
             Site público React

RDO ── Auth/RBAC e schema próprios ── não reutiliza permissões globais do CMS
ERP ── integra por contrato/API ── não lê tabelas internas sem governança
```

### 7.3 Onde hospedar o painel

Existem duas opções aceitáveis:

1. `/admin` com build e cache separados do site público;
2. `admin.gaiatecsistemas.com.br`, com isolamento adicional.

O ERP existente também cita um painel `/marketing/site`. Antes de decidir, é obrigatório auditar o repositório `dzsystem`/ERP e verificar se ele já oferece autenticação, RBAC, auditoria e componentes que possam ser reutilizados. Construir um segundo painel sem essa verificação pode duplicar cadastros e permissões.

Independentemente da interface escolhida, o backend do CMS deve ser único e possuir contratos estáveis. O site público não deve depender diretamente do schema interno do ERP.

### 7.4 Estratégia de leitura pública

A API pública deve retornar somente projeções publicadas e válidas. Exemplo:

- `GET /v1/site/config`;
- `GET /v1/site/menu`;
- `GET /v1/site/pages/{slug}`;
- `GET /v1/catalog/products` e `/{slug}`;
- `GET /v1/content/services`, `/sectors`, `/applications`, `/posts`;
- `GET /v1/search/index` ou endpoint de consulta.

Cada resposta deve incluir:

- `schema_version`;
- `content_version` ou ETag;
- `published_at`;
- dados validados;
- cache policy explícita.

Durante a migração, cada hook deve ter feature flag por módulo. Não usar uma chave única que troque todo o site de hardcoded para banco de uma vez.

---

## 8. Modelo de domínio e banco

### 8.1 Entidades transversais

| Entidade | Responsabilidade |
|---|---|
| `users/profiles` | Identidade, nome, status e metadados não sensíveis. |
| `roles`, `permissions`, `user_roles` | RBAC por aplicação e escopo. |
| `content_items` | Identidade comum, tipo, slug, status, proprietário e datas. |
| `content_revisions` | Snapshot/diff, autor, motivo, schema e hash. |
| `publication_jobs` | Agendamento, tentativa, resultado e idempotência. |
| `audit_events` | Registro append-only de ações e acesso sensível. |
| `outbox_events` | Cache purge, indexação, sitemap, webhook e e-mail confiáveis. |
| `media_assets`, `media_variants`, `media_usages` | Biblioteca, derivados e referências. |
| `redirects` | Origem única, destino, código, status e validação de loop. |
| `site_settings` | Configurações globais tipadas. |
| `form_definitions`, `form_submissions` | Formulários versionados e respostas. |

### 8.2 Catálogo

| Entidade | Campos/relações essenciais |
|---|---|
| `products` | nome, modelo, SKU, slug, status, resumo, conteúdo, destaque, ordem, SEO. |
| `segments/categories/subcategories/families` | hierarquia com FK e ordem; nunca texto livre para relações. |
| `attribute_definitions` | chave, rótulo, tipo, unidade, validação, categoria e ordem. |
| `product_attribute_values` | produto, atributo, valor tipado e unidade. |
| `product_media` | papel, ativo, ordem, legenda e ALT. |
| `documents` | tipo, arquivo, versão, idioma, visibilidade, hash e validade. |
| relações `product_*` | aplicações, setores, serviços, similares e complementares. |
| `product_search_terms` | palavra, sinônimo, peso e origem. |

Detecção de gases deve ser migrada para o catálogo comum apenas se o modelo suportar suas categorias, sensores, gases, faixas e galerias sem perda. Até lá, deve ser tratada como módulo especializado com contrato próprio, não como JSON opaco misturado a produtos genéricos.

### 8.3 Conteúdo

- `services` e categorias de serviço;
- `sectors` — usar um único termo oficial; o requisito alterna “indústrias” e “setores”;
- `applications`;
- `solutions` quando houver conceito comercial distinto de aplicação;
- relações explicativas Produto × Aplicação;
- `pages`, `page_sections` e blocos tipados;
- `blog_posts`, autores, categorias e tags;
- `campaigns`, landing pages e variantes;
- `menus` e árvore de itens;
- banners com imagens desktop/mobile, período e prioridade;
- configurações de contato e redes sociais.

### 8.4 Convenções obrigatórias

- UUID como identidade interna; slug não é chave primária;
- unique constraints por escopo para SKU e slug;
- FKs reais para relações; sem listas de IDs dentro de texto;
- `created_at`, `created_by`, `updated_at`, `updated_by`;
- `deleted_at/deleted_by` para lixeira;
- concorrência otimista por `revision` ou `updated_at`;
- timestamps em UTC, exibição no fuso `America/Sao_Paulo`;
- JSONB apenas em blocos/valores cujo schema seja versionado e validado;
- RLS habilitada por padrão;
- service role somente em funções server-side mínimas;
- migrations completas no repositório, incluindo seed de desenvolvimento sem dados reais.

---

## 9. Contratos de conteúdo e blocos

### 9.1 Registro de blocos

O `BlockRenderer` atual reconhece:

- `hero_slides`;
- `stats_grid`;
- `cta_banner`;
- `rich_text`;
- `feature_grid`;
- `gallery`;
- `contact_info`;
- `timeline`;
- `news_grid`;
- `partners_logos`;
- `text_block`.

`linked_list` é ignorado e tipos desconhecidos retornam vazio. O CMS não pode oferecer esses casos.

Cada tipo deve ter um registro equivalente a:

```ts
type BlockDefinition = {
  type: string;
  schemaVersion: number;
  inputSchema: RuntimeSchema;
  defaults: unknown;
  renderer: ComponentType;
  previewRenderer: ComponentType;
  migrations: Record<number, Migration>;
  allowedPages: string[];
  permissions: string[];
  responsiveFixture: unknown;
};
```

### 9.2 Validação de publicação

A publicação deve falhar quando:

- o tipo não existe na versão do site implantada;
- o schema do bloco é inválido ou antigo sem migração;
- imagem obrigatória não tem variante adequada ou ALT;
- link é `#`, aponta para rota inexistente ou cria redirect loop;
- quantidade/ordem excede o preset;
- contraste ou dimensão não cumpre o preset;
- relação aponta para item não publicado;
- conteúdo obrigatório de SEO está ausente quando o tipo o exige.

### 9.3 Conteúdo rico

O editor deve produzir AST/blocos sanitizados, não HTML arbitrário. Se HTML for necessário em migração, aplicar allowlist no servidor, CSP e sanitização consistente. Scripts, iframes livres, handlers `on*`, CSS arbitrário e URLs perigosas devem ser rejeitados.

---

## 10. Arquitetura do painel administrativo

### 10.1 Navegação recomendada

```text
Dashboard
Catálogo
  Produtos
  Hierarquia
  Atributos
  Documentos
Soluções
  Aplicações
  Setores/Indústrias
  Soluções
Serviços
Conteúdo
  Páginas
  Blog
  Mídia
Marketing
  Banners
  Campanhas
  Landing pages
  Destaques
Comercial
  Leads
  Formulários
Site
  Homepage
  Menus
  Rodapé
  Contato
  Aparência
SEO
  Metadados
  Redirecionamentos
  Sitemap
Sistema
  Usuários e acessos
  Aprovações
  Histórico
  Diagnóstico
  Integrações
  Configurações
```

O RDO deve permanecer em módulo/aplicação separado. Um link pode existir no lançador interno, mas suas permissões, dados, navegação e auditoria não devem ser misturados aos módulos editoriais.

### 10.2 Dashboard operacional

Exibir somente informações acionáveis:

- rascunhos, revisões aguardando aprovação e agendamentos;
- falhas de publicação/processamento;
- itens órfãos, links quebrados, mídia ausente e SEO incompleto;
- leads novos e falhas de integração;
- saúde da API, cache e última implantação;
- atividade recente conforme permissão;
- versão do frontend, contrato de conteúdo e migrations.

Cada alerta deve abrir a tela exata do problema; cards puramente decorativos não atendem ao requisito.

### 10.3 Padrão de tela de cadastro

Cada editor deve conter:

- identificação e status visíveis;
- abas curtas por responsabilidade;
- autosave de rascunho com indicador claro;
- detecção de conflito de edição;
- validação inline e resumo de erros;
- relações pesquisáveis;
- barra persistente com salvar, preview, enviar para revisão e publicar;
- histórico, responsável, última publicação e motivo da alteração;
- comparação antes/depois;
- ação destrutiva separada e protegida.

### 10.4 Biblioteca de mídia

Fluxo mínimo:

1. validar MIME real, extensão, tamanho e dimensões;
2. remover metadados sensíveis quando apropriado;
3. calcular hash e sugerir reutilização de duplicata;
4. armazenar original em área controlada;
5. gerar thumbnail, médio, grande, WebP e AVIF;
6. registrar ALT, legenda, crédito/licença e proprietário;
7. disponibilizar variantes somente após processamento;
8. mostrar todos os usos antes de substituir/excluir;
9. bloquear deleção com referência publicada;
10. registrar substituição e permitir rollback.

### 10.5 Aparência

Permitir somente tokens e presets aprovados:

- paletas previamente validadas por contraste;
- logos/favicon com áreas e formatos definidos;
- tipografia entre opções homologadas;
- espaçamentos em escala fechada;
- grade/lista, colunas e densidade dentro de limites responsivos;
- quantidade de destaques dentro do que o componente suporta.

Nenhum campo de “CSS personalizado” ou “JavaScript personalizado” deve ser disponibilizado a perfis editoriais.

---

## 11. Matriz de controle: painel → site

Esta matriz deve ser detalhada em tickets e testes durante a implementação.

| Módulo do painel | Controle | Persistência | Consumidor atual/alvo | Regra para não ficar inoperante |
|---|---|---|---|---|
| Homepage/Hero | título, texto, mídia, CTA, período, ordem | slides versionados | `HeroBanner` | CTA obrigatório deve ter destino válido; datas não podem se sobrepor de forma ambígua. |
| Homepage/Seções | tipo, ativo, ordem, preset, itens | `page_sections` | componentes registrados | Não publicar tipo sem renderer; limite por preset. |
| Produtos | identificação e conteúdo | `products` + revision | lista/detalhe/comparador | Mesmo ID abastece todas as vistas; slug único; detalhes obrigatórios por status. |
| Produtos/Atributos | campos técnicos por categoria | definitions/values | detalhe e comparador | Tipo/unidade validados; comparador usa definição canônica. |
| Produtos/Destaques | manual/automático, ordem, quantidade | collection/config | homepage e grids | Quantidade compatível com layout e mobile. |
| Serviços | lista, detalhe e relações | `services` | páginas de serviço | Eliminar duplicidade `servicesList`/`services`; rota deve existir antes da publicação. |
| Setores | conteúdo, stats, relações | `sectors` | lista/detalhe/header | Termo oficial único e slugs preservados/redirecionados. |
| Aplicações | conteúdo, setor, produto, relação explicada | `applications` + joins | lista/filtros/detalhe | Filtros derivados das relações, nunca listas manuais divergentes. |
| Detecção de gás | categorias, produtos, specs e galeria | módulo tipado | hub/categoria/detalhe | Contrato especializado ou migração sem perda para catálogo. |
| Blog | artigo, autor, tags, agendamento, SEO | posts/revisions | home/lista/detalhe | Criar rota individual; agendamento executado server-side. |
| Menus | árvore, rótulo, destino, ordem | menu/items | header/mobile/footer | Validador de rota; profundidade máxima; impedir ciclo e `#`. |
| Contato | telefone, e-mail, endereço e redes | settings tipadas | header/footer/contato | Uma fonte global; formato e link derivados do mesmo valor. |
| SEO | title, description, canonical, OG, robots | SEO por entidade | head/sitemap | Preview SERP; canonical único; privado sempre `noindex`. |
| Redirects | origem, destino, código | redirects | edge/hosting | Impedir ciclo, cadeia longa, colisão com rota e wildcard perigoso. |
| Leads | definição e submissões | forms/leads | ERP/CMS | Consentimento versionado, origem estruturada e entrega idempotente. |
| Mídia | upload, ALT, variantes e usos | assets/variants/usages | todos | Sem uso órfão; URL estável; exclusão protegida. |
| Aparência | tokens/presets | settings versionadas | CSS variables/componentes | Opções fechadas, validação de contraste e snapshot visual. |

---

## 12. Workflow editorial e publicação

### 12.1 Estados

```text
rascunho -> em_revisao -> aprovado -> agendado -> publicado
    ^          |             |           |           |
    |----------+-------------+-----------+           v
                                                despublicado

qualquer estado editável -> lixeira -> restaurado
publicado nunca é sobrescrito: nova revisão é criada
```

Regras:

- “salvar” altera somente o rascunho;
- “enviar para revisão” congela aquela revisão;
- aprovador não deve aprovar sua própria alteração em conteúdo crítico, quando houver equipe suficiente;
- “publicar” cria projeção atômica e evento outbox;
- agendamento é processado no servidor, idempotente e com tentativas;
- rollback republica uma revisão anterior como nova revisão, preservando histórico;
- lixeira não remove mídia compartilhada nem relações históricas;
- publicação parcial só é permitida se o grafo de dependências continuar válido.

### 12.2 Operação de publicação

1. carregar a revisão e verificar concorrência;
2. validar schema e regras de domínio;
3. validar links, relações, mídia, SEO e capacidade do renderer;
4. registrar aprovação/autorização;
5. atualizar projeção publicada em transação;
6. inserir evento de auditoria e outbox na mesma transação;
7. worker atualiza busca, sitemap/redirects e variantes necessárias;
8. invalidar cache por tags/versão;
9. executar smoke test da rota;
10. marcar sucesso ou falha visível no painel, sem perder a versão anterior.

### 12.3 Preview

- usa exatamente os componentes do site público;
- recebe ID de revisão, não aceita conteúdo arbitrário pela URL;
- token curto, uso limitado e auditável;
- desktop, tablet e mobile reais;
- indica links, imagens, SEO e relações inválidas;
- nunca indexável e nunca servido pelo cache público;
- permite compartilhar com revisor autorizado sem publicar.

---

## 13. Autenticação, perfis e permissões

### 13.1 Acesso

- cadastro fechado por convite;
- MFA obrigatório para Super Administrador e recomendado para publicadores;
- sessão com expiração e renovação controladas;
- revogação imediata ao desativar usuário;
- proteção contra força bruta, enumeração e abuso de e-mail;
- recuperação de acesso auditada;
- domínios/e-mails permitidos configuráveis;
- conta de emergência protegida e testada, sem uso rotineiro.

### 13.2 Escopos

Permissões devem ser granulares, por exemplo:

- `cms.product.read`, `cms.product.edit`, `cms.product.publish`;
- `cms.page.edit`, `cms.page.approve`, `cms.page.publish`;
- `cms.media.upload`, `cms.media.delete`;
- `cms.seo.manage_redirects`;
- `cms.user.manage`, `cms.audit.read`;
- `lead.read`, `lead.assign`, `lead.export`;
- `rdo.report.create`, `rdo.report.finalize`, `rdo.report.read_all`;
- `rdo.signature.reopen`, `rdo.user.manage`.

Um usuário pode possuir papéis diferentes em CMS e RDO. O claim global `role=admin` não deve conceder automaticamente acesso administrativo a todos os produtos internos.

### 13.3 Matriz mínima

| Ação | Super Admin | Admin | Marketing | Comercial | Técnico | Editor | Revisor |
|---|---:|---:|---:|---:|---:|---:|---:|
| Configurar segurança/integrações | sim | não | não | não | não | não | não |
| Gerenciar usuários/papéis | sim | limitado | não | não | não | não | não |
| Editar homepage/campanhas | sim | sim | sim | consulta | consulta | conforme escopo | consulta |
| Editar produto comercial | sim | sim | consulta | sim | sim | conforme escopo | consulta |
| Editar especificação técnica | sim | sim | consulta | consulta | sim | conforme escopo | consulta |
| Publicar | sim | sim | conforme escopo | conforme escopo | conforme escopo | não | sim |
| Restaurar versão | sim | sim | conforme escopo | conforme escopo | conforme escopo | não | conforme escopo |
| Ver/exportar leads | sim | sim | limitado | sim | não | não | não |
| Ver auditoria | sim | sim | própria/escopo | própria/escopo | própria/escopo | própria | escopo |

Todas as células devem virar políticas server-side e testes de autorização positivos e negativos.

---

## 14. Regras do Relatório Diário de Obra

### 14.1 O que significa “regras do RDO”

São as regras que determinam:

- quem pode entrar no aplicativo;
- quem pode criar, ver, editar, finalizar, assinar, arquivar ou excluir um relatório;
- quais campos são obrigatórios em cada etapa;
- quais mudanças de status são válidas;
- quando um documento deixa de ser editável;
- como fotos, PDFs e assinaturas são protegidos;
- como a assinatura remota é comprovada;
- quem recebe notificações;
- quanto tempo dados e evidências são mantidos.

Sem essas regras documentadas e impostas no backend, a interface pode mostrar um fluxo correto, mas chamadas diretas ainda podem alterar dados indevidamente.

### 14.2 Comportamento atual reconstruído do código

| Área | Regra atual confirmada | Avaliação |
|---|---|---|
| Entrada por OTP | Qualquer e-mail válido pode provocar criação automática de usuário. | Crítico para app interno. |
| Entrada por senha | Usuário Supabase pode autenticar. | Aceitável se cadastro for fechado. |
| Visibilidade | Criador vê seus relatórios; `admin` global vê todos. | Base razoável, papel amplo demais. |
| Status | `rascunho`, `finalizado`, `arquivado`. | Não protege integridade por si só. |
| Assinatura | `nao_assinado`, `aguardando_cliente`, `assinado_gaiatec`, `assinado`. | Estados existem, mas transições não estão blindadas. |
| Edição | Relatório já assinado ainda pode ter campos alterados sem reabrir assinatura. | Crítico: PDF/aceite pode deixar de corresponder aos dados. |
| Reabertura | Função limpa assinaturas e termos. | Deve ser excepcional, autorizada e auditada. |
| Exclusão | Criador pode excluir relatório arquivado e fotos. | Inadequado para documento finalizado/assinado. |
| Fotos | Bucket `rdo-fotos` é público. | Risco de confidencialidade/LGPD. |
| PDFs assinados | Bucket privado com URLs assinadas. | Direção correta. |
| Link remoto | UUID, expiração de 30 dias e token limpo após uso. | Boa base; faltam evidências e proteção adicional. |
| Assinatura desenhada | Data URL salva na linha; nome, data e versão do termo registrados. | Evidência parcial; falta hash, IP, UA, trilha e documento exato. |
| PDF importado | Magic bytes `%PDF` e limite de 14 MB. | Insuficiente sem antivírus/sanitização e validação robusta. |
| Notificação | Cliente envia resumo/PDF/destino para função autenticada. | Backend deve reconstruir dados e destinatários. |
| Equipe | Admin pode convidar, promover e excluir usuários. | Falta suspensão, histórico e papéis granulares. |

### 14.3 Máquina de estados segura proposta

```text
rascunho
  -> pronto_para_revisao
  -> finalizado_sem_assinatura
  -> aguardando_assinatura_cliente
  -> assinado
  -> arquivado

correcao de item assinado
  -> cria nova versão vinculada
  -> versão anterior permanece imutável e consultável
```

Regras obrigatórias:

1. Rascunho: criador e colaboradores autorizados podem editar.
2. Pronto para revisão: validar cliente, período, local, responsáveis, comentários e anexos necessários.
3. Finalização: snapshot imutável dos dados e fotos, geração server-side do PDF e hash SHA-256.
4. Aguardando assinatura: somente ações de assinatura, cancelamento autorizado ou expiração; conteúdo não muda.
5. Assinado: relatório, evidências e PDF são imutáveis; não existe update genérico.
6. Correção: cria nova versão com motivo e vínculo `supersedes_id`; nunca altera o documento assinado.
7. Arquivamento: mudança lógica, não deleção física.
8. Exclusão definitiva: somente conforme política de retenção, privilégio específico e registro de auditoria; nunca para documento que precise ser preservado legal/contratualmente.
9. Reabertura/cancelamento de assinatura: privilégio específico, motivo obrigatório, invalidar token e registrar evento.
10. Todas as transições são funções/commands server-side e usam compare-and-set de estado.

### 14.4 Evidência de assinatura

Para cada assinatura, armazenar de forma protegida:

- ID da versão exata do relatório;
- hash do PDF antes e depois da assinatura;
- nome e e-mail/identidade usada;
- método de assinatura;
- data/hora UTC do servidor;
- versão e hash do termo aceito;
- IP e User-Agent, com base legal/retenção documentadas;
- token ID/hash, emissão, expiração e consumo;
- eventos de envio, acesso, aceite e conclusão;
- resultado de verificação do arquivo importado;
- cadeia de custódia e política de retenção.

O texto dos termos deve passar por validação jurídica. Citar a legislação não transforma automaticamente a assinatura em ICP-Brasil ou assinatura qualificada; o nível de assinatura e a evidência pretendida precisam ser definidos com assessoria jurídica.

### 14.5 Acesso e armazenamento

- fechar OTP público; somente usuário convidado e ativo recebe código;
- limitar CORS aos domínios autorizados;
- usar rate limit por conta, IP e dispositivo, sem depender só de e-mail;
- mover fotos para bucket privado;
- URLs assinadas curtas e geradas após autorização;
- validar tamanho, MIME real, dimensões e malware;
- excluir cache público e Service Worker das rotas/arquivos RDO;
- logs sem assinatura base64, PDF, token, endereço ou conteúdo sensível;
- separar `rdo_admin` de `cms_admin`.

### 14.6 Notificações

`rdo-notify` deve receber apenas comando como `{ report_id, action, idempotency_key }`. A função deve:

1. autenticar usuário;
2. verificar permissão e estado;
3. carregar relatório canônico;
4. gerar/obter PDF no servidor;
5. calcular destinatários autorizados;
6. escapar campos no HTML;
7. registrar mensagem em outbox;
8. enviar com idempotência e retry;
9. registrar entrega/falha;
10. nunca aceitar link de assinatura arbitrário do cliente.

---

## 15. Formulários, leads e integração com ERP

### 15.1 Estado atual

A Edge Function `submit-contact`:

- aceita POST público;
- valida campos mínimos, e-mail e consentimento;
- insere em `leads` usando service role;
- notifica por Resend;
- monta link para `erp.gaiatecsistemas.com.br/comercial/leads/{id}`.

Não há migration da tabela `leads` no pacote. Também não há limites consistentes de tamanho, rate limit, CAPTCHA/honeypot, enumeração das origens ou armazenamento estruturado de evidência do consentimento. O remetente `onboarding@resend.dev` indica configuração não finalizada para produção.

### 15.2 Contrato-alvo

Cada submissão deve armazenar:

- definição e versão do formulário;
- campos validados e normalizados;
- página, campanha, produto e UTM de origem;
- texto e versão do consentimento;
- data/hora do servidor;
- evidência técnica necessária, segregada e com retenção;
- status, responsável, SLA e histórico;
- ID de integração no ERP;
- chave idempotente e resultado de entrega.

Proteções:

- limite de corpo e de cada campo;
- validação de telefone/e-mail e enums;
- honeypot e CAPTCHA adaptativo;
- rate limit por IP/fingerprint/origem;
- CORS restrito;
- sanitização e escape de templates;
- resposta pública genérica, sem detalhes internos desnecessários;
- fila/outbox para ERP e e-mail;
- retentativa e tela de falhas;
- política de retenção e direitos do titular.

O CMS pode exibir leads, mas o ERP deve ser definido como sistema de registro comercial ou receber sincronização bidirecional por contrato. Não manter dois status independentes sem regra de reconciliação.

---

## 16. SEO, rotas, busca e redirects

### 16.1 SEO por entidade

Campos:

- meta title com limite e preview;
- meta description;
- slug imutável após publicação, salvo alteração com redirect automático;
- canonical derivado por padrão e override restrito;
- index/noindex;
- OG title/description/image;
- ALT das imagens;
- schema.org por tipo;
- inclusão no sitemap.

### 16.2 Regras

- `/admin`, preview e todo o RDO devem usar `noindex, nofollow` e autenticação quando aplicável;
- 404 deve retornar HTTP 404 no edge/SSR/prerender, não apenas uma tela dentro de resposta 200;
- posts precisam de rota individual;
- sitemap deve ser gerado da projeção publicada e incluir detalhes de produto, serviço, setor, aplicação e post;
- exclusão/mudança de slug deve exigir redirect 301 ou justificativa;
- redirects não podem formar ciclos, cadeias longas ou capturar assets;
- busca usa a mesma versão publicada e indexa sinônimos/relações;
- conteúdo oculto, rascunho e privado nunca entra em busca/sitemap.

---

## 17. Segurança e LGPD

### 17.1 Controles mínimos

- threat model documentado para CMS, site, leads e RDO;
- RLS default-deny e testes automatizados;
- autorização server-side por ação e recurso;
- MFA, sessão, revogação e rate limit;
- validação runtime de todas as entradas;
- CSP, HSTS, `nosniff`, Referrer Policy e Permissions Policy compatíveis;
- secrets apenas no servidor/gerenciador de segredos;
- rotação e inventário de chaves;
- uploads privados durante processamento, antivírus e allowlist;
- audit log protegido contra alteração pelo próprio administrador;
- revisão de dependências e alertas de vulnerabilidade;
- backup criptografado e restauração testada;
- ambientes separados e dados de produção não copiados para desenvolvimento sem anonimização.

### 17.2 LGPD

Criar inventário com:

- finalidade e base legal por tratamento;
- controlador, operadores e suboperadores;
- categorias de dados e titulares;
- origem, destino e transferências;
- prazo de retenção e descarte;
- controles de acesso;
- atendimento a solicitações do titular;
- resposta a incidentes;
- contatos do encarregado/canal de privacidade.

Consentimento deve ser usado somente quando for a base legal adequada. Logs de IP, assinatura, geolocalização, fotos de obra e dados profissionais exigem finalidade e retenção explícitas.

---

## 18. Qualidade, testes e CI/CD

### 18.1 Scripts mínimos

Adicionar e documentar:

- `format:check`;
- `lint`;
- `typecheck` com `tsconfig` estrito progressivo;
- `test` para unidades/contratos;
- `test:integration` com banco isolado;
- `test:e2e` para fluxos críticos;
- `test:a11y`;
- `build` reproduzível com lockfile;
- validação de migrations e tipos gerados.

### 18.2 Pirâmide de testes

| Camada | Cobertura essencial |
|---|---|
| Unidade | schemas, normalização, slugs, filtros, estados, permissões e formatadores. |
| Contrato | payloads da API pública/admin, compatibilidade por versão e tipos de bloco. |
| Banco/RLS | cada papel pode e não pode executar as ações previstas. |
| Integração | publicação, outbox, mídia, busca, redirects, lead/ERP e e-mail. |
| Componentes | cada bloco, formulário e estado vazio/erro. |
| E2E | login/MFA, produto completo, homepage, post, rollback, lead e RDO. |
| Visual | desktop/tablet/mobile, temas/presets e regressão dos blocos. |
| Segurança | abuso de upload, XSS, IDOR, token, rate limit e autorização negativa. |
| Performance | budgets de JS, imagem, LCP, CLS e tempo da API. |

### 18.3 Fluxos E2E obrigatórios

1. Criar produto → classificar → atributos → mídia/documento → relações → SEO → preview → revisão → publicação → confirmar lista, detalhe, busca, sitemap e rollback.
2. Editar homepage → reordenar hero/destaques → validar mobile → publicar → confirmar cache.
3. Criar campanha → formulário → agendar → publicar → submeter lead → confirmar ERP/outbox.
4. Alterar menu → impedir link inválido → publicar → testar desktop/mobile/teclado.
5. RDO: usuário não convidado negado; membro cria rascunho; finalização gera snapshot; assinatura remota consome token uma vez; documento assinado rejeita edição/exclusão.

### 18.4 Pipeline

```text
pull request
 -> format/lint/typecheck
 -> testes unitários e contratos
 -> banco temporário + migrations + RLS
 -> build
 -> E2E/a11y/visual em preview
 -> revisão
 -> staging
 -> aprovação de produção
 -> deploy imutável
 -> smoke tests
 -> observação e rollback automático/manual
```

Migrations destrutivas devem usar padrão expand/migrate/contract e nunca depender de deploy simultâneo perfeito.

---

## 19. Operação, observabilidade e continuidade

### 19.1 Sinais e dashboards

- disponibilidade e latência do site/API;
- erro JavaScript por versão/rota;
- falha de chunk e Service Worker;
- publicação, agendamento e outbox atrasados;
- taxa de erro das Edge Functions;
- falha de login/MFA e eventos suspeitos;
- lead recebido, integrado e pendente;
- e-mail enviado/falhou;
- mídia em processamento/falha;
- RDO finalizado, assinatura pendente/expirada e notificação falha;
- uso de storage, banco e limites do provedor.

Logs devem ser estruturados, possuir correlation ID e excluir conteúdo sensível. Erros apresentados ao usuário recebem código de suporte, não stack trace.

### 19.2 SLOs iniciais propostos

Valores devem ser aprovados conforme contrato e capacidade:

- site público: 99,9% mensal;
- API pública p95: até 500 ms em cache miss normal;
- publicação: refletir no site em até 60 s para 99% dos casos;
- processamento de imagem: até 2 min para 99%;
- submissão de lead: confirmação persistida em até 3 s; integração assíncrona visível;
- alerta crítico: detecção em até 5 min;
- RPO de conteúdo: até 15 min;
- RTO de CMS/site: até 4 h;
- restauração testada trimestralmente.

### 19.3 Runbooks obrigatórios

- deploy e rollback do site;
- deploy/rollback de Edge Functions;
- migration e restauração de banco;
- expurgo de cache/Service Worker;
- rotação de chaves;
- usuário bloqueado/MFA perdido;
- publicação incorreta;
- asset quebrado;
- fila/outbox parada;
- lead não integrado;
- assinatura RDO contestada ou token comprometido;
- incidente de segurança/LGPD.

Cada runbook deve conter proprietário, pré-condições, passos, validação, rollback, comunicação e evidências a preservar.

---

## 20. Plano de implementação seguro

### Fase 0 — decisão e acesso

- obter repositório do ERP/painel citado;
- obter fonte da `site-content`, migrations completas e configurações de ambiente;
- escolher hosting canônico;
- criar repositório Git completo e proteger branches;
- definir responsáveis técnicos, editoriais, segurança, jurídico e operação;
- criar staging separado;
- registrar ADRs iniciais.

**Saída:** arquitetura aprovada e ambiente reproduzível.

### Fase 1 — contenção de riscos

- fechar autoinscrição OTP do RDO;
- impedir edição/exclusão de RDO assinado;
- proteger fotos;
- corrigir `rdo-notify`;
- adicionar Error Boundary e noindex privado;
- corrigir links `#`, soft 404 crítico e política de cache;
- sanear dados de teste;
- implantar logs e alertas mínimos.

**Saída:** riscos P0 mitigados antes de ampliar acesso.

### Fase 2 — fundação de engenharia

- CI, lint, typecheck, testes e build reproduzível;
- migrations completas e tipos gerados;
- RBAC por escopo, MFA e auditoria;
- schemas runtime e registro de capacidades/blocos;
- API de leitura pública e comandos administrativos;
- revisions, outbox, preview e mídia.

**Saída:** plataforma segura para os módulos.

### Fase 3 — catálogo piloto

- reconciliar produtos estáticos e dados existentes;
- modelar hierarquia, atributos, mídia, documentos e relações;
- implementar editor completo de produto;
- migrar lista, detalhe, comparador, busca e SEO;
- feature flag e canary;
- homologar critérios E2E.

**Saída:** primeiro domínio totalmente canônico, sem duplicação ativa.

### Fase 4 — serviços, setores e aplicações

- unificar fontes duplicadas;
- preservar slugs e redirects;
- implementar relações explicativas;
- migrar filtros, mega menu e páginas de detalhe;
- decidir migração do módulo de detecção de gases.

### Fase 5 — homepage, páginas, menus e mídia

- consolidar blocos existentes;
- implementar registro de blocos e presets;
- migrar contato global, header e footer;
- criar preview responsivo e agendamento;
- retirar fallbacks somente após observação.

### Fase 6 — blog, campanhas, SEO e leads

- rota individual de blog;
- landing pages e formulários versionados;
- redirects/sitemap/busca automáticos;
- integração confiável com ERP;
- diagnóstico editorial.

### Fase 7 — hardening e lançamento

- testes de segurança e acessibilidade;
- ensaio de rollback/restauração;
- treinamento por perfil;
- conteúdo reconciliado e aprovado;
- canary, métricas e período de hiperacompanhamento;
- desativar infraestrutura antiga somente após confirmação.

---

## 21. Critérios de aceite

### 21.1 Critério transversal de funcionalidade

Para cada campo configurável:

- persiste após recarregar;
- respeita permissão no frontend, API e banco;
- aparece no preview;
- aparece em todos os consumidores públicos previstos;
- invalida cache corretamente;
- registra auditoria;
- suporta rollback;
- possui teste automatizado positivo e negativo;
- não quebra desktop, tablet, mobile, acessibilidade ou SEO.

Se um campo falhar em qualquer item, a funcionalidade não está pronta.

### 21.2 CMS MVP

- acesso fechado, MFA e papéis separados por escopo;
- produto completo publicado sem editar código;
- homepage configurável por blocos permitidos;
- mídia com variantes e rastreio de uso;
- serviços, setores e aplicações em fonte única;
- preview, revisão, agendamento, versões e lixeira;
- SEO, sitemap, redirects e busca coerentes;
- auditoria e diagnóstico acionáveis;
- site mantém última versão válida quando API/admin falha;
- rollback testado.

### 21.3 RDO

- usuário não convidado não cria sessão/acesso;
- membro não vê relatório de outro membro sem escopo;
- administrador RDO vê o necessário sem ganhar permissão CMS;
- relatório assinado rejeita update, reabertura e delete genéricos;
- correção cria nova versão;
- fotos/PDFs são privados;
- token expirado/usado é rejeitado;
- concorrência de assinatura não produz dupla conclusão;
- PDF e evidências possuem hash/trilha;
- notificação usa dados server-side e idempotência;
- suspensão de usuário preserva autoria.

### 21.4 Não funcionais

- zero vulnerabilidade crítica/alta conhecida sem tratamento aprovado;
- zero link `#` editorial publicado;
- zero tipo de bloco publicado sem renderer;
- zero rota privada indexável;
- testes de autorização negativa para todas as ações críticas;
- acessibilidade WCAG 2.2 AA nas jornadas principais;
- budgets de performance aprovados;
- restore e rollback executados com evidência;
- documentação e runbooks revisados por outro responsável.

---

## 22. Definition of Done por módulo

Um módulo está concluído apenas quando:

1. requisitos e regras de negócio foram aprovados;
2. modelo/migrations e estratégia de rollback existem;
3. contratos são versionados e validados;
4. RLS/RBAC e testes negativos existem;
5. painel possui estados de carregamento, vazio, erro e conflito;
6. preview usa o renderer real;
7. publicação, cache, busca/SEO e relações funcionam;
8. auditoria e métricas estão ativas;
9. testes unitários, integração, E2E, a11y e responsivos passam;
10. documentação e runbook foram atualizados;
11. conteúdo foi reconciliado e homologado;
12. remoção do fallback antigo foi planejada ou executada com segurança.

“Tela criada” ou “registro salvo no banco” não são critérios de conclusão.

---

## 23. Documentos que devem existir no repositório

Estrutura mínima sugerida:

```text
docs/
  architecture/
    context.md
    containers.md
    content-contracts.md
    media.md
    auth-rbac.md
    rdo.md
    integrations.md
    adr/
  product/
    cms-requirements.md
    control-render-matrix.md
    workflows.md
    acceptance-criteria.md
  api/
    openapi.yaml
    schemas/
  database/
    model.md
    data-dictionary.md
    migrations.md
    rls-matrix.md
  operations/
    environments.md
    deploy-rollback.md
    backup-restore.md
    monitoring-alerts.md
    incident-response.md
    cache-service-worker.md
  security/
    threat-model.md
    lgpd-data-map.md
    retention.md
  testing/
    strategy.md
    test-matrix.md
README.md
.env.example
```

### ADRs iniciais

- ADR-001: fonte canônica e estratégia de migração;
- ADR-002: painel no ERP, `/admin` ou subdomínio;
- ADR-003: hosting canônico;
- ADR-004: API pública e contratos versionados;
- ADR-005: RBAC separado CMS/RDO;
- ADR-006: storage e processamento de mídia;
- ADR-007: publicação, outbox e cache;
- ADR-008: assinatura e imutabilidade do RDO;
- ADR-009: renderização SEO/prerender/SSR;
- ADR-010: integração de leads com ERP.

---

## 24. Acessos e decisões ainda necessários

Antes de implementar:

1. repositório completo com histórico Git;
2. repositório do ERP/`dzsystem` e painel `/marketing/site`;
3. projeto Supabase de staging e inventário de produção;
4. fonte das Edge Functions implantadas, especialmente `site-content`;
5. schema/migrations de conteúdo e `leads`;
6. projeto Cloudflare/Vercel e decisão de origem;
7. configuração Resend e autenticação dos domínios de e-mail — confirmar se `gaiatecsistemas.com` sem `.br` é intencional;
8. lista de usuários e papéis esperados;
9. política jurídica de RDO, assinatura e retenção;
10. glossário oficial: setor × indústria × segmento × solução × aplicação;
11. fonte mestre do catálogo e responsável por aprovar a reconciliação;
12. requisitos de SLA, volume, backup e orçamento.

---

## 25. Evidências técnicas principais

| Evidência | Arquivo/local |
|---|---|
| CMS explicitamente descontinuado e fallback forçado | `src/app/hooks/useSiteData.ts` |
| Cliente Supabase e tentativa de `site-content` | `src/lib/supabase.ts` |
| Tipos e comportamento dos blocos | `src/app/components/BlockRenderer.tsx` |
| Rotas públicas e RDO; ausência de `/admin` | `src/app/routes.tsx` |
| Registro global do Service Worker | `src/main.tsx` e `src/app/components/ServiceWorkerRegister.tsx` |
| Conteúdo de produto duplicado/monolítico | `src/app/data/products.ts` e `src/app/pages/ProdutosPage.tsx` |
| Serviços estáticos | `src/app/data/servicesList.ts` e `src/app/data/services.ts` |
| RLS e evolução do RDO | `supabase/migrations/0001_rdo.sql` a `0007_rdo_rls_por_usuario.sql` |
| Cadastro aberto por OTP | `supabase/functions/rdo-otp/index.ts` |
| Notificação confiando no payload do cliente | `supabase/functions/rdo-notify/index.ts` |
| Assinatura remota e upload de PDF | `supabase/functions/rdo-sign/index.ts` |
| Edição e exclusão de relatórios | `src/app/rdo/lib/relatorios.ts` e `src/app/rdo/pages/FormPage.tsx` |
| Reabertura e tokens de assinatura | `src/app/rdo/lib/assinatura.ts` |
| Termos de assinatura | `src/app/rdo/lib/terms.ts` |
| Integração de contato com leads/ERP | `supabase/functions/submit-contact/index.ts` |
| Configurações paralelas de hosting/cache | `vercel.json`, `public/_redirects`, `public/_headers` |
| Ausência de gates de qualidade | `package.json` e ausência de testes/CI/tsconfig no pacote |

---

## 26. Conclusão final

A documentação enviada era necessária e útil, mas não suficiente para garantir uma implementação sem desconexões. Este complemento transforma a visão em regras de engenharia e operação verificáveis.

As duas correções de direção mais importantes são:

1. **não reativar o CMS antigo apenas removendo o fallback**, pois API, schema, dados e renderizadores não estão atualmente alinhados;
2. **não tratar o RDO como apenas mais uma página autenticada**, pois ele produz documentos e assinaturas que precisam de acesso fechado, imutabilidade, evidência e retenção.

O projeto deve avançar por capacidades verticais completas. O primeiro módulo só entra em produção quando o caminho inteiro — painel, autorização, banco, publicação, site, cache, observabilidade e testes — estiver funcionando. Essa disciplina é o mecanismo concreto para obter uma administração ampla e eficiente sem criar campos sem efeito, configurações órfãs ou operações que comprometam o site.

---

## 27. Procedimento de execução

As fases, gates, responsáveis, modelo de tickets, sequência de implementação, checklists de homologação, release e rollback estão detalhados em:

**[Procedimento de ajustes e desenvolvimento do painel administrativo GAIATEC](./PROCEDIMENTO_AJUSTES_E_DESENVOLVIMENTO_PAINEL_ADMINISTRATIVO_GAIATEC.md)**

Esse procedimento deve ser utilizado para transformar as recomendações deste documento em backlog e trabalho de desenvolvimento. Ele não substitui os contratos, ADRs e critérios aqui definidos; organiza sua execução.
