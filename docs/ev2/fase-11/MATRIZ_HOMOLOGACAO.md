# Matriz de homologação — EV2.11 / G11

Nenhum item manual é presumido como concluído. A coluna “estado” separa cobertura implementada de
evidência que ainda depende de staging ou de aceite humano.

| Trilha         | Cenário mínimo                                                      | Evidência automatizada                         | Evidência humana                             | Owner     | Estado                                   |
| -------------- | ------------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------- | --------- | ---------------------------------------- |
| Operacional    | fila falha, retenta, chega a dead-letter e recupera                 | pgTAP + canary + snapshot                      | operador confirma recuperação acionável      | Tech/Ops  | staging aprovado; UAT pendente           |
| Funcional      | conteúdo, campanha, formulário e lead preservam fluxo existente     | regressão completa + testes F-017              | editor/marketing/comercial percorrem tarefas | Produto   | automação aprovada; UAT pendente         |
| Dados          | publicação/projeção e lead/consentimento/histórico/outbox convergem | `cms_get_system_snapshot`                      | responsável valida amostra e relatório       | Data      | staging sem divergência; aceite pendente |
| Permissões     | anônimo/AAL1 negados; MFA e escopo individual aceitos               | pgTAP/RLS + negativos do canary                | Security revisa matriz efetiva               | Security  | automação aprovada; revisão pendente     |
| Público        | rotas, status, SEO e ausência de vazamento                          | Playwright/smoke/axe                           | Produto valida páginas críticas              | Produto   | staging aprovado; UAT pendente           |
| Não funcional  | disponibilidade, p95 de leitura/comando/outbox                      | carga HTTP e relatório G11                     | Tech Lead aceita capacidade                  | Tech Lead | SLOs aprovados; aceite pendente          |
| IA             | falha/ausência da IA não bloqueia fluxo manual                      | regressão com candidate de IA desligado        | operador confirma fallback manual            | Produto   | contrato implementado; UAT pendente      |
| LGPD           | nenhum dado real; exportar/anonimizar/replay auditados              | schemas, RLS, métricas numéricas, anonimização | DPO revisa evidência e retenção              | DPO       | local implementado; aceite pendente      |
| Restore        | conjunto sintético restaura com checksum, RPO 0 e RTO medido        | `runRestoreDrill` transacional                 | REV-01 valida relatório do exercício         | Tech/Ops  | RPO/RTO aprovados; aceite pendente       |
| Acessibilidade | jornadas críticas sem critical/serious; teclado                     | Axe/Playwright em desktop e mobile             | OP-01 verifica clareza e teclado             | Produto   | axe aprovado; UAT pendente               |

## Critérios de saída

- todas as linhas possuem evidência do mesmo SHA;
- zero P0/P1, zero violação critical/serious e zero fuga de escopo;
- disponibilidade e latências dentro dos budgets;
- restore com RPO 0/RTO até 15 minutos;
- operador da medição e revisor do aceite são pessoas/contas distintas;
- dados usados no canary são exclusivamente sintéticos e terminam anonimizados;
- nenhuma alteração em produção, domínio real, `main` ou staging estável;
- aceite humano registrado sem substituir a evidência automatizada.

Qualquer linha pendente mantém G11 pendente e impede EV2.12.
