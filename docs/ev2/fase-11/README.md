# EV2.11 — integração operacional e garantia sistêmica

**Estado:** implementação candidata local; Gate G11 pendente<br>
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

- migration `0050_ev2_system_assurance.sql`, aditiva e com flag desligada por padrão;
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

## Limite desta entrega

O código local não aplica a migration, não publica funções, não cria usuários, não atualiza alias e
não toca em staging ou produção. O G11 permanece pendente até autorização específica, execução do
canary no SHA candidato, validação humana/UAT e anexação das evidências reais. O histórico de
`docs/fase-11`, referente ao ciclo visual anterior, permanece preservado e independente desta fase
EV2.11.
