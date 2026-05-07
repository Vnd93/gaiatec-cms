import { Link } from "react-router";
import {
  Wrench,
  Gauge,
  Flame,
  Droplet,
  Award,
  MapPin,
  Settings,
  CheckCircle2,
  Cpu,
  Monitor,
  Package,
  LayoutDashboard,
  Shield,
  ScanLine,
  Blocks,
  Lightbulb,
  ArrowUpRight,
} from "lucide-react";
import type { ServicoListItem } from "../../data/servicesList";

/**
 * Mapeamento estático de nome do ícone (string) → componente Lucide.
 * Mantido aqui para Vite tree-shake corretamente os ícones não usados.
 */
const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>> = {
  Wrench,
  Gauge,
  Flame,
  Droplet,
  Award,
  MapPin,
  Settings,
  CheckCircle2,
  Cpu,
  Monitor,
  Package,
  LayoutDashboard,
  Shield,
  ScanLine,
  Blocks,
  Lightbulb,
};

interface ServicoCardProps {
  servico: ServicoListItem;
}

export function ServicoCard({ servico }: ServicoCardProps) {
  const IconComponent = ICONS[servico.icone] ?? Settings; // fallback

  return (
    <Link
      to={`/servicos/${servico.slug}`}
      className="group relative flex flex-col gap-4 bg-white border border-slate-200 rounded-xl p-6 hover:border-[#0057DE] hover:shadow-lg transition-all duration-300 hover:-translate-y-1"
    >
      {/* Ícone em quadrado azul */}
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-lg bg-[#0057DE]/10 text-[#0057DE] group-hover:bg-[#0057DE] group-hover:text-white transition-colors duration-300">
        <IconComponent size={26} strokeWidth={1.75} />
      </div>

      {/* Nome */}
      <h3 className="text-base md:text-[17px] font-semibold text-slate-900 leading-tight line-clamp-2">
        {servico.nome}
      </h3>

      {/* Descrição */}
      <p className="text-sm text-slate-600 leading-relaxed line-clamp-3 flex-1">
        {servico.descricaoCurta}
      </p>

      {/* Setores aplicáveis (até 3) */}
      {servico.setores.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {servico.setores.slice(0, 3).map((s) => (
            <span
              key={s}
              className="inline-block text-[10px] font-medium uppercase tracking-wide px-2 py-1 bg-slate-50 text-slate-600 rounded"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Seta hover (canto superior direito) */}
      <div className="absolute top-5 right-5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
        <ArrowUpRight size={20} className="text-[#0057DE]" />
      </div>
    </Link>
  );
}
