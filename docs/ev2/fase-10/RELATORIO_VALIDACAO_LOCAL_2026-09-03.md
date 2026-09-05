# Relatório de validação local — EV2.10

**Data:** 3 de setembro de 2026<br>
**Escopo:** F-015 em modo sintético/provider-off<br>
**Resultado:** APROVADO LOCALMENTE; G10 PENDENTE<br>
**Produção e staging:** nenhuma alteração

## Resultado consolidado

| Evidência                    | Resultado                                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| `npm run check`              | aprovado                                                                    |
| Vitest                       | 150/150 testes                                                              |
| Testes Node EV2/Fases        | 151/151 testes                                                              |
| TypeScript                   | aprovado em configurações estrita e geral                                   |
| ESLint                       | 0 erros; 46 avisos preexistentes rastreados em `EV2-Q01`                    |
| Formatação                   | aprovada                                                                    |
| Build padrão                 | aprovado                                                                    |
| Build staging candidato      | aprovado com `VITE_EV2_AI_ASSIST_CANDIDATE=true`                            |
| Chunk da interface candidata | 18,46 kB minificado; 6,09 kB gzip; carregamento lazy                        |
| Bundle inicial               | 758.188 bytes; Excel/PDF continuam fora do grafo inicial                    |
| Rota privada                 | `/admin/assistente` responde pelo worker com `no-store`                     |
| Evals G10                    | aprovado; 0 bypass, 0 vazamento, 100% fonte, precisão e matriz de permissão |

## Evals versionados

- dataset: `28f71cead73e40f71f44b11c512d13308115774d411feb342c7f55c40f92d044`;
- golden: 4 casos;
- adversarial: 8 casos;
- privacidade: 6 casos, incluindo e-mail, CPF, telefone, credencial, JWT e chave privada;
- permissão/segregação: 15 casos;
- source coverage: 100%;
- precisão de campo: 100%;
- baixa confiança: 100% marcada `pending`;
- custo: zero;
- aplicação/publicação: zero.

## Barreiras verificadas

1. `ev2.ai_assist` e `ev2.ai_execute` continuam desligadas por padrão;
2. build candidato e override individual de até 30 minutos são cumulativos;
3. override amplo ou ambíguo falha fechado;
4. produção, dados reais, rede e provedor externo são recusados;
5. somente quatro tools F-015, todas não mutantes;
6. PII é redigida antes da persistência e a função SQL mantém uma segunda barreira;
7. retenção expira em 23 h 55 min e uma rotina limitada de expurgo roda a cada cinco minutos;
8. fonte, versão, localizador/página, trecho e confiança são canônicos no servidor;
9. confiança abaixo de 0,80 não pode ser aceita diretamente;
10. o autor não decide a própria proposta;
11. edição preserva a citação original e registra `human_verified`;
12. toda decisão mantém `applied=false` e `published=false`;
13. idempotência cobre chave e `commandId`, inclusive colisões cruzadas;
14. falha de auditoria, rate limit, política ou flag preserva o CMS manual.

## Validações deliberadamente não executadas

O arquivo pgTAP contém 45 verificações de RLS e domínio, mas `npm run test:rls` não pôde ser
executado porque esta máquina não possui Docker, Podman nem PostgreSQL local. O rehearsal
transacional, a migration `0049`, a função `cms-ai`, o preview remoto e o canary também não foram
executados: dependem de autorização específica da EV2.10 e devem ocorrer somente em staging.

Essa limitação não foi contornada com acesso remoto. O Gate G10 permanece pendente até que o mesmo
SHA passe pela CI, pelo rehearsal com rollback, pelos 45 testes pgTAP e pelo canary sintético de dois
usuários MFA com limpeza independente.

## Próximo gate

Seguir o [plano de canary](PLANO_CANARY_STAGING.md) apenas após autorização explícita contendo o SHA
exato. EV2-D04 continua bloqueando provedor externo e qualquer dado não sintético; F-016 permanece
fora do escopo e `ev2.ai_execute` continua desligada.
