# EV2.12 — implantação controlada

**Estado:** release produtiva concluída e verificada<br>
**Gate:** G12 aprovado e encerrado para o SHA `e52b25d9…`<br>
**Produção:** promovida em 6 de setembro de 2026 pelo workflow protegido

## Objetivo

Promover um artefato imutável com identificação de release, preflight, observabilidade, decisão por
error budget, responsabilidades aprovadas e rollback recuperável. A fase não cria migration: utiliza as
migrations aditivas já homologadas até `0054` e preserva todas as flags EV2 desligadas por padrão.

## Entregas

| Entrega           | Implementação                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Estado da release | `GET /healthz`, `X-Release` e `release-manifest.json` devem concordar com o SHA completo         |
| Canary isolado    | workflow `EV2.12 Canary Preview`, projeto `gaiatec-cms-staging`, alias `ev2-g12-canary`          |
| Gate automatizado | probe HTTP, budgets, três janelas consecutivas e pausa diante de P0/P1, segurança ou divergência |
| Canary integrado  | executor reduzido reaproveita a garantia G11, usa dois atores MFA e encerra com resíduo zero     |
| Aprovação formal  | registro G12 por SHA, quatro responsabilidades de `@Vnd93`, janela e rollback identificados      |
| Promoção          | preflight do mesmo `dist`, flags candidatas desligadas, baseline capturada antes do deploy       |
| Backend produtivo | migrations, segredos, 32 funções, Auth, Vault, RLS e cron verificados antes da troca do frontend |
| Recuperação       | rollback automático ou manual somente para deployment `Production` e SHA previamente conferidos  |
| Operação          | runbook, matriz de rollout, treinamento/handover e inventário de pré-requisitos                  |

## Limite desta entrega

O workflow de produção exige
simultaneamente branch `main`, ambiente protegido, PR de `@Vnd93`, controles automáticos do branch, projeto
Supabase produtivo distinto, registro G12 aprovado e a confirmação literal
`AUTORIZO-G12-PRODUCAO:<SHA completo>`. Na ausência de qualquer item, o fluxo falha antes do deploy.
Esses requisitos foram atendidos para o candidato `e52b25d903251cf538918d89049a58524c3c9911`, exceto
pela conclusão operacional do par Turnstile, que ocorre na mesma janela autorizada e deve estar nos
secrets protegidos antes do disparo.

O hardening posterior da EV2.13 removeu os switches `VITE_EV2_*_CANDIDATE` das decisões do frontend e
introduziu elegibilidade individual em runtime. O CMS v1 permanece disponível quando a avaliação
falta, expira ou falha. O candidato final foi requalificado pelo verificador, com três janelas
saudáveis e evidências vinculadas ao registro de aprovação.

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
- [Controles finais EV2.16](../fase-16/README.md)

## Encerramento da implantação

O workflow `Deploy production` run `34039654304` concluiu todos os gates e promoveu o candidato
imutável `e52b25d903251cf538918d89049a58524c3c9911`. O probe pós-promoção passou, o rollback não foi
acionado e as rotas reais foram verificadas no Edge. A evidência está em
[EVIDENCIAS_PRODUCAO_G12_2026-09-06.md](EVIDENCIAS_PRODUCAO_G12_2026-09-06.md).
