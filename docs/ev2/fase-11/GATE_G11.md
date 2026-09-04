# Gate G11 — regressão, resiliência e aceite formal

**Resultado atual:** G11 PENDENTE — CANARY TÉCNICO APROVADO; ACEITES HUMANOS PENDENTES<br>
**Escopo:** F-017/F-018 e regressão EV2.1–EV2.10<br>
**Produção:** bloqueada<br>
**Ativação global:** bloqueada<br>
**Próximo marco:** UAT e revisões humanas no SHA aprovado pelo canary

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
- CI do SHA `fa4fcd41` verde, com reset integral, 50 migrations, 461/461 asserções pgTAP e 46/46
  asserções EV2.11;
- preview isolado do mesmo SHA aprovado, com a flag candidata desligada;
- harness real de carga HTTP e restore transacional;
- workflow de build candidato isolado;
- canary com dois usuários sintéticos MFA, anonimização, suspensão e banimento das credenciais;
- runbook de pausa, reprocessamento, rollback e escalada.
- migrations `0050`–`0052` aplicadas somente em staging e lint remoto sem erros;
- SHA `8321f1291860e9ca55d3e17e3c1ce36123d0d025` isolado no alias `ev2-g11-canary`;
- canary G11 aprovado em 27/27 verificações, com 22/22 medições persistidas;
- disponibilidade 100%, leitura p95 408 ms, comando p95 666 ms e outbox p95 0 ms;
- restore com RPO 0/RTO 5,642 s, auditoria 100% e axe critical/serious 0/0;
- run `7466a0d3-021f-4c60-ad82-61e76b93844f` aceito por revisor sintético segregado;
- consulta independente com zero credencial, override ou payload pessoal residual;
- staging estável, flags globais e `cms-outbox-worker` v22 preservados.

## Evidência ainda obrigatória

- UAT por OP-01 e revisão técnica REV-01;
- revisão da matriz efetiva por Security;
- revisão de privacidade e retenção por DPO;
- aceite humano das jornadas críticas por Produto/Ops, com zero P0/P1.

As evidências técnicas estão consolidadas no
[relatório do canary em staging](RELATORIO_CANARY_STAGING_2026-09-04.md).

Até lá, EV2.12, produção, merge em `main`, promoção do staging estável e ativação global permanecem
bloqueados.
