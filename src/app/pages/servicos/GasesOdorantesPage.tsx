import React from 'react';
import { Link } from 'react-router-dom';
import heroBannerImage from 'figma:asset/157869a15cbba3afde6929b4ade12cd8c61fe11c.png';
import gatsonicImage from 'figma:asset/3aa16d5c23ea4aa7772315d3d48f1110445cd9ea.png';
import detectorImage from 'figma:asset/df0961e579bc6eb45a5d75e2495871da24f5bbaf.png';

export const GasesOdorantesPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBannerImage}
            alt="Monitoramento de Gases Industriais"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Serviços / Segurança & Monitoramento
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Análise, Controle & Monitoramento de Gases Odorantes / Mercaptanas
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Detecção e controle de gases odorantes em processos industriais — da identificação de vazamentos ao monitoramento contínuo em campo.
            </p>
          </div>
        </div>
      </section>

      {/* Contexto técnico — layout assimétrico */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que são gases odorantes
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                Mercaptanas e outros compostos sulfurados são adicionados intencionalmente ao gás natural — que é inodoro — como agentes de odorização. É esse odor característico que permite a detecção humana de vazamentos antes que a concentração atinja níveis perigosos.
              </p>
              <p>
                Esses mesmos compostos também surgem como subprodutos em processos de tratamento de efluentes, biodigestão e operações petroquímicas. Em ambos os casos, a concentração precisa ser controlada: abaixo do necessário, o odor não cumpre sua função de alerta; acima do tolerável, gera riscos operacionais, reclamações ambientais e descumprimento de normas.
              </p>
              <p className="text-gray-900">
                O monitoramento não é opcional — é uma exigência técnica e regulatória para qualquer operação que envolva gases combustíveis ou processos com emissão de compostos odorantes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem full-width — detector */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="grid md:grid-cols-3 gap-0">
            <div className="md:col-span-2 h-80 bg-gray-100 overflow-hidden">
              <img
                src={detectorImage}
                alt="Detector de gases odorantes em campo"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="h-80 bg-gray-900 flex items-center justify-center p-10">
              <p className="text-gray-300 leading-relaxed">
                Equipamento de detecção utilizado em campo para análise de concentração de mercaptanas em tempo real.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Riscos — com itens numerados */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                O que acontece sem monitoramento
              </h2>
              <p className="text-gray-600 leading-relaxed">
                A ausência de controle sobre gases odorantes gera consequências que vão além do desconforto olfativo — com impacto direto na segurança, operação e conformidade regulatória.
              </p>
            </div>

            <div className="md:col-span-8">
              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">01</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Vazamentos não detectados
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Concentração insuficiente de odorante impede a detecção humana de fugas — com risco direto de explosão em redes de gás.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">02</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Reclamações e autuações ambientais
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Excesso de emissão provoca reclamações da comunidade, autuações e paralisações compulsórias por órgãos reguladores.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">03</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Exposição de trabalhadores
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Ambientes confinados com presença de mercaptanas exigem monitoramento contínuo para proteção dos trabalhadores em campo.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">04</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Processos fora de norma
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Operações fora dos limites normativos sem que a equipe perceba, resultando em multas e interdições.
                </p>
              </div>

              <div>
                <span className="text-sm text-gray-400 font-mono">05</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">
                  Perda de controle operacional
                </h3>
                <p className="text-gray-700 leading-relaxed">
                  Sem dados de concentração, a tomada de decisão operacional se torna reativa — corrigindo problemas ao invés de preveni-los.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Como a Gaiatec Sistemas atua — split com imagem */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-2 md:gap-16 items-start">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Como a Gaiatec Sistemas atua
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mb-8"></div>

              <div className="space-y-10">
                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Análise e diagnóstico
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    Identificação da presença e concentração de gases odorantes no processo. Inclui mapeamento de pontos críticos, avaliação de conformidade com normas técnicas e diagnóstico de falhas em sistemas de odorização existentes.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Monitoramento contínuo ou pontual
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    Instalação e configuração de sistemas de detecção em áreas críticas — com monitoramento em tempo real, registro de dados históricos e alarmes por desvio de concentração. Também realizamos campanhas pontuais de medição para diagnósticos específicos.
                  </p>
                </div>

                <div>
                  <h3 className="text-xl font-bold text-gray-900 mb-2">
                    Integração com sistemas de controle
                  </h3>
                  <p className="text-gray-700 leading-relaxed">
                    Os dados de monitoramento podem ser integrados a CLPs, SCADAs e sistemas de segurança existentes, permitindo ações automáticas quando os limites configurados são ultrapassados.
                  </p>
                </div>
              </div>
            </div>

            {/* Imagem Gatsonic — sticky na coluna direita */}
            <div className="mt-10 md:mt-0 md:sticky md:top-8">
              <div className="overflow-hidden">
                <img
                  src={gatsonicImage}
                  alt="Analisador Gatsonic para monitoramento de mercaptanas"
                  className="w-full object-contain"
                />
              </div>
              <p className="text-sm text-gray-500 mt-3 font-mono text-center">
                Gatsonic / Analisador de Mercaptanas
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Onde aplicamos — texto corrido com peso visual */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Setores de aplicação
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <p className="text-gray-700 leading-relaxed mb-8">
                As soluções de monitoramento de gases odorantes são aplicadas em contextos onde a presença de compostos sulfurados exige controle rigoroso — cada um com suas particularidades de tipo de gás, faixa de concentração, norma aplicável e condições ambientais.
              </p>

              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Redes de distribuição de gás natural</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Estações de tratamento de efluentes</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Plantas petroquímicas</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Sistemas de biogás e biodigestores</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Ambientes confinados</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Infraestruturas críticas</p>
                </div>
              </div>

              <p className="text-gray-600 mt-6 leading-relaxed">
                A configuração do sistema de monitoramento é definida caso a caso, com base nas condições reais da operação.
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
              to="/servicos/vazamento-gas"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Pesquisa de Vazamento de Gás
            </Link>
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