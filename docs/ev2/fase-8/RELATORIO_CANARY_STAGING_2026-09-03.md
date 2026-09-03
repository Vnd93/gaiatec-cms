# Relatório do canary EV2.8 em staging

**Data:** 3 de setembro de 2026<br>
**Resultado:** APROVADO — 27/27 verificações<br>
**SHA autorizado e executado:** `896d0c6019bf5f0e3d65d2dc527ae10d1da5dd9a`<br>
**Supabase:** `GAIATEC CMS Staging` — `glcqsosxwgmlhzgcsnzv`, `us-east-2`<br>
**Produção:** não alterada

## Autorização e limites

O canary foi executado após autorização explícita para a migration `0047`, as funções `cms-scopes` e `cms-session`, o alias `ev2-g8-canary`, dois usuários sintéticos com MFA e overrides individuais de 30 minutos. Produção, dados reais, ativação global e promoção do staging estável permaneceram proibidos.

O pré-flight confirmou o SHA local/remoto exato, somente a migration `0047` pendente, zero override ativo, ausência das três tabelas EV2.8 e flag `ev2.rbac_scoped` com `default_enabled=false` e `kill_switch=false`. O rehearsal executou a migration completa dentro de `BEGIN/ROLLBACK` e confirmou restauração dos hashes das funções centrais e zero objeto residual.

## Implantação isolada

| Superfície     | Evidência                                                                        |
| -------------- | -------------------------------------------------------------------------------- |
| Migration      | `0047_ev2_scoped_rbac.sql` aplicada somente no projeto staging                   |
| Dados/RLS      | 3 tabelas presentes, 3 com RLS, zero grant de tabela para `anon`/`authenticated` |
| RPC            | execução administrativa negada ao cliente e concedida a `service_role`           |
| Edge Functions | `cms-scopes` v1 e `cms-session` v13, ambas `ACTIVE` e `verify_jwt=true`          |
| Manifesto      | SHA-256 `140778bc34c1602fb6cf7f35619ffef5e88338610d5e321c307afc3a3474e03c`       |
| Deployment     | `385bb13e-9b0d-4cc0-9494-f43391eeb809`                                           |
| URL imutável   | <https://385bb13e.gaiatec-cms-staging.pages.dev>                                 |
| Alias isolado  | <https://ev2-g8-canary.gaiatec-cms-staging.pages.dev>                            |

O SHA autorizado também passou na [CI do push](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33773724120), na [CI do pull request](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33773728566) e no [workflow de preview](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33773728731), este último limitado a artefato GitHub sem deploy remoto.

O workflow manual `EV2.8 Canary Preview` ainda não existe no branch padrão e não pôde ser despachado pela API do GitHub. Para preservar o SHA autorizado, o build foi gerado em worktree destacado e limpo, com apenas `VITE_EV2_RBAC_SCOPED_CANDIDATE=true`, e publicado diretamente por Wrangler com `--commit-hash`. Os smokes da URL imutável e do alias passaram, incluindo `noindex`, rotas públicas e 404 de rota/asset inexistente.

## Resultado operacional

O runner criou OP-G8 e USR-G8 exclusivamente sintéticos, elevou ambos a AAL2 e aplicou overrides individuais limitados a 30 minutos. Foram aprovadas 27 verificações:

- fallback legado antes do override e resolução exclusivamente escopada depois dele;
- sessão anônima 401, ação crítica AAL1 412 e tentativa sem permissão 403;
- leitura direta das tabelas protegidas recusada por RLS;
- tentativa de publicação recusada, workflow intacto e zero projeção pública;
- catálogo de nove papéis e dois assignments iniciais corretos;
- concessão temporária, replay idempotente e conflito de chave divergente;
- autoelevação e `super_admin` delegado bloqueados;
- permissão `support` efetiva antes do prazo e negada automaticamente após expirar;
- permissão desconhecida negada e auditada;
- grant/revoke com versão otimista e concessão expirada não tratada como ativa;
- override amplo bloqueando capability e sessão, seguido de recuperação imediata;
- ambiente `production` recusado pelo código `CMS_SCOPE_PRODUCTION_GATED`;
- 15/15 avaliações correlacionadas a decisões imutáveis;
- 3/3 mutações correlacionadas a recibos e auditorias `before/after`;
- flag global inalterada e resíduo sintético zero.

## Incidente controlado e correção

Na primeira passagem, 12 verificações passaram e a concessão `support` de 15 segundos retornou 422. A causa foi uma diferença de aproximadamente 46 segundos entre o relógio local e o cabeçalho `Date` do staging; a validade calculada localmente já chegava expirada ao banco. O bloco de contenção removeu os dois usuários, conteúdo, scopes, decisões, recibos e overrides, e a consulta independente confirmou resíduo zero.

O runner foi endurecido para derivar `starts_at`, `expires_at`, `valid_from` e a espera de expiração do relógio do próprio staging. A segunda execução partiu de zero override e concluiu 27/27. Não houve alteração de regra de autorização, ampliação de prazo, relaxamento de teste ou republicação do build.

## Reconciliação e sentinelas finais

A consulta independente após o runner retornou zero para:

- usuários `auth.users` da fase EV2-G8;
- perfis e papéis legados sintéticos;
- `cms_scoped_role_assignments`;
- `cms_policy_decisions`;
- `cms_scope_command_receipts`;
- overrides de `ev2.rbac_scoped`;
- conteúdo sintético e eventos `cms:scopes.*`.

A flag terminou `default_enabled=false`, `kill_switch=false`; não há assignment nem decisão com ambiente `production`. O login do alias carregou com título, campos, recuperação de senha e zero erro/aviso de console.

O staging estável permaneceu no deployment `868f4382-9b99-4caa-bd51-73c70a492895`, branch `Remodelagem`, source `2042c8f`. O site público de produção permaneceu no deployment `ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf`, branch `main`, source `ba11310`.

## Decisão

Gate G8 aprovado. A EV2.9 está liberada para desenvolvimento no branch atual. Migration e funções permanecem em staging com flag global desligada e sem overrides; o alias candidato continua isolado. Esta decisão não autoriza produção, dados reais, ativação global, merge em `main` nem promoção do staging estável.
