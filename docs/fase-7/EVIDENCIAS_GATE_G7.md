# Gate G7 — decisão formal

**Data:** 2026-08-29
**Decisão:** BLOQUEADO PARA APROVAÇÃO REMOTA

| Critério                                                | Evidência local                                                  | Decisão atual                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------- |
| campanha → formulário → lead → atribuição → atendimento | contratos, UI, migration, APIs e outbox implementados/testáveis  | bloqueia até round-trip autenticado em staging            |
| blog e páginas publicam/agendam/restauram               | workflow, consumidores, filtro clean-room e testes implementados | bloqueia até migration e funções aplicadas                |
| contato consistente no site inteiro                     | fonte global F6 conectada aos consumidores                       | bloqueia até recadastro novo e publicação do proprietário |
| permissões e exportações testadas                       | RBAC, funções e auditoria cobertos estruturalmente               | bloqueia até teste por perfis/AAL reais                   |
| nenhum encaminhamento anterior ativo                    | nenhuma importação ou configuração antiga criada por F7          | confirmar em staging após migration                       |

## Motivo

A implementação local não substitui evidência de RLS, Auth, transações, outbox e consumidores integrados no Supabase staging. O Gate G6 também continua formalmente bloqueado. A autorização excepcional permitiu executar esta fase localmente, não aprovar os gates.

## Condição de reavaliação

Executar o runbook G6 e depois o runbook G7, anexar IDs/correlation IDs, resultados por perfil e evidências visuais autenticadas. Não avançar ao Gate G8 enquanto G6 e G7 não forem aprovados formalmente.

As verificações locais de UX/UI, axe e E2E foram aprovadas (24 testes aprovados, 4 skips condicionais e nenhuma falha), mas não alteram a decisão formal acima.
