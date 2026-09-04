# Relatório de validação local EV2.13 — 4 de setembro de 2026

**Estado:** validação local concluída; CI e canary final registrados no relatório de staging<br>
**Branch:** `ev2/fase-13-hardening-pre-producao`<br>
**SHA final qualificado:** `518e8e5df605264013d94a16998d00168d4d03c7`<br>
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

| Verificação                       | Resultado                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Prettier                          | aprovado                                                                     |
| ESLint                            | 0 erros; 46 avisos preexistentes registrados em EV2-Q01                      |
| TypeScript                        | aprovado                                                                     |
| Unitários/contratos/componentes   | 48 arquivos, 157 testes aprovados                                            |
| Suíte integral `npm run check`    | aprovada, incluindo EV2.0–EV2.13 e build de produção                         |
| EV2.13                            | 5/5 testes aprovados                                                         |
| Evals G10/G11/G12                 | aprovadas, zero bypass/false acceptance                                      |
| Edge `cms-session` e `cms-public` | `deno check` aprovado                                                        |
| Supabase CLI                      | versão `2.116.0` disponível e migration `0053` é a única pendente em staging |
| Rehearsal 0053 em staging         | aprovado; individual elegível, amplo/TTL bloqueados e rollback comprovado    |
| Auditoria npm                     | zero vulnerabilidade                                                         |

O ESLint mantém 46 avisos preexistentes, sem erro; a redução permanece registrada em `EV2-Q01` e não
foi misturada ao hardening. O teste pgTAP versionado foi aprovado pelo job de banco do CI, que dispõe
do Docker ausente no host local. O SHA final e as métricas medidas estão em
`RELATORIO_CANARY_STAGING_2026-09-04.md`; nenhuma medição foi antecipada ou inferida.

A revisão final endureceu a migration para exigir exatamente um override individual com janela total
de até 30 minutos e ausência de qualquer override amplo ativo para a mesma capacidade/ambiente. O
workflow remoto foi classificado explicitamente como candidate preview: ele falha sem configuração
de deploy e não pode ser usado isoladamente para declarar o Gate G13.
