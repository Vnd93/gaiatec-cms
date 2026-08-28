# Fase 3 — nucleo do novo CMS

**Status:** `CMS-001` e `CMS-002` concluidos no staging; `CMS-003` e `CMS-004` validados no CI

**Branch:** `Remodelagem`

**Producao:** nao autorizada

## Pacote atual

`CMS-001` inicia a infraestrutura administrativa antes de qualquer tela. A migration `0010_fase3_cms_identity_rbac_audit.sql` cria exclusivamente estruturas vazias e configuracoes de seguranca:

- perfis administrativos ligados ao Supabase Auth;
- sete papeis visuais e permissoes `cms:*` por dominio e acao;
- atribuicao N:N de papeis e permissoes;
- status convidado, ativo e suspenso;
- MFA obrigatorio para Super Admin;
- revogacao de sessao por identificador hasheado;
- eventos de login e auditoria imutaveis;
- RLS default-deny e ausencia de escrita direta pelo frontend.

Nenhum usuario real, produto, servico, texto, imagem, midia ou cadastro legado e criado ou importado.

## Estado do aceite

O contrato e os testes estruturais de `CMS-001` foram aprovados localmente. A migration foi aplicada somente ao projeto `GAIATEC CMS Staging`; 13/13 testes pgTAP transacionais passaram, o lint remoto nao encontrou erros e a consulta posterior confirmou zero identidades ou registros sinteticos persistidos.

As evidencias detalhadas ficam em `EVIDENCIA_CMS_001.md`. Producao nao foi acessada.

## CMS-002 — usuarios server-side

O segundo pacote adiciona uma Edge Function administrativa fechada para listar usuarios, convidar, reenviar convite, alterar papeis, suspender, reativar e revogar sessoes. As mutacoes exigem permissao `cms:*`, MFA quando aplicavel, identificador idempotente, limite de requisicoes e auditoria transacional. O primeiro Super Admin continua dependendo de provisionamento controlado; nao existe cadastro publico nem bootstrap por e-mail.

As evidencias tecnicas e o estado posterior do staging estao em `EVIDENCIA_CMS_002.md`.

## CMS-003 — login administrativo e MFA

O terceiro pacote adiciona login fechado, aceite de convite, definicao e recuperacao de senha, MFA TOTP e resolucao server-side da sessao. Super Admin sem `aal2`, perfil suspenso, sessao revogada e identidade exclusiva do RDO permanecem fora do shell `/admin`.

O pacote passou integralmente no banco efemero e nas suites de qualidade e navegador do GitHub. A aplicacao no staging aguarda somente uma nova sessao autenticada do Supabase; producao nao foi acessada. As evidencias estao em `EVIDENCIA_CMS_003.md`.

## CMS-004 — fundacao editorial versionada

O quarto pacote cria estruturas vazias para taxonomia, rascunhos concorrentes, revisoes imutaveis, projecao publicada e outbox idempotente. O contrato runtime exige fonte oficial, hash, owners e direitos confirmados, sem importar conteudo legado ou criar registros reais.

As 13 migrations foram aplicadas do zero pelo CI e os 20 testes pgTAP do pacote passaram. A aplicacao sequencial de `0012` e `0013` no staging aguarda uma sessao autenticada do Supabase. As evidencias estao em `EVIDENCIA_CMS_004.md`.

O proximo pacote e a API de comandos editoriais com revisao, aprovacao, publicacao, restauracao e arquivamento atomicos. Midia e API publica permanecem separadas.
