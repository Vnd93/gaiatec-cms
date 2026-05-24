import { useParams, Navigate, Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { SEO, buildBreadcrumb } from "../components/SEO";
import { PageHero } from "../components/PageHero";
import { DgProdutoMidia } from "../components/deteccao-gas/DgProdutoMidia";
import {
  dgCategorias,
  getDgCategoria,
  getDgProdutosByCategoria,
  HUB_BASE,
} from "../data/deteccaoGas";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";
const BRAND_GRADIENT = "linear-gradient(135deg, #0057DE 0%, #0a2540 60%, #050b18 100%)";

export default function DeteccaoGasCategoriaPage() {
  const { categoria } = useParams();
  const cat = getDgCategoria(categoria || "");

  if (!cat) return <Navigate to={HUB_BASE} replace />;

  const produtos = getDgProdutosByCategoria(cat.slug);
  const outras = dgCategorias.filter((c) => c.slug !== cat.slug).slice(0, 3);

  return (
    <>
      <SEO
        title={`${cat.nome} — Detecção de Gás`}
        description={cat.descricao}
        path={`${HUB_BASE}/${cat.slug}`}
        keywords={`${cat.nome}, detecção de gás, metano, laser, Gaiatec`}
        schema={buildBreadcrumb([
          { label: "Início", path: "/" },
          { label: "Detecção de Gás", path: HUB_BASE },
          { label: cat.nome, path: `${HUB_BASE}/${cat.slug}` },
        ])}
      />

      {/* Hero (padrão Biodigestor) */}
      <PageHero overline="Detecção de Gás" title={cat.nome} image="/images/pages/2.2.webp" />

      {/* Produtos */}
      <section style={{ background: "#fff", padding: "90px 0", minHeight: 320 }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ marginBottom: 48, maxWidth: 760 }}>
              <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(26px, 3vw, 40px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111", marginBottom: 16 }}>
                {produtos.length} {produtos.length === 1 ? "produto" : "produtos"}
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: "#64748b" }}>{cat.descricao}</p>
            </div>
          </AnimateOnScroll>

          {produtos.length === 0 ? (
            <p className="text-slate-500">Catálogo em finalização para esta categoria.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {produtos.map((p, i) => (
                <AnimateOnScroll key={p.slug} delay={Math.min(i * 0.05, 0.4)}>
                  <Link
                    to={`${HUB_BASE}/${cat.slug}/${p.slug}`}
                    className="group block h-full"
                    style={{ backgroundColor: "#fafafa", overflow: "hidden", display: "flex", flexDirection: "column", textDecoration: "none", transition: "transform 0.4s ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-6px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    <DgProdutoMidia modelo={p.modelo} imagem={p.imagem} alt={p.nome} />
                    <div style={{ padding: "24px 22px", flex: 1, display: "flex", flexDirection: "column" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: BRAND, marginBottom: 8 }}>
                        {p.modelo}
                      </span>
                      <h3 style={{ fontSize: 16, fontWeight: 600, color: "#111", marginBottom: 10, lineHeight: 1.35 }}>
                        {p.nome}
                      </h3>
                      <p style={{ fontSize: 13.5, lineHeight: 1.65, color: "#777", marginBottom: 18, flex: 1, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {p.descricao}
                      </p>
                      <span className="group-hover:gap-2.5" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: BRAND, textTransform: "uppercase", letterSpacing: "0.08em", transition: "gap 0.3s ease" }}>
                        Ver produto <ArrowRight size={12} />
                      </span>
                    </div>
                  </Link>
                </AnimateOnScroll>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Outras categorias */}
      <section style={{ background: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(24px, 3vw, 38px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#0f172a", marginBottom: 32 }}>
              Outras categorias
            </h2>
          </AnimateOnScroll>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {outras.map((c, i) => (
              <AnimateOnScroll key={c.slug} delay={i * 0.08}>
                <Link
                  to={`${HUB_BASE}/${c.slug}`}
                  className="group block h-full bg-white border border-slate-200 p-6 transition-all duration-300 hover:border-[#0057DE] hover:shadow-[0_18px_44px_-16px_rgba(2,16,43,0.16)]"
                >
                  <h3 style={{ fontSize: 17, fontWeight: 600, color: "#0f172a", marginBottom: 8 }}>{c.nome}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.6, color: "#64748b", marginBottom: 16 }}>{c.resumo}</p>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider transition-all group-hover:gap-2.5" style={{ color: BRAND }}>
                    Ver categoria <ArrowRight size={13} />
                  </span>
                </Link>
              </AnimateOnScroll>
            ))}
          </div>
        </div>
      </section>

      <CTABanner
        text="Fale com nossos especialistas e descubra a solução de detecção de gás ideal para sua operação."
        primaryLabel="Solicitar demonstração"
        secondaryLabel="Ver todas as categorias"
        secondaryHref={HUB_BASE}
      />
    </>
  );
}
