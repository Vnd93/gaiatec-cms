# Relatório de prontidão do candidato EV2.8

**Data:** 3 de setembro de 2026  
**Resultado:** APROVADO NO CI; GATE G8 PENDENTE  
**Baseline funcional:** `570da8ab8d6977b5e8ba01568484489b3be482c6`  
**Branch:** `ev2/desenvolvimento-fases-1-a-12`  
**Produção:** bloqueada

## Escopo validado

A baseline contém o RBAC escopado de F-014, a migration aditiva `0047_ev2_scoped_rbac.sql`, as funções `cms-scopes` e `cms-session`, a interface candidata em `/admin/usuarios`, os contratos, o runner de canary e a documentação operacional do Gate G8. O caminho permanece `default-off` e exige simultaneamente build candidato e um único override individual válido, vinculado ao ambiente.

Também foi concluída a migração dos workflows para os runtimes oficiais atuais: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/upload-artifact@v7` e `supabase/setup-cli@v3`. A repetição integral eliminou os avisos de depreciação do Node 20 sem alterar os comandos do projeto nem disparar workflows de deploy.

## Evidências automatizadas

| Evidência                                                                                                            | Resultado | Detalhe                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| [CI do push — 33772888006](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33772888006)         | aprovado  | `quality`, `database` e `browser` concluídos com sucesso                                                |
| [CI do pull request — 33772893589](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33772893589) | aprovado  | repetição independente dos três jobs                                                                    |
| [Preview — 33772893576](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33772893576)            | aprovado  | build e manifesto preservados como artefato GitHub; Cloudflare não configurado e deploy remoto ignorado |
| Vitest                                                                                                               | aprovado  | 41 arquivos e 131 testes                                                                                |
| Suítes estruturais EV2                                                                                               | aprovado  | todas as fases, incluindo 7/7 verificações específicas da EV2.8                                         |
| PostgreSQL/pgTAP                                                                                                     | aprovado  | reset integral, 13 arquivos e 319 testes; migration `0047` carregada em banco limpo                     |
| Playwright                                                                                                           | aprovado  | 32 cenários aplicáveis; 8 cenários condicionais ignorados pelo conjunto                                 |
| Build e orçamento                                                                                                    | aprovado  | build de staging, manifesto e orçamento com Excel/PDF fora do grafo inicial                             |
| Auditoria de dependências                                                                                            | aprovado  | `npm audit --audit-level=high` sem bloqueio                                                             |

O lint terminou com zero erro e os 46 avisos históricos já registrados como `EV2-Q01`; a decisão vigente é tratá-los no backlog contínuo sem misturar sua limpeza com uma fase funcional.

## Incidente detectado e corrigido

A primeira execução encontrou uma asserção legada que ainda esperava sete papéis do CMS. A EV2.8 acrescenta `auditor` e `support`, elevando a cardinalidade canônica para nove. A expectativa foi corrigida no commit `0828555`, a suíte específica passou 7/7 e as repetições seguintes aprovaram os 319 testes pgTAP completos. Não houve relaxamento de política, exclusão de teste ou reexecução para ocultar falha.

## Limites confirmados

- nenhuma migration EV2.8 foi aplicada em staging;
- nenhuma Edge Function EV2.8 foi publicada;
- o alias `ev2-g8-canary` não foi criado ou atualizado;
- nenhuma flag, identidade sintética ou override foi criado;
- o preview comum permaneceu apenas como artefato no GitHub;
- nenhum dado real, staging estável ou recurso de produção foi alterado.

## Próxima decisão

O candidato está tecnicamente pronto para o canary controlado G8, mas a execução depende de autorização específica para a migration `0047`, as funções `cms-scopes` e `cms-session`, o build no alias `ev2-g8-canary`, dois usuários sintéticos com MFA e overrides individuais de 30 minutos. A autorização não deve incluir produção, dados reais, ativação global ou promoção do staging estável.
