import { Link } from 'react-router-dom';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import monitoringImage from 'figma:asset/8ca1d85dc687e4074acf3510c9016258610f8370.png';
import gaiatecTeamImage from 'figma:asset/3568acbf4ecd9b9f5d63ffdd55842b3a0f67a9ab.png';

export const MonitoramentoPage = () => {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const solucoes = [
    {
      titulo: 'Análise do potencial de produção',
      descricao: 'Avaliação técnica detalhada do tipo de resíduo orgânico utilizado, análise da carga orgânica disponível e caracterização das condições do processo de digestão anaeróbica. Esse diagnóstico permite estimar com precisão o potencial real de geração de biogás do sistema, identificando oportunidades de otimização e ajustes necessários para maximizar a produção. A análise considera fatores como composição do substrato, taxa de alimentação, tempo de retenção hidráulica e condições ambientais que influenciam diretamente no desempenho do biodigestor.'
    },
    {
      titulo: 'Monitoramento das condições operacionais',
      descricao: 'Acompanhamento contínuo e sistemático de parâmetros críticos que influenciam diretamente a produção e a qualidade do biogás gerado. Inclui monitoramento de temperatura, pH, alcalinidade, ácidos graxos voláteis, pressão interna, vazão de gás, composição do biogás (CH₄, CO₂, H₂S), umidade e outros indicadores operacionais. Esse controle permite identificar rapidamente desvios nas condições ideais, antecipar problemas e tomar decisões técnicas baseadas em dados reais para manter o sistema operando com máxima eficiência e estabilidade.'
    },
    {
      titulo: 'Controle do processo de geração',
      descricao: 'Implementação de estratégias técnicas e ajustes operacionais para manter o biodigestor funcionando em condições ideais de forma consistente. Isso inclui controle da taxa de alimentação, gestão da carga orgânica, ajuste de temperatura, correção de pH, adição de nutrientes quando necessário, e outras intervenções técnicas que reduzem oscilações na produção, minimizam perdas de eficiência e garantem estabilidade do processo biológico ao longo do tempo. O objetivo é transformar o biodigestor em um sistema previsível e confiável de geração de energia.'
    },
    {
      titulo: 'Tratamento, armazenamento e utilização do biogás',
      descricao: 'Desenvolvimento e implementação de soluções técnicas completas para tornar o biogás adequado para diferentes aplicações energéticas. Inclui sistemas de remoção de umidade, dessulfurização (remoção de H₂S), filtragem de particulados, compressão e armazenamento seguro do gás. Além disso, engloba o dimensionamento e integração de sistemas de aproveitamento energético como geradores elétricos, caldeiras, queimadores industriais ou sistemas de injeção em rede. Todo o processo é projetado para garantir segurança operacional, conformidade com normas técnicas e máximo aproveitamento do potencial energético do biogás produzido.'
    }
  ];

  const toggleSolucao = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero / Abertura */}
      <section className="relative h-[500px] overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="/images/heroes/1.1.png"
            alt="Planta de biogás industrial"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
        
        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-orange-500 font-bold uppercase tracking-wider mb-4 text-[12px]">
              Biodigestor / Tecnologia & Operação
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Transformar resíduo em energia exige controle
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Soluções técnicas para maximizar a produção de biogás com segurança, eficiência e estabilidade operacional.
            </p>
          </div>
        </div>
      </section>

      {/* Sobre a geração de biogás */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Sobre a geração de biogás
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                A geração de biogás é um processo biológico e energético que depende diretamente do controle adequado das condições operacionais. Variações de carga orgânica, temperatura, composição do resíduo e condições ambientais impactam a qualidade, o volume e a estabilidade do biogás produzido.
              </p>
              <p>
                A Gaiatec Sistemas atua na análise, controle e monitoramento da geração de biogás, oferecendo soluções técnicas que permitem transformar resíduos orgânicos em energia de forma segura, previsível e eficiente.
              </p>
              <p className="text-gray-900">
                Aqui, biogás não é tratado como experimento — é tratado como processo industrial controlado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* O que está em jogo na geração de biogás */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que está em jogo na geração de biogás
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
              <p className="text-gray-600 mt-6 leading-relaxed">
                Cada uma dessas variáveis afeta diretamente o resultado operacional e econômico do sistema. Sem controle técnico, o biodigestor produz menos, de forma instável e com maior risco.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="space-y-0">
                {[
                  { num: '01', titulo: 'Eficiência energética do sistema', desc: 'Volume e qualidade do biogás dependem do equilíbrio entre carga orgânica, tempo de retenção e condições do processo.' },
                  { num: '02', titulo: 'Estabilidade do processo biológico', desc: 'A digestão anaeróbia é sensível a variações de pH, temperatura e composição do substrato.' },
                  { num: '03', titulo: 'Qualidade do gás produzido', desc: 'Concentração de metano, presença de H₂S e umidade determinam a viabilidade do uso final.' },
                  { num: '04', titulo: 'Segurança operacional', desc: 'Pressão interna, acúmulo de gases e integridade do sistema exigem monitoramento contínuo.' },
                  { num: '05', titulo: 'Aproveitamento econômico', desc: 'Biogás desperdiçado ou de baixa qualidade compromete o retorno financeiro do projeto.' },
                  { num: '06', titulo: 'Conformidade ambiental', desc: 'Emissões descontroladas e manejo inadequado de efluentes geram passivos regulatórios.' }
                ].map((item) => (
                  <div key={item.num} className="border-b border-gray-300 py-5">
                    <div className="flex items-start gap-4">
                      <span className="text-sm text-gray-400 font-mono mt-0.5">{item.num}</span>
                      <div>
                        <p className="text-gray-900">{item.titulo}</p>
                        <p className="text-gray-600 mt-1 text-sm">{item.desc}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem de monitoramento técnico */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="h-[600px] bg-gray-100 overflow-hidden">
            <img
              src={monitoringImage}
              alt="Técnico instalando equipamento de monitoramento de biodigestor"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Principais Soluções */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Principais Soluções
          </h2>
          <p className="text-gray-600 mb-12 text-lg">
            Processo + controle, não lista comum
          </p>
          
          <div className="space-y-0">
            {solucoes.map((solucao, index) => (
              <div key={index} className="border-b border-gray-200">
                <button
                  onClick={() => toggleSolucao(index)}
                  className="w-full py-8 flex items-center justify-between gap-4 text-left hover:bg-gray-50 transition-colors px-4"
                >
                  <h3 className="text-xl font-bold text-gray-900 flex-1">
                    {solucao.titulo}
                  </h3>
                  <ChevronDown 
                    className={`w-6 h-6 text-gray-900 flex-shrink-0 transition-transform duration-300 ${
                      openIndex === index ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                
                <div 
                  className={`overflow-hidden transition-all duration-300 ${
                    openIndex === index ? 'max-h-96 pb-8' : 'max-h-0'
                  }`}
                >
                  <div className="px-4 md:pl-8">
                    <p className="text-gray-700 leading-relaxed text-lg">
                      {solucao.descricao}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Como a Gaiatec Sistemas atua na prática */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Como a Gaiatec Sistemas atua na prática
          </h2>
          <p className="text-gray-600 text-lg mb-12">
            Metodologia técnica aplicada
          </p>
          
          <div className="grid md:grid-cols-5 gap-6">
            {/* Etapa 1 */}
            <div className="bg-white p-6 border-t-4 border-green-600">
              <div className="text-sm font-bold uppercase tracking-wider mb-3 text-green-600">
                01
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">
                Diagnóstico inicial do sistema
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Levantamento técnico do biodigestor, resíduos utilizados e objetivos do projeto.
              </p>
            </div>

            {/* Etapa 2 */}
            <div className="bg-white p-6 border-t-4 border-green-600">
              <div className="text-sm font-bold uppercase tracking-wider mb-3 text-green-600">
                02
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">
                Instrumentação e monitoramento
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Aplicação de sensores e sistemas de medição para acompanhar o comportamento do processo.
              </p>
            </div>

            {/* Etapa 3 */}
            <div className="bg-white p-6 border-t-4 border-orange-500">
              <div className="text-sm font-bold uppercase tracking-wider mb-3 text-orange-600">
                03
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">
                Análise dos dados operacionais
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Interpretação técnica dos dados para identificar gargalos, perdas e oportunidades de melhoria.
              </p>
            </div>

            {/* Etapa 4 */}
            <div className="bg-white p-6 border-t-4 border-orange-500">
              <div className="text-sm font-bold uppercase tracking-wider mb-3 text-orange-600">
                04
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">
                Otimização contínua
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Ajustes no processo para maximizar produção, estabilidade e eficiência energética.
              </p>
            </div>

            {/* Etapa 5 */}
            <div className="bg-white p-6 border-t-4 border-orange-500">
              <div className="text-sm font-bold uppercase tracking-wider mb-3 text-orange-600">
                05
              </div>
              <h3 className="font-bold text-gray-900 text-lg mb-3">
                Acompanhamento técnico
              </h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Suporte contínuo para garantir desempenho consistente ao longo do tempo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem da equipe Gaiatec em ação */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="h-[500px] bg-gray-100 overflow-hidden">
            <img
              src={gaiatecTeamImage}
              alt="Equipe Gaiatec realizando visita técnica"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </section>

      {/* Serviços relacionados */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-gray-600 mb-4">Páginas relacionadas</p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/biodigestor/automacao-controle"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Automação e Controle
            </Link>
            <Link
              to="/biodigestor/biogas-biometano"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Biogás e Biometano
            </Link>
            <Link
              to="/biodigestor/como-funciona"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Como Funciona
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Final */}
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