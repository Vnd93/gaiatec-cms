# ADR-009 — Leads no novo CMS

**Status:** aprovada — Comercial GAIATEC / Pedro Nishida
**Data:** 28 de agosto de 2026

## Decisão

O novo CMS será o sistema administrativo mestre dos leads. Formulários são versionados; consentimento, origem, campanha, produto, UTMs, status, responsável, SLA e histórico são estruturados. Persistência precede notificação e usa outbox/idempotência.

O encaminhamento legado somente será desligado após homologação completa e decisão sobre leads pendentes. A carga inicial não importa leads sem política de retenção e responsabilidade aprovada.
