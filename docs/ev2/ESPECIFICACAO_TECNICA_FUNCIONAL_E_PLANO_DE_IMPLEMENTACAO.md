**CMS GAIATEC**

# Especificação Técnica, Funcional e Plano de Implementação

> Evolução governada do CMS, PIM/SKU, Estúdio Visual, releases, busca, mídia, SEO, operação e IA

> **Fonte canônica no Git:** esta versão Markdown orienta o desenvolvimento; o DOCX é apenas a origem editorial.

[Índice EV2](README.md) · [Decisões e ações](DECISOES_E_ACOES_NECESSARIAS.md) · [Gate de prontidão](GATE_DE_PRONTIDAO.md)

Versão 1.0 | Data-base: 1 de setembro de 2026

_Status: especificação para aprovação técnica e planejamento; não autoriza deploy ou alteração de produção._

> **DECISÃO RECOMENDADA** Evoluir o modular monolith existente por módulos aditivos e feature flags. Preservar Supabase, RBAC/RLS, MFA, revisões, projeções públicas e fallback manual. Não reescrever o sistema.

Fontes principais: Manual do Usuário - Plano Consolidado de Melhorias do CMS GAIATEC; auditoria local/staging de 2026-09-01; contratos, migrações, Edge Functions, rotas, testes e documentação do repositório.

<a id="controle-do-documento"></a>

## Controle do documento

| **Campo**          | **Definição**                                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Objetivo           | Converter o plano consolidado em requisitos implementáveis, testáveis, rastreáveis e reversíveis.                        |
| Público            | Direção, produto, engenharia, UX/UI, conteúdo, marketing, segurança, QA, DevOps e fornecedores.                          |
| Escopo             | CMS administrativo, site público, PIM, mídia, busca, SEO, usuários, integrações, IA e operação.                          |
| Evidência          | Código local, 36 migrations, 18 Edge Functions CMS/contato, 26 padrões de rota administrativa e auditoria de staging.    |
| Não incluído       | Implementação, migration remota, deploy, alteração de dados reais ou aprovação de produção.                              |
| Regra de qualidade | Zero bloqueadores/críticos conhecidos no gate; risco residual documentado. Não se promete ausência absoluta de defeitos. |
| Preset             | compact_reference_guide; capa editorial; override landscape_wide_matrix em matrizes extensas.                            |

<a id="sumario"></a>

## Sumário

