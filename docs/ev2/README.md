# EV2 — Evolução do CMS GAIATEC

**Status:** Gates G0–G3 aprovados; EV2.4 liberada no branch; produção bloqueada<br>
**Data-base:** 2 de setembro de 2026<br>
**Fonte canônica:** Markdown versionado neste diretório
**Branch de execução:** `ev2/desenvolvimento-fases-1-a-12`<br>
**Branch documental preservado:** `ev2/fase-0-documentacao-e-planejamento`

## Ordem de leitura

1. [Especificação técnica, funcional e plano de implementação](ESPECIFICACAO_TECNICA_FUNCIONAL_E_PLANO_DE_IMPLEMENTACAO.md) — escopo completo, requisitos, regras de negócio, arquitetura, dados, APIs, segurança, testes, fases e rollback.
2. [Lote piloto e tarefas operacionais](LOTE_PILOTO_EV2_0.md) — amostra de 20 produtos, 8 tarefas, owners e critérios de uso.
3. [Decisões e ações necessárias](DECISOES_E_ACOES_NECESSARIAS.md) — decisões resolvidas e entradas dos gates posteriores.
4. [Gate de prontidão](GATE_DE_PRONTIDAO.md) — condição objetiva para iniciar o desenvolvimento e restrições do primeiro ciclo.
5. [ADR-015 — multisite preparado e ativação posterior](../adr/ADR-015-multisite-preparado-e-ativacao-posterior.md) — decisão arquitetural da primeira fase.
6. [EV2.0 — diagnóstico e baseline](fase-0/README.md) — backlog executável, baseline técnico e operacional, threat model, estratégia de flags/rollback e decisão do Gate G0.
7. [EV2.1 — fundação arquitetural](fase-1/README.md) — contratos, flags, release vazio, segurança e evidências do Gate G1.
8. [EV2.2 — experiência operacional](fase-2/README.md) — rascunhos progressivos, autosave, recuperação, picker e Gate G2.
9. [EV2.3 — dados mestres](fase-3/README.md) — entidades, aliases, dependências N:N, migration e Gate G3.

## Escopo documental

Esta trilha converte o manual e a auditoria do CMS em requisitos implementáveis, testáveis, rastreáveis e reversíveis. Ela cobre EV2.0–EV2.12 sem substituir o histórico das fases anteriores.

O documento principal é a fonte de verdade para o desenvolvimento. O DOCX que originou esta versão permanece apenas como artefato editorial; mudanças futuras devem ser feitas primeiro no Markdown e revisadas por pull request.

## Relação com o ciclo anterior

- [Relatório de auditoria](../auditoria-cms-2026-09-01/RELATORIO.md)
- [Matriz da auditoria](../auditoria-cms-2026-09-01/MATRIZ.md)
- [ADRs vigentes](../adr/)
- [Evidências das fases 0–11](../)

## Estado da execução

Os Gates G0–G3 foram aprovados com evidências reproduzíveis. A EV2.2 passou nos gates técnicos locais/CI, no canary isolado de staging e em duas recuperações humanas. O protocolo reduzido por risco está registrado na ADR-021, sem inventar métrica de tempo. A EV2.3 passou por 185/185 testes pgTAP e por canary sintético 21/21 em staging, com zero resíduos e zero órfãos. Migration e função permanecem no staging, o build candidato está em alias isolado e a flag continua desligada. A EV2.4 está liberada somente para desenvolvimento no branch; produção, dados reais, merge em `main` e promoção do preview continuam fora do escopo.
