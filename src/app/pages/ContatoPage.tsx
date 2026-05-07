import { useState } from "react";
import { Link } from "react-router";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import {
  ChevronRight,
  Phone,
  MessageSquare,
  MapPin,
  Mail,
  Shield,
  Clock,
  Users,
  Globe,
  Headphones,
} from "lucide-react";

/* ────────────────────────────────────────────────────────
   IMAGES
   ──────────────────────────────────────────────────────── */
const HERO_IMG =
  "/images/heroes/1.1.png";

/* ────────────────────────────────────────────────────────
   DATA
   ──────────────────────────────────────────────────────── */
const enquiryTypes = [
  "Orcamento",
  "Suporte Tecnico",
  "Informacoes",
  "Visita Tecnica",
  "Outros",
];

const contactCards = [
  {
    icon: Phone,
    title: "Telefone Comercial",
    info: "(11) 2207-1933",
    sub: "Fax: (11) 2207-1986",
    href: "tel:+551122071933",
  },
  {
    icon: MessageSquare,
    title: "WhatsApp",
    info: "(11) 2207-1986",
    sub: "Atendimento de seg. a sex., 8h as 18h",
    href: "https://wa.me/551122071986",
  },
  {
    icon: Mail,
    title: "E-mail",
    info: "vendas@gaiatecsistemas.com.br",
    sub: null,
    href: "mailto:vendas@gaiatecsistemas.com.br",
  },
  {
    icon: MapPin,
    title: "Localizacao",
    info: "Rua Heroi da Forca Expedicionaria Brasileira, 22",
    sub: "Parque Novo Mundo — Sao Paulo/SP — CEP: 02188-040",
    href: "#mapa",
  },
];

const whyCards = [
  {
    icon: Clock,
    title: "Experiencia desde 2004",
    desc: "Mais de 20 anos de atuacao em instrumentacao e automacao industrial.",
  },
  {
    icon: Users,
    title: "Equipe Especializada",
    desc: "Engenheiros e tecnicos certificados em medicao, controle e automacao.",
  },
  {
    icon: Globe,
    title: "Atendimento Nacional",
    desc: "Projetos realizados em todo o territorio brasileiro.",
  },
  {
    icon: Headphones,
    title: "Suporte Tecnico",
    desc: "Assistencia tecnica e pos-venda com agilidade e qualidade.",
  },
];

/* ────────────────────────────────────────────────────────
   SHARED INPUT STYLE
   ──────────────────────────────────────────────────────── */
