# Gate G7 — atomicidade, reexecução, segregação e rollback

**Resultado atual:** CANDIDATO LOCAL IMPLEMENTADO — CANARY DE STAGING PENDENTE<br>
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

O código pode seguir para revisão e preparação do artefato. Migration, funções e build EV2.7 não podem ser aplicados em staging sem autorização explícita do canary. O G7 só será aprovado com todas as evidências da tabela, testes integrais verdes e relatório versionado.
