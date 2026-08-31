# Relatório de estabilidade e rollback — Fase 9

**Data de abertura:** 2026-08-30

**Ambiente autorizado:** local/staging
**Produção:** não acessada, não alterada e sem autorização de go-live

## Estado técnico de staging

- Gate G8 e canary aprovados pelo administrador para iniciar F9 em local/staging;
- 14 páginas e seis indústrias clean-room publicadas por workflow governado;
- busca, sitemap, navegação, SEO e rotas usam a projeção nova;
- caminho editorial anterior removido do runtime, sem apagar histórico de auditoria/rollback;
- deploy imutável: `https://fe4d84dc.gaiatec-cms-staging.pages.dev`;
- domínio estável: `https://gaiatec-cms-staging.pages.dev`;
- staging protegido por `noindex, nofollow, noarchive`.

## Fotografia de validação em 2026-08-30

- `npm run check`: formatter, lint, typecheck, Vitest, guardas estruturais das fases 2–9 e build aprovados;
- Vitest: 50 testes aprovados;
- guardas F9: 6 testes aprovados;
- Playwright no staging: 38 aprovados, 2 skips condicionais, zero falha;
- 15 rotas públicas críticas responderam 200; canonical de produção preservada e staging em `noindex`;
- rota antiga de gás testada respondeu 404 real com `noindex`;
- redirect de setor testado respondeu 301 exato;
- sitemap respondeu 200 com 38 URLs e nenhuma `/setores/*`;
- console visual limpo, zero overflow horizontal, teclado e menu mobile aprovados.

Essa fotografia comprova estabilidade técnica imediata em staging, mas não substitui passagem real do tempo após go-live.

## Janela pós-go-live recomendada

Após autorização explícita e cutover real de produção, recomenda-se uma janela de **14 dias corridos**, iniciada no timestamp do go-live e concluída somente depois de 14 períodos completos de 24 horas. A janela não foi iniciada nem simulada nesta fase.

Critérios objetivos propostos para aprovação administrativa antes do go-live:

| Dimensão                | Limiar de fechamento                                                                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| disponibilidade pública | ≥ 99,9% na janela, excluindo manutenção previamente aprovada                                                 |
| erros de servidor       | 5xx < 0,5% por janela móvel de 24 h; nenhum intervalo > 2% por 5 min sem mitigação                           |
| incidentes              | zero P0/P1 aberto; P2 somente com owner, prazo e mitigação documentados                                      |
| API/projeção CMS        | ≥ 99,5% de respostas bem-sucedidas e p95 ≤ 1,5 s nas rotas públicas                                          |
| experiência             | p75 LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 quando houver amostra suficiente                                   |
| busca                   | erro técnico < 1%; zero exposição de campos internos/fabricante; ao menos 100 consultas ou 14 dias completos |
| sitemap/SEO             | 200 contínuo, sem URLs anteriores, sem soft-404 e canonical coerente                                         |
| formulários/outbox      | ≥ 99% de aceite técnico e nenhuma falha não resolvida por mais de 4 h                                        |
| regressão               | suíte crítica diária verde; nenhum import/query/asset/fallback anterior detectado                            |
| 404                     | nenhuma URL canônica conhecida retornando 404; desvios acima de 50% da linha de base devem ser investigados  |

Se não houver amostra suficiente para Web Vitals ou busca, o critério correspondente fica marcado como “sem amostra”, não como aprovado por ausência de dados; os demais limites e os 14 dias continuam obrigatórios.

## Gatilhos de rollback recomendados

- qualquer P0/P1 atribuível ao release;
- 5xx acima de 2% por 5 minutos;
- indisponibilidade contínua superior a 5 minutos;
- perda/corrupção de publicação, vazamento de campo interno ou falha de autorização;
- formulários indisponíveis por mais de 15 minutos;
- canonical/indexação incorreta em massa;
- impossibilidade de mitigar com roll-forward seguro dentro de 30 minutos.

## Plano de rollback

Como não houve produção, rollback de produção é **não aplicável agora**. Para staging:

1. reimplantar o artefato imutável anterior do projeto `gaiatec-cms-staging`;
2. preservar banco, revisões e auditoria — não importar conteúdo anterior;
3. desabilitar somente o artefato defeituoso e corrigir por roll-forward;
4. validar `/admin`, busca, sitemap, formulários, redirects e 404;
5. registrar release, timestamp, causa, impacto e decisão.

Para eventual produção autorizada, o rollback deve usar o último artefato imutável homologado e preservar revisões CMS. No worktree, é proibido `reset --hard` ou checkout destrutivo; reversões devem ser patches seletivos revisados.

## Situação da estabilidade

A janela recomendada está documentada, mas **não começou**, pois go-live de produção não foi autorizado. Logo, o critério temporal do Gate G9 permanece bloqueado por passagem real de tempo e não por impedimento técnico de local/staging.
