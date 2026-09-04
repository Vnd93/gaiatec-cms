# Relatório do canary G13 em staging — 4 de setembro de 2026

**Decisão:** G13 APROVADO<br>
**Candidato:** `518e8e5df605264013d94a16998d00168d4d03c7`<br>
**Branch:** `ev2/fase-13-hardening-pre-producao`<br>
**Produção:** bloqueada e sem mutações

## Escopo executado

- Supabase `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`, `us-east-2`);
- migration aditiva `0053_ev2_runtime_eligibility.sql`;
- `cms-session` v14 com JWT obrigatório e `cms-public` v34 com a configuração pública vigente;
- Cloudflare Pages `gaiatec-cms-staging`, alias isolado `ev2-g13-canary`;
- deployment imutável `6e05f8d6.gaiatec-cms-staging.pages.dev`;
- dois usuários sintéticos com MFA/AAL2 e overrides individuais de até 30 minutos;
- nenhum dado real, domínio real, provedor externo, rollout amplo ou promoção do staging estável.

As versões anteriores registradas para rollback eram `cms-session` v13 e `cms-public` v33. Nenhum
rollback foi necessário.

## Evidência técnica

| Verificação                 | Resultado                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Rehearsal `0053`            | passou com rollback; individual curto elegível, amplo paralelo e TTL excessivo bloqueados   |
| Migration remota            | `0053` aplicada; histórico local/remoto alinhado até `0053`                                 |
| pgTAP                       | 16 testes aprovados no job `database` do CI                                                 |
| CI do SHA final             | `quality`, `database` e `browser` aprovados em 3 min 55 s                                   |
| Unidade/contrato/componente | 48 arquivos e 157 testes aprovados                                                          |
| Dependências                | `npm audit --audit-level=high`: zero vulnerabilidade                                        |
| Artefato do CI              | `sha256:38b2db246a1bde0e44ef7ad62247702adfcc9498488bdac2b6c1c44dfbf5bb40`                   |
| Smoke HTTP                  | seis rotas esperadas aprovadas, inclusive 404 real e `noindex`                              |
| Contrato de release         | SHA exato em `X-Release`, `/healthz` e `release-manifest.json`; conteúdo JSON válido        |
| Probe HTTP                  | 22/22 respostas, 100% disponibilidade, 0% HTTP 5xx, p95 global 915,305 ms                   |
| Acessibilidade              | cinco verificações aprovadas; zero violação serious/critical; um caso desktop não aplicável |
| Manifesto runtime           | 13 capacidades, ambiente/site/schema exatos e status `ready`                                |
| Isolamento                  | operador recebeu somente `ev2.dam`; revisor somente `ev2.ai_assist`                         |
| Negativos                   | sessão anônima 401, busca v2 anônima 404, busca v1 200 e manifesto de produção `gated`      |
| Revogação                   | `ev2.dam` ficou inelegível em 1.227 ms, abaixo do limite de 60 s                            |
| Encerramento                | 0 ator ativo, 0 credencial ativa, 0 override ativo e 0 payload pessoal                      |
| Tombstones                  | dois perfis sintéticos suspensos/bloqueados, contabilizados separadamente para auditoria    |

O primeiro ciclo de acessibilidade chegou à última rota logo após o timeout genérico de 30 segundos.
O teste foi corrigido para um orçamento explícito de 60 segundos para seis varreduras Axe completas;
no SHA final, desktop e mobile terminaram em aproximadamente 22,5 segundos sem violação grave.

## Latência por rota

| Rota           | Amostras | Disponibilidade | p50 (ms) | p95 (ms) |
| -------------- | -------: | --------------: | -------: | -------: |
| `/`            |        5 |            100% |  553,329 |  575,430 |
| `/produtos`    |        5 |            100% |  890,969 |  945,737 |
| `/contato`     |        5 |            100% |  533,276 |  870,002 |
| `/admin/login` |        5 |            100% |   36,573 |   37,412 |

Todas as rotas ficaram abaixo do budget vinculante de 1.500 ms.

## Rastreabilidade

- CI: [run 33924530169](https://github.com/Vnd93/gaiatec-cms/actions/runs/33924530169);
- candidato: [alias G13](https://ev2-g13-canary.gaiatec-cms-staging.pages.dev);
- probe HTTP: [`G13_HTTP_PROBE_518e8e5.json`](evidencias/G13_HTTP_PROBE_518e8e5.json), SHA-256
  `981d5d3974ae4767f148d8d2d57ec42b8fd21dcf4ae3e44ce06d81c18edba486`;
- canary runtime: [`G13_CANARY_518e8e5.json`](evidencias/G13_CANARY_518e8e5.json), SHA-256
  `96dbcea51434e862d3f0e792c3cce2395cbe273e2092efe9b2f6271d863a6eaa`;
- run id do canary: `60b43d44-22fd-438a-abee-b5af597e40b9`;
- hash interno da evidência: `24ad3be65c81141842006b6a5e80322624c404913f7d55bdedc2755807fc81e0`.

## Decisão e limites

O G13 está aprovado para a fronteira de elegibilidade runtime em staging. A aprovação confirma o
hardening e encerra esta fase técnica, mas não promove o alias, não ativa flags de forma ampla e não
autoriza produção. O Gate G12 deve ser requalificado com evidência vinculada ao novo verificador,
owners segregados e autorização produtiva expressa antes de qualquer mudança de produção.
