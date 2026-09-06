# Evidências da implantação produtiva G12 — 6 de setembro de 2026

**Resultado:** aprovado e concluído  
**Candidato imutável:** `e52b25d903251cf538918d89049a58524c3c9911`  
**Controle em `main`:** `aee6d8d55bd1bb4abc8e9495811affd2e36490e9`  
**Workflow:** `Deploy production` run `34039654304`, job `101503974615`  
**Operador:** `@Vnd93`

## Resultado do fluxo protegido

O workflow encerrou com estado `Success` em 7 minutos e 40 segundos. Antes da promoção, reconfirmou
a identidade do candidato, proteções GitHub, aprovação G12, configuração isolada, suíte integral,
manifesto, preview técnico, baseline de rollback, banco, funções, Auth, Vault, RLS, cron, conteúdo e
formulários governados. O preview completo e o probe após a promoção passaram. O rollback automático
não foi acionado.

O job registrou 51 de 51 arquivos Vitest e 168 de 168 testes aprovados. As duas anotações do runner
foram avisos não bloqueantes: compatibilidade futura do runtime Node de uma action fixa e redução da
retenção do artefato ao máximo de 30 dias configurado no repositório.

## Artefato de auditoria

- nome: `production-release-e52b25d903251cf538918d89049a58524c3c9911`;
- artifact ID: `9991381373`;
- tamanho: 69,7 KB;
- digest: `sha256:c2215d32baddc38e5727a41bbbbe921b9b7e84813043f5d8f1f086ee865586db`;
- retenção efetiva: 30 dias.

O artefato reúne manifesto e relatórios do preflight técnico, backend, conteúdo, formulários, funções
e probe produtivo. Ele não contém secrets.

## Verificação independente após o workflow

As rotas reais foram abertas no Microsoft Edge depois do estado `Success`:

| Rota                     | Resultado observado                                                          |
| ------------------------ | ---------------------------------------------------------------------------- |
| `/`                      | página institucional publicada pelo CMS e carregada integralmente            |
| `/produtos`              | catálogo técnico, busca e filtros renderizados                               |
| `/contato`               | conteúdo, canais oficiais, consentimento e formulário governado renderizados |
| `/admin/login`           | login privado do CMS disponível                                              |
| `/healthz`               | `ready`, ambiente `production` e release exata                               |
| `/release-manifest.json` | manifesto íntegro com a release exata                                        |

`/healthz` respondeu com a release
`e52b25d903251cf538918d89049a58524c3c9911`. O domínio produtivo está, portanto, vinculado ao mesmo
artefato aprovado no G12. Nenhuma funcionalidade candidata EV2 foi ativada globalmente por esse
go-live; a elegibilidade continua sendo decidida em runtime e falha fechada.
