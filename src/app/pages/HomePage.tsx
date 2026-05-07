import { HeroBanner } from "../components/HeroBanner";
import { DiagonalLine } from "../components/DiagonalLine";
import { ContentSection } from "../components/ContentSection";
import { ProductsGrid } from "../components/ProductsGrid";
import { IndustriesCarousel } from "../components/IndustriesCarousel";
import { ServicosDestaqueHomepage } from "../components/ServicosDestaqueHomepage";
import { InnovativeSolutions } from "../components/InnovativeSolutions";
import { SliderModule } from "../components/SliderModule";
import { NewsSection } from "../components/NewsSection";
import { ContactSection } from "../components/ContactSection";

/**
 * Design original 100% preservado. Cada componente é responsável por
 * ler seus textos do CMS via hooks adapter — o layout/animações ficam
 * exatamente como antes.
 *
 *   HeroBanner               → useHeroSlides (bloco hero_slides)
 *   ContentSection           → useContentSection (text_block + servicos_site)
 *   IndustriesCarousel       → useSetores (setores_site) — renomeado label
 *                              "Setores" → "Indústrias" (TASK 4)
 *   ServicosDestaqueHomepage → featuredServices (servicesList.ts) — TASK 7
 *   InnovativeSolutions      → useInnovativeSolutions (feature_grid)
 *   PartnersLogos            → usePartnersLogos (partners_logos)
 *   NewsSection              → useBlogPosts (top 3 destaques)
 *   ContactSection           → useContactInfo (contact_info)
 *
 * Ordem da home (V2):
 *   1. HeroBanner              (5 slides)
 *   2. ContentSection          (Quem Somos resumido)
 *   3. ProductsGrid            (Produtos em Destaque)
 *   4. IndustriesCarousel      (9 indústrias)
 *   5. ServicosDestaqueHomepage (NOVO — 6 serviços em destaque)
 *   6. InnovativeSolutions     (Soluções inovadoras)
 *   7. SliderModule            (Slider horizontal)
 *   8. NewsSection             (Blog destaques)
 *   9. ContactSection          (Formulário + contatos)
 */
export default function HomePage() {
  return (
    <>
      <HeroBanner />
      <DiagonalLine topColor="white" bottomColor="black" />
      <ContentSection />
      <ProductsGrid />
      <IndustriesCarousel />
      <ServicosDestaqueHomepage />
      <InnovativeSolutions />
      <SliderModule />
      <NewsSection />
      <ContactSection />
    </>
  );
}
