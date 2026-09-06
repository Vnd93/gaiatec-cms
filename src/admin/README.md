# CMS administrativo

`src/admin/` contém o shell protegido, as telas operacionais e os adaptadores dos contratos do CMS.
CMS, RDO e site público mantêm autenticação, permissões e estilos separados.

## Navegação

- Trabalho: Visão geral, Leads, Assistente IA e Centro de Qualidade;
- Catálogo: Produtos, Serviços, Indústrias, Aplicações e Soluções;
- Conteúdo: Páginas, Editorial e Mídia;
- Marketing: Campanhas e Formulários;
- Site: Navegação, Dados globais e Posicionamentos;
- Administração: Usuários e acessos, Auditoria e Diagnósticos.

Subferramentas usam abas internas. A busca global abre Produtos filtrado quando o usuário possui
`cms:products.read`. Perfil e sessão são acessados pelo bloco do usuário. Rotas EV2 continuam sob
feature flag e RBAC fail-closed.

## Padrões de interface

O design system usa Instrument Sans, JetBrains Mono para slugs/códigos, fundo `#fafafa`, sidebar
`#f4f4f5`, superfícies brancas e azul `#0057de`. Tokens e regras comuns ficam em `admin.css`; folhas
especializadas não redefinem tokens.

Listas usam `RecordDrawer` antes do editor/ficha. Cabeçalhos oferecem “Sobre esta tela”, filtros
mostram contagem real, tabelas têm caption e status textual, ações críticas usam confirmação e ações
terminais geram feedback. `AdminUI.tsx` concentra abas, stepper, drawer, matriz de vínculos, toast,
estados, cards, tabelas, rail e rodapé sticky.

## Segurança e contratos

Nenhuma affordance substitui autorização: edge functions, RPC e RLS repetem RBAC/MFA. Workflow,
locks, revisão imutável, outbox e projeção pública permanecem nos contratos existentes. Fabricante,
OEM, SKU e proveniência classificados como internos nunca são enviados às superfícies públicas.

A documentação funcional vigente é mantida em
[`Vnd93/gaiatec-documentacao/docs/30-cms`](https://github.com/Vnd93/gaiatec-documentacao/tree/main/docs/30-cms).
