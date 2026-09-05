# Relatório do canary técnico EV2.6 em staging

**Data:** 2 de setembro de 2026<br>
**Ambiente:** Supabase e Cloudflare Pages de staging<br>
**Branch:** `ev2/desenvolvimento-fases-1-a-12`<br>
**Commit do canary operacional:** `f8d19d222f014ed58e066a38c052d1ebc0258f8a`<br>
**Commit/build final:** `71a36aa338a13805fe0324a6e94239b57b50cd4b`<br>
**Resultado técnico:** aprovado — 34/34 verificações<br>
**Gate G6:** aprovado

## Limites da execução

O canary foi executado após autorização explícita e permaneceu restrito ao staging. Não houve migration, função, build, flag, conteúdo ou escrita em produção. O ensaio usou somente usuário, MFA, override, conteúdo, regras e consultas sintéticos e descartáveis. A flag global permaneceu desligada e o staging estável não foi promovido.

## Banco, funções e build

- O alvo foi confirmado antes das escritas: ref `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`.
- A migration `0044_ev2_search_quality.sql` foi ensaiada dentro de uma transação com assertions e `ROLLBACK`; nenhuma tabela ou coluna persistiu no ensaio.
- `0044` era a única migration pendente e foi aplicada somente em staging.
- `cms_search_documents` e `cms_quality_runs` terminaram com RLS ativa.
- `ev2.search_quality` permaneceu com `default_enabled=false` e `kill_switch=false` antes, durante e depois do canary.
- Funções finais: `cms-search-admin` v14 e `cms-quality` v1 com JWT obrigatório; `cms-content` v20 com JWT obrigatório; `cms-public` v33 e `cms-outbox-worker` v20 sem JWT no gateway, preservando seus controles próprios já validados.
- Deployment Cloudflare Pages: `785b557a-b67e-4869-857f-8332daba9269`, ambiente Preview, branch `ev2-g6-canary`, fonte `71a36aa`.
- Alias isolado: <https://ev2-g6-canary.gaiatec-cms-staging.pages.dev>.
- Deployment imutável: <https://785b557a.gaiatec-cms-staging.pages.dev>.
- Manifesto final: 1.424 arquivos, SHA-256 `eba88e256ed61f9c12075a055ee53af812b9089204116a52fdd4b339e0651c29`.
- URL imutável e alias passaram 6/6 smokes cada: rotas públicas e RDO responderam 200; rota e asset inexistentes responderam 404; todas as respostas preservaram `noindex`.

O workflow manual da EV2.6 ainda não existe no branch padrão do repositório e, por isso, não pôde ser despachado pelo GitHub. O candidato foi gerado localmente a partir do SHA aprovado e publicado por Wrangler com `--commit-hash`, sem alterar produção.

## Verificações funcionais

O runner `npm run canary:ev2:phase6` criou um usuário descartável, concluiu MFA/TOTP e obteve sessão AAL2 antes das operações críticas. O override individual foi limitado a 30 minutos. As 34 verificações aprovadas cobriram:

1. alvo exato, flag global default-off e override individual;
2. recusa explícita de envelopes de produção nas APIs de busca e qualidade;
3. recusa do worker sem secret, sem reservar filas;
4. rascunho sintético, dois erros determinísticos e bloqueio de qualidade;
5. idempotência, colisão segura e exceção temporária com MFA, motivo e expiração;
6. preservação do erro não dispensado, correção do rascunho e qualidade aprovada;
7. submissão, aprovação, publicação e sincronização direta do índice sombra;
8. negação do índice para `anon` e ausência de ranges técnicos inferidos;
9. sinônimo, pin, bury e redirect com owner, vigência e auditoria;
10. faceta pública, busca administrativa filtrada por permissão e histórico de quatro execuções de qualidade;
11. zero resultado explícito e analytics anônimo entregue de forma eventual;
12. SLOs de busca pública, busca administrativa e indexação;
13. flag global inalterada e resíduo sintético zero.

## SLOs e orçamento do cliente

| Medida                                 | Meta                       | Resultado                          |
| -------------------------------------- | -------------------------- | ---------------------------------- |
| Busca pública, servidor, p95/20        | menor que 400 ms           | **351 ms**                         |
| Busca administrativa, servidor, p95/20 | menor que 1 s              | **807 ms**                         |
| Busca administrativa ponta a ponta     | diagnóstico                | 1.017,3 ms                         |
| Indexação até resultado pesquisável    | menor que 60 s             | **43.667 ms**                      |
| Grafo inicial                          | chunks menores que 600 KiB | **4 chunks; 751.324 bytes totais** |
| Excel e PDF                            | fora do grafo inicial      | **carregamento sob demanda**       |

As métricas pública e administrativa usam `Server-Timing`, medindo a mesma fronteira de processamento do servidor. O tempo ponta a ponta administrativo foi mantido como evidência diagnóstica e inclui a rede entre o executor no Brasil e o staging em `us-east-2`.

## Diagnósticos e endurecimento

As passagens controladas anteriores à aprovação foram interrompidas de forma segura e limpas antes de cada repetição:

- a massa inválida ainda fornecia um resumo, utilizado corretamente como fallback de SEO; o fixture passou a retirar título e resumo para testar dois bloqueios independentes;
- a consulta de zero resultado reutilizava o prefixo do próprio conteúdo e era encontrada por similaridade; passou a usar um termo aleatório sem sobreposição;
- a busca pública aguardava a persistência analítica e registrou p95 de 860 ms; a telemetria anônima passou para `EdgeRuntime.waitUntil`, com confirmação eventual e tratamento de erro, reduzindo o p95 a 351 ms;
- os controles administrativos de feature, rate limit e permissões eram sequenciais; foram paralelizados sem remover validações;
- a medição administrativa foi alinhada ao `Server-Timing` público e ampliada de 7 para 20 amostras, evitando que “p95” representasse apenas o pior valor de uma amostra insuficiente;
- a inspeção visual encontrou uma mensagem de telemetria indevida quando a consulta estava vazia e facetas vazias com rótulos técnicos; o build final passou a exibir orientação inicial, ocultar facetas sem opções e usar rótulos em português.

O build final alterou somente a apresentação do estado vazio/facetas. Por isso, após o canary operacional 34/34, foram repetidos apenas typecheck, testes EV2.6, CI, build, smoke HTTP e inspeção visual. A página `/busca` terminou sem erros ou avisos de console, sem facetas vazias e sem mensagem falsa de analytics.

## Auditoria pós-execução

Uma consulta independente, separada do runner, confirmou:

- migration `0044` registrada e RLS ativa nas tabelas críticas;
- zero usuário, perfil e override sintéticos G6;
- zero conteúdo, documento de busca, regra, sinônimo e evento das fixtures;
- `ev2.search_quality` ainda globalmente desligada e kill switch não acionado;
- as cinco funções autorizadas ativas nas versões e políticas JWT registradas acima;
- o último deployment Cloudflare de produção continuou no SHA `2042c8f`, anterior ao canary.

## CI e decisão

- [CI do push final — execução 33708517312](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33708517312): aprovada.
- [CI do pull request final — execução 33708519625](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33708519625): aprovada.
- [Preview do pull request final — execução 33708519633](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33708519633): aprovado.

O Gate G6 está aprovado e encerrado. A EV2.7 está liberada para implementação e posterior canary próprio. Produção, promoção do staging estável, ativação global, merge em `main` e uso de dados reais permanecem fora do escopo e exigem autorização específica.
