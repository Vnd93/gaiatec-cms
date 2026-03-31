import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import Slider from 'react-slick';
import 'slick-carousel/slick/slick.css';
import 'slick-carousel/slick/slick-theme.css';
import educationalProjectImage from 'figma:asset/f60fb57ae370744590884ea438396bfe4e099802.png';

export const AboutPage = () => {
  const [slideTransition, setSlideTransition] = React.useState(0);

  const heroImages = [
    '/images/heroes/1.1.png',
    '/images/heroes/1.2.png',
    '/images/heroes/1.3.png',
    '/images/heroes/1.4.png',
  ];

  const sliderSettings = {
    dots: false,
    infinite: true,
    speed: 800,
    slidesToShow: 1,
    slidesToScroll: 1,
    autoplay: true,
    autoplaySpeed: 5000,
    pauseOnHover: false,
    pauseOnFocus: false,
    fade: true,
    arrows: false,
    beforeChange: () => {
      setSlideTransition(prev => prev + 1);
    },
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero — Carousel com Ken Burns */}
      <section className="relative h-[500px] md:h-[600px] overflow-hidden">
        <Slider {...sliderSettings}>
          {heroImages.map((image, index) => (
            <div key={index} className="relative h-[500px] md:h-[600px] w-full overflow-hidden">
              <motion.div
                key={`about-bg-${slideTransition * 10 + index}`}
                initial={{ opacity: 0, scale: 1.15 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{
                  opacity: { duration: 0.8, ease: "easeInOut" },
                  scale: { duration: 6, ease: "easeOut" }
                }}
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${image})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
            </div>
          ))}
        </Slider>

        <div className="absolute inset-0 z-10 flex items-center px-6">
          <div className="container mx-auto">
            <div className="max-w-3xl mx-[25px] my-[0px]">
              <div className="text-orange-500 font-bold uppercase tracking-wider mb-4 text-[12px]">
                Institucional
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
                Sobre a Gaiatec Sistemas
              </h1>
              <p className="text-gray-200 leading-relaxed text-[16px]">
                Referência em soluções tecnológicas para a indústria brasileira desde 2004.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quem somos — 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                A empresa
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-7 space-y-5">
              <p className="text-gray-700 leading-relaxed">
                A Gaiatec Sistemas é uma empresa brasileira fundada em 2004 com o objetivo de desenvolver sistemas e tecnologias para atender a indústria do petróleo, mineração, agronegócio, química, elétrica, marítima, saneamento e para tudo que envolve o controle de gases e fluidos.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Com uma equipe altamente qualificada e especializada, a empresa se destaca pela capacidade de inovar e oferecer soluções completas para as necessidades de seus clientes — desde sistemas de controle de processos, automação e instrumentação até soluções em segurança operacional.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Com a crescente demanda por tecnologias eficientes, a Gaiatec investe constantemente em pesquisa e desenvolvimento, aprimorando seus produtos e serviços e mantendo-se à frente do mercado industrial.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Missão, Visão e Valores — numerado */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-4 mb-10 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Princípios
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-8">
              <div className="space-y-12">
                {/* Missão */}
                <div>
                  <div className="flex items-baseline gap-4 mb-3">
                    <span className="text-sm text-gray-400 font-mono">01</span>
                    <h3 className="text-xl font-bold text-gray-900">Missão</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed ml-10">
                    Desenvolver sistemas e tecnologias inovadoras para atender as necessidades da indústria nacional e internacional, oferecendo soluções completas em controle de gases e fluidos.
                  </p>
                </div>

                {/* Visão */}
                <div>
                  <div className="flex items-baseline gap-4 mb-3">
                    <span className="text-sm text-gray-400 font-mono">02</span>
                    <h3 className="text-xl font-bold text-gray-900">Visão</h3>
                  </div>
                  <p className="text-gray-700 leading-relaxed ml-10">
                    Ser referência em soluções tecnológicas para a indústria, reconhecida pela excelência, inovação e compromisso com a satisfação dos clientes.
                  </p>
                </div>

                {/* Valores */}
                <div>
                  <div className="flex items-baseline gap-4 mb-3">
                    <span className="text-sm text-gray-400 font-mono">03</span>
                    <h3 className="text-xl font-bold text-gray-900">Valores</h3>
                  </div>
                  <div className="ml-10 space-y-0">
                    {[
                      'Qualidade e excelência em produtos e serviços',
                      'Inovação contínua em processos e tecnologias',
                      'Compromisso com o cliente e suas necessidades',
                      'Adaptabilidade frente às demandas do mercado',
                      'Responsabilidade em todas as ações'
                    ].map((valor, i) => (
                      <div key={i} className="flex items-start gap-3 border-b border-gray-300 py-3">
                        <span className="text-xs text-gray-400 font-mono mt-1">{String.fromCharCode(97 + i)}.</span>
                        <span className="text-gray-700">{valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Engenharia e educação — imagem integrada 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12 items-center">
            {/* Imagem */}
            <div className="md:col-span-7 mb-8 md:mb-0">
              <img
                src={educationalProjectImage}
                alt="Projetos educacionais Gaiatec Sistemas"
                className="w-full h-auto"
              />
            </div>

            {/* Texto */}
            <div className="md:col-span-5">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight mb-5">
                Engenharia aplicada à educação
              </h2>
              <div className="w-12 h-1 bg-orange-500 mb-6"></div>

              <p className="text-gray-700 leading-relaxed mb-5">
                A Gaiatec Sistemas atua em projetos educacionais que levam tecnologia aplicada para dentro de ambientes escolares, transformando conceitos técnicos em experiências de aprendizado práticas.
              </p>
              <p className="text-gray-700 leading-relaxed mb-5">
                Por meio de iniciativas voltadas à sustentabilidade, energia renovável e automação, a empresa contribui para que estudantes compreendam como a engenharia pode gerar impacto social positivo.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Essa atuação reflete o compromisso com a formação de uma nova geração consciente do papel da tecnologia na construção de um futuro mais sustentável.
              </p>

              <div className="mt-8">
                <Link
                  to="/biodigestor/projetos"
                  className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
                >
                  Ver projetos realizados em escolas
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Páginas relacionadas */}
      <section className="py-16 bg-white border-t border-gray-100">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-gray-600 mb-4">Páginas relacionadas</p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/servicos/automacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Automação Industrial
            </Link>
            <Link
              to="/servicos/instrumentacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Instrumentação Industrial
            </Link>
            <Link
              to="/biodigestor/o-que-e"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              O que é um Biodigestor
            </Link>
            <Link
              to="/biodigestor/projetos"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Projetos em Escolas
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gray-900">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
            Construa o futuro da sua indústria conosco
          </h2>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            Entre em contato e descubra como a Gaiatec Sistemas pode otimizar seus processos e aumentar a eficiência operacional.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="https://wa.me/551122071986"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold px-8 py-4 transition-colors text-[14px] rounded-[7px]"
            >
              Falar com Especialista
            </a>
            <Link
              to="/servicos/instrumentacao-industrial"
              className="inline-flex items-center justify-center border border-gray-600 hover:border-gray-400 text-gray-300 hover:text-white font-semibold px-8 py-4 transition-colors text-[14px] rounded-[7px]"
            >
              Conheça Nossos Serviços
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};