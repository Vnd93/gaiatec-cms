# Roteiro da sessão humana G2

## Ações que exigem autorização/participação

1. Autorizar explicitamente um canary de staging isolado para a migration `0038`, a função `cms-drafts-v2` e build candidato, sem produção.
2. Indicar um operador comercial/editorial e um revisor técnico, identificados somente como `OP-01` e `REV-01`.
3. Reservar uma sessão acompanhada para baseline v1 das oito tarefas e comparação v2 da T01.
4. Ao final, aprovar ou rejeitar o resultado funcional; Codex consolida métricas, evidências e rollback.

Sem autorização de staging e participação humana, nenhuma medição será inventada e o G2 continuará pendente.

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
| A        | v1    | T01–T08 | 2 por tarefa | tempo ativo, espera, ações, erros, ajuda, abandono e observação |
| B        | v2    | T01     | 2            | vazio, offline, fechar/reabrir, conflito e recuperação          |
| C        | v2    | T02–T08 | posterior    | medir no gate em que cada funcionalidade estiver implementada   |

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
