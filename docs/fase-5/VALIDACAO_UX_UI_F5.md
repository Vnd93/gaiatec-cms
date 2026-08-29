# Validação UX/UI prática da Fase 5

Data: 2026-08-29. Navegador: Codex in-app browser. Deployment funcional inspecionado: `https://eaae509e.gaiatec-cms-staging.pages.dev`. O mesmo artefato, acrescido somente das métricas F5 no diagnóstico autenticado, foi fechado em `https://bea97ba2.gaiatec-cms-staging.pages.dev`.

## Jornadas verificadas

- produto GATFLOW publicado: identidade, galeria, especificações, modelos, relações, documentos, ALT e campos “a confirmar” preservados;
- listas `/servicos`, `/industrias`, `/aplicacoes` e `/solucoes`: loading e vazio explícitos, filtro presente e nenhuma fonte antiga exibida;
- detalhe inexistente: alerta compreensível, landmark único e `noindex,follow`;
- busca `KF700E` e `gat`: resultado do GATFLOW, grupos por domínio e indicação de campo correspondente;
- autocomplete: `combobox`, `aria-expanded`, `aria-activedescendant`, `listbox`, seleção por setas e fechamento por Escape;
- zero resultado: mensagem, registro anônimo e alternativas para produtos, aplicações e contato;
- admin sem sessão: redirecionamento para `/admin/login`, `noindex,nofollow,noarchive`, sem acesso ao editor;
- preview: fluxo remoto em cada domínio comprovou payload exato e `Cache-Control: no-store`.

## Desktop e mobile

As jornadas foram verificadas no viewport normal e em `390 × 844`. Produto, quatro listas, busca e login administrativo apresentaram `scrollWidth=clientWidth`, sem overflow horizontal. O menu móvel abriu por controle semântico, os botões mantiveram nomes acessíveis e todas as imagens observadas possuíam atributo ALT.

## Console, estados e cache

- console: nenhum erro ou warning nas rotas inspecionadas;
- loading: observado antes das respostas e encerrado sem estado preso;
- vazio: listas F5 sem conteúdo real;
- erro: detalhe inexistente;
- sem permissão: redirecionamento do editor ao login;
- staging: `X-Robots-Tag: noindex, nofollow, noarchive` em público, busca, admin e 404;
- HTML público: `public, must-revalidate, max-age=0`;
- admin: `no-store, max-age=0, private`;
- função de busca/autocomplete: `private, no-store`;
- função de detalhe: `public, max-age=60, stale-while-revalidate=300`;
- amostra HTTP: 69–456 ms; o carregamento assíncrono convergiu sem erros.

## Correções originadas pela inspeção

1. removidos landmarks `<main>` aninhados nas páginas novas;
2. autocomplete convertido em combobox/listbox operável por teclado;
3. listas vazias/filtradas e detalhes inexistentes passaram a `noindex`;
4. cobertura estrutural adicionada para impedir regressão desses pontos.

## Limite registrado

Não existe perfil humano ativo nem credencial real autorizada para login. A UI autenticada dos editores foi verificada por contratos/componentes e o workflow administrativo real foi exercitado remotamente por usuários sintéticos descartáveis; no navegador, foi validado o estado sem permissão. Nenhuma credencial ou sessão persistente foi criada para contornar esse limite.
