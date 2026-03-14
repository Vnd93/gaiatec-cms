import { useFadeIn, useStaggerChildren } from '@/hooks/useScrollAnimation';
import { solutions } from '@/data/content';
import { ArrowRight } from 'lucide-react';

export default function InnovativeSolutions() {
  const titleRef = useFadeIn<HTMLDivElement>('up');
  const gridRef = useStaggerChildren<HTMLDivElement>(0.15);

  return (
    <section id="solucoes" className="py-16 md:py-24 bg-offwhite">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Title */}
        <div ref={titleRef} className="mb-12">
          <span className="text-accent font-heading text-sm font-bold uppercase tracking-widest block mb-2">
            Oferecemos
          </span>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary uppercase">
            Solucoes Inovadoras
          </h2>
        </div>

        {/* 3 Image Cards */}
        <div ref={gridRef} className="grid md:grid-cols-3 gap-6">
          {solutions.map((sol) => (
            <a
              key={sol.id}
              href={sol.href}
              className="group block relative overflow-hidden bg-secondary aspect-[3/4] md:aspect-[3/4]"
            >
              {/* Background placeholder */}
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center opacity-20">
                <span className="font-heading text-8xl font-bold text-white select-none">{sol.id}</span>
              </div>

              {/* Hover overlay */}
              <div className="absolute inset-0 bg-accent/0 group-hover:bg-accent/10 transition-colors duration-300" />

              {/* Content at bottom */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                <h3 className="font-heading text-2xl md:text-3xl font-bold text-white uppercase mb-3 group-hover:text-accent transition-colors">
                  {sol.title}
                </h3>
                <p className="text-white/70 text-sm leading-relaxed mb-4 max-w-sm">
                  {sol.description}
                </p>
                <span className="inline-flex items-center gap-2 text-accent font-bold text-sm uppercase tracking-wider group-hover:gap-3 transition-all">
                  Saiba Mais
                  <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
