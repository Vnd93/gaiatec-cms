# Relatório do canary EV2.9 em staging

**Data:** 3 de setembro de 2026<br>
**Resultado:** APROVADO — 32/32 verificações<br>
**SHA autorizado e executado:** `6954171ba60d923a923ac26ed3b491b6d9149817`<br>
**Supabase:** `GAIATEC CMS Staging` — `glcqsosxwgmlhzgcsnzv`, `us-east-2`<br>
**Produção:** não alterada

## Autorização e limites

O canary foi executado após autorização explícita para manter a migration `0048` e as funções `cms-visual` e `cms-sites` já aplicadas em staging, atualizar somente o alias `ev2-g9-canary` para o SHA corrigido e usar dois usuários exclusivamente sintéticos com MFA e overrides individuais de 30 minutos. Produção, dados reais, domínios reais, ativação global e promoção do staging estável permaneceram proibidos.

O preflight confirmou o SHA local e remoto, o projeto e a região autorizados, funções G9 ativas com verificação JWT, zero override ativo, zero site G9, zero site habilitado para produção, zero domínio real e as flags `ev2.visual_studio` e `ev2.multisite` com `default_enabled=false` e `kill_switch=false`.

O rehearsal anterior executou a migration completa em `BEGIN/ROLLBACK`, restaurou o validador e os contratos legados e registrou `G9_MIGRATION_REHEARSAL_PASS`, `rolledBack=true` e zero mutação de produção. Após a aplicação em staging, foram confirmadas 15 tabelas com RLS, zero grant direto de tabela para `anon` ou `authenticated`, RPCs administrativas negadas ao cliente, 20 componentes ativos, zero domínio e zero site com produção habilitada.

## Implantação isolada

| Superfície     | Evidência                                                                           |
| -------------- | ----------------------------------------------------------------------------------- |
| Migration      | `0048_ev2_visual_studio_multisite.sql` aplicada somente no projeto staging          |
| Dados/RLS      | 15 tabelas presentes, 15 com RLS e zero grant de tabela para `anon`/`authenticated` |
| Edge Functions | `cms-visual` v1 e `cms-sites` v1, ambas `ACTIVE` e `verify_jwt=true`                |
| Manifesto      | SHA-256 `97d5b1be4ebc18bce3013266aa589e77e20004db6caf6b39f08a37dfc6dc13d0`          |
| Deployment     | `ca350fa8-27a0-451d-9887-159f9c5deae3`                                              |
| URL imutável   | <https://ca350fa8.gaiatec-cms-staging.pages.dev>                                    |
| Alias isolado  | <https://ev2-g9-canary.gaiatec-cms-staging.pages.dev>                               |

O SHA candidato passou na [CI do push](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33808207793), na [CI do pull request](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33808210806) e no [workflow de preview](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33808210772), este último limitado a artefato GitHub sem deploy remoto.

O workflow manual `EV2.9 Canary Preview` ainda não existe no branch padrão e não pôde ser despachado pela API do GitHub. Para preservar o SHA autorizado, o build foi gerado a partir do checkout limpo e exato, com todas as flags candidatas anteriores desligadas e somente `VITE_EV2_VISUAL_STUDIO_CANDIDATE=true` e `VITE_EV2_MULTISITE_CANDIDATE=true`, e publicado diretamente pelo Wrangler no branch de preview `ev2-g9-canary`.

O manifesto do alias e da URL imutável retornou o SHA completo autorizado. O smoke HTTP aprovou rotas públicas, rota privada, 404 de rota e asset inexistentes e `noindex`. As rotas `/admin/estudio-visual/<UUID>` e `/admin/sites` retornaram 200 com `no-store` e `noindex`; um identificador visual inválido retornou 404.

## Resultado operacional

O runner criou OP-G9 e DSG-G9 exclusivamente sintéticos, elevou ambos a AAL2 e aplicou quatro overrides individuais limitados a 30 minutos. Foram aprovadas 32 verificações:

