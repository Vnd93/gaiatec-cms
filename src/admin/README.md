# Limite administrativo

A fundação server-side do novo CMS começou em `CMS-001`. `CMS-002` adicionou o convite fechado e os comandos administrativos de usuários. `CMS-003` implementa login, aceite do convite, recuperação de senha, MFA e o primeiro shell protegido em `/admin`.

O shell confirma a identidade e exibe somente o resumo da sessão. Produtos, conteúdo, mídia e publicação continuam bloqueados até os respectivos contratos de dados e permissões serem implementados.

Nenhum código administrativo legado pode entrar aqui. CMS e RDO mantêm autenticação e permissões independentes.
