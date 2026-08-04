import { useState, useMemo } from "react";
import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { useBlogPosts } from "../hooks/useSiteData";
import { ChevronRight, Calendar, ArrowRight, Mail } from "lucide-react";
import { optimizedBg } from "../components/ResponsiveImage";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG = "/images/heroes/1.1.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const categories = ["Todos", "Artigos Tecnicos", "Estudos de Caso", "Novidades do Setor", "Whitepapers", "Eventos"];

const FALLBACK_POSTS = [
  {
    category: "ARTIGOS TECNICOS",
    title: "Medicao Ultrassonica Clamp-On: Quando e Por Que Utilizar",
    excerpt: "Entenda as vantagens da medicao nao-invasiva de vazao e em quais aplicacoes ela e a melhor escolha tecnica.",
    date: "10 Mar 2026",
    image: "/images/heroes/1.2.webp",
  },
  {
    category: "ESTUDOS DE CASO",
    title: "Companhia de Saneamento Reduz Perdas em 22% com Telemetria",
    excerpt: "Case de implantacao de sistema de monitoramento remoto em rede de distribuicao de agua.",
    date: "05 Mar 2026",
    image: "/images/heroes/1.3.webp",
  },
  {
    category: "NOVIDADES DO SETOR",
    title: "Biogas no Brasil: Regulamentacao e Oportunidades em 2026",
    excerpt: "Panorama do mercado de biogas e biometano no Brasil, incluindo novas regulamentacoes e incentivos.",
    date: "28 Fev 2026",
    image: "/images/heroes/1.4.webp",
  },
  {
    category: "ARTIGOS TECNICOS",
    title: "Proteção Catódica: Fundamentos e Boas Praticas",
    excerpt: "Guia tecnico sobre os principios da protecao catodica e como garantir a integridade de estruturas metalicas.",
    date: "20 Fev 2026",
    image: "/images/heroes/1.5.webp",
  },
  {
    category: "WHITEPAPERS",
    title: "Automacao de Estacoes Elevatorias: Eficiencia e Reducao de Custos",
    excerpt: "White paper tecnico sobre a automacao de estacoes elevatorias de agua e esgoto.",
    date: "15 Fev 2026",
    image: "/images/pages/2.1.webp",
  },
  {
    category: "EVENTOS",
    title: "Gaiatec Sistemas na Feira Internacional de Saneamento 2026",
    excerpt: "Visite nosso estande e conheca as ultimas novidades em instrumentacao e automacao.",
    date: "10 Fev 2026",
    image: "/images/pages/2.2.webp",
  },
];

