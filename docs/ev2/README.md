# EV2 — Evolução do CMS GAIATEC

**Status:** Gates G0–G5 aprovados; EV2.6 liberada para implementação; produção bloqueada<br>
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
10. [EV2.4 — PIM e conteúdo principal](fase-4/README.md) — produto/modelo/variante/SKU, atributos, unidades, adapter v1 e Gate G4.
11. [EV2.5 — mídia e documentos](fase-5/README.md) — DAM contextual, direitos, usos, substituição reversível e Gate G5.

## Escopo documental

Esta trilha converte o manual e a auditoria do CMS em requisitos implementáveis, testáveis, rastreáveis e reversíveis. Ela cobre EV2.0–EV2.12 sem substituir o histórico das fases anteriores.

O documento principal é a fonte de verdade para o desenvolvimento. O DOCX que originou esta versão permanece apenas como artefato editorial; mudanças futuras devem ser feitas primeiro no Markdown e revisadas por pull request.

## Relação com o ciclo anterior

- [Relatório de auditoria](../auditoria-cms-2026-09-01/RELATORIO.md)
- [Matriz da auditoria](../auditoria-cms-2026-09-01/MATRIZ.md)
- [ADRs vigentes](../adr/)
- [Evidências das fases 0–11](../)

## Estado da execução

Os Gates G0–G5 foram aprovados com evidências reproduzíveis. A EV2.4 passou pelo canary sintético 32/32 e pelo piloto real de 20 produtos em staging. A EV2.5 aplicou a migration aditiva `0043`, publicou `cms-media`, `cms-public` e `cms-preview` e isolou o build `405b84a` no alias `ev2-g5-canary`. Seu canary concluiu 27/27 verificações com MFA/AAL2, produção recusada, flags globais desligadas, zero mutação real e zero resíduo sintético. A EV2.6 está liberada para implementação local e para um futuro canary especificamente autorizado. Produção, publicação do lote, dual-write, merge em `main` e promoção do staging estável continuam fora do escopo.
