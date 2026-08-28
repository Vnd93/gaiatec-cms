# Fase 3 — nucleo do novo CMS

**Status:** `CMS-001` concluido no staging; Fase 3 em execucao sob contingencia local

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

O proximo pacote e o convite fechado e os comandos server-side de usuarios, seguido pelo login administrativo. O shell `/admin` continua fora deste pacote.
