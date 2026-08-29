# Validação UX/UI — Fase 4

Data: 2026-08-28 (America/Sao_Paulo)

Ambiente: `https://gaiatec-cms-staging.pages.dev`, deployment funcional `https://2457a4b9.gaiatec-cms-staging.pages.dev`, branch `Remodelagem`, commit `8cd7650f5f706ffc41930415f7405a0285850bd3`.

## Navegador prático

A validação foi feita no navegador integrado do Codex, além do Playwright/Axe automatizado.

| Jornada                         | Desktop                                                                     | Mobile 390×844                | Resultado |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------- | --------- |
| lista e dois cards com mídia    | validada                                                                    | validada                      | aprovado  |
| facets e consulta sem resultado | validada                                                                    | estrutura responsiva validada | aprovado  |
| busca por sinônimo `fixture f4` | 2 resultados                                                                | componentes responsivos       | aprovado  |
| seleção e comparador            | 2 produtos e 2 atributos                                                    | controles acessíveis          | aprovado  |
| detalhe                         | mídia, breadcrumb, status, benefícios, specs, modelos, relações e documento | layout responsivo             | aprovado  |
| menu e teclado                  | foco/controles sem bloqueio                                                 | abre e fecha por Escape       | aprovado  |
| admin sem sessão                | redireciona ao login                                                        | idem                          | aprovado  |
| preview inválido                | mensagem `Preview indisponível`                                             | idem                          | aprovado  |
| estado final vazio              | `Nenhum produto publicado` sem cache                                        | idem                          | aprovado  |

O navegador mostrou controles com nomes acessíveis, headings hierárquicos, tabelas com headers, imagens com alt e estados de carregamento/alerta. A tentativa inicial de fechar o menu usando o nome anterior do botão falhou no driver porque o nome acessível muda de `Abrir menu` para `Fechar menu`; repetido com o nome vigente, Escape fechou corretamente.

## Automação e console

- Playwright final: 19 aprovados, 3 skips previstos, 0 falhas;
- Axe: nenhuma violação séria/crítica nas jornadas cobertas;
- desktop e mobile: H1, ausência de overflow horizontal e console sem erros nos smokes;
- o primeiro run detectou CORS bloqueando o header público `apikey`; a função foi corrigida, republicada e o conjunto foi repetido com sucesso;
- estados cobertos: loading, vazio, erro de preview, sem sessão/permissão, lista, detalhe, filtro, busca e comparação.

## HTTP, cache e indexação

- staging inteiro envia `X-Robots-Tag: noindex, nofollow, noarchive`;
- `/admin/produtos` envia `private, no-store, max-age=0`;
- produto existente: HTTP 200;
- produto inexistente: HTTP 404 real;
- redirect editorial sintético: HTTP 301 para o canonical;
- sitemap: HTTP 200 XML e nenhum produto sintético não indexável;
- preview válido no teste remoto: snapshot fiel e `no-store`;
- todas as respostas do Worker recebem correlation ID.

## Performance observada

O build separou os consumidores F4 em chunks pequenos: catálogo 2,77 kB, detalhe 1,61 kB, comparador 2,11 kB, busca 1,91 kB, renderer 4,00 kB e CSS do catálogo 3,30 kB, antes de gzip conforme relatório do Vite. O warning de chunk acima de 600 kB é do chunk PDF preexistente e lazy, não importado pelas páginas do catálogo.

Não foi executado Lighthouse com produto real, pois o clean-room impediu manter conteúdo real sem fonte e homologação. Assim, a aprovação final de performance com lote real permanece pendente para o Gate G4.
