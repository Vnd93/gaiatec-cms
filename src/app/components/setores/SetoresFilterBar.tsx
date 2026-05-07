import { useState, useEffect } from "react";

interface SetoresFilterBarProps {
  setores: { slug: string; titulo: string }[];
}

/**
 * Barra sticky de filtros de setor (TASK 8).
 *
 * Click em um botão → scroll suave até #setor-[slug].
 * Click em "Ver Todos" → scroll para o topo da listagem.
 * Mobile: vira carrossel horizontal com snap.
 */
export function SetoresFilterBar({ setores }: SetoresFilterBarProps) {
  const [activeSlug, setActiveSlug] = useState<string | null>(null);

  // IntersectionObserver para destacar setor visível durante scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const slug = entry.target.id.replace("setor-", "");
            setActiveSlug(slug);
          }
        });
      },
      { rootMargin: "-30% 0px -50% 0px", threshold: 0 }
    );

    setores.forEach((s) => {
      const el = document.getElementById(`setor-${s.slug}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [setores]);

  const scrollTo = (slug: string | null) => {
    if (slug === null) {
      // Ver Todos: vai pro topo da grid (id="setores-grid")
      const grid = document.getElementById("setores-grid");
      if (grid) {
        grid.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } else {
      const el = document.getElementById(`setor-${slug}`);
      if (el) {
        // Ajusta scroll pra compensar header sticky (~100px)
        const top = el.getBoundingClientRect().top + window.scrollY - 120;
        window.scrollTo({ top, behavior: "smooth" });
      }
    }
  };

  return (
    <div className="sticky top-[100px] md:top-[80px] z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 md:py-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide" style={{ scrollSnapType: "x mandatory" }}>
          {/* Botão "Ver Todos" */}
          <button
            type="button"
            onClick={() => scrollTo(null)}
            className={`flex-shrink-0 px-4 py-2 text-xs md:text-sm font-medium rounded-full transition-all whitespace-nowrap ${
              activeSlug === null
                ? "bg-[#0057DE] text-white shadow-md"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
            }`}
            style={{ scrollSnapAlign: "start" }}
          >
            Ver Todos
          </button>

          {/* Botões dos setores */}
          {setores.map((s) => (
            <button
              key={s.slug}
              type="button"
              onClick={() => scrollTo(s.slug)}
              className={`flex-shrink-0 px-4 py-2 text-xs md:text-sm font-medium rounded-full transition-all whitespace-nowrap ${
                activeSlug === s.slug
                  ? "bg-[#0057DE] text-white shadow-md"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
              style={{ scrollSnapAlign: "start" }}
            >
              {s.titulo}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
