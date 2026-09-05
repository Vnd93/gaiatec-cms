import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useParams, Navigate, Link, useNavigate, useLocation } from "react-router";
import { X, ArrowRight, Share2, CheckCircle2 } from "lucide-react";
import { SEO, buildBreadcrumb } from "../components/SEO";
import { DgProdutoMidia } from "../components/deteccao-gas/DgProdutoMidia";
import { DG_GALERIA } from "../data/dgGaleria";
import {
  getDgCategoria,
  getDgProduto,
  getDgProdutosByCategoria,
  dgProdutosDestaque,
  HUB_BASE,
} from "../data/deteccaoGas";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";
const ACCENT = "#FF6B00";

/**
 * /deteccao-de-gas/:categoria/:produto — Produto como MODAL endereçável.
 * A URL aponta para o produto (compartilhável / acesso direto), mas o layout
 * é um popup sobre fundo escurecido. Fechar volta para a categoria/hub.
 */
export default function DeteccaoGasProdutoPage() {
  const { categoria, produto } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const cat = getDgCategoria(categoria || "");
  const prod = getDgProduto(categoria || "", produto || "");

  const [tab, setTab] = useState<"descricao" | "recursos" | "aplicacoes">("descricao");
  const [showAllSpecs, setShowAllSpecs] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const overlayRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    if (location.key === "default") navigate(`${HUB_BASE}/${categoria || ""}`);
    else navigate(-1);
  }, [location.key, navigate, categoria]);

  /* Trava o scroll do body enquanto o modal está aberto. */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Esc fecha. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  /* Reseta estado e rola ao topo ao trocar de produto (ex.: clicar num relacionado). */
  useEffect(() => {
    setTab("descricao");
    setShowAllSpecs(false);
    setActiveImg(0);
    overlayRef.current?.scrollTo({ top: 0 });
  }, [produto]);

  if (!cat || !prod) return <Navigate to={cat ? `${HUB_BASE}/${cat.slug}` : HUB_BASE} replace />;

  let relacionados = getDgProdutosByCategoria(cat.slug).filter((p) => p.slug !== prod.slug);
  if (relacionados.length < 2) {
    const extra = dgProdutosDestaque.filter((p) => !(p.slug === prod.slug && p.categoriaSlug === cat.slug) && !relacionados.some((r) => r.slug === p.slug));
    relacionados = [...relacionados, ...extra];
  }
  relacionados = relacionados.slice(0, 2);

  const destaque = dgProdutosDestaque.some((d) => d.slug === prod.slug && d.categoriaSlug === cat.slug);
  const visibleSpecs = showAllSpecs ? prod.specs : prod.specs.slice(0, 3);
  const imgs = DG_GALERIA[prod.slug] ?? (prod.imagem ? [prod.imagem] : []);
  const mainImg = imgs[Math.min(activeImg, imgs.length - 1)];

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard indisponível */ }
  };

  const tabs = [
    { id: "descricao" as const, label: "Descrição", on: true },
    { id: "recursos" as const, label: "Recursos", on: prod.features.length > 0 },
    { id: "aplicacoes" as const, label: "Aplicações", on: prod.aplicacoes.length > 0 },
  ].filter((t) => t.on);

  return (
    <>
      <SEO
        title={`${prod.modelo} — ${prod.nome}`}
        description={prod.descricao.slice(0, 160)}
        path={`${HUB_BASE}/${cat.slug}/${prod.slug}`}
        image={prod.imagem}
        ogType="article"
        keywords={`${prod.modelo}, ${prod.nome}, ${cat.nome}, detecção de gás, Gaiatec`}
        schema={[
          { "@context": "https://schema.org", "@type": "Product", name: `${prod.modelo} — ${prod.nome}`, description: prod.descricao, image: prod.imagem, brand: { "@type": "Brand", name: "Gaiatec Sistemas" }, category: cat.nome },
          buildBreadcrumb([
            { label: "Início", path: "/" },
            { label: "Detecção de Gás", path: HUB_BASE },
            { label: cat.nome, path: `${HUB_BASE}/${cat.slug}` },
            { label: prod.modelo, path: `${HUB_BASE}/${cat.slug}/${prod.slug}` },
          ]),
        ]}
      />

      {/* ─── Overlay (portal → escapa do stacking context do Layout/Header) ─── */}
      {createPortal(
      <div
        ref={overlayRef}
        className="fixed inset-0 z-[999] overflow-y-auto"
        style={{ background: "rgba(5,11,24,0.86)", fontFamily: "Inter, sans-serif" }}
        onClick={close}
      >
        <div className="min-h-full flex items-start justify-center p-3 md:p-8">
          <div className="relative w-full max-w-[1180px] bg-white my-2 md:my-6" onClick={(e) => e.stopPropagation()}>
            {/* Fechar */}
            <button
              type="button"
              aria-label="Fechar"
              onClick={close}
              className="absolute top-4 right-4 md:top-6 md:right-6 z-10 w-9 h-9 inline-flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
            >
              <X size={22} />
            </button>

            {/* ─── Topo: galeria + info ─── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 p-6 md:p-10 lg:p-12">
              {/* Galeria */}
              <div className="flex flex-col gap-4">
                <div className="bg-slate-50 flex items-center justify-center p-6 md:p-10" style={{ minHeight: 340 }}>
                  {mainImg ? (
                    <img src={mainImg} alt={prod.nome} className="max-h-[300px] md:max-h-[420px] w-auto object-contain" />
                  ) : (
                    <div className="w-full"><DgProdutoMidia modelo={prod.modelo} aspect="100%" modeloSize={48} /></div>
                  )}
                </div>
                {imgs.length > 1 && (
                  <div className="flex flex-wrap gap-3">
                    {imgs.map((src, i) => {
                      const on = i === Math.min(activeImg, imgs.length - 1);
                      return (
                        <button
                          key={src}
                          type="button"
                          onClick={() => setActiveImg(i)}
                          aria-label={`Imagem ${i + 1}`}
                          className={`w-16 h-16 md:w-[72px] md:h-[72px] flex items-center justify-center bg-slate-50 p-1.5 border transition-colors ${on ? "border-[#0057DE]" : "border-slate-200 hover:border-slate-400"}`}
                        >
                          <img src={src} alt="" loading="lazy" className="max-w-full max-h-full object-contain" />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="min-w-0 pr-2 md:pr-8">
                <div className="flex items-center justify-between gap-4 mb-4">
                  {destaque ? (
                    <span className="inline-flex items-center px-3 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: ACCENT }}>
                      Destaque
                    </span>
                  ) : <span />}
                  <button type="button" onClick={share} className="inline-flex items-center gap-1.5 text-[13px] text-[#0057DE] hover:text-[#0046b3] transition-colors">
                    <Share2 size={14} /> {copied ? "Copiado!" : "Compartilhar"}
                  </button>
                </div>

                <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: BRAND, marginBottom: 10 }}>
                  {cat.nome}
                </span>
                <h1 className="text-slate-900" style={{ fontSize: "clamp(26px, 3vw, 36px)", fontWeight: 600, lineHeight: 1.1, marginBottom: 4 }}>
                  {prod.nome} <span style={{ color: BRAND }}>{prod.modelo}</span>
                </h1>
                <span className="text-slate-400 text-[14px]">Modelo {prod.modelo}</span>

                <p className="text-slate-600 text-[15px] leading-[1.7] mt-5">
                  {prod.descricao}
                </p>

                {prod.specs.length > 0 && (
                  <div className="mt-7">
                    <span style={{ display: "block", fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: BRAND, marginBottom: 14 }}>
                      Ficha técnica
                    </span>
                    <div className="flex flex-col gap-2.5">
                      {visibleSpecs.map((s, i) => (
                        <div key={i} className="text-[14px] leading-snug">
                          <span className="font-semibold text-slate-900">{s.label}:</span>{" "}
                          <span className="text-slate-600">{s.valor}</span>
                        </div>
                      ))}
                    </div>
                    {prod.specs.length > 3 && (
                      <button type="button" onClick={() => setShowAllSpecs((v) => !v)} className="mt-3 text-[13px] text-[#0057DE] hover:text-[#0046b3] transition-colors">
                        {showAllSpecs ? "Ocultar ficha técnica" : "Ver ficha técnica completa"}
                      </button>
                    )}
                  </div>
                )}

                <Link
                  to="/contato"
                  className="inline-flex items-center gap-2 mt-8 bg-[#0057DE] text-white px-7 py-3.5 text-[13px] uppercase tracking-[0.08em] hover:bg-[#0046b3] transition-colors"
                  style={{ fontWeight: 700 }}
                >
                  Solicitar orçamento <ArrowRight size={15} />
                </Link>
              </div>
            </div>

            {/* ─── Base: abas + relacionados ─── */}
            <div className="border-t border-slate-200 grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-10 lg:gap-16 p-6 md:p-10 lg:p-12">
              {/* Abas */}
              <div>
                <div className="flex gap-8 border-b border-slate-200 mb-6">
                  {tabs.map((t) => {
                    const on = tab === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTab(t.id)}
                        className={`relative pb-3 text-[14px] transition-colors ${on ? "text-slate-900" : "text-slate-400 hover:text-slate-700"}`}
                        style={{ fontWeight: on ? 700 : 500 }}
                      >
                        {t.label}
                        {on && <span className="absolute left-0 bottom-[-1px] h-[2px] w-full" style={{ background: ACCENT }} />}
                      </button>
                    );
                  })}
                </div>

                {tab === "descricao" && (
                  <p className="text-slate-600 text-[15px] leading-[1.8]">{prod.descricao}</p>
                )}
                {tab === "recursos" && (
                  <ul className="flex flex-col gap-3">
                    {prod.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-3">
                        <CheckCircle2 size={18} className="text-[#0057DE] flex-shrink-0 mt-0.5" strokeWidth={1.75} />
                        <span className="text-slate-600 text-[14px] leading-relaxed">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {tab === "aplicacoes" && (
                  <div className="flex flex-wrap gap-2">
                    {prod.aplicacoes.map((a, i) => (
                      <span key={i} className="inline-flex items-center px-3.5 py-2 text-[13px] border border-slate-300 text-slate-700">
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Relacionados */}
              {relacionados.length > 0 && (
                <div>
                  <h2 className="text-slate-900 mb-6" style={{ fontFamily: KNOCKOUT, fontSize: "clamp(20px, 2vw, 26px)", fontWeight: 500, textTransform: "uppercase", lineHeight: 1 }}>
                    Produtos relacionados
                  </h2>
                  <div className="flex flex-col gap-5">
                    {relacionados.map((p) => {
                      const pc = getDgCategoria(p.categoriaSlug);
                      return (
                        <Link key={`${p.categoriaSlug}-${p.slug}`} to={`${HUB_BASE}/${p.categoriaSlug}/${p.slug}`} className="group block border border-slate-200 hover:border-[#0057DE] transition-colors overflow-hidden">
                          <div className="relative">
                            <DgProdutoMidia modelo={p.modelo} imagem={p.imagem} aspect="52%" modeloSize={28} />
                            <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white" style={{ background: ACCENT }}>
                              {pc?.nome || "Categoria"}
                            </span>
                          </div>
                          <div className="p-4">
                            <h3 className="text-[14px] font-semibold text-slate-900 leading-snug mb-1.5" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {p.nome}
                            </h3>
                            <p className="text-slate-500 text-[12px] leading-snug mb-3" style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {p.descricao}
                            </p>
                            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0057DE] group-hover:gap-2.5 transition-all">
                              Saber mais <ArrowRight size={13} />
                            </span>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>,
        document.body,
      )}
    </>
  );
}
