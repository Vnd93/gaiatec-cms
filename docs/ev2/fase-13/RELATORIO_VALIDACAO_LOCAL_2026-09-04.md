# Relatório de validação local EV2.13 — 4 de setembro de 2026

**Estado:** validação local concluída; CI e canary final registrados no relatório de staging<br>
**Branch:** `ev2/fase-13-hardening-pre-producao`<br>
**SHA final qualificado:** `a1b170eca828393c510b7d606a7095683f1aa342`<br>
**Produção:** nenhuma ação executada

## Escopo validado

- hardening dos workflows de CI, deploy e rollback;
- validação estrita de health, release manifest, budgets e evidência G12;
- migration `0053` e teste pgTAP;
- contrato agregado, `cms-session`, refresh e helper frontend;
- remoção de decisões `VITE_EV2_*` do código cliente;
- fechamento da busca pública v2 e preservação da busca v1;
- runner reduzido e workflow isolado G13.

## Resultados

| Verificação                       | Resultado                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- |
| Prettier                          | aprovado                                                                  |
| ESLint                            | 0 erros; 46 avisos preexistentes registrados em EV2-Q01                   |
| TypeScript                        | aprovado                                                                  |
| Unitários/contratos/componentes   | 48 arquivos, 157 testes aprovados                                         |
| Suíte integral `npm run check`    | aprovada, incluindo EV2.0–EV2.13 e build de produção                      |
| EV2.13                            | 5/5 testes aprovados                                                      |
| Evals G10/G11/G12                 | aprovadas, zero bypass/false acceptance                                   |
| Edge `cms-session` e `cms-public` | fontes inalteradas; versões remotas v16/v36 exercitadas pelo canary       |
| Supabase CLI                      | versão `2.116.0`; histórico local/remoto alinhado até `0053`              |
| Rehearsal 0053 em staging         | aprovado; individual elegível, amplo/TTL bloqueados e rollback comprovado |
| Auditoria npm                     | zero vulnerabilidade                                                      |

O ESLint mantém 46 avisos preexistentes, sem erro; a redução permanece registrada em `EV2-Q01` e não
foi misturada ao hardening. O teste pgTAP versionado foi aprovado pelo job de banco do CI, que dispõe
do Docker ausente no host local. O SHA final e as métricas medidas estão em
`RELATORIO_CANARY_STAGING_2026-09-04.md`; nenhuma medição foi antecipada ou inferida.

A correção pós-revisão eliminou quatro lacunas: cada janela G12 agora incorpora o probe completo,
recalcula seu SHA-256 e revalida contratos/budgets; o G13 exercita o caminho positivo da busca v2;
a limpeza remove overrides também pela identidade do ator após resposta parcial; e o escopo canônico
passou a declarar EV2.0–EV2.13. O token da busca existiu apenas durante o canary e foi removido do
staging ao final.

Os sete checks remotos do candidato ficaram verdes nos runs de
[push 33932883225](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932883225),
[pull request 33932885639](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932885639) e
[preview 33932885644](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932885644). O workflow
remoto continua classificado como candidate preview e não pode, isoladamente, declarar o Gate G13.
