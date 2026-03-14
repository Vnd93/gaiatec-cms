import { useFadeIn } from '@/hooks/useScrollAnimation';
import { newsItems } from '@/data/content';
import { ArrowRight } from 'lucide-react';

export default function NewsSection() {
  const titleRef = useFadeIn<HTMLDivElement>('up');
  const featured = newsItems.find((n) => n.featured) ?? newsItems[0];
  const latest = newsItems.filter((n) => n.id !== featured.id).slice(0, 3);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

  return (
    <section id="noticias" className="py-16 md:py-24 bg-white">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* Title row */}
        <div ref={titleRef} className="flex items-end justify-between mb-12">
          <div>
            <span className="text-accent font-heading text-sm font-bold uppercase tracking-widest block mb-2">
              Noticias
            </span>
            <h2 className="font-heading text-4xl md:text-5xl font-bold text-primary uppercase">
              Ultimas Novidades
            </h2>
          </div>
          <a
            href="#"
            className="hidden md:inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-primary font-bold text-sm px-6 py-3 uppercase tracking-wider transition-colors"
          >
            Ver Todas
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Featured article — large */}
          <a href="#" className="group block relative overflow-hidden bg-secondary aspect-[4/3]">
            {/* Placeholder bg */}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
            <div className="absolute inset-0 flex items-center justify-center opacity-10">
              <span className="font-heading text-[12rem] font-bold text-white select-none">G</span>
            </div>

            {/* Category badge */}
            <div className="absolute top-4 left-4">
              <span className="inline-block bg-accent text-primary text-xs font-bold px-3 py-1.5 uppercase tracking-wider">
                {featured.category}
              </span>
            </div>

            {/* Content */}
            <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
              <time className="text-white/50 text-sm block mb-2">{formatDate(featured.date)}</time>
              <h3 className="font-heading text-2xl md:text-3xl font-bold text-white uppercase mb-3 group-hover:text-accent transition-colors">
                {featured.title}
              </h3>
              <p className="text-white/60 text-sm leading-relaxed line-clamp-3 max-w-md">
                {featured.excerpt}
              </p>
            </div>
          </a>

          {/* 3 latest articles — stacked grid */}
          <div className="flex flex-col gap-6">
            {latest.map((item) => (
              <a
                key={item.id}
                href="#"
                className="group flex gap-5 items-start"
              >
                {/* Thumbnail */}
                <div className="w-32 h-24 md:w-40 md:h-28 bg-secondary shrink-0 relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/80 to-secondary" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white/10 font-heading text-4xl font-bold select-none">G</span>
                  </div>
                  {/* Category badge */}
                  <span className="absolute top-2 left-2 bg-accent text-primary text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                    {item.category}
                  </span>
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0 py-1">
                  <time className="text-gray-muted text-xs block mb-1.5">{formatDate(item.date)}</time>
                  <h4 className="font-heading text-lg font-bold text-primary uppercase mb-2 line-clamp-2 group-hover:text-accent transition-colors">
                    {item.title}
                  </h4>
                  <p className="text-gray-light text-sm leading-relaxed line-clamp-2">
                    {item.excerpt}
                  </p>
                </div>
              </a>
            ))}
          </div>
        </div>

        {/* Mobile button */}
        <div className="mt-8 text-center md:hidden">
          <a
            href="#"
            className="inline-flex items-center gap-2 bg-accent text-primary font-bold text-sm px-6 py-3 uppercase tracking-wider"
          >
            Ver Todas as Noticias
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}
