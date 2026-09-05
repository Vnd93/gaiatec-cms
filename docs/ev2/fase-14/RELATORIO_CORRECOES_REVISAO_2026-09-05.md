# Relatório de correções da revisão técnica da EV2.14

**Data:** 5 de setembro de 2026  
**Branch:** `ev2/fase-14-ia-transacional-controlada`  
**PR:** `Vnd93/gaiatec-cms#7`  
**SHA funcional validado:** `ae2d216fb85acd7cfd6163af85b9a5251fe6bed0`  
**Resultado local:** quatro achados corrigidos; validação integral aprovada  
**Resultado remoto:** CI integral aprovado; preview de PR ignorado  
**Gate G14:** pendente (`pause`)

## Correções concluídas

| Achado                                           | Correção aplicada                                                                                                                           | Evidência local                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| aprovação de compensação não renovável           | removida a unicidade histórica; índice parcial mantém uma aprovação ativa e a função expira a anterior sob lock                             | pgTAP com expiração, renovação, histórico 1+1 e conflito ativo                           |
| resposta HTTP ambígua poderia duplicar plano     | retry automático e manual reutilizam exatamente corpo, envelope e chave; novas mutações ficam bloqueadas enquanto o resultado está pendente | teste de componente com duas falhas de transporte e recuperação pelo mesmo comando/chave |
| corrida na criação de fixture virava `23505`/500 | `INSERT ... ON CONFLICT DO NOTHING` decide o vencedor atomicamente e devolve `CMS_AI_EXECUTE_TARGET_CONFLICT`/409                           | canary concorrente com um vencedor e um conflito explícito                               |
| ordem inversa de locks permitia deadlock         | aprovação e compensação seguem `plan -> run -> approval -> targets`                                                                         | controle estático e cenário concorrente do canary sem HTTP 500                           |

O preview genérico de pull request também foi excluído desta branch. Atualizar o PR executa apenas
os jobs de validação; o alias `ev2-g14-canary` continua dependente do workflow manual e de autorização
específica.

## Resultado reproduzível

| Verificação                          | Resultado                                                   |
| ------------------------------------ | ----------------------------------------------------------- |
| `npm run check`                      | aprovado                                                    |
| Formatação                           | aprovado                                                    |
| ESLint                               | 0 erros; 46 avisos históricos fora da EV2.14                |
| TypeScript estrito + projeto         | aprovado                                                    |
| Vitest                               | 50 arquivos; 166/166 testes aprovados                       |
| Componente/modelo EV2.14 direcionado | 2 arquivos; 9/9 testes aprovados                            |
| Controles Node EV2.14                | 12/12 aprovados                                             |
| Eval adversarial G14                 | 18/18; 0 bypass; taxas de permissão/hash/compensação = 100% |
| Build Vite/Worker/budget             | aprovado                                                    |
| Tela G14 após correção               | JS 20,20 kB (gzip 6,69 kB); CSS 1,84 kB (gzip 0,62 kB)      |
| Bundle budget EV2.6                  | aprovado; 4 chunks iniciais, 761.149 bytes; Excel/PDF lazy  |
| `npm audit --audit-level=high`       | 0 vulnerabilidades                                          |
| PostgreSQL/pgTAP                     | jobs `database` aprovados; suite EV2.14 com 58 assertions   |

## Evidência remota

- [CI no evento push](https://github.com/Vnd93/gaiatec-cms/actions/runs/33967686012): `quality`,
  `database` e `browser` aprovados;
- [CI no pull request](https://github.com/Vnd93/gaiatec-cms/actions/runs/33967687284): `quality`,
  `database` e `browser` aprovados;
- [Preview no pull request](https://github.com/Vnd93/gaiatec-cms/actions/runs/33967687289): job
  `preview` ignorado, sem implantação;
- [Qualidade da documentação](https://github.com/Vnd93/gaiatec-documentacao/actions/runs/33967687799):
  aprovada.

## Cobertura operacional acrescentada

- expiração e renovação da aprovação de compensação sem alterar `run` ou `plan_hash`;
- preservação de todo o histórico e garantia de uma única aprovação ativa;
- rejeição explícita de aprovação ativa duplicada;
- criação concorrente de alvo com vencedor único;
- aprovação redundante concorrente com compensação, sem inversão de locks;
- repetição automática e acionada pelo operador usando a mesma identidade idempotente;
- bloqueio de novas mutações enquanto um resultado permanece ambíguo;
- ausência de deploy automático ao sincronizar o PR.

## Evidência ainda obrigatória para o Gate G14

O host local não possui Docker/PostgreSQL; essa lacuna foi coberta pelos dois jobs isolados
`database`, que aplicaram as migrations e concluíram `supabase test db` no SHA funcional acima.
Rehearsal e canary em staging continuam fora desta correção e somente poderão ser executados mediante
autorização específica vinculada ao SHA final.

## Impacto externo

Esta rodada não aplicou migration, não publicou Edge Function ou Pages, não criou usuário/override e
não alterou staging, staging estável ou produção. As mudanças permanecem limitadas à branch e aos PRs
de revisão.
