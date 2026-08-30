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

| Requisito           | Prova local                                          | Prova remota em staging                                                                     |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| blog estruturado    | contrato, editor, renderer, API e testes             | agenda, publicação, restauração, `Article`, sitemap e retirada aprovados                    |
| campanha e landing  | builder, preview compartilhado, API, Worker e testes | campanha/formulário publicados e expiração `301`, `302`, `404` e `410` aprovada             |
| formulários/leads   | versão imutável, validação dupla, RLS, outbox e UI   | captura/deduplicação, atribuição, exportação AAL2, anonimização e 2 outbox events aprovados |
| LGPD                | consent log, anonimização, retenção e auditoria      | controles técnicos aprovados; aceite humano do DPO ainda pendente                           |
| configuração global | documento F6 e consumidores ativos                   | fail-closed aprovado; conteúdo permanente ainda deve ser publicado pelo proprietário        |
| clean-room          | migration sem conteúdo e interfaces vazias           | fixtures exclusivamente sintéticas retiradas e zero projeção pública residual               |

## Resultados locais finais

| Comando               | Resultado                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run check`       | formatação, lint, typecheck estrito, 48 testes Vitest, testes estruturais F2–F7 e build aprovados |
| `npm run test:e2e`    | 26 aprovados, 2 skips condicionais documentados, 0 falhas em staging                              |
| `npm run test:phase7` | 5 verificações estruturais aprovadas                                                              |
| `git diff --check`    | sem erros de whitespace                                                                           |

O lint encerrou com **0 erros** e 45 warnings preexistentes fora do escopo F7. O build manteve apenas o aviso conhecido de chunk PDF acima do limiar. As capturas e a matriz de inspeção estão em `VALIDACAO_UX_UI_F7.md`.

Nenhuma entrega de e-mail, aprovação humana ou dado editorial permanente foi fabricado para completar esta matriz.

## Implantação remota posterior

- migrations 0027 a 0033 aplicadas no Supabase staging `glcqsosxwgmlhzgcsnzv`;
- `supabase db lint --linked --level warning`: zero resultado;
- funções `cms-content`, `cms-public`, `cms-preview`, `cms-leads`, `lead-capture` e `cms-outbox-worker` ativas;
- frontend publicado no Cloudflare Pages staging, mantendo `noindex` e `no-store` no administrativo;
- correção de compatibilidade do RBAC: permissões de leads usam `cms:leads.read|assign|export|privacy`;
- `LEAD_NOTIFICATION_TO` configurado para `comercial@gaiatecsistemas.com.br` e `CMS_ADMIN_URL` apontando para staging;
- round-trip `20260830143413-3fb870` aprovado, com usuários/fixtures suspensos, retirados ou anonimizados ao final;
- nenhum artigo, campanha, formulário, produto ou lead real foi criado durante a implantação.
