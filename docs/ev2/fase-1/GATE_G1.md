# Gate G1 — fundação arquitetural

**Resultado atual:** APROVADO PARA EV2.2 LOCAL<br>
**Escopo:** avanço local para EV2.2; nenhuma promoção remota
**Data da decisão:** 2 de setembro de 2026<br>
**Commit avaliado:** `1ff4975`<br>
**CI:** [GitHub Actions — execução 33585955949](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33585955949)

## Critérios

| Critério               | Evidência esperada                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------- |
| Capacidades desligadas | definições com `default_enabled=false`, nenhuma linha de override persistente       |
| Compatibilidade v1     | suíte anterior integralmente verde; nenhuma rota/tabela v1 alterada                 |
| Contrato               | Zod estrito, versão 1, identidade server-derived e erros estáveis                   |
| Segurança              | autenticação, origem, rate limit, RLS, RBAC, AAL2 e escrita exclusiva service role  |
| Idempotência           | chave+hash repetidos retornam recibo; hash divergente retorna conflito              |
| Concorrência           | `expectedVersion` obsoleto retorna conflito                                         |
| Release vazio          | pacote sem itens/projeção/publicação inicia em `draft`                              |
| Rollback               | transição auditável para `rolled_back`, histórico imutável e kill switch comprovado |
| Observabilidade        | `correlationId` ponta a ponta e logs sanitizados                                    |
| Produção               | bloqueada no Edge, banco e documentação                                             |

## Evidências executadas

| Gate      | Resultado | Evidência                                                                                |
| --------- | --------- | ---------------------------------------------------------------------------------------- |
| Qualidade | aprovado  | build, typecheck, formatação, lint sem erros, 79 Vitest, 12 estruturais e 74 legados     |
| Banco     | aprovado  | reset integral das migrations e 119 asserções pgTAP/RLS, incluindo 22 específicas EV2.1  |
| Navegador | aprovado  | 32 cenários Playwright aprovados e 8 cenários de staging corretamente ignorados          |
| Regressão | aprovado  | contratos v1 preservados, catálogo público mockado no teste local e acessibilidade verde |
| Reversão  | aprovado  | flag desligada, kill switch e transição auditável `rolled_back` cobertos por teste       |

As três jobs obrigatórias (`quality`, `database` e `browser`) concluíram com sucesso no mesmo commit. As 46 advertências de lint e os chunks opcionais de Excel/PDF acima de 500 kB permanecem conhecidos e não são regressões deste gate; não há erro de lint, tipo ou build.

## Decisão e limite

O Gate G1 libera exclusivamente a implementação local da EV2.2. Não autoriza staging, migration remota, conteúdo real, ativação persistente ou produção. As capacidades EV2.1 continuam desligadas por padrão.
