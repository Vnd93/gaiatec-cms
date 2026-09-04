# EV2.12 — implantação controlada

**Estado:** candidato qualificado; canary controlado G12 em staging concluído<br>
**Gate:** G12 não aprovado para produção<br>
**Produção:** bloqueada por controles técnicos e aprovações ausentes

## Objetivo

Promover um artefato imutável com identificação de release, preflight, observabilidade, decisão por
error budget, segregação de aprovadores e rollback recuperável. A fase não cria migration: utiliza as
migrations aditivas já homologadas até `0052` e preserva todas as flags EV2 desligadas por padrão.

## Entregas

| Entrega           | Implementação                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Estado da release | `GET /healthz`, `X-Release` e `release-manifest.json` devem concordar com o SHA completo         |
| Canary isolado    | workflow `EV2.12 Canary Preview`, projeto `gaiatec-cms-staging`, alias `ev2-g12-canary`          |
| Gate automatizado | probe HTTP, budgets, três janelas consecutivas e pausa diante de P0/P1, segurança ou divergência |
| Canary integrado  | executor reduzido reaproveita a garantia G11, usa dois atores MFA e encerra com resíduo zero     |
| Aprovação formal  | registro G12 por SHA, quatro owners distintos, janela e rollback previamente identificados       |
| Promoção          | preflight do mesmo `dist`, flags candidatas desligadas, baseline capturada antes do deploy       |
| Recuperação       | rollback automático ou manual somente para deployment `Production` e SHA previamente conferidos  |
| Operação          | runbook, matriz de rollout, treinamento/handover e inventário de pré-requisitos                  |

## Limite desta entrega

O G11 autorizou a preparação local/staging da EV2.12, não o go-live. O workflow de produção exige
simultaneamente branch `main`, ambiente protegido, dois revisores, controles do branch, projeto
Supabase produtivo distinto, registro G12 aprovado e a confirmação literal
`AUTORIZO-G12-PRODUCAO`. Na ausência de qualquer item, o fluxo falha antes do deploy.

Os switches `VITE_EV2_*_CANDIDATE` continuam sendo de build. Portanto, a promoção inicial só pode
levar o _shell_ compatível com v1 e todos os candidatos em `false`. A ampliação das funcionalidades
EV2 em produção permanece bloqueada até existir elegibilidade de frontend em runtime alinhada às
flags server-side e um backend produtivo aprovado.

## Documentos operacionais

- [Evidências do canary G12 em staging](EVIDENCIAS_CANARY_G12_2026-09-04.md)
- [Evidências da implementação local](EVIDENCIAS_IMPLEMENTACAO_LOCAL_2026-09-04.md)
- [Evidências da infraestrutura produtiva](EVIDENCIAS_INFRAESTRUTURA_PRODUCAO_2026-09-04.md)
- [Gate G12](GATE_G12.md)
- [Plano de canary em staging](PLANO_CANARY_STAGING.md)
- [Pré-requisitos de infraestrutura](PRE_REQUISITOS_INFRAESTRUTURA.md)
- [Matriz de rollout](MATRIZ_ROLLOUT.md)
- [Runbook de go-live e rollback](RUNBOOK_GO_LIVE_E_ROLLBACK.md)
- [Treinamento e handover](TREINAMENTO_E_HANDOVER.md)
- [Modelo de aprovação](G12_APPROVAL.template.json)

## Próxima decisão

O canary de staging está concluído. A próxima etapa é eliminar os bloqueios produtivos, validar os
controles com owners independentes e formar o registro de aprovação por SHA. Nenhuma preparação ou
evidência parcial substitui a autorização específica de produção.
