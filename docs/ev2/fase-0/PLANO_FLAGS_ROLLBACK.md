# Plano de feature flags, rollout e rollback

## Princípios

- Toda capacidade EV2 nasce `disabled` e sem efeito no caminho v1.
- Avaliação ocorre no servidor para segurança; avaliação no cliente serve apenas à apresentação.
- Ausência, erro, timeout ou payload inválido resulta em desligado.
- Flag não substitui permissão, RLS, MFA, validação ou state machine.
- Toda mudança registra ator, motivo, correlação, valor anterior, valor novo e expiração.

## Escopo e precedência

Ordem mais específica: usuário de teste -> organização/site -> ambiente -> global. Uma negação explícita/kill switch prevalece sobre qualquer ativação. O site principal e o ambiente devem ser valores explícitos; multisite permanece indisponível até G9.

## Flags iniciais

| Chave                    | Fase                             | Default                        | Dependência                    | Kill switch                             |
| ------------------------ | -------------------------------- | ------------------------------ | ------------------------------ | --------------------------------------- |
| `ev2.release_skeleton`   | EV2.1                            | off                            | contratos, RLS, auditoria      | sim                                     |
| `ev2.draft_v2`           | EV2.2                            | off                            | G1                             | sim                                     |
| `ev2.master_data`        | EV2.3                            | off                            | G2                             | sim                                     |
| `ev2.pim_v2`             | EV2.4                            | off                            | G3                             | sim                                     |
| `ev2.dam`                | EV2.5                            | off                            | G4                             | sim                                     |
| `ev2.search_quality`     | EV2.6                            | off                            | G4/G5                          | sim                                     |
| `ev2.collaboration_bulk` | EV2.7                            | off                            | G6                             | sim                                     |
| `ev2.rbac_scoped`        | EV2.8                            | off                            | G7                             | sim; segurança continua deny-by-default |
| `ev2.visual_studio`      | EV2.9                            | off                            | G8                             | sim                                     |
| `ev2.multisite`          | EV2.9                            | off e não ativável antes do G9 | tenant isolation               | sim                                     |
| `ev2.ai_assist`          | EV2.10                           | off                            | G8 + evals                     | sim                                     |
| `ev2.ai_execute`         | posterior à assistência aprovada | off                            | release + policy + confirmação | sim                                     |
| `ev2.system_assurance`   | EV2.11                           | off                            | G10 + regressão + restore      | sim; somente override individual        |

## Sequência de rollout

1. Implementar e testar com flag ausente/desligada.
2. Ativar somente para conta técnica em ambiente local/staging.
3. Executar contrato, segurança, observabilidade, SLO e rollback.
4. Canary por usuários nomeados e janela definida.
5. Ampliar apenas com error budget saudável e aprovação do gate.
6. Produção requer autorização explícita e workflow próprio.

## Matriz de rollback

| Mudança              | Gatilho                                  | Ação imediata                         | Recuperação                                    | RPO/RTO alvo      |
| -------------------- | ---------------------------------------- | ------------------------------------- | ---------------------------------------------- | ----------------- |
| UI/contrato v2       | erro ou regressão v1                     | desligar flag                         | UI/adapter v1                                  | RPO 0 / <= 5 min  |
| comando/release      | falha, duplicação ou divergência         | kill switch e pausar worker           | cancelar/compensar por snapshot                | RPO 0 / <= 15 min |
| migration aditiva    | erro lógico                              | desligar escrita/leitura v2           | preservar tabelas; aplicar migration corretiva | RPO 0 / <= 30 min |
| projeção/busca/cache | versão divergente                        | pausar consumo                        | reprojetar snapshot confirmado                 | RPO 0 / <= 15 min |
| provider externo/IA  | timeout, custo, privacidade ou qualidade | abrir circuit breaker                 | fluxo manual                                   | RPO 0 / <= 5 min  |
| multisite            | suspeita de tenant escape                | desligar globalmente e revogar sessão | site único + investigação                      | imediato          |

Rollback operacional nunca remove colunas/tabelas nem apaga auditoria. Mudança destrutiva só ocorre em fase posterior, com backup validado e migration separada.

## Evidência mínima por rollout

Commit/artefato, ambiente, configuração de flag, grupo afetado, início/fim, métricas, testes, aprovador, resultado e ação de rollback. Configuração sem owner ou expiração é inválida.
