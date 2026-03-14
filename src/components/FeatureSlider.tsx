import { useState, useCallback, useEffect, useRef } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Autoplay, EffectFade } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/effect-fade';
import { featureSlides } from '@/data/content';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Swiper as SwiperType } from 'swiper';

const SLIDE_DURATION = 6000;

export default function FeatureSlider() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const swiperRef = useRef<SwiperType | null>(null);
  const progressRef = useRef<number>(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef<number>(Date.now());

  const handleSlideChange = useCallback((swiper: SwiperType) => {
    setActiveIndex(swiper.realIndex);
    setProgress(0);
    progressRef.current = 0;
    startTimeRef.current = Date.now();
  }, []);

  // Progress bar animation
  useEffect(() => {
    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const pct = Math.min((elapsed / SLIDE_DURATION) * 100, 100);
      setProgress(pct);
      progressRef.current = pct;
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafRef.current);
  }, [activeIndex]);

  return (
    <section className="relative bg-primary">
      <Swiper
        modules={[Autoplay, EffectFade]}
        effect="fade"
        autoplay={{ delay: SLIDE_DURATION, disableOnInteraction: false }}
        loop
        onSlideChange={handleSlideChange}
        onSwiper={(s) => { swiperRef.current = s; }}
        className="h-[70vh] md:h-[80vh]"
      >
        {featureSlides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <div className="relative h-full flex items-center">
              {/* Background */}
              <div className="absolute inset-0 bg-secondary" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center opacity-5">
                <span className="font-heading text-[20rem] font-bold text-white select-none">G</span>
              </div>

              {/* Content */}
              <div className="max-w-[1400px] mx-auto px-6 w-full relative z-10">
                <div className="max-w-2xl">
                  <span className="inline-block text-accent font-heading text-sm font-bold uppercase tracking-widest mb-4 border border-accent/30 px-4 py-1.5">
                    {slide.label}
                  </span>
                  <h2 className="font-heading text-4xl md:text-5xl lg:text-6xl font-bold text-white uppercase leading-[0.95] mb-6">
                    {slide.title}
                  </h2>
                  <p className="text-white/60 text-lg leading-relaxed mb-8 max-w-lg">
                    {slide.description}
                  </p>
                  <a
                    href={slide.ctaLink}
                    className="inline-flex items-center gap-3 bg-accent hover:bg-accent-hover text-primary font-bold px-8 py-4 uppercase tracking-wider transition-colors group"
                  >
                    {slide.cta}
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </a>
                </div>
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Bottom controls bar */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        {/* Progress bar */}
        <div className="slider-progress">
          <div className="slider-progress-bar" style={{ width: `${progress}%` }} />
        </div>

        {/* Slide counter + nav */}
        <div className="max-w-[1400px] mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-white/50 text-sm font-heading uppercase tracking-wider">
            {String(activeIndex + 1).padStart(2, '0')} / {String(featureSlides.length).padStart(2, '0')}
          </span>

          <div className="flex gap-3">
            <button
              onClick={() => swiperRef.current?.slidePrev()}
              className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:bg-accent hover:text-primary hover:border-accent transition-all"
              aria-label="Slide anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => swiperRef.current?.slideNext()}
              className="w-10 h-10 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:bg-accent hover:text-primary hover:border-accent transition-all"
              aria-label="Proximo slide"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
