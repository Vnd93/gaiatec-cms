# Evidências do Gate G11

## Estado

**G11 NÃO APROVADO — implementação, staging e homologação autenticada concluídos; pgTAP/RLS e leitor de tela manual bloqueiam o gate formal.** G10 observado como não aprovado; G9 continua bloqueado por produção e tempo real. Produção permanece vedada.

## Checklist

- [x] F10 concluída antes do início e resultado lido;
- [x] referência visual inspecionada em detalhe original;
- [x] branch `Remodelagem` e worktree legítimo inventariados;
- [x] rotas e componentes administrativos inventariados;
- [x] sistema visual e componentes compartilhados criados;
- [x] 100% das rotas inventariadas percorridas, sem P0/P1 visual conhecido;
- [x] format, lint, typecheck, Vitest, F2–F11 e build verdes;
- [x] E2E e a11y locais e remotos verdes;
- [x] regressão visual autenticada e estados de desktop, notebook, tablet e mobile aprovados;
- [ ] sessão/rascunho F10, MFA/RBAC e projeção privada sem regressão; RLS real aguarda pgTAP;
- [x] staging implantado, contido por noindex e validado nas jornadas públicas e signed-out;
- [x] inventário Git final e relatório de arquivos/testes concluídos.

## Baseline Git

Branch `Remodelagem`, HEAD inicial `906326c`, com 51 arquivos modificados e 25 não rastreados antes da F11. Nenhum reset, checkout amplo, stash, commit ou push foi executado.

Após a F11, `git diff --check` permanece verde. O inventário completo do worktree foi relido antes do deploy; alterações legítimas das fases anteriores continuam presentes e integradas.

## Staging publicado

- estável: `https://gaiatec-cms-staging.pages.dev`;
- artefato imutável F11 final: `https://6f6a7210.gaiatec-cms-staging.pages.dev`;
- `X-Robots-Tag: noindex, nofollow, noarchive` confirmado em `/`, `/admin/login` e `/robots.txt`;
- E2E remoto: 38 aprovados, 2 ignorados, 0 falhas;
- produção, domínio público, banco legado e Supabase de produção: não alterados.

## Testes e build

- check agregado: 66 testes Vitest e 70 testes estruturais F2–F11, todos verdes;
- E2E local: 32 aprovados, 8 ignorados, 0 falhas;
- acessibilidade local: 5 aprovados, 1 ignorado, 0 falhas;
- build/deploy: 3.400 módulos transformados e Worker preparado com contenção de rotas/status/segurança;
- pgTAP/RLS: não iniciado porque o Postgres local em `127.0.0.1:54322` está indisponível.

## Evidência autenticada final

- sessão MFA/AAL2 digitada diretamente pelo operador e mantida durante navegação SPA;
- todas as rotas do inventário administrativo percorridas em modo somente leitura;
- editores de produto, conteúdo, descoberta, páginas e campanha abertos sem salvar;
- busca global, tabs por teclado, drawer móvel, Escape, foco, estados vazios/erro e 404 validados;
- viewports 390×844, 820×1180, 1280×800 e 1440×900 sem overflow do documento;
- Formulários inicialmente falhou por relação PostgREST ambígua; a relação foi explicitada, o estado de erro ganhou retry e o deploy final carregou todas as versões sem alerta;
- console final sem erros ou warnings na rota corrigida;
- nenhum conteúdo foi salvo, publicado, despublicado, arquivado ou excluído.

## Bloqueios externos conhecidos

- pgTAP/RLS local da F10 depende de Docker/Postgres indisponível neste host;
- validação manual por leitor de tela não está disponível neste host; landmarks, nomes acessíveis, foco e axe foram verificados, mas isso não substitui a evidência manual exigida pelo gate.
