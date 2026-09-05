# Plano de canary EV2.9 em staging

## Escopo a autorizar

- migration aditiva `0048_ev2_visual_studio_multisite.sql`;
- funções `cms-visual` e `cms-sites`;
- build do SHA candidato no alias isolado `ev2-g9-canary`;
- dois usuários exclusivamente sintéticos, ambos com MFA;
- overrides individuais de `ev2.visual_studio` e `ev2.multisite` por 30 minutos;
- um rascunho visual sintético e dois sites candidatos sintéticos `g9x-*` com domínios `.invalid`;
- nenhuma alteração em produção, staging estável, flags globais, domínio real ou dado real.

## Sequência com pontos de parada

1. Registrar SHA candidato, projeto Supabase, região, flags e ausência de overrides ativos antes de qualquer alteração.
2. Executar `npm run canary:ev2:phase9:validate`; a migration completa deve rodar em `BEGIN/ROLLBACK` e restaurar o hash do validador de publicação e os contratos anteriores.
3. Aplicar `0048` somente em staging e confirmar RLS, grants exclusivos, 20 componentes exatos, zero domínio e ambas as flags globais desligadas.
4. Publicar `cms-visual` e `cms-sites` somente em staging.
5. Disparar `EV2.9 Canary Preview` para o SHA exato e publicar no alias `ev2-g9-canary`, com somente as duas variáveis candidatas da fase habilitadas.
6. Criar OP-G9 (`site_pilot_manager`) e DSG-G9 (`designer` + `site_pilot_manager`), ambos sintéticos e MFA, com overrides individuais de 30 minutos.
7. Provar 401 anônimo, 403 fora do escopo, 412 sem AAL2, negação RLS e produção bloqueada.
8. Criar branch de um rascunho sintético; verificar catálogo com 20 componentes, documento 12/8/4 e ausência de código arbitrário.
9. Salvar e repetir o mesmo comando; confirmar replay idempotente, um único evento, conflito sem perda com versão obsoleta e recusa quando o rascunho-base mudou.
10. Criar três snapshots, símbolo no mesmo site e aplicar somente ao rascunho; confirmar `published=false` e zero revisão/projeção/outbox de publicação.
11. Fazer cada usuário criar seu próprio site candidato; provar replay/conflito idempotente, ambientes travados, domínios `.invalid`, versão de tokens e suspensão; confirmar por registry e mutação cruzada que um proprietário não enumera nem altera o candidato do outro.
12. Tentar hostname real, site sem prefixo sintético, ambiente de produção, símbolo cruzado e consulta direta às tabelas; todas devem falhar.
13. Inserir override amplo sintético e confirmar que as duas capabilities falham fechadas; removê-lo e confirmar recuperação.
14. Correlacionar mutações, recibos e eventos; verificar que snapshots/documentos e site registry preservam versões e site IDs corretos.
15. Suspender e remover fixtures, overrides, rascunho, usuários e demais dados sintéticos em ordem referencial.
16. Auditar todas as tabelas, identidades Auth e overrides para resíduo zero; comparar manifest do staging estável e sentinelas de site/domínio real antes e depois.

## Abortar imediatamente se

- o projeto vinculado não for `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`, `us-east-2`);
- o SHA do artefato, workflow, migration ou funções divergir;
- qualquer flag estiver globalmente habilitada ou houver override não previsto;
- AAL1 executar mutação;
- código arbitrário, domínio real ou produção forem aceitos;
- um site inferir, listar ou mutar dados do outro;
- `apply_to_draft` criar revisão, publicação ou projeção pública;
- recibos, eventos, versões ou hashes divergirem;
- houver resíduo sintético ou impacto no staging estável.

## Contenção e rollback

1. Remover os quatro overrides individuais e qualquer override amplo sintético.
2. Se necessário, acionar os kill switches `ev2.visual_studio` e `ev2.multisite` em staging.
3. Restaurar o build anterior do alias e retirar as novas funções do tráfego.
4. Manter as tabelas aditivas para investigação; não apagar histórico nem executar rollback destrutivo.
5. Excluir somente fixtures sintéticas pelo roteiro referencial do runner.
6. Confirmar novamente renderer/rastreio v1, flags desligadas, staging estável intacto e produção sem alteração.
