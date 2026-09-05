# Roteiro da sessão humana G2

## Ações que exigem autorização/participação

1. Autorizar explicitamente um canary de staging isolado para a migration `0038`, a função `cms-drafts-v2` e build candidato, sem produção.
2. Indicar um operador comercial/editorial e um revisor técnico, identificados somente como `OP-01` e `REV-01`.
3. Reservar uma sessão acompanhada para comparação v1/v2 da T01; T02–T08 são medidos no gate da funcionalidade correspondente.
4. Ao final, aprovar ou rejeitar o resultado funcional; Codex consolida métricas, evidências e rollback.

Em 2 de setembro de 2026, a autorização, a participação `OP-01` e as duas repetições humanas v2 foram concluídas. O responsável pelo produto autorizou a execução dos cenários técnicos pelo Codex e a redução das repetições equivalentes, conforme a ADR-021. Nenhuma medição ausente pode ser inventada.

## Preparação técnica após autorização

- implantar somente no projeto de staging já governado;
- executar migration e testes de fumaça antes de habilitar UI;
- configurar `CMS_ENVIRONMENT=staging` no servidor;
- gerar build com `VITE_CMS_ENVIRONMENT=staging` e `VITE_EV2_DRAFT_V2_CANDIDATE=true`;
- criar override `ev2.draft_v2` somente para `OP-01`, com motivo, TTL máximo de 2 horas e kill switch pronto;
- usar exclusivamente o lote sintético EV2; não copiar conteúdo real ou PII;
- confirmar rollback desligando override/variável, preservando shadow data.

## Matriz de coleta

| Execução | Fluxo | Tarefas | Repetições   | Evidência                                                       |
| -------- | ----- | ------- | ------------ | --------------------------------------------------------------- |
| A        | v1    | T01     | 2 concluídas | tempo, ações, erros, ajuda, abandono e observação               |
| B        | v2    | T01     | 2            | vazio, offline, fechar/reabrir, conflito e recuperação          |
| C        | v1/v2 | T02–T08 | posterior    | medir ambas as versões no gate da funcionalidade correspondente |

Os cenários determinísticos de vazio, idempotência, conflito, isolamento, produção recusada e kill switch usam um ensaio técnico autolimpante. Acessibilidade mantém teste automatizado dedicado. Uma segunda execução técnica só é exigida após alteração da fronteira ou resultado não determinístico.

A ordem de A/B para T01 deve ser alternada entre participantes. Credenciais, PII e segredos não podem aparecer em gravação ou relatório.

## Critério do G2

- 100% das tentativas T01 v2 recuperam o rascunho sem publicação ou perda;
- nenhum overwrite silencioso no cenário concorrente;
- zero violação séria automatizada de acessibilidade e nenhuma barreira crítica observada;
- o fluxo v2 não aumenta passos sem justificativa de segurança;
- problema crítico, autorização indevida ou conclusão abaixo de 90% reprova o candidato;
- kill switch restaura v1 e mantém dados recuperáveis.

## Registro mínimo

| Campo                     | Valor |
| ------------------------- | ----- |
| data/hora e duração       |       |
| commit/build/CI           |       |
| navegador/dispositivo     |       |
| participantes codificados |       |
| ordem das execuções       |       |
| resultados por tentativa  |       |
| achados de acessibilidade |       |
| rollback executado        |       |
| decisão funcional         |       |
