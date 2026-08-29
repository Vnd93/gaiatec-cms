# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-29T03:36:10.107Z

**Fim:** 2026-08-29T03:37:24.445Z

**Branch:** `Remodelagem`

**Commit-base:** `d9d82de087e99a0017047d162f826d1ff59685dc`

**Estado inicial:** com alteracoes locais ainda nao commitadas

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
| Formatacao | APROVADO | 2s |
| Lint | APROVADO | 11s |
| TypeScript | APROVADO | 6s |
| Testes unitarios | APROVADO | 3s |
| Testes de integracao | APROVADO | 1s |
| Contencoes da Fase 1 | APROVADO | 1s |
| Fundacao da Fase 3 | APROVADO | 1s |
| Produto vertical da Fase 4 | APROVADO | 1s |
| Auditoria de dependencias | APROVADO | 2s |
| Build de staging | APROVADO | 20s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 29s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia e a autoridade obrigatoria da contingencia local vigente. Ela nao comprova GitHub Actions, environments ou branch protection e nao autoriza merge em main nem deploy de producao.
