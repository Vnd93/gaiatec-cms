# ADR-010 — Imutabilidade do RDO

**Status:** aprovada — contenção técnica e aceite jurídico-negocial registrados
**Data:** 28 de agosto de 2026

## Decisão

Relatório finalizado/assinado torna-se snapshot imutável. Correção cria nova versão vinculada; update, reabertura e hard delete genéricos são negados no banco e na API. Fotos e PDFs são privados, com URLs assinadas curtas. Assinatura usa token único, expiração, idempotência, hash e trilha de evidência.

Notificações recebem somente identificador/ação e montam conteúdo/destino a partir de dados canônicos no servidor. Os termos, o consentimento e o modelo probatório — incluindo as regras de validade, retenção e contestação neles incorporadas — são aceitos para o escopo da Fase 1 nos termos do registro abaixo.

## Aceite jurídico-negocial

Em 28 de agosto de 2026, no chat de origem do projeto, o solicitante declarou exercer a função de Administrador da GAIATEC SISTEMAS e registrou a seguinte autorização:

> “Sou administrador da empresa GAIATEC SISTEMAS, está autorizado seguir. Por minha responsabilidade.”

Por determinação expressa do solicitante, essa declaração constitui o aceite formal, sob responsabilidade do Administrador, pelos papéis Jurídico e Negócio para os termos, o consentimento e o modelo probatório desta ADR. A decisão encerra a validação humana exigida para o Gate G1, sem representar parecer jurídico externo, certificação ICP-Brasil ou autorização para alterar produção.

A trilha completa do aceite, incluindo origem, escopo e vinculação às evidências técnicas, está em [Aceite jurídico-negocial da ADR-010](../fase-1/ACEITE_JURIDICO_NEGOCIAL_ADR010.md).
