# Planejamento executivo de desenvolvimento da remodelagem e do CMS GAIATEC

**Versão:** 1.0
**Data:** 28 de agosto de 2026
**Aplicação:** novo site público, novo painel administrativo `/admin`, APIs, banco, mídia, busca, SEO, leads e adequações do RDO
**Repositório de trabalho:** `website_gaiatecsistemas-main/website_gaiatecsistemas-main`
**Status:** documento-base obrigatório para execução no Codex

---

## 1. Objetivo do planejamento

Organizar o desenvolvimento necessário para entregar:

- remodelagem completa do site público;
- novo painel administrativo exclusivo em `/admin`;
- banco editorial e biblioteca de mídia novos;
- recadastro integral de produtos, serviços e demais conteúdos;
- catálogo, busca, relações, SEO e navegação coerentes;
- administração segura, eficiente, auditável e restaurável;
- eliminação de conteúdo hardcoded e fontes editoriais duplicadas;
- operação confiável em desenvolvimento, staging e produção.

Este planejamento é a referência para ordenar tarefas, abrir tickets, executar alterações, validar entregas e decidir quando cada fase pode avançar.

---

## 2. Referências obrigatórias

Antes de desenvolver um módulo, consultar os documentos correspondentes:

1. **[Análise e arquitetura do site](<./Analise e Arquitetura do Site - GAIATEC SISTEMAS.md>)**
   Arquitetura da informação, catálogo, busca, filtros, páginas, jornadas, URLs e SEO.

2. **[Auditoria do CMS](./AUDITORIA_CMS_GAIATEC.md)**
   Diagnóstico externo, arquitetura geral, problemas do site, módulos e riscos.

3. **[Complemento técnico-operacional](./COMPLEMENTO_TECNICO_OPERACIONAL_AUDITORIA_CMS_GAIATEC.md)**
   Evidências do código, contratos, banco, autenticação, RDO, segurança, testes e operação.

4. **[Procedimento de ajustes e desenvolvimento](./PROCEDIMENTO_AJUSTES_E_DESENVOLVIMENTO_PAINEL_ADMINISTRATIVO_GAIATEC.md)**
   Forma obrigatória de executar tickets, fases, gates, testes, releases e rollback.

5. **[Política de recadastro limpo](./POLITICA_RECADASTRO_LIMPO_CONTEUDO_E_MIDIA_GAIATEC.md)**
   Proibições de importação, fontes aceitas, proveniência, checklists de conteúdo/mídia e gates de cadastro.

### 2.1 Ordem de autoridade

1. segurança, legislação e regra formalmente aprovada;
2. política de recadastro limpo;
3. ADR aprovada após este planejamento;
4. procedimento de desenvolvimento;
5. complemento técnico-operacional;
6. arquitetura do site;
7. auditoria original;
8. comportamento atual do código.

O comportamento atual nunca prevalece por simples existência.

---

## 3. Premissas fixas

### 3.1 Novo painel

- painel novo e exclusivo;
- rota funcional inicial `/admin`;
- entry point, chunks, headers, cache e autenticação separados da área pública;
- nenhum código, usuário, papel, tela ou workflow administrativo anterior será reutilizado;
- o novo CMS será a única administração do site.

### 3.2 Recadastro limpo

- banco editorial começa vazio;
- storage editorial começa vazio;
- conteúdo atual não é migrado, importado, conciliado ou usado como fallback;
- cada produto, serviço, setor, aplicação, página, relação, imagem e documento é cadastrado novamente;
- fontes, cadastrador, revisor e aprovação são registrados;
- site atual serve apenas para inventário de URLs, redirects, falhas e rollback técnico integral.

### 3.3 Entrega vertical

Uma capacidade só termina quando inclui:

```text
schema -> migration -> RLS/RBAC -> API -> painel -> preview
-> projeção pública -> site -> cache -> auditoria -> testes -> monitoramento
```

### 3.4 Segurança

- autorização no backend e no banco;
- MFA para perfis críticos;
- RLS default-deny;
- uploads privados durante processamento;
- audit log protegido;
- nenhuma service role no frontend;
- nenhuma rota privada indexável ou cacheada publicamente.

### 3.5 Operação segura

- desenvolvimento isolado de produção;
- staging obrigatório;
- feature flags por capacidade;
- publicação versionada;
- última projeção nova válida como fallback;
- deploy, restore e rollback comprovados antes do go-live.

---

## 4. Método de execução

O projeto adotará uma combinação de métodos adequados ao risco e ao tipo de sistema.

