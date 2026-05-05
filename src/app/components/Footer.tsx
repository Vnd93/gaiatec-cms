import { useMenu, useContactInfo } from "../hooks/useSiteData";
import type { SiteMenuItem } from "../../lib/supabase";

/* ────────────────────────────────────────────────────────
   Footer hardcoded fallback (used when CMS API is unreachable)
   ──────────────────────────────────────────────────────── */
type FooterColumn = { title: string; links: { label: string; href: string }[] };

const FALLBACK_COLUMNS: FooterColumn[] = [
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
    ],
  },
];

/* ────────────────────────────────────────────────────────
   Build columns from the CMS menu tree.

   Strategy:
   - Each top-level item with children → footer column.
   - Top-level items WITHOUT children are aggregated into an
     "EMPRESA" column at the end (so links como Biodigestor /
     Blog / Sobre / Contato não somem).
   - For items with grandchildren (Produtos > Medição de Vazão >
     Ultrassônico…) we flatten down to leaves so the footer stays
     2 levels (max 8 links per column).
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
    // Skip "Home" — usually not relevant in a footer.
    if (item.href === "/" || item.label.toLowerCase() === "home") continue;

    if (item.children && item.children.length > 0) {
      const leaves = item.children.flatMap(flattenLeaves);
      // Dedupe by href to avoid showing the same link twice when
      // the menu has overlapping nested entries.
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
    // Always end with EMPRESA so company-level links live together.
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

export function Footer() {
  const { menu } = useMenu();
  const { contact } = useContactInfo();

  const columns = menuToColumns(menu);
  const lgpd = contact.lgpd || "Seus dados estão protegidos pela LGPD.";
  const year = new Date().getFullYear();

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
            {/* Contact summary (CMS-driven) */}
            {(contact.telefone || contact.whatsapp || contact.email) && (
              <div className="text-white/60 text-[12px] leading-[1.8] mb-4 space-y-1">
                {contact.telefone && (
                  <div>
                    <span className="text-white/40">Tel:</span>{" "}
                    <a href={`tel:+55${contact.telefone.replace(/\D/g, "")}`} className="hover:text-[#FF6A00]">
                      {contact.telefone}
                    </a>
                  </div>
                )}
                {contact.whatsapp && (
                  <div>
                    <span className="text-white/40">WhatsApp:</span>{" "}
                    <a href={`https://wa.me/55${contact.whatsapp.replace(/\D/g, "")}`} className="hover:text-[#FF6A00]">
                      {contact.whatsapp}
                    </a>
                  </div>
                )}
                {contact.email && (
                  <div>
                    <span className="text-white/40">E-mail:</span>{" "}
                    <a href={`mailto:${contact.email}`} className="hover:text-[#FF6A00]">
                      {contact.email}
                    </a>
                  </div>
                )}
              </div>
            )}
            <a
              href="/contato"
              className="inline-flex items-center gap-2 bg-white text-black px-6 py-3 text-[12px] tracking-wider hover:bg-[#FF6A00] transition-colors"
              style={{ fontWeight: 700 }}
            >
              Solicitar Orçamento
            </a>
          </div>

          {/* Link columns (CMS menu) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {columns.slice(0, 4).map((col) => (
              <div key={col.title}>
                <h6 className="text-[13px] text-white mb-4" style={{ fontWeight: 700 }}>
                  {col.title}
                </h6>
                <ul className="space-y-2">
                  {col.links.map((link) => (
                    <li key={`${col.title}-${link.label}-${link.href}`}>
                      <a
                        href={link.href}
                        className="text-white/40 text-[13px] hover:text-[#FF6A00] transition-colors"
                      >
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
              <span>&copy; {year} Gaiatec Sistemas. Todos os direitos reservados.</span>
              {contact.endereco && (
                <span className="hidden md:inline">
                  {contact.endereco}
                  {contact.bairro_cidade ? ` — ${contact.bairro_cidade}` : ""}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-4 text-[11px]">
              <a href="#" className="text-white/40 hover:text-[#FF6A00] transition-colors">
                Política de Privacidade
              </a>
              <a href="#" className="text-white/40 hover:text-[#FF6A00] transition-colors">
                Termos de Uso
              </a>
              <span className="text-white/30">{lgpd}</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
