# EV2.4 — PIM e conteúdo principal

**Status:** Gate G4 aprovado em staging; EV2.5 liberada<br>
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

O ensaio sintético final aprovou 32/32 verificações e removeu todas as fixtures. Depois da autorização operacional, o carregador validou a planilha por SHA-256 e importou 20 produtos reais somente como rascunhos privados: 20 modelos, 18 SKUs, 45 entidades e 37 compatibilidades. A repetição idempotente criou zero registro. `ev2.pim_v2` e `ev2.master_data` continuam `default_enabled=false`, sem override ativo; o staging estável não foi substituído.

O piloto registrou MPN pelo fabricante, GTIN por GS1/ERP, NCM pelo ERP/fiscal e SKU somente pelo CMS. Nenhum valor ausente foi inferido. A completude crítica foi 97%, o round-trip de 20/20 grafos teve zero divergência e a busca por faixa converteu `0,1–0,3 g/L` para `100–300 mg/L` com a interseção esperada. As faixas continuam não homologadas; `GAI-0691`, `GAI-0696` e `GAI-1130` permanecem impedidos de publicação pelos bloqueios registrados.

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

O [relatório do piloto operacional](RELATORIO_PILOTO_OPERACIONAL_STAGING_2026-09-02.md) contém as contagens, a fórmula de completude, a reconciliação, os bloqueios e o rollback lógico.