/* helper to match filter */
const catMap: Record<string, string> = {
  "Artigos Tecnicos": "ARTIGOS TECNICOS",
  "Estudos de Caso": "ESTUDOS DE CASO",
  "Novidades do Setor": "NOVIDADES DO SETOR",
  Whitepapers: "WHITEPAPERS",
  Eventos: "EVENTOS",
};

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function BlogPage() {
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [email, setEmail] = useState("");
  const { posts: apiPosts } = useBlogPosts();

  const posts = useMemo(() => {
    if (apiPosts.length === 0) return FALLBACK_POSTS;
    return apiPosts.map(p => ({
      category: (p.categoria_nome || "ARTIGOS").toUpperCase(),
      title: p.titulo,
      excerpt: p.resumo || "",
      date: p.publicado_em ? new Date(p.publicado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : "",
      image: p.imagem_url || "/images/heroes/1.2.webp",
    }));
  }, [apiPosts]);

  const filtered = activeFilter === "Todos" ? posts : posts.filter((p) => p.category === catMap[activeFilter]);
  const featured = filtered[0];
  const grid = filtered.slice(1);

  return (
    <>
      {/* ═══════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 772 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${optimizedBg(HERO_IMG, 1920, "webp")})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
            BLOG
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Conteudo Tecnico e Novidades
          </h1>
        </div>
      </section>

      {/* ── Vertical line connector ── */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "relative", height: 60, backgroundColor: "transparent", marginTop: -60, zIndex: 20 }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#fff" }} />
          </div>
        </div>
        <div style={{ position: "relative", height: 60, backgroundColor: "#fff" }}>
          <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px", position: "relative", height: "100%" }}>
            <div style={{ position: "absolute", left: 30, top: 0, width: 1, height: "100%", backgroundColor: "#000" }} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════
          2) FILTERS
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", borderBottom: "1px solid #eee", padding: "24px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <div className="flex flex-wrap gap-3">
            {categories.map((cat) => {
              const isActive = activeFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveFilter(cat)}
                  style={{
                    padding: "10px 22px",
                    borderRadius: 50,
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    border: isActive ? "1px solid #0057DE" : "1px solid #e5e5e5",
                    backgroundColor: isActive ? "#0057DE" : "transparent",
                    color: isActive ? "#000" : "#666",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = "#f0f0f0"; e.currentTarget.style.color = "#1a1a1a"; } }}
                  onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "#666"; } }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) FEATURED ARTICLE
         ═══════════════════════════════════════════ */}
      {featured && (
        <section style={{ backgroundColor: "#fff", padding: "60px 0 0" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
            <AnimateOnScroll>
              <div
                className="grid grid-cols-1 lg:grid-cols-2 gap-0 overflow-hidden"
                style={{
                  backgroundColor: "#fff",
                  border: "1px solid #e5e5e5",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                  borderRadius: 4,
                }}
              >
                {/* Image */}
                <div className="relative overflow-hidden" style={{ minHeight: 320 }}>
                  <img
                    src={featured.image}
                    alt={featured.title}
                    style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.5s ease" }}
                    onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                  />
                </div>

                {/* Content */}
                <div style={{ padding: "36px 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                  <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", backgroundColor: "#0057DE", padding: "4px 14px", borderRadius: 3, marginBottom: 16, width: "fit-content" }}>
                    {featured.category}
                  </span>
                  <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(22px, 2.5vw, 28px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#1a1a1a", marginBottom: 14 }}>
                    {featured.title}
                  </h2>
                  <p style={{ fontSize: 15, lineHeight: 1.7, color: "#666", marginBottom: 16 }}>
                    {featured.excerpt}
                  </p>
                  <div className="flex items-center gap-2" style={{ fontSize: 12, color: "#999", marginBottom: 20 }}>
                    <Calendar size={13} /> {featured.date}
                  </div>
                  <Link
                    to="#"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 700, color: "#32373c", textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.04em", transition: "color 0.3s" }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "#0057DE"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = "#32373c"; }}
                  >
                    Ler Artigo Completo <ArrowRight size={14} />
                  </Link>
                </div>
              </div>
            </AnimateOnScroll>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════
          4) GRID — article cards
         ═══════════════════════════════════════════ */}
      {grid.length > 0 && (
        <section style={{ backgroundColor: "#fff", padding: "60px 0 80px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {grid.map((post, i) => (
                <AnimateOnScroll key={post.title} delay={i * 0.08}>
                  <article
                    style={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e5e5",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
                      borderRadius: 4,
                      overflow: "hidden",
                      height: "100%",
                      display: "flex",
                      flexDirection: "column",
                      cursor: "pointer",
                      transition: "box-shadow 0.3s ease, transform 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.boxShadow = "0 12px 32px rgba(0,0,0,0.12)"; e.currentTarget.style.transform = "translateY(-6px)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    {/* Image */}
                    <div style={{ position: "relative", paddingTop: "56%", overflow: "hidden" }}>
                      <img
                        src={post.image}
                        alt={post.title}
                        style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.5s ease" }}
                        onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.05)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
                      />
                      <span style={{ position: "absolute", top: 12, left: 12, fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#fff", backgroundColor: "#0057DE", padding: "4px 12px", borderRadius: 3 }}>
                        {post.category}
                      </span>
                    </div>

                    {/* Content */}
                    <div style={{ padding: "20px 20px 24px", flex: 1, display: "flex", flexDirection: "column" }}>
                      <h3 style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.3, marginBottom: 10, textTransform: "uppercase" }}>
                        {post.title}
                      </h3>
                      <p style={{ fontSize: 14, lineHeight: 1.65, color: "#666", marginBottom: 14, flex: 1 }}>
                        {post.excerpt}
                      </p>
                      <div className="flex items-center gap-2" style={{ fontSize: 12, color: "#aaa" }}>
                        <Calendar size={12} /> {post.date}
                      </div>
                    </div>
                  </article>
                </AnimateOnScroll>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════
          5) NEWSLETTER — dark bg
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="text-center" style={{ maxWidth: 600, margin: "0 auto" }}>
              <Mail size={36} style={{ color: "#0057DE", margin: "0 auto 20px" }} />
              <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(28px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.15, textTransform: "uppercase", color: "#fff", marginBottom: 12 }}>
                Receba Nosso Conteudo
              </h2>
              <p style={{ fontSize: 15, color: "#999", lineHeight: 1.6, marginBottom: 32 }}>
                Cadastre-se para receber artigos tecnicos, estudos de caso e novidades do setor diretamente no seu email.
              </p>

              <div className="flex flex-col sm:flex-row gap-3" style={{ maxWidth: 480, margin: "0 auto" }}>
                <input
                  type="email"
                  placeholder="Seu melhor email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: "#242424",
                    border: "1px solid #444",
                    color: "#fff",
                    padding: "14px 18px",
                    fontSize: 14,
                    borderRadius: 4,
                    outline: "none",
                    transition: "border-color 0.3s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#0057DE"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#444"; }}
                />
                <button
                  style={{
                    backgroundColor: "#0057DE",
                    color: "#fff",
                    padding: "14px 28px",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    transition: "background-color 0.3s ease",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e5b800"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; }}
                >
                  Inscrever-se
                </button>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          6) CTA BANNER
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div style={{ maxWidth: 640 }}>
                <h2 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 400, lineHeight: 1.2, textTransform: "uppercase", color: "#fff", marginBottom: 8 }}>
                  Suporte tecnico e solucoes especializadas
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Precisa de suporte tecnico ou quer saber mais sobre nossas solucoes? Fale com a equipe Gaiatec.
                </p>
              </div>

              <div className="flex flex-wrap gap-4 justify-center lg:justify-end" style={{ flexShrink: 0 }}>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "#0057DE", color: "#ffffff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#e5b800"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; }}
                >
                  Fale com um Especialista <ChevronRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, backgroundColor: "transparent", color: "#fff", padding: "14px 32px", fontWeight: 700, fontSize: 13, textTransform: "uppercase", letterSpacing: "0.5px", textDecoration: "none", borderRadius: 4, border: "2px solid #444", transition: "all 0.3s ease" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0057DE"; e.currentTarget.style.color = "#0057DE"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#444"; e.currentTarget.style.color = "#fff"; }}
                >
                  Solicitar Proposta <ChevronRight size={14} />
                </Link>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>
    </>
  );
}
