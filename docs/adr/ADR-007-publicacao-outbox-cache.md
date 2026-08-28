# ADR-007 — Publicação, outbox e cache

**Status:** aprovada — Pedro Nishida, Tech Lead
**Data:** 28 de agosto de 2026

## Decisão

Publicação é um comando transacional que cria revisão imutável, atualiza projeção publicada, grava outbox e audit log. Workers processam busca, sitemap, cache e integrações de forma idempotente. Cache é versionado por entidade/tag.

Falha nunca substitui conteúdo válido por rascunho ou payload parcial. Restauração republica uma revisão anterior como nova versão auditada.
