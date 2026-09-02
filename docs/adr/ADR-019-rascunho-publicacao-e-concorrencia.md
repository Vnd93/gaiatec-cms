# ADR-019 — DraftSchema, PublishSchema, autosave e concorrência

**Status:** aprovada para EV2<br>
**Data:** 1 de setembro de 2026

## Contexto

O operador precisa começar vazio e salvar progresso sem satisfazer requisitos de publicação. Usar um contrato completo para rascunho causa perda, bloqueios prematuros e workarounds.

## Decisão

- `DraftSchema` aceita identidade mínima e estados incompletos; `ReviewSchema` aumenta exigência; `PublishSchema` exige conteúdo público completo e quality gates.
- Autosave aplica patch por campo após debounce de 1,5–3 s, retorna recibo e nunca altera workflow/publica.
- Gravação envia `expectedVersion`; divergência retorna 409 com versões/diff, nunca last-write-wins silencioso.
- Recuperação local é namespaced por usuário, entidade, ambiente e versão de schema; armazena apenas conteúdo classificado como não sensível.
- Rascunho é privado, não indexável e ausente de projeção/API/sitemap público.
- Migrações de schema de rascunho são versionadas, toleram leitura anterior e oferecem fallback/exportação.
- Submeter, aprovar, agendar e publicar são comandos separados com validação e autorização próprias.

## Consequências

Mensagens devem distinguir salvo localmente, sincronizando, salvo no servidor, conflito e erro. O G2 exige offline, recuperação, dois editores concorrentes, acessibilidade e prova de ausência pública.

## Rollback

Desligar `ev2.draft_v2` restaura editor/contrato v1. Rascunhos v2 continuam exportáveis/recuperáveis e não são apagados automaticamente.
