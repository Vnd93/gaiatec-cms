# Relatório do canary técnico EV2.5 em staging

**Data:** 2 de setembro de 2026<br>
**Ambiente:** Supabase e Cloudflare Pages de staging<br>
**Branch:** `ev2/desenvolvimento-fases-1-a-12`<br>
**Commit/build candidato:** `405b84ac27b66bef07e8f426b92c2462ac7879b8`<br>
**Resultado técnico:** aprovado — 27/27 verificações<br>
**Gate G5:** aprovado

## Limites da execução

O canary foi executado após autorização explícita e ficou restrito ao staging. Não houve acesso de escrita, migration, função, build, flag ou conteúdo alterado em produção. O ensaio não usou dado real, não promoveu o staging estável e não habilitou a flag global. Usuário, override, imagens, conteúdo e metadados foram sintéticos e descartáveis.

## Banco, funções e build

- Projeto confirmado antes das escritas: ref `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`.
- A migration aditiva `0043_ev2_dam.sql` foi a única migration pendente e foi aplicada com sucesso.
- `ev2.dam` permaneceu com `default_enabled=false` e `kill_switch=false` antes, durante e depois do ensaio.
- `cms-media` v13 terminou ativa com verificação JWT.
- `cms-public` v30 e `cms-preview` v18 terminaram ativas e preservaram a configuração pública sem JWT já vigente.
- Deployment Cloudflare Pages: `e154fd1a-e649-47de-b8f4-2d918010cf0e`, ambiente Preview, branch `ev2-g5-canary`, fonte `405b84a`.
- Alias isolado: <https://ev2-g5-canary.gaiatec-cms-staging.pages.dev>.
- Deployment imutável: <https://e154fd1a.gaiatec-cms-staging.pages.dev>.
- Os dois endereços passaram no smoke HTTP 6/6, incluindo 404 reais e `X-Robots-Tag: noindex, nofollow, noarchive`.

## Verificações do canary

O runner `npm run canary:ev2:phase5` criou um usuário descartável, exigiu MFA/TOTP e obteve sessão AAL2 antes das ações críticas. O override individual tinha duração máxima de 30 minutos. As 27 verificações aprovadas cobriram:

1. alvo exato, flag global desligada e override individual;
2. recusa explícita do envelope destinado a produção;
3. geração e upload privados de PNG, WebP e AVIF sintéticos;
4. reserva e finalização idempotentes, com conflito de chave preservado;
5. deduplicação exata por SHA-256 e sugestão de similaridade por dHash;
6. coleção, tags e crop normalizado com round-trip íntegro;
7. atualização otimista e conflito obsoleto HTTP 409 sem perda;
8. mapa de uso bloqueando arquivamento de ativo vinculado;
9. prévia de impacto, substituição reversível e rollback;
10. agendamento de retenção, restauração e cancelamento coerente;
11. direitos expirados bloqueando publicação;
12. GC limitado ao `jobId` sintético, repetível e sem ativo órfão;
13. flag global inalterada ao final.

O resultado estruturado informou `G5_CANARY_PASS`, `productionMutations: 0`, `realDataMutations: 0` e `syntheticResidue: 0`.

## Diagnósticos e endurecimento do runner

As primeiras passagens identificaram dois defeitos restritos ao executor operacional no Windows, sem afetar a implementação DAM:

- o `npx` preservava aspas indevidas em um caminho SQL temporário absoluto, impedindo a etapa final de limpeza;
- uma tentativa de TOTP atravessou uma janela de tempo e foi recusada.

Cada execução interrompida foi reconciliada imediatamente: objetos, tabelas públicas, override, papel, perfil e usuário sintéticos foram removidos, e consultas independentes comprovaram resíduo zero antes de uma nova tentativa. O runner passou a usar caminho SQL temporário relativo, informar a saída real da CLI, repetir a limpeza idempotente e sincronizar o TOTP pelo relógio HTTP do serviço com retentativa limitada. Uma consulta de prova validou o novo caminho antes da execução final.

## Auditoria pós-execução

Uma consulta independente, separada do runner, confirmou:

- migration `0043` registrada;
- zero usuário, perfil, papel e override G5;
- zero conteúdo, ativo, coleção, receipt, evento, job de GC e log de auditoria da fixture final;
- zero objeto nos dois prefixos privados usados pelo canary;
- `ev2.dam` ainda globalmente desligada e kill switch não acionado.

## CI e decisão

- [CI do pull request do candidato — execução 33696733257](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33696733257): aprovada.
- [CI do push do candidato — execução 33696729444](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33696729444): aprovada.
- [Preview do pull request do candidato — execução 33696733258](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33696733258): aprovado.
- A validação incluiu 47/47 asserções pgTAP da EV2.5, 122 testes de unidade/componentes, testes de navegador, análise das três Edge Functions, typecheck e build.

O Gate G5 está aprovado e encerrado. A EV2.6 está liberada para implementação local e posterior canary próprio. Produção, promoção do staging estável, merge em `main` e ativação global permanecem fora do escopo e dependem de autorização específica.
