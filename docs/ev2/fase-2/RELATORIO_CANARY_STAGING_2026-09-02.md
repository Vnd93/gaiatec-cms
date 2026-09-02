# Relatório do canary técnico EV2.2 em staging

**Data:** 2 de setembro de 2026  
**Ambiente:** Supabase e Cloudflare Pages de staging  
**Branch:** `ev2/desenvolvimento-fases-1-a-12`  
**Commit/build:** `70489c83ffa9c7e918ec083a134a8436f2f9b4bc`  
**Resultado técnico:** aprovado  
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

## Build e preview isolado

- Alias permanente do canary: <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev>
- Deployment imutável: <https://f8933c92.gaiatec-cms-staging.pages.dev>
- Formulário candidato: <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev/admin/produtos/novo>
- Manifesto remoto: release exato `70489c83ffa9c7e918ec083a134a8436f2f9b4bc`, 1.418 arquivos e identidade binária com o manifesto local.
- SHA-256 de `release-manifest.json`: `4186d56fa3587b7d96967b5399dc95abbbc566611b8b95e5762320b987ff2d4e`.
- SHA-256 do pacote enviado: `1ad931158c00d205980f6c8f4f181cc601e98d34fcf29760fabfc8f377c806fe`.
- Cabeçalho do preview: `X-Robots-Tag: noindex, nofollow, noarchive`.

O Cloudflare registrou o candidato como `Preview`, source `ev2-g2-canary`. O deployment estável de staging permaneceu em `868f4382.gaiatec-cms-staging.pages.dev`, source `Remodelagem`; ele não foi promovido nem substituído.

## CI e revisão

- [CI do pull request — execução 33629916088](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33629916088): `quality`, `database` e `browser` aprovados.
- [CI do push — execução 33629911141](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33629911141): `quality`, `database` e `browser` aprovados.
- [Pull request draft #2](https://github.com/pedronishida/website_gaiatecsistemas/pull/2): sem merge antes da decisão humana do G2.

## Pendência humana e rollback

Para concluir o G2, `OP-01` deve autenticar-se no alias do canary e participar, com `REV-01`, da baseline v1 de T01–T08 e da comparação v2 de T01. O override por usuário somente será iniciado quando a sessão estiver pronta, com TTL máximo de duas horas, para não desperdiçar a janela nem ampliar a exposição.

O rollback permanece pronto em três camadas: desabilitar o override de `OP-01`, ativar o kill switch server-side se necessário e manter `VITE_EV2_DRAFT_V2_CANDIDATE=false` no build estável. Dados shadow não são publicados nem apagados pelo rollback.
