# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-28T20:05:50.008Z

**Fim:** 2026-08-28T20:07:02.597Z

**Branch:** `Remodelagem`

**Commit-base:** `11cdbba5ed1c54873d8d0f72e34244d517e84480`

**Estado inicial:** arvore Git limpa

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

Esta evidencia complementa os checks automaticos do GitHub Actions e permanece disponivel como contingencia. Ela nao autoriza deploy de producao.
