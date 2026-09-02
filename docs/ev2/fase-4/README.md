# EV2.4 — PIM e conteúdo principal

**Status:** canary técnico aprovado em staging; Gate G4 operacional pendente<br>
**Escopo:** F-002, F-004, F-005 e adapter v1<br>
**Rollout:** isolado; migrations `0041`/`0042` e funções ativas somente em staging, flags globais desligadas

## Entregas

- Grafo normalizado produto → modelo → variante → SKU, com identidade estável, MPN separado e identificadores externos próprios.
- SKU gerado pelo serviço, único por site, imutável, não reutilizável, idempotente e auditado.
- Atributos tipados por conjunto versionado, escopo explícito, unidade convertida para valor canônico, proveniência e homologação.
- APIs `cms-pim` e `cms-attributes` autenticadas, limitadas por taxa, protegidas por permissão, ambiente e flag server-side `ev2.pim_v2`.
- Editor guiado em `/admin/pim`, sem UUID ou JSON visível, com listas dependentes, modelo principal, variantes, especificações por categoria e bloqueio de obrigatórios.
- Adapter puro para `CmsProductContent` v1 e comparação estrutural para o futuro round-trip.
- Concorrência otimista em atualizações, idempotência persistida, RLS deny-by-default, eventos imutáveis e auditoria central.

## Estado do rollout

O canary autorizado aplicou as migrations `0041_ev2_pim_core.sql` e `0042_ev2_pim_conflict_sqlstate.sql` somente no projeto `GAIATEC CMS Staging`, publicou `cms-pim` e `cms-attributes` com JWT obrigatório e fixou o build no alias `ev2-g4-canary`. A migration corretiva preserva a `0041` imutável e impede retry de infraestrutura em conflitos esperados.

O ensaio final aprovou 32/32 verificações e removeu usuário, overrides e todo o grafo sintético. `ev2.pim_v2` e sua dependência `ev2.master_data` continuam `default_enabled=false`, sem override G4; o staging estável não foi substituído. Nenhum catálogo real, backfill, dual-write, projeção v1 persistida ou ambiente de produção foi alterado.

O Gate G4 operacional ainda depende da decisão sobre fontes ERP/MPN/GTIN/NCM e de autorização específica para o lote de 20–50 produtos. A CI final do SHA `a0d185a` recriou as migrations e aprovou 220/220 testes pgTAP, incluindo 35 asserções EV2.4, além de qualidade, 32 testes de navegador e preview.

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

Consulte o [relatório do canary](RELATORIO_CANARY_STAGING_2026-09-02.md), o [contrato operacional](CONTRATO_E_OPERACAO.md), a [estratégia de migração](MIGRACAO_E_BACKFILL.md) e o [Gate G4](GATE_G4.md).
