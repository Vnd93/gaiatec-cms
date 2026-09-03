# Gate G7 — atomicidade, reexecução, segregação e rollback

**Resultado atual:** APROVADO EM STAGING — 27/27 VERIFICAÇÕES<br>
**Produção:** bloqueada<br>
**Flag:** `ev2.collaboration_bulk`, globalmente desligada<br>
**Rollback funcional imediato:** desligar a flag e cancelar jobs/releases não publicados

## Critérios objetivos

| Critério             | Meta                                                                                      | Evidência final                                   |
| -------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Contratos e RLS      | migration aditiva; escrita somente service role; nenhuma linha real                       | `0045` + `0046`; zero mutação real                |
| Release composto     | duas páginas sintéticas confirmadas; página+navegação validada sem tocar o singleton real | duas páginas publicadas; sentinela intacta        |
| Atomicidade negativa | falha no segundo item produz zero projeção nova                                           | `CMS_RELEASE_ITEM_GATE_CHANGED`; projeções 0      |
| Revisão congelada    | qualquer divergência de hash ou versão bloqueia                                           | mudança após dry-run recusada em 763,5 ms         |
| Segregação           | autor/criador não aprova; revisor separado com MFA                                        | autoaprovação 409; revisor sem publicação 403     |
| Reexecução           | mesma chave retorna recibo; payload diferente conflita                                    | replay estável e colisão recusada                 |
| Inbox                | comentário abre revisão/bloco/rota exatos                                                 | âncora, menção, resolução e reabertura aprovadas  |
| Histórico e diff     | conversa/eventos sob demanda; campos alterados identificados                              | detalhe e histórico com quatro ou mais eventos    |
| Notificação          | menção in-app entregue; falha externa permanece visível                                   | `completed/delivered` e falha `failed` visível    |
| Massa                | erro por linha/campo; dry-run produz zero writes                                          | erro por item, `writes: 0` e lote válido atômico  |
| Concorrência         | mudança após dry-run bloqueia todo o lote                                                 | HTTP 409 via `PT409`, sem retry de serialização   |
| Rollback             | RPO 0 e duração menor que 5 minutos                                                       | snapshot restaurado em 739,4 ms                   |
| Limpeza              | zero override, usuário e dado sintético residual                                          | runner e consulta independente com todos os zeros |

## Decisão

Em 3 de setembro de 2026, a correção aditiva `0046_ev2_conflict_transport_hardening.sql` foi aplicada somente em staging e as três APIs afetadas foram republicadas. O build do SHA autorizado `952bf75b4047ebeaa918767b9ab6cfe522bafb41` permaneceu isolado no alias `ev2-g7-canary`.

O canary final passou **27/27 verificações**, incluindo os dois resultados de notificação, conflito de massa em HTTP 409, publicação composta atômica, rollback RPO 0, segregação e idempotência. A auditoria independente confirmou zero resíduo sintético, flag global desligada, navegação real intacta e ausência de mudança em produção e no staging estável. O Gate G7 está **aprovado e encerrado**. Consulte o [relatório completo](RELATORIO_CANARY_STAGING_2026-09-03.md).
