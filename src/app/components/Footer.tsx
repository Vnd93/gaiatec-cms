import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Phone, MessageSquare, Mail, ArrowRight, Loader2, CheckCircle2, Linkedin, Instagram, Facebook, Youtube } from "lucide-react";
import type { CmsFormVersion, CmsNavigationContent } from "@/shared/contracts/cms-content";
import { usePublishedSiteShell } from "@/public/site-shell-context";
import { getPublishedForm } from "@/public/catalog-api";
import { submitGovernedLead } from "@/public/lead-api";
import { TurnstileChallenge } from "./TurnstileChallenge";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

type FooterLink = { label: string; href: string; newTab: boolean };
type FooterColumn = { title: string; links: FooterLink[] };

function menuToColumns(items: CmsNavigationContent["items"] | undefined): FooterColumn[] {
  if (!items) return [];
  const visible = items.filter((item) => item.visible && item.location === "footer");
  const roots = visible.filter((item) => item.parentId === null).sort((a, b) => a.order - b.order);
  const columns = roots.map((root) => ({
    title: root.label.toUpperCase(),
    links: visible
      .filter((item) => item.parentId === root.id)
      .sort((a, b) => a.order - b.order)
      .map((item) => ({ label: item.label, href: item.href, newTab: item.newTab })),
  }));
  return columns;
}

const SOCIAL_ICONS: Record<string, typeof Linkedin> = {
  linkedin: Linkedin,
  instagram: Instagram,
  facebook: Facebook,
  youtube: Youtube,
};

type NlStatus = "idle" | "submitting" | "success" | "error";

export function Footer() {
  const { navigation, settings } = usePublishedSiteShell();

  const columns = menuToColumns(navigation?.items).slice(0, 4);
  const year = new Date().getFullYear();

  const tel = settings?.company.phone.trim() ?? "";
  const wpp = settings?.company.whatsapp.trim() ?? "";
  const mail = settings?.company.email.trim() ?? "";

  const [email, setEmail] = useState("");
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [newsletterWebsite, setNewsletterWebsite] = useState("");
  const [nlStatus, setNlStatus] = useState<NlStatus>("idle");
  const [newsletterForm, setNewsletterForm] = useState<CmsFormVersion | null>(null);
  const [newsletterFormLoading, setNewsletterFormLoading] = useState(true);
  const [newsletterCaptchaRequired, setNewsletterCaptchaRequired] = useState(false);
  const [newsletterCaptchaToken, setNewsletterCaptchaToken] = useState("");
  const [newsletterIdempotencyKey, setNewsletterIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  useEffect(() => {
    let active = true;
    void getPublishedForm("newsletter")
      .then((form) => {
        if (active) setNewsletterForm(form);
      })
      .catch(() => {
        if (active) setNewsletterForm(null);
      })
      .finally(() => {
        if (active) setNewsletterFormLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !newsletterConsent || !newsletterForm || nlStatus === "submitting") return;
    setNlStatus("submitting");
    try {
      const emailField = newsletterForm.fields.find((field) => field.type === "email");
      if (!emailField) throw new Error("O formulário de newsletter precisa de um campo de e-mail.");
      const fields = Object.fromEntries(
        newsletterForm.fields
          .filter((field) => field.type !== "hidden")
          .map((field) => [
            field.key,
            field.id === emailField.id ? email.trim() : field.type === "checkbox" ? true : "",
          ]),
      );
      await submitGovernedLead({
        form: newsletterForm,
        fields,
        idempotencyKey: newsletterIdempotencyKey,
        source: "newsletter",
        consentAccepted: newsletterConsent,
        honeypot: newsletterWebsite,
        captchaToken: newsletterCaptchaToken || undefined,
      });
      setNlStatus("success");
      setEmail("");
      setNewsletterConsent(false);
      setNewsletterWebsite("");
      setNewsletterCaptchaRequired(false);
      setNewsletterCaptchaToken("");
      setNewsletterIdempotencyKey(crypto.randomUUID());
      setTimeout(() => setNlStatus("idle"), 6000);
    } catch (caught) {
      if ((caught as Error & { challengeRequired?: boolean }).challengeRequired)
        setNewsletterCaptchaRequired(true);
      setNlStatus("error");
    }
  };

  const connectLinks = [
    tel ? { icon: Phone, label: tel, href: `tel:${tel.replace(/[^\d+]/g, "")}` } : null,
    wpp
      ? {
          icon: MessageSquare,
          label: wpp,
          href: `https://wa.me/${wpp.replace(/\D/g, "").startsWith("55") ? wpp.replace(/\D/g, "") : `55${wpp.replace(/\D/g, "")}`}`,
        }
      : null,
    mail ? { icon: Mail, label: mail, href: `mailto:${mail}` } : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);
  const socialLinks = (settings?.socialLinks ?? []).map((item) => ({
    ...item,
    icon: SOCIAL_ICONS[item.network.toLowerCase()] ?? Linkedin,
  }));

  return (
    <footer className="bg-[#080d1a] text-white" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ─── Main band ─── */}
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-16 md:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-14 lg:gap-24">
          {/* Newsletter + Conecte-se */}
          <div id="newsletter">
            <span className="block text-[12px] font-semibold tracking-[0.22em] uppercase text-[#4d94ff] mb-4">
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
                    disabled={nlStatus === "submitting" || newsletterFormLoading || !newsletterForm}
                    className="flex-1 bg-transparent border border-white/15 px-4 py-3 text-[14px] text-white placeholder:text-slate-500 outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={nlStatus === "submitting" || newsletterFormLoading || !newsletterForm}
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
                  <span>
                    {newsletterForm?.consent.text ?? "A configuração de consentimento está indisponível."}{" "}
                    <Link
                      to={newsletterForm?.consent.privacyPath ?? "/politica-de-privacidade"}
                      className="underline hover:text-white"
                    >
                      Política de Privacidade
                    </Link>
                    .
                  </span>
                </label>
                {newsletterCaptchaRequired && (
                  <TurnstileChallenge onToken={setNewsletterCaptchaToken} />
                )}
                {!newsletterFormLoading && !newsletterForm && (
                  <p className="text-[13px] text-amber-300 mt-2.5" role="status">
                    Newsletter temporariamente indisponível enquanto a configuração é revisada no CMS.
                  </p>
                )}
                {nlStatus === "error" && (
                  <p className="text-[13px] text-red-400 mt-2.5">
                    Não foi possível concluir. Tente novamente em instantes.
                  </p>
                )}
              </form>
            )}

            {/* Conecte-se — canais reais de contato */}
            {connectLinks.length > 0 && <div className="mt-10 pt-8 border-t border-white/10">
              <span className="block text-[12px] font-semibold tracking-[0.22em] uppercase text-slate-400 mb-4">
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
            </div>}
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
                      <a
                        href={link.href}
                        {...(link.newTab || /^https?:\/\//i.test(link.href)
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-slate-400 text-[13px] leading-snug hover:text-white transition-colors"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>

                {col === columns[columns.length - 1] && socialLinks.length > 0 && (
                  <div className="mt-7">
                    <span className="block text-[11px] tracking-[0.12em] uppercase text-white mb-3" style={{ fontWeight: 700 }}>
                      Redes sociais
                    </span>
                    <div className="flex items-center gap-4">
                      {socialLinks.map((s) => (
                        <a
                          key={`${s.network}-${s.href}`}
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
              <span className="text-[12px] text-slate-400">
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
