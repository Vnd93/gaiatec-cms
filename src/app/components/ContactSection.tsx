import { useState } from "react";
import { Link } from "react-router";
import { Phone, MessageSquare, MapPin, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { useContactInfo } from "../hooks/useSiteData";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "../../lib/supabase";
import { TurnstileChallenge } from "./TurnstileChallenge";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

const FALLBACK_CTAS = [
  { icon: Phone, value: "(11) 2207-1933", hint: "Fale com nossa equipe comercial · Fax (11) 2207-1986", href: "tel:+551122071933" },
  { icon: MessageSquare, value: "(11) 2207-1986", hint: "WhatsApp · Seg. a Sex., 8h às 18h", href: "https://wa.me/551122071986" },
  { icon: MapPin, value: "Parque Novo Mundo · São Paulo/SP", hint: "R. Herói da Força Expedicionária Brasileira, 22", href: "/contato" },
];

const enquiryTypes = ["Orçamento", "Suporte Técnico", "Calibração", "Instrumentação", "Automação", "Proteção Catódica", "Outros"];

type FormStatus = "idle" | "submitting" | "success" | "error";

export function ContactSection({ variant = "brand" }: { variant?: "brand" | "light" }) {
  const { contact } = useContactInfo();
  const light = variant === "light";
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", company: "", enquiryType: "", message: "", consent: false, website: "",
  });
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const contactCtas = contact.telefone
    ? [
        {
          icon: Phone,
          value: contact.telefone,
          hint: `Fale com nossa equipe comercial${contact.fax ? ` · Fax ${contact.fax}` : ""}`,
          href: `tel:+55${contact.telefone.replace(/\D/g, "")}`,
        },
        {
          icon: MessageSquare,
          value: contact.whatsapp || "(11) 2207-1986",
          hint: `WhatsApp${contact.whatsapp_horario ? ` · ${contact.whatsapp_horario}` : ""}`,
          href: `https://wa.me/55${(contact.whatsapp || "").replace(/\D/g, "")}`,
        },
        {
          icon: MapPin,
          value: contact.bairro_cidade || "Nossa unidade",
          hint: contact.endereco || "",
          href: "/contato",
        },
      ]
    : FALLBACK_CTAS;

  const resetForm = () => {
    setFormData({
      firstName: "", lastName: "", email: "", phone: "", company: "", enquiryType: "", message: "", consent: false, website: "",
    });
    setCaptchaRequired(false);
    setCaptchaToken("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.consent) {
      setStatus("error");
      setErrorMsg("Você precisa concordar com a Política de Privacidade.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/submit-contact`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          ...formData,
          origem: typeof window !== "undefined" ? window.location.pathname : "/",
          idempotencyKey: crypto.randomUUID(),
          captchaToken: captchaToken || undefined,
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (data?.captchaRequired) setCaptchaRequired(true);
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      setStatus("success");
      resetForm();
      setTimeout(() => setStatus("idle"), 6000);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar. Tente novamente em alguns instantes."
      );
    }
  };

  const isSubmitting = status === "submitting";

  const inputClass = light
    ? "w-full bg-[#F2F2F2] border border-black/10 px-4 py-3 text-[14px] text-black placeholder:text-[#8a8a8a] outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
    : "w-full bg-white border border-black/10 px-4 py-3 text-[14px] text-black placeholder:text-[#8a8a8a] outline-none focus:border-black transition-colors disabled:opacity-50";

  return (
    <section className={light ? "bg-white" : "bg-[#FFCC00]"} id="contact" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 py-16 md:py-24">
          {/* ─── Esquerda — formulário ─── */}
          <div>
            <AnimateOnScroll>
              <h2 className="text-black mb-2" style={{ fontFamily: KNOCKOUT, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase" }}>
                Solicitar Orçamento
              </h2>
              <p className="text-black/70 text-[15px] mb-8">Preencha o formulário e retornaremos o mais breve possível.</p>
            </AnimateOnScroll>

            {status === "success" && (
              <div className="mb-6 flex items-start gap-3 p-4 bg-white border border-black/10 rounded-md">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-black font-semibold text-sm">Mensagem enviada com sucesso!</p>
                  <p className="text-black/70 text-sm mt-1">Recebemos sua solicitação. Nossa equipe técnica retornará em breve no e-mail informado.</p>
                </div>
              </div>
            )}

            {status === "error" && errorMsg && (
              <div className="mb-6 flex items-start gap-3 p-4 bg-white border border-red-300 rounded-md">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-black font-semibold text-sm">Erro ao enviar</p>
                  <p className="text-red-700 text-sm mt-1">{errorMsg}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
                <label htmlFor="contact-website">Não preencha este campo</label>
                <input id="contact-website" name="website" tabIndex={-1} autoComplete="off" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="text" aria-label="Nome" maxLength={80} placeholder="Nome" required disabled={isSubmitting} className={inputClass} value={formData.firstName} onChange={(e) => setFormData({ ...formData, firstName: e.target.value })} />
                <input type="text" aria-label="Sobrenome" maxLength={100} placeholder="Sobrenome" disabled={isSubmitting} className={inputClass} value={formData.lastName} onChange={(e) => setFormData({ ...formData, lastName: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input type="email" aria-label="E-mail" maxLength={254} placeholder="E-mail" required disabled={isSubmitting} className={inputClass} value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                <input type="tel" aria-label="Telefone ou WhatsApp" maxLength={40} placeholder="Telefone / WhatsApp" disabled={isSubmitting} className={inputClass} value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
              </div>
              <input type="text" aria-label="Empresa" maxLength={160} placeholder="Empresa" disabled={isSubmitting} className={inputClass} value={formData.company} onChange={(e) => setFormData({ ...formData, company: e.target.value })} />
              <select
                disabled={isSubmitting}
                aria-label="Tipo de solicitação"
                className={`${inputClass} appearance-none`}
                value={formData.enquiryType}
                onChange={(e) => setFormData({ ...formData, enquiryType: e.target.value })}
                style={{ color: formData.enquiryType ? "#000" : "#8a8a8a" }}
              >
                <option value="">Tipo de Solicitação</option>
                {enquiryTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea aria-label="Mensagem" maxLength={4000} placeholder="Sua Mensagem" required rows={5} disabled={isSubmitting} className={`${inputClass} resize-none`} value={formData.message} onChange={(e) => setFormData({ ...formData, message: e.target.value })} />
              <div className="space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input type="checkbox" required disabled={isSubmitting} className="mt-1 accent-black" checked={formData.consent} onChange={(e) => setFormData({ ...formData, consent: e.target.checked })} />
                  <span className="text-[12px] text-black/70">
                    Concordo com a{" "}
                    <Link
                      to="/politica-de-privacidade"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                      /* dentro de <label>: impede que abrir a política marque o checkbox */
                      onClick={(e) => e.stopPropagation()}
                    >
                      Política de Privacidade
                    </Link>{" "}
                    e em receber comunicações da Gaiatec Sistemas.
                  </span>
                </label>
              </div>
              {captchaRequired && <TurnstileChallenge onToken={setCaptchaToken} />}
              <button
                type="submit"
                disabled={isSubmitting}
                className={`${light ? "bg-[#0057DE] text-white hover:bg-[#0046b3]" : "bg-black text-[#FFCC00] hover:bg-[#0057DE] hover:text-white"} px-10 py-3.5 text-[13px] tracking-wider transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed uppercase`}
                style={{ fontWeight: 700, letterSpacing: "0.08em" }}
              >
                {isSubmitting ? (<><Loader2 size={16} className="animate-spin" /> Enviando...</>) : "Enviar"}
              </button>
            </form>
          </div>

          {/* ─── Direita — contatos (estilo lista, hover branco) ─── */}
          <div>
            <AnimateOnScroll>
              <h2 className="text-black mb-2" style={{ fontFamily: KNOCKOUT, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase" }}>
                Fale com um Especialista
              </h2>
              <p className="text-black/70 text-[15px] mb-10 max-w-[460px]">
                Nossa equipe técnica está pronta para ajudar com instrumentação, automação e controle de processos.
              </p>
            </AnimateOnScroll>

            <AnimateOnScroll>
              <div className="border-t border-black/20">
                {contactCtas.map((cta) => {
                  const external = cta.href.startsWith("http");
                  return (
                    <a
                      key={cta.value}
                      href={cta.href}
                      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      className={`group relative flex items-center gap-5 border-b border-black/20 px-3 py-6 transition-colors duration-300 ${light ? "hover:bg-[#F2F2F2]" : "hover:bg-white"}`}
                    >
                      <cta.icon size={26} strokeWidth={1.75} className="flex-shrink-0 text-black" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-black leading-none truncate" style={{ fontFamily: KNOCKOUT, fontSize: "clamp(20px, 2.4vw, 28px)", fontWeight: 500 }}>
                          {cta.value}
                        </h4>
                        <p className="overflow-hidden max-h-0 opacity-0 group-hover:max-h-12 group-hover:opacity-100 group-hover:mt-1.5 transition-all duration-300 text-black/70 text-[13px] leading-snug">
                          {cta.hint}
                        </p>
                      </div>
                      <span className={`flex-shrink-0 flex items-center justify-center w-10 h-10 transition-colors duration-300 ${light ? "group-hover:bg-[#0057DE]" : "group-hover:bg-[#FFCC00]"}`}>
                        <ArrowRight size={18} className={`transition-transform duration-300 group-hover:translate-x-0.5 ${light ? "text-black group-hover:text-white" : "text-black"}`} />
                      </span>
                    </a>
                  );
                })}
              </div>
            </AnimateOnScroll>

            <p className="text-black/60 text-[12px] leading-[1.6] mt-8">
              Seus dados estão protegidos pela LGPD. Utilizamos suas informações apenas para atender sua solicitação.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
