import { useHeroSlides } from "../hooks/useSiteData";
import { HeroCarousel, type HeroSlide } from "./HeroCarousel";

const FALLBACK_SLIDES: HeroSlide[] = [
  {
    label: "BIOGÁS E BIOMETANO",
    title: "Do Resíduo à Energia — Controle Técnico do Processo",
    description: "Instrumentação e automação para maximizar a produção, qualidade e aproveitamento do biogás.",
    cta: "Conhecer Soluções em Biogás",
    href: "/setores/biogas-biometano",
    image: "/images/heroes/1.1.png",
  },
  {
    label: "SANEAMENTO",
    title: "Macromedição Ultrassônica para Redes de Distribuição",
    description: "Tecnologia não-invasiva para monitoramento preciso de vazão em grandes diâmetros.",
    cta: "Conhecer Soluções em Saneamento",
    href: "/setores/saneamento",
    image: "/images/heroes/1.2.png",
  },
  {
    label: "AUTOMAÇÃO INDUSTRIAL",
    title: "Tecnologia de Ponta para Otimizar seus Processos Produtivos",
    description: "Controle, monitoramento e automação industrial integrados para aumentar a competitividade da sua planta.",
    cta: "Ver Soluções em Automação",
    href: "/setores/industria",
    image: "/images/heroes/1.3.png",
  },
  {
    label: "PROTEÇÃO CATÓDICA",
    title: "Integridade Metálica ao Longo do Tempo",
    description: "Sistemas eletroquímicos para prevenção e controle da corrosão em estruturas enterradas e submersas.",
    cta: "Conhecer Sistemas de Proteção Catódica",
    href: "/setores/protecao-catodica",
    image: "/images/heroes/1.4.png",
  },
  {
    label: "GÁS E PETRÓLEO",
    title: "Instrumentação de Alta Confiabilidade para Ambientes Críticos",
    description: "Soluções robustas para extração, refino e distribuição, garantindo segurança e eficiência em ambientes críticos.",
    cta: "Ver Soluções para Gás e Petróleo",
    href: "/setores/gas-petroleo",
    image: "/images/heroes/1.5.png",
  },
];

export function HeroBanner() {
  const { slides: apiSlides } = useHeroSlides();
  const slides: HeroSlide[] =
    apiSlides.length > 0
      ? apiSlides.map((s) => ({
          label: s.label,
          title: s.titulo,
          description: s.descricao,
          cta: s.cta_texto,
          href: s.cta_link,
          image: s.imagem,
        }))
      : FALLBACK_SLIDES;

  return <HeroCarousel slides={slides} />;
}
