import { useState } from "react";
import { Link } from "react-router";
import { Phone, MessageSquare, Mail, ArrowRight, Loader2, CheckCircle2, Linkedin, Instagram, Facebook, Youtube } from "lucide-react";
import { useMenu, useContactInfo } from "../hooks/useSiteData";
import { SUPABASE_ANON_KEY, SUPABASE_URL, type SiteMenuItem } from "../../lib/supabase";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/* ────────────────────────────────────────────────────────
   Footer hardcoded fallback (used when CMS API is unreachable)
   ──────────────────────────────────────────────────────── */
type FooterColumn = { title: string; links: { label: string; href: string }[] };

const FALLBACK_COLUMNS: FooterColumn[] = [
  {
    title: "INDÚSTRIAS",
    links: [
      { label: "Saneamento / Líquido", href: "/setores/saneamento" },
      { label: "Gás e Petróleo", href: "/setores/gas-petroleo" },
      { label: "Biogás e Biometano", href: "/setores/biogas-biometano" },
      { label: "Proteção Catódica", href: "/setores/protecao-catodica" },
      { label: "HVAC", href: "/setores/hvac" },
      { label: "Controle Ambiental", href: "/setores/controle-ambiental" },
      { label: "Agronegócio", href: "/setores/agronegocio" },
      { label: "Indústria", href: "/setores/industria" },
      { label: "Telemetria", href: "/setores/telemetria" },
    ],
  },
  {
    title: "PRODUTOS",
    links: [
      { label: "Medição de Vazão", href: "/setores/instrumentacao" },
      { label: "Detecção de Gases", href: "/deteccao-de-gas" },
      { label: "Automação", href: "/setores/industria" },
      { label: "Proteção Catódica", href: "/setores/protecao-catodica" },
      { label: "Telemetria", href: "/setores/telemetria" },
    ],
  },
  {
    title: "SERVIÇOS",
    links: [
      { label: "Automações", href: "/servicos/automacoes" },
      { label: "Instalações e Comissionamentos", href: "/servicos/instalacoes-comissionamentos" },
      { label: "Calibração Rastreável", href: "/servicos/calibracao-rastreavel-laboratorio" },
      { label: "Manutenções", href: "/servicos/manutencoes" },
      { label: "Consultoria e Inspeções Técnicas", href: "/servicos/consultoria-inspecoes-tecnicas" },
    ],
  },
  {
    title: "EMPRESA",
    links: [
      { label: "A Gaiatec", href: "/sobre" },
      { label: "Blog", href: "/blog" },
      { label: "Biodigestor", href: "/biodigestor" },
      { label: "Contato", href: "/contato" },
    ],
  },
];

/* ────────────────────────────────────────────────────────
   Build columns from the CMS menu tree (top-level → coluna,
   itens sem filhos agregados em EMPRESA, achatando até as folhas).
   ──────────────────────────────────────────────────────── */
function flattenLeaves(item: SiteMenuItem): SiteMenuItem[] {
  if (!item.children || item.children.length === 0) return [item];
  return item.children.flatMap(flattenLeaves);
}

function menuToColumns(menu: SiteMenuItem[]): FooterColumn[] {
  if (!menu || menu.length === 0) return FALLBACK_COLUMNS;

  const cols: FooterColumn[] = [];
  const orphans: { label: string; href: string }[] = [];

  for (const item of menu) {
    if (item.href === "/" || item.label.toLowerCase() === "home") continue;

    if (item.children && item.children.length > 0) {
      const leaves = item.children.flatMap(flattenLeaves);
      const seen = new Set<string>();
      const links: { label: string; href: string }[] = [];
      for (const leaf of leaves) {
        const href = leaf.href ?? "#";
        if (seen.has(href)) continue;
        seen.add(href);
        links.push({ label: leaf.label, href });
        if (links.length >= 9) break;
      }
      cols.push({ title: item.label.toUpperCase(), links });
    } else {
      orphans.push({ label: item.label, href: item.href ?? "#" });
    }
  }

  if (orphans.length > 0) {
    const empresaCol = cols.find((c) => c.title === "EMPRESA");
    if (empresaCol) {
      const seen = new Set(empresaCol.links.map((l) => l.href));
      for (const o of orphans) if (!seen.has(o.href)) empresaCol.links.push(o);
    } else {
      cols.push({ title: "EMPRESA", links: orphans });
    }
  }

  return cols;
}

