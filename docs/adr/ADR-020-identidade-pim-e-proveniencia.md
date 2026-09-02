# ADR-020 — Identidade PIM, hierarquia comercial e proveniência

**Status:** aprovada para EV2<br>
**Data:** 1 de setembro de 2026

## Contexto

O portfólio mistura produto, família, modelo, versão e kit. A EV2 precisa evitar duplicação, preservar identificadores comerciais e provar a origem de atributos técnicos.

## Decisão

- `product`, `model`, `variant` e `sku` são entidades distintas; variante é opcional e SKU é unidade comercial identificável.
- Cada entidade recebe UUID interno imutável. SKU é único no escopo futuro de organização/site, nunca reutilizado; MPN, GTIN, NCM e ID mestre são campos separados.
- Herança flui produto -> modelo -> variante/SKU, com override explícito e origem visível; valor efetivo não destrói valor herdado.
- Atributos usam definição, tipo, unidade canônica, precisão, faixa e vocabulário versionados; conversão não altera a fonte original.
- Cada afirmação técnica guarda origem, referência, data de verificação, método, confiança/status e revisor.
- Conflito ou fonte ausente bloqueia publicação conforme severidade, mas não impede salvar rascunho.
- Merge/split e substituição criam relações auditáveis; não reatribuem identificador silenciosamente.
- APIs v1 usam adapter/projeção até depreciação formal.

## Consequências

O lote de 20 produtos exercita casos simples, famílias, versões, kits e conflitos. Regras finais de ERP/SKU/MPN/GTIN/NCM devem ser aprovadas antes da carga operacional da EV2.4.

## Verificação e rollback

Testar unicidade, inativação, herança/override, conversão, proveniência, merge/split, roundtrip e adapter v1. Rollback desliga escrita/leitura PIM v2 e preserva IDs e histórico.
