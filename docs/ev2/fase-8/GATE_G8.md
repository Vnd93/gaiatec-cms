# Gate G8 — zero bypass e auditoria integral

**Resultado atual:** PENDENTE — candidato ainda não promovido a staging<br>
**Produção:** bloqueada<br>
**Flag:** `ev2.rbac_scoped`, globalmente desligada<br>
**Rollback imediato:** remover overrides individuais ou acionar kill switch<br>
**Baseline funcional validada:** `570da8ab8d6977b5e8ba01568484489b3be482c6`<br>
**CI do push:** [execução 33772888006](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33772888006)<br>
**CI do pull request:** [execução 33772893589](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33772893589)<br>
**Preview:** [execução 33772893576](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33772893576), artefato GitHub sem deploy remoto

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

A condição de CI está cumprida, mas não substitui o canary de segurança em staging. Até a execução autorizada, o status permanece **pendente**. A evidência pré-canary está consolidada no [relatório de prontidão do candidato](RELATORIO_CANDIDATO_CI_2026-09-03.md).
