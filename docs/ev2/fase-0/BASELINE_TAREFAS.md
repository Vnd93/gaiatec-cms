# Baseline das tarefas operacionais EV2

## Estado da medição

T01 recebeu duas tentativas humanas v1 e duas v2 no G2. O v1 não conseguiu salvar o rascunho parcial nas duas tentativas; o v2 recuperou 2/2 sem erro, ajuda ou perda. Como uma tentativa v1 não teve tempo separável e ambas terminaram em falha, não existe mediana quantitativa válida nem alegação de redução percentual de tempo.

Conforme a [ADR-021](../../adr/ADR-021-baseline-humano-incremental-por-gate.md), T02–T08 recebem baseline e comparação no gate em que sua funcionalidade candidata existir. Isso evita ensaios repetidos e comparação em ambientes diferentes, sem permitir números estimados.

## Protocolo controlado

- Participantes: ao menos um operador comercial/editorial e um revisor técnico.
- Ambiente: staging isolado, mesmo dispositivo/rede por comparação e dados sintéticos do lote.
- Repetições: uma por versão no gate da funcionalidade; repetir quando houver variabilidade, falha, ambiguidade ou mudança material. T01 preserva as duas repetições já realizadas.
- Coleta: tempo ativo, espera, cliques/ações, erros, ajuda solicitada, abandono, recuperação e observação livre.
- Privacidade: não gravar credenciais, PII ou tela com segredo; identificar pessoa apenas por código.
- Evidência: exportar resultado anonimizado e vincular commit, build, flag, navegador e data.

## Ficha de medição

| Tarefa                         | Baseline v1   | Meta candidata v2                            | Critério adicional                               |
| ------------------------------ | ------------- | -------------------------------------------- | ------------------------------------------------ |
| `EV2-T01` rascunho/recuperação | v1 falhou 2/2 | v2 recuperou 2/2 sem perda                   | tempo comparativo não calculado                  |
| `EV2-T02` hierarquia PIM       | gate da EV2.3 | zero duplicação indevida                     | explicar produto/modelo/variante/SKU sem ajuda   |
| `EV2-T03` atributos/unidades   | gate da fase  | erro no campo e bloqueio no gate correto     | validar conversão e dependência                  |
| `EV2-T04` mídia/direitos       | gate da fase  | zero exclusão com uso ativo                  | origem, direito, ALT e consulta de usos          |
| `EV2-T05` operação em massa    | gate da fase  | zero parcial e repetição idempotente         | dry-run antes de confirmar                       |
| `EV2-T06` busca/comparação     | gate da fase  | p95 técnico <= 500 ms e resultado explicável | faceta/unidade homologada                        |
| `EV2-T07` release composto     | gate da fase  | zero exposição parcial                       | MFA, segregação e hash da aprovação              |
| `EV2-T08` rollback             | gate da fase  | RPO 0 e RTO <= 15 min                        | projeções, busca, SEO, mídia e relações íntegras |

## Critério de aceite humano

- 100% das tarefas críticas concluídas sem perda, fuga de autorização ou publicação parcial;
- nenhum fluxo v2 pode exigir mais passos sem justificativa de segurança/governança;
- problema crítico ou taxa de conclusão abaixo de 90% reprova o candidato;
- a melhoria quantitativa será calculada contra a mediana v1 observada, nunca contra estimativa.
