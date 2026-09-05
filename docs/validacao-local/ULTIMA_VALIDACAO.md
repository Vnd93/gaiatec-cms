# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-29T17:12:34.556Z

**Fim:** 2026-08-29T17:13:52.185Z

**Branch:** `Remodelagem`

**Commit-base:** `bbcaf615707b5a74962f1ffaf004a63c88542e2d`

**Estado inicial:** com alteracoes locais ainda nao commitadas

| Verificacao                     | Resultado | Duracao aproximada |
| ------------------------------- | --------- | ------------------ |
| Formatacao                      | APROVADO  | 2s                 |
| Lint                            | APROVADO  | 12s                |
| TypeScript                      | APROVADO  | 7s                 |
| Testes unitarios                | APROVADO  | 4s                 |
| Testes de integracao            | APROVADO  | 1s                 |
| Contencoes da Fase 1            | APROVADO  | 1s                 |
| Fundacao da Fase 3              | APROVADO  | 1s                 |
| Produto vertical da Fase 4      | APROVADO  | 1s                 |
| Catalogo e descoberta da Fase 5 | APROVADO  | 1s                 |
| Auditoria de dependencias       | APROVADO  | 2s                 |
| Build de staging                | APROVADO  | 20s                |
| Manifesto do artefato           | APROVADO  | 2s                 |
| Testes de navegador             | APROVADO  | 27s                |

## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker, ausente neste host. A Supabase CLI esta disponivel via `npx supabase` 2.116.0. Quando Docker estiver disponivel, execute `npx supabase start`, `npx supabase db reset --local --no-seed`, `npm run test:rls` e `npx supabase stop --no-backup`.

Esta evidencia e a autoridade obrigatoria da contingencia local vigente. Ela nao comprova GitHub Actions, environments ou branch protection e nao autoriza merge em main nem deploy de producao.
