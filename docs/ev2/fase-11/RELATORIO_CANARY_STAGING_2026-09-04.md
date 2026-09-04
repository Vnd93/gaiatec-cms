# Relatório do canary EV2.11 em staging

**Data:** 4 de setembro de 2026<br>
**Resultado:** APROVADO — 27/27 verificações do runner e 22/22 medições persistidas<br>
**SHA autorizado e executado:** `8321f1291860e9ca55d3e17e3c1ce36123d0d025`<br>
**Supabase:** `GAIATEC CMS Staging` — `glcqsosxwgmlhzgcsnzv`, `us-east-2`<br>
**Assurance run:** `7466a0d3-021f-4c60-ad82-61e76b93844f`, estado `accepted`<br>
**Produção:** não alterada

## Autorização e limites

A execução final ocorreu após autorização explícita para aplicar somente a migration `0052`,
republicar somente `cms-system` e `cms-leads`, preservar `cms-outbox-worker` v22 e atualizar apenas o
alias `ev2-g11-canary` para o SHA exato. O runner usou dois usuários exclusivamente sintéticos com
MFA e overrides individuais de até 30 minutos.

Produção, dados reais, ativação global, promoção do staging estável e alteração do worker ficaram
fora do escopo e permaneceram bloqueados. O aceite técnico sintético registrado no banco não
substitui UAT, Security, DPO nem o aceite humano OP-01/REV-01 previsto na matriz.

## Correção e implantação isolada

A rodada anterior preservou os limites estritos, mas falhou por `adminReadP95Ms=556` diante da meta
de 500 ms e `commandP95Ms=807` diante da meta de 800 ms. A migration aditiva
`0052_ev2_system_assurance_rate_limit_fusion.sql` fundiu o rate limit e a operação protegida em uma
única transação de banco, eliminando uma ida sequencial ao backend sem reduzir os SLOs nem remover
controles de segurança.

Antes da aplicação, o rehearsal completo executou em transação e comprovou rollback, quatro
wrappers presentes, rate limit fail-closed, zero mutação de produção e nenhum dado real. O SHA
autorizado passou na
[CI do push](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33872587555), na
[CI do pull request](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33872590701)
e no
[workflow de preview](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33872590725).

O preflight remoto confirmou árvore limpa, SHA local/remoto idêntico, migration remota em `0051`,
projeto/região autorizados e `cms-outbox-worker` v22. Após a execução, `0052` passou a constar como
local/remota e o lint do banco retornou zero erro.

| Superfície        | Evidência                                                                |
| ----------------- | ------------------------------------------------------------------------ |
| Migration         | `0052_ev2_system_assurance_rate_limit_fusion.sql` aplicada só em staging |
| Wrappers          | quatro funções transacionais instaladas e não expostas diretamente       |
| `cms-system`      | v3, `ACTIVE`, `verify_jwt=true`                                          |
| `cms-leads`       | v12, `ACTIVE`, `verify_jwt=true`                                         |
| Worker preservado | `cms-outbox-worker` v22, hash `7c5721d29cd45d8a…`, sem republicação      |
| Deployment        | `8e7b07a3-47bf-45a8-9331-dc6cc4df7a6a`                                   |
| URL imutável      | <https://8e7b07a3.gaiatec-cms-staging.pages.dev>                         |
| Alias isolado     | <https://ev2-g11-canary.gaiatec-cms-staging.pages.dev>                   |
| Manifesto         | SHA completo autorizado, 1.435 arquivos e `noindex`                      |
| Staging estável   | manifesto candidato ausente; não promovido                               |

Os smokes HTTP na URL imutável e no alias aprovaram as rotas públicas, dois casos 404 e a política
`noindex, nofollow, noarchive`.

## Resultado operacional

O canary aprovou 27/27 verificações, com zero P0/P1. A medição persistida contém os 22 checks que
compõem o Gate G11; os cinco checks adicionais do runner cobrem pré-condições, segregação e limpeza.

| Indicador                  | Resultado | Limite do Gate | Estado   |
| -------------------------- | --------- | -------------- | -------- |
| Disponibilidade            | 100%      | >= 99,9%       | aprovado |
| Leitura administrativa p95 | 408 ms    | <= 500 ms      | aprovado |
| Comando p95                | 666 ms    | <= 800 ms      | aprovado |
| Lag de outbox p95          | 0 ms      | <= 60.000 ms   | aprovado |
| Cobertura de auditoria     | 100%      | 100%           | aprovado |
| Restore RPO                | 0 min     | 0 min          | aprovado |
| Restore RTO                | 5,642 s   | <= 15 min      | aprovado |
| Axe critical/serious       | 0/0       | 0/0            | aprovado |

Também foram registradas, para observabilidade, latências wall-clock p95 de 628 ms nas leituras e
2.316 ms nos comandos. Elas incluem rede e cliente e não substituem o `Server-Timing` usado no SLO
de backend, mas permanecem disponíveis para otimização contínua.

Os testes confirmaram bloqueio de acesso anônimo e do ambiente de produção, exigência de MFA,
recusa de override amplo, preservação do lead após falha, retry idempotente, transição para
dead-letter, resolução do alerta na recuperação, reconciliação sem divergências e revisão por ator
diferente do operador.

## Reconciliação e limpeza final

O runner anonimizou o lead, removeu os overrides, suspendeu os perfis e baniu as credenciais. Uma
consulta independente posterior confirmou:

- 0 perfis sintéticos ativos;
- 0 credenciais sintéticas ativas;
- 0 overrides sintéticos;
- 0 payloads pessoais de lead não anonimizados;
- quatro wrappers da migration `0052` presentes;
- `ev2.system_assurance` com `default_enabled=false` e `kill_switch=false`;
- assurance run `accepted`, 22/22, sintético, sem dado real e com revisor segregado.

O resultado estruturado final registrou `G11_CANARY_PASS`, `realDataUsed=false`,
`productionMutations=0`, `stablePromoted=false` e `syntheticResidue=0`.

## Decisão

O canary técnico da EV2.11 está aprovado no SHA autorizado, mantendo banco e funções em staging,
flags globais desligadas, nenhum override ativo e o alias candidato isolado. A autorização posterior
do responsável aceitou as evidências sob o protocolo reduzido, documentado no
[registro de aceite](REGISTRO_ACEITE_G11_2026-09-04.md), e liberou a preparação da EV2.12. Esta
execução não autoriza produção, dados reais, ativação global, merge em `main` nem promoção do staging
estável.
