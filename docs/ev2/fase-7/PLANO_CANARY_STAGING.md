# Plano de canary EV2.7 em staging

**Execução:** concluída e aprovada em 3 de setembro de 2026; consulte o [relatório](RELATORIO_CANARY_STAGING_2026-09-03.md).

## Escopo autorizado e executado

- migrations aditivas `0045_ev2_collaboration_release_bulk.sql` e `0046_ev2_conflict_transport_hardening.sql`;
- funções `cms-releases`, `cms-collaboration`, `cms-bulk` e `cms-outbox-worker`;
- build candidato no alias `ev2-g7-canary`;
- dois usuários exclusivamente sintéticos, ambos com MFA;
- overrides individuais de `ev2.collaboration_bulk` por 30 minutos;
- conteúdo sintético descartável: uma página, uma navegação, revisões, tarefas, comentários, releases e jobs;
- nenhuma alteração em produção, staging estável, flag global ou dados reais.

## Sequência com pontos de parada

1. Registrar SHA candidato e estado de produção/staging antes da mudança.
2. Ensaiar `0045` dentro de `BEGIN/ROLLBACK`; parar se qualquer objeto persistir.
3. Aplicar `0045` e confirmar RLS, grants `service_role` e flag global desligada.
4. Publicar funções e confirmar versões/health antes do build.
5. Publicar o build isolado `ev2-g7-canary`; confirmar que os candidatos EV2.2–EV2.6 estão desligados.
6. Criar OP-G7 e REV-G7 com MFA, papéis mínimos e overrides individuais.
7. Validar 401 anônimo, produção recusada, origem inválida e flag ausente/desligada.
8. Registrar a navegação publicada existente apenas como sentinela de leitura; criar duas páginas e uma navegação sintéticas aprovadas.
9. Provar que OP-G7 não aprova o próprio pacote e REV-G7 não publica sem permissão.
10. Aprovar com REV-G7 e publicar as duas páginas sintéticas; conferir projeções e outbox. Validar página+navegação como plano e cancelá-lo antes de tocar o singleton real.
11. Montar pacote válido, inserir bloqueio sintético de qualidade no segundo item após a aprovação e conferir zero mudança pública ao publicar.
12. Repetir comando com a mesma chave e depois com payload diferente; conferir replay/conflito.
13. Criar tarefa e comentário ancorado; mencionar REV-G7, resolver e reabrir.
14. Executar dry-run inválido e confirmar erros por alvo/zero writes; invalidar outro dry-run por mudança concorrente; depois executar lote válido.
15. Reverter o release publicado, medir duração e confirmar restauração exata em menos de cinco minutos.
16. Desligar/remover overrides, excluir dados e usuários sintéticos em ordem referencial.
17. Auditar independentemente resíduo zero, flag global off e produção sem alteração.

## Abortar imediatamente se

- houver escrita parcial, divergência de snapshot ou publicação fora do pacote;
- OP-G7 conseguir aprovar o próprio release;
- ação crítica funcionar sem AAL2;
- dry-run alterar domínio ou omitir erro de um alvo;
- rollback exceder cinco minutos ou não restaurar projeção/workflow/redirect;
- surgir qualquer indício de dado real, flag global ou mutação de produção.

## Contenção do singleton de navegação

O staging possui uma navegação publicada única. Como o canary foi autorizado sem dados reais, o runner não substitui nem republica esse singleton. A atomicidade positiva usa duas páginas sintéticas; o pacote página+navegação é validado, aprovado e cancelado antes da publicação. A navegação real é comparada antes e depois por `item_id`, `revision_id`, `content_version` e `etag`.

## Rollback operacional

1. Acionar kill switch ou remover os overrides individuais.
2. Cancelar jobs `validated/failed` e releases ainda não publicados.
3. Para release publicado, executar rollback transacional pelo snapshot materializado.
4. Manter as tabelas aditivas; não fazer rollback destrutivo de migration.
5. Restaurar as versões anteriores das quatro funções e o build anterior do alias.
6. Confirmar RPO 0, outbox sem crescimento e resíduo sintético zero.
