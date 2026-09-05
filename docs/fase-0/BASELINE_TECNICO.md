# Baseline técnico — Fase 0

**Data da coleta:** 28 de agosto de 2026
**Workspace:** `website_gaiatecsistemas-main/website_gaiatecsistemas-main`
**Método:** inspeção local, comandos de build, smoke tests no navegador e consultas somente leitura aos provedores configurados

## 1. Identidade e integridade dos artefatos

| Artefato | SHA-256 |
|---|---|
| `website_gaiatecsistemas-main.zip` | `B0A6660E5FDB3B216577320E34A536D4C6A7365A0253AB2274C06593AD9432CC` |
| `package.json` | `E6E7FEC382B52AD29F4D654470857B3BA0B11CFD91F25E5B283618A3252831EF` |
| `package-lock.json` | `8E49D9CB2B1D5166824204036A51FBBF0FA574B0426E8268FC28F92EF2153813` |
| Árvore antes dos artefatos F0, sem `node_modules`, `dist` e `.env.local` | `3B1E826EBB4670926994FDFB6B2D5E23884E7671102CF3AC1640F330C078D54A` (1.493 arquivos) |
| `dist` reproduzido | `AED8D59C687ED67C0525E7FF403ED728DA3441AA1AACFE73973C4E35BA4197C0` (1.414 arquivos) |

O hash de `dist` foi igual após dois builds consecutivos no mesmo ambiente.

## 2. Repositório e histórico

- Repositório oficial conectado: `https://github.com/pedronishida/website_gaiatecsistemas.git`.
- Branch de trabalho: `Remodelagem`, rastreando `origin/Remodelagem`.
- Commit base: `63da59443701fc1045575d511b026a609a7cd2b3`.
- `main` e `Remodelagem` apontavam para o mesmo commit no início da conexão.
- Alterações locais preexistentes foram preservadas e aparecem como diff não sobrescrito.
- O Cloudflare Pages informa `Git Provider: No` para os projetos visíveis; os deploys foram enviados diretamente.
- Há referência histórica isolada ao commit `d39641d` em `AUDIT-DELTA.md`, insuficiente para identificar um repositório oficial.
- O Git foi inicializado/conectado após autorização expressa do solicitante.

**Conclusão:** repositório e branch base identificados; critério G0 atendido.

## 3. Runtime e dependências

| Item | Declarado | Real encontrado | Resultado |
|---|---:|---:|---|
| Node | 22 (`.nvmrc`) | 22.23.2 via execução isolada (`npx node@22`) | comprovado |
| npm | não fixado | 11.16.0 | informativo |
| Vite | 6.3.5 | 6.3.5 | instalado |
| Dependências | lockfile | `npm ls --depth=0` sem erro | instaladas |

`nvm` não está disponível nesta máquina, mas o build foi reproduzido com Node 22.23.2 por runtime isolado, sem alterar o Node global.

## 4. Scripts existentes

- Disponíveis: `dev`, `build`, `build:full`, `responsive-images`, `cf:whoami`, `cf:projects`, `deploy:preview`, `deploy:production`.
- Ausentes: `format:check`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `test:a11y`.
- Ausentes: `tsconfig.json`, pipeline `.github`, configuração de lint, formatter, Vitest e Playwright.

## 5. Build de baseline

Comando: `npm run build`.

- Resultado: sucesso em duas execuções consecutivas.
- Módulos transformados: 3.307.
- Tempo observado: 14,65 s e 14,15 s.
- Aviso: chunk de PDF com 1.904,40 kB (605,40 kB gzip), acima do limite de 600 kB.
- Saída final determinística no ambiente atual, conforme hash da seção 1.

O sucesso comprova compatibilidade de build com Node 22. `npm ci` em máquina limpa permanece critério do Gate G2.

## 6. Código e dados atuais

