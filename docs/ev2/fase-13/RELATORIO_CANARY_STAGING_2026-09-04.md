# Relatório do canary G13 em staging — 4 de setembro de 2026

**Decisão:** G13 APROVADO<br>
**Candidato:** `a1b170eca828393c510b7d606a7095683f1aa342`<br>
**Branch:** `ev2/fase-13-hardening-pre-producao`<br>
**Produção:** bloqueada e sem mutações

## Escopo executado

- Supabase `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`, `us-east-2`);
- migration aditiva `0053_ev2_runtime_eligibility.sql`;
- `cms-session` v16 com JWT obrigatório e `cms-public` v36 com a configuração pública vigente;
- Cloudflare Pages `gaiatec-cms-staging`, alias isolado `ev2-g13-canary`;
- deployment imutável `25ec3d59.gaiatec-cms-staging.pages.dev`
  (`25ec3d59-5eb5-4fa7-94aa-2c2073165efd`);
- dois usuários sintéticos com MFA/AAL2 e overrides individuais de até 30 minutos;
- nenhum dado real, domínio real, provedor externo, rollout amplo ou promoção do staging estável.

Nenhuma função foi republicada e nenhuma migration adicional foi aplicada neste ciclo de correção.
O token técnico aleatório da busca v2 existiu apenas durante o canary e foi removido do staging ao
final. Nenhum rollback foi necessário.

## Evidência técnica

| Verificação                 | Resultado                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| Rehearsal `0053`            | passou com rollback; individual curto elegível, amplo paralelo e TTL excessivo bloqueados   |
| Migration remota            | `0053` aplicada; histórico local/remoto alinhado até `0053`                                 |
| pgTAP                       | 16 testes aprovados no job `database` do CI                                                 |
| CI do SHA final             | 7/7 checks verdes em push, pull request e preview                                           |
| Unidade/contrato/componente | 48 arquivos e 157 testes aprovados                                                          |
| Dependências                | `npm audit --audit-level=high`: zero vulnerabilidade                                        |
| Artefato candidato          | 1.450 arquivos; `sha256:1bfd7092afc5ca01b813a6d8c29220e5f84921e40a6b7e29f36df4d8aafcf937`   |
| Smoke HTTP                  | seis rotas esperadas aprovadas, inclusive 404 real e `noindex`                              |
| Contrato de release         | SHA exato em `X-Release`, `/healthz` e `release-manifest.json`; conteúdo JSON válido        |
| Probe HTTP                  | 22/22 respostas, 100% disponibilidade, 0% HTTP 5xx, p95 global 921,374 ms                   |
| Acessibilidade              | cinco verificações aprovadas; zero violação serious/critical; um caso desktop não aplicável |
| Manifesto runtime           | 13 capacidades, ambiente/site/schema exatos e status `ready`                                |
| Isolamento                  | operador recebeu somente `ev2.dam`; revisor somente `ev2.ai_assist`                         |
| Busca pública               | anônima v2 404; autorizada v2 200/`engine=v2`; v1 200, todas com resultado sintético vazio  |
| Negativos                   | sessão anônima 401 e manifesto de produção `gated`; nenhuma capacidade ampla                |
| Revogação                   | `ev2.dam` ficou inelegível em 1.240 ms, abaixo do limite de 60 s                            |
| Encerramento                | 0 ator, credencial, override, evento sintético e payload pessoal ativos                     |
| Tombstones                  | quatro perfis sintéticos suspensos/bloqueados, separados do resíduo ativo                   |

No SHA final, cinco verificações de acessibilidade passaram e o único caso desktop não aplicável foi
ignorado conforme o próprio cenário mobile. As duas varreduras Axe completas terminaram sem violação
`serious` ou `critical`.

## Latência por rota

| Rota           | Amostras | Disponibilidade | p50 (ms) | p95 (ms) |
| -------------- | -------: | --------------: | -------: | -------: |
| `/`            |        5 |            100% |  536,952 |  567,065 |
| `/produtos`    |        5 |            100% |  851,107 | 1287,198 |
| `/contato`     |        5 |            100% |  569,551 |  751,173 |
| `/admin/login` |        5 |            100% |   37,273 |   41,527 |

Todas as rotas ficaram abaixo do budget vinculante de 1.500 ms.

## Rastreabilidade

- CI push: [run 33932883225](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932883225);
- CI pull request: [run 33932885639](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932885639);
- preview: [run 33932885644](https://github.com/Vnd93/gaiatec-cms/actions/runs/33932885644);
- candidato: [alias G13](https://ev2-g13-canary.gaiatec-cms-staging.pages.dev);
- deployment: [25ec3d59](https://25ec3d59.gaiatec-cms-staging.pages.dev);
- probe HTTP: [`G13_HTTP_PROBE_a1b170e.json`](evidencias/G13_HTTP_PROBE_a1b170e.json), SHA-256
  `87409005c571a1fee54bffff21e645a89bab0fe245135e3a3fb1bd7dca2ac9d3`;
- canary runtime: [`G13_CANARY_a1b170e.json`](evidencias/G13_CANARY_a1b170e.json), SHA-256
  `543622b1b65fe657b663bdbd75dd3170aaaf57877938a876bca5841383963941`;
- run id do canary: `52f33bd2-2841-4c68-9636-c88adf957604`;
- hash interno da evidência: `483811e4820fe32970630eecf2897f35811b2539e5d2332773bec2fe0817f197`.

Os arquivos `518e8e5` permanecem como histórico pré-correção e não são vinculantes para a decisão
atual.

## Decisão e limites

O G13 está aprovado para a fronteira de elegibilidade runtime em staging. A aprovação confirma o
hardening e encerra esta fase técnica, mas não promove o alias, não ativa flags de forma ampla e não
autoriza produção. O Gate G12 deve ser requalificado com evidência vinculada ao novo verificador,
responsabilidades operacionais registradas conforme a governança vigente e autorização produtiva
expressa antes de qualquer mudança de produção.
