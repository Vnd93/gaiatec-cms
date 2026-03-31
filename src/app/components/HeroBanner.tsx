import { useState, useEffect, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { useHeroSlides } from "../hooks/useSiteData";

const FALLBACK_SLIDES = [
  {
    label: "BIOGÁS E BIOMETANO",
    title: "Do Resíduo à Energia — Controle Técnico do Processo",
    description: "Instrumentação e automação para maximizar a produção, qualidade e aproveitamento do biogás.",
    cta: "Conhecer Soluções em Biogás",
    href: "/setores/biogas-biometano",
    image: "/images/heroes/1.1.png",
  },
  {
    label: "SANEAMENTO",
    title: "Macromedição Ultrassônica para Redes de Distribuição",
    description: "Tecnologia não-invasiva para monitoramento preciso de vazão em grandes diâmetros.",
    cta: "Conhecer Soluções em Saneamento",
    href: "/setores/saneamento",
    image: "/images/heroes/1.2.png",
  },
  {
    label: "AUTOMAÇÃO INDUSTRIAL",
    title: "Tecnologia de Ponta para Otimizar seus Processos Produtivos",
    description: "Controle, monitoramento e automação industrial integrados para aumentar a competitividade da sua planta.",
    cta: "Ver Soluções em Automação",
    href: "/setores/industria",
    image: "/images/heroes/1.3.png",
  },
  {
    label: "PROTEÇÃO CATÓDICA",
    title: "Integridade Metálica ao Longo do Tempo",
    description: "Sistemas eletroquímicos para prevenção e controle da corrosão em estruturas enterradas e submersas.",
    cta: "Conhecer Sistemas de Proteção Catódica",
    href: "/setores/protecao-catodica",
    image: "/images/heroes/1.4.png",
  },
  {
    label: "GÁS E PETRÓLEO",
    title: "Instrumentação de Alta Confiabilidade para Ambientes Críticos",
    description: "Soluções robustas para extração, refino e distribuição, garantindo segurança e eficiência em ambientes críticos.",
    cta: "Ver Soluções para Gás e Petróleo",
    href: "/setores/gas-petroleo",
    image: "/images/heroes/1.5.png",
  },
];

const INTERVAL = 6000;

export function HeroBanner() {
  const { slides: apiSlides, loading } = useHeroSlides();
  const slides = apiSlides.length > 0 ? apiSlides.map(s => ({
    label: s.label,
    title: s.titulo,
    description: s.descricao,
    cta: s.cta_texto,
    href: s.cta_link,
    image: s.imagem,
  })) : FALLBACK_SLIDES;

  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goTo = useCallback((index: number) => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setProgress(0);
    setCurrent(index);
    setTimeout(() => setIsTransitioning(false), 800);
  }, [isTransitioning]);

  const prev = () => goTo((current - 1 + slides.length) % slides.length);
  const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          next();
          return 0;
        }
        return p + (100 / (INTERVAL / 50));
      });
    }, 50);
    return () => clearInterval(timer);
  }, [next]);

  const prevIndex = (current - 1 + slides.length) % slides.length;
  const nextIndex = (current + 1) % slides.length;

  return (
    <section className="relative w-full overflow-hidden" style={{ height: "100vh", minHeight: "600px", maxHeight: "900px" }}>
      {/* Background images */}
      {slides.map((slide, i) => (
        <div
          key={i}
          className="absolute inset-0 transition-opacity duration-[800ms]"
          style={{ opacity: current === i ? 1 : 0 }}
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${slide.image})`,
              transform: current === i ? "scale(1.05)" : "scale(1)",
              transition: "transform 8s ease-out",
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        </div>
      ))}

      {/* Content */}
      <div className="relative h-full max-w-[1400px] mx-auto px-4 md:px-6 flex flex-col justify-end pb-28 md:pb-36">
        <div className="max-w-[700px]">
          <span
            className="inline-block text-[#FF6A00] text-[11px] md:text-[13px] tracking-[0.2em] uppercase mb-3 opacity-0 animate-[fadeInUp_0.6s_ease_0.2s_forwards]"
            key={`label-${current}`}
            style={{ fontWeight: 500 }}
          >
            {slides[current].label}
          </span>
          <h1
            className="text-white text-[32px] md:text-[48px] lg:text-[58px] leading-[1.05] mb-4 opacity-0 animate-[fadeInUp_0.6s_ease_0.4s_forwards]"
            key={`title-${current}`}
            style={{ fontWeight: 700, fontFamily: "'Knockout HTF68', sans-serif", textTransform: "uppercase" }}
          >
            {slides[current].title}
          </h1>
          <p
            className="text-white/80 text-[15px] md:text-[17px] leading-[1.6] mb-8 max-w-[500px] opacity-0 animate-[fadeInUp_0.6s_ease_0.6s_forwards]"
            key={`desc-${current}`}
          >
            {slides[current].description}
          </p>
          <a
            href={slides[current].href}
            className="inline-flex items-center gap-2 bg-transparent border-2 border-[#FF6A00] text-[#FF6A00] px-7 py-3 text-[13px] tracking-wider hover:bg-[#FF6A00] hover:text-black transition-all duration-300 opacity-0 animate-[fadeInUp_0.6s_ease_0.8s_forwards]"
            key={`cta-${current}`}
            style={{ fontWeight: 600 }}
          >
            {slides[current].cta} <ChevronRight size={14} />
          </a>
        </div>

        {/* Navigation */}
        <div className="absolute bottom-8 md:bottom-12 left-4 md:left-6 right-4 md:right-6 max-w-[1400px] mx-auto">
          <div className="flex items-center gap-4">
            <button
              onClick={prev}
              className="text-white/60 hover:text-white text-[12px] tracking-wider transition-colors flex items-center gap-2"
              style={{ fontWeight: 500 }}
            >
              Prev
              <span className="hidden md:inline text-[11px] text-white/40">{slides[prevIndex].title}</span>
            </button>

            {/* Timer bar */}
            <div className="flex-1 max-w-[120px] h-[2px] bg-white/20 mx-2">
              <div
                className="h-full bg-[#FF6A00] transition-[width] duration-[50ms] linear"
                style={{ width: `${progress}%` }}
              />
            </div>

            <button
              onClick={next}
              className="text-white/60 hover:text-white text-[12px] tracking-wider transition-colors flex items-center gap-2"
              style={{ fontWeight: 500 }}
            >
              <span className="hidden md:inline text-[11px] text-white/40">{slides[nextIndex].title}</span>
              Next
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </section>
  );
}