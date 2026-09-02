# ADR-021 — baseline humano incremental por gate

**Status:** aprovada para EV2<br>
**Data:** 2 de setembro de 2026

## Contexto

O protocolo inicial exigia duas execuções v1 e v2 das oito tarefas antes do G2. Isso criaria uma dependência circular: T02–T08 só possuem fluxo v2 após EV2.3–EV2.12, mas essas fases dependem da aprovação do G2.

## Decisão

- Antes do G2, medir o fluxo v1 das oito tarefas para formar a baseline observada.
- No G2, comparar v1 e v2 somente para T01, funcionalidade entregue pela EV2.2.
- Em cada gate posterior, executar e comparar o fluxo v2 das tarefas que passaram a existir naquela fase.
- Manter duas repetições, ordem alternada, mesmos participantes/dispositivo/rede e dados sintéticos.
- Falha, abandono ou tarefa impossível no v1 é resultado válido e deve ser registrado, nunca substituído por estimativa.
- Nenhuma alegação de eficiência é permitida para uma tarefa sem par v1/v2 observado.

## Consequências

O G2 permanece rigoroso e executável, enquanto os ganhos das fases futuras continuam condicionados a evidência humana no gate correto. A baseline v1 antecipada reduz viés de memória e mudança de ambiente.

## Rollback

Se a baseline tiver protocolo inconsistente, invalidar somente as medições afetadas e repeti-las. Código, dados de rascunho e gates técnicos não são alterados por essa decisão.
