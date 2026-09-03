# EV2.7 — produtividade, colaboração e release composto

## Resultado de engenharia

A fase implementa um caminho candidato aditivo e `default-off`, sem alterar a publicação individual v1 enquanto a flag `ev2.collaboration_bulk` estiver desligada.

- release composto de até 500 revisões congeladas por hash;
- ordenação explícita de dependências e locks adquiridos em ordem estável;
- validação de estado, contrato, permissão, aprovação segregada, dependências e qualidade;
- publicação de página, navegação, SEO e demais conteúdos do registro em uma única transação lógica;
- snapshot materializado de projeção, publicação, workflow e redirects para rollback RPO 0;
- aprovação do pacote por pessoa diferente do criador do release e dos autores das revisões;
- MFA/AAL2 obrigatório para aprovação, publicação, rollback e execução em massa;
- inbox com tarefa, prioridade, SLA, comentário/menção e âncora estável para o alvo exato;
- detalhe sob demanda com conversa, histórico auditável e diff resumido contra a projeção publicada;
- visões privadas salvas e locks otimistas por tarefa;
- notificações in-app por outbox e falha externa preservada como pendência visível;
- operações em massa de inclusão em release, atribuição e resolução com dry-run por item;
- lote atômico, limite de 500 alvos, recibo idempotente e conflito fail-closed;
- versão do release e atualização do conteúdo congeladas no dry-run e revalidadas na execução;
- releases agendados processados pelo worker; falha aborta o conjunto e abre tarefa crítica.

## Superfícies implementadas

| Camada      | Artefato                                                                |
| ----------- | ----------------------------------------------------------------------- |
| Dados/RLS   | `supabase/migrations/0045_ev2_collaboration_release_bulk.sql`           |
| Release     | `supabase/functions/cms-releases/index.ts` — contrato v2 preservando v1 |
| Colaboração | `supabase/functions/cms-collaboration/index.ts`                         |
| Massa       | `supabase/functions/cms-bulk/index.ts`                                  |
| Worker      | `supabase/functions/cms-outbox-worker/index.ts`                         |
| Admin       | `/admin/meu-trabalho`, atrás do build candidato e da flag de servidor   |
| Contratos   | `src/shared/contracts/ev2-collaboration.ts`                             |
| Testes      | `npm run test:ev2:phase7` e testes unitários do contrato                |

## Rollout seguro

1. Obter autorização específica para o canary EV2.7 em staging.
2. Executar `npm run canary:ev2:phase7:validate`; a migration inteira roda em transação revertida.
3. Aplicar a migration `0045` somente em staging.
4. Publicar `cms-releases`, `cms-collaboration`, `cms-bulk` e `cms-outbox-worker` somente em staging.
5. Gerar build com `VITE_EV2_COLLABORATION_BULK_CANDIDATE=true` no alias `ev2-g7-canary`.
6. Criar dois usuários sintéticos com MFA: operador/release manager e revisor segregado.
7. Aplicar override individual de 30 minutos para ambos, nunca global.
8. Executar o cenário G7, medir publicação e rollback, provar idempotência e zero mudança parcial.
9. Limpar releases, tarefas, lotes, revisões, usuários e overrides sintéticos; fazer auditoria independente de resíduo.

Produção, staging estável, dados reais, flag global e promoção para `main` permanecem fora do escopo.

## Estado do Gate G7

O candidato local está implementado e os testes de contrato passam. O gate permanece **pendente** até migration rehearsal, canary sintético segregado, rollback medido abaixo de cinco minutos e evidência de resíduo zero em staging. Consulte [GATE_G7.md](GATE_G7.md) e [PLANO_CANARY_STAGING.md](PLANO_CANARY_STAGING.md).
