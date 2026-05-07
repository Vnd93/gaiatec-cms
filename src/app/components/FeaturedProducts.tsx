import React from 'react';
import { OfferCarousel, type Offer } from '@/app/components/ui/offer-carousel';

const products: Offer[] = [
  {
    id: 1,
    title: "Medidor de Gás Ultrassônico",
    description: "Alta precisão na medição de vazão de gás natural e biogás, com tecnologia não intrusiva.",
    imageSrc: "/images/services/4.1.png",
    href: "#produtos/medidor-gas",
    imageAlt: "Medidor de Gás Ultrassônico",
    tag: "Medição",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Alta Precisão"
  },
  {
    id: 2,
    title: "Analisador de Biogás Portátil",
    description: "Equipamento robusto para análise de CH4, CO2, O2 e H2S em plantas de biogás.",
    imageSrc: "/images/services/4.2.png",
    href: "#produtos/analisador-biogas",
    imageAlt: "Analisador de Biogás",
    tag: "Biogás",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Portátil"
  },
  {
    id: 3,
    title: "Controlador Lógico Programável",
    description: "Automação avançada para processos industriais complexos com conectividade IoT.",
    imageSrc: "/images/services/4.3.png",
    href: "#produtos/clp",
    imageAlt: "CLP Industrial",
    tag: "Automação",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "IoT Ready"
  },
  {
    id: 4,
    title: "Retificador de Proteção Catódica",
    description: "Proteção contra corrosão para dutos e estruturas metálicas enterradas.",
    imageSrc: "/images/services/4.4.png",
    href: "#produtos/retificador",
    imageAlt: "Retificador",
    tag: "Proteção",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Durabilidade"
  },
  {
    id: 5,
    title: "Sensores Agrícolas Inteligentes",
    description: "Monitoramento de solo e clima para agricultura de precisão.",
    imageSrc: "/images/services/4.5.png",
    href: "#produtos/sensores-agricolas",
    imageAlt: "Sensores Agrícolas",
    tag: "Agronegócio",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Precisão"
  },
  {
    id: 6,
    title: "Unidade de Tratamento de Ar",
    description: "Controle de temperatura e umidade para ambientes industriais críticos.",
    imageSrc: "/images/services/4.6.png",
    href: "#produtos/hvac",
    imageAlt: "HVAC Industrial",
    tag: "HVAC",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Controle"
  },
  {
    id: 7,
    title: "Medidor de Vazão Eletromagnético",
    description: "Medição precisa para líquidos condutivos em processos industriais.",
    imageSrc: "/images/services/4.7.png",
    href: "#produtos/medidor-vazao",
    imageAlt: "Medidor de Vazão",
    tag: "Fluidos",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Industrial"
  },
  {
    id: 8,
    title: "Sistema de Telemetria Remota",
    description: "Monitoramento e controle de ativos à distância via rádio ou celular.",
    imageSrc: "/images/services/4.8.png",
    href: "#produtos/telemetria",
    imageAlt: "Telemetria",
    tag: "IoT",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Conectividade"
  },
  {
    id: 9,
    title: "Transmissor de Pressão",
    description: "Sensores de alta confiabilidade para monitoramento de pressão em linhas.",
    imageSrc: "/images/services/4.9.png",
    href: "#produtos/transmissor-pressao",
    imageAlt: "Transmissor de Pressão",
    tag: "Sensores",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Confiável"
  },
  {
    id: 10,
    title: "Válvula de Controle Automática",
    description: "Controle preciso de fluxo com atuadores elétricos ou pneumáticos.",
    imageSrc: "/images/slides/11.1.png",
    href: "#produtos/valvula-controle",
    imageAlt: "Válvula de Controle",
    tag: "Válvulas",
    brandName: "Gaiatec Sistemas",
    brandLogoSrc: "https://static.wixstatic.com/media/fa8961_f0424b5cd5bc4635b87684ad6d81e8c2~mv2.png/v1/fill/w_278,h_96,fp_0.50_0.50,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/1_edited.png",
    promoCode: "Automático"
  }
];

export const FeaturedProducts = () => {
  return (
    <section className="py-24 bg-white overflow-hidden border-t border-gray-100" id="produtos">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">NOSSO PORTFÓLIO</span>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 leading-tight">Produtos em Destaque</h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-[#0057DE] to-transparent mx-auto rounded-full mb-6"></div>
          <p className="mt-4 text-gray-600 text-base max-w-3xl mx-auto leading-relaxed">
            Soluções tecnológicas de alta performance para otimizar seus processos industriais com precisão, confiabilidade e eficiência.
          </p>
        </div>
        
        <div className="flex justify-center w-full">
          <OfferCarousel offers={products} />
        </div>
      </div>
    </section>
  );
};