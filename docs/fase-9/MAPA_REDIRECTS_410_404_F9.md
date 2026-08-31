# Mapa de redirects, 410 e 404 — Fase 9

**Data:** 2026-08-30
**Escopo:** local/staging; não aplicado em produção

## URLs canônicas preservadas e abastecidas pelo CMS

`/`, `/sobre`, `/contato`, `/politica-de-privacidade`, `/termos-de-uso`, `/biodigestor` e suas sete subrotas, e `/deteccao-de-gas` mantêm a URL canônica existente. Todas retornam 200 no staging pelo renderizador genérico `managed-page`, sem fallback editorial.

## Redirects 301 implementados

| Origem                                 | Destino publicado                      | Justificativa                            |
| -------------------------------------- | -------------------------------------- | ---------------------------------------- |
| `/servicos/calibracao-rbc-laboratorio` | `/servicos/calibracao-de-instrumentos` | equivalência semântica comprovada        |
| `/setores`                             | `/industrias`                          | coleção canônica nova                    |
| `/setores/saneamento`                  | `/industrias/saneamento`               | equivalência direta                      |
| `/setores/gas-petroleo`                | `/industrias/oleo-e-gas`               | equivalência aprovada no lote clean-room |
| `/setores/hvac`                        | `/industrias/hvac`                     | equivalência direta                      |
| `/setores/agronegocio`                 | `/industrias/agronegocio`              | equivalência direta                      |
| `/setores/industria`                   | `/industrias/processos-industriais`    | equivalência com a indústria publicada   |
| `/setores/biogas-biometano`            | `/industrias/biogas-biometano`         | substituto clean-room publicado          |
| `/setores/protecao-catodica`           | `/industrias/protecao-catodica`        | substituto clean-room publicado          |
| `/setores/controle-ambiental`          | `/industrias/controle-ambiental`       | substituto clean-room publicado          |
| `/setores/seguranca-operacional`       | `/industrias/seguranca-operacional`    | substituto clean-room publicado          |
| `/setores/instrumentacao`              | `/industrias/instrumentacao`           | substituto clean-room publicado          |
| `/setores/telemetria`                  | `/industrias/telemetria`               | substituto clean-room publicado          |

O mapa está sincronizado em `public/_redirects`, no Worker e nas rotas cliente necessárias ao servidor local. Não há wildcard, cadeia ou redirect para homepage genérica.

## 404 real

- subrotas antigas de Detecção de Gás sem equivalente comprovado retornam 404 real com `X-Robots-Tag: noindex`;
- slugs não publicados de produtos, serviços, indústrias, aplicações e soluções retornam 404 real;
- assets/chunks inexistentes não retornam o shell SPA;
- o frontend não transforma ausência editorial em conteúdo anterior nem em soft-404.

Evidência publicada: `/deteccao-de-gas/deteccao-movel/s800` retornou 404 e `/setores/telemetria` retornou 301 com `Location: /industrias/telemetria`.

## 410

Nenhum 410 foi aplicado. A área de Detecção de Gás continua existindo e seu hub está publicado; caminhos sem equivalente comprovado ficam em 404, conforme decisão editorial autorizada. O contrato `cms_route_rules` continua apto a publicar 410 futuramente mediante decisão explícita.

## Guardas

`scripts/phase9/legacy-retirement.test.mjs` verifica destinos exatos, ausência de wildcard/soft-404 e status/cabeçalhos do Worker. `tests/e2e/routes-and-a11y.spec.ts` repete a matriz no staging publicado.
