# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-28T19:09:01.229Z

**Fim:** 2026-08-28T19:10:15.836Z

**Branch:** `Remodelagem`

**Commit-base:** `0d967658cab700788859751193e0bb77616909db`

**Estado inicial:** com alteracoes locais ainda nao commitadas

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
| Formatacao | APROVADO | 2s |
| Lint | APROVADO | 12s |
| TypeScript | APROVADO | 5s |
| Testes unitarios | APROVADO | 3s |
| Testes de integracao | APROVADO | 1s |
| Contencoes da Fase 1 | APROVADO | 1s |
| Fundacao da Fase 3 | APROVADO | 1s |
| Auditoria de dependencias | APROVADO | 2s |
| Build de staging | APROVADO | 22s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 29s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia complementa os checks automaticos do GitHub Actions e permanece disponivel como contingencia. Ela nao autoriza deploy de producao.
