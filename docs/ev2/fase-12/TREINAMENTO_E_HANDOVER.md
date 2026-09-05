# Treinamento e handover EV2.12

## Papéis mínimos

| Papel                       | Responsabilidade                                     |
| --------------------------- | ---------------------------------------------------- |
| operador de mudança         | coordena checklist, execução e comunicação           |
| revisor técnico             | valida SHA, CI, telemetria, projeções e recuperação  |
| segurança/privacidade       | aprova threat/privacy review e ausência de exposição |
| owner de negócio            | aceita impacto, janela e critérios de interrupção    |
| on-call primário/secundário | responde alertas e executa contenção/rollback        |

Os quatro aprovadores do registro G12 devem ter identidades distintas. A proteção GitHub exige dois
reviews de PR distintos do autor. Required reviewers do ambiente são um reforço opcional quando o
plano privado oferecer esse recurso.

## Conteúdo obrigatório

1. localizar SHA, deployment, ambiente, manifest e correlação;
2. interpretar `/healthz`, `X-Release`, budgets e decisão `continue/pause/rollback`;
3. executar e interromper o canary sem ativação ampla;
4. desligar overrides/flags e confirmar zero resíduo;
5. iniciar rollback automático/manual e validar a release restaurada;
6. preservar evidência sem segredos ou dados pessoais;
7. comunicar incidente, impacto, responsável e próximo checkpoint;
8. escalar falha de banco, outbox, provider, segurança ou privacidade.

## Exercícios de aceitação

- mismatch proposital de SHA bloqueado antes do deploy;
- aprovação pendente ou owners repetidos recusados;
- alvo Supabase de staging recusado pelo fluxo produtivo;
- tentativa de pular estágio resulta em `pause`;
- falha de probe leva ao rollback do deployment anterior;
- preview informado como rollback é recusado;
- operador localiza os runbooks e descreve RPO/RTO sem ajuda.
- operador recupera o backup externo cifrado e prova o restore em alvo efêmero;
- validação CSP no preview produtivo termina sem violação crítica;
- teste sintético do Resend termina em evento de entrega.

## Evidência

Registrar participantes, papéis, data, ambiente, cenário, tempo, ajuda solicitada, erros e resultado.
Não marcar treinamento ou drill como concluído sem execução observada. A sessão de handover será
agendada somente após o canary G12 e antes de qualquer decisão de produção.

## Encerramento

O handover é aceito quando os owners assinam o registro G12, on-call primário/secundário estão ativos,
os exercícios críticos foram aprovados e a documentação reflete o ambiente real. Passagem de tempo
ou documentação isolada não substitui a execução.
