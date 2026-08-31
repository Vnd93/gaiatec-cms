# Relatório final do CMS e encerramento técnico da Fase 9

**Data da consolidação:** 2026-08-30

**Branch inspecionada:** `Remodelagem`

**Escopo:** CMS, integrações, frontend público, segurança, acessibilidade e operação
**Produção:** intocada

## 1. Resumo executivo

O refinamento final reorganizou a navegação administrativa, padronizou previews externos,
protegeu dados não salvos, tornou o contexto editorial explícito e ampliou a cobertura de
regressão. As URLs, contratos públicos, projeções, RBAC, MFA, RLS, auditoria, revisões e
workflow existentes foram preservados. Não houve migration, alteração destrutiva, deploy,
push, merge ou escrita em produção.

O resultado está tecnicamente apto para homologação administrativa autenticada. O gate
formal de go-live permanece bloqueado pelos testes RLS reais neste host, validação visual
autenticada dos editores, revisão legal/DPO, autorização de produção e janela real de
estabilidade.

## 2. Diagnóstico encontrado

- O menu era uma lista extensa, sem agrupamento operacional centralizado, e os breadcrumbs
  podiam expor segmentos técnicos ou identificadores.
- Os previews assíncronos retiravam o operador do editor por navegação na mesma aba.
- Os editores não possuíam uma proteção uniforme contra perda de alterações não salvas.
- O estado editorial, o conteúdo afetado e a próxima ação não apareciam com a mesma clareza
  em todos os editores.
- Havia recargas completas que descartavam contexto recuperável pelo estado da aplicação.
- Termos como slug, canonical e correlation ID estavam expostos sem tradução operacional em
  superfícies relevantes.
- A árvore continha alterações locais e arquivos não rastreados anteriores a esta revisão.
  Eles foram preservados; nenhuma restauração ampla foi executada.

A matriz detalhada por rota, permissão, dados, contratos, consumidores, ações, estados e
riscos está em [MATRIZ_FINAL_ROTAS_CMS.md](./MATRIZ_FINAL_ROTAS_CMS.md).

## 3. Arquitetura de informação anterior e final

Antes, as entradas administrativas eram apresentadas de forma predominantemente linear.
Agora a fonte de verdade de navegação é centralizada e filtrada pelas permissões efetivas:

1. Painel;
2. Conteúdo do site;
3. Catálogo;
4. Marketing e relacionamento;
5. Estrutura e identidade do site;
6. Administração.

Os grupos são recolhíveis, possuem ícones com texto, estados ativo/expandido, suporte a
teclado, foco visível e comportamento mobile com backdrop e fechamento por `Escape`. Rotas
consolidadas não foram renomeadas. Navegação, dados globais e posicionamentos usam a rota
existente com a seção representada na query string. A busca global só aponta para um domínio
que o usuário pode acessar. Contadores não foram inventados: badges dependem de uma fonte
confiável de pendências e permanecem fora desta entrega até esse contrato existir.

## 4. Telas e fluxos revisados

Foram inventariados login, recuperação, definição de senha, MFA, painel, produtos, cadastro
em massa, descoberta, busca, conteúdo editorial, páginas/homepage, campanhas, formulários,
leads, navegação, dados globais, posicionamentos, mídia, perfil, usuários, diagnósticos,
previews, revisões e workflows.

Receberam intervenção direta os shells de navegação e os editores de página, produto,
campanha, conteúdo editorial, descoberta e configuração do site. Os demais módulos foram
verificados por inventário, contratos, testes de fase, build e regressão E2E pública/fail-closed.

## 5. Melhorias de UX/UI

- menu agrupado e permission-aware;
- títulos e breadcrumbs amigáveis, sem UUID;
- identidade e sessão do operador preservadas no shell;
- linguagem operacional para endereço amigável, endereço oficial e código de acompanhamento;
- contexto de conteúdo, caminho, versão, estado, impacto público e próxima ação;
- indicação consistente de alterações salvas ou não salvas;
- confirmação contextual para remoção de blocos e posicionamentos;
- área avançada mantida para JSON técnico, sem torná-lo a interface principal;
- foco visível global, sem overflow horizontal na autenticação mobile;
- atualização local após operações, eliminando recargas completas desnecessárias.

## 6. Solução de preview e nova aba

