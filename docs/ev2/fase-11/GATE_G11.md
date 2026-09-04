# Gate G11 — regressão, resiliência e aceite formal

**Resultado atual:** G11 PENDENTE — CANDIDATO LOCAL IMPLEMENTADO, STAGING NÃO ALTERADO<br>
**Escopo:** F-017/F-018 e regressão EV2.1–EV2.10<br>
**Produção:** bloqueada<br>
**Ativação global:** bloqueada<br>
**Próximo marco:** canary controlado e UAT no SHA candidato

## Critérios objetivos

| Critério                 | Meta                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| Regressão                | suíte completa e contratos/RLS verdes no mesmo SHA                               |
| Conteúdo/marketing/leads | lead preservado em falha, retentativa/dead-letter visível e recuperação auditada |
| Dados                    | zero divergência em publicação/projeção e lead/consentimento/histórico/outbox    |
| Segurança                | zero fuga de escopo; anônimo/AAL1 negados; 100% das ações críticas auditadas     |
| Performance              | disponibilidade >= 99,9%; leitura p95 <= 500 ms; comando p95 <= 800 ms           |
| Filas                    | atraso p95 <= 60 s, sem backlog crescente durante a janela                       |
| Acessibilidade           | zero violação `critical` ou `serious` nas jornadas críticas                      |
| Restore                  | RPO 0 e RTO <= 15 minutos no ensaio autorizado                                   |
| Defeitos                 | zero P0 e zero P1 abertos                                                        |
| Segregação               | revisor diferente de quem registrou a medição                                    |
| Privacidade              | somente fixtures sintéticas; zero payload pessoal residual                       |
| Isolamento               | flag global off, dois overrides individuais <= 30 min, staging estável intacto   |

## Regra de decisão

O banco pode marcar uma medição como `measured`, nunca como aceita pelo próprio operador. O segundo
operador pode aceitar apenas uma medição em que todos os limites foram satisfeitos. O aceite técnico
no banco ainda não substitui UAT, revisão DPO/Security e registro documental. G11 só muda para
aprovado quando as evidências automatizadas e humanas do mesmo SHA estiverem anexadas.

## Evidência já disponível

- implementação e contratos locais;
- migration aditiva/default-off;
- validação local integral com 153/153 testes Vitest e todas as fases automatizadas verdes;
- 32/32 cenários locais de navegador aprovados; 8 cenários remotos corretamente ignorados;
- Edge Functions aprovadas no Deno check e auditoria npm com zero vulnerabilidade;
- suíte pgTAP/RLS com 46 asserções e regras de limite preparadas;
- harness real de carga HTTP e restore transacional;
- workflow de build candidato isolado;
- canary com dois usuários sintéticos MFA, anonimização, suspensão e banimento das credenciais;
- runbook de pausa, reprocessamento, rollback e escalada.

## Evidência ainda obrigatória

- CI verde do SHA versionado, incluindo reset integral do banco e pgTAP;
- migration rehearsal vinculada ao staging autorizado;
- canary no alias `ev2-g11-canary`;
- relatório de carga, axe, restore e reconciliação do ambiente;
- UAT por OP-01 e revisão técnica REV-01;
- decisão formal sem P0/P1.

Até lá, EV2.12, produção, merge em `main`, promoção do staging estável e ativação global permanecem
bloqueados.
