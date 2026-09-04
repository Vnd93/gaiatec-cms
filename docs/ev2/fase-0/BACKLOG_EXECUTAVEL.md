# Backlog executável EV2

**Regra:** um item só muda para concluído com implementação, teste, evidência, rollback e atualização da rastreabilidade.

| Épico     | Fase   | Entrega mínima                                                  | Dependência | Evidência de saída                             | Rollback                                | Estado                                        |
| --------- | ------ | --------------------------------------------------------------- | ----------- | ---------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| `EV2-E00` | EV2.0  | baseline, ADRs, threat model, pilotos, SLOs e gate              | nenhuma     | `test:ev2:phase0` e G0                         | preservar artefato anterior             | concluído                                     |
| `EV2-E01` | EV2.1  | flags desligadas, command envelope, release vazio, policy/audit | E00         | contrato, RLS, idempotência, regressão v1 e G1 | desligar flags; manter tabelas aditivas | concluído                                     |
| `EV2-E02` | EV2.2  | DraftSchema, autosave, recuperação, mensagens e picker base     | E01         | unitário, componente, a11y, conflito e G2      | desabilitar editor v2                   | concluído; G2 aprovado                        |
| `EV2-E03` | EV2.3  | taxonomias, unidades e dependências versionadas                 | E02         | matriz N:N, inativação e G3                    | flag e adapter v1                       | concluído; G3 aprovado                        |
| `EV2-E04` | EV2.4  | produto, modelo, variante, SKU, atributos e proveniência        | E03         | piloto, roundtrip, identidade e G4             | leitura v1; desativar escrita v2        | concluído; G4 aprovado                        |
| `EV2-E05` | EV2.5  | DAM, direitos, ALT, deduplicação e usos                         | E04         | upload/reuso/exclusão protegida e G5           | media picker anterior                   | concluído; G5 aprovado                        |
| `EV2-E06` | EV2.6  | busca técnica, facetas, SEO e Centro de Qualidade               | E04/E05     | relevância, zero-results, SLO e G6             | índice/projeção anterior                | concluído; G6 aprovado                        |
| `EV2-E07` | EV2.7  | release composto, inbox, comentários e massa com dry-run        | E06         | atomicidade, reexecução, segregação e G7       | cancelar job/release e compensar        | concluído; G7 aprovado                        |
| `EV2-E08` | EV2.8  | RBAC escopado, MFA, auditoria e permission evals                | E07         | testes negativos e 100% ações críticas e G8    | revogar grants/flags                    | concluído; G8 aprovado                        |
| `EV2-E09` | EV2.9  | Estúdio Visual e preparação multisite isolada                   | E08         | bindings, snapshots, tenant escape e G9        | flag; site único permanece              | concluído; G9 aprovado                        |
| `EV2-E10` | EV2.10 | IA assistiva com fonte, custo e aprovação humana                | E08/E09     | evals, red-team, fallback manual e G10         | desligar provider/flag                  | concluído; G10 aprovado                       |
| `EV2-E11` | EV2.11 | regressão, carga, restore, segurança e homologação              | E01–E10     | matriz completa e G11                          | corrigir sem promover                   | concluído; G11 aprovado                       |
| `EV2-E12` | EV2.12 | canary, operação assistida, handover e encerramento             | E11         | autorização, telemetria, runbooks e G12        | artefato anterior + flags               | canary G12 concluído; gate produtivo pendente |

## Primeira fatia da EV2.1

1. Definir contratos compartilhados de flag, comando e release.
2. Criar migration estritamente aditiva com RLS deny-by-default e site principal explícito.
3. Implementar `cms-releases` v1 para criar/consultar/cancelar release vazio, sem publicar conteúdo.
4. Testar idempotência, concorrência, autenticação, RLS, auditoria e compatibilidade v1.
5. Provar rollback lógico por flag e cancelamento; não remover tabelas em rollback operacional.

## Definition of Done por item

- requisito e regra de negócio ligados ao teste;
- contrato versionado e compatibilidade descrita;
- autorização negativa e positiva coberta;
- logs correlacionados sem segredo ou PII;
- migration aditiva/repetível e rollback documentado;
- acessibilidade e desempenho avaliados na superfície alterada;
- documentação e decisão do gate atualizadas;
- sem deploy ou ativação fora do gate.