Foi criado um utilitário único que reserva uma aba vazia durante o clique, remove a relação
com `opener`, solicita o token de modo assíncrono e então substitui a URL. Falhas exibem uma
mensagem útil na aba reservada; bloqueio de pop-up produz um link acessível com
`target="_blank"` e `rel="noopener noreferrer"`. O estado ocupado evita cliques duplicados.

O padrão foi aplicado aos seis editores governados. Não restam `window.location.assign`,
`window.location.reload` ou aberturas diretas divergentes nas páginas administrativas
abrangidas. Testes comprovam abertura síncrona, isolamento de `opener`, redirecionamento,
fallback e erro.

## 7. Identificação visual da área editada

Os seis editores exibem o conteúdo e a seção afetados, estado salvo/rascunho, workflow,
impacto público e orientação de próxima ação. O editor de páginas também identifica bloco,
posição, tipo, visibilidade e revisão, destaca a seleção e mantém seleção coerente ao criar
ou duplicar blocos.

O renderizador público real continua sendo a fonte do preview, evitando uma segunda
implementação visual. A prévia completa usa a revisão salva e token governado. Uma sessão
temporária sincronizada para dados ainda não salvos em todos os tipos não foi criada porque
exigiria novo contrato de backend, armazenamento temporário, expiração e revisão de ameaça;
isso permanece como evolução arquitetural, sem relaxar o workflow atual.

## 8. Integrações verificadas

Foram verificados por contratos automatizados, testes de fase, Worker local e staging:

- CMS, comandos, Supabase e projeções públicas;
- revisão imutável, workflow e autorização fail-closed;
- produtos, filtros, comparação, busca e consumidores públicos;
- páginas, discovery, SEO, sitemap, redirects, 404 e asset inexistente;
- navegação, dados globais, header, menu mobile e footer;
- campanhas, expiração, formulários, leads, consentimento, outbox e anonimização;
- isolamento do RDO e headers privados;
- preview tokenizado, RBAC e ausência de fallback editorial legado;
- Cloudflare Worker, regras de status, cache e contenção de segurança.

Nenhum dado de staging foi gravado durante esta consolidação. A inspeção de `/admin` em
staging foi somente leitura e confirmou o redirecionamento fail-closed para login.

## 9. Problemas e lacunas corrigidos

- desordem e duplicação de metadados do menu;
- breadcrumbs técnicos;
- previews na mesma aba e perda de contexto;
- ausência de fallback para pop-up bloqueado;
- risco de perda silenciosa de dados ao navegar;
- ações de workflow com alterações locais ainda pendentes;
- recargas completas desnecessárias;
- remoções sem confirmação contextual;
- falta de contexto operacional uniforme nos editores;
- terminologia técnica exposta sem explicação;
- seção de configuração desconectada da URL e do breadcrumb.

## 10. Arquivos alterados nesta consolidação

### Fontes principais

- `src/admin/admin-navigation.ts`;
- `src/admin/open-external-preview.ts`;
- `src/admin/components/AdminShell.tsx`;
- `src/admin/components/UnsavedChangesGuard.tsx`;
- `src/admin/admin.css`;
- `src/admin/pages/AdminPageBuilderPage.tsx`;
- `src/admin/pages/AdminProductEditorPage.tsx`;
- `src/admin/pages/AdminCampaignEditorPage.tsx`;
- `src/admin/pages/AdminEditorPage.tsx`;
- `src/admin/pages/AdminDiscoveryPage.tsx`;
- `src/admin/pages/AdminSiteConfigurationPage.tsx`;
- `src/admin/pages/AdminContentPage.tsx`.

### Testes e evidências

- `tests/unit/admin-navigation.test.ts`;
- `tests/unit/open-external-preview.test.ts`;
- `tests/components/unsaved-guard.test.tsx`;
- `scripts/phase9/admin-operational-closure.test.mjs`;
- `docs/fase-9/MATRIZ_FINAL_ROTAS_CMS.md`;
- `docs/fase-9/evidencia-cms-login-final-desktop.png`;
- `docs/fase-9/evidencia-cms-login-final-mobile.png`;
- este relatório.

Alguns desses arquivos já possuíam mudanças locais. As intervenções foram mescladas sobre o
estado encontrado, sem descartar o trabalho anterior.

## 11. Alterações de banco ou contratos

Não houve migration, alteração de schema, policy, RPC, Edge Function, bucket ou contrato
público nesta consolidação. O preview continuou usando o contrato tokenizado existente. O
novo modelo de navegação e o guard de alterações são internos ao frontend administrativo.

