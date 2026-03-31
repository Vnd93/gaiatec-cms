import { HeroBanner } from "../components/HeroBanner";
import { DiagonalLine } from "../components/DiagonalLine";
import { ContentSection } from "../components/ContentSection";
import { ProductsGrid } from "../components/ProductsGrid";
import { IndustriesCarousel } from "../components/IndustriesCarousel";
import { InnovativeSolutions } from "../components/InnovativeSolutions";
import { SliderModule } from "../components/SliderModule";
import { PartnersLogos } from "../components/PartnersLogos";
import { NewsSection } from "../components/NewsSection";
import { ContactSection } from "../components/ContactSection";

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
      <PartnersLogos />
      <NewsSection />
      <ContactSection />
    </>
  );
}
