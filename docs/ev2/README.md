# EV2 — Evolução do CMS GAIATEC

**Status do espelho:** Gates G0–G11 e G13–G14 aprovados; EV2.15 qualificada; controles EV2.16 implementados; G12 pendente; produção bloqueada<br>
**Data-base do espelho:** 5 de setembro de 2026<br>
**Fonte canônica atual:** [`Vnd93/gaiatec-documentacao`](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs/ev2)<br>
**Branch de execução:** `ev2/fase-16-prontidao-producao-g12`<br>
**Branch documental preservado:** `ev2/fase-0-documentacao-e-planejamento`

> Este índice é um espelho operacional preso ao histórico do código. Para decisões vigentes,
> relatórios finais e evidências posteriores ao SHA local, use sempre a fonte canônica acima.

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
15. [EV2.9 — Estúdio Visual e preparação multisite](fase-9/README.md) — registry de 20 componentes, canvas governado, branches, snapshots, site registry sintético e plano do Gate G9.
16. [EV2.10 — IA assistiva controlada](fase-10/README.md) — gateway F-015 provider-off, fontes, confiança, diff, aprovação humana, evals e plano do Gate G10.
17. [EV2.11 — integração operacional e garantia sistêmica](fase-11/README.md) — F-017/F-018, resiliência de leads, SLOs, carga, restore, regressão e plano do Gate G11.
18. [EV2.12 — implantação controlada](fase-12/README.md) — health/release, canary, error budget, aprovações segregadas, promoção imutável, handover e rollback.
19. [EV2.13 — hardening e elegibilidade runtime](fase-13/README.md) — isolamento de secrets, evidência vinculada, manifesto agregado, revogação e canary individual.
20. [EV2.14 — IA transacional controlada](fase-14/README.md) — sandbox sintético, plano/dry-run, aprovação por hash, execução atômica, compensação e plano do Gate G14.
21. [EV2.15 — fechamento técnico e integração segura](fase-15/README.md) — zero avisos acionáveis, regressões finais, hash G14 multiplataforma, preview efêmero e consolidação ordenada dos PRs.
22. [EV2.16 — controles vinculantes de prontidão](fase-16/README.md) — governança solo `@Vnd93`, backup/restore externo, Resend, CSP, DPO/legal, owners e autorização vinculada ao SHA.

## Escopo documental

Esta trilha converte o manual e a auditoria do CMS em requisitos implementáveis, testáveis,
rastreáveis e reversíveis. Ela cobre as entregas funcionais EV2.0–EV2.14, o fechamento técnico
EV2.15 e os controles de prontidão EV2.16 sem substituir o histórico das fases anteriores.

O documento principal deste espelho preserva a especificação usada pelo código. A fonte de verdade
atual é o Markdown do repositório documental oficial. O DOCX que originou esta versão permanece
apenas como artefato editorial; mudanças futuras devem ser feitas primeiro no repositório canônico,
revisadas por pull request e sincronizadas aqui somente quando um teste ou runbook exigir.

## Relação com o ciclo anterior

- [Relatório de auditoria](../auditoria-cms-2026-09-01/RELATORIO.md)
- [Matriz da auditoria](../auditoria-cms-2026-09-01/MATRIZ.md)
- [ADRs vigentes](../adr/)
- [Evidências das fases 0–11](../)

## Estado da execução

Os Gates G0–G10 foram aprovados com evidências reproduzíveis. A EV2.4 passou pelo canary sintético
32/32 e pelo piloto real de 20 produtos em staging. A EV2.5 concluiu 27/27 verificações de DAM com
MFA/AAL2 e resíduo zero. A EV2.6 concluiu 34/34 verificações, com p95 público de 351 ms, p95
administrativo de servidor de 807 ms e indexação em 43.667 ms. Na EV2.7, as migrations aditivas
`0045` e `0046` foram aplicadas somente em staging, o build `952bf75` foi isolado no alias
`ev2-g7-canary` e o canary final passou 27/27 verificações. Na EV2.8, a migration `0047` e as funções
`cms-scopes`/`cms-session` foram aplicadas somente em staging, o build `896d0c6` foi isolado no alias
`ev2-g8-canary` e o canary passou 27/27 verificações com dois usuários MFA, 15/15 decisões
correlacionadas, 3/3 mutações auditadas, flag global desligada, zero mutação real e zero resíduo
sintético. Na EV2.9, a migration `0048` e as funções visuais/sites foram avaliadas no alias isolado
`ev2-g9-canary`; o canary passou 32/32 verificações com dois usuários MFA, isolamento entre tenants
e resíduo zero. Na EV2.10, a migration `0049`, a função `cms-ai` e o build `c2500c7` foram avaliados
no alias isolado `ev2-g10-canary`; o canary passou 26/26 verificações com dois usuários MFA,
adaptador sintético, custo zero e resíduo zero.

