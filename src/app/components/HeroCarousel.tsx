import { useState, useEffect, useCallback } from "react";
import { ChevronRight } from "lucide-react";
import { optimizedBg } from "./ResponsiveImage";

export interface HeroSlide {
  label: string;
  title: string;
  description: string;
  cta: string;
  href: string;
  image: string;
}

const INTERVAL = 6000;

/**
 * Carrossel de hero full-screen (mesmo padrão da home / HeroBanner):
 * auto-avanço com barra de progresso, navegação Prev/Next com títulos
 * adjacentes, crossfade entre slides e imagens responsivas AVIF/WebP.
 */
export function HeroCarousel({ slides }: { slides: HeroSlide[] }) {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const goTo = useCallback(
    (index: number) => {
      if (isTransitioning) return;
      setIsTransitioning(true);
      setProgress(0);
      setCurrent(index);
      setTimeout(() => setIsTransitioning(false), 800);
    },
    [isTransitioning]
  );

  const prev = () => goTo((current - 1 + slides.length) % slides.length);
  const next = useCallback(() => goTo((current + 1) % slides.length), [current, goTo, slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          next();
          return 0;
        }
        return p + 100 / (INTERVAL / 50);
      });
    }, 50);
    return () => clearInterval(timer);
  }, [next, slides.length]);

  if (slides.length === 0) return null;

  const prevIndex = (current - 1 + slides.length) % slides.length;
  const nextIndex = (current + 1) % slides.length;

  return (
    <section className="relative w-full overflow-hidden" style={{ height: "100vh", minHeight: "600px", maxHeight: "900px" }}>
      {slides.map((slide, i) => {
        const isVisible = i === current || i === nextIndex || i === 0;
        return (
          <div key={i} className="absolute inset-0 transition-opacity duration-[800ms]" style={{ opacity: current === i ? 1 : 0 }}>
            {isVisible && (
              <div className="absolute inset-0 overflow-hidden" style={{ transform: current === i ? "scale(1.05)" : "scale(1)", transition: "transform 8s ease-out" }}>
                <picture>
                  <source type="image/avif" srcSet={`${optimizedBg(slide.image, 480, "avif")} 480w, ${optimizedBg(slide.image, 1024, "avif")} 1024w, ${optimizedBg(slide.image, 1920, "avif")} 1920w`} sizes="100vw" />
                  <source type="image/webp" srcSet={`${optimizedBg(slide.image, 480, "webp")} 480w, ${optimizedBg(slide.image, 1024, "webp")} 1024w, ${optimizedBg(slide.image, 1920, "webp")} 1920w`} sizes="100vw" />
                  <img
                    src={optimizedBg(slide.image, 1024, "webp")}
                    alt=""
                    loading={i === 0 ? "eager" : "lazy"}
                    decoding={i === 0 ? "sync" : "async"}
                    // @ts-expect-error fetchpriority é válido
                    fetchpriority={i === 0 ? "high" : undefined}
                    className="w-full h-full object-cover object-center"
                  />
                </picture>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
          </div>
        );
      })}

      <div className="relative h-full max-w-[1400px] mx-auto px-4 md:px-6 flex flex-col justify-end pb-28 md:pb-36">
        <div className="max-w-[700px]">
          <span
            className="inline-block text-[#0057DE] text-[11px] md:text-[13px] tracking-[0.2em] uppercase mb-3 opacity-0 animate-[fadeInUp_0.6s_ease_0.2s_forwards]"
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
            className="inline-flex items-center gap-2 bg-transparent border-2 border-[#0057DE] text-white px-7 py-3 text-[13px] tracking-wider hover:bg-[#0057DE] hover:text-white transition-all duration-300 opacity-0 animate-[fadeInUp_0.6s_ease_0.8s_forwards]"
            key={`cta-${current}`}
            style={{ fontWeight: 600 }}
          >
            {slides[current].cta} <ChevronRight size={14} />
          </a>
        </div>

        {slides.length > 1 && (
          <div className="absolute bottom-8 md:bottom-12 left-4 md:left-6 right-4 md:right-6 max-w-[1400px] mx-auto">
            <div className="flex items-center gap-4">
              <button onClick={prev} className="text-white/60 hover:text-white text-[12px] tracking-wider transition-colors flex items-center gap-2" style={{ fontWeight: 500 }}>
                Prev
                <span className="hidden md:inline text-[11px] text-white/40">{slides[prevIndex].title}</span>
              </button>

              <div className="flex-1 max-w-[120px] h-[2px] bg-white/20 mx-2">
                <div className="h-full bg-[#0057DE] transition-[width] duration-[50ms] linear" style={{ width: `${progress}%` }} />
              </div>

              <button onClick={next} className="text-white/60 hover:text-white text-[12px] tracking-wider transition-colors flex items-center gap-2" style={{ fontWeight: 500 }}>
                <span className="hidden md:inline text-[11px] text-white/40">{slides[nextIndex].title}</span>
                Next
              </button>
            </div>
          </div>
        )}
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
