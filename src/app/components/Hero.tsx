import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Leaf, Fan, Settings, Thermometer } from 'lucide-react';
import biodigestorImage from 'figma:asset/2cc791faa9578fb444798ba35a0133ab9b7d6591.png';
import automacaoImage from 'figma:asset/c02efa1f274060e3e89707ed472bb202fea81155.png';
import sistemasTermicosImage from 'figma:asset/df0961e579bc6eb45a5d75e2495871da24f5bbaf.png';

interface HeroSlideData {
  image: string;
  title: string;
  badge: string;
  icon: any;
  description: string;
}

const SLIDE_DURATION = 5000;
const TICK_MS = 100;

const slides: HeroSlideData[] = [
  {
    image: biodigestorImage,
    title: 'Biodigestor GT-biodigest',
    badge: 'Energia Renovável',
    icon: Leaf,
    description: 'Tecnologia avançada para produção de biogás e biometano, transformando resíduos orgânicos em energia limpa e sustentável.',
  },
  {
    image: '/images/pages/2.6.png',
    title: 'HVAC',
    badge: 'Climatização Industrial',
    icon: Fan,
    description: 'Soluções completas em climatização e ventilação industrial para garantir a qualidade do ar e eficiência energética.',
  },
  {
    image: automacaoImage,
    title: 'Automação Industrial',
    badge: 'Tecnologia e Controle',
    icon: Settings,
    description: 'Tecnologia de ponta para otimizar processos produtivos e aumentar a competitividade da sua indústria.',
  },
  {
    image: sistemasTermicosImage,
    title: 'Sistemas Térmicos',
    badge: 'Controle de Temperatura',
    icon: Thermometer,
    description: 'Controle preciso de temperatura e umidade para ambientes críticos e processos industriais complexos.',
  },
];

