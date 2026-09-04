# Gate G13 — hardening pré-produção e runtime

**Decisão atual:** NÃO APROVADO<br>
**Escopo liberado:** implementação e validação local<br>
**Staging:** rehearsal/canary pendentes<br>
**Produção:** bloqueada

## Critérios vinculantes

| Critério      | Evidência exigida                                                              | Estado atual                              |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------- |
| CI integral   | lint sem erro, typecheck, testes, evals, build e audit sem alta/crítica        | pendente do SHA final                     |
| Migration     | `0053` aditiva, rehearsal com rollback e pgTAP                                 | implementação local concluída             |
| Funções       | `cms-session` e `cms-public` com `deno check` e versões de staging registradas | typecheck local aprovado; deploy pendente |
| Manifesto     | 13 capacidades, schema/ambiente/site/data válidos e fallback indisponível      | testes locais aprovados                   |
| Identidade    | override único ≤30 min, sem amplo paralelo; isolamento entre atores            | canary pendente                           |
| Revogação     | capacidade deixa de ser elegível em até 60 segundos                            | unidade aprovada; canary pendente         |
| Negativos     | anônimo, escopo amplo, ambiente divergente e produção falham fechados          | local aprovado; staging pendente          |
| Busca pública | v1 preservada; `search-v2` anônimo retorna 404                                 | local aprovado; staging pendente          |
| Resíduo       | zero ator, credencial e override sintético ativos                              | canary pendente                           |
| Release       | SHA completo igual em checkout, header, health e manifest                      | canary pendente                           |
| Limites       | zero produção, dado/domínio real, ativação global e promoção estável           | obrigatório                               |

## Decisão

O G13 será aprovado apenas com todas as linhas atendidas pelo mesmo SHA e relatório versionado. Falha
de manifesto, mismatch, acesso cruzado entre usuários, revogação acima de 60 segundos, resíduo ativo,
budget excedido ou qualquer mutação fora de staging produz `pause`.

O workflow de candidate preview não é evidência suficiente do gate: migration `0053`, versões das
funções, executor integrado e limpeza devem constar no relatório do mesmo SHA.

Mesmo aprovado, G13 não equivale ao Gate G12 de produção. A evidência G12 histórica anterior ao
hardening não satisfaz o novo vínculo criptográfico nem a semântica explícita de tombstones; uma
requalificação controlada será necessária antes de qualquer pedido de produção.
