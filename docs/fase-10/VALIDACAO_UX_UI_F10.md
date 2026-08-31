# Validação UX/UI — F10

## Referência e critérios

A imagem autorizada foi usada somente como referência visual. O editor implementa sidebar agrupada, cabeçalho, breadcrumbs, ações salvar/pré-visualizar/publicar, fluxo reduzido em tabs, cards centrais, rail de status, modelos visuais e rodapé sticky com autosave. Não foram copiados dados nem criadas notificações decorativas.

## Resultado da execução

| Cenário                                    | Desktop                      | Mobile               | Evidência                                               |
| ------------------------------------------ | ---------------------------- | -------------------- | ------------------------------------------------------- |
| editor de produto e rail sticky            | pendente de execução         | pendente de execução | sessão MFA confirmada; aba retida pela tarefa de origem |
| listas mestras: vazio/loading/erro/sucesso | vazio autenticado comprovado | pendente de execução | zero dimensões antes da carga; gravação não iniciada    |
| teclado, ordem de foco e nomes acessíveis  | aprovado parcial             | aprovado parcial     | axe/E2E verde; editor autenticado ainda aberto          |
| modelos/variantes, confirmação e ordenação | pendente de execução         | pendente de execução | sessão MFA confirmada; aba retida pela tarefa de origem |
| troca de aba/token refresh                 | automatizado verde           | n/a                  | Vitest; prova staging depende de sessão MFA             |
| console sem erros e viewport sem overflow  | aprovado público             | aprovado público     | Browser integrado e E2E                                 |

### Evidências observadas em 2026-08-30

- staging: <https://4aedcf0f.gaiatec-cms-staging.pages.dev>;
- catálogo desktop: um `main`, cinco filtros controlados, zero overflow e zero erro/warning no console;
- catálogo mobile 390 × 844: card e painel de filtros com 343 px, zero overflow e zero erro/warning;
- rota protegida `/admin/produtos/novo`: redirecionou para `/admin/login`, com `noindex,nofollow,noarchive`, zero overflow e console limpo;
- E2E: 32 aprovados e 8 cenários exclusivamente remotos ignorados conforme configuração local;
- o navegador integrado não possuía login staging, mas o Chrome indicado pelo usuário apresentou `/admin/perfil` com sessão `super_admin`, MFA “Verificado” e permissão `cms:vocabularies.manage` em 2026-08-31;
- `/admin/listas-mestras` foi lida autenticada e informou “Nenhuma dimensão cadastrada”; antes da primeira gravação, a aba passou a permanecer sob controle exclusivo da tarefa de origem e a extensão bloqueou o controle simultâneo desta tarefa delegada;
- nenhuma credencial, cookie ou storage foi lido e nenhuma gravação/teste autenticado foi declarado sem execução.

O header HTTP `X-Robots-Tag: noindex, nofollow, noarchive` foi confirmado em todas as rotas de staging testadas. Embora o HTML público mantenha a meta editorial `index,follow`, o header de staging é a diretiva autoritativa para impedir indexação.

A validação autenticada do editor e a carga das listas permanecem abertas até a aba ser liberada pela tarefa de origem ou a execução continuar nela. Não é necessário novo login enquanto a sessão AAL2 continuar válida.
