# Matriz UX, acessibilidade e responsividade — F11

Legenda: `A` automatizado; `M` manual/browser; `P` pendente de homologação autenticada final.

| Jornada                     | 1440×900 | 1280×800 | tablet | 390×844 | teclado/foco | leitor de tela     | contraste/zoom | Estado                |
| --------------------------- | -------- | -------- | ------ | ------- | ------------ | ------------------ | -------------- | --------------------- |
| login/recuperação/senha/MFA | A/M      | A/M      | A/M    | A/M     | A/M          | semântica A/P      | AA/P           | aprovado; SR manual P |
| shell, busca e sidebar      | A/M      | A/M      | A/M    | A/M     | A/M          | landmarks A/P      | AA/P           | aprovado; SR manual P |
| painel e listagens          | A/M      | A/M      | A/M    | A/M     | A/M          | tabelas/captions A | AA/P           | aprovado              |
| produto e variantes         | A/M      | A/M      | A/M    | A/M     | A/M          | labels/erros A     | AA/P           | aprovado              |
| descoberta e conteúdo       | A/M      | A/M      | A/M    | A/M     | A/M          | tabs/fieldset A    | AA/P           | aprovado              |
| páginas/site/campanha       | A/M      | A/M      | A/M    | A/M     | A/M          | dialogs/tabs A     | AA/P           | aprovado              |
| listas/busca/mídia          | A/M      | A/M      | A/M    | A/M     | A/M          | estados A          | AA/P           | aprovado              |
| leads/usuários/diagnóstico  | A/M      | A/M      | A/M    | A/M     | A/M          | dados restritos A  | AA/P           | aprovado              |
| preview/erro/404/sessão     | A/M      | A/M      | A/M    | A/M     | A/M          | status/alert A     | AA/P           | aprovado              |

## Evidência automatizada de breakpoints

Playwright executou o artefato publicado em projetos desktop e mobile: 38 testes aprovados, incluindo smoke de `/admin/login`, administração privada/fail-closed, fechamento de menu móvel com Escape, restauração de scroll, skip link, projeção clean-room e ausência de violações sérias nas jornadas públicas. O login também foi inspecionado manualmente em 1440×900, e os breakpoints 1280×800, tablet e 390×844 foram exercitados localmente sem overflow horizontal.

As células `P` não representam defeito conhecido: indicam a ausência de execução manual com leitor de tela e de zoom óptico real. O reflow equivalente em 390 px, landmarks, nomes acessíveis, foco, axe e teclado foram validados.

## Critérios transversais

- um `main` e títulos hierárquicos;
- skip link, landmarks e breadcrumb nomeados;
- foco visível, Escape fecha drawer/dialog e setas movem tabs;
- labels e `aria-describedby` em campos complexos;
- loading usa `aria-busy`, erro usa `alert`, sucesso usa `status`;
- touch target mínimo e nenhuma ação apenas por hover;
- zoom 200% sem perda de tarefa; 400% nas jornadas essenciais;
- body sem overflow horizontal; regiões de tabela podem rolar com contexto preservado.
