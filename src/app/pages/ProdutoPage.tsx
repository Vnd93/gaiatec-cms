import { useState } from "react";
import { useParams, Navigate, Link } from "react-router";
import {
  GitCompare,
  Check,
  ArrowLeft,
  ChevronRight,
  Award,
  Shield,
  CheckCircle2,
  Phone,
} from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { useComparador } from "../components/produtos/ComparadorContext";
import { products, productBySlug, productSlug, type Product } from "./ProdutosPage";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

type Tab = "visao" | "specs" | "aplicacoes" | "setores";

/**
 * /produtos/[slug] — Página de detalhe completa do Produto (TASK 15).
 *
 * Estrutura:
 *   0. Breadcrumb
 *   1. Hero 2-col: galeria + cabeçalho com CTAs + comparador
 *   2. Tabs sticky: Visão Geral, Especificações, Aplicações, Setores
 *   3. Certificações
 *   4. Produtos Relacionados (mesma categoria)
 *   5. CTA final
 */
export default function ProdutoPage() {
  const { slug } = useParams();
  const product = slug ? productBySlug(slug) : undefined;

  const [activeTab, setActiveTab] = useState<Tab>("visao");

  // Hooks SEMPRE chamados antes de early return (regras dos hooks)
  const { add, has, isFull } = useComparador();

  if (!product) return <Navigate to="/produtos" replace />;

  const isComparing = has(product.id);
  const compareDisabled = !isComparing && isFull;

  // Produtos relacionados (mesma categoria, exclui atual)
  const related: Product[] = products
    .filter((p) => p.category === product.category && p.id !== product.id)
    .slice(0, 4);

  const handleCompareClick = () => {
    if (compareDisabled) return;
    add({
      id: product.id,
      slug: productSlug(product),
      name: product.name,
      category: product.category,
      image: product.image,
      spec: product.spec,
    });
  };

  return (
    <>
      {/* ═══════════════════════════════════════════════════
          0) BREADCRUMB
         ═══════════════════════════════════════════════════ */}
      <nav aria-label="Breadcrumb" className="bg-slate-50 border-b border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-3 text-sm">
          <ol className="flex items-center gap-2 text-slate-500">
            <li>
              <Link to="/" className="hover:text-[#0057DE] transition-colors">
                Início
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li>
              <Link to="/produtos" className="hover:text-[#0057DE] transition-colors">
                Produtos
              </Link>
            </li>
            <li className="text-slate-300">/</li>
            <li className="hidden md:list-item">
              <Link
                to={`/produtos?categoria=${encodeURIComponent(product.category)}`}
                className="hover:text-[#0057DE] transition-colors"
              >
                {product.category}
              </Link>
            </li>
            <li className="text-slate-300 hidden md:list-item">/</li>
            <li className="text-slate-900 font-medium truncate max-w-[200px] md:max-w-none">
              {product.name}
            </li>
          </ol>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════
          1) HERO — galeria + cabeçalho
         ═══════════════════════════════════════════════════ */}
      <section
        className="relative w-full overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #f8fafc 0%, #ffffff 50%, rgba(0, 87, 222, 0.05) 100%)",
          paddingTop: 60,
          paddingBottom: 60,
        }}
      >
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="mb-4">
            <Link
              to="/produtos"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-[#0057DE] transition-colors"
            >
              <ArrowLeft size={14} />
              Voltar para produtos
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16">
            {/* Galeria */}
            <AnimateOnScroll>
              <div className="aspect-[4/3] bg-white rounded-2xl shadow-xl overflow-hidden relative border border-slate-200">
                <img
                  src={product.image}
                  alt={product.name}
                  loading="eager"
                  className="w-full h-full object-cover"
                />

                {/* Badge categoria flutuante */}
                <div className="absolute top-4 left-4">
                  <span className="inline-block text-[10px] font-bold tracking-[0.15em] uppercase bg-[#0057DE] text-white px-3 py-1.5 rounded-full">
                    {product.category}
                  </span>
                </div>
              </div>

              {/* Thumbnails (placeholder visual — só 1 imagem por enquanto) */}
              <div className="hidden md:grid grid-cols-4 gap-3 mt-4">
                <div className="aspect-square bg-white border-2 border-[#0057DE] rounded-lg overflow-hidden">
                  <img src={product.image} alt="" className="w-full h-full object-cover" />
                </div>
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="aspect-square bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center text-slate-300 text-xs"
                  >
                    +
                  </div>
                ))}
              </div>
            </AnimateOnScroll>

            {/* Cabeçalho à direita */}
            <AnimateOnScroll direction="left">
              <div className="flex flex-col h-full">
                <span className="inline-block text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3">
                  SKU GTC-{String(product.id).padStart(4, "0")}
                </span>
                <h1
                  style={{
                    fontFamily: KNOCKOUT,
                    fontSize: "clamp(28px, 4vw, 44px)",
                    fontWeight: 500,
                    lineHeight: 1.05,
                    textTransform: "uppercase",
                    color: "#0f172a",
                    marginBottom: 16,
                  }}
                >
                  {product.name}
                </h1>
                <p
                  style={{
                    fontSize: 16,
                    lineHeight: 1.7,
                    color: "#475569",
                    marginBottom: 20,
                  }}
                >
                  {product.desc}
                </p>

                {/* Spec destaque */}
                <div className="bg-[#0057DE]/5 border-l-4 border-[#0057DE] p-4 rounded-r-md mb-6">
                  <p className="text-xs font-bold uppercase tracking-wide text-[#0057DE] mb-1">
                    Especificação principal
                  </p>
                  <p className="text-sm text-slate-700 font-medium">{product.spec}</p>
                </div>

                {/* Setores chips */}
                <div className="flex flex-wrap gap-2 mb-6">
                  {product.sectors.map((s) => (
                    <Link
                      key={s}
                      to="/setores"
                      className="inline-flex items-center px-3 py-1 text-xs font-medium uppercase tracking-wide bg-slate-100 hover:bg-[#0057DE]/10 text-slate-700 hover:text-[#0057DE] rounded transition-colors"
                    >
                      {s}
                    </Link>
                  ))}
                </div>

                {/* CTAs principais */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <Link
                    to="/contato"
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-[#0057DE] hover:bg-[#0046b3] text-white px-6 py-3.5 text-sm font-semibold tracking-wide rounded-md transition-colors"
                  >
                    Solicitar Orçamento
                    <ChevronRight size={16} />
                  </Link>
                  <a
                    href="https://wa.me/551122071986"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 inline-flex items-center justify-center gap-2 bg-white border-2 border-[#0057DE] text-[#0057DE] hover:bg-[#0057DE]/5 px-6 py-3 text-sm font-semibold tracking-wide rounded-md transition-colors"
                  >
                    <Phone size={14} />
                    Falar com Especialista
                  </a>
                </div>

                {/* Comparar button (linha separada) */}
                <button
                  type="button"
                  onClick={handleCompareClick}
                  disabled={compareDisabled}
                  className={`inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-semibold tracking-wide rounded-md transition-all border ${
                    isComparing
                      ? "bg-[#0057DE] border-[#0057DE] text-white"
                      : compareDisabled
                        ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-white border-slate-300 text-slate-700 hover:border-[#0057DE] hover:text-[#0057DE]"
                  }`}
                >
                  {isComparing ? (
                    <>
                      <Check size={14} strokeWidth={2.5} />
                      Adicionado ao Comparador
                    </>
                  ) : (
                    <>
                      <GitCompare size={14} />
                      {compareDisabled
                        ? "Limite de 3 produtos no comparador"
                        : "Adicionar ao Comparador"}
                    </>
                  )}
                </button>
              </div>
            </AnimateOnScroll>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          2) TABS STICKY
         ═══════════════════════════════════════════════════ */}
      <div className="sticky top-[100px] md:top-[80px] z-30 bg-white/95 backdrop-blur-md border-y border-slate-200 shadow-sm">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          <nav className="flex gap-1 overflow-x-auto scrollbar-hide">
            {[
              { key: "visao" as const, label: "Visão Geral" },
              { key: "specs" as const, label: "Especificações Técnicas" },
              { key: "aplicacoes" as const, label: "Aplicações" },
              { key: "setores" as const, label: "Setores e Mercados" },
            ].map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 px-4 md:px-5 py-4 text-sm font-medium transition-colors whitespace-nowrap relative ${
                  activeTab === tab.key
                    ? "text-[#0057DE]"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
                {activeTab === tab.key && (
                  <span className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#0057DE] rounded-t-sm" />
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          3) TAB CONTENT
         ═══════════════════════════════════════════════════ */}
      <section className="bg-white py-12 md:py-16 min-h-[300px]">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          {activeTab === "visao" && (
            <AnimateOnScroll key="visao">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-10 lg:gap-16">
                <div className="lg:sticky lg:top-[180px] self-start">
                  <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                    DESCRIÇÃO TÉCNICA
                  </span>
                  <h2
                    className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                    style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Sobre o produto
                  </h2>
                </div>
                <div>
                  <p className="text-base md:text-[17px] text-slate-700 leading-relaxed">
                    {product.details.fullDesc}
                  </p>

                  {/* Benefícios destacados */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-8">
                    {product.details.applications.slice(0, 4).map((app, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        <CheckCircle2 size={18} className="text-[#0057DE] flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-700 leading-relaxed">{app}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </AnimateOnScroll>
          )}

          {activeTab === "specs" && (
            <AnimateOnScroll key="specs">
              <div className="max-w-[900px]">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                  ESPECIFICAÇÕES TÉCNICAS
                </span>
                <h2
                  className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-8"
                  style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                >
                  Datasheet técnico
                </h2>

                <table className="w-full border-collapse">
                  <tbody>
                    {product.details.specs.map((s, i) => (
                      <tr
                        key={s.label}
                        className={i % 2 === 0 ? "bg-slate-50" : "bg-white"}
                      >
                        <td className="px-4 md:px-6 py-3.5 text-sm font-semibold uppercase tracking-wide text-slate-600 w-[40%]">
                          {s.label}
                        </td>
                        <td className="px-4 md:px-6 py-3.5 text-sm text-slate-900 font-mono">
                          {s.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-8 p-4 bg-amber-50 border-l-4 border-amber-400 rounded-r-md">
                  <p className="text-sm text-slate-700">
                    <strong>Nota:</strong> especificações sujeitas a alteração sem aviso prévio. Para datasheet detalhado e dimensionamento técnico,{" "}
                    <Link to="/contato" className="text-[#0057DE] underline hover:text-[#0046b3]">
                      solicite consulta técnica
                    </Link>
                    .
                  </p>
                </div>
              </div>
            </AnimateOnScroll>
          )}

          {activeTab === "aplicacoes" && (
            <AnimateOnScroll key="aplicacoes">
              <div className="max-w-[900px]">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                  ONDE É UTILIZADO
                </span>
                <h2
                  className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-8"
                  style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                >
                  Aplicações práticas
                </h2>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {product.details.applications.map((app, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 p-5 bg-white border border-slate-200 rounded-lg hover:border-[#0057DE] hover:shadow-md transition-all"
                    >
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-[#0057DE]/10 text-[#0057DE] flex items-center justify-center font-bold text-sm">
                        {String(i + 1).padStart(2, "0")}
                      </div>
                      <span className="text-sm md:text-base text-slate-700 leading-relaxed pt-0.5">
                        {app}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="mt-10 p-6 bg-[#0057DE]/5 border border-[#0057DE]/20 rounded-lg">
                  <p className="text-sm text-slate-700 mb-3">
                    Não encontrou sua aplicação?
                  </p>
                  <Link
                    to="/aplicacoes"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#0057DE] hover:text-[#0046b3] transition-colors"
                  >
                    Explorar todas as aplicações <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </AnimateOnScroll>
          )}

          {activeTab === "setores" && (
            <AnimateOnScroll key="setores">
              <div className="max-w-[900px]">
                <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                  MERCADOS ATENDIDOS
                </span>
                <h2
                  className="text-2xl md:text-3xl font-bold leading-tight text-slate-900 mb-8"
                  style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                >
                  Setores e indústrias
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {product.sectors.map((s) => (
                    <Link
                      key={s}
                      to="/setores"
                      className="group flex items-center justify-between p-5 bg-white border border-slate-200 rounded-lg hover:border-[#0057DE] hover:shadow-md transition-all"
                    >
                      <span className="text-sm md:text-base font-semibold text-slate-900 group-hover:text-[#0057DE] transition-colors">
                        {s}
                      </span>
                      <ChevronRight size={16} className="text-[#0057DE] group-hover:translate-x-1 transition-transform" />
                    </Link>
                  ))}
                </div>
              </div>
            </AnimateOnScroll>
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          4) CERTIFICAÇÕES
         ═══════════════════════════════════════════════════ */}
      <section className="bg-slate-50 py-16 md:py-20 border-t border-slate-200">
        <div className="max-w-[1440px] mx-auto px-4 md:px-8">
          <AnimateOnScroll>
            <div className="text-center mb-10">
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                CONFORMIDADE
              </span>
              <h2
                className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
              >
                Certificações e Normas
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-[900px] mx-auto">
            {[
              { icon: Award, label: "INMETRO", desc: "Homologado" },
              { icon: Shield, label: "ISO 9001", desc: "Qualidade" },
              { icon: CheckCircle2, label: "OIML", desc: "Metrologia" },
              { icon: Award, label: "ABNT", desc: "Normas Técnicas" },
            ].map((cert, i) => (
              <AnimateOnScroll key={cert.label} delay={i * 0.05}>
                <div className="flex flex-col items-center text-center p-4 bg-white border border-slate-200 rounded-lg">
                  <cert.icon size={32} className="text-[#0057DE] mb-2" strokeWidth={1.5} />
                  <span className="text-sm font-bold text-slate-900">{cert.label}</span>
                  <span className="text-xs text-slate-500 mt-0.5">{cert.desc}</span>
                </div>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          5) PRODUTOS RELACIONADOS
         ═══════════════════════════════════════════════════ */}
      {related.length > 0 && (
        <section className="bg-white py-16 md:py-20 border-t border-slate-200">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8">
            <AnimateOnScroll>
              <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                <div>
                  <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#0057DE] mb-3 block">
                    EXPLORE MAIS
                  </span>
                  <h2
                    className="text-2xl md:text-3xl font-bold leading-tight text-slate-900"
                    style={{ fontFamily: KNOCKOUT, textTransform: "uppercase", fontWeight: 500 }}
                  >
                    Produtos relacionados
                  </h2>
                </div>
                <Link
                  to="/produtos"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-[#0057DE] hover:text-[#0046b3] transition-colors"
                >
                  Ver catálogo completo <ChevronRight size={16} />
                </Link>
              </div>
            </AnimateOnScroll>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
              {related.map((p, i) => (
                <AnimateOnScroll key={p.id} delay={i * 0.05}>
                  <Link
                    to={`/produtos/${productSlug(p)}`}
                    className="group flex flex-col bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-[#0057DE] hover:shadow-md transition-all"
                  >
                    <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                      <img
                        src={p.image}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-4">
                      <span className="text-[10px] font-bold tracking-[0.15em] uppercase text-[#0057DE] block mb-1.5">
                        {p.category}
                      </span>
                      <h3 className="text-sm font-semibold text-slate-900 group-hover:text-[#0057DE] transition-colors leading-tight line-clamp-2">
                        {p.name}
                      </h3>
                    </div>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          6) CTA FINAL
         ═══════════════════════════════════════════════════ */}
      <CTABanner
        text={`Precisa de mais informações sobre ${product.name}? Nossa equipe técnica oferece dimensionamento gratuito e cotação em até 24h.`}
        primaryLabel="Solicitar Orçamento"
        secondaryLabel="Comparar Produtos"
        secondaryHref="/produtos/comparador"
      />
    </>
  );
}
