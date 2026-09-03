# EV2 — Evolução do CMS GAIATEC

**Status:** Gates G0–G7 aprovados; candidato EV2.8 concluído e validado no CI, G8 pendente; produção bloqueada<br>
**Data-base:** 3 de setembro de 2026<br>
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
12. [EV2.6 — busca, SEO e qualidade](fase-6/README.md) — índice sombra sanitizado, governança, Centro de Qualidade e orçamento de bundle.
13. [EV2.7 — produtividade e colaboração](fase-7/README.md) — inbox contextual, release composto, massa com dry-run, rollback transacional e Gate G7 aprovado.
14. [EV2.8 — usuários, permissões e auditoria](fase-8/README.md) — RBAC por site/ambiente, delegação temporária, decisões de política e plano do Gate G8.

## Escopo documental

Esta trilha converte o manual e a auditoria do CMS em requisitos implementáveis, testáveis, rastreáveis e reversíveis. Ela cobre EV2.0–EV2.12 sem substituir o histórico das fases anteriores.

O documento principal é a fonte de verdade para o desenvolvimento. O DOCX que originou esta versão permanece apenas como artefato editorial; mudanças futuras devem ser feitas primeiro no Markdown e revisadas por pull request.

## Relação com o ciclo anterior

- [Relatório de auditoria](../auditoria-cms-2026-09-01/RELATORIO.md)
- [Matriz da auditoria](../auditoria-cms-2026-09-01/MATRIZ.md)
- [ADRs vigentes](../adr/)
- [Evidências das fases 0–11](../)

## Estado da execução

Os Gates G0–G7 foram aprovados com evidências reproduzíveis. A EV2.4 passou pelo canary sintético 32/32 e pelo piloto real de 20 produtos em staging. A EV2.5 concluiu 27/27 verificações de DAM com MFA/AAL2 e resíduo zero. A EV2.6 concluiu 34/34 verificações, com p95 público de 351 ms, p95 administrativo de servidor de 807 ms e indexação em 43.667 ms. Na EV2.7, as migrations aditivas `0045` e `0046` foram aplicadas somente em staging, o build `952bf75` foi isolado no alias `ev2-g7-canary` e o canary final passou 27/27 verificações com dois usuários MFA, publicação composta atômica, rollback RPO 0, conflito HTTP 409, zero mutação real e zero resíduo sintético. O candidato EV2.8 foi concluído, permanece isolado pela flag `ev2.rbac_scoped` e teve sua baseline funcional `570da8a` aprovada nos workflows de CI do push, CI do pull request e Preview. O preview foi preservado somente como artefato do GitHub, sem deploy remoto; o Gate G8 aguarda autorização específica para o canary controlado. Produção, publicação de lote real, ativação global, merge em `main` e promoção do staging estável continuam fora do escopo.
