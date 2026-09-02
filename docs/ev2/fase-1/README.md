# EV2.1 — fundação arquitetural

**Status:** Gate G1 aprovado para implementação local da EV2.2<br>
**Escopo:** implementação local, aditiva e desligada por padrão

## Entregas

- Contratos compartilhados e estritos de command envelope, flag e release em `src/shared/contracts/ev2-foundation.ts`.
- Migration `0037_ev2_foundation_flags_release.sql` com definições/overrides de flags, releases vazios, recibos idempotentes e eventos imutáveis.
- Edge Function `cms-releases` v1 com autenticação, origem, limite, payload, idempotência, correlação, MFA/RBAC e produção bloqueada.
- Testes Vitest, estruturais Node e pgTAP/RLS.
- [Contrato e operação](CONTRATO_E_OPERACAO.md), [drill de rollback](DRILL_ROLLBACK.md) e [decisão G1](GATE_G1.md).

## Limites deliberados

O esqueleto aceita apenas release vazio nos estados `draft`, `canceled` e `rolled_back`. Não existem itens, aprovação, agendamento, publicação, outbox ou projeção v2 nesta fase. Isso impede que a fundação seja confundida com autorização de conteúdo.

As tabelas são aditivas; clientes autenticados possuem somente leitura governada por RLS. Escritas passam pela função server-side concedida exclusivamente ao `service_role`. Todas as flags são persistidas `off`; o teste transacional cria um override local temporário dentro de transação revertida.

## Verificação

```bash
npm run test:ev2:phase1
npm run test
supabase db reset --local --no-seed
supabase test db
npm run check
```

Nenhum comando acima promove staging ou produção.

## Decisão

O Gate G1 foi aprovado em 2 de setembro de 2026, no commit `1ff4975`, após sucesso conjunto das jobs de qualidade, banco e navegador. Consulte a [decisão e as evidências](GATE_G1.md).
