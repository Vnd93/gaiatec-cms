# Matriz de consumidores — F10

| Dado/ação                  | Editor                            | Persistência/validação             | Consumidor público                             | Segurança/teste                              |
| -------------------------- | --------------------------------- | ---------------------------------- | ---------------------------------------------- | -------------------------------------------- |
| cinco dimensões de produto | editor + listas mestras           | `cms_normalize_controlled_payload` | catálogo, filtros, busca, detalhe, SEO/JSON-LD | projeção elimina ID e invisíveis             |
| categoria de serviço       | editor de descoberta              | normalizador de serviço            | detalhe/busca de serviços                      | snapshot público permitido apenas se visível |
| opções/ordem/estado        | Listas mestras                    | Edge + RPC auditada                | somente projeção publicada                     | RLS, MFA, sem delete                         |
| UUIDs em massa             | template Excel e parser           | dry-run atômico no `cms-content`   | nenhum até publicação                          | desconhecido gera linha/campo                |
| rascunho local             | todos os seis editores governados | `sessionStorage`, TTL 24h          | nenhum                                         | namespace por usuário/tipo/item              |
| estado/progresso           | editor de produto                 | derivado do contrato e status real | nenhum                                         | links levam ao campo/tab                     |
| modelos/variantes          | tabela visual; JSON avançado      | payload governado                  | comparação e detalhe conforme visibilidade     | remoção confirmada; internos removidos       |

Não foi criado sino, badge de notificação ou feed operacional. Não há fonte transacional e permissão específica comprovadas para essa UI; controles decorativos violariam o contrato operacional.
