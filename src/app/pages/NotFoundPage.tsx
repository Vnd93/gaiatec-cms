import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

export default function NotFoundPage() {
  return (
    <section
      className="min-h-[80vh] flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, rgba(0, 87, 222, 0.05) 100%)",
      }}
    >
      <div className="text-center px-6">
        <span className="text-[#0057DE] text-[120px] md:text-[180px] block" style={{ fontFamily: "'Knockout HTF68', sans-serif", fontWeight: 400, lineHeight: 1 }}>
          404
        </span>
        <h1 className="text-slate-900 text-[24px] md:text-[32px] mb-4" style={{ fontWeight: 700 }}>
          Página Não Encontrada
        </h1>
        <p className="text-slate-600 text-[15px] mb-8 max-w-[400px] mx-auto">
          A página que você procura não existe ou foi movida.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-[#0057DE] text-white px-7 py-3 text-[13px] tracking-wider hover:bg-[#0046b3] transition-colors rounded-md"
          style={{ fontWeight: 700 }}
        >
          Voltar ao Início <ChevronRight size={14} />
        </Link>
      </div>
    </section>
  );
}
