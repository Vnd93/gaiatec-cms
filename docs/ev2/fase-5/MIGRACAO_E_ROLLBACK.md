# EV2.5 — migration, rollout e rollback

## Ordem controlada

1. Confirmar por ref, nome e região que o alvo é o projeto de staging.
2. Executar `0043_ev2_dam.sql`, sem editar migrations anteriores.
3. Publicar `cms-media`, `cms-public` e `cms-preview` com JWT conforme a configuração vigente.
4. Confirmar `ev2.dam` com `default_enabled=false` e `kill_switch=false`.
5. Criar usuário sintético sem dados pessoais, papel mínimo e override individual com até 30 minutos.
6. Publicar o build candidato somente no alias `ev2-g5-canary`.
7. Executar upload adversarial, duplicidade, similaridade, organização, crop, direitos, usos, substituição/rollback e retenção.
8. Remover objetos e fixtures sintéticas; excluir o usuário descartável, invalidar a sessão, remover o papel e desativar o override.

O runner oficial é `npm run canary:ev2:phase5`. Ele recusa outro ref, nome ou região; eleva apenas o usuário sintético por MFA/AAL2; e passa o `jobId` explícito ao GC para não tocar filas alheias.

A execução autorizada de 2 de setembro de 2026 seguiu esta ordem, foi encerrada com 27/27 verificações e teve zero resíduo na auditoria independente. Consulte o [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-02.md).

## Rollback funcional

- Desativar o override individual e manter a flag global desligada torna os comandos v2 inacessíveis.
- Recompilar com `VITE_EV2_DAM_CANDIDATE=false` devolve a interface v1 sem apagar ativos.
- Substituições ativas são revertidas pelo comando `rollback_replacement`; revisões e IDs originais permanecem intactos.
- Ativos arquivados dentro da retenção são restaurados por `restore_asset`, que cancela o job de GC.
- Não se apagam tabelas, eventos, receipts nem metadados para efetuar rollback.

## Restrições

- Não executar em produção nesta fase.
- Não habilitar a flag por ambiente, site ou globalmente.
- Não usar imagem real no canary sem autorização específica de origem e direitos.
- Não antecipar manualmente `execute_after` fora de fixture sintética controlada.
