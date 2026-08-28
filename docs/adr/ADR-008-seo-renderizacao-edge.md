# ADR-008 — SEO, prerender e status HTTP

**Status:** aprovada — Comercial GAIATEC / Pedro Nishida
**Data:** 28 de agosto de 2026

## Decisão

Páginas públicas indexáveis terão HTML inicial pré-renderizado/SSG a partir da projeção publicada. A borda Cloudflare reconhecerá rotas para devolver 404/410/redirect reais. SSR será reservado a casos que exijam resposta dinâmica; SEO não dependerá exclusivamente de JavaScript cliente.

Admin, RDO, preview, busca interna e combinações arbitrárias de filtros recebem `noindex` e política de cache adequada. Canonical, sitemap e schema derivam da mesma versão publicada.
