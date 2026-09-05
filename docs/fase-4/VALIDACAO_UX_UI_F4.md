# Validação UX/UI — Fase 4

Data: 2026-08-29 (America/Sao_Paulo)

Ambiente: `https://gaiatec-cms-staging.pages.dev`, branch `Remodelagem`.

## Navegador integrado

| Jornada                | Evidência                                                                              | Resultado              |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| detalhe                | duas imagens com ALT, badge, conteúdo, 10 specs, modelo/variante e PDF                 | aprovado               |
| preview                | banner privado, mesmo título/renderer, duas imagens e documento                        | aprovado               |
| lista/card             | exatamente um lote, badge e atributos formatados                                       | aprovado               |
| filtro                 | categoria `Medição de vazão` retorna um item                                           | aprovado               |
| sinônimo/busca         | `KF700E` encontra GATFLOW-B                                                            | aprovado               |
| vazio                  | consulta inexistente mostra orientação para remover filtros                            | aprovado após correção |
| comparador             | um item mostra seleção mínima; dois itens foram testados na suíte descartável          | aprovado               |
| SEO                    | canonical, `noindex,follow`, schema Product e exclusão do sitemap                      | aprovado               |
| admin sem sessão       | redirect para `/admin/login`, `noindex,nofollow,noarchive`                             | aprovado               |
| editor autenticado     | campos explícitos de marca/OEM/modelo/referência e JSON governado com completude 100%  | aprovado               |
| round-trip sem rebuild | marcador administrativo apareceu no detalhe e na busca; restauração removeu o marcador | aprovado               |
| console                | nenhuma mensagem nas jornadas finais                                                   | aprovado               |

A inspeção visual detectou e corrigiu breadcrumb sob o header fixo, título excessivo em largura intermediária, duplicação da imagem hero na galeria e valores de enum/range/boolean exibidos como JSON. O renderer final mostra, por exemplo, `0.3–10 m/s`, opções separadas e `Não`.

## Desktop e mobile

- navegador integrado: viewport 1280×720, sem overflow horizontal;
- navegador integrado mobile: viewport 390×844, editor e detalhe responsivos;
- Chromium mobile: screenshot `EVIDENCIA_GATFLOW_B_MOBILE.png`;
- Chromium desktop: screenshot `EVIDENCIA_CATALOGO_DESKTOP.png`;
- Playwright desktop/mobile: 19 aprovados, 3 skips previstos, 0 falhas;
- Axe: nenhuma violação séria/crítica;
- teclado: skip link, menu mobile por Escape e tabs do editor por Enter/Space/setas/Home/End aprovados após correção;
- loading, vazio, erro, sem permissão e preview privado cobertos.

No editor móvel foram conferidos os onze grupos: identificação, classificação, comercial, especificações, imagens, documentos, relações, busca, SEO, governança e histórico. Identificação mostrou `GATFLOW`, `GATFLOW-B`, `KF700E` e OEM `a confirmar` em controles separados; especificações, redirects e proveniência mostraram JSON válido e preservado; o contrato indicou 100% de completude.

## HTTP, cache e indexação

- staging envia `X-Robots-Tag: noindex, nofollow, noarchive`;
- preview envia `private, no-store`;
- API de busca envia `private, no-store`;
- detalhe publicado usa ETag e `stale-while-revalidate`;
- mídia e documento são privados e expostos somente por URLs assinadas;
- canonical aponta para o detalhe no staging;
- sitemap não contém o lote porque `seo.indexable=false`, embora o estado funcional seja `homologated`.

O preview final compartilha o renderer do detalhe, expõe a governança somente no contexto privado, envia `noindex`/`no-store` e mostrou a revisão publicada `0e4e09ea-7239-4885-82e0-65a17b34fb98`. Uma aba antiga conservou o payload anterior pelo cache de 60 segundos; uma nova navegação e o ETag carregaram imediatamente o estado restaurado correto, sem marcador temporário.

## Performance

O primeiro ciclo revelou assinatura sequencial de 12 variantes e um PDF. `cms-public` e `cms-preview` foram corrigidas para consultar variantes de uma vez e usar `createSignedUrls` em lote. Os chunks do catálogo permanecem pequenos; o warning de build acima de 600 kB pertence ao chunk PDF preexistente e lazy, não importado pelas páginas do catálogo.

## Evidências visuais

- `EVIDENCIA_GATFLOW_B_MOBILE.png`;
- `EVIDENCIA_CATALOGO_DESKTOP.png`.
