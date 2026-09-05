# ADR-018 — Release bundle, publicação coerente e rollback

**Status:** aprovada para EV2<br>
**Data:** 1 de setembro de 2026

## Contexto

Páginas, produtos, menus, redirects, busca e SEO não podem ser confirmados parcialmente. Uma transação única não cobre consumidores assíncronos e caches.

## Decisão

- Release é um agregado com estados `draft`, `validating`, `ready`, `approved`, `scheduled`, `publishing`, `published`, `failed`, `canceled` e `rolled_back`.
- Itens apontam para revisões imutáveis; validações e aprovações vinculam-se ao hash do plano.
- Alterar item, revisão ou dependência invalida aprovação anterior.
- A transação grava release, snapshot/projeção canônica e eventos outbox; consumidores são idempotentes.
- `published` só é confirmado quando a versão canônica e os consumidores obrigatórios convergirem; falha mantém o estado público anterior.
- Jobs longos retornam 202 e status consultável; tentativas possuem limite, backoff e dead-letter/ação operacional.
- Rollback é uma nova operação auditável para um snapshot confirmado; histórico nunca é apagado.
- Aprovação/publicação/rollback críticos exigem permissão própria, segregação aplicável e AAL2.

## Consequências

Consistência externa é obtida por state machine, transactional outbox, idempotência e reconciliação, não por falsa transação distribuída. O esqueleto G1 aceita release vazio e não publica conteúdo.

## Verificação e rollback

Testar transições válidas/inválidas, hash de aprovação, retry, consumidor duplicado, falha parcial, compensação e autorização. Rollback operacional desliga a flag, pausa workers e preserva tabelas/snapshots.
