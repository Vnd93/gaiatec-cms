import React from 'react';
import { TabbedContentSection } from '@/app/components/TabbedContentSection';
import bannerImage from 'figma:asset/9a955f9acb27af9edbbcb1c084f326291e3470be.png';
import instrumentationImage from 'figma:asset/1254176a96f597eff18e69872af336726fd8ec84.png';
import { Link } from 'react-router-dom';

export const AutomacaoIndustrialPage = () => {
  
  const technicalTabs = [
    {
      id: 'sobre',
      label: 'O que fazemos',
      content: (
        <div className="space-y-6">
          <p className="text-gray-700 leading-relaxed text-lg">
            A Gaiatec Sistemas atua no <span className="font-semibold text-gray-900">desenvolvimento e implantação de soluções de automação industrial</span> voltadas para controle, segurança e eficiência de processos produtivos.
          </p>
          
          <p className="text-gray-700 leading-relaxed text-lg">
            Projetamos sistemas que integram instrumentação, controle e supervisão, permitindo que operações industriais funcionem de forma mais estável, previsível e segura, com dados confiáveis em tempo real.
          </p>

          <p className="text-gray-700 leading-relaxed text-lg">
            Nosso foco não é apenas automatizar máquinas, mas estruturar processos industriais confiáveis, reduzindo falhas operacionais e aumentando o aproveitamento dos recursos.
          </p>

          <div className="mt-8">
            <img
              loading="lazy"
              src={instrumentationImage}
              alt="Técnico realizando instrumentação em tubulação industrial"
              className="w-full h-auto rounded-lg shadow-lg"
            />
          </div>
        </div>
      )
    },
    {
      id: 'aplicacoes',
      label: 'Onde aplicamos',
      content: (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Áreas de aplicação</h3>
          
          <p className="text-gray-700 leading-relaxed text-lg">
            As soluções de automação industrial da Gaiatec podem ser aplicadas em:
          </p>

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="bg-blue-50 p-6 border-l-4 border-blue-600">
              <p className="text-gray-800 font-medium">Processos produtivos contínuos e discretos</p>
            </div>
            <div className="bg-blue-50 p-6 border-l-4 border-blue-600">
              <p className="text-gray-800 font-medium">Sistemas de utilidades industriais</p>
            </div>
            <div className="bg-blue-50 p-6 border-l-4 border-blue-600">
              <p className="text-gray-800 font-medium">Plantas de tratamento e geração de energia</p>
            </div>
            <div className="bg-blue-50 p-6 border-l-4 border-blue-600">
              <p className="text-gray-800 font-medium">Sistemas de bombeamento, válvulas e redes hidráulicas</p>
            </div>
            <div className="bg-blue-50 p-6 border-l-4 border-blue-600 md:col-span-2">
              <p className="text-gray-800 font-medium">Monitoramento de variáveis críticas de processo</p>
            </div>
          </div>

          <div className="bg-gray-50 border border-gray-200 p-6 mt-8">
            <p className="text-gray-700 italic">
              Cada projeto é desenvolvido de acordo com a realidade da operação, respeitando normas técnicas e requisitos específicos do cliente.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'solucoes',
      label: 'Principais soluções',
      content: (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Soluções em automação industrial</h3>
          
          <div className="space-y-8 mt-6">
            <div className="border-l-4 border-blue-600 pl-6">
              <h4 className="text-lg font-bold text-gray-900 mb-3">
                Automação de processos industriais
              </h4>
              <p className="text-gray-700 leading-relaxed">
                Controle automático de etapas produtivas para aumento de eficiência e redução de intervenção manual.
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-6">
              <h4 className="text-lg font-bold text-gray-900 mb-3">
                Sistemas de controle e supervisão
              </h4>
              <p className="text-gray-700 leading-relaxed">
                Implementação de sistemas supervisórios para visualização, operação e análise de processos em tempo real.
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-6">
              <h4 className="text-lg font-bold text-gray-900 mb-3">
                Integração de equipamentos e sistemas
              </h4>
              <p className="text-gray-700 leading-relaxed">
                Integração de CLPs, IHMs, sensores, atuadores e sistemas legados em uma arquitetura única e confiável.
              </p>
            </div>

            <div className="border-l-4 border-blue-600 pl-6">
              <h4 className="text-lg font-bold text-gray-900 mb-3">
                Soluções sob medida
              </h4>
              <p className="text-gray-700 leading-relaxed">
                Projetos personalizados conforme a necessidade operacional, nível de automação desejado e ambiente industrial.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'beneficios',
      label: 'Benefícios',
      content: (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Benefícios da automação industrial</h3>
          
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="flex items-start gap-4 bg-blue-50 p-4 rounded">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">Maior estabilidade operacional</p>
            </div>
            <div className="flex items-start gap-4 bg-blue-50 p-4 rounded">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">Redução de falhas humanas</p>
            </div>
            <div className="flex items-start gap-4 bg-blue-50 p-4 rounded">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">Ganho de eficiência e produtividade</p>
            </div>
            <div className="flex items-start gap-4 bg-blue-50 p-4 rounded">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">Aumento da segurança do processo</p>
            </div>
            <div className="flex items-start gap-4 bg-blue-50 p-4 rounded">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">Dados confiáveis para tomada de decisão</p>
            </div>
            <div className="flex items-start gap-4 bg-blue-50 p-4 rounded">
              <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
              <p className="text-gray-800">Redução de custos operacionais ao longo do tempo</p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'metodologia',
      label: 'Como atuamos',
      content: (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">Metodologia de trabalho</h3>
          
          <p className="text-gray-700 leading-relaxed text-lg">
            A Gaiatec Sistemas acompanha todas as etapas do projeto:
          </p>

          <div className="grid md:grid-cols-5 gap-6 mt-8">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl mb-4 mx-auto">
                1
              </div>
              <p className="text-sm text-gray-700 font-medium">Análise técnica da operação</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl mb-4 mx-auto">
                2
              </div>
              <p className="text-sm text-gray-700 font-medium">Definição da arquitetura de automação</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl mb-4 mx-auto">
                3
              </div>
              <p className="text-sm text-gray-700 font-medium">Projeto e implementação</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl mb-4 mx-auto">
                4
              </div>
              <p className="text-sm text-gray-700 font-medium">Comissionamento e testes</p>
            </div>
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-2xl mb-4 mx-auto">
                5
              </div>
              <p className="text-sm text-gray-700 font-medium">Suporte técnico e pós-venda</p>
            </div>
          </div>

          <div className="bg-blue-50 border-l-4 border-blue-600 p-6 mt-8">
            <p className="font-semibold text-gray-900">
              Nosso objetivo é entregar sistemas robustos, simples de operar e confiáveis no longo prazo.
            </p>
          </div>
        </div>
      )
    }
  ];
  
  return (
    <div className="min-h-screen bg-white">
      {/* Banner Superior */}
      <section className="relative h-[500px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            loading="eager"
            fetchPriority="high"
            src={bannerImage}
            alt="Automação Industrial"
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
              Automação Industrial
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Desenvolvimento e implantação de soluções de automação voltadas para controle, segurança e eficiência de processos produtivos.
            </p>
          </div>
        </div>
      </section>

      {/* Tabbed Content Section */}
      <TabbedContentSection tabs={technicalTabs} className="bg-gray-50" />

      {/* Serviços relacionados */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-gray-600 mb-4">Serviços relacionados</p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/servicos/instrumentacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Instrumentação Industrial
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