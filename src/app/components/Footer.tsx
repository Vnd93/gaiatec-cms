import { ChevronRight } from "lucide-react";

const footerLinks = [
  {
    title: "SETORES",
    links: [
      { label: "Saneamento", href: "/setores/saneamento" },
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
      { label: "Detecção de Gases", href: "/setores/seguranca-operacional" },
      { label: "Nível", href: "/setores/instrumentacao" },
      { label: "Pressão", href: "/setores/instrumentacao" },
      { label: "Temperatura", href: "/setores/instrumentacao" },
      { label: "Automação", href: "/setores/industria" },
      { label: "Proteção Catódica", href: "/setores/protecao-catodica" },
      { label: "Telemetria", href: "/setores/telemetria" },
    ],
  },
  {
    title: "SERVIÇOS",
    links: [
      { label: "Automação Industrial", href: "/servicos/automacao-industrial" },
      { label: "Instrumentação Industrial", href: "/servicos/instrumentacao-industrial" },
      { label: "Calibração RBC", href: "/servicos/calibracao-rbc" },
      { label: "Instalação e Comissionamento", href: "/servicos/instalacao-e-comissionamento" },
      { label: "Manutenção Industrial", href: "/servicos/manutencao-industrial" },
      { label: "Consultoria Técnica", href: "/servicos/consultoria-tecnica" },
    ],
  },
  {
    title: "EMPRESA",
    links: [
      { label: "A Gaiatec", href: "/sobre" },
      { label: "Blog", href: "/blog" },
      { label: "Biodigestor", href: "/biodigestor" },
      { label: "Contato", href: "/contato" },
      { label: "Política de Privacidade", href: "#" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="bg-black text-white">
      <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-16 md:py-20">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-12 lg:gap-20">
          {/* Logo & Institutional */}
          <div>
            <a href="/" className="inline-block mb-4">
              <img src="/logo-gaiatec.png" alt="Gaiatec Sistemas" style={{ height: 46, width: "auto" }} />
            </a>
            <p className="text-white/50 text-[14px] leading-[1.7] mb-6">
              Soluções técnicas em instrumentação industrial desde 2004.
            </p>
            <div className="flex gap-3 mb-6">
              {["RBC", "INMETRO", "ISO"].map((seal) => (
                <span
                  key={seal}
                  className="inline-flex items-center justify-center w-[50px] h-[50px] border border-[#FF6A00]/40 text-[#FF6A00] text-[10px]"
                  style={{ fontWeight: 700, borderRadius: "50%" }}
                >
                  {seal}
                </span>
              ))}
            </div>
            <a href="/contato" className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 text-[12px] tracking-wider hover:bg-[#FF6A00] transition-colors" style={{ fontWeight: 700 }}>
              Solicitar Orçamento
            </a>
          </div>

          {/* Link columns */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {footerLinks.map((col) => (
              <div key={col.title}>
                <h6 className="text-[13px] text-white mb-4" style={{ fontWeight: 700 }}>{col.title}</h6>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="text-white/40 text-[13px] hover:text-[#FF6A00] transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="max-w-[1400px] mx-auto px-4 md:px-6 py-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-2 md:gap-6 text-[11px] text-white/40">
              <span>&copy; 2025 Gaiatec Sistemas. Todos os direitos reservados.</span>
            </div>

            <div className="flex flex-wrap gap-4 text-[11px]">
              <a href="#" className="text-white/40 hover:text-[#FF6A00] transition-colors">Política de Privacidade</a>
              <a href="#" className="text-white/40 hover:text-[#FF6A00] transition-colors">Termos de Uso</a>
              <span className="text-white/30">Seus dados estão protegidos pela LGPD.</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}