# ADR-013 — Persistência local recuperável de rascunhos

## Estado

Aceita para a Fase 10 em 2026-08-30.

## Contexto

Renovações de sessão, troca de aba e falhas transitórias não podem apagar trabalho ainda não salvo. O backup não deve criar uma segunda fonte editorial, atravessar usuários ou enviar conteúdo a terceiros.

## Decisão

Cada editor governado mantém uma cópia temporária em `sessionStorage`, sob a chave versionada `gaiatec:cms:draft:v1:<user>:<tipo>:<item>`. A gravação é adiada em 500 ms, tem TTL de 24 horas e só ocorre para conteúdo alterado. A restauração exige uma ação consciente. Salvar, publicar ou descartar remove a cópia.

`sessionStorage` foi escolhido porque restringe a cópia à sessão da aba e evita persistência indefinida. IDs são saneados para o namespace; dados não saem do navegador. Falha ou indisponibilidade do armazenamento não bloqueia o editor e aparece no indicador operacional.

## Consequências e segurança

- não é backup corporativo nem fonte de publicação;
- não substitui revisão, revisionamento ou auditoria no servidor;
- logout/expiração continuam fail-closed; a cópia não concede acesso;
- a política de retenção é curta e testada por expiração;
- mudança de formato exige nova versão de chave e estratégia explícita de compatibilidade.

## Rollback

Remover o hook e o aviso dos editores. As chaves antigas expiram em 24 horas e não são lidas por versões futuras.
