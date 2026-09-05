# Gate G6 — relevância, qualidade e SLO

**Resultado atual:** APROVADO EM STAGING — 34/34 VERIFICAÇÕES<br>
**Produção:** bloqueada<br>
**Rollback:** desligar `ev2.search_quality`, restaurando busca/publicação v1 sem remover dados

## Critérios objetivos

| Critério         | Meta                                                                    | Evidência final                          |
| ---------------- | ----------------------------------------------------------------------- | ---------------------------------------- |
| Contratos e RLS  | migration aditiva, escrita somente service role e nenhum dado real      | `0044`; RLS ativa; zero dado real        |
| Privacidade      | zero valor interno no índice/resultado público                          | índice sombra sanitizado e `anon` 401    |
| Relevância       | consultas sintéticas de intenção, modelo, unidade e contexto aprovadas  | sinônimo, pin, bury e redirect aprovados |
| Facetas e ranges | filtros coerentes por categoria; somente atributos homologados          | faceta válida; nenhum range inferido     |
| Zero resultado   | evento anônimo com refinamentos e recuperação clara                     | payload zero e analytics eventual        |
| Governança       | pin/bury/redirect e sinônimo com motivo, owner, vigência e auditoria    | round-trip e auditoria aprovados         |
| Qualidade        | erro bloqueia; alerta orienta; exceção expira e exige permissão         | bloqueio, correção e waiver AAL2         |
| SLO público      | p95 menor que 400 ms no conjunto homologado                             | **351 ms em 20 amostras**                |
| SLO admin        | p95 menor que 1 s                                                       | **807 ms de servidor em 20 amostras**    |
| Indexação        | p95 menor que 60 s                                                      | **43.667 ms**                            |
| Bundle           | nenhum chunk inicial maior que 600 KiB; Excel/PDF fora do grafo inicial | 4 chunks; Excel/PDF sob demanda          |
| Reversibilidade  | flag off restaura v1 e índice sombra pode ser descartado                | default-off e kill switch preservados    |

As evidências completas, incluindo versões, deployment, diagnósticos e auditoria de resíduo zero, estão no [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-02.md).
