# Ameaças e controles da EV2.14

## Modelo de ameaça

| ID      | Ameaça                                    | Controle preventivo/detectivo                                | Evidência prevista            |
| ------- | ----------------------------------------- | ------------------------------------------------------------ | ----------------------------- |
| G14-T01 | IA ou usuário aponta conteúdo real        | regex `g14x-*`, tabela exclusiva e `data_class=synthetic`    | unit, eval, pgTAP, canary     |
| G14-T02 | chamada em produção                       | ambiente do contrato e da Edge Function recusam production   | static, eval, canary negativo |
| G14-T03 | exfiltração para provedor                 | constante provider-off e recusa de configuração externa      | static e capability           |
| G14-T04 | prompt injection/segredo/PII              | detecção, redação e recusa antes da RPC                      | unit e canary negativo        |
| G14-T05 | cliente contorna o gateway                | RLS, revogação de grants e RPC somente service role          | pgTAP                         |
| G14-T06 | autoaprovação                             | `created_by != approved_by` no comando bloqueado             | unit, pgTAP, canary           |
| G14-T07 | aprovador executa sua decisão             | `approved_by != executed_by`                                 | unit, pgTAP, canary           |
| G14-T08 | plano muda depois da aprovação            | hash+versão vinculados; revisão expira aprovação             | unit, eval, pgTAP             |
| G14-T09 | replay duplica mutações                   | recibo por ator/chave/comando e hash da requisição           | pgTAP e canary                |
| G14-T10 | corrida causa aplicação parcial           | locks ordenados, versão esperada e transação única           | pgTAP/canary                  |
| G14-T11 | compensação sobrescreve mudança posterior | comparação com último snapshot e conflito fail-closed        | unit, eval, pgTAP             |
| G14-T12 | rollback reduz versão e mascara mudança   | restauração com versão monotônica                            | unit, pgTAP, canary           |
| G14-T13 | ativação ampla ou ambígua                 | duas flags default-off, overrides individuais únicos ≤30 min | pgTAP; ausência no canary     |
| G14-T14 | mutação sem MFA                           | AAL2 verificado antes da resposta genérica de flag           | static, component, canary     |
| G14-T15 | rate limiter falha aberto                 | indisponibilidade do controle retorna 503                    | static e integração           |
| G14-T16 | evidência contém credencial               | relatório sanitizado; tokens/senhas nunca entram nos checks  | revisão do artefato           |
| G14-T17 | candidato altera staging estável          | preview genérico excluído; alias G14 manual e baseline       | workflow e canary             |
| G14-T18 | resposta perdida leva a comando duplicado | envelope/chave preservados, retry único e bloqueio da UI     | component e canary replay     |
| G14-T19 | aprovação expirada impede compensação     | histórico renovável e uma única aprovação ativa              | pgTAP, rehearsal e canary     |
| G14-T20 | recovery concorrente entra em deadlock    | ordem global `plan -> run -> approval -> targets`            | static e canary concorrente   |

## Fronteiras de confiança

```text
Browser autenticado
  -> contrato Zod + Origin + JWT/AAL
  -> Edge Function cms-ai-execute
  -> policy/flag/RBAC server-side
  -> RPC transacional service_role
  -> tabelas exclusivas cms_ai_execution_* e cms_ai_synthetic_targets
```

Nenhuma seta sai para provedor de IA, sistema operacional, domínio público ou tabelas editoriais.

## Riscos residuais atuais

- A migration `0054` ainda não foi compilada por PostgreSQL neste branch porque não há runtime local
  Docker/Postgres; o rehearsal remoto e o pgTAP continuam obrigatórios antes de G14.
- O primeiro incremento comprova a arquitetura sobre fixtures sintéticas. Ele não autoriza nem
  implementa acesso a conteúdo real; ferramentas reais exigirão novo threat model, contratos por
  domínio, aprovação e outro gate.
- A resistência a concorrência precisa ser confirmada no banco de staging com chamadas paralelas.
- A revisão independente de segurança e privacidade permanece necessária.

Qualquer risco residual acima mantém a decisão do G14 em `pause`.
