# CMS administrativo

`src/admin/` contém o shell protegido, as telas operacionais e os adaptadores dos contratos do CMS.
CMS, RDO e site público mantêm autenticação, permissões e estilos separados.

## Navegação

- Trabalho: Visão geral, Meu trabalho, Leads, Assistente IA e Centro de Qualidade;
- Catálogo: Produtos, Cadastro em massa, PIM, Dados mestres, Serviços, Indústrias, Aplicações,
  Soluções, Listas mestras e Busca e sinônimos;
- Conteúdo: Páginas, Estúdio Visual, Editorial e Mídia;
- Marketing: Campanhas e Formulários;
- Site: Navegação, Dados globais, Posicionamentos e Sites e ambientes;
- Administração: Usuários e acessos, Auditoria e Diagnósticos.

As ferramentas ficam no grupo do fluxo operacional a que pertencem; Perfil e sessão são acessados
pelo bloco do usuário. A busca global abre somente um domínio permitido. Rotas EV2 continuam sob
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

O shell também bloqueia a montagem de uma rota direta sem a permissão de leitura correspondente.
Essa defesa de interface não substitui autorização: edge functions, RPC e RLS repetem RBAC/MFA.
Workflow, locks, revisão imutável, outbox e projeção pública permanecem nos contratos existentes.
Fabricante, OEM, SKU e proveniência classificados como internos nunca são enviados às superfícies
públicas.

PDFs novos nunca ficam publicáveis após mera inspeção estrutural: `cms-documents` relê e calcula o
SHA-256 dos bytes, mantém o ativo em quarentena e exige atestação AAL2 de um segundo ator com a
permissão crítica `cms:documents.security_review`. A decisão registra engine, veredito, referência e
hash da evidência de scanner corporativo, sem armazenar o relatório bruto. Importe legado como
`legacy-unverified-import-v1`, ainda em quarentena; links públicos assinados forçam download como
anexo e só são emitidos para ativos aprovados.

A documentação funcional vigente é mantida em
[`Vnd93/gaiatec-documentacao/docs/30-cms`](https://github.com/Vnd93/gaiatec-documentacao/tree/4f5e2e7638fd9a2c2da17717e641abb7e685ece0/docs/30-cms).
