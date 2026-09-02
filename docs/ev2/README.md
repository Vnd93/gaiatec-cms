# EV2 — Evolução do CMS GAIATEC

**Status:** documentação organizada, decisões iniciais resolvidas e Fase EV2.0 liberada<br>
**Data-base:** 1 de setembro de 2026<br>
**Fonte canônica:** Markdown versionado neste diretório
**Branch:** `ev2/fase-0-documentacao-e-planejamento`

## Ordem de leitura

1. [Especificação técnica, funcional e plano de implementação](ESPECIFICACAO_TECNICA_FUNCIONAL_E_PLANO_DE_IMPLEMENTACAO.md) — escopo completo, requisitos, regras de negócio, arquitetura, dados, APIs, segurança, testes, fases e rollback.
2. [Lote piloto e tarefas operacionais](LOTE_PILOTO_EV2_0.md) — amostra de 20 produtos, 8 tarefas, owners e critérios de uso.
3. [Decisões e ações necessárias](DECISOES_E_ACOES_NECESSARIAS.md) — decisões resolvidas e entradas dos gates posteriores.
4. [Gate de prontidão](GATE_DE_PRONTIDAO.md) — condição objetiva para iniciar o desenvolvimento e restrições do primeiro ciclo.
5. [ADR-015 — multisite preparado e ativação posterior](../adr/ADR-015-multisite-preparado-e-ativacao-posterior.md) — decisão arquitetural da primeira fase.

## Escopo documental

Esta trilha converte o manual e a auditoria do CMS em requisitos implementáveis, testáveis, rastreáveis e reversíveis. Ela cobre EV2.0–EV2.12 sem substituir o histórico das fases anteriores.

O documento principal é a fonte de verdade para o desenvolvimento. O DOCX que originou esta versão permanece apenas como artefato editorial; mudanças futuras devem ser feitas primeiro no Markdown e revisadas por pull request.

## Relação com o ciclo anterior

- [Relatório de auditoria](../auditoria-cms-2026-09-01/RELATORIO.md)
- [Matriz da auditoria](../auditoria-cms-2026-09-01/MATRIZ.md)
- [ADRs vigentes](../adr/)
- [Evidências das fases 0–11](../)

## Próximo passo autorizado

Iniciar a Fase EV2.0 usando o lote e as tarefas aprovados para medir o baseline, fechar os ADRs restantes, prototipar a UX e preparar a fundação de entrega segura. Capacidades novas permanecem desligadas por padrão. Esta documentação não autoriza deploy, migration remota, alteração de dados reais ou promoção para produção.
