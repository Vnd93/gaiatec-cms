# Registro da sessão humana G2

**Estado:** em andamento — nenhuma decisão de gate registrada<br>
**Data:** 2 de setembro de 2026<br>
**Início técnico:** 10:50 BRT<br>
**Início da UI candidata:** 10:52 BRT<br>
**Participantes:** `OP-01` e `REV-01`<br>
**Dispositivo/rede:** mesmo computador Windows e mesma rede para v1/v2<br>
**Navegador:** Chrome controlado pela sessão local do Codex<br>
**Commit/build v2:** `70489c83ffa9c7e918ec083a134a8436f2f9b4bc`<br>
**Preview v2:** <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev><br>
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
| Produção fora do escopo       | preservado            |

## Ordem controlada

Para T01, a ordem intercala versões e repetições: `v1-R1`, `v2-R1`, `v1-R2`, `v2-R2`. Depois são executadas duas repetições v1 de T02–T08. T02–T08 v2 permanecem para os gates em que suas funcionalidades candidatas forem implementadas.

## Medições

`Ações` conta cliques, digitações confirmadas e comandos explícitos. Espera de rede é registrada separadamente do tempo ativo.

| Ordem | Tarefa | Fluxo | Repetição | Início       | Tempo ativo   | Espera        |      Ações | Erros | Ajuda | Recuperação/resultado  | Observação OP-01/REV-01                                                                                                               |
| ----: | ------ | ----- | --------: | ------------ | ------------- | ------------- | ---------: | ----: | ----: | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
|     1 | T01    | v1    |         1 | 10:53:55 BRT | não separável | não separável | não medido |     1 |     1 | falhou; zero gravações | O v1 bloqueou a identidade mínima pelo contrato completo. A duração incluiu troca de mensagens e não vale como baseline quantitativa. |
|     2 | T01    | v2    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     3 | T01    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     4 | T01    | v2    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     5 | T02    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     6 | T02    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     7 | T03    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     8 | T03    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|     9 | T04    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    10 | T04    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    11 | T05    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    12 | T05    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    13 | T06    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    14 | T06    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    15 | T07    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    16 | T07    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    17 | T08    | v1    |         1 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |
|    18 | T08    | v1    |         2 | aguardando   | —             | —             |          — |     — |     — | —                      | —                                                                                                                                     |

## Achados e decisão

| ID          | Severidade              | Evidência                                                                                                                 | Tratamento                                                                                                           |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `G2-INC-01` | esperado no controle v1 | `G2-SYN-T01-V1-R1` não gerou linha em `cms_content_drafts`; o editor v1 valida o contrato publicável antes de salvar      | registrar como limitação v1; repetir a medição com cronômetro após estabilizar o candidato                           |
| `G2-INC-02` | bloqueante no candidato | o resume retornou HTTP 200 com timestamps PostgreSQL `+00:00`, rejeitados pelo contrato frontend que aceitava somente `Z` | corrigir o schema para timestamps com offset, cobrir por regressão e reimplantar o preview antes de retomar a sessão |

Nenhuma decisão será registrada enquanto `G2-INC-02` não estiver corrigido e a sessão quantitativa não for repetida.
