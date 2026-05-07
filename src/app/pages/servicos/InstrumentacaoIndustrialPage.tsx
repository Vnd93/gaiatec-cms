import React from 'react';
import { Link } from 'react-router-dom';
import instrumentationImage from 'figma:asset/157869a15cbba3afde6929b4ade12cd8c61fe11c.png';
import bannerImage from 'figma:asset/e33d5944635c26ae7e959a2eccbe93ea04c8d923.png';

export const InstrumentacaoIndustrialPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={bannerImage}
            alt="Instrumentação Industrial"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Serviços / Engenharia & Automação
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Instrumentação Industrial
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Medições precisas são a base do controle de processos. Sem dados confiáveis, não existe automação eficiente nem tomada de decisão segura.
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
                O que é instrumentação industrial
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                Instrumentação industrial é o conjunto de sensores, transmissores, analisadores e sistemas de medição que capturam variáveis físicas e químicas de um processo — vazão, pressão, temperatura, nível, composição de gases, energia.
              </p>
              <p>
                Esses dados alimentam sistemas de controle (CLPs, SCADAs), alarmes de segurança e históricos de processo. Quando a instrumentação é mal dimensionada ou está descalibrada, toda a cadeia de automação e decisão fica comprometida.
              </p>
              <p className="text-gray-900">
                Na Gaiatec Sistemas, instrumentação é tratada como engenharia de medição — não como instalação de sensores.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem full-width com painel lateral */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid md:grid-cols-3 gap-0">
            <div className="md:col-span-2 h-80 bg-gray-100 overflow-hidden">
              <img
                src={instrumentationImage}
                alt="Planta industrial com instrumentação"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="h-80 bg-gray-900 flex items-center justify-center p-10">
              <p className="text-gray-300 leading-relaxed">
                Instrumentação aplicada em campo — cada ponto de medição é definido conforme criticidade do processo e normas técnicas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Variáveis monitoradas — itens numerados */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                O que monitoramos
              </h2>
              <p className="text-gray-600 leading-relaxed">
                Atuamos na medição e controle das principais variáveis industriais. Cada uma é selecionada e instrumentada conforme o ambiente, criticidade do processo e normas aplicáveis.
              </p>
            </div>

            <div className="md:col-span-8">
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">01</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Vazão</h3>
                  <p className="text-gray-700 mt-1">Medição de fluxo de líquidos e gases em tubulações e dutos industriais.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">02</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Pressão</h3>
                  <p className="text-gray-700 mt-1">Controle de pressão em sistemas, vasos, reatores e equipamentos.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">03</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Temperatura</h3>
                  <p className="text-gray-700 mt-1">Monitoramento térmico de processos contínuos e batelada.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">04</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Nível</h3>
                  <p className="text-gray-700 mt-1">Controle de nível em tanques, reservatórios e silos industriais.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">05</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Energia</h3>
                  <p className="text-gray-700 mt-1">Medição de consumo, geração e eficiência energética do processo.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">06</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Gases e fluidos</h3>
                  <p className="text-gray-700 mt-1">Análise de composição, qualidade e concentração de gases e fluidos.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Setores de aplicação — grid limpo */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Onde aplicamos
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <p className="text-gray-700 leading-relaxed mb-8">
                As soluções de instrumentação da Gaiatec Sistemas são aplicadas em operações onde a precisão de medição impacta diretamente a segurança, eficiência e conformidade do processo.
              </p>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Indústrias de processo e manufatura</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Geração e tratamento de energia</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Plantas químicas e petroquímicas</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Sistemas de biogás e biodigestores</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Redes hidráulicas e utilidades</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Plantas agrícolas e ambientais</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparativo — sem vs com instrumentação */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Instrumentação correta muda o comportamento do processo
            </h2>
            <p className="text-gray-600">
              Comparativo entre operações sem instrumentação adequada e processos controlados com medição precisa.
            </p>
          </div>

          <div className="bg-white shadow-sm">
            <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
              {/* Sem instrumentação */}
              <div className="p-10">
                <h3 className="text-xl font-bold text-gray-500 mb-8">
                  Sem instrumentação adequada
                </h3>
                <ul className="space-y-4">
                  <li className="text-gray-700 border-l-2 border-gray-300 pl-4">
                    Medições instáveis e imprecisas
                  </li>
                  <li className="text-gray-700 border-l-2 border-gray-300 pl-4">
                    Ajustes manuais frequentes
                  </li>
                  <li className="text-gray-700 border-l-2 border-gray-300 pl-4">
                    Paradas não planejadas
                  </li>
                  <li className="text-gray-700 border-l-2 border-gray-300 pl-4">
                    Dificuldade de diagnóstico
                  </li>
                  <li className="text-gray-700 border-l-2 border-gray-300 pl-4">
                    Maior risco operacional
                  </li>
                </ul>
                <p className="text-sm text-gray-500 mt-6">
                  Processo dependente de tentativa e erro.
                </p>
              </div>

              {/* Com instrumentação Gaiatec */}
              <div className="p-10">
                <h3 className="text-xl font-bold text-gray-900 mb-8">
                  Com instrumentação Gaiatec
                </h3>
                <ul className="space-y-4">
                  <li className="text-gray-800 border-l-2 border-[#0057DE] pl-4">
                    Medições precisas e confiáveis
                  </li>
                  <li className="text-gray-800 border-l-2 border-[#0057DE] pl-4">
                    Controle contínuo do processo
                  </li>
                  <li className="text-gray-800 border-l-2 border-[#0057DE] pl-4">
                    Redução de falhas e paradas
                  </li>
                  <li className="text-gray-800 border-l-2 border-[#0057DE] pl-4">
                    Diagnóstico técnico rápido
                  </li>
                  <li className="text-gray-800 border-l-2 border-[#0057DE] pl-4">
                    Operação segura e previsível
                  </li>
                </ul>
                <p className="text-sm text-gray-900 mt-6">
                  Processo estável, controlado e rastreável.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* O que entregamos — prosa editorial */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que entregamos na prática
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                Na prática, instrumentação bem feita significa medições que o operador pode confiar, alarmes que disparam quando devem disparar, e dados históricos que permitem rastrear o que aconteceu no processo horas, dias ou meses atrás.
              </p>
              <p>
                Significa reduzir paradas não planejadas porque o processo avisa antes de falhar. Significa calibração com rastreabilidade, instalação conforme norma, e documentação técnica que sobrevive à troca de equipe.
              </p>
              <p>
                O resultado direto é mais segurança operacional, menos desperdício de insumos e energia, e uma base sólida para qualquer nível de automação — do controle local ao supervisório integrado.
              </p>
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
              to="/servicos/automacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Automação Industrial
            </Link>
            <Link
              to="/servicos/medicao-vazao"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Medição de Vazão
            </Link>
            <Link
              to="/servicos/protecao-catodica"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Proteção Catódica
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