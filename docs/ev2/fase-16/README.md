# EV2.16 — controles vinculantes de prontidão para produção

**Estado em 5 de setembro de 2026:** implementação técnica concluída no branch de trabalho;
controles externos e aprovações humanas ainda não satisfeitos; G12 e produção continuam bloqueados.

Esta fase converte os pré-requisitos finais em verificações automáticas e evidências imutáveis. Ela
não promove staging, não acessa dados reais e não autoriza produção.

## Resultado por controle

| Controle                      | Implementado no repositório                                                                                        | Evidência externa atual                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| GitHub e revisão independente | guard exige `main` protegida, dois approvals reais, CODEOWNERS, CI estrita e ausência de bypass                    | bloqueado pelo plano Free e pela falta de dois usernames independentes   |
| Backup Supabase Free          | workflow diário cria dump lógico, cifra AES-256 antes do upload e retém a cópia externa por 90 dias                | primeira execução real pendente de ambiente e secrets protegidos         |
| Restore drill                 | workflow semanal/manual decripta a cópia enviada, restaura em Supabase local efêmero e compara as tabelas públicas | primeiro drill produtivo pendente                                        |
| DPO/legal                     | registro G12 v2 exige identidade, instante, referência e hash exato do escopo aprovado                             | aprovação humana não declarada                                           |
| E-mail real                   | Resend definido; domínio, remetente, destinatário corporativo e entrega sintética são verificados                  | credencial de produção e execução pendentes                              |
| CSP                           | origens auditadas; staging em Report-Only e preview/produto em enforcement                                         | teste automatizado local passou; validação no preview produtivo pendente |
| Operação                      | registro G12 v2 exige quatro responsáveis distintos e evidência individual                                         | identidades reais pendentes                                              |
| Autorização final             | workflow e registro exigem `AUTORIZO-G12-PRODUCAO:<SHA completo>`                                                  | ausente por desenho                                                      |

## Artefatos

- [Proteção GitHub](GITHUB_PROTECAO_E_REVISORES.md)
- [Backup e restore](BACKUP_EXTERNO_E_RESTORE_DRILL.md)
- [Provedor de e-mail](PROVEDOR_EMAIL_PRODUCAO.md)
- [Análise CSP](ANALISE_CSP.md)
- [Responsáveis, DPO/legal e autorização](RESPONSAVEIS_E_APROVACOES.md)
- [Evidências verificadas](EVIDENCIAS_CONTROLES_2026-09-05.md)

O registro final deve ser criado a partir de
`docs/ev2/fase-12/G12_APPROVAL.template.json`, salvo como
`docs/ev2/fase-12/approvals/G12_<sha-completo>.json` e revisado em PR. Campos pendentes ou
placeholders são recusados automaticamente.