/* Redes sociais — URLs reais a fornecer pela Gaiatec (placeholders por ora). */
// Links sociais voltam somente após URLs oficiais serem aprovadas; nunca publicar `#`.
const SOCIALS: { icon: typeof Linkedin; label: string; href: string }[] = [];

type NlStatus = "idle" | "submitting" | "success" | "error";

export function Footer() {
  const { menu } = useMenu();
  const { contact } = useContactInfo();

  const columns = menuToColumns(menu).slice(0, 4);
  const year = new Date().getFullYear();

  const tel = contact.telefone || "(11) 2207-1933";
  const wpp = contact.whatsapp || "(11) 2207-1986";
  const mail = contact.email || "vendas@gaiatecsistemas.com.br";

  const [email, setEmail] = useState("");
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [newsletterWebsite, setNewsletterWebsite] = useState("");
  const [nlStatus, setNlStatus] = useState<NlStatus>("idle");

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !newsletterConsent || nlStatus === "submitting") return;
    setNlStatus("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          firstName: "Inscrição Newsletter",
          lastName: "",
          email: email.trim(),
          phone: "",
          company: "",
          enquiryType: "Newsletter",
          message: "Solicito inscrição na newsletter da Gaiatec Sistemas.",
          consent: true,
          origem: typeof window !== "undefined" ? window.location.pathname : "/",
          website: newsletterWebsite,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      if (!res.ok) throw new Error();
      setNlStatus("success");
      setEmail("");
      setNewsletterConsent(false);
      setTimeout(() => setNlStatus("idle"), 6000);
    } catch {
      setNlStatus("error");
    }
  };

  const connectLinks = [
    { icon: Phone, label: tel, href: `tel:+55${tel.replace(/\D/g, "")}` },
    { icon: MessageSquare, label: wpp, href: `https://wa.me/55${wpp.replace(/\D/g, "")}` },
    { icon: Mail, label: mail, href: `mailto:${mail}` },
  ];

  return (
    <footer className="bg-[#080d1a] text-white" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ─── Main band ─── */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-14 lg:gap-24">
          {/* Newsletter + Conecte-se */}
          <div id="newsletter">
            <span className="block text-[12px] font-semibold tracking-[0.22em] uppercase text-[#0057DE] mb-4">
              Newsletter
            </span>
            <h2
              className="text-white mb-4"
              style={{ fontFamily: KNOCKOUT, fontSize: "clamp(30px, 3.4vw, 46px)", fontWeight: 500, lineHeight: 0.98, textTransform: "uppercase" }}
            >
              Junte-se à nossa lista
            </h2>
            <p className="text-slate-400 text-[15px] leading-[1.65] max-w-[420px] mb-7">
              Receba conteúdos técnicos, novidades em instrumentação e lançamentos da Gaiatec direto no seu e-mail.
            </p>

            {nlStatus === "success" ? (
              <div className="flex items-center gap-3 border border-[#0057DE]/40 bg-[#0057DE]/10 px-4 py-3.5 max-w-[440px]">
                <CheckCircle2 size={20} className="text-[#4d94ff] flex-shrink-0" />
                <p className="text-[14px] text-slate-200">
                  Inscrição recebida! Em breve você receberá nossas novidades.
                </p>
              </div>
            ) : (
              <form onSubmit={handleNewsletter} className="max-w-[440px]">
                <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
                  <label htmlFor="newsletter-website">Não preencha este campo</label>
                  <input id="newsletter-website" tabIndex={-1} autoComplete="off" value={newsletterWebsite} onChange={(e) => setNewsletterWebsite(e.target.value)} />
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="email"
                    aria-label="E-mail para newsletter"
                    maxLength={254}
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Seu melhor e-mail"
                    disabled={nlStatus === "submitting"}
                    className="flex-1 bg-transparent border border-white/15 px-4 py-3 text-[14px] text-white placeholder:text-slate-500 outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={nlStatus === "submitting"}
                    className="inline-flex items-center justify-center gap-2 bg-[#0057DE] text-white px-6 py-3 text-[13px] uppercase tracking-[0.06em] hover:bg-[#0046b3] transition-colors disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
                    style={{ fontWeight: 700 }}
                  >
                    {nlStatus === "submitting" ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <>Inscrever <ArrowRight size={15} /></>
                    )}
                  </button>
                </div>
                <label className="mt-3 flex items-start gap-2 text-[12px] leading-5 text-slate-400">
                  <input type="checkbox" required checked={newsletterConsent} onChange={(e) => setNewsletterConsent(e.target.checked)} className="mt-1 accent-[#0057DE]" />
                  <span>Li a <Link to="/politica-de-privacidade" className="underline hover:text-white">Política de Privacidade</Link> e autorizo o envio da newsletter.</span>
                </label>
                {nlStatus === "error" && (
                  <p className="text-[13px] text-red-400 mt-2.5">
                    Não foi possível concluir. Tente novamente em instantes.
                  </p>
                )}
              </form>
            )}

            {/* Conecte-se — canais reais de contato */}
            <div className="mt-10 pt-8 border-t border-white/10">
              <span className="block text-[12px] font-semibold tracking-[0.22em] uppercase text-slate-500 mb-4">
                Conecte-se
              </span>
              <div className="flex flex-col gap-3">
                {connectLinks.map((c) => {
                  const external = c.href.startsWith("http");
                  return (
                    <a
                      key={c.label}
                      href={c.href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className="group inline-flex items-center gap-2.5 text-slate-300 hover:text-white transition-colors w-fit"
                    >
                      <c.icon size={14} strokeWidth={1.75} className="text-[#4d94ff] flex-shrink-0" />
                      <span className="text-[13px]">{c.label}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10">
            {columns.map((col) => (
              <div key={col.title}>
                <h6 className="text-[12px] text-white mb-5 tracking-[0.12em] uppercase" style={{ fontWeight: 700 }}>
                  {col.title}
                </h6>
                <ul className="space-y-3">
                  {col.links.map((link) => (
                    <li key={`${col.title}-${link.label}-${link.href}`}>
                      <a href={link.href} className="text-slate-400 text-[13px] leading-snug hover:text-white transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>

                {col.title === "EMPRESA" && (
                  <div className="mt-7">
                    <span className="block text-[11px] tracking-[0.12em] uppercase text-white mb-3" style={{ fontWeight: 700 }}>
                      Redes sociais
                    </span>
                    <div className="flex items-center gap-4">
                      {SOCIALS.map((s) => (
                        <a
                          key={s.label}
                          href={s.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={s.label}
                          className="text-slate-400 hover:text-white transition-colors"
                        >
                          <s.icon size={18} strokeWidth={1.75} />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Bottom bar ─── */}
      <div className="border-t border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-7">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="flex items-center gap-5">
              <a href="/" className="inline-block">
                <img loading="lazy" src="/logo-gaiatec-white.png" alt="Gaiatec Sistemas" style={{ height: 30, width: "auto" }} />
              </a>
              <span className="text-[12px] text-slate-500">
                &copy; {year} Gaiatec Sistemas. Todos os direitos reservados.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-7 gap-y-2 text-[12px]">
              <Link to="/politica-de-privacidade" className="text-slate-400 hover:text-white transition-colors">
                Política de Privacidade
              </Link>
              <Link to="/termos-de-uso" className="text-slate-400 hover:text-white transition-colors">
                Termos de Uso
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
