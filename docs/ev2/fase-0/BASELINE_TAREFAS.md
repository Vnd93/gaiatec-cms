# Baseline das tarefas operacionais EV2

## Estado da medição

As oito tarefas e o lote foram aprovados, mas não houve sessão humana cronometrada e observada neste gate. Registrar números estimados como baseline distorceria o ganho de UX; por isso, os campos permanecem explicitamente `não medido`.

Essa ausência não bloqueia a fundação EV2.1, que fica desligada e não muda a UX. Ela bloqueia a aceitação do G2: nenhuma alegação de redução de tempo, clique, erro ou retrabalho será aceita antes da rodada abaixo. Conforme a [ADR-021](../../adr/ADR-021-baseline-humano-incremental-por-gate.md), o G2 exige baseline v1 de T01–T08 e comparação v2 de T01; T02–T08 recebem comparação v2 no gate em que forem implementadas.

## Protocolo controlado

- Participantes: ao menos um operador comercial/editorial e um revisor técnico.
- Ambiente: staging isolado, mesmo dispositivo/rede por comparação e dados sintéticos do lote.
- Repetições: duas por tarefa no fluxo v1; duas no fluxo candidato v2 quando a respectiva funcionalidade existir; alternar a ordem para reduzir aprendizado.
- Coleta: tempo ativo, espera, cliques/ações, erros, ajuda solicitada, abandono, recuperação e observação livre.
- Privacidade: não gravar credenciais, PII ou tela com segredo; identificar pessoa apenas por código.
- Evidência: exportar resultado anonimizado e vincular commit, build, flag, navegador e data.

## Ficha de medição

| Tarefa                         | Baseline v1 | Meta candidata v2                            | Critério adicional                               |
| ------------------------------ | ----------- | -------------------------------------------- | ------------------------------------------------ |
| `EV2-T01` rascunho/recuperação | não medido  | zero perda e recuperação inequívoca          | fechar/reabrir e simular offline/conflito        |
| `EV2-T02` hierarquia PIM       | não medido  | zero duplicação indevida                     | explicar produto/modelo/variante/SKU sem ajuda   |
| `EV2-T03` atributos/unidades   | não medido  | erro no campo e bloqueio no gate correto     | validar conversão e dependência                  |
| `EV2-T04` mídia/direitos       | não medido  | zero exclusão com uso ativo                  | origem, direito, ALT e consulta de usos          |
| `EV2-T05` operação em massa    | não medido  | zero parcial e repetição idempotente         | dry-run antes de confirmar                       |
| `EV2-T06` busca/vergleich      | não medido  | p95 técnico <= 500 ms e resultado explicável | faceta/unidade homologada                        |
| `EV2-T07` release composto     | não medido  | zero exposição parcial                       | MFA, segregação e hash da aprovação              |
| `EV2-T08` rollback             | não medido  | RPO 0 e RTO <= 15 min                        | projeções, busca, SEO, mídia e relações íntegras |

## Critério de aceite humano

- 100% das tarefas críticas concluídas sem perda, fuga de autorização ou publicação parcial;
- nenhum fluxo v2 pode exigir mais passos sem justificativa de segurança/governança;
- problema crítico ou taxa de conclusão abaixo de 90% reprova o candidato;
- a melhoria quantitativa será calculada contra a mediana v1 observada, nunca contra estimativa.
