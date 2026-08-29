# Ultima validacao local

**Resultado geral:** APROVADO

**Inicio:** 2026-08-29T15:22:25.082Z

**Fim:** 2026-08-29T15:24:43.064Z

**Branch:** `Remodelagem`

**Commit-base:** `d37a31e13d55b78121b80d16ee8811b697b7ff2d`

**Estado inicial:** com alteracoes locais ainda nao commitadas

| Verificacao | Resultado | Duracao aproximada |
| --- | --- | --- |
| Formatacao | APROVADO | 2s |
| Lint | APROVADO | 33s |
| TypeScript | APROVADO | 9s |
| Testes unitarios | APROVADO | 29s |
| Testes de integracao | APROVADO | 1s |
| Contencoes da Fase 1 | APROVADO | 1s |
| Fundacao da Fase 3 | APROVADO | 1s |
| Produto vertical da Fase 4 | APROVADO | 1s |
| Catalogo e descoberta da Fase 5 | APROVADO | 1s |
| Auditoria de dependencias | APROVADO | 2s |
| Build de staging | APROVADO | 31s |
| Manifesto do artefato | APROVADO | 2s |
| Testes de navegador | APROVADO | 29s |


## Limite desta validacao

O banco Supabase efemero nao faz parte deste comando porque exige Docker e Supabase CLI instalados. Quando esse ambiente estiver disponivel, execute `supabase start`, `supabase db reset --local --no-seed`, `npm run test:rls` e `supabase stop --no-backup`.

Esta evidencia e a autoridade obrigatoria da contingencia local vigente. Ela nao comprova GitHub Actions, environments ou branch protection e nao autoriza merge em main nem deploy de producao.
