# ADR-005 — RBAC separado CMS/RDO

**Status:** aprovada — Pedro Nishida, Tech Lead/Segurança interino
**Data:** 28 de agosto de 2026

## Decisão

Usar RLS default-deny e permissões por domínio/ação, com escopos independentes `cms:*` e `rdo:*`. Papéis visuais não concedem acesso por si; UI, API e banco devem rejeitar ações não autorizadas.

Perfis críticos exigem MFA, sessão revogável e audit log protegido. Nenhuma service role é entregue ao frontend.
