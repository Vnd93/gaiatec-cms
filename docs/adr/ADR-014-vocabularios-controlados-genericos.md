# ADR-014 — Vocabulários controlados genéricos

## Estado

Aceita para a Fase 10 em 2026-08-30.

## Contexto

Classificações livres causam duplicidade, filtros inconsistentes e criação implícita durante importações. Produto e serviço precisam compartilhar governança sem hardcode editorial ou dependência do sistema anterior.

## Decisão

Adotar `cms_controlled_lists` e `cms_controlled_options`. A lista identifica entidade e dimensão; a opção possui UUID estável, slug, rótulo, visibilidade, ordenação e estado. Escritas passam pela Edge Function `cms-controlled-vocabularies`, RPC com permissão crítica/MFA e auditoria. RLS é default-deny; exclusão física é proibida. Uma opção usada pode ser inativada, mas permanece resolvível em conteúdo histórico.

O payload editorial guarda referência estável e snapshot normalizado pelo servidor (`id`, `slug`, `label`, `publicVisible`). O frontend público recebe apenas `slug` e `label` quando lista, opção e campo permitem exposição. UUID, flags internas, fabricante/OEM, referência e SKU não entram na projeção.

O catálogo inicial autorizado é aplicado somente por workflow auditado no staging. A migration não contém valores editoriais. `service.category` é criada vazia porque nenhum valor inicial foi fornecido.

## Compatibilidade

Campos legados de classificação continuam sendo preenchidos pelo normalizador enquanto consumidores migram. Novas gravações de produto exigem as cinco referências; serviço exige `serviceKindRef`. Leituras antigas permanecem toleradas no schema até a retirada contratual planejada.

## Rollback

Desabilitar a Edge Function e reverter os consumidores para leitura do snapshot, sem apagar listas ou opções. A migration não deve ser revertida com `drop` em ambiente com uso; o rollback operacional é por desativação e restauração da versão anterior das funções.
