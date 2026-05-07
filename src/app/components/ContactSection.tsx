import { useState } from "react";
import { Phone, MessageSquare, MapPin, ChevronRight, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { useContactInfo } from "../hooks/useSiteData";

const FALLBACK_CTAS = [
  { icon: Phone, title: "Telefone Comercial", description: "(11) 2207-1933 · Fax: (11) 2207-1986", href: "tel:+551122071933" },
  { icon: MessageSquare, title: "WhatsApp", description: "(11) 2207-1986 · Seg. a Sex., 8h às 18h", href: "https://wa.me/551122071986" },
  { icon: MapPin, title: "Localização", description: "R. Herói da Força Expedicionária Brasileira, 22 — Parque Novo Mundo, São Paulo/SP", href: "#" },
];

const enquiryTypes = ["Orçamento", "Suporte Técnico", "Calibração", "Instrumentação", "Automação", "Proteção Catódica", "Outros"];

const SUPABASE_URL = "https://pbmyttjnqijdbscrjayk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBibXl0dGpucWlqZGJzY3JqYXlrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwNTM3MTIsImV4cCI6MjA4NzYyOTcxMn0.YtCaZCoKHJTGEHxaCRl3yaf0Aol86oXWjKoD0xgXcok";

type FormStatus = "idle" | "submitting" | "success" | "error";

export function ContactSection() {
  const { contact } = useContactInfo();
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", company: "", enquiryType: "", message: "", consent: false,
  });
  const [status, setStatus] = useState<FormStatus>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const contactCtas = contact.telefone
    ? [
        {
          icon: Phone,
          title: "Telefone Comercial",
          description: `${contact.telefone}${contact.fax ? ` · Fax: ${contact.fax}` : ""}`,
          href: `tel:+55${contact.telefone.replace(/\D/g, "")}`,
        },
        {
          icon: MessageSquare,
          title: "WhatsApp",
          description: `${contact.whatsapp}${contact.whatsapp_horario ? ` · ${contact.whatsapp_horario}` : ""}`,
          href: `https://wa.me/55${(contact.whatsapp || "").replace(/\D/g, "")}`,
        },
        {
          icon: MapPin,
          title: "Localização",
          description: `${contact.endereco}${contact.bairro_cidade ? ` — ${contact.bairro_cidade}` : ""}`,
          href: "#",
        },
      ]
    : FALLBACK_CTAS;

  const resetForm = () => {
    setFormData({
      firstName: "", lastName: "", email: "", phone: "", company: "", enquiryType: "", message: "", consent: false,
    });
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
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || `Erro ${res.status}`);
      }

      setStatus("success");
      resetForm();

      // Volta ao estado idle após 6s pra permitir novo envio sem reload
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

  return (
    <section className="bg-[#f7f7f7]" id="contact">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-0">
          {/* Left - Form */}
          <div className="py-16 md:py-24 lg:pr-16">
            <AnimateOnScroll>
              <h2 className="text-[28px] md:text-[36px] text-black mb-2" style={{ fontWeight: 700 }}>Solicitar Orçamento</h2>
              <p className="text-[#666] text-[15px] mb-8">Preencha o formulário e retornaremos o mais breve possível.</p>
            </AnimateOnScroll>

            {/* Mensagem de sucesso */}
            {status === "success" && (
              <div className="mb-6 flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-md">
                <CheckCircle2 size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-green-900 font-semibold text-sm">Mensagem enviada com sucesso!</p>
                  <p className="text-green-800 text-sm mt-1">
                    Recebemos sua solicitação. Nossa equipe técnica retornará em breve no e-mail informado.
                  </p>
                </div>
              </div>
            )}

            {/* Mensagem de erro */}
            {status === "error" && errorMsg && (
              <div className="mb-6 flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-md">
                <AlertCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-red-900 font-semibold text-sm">Erro ao enviar</p>
                  <p className="text-red-800 text-sm mt-1">{errorMsg}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text" placeholder="Nome" required
                  disabled={isSubmitting}
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
                <input
                  type="text" placeholder="Sobrenome"
                  disabled={isSubmitting}
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="email" placeholder="E-mail" required
                  disabled={isSubmitting}
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <input
                  type="tel" placeholder="Telefone / WhatsApp"
                  disabled={isSubmitting}
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <input
                type="text" placeholder="Empresa"
                disabled={isSubmitting}
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#0057DE] transition-colors disabled:opacity-50"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
              <select
                disabled={isSubmitting}
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black outline-none focus:border-[#0057DE] transition-colors appearance-none disabled:opacity-50"
                value={formData.enquiryType}
                onChange={(e) => setFormData({ ...formData, enquiryType: e.target.value })}
                style={{ color: formData.enquiryType ? "#000" : "#999" }}
              >
                <option value="">Tipo de Solicitação</option>
                {enquiryTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea
                placeholder="Sua Mensagem" required rows={5}
                disabled={isSubmitting}
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#0057DE] transition-colors resize-none disabled:opacity-50"
                value={formData.message}
                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
              />
              <div className="space-y-3">
                <p className="text-[12px] text-[#999] leading-[1.6]">
                  Ao enviar este formulário, você concorda com nossa{" "}
                  <a href="#" className="text-black underline">Política de Privacidade</a> e{" "}
                  <a href="#" className="text-black underline">Termos de Uso</a>.
                </p>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    required
                    disabled={isSubmitting}
                    className="mt-1 accent-[#0057DE]"
                    checked={formData.consent}
                    onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                  />
                  <span className="text-[12px] text-[#999]">
                    Concordo com a Política de Privacidade e em receber comunicações da Gaiatec Sistemas.
                  </span>
                </label>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-[#0057DE] text-white px-10 py-3 text-[13px] tracking-wider hover:bg-[#0046b3] transition-colors inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ fontWeight: 700 }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar"
                )}
              </button>
            </form>
          </div>

          {/* Right - Contact info */}
          <div className="relative bg-black py-16 md:py-24 px-6 lg:px-16 overflow-visible">
            {/* Extend black background to the right edge */}
            <div className="absolute inset-0 bg-black" style={{ right: "-9999px" }} />
            <div className="relative">
            <AnimateOnScroll>
              <h2 className="text-white text-[28px] md:text-[36px] mb-2" style={{ fontWeight: 700 }}>Fale com um Especialista</h2>
              <p className="text-white/60 text-[15px] mb-10">Nossa equipe técnica está pronta para ajudar com suas necessidades em instrumentação, automação e controle de processos.</p>
            </AnimateOnScroll>

            <div className="space-y-6">
              {contactCtas.map((cta, i) => (
                <AnimateOnScroll key={cta.title} direction="up" delay={i * 0.1}>
                  <a
                    href={cta.href}
                    className="flex items-start gap-4 group p-5 border border-white/10 hover:border-[#0057DE]/40 transition-all"
                  >
                    <div className="w-12 h-12 flex items-center justify-center border border-[#0057DE] flex-shrink-0">
                      <cta.icon size={20} className="text-[#0057DE]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white text-[18px] group-hover:text-[#0057DE] transition-colors" style={{ fontWeight: 700 }}>
                        {cta.title}
                      </h4>
                      <p className="text-white/50 text-[13px] mt-1">{cta.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-[#0057DE] flex-shrink-0 mt-1" />
                  </a>
                </AnimateOnScroll>
              ))}
            </div>

            {/* LGPD note */}
            <div className="mt-10 pt-6 border-t border-white/10">
              <p className="text-white/40 text-[12px] leading-[1.6]">
                Seus dados estão protegidos pela LGPD. Utilizamos suas informações apenas para atender sua solicitação.
              </p>
            </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
