# Gate G3 — dados mestres íntegros e sem órfãos

**Resultado atual:** G3 PENDENTE — CANARY E PILOTO NÃO AUTORIZADOS<br>
**Produção:** bloqueada<br>
**Staging EV2.3:** não autorizada; nenhuma migration, função ou flag desta fase foi implantada

## Evidências disponíveis

| Critério                    | Situação            | Evidência                                                             |
| --------------------------- | ------------------- | --------------------------------------------------------------------- |
| Schema aditivo/RLS          | implementado        | migration `0040_ev2_master_data.sql`                                  |
| Contrato/API                | implementado        | contrato Zod e `cms-master-data`                                      |
| Inativação histórica        | coberto             | modelo, trigger, RPC e pgTAP                                          |
| N:N sem hardcode            | coberto             | regras no banco e UI orientada pela API                               |
| Duplicidade/aliases         | coberto             | normalização, unicidade e testes                                      |
| Merge/restauração           | coberto             | comando crítico AAL2, identidade preservada e evento imutável         |
| Regressão estática/unitária | aprovado localmente | 103 Vitest, 27 EV2 estruturais, fases F1–F11, lint, typecheck e build |
| Edge Function               | aprovado localmente | `deno check` sem erro no contrato e imports reais                     |
| Build candidato             | aprovado localmente | build com `VITE_EV2_MASTER_DATA_CANDIDATE=true`, sem deploy           |
| Navegador                   | aprovado localmente | 32 Playwright aprovados e 8 não aplicáveis fora de staging            |
| Execução pgTAP integral     | aprovado na CI      | 185/185 testes aprovados; 37 asserções específicas da EV2.3           |
| Piloto integral/zero órfãos | pendente            | requer lote sintético e canary EV2.3 autorizado                       |

## Critérios objetivos para aprovação

- CI de qualidade, banco e navegador verde no commit candidato.
- 37 asserções específicas da EV2.3 aprovadas junto da suíte RLS completa.
- Canary isolado em staging com migration `0040`, função `cms-master-data` e build explicitamente habilitado.
- Usuário steward com override individual temporário; flag global e produção desligadas.
- Lote piloto sintético ou previamente aprovado reconciliado com zero referências órfãs.
- Busca pré-criação, inativação, relação dependente, conflito de versão, merge e restauração validados.
- Limpeza dos dados sintéticos ou preservação identificada como evidência, conforme roteiro aprovado.

## Decisão

EV2.4 não está liberada. O job `database` da execução CI `33666515308`, referente ao commit candidato `86e9d09`, aprovou os 185/185 testes pgTAP, incluindo as 37 asserções da EV2.3. A ausência de Docker Desktop ou Podman no host local deixou de ser um bloqueio técnico. Para decidir o G3, ainda são necessários autorização específica e resultado aprovado do canary/piloto EV2.3 com zero referências órfãs. A autorização anterior da EV2.2 não foi reutilizada nem ampliada.
