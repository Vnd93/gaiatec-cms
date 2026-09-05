# Estratégia de migração e backfill EV2.3

## Princípio

Não inferir equivalência. A implementação cria schema e regras, mas não importa valores do catálogo v1 automaticamente. Dois rótulos parecidos, domínios ausentes ou abreviações são conflitos de steward, não autorização para mesclar.

## Sequência segura futura

1. Exportar snapshot v1 somente leitura, com UUID/origem/uso.
2. Normalizar em dry-run e classificar: único, alias provável, duplicidade, domínio conflitante ou relação órfã.
3. O steward aprova cada conflito e a relação N:N correspondente.
4. Importar com chaves idempotentes, sem produção e com flag desligada.
5. Comparar contagens, UUIDs, aliases, vínculos e zero órfãos.
6. Habilitar leitura candidata apenas para o piloto; manter escrita/publicação v1.
7. Somente após G3 planejar o adapter do PIM EV2.4.

## Critérios de rejeição

- nome normalizado ou domínio ativo duplicado;
- origem ou tipo desconhecido;
- associação fora de `cms_master_relation_rules`;
- origem/destino inativo para novo vínculo;
- item sem fonte verificável;
- tentativa de excluir ou reatribuir silenciosamente UUID histórico.

## Reconciliação

O relatório do piloto deve registrar total por tipo, aliases, relações ativas/inativas, conflitos resolvidos, conflitos pendentes e órfãos. G3 exige zero órfãos no lote aprovado. Conflitos pendentes ficam fora do lote, sem preenchimento presumido.
