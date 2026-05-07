import React from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import { ChevronDown } from 'lucide-react';

export const InspecaoRevestimentoPage = () => {
  const [expandedSolution, setExpandedSolution] = React.useState<number | null>(0);
  
  const solutions = [
    {
      title: 'Inspeção de revestimentos anticorrosivos e antifouling',
      description: 'Avaliação da condição e desempenho de revestimentos destinados à proteção contra corrosão e incrustações.'
    },
    {
      title: 'Avaliação de desgaste e falhas',
      description: 'Identificação de trincas, desplacamentos, falhas de aplicação e degradação do revestimento ao longo do tempo.'
    },
    {
      title: 'Análise de espessura e aderência',
      description: 'Verificação técnica da espessura das camadas aplicadas e da aderência ao substrato, conforme critérios técnicos.'
    },
    {
      title: 'Relatórios técnicos detalhados',
      description: 'Emissão de relatórios claros e objetivos, com diagnóstico do estado do revestimento e recomendações de manutenção.'
    }
  ];
  
  return (
    <div className="min-h-screen bg-white">
      {/* Hero / Abertura */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="/images/heroes/1.1.png"
            alt="Estruturas industriais"
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
              Integridade da superfície.<br />Confiabilidade da estrutura.
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Avaliação técnica de revestimentos para proteção, durabilidade e desempenho operacional.
            </p>
          </div>
        </div>
      </section>

      {/* Sobre a Inspeção de Revestimento */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            O que é a Inspeção de Revestimento
          </h2>
          
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              A inspeção de revestimento é um serviço técnico especializado voltado à <span className="font-semibold text-gray-900">avaliação da condição, desempenho e integridade</span> de revestimentos aplicados em estruturas e equipamentos expostos a ambientes agressivos, esforços mecânicos ou agentes corrosivos.
            </p>
            
            <p>
              A falha de um revestimento não é apenas estética — ela <span className="font-semibold text-gray-900">compromete a proteção da estrutura</span>, acelera processos de corrosão, reduz a vida útil do ativo e pode gerar custos elevados de reparo ou substituição.
            </p>
            
            <p className="bg-gray-50 border-l-4 border-gray-900 p-6">
              A <span className="font-bold text-gray-900">Gaiatec Sistemas</span> atua na inspeção de diferentes tipos de revestimentos, utilizando métodos e instrumentos adequados para identificar desgaste, falhas de aderência, espessura inadequada e início de processos corrosivos.
            </p>
          </div>
        </div>
      </section>

      {/* Quando a inspeção é essencial */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-12">
            Por que a inspeção de revestimento é essencial
          </h2>
          
          <div className="grid md:grid-cols-3 gap-6">
            {/* Item 1 */}
            <div className="bg-white p-6 border-l-4 border-gray-900">
              <h3 className="font-bold text-gray-900 text-lg">
                Estruturas metálicas e industriais
              </h3>
            </div>

            {/* Item 2 */}
            <div className="bg-white p-6 border-l-4 border-gray-900">
              <h3 className="font-bold text-gray-900 text-lg">
                Tubulações e dutos
              </h3>
            </div>

            {/* Item 3 */}
            <div className="bg-white p-6 border-l-4 border-gray-900">
              <h3 className="font-bold text-gray-900 text-lg">
                Tanques e reservatórios
              </h3>
            </div>

            {/* Item 4 */}
            <div className="bg-white p-6 border-l-4 border-gray-900">
              <h3 className="font-bold text-gray-900 text-lg">
                Ambientes marítimos ou de alta corrosividade
              </h3>
            </div>

            {/* Item 5 */}
            <div className="bg-white p-6 border-l-4 border-gray-900 md:col-span-2">
              <h3 className="font-bold text-gray-900 text-lg">
                Equipamentos sujeitos a abrasão, umidade ou agentes químicos
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem de destaque técnico */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid md:grid-cols-2 gap-0">
            <div className="h-96 bg-gray-100 overflow-hidden">
              <ImageWithFallback
                src="/images/heroes/1.2.png"
                alt="Superfície metálica com corrosão"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="h-96 bg-gray-100 overflow-hidden">
              <ImageWithFallback
                src="/images/heroes/1.3.png"
                alt="Inspeção industrial"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Principais Soluções */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-12">
            Principais Soluções
          </h2>
          
          <div className="space-y-4">
            {solutions.map((solution, index) => (
              <div key={index} className="border-b border-gray-200">
                <button
                  onClick={() => setExpandedSolution(expandedSolution === index ? null : index)}
                  className="w-full flex items-center justify-between py-6 text-left hover:text-blue-600 transition-colors group"
                >
                  <h3 className="text-xl font-bold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {solution.title}
                  </h3>
                  <ChevronDown 
                    className={`w-6 h-6 text-gray-600 group-hover:text-blue-600 transition-all duration-300 ${
                      expandedSolution === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                
                <div 
                  className={`overflow-hidden transition-all duration-300 ${
                    expandedSolution === index ? 'max-h-96 pb-6' : 'max-h-0'
                  }`}
                >
                  <p className="text-gray-700 leading-relaxed text-lg">
                    {solution.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como a Gaiatec atua na inspeção */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Técnicas utilizadas
          </h2>
          <p className="text-gray-600 text-lg mb-12">
            Metodologia técnica aplicada
          </p>
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Metodologia 1 */}
            <div className="bg-white p-8 shadow-sm">
              <div className="w-12 h-1 bg-[#0057DE] mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Avaliação do tipo de revestimento
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Identificação do material aplicado, ambiente de exposição e função do revestimento.
              </p>
            </div>

            {/* Metodologia 2 */}
            <div className="bg-white p-8 shadow-sm">
              <div className="w-12 h-1 bg-[#0057DE] mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Aplicação de métodos e instrumentos adequados
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Uso de tecnologias apropriadas para análise de espessura, aderência e condição superficial.
              </p>
            </div>

            {/* Metodologia 3 */}
            <div className="bg-white p-8 shadow-sm">
              <div className="w-12 h-1 bg-[#0057DE] mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Diagnóstico técnico
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Interpretação dos dados coletados para identificar riscos, falhas e degradação.
              </p>
            </div>

            {/* Metodologia 4 */}
            <div className="bg-white p-8 shadow-sm">
              <div className="w-12 h-1 bg-[#0057DE] mb-4"></div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">
                Orientação para manutenção preventiva
              </h3>
              <p className="text-gray-700 leading-relaxed">
                Recomendações técnicas para correção, reaplicação ou acompanhamento do revestimento.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Benefícios da inspeção de revestimento */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-12">
            Benefícios da inspeção de revestimento
          </h2>
          
          <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
            {/* Benefício 1 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-3 h-3 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-1">
                  Prolongamento da vida útil da estrutura
                </h3>
              </div>
            </div>

            {/* Benefício 2 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-3 h-3 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-1">
                  Redução de custos com manutenções corretivas
                </h3>
              </div>
            </div>

            {/* Benefício 3 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-3 h-3 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-1">
                  Prevenção de corrosão e falhas estruturais
                </h3>
              </div>
            </div>

            {/* Benefício 4 */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-3 h-3 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-1">
                  Maior confiabilidade operacional
                </h3>
              </div>
            </div>

            {/* Benefício 5 */}
            <div className="flex items-start gap-4 md:col-span-2">
              <div className="flex-shrink-0 w-3 h-3 bg-blue-600 rounded-full mt-2"></div>
              <div>
                <h3 className="font-bold text-gray-900 text-lg mb-1">
                  Base técnica para tomada de decisão
                </h3>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como podemos ajudar além da inspeção */}
      <section className="py-20 bg-gradient-to-br from-gray-900 to-gray-800">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-white mb-4">
              Como podemos ajudar além da inspeção
            </h2>
            <p className="text-gray-300 text-lg">
              Não apenas identificamos problemas — oferecemos soluções completas
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Ajuda 1 */}
            <div className="bg-white/10 backdrop-blur-sm p-6 border border-white/20">
              <h3 className="font-bold text-white text-lg mb-2">
                Suporte técnico na definição de ações corretivas
              </h3>
            </div>

            {/* Ajuda 2 */}
            <div className="bg-white/10 backdrop-blur-sm p-6 border border-white/20">
              <h3 className="font-bold text-white text-lg mb-2">
                Apoio na manutenção preventiva
              </h3>
            </div>

            {/* Ajuda 3 */}
            <div className="bg-white/10 backdrop-blur-sm p-6 border border-white/20">
              <h3 className="font-bold text-white text-lg mb-2">
                Orientação técnica para reaplicação de revestimentos
              </h3>
            </div>

            {/* Ajuda 4 */}
            <div className="bg-white/10 backdrop-blur-sm p-6 border border-white/20">
              <h3 className="font-bold text-white text-lg mb-2">
                Treinamento e capacitação de equipes
              </h3>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem técnica de campo */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="h-96 bg-gray-100 overflow-hidden">
            <ImageWithFallback
              src="/images/heroes/1.4.png"
              alt="Manutenção industrial de tubulações"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Tipos de Revestimentos Inspecionados */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-12">
            Tipos de Revestimentos Inspecionados
          </h2>
          
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              A Gaiatec Sistemas realiza inspeções em uma variedade de revestimentos, incluindo:
            </p>
            
            <ul className="list-disc pl-6">
              <li>Revestimentos anticorrosivos epóxicos</li>
              <li>Revestimentos antifouling</li>
              <li>Revestimentos de pintura anticorrosiva</li>
              <li>Revestimentos de cerâmica</li>
              <li>Revestimentos de polímeros</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Conexão com outros serviços */}
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
              to="/servicos/protecao-catodica"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Proteção Catódica
            </Link>
            <Link
              to="/servicos/vazamento-gas"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Pesquisa de Vazamento de Gás
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Final */}
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