### 4.1 Risk-first

Riscos críticos de acesso, dados, RDO, formulários, cache e deploy são tratados antes da expansão funcional.

### 4.2 Contract-first

Schema, API, estados e permissões são definidos antes de formulários e componentes. Isso impede campos sem efeito e integrações ambíguas.

### 4.3 Vertical slicing

Entregar um módulo completo de produto como prova da arquitetura antes de reproduzir a solução em serviços, aplicações, setores e páginas.

### 4.4 Stage-gate

Cada fase possui gate de saída. A fase seguinte não começa apenas porque a anterior consumiu tempo; ela começa quando as evidências exigidas existem.

### 4.5 Clean-room content

Conteúdo novo é produzido fora das fontes atuais, com proveniência e aprovação. Automação de importação fica proibida na carga inicial.

### 4.6 Test-driven e evidence-driven

Correções começam com reprodução/teste falhando quando viável. Homologação exige evidência objetiva, não somente demonstração visual.

### 4.7 ADRs

Decisões estruturais são registradas em Architecture Decision Records, incluindo contexto, opções, decisão, consequências e rollback.

### 4.8 Feature flags e cutover

Flags alternam capacidades/site novo e anterior durante lançamento. Nunca misturam registros atuais e novos dentro do CMS.

---

## 5. Estado inicial confirmado

No pacote examinado:

- Node 22 definido em `.nvmrc`;
- dependências atualmente instaladas em `node_modules`;
- `package-lock.json` presente;
- Vite com script `npm run dev`;
- scripts de build e deploy Cloudflare presentes;
- `.env.example` e `.env.local` presentes;
- não há diretório `.git` no pacote fornecido;
- não há `tsconfig.json`;
- não há pipeline `.github`;
- não foram identificados gates de lint, typecheck e testes no pacote original;
- `/admin` ainda não está implementado;
- conteúdo público atual continua inadequado para o novo cadastro.

Esses dados devem ser confirmados novamente no início de cada execução, pois o workspace pode receber alterações.

---

## 6. Trilhas de trabalho

### Trilha A — Engenharia e plataforma

- repositório e ambientes;
- segurança e RDO;
- CI/CD e testes;
- banco, schemas e APIs;
- painel `/admin`;
- publicação, mídia e observabilidade;
- remodelagem do frontend público.

### Trilha B — Arquitetura de conteúdo

- glossário e taxonomia;
- atributos por categoria;
- templates de produto/serviço/aplicação;
- regras de relações;
- fontes e owners;
- critérios de completude e aprovação.

### Trilha C — Recadastro

- produtos;
- serviços;
- setores/indústrias;
- aplicações e soluções;
- imagens e documentos;
- páginas, blog, homepage, menus e contato.

### Trilha D — QA, segurança e operação

- automação de testes;
- testes de RLS/RBAC;
- acessibilidade e performance;
- segurança/LGPD;
- observabilidade;
- runbooks, homologação e go-live.

As trilhas A e B podem avançar em paralelo. A trilha C só começa depois que schema, painel e política do respectivo domínio passarem pelo gate. A trilha D acompanha todas as fases.

---

## 7. Macrocronograma por dependência

O planejamento usa sequência e gates, não datas fixas. Prazo depende da equipe, volume real de conteúdo, aprovações e acessos.

| Fase | Resultado | Dependência | Gate |
|---|---|---|---|
| 0 | baseline, owners, ADRs e ambientes | nenhuma | G0 |
| 1 | riscos P0 contidos | F0 | G1 |
| 2 | engenharia reproduzível | F0/F1 | G2 |
| 3 | núcleo do novo CMS | F2 | G3 |
| 4 | produto piloto completo | F3 + taxonomia | G4 |
| 5 | recadastro do catálogo e descoberta | F4 | G5 |
| 6 | remodelagem pública e conteúdo institucional | F4/F5 | G6 |
| 7 | marketing, blog, SEO e leads | F3/F6 | G7 |
| 8 | hardening, recadastro final e go-live | todas | G8 |
| 9 | retirada do caminho antigo | estabilidade pós-go-live | G9 |

---

## 8. Fase 0 — baseline, decisões e ambiente

### Objetivo

Tornar o projeto executável, rastreável e livre de decisões implícitas.

### Tarefas

#### F0-01 — Baseline do workspace

- inventariar arquivos e alterações;
- confirmar que o pacote não possui Git;
- localizar repositório oficial ou inicializar controle de versão somente com autorização;
- registrar hash/versão dos artefatos atuais;
- confirmar scripts, Node e variáveis;
- executar build de baseline;
- registrar rotas e smoke tests atuais.

