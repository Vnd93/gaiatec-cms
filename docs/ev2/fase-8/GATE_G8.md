# Gate G8 — zero bypass e auditoria integral

**Resultado atual:** PENDENTE — candidato ainda não promovido a staging<br>
**Produção:** bloqueada<br>
**Flag:** `ev2.rbac_scoped`, globalmente desligada<br>
**Rollback imediato:** remover overrides individuais ou acionar kill switch

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

Até a execução autorizada, o status permanece **pendente**. Um build verde no CI é necessário, mas não substitui o canary de segurança em staging.
