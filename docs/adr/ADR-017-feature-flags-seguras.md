# ADR-017 — Feature flags seguras e desligadas por padrão

**Status:** aprovada para EV2<br>
**Data:** 1 de setembro de 2026

## Contexto

As fases serão entregues incrementalmente e precisam de canary e kill switch sem expor implementação parcial ou permitir bypass de segurança.

## Decisão

- Toda flag EV2 é booleana ou variante tipada, tem owner, motivo, ambiente, escopo, expiração e valor default `off`.
- Ausência, erro de leitura ou configuração inválida avalia como desligado.
- O servidor decide acesso funcional; o cliente pode apenas ocultar/apresentar UI.
- Flag nunca substitui permissão, MFA, RLS, validação ou gate de publicação.
- Precedência: kill switch/negação explícita, usuário de teste, site/organização, ambiente e global.
- Avaliações e alterações críticas são auditáveis e expõem somente metadados não sensíveis.
- Flags transitórias devem ser removidas após rollout estável; flags operacionais permanentes têm revisão periódica.

## Consequências

O caminho v1 continua sendo fallback. A infraestrutura de flags deve ser cacheável sem falhar aberta e testada com flag ausente, desligada, ligada no escopo e kill switch.

## Rollback

Desligar a flag é a primeira ação, seguida de pausa de workers quando aplicável. Migration aditiva e auditoria não são removidas em rollback operacional. A matriz completa está em `docs/ev2/fase-0/PLANO_FLAGS_ROLLBACK.md`.
