# Relatório do canary técnico EV2.4 em staging

**Data:** 2 de setembro de 2026<br>
**Ambiente:** Supabase e Cloudflare Pages de staging<br>
**Branch:** `ev2/desenvolvimento-fases-1-a-12`<br>
**Commit/build final:** `a0d185a14557ec52755d61feb43cc1a06564c6cb`<br>
**Resultado técnico:** aprovado — 32/32 verificações<br>
**Gate G4:** canary técnico aprovado; piloto operacional pendente

## Limites da execução

O canary foi executado após autorização explícita e ficou restrito ao staging. Não houve migration, função, build, flag ou conteúdo alterado em produção. Não houve dado real, backfill, dual-write, promoção do staging estável ou ativação global. O usuário, os overrides e todos os registros usados no ensaio foram sintéticos e descartáveis.

## Banco e funções

- Projeto confirmado antes das escritas: ref `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`.
- A migration `0041_ev2_pim_core.sql` instalou somente o schema shadow aditivo da EV2.4.
- A migration `0042_ev2_pim_conflict_sqlstate.sql` preservou a `0041` imutável e alterou exatamente dois SQLSTATEs retentáveis para erros de domínio não retentáveis.
- `cms-pim` foi publicada como versão 2 e `cms-attributes` como versão 1, ambas ativas e com verificação JWT.
- `cms-master-data` v1 não foi alterada; o canary usou um override individual temporário porque o editor PIM depende de suas listas controladas.
- `ev2.pim_v2` e `ev2.master_data` terminaram com `default_enabled=false`, `kill_switch=false` e zero override G4.

## Diagnósticos e correções

O primeiro ensaio percorreu o grafo até a atualização otimista e encontrou uma espera de infraestrutura ao provocar conflito obsoleto. A causa foi o SQLSTATE `40001`, reservado a falhas de serialização retentáveis. O executor interrompeu o ensaio e comprovou zero resíduos. A correção aditiva `0042` substituiu apenas as duas ocorrências esperadas por `P0001` e recusa aplicar se a assinatura instalada divergir.

O segundo ensaio recebeu a falha imediatamente, mas a função respondeu HTTP 500. O cliente Supabase entrega o erro RPC como objeto simples, e o código convertia esse objeto em `"[object Object]"`. A versão 2 de `cms-pim` passou a extrair `message` e SQLSTATE de objetos RPC; a transação obsoleta continuou preservada e a limpeza novamente terminou em zero.

O terceiro ensaio concluiu 32/32 verificações:

1. usuário, perfil técnico e dois overrides individuais temporários;
2. seis entidades controladas e quatro compatibilidades sintéticas;
3. duas unidades compatíveis, definição tipada e attribute set versionado;
4. autenticação e capabilities de PIM, atributos e dependência de dados mestres;
5. criação integral de produto, modelo, variante, classificação, atributo, identificador e proveniência;
6. replay idempotente da criação;
7. round-trip do grafo e busca sem acento;
8. materialização de 10 L/s como 36 m³/h;
9. geração de SKU imutável e replay sem duplicidade;
10. adapter v1 reconciliado sem alertas;
11. atualização otimista e conflito obsoleto HTTP 409 com conteúdo preservado;
12. leitura anônima recusada e arquivamento crítico AAL1 recusado;
13. produção recusada por `cms-pim` e `cms-attributes`;
14. kill switch individual efetivo, flags globais inalteradas e limpeza integral.

O pós-check do executor confirmou zero resíduos em 20 escopos. Uma consulta global independente confirmou zero usuários, overrides, entidades mestres, produtos, identificadores, atributos e proveniência marcados como G4.

## Build e preview isolado

- Alias permanente do canary: <https://ev2-g4-canary.gaiatec-cms-staging.pages.dev>
- Deployment imutável final: <https://d64bde2f.gaiatec-cms-staging.pages.dev>
- Formulário candidato: <https://ev2-g4-canary.gaiatec-cms-staging.pages.dev/admin/pim>
- Manifesto: release `a0d185a14557ec52755d61feb43cc1a06564c6cb`, 1.424 arquivos, SHA-256 `6d99027a6ba9d7d996689128944798ae78130ae539a660fa412d386f41a5a250`.
- Smoke HTTP: 6/6 no alias final, incluindo 404 reais e `X-Robots-Tag: noindex, nofollow, noarchive`.
- O deployment estável de staging permaneceu `868f4382`; o alias candidato não o substituiu.

## CI e decisão

- [CI do push final — execução 33681484930](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33681484930): aprovada.
- [CI do pull request final — execução 33681491734](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33681491734): aprovada.
- [Preview do pull request final — execução 33681491801](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33681491801): aprovado.
- A CI recriou as migrations, aprovou 220/220 testes pgTAP, 35 asserções EV2.4, 112 testes Vitest, 32 testes de navegador, lint sem erros, typecheck e build.

O canary técnico está aprovado e encerrado com rollback do escopo individual. O Gate G4 permanece pendente para a decisão de fontes ERP/MPN/GTIN/NCM e autorização do lote real de 20–50 produtos. EV2.5, produção, merge, promoção de alias e qualquer ativação persistente continuam fora do escopo desta execução.
