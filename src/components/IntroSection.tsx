import { useEffect, useRef } from 'react';
import { introServices } from '@/data/content';
import { useFadeIn } from '@/hooks/useScrollAnimation';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const HEADING_LINES = ['Líderes em', 'Automação', 'Industrial'];

function SplitHeading() {
  const containerRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chars = el.querySelectorAll<HTMLSpanElement>('.char');

    const anim = gsap.to(chars, {
      color: '#FFCC00',
      stagger: 0.03,
      ease: 'none',
      scrollTrigger: {
        trigger: el,
        start: 'top 70%',
        end: 'bottom 20%',
        scrub: true,
      },
    });

    return () => {
      anim.kill();
      ScrollTrigger.getAll().forEach((t) => {
        if (t.vars.trigger === el) t.kill();
      });
    };
  }, []);

  let charIndex = 0;

  return (
    <h2
      ref={containerRef}
      className="font-heading font-medium uppercase"
      style={{
        fontSize: 'clamp(60px, 9vw, 140px)',
        lineHeight: '0.9',
        marginBottom: '24px',
        color: '#000',
      }}
    >
      {HEADING_LINES.map((line, li) => (
        <span key={li} style={{ display: 'block' }}>
          {line.split('').map((char) => {
            const idx = charIndex++;
            return (
              <span
                key={idx}
                className="char"
                style={{ display: 'inline', transitionDuration: '0.2s' }}
              >
                {char === ' ' ? '\u00A0' : char}
              </span>
            );
          })}
        </span>
      ))}
    </h2>
  );
}

export default function IntroSection() {
  const rightRef = useFadeIn<HTMLDivElement>('right', 0.2);

  return (
    <section className="bg-white" style={{ padding: '120px 0' }}>
      <div className="w-full max-w-[1440px] mx-auto px-[30px]">
        <div className="flex flex-wrap" style={{ marginLeft: '-24px' }}>
          {/* LEFT — Sticky title, each word on its own line */}
          <div className="w-full lg:w-1/2" style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <div className="lg:sticky lg:top-[100px]">
              <span
                className="font-heading uppercase block text-primary"
                style={{ fontSize: '30px', letterSpacing: '0.7px', lineHeight: '45px', marginBottom: '24px' }}
              >
                Somos
              </span>
              <SplitHeading />
            </div>
          </div>

          {/* RIGHT — Description + service blocks */}
          <div className="w-full lg:w-1/2" style={{ paddingLeft: '24px', marginBottom: '24px' }}>
            <div ref={rightRef}>
              <p
                className="text-gray-text"
                style={{ fontSize: '20px', lineHeight: '36px', marginBottom: '24px' }}
              >
                Com mais de 20 anos de experiência, a Gaiatec Sistemas é referência em instrumentação
                e automação industrial no Brasil. Fornecemos equipamentos novos e usados, soluções de
                locação e suporte técnico especializado para os setores mais exigentes da indústria.
              </p>

              {introServices.map((svc) => (
                <div key={svc.title}>
                  <h3 style={{ marginTop: '60px', marginBottom: '24px' }}>
                    <a
                      href={svc.href}
                      className="font-heading font-medium uppercase text-primary inline-block relative hover:text-accent transition-colors duration-200"
                      style={{ fontSize: 'clamp(36px, 4vw, 60px)', lineHeight: '1.5', textUnderlineOffset: '3px' }}
                    >
                      {svc.title}
                    </a>
                  </h3>
                  <p
                    className="text-gray-text"
                    style={{ marginBottom: '24px', fontSize: '16px', lineHeight: '28.8px' }}
                  >
                    {svc.description}{'  '}
                    <strong>
                      <a
                        href={svc.href}
                        className="inline-block font-bold text-primary relative hover:text-accent transition-colors duration-200"
                        style={{ lineHeight: '24px', textUnderlineOffset: '3px' }}
                      >
                        Saiba mais →
                      </a>
                    </strong>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
