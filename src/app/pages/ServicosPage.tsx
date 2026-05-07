import { useState, useMemo } from "react";
import { Link } from "react-router";
import { Search } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { ServicoCard } from "../components/servicos/ServicoCard";
import {
  servicesList,
  categoriaLabels,
  type ServicoCategoria,
} from "../data/servicesList";
import { SEO, buildCollectionPageSchema } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

const SETORES_FILTRO = [
  "Todos",
  "Saneamento",
  "Gás e Petróleo",
  "Biogás e Biometano",
  "Proteção Catódica",
  "HVAC",
  "Indústria",
  "Telemetria",
  "Agronegócio",
];

const CATEGORIAS_LIST: (ServicoCategoria | "todas")[] = [
  "todas",
  "instalacao",
  "manutencao",
  "calibracao",
  "consultoria",
  "outros",
];

/**
 * /servicos — Listagem de Serviços Especializados (TASK 16 V2).
 *
 * NOVO: usa servicesList.ts (16 itens oficiais) com APENAS o nome
 * (sem prefixos descritivos como "Serviços Especializados em..." ou
 * "Soluções Avançadas em...").
 *
 * Estrutura:
 *   1. Hero claro (gradient slate-50 → brand/5)
 *   2. Toolbar sticky: search bar + filtro setor + filtro categoria
 *   3. Grid de ServicoCard (3 cols desktop / 2 tablet / 1 mobile)
 *   4. CTA final
 */
export default function ServicosPage() {
  const [busca, setBusca] = useState("");
  const [setorAtivo, setSetorAtivo] = useState<string>("Todos");
  const [categoriaAtiva, setCategoriaAtiva] = useState<ServicoCategoria | "todas">("todas");

  /** Aplica filtros + busca em tempo real */
  const filtered = useMemo(() => {
    const buscaLower = busca.trim().toLowerCase();
    return servicesList.filter((s) => {
      if (categoriaAtiva !== "todas" && s.categoria !== categoriaAtiva) return false;
      if (
        setorAtivo !== "Todos" &&
        !s.setores.some((sec) => sec.toLowerCase().includes(setorAtivo.toLowerCase()))
      )
        return false;
      if (buscaLower) {
        const haystack = `${s.nome} ${s.descricaoCurta}`.toLowerCase();
        if (!haystack.includes(buscaLower)) return false;
      }
      return true;
    });
  }, [busca, setorAtivo, categoriaAtiva]);

  return (
    <>
      <SEO
        title="Serviços Especializados"
        description="Serviços técnicos da Gaiatec: instalação, calibração RBC, manutenção, automação, proteção catódica e consultoria. Atendimento técnico em todo o Brasil."
        path="/servicos"
        keywords="serviços técnicos, calibração RBC, instalação, manutenção, automação, proteção catódica, inspeção"
        schema={buildCollectionPageSchema({
          name: "Serviços Especializados — Gaiatec Sistemas",
          description: "Serviços técnicos para indústria com equipe qualificada e laboratório RBC.",
          itemCount: servicesList.length,
        })}
      />

      {/* ═══════════════════════════════════════════════════
          1) HERO CLARO
         ═══════════════════════════════════════════════════ */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, rgba(0, 87, 222, 0.05) 100%)",
          paddingTop: 120,
          paddingBottom: 60,
        }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="max-w-[800px]">
              <span
                style={{
                  display: "inline-block",
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  color: "#0057DE",
                  marginBottom: 16,
                }}
              >
                SERVIÇOS
              </span>
              <h1
                style={{
                  fontFamily: KNOCKOUT,
                  fontSize: "clamp(36px, 5vw, 64px)",
                  fontWeight: 500,
                  lineHeight: 1,
                  textTransform: "uppercase",
                  color: "#0f172a",
                  marginBottom: 24,
                }}
              >
                Serviços Especializados para Garantir Eficiência e Confiabilidade
              </h1>
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.7,
                  color: "#475569",
                  maxWidth: 720,
                }}
              >
                Na <strong>Gaiatec Sistemas</strong>, oferecemos não apenas produtos de alta tecnologia, mas também serviços especializados para garantir a máxima performance, durabilidade e confiabilidade em cada projeto. Atendemos os setores de Saneamento, Biogás, Gás e Petróleo, Proteção Catódica, Segurança Operacional, HVAC, Telemetria, Indústrias e Agronegócio, com uma equipe técnica qualificada e soluções completas para instalação, calibração, manutenção e suporte especializado.
              </p>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          2) TOOLBAR STICKY (search + filtros)
         ═══════════════════════════════════════════════════ */}
      <div className="sticky top-[100px] md:top-[80px] z-30 bg-white/95 backdrop-blur-md border-y border-slate-200 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-4 space-y-3">
          {/* Linha 1: search */}
          <div className="relative">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar serviço..."
              className="w-full pl-11 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-full outline-none focus:border-[#0057DE] focus:bg-white transition-colors"
            />
          </div>

          {/* Linha 2: filtros (setor + categoria) */}
          <div className="flex flex-col md:flex-row gap-3">
            {/* Filtro setor */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
              {SETORES_FILTRO.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSetorAtivo(s)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full transition-all whitespace-nowrap ${
                    setorAtivo === s
                      ? "bg-[#0057DE] text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>

            {/* Filtro categoria */}
            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-shrink-0">
              {CATEGORIAS_LIST.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategoriaAtiva(c)}
                  className={`flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap ${
                    categoriaAtiva === c
                      ? "border-[#0057DE] text-[#0057DE] bg-[#0057DE]/5"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {c === "todas" ? "Todas categorias" : categoriaLabels[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          3) GRID DE SERVIÇOS
         ═══════════════════════════════════════════════════ */}
      <section className="bg-slate-50 py-16 md:py-20 min-h-[400px]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          {/* Resumo de resultados */}
          <div className="mb-8 flex items-center justify-between">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "serviço encontrado" : "serviços encontrados"}
              {(setorAtivo !== "Todos" || categoriaAtiva !== "todas" || busca) && (
                <button
                  type="button"
                  onClick={() => {
                    setBusca("");
                    setSetorAtivo("Todos");
                    setCategoriaAtiva("todas");
                  }}
                  className="ml-3 text-[#0057DE] hover:text-[#0046b3] font-medium"
                >
                  Limpar filtros
                </button>
              )}
            </p>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-lg text-slate-500 mb-4">Nenhum serviço encontrado.</p>
              <button
                type="button"
                onClick={() => {
                  setBusca("");
                  setSetorAtivo("Todos");
                  setCategoriaAtiva("todas");
                }}
                className="inline-flex items-center gap-2 text-[#0057DE] hover:text-[#0046b3] font-semibold"
              >
                Limpar filtros e ver todos
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
              {filtered.map((s, i) => (
                <AnimateOnScroll key={s.slug} delay={Math.min(i * 0.04, 0.4)}>
                  <ServicoCard servico={s} />
                </AnimateOnScroll>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) CTA FINAL
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text="Precisa de um serviço técnico especializado? Fale com nossa equipe de especialistas e receba uma análise técnica gratuita para o seu caso."
        primaryLabel="Solicitar Análise Técnica"
        secondaryLabel="Ver Todos os Produtos"
        secondaryHref="/produtos"
      />
    </>
  );
}
