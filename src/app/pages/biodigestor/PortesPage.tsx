import React from 'react';
import { Link } from 'react-router-dom';
import heroImage from 'figma:asset/2cc791faa9578fb444798ba35a0133ab9b7d6591.png';
import biodigestorImagePro from 'figma:asset/e3fd6b8fd7e6dab23666ff6c9e6cbdbe9352a63e.png';
import biodigestorImageStandard from 'figma:asset/d159842c900a19dd5011cbc8f0804be3514a87fe.png';

export const PortesPage = () => {
  const modelos = [
    {
      nome: 'GT-BIODIGEST 10.0',
      porte: 'Grande porte',
      contexto: 'Escala industrial',
      descricao: 'Modelo de maior capacidade da linha, indicado para operações com alto volume de resíduos e necessidade elevada de geração de biogás.',
      especificacoes: [
        { label: 'Volume interno', valor: '10.000 L' },
        { label: 'Volume útil do biodigestor', valor: '6.000 L' },
        { label: 'Volume de biogás', valor: '4.000 L' },
        { label: 'Geração de biogás/dia', valor: '3.600 L' },
        { label: 'Geração de biofertilizante/dia', valor: '200 L' },
        { label: 'Resíduos de cozinha (máx./dia)', valor: '50 L' },
        { label: 'Resíduos animais (máx./dia)', valor: '150 L' }
      ],
      escala: 1.1,
      isPro: true
    },
    {
      nome: 'GT-BIODIGEST 8.0',
      porte: 'Médio a grande porte',
      contexto: 'Operações contínuas',
      descricao: 'Indicado para operações de médio e grande porte, com geração contínua de resíduos e demanda estável de biogás.',
      especificacoes: [
        { label: 'Volume interno', valor: '8.000 L' },
        { label: 'Volume útil do biodigestor', valor: '5.000 L' },
        { label: 'Volume de biogás', valor: '3.000 L' },
        { label: 'Geração de biogás/dia', valor: '2.500 L' },
        { label: 'Geração de biofertilizante/dia', valor: '160 L' },
        { label: 'Resíduos de cozinha (máx./dia)', valor: '40 L' },
        { label: 'Resíduos animais (máx./dia)', valor: '120 L' }
      ],
      escala: 1.0,
      isPro: true
    },
    {
      nome: 'GT-BIODIGEST 5.0',
      porte: 'Porte médio',
      contexto: 'Agroindústrias',
      descricao: 'Modelo versátil, indicado para agroindústrias e operações com volume médio de resíduos orgânicos.',
      especificacoes: [
        { label: 'Volume interno', valor: '5.000 L' },
        { label: 'Volume útil do biodigestor', valor: '3.000 L' },
        { label: 'Volume de biogás', valor: '2.000 L' },
        { label: 'Geração de biogás/dia', valor: '2.000 L' },
        { label: 'Geração de biofertilizante/dia', valor: '100 L' },
        { label: 'Resíduos de cozinha (máx./dia)', valor: '25 L' },
        { label: 'Resíduos animais (máx./dia)', valor: '75 L' }
      ],
      escala: 0.8,
      isPro: false
    },
    {
      nome: 'GT-BIODIGEST 3.0',
      porte: 'Pequeno a médio porte',
      contexto: 'Operações estruturadas',
      descricao: 'Indicado para operações estruturadas de menor escala, com geração regular de resíduos orgânicos.',
      especificacoes: [
        { label: 'Volume interno', valor: '3.000 L' },
        { label: 'Volume útil do biodigestor', valor: '1.600 L' },
        { label: 'Volume de biogás', valor: '1.400 L' },
        { label: 'Geração de biogás/dia', valor: '1.000 L' },
        { label: 'Geração de biofertilizante/dia', valor: '60 L' },
        { label: 'Resíduos de cozinha (máx./dia)', valor: '15 L' },
        { label: 'Resíduos animais (máx./dia)', valor: '45 L' }
      ],
      escala: 0.6,
      isPro: false
    },
    {
      nome: 'GT-BIODIGEST 2.0',
      porte: 'Pequeno porte',
      contexto: 'Aplicações locais',
      descricao: 'Modelo compacto, indicado para pequenas operações e aplicações locais de aproveitamento energético.',
      especificacoes: [
        { label: 'Volume interno', valor: '2.000 L' },
        { label: 'Volume útil do biodigestor', valor: '1.200 L' },
        { label: 'Volume de biogás', valor: '800 L' },
        { label: 'Geração de biogás/dia', valor: '700 L' },
        { label: 'Geração de biofertilizante/dia', valor: '40 L' },
        { label: 'Resíduos de cozinha (máx./dia)', valor: '10 L' },
        { label: 'Resíduos animais (máx./dia)', valor: '30 L' }
      ],
      escala: 0.5,
      isPro: false
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
        </div>

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Biodigestor / Linha GT-BIODIGEST
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Portes dos Biodigestores
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Modelos dimensionados para cada escala de operação, do pequeno produtor à grande indústria.
            </p>
          </div>
        </div>
      </section>

      {/* Introdução — 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Linha GT-BIODIGEST
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 space-y-5">
              <p className="text-gray-700 leading-relaxed">
                Os biodigestores da linha GT-BIODIGEST são equipamentos projetados para acelerar a decomposição da matéria orgânica na ausência de oxigênio, por meio do processo de biodigestão anaeróbia. O resultado é a produção simultânea de biogás e biofertilizante.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Cada modelo é dimensionado conforme a capacidade de processamento, o volume de biogás gerado e o tipo de resíduo atendido — garantindo que a solução se adeque à realidade operacional do cliente.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Comparação visual em escala */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-sm text-gray-400 font-mono uppercase tracking-wider mb-10">Comparação visual em escala</p>

          {/* Desktop */}
          <div className="hidden lg:block">
            <div className="flex items-end justify-around gap-6">
              {modelos.slice().reverse().map((modelo, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div
                    className="mb-4 relative flex items-end justify-center"
                    style={{ height: `${200 * modelo.escala}px` }}
                  >
                    <img
                      src={modelo.isPro ? biodigestorImagePro : biodigestorImageStandard}
                      alt={modelo.nome}
                      className="object-contain"
                      style={{
                        width: `${250 * modelo.escala}px`,
                        height: 'auto',
                        mixBlendMode: 'multiply',
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-gray-900 text-sm">{modelo.nome}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{modelo.porte}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="w-full h-px bg-gray-300 mt-8"></div>
          </div>

          {/* Mobile/Tablet */}
          <div className="lg:hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
              {modelos.slice().reverse().map((modelo, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div
                    className="mb-3 relative flex items-end justify-center"
                    style={{ height: `${120 * modelo.escala}px` }}
                  >
                    <img
                      src={modelo.isPro ? biodigestorImagePro : biodigestorImageStandard}
                      alt={modelo.nome}
                      className="object-contain"
                      style={{
                        width: `${140 * modelo.escala}px`,
                        height: 'auto',
                        mixBlendMode: 'multiply',
                      }}
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-gray-900 text-xs">{modelo.nome}</p>
                    <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{modelo.porte}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="w-full h-px bg-gray-300 mt-6"></div>
          </div>
        </div>
      </section>

      {/* Fichas técnicas dos modelos */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Especificações por modelo
          </h2>
          <div className="w-12 h-1 bg-[#0057DE] mb-16"></div>

          <div className="space-y-20">
            {modelos.map((modelo, index) => (
              <div key={index}>
                {/* Cabeçalho do modelo — 4/8 */}
                <div className="md:grid md:grid-cols-12 md:gap-12 items-start mb-8">
                  <div className="md:col-span-4 mb-4 md:mb-0">
                    <span className="text-sm text-gray-400 font-mono">{String(index + 1).padStart(2, '0')}</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1">{modelo.nome}</h3>
                    <p className="text-sm text-gray-500 mt-1">{modelo.porte} — {modelo.contexto}</p>
                  </div>
                  <div className="md:col-span-8">
                    <p className="text-gray-700 leading-relaxed">{modelo.descricao}</p>
                  </div>
                </div>

                {/* Tabela de especificações */}
                <div className="grid md:grid-cols-2 gap-x-16">
                  {modelo.especificacoes.map((spec, idx) => (
                    <div key={idx} className="flex justify-between items-baseline border-b border-gray-200 py-3">
                      <span className="text-gray-600 text-sm">{spec.label}</span>
                      <span className="text-gray-900 font-mono ml-4">{spec.valor}</span>
                    </div>
                  ))}
                </div>

                {/* Separador entre modelos */}
                {index < modelos.length - 1 && (
                  <div className="border-b border-gray-100 mt-20"></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Observação técnica — 5/7 */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Observação técnica
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 space-y-5">
              <p className="text-gray-700 leading-relaxed">
                Os valores apresentados representam capacidades máximas de referência. O desempenho real do sistema depende de fatores específicos de cada operação.
              </p>

              <div className="space-y-0 mt-4">
                {[
                  'Tipo e composição do resíduo orgânico',
                  'Frequência e regularidade da alimentação',
                  'Condições operacionais e climáticas',
                  'Controle do processo e instrumentação instalada'
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3 border-b border-gray-300 py-3">
                    <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>

              <p className="text-gray-900 mt-6">
                O correto dimensionamento garante eficiência, segurança e maior aproveitamento energético.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Páginas relacionadas */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-gray-600 mb-4">Páginas relacionadas</p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/biodigestor/como-funciona"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Como Funciona
            </Link>
            <Link
              to="/biodigestor/beneficios"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Benefícios Econômicos
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