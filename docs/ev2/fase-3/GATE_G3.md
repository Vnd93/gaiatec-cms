# Gate G3 — dados mestres íntegros e sem órfãos

**Resultado atual:** G3 APROVADO — EV2.4 LIBERADA NO BRANCH<br>
**Produção:** bloqueada<br>
**Staging EV2.3:** canary concluído; migration e função ativas, flag desligada e build restrito ao alias isolado

## Evidências disponíveis

| Critério                    | Situação            | Evidência                                                             |
| --------------------------- | ------------------- | --------------------------------------------------------------------- |
| Schema aditivo/RLS          | aprovado em staging | migration `0040_ev2_master_data.sql` aplicada somente no staging      |
| Contrato/API                | implementado        | contrato Zod e `cms-master-data`                                      |
| Inativação histórica        | coberto             | modelo, trigger, RPC e pgTAP                                          |
| N:N sem hardcode            | coberto             | regras no banco e UI orientada pela API                               |
| Duplicidade/aliases         | coberto             | normalização, unicidade e testes                                      |
| Merge/restauração           | coberto             | comando crítico AAL2, identidade preservada e evento imutável         |
| Regressão estática/unitária | aprovado localmente | 103 Vitest, 27 EV2 estruturais, fases F1–F11, lint, typecheck e build |
| Edge Function               | aprovado em staging | `cms-master-data` v1 ativa e protegida por autenticação/flag          |
| Build candidato             | aprovado no canary  | SHA `f549d66`, alias `ev2-g3-canary`; staging estável não substituído |
| Navegador/HTTP              | aprovado            | 32 Playwright; smoke HTTP 6/6 e cabeçalhos administrativos 2/2        |
| Execução pgTAP integral     | aprovado na CI      | 185/185 testes aprovados; 37 asserções específicas da EV2.3           |
| Piloto integral/zero órfãos | aprovado em staging | 21/21 verificações; zero resíduos sintéticos e zero órfãos            |

## Critérios objetivos para aprovação

- CI de qualidade, banco e navegador verde no commit candidato.
- 37 asserções específicas da EV2.3 aprovadas junto da suíte RLS completa.
- Canary isolado em staging com migration `0040`, função `cms-master-data` e build explicitamente habilitado.
- Usuário steward com override individual temporário; flag global e produção desligadas.
- Lote piloto sintético ou previamente aprovado reconciliado com zero referências órfãs.
- Busca pré-criação, inativação, relação dependente, conflito de versão, merge e restauração validados.
- Limpeza dos dados sintéticos ou preservação identificada como evidência, conforme roteiro aprovado.

## Evidência do canary controlado — 2 de setembro de 2026

- Alvo validado antes da escrita: ref `glcqsosxwgmlhzgcsnzv`, nome `GAIATEC CMS Staging`, região `us-east-2`.
- Migration remota avançada exclusivamente de `0039` para `0040`; nenhuma outra migration foi aplicada.
- Função `cms-master-data` publicada como versão 1 com verificação JWT ativa.
- Build do SHA completo `f549d669c29a0ed31480eaa4ace77cdab22985ab`, manifesto `8cda9fa5071b2389e136d6f5e228c5a3df3dbbbd0b1c3e5db4411db5d763cfc1`.
- Deployment imutável `9788ff15.gaiatec-cms-staging.pages.dev` e alias isolado `ev2-g3-canary.gaiatec-cms-staging.pages.dev`.
- Piloto sintético aprovou autenticação, permissão, override individual, seis regras, criação, aliases, busca, duplicidade normalizada, N:N, inativação histórica, RLS anônima, bloqueio de produção e kill switch.
- Concorrência otimista, exigência AAL2, merge e restauração reversível permaneceram cobertos pelas 37 asserções pgTAP aprovadas na CI.
- A primeira reconciliação detectou que o fallback CLI do `finally` preservou o lote sintético por ordem incorreta dos argumentos. O lote foi removido de forma estritamente identificada, o roteiro foi corrigido para falhar fechado e o canary final aprovou 21/21, incluindo a verificação automática de limpeza.
- Reconciliação final: zero usuários, perfis, overrides, entidades, aliases e compatibilidades sintéticas; zero referências órfãs; `default_enabled=false`; zero overrides ativos.
- Produção respondeu `403 CMS_MASTER_DATA_PRODUCTION_GATED`; nenhuma escrita real, promoção do staging estável ou alteração em produção ocorreu.

## Decisão

G3 aprovado. O job `database` da execução CI `33666515308`, referente ao commit funcional `86e9d09`, aprovou os 185/185 testes pgTAP, e o canary autorizado comprovou o comportamento operacional e a reconciliação sem órfãos. A EV2.4 está liberada para desenvolvimento no branch atual. A aprovação não autoriza dados reais, produção, merge em `main`, promoção do alias candidato nem ativação persistente da flag EV2.3.
