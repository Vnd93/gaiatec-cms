import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import type { AplicacaoListItem } from "../../data/aplicacoes";
import { ResponsiveApplicationImage } from "./ResponsiveApplicationImage";

interface AplicacaoCardProps {
  aplicacao: AplicacaoListItem;
}

/**
 * Card de uma Aplicação na listagem `/aplicacoes`.
 *
 * Layout: imagem topo → nome → descrição → setores chips → CTA.
 */
export function AplicacaoCard({ aplicacao }: AplicacaoCardProps) {
  return (
    <Link
      to={`/aplicacoes/${aplicacao.slug}`}
      className="group flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-[#0057DE] hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
    >
      {/* Imagem */}
      <div className="relative h-48 overflow-hidden bg-slate-100">
        <ResponsiveApplicationImage
          src={aplicacao.imagem}
          alt={aplicacao.nome}
          loading="lazy"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

        {/* Seta hover */}
        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#0057DE] text-white">
            <ArrowUpRight size={16} />
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex flex-col gap-3 p-5 flex-1">
        <h3 className="text-base md:text-[17px] font-semibold text-slate-900 leading-tight line-clamp-2">
          {aplicacao.nome}
        </h3>

        <p className="text-sm text-slate-600 leading-relaxed line-clamp-3 flex-1">
          {aplicacao.descricaoCurta}
        </p>

        {/* Setores chips (até 3) */}
        {aplicacao.setores.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {aplicacao.setores.slice(0, 3).map((s) => (
              <span
                key={s}
                className="inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-1 bg-[#0057DE]/5 text-[#0057DE] rounded"
              >
                {s}
              </span>
            ))}
            {aplicacao.setores.length > 3 && (
              <span className="text-[10px] text-slate-400 self-center">
                +{aplicacao.setores.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
