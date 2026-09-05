# EV2.6 — busca técnica, SEO e Centro de Qualidade

## Resultado de engenharia

A fase implementa um caminho candidato aditivo e default-off. A busca v1 permanece disponível durante todo o canary e constitui o rollback funcional imediato.

- índice sombra PostgreSQL com FTS, `pg_trgm`, facetas e ranges;
- indexação somente após sanitização pública no servidor;
- atributos técnicos incluídos apenas quando homologados no PIM;
- busca pública sem varredura integral da projeção e busca administrativa filtrada por permissão;
- sinônimos e pin/bury/redirect com motivo, owner, vigência e auditoria;
- analytics anônimo de zero resultado, refinamentos e latência;
- regras determinísticas de SEO, acessibilidade, links, mídia, conteúdo e PIM;
- erros ativos bloqueiam publish/schedule apenas com a flag `ev2.search_quality` ligada;
- exceções críticas exigem permissão, motivo e expiração;
- bundle inicial sem Excel/PDF e com teto verificável por chunk.

## Rollout seguro

1. Validar migration `0044` em transação revertida.
2. Aplicar `0044` somente em staging.
3. Publicar `cms-search-admin`, `cms-quality`, `cms-content`, `cms-public` e `cms-outbox-worker` em staging.
4. Gerar build com `VITE_EV2_SEARCH_QUALITY_CANDIDATE=true` no alias `ev2-g6-canary`.
5. Criar usuário sintético com MFA e override individual de 30 minutos.
6. Reindexar, executar cenário de busca/qualidade e comprovar SLOs.
7. Limpar todos os dados sintéticos e expirar/remover o override.

Produção e dados reais não fazem parte desta fase.

## Resultado do Gate G6

O canary controlado foi aprovado em staging com 34/34 verificações. A busca pública registrou p95 de servidor de 351 ms, a busca administrativa 807 ms e a indexação 43.667 ms. A flag global permaneceu desligada, a auditoria independente confirmou resíduo sintético zero e o build final `71a36aa` ficou isolado no alias `ev2-g6-canary`.

Consulte o [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-02.md) e a [decisão do Gate G6](GATE_G6.md). Produção, promoção do staging estável e ativação global continuam bloqueadas.
