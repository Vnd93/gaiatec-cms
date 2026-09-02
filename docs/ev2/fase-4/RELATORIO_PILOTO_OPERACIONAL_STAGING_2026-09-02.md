# Relatório do piloto operacional G4 em staging — 2 de setembro de 2026

**Resultado:** aprovado para encerramento técnico da EV2.4 e abertura da EV2.5
**Alvo:** `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`, `us-east-2`)
**Produção:** não acessada nem alterada
**Publicação/dual-write:** não executados
**Operação/revisão:** OP-01 / REV-01

## Autorização e fonte

O solicitante autorizou o piloto controlado com os 20 produtos do lote EV2, confirmou sua participação como OP-01 e indicou REV-01 como responsável técnico. A hierarquia de autoridade aplicada foi:

- MPN: fabricante;
- GTIN: GS1 ou ERP;
- NCM: ERP/fiscal;
- SKU: gerado exclusivamente pelo CMS.

A fonte lida foi `Portfolio_Mestre_GAIATEC_SISTEMAS.xlsx`, aba `PORTFÓLIO COMPLETO`, com 1.395 registros. O arquivo de 17.831.872 bytes foi validado antes de qualquer escrita pelo SHA-256 `8f90e3826c33b41c98acbf6a8dafa36be6d37c89d5062dec5734a71510444aa5` e pela modificação UTC `2026-08-27T18:33:31Z`.

## Preparação e correção preventiva

O inventário remoto confirmou zero produto, modelo, SKU, entidade mestre ou compatibilidade PIM antes da carga. As flags `ev2.pim_v2` e `ev2.master_data` estavam e permaneceram globalmente desligadas.

A análise encontrou uma inferência indevida no adapter v1: na ausência de marca, o fabricante era copiado para o campo de marca. A implementação local e a função `cms-pim` foram corrigidas para projetar `Marca não informada`, mantendo os conceitos separados. A função corrigida foi publicada somente no staging após 113 testes unitários, 12 testes EV2.4, lint, typecheck e `deno check` aprovados.

## Dry-run

O dry-run validou sem mutação:

| Controle                                  |    Resultado |
| ----------------------------------------- | -----------: |
| Produtos no manifesto                     |           20 |
| Modelos planejados                        |           20 |
| SKUs elegíveis                            |           18 |
| Faixas documentais                        |            2 |
| Campos críticos de identidade preenchidos | 97/100 (97%) |
| Itens com conflito de fonte               |            2 |
| Publicações planejadas                    |            0 |
| Mutações de produção planejadas           |            0 |

O indicador de 97% usa cinco campos de identidade por produto: ID mestre, nome, modelo, fabricante e categoria. Os três campos ausentes são os fabricantes de `GAI-0691`, `GAI-0696` e `GAI-1130`. Campos condicionais sem fonte autoritativa, como MPN, GTIN e NCM, não foram preenchidos nem contados como completos.

## Carga aplicada

A execução criou em staging:

| Escopo                   | Criados | Estado final                       |
| ------------------------ | ------: | ---------------------------------- |
| Entidades mestres        |      45 | ativas, fonte `import`             |
| Compatibilidades         |      37 | ativas e auditadas                 |
| Produtos                 |      20 | rascunho                           |
| Modelos principais       |      20 | ativos no grafo privado            |
| SKUs                     |      18 | gerados pelo CMS                   |
| Identificadores externos |      20 | tipo `other`, ID mestre preservado |
| Proveniências            |      20 | SHA-256 da planilha e linha-fonte  |
| Valores de faixa         |       2 | não homologados                    |

Não foi importado MPN, GTIN ou NCM. O ID `GAI-xxxx` foi preservado como identificador do portfólio, não como ERP nem como SKU. Todos os produtos permaneceram sem `contentItemId`, portanto os quatro conteúdos v1 existentes não foram alterados.

## Reconciliação e idempotência

- 20/20 grafos foram lidos novamente pela API e reconciliados.
- O adapter v1 apresentou zero divergência nos campos críticos suportados: nome, fabricante, marca explícita/ausente, modelo, ausência de MPN e SKU.
- A taxonomia editorial v1 continua sendo a fonte de apresentação; segmento, subcategoria e família permanecem preservados no manifesto para as fases de busca/qualidade, sem dual-write prematuro.
- A consulta de `0,1–0,3 g/L` foi convertida para `100–300 mg/L` e retornou somente `GAI-0007`, comprovando conversão e interseção.
- As duas faixas continuam `homologated=false`; elas não podem alimentar facetas públicas antes da revisão REV-01.
- A segunda execução reutilizou 45/45 entidades, 37/37 compatibilidades, 20/20 produtos e 18/18 SKUs, criando zero registro adicional.

## Bloqueios preservados

| Produto    | Estado           | Restrição                                                                      |
| ---------- | ---------------- | ------------------------------------------------------------------------------ |
| `GAI-0691` | `source_blocked` | fabricante desconhecido e inversão Compacto/Remoto na fonte; sem SKU           |
| `GAI-0696` | `source_blocked` | fabricante desconhecido e inversão Compacto/Remoto na fonte; sem SKU           |
| `GAI-1130` | `incomplete`     | fabricante original não identificado; SKU permitido, publicação não autorizada |

Os demais itens são `review_ready`, não `published`. Nenhum dado técnico do piloto foi declarado homologado.

## Encerramento e rollback lógico

O operador técnico não humano foi criado com marcação `synthetic=false` e finalidade exclusiva do piloto, sem representar ou impersonar a conta pessoal de OP-01/REV-01. Ao fim:

- perfil `suspended` e sessão invalidada;
- usuário de autenticação banido;
- zero papel ativo;
- zero override individual habilitado;
- flags globais desligadas e sem kill switch;
- 20 rascunhos e seus eventos preservados para auditoria;
- 4 produtos v1 preservados e zero vínculo v1/v2.

O rollback lógico foi repetido e aprovado. Ele torna a EV2.4 inerte sem apagar identidades, eventos, proveniência ou reutilizar SKUs.

## Evidências finais de entrega

- commit funcional: `25a17de38b14727e704bd8fc732b40928bd0b1a1`;
- [CI do push `33690367157`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33690367157): aprovada;
- [CI do pull request `33690371278`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33690371278): aprovada;
- [Preview do pull request `33690371305`](https://github.com/pedronishida/website_gaiatecsistemas/actions/runs/33690371305): aprovado;
- manifesto do build candidato: `ff354559eb1729861301639f2aa1cc5f10eba6d0e7291020679e52a39ef1f929`;
- deployment imutável: `https://53a0a000.gaiatec-cms-staging.pages.dev`;
- alias isolado: `https://ev2-g4-canary.gaiatec-cms-staging.pages.dev`;
- smoke HTTP aprovado nas duas URLs, com `200` nas rotas válidas, `404` nas inexistentes e `noindex` em todas as respostas.

O build foi compilado com `VITE_EV2_PIM_CANDIDATE=true` e as candidatas anteriores desligadas. O deploy foi direcionado somente ao branch `ev2-g4-canary` do projeto de staging; o alias estável de staging não foi promovido.

## Decisão

O Gate G4 é aprovado porque o piloto atingiu 97% de completude nos campos críticos definidos, zero divergência crítica no adapter, busca por faixa correta, idempotência sem duplicação e rollback lógico íntegro. A EV2.5 pode iniciar em branch e staging.

Permanecem bloqueados: produção, promoção do staging estável, merge em `main`, dual-write, publicação dos 20 produtos, facetas com dados não homologados e resolução automática dos três fabricantes ausentes.
