import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { HeroCarousel, type HeroSlide } from "../components/HeroCarousel";
import { DgProdutosCarrossel } from "../components/deteccao-gas/DgProdutosCarrossel";
import { DgCategoriasShowcase } from "../components/deteccao-gas/DgCategoriasShowcase";
import { DgProdutosCatalogo } from "../components/deteccao-gas/DgProdutosCatalogo";
import { SEO } from "../components/SEO";
import {
  dgSetores,
  HUB_BASE,
} from "../data/deteccaoGas";

const KNOCKOUT = "'Knockout HTF68', sans-serif";
const BRAND = "#0057DE";

const HERO_IMG = "/images/pages/dg-hero.webp";
const CTA_IMG = "/images/pages/dg-cta.webp";

/* Slides do hero-carrossel do hub (mesmo padrão da home). */
const heroSlides: HeroSlide[] = [
  {
    label: "Detecção de Gás",
    title: "Detecção e Monitoramento de Gás",
    description: "Veículos, drones, portáteis e sistemas online com sensibilidade a nível ppb para metano e etano.",
    cta: "Ver categorias",
    href: "#categorias",
    image: HERO_IMG,
  },
  {
    label: "Detecção Móvel",
    title: "Varredura a Laser em Movimento",
    description: "Veículos e drones inspecionam quilômetros de rede de gás — enterrada e aérea — em alta velocidade.",
    cta: "Ver detecção móvel",
    href: "/deteccao-de-gas/deteccao-movel",
    image: "/images/pages/dg-movel.webp",
  },
  {
    label: "Monitoramento Online",
    title: "Vigilância 24/7 da Malha de Gás",
    description: "Sistemas fixos monitoram metano, pressão e válvulas em tempo real, com transmissão remota.",
    cta: "Ver monitoramento online",
    href: "/deteccao-de-gas/monitoramento-online",
    image: "/images/pages/dg-online.webp",
  },
];

/**
 * Hub da linha Gaiatec de Detecção & Monitoramento de Gás.
 * Estrutura e proporções espelhadas na página Biodigestor (referência).
 * Identidade 100% Gaiatec — sem qualquer referência a fabricante.
 */
export default function DeteccaoGasPage() {
  return (
    <>
      <SEO
        title="Detecção e Monitoramento de Gás"
        description="Linha Gaiatec de detecção e monitoramento de gás por laser: veículos, drones, portáteis e sistemas online de alta sensibilidade (ppb) para metano e etano. Para gás, petróleo, saneamento, biogás e indústria."
        path={HUB_BASE}
        keywords="detecção de gás, vazamento de metano, laser TDLAS, ppb, biogás, segurança operacional, gás natural, monitoramento de gás, Gaiatec"
        schema={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: "Detecção e Monitoramento de Gás — Gaiatec Sistemas",
          description:
            "Portfólio de tecnologia de detecção e monitoramento de gás por laser da Gaiatec Sistemas.",
          url: `https://gaiatecsistemas.com.br${HUB_BASE}`,
        }}
      />

      {/* ═══════════════════ 1) HERO ═══════════════════ */}
      <HeroCarousel slides={heroSlides} />

      {/* ═══════════════════ 2) PRODUTOS — carrossel por frente ═══════════════════ */}
      <DgProdutosCarrossel />

      {/* ═══════════════════ 3) CATEGORIAS — master-detail ═══════════════════ */}
      <DgCategoriasShowcase />

      {/* ═══════════════════ 4) CATÁLOGO — todos os produtos ═══════════════════ */}
      <DgProdutosCatalogo />

      {/* ═══════════════════ 5) SETORES ═══════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "90px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: BRAND, marginBottom: 16 }}>
              Onde se aplica
            </span>
            <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 3.5vw, 44px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#111", marginBottom: 40 }}>
              Indústrias atendidas
            </h2>
            <div className="flex flex-wrap gap-3">
              {dgSetores.map((s) => (
                <Link
                  key={s.slug}
                  to={`/setores/${s.slug}`}
                  className="inline-flex items-center px-5 py-2.5 text-sm border border-slate-200 bg-white text-slate-700 transition-all hover:border-[#0057DE] hover:text-[#0057DE]"
                >
                  {s.label}
                </Link>
              ))}
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════ 8) CTA (imagem) ═══════════════════ */}
      <section className="relative overflow-hidden" style={{ padding: "100px 0" }}>
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${CTA_IMG})` }} />
        <div className="absolute inset-0" style={{ backgroundColor: "rgba(5,11,24,0.82)" }} />
        <div className="relative z-10" style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-12">
              <div style={{ maxWidth: 650 }}>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#9ec1ff", marginBottom: 16 }}>
                  Próximo passo
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 16 }}>
                  Avalie a solução ideal para sua operação
                </h2>
                <p style={{ fontSize: 16, color: "rgba(255,255,255,0.6)", lineHeight: 1.7 }}>
                  Fale com nossos especialistas e agende uma demonstração da tecnologia de detecção de gás.
                </p>
              </div>
              <div className="flex flex-wrap gap-4" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#0057DE", color: "#fff", padding: "16px 36px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.08em", textDecoration: "none", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.color = "#0057DE"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; e.currentTarget.style.color = "#fff"; }}
                >
                  Solicitar demonstração <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
