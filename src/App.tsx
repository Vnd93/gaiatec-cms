import Header from './components/Header'
import HeroSection from './components/HeroSection'
import IntroSection from './components/IntroSection'
import ProductsGrid from './components/ProductsGrid'
import SectorsCarousel from './components/SectorsCarousel'
import InnovativeSolutions from './components/InnovativeSolutions'
import FeatureSlider from './components/FeatureSlider'
import PartnersGrid from './components/PartnersGrid'
import NewsSection from './components/NewsSection'
import ContactCTA from './components/ContactCTA'
import Footer from './components/Footer'

export default function App() {
  return (
    <>
      <Header />
      <main>
        <HeroSection />
        <IntroSection />
        <ProductsGrid />
        <SectorsCarousel />
        <InnovativeSolutions />
        <FeatureSlider />
        <PartnersGrid />
        <NewsSection />
        <ContactCTA />
      </main>
      <Footer />
    </>
  )
}