export const Hero = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [progress, setProgress] = useState(0);

  const goTo = useCallback((index: number) => {
    setCurrentSlide(((index % slides.length) + slides.length) % slides.length);
    setProgress(0);
  }, []);

  const next = useCallback(() => goTo(currentSlide + 1), [currentSlide, goTo]);
  const prev = useCallback(() => goTo(currentSlide - 1), [currentSlide, goTo]);

  // Auto-advance + progress bar
  useEffect(() => {
    setProgress(0);
    const interval = setInterval(() => {
      setProgress((prev) => {
        const nextValue = prev + (100 / (SLIDE_DURATION / TICK_MS));
        if (nextValue >= 100) {
          setCurrentSlide((c) => (c + 1) % slides.length);
          return 0;
        }
        return nextValue;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [currentSlide]);

  const slide = slides[currentSlide];

  return (
    <section className="relative w-full overflow-hidden">
      <div className="relative h-[500px] md:h-[600px] w-full overflow-hidden">
        <AnimatePresence mode="sync">
          <motion.div
            key={`bg-${currentSlide}`}
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{
              opacity: { duration: 0.8, ease: 'easeInOut' },
              scale: { duration: 6, ease: 'easeOut' },
            }}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${slide.image})` }}
          />
        </AnimatePresence>

        {/* Overlay mais sutil */}
        <div className="absolute inset-0 bg-gradient-to-r from-gray-900/85 via-gray-900/60 to-transparent z-[1]" />

        <div className="container mx-auto h-full px-6 md:px-12 relative z-10 flex items-center">
          <div className="max-w-2xl">
            {/* Badge animado */}
            <motion.div
              key={`badge-${currentSlide}`}
              className="inline-flex items-center gap-2.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 mb-5"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
            >
              <span className="text-white font-semibold text-[10px] uppercase tracking-widest">{slide.badge}</span>
            </motion.div>

            {/* Título principal com animação letra por letra */}
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-5 leading-tight">
              {slide.title.split('').map((char, index) => (
                <motion.span
                  key={`char-${currentSlide}-${index}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.3,
                    delay: 0.4 + index * 0.03,
                    ease: 'easeOut',
                  }}
                  style={{ display: 'inline-block' }}
                >
                  {char === ' ' ? ' ' : char}
                </motion.span>
              ))}
            </h1>

            {/* Descrição */}
            <motion.p
              key={`desc-${currentSlide}`}
              className="text-base md:text-lg text-gray-200 mb-8 leading-relaxed font-normal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.8 }}
            >
              {slide.description}
            </motion.p>

            {/* CTAs */}
            <motion.div
              key={`cta-${currentSlide}`}
              className="flex flex-col sm:flex-row gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 1 }}
            >
              <button className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2 text-sm rounded-md shadow transition-all">
                Solicitar Orçamento
              </button>
              <button className="inline-flex items-center justify-center bg-transparent border border-white text-white hover:bg-white hover:text-gray-900 font-semibold px-5 py-2 text-sm rounded-md transition-all">
                Conheça Nossas Soluções
              </button>
            </motion.div>
          </div>
        </div>
      </div>

      {/* Custom Navigation Controls */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 flex items-center gap-12">
        {/* Previous Button */}
        <button
          onClick={prev}
          className="w-10 h-10 flex items-center justify-center bg-transparent hover:bg-white/10 transition-all rounded-full"
          aria-label="Slide anterior"
        >
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20.3227 7.02533C20.875 7.02533 21.3227 7.47304 21.3227 8.02533C21.3227 8.57761 20.875 9.02533 20.3227 9.02533L20.3227 7.02533ZM1.02065 8.73244C0.630131 8.34191 0.630131 7.70875 1.02065 7.31822L7.38462 0.954263C7.77514 0.563739 8.40831 0.563738 8.79883 0.954263C9.18935 1.34479 9.18935 1.97795 8.79883 2.36848L3.14198 8.02533L8.79883 13.6822C9.18935 14.0727 9.18935 14.7059 8.79883 15.0964C8.40831 15.4869 7.77514 15.4869 7.38462 15.0964L1.02065 8.73244ZM20.3227 9.02533L1.72776 9.02533L1.72776 7.02533L20.3227 7.02533L20.3227 9.02533Z" fill="white"/>
          </svg>
        </button>

        {/* Dots Indicator */}
        <div className="flex items-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => goTo(index)}
              className={`relative h-1 rounded-full overflow-hidden transition-all duration-300 ${
                currentSlide === index ? 'w-9' : 'w-1'
              }`}
              aria-label={`Ir para slide ${index + 1}`}
            >
              <div className="absolute inset-0 bg-white/30" />
              {currentSlide === index && (
                <div
                  className="absolute inset-0 bg-white transition-all duration-100 ease-linear"
                  style={{
                    width: `${progress}%`,
                    transformOrigin: 'left',
                  }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Next Button */}
        <button
          onClick={next}
          className="w-10 h-10 flex items-center justify-center bg-transparent hover:bg-white/10 transition-all rounded-full"
          aria-label="Próximo slide"
        >
          <svg width="22" height="16" viewBox="0 0 22 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M1.72791 7.02533C1.17562 7.02533 0.727905 7.47304 0.727905 8.02533C0.727905 8.57761 1.17562 9.02533 1.72791 9.02533L1.72791 7.02533ZM21.0299 8.73244C21.4205 8.34191 21.4205 7.70875 21.0299 7.31822L14.666 0.954263C14.2755 0.563739 13.6423 0.563738 13.2518 0.954263C12.8612 1.34479 12.8612 1.97795 13.2518 2.36848L18.9086 8.02533L13.2518 13.6822C12.8612 14.0727 12.8612 14.7059 13.2518 15.0964C13.6423 15.4869 14.2755 15.4869 14.666 15.0964L21.0299 8.73244ZM1.72791 9.02533L20.3228 9.02533L20.3228 7.02533L1.72791 7.02533L1.72791 9.02533Z" fill="white"/>
          </svg>
        </button>
      </div>
    </section>
  );
};
