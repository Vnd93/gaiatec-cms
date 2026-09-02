# Documentação técnica do Website GAIATEC

Este diretório concentra especificações, decisões arquiteturais, evidências de execução e runbooks do CMS e do site público.

## Ponto de entrada atual

- [Evolução EV2 do CMS](ev2/README.md) — especificação funcional/técnica, decisões pendentes e gate de prontidão para o novo ciclo de desenvolvimento.
- [Auditoria do CMS de 2026-09-01](auditoria-cms-2026-09-01/RELATORIO.md) — diagnóstico e validação do estado imediatamente anterior à EV2.

## Estrutura

| Caminho                     | Finalidade                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `ev2/`                      | Fonte canônica do novo ciclo EV2.0–EV2.12.                       |
| `adr/`                      | Decisões arquiteturais permanentes e suas consequências.         |
| `fase-0/` a `fase-11/`      | Histórico e evidências do ciclo anterior já executado.           |
| `auditoria-cms-2026-09-01/` | Relatório e matriz da auditoria de fechamento do ciclo anterior. |
| `api/`                      | Convenções e referências de APIs.                                |
| `database/`                 | Convenções e referências do banco de dados.                      |
| `operations/`               | Procedimentos operacionais e runbooks.                           |
| `validacao-local/`          | Evidências da validação local mais recente.                      |

> As fases existentes em `fase-0/` a `fase-11/` não devem ser reutilizadas para os artefatos EV2. A nova trilha usa o namespace `docs/ev2/` para evitar colisão de contexto e numeração.

## Convenções

- Markdown é o formato canônico para documentação versionada no Git.
- Uma decisão arquitetural permanente deve ser registrada em `docs/adr/` antes de orientar implementação.
- Evidências de gate devem informar data, ambiente, comando/cenário executado, resultado e ressalvas.
- Senhas, tokens, chaves, dados pessoais e conteúdo de `.env*` não devem aparecer na documentação.
- Alterações de produção, migrations remotas e deploys exigem autorização e gate próprios; documentos de planejamento não os autorizam.
