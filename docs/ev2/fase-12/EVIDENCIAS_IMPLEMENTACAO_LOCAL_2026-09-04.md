# Evidências da implementação local EV2.12 — 4 de setembro de 2026

## Identidade do candidato

| Campo                    | Valor                                                           |
| ------------------------ | --------------------------------------------------------------- |
| Branch                   | `ev2/desenvolvimento-fases-1-a-12`                              |
| SHA imutável qualificado | `8250db0ddb221306a2621aa9c6004f45823ec532`                      |
| Commit                   | `feat(ev2): add fail-closed G12 rollout`                        |
| Escopo                   | implementação local, build candidato e validações automatizadas |
| Produção                 | nenhuma alteração, promoção ou uso de dados reais               |

O SHA acima identifica o código e o build qualificados para solicitar o canary G12. Alterações
documentais posteriores no branch não mudam a identidade desse candidato.

## Validação local

| Verificação               | Resultado                                           |
| ------------------------- | --------------------------------------------------- |
| `npm run check`           | aprovado                                            |
| Testes Vitest             | 47 arquivos e 153 testes aprovados                  |
| Testes de rollout EV2.12  | 8 de 8 aprovados                                    |
| Evals fail-closed G12     | 18 de 18 aprovados; zero aceitações indevidas       |
| Lint                      | zero erros; 46 avisos preexistentes conhecidos      |
| TypeScript                | aprovado                                            |
| Build                     | aprovado; 3.431 módulos transformados               |
| Auditoria de dependências | zero vulnerabilidades de severidade alta ou crítica |

Os evals confirmaram `realDataUsed: false` e `productionMutations: 0`.

## Integridade do artefato

O build de staging foi gerado com o SHA qualificado e as flags candidatas habilitadas apenas no
artefato local/staging. O manifest contém 1.450 arquivos e o digest agregado é:

```text
68eb738489645d11af0ac0a9f6685d2e85c833d15a5b77d9108f624a75029798
```

Não foram encontrados placeholders do Worker no artefato.

## Probe do artefato exato

O mesmo `dist` foi servido localmente pelo runtime do Cloudflare Pages e submetido ao probe G12.

| Medida                  | Resultado                         |
| ----------------------- | --------------------------------- |
| Respostas observadas    | 22                                |
| Disponibilidade         | 100%                              |
| Respostas 5xx           | 0%                                |
| Latência pública p95    | 1.319,731 ms                      |
| `X-Release`             | SHA completo e exato              |
| `/healthz`              | contrato e ambiente válidos       |
| `release-manifest.json` | SHA e digest coerentes            |
| Fronteira de indexação  | `noindex` válido fora de produção |
| Decisão do probe        | `pass`                            |

Esta prova valida o artefato em runtime local; não substitui o canary real em staging, suas três
janelas consecutivas, a projeção v1/candidato nem a evidência de resíduo zero.

## GitHub Actions

Todos os checks obrigatórios do candidato foram aprovados:

- [CI do push — execução 33883580280](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33883580280): qualidade, banco e navegador aprovados.
- [CI da pull request — execução 33883583206](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33883583206): qualidade, banco e navegador aprovados.
- [Preview EV2.12 — execução 33883583340](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33883583340): checks, build, manifest e upload do artefato aprovados.

O preview não fez deploy remoto porque as credenciais Cloudflare e Supabase de staging ainda não
estão configuradas no GitHub. O workflow encerrou com sucesso e manteve o comportamento seguro:
nenhum fallback para produção e nenhuma publicação implícita.

## Evidência negativa de produção

- nenhum workflow de produção foi executado;
- nenhum domínio ou dado real foi utilizado;
- o ambiente GitHub `production` ainda não existe;
- a branch `main` ainda não possui as proteções exigidas;
- o backend Supabase exclusivo de produção ainda não está configurado;
- a aprovação jurídica/DPO EV2-D04 permanece pendente.

## Conclusão

O SHA `8250db0ddb221306a2621aa9c6004f45823ec532` está tecnicamente qualificado para receber uma
autorização específica de canary G12 em staging. O gate G12 e produção permanecem não aprovados.
