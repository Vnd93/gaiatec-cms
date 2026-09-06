# EV2.16 — controles vinculantes de prontidão para produção

**Estado em 6 de setembro de 2026:** controles técnicos e externos aprovados para o candidato
`e52b25d903251cf538918d89049a58524c3c9911`; autorização literal recebida e registro G12 formado.
O go-live ainda não foi executado.

Esta fase converte os pré-requisitos finais em verificações automáticas e evidências imutáveis. Ela
não promove staging, não acessa dados reais e não autoriza produção.

## Resultado por controle

| Controle                  | Implementado no repositório                                                                                        | Evidência externa atual                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| GitHub e mantenedor único | guard exige PR de `@Vnd93`, CODEOWNERS exclusivo, CI real, branch protegida e ausência de bypass                   | GitHub Pro ativo; `main` protegida nos dois repositórios; ambientes restritos |
| Backup Supabase Free      | workflow diário cria dump lógico, cifra AES-256 antes do upload e retém a cópia externa por 30 dias                | backup cifrado aprovado no run `34000214134`                                  |
| Restore drill             | workflow semanal/manual decripta a cópia enviada, restaura em Supabase local efêmero e compara as tabelas públicas | restore efêmero aprovado no mesmo run                                         |
| DPO/legal                 | registro G12 v2 exige identidade, instante, referência e hash exato do escopo aprovado                             | aprovado; Marcelo Diaz e canal público confirmados                            |
| E-mail real               | Resend definido; domínio, remetente, destinatário corporativo e entrega sintética são verificados                  | entrega sintética comprovada para o candidato final                           |
| CSP                       | origens auditadas; staging comum em Report-Only e canary/preview/produto em enforcement                            | candidato final aprovado sem violação crítica                                 |
| Operação                  | `@Vnd93` assume quatro responsabilidades; guard exige risco solo e evidência individual                            | modelo, risco, evidências e janela aceitos                                    |
| Autorização final         | workflow e registro exigem `AUTORIZO-G12-PRODUCAO:<SHA completo>`                                                  | literal exato recebido e registro verificado                                  |

## Artefatos

- [Proteção GitHub no modelo solo](GITHUB_PROTECAO_E_REVISORES.md)
- [Backup e restore](BACKUP_EXTERNO_E_RESTORE_DRILL.md)
- [Provedor de e-mail](PROVEDOR_EMAIL_PRODUCAO.md)
- [Análise CSP](ANALISE_CSP.md)
- [Responsáveis, DPO/legal e autorização](RESPONSAVEIS_E_APROVACOES.md)
- [Escopo DPO/legal padrão](ESCOPO_DPO_LEGAL_PADRAO.md)
- [Declaração de governança, DPO e risco](REGISTRO_DECLARACAO_GOVERNANCA_DPO_RISCO_2026-09-05.md)
- [Evidências verificadas](EVIDENCIAS_CONTROLES_2026-09-05.md)
- [Evidência HTTP aprovada do canary CSP](evidencias/G16_CSP_HTTP_7804d5b.json)
- [Evidência de navegador aprovada do canary CSP](evidencias/G16_CSP_BROWSER_7804d5b.json)
- [Primeira janela HTTP preservada em pausa](evidencias/G16_CSP_HTTP_7804d5b_ATTEMPT1_PAUSE.json)

O registro final deve ser criado a partir de
`docs/ev2/fase-12/G12_APPROVAL.template.json`, salvo como
`docs/ev2/fase-12/approvals/G12_<sha-completo>.json` e revisado em PR. Campos pendentes ou
placeholders são recusados automaticamente.
