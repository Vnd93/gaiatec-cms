Como funciona o Sticky Scroll (coluna fixa + coluna rolavel)

  Estrutura HTML basica

  <div class="container" style="display: flex;">

    <!-- COLUNA ESQUERDA — fica fixa -->
    <div class="coluna-esquerda" style="width: 50%;">
      <div style="position: sticky; top: 100px;">
        <h2>Titulo que gruda</h2>
      </div>
    </div>

    <!-- COLUNA DIREITA — rola normalmente -->
    <div class="coluna-direita" style="width: 50%;">
      <p>Bloco 1...</p>
      <p>Bloco 2...</p>
      <p>Bloco 3...</p>
      <p>Bloco 4...</p>
      <!-- quanto mais conteudo aqui, mais tempo o sticky fica "grudado"
  -->
    </div>

  </div>

  As 3 regras obrigatorias

  1. position: sticky no elemento que quer fixar (nao no pai)
  2. top: Xpx — distancia do topo do viewport onde ele gruda (ex: top:
  100px para ficar abaixo de um header)
  3. A coluna direita precisa ser MAIS ALTA que a esquerda — o sticky so
  funciona enquanto o pai tem espaco pra rolar. Se as duas colunas tem a
  mesma altura, nao tem efeito visivel

  O que acontece no scroll

  Estado 1: Pagina no topo
  ┌──────────────────────────┐
  │ [TITULO]    │ Paragrafo  │  ← ambos visiveis
  │             │ Bloco 1    │
  │             │ Bloco 2    │
  │             │ Bloco 3    │
  └──────────────────────────┘

  Estado 2: Usuario rola pra baixo
  ┌──────────────────────────┐
  │ [TITULO]    │ Bloco 2    │  ← titulo GRUDOU no top:100px
  │  (sticky!)  │ Bloco 3    │    direita continua rolando
  │             │ Bloco 4    │
  └──────────────────────────┘

  Estado 3: Fim do conteudo da direita
  ┌──────────────────────────┐
  │             │ Bloco 4    │  ← titulo desgruda e sobe junto
  │ [TITULO]    │            │    porque o container pai acabou
  └──────────────────────────┘

  O que QUEBRA o sticky

  - overflow: hidden em qualquer pai — cria um scroll container e o sticky
  para de funcionar
  - overflow: auto/scroll — mesmo problema
  - Colunas com mesma altura — sem espaco extra, nao tem scroll pra grudar

  Exemplo minimo com Tailwind

  <section className="py-20">
    <div className="max-w-7xl mx-auto px-8 flex flex-wrap">

      {/* Esquerda — sticky */}
      <div className="w-full lg:w-1/2 px-4">
        <div className="lg:sticky lg:top-24">
          <h2 className="text-6xl font-bold">Meu Titulo</h2>
        </div>
      </div>

      {/* Direita — rola */}
      <div className="w-full lg:w-1/2 px-4">
        <div>Bloco 1</div>
        <div>Bloco 2</div>
        <div>Bloco 3</div>
        <div>Bloco 4</div>
      </div>

    </div>
  </section>

  Resumo

  ┌────────────────┬───────────────────────────┬───────────────────────┐
  │  Propriedade   │           Onde            │        Funcao         │
  ├────────────────┼───────────────────────────┼───────────────────────┤
  │ display: flex  │ Container pai             │ Coloca as colunas     │
  │                │                           │ lado a lado           │
  ├────────────────┼───────────────────────────┼───────────────────────┤
  │ position:      │ Elemento interno da       │ Gruda no viewport     │
  │ sticky         │ coluna esquerda           │                       │
  ├────────────────┼───────────────────────────┼───────────────────────┤
  │ top: 100px     │ Mesmo elemento sticky     │ Distancia do topo     │
  │                │                           │ onde gruda            │
  ├────────────────┼───────────────────────────┼───────────────────────┤
  │ Conteudo longo │ Coluna direita            │ Cria o espaco de      │
  │                │                           │ scroll                │
  └────────────────┴───────────────────────────┴───────────────────────┘

  E so isso. Nao precisa de JS — e 100% CSS.