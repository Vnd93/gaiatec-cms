# Baseline técnico EV2.0

**Commit de referência:** `a7c092db68cdd43ebfe5c10266dfca53fa052ad5`<br>
**Método:** inspeção do repositório e `npm run check`; nenhuma consulta mutável ou operação remota<br>
**Resultado de referência:** aprovado em 1 de setembro de 2026

## Inventário congelado

| Superfície       | Evidência no commit de referência                                                            |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Runtime          | Node 22 por `.nvmrc`; Vite 6.4.3; TypeScript 6.0.3                                           |
| Banco            | 36 migrations numeradas; modelo Supabase/Postgres com RLS, auditoria e outbox já existentes  |
| Edge             | 17 diretórios de funções, incluindo 13 funções de domínio e `_shared`                        |
| Frontend         | aplicações pública e administrativa em `src/public` e `src/admin`; contratos em `src/shared` |
| Observabilidade  | `src/shared/observability.ts` com `correlationId`, logs estruturados e sanitização           |
| Testes           | 149 aprovados: 75 Vitest e 74 testes Node na execução de referência                          |
| Qualidade        | typecheck e build aprovados; lint com 46 avisos e zero erros                                 |
| Dívida conhecida | chunks de Excel/PDF acima de 600 kB; acompanhamento em performance, sem bloqueio do G0       |
| Entrega          | workflows separados para CI, preview, staging, rollback de staging e produção manual         |

## Contratos que não podem regredir

- APIs e projeções públicas v1;
- RLS/RBAC, MFA/AAL2 e segregação de ações críticas;
- revisão editorial, auditoria, idempotência e outbox;
- site principal como único tenant operacional;
- fallback manual e artefato anterior recuperável;
- ausência de segredo, token ou dado pessoal em log/evidência.

## SLOs iniciais de engenharia

Estes são budgets de aceite, não medições fabricadas. Serão refinados com telemetria comparável em staging.

| Sinal                           | Objetivo inicial                                                                        | Gate de aplicação |
| ------------------------------- | --------------------------------------------------------------------------------------- | ----------------- |
| Disponibilidade de comandos CMS | >= 99,9% mensal, excluída manutenção anunciada                                          | G11/G12           |
| Latência de leitura admin       | p95 <= 500 ms e p99 <= 1.000 ms no backend, carga homologada                            | G6/G11            |
| Latência de comando síncrono    | p95 <= 800 ms; trabalho longo retorna `202` em <= 1.000 ms                              | G7/G11            |
| Autosave                        | confirmação p95 <= 1.000 ms após debounce; zero perda confirmada                        | G2/G11            |
| Busca técnica                   | p95 <= 500 ms para consulta homologada; zero-results monitorado                         | G6/G11            |
| Outbox                          | p95 de atraso <= 60 s; backlog sem crescimento por 15 min                               | G7/G11            |
| Publicação/rollback             | estado composto coerente; RPO 0 para release confirmado; RTO <= 15 min                  | G7/G11            |
| Acessibilidade                  | zero violação crítica/séria automatizada; fluxo por teclado completo                    | cada gate de UI   |
| Segurança                       | zero fuga entre escopos; 100% das ações críticas com avaliação de permissão e auditoria | G8/G11            |
| Regressão                       | `npm run check`, contratos v1 e suíte RLS verdes                                        | cada PR/gate      |

## Política de budgets

- Três violações consecutivas de SLO ou qualquer falha de segurança pausa rollout.
- Métricas sem ambiente, versão, amostra e janela não comprovam gate.
- IA, busca externa e multisite não podem degradar o caminho manual ou o site atual.
- O baseline humano está separado em [Baseline das tarefas](BASELINE_TAREFAS.md).