#### F0-02 — Ambientes

- definir local, CI, preview, staging e produção;
- criar Supabase de desenvolvimento/staging;
- separar buckets, Auth e secrets;
- documentar URLs e owners;
- impedir acesso de local a produção.

#### F0-03 — ADRs iniciais

- ADR-001: recadastro limpo e cutover;
- ADR-002: novo `/admin` e separação de bundle/cache;
- ADR-003: hosting canônico;
- ADR-004: API pública/admin e contratos;
- ADR-005: RBAC separado CMS/RDO;
- ADR-006: storage e pipeline de mídia;
- ADR-007: publicação/outbox/cache;
- ADR-008: SEO/prerender/SSR/edge;
- ADR-009: modelo de leads no novo CMS;
- ADR-010: imutabilidade do RDO.
- ADR-011: CMS total e site builder governado.

#### F0-04 — Governança

- nomear Product Owner, Tech Lead e owners de conteúdo;
- aprovar RACI;
- criar backlog e modelo de ticket do procedimento;
- definir canal de decisão e incidentes;
- aprovar política de recadastro.

### Entregáveis

- baseline técnico;
- matriz de ambientes e acessos;
- ADRs aprovadas;
- RACI e backlog inicial;
- build reproduzido;
- risco/owner por pendência.

### Gate G0

- repositório/branch base identificados;
- staging disponível;
- owners nomeados;
- decisões bloqueadoras fechadas;
- nenhuma credencial de produção necessária para desenvolvimento local;
- documentação aceita como base de execução.

---

## 9. Fase 1 — contenção de riscos P0

### Objetivo

Impedir que o desenvolvimento amplie vulnerabilidades ou perda de integridade.

### Tarefas

#### RDO

- fechar autoinscrição por OTP;
- exigir convite e usuário ativo;
- separar permissões `rdo:*` e `cms:*`;
- impedir edição/exclusão de relatório assinado;
- criar versão corretiva em vez de alteração;
- tornar fotos privadas;
- reconstruir notificações server-side;
- adicionar idempotência, rate limit e evidência de assinatura;
- criar testes de RLS e fluxo remoto.

#### Site

- Error Boundary e erros por rota;
- noindex para áreas privadas;
- corrigir soft 404;
- revisar Service Worker e cache;
- corrigir links `#` críticos e overflow mobile;
- validar headers de segurança;
- impedir que API antiga seja reativada por engano.

#### Formulários

- limites de corpo/campos;
- validação server-side;
- rate limit/honeypot/CAPTCHA adaptativo;
- consentimento estruturado;
- persistência segura e notificação idempotente.

### Entregáveis

- riscos P0 corrigidos ou formalmente isolados;
- testes negativos de segurança;
- runbooks iniciais;
- relatório de verificação.

### Gate G1

- acesso RDO fechado;
- assinados imutáveis;
- mídia sensível privada;
- rotas privadas não indexáveis;
- nenhum P0 sem owner e contenção;
- testes críticos verdes.

---

## 10. Fase 2 — fundação de engenharia

### Objetivo

Garantir que qualquer mudança futura seja compilada, testada, revisada e reversível.

### Tarefas

#### F2-01 — TypeScript e qualidade

- criar `tsconfig`;
- adotar modo estrito progressivo;
- configurar formatter e lint;
- scripts `format:check`, `lint`, `typecheck`;
- corrigir erros impeditivos sem mudanças indiscriminadas.

#### F2-02 — Testes

- framework unitário;
- testes de contrato/schema;
- Supabase local/efêmero;
- testes de RLS;
- testes de componentes;
- Playwright ou equivalente;
- acessibilidade automatizada;
- smoke test de rotas/assets.

#### F2-03 — CI/CD

- checks obrigatórios por PR;
- build reprodutível com `npm ci`;
- preview por mudança;
- migrations em banco efêmero;
- artefato imutável;
- staging e produção com aprovação;
- rollback documentado.

#### F2-04 — Observabilidade

- logs estruturados e correlation ID;
- captura de erros por versão/rota;
- métricas de API, publicação e filas;
- alertas iniciais;
- remoção de conteúdo sensível dos logs.

#### F2-05 — Estrutura de código

Separar por responsabilidade, sem necessariamente converter para monorepo imediatamente:

```text
src/
  public/
  admin/
  shared/
  rdo/
supabase/
  migrations/
  functions/
  seed/
docs/
  adr/
  api/
  database/
  operations/
```

