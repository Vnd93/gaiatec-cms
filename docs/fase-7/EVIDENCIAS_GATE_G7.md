# Gate G7 — decisão formal

**Data:** 2026-08-29
**Decisão:** BLOQUEADO PARA APROVAÇÃO REMOTA

| Critério                                                | Evidência local                                                   | Decisão atual                                             |
| ------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------- |
| campanha → formulário → lead → atribuição → atendimento | contratos, UI, migrations, APIs e outbox ativos em staging        | bloqueia até round-trip autenticado em staging            |
| blog e páginas publicam/agendam/restauram               | workflow, consumidores, migration e funções publicados            | bloqueia até executar o roteiro editorial próprio da F7   |
| contato consistente no site inteiro                     | fonte global F6 conectada aos consumidores                        | bloqueia até recadastro novo e publicação do proprietário |
| permissões e exportações testadas                       | RBAC `cms:leads.*`, funções e auditoria ativos; schema lint verde | bloqueia até teste por perfis/AAL reais                   |
| nenhum encaminhamento anterior ativo                    | nenhuma importação ou configuração antiga criada por F7           | atende na implantação; repetir no round-trip              |

## Motivo

A implementação está publicada no Supabase e Cloudflare staging, mas ainda não substitui a evidência funcional do fluxo completo de marketing/leads. O Gate G6 foi aprovado separadamente após seu round-trip remoto.

## Condição de reavaliação

Executar o runbook G7, anexar IDs/correlation IDs, resultados por perfil e evidências visuais autenticadas. O trabalho técnico de hardening da Fase 8 pode continuar, mas go-live permanece bloqueado até G7 e G8.

As verificações locais de UX/UI, axe e E2E foram aprovadas (24 testes aprovados, 4 skips condicionais e nenhuma falha), mas não alteram a decisão formal acima.
