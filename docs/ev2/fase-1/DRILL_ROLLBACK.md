# Drill de release vazio e rollback — G1

## Objetivo

Provar, sem conteúdo ou ambiente remoto, que a fundação cria um release vazio uma única vez, rejeita replay divergente, protege concorrência e registra rollback imutável.

## Procedimento automatizado

O teste `supabase/tests/rls_ev2_phase1_foundation.test.sql` executa tudo em transação encerrada por `ROLLBACK`:

1. confirma RLS nas cinco tabelas e ausência de execução direta por `anon`/`authenticated`;
2. comprova que `ev2.release_skeleton` começa desligada;
3. cria override local, temporário e por usuário de teste;
4. exige AAL2 para o super admin e cria um plano vazio de hash determinístico;
5. repete a chave/hash e recebe o mesmo release;
6. rejeita hash divergente e `expectedVersion` obsoleto;
7. reverte o release com AAL2, preservando pacote, recibos, evento e auditoria;
8. aciona kill switch e comprova falha fechada mesmo com override;
9. rejeita criação em produção;
10. desfaz todos os fixtures com rollback da transação.

## Resultado esperado

- um pacote `draft` vira `rolled_back`, `lock_version` passa de 1 para 2;
- zero item/projeção/publicação é criado;
- dois eventos e duas entradas de auditoria permanecem durante o teste;
- tentativa de apagar evento falha;
- após `ROLLBACK`, o banco retorna ao estado inicial.

## Rollback operacional

1. Ativar o kill switch ou remover/desabilitar o override aplicável.
2. Pausar chamadas da Edge Function; `status`, `cancel` e `rollback` continuam disponíveis para recuperação autorizada.
3. Reverter releases vazios abertos com versão atual e AAL2.
4. Preservar tabelas, recibos, eventos e auditoria; não executar DROP.
5. Corrigir por nova migration, repetir pgTAP e somente então considerar nova ativação.
