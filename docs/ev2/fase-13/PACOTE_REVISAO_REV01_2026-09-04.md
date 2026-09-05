# Pacote de revisão independente REV-01 — EV2.13

**Estado:** pronto para revisão independente<br>
**Candidato runtime:** `a1b170eca828393c510b7d606a7095683f1aa342`<br>
**PR de código:** [Vnd93/gaiatec-cms#6](https://github.com/Vnd93/gaiatec-cms/pull/6)<br>
**PR documental:** [Vnd93/gaiatec-documentacao#5](https://github.com/Vnd93/gaiatec-documentacao/pull/5)<br>
**Produção:** bloqueada

## Correções submetidas

| Achado                                                     | Correção verificável                                                                                                                    |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Vínculo G12 aceitava apenas resumo                         | cada janela incorpora o probe integral, recalcula SHA-256, reexecuta `evaluateProbeWindow` e confere rota, candidato, ambiente e resumo |
| Canary G13 só exercitava o bloqueio da busca v2            | runner exige token temporário, mantém o 404 anônimo e comprova `200`, `engine=v2`, payload vazio e `no-store` no caminho autorizado     |
| Timeout após commit podia deixar override sem ID conhecido | encerramento remove por ID e também por `scope_type=user`/identidade; a verificação final cobre overrides e telemetria sintética        |
| Escopo documental terminava em EV2.12                      | índices canônicos agora declaram EV2.0–EV2.13                                                                                           |

## Evidências vinculantes

- CI: 7/7 checks verdes nos runs
  [33932883225](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932883225),
  [33932885639](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932885639) e
  [33932885644](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932885644);
- suíte local integral: 48 arquivos/157 testes, todas as fases EV2, evals e build aprovados;
- dependências: `npm audit --audit-level=high` com zero vulnerabilidade;
- candidato isolado: [deployment 25ec3d59](https://25ec3d59.gaiatec-cms-staging.pages.dev),
  SHA e contratos exatos;
- HTTP: 22/22, disponibilidade 100%, HTTP 5xx 0%, p95 global 921,374 ms;
- acessibilidade: 5 verificações aprovadas, 1 cenário desktop não aplicável e zero violação
  `serious`/`critical`;
- canary runtime: 11/11, revogação em 1.240 ms e resíduo ativo zero;
- [relatório consolidado](RELATORIO_CANARY_STAGING_2026-09-04.md),
  [probe HTTP](evidencias/G13_HTTP_PROBE_a1b170e.json) e
  [canary runtime](evidencias/G13_CANARY_a1b170e.json).

## Limites comprovados

- somente Supabase/Cloudflare de staging e alias `ev2-g13-canary`;
- nenhum dado ou domínio real usado pelo runner;
- nenhum default ou escopo amplo ativado;
- token técnico temporário removido após a execução;
- alias estável não promovido e ainda sem contrato G13;
- nenhuma ação em produção.

## Checklist do REV-01

1. confirmar que o SHA do candidato é o mesmo em checkout, header, health, manifest e evidências;
2. revisar os testes negativos de adulteração do probe G12;
3. revisar o caminho positivo/negativo da busca v2 e a ausência do token nos artefatos;
4. revisar a limpeza por identidade e o resultado de resíduo zero;
5. validar que os PRs não ampliam escopo para produção nem promovem o staging estável;
6. registrar decisão independente no PR de código e, separadamente, no PR documental.

Este pacote não contém aprovação atribuída ao REV-01. A decisão deve ser registrada pela conta de uma
pessoa diferente do operador/autor das alterações.
