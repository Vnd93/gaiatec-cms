# Relatório do canary técnico EV2.2 em staging

**Data:** 2 de setembro de 2026<br>
**Ambiente:** Supabase e Cloudflare Pages de staging<br>
**Branch:** `ev2/desenvolvimento-fases-1-a-12`<br>
**Commit/build final:** `af20bc75b48cae051e340fcbc585e9e91a7bb60e`<br>
**Resultado técnico:** aprovado<br>
**Gate G2:** aprovado sob protocolo reduzido por risco

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

Depois que a expiração do override demonstrou um fallback seguro porém opaco, o build `af20bc7` passou a avisar explicitamente quando a capability está indisponível. O ensaio final salvou e restaurou o título de referência, confirmou `lock_version=14`, desligou o override somente durante o teste, observou o alerta acessível e reativou o mesmo escopo/TTL. O canary sintético foi repetido com 15/15 aprovações e limpeza integral.

## Build e preview isolado

- Alias permanente do canary: <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev>
- Deployment imutável final: <https://bd5a80a3.gaiatec-cms-staging.pages.dev>
- Formulário candidato: <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev/admin/produtos/novo>
- Manifesto remoto: release exato `af20bc75b48cae051e340fcbc585e9e91a7bb60e`, 1.418 arquivos e identidade de release com o manifesto local.
- SHA-256 de `release-manifest.json`: `551deeaed5050d3704d7959b0ca6d3d4393342121c9bc2c512bad22a95569dd5`.
- SHA-256 do pacote enviado: `5cef262b0bf9eba3613d88c501ad7903ffd6685cd26add105d623ef74cd3d5db`.
- Cabeçalho do preview: `X-Robots-Tag: noindex, nofollow, noarchive`.

O Cloudflare registrou o candidato como `Preview`, source `ev2-g2-canary`. O deployment estável de staging permaneceu em `868f4382.gaiatec-cms-staging.pages.dev`, source `Remodelagem`; ele não foi promovido nem substituído.

## CI e revisão

- [CI do push final — execução 33662108812](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33662108812): aprovado.
- [Preview do pull request final — execução 33662098836](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33662098836): aprovado.
- [CI do pull request final — execução 33662098756](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33662098756): aprovado.
- [Pull request draft #2](https://github.com/pedronishida/website_gaiatecsistemas/pull/2): permanece sem merge; nenhuma autorização de merge ou produção foi inferida da aprovação do G2.

## Decisão e rollback

`OP-01` concluiu duas repetições humanas v2 com recuperação clara, zero erro e zero ajuda; as duas tentativas v1 falharam antes de persistir o rascunho parcial. O responsável pelo produto autorizou o Codex a executar os cenários técnicos restantes e a reduzir repetições equivalentes. T02–T08 serão comparadas no gate da funcionalidade correspondente. Não há alegação quantitativa de ganho de tempo sem mediana v1 observada.

O rollback permanece pronto em três camadas: desabilitar o override de `OP-01`, ativar o kill switch server-side se necessário e manter `VITE_EV2_DRAFT_V2_CANDIDATE=false` no build estável. Dados shadow não são publicados nem apagados pelo rollback.
