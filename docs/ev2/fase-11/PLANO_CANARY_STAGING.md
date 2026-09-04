# Plano de canary EV2.11 em staging

## Estado

Executado em 4 de setembro de 2026 no SHA
`8321f1291860e9ca55d3e17e3c1ce36123d0d025`. O resultado técnico foi aprovado em 27/27
verificações e está registrado no
[relatório do canary](RELATORIO_CANARY_STAGING_2026-09-04.md). Os aceites humanos continuam
pendentes.

## Escopo mínimo

- migration `0050_ev2_system_assurance.sql`;
- funções `cms-system`, `cms-leads` e `cms-outbox-worker`;
- secret não sensível de ambiente `CMS_ENVIRONMENT=staging` nas funções envolvidas;
- build exato no alias `ev2-g11-canary` com `VITE_EV2_SYSTEM_ASSURANCE_CANDIDATE=true`;
- dois usuários sintéticos com MFA, papéis separados e overrides individuais de até 30 minutos;
- um lead estritamente sintético referenciando formulário já publicado, anonimizado ao final;
- nenhuma ativação global, nenhum dado real, nenhuma produção e nenhuma promoção do staging estável.

O endurecimento final aplicou somente `0052`, republicou `cms-system` e `cms-leads` e preservou
`cms-outbox-worker` v22, conforme a autorização específica da repetição final.

## Pré-condições bloqueantes

1. SHA completo explicitamente autorizado.
2. CI desse SHA totalmente verde.
3. Projeto Supabase vinculado precisa ser exatamente `glcqsosxwgmlhzgcsnzv`, nome
   `GAIATEC CMS Staging`, região `us-east-2`.
4. Rehearsal transacional da migration com rollback comprovado.
5. Backup/restore disponível e responsável técnico identificado.
6. Nenhum P0/P1 aberto.
7. OP-01 e REV-01 disponíveis; contas reais não são usadas pelo runner sintético.

## Ordem de execução

1. Capturar manifest do staging estável, flags e estado das filas.
2. Executar `npm run canary:ev2:phase11:validate`.
3. Aplicar migration 0050 apenas no staging autorizado.
4. Configurar `CMS_ENVIRONMENT=staging` e publicar as três funções com JWT verificado onde aplicável.
5. Disparar `EV2.11 Canary Preview` com SHA exato e candidate `true`.
6. Confirmar manifest exato do alias e ausência de promoção no alias estável.
7. Executar `EV2_G11_EXPECTED_SHA=<sha> npm run canary:ev2:phase11`.
8. Verificar falha de entrega, preservação do lead, retry idempotente, dead-letter e alerta.
9. Medir p95 real, disponibilidade, snapshot, reconciliação, axe e restore.
10. Registrar medição com operador sintético e revisar com conta sintética segregada.
11. Anonimizar o lead, remover overrides, banir as credenciais sintéticas, suspender os perfis e
    comprovar `synthetic_residue_zero` para credenciais ativas, overrides e payload pessoal.
12. Realizar UAT separada com OP-01/REV-01 e anexar tempos, erros, ajuda e recuperação.

## Abort conditions

- alvo, nome, região, SHA ou alias divergente;
- tentativa de ambiente `production`;
- flag global ou override amplo ativo;
- MFA ausente, escopo indevido ou autoaprovação;
- perda/alteração do lead após falha do provedor;
- dado não sintético ou payload pessoal residual;
- p95, disponibilidade, acessibilidade, auditoria, fila ou restore fora do limite;
- divergência de projeção ou qualquer P0/P1;
- mudança do manifest estável.

Em qualquer condição, remover overrides, acionar kill switch se necessário, manter o registro para
diagnóstico e não promover.

## Modelo de autorização utilizado

> Autorizo o canary controlado da EV2.11 em staging, incluindo a migration 0050, as funções
> cms-system, cms-leads e cms-outbox-worker, a configuração CMS_ENVIRONMENT=staging e o build
> candidato no alias ev2-g11-canary para o SHA informado, com dois usuários sintéticos MFA e
> overrides individuais de 30 minutos, sem produção, sem dados reais, sem ativação global e sem
> promoção do staging estável.
