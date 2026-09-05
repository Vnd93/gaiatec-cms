# Runbook operacional e rollback — EV2.11

## Sinais e severidade

| Sinal                           | Limite                  | Ação inicial                                                                      |
| ------------------------------- | ----------------------- | --------------------------------------------------------------------------------- |
| outbox mais antigo              | > 60 s                  | pausar rollout, inspecionar worker e dependência                                  |
| dead-letter de lead             | >= 1                    | preservar lead, abrir alerta, corrigir dependência, reprocessar com justificativa |
| divergência de projeção/lead    | >= 1                    | bloquear gate e reconciliar antes de qualquer promoção                            |
| ação crítica sem correlation ID | >= 1                    | tratar como incidente de auditoria/security                                       |
| leitura admin p95               | > 500 ms                | capturar plano/query, reduzir carga e repetir janela                              |
| comando p95                     | > 800 ms                | verificar lock, rate limit, RPC e fila                                            |
| disponibilidade                 | < 99,9%                 | parar canary e restaurar alias anterior                                           |
| axe critical/serious            | >= 1                    | bloquear gate e corrigir a jornada                                                |
| restore                         | RPO > 0 ou RTO > 15 min | bloquear G11 e escalar Tech/Ops                                                   |

Três violações de SLO consecutivas ou uma falha de segurança pausam imediatamente o rollout.

## Diagnóstico

1. Registrar horário, SHA, alias e correlation ID; nunca copiar payload do lead para logs ou tickets.
2. Abrir `/admin/diagnosticos` e confirmar fila, lag, dead-letter, divergências e alertas.
3. Em Leads, conferir apenas referência, estado da entrega, contador e código técnico.
4. Verificar saúde do worker e configuração do provedor; não editar o lead para “corrigir” a entrega.
5. Confirmar se o erro é transitório, permanente ou de configuração.
6. Corrigir a dependência e usar “Reprocessar entrega” somente em `failed`/`dead_letter`, com MFA e
   justificativa objetiva.
7. Confirmar `completed`, resolução do alerta e ausência de duplicidade.

## Pausa e rollback funcional

1. Remover imediatamente os overrides individuais de `ev2.system_assurance`.
2. Se houver comportamento anômalo, ativar `kill_switch=true` para a flag.
3. Restaurar o alias candidato para o último SHA aprovado ou removê-lo; não alterar o alias estável.
4. Republicar as versões anteriores de `cms-system`/`cms-leads`/`cms-outbox-worker` se a falha estiver
   no runtime. A migration é aditiva e permanece inerte com a flag desligada.
5. Não apagar tabelas, recibos, replays, auditoria ou eventos para “limpar” o incidente.
6. Reabrir a fase responsável quando a regressão pertencer a EV2.1–EV2.10.

## Restore drill

O ensaio automatizado cria somente tabelas temporárias, gera 1.000 registros sintéticos, captura
snapshot/checksum, remove o conjunto, restaura e compara antes de `ROLLBACK`. O resultado precisa ser
RPO 0 e RTO <= 15 minutos. Esse ensaio valida o caminho lógico e a disciplina de evidência; antes de
produção, o responsável técnico também deve validar o mecanismo físico/PITR contratado, sem restaurar
sobre o banco ativo.

## Recuperação da entrega de lead

- a notificação pode falhar; o lead não;
- retentativas automáticas usam backoff até 60 minutos e máximo de 20 tentativas;
- o replay manual guarda estado, tentativas e erro anteriores em registro imutável;
- idempotency key repetida devolve o primeiro resultado e não cria novo replay;
- evento em `pending`, `processing` ou `completed` não aceita replay;
- lead anonimizado não aceita nova entrega;
- ao reencaminhar um `dead_letter`, o sistema resolve o alerta do mesmo correlation ID; confirmar a
  resolução automática e não alterar eventos manualmente.

## Encerramento e escalada

Anexar: SHA, horários, contagens, percentis, snapshot, relatório de restore, axe, correlation IDs e
decisão OP-01/REV-01. Não anexar payload, e-mail, token, segredo TOTP ou service role key. Escalar P0
imediatamente; P1 bloqueia o gate; P2/P3 precisam de owner e prazo formal. Somente evidência do mesmo
SHA pode sustentar G11.
