# Gate G8 — zero bypass e auditoria integral

**Resultado atual:** G8 APROVADO PARA INICIAR EV2.9 — PRODUÇÃO CONTINUA BLOQUEADA<br>
**Produção:** bloqueada<br>
**Flag:** `ev2.rbac_scoped`, globalmente desligada<br>
**Rollback imediato:** remover overrides individuais ou acionar kill switch<br>
**SHA candidato executado:** `896d0c6019bf5f0e3d65d2dc527ae10d1da5dd9a`<br>
**Deployment:** `385bb13e-9b0d-4cc0-9494-f43391eeb809`<br>
**Alias:** <https://ev2-g8-canary.gaiatec-cms-staging.pages.dev><br>
**CI do push:** [execução 33773724120](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33773724120)<br>
**CI do pull request:** [execução 33773728566](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33773728566)<br>
**Preview:** [execução 33773728731](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33773728731), artefato GitHub sem deploy remoto

## Critérios objetivos

| Critério                  | Meta                                                                                 | Evidência exigida                   |
| ------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| Compatibilidade           | identidade sem override mantém RBAC atual                                            | teste antes/depois do override      |
| Isolamento do canary      | somente overrides individuais; ativação ampla falha fechada                          | capability e sessão recusadas       |
| Autenticação              | 401 sem sessão; sessão revogada perde acesso imediatamente                           | API e teste de política             |
| MFA                       | toda ação crítica sem AAL2 retorna 412                                               | token AAL1 sintético                |
| Menor privilégio          | editor não publica nem administra scopes                                             | API direta 403 e zero projeção      |
| RLS                       | cliente autenticado não lê/escreve tabelas privadas nem executa RPC interna          | testes negativos de grants/RLS      |
| Segregação                | autoelevação e remoção do último superadministrador retornam 409                     | testes transacionais                |
| Delegação                 | `super_admin` temporário e prazo acima de 30 dias recusados; expiração efetiva       | testes negativo e temporal          |
| Concorrência/idempotência | versão obsoleta e chave divergente retornam 409; replay não duplica                  | recibos e contagem de eventos       |
| Decisões                  | 100% das avaliações do runner têm uma decisão `allow/deny`, motivo e sessão hasheada | correlação exata do runner          |
| Mutações                  | 100% das mutações bem-sucedidas têm recibo e auditoria `before/after`                | contagens idênticas                 |
| Produção/dados reais      | zero mutação; apenas dados sintéticos descartáveis em staging                        | relatório e sentinelas              |
| Limpeza                   | zero usuário, scope, decisão, override e conteúdo sintético residual                 | consulta independente após o runner |

## Regra de decisão

O Gate G8 será aprovado somente se todos os critérios passarem no mesmo SHA candidato, sem exceção manual, sem resíduo e sem alteração global. Qualquer bypass, falta de auditoria, acesso sem AAL2, mutação parcial ou falha de limpeza reprova o gate e aciona contenção.

Todos os critérios do gate passaram no mesmo SHA candidato. O runner concluiu 27/27 verificações, correlacionou 15/15 decisões, reconciliou 3/3 mutações com recibos e auditoria e removeu integralmente os dados sintéticos. A reconciliação independente confirmou zero usuário, perfil, papel sintético, scope, decisão, recibo, override, conteúdo ou evento residual.

G8 está aprovado e a EV2.9 pode iniciar. A aprovação não autoriza produção, dados reais, ativação global, merge em `main` ou promoção do staging estável. A evidência completa está no [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-03.md).
