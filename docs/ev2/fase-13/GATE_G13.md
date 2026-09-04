# Gate G13 — hardening pré-produção e runtime

**Decisão atual:** APROVADO<br>
**Escopo aprovado:** hardening e elegibilidade runtime no canary isolado<br>
**Staging:** canary G13 concluído; alias estável não promovido<br>
**Produção:** bloqueada

## Critérios vinculantes

| Critério      | Evidência exigida                                                              | Estado atual                        |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| CI integral   | lint sem erro, typecheck, testes, evals, build e audit sem alta/crítica        | aprovado no SHA `518e8e5…`          |
| Migration     | `0053` aditiva, rehearsal com rollback e pgTAP                                 | aprovada e aplicada em staging      |
| Funções       | `cms-session` e `cms-public` com `deno check` e versões de staging registradas | v14 e v34 ativas                    |
| Manifesto     | 13 capacidades, schema/ambiente/site/data válidos e fallback indisponível      | aprovado                            |
| Identidade    | override único ≤30 min, sem amplo paralelo; isolamento entre atores            | aprovado com dois usuários MFA      |
| Revogação     | capacidade deixa de ser elegível em até 60 segundos                            | aprovada em 1.227 ms                |
| Negativos     | anônimo, escopo amplo, ambiente divergente e produção falham fechados          | aprovado                            |
| Busca pública | v1 preservada; `search-v2` anônimo retorna 404                                 | aprovado                            |
| Resíduo       | zero ator, credencial e override sintético ativos                              | aprovado; dois tombstones separados |
| Release       | SHA completo igual em checkout, header, health e manifest                      | aprovado                            |
| Limites       | zero produção, dado/domínio real, ativação global e promoção estável           | atendido                            |

## Decisão

O G13 será aprovado apenas com todas as linhas atendidas pelo mesmo SHA e relatório versionado. Falha
de manifesto, mismatch, acesso cruzado entre usuários, revogação acima de 60 segundos, resíduo ativo,
budget excedido ou qualquer mutação fora de staging produz `pause`.

O workflow de candidate preview não é evidência suficiente do gate: migration `0053`, versões das
funções, executor integrado e limpeza devem constar no relatório do mesmo SHA.

O relatório vinculante é [RELATORIO_CANARY_STAGING_2026-09-04.md](RELATORIO_CANARY_STAGING_2026-09-04.md).

G13 não equivale ao Gate G12 de produção. A evidência G12 histórica anterior ao
hardening não satisfaz o novo vínculo criptográfico nem a semântica explícita de tombstones; uma
requalificação controlada será necessária antes de qualquer pedido de produção.
