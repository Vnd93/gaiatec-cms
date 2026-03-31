import { useState } from "react";
import { Phone, MessageSquare, MapPin, ChevronRight } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { useConteudo } from "../hooks/useSiteData";

const FALLBACK_CTAS = [
  { icon: Phone, title: "Telefone Comercial", description: "(11) 2207-1933 · Fax: (11) 2207-1986", href: "tel:+551122071933" },
  { icon: MessageSquare, title: "WhatsApp", description: "(11) 2207-1986 · Seg. a Sex., 8h às 18h", href: "https://wa.me/551122071986" },
  { icon: MapPin, title: "Localização", description: "R. Herói da Força Expedicionária Brasileira, 22 — Parque Novo Mundo, São Paulo/SP", href: "#" },
];

const enquiryTypes = ["Orçamento", "Suporte Técnico", "Calibração", "Instrumentação", "Automação", "Proteção Catódica", "Outros"];

export function ContactSection() {
  const { data: contato } = useConteudo("contato");
  const [formData, setFormData] = useState({
    firstName: "", lastName: "", email: "", phone: "", company: "", enquiryType: "", message: "", consent: false,
  });

  const contactCtas = (contato["contato.telefone"])
    ? [
        { icon: Phone, title: "Telefone Comercial", description: `${contato["contato.telefone"]} · Fax: ${contato["contato.fax"] || "(11) 2207-1986"}`, href: `tel:+55${(contato["contato.telefone"] || "").replace(/\D/g, "")}` },
        { icon: MessageSquare, title: "WhatsApp", description: `${contato["contato.whatsapp"]} · ${contato["contato.whatsapp_horario"] || "Seg. a Sex., 8h às 18h"}`, href: `https://wa.me/55${(contato["contato.whatsapp"] || "").replace(/\D/g, "")}` },
        { icon: MapPin, title: "Localização", description: `${contato["contato.endereco"]} — ${contato["contato.bairro_cidade"] || ""}`, href: "#" },
      ]
    : FALLBACK_CTAS;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert("Obrigado pelo contato! Retornaremos em breve.");
  };

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

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="text" placeholder="Nome" required
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#FF6A00] transition-colors"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
                <input
                  type="text" placeholder="Sobrenome" required
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#FF6A00] transition-colors"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input
                  type="email" placeholder="E-mail" required
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#FF6A00] transition-colors"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
                <input
                  type="tel" placeholder="Telefone / WhatsApp" required
                  className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#FF6A00] transition-colors"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <input
                type="text" placeholder="Empresa"
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#FF6A00] transition-colors"
                value={formData.company}
                onChange={(e) => setFormData({ ...formData, company: e.target.value })}
              />
              <select
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black outline-none focus:border-[#FF6A00] transition-colors appearance-none"
                value={formData.enquiryType}
                onChange={(e) => setFormData({ ...formData, enquiryType: e.target.value })}
                style={{ color: formData.enquiryType ? "#000" : "#999" }}
              >
                <option value="">Tipo de Solicitação</option>
                {enquiryTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <textarea
                placeholder="Sua Mensagem" required rows={5}
                className="w-full bg-white border border-[#e0e0e0] px-4 py-3 text-[14px] text-black placeholder:text-[#999] outline-none focus:border-[#FF6A00] transition-colors resize-none"
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
                    className="mt-1 accent-[#FF6A00]"
                    checked={formData.consent}
                    onChange={(e) => setFormData({ ...formData, consent: e.target.checked })}
                  />
                  <span className="text-[12px] text-[#999]">
                    Concordo em receber comunicações da Gaiatec Sistemas.
                  </span>
                </label>
              </div>
              <button
                type="submit"
                className="bg-[#FF6A00] text-black px-10 py-3 text-[13px] tracking-wider hover:bg-[#e6b800] transition-colors"
                style={{ fontWeight: 700 }}
              >
                Enviar
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
                    className="flex items-start gap-4 group p-5 border border-white/10 hover:border-[#FF6A00]/40 transition-all"
                  >
                    <div className="w-12 h-12 flex items-center justify-center border border-[#FF6A00] flex-shrink-0">
                      <cta.icon size={20} className="text-[#FF6A00]" />
                    </div>
                    <div className="flex-1">
                      <h4 className="text-white text-[18px] group-hover:text-[#FF6A00] transition-colors" style={{ fontWeight: 700 }}>
                        {cta.title}
                      </h4>
                      <p className="text-white/50 text-[13px] mt-1">{cta.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-[#FF6A00] flex-shrink-0 mt-1" />
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