import React from 'react';
import { Link } from 'react-router-dom';
import gtsonicImage from 'figma:asset/354f7362979620e48bb8754e2e237e1e71d2cc98.png';
import gt200Image from 'figma:asset/d1bac381c93ed21adaf61985ee53db696957de62.png';
import heroBanner from 'figma:asset/c02efa1f274060e3e89707ed472bb202fea81155.png';

export const MedicaoPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt="Medição Industrial"
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
              Medição de Vazão, Temperatura e Energia
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Dados confiáveis para controle de processos, eficiência energética e segurança operacional.
            </p>
          </div>
        </div>
      </section>

      {/* Contexto — layout assimétrico */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Por que medir importa
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                Um processo industrial sem medição confiável opera no escuro. O operador ajusta válvulas por experiência, o engenheiro dimensiona equipamentos com margem de segurança excessiva, e a gestão toma decisões de custo sem saber quanto energia, água ou gás realmente está sendo consumido.
              </p>
              <p>
                Medir vazão, temperatura e energia não é um requisito acessório — é o que permite saber se o processo está dentro do esperado, se está desperdiçando recurso, ou se está caminhando para uma falha.
              </p>
              <p className="text-gray-900">
                Na Gaiatec Sistemas, medição é tratada como engenharia de instrumentação — não como instalação de sensores.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* O que medimos — itens numerados */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                O que medimos na prática
              </h2>
              <p className="text-gray-600 leading-relaxed">
                Cada grandeza exige tecnologia, faixa de operação e instalação específicas. Não existe sensor universal — existe o instrumento certo para cada aplicação.
              </p>
            </div>

            <div className="md:col-span-8">
              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">01</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Vazão</h3>
                <p className="text-gray-700 leading-relaxed">
                  Medição de fluxo de líquidos, gases e vapor em tubulações industriais. Monitoramento contínuo ou campanhas pontuais conforme a necessidade do processo.
                </p>
              </div>

              <div className="border-b border-gray-300 pb-5 mb-5">
                <span className="text-sm text-gray-400 font-mono">02</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Temperatura</h3>
                <p className="text-gray-700 leading-relaxed">
                  Monitoramento térmico em processos contínuos e batelada — linhas de produção, sistemas de aquecimento, resfriamento e troca térmica.
                </p>
              </div>

              <div>
                <span className="text-sm text-gray-400 font-mono">03</span>
                <h3 className="text-xl font-bold text-gray-900 mt-1 mb-1">Energia</h3>
                <p className="text-gray-700 leading-relaxed">
                  Medição de energia térmica (BTU/h) por processo ou equipamento. Base concreta para gestão energética — sem dado medido, qualquer meta de redução é chute.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Equipamentos — GT-Sonic e GT-200 com imagens */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              Equipamentos BTUmeter
            </h2>
            <p className="text-gray-600 leading-relaxed max-w-2xl">
              Trabalhamos com a linha de medidores BTUmeter — equipamentos de referência em medição de vazão e energia térmica para aplicações industriais.
            </p>
          </div>

          {/* GT-Sonic — imagem à esquerda, texto à direita */}
          <div className="md:grid md:grid-cols-2 md:gap-12 items-center mb-16">
            <div className="mb-8 md:mb-0">
              <div className="overflow-hidden">
                <img
                  src={gtsonicImage}
                  alt="Medidor ultrassônico GT-Sonic"
                  className="w-full object-contain"
                />
              </div>
              <p className="text-sm text-gray-500 mt-3 font-mono text-center">
                GT-Sonic / Medidor Ultrassônico
              </p>
            </div>

            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">GT-Sonic</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Medidor ultrassônico de vazão, temperatura e energia térmica. Instalação não invasiva — o sensor é acoplado do lado de fora da tubulação, sem necessidade de corte, parada ou perda de carga no processo.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Aplicável em líquidos e gases, com faixas de diâmetro que cobrem desde tubulações de utilidades até linhas de processo de grande porte.
              </p>
            </div>
          </div>

          {/* GT-200 — texto à esquerda, imagem à direita */}
          <div className="md:grid md:grid-cols-2 md:gap-12 items-center">
            <div className="order-2 md:order-1">
              <h3 className="text-xl font-bold text-gray-900 mb-3">GT-200</h3>
              <p className="text-gray-700 leading-relaxed mb-4">
                Medidor de energia térmica para sistemas de aquecimento e resfriamento industrial. Registra consumo em BTU/h com histórico de dados, permitindo rastrear o consumo energético ao longo do tempo.
              </p>
              <p className="text-gray-700 leading-relaxed">
                Interface digital com saída para integração a CLPs e supervisórios. Certificado de calibração e garantia de fábrica inclusos.
              </p>
            </div>

            <div className="order-1 md:order-2 mb-8 md:mb-0">
              <div className="overflow-hidden">
                <img
                  src={gt200Image}
                  alt="Medidor de energia térmica GT-200"
                  className="w-full object-contain"
                />
              </div>
              <p className="text-sm text-gray-500 mt-3 font-mono text-center">
                GT-200 / Medidor de Energia Térmica
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Como atuamos — metodologia */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Como a Gaiatec atua em projetos de medição
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <div className="space-y-8">
                <div>
                  <span className="text-sm text-gray-400 font-mono">01</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">Diagnóstico técnico</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Avaliação do processo, tipo de fluido, faixa de operação e condições do ambiente. O objetivo é entender o que precisa ser medido, com que precisão, e em que condições reais.
                  </p>
                </div>

                <div>
                  <span className="text-sm text-gray-400 font-mono">02</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">Seleção do instrumento</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Escolha da tecnologia de medição conforme a aplicação. Não existe recomendação genérica — cada ponto de medição tem suas particularidades.
                  </p>
                </div>

                <div>
                  <span className="text-sm text-gray-400 font-mono">03</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">Instalação e comissionamento</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Instalação conforme normas e boas práticas industriais. Inclui configuração, teste funcional e validação do sinal antes da entrada em operação.
                  </p>
                </div>

                <div>
                  <span className="text-sm text-gray-400 font-mono">04</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1 mb-2">Integração ao sistema de controle</h3>
                  <p className="text-gray-700 leading-relaxed">
                    Os dados de medição são integrados a CLPs, supervisórios e sistemas SCADA existentes — para que a informação chegue onde precisa chegar.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Comparativo — com vs sem medição */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              A diferença que medição correta faz
            </h2>
            <p className="text-gray-600">
              Dois cenários reais — o primeiro é mais comum do que deveria ser.
            </p>
          </div>

          <div className="md:grid md:grid-cols-2 gap-0">
            {/* Sem medição */}
            <div className="bg-gray-50 p-10 md:p-12">
              <h3 className="text-xl font-bold text-gray-500 mb-6">
                Sem medição confiável
              </h3>
              <div className="space-y-4 text-gray-700">
                <p>O operador regula a vazão "pelo olho" ou pela experiência anterior.</p>
                <p>Ninguém sabe quanto gás ou energia está sendo consumido de fato.</p>
                <p>Quando algo sai do controle, a equipe descobre pelo efeito — não pela causa.</p>
                <p>Relatórios de eficiência são estimativas, não dados.</p>
                <p>Manutenção é corretiva: o equipamento avisa que quebrou, não que vai quebrar.</p>
              </div>
              <p className="text-sm text-gray-500 mt-8 border-t border-gray-300 pt-4">
                Processo operando no escuro.
              </p>
            </div>

            {/* Com medição Gaiatec */}
            <div className="bg-gray-900 p-10 md:p-12">
              <h3 className="text-xl font-bold text-white mb-6">
                Com medição Gaiatec
              </h3>
              <div className="space-y-4 text-gray-300">
                <p>Cada variável crítica tem um número real, atualizado e rastreável.</p>
                <p>Desvios são detectados antes de virarem problema — por alarme, não por acidente.</p>
                <p>A gestão toma decisão de custo com base em consumo medido, não estimado.</p>
                <p>O histórico de dados permite comparar turnos, períodos e condições operacionais.</p>
                <p>A automação funciona de verdade — porque tem dado confiável alimentando o controle.</p>
              </div>
              <p className="text-sm text-[#3b7ce8] mt-8 border-t border-gray-700 pt-4">
                Processo visível, controlado e documentado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Setores de aplicação */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Onde aplicamos
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7">
              <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Indústrias de processo</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Sistemas de utilidades</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Linhas de produção</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Aquecimento e resfriamento</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Geração e aproveitamento energético</p>
                </div>
                <div className="border-b border-gray-300 pb-3">
                  <p className="text-gray-900">Biogás e sistemas térmicos</p>
                </div>
              </div>

              <p className="text-gray-600 mt-8 leading-relaxed">
                A medição correta é pré-requisito para automação, controle de processos e qualquer programa sério de eficiência energética.
              </p>

              <div className="flex flex-wrap gap-3 mt-6">
                <Link
                  to="/servicos/automacao-industrial"
                  className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
                >
                  Automação Industrial
                </Link>
                <Link
                  to="/servicos/instrumentacao-industrial"
                  className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
                >
                  Instrumentação Industrial
                </Link>
                <Link
                  to="/biodigestor/monitoramento"
                  className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
                >
                  Monitoramento de Processos
                </Link>
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
              to="/servicos/automacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Automação Industrial
            </Link>
            <Link
              to="/servicos/instrumentacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Instrumentação Industrial
            </Link>
            <Link
              to="/biodigestor/monitoramento"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Monitoramento de Processos
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