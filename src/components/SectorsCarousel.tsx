import { useState, useCallback } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, Navigation } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import { sectors as fallbackSectors } from '@/data/content';
import { useSetores } from '@/hooks/useApi';
import { useFadeIn } from '@/hooks/useScrollAnimation';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Swiper as SwiperType } from 'swiper';

export default function SectorsCarousel() {
  const titleRef = useFadeIn<HTMLDivElement>('up');
  const [activeIndex, setActiveIndex] = useState(0);
  const { setores } = useSetores();

  // Use API data if available, fallback to hardcoded
  const sectors = setores.length > 0
    ? setores.map((s, i) => ({
        id: i + 1,
        name: s.titulo,
        description: s.descricao_curta || '',
        bgImage: s.imagem_url,
      }))
    : fallbackSectors;

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.realIndex);
  }, []);

  return (
    <section id="setores" className="relative py-20 md:py-28 bg-primary overflow-hidden">
      {/* Background image that changes with active slide */}
      <div className="absolute inset-0">
        {sectors.map((sector, i) => (
          <div
            key={sector.id}
            className="absolute inset-0 transition-opacity duration-700"
            style={{ opacity: i === activeIndex ? 1 : 0 }}
          >
            {/* Placeholder gradient since we don't have actual images */}
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, #1e1e1e ${i * 10}%, #000 100%)`,
              }}
            />
          </div>
        ))}
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/60" />
      </div>

      <div className="max-w-[1400px] mx-auto px-6 relative z-10">
        <div ref={titleRef} className="text-center mb-14">
          <span className="text-accent font-heading text-sm font-bold uppercase tracking-widest block mb-3">
            Setores de Atuacao
          </span>
          <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white uppercase">
            Presentes nos Maiores Setores
          </h2>
        </div>

        <Swiper
          modules={[Autoplay, Navigation]}
          spaceBetween={0}
          slidesPerView={1}
          navigation={{
            prevEl: '.sector-prev',
            nextEl: '.sector-next',
          }}
          autoplay={{ delay: 5000, disableOnInteraction: false }}
          onSlideChange={handleSlideChange}
          loop
          className="relative"
        >
          {sectors.map((sector) => (
            <SwiperSlide key={sector.id}>
              <div className="flex flex-col items-center text-center py-8 md:py-16 max-w-3xl mx-auto">
                <h3 className="font-heading text-3xl md:text-5xl font-bold text-white uppercase mb-6">
                  {sector.name}
                </h3>
                <p className="text-white/70 text-lg md:text-xl leading-relaxed mb-8 max-w-xl">
                  {sector.description}
                </p>
                <a
                  href="#"
                  className="inline-flex items-center gap-3 text-accent font-bold text-sm uppercase tracking-wider hover:gap-4 transition-all"
                >
                  Saiba Mais
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Circular nav buttons */}
        <button
          className="sector-prev absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-white/30 bg-black/40 flex items-center justify-center text-white hover:bg-accent hover:border-accent hover:text-primary transition-all"
          aria-label="Setor anterior"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          className="sector-next absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 w-12 h-12 md:w-14 md:h-14 rounded-full border-2 border-white/30 bg-black/40 flex items-center justify-center text-white hover:bg-accent hover:border-accent hover:text-primary transition-all"
          aria-label="Proximo setor"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Dots indicator */}
        <div className="flex items-center justify-center gap-2 mt-8">
          {sectors.map((_, i) => (
            <div
              key={i}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                i === activeIndex ? 'bg-accent w-8' : 'bg-white/30'
              }`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
