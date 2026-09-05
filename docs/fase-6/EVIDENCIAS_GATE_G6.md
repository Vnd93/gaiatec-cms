# Gate G6 — decisão formal

**Data:** 2026-08-29  
**Decisão:** APROVADO EM STAGING

## Avaliação

| Critério do Gate G6                                                          | Evidência                                                                                                  | Decisão |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| jornadas desktop/mobile                                                      | inspeção real, Playwright em `412 × 915` e E2E sem overflow                                                | atende  |
| WCAG 2.2 AA nas jornadas principais                                          | Axe com contraste ativo, teclado, foco e landmarks aprovados                                               | atende  |
| administrador cria, edita, ordena, publica, despublica e restaura sem código | página sintética criada; revisões 1, 2 e 3; revisão 1 restaurada; retirada explícita concluída             | atende  |
| menus, configurações e destaques chegam aos consumidores                     | documento global e placements usam projeção/renderer compartilhados; integração estrutural e pública verde | atende  |
| editor visual sem JSON e preview fiel                                        | preview autenticado e frontend público compartilharam renderer; bloco oculto não apareceu                  | atende  |
| retirada exige destino e não cria órfão                                      | retirada explícita `404`; URL pública respondeu HTTP 404 real e `noindex`                                  | atende  |
| nenhum link `#` editorial                                                    | contrato, banco e renderer rejeitam links editoriais inválidos                                             | atende  |
| sem overflow                                                                 | desktop e mobile com `scrollWidth = innerWidth`                                                            | atende  |
| SEO e HTTP corretos                                                          | HTML inicial, cache, `404`, `X-Robots-Tag` e Worker verificados                                            | atende  |
| budgets de performance                                                       | build por rota, renderers lazy e suíte F6 aprovados; warning histórico do módulo PDF permanece isolado     | atende  |

## Round-trip remoto

- projeto Supabase staging: `glcqsosxwgmlhzgcsnzv`;
- página sintética: item `ebe8d5bf-8d2c-4dcc-80b6-203b67a365cb`, rota `/homologacao-g6`;
- revisão 1 publicada, revisão 2 publicada e revisão 1 restaurada como revisão 3;
- página arquivada com decisão explícita `404`, preservando auditoria;
- bloco oculto removido da projeção pública; documentos privados e metadados internos não foram expostos;
- outbox operacional reduzida de 11 pendências para zero, sem falhas, correlation ID `56b46c98-5ef0-4c13-b0ef-ecf7cf59a948`;
- diagnósticos finais: zero alerta e zero item pendente/falhado.

## Restrições preservadas

- nenhuma importação do painel/site anterior;
- nenhum produto, serviço, página, imagem ou estrutura legado foi cadastrado;
- somente o fixture sintético de homologação foi usado e depois arquivado;
- produção e branch `main` não foram alteradas;
- esta aprovação autoriza a continuidade técnica, não o go-live do Gate G8.
