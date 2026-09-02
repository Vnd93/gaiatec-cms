# Registro da sessão humana G2

**Estado:** em andamento — nenhuma decisão de gate registrada<br>
**Data:** 2 de setembro de 2026<br>
**Início técnico:** 10:50 BRT<br>
**Início da UI candidata:** 10:52 BRT<br>
**Participantes:** `OP-01` e `REV-01`<br>
**Dispositivo/rede:** mesmo computador Windows e mesma rede para v1/v2<br>
**Navegador:** Chrome controlado pela sessão local do Codex<br>
**Commit/build v2 inicial:** `70489c83ffa9c7e918ec083a134a8436f2f9b4bc`<br>
**Commit/build v2 corrigido:** `55b549f6ed04518c2c86e6e25e52948bf206596c`<br>
**Preview v2:** <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev><br>
**Deployment corrigido:** <https://6080940a.gaiatec-cms-staging.pages.dev><br>
**Staging v1:** <https://gaiatec-cms-staging.pages.dev><br>
**Override:** `ev2.draft_v2`, somente `OP-01`, expiração 12:50 BRT<br>

## Controles prévios

| Controle                      | Resultado             |
| ----------------------------- | --------------------- |
| OP-01 autenticado no v1 e v2  | aprovado              |
| Perfil ativo e papel elegível | aprovado              |
| Flag default-off              | aprovado              |
| Override amplo inexistente    | aprovado              |
| Capability v2 pelo usuário    | aprovado              |
| Autosave vazio server-side    | aprovado às 10:52 BRT |
| Resume após correção          | aprovado às 11:43 BRT |
| T01 v2 R1 humana              | aprovado às 12:12 BRT |
| Produção fora do escopo       | preservado            |

## Ordem controlada

Para T01, a ordem intercala versões e repetições: `v1-R1`, `v2-R1`, `v1-R2`, `v2-R2`. Depois são executadas duas repetições v1 de T02–T08. T02–T08 v2 permanecem para os gates em que suas funcionalidades candidatas forem implementadas.

## Medições

`Ações` conta cliques, digitações confirmadas e comandos explícitos. Espera de rede é registrada separadamente do tempo ativo.

| Ordem | Tarefa | Fluxo | Repetição | Início         | Tempo ativo   | Espera                  |      Ações | Erros | Ajuda | Recuperação/resultado       | Observação OP-01/REV-01                                                                                                               |
| ----: | ------ | ----- | --------: | -------------- | ------------- | ----------------------- | ---------: | ----: | ----: | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | T01    | v1    |         1 | 10:53:55 BRT   | não separável | não separável           | não medido |     1 |     1 | falhou; zero gravações      | O v1 bloqueou a identidade mínima pelo contrato completo. A duração incluiu troca de mensagens e não vale como baseline quantitativa. |
|     2 | T01    | v2    |         1 | não registrado | não separável | incluída em 12:12 total |         ≥4 |     0 |     0 | aprovada; recuperação clara | `G2-SYN-T01-V2-R1-OP01` recuperado após fechar/reabrir; confirmação visual e banco em `lock_version=4`, às 12:12:37 BRT.              |
|     3 | T01    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|     4 | T01    | v2    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|     5 | T02    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|     6 | T02    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|     7 | T03    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|     8 | T03    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|     9 | T04    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    10 | T04    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    11 | T05    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    12 | T05    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    13 | T06    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    14 | T06    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    15 | T07    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    16 | T07    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    17 | T08    | v1    |         1 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |
|    18 | T08    | v1    |         2 | aguardando     | —             | —                       |          — |     — |     — | —                           | —                                                                                                                                     |

## Achados e decisão

| ID          | Severidade              | Evidência                                                                                                                 | Tratamento                                                                                              |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `G2-INC-01` | esperado no controle v1 | `G2-SYN-T01-V1-R1` não gerou linha em `cms_content_drafts`; o editor v1 valida o contrato publicável antes de salvar      | registrar como limitação v1; repetir a medição com cronômetro após estabilizar o candidato              |
| `G2-INC-02` | corrigido no candidato  | o resume retornou HTTP 200 com timestamps PostgreSQL `+00:00`, rejeitados pelo contrato frontend que aceitava somente `Z` | schema corrigido no commit `55b549f`; regressão automatizada e novo preview verificado de ponta a ponta |

## Correção e reteste técnico durante a sessão

O contrato frontend passou a aceitar timestamps ISO com offset explícito, preservando a exigência de fuso horário. A suíte completa concluiu com sucesso, incluindo 91 testes Vitest, 21 testes estruturais EV2, 74 regressões por fase, typecheck e build. Os workflows `CI` e `Preview` do commit corrigido também foram aprovados.

No preview corrigido, o teste sintético `G2-SYN-T01-V2-FIX` confirmou às 11:43 BRT:

1. reconhecimento do rascunho existente retornado pelo servidor;
2. restauração explícita da versão server-side;
3. autosave do título, com confirmação visual sem alerta;
4. persistência em `cms_content_drafts_v2`, `lock_version=3`;
5. reabertura da rota e nova restauração com o mesmo título preservado.

O reteste acima é evidência técnica de regressão, não substitui as medições humanas de ações, tempo ativo, ajuda e percepção. Nenhuma decisão de gate será registrada antes da retomada da sessão quantitativa com `OP-01` e `REV-01`.

A primeira repetição humana v2 foi concluída por `OP-01` com tempo total informado de 12:12, zero erros, zero ajuda e recuperação considerada clara. Como o cronômetro não separou atividade de espera de rede, o registro preserva o total observado sem convertê-lo artificialmente em tempo ativo. O navegador e a leitura server-side confirmaram o título esperado, ausência de alerta e incremento de versão.
