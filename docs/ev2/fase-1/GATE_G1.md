# Gate G1 — fundação arquitetural

**Resultado atual:** CANDIDATO — aprovação depende da execução local completa<br>
**Escopo:** avanço local para EV2.2; nenhuma promoção remota

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

## Limite da decisão

Quando todos os comandos listados no README passarem, o texto acima deverá mudar para `APROVADO PARA EV2.2 LOCAL` com commit e contagens. Este gate não autoriza staging, migration remota, conteúdo real, ativação persistente ou produção.
