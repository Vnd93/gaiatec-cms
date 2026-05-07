import React from 'react';
import { Link } from 'react-router-dom';
import craibas1 from 'figma:asset/4077dcaff0ba46a25a39396ee76e688aad37c3be.png';
import girauDoPonciano1 from 'figma:asset/04c9d5785befb66270e793014b9863d561bd7203.png';
import limeiroDeAnadia1 from 'figma:asset/50ef47a6d0d3d3908d7991c1a0196cc16bff485b.png';
import palmeiraDosIndios1 from 'figma:asset/f4b3594eb3ec7fef8cba6ef298a51ef411b958cb.png';
import bannerEscolas from 'figma:asset/c675d1b9760c5eda448c19fac291281b824454b1.png';

export const ProjetosPage = () => {
  const projetos = [
    {
      cidade: 'Craíbas',
      estado: 'Alagoas',
      imagem: craibas1,
      descricao: 'Instalação de biodigestor em escola municipal, com uso educativo e reaproveitamento de resíduos orgânicos gerados no ambiente escolar.',
    },
    {
      cidade: 'Girau do Ponciano',
      estado: 'Alagoas',
      imagem: girauDoPonciano1,
      descricao: 'Implantação de biodigestor como ferramenta pedagógica, integrando práticas ambientais ao currículo da escola.',
    },
    {
      cidade: 'Limoeiro de Anadia',
      estado: 'Alagoas',
      imagem: limeiroDeAnadia1,
      descricao: 'Projeto voltado à demonstração prática de energia renovável e tratamento de resíduos orgânicos em ambiente educacional.',
    },
    {
      cidade: 'Palmeira dos Índios',
      estado: 'Alagoas',
      imagem: palmeiraDosIndios1,
      descricao: 'Biodigestor instalado para fins educacionais e ambientais, com produção de biogás e biofertilizante para horta escolar.',
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${bannerEscolas})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
        </div>

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Biodigestor / Educação
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Projetos realizados em escolas
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Biodigestores como ferramenta educacional, ambiental e operacional em instituições de ensino.
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
                Por que levar biodigestores para escolas
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 space-y-5">
              <p className="text-gray-700 leading-relaxed">
                A implantação de biodigestores em escolas vai além do tratamento de resíduos. Ela transforma o ambiente escolar em um espaço de aprendizado prático, onde alunos, professores e comunidade têm contato direto com conceitos reais de sustentabilidade, energia renovável e responsabilidade ambiental.
              </p>
              <p className="text-gray-700 leading-relaxed">
                O biodigestor permite que resíduos orgânicos gerados no próprio ambiente escolar sejam reaproveitados, demonstrando na prática como o lixo pode deixar de ser um problema e passar a ser um recurso.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* O que o biodigestor cumpre na escola — numerado */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Funções do biodigestor no ambiente escolar
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
              <p className="text-gray-600 mt-6 leading-relaxed">
                Nos projetos realizados pela Gaiatec Sistemas, o biodigestor cumpre múltiplas funções dentro das escolas.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="space-y-0">
                {[
                  'Redução do volume de resíduos orgânicos descartados',
                  'Produção de biogás para uso demonstrativo e educativo',
                  'Geração de biofertilizante para hortas escolares',
                  'Apoio a projetos pedagógicos e ambientais',
                  'Conscientização de alunos e comunidade sobre o ciclo dos resíduos',
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-4 border-b border-gray-300 py-4">
                    <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Aplicação prática — 4/8 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Aprendizado contínuo
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-8 space-y-5">
              <p className="text-gray-700 leading-relaxed">
                Nos ambientes escolares, o biodigestor funciona como ferramenta de ensino aplicada, demonstração real de energia renovável e apoio direto a práticas de educação ambiental. O contato direto com o sistema permite que os alunos acompanhem o funcionamento, compreendam o processo de biodigestão e visualizem os resultados no dia a dia.
              </p>
              <p className="text-gray-900">
                Levar biodigestores para escolas é investir em educação ambiental prática, formação cidadã e soluções sustentáveis que funcionam na realidade.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Projetos realizados — alternância imagem/texto */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Projetos realizados
          </h2>
          <div className="w-12 h-1 bg-[#0057DE] mb-6"></div>
          <p className="text-gray-600 mb-16 max-w-2xl">
            A Gaiatec Sistemas realizou a implantação de biodigestores em instituições de ensino, atendendo diferentes realidades e comunidades em Alagoas.
          </p>

          <div className="space-y-20">
            {projetos.map((projeto, index) => {
              const isReversed = index % 2 !== 0;
              return (
                <div key={index} className="md:grid md:grid-cols-12 md:gap-12 items-center">
                  {/* Imagem */}
                  <div className={`md:col-span-7 mb-6 md:mb-0 ${isReversed ? 'md:order-2' : ''}`}>
                    <img
                      src={projeto.imagem}
                      alt={`Biodigestor em escola — ${projeto.cidade}`}
                      className="w-full h-auto"
                    />
                  </div>

                  {/* Texto */}
                  <div className={`md:col-span-5 ${isReversed ? 'md:order-1' : ''}`}>
                    <span className="text-sm text-gray-400 font-mono">{String(index + 1).padStart(2, '0')}</span>
                    <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">
                      {projeto.cidade}
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">{projeto.estado}</p>
                    <p className="text-gray-700 leading-relaxed">
                      {projeto.descricao}
                    </p>
                  </div>
                </div>
              );
            })}
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
              to="/biodigestor/portes"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Portes dos Biodigestores
            </Link>
            <Link
              to="/biodigestor/beneficios"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Benefícios Econômicos
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50 border-t border-slate-200">
        <div className="container mx-auto px-6 max-w-4xl text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-slate-900 mb-4">
            Construa o futuro da sua indústria conosco
          </h2>
          <p className="text-slate-600 mb-10 max-w-xl mx-auto">
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
              className="inline-flex items-center justify-center border border-slate-300 hover:border-[#0057DE] text-slate-700 hover:text-slate-900 font-semibold px-8 py-4 transition-colors text-[14px] rounded-[7px]"
            >
              Conheça Nossos Serviços
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};