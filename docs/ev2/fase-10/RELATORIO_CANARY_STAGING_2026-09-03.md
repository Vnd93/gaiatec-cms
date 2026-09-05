# Relatório do canary EV2.10 em staging

**Data:** 3 de setembro de 2026<br>
**Resultado:** APROVADO — 26/26 verificações<br>
**SHA autorizado e executado:** `c2500c7de38fdb6c33f338232e858ef12a8fe0e5`<br>
**Supabase:** `GAIATEC CMS Staging` — `glcqsosxwgmlhzgcsnzv`, `us-east-2`<br>
**Modo:** `synthetic/deterministic-v1`, custo zero e provedor externo desligado<br>
**Produção:** não alterada

## Autorização e limites

O canary foi executado após autorização explícita para aplicar somente a migration `0049`, publicar
somente a função `cms-ai`, implantar o SHA exato no alias `ev2-g10-canary` e usar dois usuários
exclusivamente sintéticos com MFA e overrides individuais de até 30 minutos. Produção, dados reais,
provedor externo, ativação global e promoção do staging estável permaneceram proibidos.

`ev2.ai_execute` não recebeu override e permaneceu desligada. A decisão EV2-D04 continua pendente e
impede qualquer integração com provedor real; sua pendência não foi contornada pelo canary
inteiramente sintético.

## Preparação e implantação isolada

O preflight confirmou árvore limpa, SHA local idêntico ao remoto, projeto e região autorizados,
ausência prévia do alias G10 e os deployments estáveis usados como sentinela. O rehearsal executou a
migration completa em `BEGIN/ROLLBACK` e retornou `G10_MIGRATION_REHEARSAL_PASS`, com flags e job de
retenção restaurados, zero mutação em produção e zero chamada externa. O `dry-run` confirmou que
`0049_ev2_ai_assist.sql` era a única migration pendente.

Após a aplicação, a versão `0049` passou a constar como local/remota e o lint do banco retornou zero
erro. A função `cms-ai` v1 ficou `ACTIVE` e `verify_jwt=true`. O ambiente possui
`CMS_ENVIRONMENT` configurado, mas não possui toggle nem credencial `CMS_AI_*` de provedor externo.

| Superfície     | Evidência                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------- |
| Migration      | `0049_ev2_ai_assist.sql` aplicada somente no projeto staging                                  |
| Dados/RLS      | 11 tabelas presentes, 11 com RLS e zero grant direto para `anon`/`authenticated`              |
| Tool allowlist | quatro tools ativas, todas `mutates_cms=false`; zero política com provider externo habilitado |
| Retenção       | um job `cms-ai-retention-every-5m`                                                            |
| Edge Function  | `cms-ai` v1, `ACTIVE`, `verify_jwt=true`                                                      |
| Manifesto      | SHA-256 `44780f071d718cee99205512fa7426da6e534f49a99e6661f128bc5e5a0e5e18`                    |
| Deployment     | `1ab7fc25-d970-4d77-afad-d972a9fe486d`                                                        |
| URL imutável   | <https://1ab7fc25.gaiatec-cms-staging.pages.dev>                                              |
| Alias isolado  | <https://ev2-g10-canary.gaiatec-cms-staging.pages.dev>                                        |

O SHA candidato passou na [CI do push](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33818925497), na [CI do pull request](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33818929414) e no [workflow de preview](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33818929524).

O workflow manual `EV2.10 Canary Preview` ainda não existe no branch padrão e, por isso, não estava
disponível para despacho pela API do GitHub. Para preservar o SHA autorizado, o build foi gerado a
partir do checkout limpo e exato, com todas as flags candidatas anteriores desligadas e somente
`VITE_EV2_AI_ASSIST_CANDIDATE=true`, e publicado diretamente pelo Wrangler no branch de preview
`ev2-g10-canary`.

O manifesto do alias retornou o SHA completo e 1.435 arquivos. O smoke HTTP aprovou as rotas
públicas, dois casos 404 e `noindex`; `/admin/login` e `/admin/assistente` retornaram 200 com
`Cache-Control: no-store`.

## Resultado operacional

O runner criou um operador e um revisor exclusivamente sintéticos, elevou ambos a AAL2 e aplicou
dois overrides individuais de 29 minutos. Foram aprovadas 26 verificações:

- SHA, alias e rotas privadas exatos;
- dois usuários sintéticos com MFA e capability desligada antes do override;
- somente overrides individuais, com ativação ampla recusada de forma fail-closed;
- adaptador sintético, fallback manual, `aiExecute=false`, `realDataAllowed=false` e provider externo
  ausente/desligado;
- sessão anônima 401, produção 403 e mutação AAL1 recusada com 412;
- proposta idempotente, fonte completa, confiança explícita, custo zero e nenhuma
  aplicação/publicação;
- PII redigida antes da persistência e prompt injection recusado;
- baixa confiança pendente, aceitação direta bloqueada e resolução por edição humana;
- fila de revisão segregada, tentativa sem permissão negada e decisão humana preservando
  `applied=false` e `published=false`;
- eval sintética aprovada e allowlist auditada, incluindo decisão negativa registrada;
- revisões, outbox, flags e estado estável idênticos antes/depois;
- limpeza automática e resíduo sintético zero.

O resultado final registrou `providerMode=synthetic`, `externalProviderCalls=0`, `realDataUsed=false`,
`productionMutations=0` e `syntheticResidue=0`.

## Reconciliação e sentinelas finais

Uma consulta independente, separada do runner, confirmou zero linha residual em eventos, recibos,
tool calls, evals, propostas, mensagens, fontes, sessões, aprovações, overrides, papéis, perfis e
usuários Auth dos dois atores. As flags `ev2.ai_assist` e `ev2.ai_execute` terminaram com
`default_enabled=false` e `kill_switch=false`.

As sentinelas operacionais permaneceram em 86 revisões de conteúdo e 103 registros de outbox, os
mesmos valores anteriores ao canary. O staging estável permaneceu no deployment
`868f4382-9b99-4caa-bd51-73c70a492895`, branch `Remodelagem`, source `2042c8f`. O site público de
produção permaneceu no deployment `ff2dbb65-2f8b-4840-a9a1-f2fde29e8ebf`, branch `main`, source
`ba11310`.

## Decisão

Gate G10 aprovado. A EV2.11 está liberada para desenvolvimento no branch atual. A migration e a
função permanecem em staging com as flags globais desligadas e sem overrides; o alias candidato
continua isolado. Esta decisão não autoriza provedor externo, dados reais, F-016, produção, ativação
global, merge em `main` nem promoção do staging estável.
