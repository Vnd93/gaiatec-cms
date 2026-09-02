# Gate G2 — experiência operacional e rascunho recuperável

**Resultado atual:** CANDIDATO VALIDADO EM CI — NÃO APROVADO PARA EV2.3<br>
**Escopo:** nenhuma promoção remota ou ativação persistente
**Commit candidato:** `a1f3177`<br>
**CI:** [GitHub Actions — execução 33587682790](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33587682790)

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
| Qualidade | aprovado  | 90 Vitest, 18 EV2 estruturais, 74 regressões, typecheck, build e auditoria CI           |
| Banco     | aprovado  | migrations integrais e 148 asserções pgTAP/RLS; 29 específicas da EV2.2                 |
| Navegador | aprovado  | 32 Playwright aprovados e 8 cenários exclusivos de staging corretamente ignorados       |
| Segurança | aprovado  | default-off, RLS, Edge-only, idempotência, conflito, imutabilidade e produção bloqueada |
| Regressão | aprovado  | contrato/publicação v1 e catálogo público preservados                                   |

As jobs `quality`, `database` e `browser` concluíram com sucesso no mesmo commit. Permanecem conhecidas 46 advertências de lint sem erro e os chunks opcionais de Excel/PDF acima do budget; nenhum dos dois foi introduzido pela EV2.2.

## Bloqueios conhecidos

O candidato técnico está verde, mas o G2 não será aprovado sem a sessão humana definida em `fase-0/BASELINE_TAREFAS.md` e no [roteiro operacional](ROTEIRO_SESSAO_HUMANA_G2.md). Não existem tempos v1 observados, portanto ainda não é possível demonstrar eficiência nem aceitar o critério operacional sem inventar dados.

Após autorização do canary, ainda são obrigatórias evidências autenticadas ponta a ponta do editor v2 para offline, conflito, Axe e ausência pública. A regressão pública, os componentes, os contratos e o banco já estão cobertos no candidato.

## Limite da decisão

Este gate não autoriza staging, migration remota, dados reais, canary persistente ou produção. Até a resolução das evidências, EV2.3 permanece bloqueada.
