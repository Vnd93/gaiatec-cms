import React from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import ugrImage from 'figma:asset/873604e2d8280e9148592480a1ed0daaf0b72d86.png';

export const VazamentoGasPage = () => {
  
  return (
    <div className="min-h-screen bg-white">
      {/* Hero / Abertura */}
      <section className="relative h-[500px] overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="/images/heroes/1.1.png"
            alt="Inspeção de tubulação de gás"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
        
        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Serviços / Integridade, Segurança & Monitoramento
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Pesquisa de Vazamento de Gás com Precisão Técnica
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Segurança, confiabilidade e diagnóstico preciso para instalações residenciais, comerciais e industriais.
            </p>
          </div>
        </div>
      </section>

      {/* O que é a Pesquisa de Vazamento de Gás */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que é a Pesquisa de Vazamento de Gás
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed text-lg space-y-5">
              <p>
                É um serviço técnico especializado voltado à identificação, localização e diagnóstico 
                de fugas de gás em sistemas pressurizados, redes de distribuição e equipamentos.
              </p>
              <p>
                Na prática, é um processo preventivo e corretivo — evita acidentes, explosões, perdas 
                operacionais e riscos à vida, garantindo que o sistema opere dentro dos padrões de 
                segurança exigidos por norma.
              </p>
              <p className="text-gray-900">
                A Gaiatec Sistemas atua com foco em precisão técnica, utilizando equipamentos 
                adequados para cada tipo de aplicação e ambiente.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Onde esse serviço é aplicado */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Onde esse serviço é aplicado
              </h2>
              <p className="text-gray-600 leading-relaxed">
                A pesquisa de vazamento atende desde instalações residenciais simples até plantas industriais de alta complexidade.
              </p>
            </div>

            <div className="md:col-span-8">
              {/* Item 1 — com imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <div className="md:flex md:gap-8 md:items-start">
                  <div className="md:flex-1">
                    <span className="text-sm text-gray-500 font-mono">01</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      Redes de gás industrial e comercial
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Sistemas complexos de distribuição em ambientes industriais e comerciais de grande porte.
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 md:w-48 md:flex-shrink-0 h-32 overflow-hidden">
                    <ImageWithFallback
                      src="/images/heroes/1.2.png"
                      alt="Redes de gás industrial"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Item 2 — com imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <div className="md:flex md:gap-8 md:items-start">
                  <div className="md:flex-1">
                    <span className="text-sm text-gray-500 font-mono">02</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      Cozinhas industriais e escolares
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Ambientes críticos onde a segurança é essencial para operação contínua e proteção de pessoas.
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 md:w-48 md:flex-shrink-0 h-32 overflow-hidden">
                    <ImageWithFallback
                      src="/images/heroes/1.3.png"
                      alt="Cozinhas comerciais"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Item 3 — com imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <div className="md:flex md:gap-8 md:items-start">
                  <div className="md:flex-1">
                    <span className="text-sm text-gray-500 font-mono">03</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      Sistemas de GLP e GN
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Detecção em diferentes tipos de gás, tanto em instalações fixas quanto em sistemas móveis.
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 md:w-48 md:flex-shrink-0 h-32 overflow-hidden">
                    <ImageWithFallback
                      src="/images/heroes/1.4.png"
                      alt="Sistemas de gás"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Item 4 — sem imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <span className="text-sm text-gray-500 font-mono">04</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                  Tubulações enterradas ou aparentes
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Localização precisa de vazamentos em tubulações subterrâneas ou expostas, mesmo em locais de difícil acesso.
                </p>
              </div>

              {/* Item 5 — sem imagem */}
              <div>
                <span className="text-sm text-gray-500 font-mono">05</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                  Equipamentos de queima, aquecimento e processos industriais
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Inspeção em caldeiras, fornos, queimadores e outros equipamentos críticos que utilizam gás combustível.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Principais Soluções Oferecidas */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-3">
            Principais Soluções Oferecidas
          </h2>
          <div className="w-16 h-1 bg-[#0057DE] mb-12"></div>

          <div className="grid md:grid-cols-2 gap-x-16 gap-y-10">
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Detecção e localização de vazamentos
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Identificação precisa de pontos de fuga em tubulações, conexões, válvulas e equipamentos, 
                mesmo em locais de difícil acesso.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Inspeção técnica e manutenção preventiva
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Avaliação do estado do sistema de gás para antecipar falhas e reduzir riscos antes que ocorram incidentes.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Projeto e adequação de sistemas de detecção
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Apoio técnico para implantação ou melhoria de sistemas de monitoramento e detecção de vazamentos.
              </p>
            </div>

            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Treinamento e capacitação
              </h3>
              <p className="text-gray-600 leading-relaxed">
                Orientação técnica e capacitação de equipes para atuação segura e correta em situações de risco.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Medidor Ultrassônico para Gás (U-GR) */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            {/* Conteúdo */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Medidor Ultrassônico para Gás (U-GR)
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mb-8"></div>

              <div className="text-gray-700 leading-relaxed space-y-5">
                <p>
                  O U-GR é um medidor ultrassônico não invasivo que mede a vazão volumétrica de gás em tubulações sem necessidade de interromper o processo ou modificar a linha existente.
                </p>
                <p>
                  Sem partes móveis, oferece alta confiabilidade e baixa manutenção. Na Gaiatec Sistemas, é utilizado como apoio técnico em serviços de pesquisa de vazamento, diagnóstico de perdas, análise de consumo e monitoramento contínuo de sistemas de gás.
                </p>
              </div>

              <div className="mt-10">
                <h3 className="text-xl font-bold text-gray-900 mb-6">
                  Principais aplicações
                </h3>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Indústria de petróleo e gás</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Tratamento e geração de biogás</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Indústria química</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Sistemas de ar comprimido</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Usinas termelétricas e cogeração</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Imagem do equipamento */}
            <div className="md:sticky md:top-8">
              <div className="overflow-hidden">
                <img
                  src={ugrImage}
                  alt="Medidor Ultrassônico para Gás (U-GR)"
                  className="w-full object-contain"
                />
              </div>
              <p className="text-sm text-gray-500 mt-3 font-mono text-center">
                U-GR / Medidor Ultrassônico para Gás
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Como a Gaiatec atua na prática */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Como a Gaiatec atua na prática
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
              <p className="text-gray-600 leading-relaxed mt-5">
                Etapas do serviço de pesquisa de vazamento — da análise inicial ao acompanhamento pós-diagnóstico.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">01</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Análise do ambiente e do sistema
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Levantamento técnico do tipo de gás, pressão, layout e criticidade da instalação.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">02</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Aplicação dos instrumentos de detecção
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Uso de equipamentos de alta sensibilidade, adequados ao tipo de gás e ao ambiente.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">03</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Localização precisa do vazamento
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Identificação do ponto exato da fuga, evitando intervenções desnecessárias.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">04</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Relato técnico e orientação
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Apresentação clara do diagnóstico e orientação para correção segura.
                </p>
              </div>

              <div>
                <span className="text-sm text-gray-400 font-mono">05</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Acompanhamento técnico
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Suporte após a identificação, se necessário, para garantir a solução definitiva.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Serviços relacionados */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-gray-600 mb-4">Serviços relacionados</p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/servicos/vazamento-agua"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Pesquisa de Vazamento de Água
            </Link>
            <Link
              to="/servicos/localizacao-tubulacao"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Localização de Tubulação
            </Link>
            <Link
              to="/servicos/gases-odorantes"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Gases Odorantes
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
              className="inline-flex items-center justify-center bg-[#0057DE] hover:bg-[#0046b3] text-white font-semibold px-8 py-4 transition-colors text-[14px] rounded-[7px]"
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