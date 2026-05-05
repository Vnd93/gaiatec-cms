import { HeroBanner } from "../components/HeroBanner";
import { DiagonalLine } from "../components/DiagonalLine";
import { ProductsGrid } from "../components/ProductsGrid";
import { IndustriesCarousel } from "../components/IndustriesCarousel";
import { SliderModule } from "../components/SliderModule";
import { ContactSection } from "../components/ContactSection";
import { DynamicBlocks } from "../components/BlockRenderer";

/**
 * HomePage — composição:
 *   • HeroBanner: carrossel auto-rotacional (consome hero_slides do CMS
 *     via useHeroSlides — UI específica que o BlockRenderer não tem)
 *   • DynamicBlocks: renderiza os blocos editáveis do CMS na ordem que
 *     Pedro definir em /marketing/site (Manchete, Stats, Soluções,
 *     Certificações, CTA, Notícias). Skipa hero_slides (já feito) e
 *     linked_list (sem renderer ainda).
 *   • ProductsGrid / IndustriesCarousel / SliderModule: componentes
 *     com UI complexa específica que ainda não viraram tipo de bloco.
 *   • ContactSection: form + contato (consome contact_info via
 *     useContactInfo).
 */
export default function HomePage() {
  return (
    <>
      <HeroBanner />
      <DiagonalLine topColor="white" bottomColor="black" />
      <DynamicBlocks slug="home" skip={["hero_slides", "linked_list"]} />
      <ProductsGrid />
      <IndustriesCarousel />
      <SliderModule />
      <ContactSection />
    </>
  );
}
