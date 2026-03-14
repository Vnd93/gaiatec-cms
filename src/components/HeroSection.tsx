import { useState, useEffect, useCallback, useRef } from 'react';
import { featureSlides } from '@/data/content';
import { ArrowRight } from 'lucide-react';
import gsap from 'gsap';

const AUTOPLAY_MS = 6000;

export default function HeroSection() {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);
  const startRef = useRef(Date.now());

  const total = featureSlides.length;
  const slide = featureSlides[current];

  const prevSlide = (current - 1 + total) % total;
  const nextSlide = (current + 1) % total;

  const animateContent = useCallback(() => {
    if (!contentRef.current) return;
    gsap.fromTo(
      contentRef.current.children,
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power3.out' }
    );
  }, []);

  const goTo = useCallback((idx: number) => {
    setCurrent(idx);
    setProgress(0);
    startRef.current = Date.now();
    animateContent();
  }, [animateContent]);

  const goPrev = useCallback(() => goTo(prevSlide), [goTo, prevSlide]);
  const goNext = useCallback(() => goTo(nextSlide), [goTo, nextSlide]);

  // Autoplay + progress
  useEffect(() => {
    startRef.current = Date.now();
    animateContent();

    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min(elapsed / AUTOPLAY_MS, 1);
      setProgress(pct);
      if (pct >= 1) {
        setCurrent((c) => (c + 1) % total);
        startRef.current = Date.now();
        setProgress(0);
        animateContent();
      }
    };

    timerRef.current = setInterval(tick, 50);
    return () => clearInterval(timerRef.current);
  }, [total, animateContent]);

  return (
    <section className="relative bg-black overflow-hidden" style={{ minHeight: '100vh' }}>
      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-opacity duration-700"
        style={{
          backgroundImage: `url(${slide.bgImage})`,
          backgroundColor: '#1e1e1e',
        }}
      />
      {/* Dark gradient overlay from bottom */}
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.15) 65%, rgba(0,0,0,0.075) 75.5%, rgba(0,0,0,0.037) 82.85%, rgba(0,0,0,0.019) 88%, rgba(0,0,0,0) 100%)',
        }}
      />

      {/* Content container — bottom-aligned */}
      <div
        className="relative flex items-end w-full"
        style={{ minHeight: '100vh', paddingTop: '200px', paddingBottom: '120px' }}
      >
        <div className="w-full max-w-[1440px] mx-auto px-[30px]">
          <div className="relative">
            {/* Left: Slide content */}
            <div
              ref={contentRef}
              className="flex flex-col items-start justify-end max-w-[710px] relative z-[2]"
            >
              {/* Yellow label */}
              <span
                className="text-accent font-bold uppercase tracking-[0.7px] mb-5 block"
                style={{ fontSize: '14px', lineHeight: '21px' }}
              >
                {slide.label}
              </span>

              {/* HUGE heading */}
              <h2
                className="font-heading text-white font-medium uppercase mb-6"
                style={{ fontSize: 'clamp(48px, 7vw, 110px)', lineHeight: '0.85' }}
              >
                {slide.title}
              </h2>

              {/* Description */}
              <p
                className="text-white max-w-[570px] mb-6"
                style={{ fontSize: '20px', lineHeight: '30px' }}
              >
                {slide.description}
              </p>

              {/* CTA Button — EPSA style: text + arrow box */}
              <a
                href={slide.ctaLink}
                className="inline-flex items-stretch group mt-1"
              >
                <span
                  className="bg-accent text-primary border border-accent font-medium inline-flex items-center transition-colors duration-300 group-hover:bg-white group-hover:border-white"
                  style={{ fontSize: '15px', lineHeight: '15px', padding: '8px 9px' }}
                >
                  {slide.cta}
                </span>
                <span
                  className="bg-accent border border-accent flex items-center justify-center transition-colors duration-300 group-hover:bg-white group-hover:border-white"
                  style={{ width: '33px' }}
                >
                  <ArrowRight className="w-4 h-4 text-primary" />
                </span>
              </a>

              {/* Spacer */}
              <div className="h-10 w-full" />
            </div>

            {/* Right bottom: Prev / Progress / Next */}
            <div
              className="absolute bottom-0 right-0 flex items-center z-10"
              style={{ fontSize: '15px', lineHeight: '15px' }}
            >
              {/* Prev */}
              <button
                onClick={goPrev}
                className="relative text-white cursor-pointer mr-3 hover:text-accent transition-colors group"
                style={{ lineHeight: '16px' }}
              >
                <span>Prev</span>
                <span
                  className="absolute left-0 top-[26px] text-white text-sm opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300 w-[240px]"
                  style={{ lineHeight: '19.6px' }}
                >
                  {featureSlides[prevSlide].title}
                </span>
              </button>

              {/* Progress bar */}
              <div
                className="relative bg-white/20 overflow-hidden"
                style={{ width: '150px', height: '3px' }}
              >
                <div
                  className="h-full bg-accent"
                  style={{ width: `${progress * 100}%`, transition: 'width 50ms linear' }}
                />
              </div>

              {/* Next */}
              <button
                onClick={goNext}
                className="relative text-white cursor-pointer ml-3 hover:text-accent transition-colors group"
                style={{ lineHeight: '16px' }}
              >
                <span>Next</span>
                <span
                  className="absolute right-0 top-[26px] text-white text-sm opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-300 w-[240px] text-right"
                  style={{ lineHeight: '19.6px' }}
                >
                  {featureSlides[nextSlide].title}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
