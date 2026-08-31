# Inventário de telas e componentes — F11

**Persona principal:** operador administrativo não técnico.

**Personas complementares:** editor, revisor, marketing, comercial, técnico e super admin.
**Estado:** migração implementada e homologada em staging; nenhuma rota omitida.

## Rotas públicas de autenticação e segurança

| Rota                        | Persona/tarefa         | Problema de baseline        | Padrão de destino                                     | Status  |
| --------------------------- | ---------------------- | --------------------------- | ----------------------------------------------------- | ------- |
| `/admin/login`              | convidado entra        | cartão sem ajuda por campo  | auth card, ajuda, erro acionável, rodapé de segurança | migrada |
| `/admin/recuperar-senha`    | solicita link          | orientação longa            | resumo curto, ajuda e resposta antienumeração         | migrada |
| `/admin/definir-senha`      | cria senha             | política sem ajuda local    | ajuda vinculada aos dois campos                       | migrada |
| `/admin/mfa`                | inscreve/confirma TOTP | etapa pouco contextualizada | tarefa, ajuda, busy e saída segura                    | migrada |
| sessão expirada/sem convite | recupera ou sai        | estado genérico             | estado fail-closed, causa clara e ação segura         | migrada |

## Shell e módulos protegidos

| Rota/superfície                     | Persona/tarefa            | Problema de baseline                               | Padrão de destino                                                    | Status                    |
| ----------------------------------- | ------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- | ------------------------- |
| shell global                        | todos                     | topo espaçado, conta mínima, menu sem recolhimento | busca Ctrl/Cmd+K, conta real, sidebar agrupada/recolhível, skip link | migrada                   |
| `/admin`                            | todos; priorizar trabalho | título técnico e ações soltas                      | PageHeader, métricas, cards e estados                                | migrada                   |
| `/admin/produtos`                   | catálogo                  | filtros e tabela sem resumo                        | PageHeader, FilterBar, contagem, DataTable e estados                 | migrada                   |
| `/admin/produtos/:id`               | editor de produto         | padrão F10 isolado                                 | etapas, cards, status rail, pendências e footer sticky               | migrada por sistema comum |
| `/admin/produtos/importacao`        | lote novo                 | fluxo longo                                        | etapas claras, declaração, dry-run, erros por linha/campo            | migrada por sistema comum |
| `/admin/conteudo`                   | biblioteca editorial      | listagem genérica                                  | cabeçalho, filtros, tabela e empty state comuns                      | migrada por sistema comum |
| `/admin/conteudo/:id`               | editor de post            | editor denso                                       | grupos por intenção, workflow e histórico                            | migrada por sistema comum |
| `/admin/descoberta/service`         | serviços                  | lista/editor na mesma tela                         | contexto, listagem e editor por etapas                               | migrada por sistema comum |
| `/admin/descoberta/industry`        | indústrias                | idem                                               | idem, orientação específica                                          | migrada por sistema comum |
| `/admin/descoberta/application`     | aplicações                | idem                                               | idem, orientação específica                                          | migrada por sistema comum |
| `/admin/descoberta/solution`        | soluções                  | idem                                               | idem, orientação específica                                          | migrada por sistema comum |
| `/admin/busca`                      | governança de busca       | duas áreas pouco hierárquicas                      | cards, tabela e orientação                                           | migrada por sistema comum |
| `/admin/listas-mestras`             | taxonomia                 | vazio sem próximo passo visível                    | master-detail, empty/error/success e ajuda                           | migrada por sistema comum |
| `/admin/paginas`                    | páginas/homepage          | listagem genérica                                  | PageHeader, filtros, resumo e ações                                  | migrada por sistema comum |
| `/admin/paginas/:id`                | builder                   | editor longo e muitos controles                    | etapas, outline, cards, pendências e footer                          | migrada por sistema comum |
| `/admin/site?section=navigation`    | menus                     | aba pouco contextualizada                          | orientação de consumidores e workflow                                | migrada por sistema comum |
| `/admin/site?section=site_settings` | dados globais             | impacto distribuído pouco claro                    | impacto público explícito e cards                                    | migrada por sistema comum |
| `/admin/site?section=placement`     | destaques                 | vigência técnica                                   | ajuda de período, relação e expiração                                | migrada por sistema comum |
| `/admin/marketing`                  | campanhas                 | filtros sem resumo                                 | header, filtros, tabela e estados                                    | migrada por sistema comum |
| `/admin/marketing/campanhas/:id`    | campanha/landing          | editor longo                                       | grupos, blocos, status e workflow                                    | migrada por sistema comum |
| `/admin/marketing/formularios`      | versões                   | mestre-detalhe denso                               | cards, labels, ajuda e publicação clara                              | migrada por sistema comum |
| `/admin/leads`                      | atendimento               | tabela e painel densos                             | filtros, dados restritos, ações e confirmação                        | migrada por sistema comum |
| `/admin/midia`                      | biblioteca                | vazio/filtro simples                               | PageHeader, FilterBar, cards e permissão                             | migrada                   |
| `/admin/usuarios`                   | identidades               | tabela sem contexto                                | PageHeader, DataTable, badges e estados                              | migrada                   |
| `/admin/perfil`                     | sessão/permissões         | cards sem hierarquia                               | cartões comuns e ações de sessão                                     | migrada por sistema comum |
| `/admin/diagnosticos`               | incidentes                | números e eventos soltos                           | PageHeader, skeleton, métricas e empty/error                         | migrada                   |
| `/preview/:token`                   | revisor                   | erro genérico                                      | banner privado, loading/erro/expirado e renderer real                | migrada por sistema comum |
| `/cms/conteudo/:slug`               | inspeção publicada        | ausência genérica                                  | estado publicado/não encontrado                                      | migrada por sistema comum |
| rota admin inexistente              | todos                     | caía no erro geral                                 | 404 administrativo com retorno ao painel                             | validada em staging       |

## Componentes compartilhados

`PageHeader`, breadcrumbs do shell, `ActionBar`, `SectionCard`, `FieldGroup`, `FieldHelp`, `StepTabs`, `StatusRail`, `StatePanel`, `EmptyState`, `ErrorState`, `LoadingSkeleton`, `FilterBar`, `DataTable`, `Badge`, `AdminAlert`, `ConfirmDialog` e `StickyFooter` vivem em `src/admin/components/AdminUI.tsx`.

Os editores anteriores permanecem como consumidores de contrato e recebem o sistema comum por componentes e classes; nenhum editor foi substituído por JSON nem por controles sem backend.