### Entregáveis

- CI verde;
- scripts de qualidade;
- testes mínimos;
- preview/staging;
- logs e alertas;
- estrutura aprovada.

### Gate G2

- máquina limpa executa `npm ci`, checks e build;
- migrations sobem em banco vazio;
- RLS possui testes permitidos/negados;
- preview é não indexável;
- rollback de aplicação foi ensaiado.

---

## 11. Fase 3 — núcleo do novo CMS

### Objetivo

Construir a infraestrutura administrativa antes dos módulos de conteúdo.

### Tarefas

#### F3-01 — Auth e usuários

- login/logout;
- convite fechado;
- recuperação;
- MFA;
- status ativo/suspenso;
- sessões e revogação;
- perfis e último acesso.

#### F3-02 — RBAC/RLS

- papéis Super Admin, Admin, Marketing, Comercial, Técnico, Editor e Revisor;
- permissões por ação e domínio;
- claims/escopos separados do RDO;
- matriz documentada;
- testes negativos.

#### F3-03 — Shell `/admin`

- layout, navegação e breadcrumbs;
- dashboard operacional;
- busca global;
- tabelas, filtros e paginação;
- estados vazio/loading/erro/sem permissão;
- perfil e sessões;
- responsividade administrativa.

#### F3-04 — Conteúdo e revisões

- `content_items`;
- `content_revisions`;
- estados draft/review/approved/scheduled/published/archived;
- concorrência otimista;
- lixeira;
- comparação e restauração.

#### F3-05 — Publicação

- comandos específicos;
- transação;
- outbox;
- projeção publicada;
- cache por versão/tag;
- agendamento idempotente;
- status e falhas visíveis.

#### F3-06 — Preview

- token curto;
- renderer real;
- desktop/tablet/mobile;
- sem indexação/cache público;
- validação de links, mídia, relações e SEO.

#### F3-07 — Mídia

- biblioteca vazia;
- upload privado;
- origem/licença/owner;
- MIME/malware/dimensões;
- variantes WebP/AVIF;
- ALT, legenda e ponto focal;
- mapa de usos;
- substituição versionada.

#### F3-08 — Registro de capacidades

Cada `consumer_id` define schema, renderer, rotas, permissões, preview, fixtures e testes. O CI rejeita campo/bloco sem consumidor.

### Entregáveis

- `/admin` autenticado;
- RBAC/RLS;
- revisions/publicação/preview;
- mídia;
- audit log;
- registro de capacidades.

### Gate G3

Um conteúdo de demonstração sem dados reais consegue ser criado, revisado, publicado, exibido, auditado e restaurado; usuário sem permissão é negado em UI, API e banco.

---

## 12. Fase 4 — produto piloto vertical

### Objetivo

Comprovar a arquitetura em um domínio real antes de expandir o CMS.

### Tarefas

#### F4-01 — Modelo

- produto, fabricante, linha, modelo e variante;
- segmento/categoria/subcategoria/família;
- atributos por categoria;
- mídia e documentos;
- aplicações, setores, serviços e produtos relacionados;
- sinônimos/busca;
- SEO/redirects;
- origem e aprovação.

#### F4-02 — Taxonomia

- workshop Comercial/Engenharia/Portfólio;
- glossário;
- unidades e tipos;
- campos obrigatórios;
- regras de completude;
- primeiro lote pequeno e representativo.

#### F4-03 — Editor

- identificação;
- classificação;
- conteúdo comercial;
- especificações;
- imagens;
- documentos;
- relações;
- busca;
- SEO;
- histórico/publicação.

#### F4-04 — Recadastro piloto

- banco começa sem produto;
- selecionar fontes oficiais;
- cadastrar manualmente itens do lote;
- carregar imagens novas;
- revisão técnica/comercial/editorial;
- registrar proveniência.

#### F4-05 — Site público

- lista;
- detalhe;
- cards;
- filtros;
- comparador;
- busca;
- relações;
- sitemap/schema/canonical.

#### F4-06 — Teste vertical

Criar → revisar → preview → publicar → verificar todos os consumidores → criar nova revisão → restaurar → testar falhas e permissão negativa.

### Entregáveis

- primeiro lote novo publicado em staging;
- zero produto atual importado;
- painel e site no mesmo contrato;
- busca e SEO operacionais;
- evidências de aprovação.

### Gate G4