- 146 arquivos TSX, 37 TS e 7 migrations SQL, excluídos `node_modules` e `dist`.
- Não existe rota `/admin`; ela cai no Not Found da SPA.
- `useSiteData.ts` mantém o CMS antigo explicitamente descontinuado e retorna fallback hardcoded.
- Existem 6 Edge Functions de domínio no pacote (`rdo-*` e `submit-contact`), mas não existe fonte versionada de `site-content`.
- Existem somente 7 migrations do RDO; migrations editoriais e de leads não estão presentes.
- O site público e o RDO compartilham o mesmo entry point/roteador; o novo admin deverá nascer separado.
- O conteúdo e as mídias atuais permanecem apenas como legado técnico; não foram copiados ou classificados para carga.

## 7. Hosting real

Cloudflare Pages está operacional na conta GAIATEC Sistemas.

| Projeto | Domínios observados | Git conectado |
|---|---|---|
| `gaiatec-website` | `gaiatec-website.pages.dev`, domínio público `.com.br` com e sem `www` | não |
| `gaiatec-redesign` | `gaiatec-redesign.pages.dev`, domínio de redesign | não |
| `gaiatec-ruyang` | projeto e domínio próprios | não |

O projeto `gaiatec-website` possui deploys `Production/main`. Foi criado `gaiatec-cms-staging`, publicado separadamente com branch `Remodelagem` e header HTTP global `noindex, nofollow`. `vercel.json` permanece no pacote, mas nenhuma evidência operacional de Vercel foi localizada.

Os assets de entrada do build local e da produção não são idênticos: o JS principal tem hash diferente. Sem Git e metadados de fonte, não é possível atribuir a diferença a código, variáveis ou release.

## 8. Supabase real

- O projeto anterior `DZ System Project` é tratado conservadoramente como produção.
- Foi criado `GAIATEC CMS Staging`, região `us-east-2`, estado saudável.
- Consulta somente leitura à Management API em 28/08/2026 confirmou `0` tabelas no schema `public`, `0` buckets de Storage e `0` usuários de Auth.
- `.env.local` aponta apenas para staging e não contém access token, service role ou token Cloudflare.
- O backup privilegiado anterior foi movido para `.secrets` fora do repositório.

**Conclusão:** o ambiente local não depende de credenciais produtivas e staging de banco está disponível.

## 9. Smoke tests

### HTTP local e produção

As rotas `/`, `/produtos`, `/servicos`, `/aplicacoes`, `/blog`, `/contato`, `/admin`, `/relatorio-de-obra/login` e uma rota inexistente responderam HTTP 200 tanto localmente quanto no domínio público. Não foi observado `X-Robots-Tag` privado.

### Renderização desktop

- `/produtos`, `/servicos` e `/aplicacoes` renderizam H1 e canonical específicos.
- `/blog` e `/contato` herdam canonical da homepage.
- `/admin` renderiza “Página Não Encontrada”, porém mantém HTTP 200, `index, follow` e canonical da homepage.
- Rota inexistente apresenta o mesmo soft 404.
- `/relatorio-de-obra/login` permanece `index, follow` e com canonical público.
- Foram encontrados de 6 a 7 links `href="#"` em várias rotas públicas.

### Renderização mobile (390 × 844)

- Homepage apresenta overflow horizontal: `scrollWidth 619` para `clientWidth 375`.
- Produtos, serviços, aplicações, contato e login do RDO não apresentaram overflow na amostra.
- A homepage expõe controles “Prev” e “Next” pequenos no primeiro viewport.
- O login do RDO afirma que qualquer pessoa pode acessar por e-mail, confirmando o risco de autoinscrição descrito nos normativos.
- Nenhum erro de console foi capturado durante os smoke tests.

## 10. Resultado do baseline

O pacote compila e as rotas principais renderizam. Git/branch oficial, Node 22, staging isolado e separação de credenciais foram comprovados durante a Fase 0; os critérios e riscos remanescentes estão governados pelos gates seguintes. Os problemas funcionais observados foram registrados para contenção e não foram corrigidos nesta fase.
