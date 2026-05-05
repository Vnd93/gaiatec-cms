import { AnimateOnScroll } from "./useScrollAnimation";
import { usePartnersLogos } from "../hooks/useSiteData";

/* ────────────────────────────────────────────────────────
   FALLBACK — usado se nenhum bloco partners_logos existir
   no CMS. Pedro edita pelo painel ERP em /marketing/site →
   Página Inicial → "Certificações".
   ──────────────────────────────────────────────────────── */
const FALLBACK_CERTIFICATIONS: Array<{ name: string; label: string; image?: string | null }> = [
  { name: "RBC", label: "Rede Brasileira de Calibração" },
  { name: "INMETRO", label: "Homologação INMETRO" },
  { name: "ISO", label: "Certificação ISO" },
];

export function PartnersLogos() {
  const { certifications } = usePartnersLogos({
    certifications: FALLBACK_CERTIFICATIONS,
  });

  return (
    <section className="bg-white py-16 md:py-24">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6">
        <AnimateOnScroll>
          <div className="text-center mb-12">
            <h3 className="text-[24px] md:text-[30px] text-black mb-3" style={{ fontWeight: 700, fontFamily: "'Knockout HTF68', sans-serif", textTransform: "uppercase" }}>
              Certificações e Parceiros
            </h3>
            <p className="text-[#666] text-[15px] leading-[1.7] max-w-[700px] mx-auto">
              Trabalhamos com equipamentos de fabricantes líderes e contamos com credenciais reconhecidas pelos principais órgãos metrológicos do Brasil.
            </p>
          </div>
        </AnimateOnScroll>

        <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {certifications.map((cert, i) => (
            <AnimateOnScroll key={`${cert.name}-${i}`} direction="up" delay={i * 0.1}>
              <div className="flex flex-col items-center gap-3 group cursor-default">
                <div
                  className="w-[90px] h-[90px] md:w-[110px] md:h-[110px] border-2 border-[#FF6A00] flex items-center justify-center transition-all duration-300 group-hover:bg-[#FF6A00] overflow-hidden"
                  style={{ borderRadius: "50%" }}
                >
                  {cert.image ? (
                    <img
                      src={cert.image.startsWith("http") ? cert.image : `https://gaiatecsistemas.com.br${cert.image.startsWith("/") ? "" : "/"}${cert.image}`}
                      alt={cert.name}
                      className="w-[60%] h-[60%] object-contain"
                    />
                  ) : (
                    <span
                      className="text-[#FF6A00] group-hover:text-black transition-colors duration-300"
                      style={{ fontSize: 18, fontWeight: 800, letterSpacing: "0.5px", fontFamily: "Arial, sans-serif" }}
                    >
                      {cert.name}
                    </span>
                  )}
                </div>
                <span className="text-[12px] text-[#888] text-center max-w-[120px]" style={{ fontWeight: 500 }}>
                  {cert.label}
                </span>
              </div>
            </AnimateOnScroll>
          ))}
        </div>

        {/* Credibility bar */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-5 gap-6 text-center">
          {[
            { value: "RBC", label: "Acreditado" },
            { value: "INMETRO", label: "Homologado" },
            { value: "ISO", label: "Certificado" },
            { value: "+20", label: "Anos de Experiência" },
            { value: "11", label: "Setores Atendidos" },
          ].map((item) => (
            <AnimateOnScroll key={item.label} direction="up">
              <div className="py-4">
                <div className="text-[28px] md:text-[36px] text-black" style={{ fontWeight: 800, fontFamily: "'Knockout HTF68', sans-serif" }}>
                  {item.value}
                </div>
                <div className="text-[13px] text-[#888] mt-1" style={{ fontWeight: 500 }}>
                  {item.label}
                </div>
              </div>
            </AnimateOnScroll>
          ))}
        </div>
      </div>
    </section>
  );
}