const inputBase: React.CSSProperties = {
  width: "100%",
  backgroundColor: "#fff",
  border: "1px solid #e5e5e5",
  padding: "12px 16px",
  fontSize: 14,
  color: "#1a1a1a",
  borderRadius: 4,
  outline: "none",
  transition: "border-color 0.3s",
};

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function ContatoPage() {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    company: "",
    type: "",
    message: "",
    consent: false,
  });

  const set = (field: string, val: string | boolean) =>
    setForm((p) => ({ ...p, [field]: val }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Obrigado pelo contato! Retornaremos em breve.");
  };

  return (
    <>
      {/* ═══════════════════════════════════════════
          1) HERO
         ═══════════════════════════════════════════ */}
      <section className="relative w-full overflow-hidden" style={{ height: 772 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_IMG})`, transform: "scale(1.05)", transition: "transform 8s ease-out" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to right, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)" }} />
        <div
          className="relative z-10 flex flex-col justify-end h-full"
          style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px 100px 30px" }}
        >
          <span style={{ display: "inline-block", fontSize: 13, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 16 }}>
            CONTATO
          </span>
          <h1 style={{ fontFamily: "'Knockout HTF68', sans-serif", fontSize: "clamp(41px, 6vw, 85px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase", color: "#fff", maxWidth: 800, margin: 0 }}>
            Fale com a Gaiatec Sistemas
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
          2) FORM SECTION — two columns
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
            {/* ── LEFT: Form (3/5 = 60%) ── */}
            <div
              className="lg:col-span-3"
              style={{ padding: "60px 30px 60px" }}
            >
              <AnimateOnScroll>
                <h2
                  style={{
                    fontSize: 28,
                    fontWeight: 700,
                    color: "#1a1a1a",
                    marginBottom: 6,
                  }}
                >
                  Solicitar Orcamento
                </h2>
                <p
                  style={{
                    fontSize: 15,
                    color: "#777",
                    marginBottom: 32,
                    lineHeight: 1.5,
                  }}
                >
                  Preencha o formulario e retornaremos o mais breve possivel.
                </p>
              </AnimateOnScroll>

              <form onSubmit={handleSubmit}>
                {/* Row 1 — Nome + Sobrenome */}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  style={{ marginBottom: 16 }}
                >
                  <input
                    type="text"
                    placeholder="Nome"
                    required
                    value={form.firstName}
                    onChange={(e) => set("firstName", e.target.value)}
                    style={inputBase}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Sobrenome"
                    required
                    value={form.lastName}
                    onChange={(e) => set("lastName", e.target.value)}
                    style={inputBase}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  />
                </div>

                {/* Row 2 — E-mail full */}
                <div style={{ marginBottom: 16 }}>
                  <input
                    type="email"
                    placeholder="E-mail"
                    required
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    style={inputBase}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  />
                </div>

                {/* Row 3 — Telefone + Empresa */}
                <div
                  className="grid grid-cols-1 sm:grid-cols-2 gap-4"
                  style={{ marginBottom: 16 }}
                >
                  <input
                    type="tel"
                    placeholder="Telefone / WhatsApp"
                    required
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    style={inputBase}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  />
                  <input
                    type="text"
                    placeholder="Empresa"
                    value={form.company}
                    onChange={(e) => set("company", e.target.value)}
                    style={inputBase}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  />
                </div>

                {/* Row 4 — Select */}
                <div style={{ marginBottom: 16 }}>
                  <select
                    value={form.type}
                    onChange={(e) => set("type", e.target.value)}
                    style={{
                      ...inputBase,
                      color: form.type ? "#1a1a1a" : "#999",
                      appearance: "none" as const,
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                      backgroundRepeat: "no-repeat",
                      backgroundPosition: "right 16px center",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  >
                    <option value="">Tipo de Solicitacao</option>
                    {enquiryTypes.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Row 5 — Textarea */}
                <div style={{ marginBottom: 20 }}>
                  <textarea
                    placeholder="Sua Mensagem"
                    required
                    rows={4}
                    value={form.message}
                    onChange={(e) => set("message", e.target.value)}
                    style={{ ...inputBase, resize: "none" as const }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#0057DE";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#e5e5e5";
                    }}
                  />
                </div>

                {/* Consent */}
                <div style={{ marginBottom: 24 }}>
                  <label
                    className="flex items-start gap-3 cursor-pointer"
                    style={{ marginBottom: 8 }}
                  >
                    <input
                      type="checkbox"
                      checked={form.consent}
                      onChange={(e) => set("consent", e.target.checked)}
                      style={{
                        marginTop: 3,
                        accentColor: "#0057DE",
                        width: 16,
                        height: 16,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, color: "#666", lineHeight: 1.5 }}>
                      Concordo em receber comunicacoes da Gaiatec Sistemas.
                    </span>
                  </label>
                  <p
                    style={{
                      fontSize: 12,
                      color: "#999",
                      lineHeight: 1.6,
                      paddingLeft: 28,
                    }}
                  >
                    Seus dados serao tratados conforme nossa Politica de
                    Privacidade e a LGPD (Lei 13.709/2018).
                  </p>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  style={{
                    width: "100%",
                    backgroundColor: "#0057DE",
                    color: "#fff",
                    padding: "16px 24px",
                    fontWeight: 700,
                    fontSize: 14,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    border: "none",
                    borderRadius: 4,
                    cursor: "pointer",
                    transition: "background-color 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e5960e";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#0057DE";
                  }}
                >
                  Enviar Mensagem
                </button>
              </form>
            </div>

            {/* ── RIGHT: Contact info dark (2/5 = 40%) ── */}
            <div
              className="lg:col-span-2"
              style={{ backgroundColor: "#1a1a1a", padding: "60px 30px" }}
            >
              <AnimateOnScroll>
                <h2
                  style={{
                    fontFamily: "'Knockout HTF68', sans-serif",
                    fontSize: "clamp(22px, 2.5vw, 28px)",
                    fontWeight: 400,
                    lineHeight: 1.2,
                    textTransform: "uppercase",
                    color: "#fff",
                    marginBottom: 10,
                  }}
                >
                  Fale com um Especialista
                </h2>
                <p
                  style={{
                    fontSize: 14,
                    color: "#888",
                    lineHeight: 1.65,
                    marginBottom: 36,
                  }}
                >
                  Nossa equipe tecnica esta pronta para ajudar com suas
                  necessidades em instrumentacao, automacao e controle de
                  processos.
                </p>
              </AnimateOnScroll>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                {contactCards.map((card, i) => {
                  const Icon = card.icon;
                  return (
                    <AnimateOnScroll key={card.title} delay={i * 0.1}>
                      <a
                        href={card.href}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 16,
                          padding: "20px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 4,
                          textDecoration: "none",
                          transition: "border-color 0.3s, background-color 0.3s",
                          backgroundColor: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = "rgba(245,166,35,0.4)";
                          e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)";
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div
                          style={{
                            width: 44,
                            height: 44,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            border: "1px solid #0057DE",
                            borderRadius: 4,
                            flexShrink: 0,
                          }}
                        >
                          <Icon size={20} style={{ color: "#0057DE" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <h4
                            style={{
                              fontSize: 15,
                              fontWeight: 700,
                              color: "#fff",
                              marginBottom: 4,
                            }}
                          >
                            {card.title}
                          </h4>
                          <p
                            style={{
                              fontSize: 14,
                              color: "#ccc",
                              lineHeight: 1.5,
                              marginBottom: card.sub ? 4 : 0,
                            }}
                          >
                            {card.info}
                          </p>
                          {card.sub && (
                            <p style={{ fontSize: 12, color: "#777", lineHeight: 1.4 }}>
                              {card.sub}
                            </p>
                          )}
                        </div>
                      </a>
                    </AnimateOnScroll>
                  );
                })}
              </div>

              {/* LGPD mini note */}
              <div
                style={{
                  marginTop: 28,
                  paddingTop: 20,
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <p style={{ fontSize: 12, color: "rgba(255,255,255,0.35)", lineHeight: 1.6 }}>
                  Seus dados estao protegidos pela LGPD. Utilizamos suas
                  informacoes apenas para atender sua solicitacao.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) MAP SECTION
         ═══════════════════════════════════════════ */}
      <section id="mapa" style={{ position: "relative" }}>
        {/* Address bar overlay */}
        <div
          style={{
            backgroundColor: "rgba(0,0,0,0.85)",
            padding: "14px 30px",
            position: "relative",
            zIndex: 2,
          }}
        >
          <div
            style={{ maxWidth: 1200, margin: "0 auto" }}
            className="flex items-center gap-3"
          >
            <MapPin size={16} style={{ color: "#0057DE", flexShrink: 0 }} />
            <span style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>
              Rua Heroi da Forca Expedicionaria Brasileira, 22 — Parque Novo Mundo, Sao Paulo/SP — CEP: 02188-040
            </span>
          </div>
        </div>

        {/* Map placeholder */}
        <div
          style={{
            width: "100%",
            height: 360,
            backgroundColor: "#e8e8e8",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <iframe
            title="Mapa Gaiatec Sistemas"
            src="https://www.openstreetmap.org/export/embed.html?bbox=-46.62%2C-23.50%2C-46.58%2C-23.48&layer=mapnik"
            style={{
              width: "100%",
              height: "100%",
              border: "none",
            }}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) WHY GAIATEC
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8f8f8", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  color: "#0057DE",
                  marginBottom: 12,
                }}
              >
                Diferenciais
              </span>
              <h2
                style={{
                  fontFamily: "'Knockout HTF68', sans-serif",
                  fontSize: "clamp(28px, 3vw, 36px)",
                  fontWeight: 400,
                  lineHeight: 1.15,
                  textTransform: "uppercase",
                  color: "#1a1a1a",
                }}
              >
                Por que Escolher a Gaiatec?
              </h2>
            </div>
          </AnimateOnScroll>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {whyCards.map((card, i) => {
              const Icon = card.icon;
              return (
                <AnimateOnScroll key={card.title} delay={i * 0.1}>
                  <div
                    style={{
                      backgroundColor: "#fff",
                      borderRadius: 4,
                      overflow: "hidden",
                      height: "100%",
                      border: "1px solid #e5e5e5",
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      transition: "transform 0.3s ease, box-shadow 0.3s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-4px)";
                      e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "translateY(0)";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)";
                    }}
                  >
                    {/* Yellow top accent */}
                    <div style={{ height: 4, backgroundColor: "#0057DE" }} />
                    <div style={{ padding: "28px 22px" }}>
                      <Icon
                        size={28}
                        style={{ color: "#0057DE", marginBottom: 16 }}
                      />
                      <h4
                        style={{
                          fontSize: 17,
                          fontWeight: 700,
                          color: "#1a1a1a",
                          marginBottom: 8,
                          textTransform: "uppercase",
                        }}
                      >
                        {card.title}
                      </h4>
                      <p style={{ fontSize: 14, lineHeight: 1.65, color: "#777" }}>
                        {card.desc}
                      </p>
                    </div>
                  </div>
                </AnimateOnScroll>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) LGPD NOTICE
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "64px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div
              className="text-center"
              style={{ maxWidth: 720, margin: "0 auto" }}
            >
              <Shield
                size={40}
                style={{ color: "#0057DE", margin: "0 auto 20px" }}
              />
              <h3
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: "#1a1a1a",
                  marginBottom: 14,
                  textTransform: "uppercase",
                }}
              >
                Compromisso com a Privacidade
              </h3>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "#777" }}>
                A Gaiatec Sistemas valoriza a privacidade e a protecao dos seus
                dados pessoais. Todas as informacoes coletadas por meio deste
                formulario serao tratadas de acordo com a Lei Geral de Protecao
                de Dados (LGPD — Lei 13.709/2018) e utilizadas exclusivamente
                para fins de atendimento a sua solicitacao.
              </p>
              {/* accent bar */}
              <div
                style={{
                  width: 60,
                  height: 3,
                  backgroundColor: "#0057DE",
                  margin: "28px auto 0",
                }}
              />
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          6) CTA BANNER
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#111", padding: "80px 0" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div style={{ maxWidth: 640 }}>
                <h2
                  style={{
                    fontFamily: "'Knockout HTF68', sans-serif",
                    fontSize: "clamp(24px, 3vw, 36px)",
                    fontWeight: 400,
                    lineHeight: 1.2,
                    textTransform: "uppercase",
                    color: "#fff",
                    marginBottom: 8,
                  }}
                >
                  Estamos prontos para atender voce
                </h2>
                <p style={{ fontSize: 15, color: "#888", lineHeight: 1.6 }}>
                  Precisa de suporte tecnico ou quer saber mais sobre nossas
                  solucoes? Fale com a equipe Gaiatec.
                </p>
              </div>

              <div
                className="flex flex-wrap gap-4 justify-center lg:justify-end"
                style={{ flexShrink: 0 }}
              >
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "#0057DE",
                    color: "#000",
                    padding: "14px 32px",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    textDecoration: "none",
                    borderRadius: 4,
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "#e5b800";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "#0057DE";
                  }}
                >
                  Fale com um Especialista <ChevronRight size={14} />
                </Link>
                <Link
                  to="/contato"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "transparent",
                    color: "#fff",
                    padding: "14px 32px",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                    textDecoration: "none",
                    borderRadius: 4,
                    border: "2px solid #444",
                    transition: "all 0.3s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "#0057DE";
                    e.currentTarget.style.color = "#0057DE";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#444";
                    e.currentTarget.style.color = "#fff";
                  }}
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
