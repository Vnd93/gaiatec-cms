# Validação UX/UI — Fase 7

**Data:** 2026-08-29
**Estado:** APROVADA LOCALMENTE NO ESCOPO NÃO AUTENTICADO; telas autenticadas pendentes

## Escopo executado

- `/blog` em 1440 × 900 e 390 × 844;
- `/campanhas/campanha-sintetica-inexistente` como estado seguro de expiração/indisponibilidade;
- `/admin/marketing` sem sessão, comprovando redirect para `/admin/login` e `noindex,nofollow,noarchive`;
- navegação por teclado, skip link, menu móvel com `Escape`, landmarks e foco;
- ausência de overflow horizontal nas rotas públicas F7;
- contraste e acessibilidade automatizada por axe nas rotas `/`, `/contato`, `/produtos`, `/blog` e no fallback de campanha.

## Resultado reproduzível

`npm run test:e2e`: **24 aprovados, 4 ignorados por condição documentada, 0 falhas**.

Os quatro skips são esperados: teste móvel omitido no projeto desktop, teste desktop estreito omitido no projeto desktop e verificação exclusiva do edge staging omitida nos dois projetos locais. O teste de acessibilidade não encontrou violações `serious` ou `critical` nas cinco jornadas públicas inspecionadas. O teste de teclado confirmou foco em `#main-content`; o menu móvel fechou com `Escape` e restaurou o scroll.

## Inspeção visual e correções

| Viewport/estado           | Resultado                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| blog desktop              | um `main`, um `h1`, conteúdo novo vazio sem fallback legado, largura 1425/1425 e gutter do hero de 58 px |
| blog mobile               | largura 375/375, gutter de 16 px, tipografia sem corte e menu acessível                                  |
| campanha ausente          | fallback com `role=alert`, hierarquia visual legível, sem redirect inventado e largura 1425/1425         |
| administrativo sem sessão | redirect para login, formulário rotulado, senha protegida e meta robots privada                          |

A inspeção encontrou e corrigiu dois defeitos antes do registro final: o template de largura total não preservava gutter lateral e o fallback de campanha não carregava o CSS quando nenhum renderer era montado.

## Evidências

- [Blog desktop](evidencias-visuais/blog-desktop-1440x900.png)
- [Blog mobile](evidencias-visuais/blog-mobile-390x844.png)
- [Fallback de campanha](evidencias-visuais/campanha-fallback-desktop-1440x900.png)
- [Administrativo sem sessão](evidencias-visuais/admin-sem-sessao-desktop-1440x900.png)

## Limite da evidência

Editor de campanha, editor de formulário, inbox/exportação de leads e preview autenticado dependem da futura autenticação e aplicação da migration no Supabase staging. Essas telas não foram simuladas, e nenhuma captura local foi apresentada como evidência remota.
