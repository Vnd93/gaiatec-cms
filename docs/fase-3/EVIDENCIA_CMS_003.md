# Evidencia CMS-003 — login administrativo e MFA

> Nota vigente em 2026-08-28: referências abaixo a CI remoto são históricas e não comprovam o estado atual. A contingência aceita em `docs/fase-2/EVIDENCIAS_GATE_G2.md` torna `npm run validate:local` obrigatório e mantém Actions, environments, branch protection, `main` e produção bloqueados.

**Data:** 2026-08-28

**Commit funcional:** `82a56c2`

**Producao:** nao acessada

## Entrega

- migration `0012_fase3_cms_admin_auth.sql`;
- Edge Function `cms-session` com verificacao server-side da identidade;
- aceite de convite com ativacao atomica do perfil;
- login administrativo fechado por e-mail e senha;
- recuperacao e definicao de senha por redirect autorizado;
- cadastro, desafio e verificacao de MFA TOTP;
- exigencia de `aal2` para papeis com MFA obrigatorio;
- protecao de rota para `/admin` e separacao integral do RDO;
- eventos de login idempotentes e auditoria imutavel da ativacao;
- shell administrativo sem modulos editoriais prematuros.

## Validacoes

- formatacao: aprovada;
- lint: zero erros; avisos legados permanecem sem bloquear o gate;
- TypeScript estrito para `src/admin`: aprovado;
- testes unitarios: 7/7 aprovados;
- testes de integracao: 3/3 aprovados;
- testes estruturais da Fase 3: 10/10 aprovados;
- pgTAP do novo pacote: 16/16 aprovados em banco efemero do GitHub;
- todas as migrations `0001` a `0012` aplicadas do zero no CI: aprovadas;
- Playwright local: 17 aprovados e 3 skips intencionais;
- CI de `push` e Pull Request: qualidade, banco e navegador aprovados;
- auditoria npm: zero vulnerabilidades.

## Estado de homologacao

O ambiente local nao possui Docker e a sessao do Supabase CLI expirou. Os navegadores disponiveis tambem nao possuem sessao autenticada no painel Supabase. Por seguranca, a migration e a funcao nao foram aplicadas manualmente sem autenticacao. O pacote permanece versionado, validado em banco efemero e pronto para aplicacao exclusiva no projeto `GAIATEC CMS Staging` assim que o acesso for restabelecido.

Nenhuma identidade, perfil, evento ou conteudo sintetico foi persistido em staging. Producao nao foi consultada nem alterada.

## Limites deliberados

O shell `/admin` mostra somente o resumo seguro da sessao. Cadastro de produtos, midia, publicacao, SEO e conteudo editorial pertencem aos pacotes seguintes. O primeiro Super Admin real continua dependendo de provisionamento nominal e controlado.
