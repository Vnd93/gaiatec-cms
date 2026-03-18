import { useFadeIn, useStaggerChildren } from '@/hooks/useScrollAnimation';
import { products as fallbackProducts } from '@/data/content';
import { useProdutos } from '@/hooks/useApi';
import { ArrowRight } from 'lucide-react';

export default function ProductsGrid() {
  const titleRef = useFadeIn<HTMLDivElement>('up');
  const gridRef = useStaggerChildren<HTMLDivElement>(0.15);
  const { produtos } = useProdutos();

  // Use API data if available, fallback to hardcoded
  const products = produtos.length > 0
    ? produtos.slice(0, 6).map((p) => ({
        id: p.slug,
        name: p.titulo_site || p.nome,
        specs: p.categorias_site || [],
        image: p.imagem_principal,
        description: p.descricao_curta || '',
      }))
    : fallbackProducts.map(p => ({ ...p, id: String(p.id), image: null as string | null, description: '' }));

  return (
    <section id="produtos" className="py-16 md:py-24 bg-offwhite">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Title row */}
        <div ref={titleRef} className="flex items-end justify-between mb-12">
          <div>
            <span className="text-accent font-heading text-sm font-bold uppercase tracking-widest block mb-2">
              Nossos Equipamentos
            </span>
            <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary uppercase">
              Produtos
            </h2>
          </div>
          <a
            href="#"
            className="hidden md:inline-flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider hover:text-accent hover:gap-3 transition-all"
          >
            Ver Todos
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        {/* Product Cards */}
        <div ref={gridRef} className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {products.map((product) => (
            <div
              key={product.id}
              className="group bg-white border border-black/5 overflow-hidden hover:shadow-[0_8px_30px_rgba(0,0,0,0.12)] transition-all duration-300"
            >
              {/* Image */}
              <div className="aspect-[16/10] bg-secondary relative overflow-hidden">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="absolute inset-0 w-full h-full object-cover" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                {!product.image && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/20 font-heading text-6xl font-bold uppercase select-none">G</span>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-6">
                <h3 className="font-heading text-xl font-bold text-primary uppercase mb-4 group-hover:text-accent transition-colors">
                  {product.name}
                </h3>

                {/* Spec list or description */}
                {product.specs.length > 0 ? (
                  <ul className="space-y-1.5 mb-6">
                    {product.specs.slice(0, 4).map((spec) => (
                      <li key={spec} className="flex items-center gap-2 text-gray-text text-sm">
                        <div className="w-1.5 h-1.5 bg-accent shrink-0" />
                        {spec}
                      </li>
                    ))}
                  </ul>
                ) : product.description ? (
                  <p className="text-gray-text text-sm mb-6 line-clamp-3">{product.description}</p>
                ) : null}

                {/* Two buttons */}
                <div className="flex gap-3">
                  <a
                    href="#"
                    className="flex-1 text-center bg-accent hover:bg-accent-hover text-primary font-bold text-sm py-3 uppercase tracking-wider transition-colors"
                  >
                    Ver Detalhes
                  </a>
                  <a
                    href="#contato"
                    className="flex-1 text-center border-2 border-primary text-primary hover:bg-primary hover:text-white font-bold text-sm py-3 uppercase tracking-wider transition-colors"
                  >
                    Solicitar Orcamento
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Mobile view all */}
        <div className="mt-8 text-center md:hidden">
          <a
            href="#"
            className="inline-flex items-center gap-2 text-primary font-bold text-sm uppercase tracking-wider hover:text-accent transition-colors"
          >
            Ver Todos os Produtos
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
