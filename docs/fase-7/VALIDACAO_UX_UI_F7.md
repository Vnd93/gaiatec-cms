# Validação UX/UI — Fase 7

**Data:** 2026-08-30
**Estado:** APROVADA EM STAGING NOS FLUXOS PÚBLICOS E ADMINISTRATIVOS INSPECIONADOS

## Escopo executado

- `/blog` em 1440 × 900 e 390 × 844;
- `/campanhas/campanha-sintetica-inexistente` como estado seguro de expiração/indisponibilidade;
- `/admin/marketing` sem sessão, comprovando redirect para `/admin/login` e `noindex,nofollow,noarchive`;
- navegação por teclado, skip link, menu móvel com `Escape`, landmarks e foco;
- ausência de overflow horizontal nas rotas públicas F7;
- contraste e acessibilidade automatizada por axe nas rotas `/`, `/contato`, `/produtos`, `/blog` e no fallback de campanha.

## Resultado reproduzível

`npm run test:e2e` contra `https://gaiatec-cms-staging.pages.dev`: **26 aprovados, 2 ignorados por condição documentada, 0 falhas**.

Os dois skips são esperados e cruzados por projeto: a variação estreita roda no projeto móvel e o teste de menu móvel não roda no desktop. O teste de acessibilidade não encontrou violações `serious` ou `critical` nas cinco jornadas públicas inspecionadas. O teste de teclado confirmou foco em `#main-content`; o menu móvel fechou com `Escape` e restaurou o scroll.

## Inspeção visual e correções

| Viewport/estado           | Resultado                                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------------- |
| blog desktop              | um `main`, um `h1`, conteúdo novo vazio sem fallback legado, largura 1425/1425 e gutter do hero de 58 px |
| blog mobile               | largura 375/375, gutter de 16 px, tipografia sem corte e menu acessível                                  |
| campanha ausente          | fallback com `role=alert`, hierarquia visual legível, sem redirect inventado e largura 1425/1425         |
| administrativo sem sessão | redirect para login, formulário rotulado, senha protegida e meta robots privada                          |

A inspeção anterior corrigiu o gutter de largura total e o CSS do fallback. A inspeção autenticada final também corrigiu a identidade do usuário que cobria o rodapé da navegação lateral e eliminou respostas 404 usadas apenas para consultar formulários governados ainda não publicados. Ausências válidas agora produzem estado seguro sem ruído no console; falhas reais continuam visíveis.

## Evidências

- [Blog desktop](evidencias-visuais/blog-desktop-1440x900.png)
- [Blog mobile](evidencias-visuais/blog-mobile-390x844.png)
- [Fallback de campanha](evidencias-visuais/campanha-fallback-desktop-1440x900.png)
- [Administrativo sem sessão](evidencias-visuais/admin-sem-sessao-desktop-1440x900.png)

## Limite da evidência

Editor, formulários, leads, importação em massa e RBAC foram exercitados em staging com sessão real e identidades temporárias. A validação não equivale ao aceite editorial do proprietário nem à revisão do DPO e não autoriza produção.