## 12. Testes executados e resultados

| Gate                        | Resultado                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------- |
| `npm run check`             | aprovado: formato, lint, TypeScript, 58 testes Vitest, 55 testes das fases 2–9 e build  |
| Lint                        | 0 erros; 45 warnings legados não bloqueantes                                            |
| Testes novos focados        | 8/8 aprovados                                                                           |
| Fase 9                      | 9/9 aprovados                                                                           |
| E2E local                   | 32 aprovados, 8 skips exclusivos de staging, 0 falhas                                   |
| E2E staging somente leitura | 38 aprovados, 2 skips condicionais, 0 falhas                                            |
| Smoke HTTP no Worker local  | 6/6 aprovados                                                                           |
| Build Cloudflare            | aprovado; Worker preparado                                                              |
| RLS real                    | não executado: Docker/Postgres local ausente; CLI disponível via `npx supabase` 2.116.0 |

O teste RLS deve ser repetido em host apropriado com:

```text
npx supabase start
npx supabase db reset --local --no-seed
npm run test:rls
npx supabase stop --no-backup
```

O CI também executa `npx supabase test db`. O risco residual é uma divergência que apenas um
Postgres real detectaria; os testes estruturais das migrations e os resultados anteriores de
staging reduzem, mas não eliminam, esse risco.

## 13. Evidências desktop, mobile, teclado e acessibilidade

- Desktop: `evidencia-cms-login-final-desktop.png`;
- Mobile 393 x 852: `evidencia-cms-login-final-mobile.png`;
- não houve overflow horizontal no viewport mobile inspecionado;
- foco de teclado visível com outline de 2 px na autenticação;
- console sem erros ou warnings na inspeção local da autenticação;
- axe-core sem violações sérias/críticas nas jornadas públicas local e staging;
- skip link, menu mobile, fechamento por `Escape` e restauração de scroll aprovados;
- o guard de alterações não salvas foi validado por teste de componente.

## 14. Riscos residuais

- o teste RLS real precisa de Docker e banco efêmero; a Supabase CLI já está disponível via `npx supabase` 2.116.0;
- os editores autenticados não foram percorridos visualmente em staging nesta execução porque
  não foi fornecida uma sessão/credencial de homologação;
- preview sincronizado de dados ainda não salvos exigiria novo contrato seguro de sessão
  temporária; hoje a prévia completa representa a revisão salva;
- os bundles de `@react-pdf/renderer` (aproximadamente 1,9 MB minificado) e `exceljs`
  (aproximadamente 940 kB) acionam alerta de tamanho e merecem carregamento ainda mais tardio;
- permanecem 45 warnings de lint legados, sem erro;
- badges operacionais exigem uma fonte transacional de contagens para não exibir dados
  incorretos.

## 15. Pendências externas, autorização e tempo real

- fornecer uma conta de homologação por papel, com MFA, para inspeção visual/autorizativa de
  todos os editores em staging;
- executar e anexar o pgTAP/RLS real em ambiente efêmero com Docker;
- obter revisão legal/DPO;
- obter autorização explícita de produção e de cutover;
- executar smoke pós-publicação e observar a janela real de estabilidade;
- decidir sobre o plano Supabase necessário para proteção de senhas vazadas, já registrada
  nas evidências anteriores.

## 16. Instruções de rollback

Como o worktree já estava modificado antes desta revisão, é proibido usar `git reset --hard`,
`git checkout -- .` ou qualquer restauração ampla. O rollback seguro é:

1. registrar e copiar o estado atual do worktree;
2. gerar um patch apenas dos arquivos listados na seção 10;
3. reverter, por revisão de hunks, somente a fonte de navegação, preview, guard e integrações
   nos seis editores;
4. remover apenas os novos testes e documentos desta consolidação, se autorizado;
5. executar `npm run check`, E2E e smoke novamente;
6. nunca alterar migrations, dados, staging ou produção como parte desse rollback de frontend.

Depois de um commit dedicado, o método preferencial passa a ser `git revert <commit>`, sem
reescrever o histórico.

## 17. Recomendação objetiva

**Aprovado com ressalvas para homologação autenticada; go-live formal bloqueado.**

O código, a regressão local, o Worker e a regressão pública de staging estão verdes. O gate
formal só pode avançar após RLS real, homologação autenticada dos editores, revisão legal/DPO,
autorização explícita de produção e evidência da janela real de estabilidade.
