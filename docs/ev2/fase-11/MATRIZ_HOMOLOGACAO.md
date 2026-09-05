# Matriz de homologação — EV2.11 / G11

Nenhum item manual foi presumido. A autorização do responsável adotou o protocolo reduzido da
ADR-021 e aceitou as evidências objetivas, sem criar métricas de uma sessão manual inexistente.

| Trilha         | Cenário mínimo                                                      | Evidência automatizada                         | Evidência humana                            | Owner     | Estado                                |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------- | --------- | ------------------------------------- |
| Operacional    | fila falha, retenta, chega a dead-letter e recupera                 | pgTAP + canary + snapshot                      | aceite organizacional do protocolo reduzido | Tech/Ops  | aprovado                              |
| Funcional      | conteúdo, campanha, formulário e lead preservam fluxo existente     | regressão completa + testes F-017              | aceite organizacional do protocolo reduzido | Produto   | aprovado                              |
| Dados          | publicação/projeção e lead/consentimento/histórico/outbox convergem | `cms_get_system_snapshot`                      | relatório e amostra sem divergência         | Data      | aprovado                              |
| Permissões     | anônimo/AAL1 negados; MFA e escopo individual aceitos               | pgTAP/RLS + negativos do canary                | parecer Security do registro de aceite      | Security  | aprovado no escopo staging            |
| Público        | rotas, status, SEO e ausência de vazamento                          | Playwright/smoke/axe                           | aceite por equivalência de risco            | Produto   | aprovado                              |
| Não funcional  | disponibilidade, p95 de leitura/comando/outbox                      | carga HTTP e relatório G11                     | capacidade aceita no registro               | Tech Lead | aprovado                              |
| IA             | falha/ausência da IA não bloqueia fluxo manual                      | regressão com candidate de IA desligado        | fallback manual preservado                  | Produto   | aprovado; provider continua bloqueado |
| LGPD           | nenhum dado real; exportar/anonimizar/replay auditados              | schemas, RLS, métricas numéricas, anonimização | parecer LGPD restrito ao escopo sintético   | DPO       | aprovado no escopo sintético          |
| Restore        | conjunto sintético restaura com checksum, RPO 0 e RTO medido        | `runRestoreDrill` transacional                 | relatório aceito sob protocolo reduzido     | Tech/Ops  | aprovado                              |
| Acessibilidade | jornadas críticas sem critical/serious; teclado                     | Axe/Playwright em desktop e mobile             | aceite por equivalência; sem métrica manual | Produto   | aprovado                              |

## Critérios de saída

- todas as linhas possuem evidência do mesmo SHA;
- zero P0/P1, zero violação critical/serious e zero fuga de escopo;
- disponibilidade e latências dentro dos budgets;
- restore com RPO 0/RTO até 15 minutos;
- operador da medição e revisor do aceite são pessoas/contas distintas;
- dados usados no canary são exclusivamente sintéticos e terminam anonimizados;
- nenhuma alteração em produção, domínio real, `main` ou staging estável;
- aceite humano registrado sem substituir a evidência automatizada.

Todas as linhas foram aceitas nos limites registrados. G11 libera EV2.12 local/staging; não libera
produção.
