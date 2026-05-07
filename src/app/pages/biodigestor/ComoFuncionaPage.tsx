import React from 'react';
import { Link } from 'react-router-dom';
import heroImage from 'figma:asset/8fad1afdbb0d845334851f2e89efd0725f2bbc9a.png';
import { Timeline } from '../../components/ui/Timeline';

export const ComoFuncionaPage = () => {
  const timelineData = [
    {
      title: "01",
      content: (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Entrada de resíduos orgânicos
          </h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            Resíduos orgânicos provenientes de processos agrícolas, agroindustriais ou industriais são direcionados ao biodigestor de forma controlada. A regularidade e o tipo de alimentação influenciam diretamente a estabilidade do processo.
          </p>
          <p className="text-sm text-gray-500 mb-3 font-mono uppercase tracking-wider">Exemplos de resíduos</p>
          <div className="space-y-2">
            {['Dejetos animais (suínos, bovinos, aves)', 'Resíduos orgânicos industriais', 'Efluentes orgânicos e lodos'].map((item, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-gray-200 pb-2">
                <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-gray-700 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "02",
      content: (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Digestão anaeróbia
          </h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            No interior do biodigestor, os resíduos passam por um processo biológico sem presença de oxigênio, onde micro-organismos atuam na decomposição da matéria orgânica. A etapa ocorre em ambiente fechado, com controle rigoroso de parâmetros operacionais.
          </p>
          <p className="text-sm text-gray-500 mb-3 font-mono uppercase tracking-wider">Parâmetros controlados</p>
          <div className="space-y-2">
            {['Temperatura interna da câmara', 'Tempo de retenção hidráulica', 'Estabilidade biológica do processo'].map((item, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-gray-200 pb-2">
                <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-gray-700 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "03",
      content: (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Produção de biogás
          </h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            Durante a digestão, é produzido biogás — composto principalmente por metano — que pode ser captado, tratado e direcionado para aproveitamento energético. A composição do gás varia conforme o substrato e as condições do reator.
          </p>
          <p className="text-sm text-gray-500 mb-3 font-mono uppercase tracking-wider">Aplicações do biogás</p>
          <div className="space-y-2">
            {['Geração de energia térmica', 'Geração de energia elétrica', 'Conversão em biometano para rede ou frota'].map((item, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-gray-200 pb-2">
                <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-gray-700 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "04",
      content: (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Geração de biofertilizante
          </h3>
          <p className="text-gray-700 leading-relaxed">
            Após o processo de digestão, o material remanescente é convertido em biofertilizante — um subproduto estabilizado, rico em nutrientes e com valor agronômico real. Sua aplicação no solo reduz a dependência de fertilizantes químicos e contribui para o ciclo sustentável da operação.
          </p>
        </div>
      ),
    },
    {
      title: "05",
      content: (
        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">
            Integração e aproveitamento energético
          </h3>
          <p className="text-gray-700 leading-relaxed mb-4">
            Todo o processo pode ser integrado a sistemas de controle, instrumentação e automação, garantindo operação segura, contínua e monitorada. É nessa etapa que o biodigestor deixa de ser uma estrutura passiva e passa a operar como um sistema técnico completo.
          </p>
          <p className="text-sm text-gray-500 mb-3 font-mono uppercase tracking-wider">Aspectos fundamentais</p>
          <div className="space-y-2">
            {['Estabilidade e previsibilidade do processo', 'Segurança operacional com alarmes e alívio de pressão', 'Máximo aproveitamento energético do biogás gerado'].map((item, i) => (
              <div key={i} className="flex items-start gap-3 border-b border-gray-200 pb-2">
                <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-gray-700 text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-white" style={{ position: "relative" }}>
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
              Biodigestor / Processo
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Como funciona um biodigestor
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              O funcionamento de um biodigestor é baseado em um processo contínuo e controlado, no qual resíduos orgânicos são transformados em biogás e biofertilizante.
            </p>
          </div>
        </div>
      </section>

      {/* Introdução + Vídeo — 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Fluxo do processo
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
              <p className="text-gray-600 mt-6 leading-relaxed">
                Da entrada de resíduos ao aproveitamento energético, cada etapa do biodigestor cumpre uma função específica dentro de um processo biológico contínuo e controlado.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src="https://drive.google.com/file/d/1sKkyMMWlgm_iRLGA5GBPCB4eWgdZifAI/preview"
                  className="absolute top-0 left-0 w-full h-full"
                  allow="autoplay"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="bg-white" style={{ position: "relative" }}>
        <div className="container mx-auto px-6" style={{ position: "relative" }}>
          <div className="max-w-4xl mx-auto">
            <Timeline data={timelineData} />
          </div>
        </div>
      </section>

      {/* Destaque técnico — bloco prosa */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Destaque técnico
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 space-y-5">
              <p className="text-gray-700 leading-relaxed">
                Todo o funcionamento do biodigestor depende de projeto adequado, controle do processo e monitoramento contínuo. A ausência de qualquer um desses elementos compromete a eficiência, a segurança e a vida útil do sistema.
              </p>
              <p className="text-gray-900">
                Por isso, biodigestores modernos operam como sistemas tecnológicos integrados — e não apenas como estruturas físicas.
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
              to="/biodigestor/o-que-e"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              O que é um Biodigestor
            </Link>
            <Link
              to="/biodigestor/portes"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Portes dos Biodigestores
            </Link>
            <Link
              to="/biodigestor/automacao-controle"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Automação e Controle
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