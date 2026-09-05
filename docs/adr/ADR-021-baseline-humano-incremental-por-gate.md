# ADR-021 — baseline humano incremental por gate

**Status:** aprovada para EV2<br>
**Data:** 2 de setembro de 2026

## Contexto

O protocolo inicial exigia duas execuções v1 e v2 das oito tarefas antes do G2. Isso criaria uma dependência circular: T02–T08 só possuem fluxo v2 após EV2.3–EV2.12, mas essas fases dependem da aprovação do G2.

Durante a sessão G2, T01 já recebeu duas tentativas humanas v1 e duas v2. Repetir tarefas equivalentes sem funcionalidade candidata aumentaria o custo da validação sem reduzir o risco da EV2.2. Em 2 de setembro de 2026, o responsável pelo produto autorizou o Codex a executar os ensaios operacionais técnicos e a reduzir testes semelhantes.

## Decisão

- No G2, comparar v1 e v2 somente para T01, funcionalidade entregue pela EV2.2, mantendo as duas repetições humanas já realizadas.
- Conflito, idempotência, isolamento, kill switch, expiração e acessibilidade podem ser verificados pelo Codex com ensaios determinísticos e evidência reproduzível; não são convertidos em tempo ou percepção humana.
- Medir T02–T08 no gate em que o respectivo fluxo v2 existir, com uma tentativa humana v1 e uma v2 no mesmo dispositivo/rede. Exigir segunda repetição quando houver variabilidade, falha, resultado ambíguo ou alteração material do fluxo.
- Reexecutar testes determinísticos somente quando o risco ou o código coberto mudar; manter ao menos um smoke por fronteira crítica no candidato final.
- Falha, abandono ou tarefa impossível no v1 é resultado válido e deve ser registrado, nunca substituído por estimativa.
- Nenhuma alegação de eficiência é permitida para uma tarefa sem par v1/v2 observado.

## Consequências

O G2 permanece rigoroso nas fronteiras críticas e elimina repetição de baixo valor. Os ganhos das fases futuras continuam condicionados a pares humanos observados no gate correto. Como o tempo v1 de T01 não foi mensurável, o G2 aceita segurança, recuperação e conclusão, mas não declara redução percentual de tempo.

## Rollback

Se a baseline tiver protocolo inconsistente, invalidar somente as medições afetadas e repeti-las. Código, dados de rascunho e gates técnicos não são alterados por essa decisão.
