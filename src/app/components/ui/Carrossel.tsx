import { useState, useEffect, useCallback, type ReactNode } from "react";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

interface CarrosselProps {
  slides: ReactNode[];
  overline?: string;
  title?: string;
  /** Tailwind flex-basis das colunas (largura dos slides). */
  slideClass?: string;
}

/**
 * Carrossel reutilizável (embla) — track arrastável + setas (desktop) + dots (mobile).
 * O conteúdo de cada slide é fornecido pelo consumidor via `slides`.
 */
export function Carrossel({
  slides,
  overline,
  title,
  slideClass = "flex-[0_0_86%] sm:flex-[0_0_48%] lg:flex-[0_0_31.5%]",
}: CarrosselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", loop: false });
  const [selected, setSelected] = useState(0);
  const [snaps, setSnaps] = useState<number[]>([]);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelected(emblaApi.selectedScrollSnap());
    setCanPrev(emblaApi.canScrollPrev());
    setCanNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    setSnaps(emblaApi.scrollSnapList());
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  const btn =
    "w-11 h-11 inline-flex items-center justify-center border border-slate-300 text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE] disabled:opacity-30";

  return (
    <div>
      {(overline || title) && (
        <div className="flex items-end justify-between gap-6" style={{ marginBottom: 36 }}>
          <div>
            {overline && (
              <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 14 }}>
                {overline}
              </span>
            )}
            {title && (
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.6vw, 46px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a" }}>
                {title}
              </h2>
            )}
          </div>
          <div className="hidden md:flex items-center gap-2" style={{ flexShrink: 0 }}>
            <button type="button" aria-label="Anterior" onClick={() => emblaApi?.scrollPrev()} disabled={!canPrev} className={btn}>
              <ChevronLeft size={18} />
            </button>
            <button type="button" aria-label="Próximo" onClick={() => emblaApi?.scrollNext()} disabled={!canNext} className={btn}>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      <div ref={emblaRef} className="overflow-hidden">
        <div className="flex" style={{ gap: 24 }}>
          {slides.map((slide, i) => (
            <div key={i} className={slideClass}>
              {slide}
            </div>
          ))}
        </div>
      </div>

      {snaps.length > 1 && (
        <div className="flex items-center gap-2 md:hidden" style={{ marginTop: 24 }}>
          {snaps.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para ${i + 1}`}
              onClick={() => emblaApi?.scrollTo(i)}
              style={{ width: i === selected ? 24 : 8, height: 8, borderRadius: 999, background: i === selected ? BRAND : "#cbd5e1", transition: "all 0.3s ease" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
