# Validação UX/UI da Fase 6

**Data:** 2026-08-29  
**Ambiente:** `http://127.0.0.1:5173`

## Página de produtos

A página foi inspecionada no navegador real em desktop (`1440 × 900`) e mobile (`390 × 844`).

Resultados:

- `scrollWidth = clientWidth` nos dois viewports;
- nenhum erro de console;
- um único `main`;
- hero, busca, filtros, card, CTA e footer adaptados sem corte;
- menu mobile abre semanticamente, expõe `aria-expanded` e fecha com Escape;
- busca vazia mostra estado sem resultado e pode ser limpa;
- filtros permanecem visíveis e operáveis;
- imagem e informações do produto preservam a fonte nova homologada das fases anteriores;
- contraste WCAG AA automatizado aprovado com a regra de cor ativa.

## Acessibilidade automatizada

O Playwright/Axe percorreu `/`, `/contato` e `/produtos` em desktop e mobile, sem violações sérias ou críticas. Também foram verificados:

- skip link e foco no conteúdo principal;
- fechamento do menu por teclado;
- restauração do scroll;
- nomes acessíveis de busca, filtros, comparação e CTAs;
- login administrativo privado e sem indexação.

## Estados administrativos e preview remoto

Sem sessão, `/admin/paginas` redirecionou corretamente para `/admin/login`, sem erro no console. Com a sessão própria do Super Admin e MFA, o builder e o preview foram inspecionados no staging real.

Resultados adicionais:

- criação, duplicação, reordenação e ocultação de bloco operáveis pelo teclado e mouse;
- bloco oculto ausente no preview e na resposta pública;
- preview restaurado em `412 × 915`, sem overflow (`scrollWidth = 412`);
- desktop com hierarquia, conteúdo e ações sem corte;
- rota retirada com estado 404 legível, sem conteúdo residual.

## Capturas

- [Produtos desktop](./evidencias/produtos-desktop.png)
- [Produtos mobile](./evidencias/produtos-mobile.png)

As capturas são evidência visual, não substituem os testes de contrato, acessibilidade, borda e banco.
