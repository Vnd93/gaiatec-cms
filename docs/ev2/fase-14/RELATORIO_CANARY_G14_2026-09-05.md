# Relatório de execução do canary G14 em staging

**Data:** 5 de setembro de 2026<br>
**Branch:** `ev2/fase-14-ia-transacional-controlada`<br>
**SHA aprovado pelo REV-01:** `81e042070775062faf8e13505894b8d31a5931ca`<br>
**Alias isolado:** `ev2-g14-canary.gaiatec-cms-staging.pages.dev`<br>
**Decisão:** `pause`; candidato não promovido

## Escopo executado

- alvo confirmado: `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`), `us-east-2`;
- rehearsal transacional da migration `0054` concluído com `ROLLBACK`;
- migration `0054_ev2_ai_transactional.sql` aplicada somente em staging;
- pgTAP remoto concluído com 58/58 asserções e falha configurada como exceção;
- segredo `CMS_AI_EXTERNAL_PROVIDER_ENABLED=false` confirmado sem revelar seu valor;
- somente `cms-ai-execute` publicada, ativa, com verificação JWT;
- build exato do SHA aprovado publicado apenas no alias `ev2-g14-canary`;
- smoke HTTP e acessibilidade executados;
- executor integrado iniciado sob autorização `STAGING-G14-SYNTHETIC`.

Produção, staging estável, domínios/dados reais, provedor externo e ativação global permaneceram
fora do escopo.

## Resultado da tentativa

| Controle                            | Resultado                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------- |
| Rehearsal `0054`                    | aprovado; rollback confirmado                                             |
| pgTAP remoto                        | 58/58                                                                     |
| Build/manifest                      | aprovado; SHA e release exatos                                            |
| Smoke HTTP                          | 6/6; `noindex` presente                                                   |
| Acessibilidade                      | 5 aprovados; 1 caso desktop inaplicável                                   |
| Sonda HTTP, janela inicial          | 100% disponível; 0 HTTP 5xx; `pause` por `/produtos` p95 1.819 ms         |
| Sonda HTTP, janela após aquecimento | 100% disponível; 0 HTTP 5xx; `pause` por `/produtos` p95 1.584 ms         |
| Flags globais                       | ambas default-off                                                         |
| Rota `/admin/assistente/execucao`   | `404`; contrato exigia `200` privado/no-store                             |
| Usuários/overrides/fixtures         | não criados; interrupção ocorreu antes da etapa de identidade             |
| Limpeza                             | `syntheticResidue=0`                                                      |
| Impacto externo                     | 0 chamada externa, 0 dado real, 0 mutação de produção, 0 promoção estável |

O executor produziu `G14_CANARY_FAIL`, como esperado para uma divergência de contrato, e preservou
o gate em `pause`.

## Causa e correção

O roteador React já registrava a tela, mas o inventário fail-closed do Worker não reconhecia
`/admin/assistente/execucao`. A inspeção completa identificou o mesmo desvio em outras cinco rotas
administrativas existentes: `meu-trabalho`, `qualidade`, `listas-mestras`, `dados-mestres` e `pim`.

A correção:

1. sincroniza as seis rotas válidas no `ADMIN_ROUTES`;
2. preserva `404` para rotas administrativas desconhecidas;
3. acrescenta teste de regressão para todas as superfícies administrativas estáticas;
4. exige, em cada rota válida, status `200`, `Cache-Control: private, no-store` e `X-Robots-Tag:
noindex`;
5. mantém um caso negativo de rota aninhada inexistente.

Após a correção, `npm run check`, os 13 controles G14, as 18 avaliações adversariais, o build e
`npm audit --audit-level=high` passaram localmente. Um novo SHA será fixado pelo commit, validado no
CI e submetido ao REV-01. A migration e a função já aplicadas permanecem inalteradas; um novo canary
somente poderá ocorrer após aprovação explícita do novo SHA.

## Evidência sanitizada

- `evidencias/G14_CANARY_81e0420.json`: falha do executor e resíduo zero;
- logs locais: contagens e métricas acima, sem token, chave, senha ou e-mail sintético;
- implantação candidata Cloudflare: `032e2928.gaiatec-cms-staging.pages.dev`, sem promoção.
