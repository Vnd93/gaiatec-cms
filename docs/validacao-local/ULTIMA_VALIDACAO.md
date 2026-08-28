# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-28T18:07:41.351Z

**Fim:** 2026-08-28T18:08:59.468Z

**Branch:** `Remodelagem`

**Commit-base:** `b79fa9919d92c2a805b7c80d5d1afcb90f5404b9`

**Estado inicial:** com alteracoes locais ainda nao commitadas

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
| Formatacao | APROVADO | 2s |
| Lint | APROVADO | 12s |
| TypeScript | APROVADO | 6s |
| Testes unitarios | APROVADO | 3s |
| Testes de integracao | APROVADO | 1s |
| Contencoes da Fase 1 | APROVADO | 1s |
| Auditoria de dependencias | APROVADO | 2s |
| Build de staging | APROVADO | 23s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 30s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia substitui temporariamente os checks automaticos de aplicacao e navegador. Ela nao autoriza deploy de producao.
