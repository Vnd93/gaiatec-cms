# ADR-004 — APIs pública e administrativa

**Status:** aprovada — Pedro Nishida, Tech Lead
**Data:** 28 de agosto de 2026

## Decisão

Separar:

- API pública versionada: somente projeção publicada, cacheável e sem campos internos;
- API administrativa: autenticada, não cacheável publicamente e autorizada por ação/recurso;
- comandos específicos (`approve`, `publish`, `restore`, `archive`) em vez de update genérico de status.

Contratos terão schema runtime, versão, erros estáveis, idempotência, auditoria e testes negativos. `site-content` antigo não será reativado.
