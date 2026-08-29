# Fase 3 — núcleo do novo CMS

**Status:** escopo F3-01 a F3-08 concluído no staging; Gate G3 aprovado sob a contingência local vigente do G2

**Branch exclusiva:** `Remodelagem`

**Supabase staging:** `glcqsosxwgmlhzgcsnzv` (`GAIATEC CMS Staging`)

**Frontend final:** `https://c67cd638.gaiatec-cms-staging.pages.dev`

**Produção e `main`:** não acessadas; merge e promoção continuam bloqueados

## Escopo entregue

- F3-01: autenticação fechada, convite, recuperação, MFA, perfis, suspensão, último acesso e revogação de sessão;
- F3-02: sete papéis, permissões `cms:*`, RLS default-deny, separação do RDO e testes negativos em UI, API e banco;
- F3-03: shell `/admin` responsivo, breadcrumbs, dashboard, busca global, filtros, paginação, perfil/sessão e estados loading, vazio, erro e sem permissão;
- F3-04: conteúdo, rascunhos, lock otimista, revisões imutáveis, workflow, lixeira, histórico e restauração como nova revisão;
- F3-05: publicação transacional, projeção versionada, outbox idempotente, cache/ETag, agendamento, retry e eventos operacionais;
- F3-06: preview com token curto, renderer compartilhado, `noindex` e `no-store`;
- F3-07: biblioteca privada vazia, metadados e direitos obrigatórios, MIME/dimensões reais, variantes WebP/AVIF, mapa de usos e substituição versionada;
- F3-08: registro de capacidades por `consumer_id`, schema/renderer/rotas/permissões e rejeição de blocos sem consumidor.

As migrations `0010` a `0018` estão aplicadas somente no staging. As funções `cms-users`, `cms-session`, `cms-content`, `cms-preview`, `cms-public`, `cms-media` e `cms-outbox-worker` estão ativas no mesmo projeto. `cms-preview`, `cms-public` e `cms-outbox-worker` usam verificação própria por token público curto ou segredo do worker; isso explica `verify_jwt=false` nessas três funções.

## Evidências atuais

- [EVIDENCIAS_GATE_G3.md](EVIDENCIAS_GATE_G3.md): matriz remota, limpeza, validação local e decisão formal;
- [VALIDACAO_UX_UI_G3.md](VALIDACAO_UX_UI_G3.md): inspeção prática desktop/mobile no navegador do staging;
- [MATRIZ_RBAC_INICIAL.md](MATRIZ_RBAC_INICIAL.md): papéis e limites de atuação;
- evidências incrementais `CMS-001` a `CMS-004`: histórico da construção da fundação.

## Contingência G2 preservada

`npm run validate:local` é a autoridade obrigatória enquanto a integração externa não for regularizada. Este pacote não declara GitHub Actions, environments ou branch protection verdes. Referências históricas a CI remoto nos arquivos incrementais não substituem a contingência formal de `docs/fase-2/EVIDENCIAS_GATE_G2.md`.

Gate G3 aprovado não autoriza Fase 4, merge em `main` nem produção.

## Fechamento recuperado

O commit funcional `c4ca32d` passou em `npm run validate:local` com árvore limpa e foi publicado somente no projeto/branch de staging. A reconsulta final confirmou projeção pública vazia, headers privados do admin, 404 real para asset/preview/conteúdo ausentes e ausência de segredo ou conteúdo real no diff. A matriz remota completa não foi repetida porque suas fixtures já haviam sido removidas e a credencial temporária retirada.
