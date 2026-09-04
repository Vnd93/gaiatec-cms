# Relatório de validação local — EV2.11

**Estado:** validações local e CI concluídas; canary/G11 em staging pendentes<br>
**Ambiente:** workspace local e Supabase efêmero no GitHub Actions<br>
**Staging/produção:** não alterados

## Escopo preparado

- migration 0050 e RLS;
- funções `cms-system`, `cms-leads` e `cms-outbox-worker`;
- contratos e painéis de Diagnósticos/Leads;
- regras G11, carga HTTP, restore, canary e workflow candidato;
- documentação operacional, homologação e rollback.

## Evidências executadas

| Comando/verificação                               | Resultado real                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------- |
| `npm run test:ev2:phase11`                        | 6/6 testes aprovados                                                |
| `npm run eval:ev2:phase11`                        | 16/16 cenários; 0 falso aceite; 0 mutação em produção               |
| `npm run test`                                    | 47 arquivos e 153/153 testes aprovados                              |
| `npm run check`                                   | aprovado, incluindo EV2.0–EV2.11, fases legadas e build             |
| `npm run test:e2e`                                | 32 aprovados; 8 cenários exclusivos de staging ignorados localmente |
| build candidato EV2.11 em modo staging            | aprovado; orçamento de bundle aprovado                              |
| Deno check das três Edge Functions alteradas      | aprovado                                                            |
| `npm audit --audit-level=high`                    | 0 vulnerabilidades                                                  |
| `git diff --check` e sintaxe dos scripts Node     | aprovados                                                           |
| pgTAP no Supabase efêmero do CI                   | 50 migrations e 461/461 asserções; EV2.11 com 46/46 aprovadas       |
| CI e Preview do SHA `fa4fcd41`                    | banco, qualidade, navegador e preview isolado aprovados             |
| `supabase db reset --local --no-seed` / `test db` | não executados localmente: Docker/Podman indisponível nesta estação |

O lint encerrou com zero erro e 46 avisos preexistentes fora do escopo da EV2.11. O Deno informou o
peer range legado de `react-day-picker` para React 19, sem erro de resolução ou de tipo nas funções.

## Limite da evidência

A ausência do runtime de contêiner ainda impede declarar a migration/pgTAP aprovada nesta estação.
Essa lacuna local foi coberta pelo [CI do SHA `fa4fcd41`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33827139213), que reconstruiu o Supabase do zero, aplicou as 50 migrations e aprovou as 461
asserções. O [Preview do mesmo SHA](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33827139231) também foi aprovado, sem ativar a flag candidata.

Este relatório não declara canary, UAT, carga remota, restore remoto ou Gate G11 aprovados. Nenhuma
alteração foi feita em staging ou produção e nenhum dado real foi usado.
