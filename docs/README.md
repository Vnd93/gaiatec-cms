# Documentação técnica do Website GAIATEC

Este diretório mantém o espelho técnico vinculado ao código, necessário para testes, contratos e
runbooks executáveis do CMS e do site público. A fonte oficial e atualizada da documentação é o
repositório
[`Vnd93/gaiatec-documentacao`](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs).

## Ponto de entrada atual

- [Documentação EV2 canônica](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs/ev2) —
  estado vigente, decisões e evidências aprovadas.
- [Espelho local da evolução EV2](ev2/README.md) — artefatos próximos do código usados pelos checks
  e runbooks; seu estado de gate pode representar o SHA em que foi sincronizado.
- [Auditoria do CMS de 2026-09-01](auditoria-cms-2026-09-01/RELATORIO.md) — diagnóstico e validação do estado imediatamente anterior à EV2.

## Estrutura

| Caminho                     | Finalidade                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| `ev2/`                      | Espelho operacional versionado do ciclo EV2.                     |
| `adr/`                      | Decisões arquiteturais permanentes e suas consequências.         |
| `fase-0/` a `fase-11/`      | Histórico e evidências do ciclo anterior já executado.           |
| `auditoria-cms-2026-09-01/` | Relatório e matriz da auditoria de fechamento do ciclo anterior. |
| `api/`                      | Convenções e referências de APIs.                                |
| `database/`                 | Convenções e referências do banco de dados.                      |
| `operations/`               | Procedimentos operacionais e runbooks.                           |
| `validacao-local/`          | Evidências da validação local mais recente.                      |

> As fases existentes em `fase-0/` a `fase-11/` não devem ser reutilizadas para os artefatos EV2. A nova trilha usa o namespace `docs/ev2/` para evitar colisão de contexto e numeração.

## Convenções

- Markdown no repositório documental oficial é o formato canônico; este diretório é um espelho
  operacional controlado por PR.
- Uma decisão arquitetural permanente deve ser registrada em `docs/adr/` antes de orientar implementação.
- Evidências de gate devem informar data, ambiente, comando/cenário executado, resultado e ressalvas.
- Senhas, tokens, chaves, dados pessoais e conteúdo de `.env*` não devem aparecer na documentação.
- Alterações de produção, migrations remotas e deploys exigem autorização e gate próprios; documentos de planejamento não os autorizam.
