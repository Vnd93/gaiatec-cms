# Validação UX/UI — Fase 9

**Data:** 2026-08-30

**Escopo:** frontend publicado em staging após retirada do caminho anterior
**Produção:** não acessada

## Critérios e resultados

| Critério         | Evidência                                                                                | Resultado |
| ---------------- | ---------------------------------------------------------------------------------------- | --------- |
| desktop          | homepage em 1440 × 900, hierarquia íntegra, sem sobreposição ou overflow                 | aprovado  |
| mobile           | Biodigestor em 393 × 852, cards e CTA responsivos, overflow 0                            | aprovado  |
| renderização CMS | `data-cms-renderer="managed-page"` em homepage e Biodigestor                             | aprovado  |
| busca            | consulta `privacidade` retornou `page — Política de Privacidade`                         | aprovado  |
| teclado          | `Escape` fechou menu, restaurou scroll e foco em `Abrir menu`; skip link aprovado no E2E | aprovado  |
| acessibilidade   | axe-core sem violações sérias nas jornadas críticas cobertas                             | aprovado  |
| console          | `dev.logs()` vazio após jornadas críticas                                                | aprovado  |
| rotas/SEO        | 200/301/404 reais, staging noindex e canonical coerente                                  | aprovado  |

## Suíte publicada

Playwright executado contra `https://gaiatec-cms-staging.pages.dev`: **38 testes aprovados, 2 skips condicionais e zero falha**. A matriz cobriu desktop/mobile, homepage, coleções, Contato, admin fail-closed, RDO, acessibilidade, projeção clean-room, redirects, 404 e asset ausente.

## Evidências visuais

- `evidencia-clean-room-home-staging-desktop.png`;
- `evidencia-clean-room-biodigestor-staging-mobile.png`;
- evidências anteriores preservadas: `evidencia-header-busca-desktop.png` e `evidencia-menu-mobile.png`.

As capturas foram inspecionadas visualmente e confirmam preservação da identidade já validada. Nenhum ajuste corretivo adicional foi necessário.

## Resultado

O frontend alterado está **aprovado no escopo local/staging**. Este resultado não autoriza produção e não substitui a janela pós-go-live.
