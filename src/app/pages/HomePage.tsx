import { HeroBanner } from "../components/HeroBanner";
import { DiagonalLine } from "../components/DiagonalLine";
import { ContentSection } from "../components/ContentSection";
import { ProductsGrid } from "../components/ProductsGrid";
import { IndustriesCarousel } from "../components/IndustriesCarousel";
import { InnovativeSolutions } from "../components/InnovativeSolutions";
import { SliderModule } from "../components/SliderModule";
import { NewsSection } from "../components/NewsSection";
import { ContactSection } from "../components/ContactSection";

/**
 * Design original 100% preservado. Cada componente é responsável por
 * ler seus textos do CMS via hooks adapter — o layout/animações ficam
 * exatamente como antes.
 *
 *   HeroBanner          → useHeroSlides (bloco hero_slides)
 *   ContentSection      → useContentSection (text_block + servicos_site)
 *   IndustriesCarousel  → useSetores (setores_site)
 *   InnovativeSolutions → useInnovativeSolutions (feature_grid)
 *   PartnersLogos       → usePartnersLogos (partners_logos)
 *   NewsSection         → useBlogPosts (top 3 destaques)
 *   ContactSection      → useContactInfo (contact_info)
 *
 * Nada usa <DynamicBlocks> aqui — esse é o ponto: cada componente tem
 * design único e lê apenas os pedaços que fazem sentido.
 */
export default function HomePage() {
  return (
    <>
      <HeroBanner />
      <DiagonalLine topColor="white" bottomColor="black" />
      <ContentSection />
      <ProductsGrid />
      <IndustriesCarousel />
      <InnovativeSolutions />
      <SliderModule />
      <NewsSection />
      <ContactSection />
    </>
  );
}
