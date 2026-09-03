# Gate G7 — atomicidade, reexecução, segregação e rollback

**Resultado atual:** CANARY PAUSADO CONTROLADAMENTE — CORREÇÃO `0046` PRONTA, APLICAÇÃO PENDENTE<br>
**Produção:** bloqueada<br>
**Flag:** `ev2.collaboration_bulk`, globalmente desligada<br>
**Rollback funcional imediato:** desligar a flag e cancelar jobs/releases não publicados

## Critérios objetivos

| Critério             | Meta                                                                                      | Evidência antes do canary                        |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Contratos e RLS      | migration aditiva; escrita somente service role; nenhuma linha real                       | `0045` e testes estáticos                        |
| Release composto     | duas páginas sintéticas confirmadas; página+navegação validada sem tocar o singleton real | transação, dependências e sentinela da navegação |
| Atomicidade negativa | falha no segundo item produz zero projeção nova                                           | cenário obrigatório do canary                    |
| Revisão congelada    | qualquer divergência de hash ou versão bloqueia                                           | `plan_hash`, `frozen_hash` e lock otimista       |
| Segregação           | autor/criador não aprova; revisor separado com MFA                                        | regra no banco e teste negativo                  |
| Reexecução           | mesma chave retorna recibo; payload diferente conflita                                    | recibo EV2 por domínio/ação                      |
| Inbox                | comentário abre revisão/bloco/rota exatos                                                 | âncora estruturada e teste de navegação          |
| Histórico e diff     | conversa/eventos sob demanda; campos alterados identificados                              | detalhe da tarefa e comparação do release        |
| Notificação          | menção in-app entregue; falha externa permanece visível                                   | outbox e tarefa de falha                         |
| Massa                | erro por linha/campo; dry-run produz zero writes                                          | relatório por alvo e `writes: 0`                 |
| Concorrência         | mudança após dry-run bloqueia todo o lote                                                 | versão esperada revalidada na execução           |
| Rollback             | RPO 0 e duração menor que 5 minutos                                                       | snapshot materializado e medição do canary       |
| Limpeza              | zero override, usuário e dado sintético residual                                          | consulta independente pós-canary                 |

## Decisão

Em 3 de setembro de 2026, o canary autorizado aplicou a `0045`, publicou as quatro funções e o build isolado, e passou pelos cenários de release, segregação, atomicidade, rollback, idempotência e colaboração. O cenário de concorrência do lote revelou que conflitos de negócio persistentes usavam `SQLSTATE 40001`, reservado a falhas de serialização retentáveis. A chamada foi abortada pelo timeout controlado, sem bloqueio PostgreSQL e com resíduo sintético zero confirmado pelo runner e por consulta independente.

A correção aditiva `0046_ev2_conflict_transport_hardening.sql` substitui apenas esses códigos internos por `PT409`, preservando o rollback transacional e entregando HTTP 409 sem retry automático. O rehearsal da `0046` passou com rollback comprovado, e os testes EV2.7 estão 6/6. O G7 permanece pendente até autorização para aplicar a `0046` em staging, republicar `cms-releases`, `cms-collaboration` e `cms-bulk`, e repetir o canary sintético completo.
