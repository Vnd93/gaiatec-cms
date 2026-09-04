# EV2.11 — integração operacional e garantia sistêmica

**Estado:** Gate G11 aprovado para preparar a EV2.12; produção bloqueada<br>
**Escopo:** F-017 e F-018, com regressão sistêmica das entregas EV2.1–EV2.10<br>
**Produção:** bloqueada<br>
**Dados reais:** proibidos no canary<br>
**Ativação global:** bloqueada

## Resultado do marco

A EV2.11 consolida o que antes estava distribuído entre conteúdo, campanhas, formulários, leads,
releases, filas e diagnósticos. O fluxo de lead continua persistindo o registro e o consentimento antes
da tentativa de notificação. A diferença operacional é que o CMS agora expõe o estado da entrega,
identifica retentativas e dead-letter e oferece reprocessamento controlado, sem alterar ou recriar o
lead.

O segundo eixo transforma performance, acessibilidade, segurança, observabilidade e restore em
critérios mensuráveis. A fotografia calculada no banco é deliberadamente não autoritativa: ela apoia
o Gate G11, mas somente um relatório completo, aprovado por operador diferente de quem o mediu,
pode registrar aceite técnico.

## Entregas

- migrations aditivas `0050`–`0052`, com flag desligada por padrão e rate limit transacional;
- funções `cms-system`, `cms-leads` e `cms-outbox-worker` endurecidas;
- permissão crítica e auditada para reprocessar entrega de lead;
- fotografia das filas de publicação, leads e colaboração, incluindo lag e dead-letter;
- reconciliação publicação/projeção e lead/consentimento/histórico/outbox;
- cobertura de auditoria crítica e alertas operacionais abertos;
- registro idempotente da medição G11 e revisão obrigatória por uma segunda pessoa;
- contratos Zod, testes de regra, pgTAP/RLS, carga HTTP, ensaio de restore e canary reproduzível;
- painel de Diagnósticos e caixa de Leads atualizados com recuperação acionável.

## Ordem de leitura

1. [Contrato e operação](CONTRATO_E_OPERACAO.md)
2. [Matriz de homologação](MATRIZ_HOMOLOGACAO.md)
3. [Gate G11](GATE_G11.md)
4. [Plano do canary em staging](PLANO_CANARY_STAGING.md)
5. [Runbook operacional e rollback](RUNBOOK_OPERACIONAL.md)
6. [Relatório de validação local](RELATORIO_VALIDACAO_LOCAL_2026-09-03.md)
7. [Relatório do canary em staging](RELATORIO_CANARY_STAGING_2026-09-04.md)
8. [Registro de aceite do G11](REGISTRO_ACEITE_G11_2026-09-04.md)

## Limite desta entrega

O SHA `8321f1291860e9ca55d3e17e3c1ce36123d0d025` foi validado somente em staging. O canary passou
27/27 verificações, com dois atores sintéticos MFA, zero dado real e resíduo zero; o staging estável,
produção e `cms-outbox-worker` v22 permaneceram inalterados. O responsável autorizou o protocolo
reduzido e aceitou a revisão consolidada sem atribuir métricas a uma sessão manual inexistente. G11
libera somente a preparação da EV2.12 local/staging. O histórico de `docs/fase-11`, referente ao
ciclo visual anterior, permanece preservado e independente desta fase EV2.11.
