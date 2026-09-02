# Gate G2 — experiência operacional e rascunho recuperável

**Resultado atual:** CANARY TÉCNICO CORRIGIDO EM STAGING — SESSÃO HUMANA EM ANDAMENTO<br>
**Escopo:** preview isolado e default-off; nenhuma alteração em produção
**Commit candidato:** `55b549f6ed04518c2c86e6e25e52948bf206596c`<br>
**CI:** [GitHub Actions — execução 33643008212](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33643008212)

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
| Qualidade | aprovado  | 91 Vitest, 21 EV2 estruturais, 74 regressões, typecheck, build e auditoria CI           |
| Banco     | aprovado  | migrations integrais e 148 asserções pgTAP/RLS; 29 específicas da EV2.2                 |
| Navegador | aprovado  | 32 Playwright aprovados e 8 cenários exclusivos de staging corretamente ignorados       |
| Segurança | aprovado  | default-off, RLS, Edge-only, idempotência, conflito, imutabilidade e produção bloqueada |
| Regressão | aprovado  | contrato/publicação v1 e catálogo público preservados                                   |

As jobs `quality`, `database` e `browser` concluíram com sucesso no mesmo commit. Permanecem conhecidas 46 advertências de lint sem erro e os chunks opcionais de Excel/PDF acima do budget; nenhum dos dois foi introduzido pela EV2.2.

## Canary técnico de staging

Após autorização explícita, as migrations `0037`, `0038` e `0039`, a função `cms-drafts-v2` e o build candidato foram implantados somente em staging. O ensaio autenticado concluiu 15/15 verificações, cobrindo rascunho vazio, idempotência, autosave, conflito HTTP 409 sem perda, retomada, negação anônima, bloqueio de produção, kill switch e limpeza dos dados sintéticos.

O candidato está no preview isolado <https://ev2-g2-canary.gaiatec-cms-staging.pages.dev>. Durante a sessão humana, uma incompatibilidade de parsing dos timestamps de resume foi corrigida, coberta por regressão e validada com salvamento, reabertura e recuperação reais no deployment imutável <https://6080940a.gaiatec-cms-staging.pages.dev>. O deployment estável de staging permaneceu inalterado e nenhuma ação foi executada em produção. A evidência completa está no [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-02.md).

## Bloqueios conhecidos

O canary técnico está verde, mas o G2 não será aprovado sem a sessão humana definida em `fase-0/BASELINE_TAREFAS.md` e no [roteiro operacional](ROTEIRO_SESSAO_HUMANA_G2.md). Não existem tempos v1 observados, portanto ainda não é possível demonstrar eficiência nem aceitar o critério operacional sem inventar dados.

`OP-01` já está autenticado e o defeito encontrado no início da sessão foi corrigido. Ainda são obrigatórias as medições humanas válidas da baseline v1 de T01–T08, a comparação v2 de T01 e as observações de offline, conflito e acessibilidade com `REV-01`. A ausência pública, a regressão, os componentes, os contratos, o banco e o canary técnico já estão cobertos.

## Limite da decisão

A autorização recebida cobre somente o canary controlado de staging e a sessão G2. Ela não autoriza produção, dados reais, promoção do preview, merge em `main` ou ativação persistente. Até a resolução das evidências humanas, EV2.3 permanece bloqueada.
