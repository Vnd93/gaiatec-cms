# Exceção de integridade — migration 0008

## Motivo

O ensaio real de banco vazio em 2026-08-28 falhou em `0008_fase1_contencao_p0.sql` com `function digest(text, unknown) does not exist`. O Supabase instala `pgcrypto` no schema `extensions`; a chamada histórica dependia de um `search_path` implícito e não reproduzível.

## Mudança mínima

Somente `digest(...)` foi substituído por `extensions.digest(...)`. Não houve mudança de tabela, policy, dado ou comportamento criptográfico. A migration já aplicada não é reaplicada em ambientes existentes; a alteração apenas torna reconstruções vazias determinísticas.

## Controle

- base original: `0835046ab99fd35a7dd05b6062a750958326bc7d`;
- erro e correção preservados no histórico Git da branch `Remodelagem`;
- reset repetido exclusivamente no staging `glcqsosxwgmlhzgcsnzv`;
- nenhuma conexão ou alteração em produção.

Esta é uma exceção corretiva documentada à regra de imutabilidade, necessária para satisfazer o critério obrigatório “migrations sobem em banco vazio”. Novas evoluções continuam exigindo novo arquivo de migration.
