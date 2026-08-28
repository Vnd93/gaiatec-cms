# ADR-001 — Recadastro limpo e cutover

**Status:** aprovada — Product Owner Comercial GAIATEC / Tech Lead Pedro Nishida
**Data:** 28 de agosto de 2026

## Decisão

O banco e storage editoriais novos começam vazios. Produtos, serviços, taxonomias, relações, páginas, textos, imagens e documentos atuais não serão importados, copiados, conciliados nem usados como fallback. O site atual serve somente para URLs, redirects, falhas e rollback técnico integral.

O cutover alterna consumidores/sites completos por feature flag. Após o lançamento, falhas servem a última projeção nova aprovada.

## Consequências

- Seeds aceitam apenas dados sintéticos.
- Importação inicial fica desabilitada.
- Todo registro real exige fonte, cadastrador, revisor e aprovação.
- Rollback nunca injeta dados antigos no CMS novo.
