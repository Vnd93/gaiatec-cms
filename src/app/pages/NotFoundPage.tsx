import { Link } from "react-router";
import { ChevronRight } from "lucide-react";

export default function NotFoundPage() {
  return (
    <section className="min-h-[80vh] flex items-center justify-center bg-black">
      <div className="text-center px-6">
        <span className="text-[#FF6A00] text-[120px] md:text-[180px] block" style={{ fontFamily: "'Knockout HTF68', sans-serif", fontWeight: 400, lineHeight: 1 }}>
          404
        </span>
        <h1 className="text-white text-[24px] md:text-[32px] mb-4" style={{ fontWeight: 700 }}>
          Página Não Encontrada
        </h1>
        <p className="text-white/60 text-[15px] mb-8 max-w-[400px] mx-auto">
          A página que você procura não existe ou foi movida.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-[#FF6A00] text-black px-7 py-3 text-[13px] tracking-wider hover:bg-white transition-colors"
          style={{ fontWeight: 700 }}
        >
          Voltar ao Início <ChevronRight size={14} />
        </Link>
      </div>
    </section>
  );
}
