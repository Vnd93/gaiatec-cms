import React from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import medidorImage from 'figma:asset/f30cbf4b6e75120fb68dca3ab6a83be5dee43aae.png';

export const VazamentoAguaPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="/images/heroes/1.1.png"
            alt="Tubulações de água industrial"
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
              Pesquisa de Vazamento de Água
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Detecção precisa de perdas hídricas em redes de distribuição, tubulações industriais e sistemas prediais.
            </p>
          </div>
        </div>
      </section>

      {/* O que é — layout assimétrico */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que é a pesquisa de vazamento de água
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                É um serviço técnico que utiliza métodos acústicos, eletrônicos e correlação de dados para identificar e localizar pontos de perda de água em redes de distribuição, tubulações enterradas e sistemas prediais.
              </p>
              <p>
                O objetivo é duplo: encontrar onde a água está sendo perdida e quantificar o impacto — em volume e em custo. Vazamentos ocultos em tubulações enterradas podem levar meses para serem percebidos, e nesse tempo o desperdício e o dano estrutural já são significativos.
              </p>
              <p className="text-gray-900">
                A Gaiatec Sistemas atua com equipamentos de alta sensibilidade para identificar vazamentos não visíveis, mesmo em tubulações enterradas a grandes profundidades.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Onde aplicamos — itens numerados com imagens */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Onde esse serviço é aplicado
              </h2>
              <p className="text-gray-600 leading-relaxed">
                A pesquisa de vazamento atende desde instalações prediais simples até redes municipais de distribuição e plantas industriais.
              </p>
            </div>

            <div className="md:col-span-8">
              {/* Item 1 — com imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <div className="md:flex md:gap-8 md:items-start">
                  <div className="md:flex-1">
                    <span className="text-sm text-gray-400 font-mono">01</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      Redes públicas de distribuição
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Detecção de perdas em redes municipais, condomínios e sistemas de abastecimento de grande porte.
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 md:w-48 md:flex-shrink-0 h-32 overflow-hidden">
                    <ImageWithFallback
                      src="/images/heroes/1.2.png"
                      alt="Redes de distribuição"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Item 2 — com imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <div className="md:flex md:gap-8 md:items-start">
                  <div className="md:flex-1">
                    <span className="text-sm text-gray-400 font-mono">02</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      Sistemas industriais e comerciais
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Tubulações de processos industriais, sistemas de refrigeração e linhas de água de serviço.
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 md:w-48 md:flex-shrink-0 h-32 overflow-hidden">
                    <ImageWithFallback
                      src="/images/heroes/1.3.png"
                      alt="Sistemas industriais"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Item 3 — com imagem */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <div className="md:flex md:gap-8 md:items-start">
                  <div className="md:flex-1">
                    <span className="text-sm text-gray-400 font-mono">03</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      Instalações prediais
                    </h3>
                    <p className="text-gray-700 leading-relaxed">
                      Edifícios comerciais, residenciais, hospitais e escolas com suspeita de vazamentos ocultos.
                    </p>
                  </div>
                  <div className="mt-4 md:mt-0 md:w-48 md:flex-shrink-0 h-32 overflow-hidden">
                    <ImageWithFallback
                      src="/images/heroes/1.4.png"
                      alt="Instalações prediais"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>

              {/* Item 4 */}
              <div className="border-b border-gray-300 pb-6 mb-6">
                <span className="text-sm text-gray-400 font-mono">04</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                  Tubulações enterradas
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Localização precisa de vazamentos em tubulações subterrâneas sem necessidade de escavações extensivas.
                </p>
              </div>

              {/* Item 5 */}
              <div>
                <span className="text-sm text-gray-400 font-mono">05</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                  Sistemas de irrigação e paisagismo
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Detecção de vazamentos em sistemas de irrigação automatizada, jardins e áreas verdes de grandes empreendimentos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Soluções oferecidas */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Principais soluções oferecidas
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-8">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Detecção acústica</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Identificação de vazamentos por equipamentos que captam o som característico da água em fuga dentro da tubulação.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Correlação de dados</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Tecnologia de correlação para determinar o ponto exato do vazamento em tubulações enterradas.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Quantificação de perdas</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Medição do volume de água desperdiçado e análise do impacto econômico e operacional.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">Laudo técnico</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Documentação completa do diagnóstico com orientações para correção e prevenção de novos vazamentos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Medidor Ultrassônico para Água */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-12 items-start">
            {/* Conteúdo */}
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Medidor Ultrassônico para Água
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mb-8"></div>

              <div className="text-gray-700 leading-relaxed space-y-5">
                <p>
                  Medidor de vazão não invasivo que utiliza tecnologia ultrassônica para medir com precisão o fluxo de água em tubulações, sem interromper o sistema ou modificar a linha existente.
                </p>
                <p>
                  Equipado com sensores de alta sensibilidade e processamento digital, é capaz de detectar variações mínimas de vazão e identificar padrões de consumo anormais — auxiliando na localização de vazamentos e na auditoria de perdas hídricas.
                </p>
                <p>
                  Na Gaiatec Sistemas, é utilizado como ferramenta de campo em serviços de pesquisa de vazamento, análise de consumo e monitoramento de redes de água.
                </p>
              </div>

              <div className="mt-10">
                <h3 className="text-xl font-bold text-gray-900 mb-6">
                  Principais aplicações
                </h3>

                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Redes de água potável</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Sistemas de água industrial</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Estações de tratamento</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Irrigação e agricultura</p>
                  </div>
                  <div className="border-b border-gray-300 pb-3">
                    <p className="text-gray-900">Edifícios comerciais e residenciais</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Imagem do equipamento */}
            <div className="md:sticky md:top-8">
              <div className="overflow-hidden">
                <img
                  src={medidorImage}
                  alt="Medidor Ultrassônico para Água"
                  className="w-full object-contain"
                />
              </div>
              <p className="text-sm text-gray-500 mt-3 font-mono text-center">
                Medidor Ultrassônico / Detecção de Vazão
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
                Metodologia técnica para identificação precisa de vazamentos — do levantamento inicial ao laudo final.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">01</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Análise preliminar do sistema
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Levantamento do histórico de consumo, pressão da rede e características da instalação.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">02</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Pesquisa acústica e eletrônica
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Utilização de geofones, hastes de escuta e correlacionadores para identificar o vazamento.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">03</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Localização precisa do ponto de fuga
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Determinação exata do local do vazamento, minimizando escavações e intervenções desnecessárias.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">04</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Quantificação da perda e impacto
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Medição do volume de água desperdiçado e análise do impacto econômico e operacional.
                </p>
              </div>

              <div>
                <span className="text-sm text-gray-400 font-mono">05</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Relatório técnico e orientação
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Entrega de laudo completo com recomendações para correção e prevenção de novas perdas.
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
              to="/servicos/localizacao-tubulacao"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Localização de Tubulação
            </Link>
            <Link
              to="/servicos/medicao-vazao"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Medição de Vazão
            </Link>
            <Link
              to="/servicos/inspecao-revestimento"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Inspeção de Revestimento
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50 border-t border-slate-200">
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