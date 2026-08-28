# Evidencia CMS-002 — comandos server-side de usuarios

**Data:** 2026-08-28

**Ambiente aplicado:** `GAIATEC CMS Staging` (`glcqsosxwgmlhzgcsnzv`)

**Producao:** nao acessada

## Entrega

- migration `0011_fase3_cms_user_commands.sql`;
- Edge Function `cms-users`, ativa com `verify_jwt=true`;
- listagem administrativa autorizada no servidor;
- convite fechado e reenvio pelo Supabase Auth;
- alteracao de papeis, suspensao, reativacao e revogacao de sessoes;
- autorizacao por permissao `cms:*` com MFA para Super Admin;
- recibos idempotentes e auditoria transacional;
- protecao contra autoalteracao de papeis, autossuspensao e remocao insegura do ultimo Super Admin;
- cadastro publico e anonimo bloqueados no Auth remoto.

## Validacoes

- compilacao transacional da migration em `BEGIN/ROLLBACK`: aprovada;
- 17/17 testes pgTAP transacionais no staging: aprovados;
- lint remoto do schema `public`: nenhum erro;
- chamada anonima da Edge Function: rejeitada com HTTP `401`;
- teste estrutural da Fase 3: 6/6 aprovados;
- validacao local completa: aprovada;
- Playwright: 15 aprovados e 3 skips intencionais;
- auditoria npm: zero vulnerabilidades.

## Estado posterior

- migration `0011` registrada;
- funcao `cms-users` `ACTIVE`, versao 1;
- `cms_profiles`: 0 registros;
- `cms_command_receipts`: 0 registros;
- `cms_audit_log`: 0 registros;
- nenhum usuario sintetico persistido;
- `CMS_ADMIN_ORIGIN` configurada somente no staging;
- `site_url` do Auth apontando para `https://gaiatec-cms-staging.pages.dev`;
- allowlist limitada ao staging, previews do projeto e `127.0.0.1:4173`;
- signup comum e signup anonimo desabilitados.

## Limites deliberados

Nenhum usuario real ou primeiro Super Admin foi criado. O bootstrap inicial continua sendo uma operacao nominal e controlada. A tela de login `/admin`, definicao de senha e MFA pertencem ao proximo pacote; ate la, a API permanece inacessivel para operacao real por ausencia de identidades CMS ativas.
