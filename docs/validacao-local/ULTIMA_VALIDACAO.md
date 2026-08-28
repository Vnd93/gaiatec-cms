# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-28T18:26:34.569Z

**Fim:** 2026-08-28T18:27:46.558Z

**Branch:** `Remodelagem`

**Commit-base:** `95a62a90f42434f3a0eaf17c4ba7c6a9bc8153ad`

**Estado inicial:** com alteracoes locais ainda nao commitadas

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
| Formatacao | APROVADO | 2s |
| Lint | APROVADO | 11s |
| TypeScript | APROVADO | 5s |
| Testes unitarios | APROVADO | 3s |
| Testes de integracao | APROVADO | 1s |
| Contencoes da Fase 1 | APROVADO | 1s |
| Fundacao da Fase 3 | APROVADO | 1s |
| Auditoria de dependencias | APROVADO | 2s |
| Build de staging | APROVADO | 21s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 29s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia substitui temporariamente os checks automaticos de aplicacao e navegador. Ela nao autoriza deploy de producao.
