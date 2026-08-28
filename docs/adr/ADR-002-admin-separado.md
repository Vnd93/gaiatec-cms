# ADR-002 — Novo `/admin` separado

**Status:** aprovada — Product Owner Comercial GAIATEC / Tech Lead Pedro Nishida
**Data:** 28 de agosto de 2026

## Decisão

Criar um painel novo e exclusivo em `/admin`, com entry point, chunks, autenticação, headers, cache, Service Worker e autorização separados do site público e do RDO. Nenhum código, tela, usuário, papel ou workflow administrativo anterior será reutilizado.

## Consequências

- O admin não entra no bundle/cache público.
- CMS e RDO usam escopos independentes.
- Preview é autenticado, temporário, `noindex` e sem cache público.
- O painel novo será a única administração do site.
