Preciso que você refaça completamente a Section 2 do site Gaiatec para que fique idêntica ao site de referência energypower.com.au em tipografia, layout, animações de rolagem e comportamento visual.
**LAYOUT GERAL DA SECTION 2:**
- Fundo: branco (#FFFFFF)
- Padding: 120px top e bottom
- Container máximo: 1440px centralizado, com padding horizontal de 30px
- Layout em 2 colunas iguais (50% / 50%) usando flexbox, flexDirection: row
- Gap entre colunas: 24px (paddingLeft na coluna direita)
---
**COLUNA ESQUERDA — Sticky Title Block:**
Comportamento: `position: sticky; top: 100px` — fica fixada no viewport enquanto a coluna direita faz scroll.
Elemento 1 — Label superior:
- Texto: "WE ARE A" (em maiúsculas)
- Fonte: "Knockout HTF68", sans-serif (usar font-weight: 400)
- Tamanho: 30px
- Line-height: 45px (1.5x)
- Letter-spacing: 0.7px
- Color: #000000
- Display: block
- Margin-bottom: 24px
- text-transform: uppercase
Elemento 2 — Título principal (H2):
- Texto: "LEADING ENERGY SOLUTIONS PROVIDER" (tudo em maiúsculas, 4 linhas: LEADING / ENERGY / SOLUTIONS / PROVIDER)
- Fonte: "Knockout HTF68", sans-serif
- Tamanho: 160px
- Line-height: 136px (0.85)
- Font-weight: 500
- Color: #FFCC00 (amarelo)
- text-transform: uppercase
- margin-bottom: 24px
Cada letra do título deve ser um <span> individual para permitir a animação de cor por scroll (veja seção de animações abaixo).
---
**COLUNA DIREITA — Content Block (com scroll normal):**
Elemento 1 — Parágrafo introdutório (large-p):
- Fonte: Arial, sans-serif
- Tamanho: 20px
- Line-height: 36px (1.8x)
- Font-weight: 400
- Color: #000000
- Margin-bottom: 24px
Elementos 2-5 — Grupos de serviços (repetir 4x):
Cada grupo contém:
  a) Subtítulo H3:
  - Fonte: "Knockout HTF68", sans-serif
  - Tamanho: 60px
  - Line-height: 51px (0.85x)
  - Font-weight: 500
  - Color: #000000
  - text-transform: uppercase
  - margin-top: 60px
  - margin-bottom: 24px
  - O texto do H3 deve ser um <a> com display: inline-block, posição: relative
  - O link tem ::after pseudoelemento: content: "", position: absolute, bottom: 0, left: 0, height: 1px, width: 0%, background: #000, transition: 0.3s linear
  - No hover: width do ::after vai de 0% para 100% (underline animado)
  b) Parágrafo descritivo:
  - Fonte: Arial, sans-serif
  - Tamanho: 16px
  - Line-height: 28.8px (1.8x)
  - Font-weight: 400
  - Color: #000000
  - Margin-bottom: 24px
  c) Link "View the Range →" (dentro de <strong>):
  - Fonte: Arial, sans-serif
  - Tamanho: 16px
  - Font-weight: 700
  - Color: #000000
  - text-decoration: none
  - Mesmo comportamento de hover com ::after animado
Os 4 grupos são:
1. "NEW POWER SOLUTIONS" — desc: "We supply the full range of integrated power solutions, full turnkey installations, project management, service delivery, and support for a broad range of industries." — link: "View the Range →"
2. "RENTAL SOLUTIONS" — desc: "Our national rental capabilities provide short and long term solutions for Generators, Compressed Air and Temperature Control equipment with immediate availability." — link: "View the Range →"
3. "USED EQUIPMENT SOLUTIONS" — desc: "Get quality power systems at a fraction of the price. Explore the range of used equipment, including ex-rental fleet, dealer-certified, inspected, and tested by qualified engineers." — link: "View Inventory →"
4. "GAS PARTS & SERVICES" — desc: "We are the authorised Warranty, Parts and Service Dealer for all gas products. Learn about our full range of gas service capabilities." — link: "Learn More →"
---
**ANIMAÇÕES:**
1. FADE IN UP ao entrar no viewport (para todo o bloco):
- opacity: 0 → 1
- transform: translate3d(0, 25px, 0) → translate3d(0, 0, 0)
- duration: 1.25s
- easing: ease
- trigger: IntersectionObserver quando elemento entra em viewport com threshold 0.1
2. STICKY SCROLL — Coluna esquerda:
- Implementar com `position: sticky; top: 100px`
- A coluna esquerda fica visualmente travada enquanto o usuário rola a coluna direita
3. ANIMAÇÃO DE COR DAS LETRAS (scroll-triggered color change):
- Cada letra do H2 é um <span> com class "t"
- As letras "LEADING ENERGY SOLUTIONS" (parte preta) têm class adicional "f" → color: #000000
- As letras "PROVIDER" (parte amarela) → color: #FFCC00
- Todos os spans .t têm `transition: color 0.2s`
- Lógica JS: ao rolar, as letras mudam de cor progressivamente de acordo com o scroll progress, usando scrollY para calcular qual letra iluminar
- Implementar via IntersectionObserver ou requestAnimationFrame + scroll listener
- O efeito é: inicialmente as letras de LEADING ENERGY SOLUTIONS aparecem em preto, mas quando o título é o h2 com class js-textcolor, as letras que ainda não foram "alcançadas" pelo scroll ficam amarelas e as que já passaram ficam pretas
4. UNDERLINE HOVER nos links:
- ::after pseudo-element que expande de width: 0% → 100% com transition: 0.3s linear
- Aparece embaixo do texto do link ao hover
---
**CORES DO PROJETO:**
- Fundo da seção: #FFFFFF
- Texto padrão: #000000
- Amarelo accent: #FFCC00
- Label color: #000000
---
**FONTES:**
- Títulos e labels: "Knockout HTF68" (é uma fonte condensada bold — se não disponível, usar 'Oswald' ou 'Barlow Condensed' como fallback)
- Corpo de texto: Arial, sans-serif
---
Mantenha todo o conteúdo de texto atual da Section 2 do projeto Gaiatec, aplicando apenas as mudanças de estilo, tipografia, layout e animações descritas acima. O conteúdo (textos sobre Gaiatec) deve permanecer o mesmo — apenas adapte os estilos visuais para corresponder à referência energypower.com.au.