- fonte única nova;
- zero campo órfão;
- zero arquivo atual reutilizado;
- preview fiel;
- rollback funcional;
- segurança, responsividade e performance aprovadas;
- owner do portfólio homologou o lote.

---

## 13. Fase 5 — catálogo, serviços e descoberta

### Objetivo

Expandir o padrão comprovado sem copiar estruturas atuais.

### Tarefas

#### Produtos

- cadastrar lotes priorizados;
- completar taxonomia e atributos;
- processar imagens/documentos novos;
- QA por amostragem e por regra;
- acompanhar completude.

#### Serviços

- redefinir categorias e escopo;
- recadastrar todos os serviços;
- cadastrar imagens/documentos novos;
- relações e CTAs;
- lista/detalhe/SEO.

#### Setores/indústrias

- validar lista e evidências;
- recadastrar desafios, aplicações e soluções;
- criar relações justificadas;
- páginas novas e SEO.

#### Aplicações/soluções

- pontos de aplicação;
- problema/processo;
- relações explicativas;
- benefícios comprovados;
- filtros derivados do banco.

#### Detecção de gases

- decidir modelo novo integrado ou especializado;
- recadastrar produtos e imagens;
- unificar busca e governança;
- manter especificidades técnicas.

#### Busca

- índice único da projeção publicada;
- normalização, modelos, unidades e sinônimos;
- autocomplete e resultados;
- analytics de zero resultado;
- testes das consultas técnicas de referência.

### Gate G5

- lotes do escopo cadastrados e aprovados;
- nenhuma fonte editorial atual conectada;
- busca usa apenas projeção nova;
- relações sem órfãos;
- imagens com origem/ALT;
- páginas completas, sem placeholders.

Decisão posterior do administrador em 2026-08-29: o Gate G5 editorial permanece aberto até existirem lotes reais completos, mas a construção técnica da Fase 6 pode avançar conforme a ADR-011. A exceção não autoriza publicação em produção, preenchimento automático nem go-live sem G5/G8.

---

## 14. Fase 6 — remodelagem do site público

### Objetivo

Aplicar a nova arquitetura de informação e experiência sobre o conteúdo recadastrado.

### Tarefas

#### Administração total e site builder

- transformar páginas e homepage em entidades totalmente editáveis pelo CMS;
- editor visual por blocos governados, sem JSON como interface editorial principal;
- templates aprovados e composição de páginas temáticas/landing pages;
- criar, duplicar, reordenar, ocultar, despublicar, arquivar e restaurar páginas;
- preview responsivo desktop/mobile dentro do fluxo editorial;
- registro dinâmico de rotas com proteção contra colisões e URLs reservadas;
- seletores pesquisáveis para relações entre produtos, serviços, indústrias, aplicações e soluções;
- administração de header, mega menu, menu mobile, footer e links globais;
- configurações globais de contato, redes, CTAs e identidade permitida;
- destaques temporários com início, término, prioridade e fallback;
- decisão explícita de redirect, `404` ou `410` ao retirar uma página publicada;
- auditoria, versionamento, aprovação e rollback para toda alteração;
- hard delete somente para rascunho nunca publicado e com permissão específica;
- blocos não podem executar HTML, JavaScript ou CSS arbitrário;
- atender integralmente à `ADR-011`.

#### Navegação

- header e mega menu novos;
- menu mobile;
- footer;
- busca global;
- links validados;
- teclado e foco.

#### Homepage

- hero orientado à descoberta;
- caminhos rápidos;
- produtos e soluções aprovados;
- setores/aplicações;
- serviços;
- conteúdo técnico;
- CTA/contato;
- blocos governados e reordenáveis.

#### Templates

- produto;
- serviço;
- indústria/setor;
- aplicação/solução;
- páginas institucionais;
- estados 404, vazio, erro e sem resultado.

#### Design system

- tokens;
- tipografia;
- grids;
- componentes;
- contrastes;
- breakpoints;
- presets administrativos;
- regressão visual.

#### SEO técnico

- HTML inicial indexável conforme ADR;
- canonical/OG/schema;
- sitemap novo;
- 404 real;
- redirects sem cadeia;
- admin/RDO/preview noindex.

### Gate G6

- jornadas desktop/mobile aprovadas;
- WCAG 2.2 AA nas jornadas principais;
- administrador cria, edita, ordena, publica, despublica e restaura uma página sem alterar código;
- menus, configurações globais e destaques publicados chegam aos respectivos consumidores;
- editor visual não depende de JSON e preview reproduz o frontend público;
- remoção de página publicada exige destino explícito e não cria link órfão;
- nenhum link `#` editorial;
- sem overflow;
- SEO e HTTP status corretos;
- budgets de performance atendidos.

