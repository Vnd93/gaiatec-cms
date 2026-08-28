# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-28T18:10:08.309Z

**Fim:** 2026-08-28T18:11:12.177Z

**Branch:** `Remodelagem`

**Commit-base:** `4754a6e123f4afe52e12e5578bab1c0f6229db4a`

**Estado inicial:** arvore Git limpa

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
| Formatacao | APROVADO | 1s |
| Lint | APROVADO | 11s |
| TypeScript | APROVADO | 5s |
| Testes unitarios | APROVADO | 3s |
| Testes de integracao | APROVADO | 1s |
| Contencoes da Fase 1 | APROVADO | 1s |
| Auditoria de dependencias | APROVADO | 2s |
| Build de staging | APROVADO | 20s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 22s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia substitui temporariamente os checks automaticos de aplicacao e navegador. Ela nao autoriza deploy de producao.