- [1. Resumo Executivo](#1-resumo-executivo)
- [2. Diagnóstico do Sistema Atual](#2-diagnostico-do-sistema-atual)
- [3. Problemas Encontrados](#3-problemas-encontrados)
- [4. Arquitetura Atual](#4-arquitetura-atual)
- [5. Arquitetura Recomendada](#5-arquitetura-recomendada)
- [6. Mapa AS-IS x TO-BE](#6-mapa-as-is-x-to-be)
- [7. Plano Consolidado Normalizado](#7-plano-consolidado-normalizado)
- [8. Matriz de Impacto](#8-matriz-de-impacto)
- [9. Especificações Funcionais](#9-especificacoes-funcionais)
- [10. Regras de Negócio](#10-regras-de-negocio)
- [11. Especificações Técnicas](#11-especificacoes-tecnicas)
- [12. Modelo de Dados](#12-modelo-de-dados)
- [13. APIs](#13-apis)
- [14. Arquitetura de Conteúdo](#14-arquitetura-de-conteudo)
- [15. UX/UI](#15-ux-ui)
- [16. Segurança](#16-seguranca)
- [17. Performance](#17-performance)
- [18. SEO](#18-seo)
- [19. Migração](#19-migracao)
- [20. Testes](#20-testes)
- [21. Critérios de Aceite](#21-criterios-de-aceite)
- [22. Matriz de Rastreabilidade](#22-matriz-de-rastreabilidade)
- [23. Plano de Implementação](#23-plano-de-implementacao)
- [24. Dependências entre Fases](#24-dependencias-entre-fases)
- [25. Riscos](#25-riscos)
- [26. Estratégia de Rollback](#26-estrategia-de-rollback)
- [27. Plano de Homologação](#27-plano-de-homologacao)
- [28. Plano de Implantação](#28-plano-de-implantacao)
- [29. Checklist de Validação Completa](#29-checklist-de-validacao-completa)
- [30. Pendências e Recomendações Futuras](#30-pendencias-e-recomendacoes-futuras)
- [Fontes locais consultadas](#fontes-locais-consultadas)

<a id="1-resumo-executivo"></a>

## 1. Resumo Executivo

O CMS atual possui uma fundação operacional madura e deve ser evoluído, não substituído. A arquitetura comprovada combina React/Vite/TypeScript no frontend, Supabase/Postgres/Storage, Edge Functions, contratos Zod, autorização server-side, RLS, MFA/AAL2, conteúdo versionado, preview tokenizado, projeções públicas e rotinas de rollback. O check local executado nesta análise concluiu com sucesso: formatação, typecheck, 75 testes Vitest, 74 testes Node das fases 1 a 11 e build de produção; permaneceram 46 avisos de lint e dois chunks acima de 600 kB.

O objetivo de EV2 é reduzir o esforço do operador e ampliar a expressividade do produto sem quebrar contratos v1. A sequência correta é: segurança de mudança e release bundle; rascunho livre e UX operacional; PIM/SKU e dados mestres; busca/qualidade; Estúdio Visual; multisite; IA assistiva; somente depois IA transacional.

> **RECOMENDAÇÃO** Aprovar EV2.0 como fase de baseline, ADRs, protótipos e métricas. Manter toda capacidade nova desligada por padrão e impedir promoção quando houver regressão, divergência v1/v2, falha de RLS/MFA, migration não reversível ou perda de integridade.

| **Prioridade** | **Frente**                                      | **Resultado esperado**                                        |
| -------------- | ----------------------------------------------- | ------------------------------------------------------------- |
| P0             | Release bundle, feature flags e observabilidade | Mudanças coerentes, reversíveis e mensuráveis.                |
| P0             | Rascunho livre, autosave e UX                   | Operador cria, fecha e recupera qualquer conteúdo incompleto. |
| P0             | PIM/SKU, atributos e taxonomias                 | Catálogo normalizado, importável, filtrável e comparável.     |
| P1             | Busca, DAM, SEO e centro de qualidade           | Menos retrabalho, erros e conteúdo incompleto.                |
| P1             | Estúdio Visual governado                        | Páginas responsivas sem HTML/CSS/JS arbitrário.               |
| P1             | IA leitura/rascunho                             | Produtividade com fonte, confiança, diff e aprovação humana.  |
| P2             | Multisite e IA transacional                     | Escala e automação após gates comprovados.                    |

<a id="2-diagnostico-do-sistema-atual"></a>

## 2. Diagnóstico do Sistema Atual

O diagnóstico usa o manual como fonte de intenção e o repositório como fonte de verdade técnica. Quando a informação depende de ambiente externo, volume real, integração ou decisão organizacional, ela é marcada como pendência de validação.

| **Dimensão** | **Evidência AS-IS**                                                                                                    | **Conclusão**                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Frontend     | 266 arquivos em src; 6 grupos/21 superfícies administrativas; lazy routes; design system administrativo compartilhado. | Base reutilizável; editores ainda densos e orientados a contrato.                |
| Backend/API  | Edge Functions por domínio; comandos POST validados; idempotência/correlationId em fluxos críticos.                    | Bom limite server-side; precisa gateway v2 e contratos gerados.                  |
| Banco        | 36 migrations; cerca de 60 tabelas incluindo RDO; 90 policies e 37 índices detectados no SQL.                          | Governança forte; PIM, release, multisite, colaboração e IA ainda não modelados. |
| Conteúdo     | Revisões, aprovação, publicação, agendamento, restauração, arquivamento e projeção pública.                            | Preservar; ampliar de item isolado para pacote atômico.                          |
| Produto      | Contrato v1 tipado com 12 áreas, modelos/variantes, até 200 especificações e cinco dimensões controladas.              | Capaz, porém não normalizado e ainda expõe JSON.                                 |
| Site builder | 13 tipos de bloco, preview e publicação governada.                                                                     | Não é canvas; falta grid, camadas, tokens, símbolos, branch e diff visual.       |
| Segurança    | RBAC/RLS, MFA/AAL2, service role server-side, no-store/noindex e logs.                                                 | Preservar e estender por site/ambiente/tool.                                     |
| Qualidade    | Check local aprovado; auditoria staging contabilizou pelo menos 223 verificações.                                      | Baseline forte; faltam métricas de tarefa e SLOs de EV2.                         |

<a id="3-problemas-encontrados"></a>

## 3. Problemas Encontrados

| **ID** | **Classe**           | **Problema/risco**                                                                                                       |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| BLQ-01 | Bloqueador potencial | Não existe release bundle atômico; uma entrega composta pode ficar parcialmente publicada.                               |
| CRI-01 | Crítico              | Multisite ainda não possui site_id/RLS; ativá-lo sem isolamento criaria risco de tenant escape.                          |
| CRI-02 | Crítico              | IA transacional não possui tool gateway, política, evals ou aprovação por plano; deve permanecer desabilitada.           |
| ALT-01 | Alto                 | Salvar rascunho ainda depende de payload completo/validável em fluxos centrais.                                          |
| ALT-02 | Alto                 | Operador é exposto a JSON, UUID, schema, slugs e identificadores em tarefas comuns.                                      |
| ALT-03 | Alto                 | Produto/modelo/variante/SKU e atributos vivem majoritariamente no payload editorial, limitando herança, unidade e busca. |
| ALT-04 | Alto                 | Campo de elemento monitorado é singular; requisito operacional exige múltiplos valores e compatibilidades N:N.           |
| ALT-05 | Alto                 | Builder não oferece edição no contexto, grid responsivo, camadas, símbolos, branch e diff visual.                        |
| MED-01 | Médio                | Mídia precisa de upload contextual, focal point, dedupe perceptual, coleções e rights expiry.                            |
| MED-02 | Médio                | Busca administrativa não é unificada e a busca técnica não opera faixas/unidades normalizadas.                           |
| MED-03 | Médio                | Não há inbox editorial, tarefas, comentários ancorados, filtros salvos ou calendário de releases.                        |
| MED-04 | Médio                | 46 avisos de lint permanecem e os chunks Excel/PDF excedem 600 kB.                                                       |
| EXT-01 | Externo              | Entrega real de e-mail, aceite DPO, CSP enforcement e autorização de produção seguem pendentes.                          |

<a id="4-arquitetura-atual"></a>

## 4. Arquitetura Atual

Fluxo principal comprovado: Interface administrativa -> cms-api.ts -> Edge Function de domínio -> RPC/SQL transacional -> tabelas editoriais/revisões -> projeção pública -> consumidores React/Cloudflare. O frontend público não deve ler payload editorial bruto.

| **Camada**   | **Componentes atuais**                                                               | **Contrato de preservação**                                      |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Admin        | React Router; páginas por domínio; AdminUI; backups locais; guard de saída.          | Não expor segredos; esconder botão nunca substitui autorização.  |
| Contratos    | cms-content.ts com Zod e consumerId versionado.                                      | Compatibilidade v1 até retirada formal e testada.                |
| Comandos     | cms-content, cms-media, cms-leads, cms-users, cms-search-admin, vocabularies.        | Validação server-side, idempotência, lockVersion, correlationId. |
| Persistência | Itens, drafts, revisions, approvals, publications, projections, media, audit, roles. | Migrations aditivas, RLS negativa e revisões imutáveis.          |
| Público      | cms-public/worker; catálogo, páginas, descoberta, blog, campanhas, busca.            | Somente projeção publicada, sanitizada e cacheável.              |
| Operação     | Cloudflare Pages, Supabase, outbox, diagnósticos, CI/CD e rollback documentado.      | Ambientes separados; nenhum deploy direto sem gate.              |

<a id="5-arquitetura-recomendada"></a>

## 5. Arquitetura Recomendada

Manter o modular monolith e introduzir fronteiras explícitas de domínio. Microserviços não são recomendados agora: a extração futura deve ocorrer somente quando volume, isolamento, equipe ou SLO justificarem o custo operacional.

| **Módulo EV2**       | **Responsabilidade**                                                               | **Integração**                                             |
| -------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Release Orchestrator | Pacotes, dependências, validações, aprovação, agenda, publicação e rollback.       | Comandos editoriais, projeções, redirects, busca e outbox. |
| PIM                  | Produto, modelo, variante, SKU, atributos, unidades, compatibilidades e qualidade. | Adaptador CmsProductContent v1 + indexador.                |
| Component Registry   | Schemas, renderers, versões, migrações, permissões e budgets.                      | Estúdio Visual e render público.                           |
| Visual Documents     | Árvore de componentes, layout, bindings, símbolos, branches e snapshots.           | Páginas, releases e quality checks.                        |
| Site Registry        | Sites, ambientes, domínios, temas, flags, idiomas e políticas.                     | RLS, roteamento, projeções e integrações.                  |
| Unified Search       | Índice editorial/público, facetas, analytics, merchandising e reindexação.         | PIM, conteúdo e comandos admin.                            |
| Operational Inbox    | Tarefas, comentários, menções, revisões, falhas e filtros salvos.                  | Workflow, release e notificações.                          |
| AI Orchestrator      | Contexto autorizado, tools, propostas, aprovações, execução, custo e evals.        | Tool gateway; nunca banco/service role direto.             |

> **PADRÃO TRANSVERSAL** Query APIs sem efeitos colaterais; Command APIs idempotentes; eventos por outbox; projeções por site/ambiente; OpenAPI/JSON Schema gerados; observabilidade com actor, site, environment, correlationId, versão, origem e resultado.

<a id="6-mapa-as-is-x-to-be"></a>

## 6. Mapa AS-IS x TO-BE

| **Elemento** | **Atual**                       | **Problema**                         | **Estado futuro**                         | **Alteração**                        |
| ------------ | ------------------------------- | ------------------------------------ | ----------------------------------------- | ------------------------------------ |
| Rascunho     | Contrato completo pode bloquear | Não permite começar vazio            | Rascunho técnico mínimo                   | Separar DraftSchema de PublishSchema |
| Produto      | Payload editorial v1            | Duplicação e baixa normalização      | PIM Produto->Modelo->Variante->SKU        | Shadow tables + adapter v1           |
| Taxonomia    | Listas independentes            | Combinações incompatíveis            | Compatibilidades N:N versionadas          | Relações e validação progressiva     |
| Mídia        | Biblioteca central funcional    | Fluxo ainda fora do contexto         | DAM contextual e reutilizável             | Picker/upload embutido + usos        |
| Páginas      | Blocos em formulário            | Distância entre intenção e resultado | Canvas governado                          | Registry, grid, layers e preview     |
| Publicação   | Por item                        | Dependências manuais                 | Release bundle coerente                   | Orquestrador + snapshot/rollback     |
| Busca        | Conteúdo e sinônimos            | Sem unidade/faixa/explicação         | Busca técnica e unificada                 | Índice normalizado e analytics       |
| SEO          | Campos por conteúdo             | Preenchimento e inconsistência       | Defaults determinísticos + quality center | Regras, preview e bloqueios por gate |
| Colaboração  | Revisão por item                | Sem tarefas/comentários/diff visual  | Inbox, branch e comentários               | Entidades colaborativas e snapshots  |
| Sites        | Um site principal               | Duplicação para novo projeto         | Multisite isolado                         | site_id, environment e RLS           |
| IA           | Ausente                         | Sem assistência operacional          | Read/draft e depois execute               | Tool gateway, policies e evals       |

<a id="7-plano-consolidado-normalizado"></a>

## 7. Plano Consolidado Normalizado

| **ID** | **Funcionalidade normalizada**                             | **Prioridade** | **Domínio**   |
| ------ | ---------------------------------------------------------- | -------------- | ------------- |
| F-001  | Rascunho livre, autosave e validação progressiva           | P0             | Fundação UX   |
| F-002  | Editor de produto orientado a tarefas                      | P0             | Catálogo      |
| F-003  | Dados mestres e taxonomias dependentes                     | P0             | PIM           |
| F-004  | Produto, modelo, variante e SKU normalizados               | P0             | PIM           |
| F-005  | Atributos técnicos, unidades e compatibilidades            | P0             | PIM           |
| F-006  | DAM contextual e biblioteca avançada                       | P1             | Mídia         |
| F-007  | Busca unificada, técnica e relações assistidas             | P1             | Busca         |
| F-008  | SEO automático e Centro de Qualidade                       | P1             | Qualidade     |
| F-009  | Release bundle e workflow de conteúdo                      | P0             | Publicação    |
| F-010  | Inbox, tarefas, comentários, histórico e diff              | P1             | Colaboração   |
| F-011  | Estúdio Visual governado                                   | P1             | Design        |
| F-012  | Fábrica de sites e multisite                               | P2             | Plataforma    |
| F-013  | Operações em massa e importação/exportação                 | P1             | Produtividade |
| F-014  | Usuários, RBAC, auditoria e segregação                     | P0             | Segurança     |
| F-015  | Copiloto IA de leitura e rascunho                          | P1             | IA            |
| F-016  | IA transacional controlada                                 | P2             | IA            |
| F-017  | Conteúdo, marketing, formulários e leads integrados        | P1             | Conteúdo      |
| F-018  | Performance, acessibilidade, observabilidade e resiliência | P0             | Transversal   |

<a id="8-matriz-de-impacto"></a>

## 8. Matriz de Impacto

| **ID** | **Melhoria**        | **FE** | **BE** | **BD** | **API** | **UX** | **SEO** | **Seg.** | **Risco** | **Depend.** |
| ------ | ------------------- | ------ | ------ | ------ | ------- | ------ | ------- | -------- | --------- | ----------- |
| F-001  | Rascunho/autosave   | A      | A      | M      | A       | A      | B       | M        | A         | F-009       |
| F-002  | Editor produto      | A      | A      | A      | A       | A      | M       | M        | A         | F-003/4/5   |
| F-003  | Dados mestres       | M      | A      | A      | A       | M      | B       | A        | A         | F-014       |
| F-004  | PIM/SKU             | A      | A      | C      | A       | A      | A       | A        | C         | F-003/9     |
| F-005  | Atributos/unidades  | A      | A      | C      | A       | A      | M       | M        | C         | F-003/4     |
| F-006  | DAM                 | A      | A      | A      | A       | A      | M       | A        | A         | F-009/14    |
| F-007  | Busca/relações      | A      | A      | A      | A       | A      | A       | M        | A         | F-004/5     |
| F-008  | SEO/qualidade       | A      | A      | M      | A       | A      | C       | M        | A         | F-005/6/7   |
| F-009  | Release bundle      | A      | C      | C      | C       | A      | A       | C        | C         | F-014/18    |
| F-010  | Colaboração         | A      | A      | A      | A       | A      | B       | M        | A         | F-009/14    |
| F-011  | Estúdio visual      | C      | A      | A      | A       | C      | A       | A        | C         | F-008/9     |
| F-012  | Multisite           | A      | C      | C      | C       | A      | A       | C        | C         | F-009/14    |
| F-013  | Operação em massa   | A      | A      | A      | A       | A      | M       | A        | A         | F-003/4/9   |
| F-014  | RBAC/auditoria      | M      | C      | A      | A       | M      | B       | C        | C         | Baseline    |
| F-015  | IA read/draft       | A      | A      | A      | C       | A      | M       | C        | C         | F-014/18    |
| F-016  | IA execute          | A      | C      | A      | C       | A      | A       | C        | C         | F-009/15    |
| F-017  | Conteúdo/marketing  | A      | A      | A      | A       | A      | A       | A        | A         | F-009       |
| F-018  | NFR/observabilidade | A      | A      | M      | M       | A      | M       | C        | A         | Todas       |

Legenda: B = Baixo; M = Médio; A = Alto; C = Crítico. 'Crítico' indica necessidade de gate reforçado, não uma falha existente.

<a id="9-especificacoes-funcionais"></a>

## 9. Especificações Funcionais

As fichas abaixo são a unidade de implementação. Campos específicos de produto estão detalhados na seção 12; APIs e dados, nas seções 12 e 13.

<a id="f-001-rascunho-livre-autosave-e-validacao-progressiva"></a>

### F-001 - Rascunho livre, autosave e validação progressiva

| **Campo**             | **Especificação**                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Todos os editores / P0 (Fundação UX)                                                                                                                                                  |
| Objetivo              | Eliminar perda de trabalho e permitir iniciar conteúdo sem preencher campos editoriais.                                                                                               |
| Usuários              | Editor, marketing, técnico e administrador                                                                                                                                            |
| Pré-condições         | Sessão válida e permissão *.create; feature flag cms_draft_v2.                                                                                                                        |
| Fluxos alternativos   | Offline mantém fila local criptograficamente não sensível; reconexão compara versões e solicita resolução se houver conflito.                                                         |
| Exceções              | 401/403 bloqueiam; 409 abre diff; 413 mantém textos e rejeita apenas anexo; 5xx preserva fila e correlationId.                                                                        |
| Ações                 | Novo, Salvar rascunho, Pré-visualizar, Descartar alterações locais, Restaurar, Enviar para revisão.                                                                                   |
| Implementação técnica | DraftSchema permissivo separado do ReviewSchema/PublishSchema; patch por campo; autosave 1,5-3 s; optimistic concurrency; localStorage namespaced somente para conteúdo não sensível. |

<a id="fluxo-principal"></a>

#### Fluxo principal

1. Novo cria registro mínimo com título temporário e indexação desligada.

1. Autosave envia patch debounced com expectedLockVersion.

1. Indicador mostra salvando, salvo, offline, conflito ou erro recuperável.

1. Reabertura restaura o último rascunho server-side; backup local é fallback.

1. Revisão/publicação executa checklist progressivo e leva o foco ao primeiro bloqueio.

> **CRITÉRIO DE ACEITE** DADO QUE o usuário tenha permissão de criação, QUANDO clicar em Novo, não preencher nada, fechar e reabrir, ENTÃO o rascunho deverá existir, permanecer privado e recuperar o ponto de edição.

<a id="f-002-editor-de-produto-orientado-a-tarefas"></a>

### F-002 - Editor de produto orientado a tarefas

| **Campo**             | **Especificação**                                                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Catálogo > Produtos / P0 (Catálogo)                                                                                              |
| Objetivo              | Substituir a exposição do contrato por oito etapas cognitivamente simples.                                                       |
| Usuários              | Editor de catálogo, especialista técnico e revisor                                                                               |
| Pré-condições         | F-001 e dados mestres mínimos ativos.                                                                                            |
| Fluxos alternativos   | Duplicar semelhante, iniciar por template, colar grade, importar datasheet ou retomar do último campo.                           |
| Exceções              | Duplicidade gera aviso com comparação; etapa inaplicável pode ser ocultada; campo automático mostra origem e override permitido. |
| Ações                 | Criar, duplicar, salvar, pré-visualizar, validar, enviar, arquivar e restaurar.                                                  |
| Implementação técnica | Novo form state tipado; nenhum textarea JSON no modo comum; componentes PIM reutilizáveis; adapter v1 durante migração.          |

<a id="fluxo-principal-2"></a>

#### Fluxo principal

1. Identificar produto e selecionar/cadastrar fabricante, marca e linha.

1. Classificar por listas dependentes.

1. Preencher apresentação comercial com contadores e exemplos.

1. Preencher especificações geradas pelo attribute set.

1. Enviar/escolher mídia e documentos no contexto.

1. Adicionar modelos/variantes somente quando aplicável.

1. Confirmar relações e termos sugeridos.

1. Revisar preview, pendências e enviar ao workflow.

> **CRITÉRIO DE ACEITE** DADO QUE existam dados mestres, QUANDO o operador cadastrar um produto simples, ENTÃO deverá concluir o rascunho sem informar UUID, JSON, slug ou schema.

<a id="f-003-dados-mestres-e-taxonomias-dependentes"></a>

### F-003 - Dados mestres e taxonomias dependentes

| **Campo**             | **Especificação**                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Catálogo > Dados mestres / P0 (PIM)                                                                                       |
| Objetivo              | Garantir uma única fonte para fabricante, marca, linha, categoria, grandeza, tecnologia, instalação e elementos.          |
| Usuários              | Data steward, técnico e administrador                                                                                     |
| Pré-condições         | Owner de taxonomia nomeado e vocabulário piloto aprovado.                                                                 |
| Fluxos alternativos   | Cadastro rápido em drawer retorna ao produto sem perder estado.                                                           |
| Exceções              | Duplicidade por nome/alias/domínio bloqueia publicação; inatividade impede nova seleção, não quebra registros existentes. |
| Ações                 | Criar, editar, relacionar, mesclar duplicados, arquivar e restaurar.                                                      |
| Implementação técnica | Entidades próprias, normalized_name, aliases, unique parcial por site, join tables com effective dates e versão.          |

<a id="fluxo-principal-3"></a>

#### Fluxo principal

1. Pesquisar antes de criar.

1. Cadastrar entidade com nome normalizado, aliases, origem, status e relações.

1. Definir compatibilidades N:N e ordem de dependência.

1. Usar seleção pesquisável no produto.

1. Arquivar sem apagar referências históricas.

> **CRITÉRIO DE ACEITE** DADO QUE uma categoria tenha tecnologias compatíveis, QUANDO for selecionada, ENTÃO apenas opções válidas serão oferecidas e incompatibilidades existentes serão explicadas antes da remoção.

<a id="f-004-produto-modelo-variante-e-sku-normalizados"></a>

### F-004 - Produto, modelo, variante e SKU normalizados

| **Campo**             | **Especificação**                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | PIM / P0 (PIM)                                                                                                   |
| Objetivo              | Eliminar duplicidade e criar identidade comercial/técnica estável.                                               |
| Usuários              | Catálogo, comercial, técnico e integração                                                                        |
| Pré-condições         | F-003; decisão sobre ERP/MPN/GTIN/NCM; regra SKU aprovada.                                                       |
| Fluxos alternativos   | Produto de modelo único não exige variante; grade aceita colar/importar e dry-run.                               |
| Exceções              | SKU/MPN duplicado bloqueia; SKU nunca é reutilizado; mudança material cria nova identidade e preserva histórico. |
| Ações                 | Adicionar, duplicar, reordenar, arquivar, definir principal, gerar SKU, exportar e comparar.                     |
| Implementação técnica | Tabelas normalizadas; unique(site_id, sku); external identifiers separados; adapter para CmsProductContent v1.   |

<a id="fluxo-principal-4"></a>

#### Fluxo principal

1. Criar produto núcleo.

1. Adicionar um ou mais modelos e definir principal.

1. Definir eixos de variante quando houver.

1. Gerar combinações e validar conflitos.

1. Gerar SKU pelo serviço governado.

1. Publicar projeção v1 compatível e índice técnico.

> **CRITÉRIO DE ACEITE** DADO QUE uma variante válida exista, QUANDO o serviço gerar o SKU, ENTÃO o identificador deverá ser único, imutável, auditado e distinto de MPN/GTIN.

<a id="f-005-atributos-tecnicos-unidades-e-compatibilidades"></a>

### F-005 - Atributos técnicos, unidades e compatibilidades

| **Campo**             | **Especificação**                                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | PIM > Especificações / P0 (PIM)                                                                                                   |
| Objetivo              | Transformar especificações em dados tipados, filtráveis, comparáveis e reutilizáveis.                                             |
| Usuários              | Especialista técnico e catálogo                                                                                                   |
| Pré-condições         | Categorias piloto e unidades canônicas aprovadas.                                                                                 |
| Fluxos alternativos   | Especificação personalizada fica não filtrável até aprovação do data steward.                                                     |
| Exceções              | Faixa invertida, unidade incompatível, enum inválido e relação incoerente bloqueiam revisão/publicação, não o rascunho.           |
| Ações                 | Preencher, converter, herdar, sobrescrever, homologar, versionar e comparar.                                                      |
| Implementação técnica | attribute_definitions/sets/values/units/conversions; decimal canônico; constraints por tipo; índice por definition+numeric range. |

<a id="fluxo-principal-5"></a>

#### Fluxo principal

1. Selecionar classificação e carregar attribute set versionado.

1. Informar valores em controles adequados ao tipo.

1. Converter unidade para valor canônico.

1. Definir escopo produto/modelo/variante e herança.

1. Executar validação técnica e homologação.

1. Materializar facetas apenas com valores homologados.

> **CRITÉRIO DE ACEITE** DADO QUE uma definição use m3/h, QUANDO o cliente filtrar em L/s, ENTÃO a busca deverá converter unidades e retornar somente faixas que intersectem o valor solicitado.

<a id="f-006-dam-contextual-e-biblioteca-avancada"></a>

### F-006 - DAM contextual e biblioteca avançada

| **Campo**             | **Especificação**                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Mídia / P1 (Mídia)                                                                                                      |
| Objetivo              | Enviar, localizar, reutilizar e substituir ativos sem duplicação nem perda de direitos.                                 |
| Usuários              | Editor, marketing, designer e administrador                                                                             |
| Pré-condições         | Storage privado, upload assinado e política de direitos existentes.                                                     |
| Fluxos alternativos   | Duplicado por hash oferece reutilizar; similaridade perceptual gera sugestão não destrutiva.                            |
| Exceções              | Ativo em uso não pode ser excluído; substituir exige preview de impacto; direitos expirados impedem publicação pública. |
| Ações                 | Upload, escolher, recortar, substituir, renomear, etiquetar, arquivar e consultar usos.                                 |
| Implementação técnica | Preservar cms_media_*; adicionar collections/tags/focal/crops/rights expiry; jobs idempotentes e GC após retenção.      |

<a id="fluxo-principal-6"></a>

#### Fluxo principal

1. Abrir seletor no campo/bloco.

1. Enviar novo ou escolher existente.

1. Validar MIME real, tamanho, hash e malware.

1. Gerar variantes, focal point e crops.

1. Registrar ALT, origem, licença, owner e expiração.

1. Vincular sem sair do editor e atualizar mapa de usos.

> **CRITÉRIO DE ACEITE** DADO QUE uma imagem esteja em uso, QUANDO o usuário tentar excluí-la, ENTÃO o CMS deverá bloquear, mostrar os usos e oferecer substituição segura.

<a id="f-007-busca-unificada-tecnica-e-relacoes-assistidas"></a>

### F-007 - Busca unificada, técnica e relações assistidas

| **Campo**             | **Especificação**                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Busca / P1 (Busca)                                                                                            |
| Objetivo              | Localizar conteúdo e produtos por intenção, atributo, faixa, unidade e contexto.                              |
| Usuários              | Todos no admin e visitantes no público                                                                        |
| Pré-condições         | F-004/F-005 e projeções indexáveis.                                                                           |
| Fluxos alternativos   | Pin/bury/redirect e sinônimos têm vigência, justificativa, owner e preview.                                   |
| Exceções              | Nunca afirmar compatibilidade sem dado homologado; admin não retorna entidades sem permissão.                 |
| Ações                 | Pesquisar, filtrar, salvar visão, fixar resultado, criar sinônimo, relacionar e reindexar.                    |
| Implementação técnica | Postgres FTS + pg_trgm e índices materializados inicialmente; engine dedicada somente após SLO/volume medido. |

<a id="fluxo-principal-7"></a>

#### Fluxo principal

1. Indexar documentos editoriais e públicos separados.

1. Oferecer command palette por permissão.

1. Aplicar facetas dinâmicas por categoria.

1. Explicar correspondência e dados ausentes.

1. Registrar zero result, refinamento e abandono.

1. Sugerir relações, mantendo confirmação humana quando não determinísticas.

> **CRITÉRIO DE ACEITE** DADO QUE um usuário busque por uma necessidade técnica, QUANDO houver dados homologados, ENTÃO resultados deverão indicar os critérios correspondentes e responder em menos de 400 ms p95 na API pública.

<a id="f-008-seo-automatico-e-centro-de-qualidade"></a>

### F-008 - SEO automático e Centro de Qualidade

| **Campo**             | **Especificação**                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Analisar > Qualidade / P1 (Qualidade)                                                                   |
| Objetivo              | Prevenir publicação com falhas de SEO, acessibilidade, links, mídia, conteúdo ou PIM.                   |
| Usuários              | Editor, SEO, técnico e designer                                                                         |
| Pré-condições         | Regras determinísticas e severidades aprovadas.                                                         |
| Fluxos alternativos   | IA sugere alternativa, mas regra determinística permanece fonte padrão.                                 |
| Exceções              | Slug pós-publicação cria 301; canonical duplicado e conteúdo indexável sem título bloqueiam publicação. |
| Ações                 | Validar, corrigir, aceitar sugestão, justificar exceção, reexecutar e exportar relatório.               |
| Implementação técnica | Quality rules registry; resultados versionados; workers incrementais; budget por template/component.    |

<a id="fluxo-principal-8"></a>

#### Fluxo principal

1. Gerar defaults de title, description, canonical, OG, sitemap e JSON-LD.

1. Executar checks por item e release.

1. Classificar erro, aviso e recomendação.

1. Levar o operador ao campo/bloco afetado.

1. Permitir exceção apenas com permissão, justificativa e expiração.

1. Registrar resultado no release.

> **CRITÉRIO DE ACEITE** DADO QUE uma página publicada altere o slug, QUANDO a mudança for aprovada, ENTÃO o sistema deverá criar 301, atualizar canonical/sitemap e validar ausência de cadeia de redirects.

<a id="f-009-release-bundle-e-workflow-de-conteudo"></a>

### F-009 - Release bundle e workflow de conteúdo

| **Campo**             | **Especificação**                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Publicar / P0 (Publicação)                                                                                       |
| Objetivo              | Publicar páginas, produtos, menus, mídia, formulários, SEO e redirects como conjunto coerente.                   |
| Usuários              | Editor, revisor, aprovador e release manager                                                                     |
| Pré-condições         | Estados editoriais e permissões aprovados; outbox/observabilidade disponíveis.                                   |
| Fluxos alternativos   | Falha parcial não confirma release; compensação restaura projeções e outbox.                                     |
| Exceções              | Conflito, dependência ausente, regra crítica ou aprovação expirada bloqueia. Nenhum item avança silenciosamente. |
| Ações                 | Criar, adicionar, validar, revisar, aprovar, agendar, publicar, cancelar e reverter.                             |
| Implementação técnica | release_packages/items/validations/approvals; state machine; idempotency; correlation; snapshot materializado.   |

<a id="fluxo-principal-9"></a>

#### Fluxo principal

1. Criar pacote em rascunho.

1. Adicionar itens e descobrir dependências.

1. Congelar versões e executar validações.

1. Exibir diff de campos, relações e visual.

1. Coletar aprovações segregadas e MFA quando aplicável.

1. Agendar/publicar transação lógica; atualizar projeções e eventos.

1. Verificar consumidores e registrar snapshot de rollback.

> **CRITÉRIO DE ACEITE** DADO QUE um release contenha página e menu, QUANDO a página falhar no gate, ENTÃO nenhum item deverá ser exposto publicamente e o estado anterior deverá permanecer íntegro.

<a id="f-010-inbox-tarefas-comentarios-historico-e-diff"></a>

### F-010 - Inbox, tarefas, comentários, histórico e diff

| **Campo**             | **Especificação**                                                                      |
| --------------------- | -------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Meu trabalho / P1 (Colaboração)                                                        |
| Objetivo              | Centralizar pendências e colaboração no contexto da revisão exata.                     |
| Usuários              | Todos os papéis editoriais                                                             |
| Pré-condições         | Workflow/release e identidades ativos.                                                 |
| Fluxos alternativos   | Menção notifica por canal configurado; falha externa permanece visível na inbox.       |
| Exceções              | Comentário não é autorização; edição concorrente usa lock otimista por bloco/item.     |
| Ações                 | Comentar, mencionar, atribuir, resolver, reabrir, comparar, restaurar e salvar filtro. |
| Implementação técnica | tasks/comments/mentions/saved_views; anchors estáveis; eventos; retenção/auditoria.    |

<a id="fluxo-principal-10"></a>

#### Fluxo principal

1. Gerar tarefa a partir de revisão, comentário, falha ou prazo.

1. Ancorar comentário em campo/bloco/revisionId.

1. Atribuir responsável e SLA.

1. Resolver ou reabrir com trilha.

1. Comparar versões e navegar para o alvo.

1. Filtrar/salvar visão e marcar favoritos/recente.

> **CRITÉRIO DE ACEITE** DADO QUE um revisor comente um bloco, QUANDO o editor abrir a tarefa, ENTÃO o CMS deverá abrir a revisão e selecionar o bloco exato.

<a id="f-011-estudio-visual-governado"></a>

### F-011 - Estúdio Visual governado

| **Campo**             | **Especificação**                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Módulo / prioridade   | Design / P1 (Design)                                                                                                     |
| Objetivo              | Criar páginas responsivas no contexto visual mantendo design system, acessibilidade e performance.                       |
| Usuários              | Editor no Modo Guiado e designer autorizado                                                                              |
| Pré-condições         | F-009, component registry, 20 componentes MVP e design tokens aprovados.                                                 |
| Fluxos alternativos   | Modo Designer habilita spans, tokens, símbolos e variantes dentro de ranges; Modo Guiado mantém presets.                 |
| Exceções              | Sem HTML/CSS/JS arbitrário; componente incompatível exige migração; overflow/a11y crítico bloqueia revisão.              |
| Ações                 | Inserir, mover, redimensionar, ocultar, agrupar, duplicar, salvar símbolo, undo/redo e branch.                           |
| Implementação técnica | VisualDocument versionado; renderer compartilhado; DnD acessível; snapshots desktop/tablet/mobile; component migrations. |

<a id="fluxo-principal-11"></a>

#### Fluxo principal

1. Criar página em branco/template/duplicação segura.

1. Inserir componente no canvas.

1. Editar conteúdo e propriedades tipadas.

1. Organizar camadas e grid 12/8/4.

1. Pré-visualizar breakpoints e executar checks.

1. Criar branch, comparar e submeter por release.

> **CRITÉRIO DE ACEITE** DADO QUE um editor use Modo Guiado, QUANDO montar uma página, ENTÃO o resultado deverá permanecer válido nos três breakpoints e não aceitar propriedades fora do schema.

<a id="f-012-fabrica-de-sites-e-multisite"></a>

### F-012 - Fábrica de sites e multisite

| **Campo**             | **Especificação**                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Administrar > Sites / P2 (Plataforma)                                                                |
| Objetivo              | Criar novos sites/ambientes sem duplicar código nem misturar dados.                                  |
| Usuários              | Super admin, designer e release manager                                                              |
| Pré-condições         | site_id e RLS negativas; F-009/F-011 estáveis; domínios e temas modelados.                           |
| Fluxos alternativos   | Duplicar estrutura sem dados sensíveis; compartilhar recurso apenas de forma explícita e versionada. |
| Exceções              | Nenhuma query sem site_id; domínio duplicado bloqueia; teste de tenant escape é gate crítico.        |
| Ações                 | Criar site, ambiente, domínio, tema, clonar estrutura, suspender e arquivar.                         |
| Implementação técnica | cms_sites/environments/domains/themes/tokens; RLS por site+environment; keys e caches separados.     |

<a id="fluxo-principal-12"></a>

#### Fluxo principal

1. Definir organização, propósito, idioma, timezone e responsáveis.

1. Criar development/staging/production isolados.

1. Selecionar tema, componentes, conteúdo e políticas.

1. Montar navegação/páginas essenciais.

1. Conectar integrações em sandbox.

1. Executar checklist e release inicial para staging.

1. Solicitar domínio/produção somente após homologação.

> **CRITÉRIO DE ACEITE** DADO QUE existam dois sites, QUANDO um usuário do site A consultar qualquer API, ENTÃO nenhum registro exclusivo do site B poderá ser inferido ou retornado.

<a id="f-013-operacoes-em-massa-e-importacao-exportacao"></a>

### F-013 - Operações em massa e importação/exportação

| **Campo**             | **Especificação**                                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Listagens e PIM / P1 (Produtividade)                                                                        |
| Objetivo              | Reduzir trabalho repetitivo sem permitir mudanças parciais ou silenciosas.                                  |
| Usuários              | Catálogo, marketing e administradores autorizados                                                           |
| Pré-condições         | Commands idempotentes, dry-run e permissões por ação.                                                       |
| Fluxos alternativos   | Exportação respeita visibilidade e LGPD; alterações destrutivas exigem confirmação dedicada.                |
| Exceções              | Falha de validação cria zero writes; lote atômico ou estratégia explicitamente parcial com status por item. |
| Ações                 | Importar, validar, publicar, despublicar, classificar, atribuir, arquivar e exportar.                       |
| Implementação técnica | job/receipt tables; chunking; retry; dead-letter; limite atual 500 itens/5 MB revisável por benchmark.      |

<a id="fluxo-principal-13"></a>

#### Fluxo principal

1. Selecionar itens ou enviar arquivo.

1. Validar formato, tamanho, linhas, permissões e dependências.

1. Exibir dry-run com mudanças/erros por item/campo.

1. Confirmar escopo e executar por lote idempotente.

1. Produzir recibo, correlationId e relatório de falhas.

1. Permitir retry apenas dos itens elegíveis.

> **CRITÉRIO DE ACEITE** DADO QUE um lote tenha erros, QUANDO o dry-run for executado, ENTÃO nenhum registro será criado e cada erro indicará linha, campo e correção.

<a id="f-014-usuarios-rbac-auditoria-e-segregacao"></a>

### F-014 - Usuários, RBAC, auditoria e segregação

| **Campo**             | **Especificação**                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Administração / P0 (Segurança)                                                               |
| Objetivo              | Garantir menor privilégio, segregação de funções e rastreabilidade de todas as mutações.     |
| Usuários              | Super admin, auditor e suporte autorizado                                                    |
| Pré-condições         | Modelo atual RBAC/RLS/MFA preservado.                                                        |
| Fluxos alternativos   | Papéis por site/ambiente e delegação temporária com expiração.                               |
| Exceções              | 401 sem sessão; 403 sem permissão; 412 sem AAL2; 409 para conflito/segregação.               |
| Ações                 | Convidar, reenviar, alterar papéis, suspender, reativar, revogar sessão e consultar log.     |
| Implementação técnica | Preservar cms_roles/permissions/user_roles/audit; adicionar scopes e policy tests negativos. |

<a id="fluxo-principal-14"></a>

#### Fluxo principal

1. Convidar e atribuir papéis dentro do escopo.

1. Resolver permissões efetivas no servidor.

1. Exigir AAL2 para ações críticas.

1. Bloquear autoelevação e proteção do último super admin.

1. Registrar before/after, actor, target, site, environment e correlationId.

1. Revogar sessão e responder a incidentes.

> **CRITÉRIO DE ACEITE** DADO QUE um usuário não possua permissão de publicação, QUANDO chamar a API diretamente, ENTÃO o servidor e a RLS deverão negar sem produzir efeitos.

<a id="f-015-copiloto-ia-de-leitura-e-rascunho"></a>

### F-015 - Copiloto IA de leitura e rascunho

| **Campo**             | **Especificação**                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Módulo / prioridade   | Assistente / P1 (IA)                                                                                               |
| Objetivo              | Localizar, explicar, extrair e preparar rascunhos com baixo risco.                                                 |
| Usuários              | Usuários autenticados conforme permissões                                                                          |
| Pré-condições         | F-014/F-018; política de dados; provider adapter; golden evals.                                                    |
| Fluxos alternativos   | Indisponibilidade do provedor mantém o CMS manual totalmente funcional.                                            |
| Exceções              | Conteúdo recuperado é dado não confiável; sem service role; sem publicar/excluir/exportar/alterar acesso.          |
| Ações                 | Perguntar, localizar, explicar, extrair, sugerir, criar rascunho e gerar diff.                                     |
| Implementação técnica | Responses/tool calling por adapter; token delegado curto; tool allowlist; PII redaction; audit/evals/cost budgets. |

<a id="fluxo-principal-15"></a>

#### Fluxo principal

1. Mostrar site, ambiente, modo e permissões.

1. Interpretar pedido e pedir esclarecimento quando materialmente ambíguo.

1. Recuperar somente dados autorizados.

1. Apresentar plano e itens afetados.

1. Executar tools read/draft em namespace isolado.

1. Mostrar fontes, confiança, diff e quality report.

1. Permitir aceitar/rejeitar/editar por grupo.

> **CRITÉRIO DE ACEITE** DADO QUE um datasheet seja autorizado, QUANDO a IA extrair campos, ENTÃO cada valor técnico deverá incluir documento, versão, página/trecho e confiança; baixa confiança ficará pendente.

<a id="f-016-ia-transacional-controlada"></a>

### F-016 - IA transacional controlada

| **Campo**             | **Especificação**                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Assistente > Execução / P2 (IA)                                                                                           |
| Objetivo              | Executar comandos oficiais com aprovação proporcional ao risco e reversibilidade comprovada.                              |
| Usuários              | Papéis explicitamente autorizados                                                                                         |
| Pré-condições         | F-009/F-015 aprovadas; 100% de permission evals; rollback exercitado.                                                     |
| Fluxos alternativos   | Usuário pode retirar itens ou limitar a preview; aprovação expira ao mudar o plano.                                       |
| Exceções              | Mudança de papéis fica fora do MVP; prompt injection, alvo ambíguo, policy denial ou divergência interrompem execução.    |
| Ações                 | Aplicar patch, submeter, agendar, publicar, reverter e operar lote conforme policy.                                       |
| Implementação técnica | Tool gateway server-side; JSON Schema estrito; approval records; idempotency; policy decision log; compensating commands. |

<a id="fluxo-principal-16"></a>

#### Fluxo principal

1. Gerar plano estruturado e dry-run.

1. Classificar tools em read/draft/workflow/critical.

1. Solicitar aprovação por escopo e MFA quando aplicável.

1. Executar comandos idempotentes no tool gateway.

1. Verificar estado resultante e consumidores.

1. Exibir correlationIds e opção de reversão.

> **CRITÉRIO DE ACEITE** DADO QUE o plano seja alterado após aprovação, QUANDO a IA tentar executar, ENTÃO a autorização anterior deverá ser invalidada e nova aprovação será exigida.

> **ESTADO EV2.14** A fundação da F-016 foi implementada como candidato local exclusivamente
> sintético: gateway separado, cinco tools fechadas, dry-run, hash/versão, segregação, MFA,
> idempotência, transação atômica e compensação monotônica. G14, migration/função em staging e
> qualquer integração com dados reais permanecem pendentes.

<a id="f-017-conteudo-marketing-formularios-e-leads-integrados"></a>

### F-017 - Conteúdo, marketing, formulários e leads integrados

| **Campo**             | **Especificação**                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Conteúdo e Marketing / P1 (Conteúdo)                                                                     |
| Objetivo              | Padronizar páginas, posts, serviços, campanhas, formulários e leads no mesmo modelo operacional.         |
| Usuários              | Editor, marketing, comercial e DPO                                                                       |
| Pré-condições         | Workflow e contratos atuais preservados.                                                                 |
| Fluxos alternativos   | Campanha sem término é válida quando explicitamente aberta; formulário cria versão imutável ao publicar. |
| Exceções              | Exportação/anonimização exige MFA, justificativa e auditoria; falha de e-mail não perde o lead.          |
| Ações                 | Criar, duplicar, agendar, publicar, expirar, atribuir, exportar e anonimizar.                            |
| Implementação técnica | Reutilizar cms-content/cms-leads; integrar release, quality center, templates e inbox.                   |

<a id="fluxo-principal-17"></a>

#### Fluxo principal

1. Criar rascunho do tipo escolhido.

1. Preencher conteúdo essencial e relações.

1. Configurar janela, formulário/consentimento e posicionamentos quando aplicável.

1. Pré-visualizar e validar.

1. Publicar por release.

1. Capturar/atender lead com SLA, histórico e outbox.

1. Expirar, arquivar, anonimizar ou restaurar conforme política.

> **CRITÉRIO DE ACEITE** DADO QUE um lead seja capturado e o e-mail falhe, QUANDO o worker registrar a falha, ENTÃO o lead permanecerá íntegro, o evento irá para retry/dead-letter e a inbox exibirá a pendência.

<a id="f-018-performance-acessibilidade-observabilidade-e-resiliencia"></a>

### F-018 - Performance, acessibilidade, observabilidade e resiliência

| **Campo**             | **Especificação**                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Módulo / prioridade   | Transversal / P0 (Transversal)                                                                                    |
| Objetivo              | Transformar qualidade não funcional em gates mensuráveis.                                                         |
| Usuários              | Todos; engenharia/QA para diagnóstico                                                                             |
| Pré-condições         | Telemetria com privacidade e ambientes comparáveis.                                                               |
| Fluxos alternativos   | Degradação de IA não afeta operação manual; jobs usam fila/retry/dead-letter.                                     |
| Exceções              | Nenhum dado pessoal/segredo em log; alertas sem ação são agregados e priorizados.                                 |
| Ações                 | Medir, diagnosticar, reprocessar, pausar, reverter, escalar e documentar incidente.                               |
| Implementação técnica | Web Vitals, API latency, DB query stats, outbox lag, audit coverage, axe/Playwright, load tests e restore drills. |

<a id="fluxo-principal-18"></a>

#### Fluxo principal

1. Definir SLO/budget por superfície.

1. Instrumentar métricas, traces e logs correlacionados.

1. Executar checks automáticos e testes reais de usuário.

1. Alertar por impacto e runbook.

1. Canary e rollback por flag/artefato.

1. Revisar capacidade, dependências e vulnerabilidades continuamente.

> **CRITÉRIO DE ACEITE** DADO QUE um canary ultrapasse error budget ou viole segurança, QUANDO o alarme disparar, ENTÃO rollout deverá pausar automaticamente e o fallback anterior permanecer disponível.

<a id="10-regras-de-negocio"></a>

## 10. Regras de Negócio

| **ID** | **Domínio**    | **Regra objetiva**                                                                                 |
| ------ | -------------- | -------------------------------------------------------------------------------------------------- |
| RB-001 | Rascunho       | Criar/salvar rascunho não exige completude editorial.                                              |
| RB-002 | Rascunho       | Rascunho é privado, não indexável e ausente de APIs/sitemap públicos.                              |
| RB-003 | Rascunho       | Autosave nunca publica nem altera status de workflow.                                              |
| RB-004 | Concorrência   | Toda gravação recebe expectedLockVersion; divergência retorna 409 com diff.                        |
| RB-005 | Workflow       | Estados canônicos: draft, in_review, scheduled, published, unpublished e archived.                 |
| RB-006 | Workflow       | Salvar, submeter, aprovar e publicar são ações distintas e autorizadas.                            |
| RB-007 | Workflow       | Publicação exige contrato público completo e todas as validações críticas aprovadas.               |
| RB-008 | Release        | Release com falha crítica não expõe nenhum item novo.                                              |
| RB-009 | Release        | Aprovação é vinculada ao hash/versão do plano e expira após alteração.                             |
| RB-010 | Release        | Rollback cria nova ação auditável; nunca apaga histórico.                                          |
| RB-011 | Slug           | Slug é automático em rascunho e estável após primeira publicação.                                  |
| RB-012 | Slug           | Alterar slug publicado cria redirect 301, atualiza canonical e sitemap.                            |
| RB-013 | Dados mestres  | Entidade inativa não pode ser escolhida em novo cadastro, mas mantém referências históricas.       |
| RB-014 | Dados mestres  | Compatibilidades são N:N e versionadas; nenhuma lista dependente é hardcoded na UI.                |
| RB-015 | Produto        | Produto, modelo, variante e SKU são entidades distintas.                                           |
| RB-016 | Produto        | Variante é opcional; modelo principal deve existir para publicar quando aplicável.                 |
| RB-017 | SKU            | SKU é único por organização/site, imutável, não reutilizável e separado de MPN/GTIN/NCM.           |
| RB-018 | SKU            | Mudança material de configuração cria novo SKU e descontinua o anterior sem apagá-lo.              |
| RB-019 | Atributo       | Definição possui tipo, unidade canônica, validação, escopo e versão.                               |
| RB-020 | Atributo       | Valores herdados podem ser sobrescritos apenas no escopo permitido e com origem registrada.        |
| RB-021 | Atributo       | Somente dados técnicos homologados alimentam facetas públicas e afirmações de compatibilidade.     |
| RB-022 | Unidade        | Comparações numéricas usam valor canônico, nunca texto formatado.                                  |
| RB-023 | Mídia          | MIME real, tamanho, hash, autorização e processamento são validados server-side.                   |
| RB-024 | Mídia          | Ativo em uso não pode ser excluído; substituição exige mapa de impacto.                            |
| RB-025 | Mídia          | Direitos são registrados uma vez na origem e herdados; expiração bloqueia nova publicação.         |
| RB-026 | Busca          | Resultados admin respeitam permissões; resultados públicos usam somente projeções publicadas.      |
| RB-027 | Busca          | Sinônimo/boost/pin/bury/redirect exige justificativa, owner e vigência.                            |
| RB-028 | Busca          | Compatibilidade não pode ser inferida publicamente sem dado homologado.                            |
| RB-029 | SEO            | Título, description, canonical e JSON-LD têm defaults determinísticos revisáveis.                  |
| RB-030 | SEO            | IA apenas sugere; regra determinística permanece padrão.                                           |
| RB-031 | Visual         | Conteúdo editorial não aceita JavaScript, HTML ou CSS arbitrário.                                  |
| RB-032 | Visual         | Componente publicado deve possuir schema/renderer/version e migração compatível.                   |
| RB-033 | Visual         | Breakpoints usam herança explícita 12/8/4 e mostram overrides.                                     |
| RB-034 | Visual         | Alteração de símbolo/token global exige mapa de impacto e release próprio.                         |
| RB-035 | Multisite      | Toda entidade editorial v2 possui site_id e ambiente aplicável.                                    |
| RB-036 | Multisite      | Compartilhamento entre sites é explícito, autorizado, auditado e versionado.                       |
| RB-037 | Permissão      | Autorização é decidida no servidor e reforçada por RLS.                                            |
| RB-038 | Permissão      | Ação crítica exige permissão específica e AAL2/MFA.                                                |
| RB-039 | Permissão      | Usuário não pode autoelevar privilégio nem remover o último super admin.                           |
| RB-040 | Auditoria      | Toda mutação registra actor, target, before/after, site, ambiente, versão, origem e correlationId. |
| RB-041 | IA             | IA usa token delegado curto e nunca recebe service role.                                           |
| RB-042 | IA             | Conteúdo recuperado/documentos são dados não confiáveis, nunca instruções de sistema.              |
| RB-043 | IA             | Tool catalog é limitado por contexto, modo e permissão efetiva.                                    |
| RB-044 | IA             | Ações múltiplas exigem plano e diff antes da execução.                                             |
| RB-045 | IA             | Publicar, excluir, exportar dados pessoais ou alterar acesso exige confirmação dedicada.           |
| RB-046 | IA             | Indisponibilidade do modelo não impede o CMS manual.                                               |
| RB-047 | Importação     | Dry-run inválido produz zero gravações.                                                            |
| RB-048 | Importação     | Repetir a mesma idempotency key não duplica efeitos.                                               |
| RB-049 | Lead           | Falha de notificação não perde captura; outbox aplica retry e dead-letter.                         |
| RB-050 | LGPD           | Exportação/anonimização exige MFA, justificativa e registro imutável.                              |
| RB-051 | API            | Comando retorna correlationId, versão resultante, avisos e validações.                             |
| RB-052 | API            | Contratos v1 permanecem até ADR formal de retirada e teste de consumidores.                        |
| RB-053 | Migration      | Migration implantada nunca é editada; rollback é forward-fix/compatibilidade.                      |
| RB-054 | Migration      | Nenhuma estrutura antiga é removida antes de dual-read/write e reconciliação.                      |
| RB-055 | Segurança      | Segredos e PII não aparecem em cliente, prompt, log ou resposta técnica.                           |
| RB-056 | Segurança      | Upload e URLs externas são protegidos contra malware, SSRF, path traversal e conteúdo ativo.       |
| RB-057 | Acessibilidade | Erro não depende só de cor e move foco para resumo/campo acionável.                                |
| RB-058 | Performance    | Paginação é obrigatória em listas potencialmente grandes; queries N+1 são proibidas.               |
| RB-059 | Gate           | Bloqueador, crítico, regressão, tenant escape ou migration inconsistente impedem avanço.           |
| RB-060 | Qualidade      | Concluído significa fluxo ponta a ponta persistido, reaberto, projetado e testado.                 |

<a id="11-especificacoes-tecnicas"></a>

## 11. Especificações Técnicas

<a id="11-1-frontend"></a>

### 11.1 Frontend

- Criar módulos por domínio em src/admin, mantendo AdminUI como base e introduzindo componentes de formulário PIM, media picker, release diff, inbox e canvas.

- Usar React Router lazy, boundaries de erro, skeletons, empty states e retries acionáveis; nenhum erro técnico bruto para operador comum.

- Form state tipado por etapa; validação local espelha schema, mas servidor é autoridade. Autosave por patch com abort/retry/backoff e conflito 409.

- Command palette pesquisa conteúdo, comandos e diagnósticos conforme permissão. Filtros persistem por usuário e podem ser compartilhados quando autorizados.

- Estúdio usa renderer compartilhado e propriedades schema-driven; drag/drop possui alternativa por teclado e controle de ordem.

<a id="11-2-backend-e-servicos"></a>

### 11.2 Backend e serviços

- Manter Edge Functions como boundary; separar query de command; concentrar regras de domínio em funções/RPC reutilizadas por UI, importador e IA.

- Adicionar services: release, PIM, site registry, component registry, quality, unified search, collaboration e AI gateway.

- Implementar idempotency receipt, optimistic concurrency, validation report, policy decision e outbox em toda mutação relevante.

- Usar jobs para indexação, mídia, snapshots e integrações; retry exponencial, dead-letter e operação de reprocessamento autorizada.

<a id="11-3-contratos-e-codigos-http"></a>

### 11.3 Contratos e códigos HTTP

| **Código** | **Uso**                                | **Contrato**                         |
| ---------- | -------------------------------------- | ------------------------------------ |
| 200        | Consulta/comando idempotente concluído | data/result, warnings, correlationId |
| 201        | Novo recurso criado                    | id, version, status, links           |
| 202        | Job/release aceito                     | jobId, statusUrl, correlationId      |
| 400        | Payload/schema inválido                | fieldErrors e código estável         |
| 401        | Sessão ausente/inválida                | Sem detalhe sensível                 |
| 403        | Permissão negada                       | permissionCode seguro                |
| 409        | Conflito/duplicidade                   | currentVersion e diffRef             |
| 412        | MFA/AAL/gate requerido                 | nextAction                           |
| 422        | Regra de negócio                       | violations acionáveis                |
| 429        | Rate limit                             | retryAfter                           |
| 503        | Dependência indisponível               | preserved=true, correlationId        |

> **ENVELOPE DE COMANDO** { commandId, idempotencyKey, expectedVersion, siteId, environment, action, target, payload, reason } -> { status, result, warnings, validations, version, correlationId }

<a id="12-modelo-de-dados"></a>

## 12. Modelo de Dados

<a id="12-1-estruturas-existentes-a-preservar"></a>

### 12.1 Estruturas existentes a preservar

Preservar as famílias cms_content__, cms_publications, cms_published_projection, cms_media__, cms_roles/permissions/user_roles, cms_audit_log, cms_search__, cms_form__, cms_lead__, cms_controlled__ e projeções de produto/descoberta. O domínio RDO permanece isolado e fora das migrations EV2.

<a id="12-2-entidades-aditivas"></a>

### 12.2 Entidades aditivas

| **Domínio** | **Tabelas**                                                               | **Relações**                                        | **Constraints/índices**                                |
| ----------- | ------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------ |
| Release     | cms_release_packages/items/validations/approvals/snapshots                | package 1:N items; item -> revision                 | status, site_id, env, scheduled_at; unique package key |
| PIM         | cms_products_core/models/variants/skus                                    | product 1:N model 1:N variant; sku -> variant/model | unique site+sku; unique manufacturer+mpn condicional   |
| Atributos   | cms_attribute_sets/versions/definitions/values/units/conversions          | set N:N definition; value -> owner scope            | type checks; numeric/range indexes                     |
| Taxonomia   | cms_master_entities/aliases/compatibilities                               | entidades e relações N:N versionadas                | normalized_name; active/effective dates                |
| Visual      | cms_component_definitions/versions/symbols/page_branches/visual_snapshots | branch -> base revision; document -> components     | schema version; component key/version                  |
| Multisite   | cms_sites/site_environments/domains/themes/design_tokens                  | organization 1:N sites 1:N environments             | unique domain; RLS site/environment                    |
| Colaboração | cms_tasks/comments/mentions/saved_views                                   | anchor -> item/revision/block/field                 | assignee/status/due; anchor stability                  |
| IA          | cms_ai_sessions/messages/proposals/tool_calls/approvals/eval_runs         | session -> proposals -> tool calls                  | retention; policy result; no secrets                   |
| Busca       | cms_search_documents/index_jobs/zero_results                              | document -> source/version/site                     | GIN/tsvector/trigram; numeric facets                   |
| Qualidade   | cms_quality_rules/runs/findings/exceptions                                | run -> release/item; finding -> target              | severity/status/expiry/owner                           |

<a id="12-3-campos-principais-do-produto"></a>

### 12.3 Campos principais do produto

| **Grupo**     | **Campo**                | **Tipo**             | **Obrigatório** | **Validação**                             | **Exemplo**                  |
| ------------- | ------------------------ | -------------------- | --------------- | ----------------------------------------- | ---------------------------- |
| Identificação | name                     | string 1..180        | Revisão         | Trim; duplicidade explicada               | Medidor ultrassônico UFX     |
| Identificação | manufacturer_id          | uuid/ref             | Revisão         | Entidade ativa ou histórica               | Fabricante homologado        |
| Identificação | brand_id / line_id       | uuid/ref             | Condicional     | Compatibilidade com fabricante            | Marca / Linha                |
| Identificação | slug                     | string               | Publicação      | Automático, único e estável               | medidor-ultrassonico-ufx     |
| Comercial     | summary                  | string <=120         | Publicação      | Contador e faixa recomendada              | Resumo orientado a benefício |
| Comercial     | value_proposition        | string <=240         | Publicação      | Sem claim não homologado                  | Valor principal              |
| Comercial     | benefits/differentiators | string[]             | Publicação      | Sem vazios/duplicados                     | Instalação sem parada        |
| Classificação | category_id              | uuid/ref             | Revisão         | Lista ativa                               | Vazão                        |
| Classificação | magnitude_ids            | uuid[]               | Revisão         | Compatibilidade N:N                       | Vazão volumétrica            |
| Classificação | technology_ids           | uuid[]               | Revisão         | Compatibilidade                           | Ultrassônica                 |
| Classificação | monitored_element_ids    | uuid[]               | Revisão         | Múltiplo, 1..N                            | Água; gás                    |
| Modelo        | model/mpn/status         | entidade             | Condicional     | MPN único por fabricante quando informado | UFX-100                      |
| Variante      | axes/options             | entidade/json tipado | Condicional     | Combinação válida                         | DN50 / Modbus                |
| SKU           | sku                      | string governada     | Canal           | Único, imutável, não reutilizado          | GAI-FLW-USC-...              |
| Técnica       | attribute_values         | typed refs           | Revisão         | Tipo, unidade, faixa e escopo             | 0..100 m3/h                  |
| Mídia         | media_links              | refs ordenadas       | Publicação      | Principal, ALT, rights, ready/clean       | Imagem principal             |
| Documentos    | document_links           | refs                 | Condicional     | Idioma, revisão, direitos                 | Catálogo PDF                 |
| SEO           | seo_profile/overrides    | objeto               | Publicação      | Default + preview + canonical             | ProductGroup JSON-LD         |
| Governança    | audit/source/confidence  | metadados            | Automático      | Nunca digitado no modo comum              | actor/revision/source        |

<a id="13-apis"></a>

## 13. APIs

Rotas são propostas lógicas sobre o padrão Edge Function existente. A implementação pode manter POST por função, mas deve publicar OpenAPI/JSON Schema e ações versionadas.

| **Método** | **Rota**                        | **Finalidade**                                        | **Autorização**                          | **Compatibilidade**                          |
| ---------- | ------------------------------- | ----------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| POST       | /functions/v1/cms-content       | create/save/submit/approve/publish/restore            | Sessão; permissão por tipo; AAL2 crítica | Preservar v1; adicionar draft schema e patch |
| POST       | /functions/v1/cms-releases      | create/add/validate/approve/schedule/publish/rollback | release.* + AAL2                         | Novo; idempotente; 202 em jobs               |
| POST       | /functions/v1/cms-pim           | product/model/variant/sku commands                    | pim.*                                    | Novo; adapter gera payload v1                |
| POST       | /functions/v1/cms-attributes    | sets/definitions/values/units                         | pim.attributes.*                         | Novo; versionado                             |
| POST       | /functions/v1/cms-master-data   | fabricantes/marcas/linhas/compatibilidades            | masterdata.*; AAL2 para merge            | Evolui vocabularies                          |
| POST       | /functions/v1/cms-media         | create/finalize/list/usages/replace/delete            | media.read/upload/manage                 | Preservar; ampliar metadados/crops           |
| POST       | /functions/v1/cms-search-admin  | query/analytics/rules/reindex                         | search.*                                 | Preservar list/upsert/remove                 |
| GET        | /api/public/search              | busca pública e facetas                               | Público; rate limit                      | Somente projeção; cache                      |
| POST       | /functions/v1/cms-quality       | run/get/waive/recheck                                 | quality.*                                | Novo; waiver auditado                        |
| POST       | /functions/v1/cms-visual        | documents/branches/components/symbols/snapshots       | visual.*                                 | Novo; expectedVersion                        |
| POST       | /functions/v1/cms-sites         | sites/environments/domains/themes                     | sites.* + AAL2                           | Novo; RLS tenant                             |
| POST       | /functions/v1/cms-collaboration | tasks/comments/mentions/views                         | collaboration.*                          | Novo; anchors por revisão                    |
| POST       | /functions/v1/cms-ai            | session/plan/draft/execute/cancel                     | ai.read/draft/execute                    | Novo; tool policy e budgets                  |
| POST       | /functions/v1/cms-users         | list/invite/roles/suspend/revoke                      | users.* + AAL2                           | Preservar; adicionar scopes                  |
| POST       | /functions/v1/cms-leads         | forms/leads/export/anonymize                          | forms/leads.* + AAL2 sensível            | Preservar e integrar release                 |

<a id="13-1-exemplo-de-request-response"></a>

### 13.1 Exemplo de request/response

> **REQUEST** POST cms-pim { action: 'save_product', siteId, itemId, expectedVersion, idempotencyKey, patch, reason }

> **RESPONSE** 200 { status: 'draft', itemId, version, warnings: [], validations: [], correlationId }

<a id="14-arquitetura-de-conteudo"></a>

## 14. Arquitetura de Conteúdo

| **Conceito**     | **Modelo**                           | **Regra**                                                                        |
| ---------------- | ------------------------------------ | -------------------------------------------------------------------------------- |
| Site/ambiente    | Contexto obrigatório                 | Conteúdo e projeção são escopados; compartilhamento explícito.                   |
| Tipo de conteúdo | Schema versionado                    | Página, produto, serviço, post, campanha, formulário e entidades de descoberta.  |
| Taxonomia        | Termos reutilizáveis N:N             | Evitar segment/category/subcategory redundantes; usar dimensões com significado. |
| Produto          | Core -> modelos -> variantes -> SKUs | Conteúdo comum no nível superior; diferenças no nível correto.                   |
| Atributo         | Definição -> set -> valor            | Tipo/unidade/escopo/versão; filtros somente com dado homologado.                 |
| Relação          | Aresta tipada                        | Produto, serviço, aplicação, setor, solução, documento e acessório.              |
| Visual document  | Árvore de componentes                | Conteúdo estruturado; renderer e schema governados.                              |
| Release          | Conjunto de revisões                 | Unidade operacional de validação/publicação/rollback.                            |

<a id="15-ux-ui"></a>

## 15. UX/UI

Persona primária: operador administrativo não técnico. A navegação deve responder a tarefas: Meu trabalho, Criar, Conteúdo, Design, Publicar, Analisar e Administrar.

| **Padrão** | **Requisito**                                                                                       |
| ---------- | --------------------------------------------------------------------------------------------------- |
| Cabeçalho  | Título, descrição curta, estado, responsável, última gravação e uma ação primária.                  |
| Editor     | Etapas curtas; modo Essencial por padrão; Avançado sob demanda; preview lateral.                    |
| Campos     | Label, ajuda, exemplo, origem do valor, obrigatoriedade por gate e contador.                        |
| Feedback   | Salvando/salvo/offline/conflito; erro no campo, etapa e resumo clicável.                            |
| Ações      | Salvar rascunho, Próxima etapa, Pré-visualizar, Enviar, Publicar e Cancelar com nomes consistentes. |
| Prevenção  | Defaults privados; confirmação somente em ações caras, externas, destrutivas ou críticas.           |
| Listas     | Busca, filtros combinados, contagem, ordenação, paginação, limpar, visões salvas e ações em massa.  |
| Responsivo | Desktop/notebook como principal; tablet completo; mobile para consulta e ações essenciais.          |
| Acessível  | Teclado, foco visível, zoom 200%, contraste, landmarks, labels e anúncios de estado.                |

<a id="16-seguranca"></a>

## 16. Segurança

| **Controle** | **Especificação**                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| Identidade   | JWT validado server-side, sessão revogável, MFA/AAL2, antienumeração e rate limit.                              |
| Autorização  | RBAC por ação/tipo/site/ambiente e RLS negativa; deny by default.                                               |
| Input        | Zod/JSON Schema, limites, canonicalização, prepared statements/RPC e sanitização de rich text.                  |
| Upload       | MIME por conteúdo, extensão segura, tamanho, malware, storage privado, signed URL e bloqueio de SVG/HTML ativo. |
| Web          | CSP evolui de Report-Only após análise; CSRF/origin; XSS; SSRF; open redirect; clickjacking; CORS restrito.     |
| Segredos     | Somente server-side; rotação; nenhum prompt/log/client; escopo mínimo.                                          |
| IA           | Token delegado, allowlist, prompt-injection defense, PII redaction, policy/eval/audit e kill switch.            |
| Dados        | Classificação, retenção, backup criptografado, restore testado, LGPD e trilha imutável.                         |
| Supply chain | Lockfile, scanners, SBOM, revisão de dependência, atualização controlada e artefato assinado.                   |

<a id="17-performance"></a>

## 17. Performance

| **Superfície**   | **Meta**                                   | **Tática**                                                               |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| Admin navigation | <2 s p75                                   | Route lazy, cache de queries, skeleton, evitar rerender.                 |
| Salvar rascunho  | <800 ms p95                                | Patch pequeno, índice por item/version, sem jobs síncronos pesados.      |
| Busca admin      | <1 s p95                                   | Índice materializado, debounce, paginação e permission filter eficiente. |
| Busca pública    | <400 ms p95                                | Edge/cache, Postgres FTS/trigram, facetas pré-calculadas.                |
| Release pequeno  | <2 min p95                                 | Validação paralela segura, outbox e status incremental.                  |
| Rollback         | <5 min                                     | Snapshot anterior, flags e eventos compensatórios.                       |
| Canvas           | >=30 fps padrão                            | Virtualização de layers, memoization e renderer isolado.                 |
| Indexação        | <60 s p95                                  | Incremental por evento, retry e fila observável.                         |
| Bundles          | Eliminar chunks >600 kB no caminho inicial | Import dinâmico de Excel/PDF e budgets de CI.                            |

<a id="18-seo"></a>

## 18. SEO

- Slug/canonical únicos por site e ambiente; mudança pós-publicação cria 301 e evita cadeia/loop.

- Meta title e description derivados de regras por tipo, com preview e override autorizado; ausência crítica bloqueia publicação indexável.

- Sitemap contém apenas URLs publicadas, canônicas e permitidas. Retirada define 301, 404 ou 410 conforme regra editorial.

- Open Graph usa imagem principal aprovada e fallback por site; ALT é distinto de legenda e deve descrever função/contexto.

- JSON-LD é gerado de dados estruturados: Product/ProductGroup, Article, WebPage e Organization; campos internos nunca são projetados.

- Quality Center detecta duplicidade, canonical incorreto, noindex inconsistente, links quebrados, conteúdo insuficiente e imagem sem ALT.

<a id="19-migracao"></a>

## 19. Migração

1. Congelar commit/artefato e inventariar alterações locais legítimas; não misturar worktrees.

1. Executar backup lógico, storage inventory e restore drill antes da primeira migration.

1. Criar tabelas/colunas/índices aditivos; nenhuma remoção/rename destrutivo no primeiro ciclo.

1. Backfill em lotes idempotentes com checkpoint, métricas, relatório de conflito e limite de carga.

1. Ativar shadow read e comparar v1/v2 por amostra e por hash/projeção.

1. Ativar dual-write apenas após reconciliação; registrar divergências e bloquear avanço acima do limite zero para campos críticos.

1. Liberar UI v2 por site/usuário piloto; v1 permanece fallback.

1. Tornar v2 fonte de verdade somente no gate aprovado; manter adapter/export v1.

1. Retirar legado por ADR separada, janela de observação, backup e restore testado.

| **Objeto**          | **Transformação**                                         | **Validação**                                         |
| ------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Produto v1          | Projetar core/model/variant/SKU sem apagar payload        | Round-trip adapter v1 byte-semanticamente equivalente |
| Especificações      | Mapear definição/unidade/escopo; não inferir dado técnico | Conflitos e não mapeados em fila técnica              |
| Elemento monitorado | Singular -> join N:N                                      | Todo valor anterior vira uma relação                  |
| Fabricante/linha    | Deduplicar por nome/alias/domínio                         | Merge aprovado e referências preservadas              |
| Página              | Blocos v1 -> VisualDocument                               | Render/diff desktop/tablet/mobile                     |
| Conteúdo            | Adicionar site_id default ao site GAIATEC                 | RLS e contagens iguais; zero órfãos                   |

<a id="20-testes"></a>

## 20. Testes

| **Camada**    | **Cobertura mínima**                                                | **Momento**                |
| ------------- | ------------------------------------------------------------------- | -------------------------- |
| Unitário      | Schemas, SKU, unidades, regras, reducers, policies e quality checks | Por PR                     |
| Contrato      | UI/import/IA <-> Edge; OpenAPI; v1/v2; idempotência/conflito        | Por PR e release           |
| Integração    | Frontend -> API -> RPC -> DB -> projection/outbox                   | CI e staging               |
| RLS/segurança | Papel/site/ambiente/AAL; tenant escape; injection; upload; SSRF     | CI + pentest por marco     |
| Componente    | Estados, teclado, foco, autosave, diff, canvas e PIM                | CI visual/interação        |
| E2E           | Criar -> revisar -> release -> publicar -> buscar -> rollback       | Desktop/tablet/mobile      |
| Visual        | Snapshot por componente/template/breakpoint                         | Por mudança visual         |
| Performance   | Carga, DB plans, bundles, canvas, indexação, fila                   | Antes de canary            |
| IA eval       | Golden/adversarial/permissão/completude/fonte/custo/rollback        | Modelo/prompt/tool version |
| Operacional   | Backup/restore, dependency failure, dead-letter, canary e rollback  | Trimestral e antes go-live |
| Regressão     | 149 testes atuais + consumidores públicos + matriz de 48 cenários   | Todo gate                  |

<a id="21-criterios-de-aceite"></a>

## 21. Critérios de Aceite

Os critérios específicos de cada F-001..F-018 constam nas fichas. Critérios sistêmicos obrigatórios:

- DADO QUE o sistema v2 esteja desativado, QUANDO o artefato for implantado, ENTÃO o comportamento v1 permanecerá inalterado.

- DADO QUE uma migration falhe, QUANDO o deploy detectar a falha, ENTÃO o rollout será interrompido sem remover dados nem expor projeção inconsistente.

- DADO QUE um usuário sem autorização chame a API diretamente, QUANDO o comando chegar ao servidor, ENTÃO será negado sem efeito e auditado quando aplicável.

- DADO QUE um release seja concluído, QUANDO os consumidores forem consultados, ENTÃO admin, preview, site público, busca, sitemap e redirects refletirão a mesma versão.

- DADO QUE uma dependência externa falhe, QUANDO houver trabalho já digitado, ENTÃO o sistema informará a falha, preservará dados e oferecerá retry seguro.

- DADO QUE o gate contenha erro bloqueador/crítico, QUANDO a fase for avaliada, ENTÃO a próxima fase não poderá iniciar.

<a id="21-1-definition-of-done"></a>

### 21.1 Definition of Done

| **Verificação**                                 | **Obrigatório** |
| ----------------------------------------------- | --------------- |
| Frontend e backend integrados                   | [ ]             |
| Migrations e RLS validadas                      | [ ]             |
| Contratos/API documentados                      | [ ]             |
| Estados/erros/acessibilidade concluídos         | [ ]             |
| Unitários/integração/E2E/regressão aprovados    | [ ]             |
| Segurança e performance dentro do budget        | [ ]             |
| Métricas e alertas ativos                       | [ ]             |
| Runbook e rollback testados                     | [ ]             |
| Critérios de aceite atendidos                   | [ ]             |
| Nenhuma regressão conhecida bloqueadora/crítica | [ ]             |

<a id="22-matriz-de-rastreabilidade"></a>

## 22. Matriz de Rastreabilidade

| **Req.** | **Funcionalidade**                                         | **Implementação**            | **Teste**               | **Aceite**        | **Status**                    |
| -------- | ---------------------------------------------------------- | ---------------------------- | ----------------------- | ----------------- | ----------------------------- |
| F-001    | Rascunho livre, autosave e validação progressiva           | Draft schemas/autosave       | T-001 unit/contract/E2E | Critério na ficha | Implementado; G2 aprovado     |
| F-002    | Editor de produto orientado a tarefas                      | Editor PIM                   | T-002 unit/contract/E2E | Critério na ficha | Implementado; G4 aprovado     |
| F-003    | Dados mestres e taxonomias dependentes                     | Master data                  | T-003 unit/contract/E2E | Critério na ficha | Implementado; G3 aprovado     |
| F-004    | Produto, modelo, variante e SKU normalizados               | PIM entities/SKU             | T-004 unit/contract/E2E | Critério na ficha | Implementado; G4 aprovado     |
| F-005    | Atributos técnicos, unidades e compatibilidades            | Attributes/units             | T-005 unit/contract/E2E | Critério na ficha | Implementado; G4 aprovado     |
| F-006    | DAM contextual e biblioteca avançada                       | Media picker/DAM             | T-006 unit/contract/E2E | Critério na ficha | Implementado; G5 aprovado     |
| F-007    | Busca unificada, técnica e relações assistidas             | Search index/facets          | T-007 unit/contract/E2E | Critério na ficha | Implementado; G6 aprovado     |
| F-008    | SEO automático e Centro de Qualidade                       | Quality rules                | T-008 unit/contract/E2E | Critério na ficha | Implementado; G6 aprovado     |
| F-009    | Release bundle e workflow de conteúdo                      | Release orchestrator         | T-009 unit/contract/E2E | Critério na ficha | Implementado; G7 aprovado     |
| F-010    | Inbox, tarefas, comentários, histórico e diff              | Collaboration                | T-010 unit/contract/E2E | Critério na ficha | Implementado; G7 aprovado     |
| F-011    | Estúdio Visual governado                                   | Visual documents             | T-011 unit/contract/E2E | Critério na ficha | Implementado; G9 aprovado     |
| F-012    | Fábrica de sites e multisite                               | Site registry/RLS            | T-012 unit/contract/E2E | Critério na ficha | Piloto sintético; G9 aprovado |
| F-013    | Operações em massa e importação/exportação                 | Bulk jobs                    | T-013 unit/contract/E2E | Critério na ficha | Implementado; G7 aprovado     |
| F-014    | Usuários, RBAC, auditoria e segregação                     | Scoped RBAC/audit            | T-014 unit/contract/E2E | Critério na ficha | Implementado; G8 aprovado     |
| F-015    | Copiloto IA de leitura e rascunho                          | AI gateway read/draft        | T-015 unit/contract/E2E | Critério na ficha | Implementado; G10 aprovado    |
| F-016    | IA transacional controlada                                 | AI execute/approvals         | T-016 unit/contract/E2E | Critério na ficha | Candidato local; G14 pendente |
| F-017    | Conteúdo, marketing, formulários e leads integrados        | Integrated content workflows | T-017 unit/contract/E2E | Critério na ficha | Candidato local; G11 pendente |
| F-018    | Performance, acessibilidade, observabilidade e resiliência | NFR platform                 | T-018 unit/contract/E2E | Critério na ficha | Candidato local; G11 pendente |

<a id="23-plano-de-implementacao"></a>

## 23. Plano de Implementação

<a id="fase-0-diagnostico-e-baseline"></a>

### Fase 0 - Diagnóstico e baseline

| **Item**               | **Definição**                                               |
| ---------------------- | ----------------------------------------------------------- |
| Objetivo               | Congelar evidência e decisões                               |
| Escopo/funcionalidades | Inventário, métricas, ADRs, threat model, pilotos e backups |
| Dependências           | Nenhuma                                                     |
| Arquivos/módulos       | docs, scripts, observability                                |
| Banco de dados         | Sem alteração estrutural                                    |
| APIs                   | Queries de inventário                                       |
| Riscos                 | Baseline incompleto                                         |
| Procedimento           | Medir 5-8 tarefas; escolher 20-50 produtos; validar restore |
| Testes                 | check atual, E2E baseline, restore drill                    |
| Critério para avançar  | G0: evidências/owners/SLOs aprovados                        |
| Rollback               | Não aplicável; preservar artefato anterior                  |

<a id="fase-1-fundacao-arquitetural"></a>

### Fase 1 - Fundação arquitetural

| **Item**               | **Definição**                                                   |
| ---------------------- | --------------------------------------------------------------- |
| Objetivo               | Criar segurança de mudança                                      |
| Escopo/funcionalidades | Feature flags, command envelope, release skeleton, policy/audit |
| Dependências           | Fase 0                                                          |
| Arquivos/módulos       | shared contracts, Edge, migrations                              |
| Banco de dados         | Tabelas flags/release/audit aditivas                            |
| APIs                   | cms-releases v1                                                 |
| Riscos                 | Interromper workflow atual                                      |
| Procedimento           | Implementar desligado; testar v1 intacto; simular rollback      |
| Testes                 | Contrato, RLS, idempotência, regressão                          |
| Critério para avançar  | G1: release vazio e rollback comprovados                        |
| Rollback               | Desativar flags; manter tabelas                                 |

<a id="fase-2-design-system-e-ux-operacional"></a>

### Fase 2 - Design system e UX operacional

| **Item**               | **Definição**                                     |
| ---------------------- | ------------------------------------------------- |
| Objetivo               | Remover fricção transversal                       |
| Escopo/funcionalidades | F-001, mensagens, contadores, etapas, picker base |
| Dependências           | Fase 1                                            |
| Arquivos/módulos       | AdminUI, editors, draft hooks                     |
| Banco de dados         | Draft metadata/patch receipts                     |
| APIs                   | cms-content draft v2                              |
| Riscos                 | Conflito/perda de rascunho                        |
| Procedimento           | Protótipo; teste operador; canary por usuário     |
| Testes                 | Component, a11y, offline, conflict E2E            |
| Critério para avançar  | G2: 100% rascunhos vazios recuperáveis            |
| Rollback               | Flag para UI antiga; manter dados                 |

<a id="fase-3-taxonomias-e-dados-mestres"></a>

### Fase 3 - Taxonomias e dados mestres

| **Item**               | **Definição**                                     |
| ---------------------- | ------------------------------------------------- |
| Objetivo               | Normalizar fontes reutilizáveis                   |
| Escopo/funcionalidades | F-003 e elemento monitorado N:N                   |
| Dependências           | Fases 1-2                                         |
| Arquivos/módulos       | vocabularies/master data                          |
| Banco de dados         | Entidades, aliases, compatibilities               |
| APIs                   | cms-master-data                                   |
| Riscos                 | Duplicidade e mapeamento errado                   |
| Procedimento           | Backfill sem inferência; steward aprova conflitos |
| Testes                 | RLS, merge, dependent lists, migration            |
| Critério para avançar  | G3: piloto íntegro e zero órfãos                  |
| Rollback               | Parar dual-write; usar snapshots v1               |

<a id="fase-4-pim-e-conteudo-principal"></a>

### Fase 4 - PIM e conteúdo principal

| **Item**               | **Definição**                                       |
| ---------------------- | --------------------------------------------------- |
| Objetivo               | Entregar catálogo normalizado                       |
| Escopo/funcionalidades | F-002/F-004/F-005 e adapter v1                      |
| Dependências           | Fase 3                                              |
| Arquivos/módulos       | product editor, PIM services, projections           |
| Banco de dados         | Product/model/variant/SKU/attributes                |
| APIs                   | cms-pim/cms-attributes                              |
| Riscos                 | Divergência v1/v2                                   |
| Procedimento           | Shadow/backfill/dual-write; 20-50 produtos          |
| Testes                 | Round-trip, units, SKU, consumers, perf             |
| Critério para avançar  | G4: zero divergência crítica; 95% completude piloto |
| Rollback               | Flag editor; rebuild v1 das revisões                |

<a id="fase-5-midia-e-documentos"></a>

### Fase 5 - Mídia e documentos

| **Item**               | **Definição**                                        |
| ---------------------- | ---------------------------------------------------- |
| Objetivo               | Integrar DAM ao contexto                             |
| Escopo/funcionalidades | F-006                                                |
| Dependências           | Fases 1-2                                            |
| Arquivos/módulos       | AdminMedia, picker, cms-media                        |
| Banco de dados         | Collections/tags/crops/rights                        |
| APIs                   | cms-media v2                                         |
| Riscos                 | Perda de vínculo/rights                              |
| Procedimento           | Adicionar metadados; reprocessar de modo idempotente |
| Testes                 | Upload adversarial, usages, replace/rollback         |
| Critério para avançar  | G5: zero órfãos e direitos validados                 |
| Rollback               | Voltar picker; preservar assets/links                |

<a id="fase-6-busca-seo-e-qualidade"></a>

### Fase 6 - Busca, SEO e qualidade

| **Item**               | **Definição**                                                    |
| ---------------------- | ---------------------------------------------------------------- |
| Objetivo               | Melhorar descoberta e prevenção                                  |
| Escopo/funcionalidades | F-007/F-008                                                      |
| Dependências           | Fases 4-5                                                        |
| Arquivos/módulos       | search, SEO, workers, quality UI                                 |
| Banco de dados         | Search docs/jobs/quality runs                                    |
| APIs                   | search/quality APIs                                              |
| Riscos                 | Índice desatualizado                                             |
| Procedimento           | Index shadow; comparar resultados; liberar facetas por categoria |
| Testes                 | Relevance, unit ranges, SEO, a11y                                |
| Critério para avançar  | G6: SLO e qualidade atingidos                                    |
| Rollback               | Voltar índice v1 e reprocessar fila                              |

<a id="fase-7-produtividade-e-colaboracao"></a>

### Fase 7 - Produtividade e colaboração

| **Item**               | **Definição**                              |
| ---------------------- | ------------------------------------------ |
| Objetivo               | Reduzir etapas e coordenar equipes         |
| Escopo/funcionalidades | F-009/F-010/F-013                          |
| Dependências           | Fases 1-6                                  |
| Arquivos/módulos       | release, inbox, bulk                       |
| Banco de dados         | Release/tasks/comments/jobs                |
| APIs                   | release/collaboration/bulk                 |
| Riscos                 | Ação em massa incorreta                    |
| Procedimento           | Dry-run, approvals, canary interno         |
| Testes                 | Atomicity, permissions, retry, rollback    |
| Critério para avançar  | G7: zero mudança parcial e rollback <5 min |
| Rollback               | Cancelar jobs; flag; restaurar snapshot    |

<a id="fase-8-usuarios-permissoes-e-auditoria"></a>

### Fase 8 - Usuários, permissões e auditoria

| **Item**               | **Definição**                                         |
| ---------------------- | ----------------------------------------------------- |
| Objetivo               | Escopar governança EV2                                |
| Escopo/funcionalidades | F-014                                                 |
| Dependências           | Fases 1 e 7                                           |
| Arquivos/módulos       | auth, policies, admin users                           |
| Banco de dados         | Role scopes/policy decisions                          |
| APIs                   | cms-users/scopes                                      |
| Riscos                 | Lockout/elevação                                      |
| Procedimento           | Migrar papéis aditivamente; testes negativos primeiro |
| Testes                 | RLS/AAL/SoD/session/adversarial                       |
| Critério para avançar  | G8: zero bypass e auditoria 100%                      |
| Rollback               | Revogar novos scopes; papéis atuais                   |

<a id="fase-9-estudio-visual-e-multisite"></a>

### Fase 9 - Estúdio Visual e multisite

| **Item**               | **Definição**                                  |
| ---------------------- | ---------------------------------------------- |
| Objetivo               | Criar páginas/sites governados                 |
| Escopo/funcionalidades | F-011 e F-012 piloto                           |
| Dependências           | Fases 6-8                                      |
| Arquivos/módulos       | visual editor, renderer, site registry         |
| Banco de dados         | Visual/site/theme/tokens                       |
| APIs                   | visual/sites APIs                              |
| Riscos                 | Regressão pública/tenant escape                |
| Procedimento           | 20 componentes; branch; um site piloto staging |
| Testes                 | Visual snapshots, a11y, perf, tenant           |
| Critério para avançar  | G9: AA, isolamento e nenhuma quebra v1         |
| Rollback               | Flags; roteamento/renderer anteriores          |

<a id="fase-10-ia-assistiva-e-controlada"></a>

### Fase 10 - IA assistiva e controlada

| **Item**               | **Definição**                                             |
| ---------------------- | --------------------------------------------------------- |
| Objetivo               | Adicionar produtividade com segurança                     |
| Escopo/funcionalidades | F-015; F-016 na subfase sintética EV2.14                  |
| Dependências           | Fases 7-9                                                 |
| Arquivos/módulos       | AI gateway, tools, evals                                  |
| Banco de dados         | AI sessions/proposals/calls                               |
| APIs                   | cms-ai                                                    |
| Riscos                 | Injection/exfiltração/alvo errado                         |
| Procedimento           | Read -> draft -> workflow; critical só após gate separado |
| Testes                 | Golden/adversarial/permission/source/cost                 |
| Critério para avançar  | G10: 0 bypass; metas de precisão/completude               |
| Rollback               | Kill switch/tools off; operação manual                    |

<a id="fase-11-testes-sistemicos-e-homologacao"></a>

### Fase 11 - Testes sistêmicos e homologação

| **Item**               | **Definição**                                 |
| ---------------------- | --------------------------------------------- |
| Objetivo               | Validar CMS inteiro                           |
| Escopo/funcionalidades | F-017/F-018 e regressão total                 |
| Dependências           | Todas anteriores                              |
| Arquivos/módulos       | todos os módulos                              |
| Banco de dados         | Reconciliação e relatórios                    |
| APIs                   | todas                                         |
| Riscos                 | Cobertura ilusória                            |
| Procedimento           | Executar matriz menu->campo->API->DB->público |
| Testes                 | Smoke, E2E, load, pentest, restore, UAT       |
| Critério para avançar  | G11: zero P0/P1; aceite formal                |
| Rollback               | Reabrir fase responsável                      |

<a id="fase-12-implantacao-controlada"></a>

### Fase 12 - Implantação controlada

| **Item**               | **Definição**                                     |
| ---------------------- | ------------------------------------------------- |
| Objetivo               | Promover com reversibilidade                      |
| Escopo/funcionalidades | Canary, observabilidade, treinamento, go-live     |
| Dependências           | G11                                               |
| Arquivos/módulos       | CI/CD, runbooks, flags                            |
| Banco de dados         | Migrations já compatíveis                         |
| APIs                   | health/status                                     |
| Riscos                 | Incidente em produção                             |
| Procedimento           | Backup; deploy imutável; canary; ramp-up; monitor |
| Testes                 | Smoke e comparação de projeções                   |
| Critério para avançar  | G12: error budget e owners aprovam                |
| Rollback               | Flag off; artefato anterior; compensação          |

<a id="24-dependencias-entre-fases"></a>

## 24. Dependências entre Fases

Caminho crítico: Baseline -> Fundação/release -> UX/drafts -> Dados mestres -> PIM -> Busca/qualidade -> Produtividade/permissões -> Estúdio/multisite -> IA -> Regressão/homologação -> Produção.

| **Predecessor** | **Sucessor** | **Motivo do gate**                                              |
| --------------- | ------------ | --------------------------------------------------------------- |
| F0              | F1           | Sem baseline não há detecção confiável de regressão.            |
| F1              | F2-F10       | Flags, comando, auditoria e rollback protegem todas as frentes. |
| F2              | F4-F10       | Rascunho/autosave e linguagem comum são padrões transversais.   |
| F3              | F4           | PIM depende de identidades e compatibilidades estáveis.         |
| F4              | F6           | Busca técnica/SEO dependem de dados normalizados.               |
| F6              | F7           | Ações em massa/release precisam de validações maduras.          |
| F7-F8           | F9           | Visual/multisite exigem workflow e autorização escopada.        |
| F7-F9           | F10          | IA só opera ferramentas e políticas já comprovadas.             |
| F10             | F11          | Evals integram a regressão sistêmica.                           |
| F11             | F12          | Somente homologação integral autoriza produção.                 |

<a id="25-riscos"></a>

## 25. Riscos

| **ID** | **Nível** | **Risco**                            | **Mitigação**                                             | **Owner**         |
| ------ | --------- | ------------------------------------ | --------------------------------------------------------- | ----------------- |
| R-01   | Crítico   | Migração PIM diverge do v1           | Shadow, adapter, reconciliação e zero divergência crítica | Tech lead         |
| R-02   | Crítico   | Multisite vaza dados                 | site_id obrigatório, RLS negativa, pentest tenant         | Security          |
| R-03   | Crítico   | IA executa alvo/escopo errado        | Plano/diff, approval hash, IDs legíveis, tool gateway     | AI/Security       |
| R-04   | Alto      | Estúdio degrada identidade/a11y/perf | Registry, tokens, ranges e quality gates                  | UX/Frontend       |
| R-05   | Alto      | PIM vira cadastro excessivo          | Attribute sets, herança, essenciais primeiro              | Product/PIM       |
| R-06   | Alto      | Release falha parcialmente           | State machine, outbox, snapshot e compensação             | Backend/DevOps    |
| R-07   | Alto      | Dados mestres duplicados             | Normalização, aliases, steward e merge auditado           | Data steward      |
| R-08   | Alto      | Direitos de mídia expirados          | Expiry, blocker de publicação e owner                     | Conteúdo/Jurídico |
| R-09   | Médio     | Índice desatualizado                 | Outbox, lag alert, rebuild e fallback                     | Search            |
| R-10   | Médio     | Custo/latência IA                    | Routing, smaller models, cache e budgets                  | AI/FinOps         |
| R-11   | Médio     | Adoção baixa                         | Co-design, treinamento, métricas e fallback               | Product/Change    |
| R-12   | Médio     | Chunks/admin lentos                  | Dynamic import, budgets e profiling                       | Frontend          |

<a id="26-estrategia-de-rollback"></a>

## 26. Estratégia de Rollback

| **Camada** | **Procedimento**                                                                | **RTO alvo** |
| ---------- | ------------------------------------------------------------------------------- | ------------ |
| Frontend   | Desativar flag por site/papel/usuário e reimplantar artefato imutável anterior. | <15 min      |
| API        | Roteamento para ação v1; revogar nova versão/tool; manter contracts.            | <15 min      |
| Dados      | Parar dual-write; manter tabelas; reconstruir v1 de revisões/snapshots.         | <60 min      |
| Release    | Aplicar snapshot anterior e eventos compensatórios para cache/busca/redirect.   | <5 min alvo  |
| Busca      | Alternar alias/índice anterior e reprocessar outbox.                            | <15 min      |
| Mídia      | Reverter links/crops para versão anterior; não apagar asset novo.               | <30 min      |
| Multisite  | Bloquear writes no site afetado e restaurar roteamento/domínio.                 | <30 min      |
| IA         | Kill switch, revogar keys/tools e continuar manual; preservar logs/evals.       | Imediato     |

> **PROIBIÇÃO** Rollback não deve usar DROP/DELETE amplo nem apagar trilha. Migrations implantadas não são reescritas; corrigir por migration aditiva e restauração dirigida.

<a id="27-plano-de-homologacao"></a>

## 27. Plano de Homologação

| **Trilha**    | **Escopo**                                                        | **Responsável pelo aceite** |
| ------------- | ----------------------------------------------------------------- | --------------------------- |
| Operacional   | 5-8 tarefas por persona; sucesso sem ajuda; tempo/erros/etapas    | Product owner + operadores  |
| Funcional     | Todos menus, campos, ações, workflows e exceções                  | QA                          |
| Dados         | Contagens, constraints, órfãos, reconciliação v1/v2               | Data/Backend                |
| Permissões    | Positivos e negativos por papel/site/ambiente/AAL                 | Security/QA                 |
| Público       | Página/produto/busca/SEO/sitemap/redirect/cache                   | Frontend/SEO                |
| Não funcional | SLO, a11y AA, responsivo, carga, restore e observabilidade        | QA/DevOps                   |
| IA            | Golden/adversarial/fontes/permissões/custo/kill switch            | AI/Security                 |
| Legal/LGPD    | Consentimento, retenção, exportação, anonimização e dados para IA | DPO                         |

<a id="28-plano-de-implantacao"></a>

## 28. Plano de Implantação

1. Confirmar change window, owners, comunicação, backup, restore, runbook e critérios de abort.

1. Aplicar migrations compatíveis em staging e produção somente após validação em banco efêmero.

1. Implantar artefato imutável com flags desligadas; executar smoke privado/público.

1. Ativar para equipe interna, depois conteúdo piloto, site/ambiente e percentual crescente.

1. Comparar erro, latência, divergência, outbox, busca, conversão e tickets em cada patamar.

1. Pausar automaticamente ao exceder error budget; corrigir ou reverter antes de continuar.

1. Concluir com evidência, aceite, treinamento, handover e decisão formal sobre retirada do legado.

| **Momento**          | **Smoke mínimo**                                                      |
| -------------------- | --------------------------------------------------------------------- |
| Pré-deploy           | Backup/restore; migrations dry-run; secrets/scopes; artefato/hash.    |
| Pós-deploy flags off | Login, sessão, admin, API 401/403, público, busca, sitemap, headers.  |
| Canary               | Criar/editar/revisar/publicar/reabrir; mídia; permissões; rollback.   |
| Ampliação            | SLO/error budget, DB load, outbox lag, cache, zero results e suporte. |
| Encerramento         | Evidência assinada, incidentes resolvidos, runbook atualizado.        |

<a id="29-checklist-de-validacao-completa"></a>

## 29. Checklist de Validação Completa

<a id="baseline-e-compatibilidade"></a>

### Baseline e compatibilidade

| **Verificação**                     | **Status** | **Evidência/observação** |
| ----------------------------------- | ---------- | ------------------------ |
| Commit/artefato registrado          | [ ]        |                          |
| Alterações locais preservadas       | [ ]        |                          |
| Backup e restore testados           | [ ]        |                          |
| Contratos v1 cobertos               | [ ]        |                          |
| Feature flags desligadas por padrão | [ ]        |                          |

<a id="interface"></a>

### Interface

| **Verificação**                               | **Status** | **Evidência/observação** |
| --------------------------------------------- | ---------- | ------------------------ |
| Todos menus/submenus acessíveis por permissão | [ ]        |                          |
| Loading/empty/error/success em todas listas   | [ ]        |                          |
| Campos com label/ajuda/contador               | [ ]        |                          |
| Rascunho vazio recuperável                    | [ ]        |                          |
| Conflito 409 acionável                        | [ ]        |                          |
| Teclado/foco/zoom 200%                        | [ ]        |                          |
| 390/768/1366/1920 sem perda funcional         | [ ]        |                          |

<a id="backend-api"></a>

### Backend/API

| **Verificação**           | **Status** | **Evidência/observação** |
| ------------------------- | ---------- | ------------------------ |
| Schema estrito            | [ ]        |                          |
| Autorização server-side   | [ ]        |                          |
| Idempotência              | [ ]        |                          |
| Optimistic concurrency    | [ ]        |                          |
| Códigos HTTP estáveis     | [ ]        |                          |
| CorrelationId em comandos | [ ]        |                          |
| Rate limits e retries     | [ ]        |                          |

<a id="banco"></a>

### Banco

| **Verificação**                | **Status** | **Evidência/observação** |
| ------------------------------ | ---------- | ------------------------ |
| Migration sequencial e aditiva | [ ]        |                          |
| PK/FK/unique/check             | [ ]        |                          |
| Índices e plans revisados      | [ ]        |                          |
| RLS positiva/negativa          | [ ]        |                          |
| Zero órfãos                    | [ ]        |                          |
| Reconciliação v1/v2            | [ ]        |                          |
| Retenção e auditoria           | [ ]        |                          |

<a id="produto-pim"></a>

### Produto/PIM

| **Verificação**                       | **Status** | **Evidência/observação** |
| ------------------------------------- | ---------- | ------------------------ |
| Produto/modelo/variante/SKU separados | [ ]        |                          |
| SKU único/imutável                    | [ ]        |                          |
| Attribute sets versionados            | [ ]        |                          |
| Unidades convertidas                  | [ ]        |                          |
| Elemento monitorado múltiplo          | [ ]        |                          |
| Dados homologados nas facetas         | [ ]        |                          |
| Adapter público compatível            | [ ]        |                          |

<a id="midia"></a>

### Mídia

| **Verificação**             | **Status** | **Evidência/observação** |
| --------------------------- | ---------- | ------------------------ |
| MIME/hash/tamanho/malware   | [ ]        |                          |
| Variantes/crops/focal point | [ ]        |                          |
| ALT e direitos              | [ ]        |                          |
| Mapa de usos                | [ ]        |                          |
| Exclusão protegida          | [ ]        |                          |
| Substituição reversível     | [ ]        |                          |
| GC após retenção            | [ ]        |                          |

<a id="conteudo-seo"></a>

### Conteúdo/SEO

| **Verificação**             | **Status** | **Evidência/observação** |
| --------------------------- | ---------- | ------------------------ |
| Slug/canonical/redirect     | [ ]        |                          |
| Title/description/OG        | [ ]        |                          |
| JSON-LD sem campos internos | [ ]        |                          |
| Sitemap correto             | [ ]        |                          |
| Links válidos               | [ ]        |                          |
| Noindex coerente            | [ ]        |                          |
| Quality gate registrado     | [ ]        |                          |

<a id="workflow-release"></a>

### Workflow/release

| **Verificação**                | **Status** | **Evidência/observação** |
| ------------------------------ | ---------- | ------------------------ |
| Estados/transições             | [ ]        |                          |
| Segregação de aprovação        | [ ]        |                          |
| MFA crítica                    | [ ]        |                          |
| Dependências completas         | [ ]        |                          |
| Diff de campos/relações/visual | [ ]        |                          |
| Publicação coerente            | [ ]        |                          |
| Rollback <5 min                | [ ]        |                          |

<a id="seguranca-lgpd"></a>

### Segurança/LGPD

| **Verificação**                   | **Status** | **Evidência/observação** |
| --------------------------------- | ---------- | ------------------------ |
| 401/403/412 negativos             | [ ]        |                          |
| Tenant escape negado              | [ ]        |                          |
| XSS/CSRF/SQLi/SSRF                | [ ]        |                          |
| Upload hostil                     | [ ]        |                          |
| Segredos ausentes                 | [ ]        |                          |
| PII redigida                      | [ ]        |                          |
| Exportação/anonimização auditadas | [ ]        |                          |
| CSP analisada                     | [ ]        |                          |

<a id="performance-operabilidade"></a>

### Performance/operabilidade

| **Verificação**          | **Status** | **Evidência/observação** |
| ------------------------ | ---------- | ------------------------ |
| SLOs atingidos           | [ ]        |                          |
| Bundles dentro do budget | [ ]        |                          |
| Sem N+1                  | [ ]        |                          |
| Filas/retry/dead-letter  | [ ]        |                          |
| Alertas acionáveis       | [ ]        |                          |
| Runbooks atualizados     | [ ]        |                          |
| Canary/error budget      | [ ]        |                          |
| Treinamento concluído    | [ ]        |                          |

<a id="ia"></a>

### IA

| **Verificação**              | **Status** | **Evidência/observação** |
| ---------------------------- | ---------- | ------------------------ |
| Tool allowlist por permissão | [ ]        |                          |
| Conteúdo tratado como dado   | [ ]        |                          |
| Fonte/confiança por campo    | [ ]        |                          |
| Plano/diff antes de mutar    | [ ]        |                          |
| Approval hash/expiração      | [ ]        |                          |
| Zero bypass nos evals        | [ ]        |                          |
| Kill switch testado          | [ ]        |                          |
| Fallback manual              | [ ]        |                          |

<a id="30-pendencias-e-recomendacoes-futuras"></a>

## 30. Pendências e Recomendações Futuras

| **Tipo**    | **Pendência/recomendação**                           | **Responsável**      | **Prazo-gate**               |
| ----------- | ---------------------------------------------------- | -------------------- | ---------------------------- |
| Decisão     | Multisite imediato ou plataforma futura              | Direção/Product      | Antes de Fase 1              |
| Decisão     | Sistemas mestres para ERP/preço/estoque/MPN/GTIN/NCM | Direção/Comercial/TI | Antes de Fase 4              |
| Owner       | Data steward PIM e revisores por linha               | Direção técnica      | Fase 0                       |
| Piloto      | Selecionar 20-50 produtos e 5-8 tarefas              | Product/PIM          | Fase 0                       |
| Design      | Escolher 20 componentes do Estúdio MVP               | UX/Marketing         | Antes de Fase 9              |
| Segurança   | Política de dados/retensão/região/provedor para IA   | DPO/Security         | Antes de Fase 10             |
| Operação    | Configurar e validar e-mail real                     | DevOps/Marketing     | Antes de produção            |
| Web         | Analisar CSP Report-Only e plano de enforcement      | Security/Frontend    | Antes de produção            |
| Performance | Code splitting de Excel/PDF                          | Frontend             | Fase 6 ou anterior           |
| Qualidade   | Reduzir 46 avisos de lint sem misturar com features  | Tech lead            | Backlog contínuo             |
| Futuro      | Experimentos A/B e personalização não sensível       | Product/Marketing    | Após estabilidade EV2        |
| Futuro      | Engine de busca dedicada                             | Search/Architecture  | Somente se SLO/volume exigir |

> **RESOLUÇÕES DA EV2.0** Os owners interinos, o lote de 20 produtos/8 tarefas e a estratégia de multisite foram definidos em 1 de setembro de 2026. Consulte [Lote piloto EV2.0](LOTE_PILOTO_EV2_0.md), [Decisões e ações necessárias](DECISOES_E_ACOES_NECESSARIAS.md) e [ADR-015](../adr/ADR-015-multisite-preparado-e-ativacao-posterior.md).

> **CONCLUSÃO** A especificação transforma o plano consolidado em uma evolução executável e governada. O primeiro compromisso é preservar o que funciona; o segundo é remover fricção do operador; o terceiro é ampliar automação somente após evidência de segurança, integridade, usabilidade e rollback.

<a id="fontes-locais-consultadas"></a>

## Fontes locais consultadas

- Manual do Usuario - Plano Consolidado de Melhorias do CMS GAIATEC.docx

- docs/auditoria-cms-2026-09-01/RELATORIO.md e MATRIZ.md

- docs/fase-10/* e docs/fase-11/*

- src/app/routes.tsx; src/admin/admin-navigation.ts; src/admin/api/cms-api.ts

- src/shared/contracts/cms-content.ts; src/admin/product-editor-model.ts; src/admin/page-builder-model.ts

- supabase/migrations/0010-0036; supabase/functions/cms-*; package.json e scripts de testes

- _Nota de evidência: o check local foi executado em 1 de setembro de 2026 e concluiu com exit code 0. O documento não executou migrations remotas, deploy, alteração de dados ou envio externo._
