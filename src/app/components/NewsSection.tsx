import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { useMemo } from "react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useBlogPosts } from "../hooks/useSiteData";

/* ────────────────────────────────────────────────────────
   FALLBACK — usado se ainda não existem posts publicados.
   Pedro publica em /marketing/blog (tabela blog_posts) e
   eles aparecem aqui automaticamente, ordenados por data.
   ──────────────────────────────────────────────────────── */
const FALLBACK_NEWS = [
  {
    title: "Como Escolher o Medidor de Vazão Ideal para a Sua Aplicação",
    category: "Instrumentação",
    description: "Descubra os critérios técnicos para selecionar entre medidores ultrassônicos, eletromagnéticos e de deslocamento positivo.",
    image: "/images/blog/6.2.png",
    href: "/blog",
  },
  {
    title: "Implantação de Sistema de Macromedição Ultrassônica em Rede Municipal",
    category: "Estudo de Caso",
    description: "Como a Gaiatec reduziu as perdas de água não faturada em 18% com medidores clamp-on em adutoras de grande diâmetro.",
    image: "/images/blog/6.3.png",
    href: "/blog",
  },
  {
    title: "Biometano: A Revolução do Gás Renovável no Brasil e o Papel da Instrumentação",
    category: "Biogás",
    description: "O mercado de biometano brasileiro cresce acelerado. Entenda como a instrumentação é fundamental para garantir qualidade e segurança.",
    image: "/images/blog/6.4.png",
    href: "/blog",
  },
];

export function NewsSection() {
  const { posts } = useBlogPosts();

  const featuredNews = useMemo(() => {
    if (!posts || posts.length === 0) return FALLBACK_NEWS;
    return posts.slice(0, 3).map((p) => ({
      title: p.titulo,
      category: (p as unknown as { categoria_nome?: string }).categoria_nome || "Blog",
      description: p.resumo || "",
      image: p.imagem_url || "/images/blog/6.2.png",
      href: `/blog/${p.slug}`,
    }));
  }, [posts]);

  return (
    <section className="bg-white py-16 md:py-24" id="news">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">
        {/* Header */}
        <AnimateOnScroll>
          <div className="flex items-end justify-between mb-10">
            <div>
              <span className="text-[#0057DE] text-[12px] tracking-[0.15em] uppercase mb-2 block" style={{ fontWeight: 600 }}>
                BLOG TÉCNICO
              </span>
              <h2 className="text-[28px] md:text-[40px] text-black" style={{ fontWeight: 700, fontFamily: "'Knockout HTF68', sans-serif", textTransform: "uppercase", lineHeight: "1.1" }}>
                Conteúdo Técnico e Institucional
              </h2>
              <p className="text-[#666] text-[15px] mt-2 max-w-[600px]">
                Artigos, estudos de caso e novidades do setor industrial, biogás, saneamento e automação.
              </p>
            </div>
            <Link
              to="/blog"
              className="hidden md:inline-flex items-center gap-2 border border-[#0057DE] text-[#0057DE] px-5 py-2 text-[12px] tracking-wider hover:bg-[#0057DE] hover:text-black transition-all"
              style={{ fontWeight: 600 }}
            >
              Ver Todos os Artigos <ChevronRight size={12} />
            </Link>
          </div>
        </AnimateOnScroll>

        {/* Featured news cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          {featuredNews.map((news, i) => (
            <AnimateOnScroll key={`${news.title}-${i}`} direction="up" delay={i * 0.1}>
              <Link to={news.href} className="group block relative overflow-hidden" style={{ minHeight: "400px" }}>
                <div className="absolute inset-0">
                  <ImageWithFallback
                    src={news.image}
                    alt={news.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                </div>
                <div className="relative h-full flex flex-col justify-end p-6" style={{ minHeight: "400px" }}>
                  <span className="text-[#0057DE] text-[11px] tracking-[0.15em] uppercase mb-2" style={{ fontWeight: 500 }}>
                    {news.category}
                  </span>
                  <h3 className="text-white text-[20px] md:text-[24px] leading-[1.2] mb-3" style={{ fontWeight: 700 }}>
                    {news.title}
                  </h3>
                  <p className="text-white/60 text-[13px] mb-4 line-clamp-2">
                    {news.description}
                  </p>
                  <div className="flex items-center gap-2 text-[#0057DE] text-[13px]" style={{ fontWeight: 600 }}>
                    Ler artigo <ChevronRight size={14} />
                  </div>
                </div>
              </Link>
            </AnimateOnScroll>
          ))}
        </div>

        {/* Mobile CTA */}
        <div className="md:hidden text-center">
          <Link
            to="/blog"
            className="inline-flex items-center gap-2 border border-[#0057DE] text-[#0057DE] px-5 py-2 text-[12px] tracking-wider hover:bg-[#0057DE] hover:text-black transition-all"
            style={{ fontWeight: 600 }}
          >
            Ver Todos os Artigos <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    </section>
  );
}
