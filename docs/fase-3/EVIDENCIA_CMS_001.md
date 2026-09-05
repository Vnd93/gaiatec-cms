# Evidencia CMS-001 — identidade, RBAC e auditoria

**Data:** 2026-08-28

**Alvo:** `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`)

**Producao:** nao acessada

## Mudanca aplicada

A migration `0010_fase3_cms_identity_rbac_audit.sql` foi primeiro avaliada com `db push --linked --dry-run`. A simulacao indicou somente a migration `0010`, sem seeds ou papeis externos. Uma verificacao estatica confirmou ausencia de `DROP`, `TRUNCATE`, `DELETE FROM`, `UPDATE` e alteracao de tabelas anteriores.

O `db push --linked` aplicou a migration transacionalmente no staging. Foram criadas apenas tabelas vazias, configuracoes de papeis/permissoes, funcoes de autorizacao, RLS, indices e triggers de imutabilidade.

## Resultados de seguranca

O arquivo `rls_fase3_cms.test.sql` executou identidades exclusivamente sinteticas dentro de `BEGIN`/`ROLLBACK`:

1. sete papeis CMS configurados;
2. todas as permissoes no escopo `cms:*`;
3. Editor le somente o proprio perfil;
4. Editor pode editar posts;
5. Editor nao pode publicar posts;
6. sessao revogada e rejeitada;
7. `rdo_admin` nao recebe escopo CMS;
8. usuario suspenso permanece inativo;
9. usuario autenticado nao forja auditoria;
10. Super Admin com MFA le perfis;
11. Super Admin com MFA le auditoria;
12. Super Admin sem MFA nao recebe permissao critica;
13. auditoria nao pode ser alterada nem por codigo privilegiado.

**Resultado:** 13/13 aprovados.

## Verificacoes finais

- `db lint --linked --schema public --level warning --fail-on error`: nenhum erro de schema;
- usuarios sinteticos restantes: 0;
- perfis CMS restantes: 0;
- atribuicoes de papel restantes: 0;
- registros de auditoria sinteticos restantes: 0;
- nenhum usuario real foi criado, alterado ou importado;
- nenhuma tabela RDO ou editorial anterior foi alterada.

## Limite

`CMS-001` aprova a fundacao do banco. Convite, recuperacao, suspensao e revogacao serao expostos somente por comandos server-side em pacote posterior; o frontend nao recebeu escrita direta.
