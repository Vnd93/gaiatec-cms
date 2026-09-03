# Gate G9 — acessibilidade, isolamento e compatibilidade v1

**Resultado atual:** PENDENTE — VALIDAÇÃO LOCAL APROVADA; EVIDÊNCIAS REMOTAS NÃO EXECUTADAS<br>
**Produção:** bloqueada<br>
**Flags:** `ev2.visual_studio` e `ev2.multisite`, globalmente desligadas<br>
**Multisite operacional:** bloqueado<br>
**Rollback imediato:** remover overrides individuais ou acionar kill switch<br>
**SHA candidato:** será fixado pela autorização e execução do canary após o versionamento<br>
**Alias planejado:** `ev2-g9-canary`

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

A aprovação futura de G9 autorizará apenas iniciar a EV2.10. Ela não autorizará produção, dados reais, ativação global, domínio real, merge em `main` nem promoção do staging estável.
