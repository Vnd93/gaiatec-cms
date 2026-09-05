# EV2.16 — controles vinculantes de prontidão para produção

**Estado em 5 de setembro de 2026:** implementação técnica concluída no branch de trabalho;
controles externos e aprovações humanas ainda não satisfeitos; G12 e produção continuam bloqueados.

Esta fase converte os pré-requisitos finais em verificações automáticas e evidências imutáveis. Ela
não promove staging, não acessa dados reais e não autoriza produção.

## Resultado por controle

| Controle                  | Implementado no repositório                                                                                        | Evidência externa atual                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| GitHub e mantenedor único | guard exige PR de `@Vnd93`, CODEOWNERS exclusivo, CI real, branch protegida e ausência de bypass                   | política solo implementada; proteção bloqueada apenas pelo plano Free |
| Backup Supabase Free      | workflow diário cria dump lógico, cifra AES-256 antes do upload e retém a cópia externa por 90 dias                | primeira execução real pendente de ambiente e secrets protegidos      |
| Restore drill             | workflow semanal/manual decripta a cópia enviada, restaura em Supabase local efêmero e compara as tabelas públicas | primeiro drill produtivo pendente                                     |
| DPO/legal                 | registro G12 v2 exige identidade, instante, referência e hash exato do escopo aprovado                             | autoridade e escopo declarados; confirmação cadastral do DPO pendente |
| E-mail real               | Resend definido; domínio, remetente, destinatário corporativo e entrega sintética são verificados                  | credencial de produção e execução pendentes                           |
| CSP                       | origens auditadas; staging comum em Report-Only e canary/preview/produto em enforcement                            | canary isolado do SHA `7804d5b4…` passou; preview produtivo pendente  |
| Operação                  | `@Vnd93` assume quatro responsabilidades; guard exige risco solo e evidência individual                            | modelo e risco aceitos; execução da janela pendente                   |
| Autorização final         | workflow e registro exigem `AUTORIZO-G12-PRODUCAO:<SHA completo>`                                                  | intenção aceita; literal com SHA final ainda pendente                 |

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