- SHA, projeto, alias, rotas, flags globais e ausência inicial de overrides exatos;
- sessão anônima 401, capability desligada antes do override e habilitação somente individual;
- ambiente de produção recusado por `CMS_VISUAL_PRODUCTION_GATED`;
- catálogo exato de 20 componentes governados;
- branch visual idempotente, versão otimista e conflito obsoleto preservado;
- toda mutação visual e de site recusada em AAL1 com 412;
- três snapshots do mesmo documento em desktop, tablet e mobile;
- símbolo restrito ao mesmo site e aplicação somente ao rascunho;
- zero revisão, publicação, projeção pública ou outbox gerada pelo Estúdio Visual;
- dois sites `g9x-*` sintéticos, travados e sem habilitação operacional;
- replay e conflito de idempotência do site corretamente diferenciados;
- somente hostname `.invalid` aceito e domínio real recusado;
- tenant A incapaz de inferir, listar ou alterar o tenant B, e vice-versa;
- tokens versionados por site e suspensão sem ativação;
- enumeração direta de tenants negada pela API/RLS;
- override amplo recusado de forma fail-closed e recuperação individual imediata;
- 5/5 mutações visuais com recibo e evento correlacionados;
- 5/5 mutações de site com recibo e evento correlacionados;
- flags globais inalteradas, estado real preservado e resíduo sintético zero.

## Incidentes controlados e correções

O primeiro build, no SHA `e7713e8e7db12e196899d528346fb23c1fe708c4`, foi contido antes da criação de qualquer fixture porque o Worker retornou 404 para as duas novas rotas administrativas. A allowlist foi corrigida com validação estrita de UUID e testes de regressão no SHA candidato `6954171ba60d923a923ac26ed3b491b6d9149817`. O candidato corrigido passou na suíte integral e em todos os workflows antes da nova implantação.

Na primeira execução operacional do candidato corrigido, as 30 verificações funcionais passaram e a limpeza referencial foi executada, mas o probe final tentou selecionar a coluna inexistente `cms_session_revocations.id`. A reconciliação direta confirmou imediatamente zero usuário Auth G9, perfil, override, site, domínio, conteúdo, branch, símbolo, recibo ou evento residual, com flags desligadas e zero estado real ou de produção.

O probe foi corrigido para a chave real `session_id_hash` e protegido por regressão no commit `9a8b8be4e907c26a8651337488b6b0b70e8dc49d`. O ajuste passou na [CI do push](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33809778886), na [CI do pull request](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33809782568) e no [workflow de preview](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33809782644). Ele alterou somente o verificador local; o build candidato não foi republicado. A repetição contra o mesmo SHA autorizado concluiu `G9_CANARY_PASS` com 32/32 verificações.

## Reconciliação e sentinelas finais

A consulta independente após o runner retornou zero para:

- usuários `auth.users`, perfis e papéis sintéticos da fase G9;
- overrides ativos de `ev2.visual_studio` e `ev2.multisite`;
- conteúdo, branch, documento, símbolo e snapshots sintéticos;
- sites, ambientes, temas, tokens e domínios `g9x-*`;
- recibos e eventos visuais e de sites do canary.

As duas flags terminaram com `default_enabled=false` e `kill_switch=false`; há zero site com `production_enabled=true` e zero domínio real. O staging estável permaneceu no deployment `868f4382-9b99-4caa-bd51-73c70a492895`, branch `Remodelagem`, source `2042c8f`. O site público de produção permaneceu no deployment `ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf`, branch `main`, source `ba11310`.

## Decisão

Gate G9 aprovado. A EV2.10 está liberada para desenvolvimento no branch atual. Migration e funções permanecem em staging com flags globais desligadas e sem overrides; o alias candidato continua isolado. Esta decisão não autoriza produção, dados reais, domínios reais, ativação global, merge em `main` nem promoção do staging estável.