Na EV2.11, as migrations aditivas `0050`–`0052`, `cms-system` v3 e `cms-leads` v12 foram avaliadas
no SHA `8321f12`; `cms-outbox-worker` permaneceu na v22. O canary final passou 27/27 verificações,
com disponibilidade 100%, SLOs de backend aprovados, auditoria 100%, restore RPO 0/RTO 5,642 s,
acessibilidade critical/serious 0/0 e resíduo sintético zero. O responsável aprovou o protocolo
reduzido e liberou a preparação local/staging da EV2.12, sem fabricar métricas humanas. Produção,
dados reais, domínios reais, provedor externo, ativação global, merge em `main` e promoção do
staging estável continuam fora do escopo; EV2-D04 permanece pendente. A F-016 passou para candidato
local estritamente sintético, sem autorizar operações reais.

Na EV2.12, o canary isolado do SHA `8250db0d…` foi executado e os workflows de preflight, promoção e
rollback foram preparados. O Gate G12 de produção nunca foi aprovado. A auditoria posterior mostrou
que o staging estável não expõe os contratos atuais de health/manifest, a evidência antiga não
distingue resíduo ativo de tombstones e os controles de release precisavam de vínculo mais forte.

Na EV2.13, o SHA `a1b170e…` endureceu CI/deploy/rollback e passou a vincular cada janela G12 ao probe
completo revalidado e ao respectivo hash. A fase fechou falsos positivos de health/manifest e moveu
as decisões EV2 do build para um manifesto runtime individual e fail-closed. A migration `0053`,
`cms-session` v16, `cms-public` v36 e o alias isolado `ev2-g13-canary` passaram pelo canary reduzido
11/11, incluindo a busca v2 positiva autorizada, revogação em 1.240 ms e zero resíduo ativo. O G13
foi aprovado sem promoção do staging estável e está pronto para revisão independente REV-01.
Produção, dados/domínios reais, ativação global e Gate G12 permanecem bloqueados.

Na EV2.14, o REV-01 aprovou o SHA `64cea11e…`, a migration `0054` e `cms-ai-execute` permaneceram
restritas a staging e o build foi publicado somente no alias `ev2-g14-canary`. O canary final passou
35/35 verificações com dois usuários MFA, segregação, concorrência, idempotência, compensação,
100% de disponibilidade na sonda ampliada, zero chamada externa, zero dado real e zero resíduo. O
G14 foi aprovado apenas para o sandbox sintético. As flags seguem default-off; produção,
dados/domínios reais, provider externo, ativação global, merge, promoção do staging estável e o
Gate G12 continuam bloqueados.

Na EV2.15, o SHA `36c5cae…` eliminou os 46 avisos acionáveis remanescentes, corrigiu o ciclo de vida
de um observador, restaurou uma transição visual e tornou o carregador em grade acessível. O SHA
final `aa1b646…` também tornou o hash do dataset G14 estável em LF/CRLF e apontou a fonte documental
canônica. O pipeline local passou com 51 arquivos e 168/168 testes; CIs de push e PR aprovaram
qualidade, banco e navegador; o alias efêmero `ev2-final-rc` confirmou health/manifest no SHA exato
e smoke HTTP 6/6. Os PRs de código #6–#9 foram integrados em ordem no head `e92632c…` do ramo EV2
consolidado, e os PRs documentais #5–#9 foram integrados em `main`. Não há bloqueador P0/P1
conhecido no escopo validado. O Gate G12 e todos os limites de produção permanecem inalterados.

Na EV2.16, o repositório executável passou a recusar produção sem PR e CODEOWNERS de `@Vnd93`,
backup externo cifrado com restore comprovado, entrega sintética pelo Resend, CSP enforced sem
violação crítica, parecer DPO/legal identificado, quatro responsáveis distintos e autorização
literal contendo o SHA completo. A suíte integral local passou. O canary CSP em staging e todos os
controles que dependem de plano, secrets ou identidades reais continuam pendentes; nenhum deles foi
simulado ou marcado como aprovado.
