# ADR-010 — Imutabilidade do RDO

**Status:** aprovada para contenção — Pedro Nishida; validação jurídica obrigatória antes do Gate G1
**Data:** 28 de agosto de 2026

## Decisão

Relatório finalizado/assinado torna-se snapshot imutável. Correção cria nova versão vinculada; update, reabertura e hard delete genéricos são negados no banco e na API. Fotos e PDFs são privados, com URLs assinadas curtas. Assinatura usa token único, expiração, idempotência, hash e trilha de evidência.

Notificações recebem somente identificador/ação e montam conteúdo/destino a partir de dados canônicos no servidor. Política de validade, retenção e contestação depende de aprovação jurídica e de negócio.
