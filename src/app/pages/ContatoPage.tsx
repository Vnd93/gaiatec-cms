import { PageHero } from "../components/PageHero";
import { ContactSection } from "../components/ContactSection";

const HERO_IMG = "/images/heroes/1.1.webp";

/**
 * Página de Contato — hero padrão (PageHero/biodigestor), seção de contato
 * idêntica à da home (formulário + lista "Fale com um Especialista") e o mapa
 * da unidade. Sem barra de endereço, sem diferenciais e sem bloco de LGPD —
 * a própria seção de contato já carrega a nota de privacidade.
 */
export default function ContatoPage() {
  return (
    <>
      <PageHero overline="CONTATO" title="Fale com a Gaiatec Sistemas" image={HERO_IMG} />

      <ContactSection variant="light" />

      {/* ─── Mapa — localização da unidade ─── */}
      <section id="mapa">
        <div style={{ width: "100%", height: 420, backgroundColor: "#e8e8e8", position: "relative", overflow: "hidden" }}>
          <iframe
            title="Mapa Gaiatec Sistemas"
            src="https://www.openstreetmap.org/export/embed.html?bbox=-46.62%2C-23.50%2C-46.58%2C-23.48&layer=mapnik"
            style={{ width: "100%", height: "100%", border: "none" }}
          />
        </div>
      </section>
    </>
  );
}
