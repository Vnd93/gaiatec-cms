# Gate G6 — relevância, qualidade e SLO

**Resultado atual:** AGUARDANDO CANARY AUTORIZADO EM STAGING<br>
**Produção:** bloqueada<br>
**Rollback:** desligar `ev2.search_quality`, restaurando busca/publicação v1 sem remover dados

## Critérios objetivos

| Critério         | Meta                                                                    |
| ---------------- | ----------------------------------------------------------------------- |
| Contratos e RLS  | migration aditiva, escrita somente service role e nenhum dado real      |
| Privacidade      | zero valor interno no índice/resultado público                          |
| Relevância       | consultas sintéticas de intenção, modelo, unidade e contexto aprovadas  |
| Facetas e ranges | filtros coerentes por categoria; somente atributos homologados          |
| Zero resultado   | evento anônimo com refinamentos e recuperação clara                     |
| Governança       | pin/bury/redirect e sinônimo com motivo, owner, vigência e auditoria    |
| Qualidade        | erro bloqueia; alerta orienta; exceção expira e exige permissão         |
| SLO público      | p95 menor que 400 ms no conjunto homologado                             |
| SLO admin        | p95 menor que 1 s                                                       |
| Indexação        | p95 menor que 60 s                                                      |
| Bundle           | nenhum chunk inicial maior que 600 KiB; Excel/PDF fora do grafo inicial |
| Reversibilidade  | flag off restaura v1 e índice sombra pode ser descartado                |

O Gate só será marcado como aprovado depois das evidências do canary isolado e da comprovação de resíduo sintético zero.
