# Evidências do canary G12 em staging — 4 de setembro de 2026

**Resultado do canary:** PASS<br>
**Decisão do gate G12:** NÃO APROVADO para produção<br>
**Produção e staging estável:** não alterados

## Identidade e fronteira

| Campo              | Valor                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------- |
| SHA autorizado     | `8250db0ddb221306a2621aa9c6004f45823ec532`                                            |
| Projeto Cloudflare | `gaiatec-cms-staging`                                                                 |
| Deployment         | `d973f917-ab24-496c-bad9-1762d10d1718` (`Preview`)                                    |
| URL imutável       | `https://d973f917.gaiatec-cms-staging.pages.dev`                                      |
| Alias isolado      | `https://ev2-g12-canary.gaiatec-cms-staging.pages.dev`                                |
| Backend            | Supabase staging `glcqsosxwgmlhzgcsnzv`                                               |
| Atores             | dois usuários sintéticos, MFA/AAL2 e papéis segregados                                |
| Overrides          | individuais, temporários e removidos no encerramento                                  |
| Evidência JSON     | [`G12_CANARY_8250db0_2026-09-04.json`](evidencias/G12_CANARY_8250db0_2026-09-04.json) |

O preflight confirmou o SHA completo em `/healthz`, `X-Release` e
`release-manifest.json`, ambiente `staging`, `Cache-Control: no-store` e
`X-Robots-Tag: noindex, nofollow, noarchive` nas URLs imutável e de alias.

## Primeira medição — pausa fail-closed

| Campo                      | Evidência                                               |
| -------------------------- | ------------------------------------------------------- |
| Assurance run              | `06325674-8d35-41e7-843d-e6204dc6d0ea`                  |
| Período                    | `2026-09-04T15:02:53.753Z` a `2026-09-04T15:04:43.249Z` |
| Verificações funcionais    | 22 de 22 aprovadas                                      |
| Disponibilidade            | 100%                                                    |
| Leitura administrativa p95 | 633 ms; budget de 500 ms excedido                       |
| Comando p95                | 714 ms; budget de 800 ms atendido                       |
| Restore                    | RPO 0; RTO registrado em 1 minuto                       |
| Encerramento               | resíduo sintético zero                                  |
| Decisão                    | `failed`; revisão e continuação impedidas               |

O desvio ocorreu imediatamente após a publicação e foi preservado como evidência. Como todos os
demais sinais estavam saudáveis e a limpeza foi completa, realizou-se uma única repetição no mesmo
SHA e escopo, com o runtime já aquecido. Uma nova violação teria bloqueado o candidato para correção.

## Segunda medição — aprovada

| Sinal                        |           Resultado |               Budget |
| ---------------------------- | ------------------: | -------------------: |
| Verificações integradas      |            27 de 27 |                todas |
| Disponibilidade              |                100% |             >= 99,9% |
| Leitura administrativa p95   |              389 ms |            <= 500 ms |
| Comando p95                  |              406 ms |            <= 800 ms |
| Outbox p95                   |                0 ms |         <= 60.000 ms |
| Cobertura de auditoria       |                100% |                 100% |
| Restore                      | RPO 0; RTO 1 minuto | RPO 0; RTO <= 15 min |
| Acessibilidade crítica/séria |                 0/0 |                  0/0 |
| P0/P1                        |                 0/0 |                  0/0 |

- Canary run: `77576d45-c7ab-4968-b976-2a4dfa6c735d`.
- Assurance run: `bc348fa9-9944-4eec-b537-b2c140687459`.
- Estado da assurance run: `accepted`, com revisor diferente do solicitante.
- Hash da evidência: `7cc47e51c4dd0810cf7456649a939660f8c5d852b3b08e2c0b453b9210365b27`.

## Três janelas consecutivas

| Janela                                 | Respostas | Disponibilidade | 5xx | p95 público | Resultado |
| -------------------------------------- | --------: | --------------: | --: | ----------: | --------- |
| `8a5a00ef-0626-4ab2-a86a-343966aa875d` |        22 |            100% |  0% |  922,596 ms | pass      |
| `f0412d92-a342-4151-8933-00a67b12ef36` |        22 |            100% |  0% |  961,020 ms | pass      |
| `95693ce2-3f79-40c3-be90-5051c4e2e091` |        22 |            100% |  0% |  937,731 ms | pass      |

Cada janela validou as quatro rotas públicas/administrativas, o endpoint de saúde, o manifest, o
SHA dos headers, a fronteira de indexação e os budgets HTTP.

## Pós-condições verificadas

- zero perfis sintéticos ativos;
- zero credenciais sintéticas ativas;
- zero overrides individuais ativos;
- zero leads sintéticos sem anonimização;
- zero uso de dado real;
- zero mutações em produção;
- alias estável sem promoção e com o mesmo hash de conteúdo
  `4e60c8b8668a1fe1dcd27b64046ce64216ac1dc19381b1938bddbfe6be0d6017` antes e depois;
- deployment confirmado como `Preview` no branch `ev2-g12-canary`.

## Conclusão

O canary controlado G12 do candidato foi concluído com sucesso em staging. Esta evidência não libera
produção: proteção de `main`, ambiente GitHub `production`, backend produtivo isolado, elegibilidade
frontend em runtime, EV2-D04, owners operacionais e autorização formal por SHA continuam pendentes.
