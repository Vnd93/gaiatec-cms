# Gate G2 — experiência operacional e rascunho recuperável

**Resultado atual:** CANDIDATO — NÃO APROVADO PARA EV2.3<br>
**Escopo:** nenhuma promoção remota ou ativação persistente

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

## Bloqueio conhecido

O código e os testes podem tornar o candidato tecnicamente apto, mas o G2 não será aprovado sem a sessão humana definida em `fase-0/BASELINE_TAREFAS.md`. Não existem tempos v1 observados, portanto ainda não é possível demonstrar eficiência nem aceitar o critério operacional sem inventar dados.

Também são obrigatórios CI integralmente verde e evidência automatizada de offline, conflito, acessibilidade e ausência pública no commit candidato.

## Limite da decisão

Este gate não autoriza staging, migration remota, dados reais, canary persistente ou produção. Até a resolução das evidências, EV2.3 permanece bloqueada.
