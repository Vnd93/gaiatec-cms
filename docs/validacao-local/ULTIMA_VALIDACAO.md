# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-28T19:10:53.138Z

**Fim:** 2026-08-28T19:11:59.381Z

**Branch:** `Remodelagem`

**Commit-base:** `5de49aa1a2ae012b935669e808dd1d9a877d2e9f`

**Estado inicial:** arvore Git limpa

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
| Build de staging | APROVADO | 21s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 21s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia complementa os checks automaticos do GitHub Actions e permanece disponivel como contingencia. Ela nao autoriza deploy de producao.
