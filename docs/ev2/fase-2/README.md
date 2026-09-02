# EV2.2 — experiência operacional e rascunhos progressivos

**Status:** Gate G2 aprovado; EV2.3 liberada no branch; produção bloqueada<br>
**Escopo:** preview isolado, shadow storage e flag desligada por padrão

## Entregas

- Contratos distintos para `DraftSchema`, `ReviewSchema` e `PublishSchema`.
- Shadow storage privado `cms_content_drafts_v2`, recibos idempotentes e eventos imutáveis.
- Edge Function `cms-drafts-v2` com autenticação, origem, escopo, limite, concorrência e produção bloqueada.
- Autosave de 2 segundos por patch de campo, retry exponencial, recuperação explícita e conflito sem sobrescrita.
- Backup local namespaced por ambiente, usuário, editor, entidade e versão de schema, somente para conteúdo editorial não sensível.
- Componente acessível de estados do rascunho e picker base reutilizável no editor de produtos.
- Adapter candidato no novo produto, protegido por `VITE_EV2_DRAFT_V2_CANDIDATE` e pela flag server-side `ev2.draft_v2`.

## Limites deliberados

O rascunho v2 não cria `cms_content_items`, revisão, publicação, projeção, sitemap, busca ou rota pública. O contrato v1 permanece como única fronteira publicável. A conversão de rascunho progressivo para payload editorial completo pertence ao gate de revisão e continuará bloqueada até as fases de dados mestres/PIM.

Nenhuma flag é ativada persistentemente por esta entrega. O canary técnico usa override sintético e temporário, removido ao terminar. O acesso de `OP-01` usa override separado com TTL máximo de duas horas; capability indisponível retorna ao v1 com aviso explícito.

## Verificação

```bash
npm run test:ev2:phase2
npm run test
supabase db reset --local --no-seed
supabase test db
npm run test:e2e
npm run check
```

Consulte o [contrato operacional](CONTRATO_E_OPERACAO.md), os [cenários de resiliência](OFFLINE_CONFLITO_RECUPERACAO.md), o [relatório do canary de staging](RELATORIO_CANARY_STAGING_2026-09-02.md), o [roteiro da sessão humana](ROTEIRO_SESSAO_HUMANA_G2.md) e o [Gate G2](GATE_G2.md).
