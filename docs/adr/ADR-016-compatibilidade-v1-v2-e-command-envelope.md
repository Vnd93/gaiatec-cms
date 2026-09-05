# ADR-016 — Compatibilidade v1/v2 e command envelope

**Status:** aprovada para EV2<br>
**Data:** 1 de setembro de 2026

## Contexto

A EV2 adicionará contratos de rascunho, PIM e release sem interromper as APIs, projeções e interfaces v1. Comandos precisam de idempotência, concorrência, correlação e erros consistentes.

## Decisão

- Rotas v1 permanecem semanticamente compatíveis; v2 usa rota ou ação versionada e adapter explícito.
- Mudança incompatível nunca é introduzida silenciosamente em v1.
- Todo comando EV2 recebe envelope com `commandId`, `idempotencyKey`, `correlationId`, `actorContext`, `expectedVersion`, `occurredAt`, `action` e `payload` validado por schema.
- A resposta contém `commandId`, `correlationId`, `status`, versão resultante e erro tipado quando aplicável.
- Repetir a mesma chave com o mesmo hash retorna o recibo anterior; chave igual com payload diferente retorna conflito.
- Concorrência divergente retorna HTTP 409 e dados mínimos para diff/resolução, sem overwrite automático.
- Erros usam códigos estáveis: autenticação 401, autorização 403, ausente 404, conflito 409, validação 422, limite 429 e falha inesperada 5xx.
- Logs carregam correlação e sanitizam payload; contexto de ator e escopo é derivado/validado no servidor.

## Consequências

Contratos novos exigem testes de golden/contract para v1 e v2. Adapters podem ser temporários, mas só serão removidos após telemetria, depreciação comunicada e gate específico. O envelope não concede autorização e não substitui RLS.

## Verificação e rollback

G1 exige testes de schema, idempotência, conflito, autenticação/autorização e v1 intacto. Rollback desliga flags e mantém o caminho v1; dados aditivos permanecem para auditoria.