---

## 15. Fase 7 — conteúdo, marketing e leads

### Blog

- `/blog/:slug`;
- editor estruturado;
- autor/categoria/tags;
- relações;
- agendamento;
- Article schema e sitemap.

### Campanhas/landing pages

- templates aprovados;
- blocos;
- períodos;
- posicionamentos e destaques temporários por produto, serviço, solução ou página;
- prioridade, início, término, expiração e conteúdo de fallback;
- formulários;
- preview;
- tracking conforme consentimento;
- expiração e redirect.

### Menus, contato e configurações

- recadastro integral;
- uma fonte global;
- redes, endereço, telefones e CTAs;
- validação em todos os consumidores.

### Leads

- módulo do novo CMS;
- formulários versionados;
- origem/UTM/produto/campanha;
- consentimento;
- status, responsável, SLA e histórico;
- notificações/outbox;
- exportação auditada;
- LGPD e retenção.

### Gate G7

- fluxo campanha → formulário → lead → atribuição → atendimento funciona;
- blog e páginas publicam/agendam/restauram;
- contato consistente no site inteiro;
- permissões e exportações testadas;
- nenhum encaminhamento administrativo anterior ativo.

Reavaliação técnica em 2026-08-30: o round-trip remoto `20260830143413-3fb870` aprovou os fluxos de blog, campanha, formulário, lead, atribuição, exportação, anonimização, expiração, AAL2/RBAC e retirada de fixtures. Os formulários permanentes de contato e newsletter foram publicados e testados em staging. O gate permanece formalmente bloqueado somente até a entrega real de e-mail, a revisão do DPO e a publicação dos demais dados globais permanentes pelo proprietário. Produção continua vedada.

---

## 16. Fase 8 — hardening, recadastro final e go-live

### Objetivo

Validar o sistema completo e substituir a versão pública anterior com segurança.

### Tarefas

- congelar mudanças estruturais;
- concluir lotes do escopo de lançamento;
- revisar proveniência e completude;
- crawl e QA funcional;
- E2E, a11y, visual, performance e segurança;
- teste de concorrência/publicação/filas;
- backup/restore/rollback;
- mapa de redirects/404/410;
- treinamento por perfil;
- manual do usuário;
- controle por allowlist para campos públicos ou somente internos, com fabricante/OEM interno por padrão;
- cadastro em massa de conteúdo novo por planilha oficial, com dry-run, atomicidade, idempotência e auditoria;
- bloqueio explícito de exportações do painel/site anterior e de importação em massa de imagens/documentos;
- canary;
- observação intensiva;
- comunicação e suporte.

Decisão complementar executada em 2026-08-29: a allowlist de visibilidade e o cadastro em massa de produtos novos foram publicados em staging. Fabricante/OEM, referência do fabricante e SKU são internos por padrão; a projeção pública remove também duplicações indiretas, proveniência e caminhos privados. A planilha oficial é vazia, versionada e não aceita conteúdo legado, fórmulas, macros, imagens ou documentos.

Reavaliação em 2026-08-30: o lote sintético completo aprovou erro atômico com zero criação, dry-run, criação de dois rascunhos, idempotência, auditoria, publicação interna, projeção pública e retirada. O Gate G8 continua aberto pelos lotes reais, provedor de e-mail, aprovações LGPD/owners, operação de alertas/restore e aceite de go-live. Esta pendência impede iniciar a Fase 9 e não autoriza produção.

Reavaliação operacional em 2026-08-30: a aprovação LGPD administrativa foi confirmada, `RESEND_API_KEY` foi detectada, e o cron protegido por Vault passou a executar `cms-outbox-worker` a cada cinco minutos com HTTP 200. A entrega foi recusada como `sender_not_authorized`, coerente com a ausência pública de DKIM/SPF/MX do Resend para o domínio raiz. Configurações globais e um produto estão publicados, mas navegação, serviços, indústrias, aplicações e soluções ainda não foram recadastrados. O Gate G8 e a vedação da Fase 9 permanecem.

Complemento clean-room em 2026-08-30: usando somente informações fornecidas pelo administrador, foram publicados pelo workflow com MFA a navegação, cinco serviços, oito indústrias, três aplicações e duas soluções. API, coleções, páginas detalhadas e viewport móvel foram aprovadas. O lote editorial inicial deixou de bloquear o gate; permanecem a autorização do remetente no Resend, a conclusão operacional e a autorização explícita de canary/go-live.

