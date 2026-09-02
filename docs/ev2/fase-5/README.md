# EV2.5 — Mídia e documentos

**Status:** candidato local validado; Gate G5 ainda não aprovado<br>
**Escopo:** F-006 — DAM contextual e biblioteca avançada<br>
**Rollout:** aditivo, privado e fail-closed pela flag `ev2.dam`

## Entregas do candidato

- `cms-media` preserva as ações v1 e adiciona comandos v2 com envelope, escopo de ambiente, limite de taxa, autorização e idempotência de reserva, finalização e mutações de catálogo.
- Upload continua privado e valida MIME real, tamanho, dimensões, SHA-256, variantes, origem, licença, proprietário, ALT e vigência dos direitos.
- SHA-256 impede duplicação exata antes e depois do upload; dHash de 64 bits sugere similares sem excluir nem mesclar automaticamente.
- Coleções, tags, focal point e crops normalizados organizam o DAM sem alterar o arquivo original.
- Mapa de usos bloqueia arquivamento/exclusão de ativos vinculados.
- Substituição registra impacto, resolve o novo ativo sem reescrever revisões históricas, mantém compatibilidade com os validadores v1 e permite rollback explícito também pela interface.
- Direitos expirados, asset arquivado, scan não limpo ou processamento incompleto bloqueiam nova publicação e geração de URL pública.
- Finalização registra variantes, estado do ativo e auditoria na mesma transação de banco; falhas preservam a reserva para repetição segura.
- Arquivamento agenda coleta somente após 30 dias; o GC revalida vínculos em transação antes de apagar o registro, aceita seleção por job para isolamento e mantém a lista de objetos para repetição idempotente.
- O picker contextual permite localizar, reutilizar ou enviar imagem sem abandonar o editor editorial.

## Compatibilidade e contenção

- A migration `0043_ev2_dam.sql` apenas adiciona colunas, tabelas, funções, políticas e triggers.
- O upload/listagem v1 permanece disponível quando `VITE_EV2_DAM_CANDIDATE=false`.
- O candidato depende simultaneamente de `VITE_EV2_DAM_CANDIDATE=true` e de um override server-side válido para `ev2.dam`.
- A função recusa comandos v2 destinados a produção.
- Nenhuma migration, função ou flag da EV2.5 foi aplicada remotamente nesta etapa de implementação.

## Validação concluída

- Testes de contrato, unidade e componentes, typecheck e análise das Edge Functions concluídos sem erro.
- Migration `0043` executada integralmente em 2 de setembro de 2026 dentro de uma transação com `ROLLBACK`, após validar `glcqsosxwgmlhzgcsnzv / GAIATEC CMS Staging / us-east-2`.
- Reconciliação posterior confirmou ausência de `cms_dam_collections`, da coluna `rights_expires_at` e do registro de versão `0043` no staging; portanto, o ensaio não deixou alteração persistente.
- O runner `npm run canary:ev2:phase5` está preparado para MFA/AAL2, mídia gerada sinteticamente, override individual, GC isolado por job e limpeza reconciliada.

## Verificação prevista

```bash
npm run test:ev2:phase5
npm run test:unit
npm run typecheck
npx deno check --node-modules-dir=none --no-lock supabase/functions/cms-media/index.ts supabase/functions/cms-public/index.ts supabase/functions/cms-preview/index.ts
npm run check
```

O pgTAP e o fluxo adversarial completo serão executados após a aplicação autorizada da migration no canary de staging.

Consulte o [Gate G5](GATE_G5.md) e o [plano de migration e rollback](MIGRACAO_E_ROLLBACK.md).
