# Contrato e operação dos dados mestres EV2.3

## Entidades canônicas

Cada entidade possui UUID estável, `siteKey=main`, tipo controlado, nome canônico e normalizado, descrição, domínio externo opcional, origem, estado, versão de lock e autoria. Os estados são:

- `active`: disponível para novas seleções;
- `inactive`: indisponível para novas seleções, com histórico preservado;
- `merged`: identidade arquivada que aponta ao destino canônico e pode ser restaurada.

Aliases possuem unicidade normalizada dentro do tipo. Um alias não pode repetir o nome canônico da própria entidade nem ocultar outra entidade ativa. Nome e domínio externo também são únicos por tipo enquanto a identidade não estiver mesclada.

## Relações N:N

`cms_master_relation_rules` define os pares válidos. A interface consulta essas regras; não decide tipos por código.

| Relação                      | Origem     | Destino             |
| ---------------------------- | ---------- | ------------------- |
| `manufacturer_brand`         | fabricante | marca               |
| `brand_line`                 | marca      | linha               |
| `category_magnitude`         | categoria  | grandeza            |
| `category_technology`        | categoria  | tecnologia          |
| `category_installation`      | categoria  | instalação          |
| `category_monitored_element` | categoria  | elemento monitorado |

Uma nova compatibilidade exige ambas as entidades ativas. Inativar depois não apaga o vínculo histórico. Leituras resolvem identidades mescladas para o destino ativo, mantendo o UUID originalmente persistido. Valores antigos que deixaram de ser válidos são apresentados com explicação antes de remoção confirmada.

## API `cms-master-data`

Leituras: `capability`, `list_entities`, `list_rules` e `get_dependencies`.

Mutações: `create_entity`, `update_entity`, `set_entity_status`, `merge_entities`, `restore_merge`, `upsert_alias`, `upsert_compatibility` e `set_compatibility_status`.

Todas usam envelope EV2 v1. Mutações exigem `X-Idempotency-Key`; atualizações exigem `expectedVersion`. Identidade, AAL, sessão e ambiente são derivados/validados no servidor. Mesclar e restaurar usam `cms:masterdata.merge`, marcada como crítica e portanto dependente de AAL2.

## Segurança e rollback

- Tabelas têm RLS e nenhum grant para `anon` ou `authenticated`.
- Somente a Edge Function autenticada usa o cliente `service_role` e a RPC governada.
- A flag é desligada por padrão, tem kill switch e pode ser escopada por usuário/ambiente com TTL.
- Produção é recusada na Edge Function e na RPC desta fase.
- Não existe hard delete; eventos e auditoria são imutáveis.

Rollback operacional: retirar a variável candidata ou desativar `ev2.master_data`. As listas v1 continuam ativas e os dados EV2 permanecem preservados para inspeção ou restauração. Não executar down migration destrutiva.