### Gate G8

- zero P0;
- P1 apenas com aceite formal, owner e prazo;
- conteúdo do lote 100% novo e aprovado;
- nenhum fallback editorial atual;
- restore/rollback comprovados;
- alertas e runbooks ativos;
- owners aprovam go-live.

---

## 17. Fase 9 — retirada do caminho anterior

### Objetivo

Eliminar fontes duplicadas e impedir regressão.

### Tarefas

- remover arrays hardcoded editoriais;
- remover adaptadores/hooks antigos;
- retirar tabelas atuais do caminho de produção;
- remover imagens atuais dos consumidores públicos;
- manter arquivo histórico somente conforme retenção;
- aplicar redirects/410/404;
- remover flags expiradas;
- atualizar documentação;
- criar testes que proíbem reintrodução.

### Gate G9

- site e CMS usam somente contratos novos;
- busca/sitemap usam somente projeção nova;
- nenhum consumidor consulta conteúdo atual;
- nenhum usuário acessa administração paralela;
- período de estabilidade concluído.

---

## 18. Sequência inicial de tickets no Codex

Executar nesta ordem, sem iniciar telas em massa:

1. `BASE-001` — confirmar baseline, scripts, build e ambiente;
2. `ADR-001` — registrar recadastro limpo/cutover;
3. `ADR-002` — definir arquitetura `/admin` e bundles;
4. `ENV-001` — validar envs local/staging;
5. `QUAL-001` — tsconfig, formatter, lint e typecheck;
6. `TEST-001` — testes unitários e smoke;
7. `CI-001` — pipeline e preview;
8. `SEC-RDO-001` — fechar OTP e separar permissões;
9. `SEC-RDO-002` — imutabilidade e mídia privada;
10. `WEB-001` — Error Boundary/noindex/404/cache;
11. `CMS-001` — schema base, users/RBAC/audit;
12. `CMS-002` — shell `/admin`;
13. `CMS-003` — revisions/publicação/outbox;
14. `CMS-004` — preview e mídia;
15. `CAT-001` — taxonomia e produto piloto;
16. `CAT-002` — recadastro piloto;
17. `PUBLIC-001` — consumidores públicos do produto;
18. `QA-001` — teste vertical e Gate G4.

O próximo ticket só deve começar quando sua dependência estiver pronta ou quando a atividade for explicitamente paralelizável e não causar decisão prematura.

---

## 19. Padrão de execução de cada ticket

1. ler referências citadas no ticket;
2. confirmar estado atual e mudanças de terceiros;
3. reproduzir problema ou criar teste inicial;
4. definir contrato, permissão e rollback;
5. implementar mudança mínima completa;
6. executar testes proporcionais ao risco;
7. inspecionar diff e efeitos indiretos;
8. atualizar documentação/ADR;
9. apresentar evidências e pendências;
10. obter aceite/gate.

Nenhum ticket deve alterar arquivos não relacionados sem justificativa. Mudanças existentes do usuário devem ser preservadas.

---

## 20. Estratégia de branches e revisão

Quando o repositório Git oficial estiver disponível:

- branch principal protegida;
- branch curta por ticket;
- pull request pequeno;
- conventional commits;
- checks obrigatórios;
- pelo menos uma revisão para segurança/migrations/contratos;
- squash ou estratégia aprovada;
- release tag/artefato imutável;
- nenhuma alteração direta em produção.

Sem Git oficial, evitar desenvolvimento material além do baseline e tarefas autorizadas, pois não haverá rastreabilidade e rollback adequados.

---

## 21. Matriz de testes por entrega

| Entrega | Unidade | Contrato | RLS | Componente | E2E | A11y | Visual | Performance | Segurança |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Auth/RBAC | sim | sim | sim | sim | sim | sim | não | básico | sim |
| Produto | sim | sim | sim | sim | sim | sim | sim | sim | sim |
| Mídia | sim | sim | sim | sim | sim | sim | visual | sim | sim |
| Homepage/blocos | sim | sim | conforme | sim | sim | sim | sim | sim | sim |
| Busca | sim | sim | conforme | sim | sim | sim | não | sim | sim |
| Leads | sim | sim | sim | sim | sim | sim | não | sim | sim |
| RDO | sim | sim | sim | sim | sim | sim | conforme | sim | sim |
| SEO/redirects | sim | sim | não | sim | sim | básico | não | sim | básico |

---

## 22. Indicadores do planejamento

### Entrega

