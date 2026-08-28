# CI/CD, artefatos e rollback — Fase 2

## Fluxo aprovado

1. pull request ou push em `Remodelagem` executa qualidade, Postgres efêmero e navegador em paralelo;
2. cada instalação parte de `npm ci` com a versão Node definida em `.nvmrc`;
3. preview de pull request usa branch Cloudflare exclusiva e recebe `X-Robots-Tag: noindex, nofollow, noarchive`;
4. o build gera `release-manifest.json` com commit, data e SHA-256 de todos os arquivos;
5. staging e rollback são manuais e protegidos pelo environment `staging`;
6. produção só pode ser despachada a partir de `main`, exige confirmação textual e environment `production`.

O workflow de produção existe como controle preventivo, mas não é acionado na Fase 2.

## Aprovações

Os environments `preview`, `staging` e `production` são pontos de aprovação e segregação de segredos. A proteção de branch deve exigir os três jobs de `CI` (`quality`, `database`, `browser`) antes de merge. O operador confirma explicitamente o commit imutável; rollback exige a frase `ROLLBACK-STAGING`.

## Rollback de aplicação

- selecione um commit previamente aprovado;
- reconstrua-o com `npm ci` e Node 22;
- confira o manifesto do artefato;
- publique somente no projeto `gaiatec-cms-staging`, branch `Remodelagem`;
- execute smoke e validação de rotas;
- registre commit, URL e resultado.

Rollback de banco permanece forward-only: migrações já aplicadas não são revertidas destrutivamente. Uma correção de schema usa nova migration testada em banco vazio e restauração ensaiada conforme o runbook da Fase 1.
