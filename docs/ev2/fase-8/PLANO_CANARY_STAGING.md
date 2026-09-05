# Plano de canary EV2.8 em staging

## Escopo a autorizar

- migration aditiva `0047_ev2_scoped_rbac.sql`;
- funções `cms-scopes` e `cms-session`;
- build do SHA candidato no alias isolado `ev2-g8-canary`;
- dois usuários exclusivamente sintéticos, ambos com MFA;
- overrides individuais de `ev2.rbac_scoped` por 30 minutos;
- uma linha de conteúdo sintético, sem revisão nem publicação, usada apenas para provar a negação;
- nenhuma alteração em produção, staging estável, flag global ou dados reais.

## Sequência com pontos de parada

1. Registrar SHA candidato, alvo Supabase e flag global antes de qualquer alteração.
2. Executar `npm run canary:ev2:phase8:validate`; a migration completa roda em `BEGIN/ROLLBACK` e deve restaurar também as duas funções centrais substituídas.
3. Aplicar `0047` somente em staging; confirmar três tabelas com RLS, grants exclusivos e flag global desligada.
4. Publicar `cms-scopes` e republicar `cms-session` somente em staging.
5. Disparar `EV2.8 Canary Preview` para o SHA exato e publicar no alias `ev2-g8-canary` com somente `VITE_EV2_RBAC_SCOPED_CANDIDATE=true`.
6. Criar OP-G8 e USR-G8, ambos sintéticos e MFA; criar papéis mínimos e overrides individuais de 30 minutos.
7. Confirmar fallback legado antes do override e resolução escopada após o override.
8. Provar 401 anônimo, 412 sem AAL2, 403 sem permissão, negação RLS e produção bloqueada.
9. Fazer USR-G8 tentar publicar por API direta e confirmar HTTP 403, workflow intacto e zero projeção.
10. Provar grant/replay/conflito idempotente, autoelevação, delegação inválida, versão otimista e revogação.
11. Conceder `support` por poucos segundos; confirmar permissão antes e negação automática após expirar.
12. Inserir override amplo sintético; confirmar capability e sessão fail-closed; removê-lo e confirmar recuperação imediata.
13. Correlacionar todas as avaliações do runner às decisões imutáveis e todas as mutações aos recibos/auditorias.
14. Remover overrides, conteúdo, decisões, recibos, scopes, perfis e usuários sintéticos em ordem referencial.
15. Auditar resíduo zero e confirmar novamente flag global desligada e zero mutação de produção/dados reais.

## Abortar imediatamente se

- o projeto vinculado não for `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`, `us-east-2`);
- já houver override ativo de `ev2.rbac_scoped`;
- a migration deixar qualquer objeto após o rehearsal transacional;
- uma ação crítica funcionar com AAL1;
- editor publicar, alterar scope ou ler as tabelas privadas;
- ativação ampla não bloquear também a sessão;
- contagens de decisão, recibo e auditoria divergirem;
- houver qualquer indício de dado real, staging estável ou produção.

## Contenção e rollback

1. Remover todos os overrides individuais e qualquer override sintético amplo.
2. Se necessário, acionar `kill_switch=true` para `ev2.rbac_scoped` em staging.
3. Restaurar o build anterior do alias e a versão anterior de `cms-session`; retirar `cms-scopes` do tráfego.
4. Manter as tabelas aditivas para investigação; não apagar histórico nem fazer rollback destrutivo.
5. Excluir os dados sintéticos remanescentes com o roteiro referencial do runner.
6. Confirmar RBAC legado, flag global desligada, staging estável intacto e produção sem alteração.