- fases/gates concluídos;
- tickets bloqueados e idade;
- taxa de checks verdes;
- falhas escapadas;
- tempo de rollback.

### Conteúdo

- itens novos cadastrados/aprovados/publicados;
- registros sem fonte/owner;
- imagens sem origem/ALT;
- relações órfãs;
- páginas incompletas;
- importações do conteúdo atual — meta zero.

### Qualidade

- vulnerabilidades abertas;
- cobertura de contratos/RLS;
- erros por rota/versão;
- acessibilidade;
- Core Web Vitals;
- busca sem resultado.

### Operação

- publicação e fila com falha;
- leads pendentes;
- backup/restore;
- alertas sem owner;
- incidentes e tempo de resposta.

---

## 23. Riscos do planejamento

| Risco | Impacto | Resposta |
|---|---|---|
| Desenvolver sem Git oficial | perda de rastreabilidade | resolver em F0/G0 |
| Cadastrar antes do schema estabilizar | retrabalho e inconsistência | bloquear trilha C até G3/G4 |
| Copiar conteúdo atual por velocidade | repetir erros | política, banco vazio e testes |
| Volume de recadastro | atraso | lotes priorizados, owners e métricas; sem importação inicial |
| Aprovação técnica lenta | bloqueio editorial | agenda de revisão e SLA interno |
| Painel com campos sem consumidor | inoperância | `consumer_id` e CI |
| Duas fontes editoriais | divergência | cutover e retirada em F9 |
| Cache/Service Worker antigo | assets/conteúdo incorretos | versionamento, purge e smoke |
| RLS incorreta | vazamento/escrita indevida | default-deny e testes negativos |
| Imagens erradas | dano comercial/técnico | origem, conferência visual e dupla revisão |
| Go-live incompleto | SEO/conversão prejudicados | Gate G8 e rollback integral |

---

## 24. Definition of Ready

Um ticket pode começar quando possui:

- resultado e usuário;
- referência documental;
- escopo e fora de escopo;
- dependências disponíveis;
- `consumer_id`/rotas quando aplicável;
- contrato esperado;
- permissões;
- critérios observáveis;
- testes;
- risco e rollback;
- owner de aprovação.

---

## 25. Definition of Done

Um ticket termina quando:

- código e migrations revisados;
- checks verdes;
- segurança no backend/banco;
- estados de erro/vazio/loading tratados;
- preview e consumidor funcionam;
- auditoria/telemetria existem;
- documentação atualizada;
- evidências anexadas;
- aceite obtido;
- nenhuma regressão ou fonte atual foi introduzida.

Uma fase termina somente quando seu gate está comprovado.

---

## 26. Comandos locais de referência

### Primeira preparação ou dependências alteradas

```powershell
Set-Location -LiteralPath 'C:\Users\Comercial-GaiatecSis\OneDrive - gaiatecsistemas.com.br\Documentos\Site\website_gaiatecsistemas-main\website_gaiatecsistemas-main'
npm ci
npm run build
```

### Iniciar desenvolvimento local

```powershell
Set-Location -LiteralPath 'C:\Users\Comercial-GaiatecSis\OneDrive - gaiatecsistemas.com.br\Documentos\Site\website_gaiatecsistemas-main\website_gaiatecsistemas-main'
npm run dev -- --host 127.0.0.1
```

Endereço esperado do Vite: <http://127.0.0.1:5173>. Confirmar a URL exibida pelo terminal, pois a porta pode mudar se estiver ocupada.

No estado atual, o localhost exibe o site existente. A rota `/admin` somente ficará disponível após a Fase 3 começar a ser implementada.

### Regra de execução

Não usar `npm run deploy:production` durante o desenvolvimento. Preview/staging deve ser configurado e validado antes de qualquer produção.

---

## 27. Primeiro comando de trabalho para o Codex

Após abrir o localhost e confirmar o baseline, enviar ao Codex:

> Inicie a execução do planejamento `PLANEJAMENTO_EXECUTIVO_DESENVOLVIMENTO_REMODELAGEM_CMS_GAIATEC.md` pela Fase 0. Primeiro confirme o estado do workspace, preserve todas as alterações existentes, leia os documentos de referência obrigatórios, execute o baseline sem modificar produção e apresente as evidências do Gate G0 antes de iniciar a Fase 1. Não importe nem reutilize conteúdo, produtos, serviços ou imagens do site atual.

Esse comando autoriza apenas a Fase 0. A passagem para cada fase seguinte deve ser confirmada pelos gates e pelo escopo aprovado.
