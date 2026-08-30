# Evidências técnicas — Fase 7

## Artefatos verificáveis

- migration `0027_fase7_marketing_blog_leads.sql`;
- contratos Zod de artigo, campanha, formulário e lead;
- Edge Functions `lead-capture`, `cms-leads`, `cms-content`, `cms-public`, `cms-preview` e `cms-outbox-worker`;
- telas administrativas de campanhas, formulários, leads e artigo;
- consumidores públicos de blog, campanha, formulário e posicionamento;
- Worker Cloudflare com Article schema, sitemap e status de expiração;
- testes de contrato, componente e estrutura em `tests/**` e `scripts/phase7/**`.

## Matriz de comprovação

| Requisito           | Prova local                                          | Prova remota ainda necessária                            |
| ------------------- | ---------------------------------------------------- | -------------------------------------------------------- |
| blog estruturado    | contrato, editor, renderer, API e testes             | publicação/agendamento/restauração autenticados          |
| campanha e landing  | builder, preview compartilhado, API, Worker e testes | ciclo completo em staging e expiração pelo worker        |
| formulários/leads   | versão imutável, validação dupla, RLS, outbox e UI   | captura real, atribuição, e-mail e exportação por perfis |
| LGPD                | consent log, anonimização, retenção e auditoria      | revisão do DPO e inspeção do job em staging              |
| configuração global | documento F6 e consumidores ativos                   | recadastro novo e publicação pelo proprietário           |
| clean-room          | migration sem conteúdo e interfaces vazias           | inspeção do banco staging sem dados anteriores           |

## Resultados locais finais

| Comando               | Resultado                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run check`       | formatação, lint, typecheck estrito, 44 testes Vitest, testes estruturais F2–F7 e build aprovados |
| `npm run test:e2e`    | 24 aprovados, 4 skips condicionais documentados, 0 falhas                                         |
| `npm run test:phase7` | 4 verificações estruturais aprovadas                                                              |
| `git diff --check`    | sem erros de whitespace                                                                           |

O lint encerrou com **0 erros** e 45 warnings preexistentes fora do escopo F7. O build manteve apenas o aviso conhecido de chunk PDF acima do limiar. As capturas e a matriz de inspeção estão em `VALIDACAO_UX_UI_F7.md`.

Nenhum dado remoto, sessão autenticada, entrega de e-mail ou execução de migration foi fabricado para completar esta matriz.
