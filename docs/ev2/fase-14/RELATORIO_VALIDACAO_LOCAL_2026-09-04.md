# Relatório de validação local da EV2.14

**Data:** 4 de setembro de 2026<br>
**Branch:** `ev2/fase-14-ia-transacional-controlada`<br>
**Base:** `0699683c0f459c99a4f341e4ba6889d8424f157d`<br>
**Resultado local:** aprovado com ressalvas remotas obrigatórias<br>
**Gate G14:** pendente (`pause`)

## Resultado reproduzível

| Verificação                      | Resultado                                                                  |
| -------------------------------- | -------------------------------------------------------------------------- |
| `npm run check`                  | aprovado                                                                   |
| Formatação                       | aprovado                                                                   |
| ESLint                           | 0 erros; 46 avisos históricos fora da EV2.14                               |
| TypeScript estrito + projeto     | aprovado                                                                   |
| Vitest                           | 50 arquivos; 165/165 testes aprovados                                      |
| Controles Node EV2.14            | 12/12 aprovados                                                            |
| Eval adversarial G14             | 18/18; 0 bypass; taxas de permissão/hash/compensação = 100%                |
| Dataset G14                      | SHA-256 `9721baaa99e79d199a1ec198974b5299c43d3c6ea27aee2e1572188fd920f035` |
| Regressões Node fases anteriores | aprovadas                                                                  |
| Build Vite/Worker/budget         | aprovado                                                                   |
| Chunk da tela G14                | JS 18,98 kB (gzip 6,30 kB); CSS 1,84 kB (gzip 0,62 kB)                     |
| Bundle budget EV2.6              | aprovado; 4 chunks iniciais, 761.086 bytes; Excel/PDF lazy                 |
| `npm audit --audit-level=high`   | 0 vulnerabilidades                                                         |
| `git diff --check`               | aprovado                                                                   |

Os testes direcionados de componente e modelo também passaram: 2 arquivos e 8 testes. O código novo
passou por ESLint direcionado sem avisos ou erros após a correção do simulador.

## Controles comprovados localmente

- catálogo fixo de cinco tools sintéticas e reversíveis;
- produção, alvo real e ferramenta desconhecida recusados;
- plano de uma a vinte etapas, máquina de estados e versão esperada;
- alteração de título, versão ou etapa muda o hash;
- aprovação expira, é vinculada a hash/versão e exige segregação;
- execução projetada não altera a entrada e é integral;
- compensação restaura o estado e mantém versão monotônica;
- UI exige as duas capacidades, não oferece campo de alvo real e preserva fallback manual;
- gateway bloqueia provider externo, entrada insegura e mutação sem MFA;
- scripts de rehearsal/canary e workflow são fixados ao staging e alias G14.

## Ressalvas que impedem aprovar G14

1. O host local não possui Docker, Podman, PostgreSQL ou `psql`; por isso a migration `0054` não foi
   compilada/executada e o pgTAP não foi rodado localmente.
2. O rehearsal transacional em staging não foi executado, pois exige autorização específica da
   EV2.14 e sua frase de trava.
3. Migration, Edge Function e build candidato não foram implantados.
4. O canary integrado com dois usuários sintéticos MFA e limpeza/resíduo zero não foi executado.
5. A revisão independente vinculada ao SHA final continua pendente.

Esses itens não são falhas mascaradas: estão explicitamente marcados como evidência remota pendente
no Gate G14. Nenhuma métrica de banco ou staging foi inferida a partir dos testes estáticos.

## Impacto externo

Durante esta validação não houve migration remota, publicação de Edge Function, deploy de Pages,
override, usuário sintético, dado real, chamada de provedor, alteração de staging estável ou ação em
produção.

## Decisão

O candidato local está apto à revisão de código e à formação de um SHA imutável. O próximo passo é
fechar o commit/CI e solicitar autorização nominal para o canary G14. Até lá, a decisão permanece
`pause` e as duas flags continuam default-off.
