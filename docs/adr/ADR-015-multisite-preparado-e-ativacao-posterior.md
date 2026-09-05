# ADR-015 — Multisite preparado e ativação posterior

**Status:** aprovada para EV2<br>
**Data:** 1 de setembro de 2026<br>
**Decisor funcional:** Product Owner interino — Comercial GAIATEC Sistemas<br>
**Decisor técnico:** Tech Lead — Pedro Nishida

## Contexto

O CMS atual opera um site principal. A EV2 prevê fábrica de sites, ambientes, domínios, temas, compartilhamento controlado e isolamento por `site_id`, mas ainda não possui modelo, RLS e testes negativos suficientes para ativar multisite com segurança.

Ativar a capacidade na fase inicial aumentaria o risco de vazamento entre sites, duplicação de conteúdo e complexidade operacional antes de release bundle, PIM, workflow e autorização escopada estarem estabilizados.

## Decisão

Multisite será tratado como **plataforma futura preparada desde a fundação**, sem ativação operacional nas fases iniciais.

- EV2.0–EV2.8 devem evitar decisões irreversíveis que impeçam `site_id`, ambiente, domínio e tema no futuro.
- Novas entidades v2 podem incluir contexto de site/ambiente quando necessário, usando o site principal como default explícito.
- Nenhuma interface de criação de site, domínio adicional ou compartilhamento entre sites será habilitada antes da EV2.9.
- A capacidade permanecerá protegida por feature flag desligada e não será exposta no site público ou no painel comum.
- A ativação na EV2.9 exige RLS negativa por site/ambiente, teste de tenant escape, auditoria, backup/restore, roteamento, domínio, cache e rollback aprovados.
- F-012 permanece no plano como P2 e não entra no caminho crítico das primeiras entregas.

## Consequências

- O primeiro ciclo pode concentrar-se em segurança de entrega, UX, PIM, mídia, busca e qualidade.
- O modelo não fica preso a um único site, mas o custo operacional de multisite não é antecipado.
- Qualquer solicitação de ativação anterior à EV2.9 exige nova ADR, threat model, plano de migração e aprovação de Security/Product.
- O site atual continua sendo o único tenant operacional até decisão posterior baseada em necessidade real e evidência de segurança.
