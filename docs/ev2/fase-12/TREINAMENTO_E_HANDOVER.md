# Treinamento e handover EV2.12

## Papéis mínimos

| Papel                       | Responsabilidade                                     |
| --------------------------- | ---------------------------------------------------- |
| operador de mudança         | coordena checklist, execução e comunicação           |
| revisor técnico             | valida SHA, CI, telemetria, projeções e recuperação  |
| segurança/privacidade       | aprova threat/privacy review e ausência de exposição |
| owner de negócio            | aceita impacto, janela e critérios de interrupção    |
| on-call primário/secundário | responde alertas e executa contenção/rollback        |

`@Vnd93` é o único responsável humano e assume explicitamente os quatro papéis do registro G12. Cada
papel mantém horário e evidência próprios para deixar claro o que foi verificado, mas todos usam a
mesma identidade. O risco da ausência de segregação humana foi aceito formalmente. O PR não exige
approval, porém só pode avançar com CODEOWNERS solo, branch protegida e checks estritos no SHA. A
revisão do Codex é evidência técnica automatizada, não uma segunda identidade responsável.

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
- aprovação pendente, owner diferente de `@Vnd93` ou risco solo não aceito recusados;
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

O handover é aceito quando `@Vnd93` assina cada responsabilidade no registro G12, confirma o canal
único de plantão, os exercícios críticos são aprovados e a documentação reflete o ambiente real.
Passagem de tempo ou documentação isolada não substitui a execução.
