# EV2.4 — PIM e conteúdo principal

**Status:** implementação candidata validada localmente e na CI; Gate G4 pendente<br>
**Escopo:** F-002, F-004, F-005 e adapter v1<br>
**Rollout:** nenhum; migration `0041` e funções permanecem somente no código

## Entregas

- Grafo normalizado produto → modelo → variante → SKU, com identidade estável, MPN separado e identificadores externos próprios.
- SKU gerado pelo serviço, único por site, imutável, não reutilizável, idempotente e auditado.
- Atributos tipados por conjunto versionado, escopo explícito, unidade convertida para valor canônico, proveniência e homologação.
- APIs `cms-pim` e `cms-attributes` autenticadas, limitadas por taxa, protegidas por permissão, ambiente e flag server-side `ev2.pim_v2`.
- Editor guiado em `/admin/pim`, sem UUID ou JSON visível, com listas dependentes, modelo principal, variantes, especificações por categoria e bloqueio de obrigatórios.
- Adapter puro para `CmsProductContent` v1 e comparação estrutural para o futuro round-trip.
- Concorrência otimista em atualizações, idempotência persistida, RLS deny-by-default, eventos imutáveis e auditoria central.

## Limites deliberados

A migration `0041_ev2_pim_core.sql` não foi aplicada em staging ou produção. As funções não foram publicadas, a flag continua desligada e nenhum catálogo real, backfill, dual-write ou projeção v1 foi alterado.

O Gate G4 depende de autorização própria para staging, decisão sobre fontes ERP/MPN/GTIN/NCM, carga piloto aprovada e reconciliação do adapter. A autorização anterior da EV2.3 não foi ampliada para a EV2.4.

A execução CI `33676699106`, no commit funcional `a670f14`, recriou todas as migrations e aprovou 220/220 testes pgTAP, incluindo as 35 asserções específicas desta fase. Qualidade, 32 testes de navegador e preview também foram aprovados.

## Verificação

```bash
npm run test:ev2:phase4
npm run test:unit
npm run typecheck
deno check --node-modules-dir=false supabase/functions/cms-pim/index.ts supabase/functions/cms-attributes/index.ts
supabase db reset --local --no-seed
supabase test db
npm run check
```

Consulte o [contrato operacional](CONTRATO_E_OPERACAO.md), a [estratégia de migração](MIGRACAO_E_BACKFILL.md) e o [Gate G4](GATE_G4.md).
