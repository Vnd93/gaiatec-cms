# Gate G0 — decisão da EV2.0

**Resultado:** APROVADO PARA EV2.1 LOCAL<br>
**Data:** 1 de setembro de 2026<br>
**Aprovador funcional:** Comercial GAIATEC Sistemas<br>
**Aprovador técnico/operacional:** Pedro Nishida<br>
**QA executor:** Codex

## Avaliação

| Critério                             | Estado         | Evidência                                                                                              |
| ------------------------------------ | -------------- | ------------------------------------------------------------------------------------------------------ |
| Fonte canônica e escopo              | atende         | especificação EV2 versionada e índice do diretório                                                     |
| Inventário e qualidade de referência | atende         | `BASELINE_TECNICO.md`; 149 testes da referência mais 7 verificações EV2.0, typecheck e build aprovados |
| Owners e lote piloto                 | atende         | 20 produtos, 8 tarefas e RACI interino em `LOTE_PILOTO_EV2_0.md`                                       |
| SLOs/error budgets iniciais          | atende         | budgets mensuráveis no baseline técnico                                                                |
| Métrica humana honesta               | controlado     | valores ainda não medidos; protocolo bloqueia aceite do G2                                             |
| Decisões estruturais                 | atende         | ADR-015 a ADR-020 aprovadas                                                                            |
| Threat model                         | atende         | ativos, fronteiras, STRIDE, abuso e resposta documentados                                              |
| Compatibilidade e rollback           | atende         | v1 preservado, flags default-off, matriz de rollback e kill switches                                   |
| Backup/restore                       | atende para G0 | evidências/restores do ciclo anterior preservados; drill composto completo é obrigatório no G11        |
| Backlog e gates                      | atende         | EV2.0–EV2.12 dependentes, com DoD e primeira fatia EV2.1                                               |
| Verificação automática               | atende         | `npm run test:ev2:phase0` integrado ao `npm run check` e ao CI                                         |

## Pendências que não podem ser esquecidas

- Conduzir e registrar a sessão humana das oito tarefas antes do G2.
- Executar migrations somente em ambiente local no G1; staging exige workflow/autorização correspondente.
- Revalidar restore de release composto no G7 e o drill sistêmico no G11.
- Não ativar multisite antes do G9 nem IA antes dos gates de dados, segurança e avaliação.

## Limite da aprovação

O G0 autoriza contratos, código, migrations locais, funções locais e testes da EV2.1. Não autoriza uso de dados reais, publicação, deploy em staging, alterações remotas ou produção. Qualquer falha de compatibilidade v1, RLS, autorização, idempotência, integridade ou rollback reprova o próximo gate.
