# Validação UX/UI — Fase 8

**Data:** 2026-08-30

**Estado:** APROVADA EM STAGING NO ESCOPO TÉCNICO

## Jornadas verificadas

- catálogo de produtos com filtros, cards e comparação em desktop e Pixel 7;
- homepage, contato, blog e campanha inexistente/expirada;
- login administrativo privado e fail-closed;
- cadastro em massa autenticado, com download do modelo e fluxo em três etapas;
- navegação por teclado, skip link, menu móvel com `Escape`, foco, overflow e landmarks;
- Axe nas jornadas críticas sem violações `serious` ou `critical`.

## Correção da inspeção final

O menu lateral autenticado passou a usar coluna rolável e identidade do usuário no fluxo normal do layout. Isso impede que e-mail/perfil cubram os últimos links em alturas menores. A página de importação preserva hierarquia, instruções de clean-room, estados desabilitados e confirmação explícita antes de criar rascunhos.

Também foi removido o ruído visual/técnico causado pela consulta de formulários ainda não publicados: o site apresenta indisponibilidade segura sem console 404, mantendo erro real para requisições inválidas ou falhas de serviço.

## Resultado

`PLAYWRIGHT_BASE_URL=https://gaiatec-cms-staging.pages.dev npm run test:e2e`: **36 aprovados, 2 skips condicionais, 0 falhas**.

Revalidação em 2026-08-30: `/contato` carregou o formulário governado, consentimento, newsletter e os dados globais publicados pelo CMS. A API pública confirmou `site_settings` e um produto; a navegação continuou no fallback seguro porque nenhum documento de navegação foi publicado. Não houve alteração visual de frontend nesta rodada.

Revalidação do lote clean-room: as quatro coleções renderizaram cards e filtros com o conteúdo novo; páginas detalhadas de serviço, indústria, aplicação e solução exibiram título, resumo, dados técnicos e CTA. A navegação publicada substituiu o fallback. Em 393 × 852, a página representativa permaneceu sem overflow horizontal e com menu móvel operável.

Revalidação após o lote: o Worker passou a reconhecer `/industrias`, `/solucoes` e as quatro famílias de páginas detalhadas do CMS com HTTP 200 real e metadados iniciais, sem transformar URLs inexistentes em soft 404. O catálogo de produtos deixou de misturar entidades de descoberta e voltou a aprovar cards, filtros, comparação, ausência de overflow, console limpo e Axe em execução concorrente. A inspeção visual no navegador confirmou a identidade GAIATEC, hierarquia, busca, benefícios e menu móvel em 1280 × 720 e 393 × 852.

Evidências: [cadastro em massa autenticado](./evidencia-cadastro-massa-staging.png) e [solução clean-room publicada](./evidencia-solucao-clean-room-staging.png).

Esta aprovação não substitui o aceite editorial dos lotes reais nem autoriza o go-live.

## Revalidação do editor administrativo

O editor institucional foi revisado após relato do operador sobre campos sobrepostos e fluxo pouco prático. Serviços, indústrias, aplicações e soluções passaram a usar formulários estruturados divididos em Conteúdo; Busca, CTA e SEO; Mídia e relações; Governança; e Avançado. O JSON integral deixou de ser a interface principal e ficou restrito à manutenção excepcional.

A inspeção no Chrome encontrou e corrigiu uma herança de layout que fazia a barra fixa do workflow encobrir o formulário. Depois da correção, a barra ficou com aproximadamente 69 px, todos os botões permaneceram na mesma faixa e nenhum campo apresentou largura/altura insuficiente ou sobreposição. Os nomes acessíveis dos controles foram separados dos textos de ajuda. A revisão foi publicada somente em staging e aprovada com 50 testes unitários, testes de Fase 5, typecheck, lint sem erros e build completo.
