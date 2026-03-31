import React from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';

export const LocalizacaoTubulacaoPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="/images/heroes/1.1.png"
            alt="Localização de tubulação subterrânea"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-orange-500 font-bold uppercase tracking-wider mb-4 text-[12px]">
              Serviços / Integridade, Segurança & Monitoramento
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Onde está o que não pode ser visto
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Mapeamento preciso e não destrutivo de tubulações para segurança, planejamento e execução de intervenções.
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
                O que é a localização de tubulação
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                É um serviço técnico voltado à identificação precisa da posição, profundidade e trajeto de tubulações e estruturas enterradas, sem necessidade de escavações ou intervenções destrutivas.
              </p>
              <p>
                Esse serviço é essencial em ambientes industriais, obras civis, áreas urbanas e instalações técnicas. Sem essa informação, qualquer escavação vira risco — de romper uma linha de gás, danificar uma rede de água ou comprometer cabos elétricos.
              </p>
              <p className="text-gray-900">
                A Gaiatec Sistemas atua com metodologias não destrutivas e tecnologias avançadas para garantir segurança, precisão e confiabilidade na identificação de redes subterrâneas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Quando é essencial — grid limpo */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Quando a localização de tubulação é essencial
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Antes de escavações ou perfurações</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Em manutenções corretivas ou preventivas</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Na ampliação ou modificação de redes existentes</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Em obras com documentação incompleta ou desatualizada</p>
                </div>
                <div className="border-b border-gray-300 pb-3 md:col-span-2">
                  <p className="text-gray-900">Em ambientes industriais com múltiplas interferências subterrâneas</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como atuamos — itens numerados */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Como a Gaiatec atua
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">01</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Mapeamento de tubulações existentes</h3>
                <p className="text-gray-700 leading-relaxed">
                  Identificação do trajeto e posicionamento de tubulações subterrâneas ou aparentes, com registro técnico para apoio à operação e manutenção.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">02</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Identificação de interferências ocultas</h3>
                <p className="text-gray-700 leading-relaxed">
                  Detecção de cruzamentos, sobreposições e interferências que podem comprometer novas instalações ou intervenções futuras.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">03</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Apoio ao planejamento de novas redes</h3>
                <p className="text-gray-700 leading-relaxed">
                  Base técnica confiável para projeto, expansão ou realocação de tubulações, reduzindo riscos e retrabalho.
                </p>
              </div>

              <div>
                <span className="text-sm text-gray-400 font-mono">04</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Tecnologias não destrutivas</h3>
                <p className="text-gray-700 leading-relaxed">
                  Equipamentos de alta precisão aplicados conforme o tipo de tubulação, material e profundidade — sem escavação, sem interrupção.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Etapas do serviço — grid assimétrico invertido */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Etapas do serviço
              </h2>
              <p className="text-gray-600 leading-relaxed">
                Da análise do terreno à entrega do relatório técnico — cada etapa é executada para garantir que as próximas intervenções no solo sejam seguras.
              </p>
            </div>

            <div className="md:col-span-8">
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">01</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Levantamento da área</h3>
                  <p className="text-gray-700 mt-1">Análise do ambiente, histórico da instalação e características do solo.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">02</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Detecção e rastreamento</h3>
                  <p className="text-gray-700 mt-1">Aplicação de tecnologias adequadas conforme o tipo de tubulação, material e profundidade.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">03</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Interpretação dos dados</h3>
                  <p className="text-gray-700 mt-1">Análise dos resultados para identificação precisa do trajeto e possíveis interferências.</p>
                </div>

                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">04</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Entrega técnica</h3>
                  <p className="text-gray-700 mt-1">Fornecimento das informações necessárias para execução segura das próximas etapas do projeto.</p>
                </div>
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
              to="/servicos/vazamento-gas"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Pesquisa de Vazamento de Gás
            </Link>
            <Link
              to="/servicos/vazamento-agua"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Pesquisa de Vazamento de Água
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