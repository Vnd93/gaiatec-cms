# Gate G9 — acessibilidade, isolamento e compatibilidade v1

**Resultado atual:** G9 APROVADO PARA INICIAR EV2.10 — PRODUÇÃO CONTINUA BLOQUEADA<br>
**Produção:** bloqueada<br>
**Flags:** `ev2.visual_studio` e `ev2.multisite`, globalmente desligadas<br>
**Multisite operacional:** bloqueado<br>
**Rollback imediato:** remover overrides individuais ou acionar kill switch<br>
**SHA candidato executado:** `6954171ba60d923a923ac26ed3b491b6d9149817`<br>
**Deployment:** `ca350fa8-27a0-451d-9887-159f9c5deae3`<br>
**Alias:** <https://ev2-g9-canary.gaiatec-cms-staging.pages.dev><br>
**CI do push:** [execução 33808207793](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33808207793)<br>
**CI do pull request:** [execução 33808210806](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33808210806)<br>
**Preview:** [execução 33808210772](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33808210772), artefato GitHub sem deploy remoto

## Critérios objetivos

| Critério               | Meta                                                                                            | Evidência exigida                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Compatibilidade v1     | página sem documento visual mantém edição, renderer e publicação atuais                         | regressão automatizada e comparação antes/depois    |
| Registry               | exatamente 20 chaves v1, todas com schema, renderer, padrão e orçamento                         | contrato, migration e teste estático                |
| Schema seguro          | HTML/CSS/JS/iframe/handlers arbitrários recusados em qualquer profundidade                      | testes adversariais de API e banco                  |
| Responsividade         | documento válido em grid 12/8/4, agrupamento contíguo, posição e visibilidade sem overflow      | unitário, canvas forçado e snapshots por breakpoint |
| Acessibilidade         | controles por teclado, foco e semântica; alvo WCAG 2.2 AA sem violação crítica                  | axe/Playwright e sessão operacional                 |
| Branch e concorrência  | edição isolada, replay não duplica, conflito preserva edição local e base obsoleta não aplica   | recibos, eventos e conflito HTTP 409                |
| Snapshots              | um comando grava exatamente desktop/tablet/mobile para a mesma versão/hash                      | contagem e imutabilidade                            |
| Publicação             | Estúdio altera apenas rascunho v1; nenhuma ação candidata publica ou cria revisão               | sentinelas em revisão, projeção e outbox            |
| Autenticação/MFA       | 401 sem sessão; toda mutação AAL1 retorna 412                                                   | runner com token sintético AAL1/AAL2                |
| RLS/menor privilégio   | clientes não acessam tabelas/RPCs privadas e permissões separam leitura, edição, símbolo e site | pgTAP e API direta negativa                         |
| Isolamento do canary   | somente override individual exato; ativação ampla/ambígua/produção falha fechada                | capability visual e sites                           |
| Tenant escape          | site A não infere, lista, vincula ou altera site B                                              | dois candidatos sintéticos e tentativas cruzadas    |
| Multisite bloqueado    | apenas `g9x-*`, `.invalid`, ambientes locked e `productionEnabled=false`                        | constraints, registry e respostas da API            |
| Auditoria/idempotência | 100% das mutações bem-sucedidas têm recibo e evento correlacionado                              | reconciliação por `correlationId`                   |
| Produção/dados reais   | zero mutação; staging estável e domínios reais intactos                                         | relatório, manifest e sentinelas                    |
| Limpeza                | zero usuário, override, conteúdo, site, domínio, token, snapshot e recibo sintético residual    | consulta independente após o runner                 |

## Regra de decisão

G9 somente será aprovado se todos os critérios passarem no mesmo SHA, com rehearsal transacional limpo, CI verde, dois usuários MFA, dois tenants sintéticos, zero exceção manual e zero resíduo. Qualquer tenant escape, bypass de MFA, aceitação de código/domínio real, publicação indireta, quebra v1 ou limpeza incompleta reprova o gate e aciona contenção.

Todos os critérios passaram no mesmo SHA candidato. O runner concluiu 32/32 verificações, reconciliou 5/5 mutações visuais e 5/5 mutações de site com recibos e eventos, comprovou isolamento entre os dois tenants e removeu integralmente as fixtures. A consulta independente confirmou zero usuário, perfil, override, conteúdo, site, domínio, snapshot, recibo ou evento sintético residual.

G9 está aprovado e a EV2.10 pode iniciar. A aprovação não autoriza produção, dados reais, ativação global, domínio real, merge em `main` nem promoção do staging estável. A evidência completa está no [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-03.md).
