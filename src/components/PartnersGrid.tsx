import { useFadeIn, useStaggerChildren } from '@/hooks/useScrollAnimation';
import { partners } from '@/data/content';

export default function PartnersGrid() {
  const titleRef = useFadeIn<HTMLDivElement>('up');
  const gridRef = useStaggerChildren<HTMLDivElement>(0.08);

  return (
    <section className="py-16 md:py-24 bg-white">
      <div className="max-w-[1400px] mx-auto px-6">
        <div ref={titleRef} className="text-center mb-12">
          <span className="text-accent font-heading text-sm font-bold uppercase tracking-widest block mb-2">
            Parceiros
          </span>
          <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary uppercase mb-4">
            Nossos Parceiros
          </h2>
          <p className="text-gray-text text-lg max-w-2xl mx-auto">
            Representamos oficialmente as maiores marcas mundiais em instrumentacao e automacao industrial.
          </p>
        </div>

        {/* Logo row — 5 items in a row like EPSA */}
        <div
          ref={gridRef}
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-0 border border-black/10"
        >
          {partners.map((name) => (
            <div
              key={name}
              className="flex items-center justify-center h-24 md:h-28 border border-black/10 bg-white hover:bg-offwhite transition-colors cursor-pointer group"
            >
              <span className="text-gray-muted font-bold text-sm uppercase tracking-wider text-center group-hover:text-primary transition-colors">
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
