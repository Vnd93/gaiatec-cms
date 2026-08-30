import { useEffect, useState } from "react";
import { Phone, MessageSquare, MapPin, ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "./useScrollAnimation";
import { usePublishedSiteShell } from "@/public/site-shell-context";
import { getPublishedForm } from "@/public/catalog-api";
import { CmsLeadForm } from "@/public/components/CmsLeadForm";
import type { CmsFormVersion } from "@/shared/contracts/cms-content";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

export function ContactSection({
  variant = "brand",
  heading = "Solicitar Orçamento",
  introduction = "Preencha o formulário e retornaremos o mais breve possível.",
  sectionId = "contact",
  initialEnquiryType = "",
  formKey = "contato-principal",
}: {
  variant?: "brand" | "light";
  heading?: string;
  introduction?: string;
  submitLabel?: string;
  sectionId?: string;
  initialEnquiryType?: string;
  formKey?: string;
}) {
  const { settings } = usePublishedSiteShell();
  const light = variant === "light";
  const [form, setForm] = useState<CmsFormVersion | null>(null);
  const [formLoading, setFormLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setFormLoading(true);
    void getPublishedForm(formKey)
      .then((result) => {
        if (active) setForm(result);
      })
      .catch(() => {
        if (active) setForm(null);
      })
      .finally(() => {
        if (active) setFormLoading(false);
      });
    return () => {
      active = false;
    };
  }, [formKey]);

  const company = settings?.company;
  const whatsappDigits = company?.whatsapp.replace(/\D/g, "") ?? "";
  const contactCtas = [
    company?.phone
      ? {
          icon: Phone,
          value: company.phone,
          hint: "Fale com nossa equipe comercial",
          href: `tel:${company.phone.replace(/[^\d+]/g, "")}`,
        }
      : null,
    company?.whatsapp
      ? {
          icon: MessageSquare,
          value: company.whatsapp,
          hint: "WhatsApp da equipe GAIATEC",
          href: `https://wa.me/${whatsappDigits.startsWith("55") ? whatsappDigits : `55${whatsappDigits}`}`,
        }
      : null,
    company?.address
      ? {
          icon: MapPin,
          value: company.name,
          hint: company.address,
          href: "/contato",
        }
      : null,
  ].filter((item): item is NonNullable<typeof item> => item !== null);

  return (
    <section className={light ? "bg-white" : "bg-[#FFCC00]"} id={sectionId} style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 py-16 md:py-24">
          {/* ─── Esquerda — formulário ─── */}
          <div>
            <AnimateOnScroll>
              <h2 className="text-black mb-2" style={{ fontFamily: KNOCKOUT, fontSize: "clamp(40px, 5vw, 64px)", fontWeight: 500, lineHeight: 0.95, textTransform: "uppercase" }}>
                {heading}
              </h2>
              <p className="text-black/70 text-[15px] mb-8">{introduction}</p>
            </AnimateOnScroll>

            {formLoading ? (
              <p className="cms-governed-form-state" role="status" aria-live="polite">
                Carregando formulário seguro…
              </p>
            ) : form ? (
              <CmsLeadForm
                form={form}
                showHeader={false}
                appearance="contact"
                tone={variant}
                source="contact"
                heading={heading}
                initialValues={
                  initialEnquiryType ? { "tipo-solicitacao": initialEnquiryType } : undefined
                }
              />
            ) : (
              <div className="cms-governed-form-state" role="status">
                <strong>Formulário temporariamente indisponível.</strong>
                <span>Use um dos canais ao lado enquanto a configuração é revisada no CMS.</span>
              </div>
            )}
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
