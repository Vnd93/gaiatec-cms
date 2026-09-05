# Evidências do Gate G10

## Estado atual

**G10 NÃO APROVADO.** Implementação local e deploy técnico de staging concluídos, com pendências autenticadas/RLS descritas abaixo. G9 continua não aprovado por produção e janela real; F10 não altera esse estado.

## Evidências requeridas

- [x] `npm run check` verde;
- [ ] testes RLS da migration 0035 verdes;
- [x] E2E local e acessibilidade verdes;
- [x] inspeção browser pública/fail-closed desktop/mobile, console e overflow;
- [ ] sessão staging comprova continuidade durante refresh e fail-closed no logout;
- [x] migration e Edge Functions aplicadas somente ao staging;
- [ ] catálogo inicial autorizado aplicado pelo workflow auditado;
- [x] HTTP/SEO/API/UX pública de staging validados;
- [x] revisão de whitespace e inventário Git executados; worktree deliberadamente não commitado.

## Evidências já automatizadas

- continuidade de sessão: `tests/components/admin-auth-session-continuity.test.tsx`;
- backup/TTL/restauração: `tests/components/draft-backup.test.tsx`;
- contrato/importação: `tests/contracts/bulk-import.test.ts` e `product-editor-roundtrip.test.ts`;
- projeção e campos internos: `tests/unit/public-projection.test.ts`;
- estrutura vertical: `scripts/phase10/phase10-operational-experience.test.mjs`;
- RLS: `supabase/tests/rls_fase10_controlled_vocabularies.test.sql`.

## Resultados executados

- `npm run check`: 63 testes Vitest, estruturas F2–F10 e build verdes; lint sem erros e com 46 avisos preexistentes/não bloqueadores;
- `npm run test:e2e`: 32 aprovados e 8 ignorados por dependerem de `PLAYWRIGHT_BASE_URL` staging;
- Supabase CLI: `npx supabase --version` = **2.116.0**;
- `npx supabase db lint --linked --level warning`: nenhum erro de schema;
- migration remota: apenas `0035_fase10_controlled_vocabularies.sql`, aplicada ao projeto `glcqsosxwgmlhzgcsnzv`;
- funções staging: `cms-controlled-vocabularies`, `cms-content` e `cms-public` implantadas;
- Cloudflare staging: <https://4aedcf0f.gaiatec-cms-staging.pages.dev>;
- HTTP: `/`, `/produtos`, `/admin/login` e `/sitemap.xml` responderam 200 e `X-Robots-Tag: noindex, nofollow, noarchive`;
- API pública: cinco facets presentes; nenhum `manufacturer`, `manufacturerReference`, `sku` ou UUID controlado na resposta;
- navegador integrado: console limpo e sem overflow em desktop e mobile; área administrativa fail-closed sem sessão;
- Chrome staging em 2026-08-31: sessão `super_admin` de `comercial@gaiatecsistemas.com.br`, MFA “Verificado” e `cms:vocabularies.manage` confirmados visualmente em `/admin/perfil`; `/admin/listas-mestras` abriu autenticada e informou zero dimensões cadastradas antes da carga.
- repetição focada em 2026-08-31: 5/5 testes Vitest de continuidade, backup e guard aprovados; 6/6 guardas estruturais F10 aprovadas; `npm run format:check` aprovado;
- `npm run test:rls` agora invoca `npx supabase test db` e alcança a CLI 2.116.0, mas não conecta ao Postgres local (`ECONNREFUSED 127.0.0.1:54322`) porque Docker não existe neste host.

## Bloqueios exatos

1. `npx supabase test db` não executa o pgTAP porque Docker/Postgres local não está disponível (`ECONNREFUSED 127.0.0.1:54322`). A CLI Supabase está disponível; Docker é o único bloqueio local de RLS.
2. A sessão CMS staging existe e foi comprovada com MFA/AAL2, mas a aba indicada permanece retida pela tarefa de origem `01a0465a-06d4-79f3-9c67-464ce08c1b3e`. A extensão bloqueou o controle simultâneo desta tarefa delegada antes da primeira submissão. Portanto, as cinco listas/18 opções e os ensaios autenticados de editor, troca de aba, restauração e logout ainda não foram executados; nenhuma credencial ou storage foi inspecionado e nenhuma evidência foi simulada.
3. `service.category` deve permanecer sem opções até o usuário fornecer/cadastrar valores autorizados; isso é uma restrição deliberada, não autorização para inventar conteúdo.

Nenhum deploy, migration ou alteração foi feito em produção.
