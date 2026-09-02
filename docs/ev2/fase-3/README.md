# EV2.3 — dados mestres, taxonomias e dependências

**Status:** implementação local concluída; Gate G3 pendente de CI de banco e piloto autorizado<br>
**Escopo:** F-003, RB-013, RB-014 e elemento monitorado N:N<br>
**Rollout:** default-off; nenhuma alteração em staging ou produção

## Entregas

- Fonte única aditiva para fabricante, marca, linha, categoria, grandeza, tecnologia, instalação e elemento monitorado.
- Normalização sem acento, aliases pesquisáveis e prevenção de duplicidade por nome ou domínio externo.
- Relações N:N definidas no banco, versionadas e consumidas pela interface sem dependências hardcoded.
- Inativação sem exclusão: impede novas associações e preserva referências existentes.
- Mesclagem crítica, auditada, sem apagar identidades e com restauração explícita.
- RPC idempotente com concorrência otimista, eventos imutáveis, RLS e acesso somente pela Edge Function.
- Interface `/admin/dados-mestres`, protegida por `VITE_EV2_MASTER_DATA_CANDIDATE`, permissão efetiva e flag server-side `ev2.master_data`.
- Resolução de opções dependentes que mantém e explica valores históricos incompatíveis antes de qualquer remoção.

## Limites deliberados

A migration `0040` não contém catálogo real, backfill inferido, dual-write ou alteração no modelo público. A EV2.3 não substitui automaticamente as listas controladas v1 e não muda produtos, publicação, busca, sitemap ou projeções. A função também recusa produção.

O preview normal da pull request compila a tela com a variável candidata ausente, portanto ela permanece inativa. Um canary EV2.3 exigirá autorização própria para migration, função, build, usuário steward, TTL e lote sintético.

## Verificação

```bash
npm run test:ev2:phase3
npm run test:unit
npm run typecheck
supabase db reset --local --no-seed
supabase test db
npm run check
```

Consulte o [contrato operacional](CONTRATO_E_OPERACAO.md), a [estratégia de migração](MIGRACAO_E_BACKFILL.md) e o [Gate G3](GATE_G3.md).
