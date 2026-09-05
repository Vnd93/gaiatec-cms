# Contrato e operação — EV2.4

## Fronteiras

`cms-pim` expõe `capability`, `list_products`, `get_product`, `save_product`, `archive_product`, `generate_sku` e `preview_v1_adapter`. `cms-attributes` expõe `capability` e `list_catalog` por categoria. Todos os comandos usam o envelope EV2 com `commandId`, `correlationId`, horário, ambiente e site.

Criação e atualização são intenções distintas. A criação leva identidade UUID gerada pelo cliente e não aceita `expectedVersion`; a atualização exige `expectedVersion`. O banco confirma a existência real e rejeita intenção incompatível, evitando upsert acidental.

## Regras invariantes

- exatamente um modelo ativo principal por produto;
- variante possui ao menos um eixo e não repete chave de eixo;
- fabricante, categoria e classificações dependentes devem estar ativos e compatíveis;
- SKU não é entrada editorial, não coincide deliberadamente com MPN/GTIN e não pode ser alterado ou excluído;
- identificador externo é único por tipo e valor normalizado;
- faixa não pode ser invertida e unidade deve converter para a unidade canônica da definição;
- somente valores homologados podem alimentar facetas futuras;
- proveniência é obrigatória e remoções preservam histórico por inativação;
- arquivamento requer permissão crítica e AAL2.

## Camadas de proteção

O build exige `VITE_EV2_PIM_CANDIDATE=true`. O servidor exige `ev2.pim_v2`, ambiente `local` ou `staging`, site `main`, sessão válida e permissão efetiva. A função recusa produção independentemente da flag. As tabelas não concedem acesso a `anon` ou `authenticated`; somente a função usa `service_role` depois das verificações.

## Compatibilidade v1

O adapter materializa identidade, classificação, modelos, variantes, SKU e especificações normalizadas no contrato `CmsProductContent` sem alterar o payload base. Qualquer referência mestre não resolvida interrompe a projeção. O round-trip do piloto deve comparar os campos críticos e registrar divergências antes de qualquer dual-write.

## Observabilidade e erro

Mutação recebe `X-Idempotency-Key`, persiste recibo com hash do comando e devolve `replayed=true` em repetição idêntica. Conflito de versão ou identidade usa SQLSTATE de domínio não retentável e retorna 409 imediatamente; incompatibilidade retorna 422; ausência retorna 404; flag/permissão retorna 403. Falhas preservam o cadastro na interface e carregam `correlationId` sem registrar conteúdo técnico ou PII nos logs.
