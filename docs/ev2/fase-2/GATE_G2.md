# Gate G2 — experiência operacional e rascunho recuperável

**Resultado atual:** G2 APROVADO PARA INICIAR EV2.3 — PRODUÇÃO CONTINUA BLOQUEADA<br>
**Escopo:** preview isolado e default-off; nenhuma alteração em produção
**Commit candidato final:** `af20bc75b48cae051e340fcbc585e9e91a7bb60e`<br>
**CI do canary original:** [GitHub Actions — execução 33629916088](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33629916088)<br>
**CI da correção final:** [GitHub Actions — execução 33662108812](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33662108812)

## Critérios técnicos

| Critério                 | Evidência esperada                                                    |
| ------------------------ | --------------------------------------------------------------------- |
| Rascunho vazio           | criação sem título/campos e recuperação server-side                   |
| Privacidade              | RLS, ausência em projeção/API/sitemap e nenhum log de conteúdo        |
| Autosave                 | patch 1,5–3 s, recibo, idempotência, retry/backoff e limite           |
| Concorrência             | dois editores, versão esperada, 409 e referência de diff              |
| Recuperação              | localStorage namespaced, TTL, escolha explícita e conteúdo preservado |
| Validação progressiva    | draft permissivo; review/publicação com contratos próprios            |
| UX/acessibilidade        | estados textuais, live region, teclado, foco, picker e testes Axe     |
| Compatibilidade/rollback | v1 verde, dois gates para o adapter e kill switch sem apagar dados    |
| Eficiência operacional   | sessão humana controlada e comparação contra mediana v1 observada     |

## Evidências concluídas

| Gate      | Resultado | Evidência                                                                               |
| --------- | --------- | --------------------------------------------------------------------------------------- |
| Qualidade | aprovado  | 93 Vitest, 21 EV2 estruturais, regressões F1–F11, typecheck, build e auditoria CI       |
| Banco     | aprovado  | migrations integrais e 148 asserções pgTAP/RLS; 29 específicas da EV2.2                 |
| Navegador | aprovado  | 32 Playwright anteriores; reteste dedicado com 5 aprovados e 1 desktop não aplicável    |
| Segurança | aprovado  | default-off, RLS, Edge-only, idempotência, conflito, imutabilidade e produção bloqueada |
| Regressão | aprovado  | contrato/publicação v1 e catálogo público preservados                                   |

As validações integrais locais e as três execuções remotas do commit final concluíram com sucesso. Permanecem conhecidas 46 advertências de lint sem erro e os chunks opcionais de Excel/PDF acima do budget; nenhum dos dois foi introduzido pela EV2.2.

## Canary técnico de staging

Após autorização explícita, as migrations `0037`, `0038` e `0039`, a função `cms-drafts-v2` e o build candidato foram implantados somente em staging. O ensaio autenticado concluiu 15/15 verificações, cobrindo rascunho vazio, idempotência, autosave, conflito HTTP 409 sem perda, retomada, negação anônima, bloqueio de produção, kill switch e limpeza dos dados sintéticos.

O candidato está no preview isolado <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev>. Durante a sessão humana, uma incompatibilidade de parsing dos timestamps de resume foi corrigida, coberta por regressão e validada com salvamento, reabertura e recuperação reais. O achado posterior de fallback v1 opaco também foi corrigido: o build final avisa quando a sessão não está ativa ou expirou, sem habilitar a capability. O deployment imutável final é <https://bd5a80a3.gaiatec-cms-staging.pages.dev>. O deployment estável de staging permaneceu inalterado e nenhuma ação foi executada em produção. A evidência completa está no [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-02.md).

## Evidência humana e decisão

`OP-01` concluiu duas repetições humanas v2: 2/2 recuperaram o rascunho, sem erro, ajuda ou perda. As duas tentativas v1 foram resultados válidos de controle e falharam antes de persistir o conteúdo parcial. O tempo v1 não produz mediana comparável; por isso, o gate não declara redução percentual de tempo.

Após autorização expressa para o Codex executar os ensaios operacionais e reduzir testes semelhantes, o protocolo passou a seguir a [ADR-021](../../adr/ADR-021-baseline-humano-incremental-por-gate.md). O canary determinístico repetiu 15/15 cenários de vazio, idempotência, conflito, retomada, isolamento, produção recusada e kill switch, seguido de limpeza total. Acessibilidade dedicada, fallback por expiração, retomada da capability, autosave e persistência server-side também foram aprovados.

Não houve overwrite silencioso, fuga de autorização, publicação parcial nem resíduo sintético. A taxa humana de recuperação v2 foi 100%, acima do mínimo de 90%. Assim, G2 está aprovado e EV2.3 pode começar no branch atual. T02–T08 terão baseline e comparação no gate em que a respectiva funcionalidade existir; nenhuma métrica será estimada.

## Limite da decisão

A aprovação libera somente o desenvolvimento da EV2.3 no branch e os testes já autorizados em staging. Ela não autoriza produção, dados reais, promoção do preview, merge em `main` ou ativação persistente. A flag continua default-off e o staging estável permanece no build `868f4382`.
