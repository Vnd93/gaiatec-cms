# Validação UX/UI — F11

## Baseline antes das mudanças

Em 2026-08-31, o staging autenticado foi observado em `/admin/listas-mestras` a 1440×900. A tela possuía sidebar agrupada e busca funcional, mas apresentava topo com distribuição excessiva, hierarquia fraca, vazio sem ação principal, conta reduzida a “Sair” e padrões de páginas ainda heterogêneos.

A referência visual autorizada foi inspecionada em detalhe original. Foram adotados hierarquia, agrupamento, cards, rail, etapas, rodapé e feedback; nenhum dado demonstrativo, fabricante, SKU, produto ou controle decorativo foi copiado.

Durante a varredura, a sessão staging perdeu autorização e terminou corretamente no estado fail-closed. Nenhum cookie, storage, credencial ou TOTP foi lido.

## Evidências por rota/jornada

| Grupo           | Evidência local                               | Evidência staging                                    | Resultado atual      |
| --------------- | --------------------------------------------- | ---------------------------------------------------- | -------------------- |
| autenticação    | componentes, labels, foco e estados           | login, recuperação, senha e redirecionamento MFA     | aprovado             |
| shell           | estrutura, busca, conta, sidebar e orientação | busca real, grupos, drawer, Escape e conta validados | aprovado             |
| listagens       | componentes comuns, Vitest e testes F11       | todos os grupos percorridos com sessão AAL2          | aprovado             |
| editores        | padrões comuns + continuidade de sessão F10   | produto, conteúdo, descoberta, página e campanha     | aprovado sem mutação |
| estados/preview | estrutura, 404, E2E e acesso fail-closed      | 404 admin, preview inválido e publicado ausente      | aprovado             |

## Viewports obrigatórios

- desktop 1440×900;
- notebook 1280×800;
- tablet 820×1180 ou equivalente;
- mobile 390×844.

## Execuções concluídas

- `npm run check`: verde; 23 arquivos/66 testes Vitest e 70 testes estruturais F2–F11;
- `npm run test:e2e` local: 32 aprovados, 8 ignorados por dependerem de staging;
- `npm run test:a11y` local: 5 aprovados, 1 ignorado por breakpoint;
- `PLAYWRIGHT_BASE_URL=https://6f6a7210.gaiatec-cms-staging.pages.dev npm run test:e2e`: 38 aprovados, 2 ignorados, 0 falhas;
- `git diff --check`: verde;
- build de publicação: 3.400 módulos transformados e worker Cloudflare preparado;
- `npm run test:rls`: bloqueado antes de executar pgTAP por `ECONNREFUSED 127.0.0.1:54322`, sem Docker/Postgres local.

## Evidência visual publicada

O login do artefato imutável foi inspecionado em 1440×900: um `main`, título “Entrar no painel”, labels e ajuda persistentes, campos com 48 px, ação primária com 45 px, link de recuperação com 44 px e largura documental igual ao viewport. Console sem erro e tab order e foco foram verificados no baseline local. Playwright repetiu as jornadas desktop e mobile no artefato remoto sem violações sérias automatizadas nas jornadas públicas.

## Homologação autenticada

A sessão staging MFA/AAL2 foi renovada diretamente pelo operador, sem trânsito de credencial ou TOTP pelo chat. A navegação interna percorreu painel, produtos, importação, conteúdo, serviços, indústrias, aplicações, soluções, busca, listas mestras, páginas, navegação, dados globais, posicionamentos, campanhas, formulários, leads, mídia, usuários, perfil e diagnósticos. Também foram abertos, sem salvar, os editores novos de produto, conteúdo, serviço, página e campanha.

- busca global: `Ctrl+K`, foco, consulta sintética e destino real validados;
- produto: oito etapas, setas do teclado, status rail, campos privados e footer validados;
- mobile 390×844: drawer, backdrop, bloqueio/restauração do scroll e Escape aprovados;
- tablet 820×1180, notebook 1280×800 e desktop 1440×900: sem overflow de documento;
- tabelas de variantes e tabs mantêm overflow horizontal apenas em regiões nomeadas e roláveis;
- 404 administrativo, preview inválido, conteúdo inexistente, recuperação e nova senha exibem estados acionáveis;
- console autenticado: sem erros ou warnings após a correção de Formulários.

Durante a homologação, Formulários expôs uma relação PostgREST ambígua entre definição e versões. A consulta passou a nomear `cms_form_versions_form_id_fkey`, recebeu `ErrorState` com retry e foi reimplantada. A rota final carregou as definições e versões sem alerta.

O fechamento formal do G11 ainda depende do pgTAP/RLS real em Postgres local e de evidência manual com leitor de tela; as verificações semânticas automatizadas ficaram verdes.
