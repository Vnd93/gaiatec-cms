# Relatório do canary técnico EV2.2 em staging

**Data:** 2 de setembro de 2026<br>
**Ambiente:** Supabase e Cloudflare Pages de staging<br>
**Branch:** `ev2/desenvolvimento-fases-1-a-12`<br>
**Commit/build:** `55b549f6ed04518c2c86e6e25e52948bf206596c`<br>
**Resultado técnico:** aprovado<br>
**Gate G2:** sessão humana pendente

## Limites da execução

O canary foi executado após autorização explícita e ficou restrito ao staging. Não houve migration, função, build, flag ou conteúdo alterado em produção. O adaptador continua desligado por padrão e não existe override global, de ambiente ou de site.

## Banco e função

- As migrations `0037_ev2_foundation_flags_release.sql`, `0038_ev2_progressive_drafts.sql` e `0039_ev2_draft_conflict_sqlstate.sql` foram aplicadas ao projeto `GAIATEC CMS Staging`.
- A Edge Function `cms-drafts-v2` foi implantada com verificação JWT e `CMS_ENVIRONMENT=staging`.
- A flag `ev2.draft_v2` permaneceu com `default_enabled=false` e `kill_switch=false`.
- RLS permaneceu ativa; `anon` e `authenticated` não receberam leitura direta das tabelas shadow.
- O smoke test não autenticado foi recusado com HTTP 401.

O primeiro ensaio autenticado encontrou uma espera indevida na resposta de conflito: o SQLSTATE `40001` acionava retry automático na infraestrutura. A correção foi feita de forma aditiva pela migration `0039`, trocando somente os três raises de conflito esperados por `P0001`. A migration original `0038`, já aplicada, não foi reescrita.

Após a correção, o script `scripts/ev2/phase2/staging-canary.ps1` concluiu 15 de 15 verificações:

1. usuário e perfil sintéticos;
2. papel editorial e override temporário por usuário;
3. autenticação e capability habilitada apenas no escopo do ensaio;
4. criação de rascunho vazio;
5. replay idempotente;
6. autosave por patch;
7. conflito obsoleto retornado como HTTP 409 sem perda;
8. retomada da versão mais recente;
9. leitura anônima recusada;
10. produção recusada;
11. kill switch por escopo aplicado e efetivo;
12. limpeza integral dos dados sintéticos.

O pós-check confirmou zero usuário, perfil, rascunho, recibo, evento ou override sintético remanescente.

Durante a primeira sessão humana, o candidato inicial expôs uma incompatibilidade entre os timestamps PostgreSQL com offset `+00:00` e o contrato frontend restrito ao sufixo `Z`. A resposta de resume era HTTP 200 e o rascunho existia no banco, mas a validação local abortava a recuperação. O contrato foi corrigido para aceitar timestamps ISO com offset obrigatório, recebeu teste de regressão e foi republicado no mesmo alias isolado.

O reteste técnico no navegador autenticado salvou `G2-SYN-T01-V2-FIX`, confirmou `lock_version=3` no banco e recuperou o mesmo conteúdo depois de reabrir a rota. Não houve alerta de sincronização nem alteração no conteúdo público.

## Build e preview isolado

- Alias permanente do canary: <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev>
- Deployment imutável corrigido: <https://6080940a.gaiatec-cms-staging.pages.dev>
- Formulário candidato: <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev/admin/produtos/novo>
- Manifesto remoto: release exato `55b549f6ed04518c2c86e6e25e52948bf206596c`, 1.418 arquivos e identidade de release com o manifesto local.
- SHA-256 de `release-manifest.json`: `742185e2fcbb35fa32e3cffbeb06f19baa612b0f16469c6c611b97e6da5c3725`.
- SHA-256 do pacote enviado: `0a01dc1c29b817c306cc0fa0249bb6bfb70be288655e8fdd8404e317ec61c0f0`.
- Cabeçalho do preview: `X-Robots-Tag: noindex, nofollow, noarchive`.

O Cloudflare registrou o candidato como `Preview`, source `ev2-g2-canary`. O deployment estável de staging permaneceu em `868f4382.gaiatec-cms-staging.pages.dev`, source `Remodelagem`; ele não foi promovido nem substituído.

## CI e revisão

- [CI do pull request — execução 33643008212](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33643008212): aprovado.
- [Preview do pull request — execução 33643007967](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33643007967): aprovado.
- [CI do push — execução 33642983771](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33642983771): aprovado.
- [Pull request draft #2](https://github.com/pedronishida/website_gaiatecsistemas/pull/2): sem merge antes da decisão humana do G2.

## Pendência humana e rollback

`OP-01` foi autenticado e o override temporário foi limitado ao próprio usuário. Para concluir o G2, ainda devem ser retomadas, com `REV-01`, as medições humanas válidas da baseline v1 de T01–T08 e da comparação v2 de T01. O reteste técnico da correção não será contabilizado como medição humana.

O rollback permanece pronto em três camadas: desabilitar o override de `OP-01`, ativar o kill switch server-side se necessário e manter `VITE_EV2_DRAFT_V2_CANDIDATE=false` no build estável. Dados shadow não são publicados nem apagados pelo rollback.
