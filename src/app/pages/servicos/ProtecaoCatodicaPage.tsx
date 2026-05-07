import React from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import { ComparisonTable } from '@/app/components/ComparisonTable';

export const ProtecaoCatodicaPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] bg-black overflow-hidden">
        <div className="absolute inset-0">
          <ImageWithFallback
            src="/images/heroes/1.1.png"
            alt="Proteção catódica em tubulações"
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
              Integridade metálica ao longo do tempo
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Sistemas técnicos de proteção contra corrosão para estruturas enterradas e submersas.
            </p>
          </div>
        </div>
      </section>

      {/* O que é — 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que é proteção catódica
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                É um método eletroquímico aplicado para prevenir e controlar a corrosão de estruturas metálicas enterradas ou submersas — tubulações, tanques, estruturas portuárias, plataformas. O processo consiste na aplicação de um potencial elétrico controlado à estrutura, por meio de ânodos, fazendo com que a corrosão seja inibida ou significativamente reduzida.
              </p>
              <p>
                Quando corretamente projetada e monitorada, a proteção catódica prolonga a vida útil da estrutura, reduz custos de manutenção e aumenta a segurança operacional. Na Gaiatec Sistemas, tratamos proteção catódica como um sistema de engenharia — não como uma instalação pontual.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Componentes do sistema — barra horizontal técnica */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-sm text-gray-400 font-mono uppercase tracking-wider mb-8">Componentes do sistema</p>
          <div className="grid md:grid-cols-3 gap-px bg-gray-300">
            <div className="bg-gray-50 py-6 pr-8">
              <span className="text-sm text-gray-400 font-mono">01</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1">Estrutura metálica</h3>
              <p className="text-gray-600 mt-2">Tubulação ou estrutura a ser protegida contra degradação eletroquímica.</p>
            </div>
            <div className="bg-gray-50 py-6 px-8">
              <span className="text-sm text-gray-400 font-mono">02</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1">Ânodos</h3>
              <p className="text-gray-600 mt-2">Elementos que fornecem corrente elétrica controlada — galvânicos ou por corrente impressa.</p>
            </div>
            <div className="bg-gray-50 py-6 pl-8">
              <span className="text-sm text-gray-400 font-mono">03</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1">Fluxo elétrico</h3>
              <p className="text-gray-600 mt-2">Potencial aplicado que desloca a reação de corrosão da estrutura para o ânodo.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Imagem de respiro — full bleed */}
      <section className="h-72 md:h-96 overflow-hidden">
        <ImageWithFallback
          src="/images/heroes/1.2.png"
          alt="Tubulações industriais de aço"
          className="w-full h-full object-cover"
        />
      </section>

      {/* Análise de corrosão — 7/5 invertido, com imagem */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12 items-start">
            <div className="md:col-span-7 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Análise de corrosão e planejamento
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mb-8"></div>

              <div className="text-gray-700 leading-relaxed space-y-5">
                <p>
                  Todo sistema de proteção catódica começa com uma análise criteriosa. Avaliamos o tipo de metal e suas características eletroquímicas, o revestimento existente e seu estado de conservação, as propriedades do solo ou meio aquoso — resistividade, pH, salinidade — e o histórico de corrosão e manutenções anteriores.
                </p>
                <p>
                  Presença de interferências elétricas ou correntes de fuga também são investigadas. O resultado é um dimensionamento técnico completo: escolha do método (corrente impressa ou ânodos galvânicos), quantidade e posicionamento dos ânodos, e parâmetros elétricos necessários para a proteção efetiva.
                </p>
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="h-72 md:h-80 overflow-hidden">
                <ImageWithFallback
                  src="/images/heroes/1.3.png"
                  alt="Planta industrial com tubulações"
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-sm text-gray-400 font-mono mt-3">
                Inspeção de campo / Avaliação de condições
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Instalação — etapas em prosa, 5/7 */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Instalação do sistema
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
              <p className="text-gray-600 leading-relaxed mt-5">
                Implantação de ânodos e componentes dimensionados conforme critérios técnicos e normativos.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="grid md:grid-cols-2 gap-x-12 gap-y-6">
                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">01</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Preparação do local</h3>
                  <p className="text-gray-700 mt-1">Condições de acesso, segurança e logística para os componentes.</p>
                </div>
                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">02</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Instalação dos ânodos</h3>
                  <p className="text-gray-700 mt-1">Posicionamento e fixação conforme projeto técnico e normas aplicáveis.</p>
                </div>
                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">03</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Conexões elétricas</h3>
                  <p className="text-gray-700 mt-1">Cabeamento seguindo critérios de isolamento e durabilidade.</p>
                </div>
                <div className="border-b border-gray-300 pb-4">
                  <span className="text-sm text-gray-400 font-mono">04</span>
                  <h3 className="text-xl font-bold text-gray-900 mt-1">Comissionamento</h3>
                  <p className="text-gray-700 mt-1">Testes, ajustes e validação dos parâmetros de proteção.</p>
                </div>
              </div>
              <p className="text-gray-900 mt-8">
                Todas as instalações seguem as normas técnicas aplicáveis e as melhores práticas de engenharia.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Monitoramento + Inspeção — duas colunas editoriais */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Após a instalação
          </h2>
          <div className="w-12 h-1 bg-[#0057DE] mb-12"></div>

          <div className="md:grid md:grid-cols-2 md:gap-16">
            {/* Monitoramento */}
            <div className="mb-12 md:mb-0">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Monitoramento e manutenção</h3>
              <p className="text-gray-700 leading-relaxed mb-6">
                Acompanhamento periódico do desempenho do sistema para garantir que o nível de proteção permaneça adequado ao longo do tempo. Inclui medições de potencial elétrico, verificação do estado dos ânodos, análise de tendências e registro de dados para histórico técnico.
              </p>

              <p className="text-gray-600 text-sm font-mono uppercase tracking-wider mb-4">Manutenções típicas</p>
              <div className="space-y-3">
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Substituição de ânodos consumidos</p>
                </div>
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Reparo de conexões elétricas danificadas</p>
                </div>
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Ajuste de parâmetros do sistema</p>
                </div>
                <div>
                  <p className="text-gray-700">Correção de interferências identificadas</p>
                </div>
              </div>
            </div>

            {/* Inspeção */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Inspeção e diagnóstico de falhas</h3>
              <p className="text-gray-700 leading-relaxed mb-6">
                Identificação de perdas de eficiência, falhas de componentes ou alterações nas condições do ambiente que possam comprometer a proteção. Recomendada quando há queda nos valores de potencial, histórico de corrosão crescente, alterações no ambiente ou sistemas antigos sem documentação técnica.
              </p>

              <p className="text-gray-600 text-sm font-mono uppercase tracking-wider mb-4">O que é verificado</p>
              <div className="space-y-3">
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Estado físico dos ânodos e conexões</p>
                </div>
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Continuidade elétrica do sistema</p>
                </div>
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Interferências elétricas externas</p>
                </div>
                <div className="border-b border-gray-200 pb-2">
                  <p className="text-gray-700">Resistividade do solo ou meio aquoso</p>
                </div>
                <div>
                  <p className="text-gray-700">Conformidade com critérios normativos</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Consultoria — bloco denso com imagem lateral */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <div className="h-64 md:h-full md:min-h-[320px] overflow-hidden">
                <ImageWithFallback
                  src="/images/heroes/1.4.png"
                  alt="Tanques de armazenamento industrial"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="md:col-span-7">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Consultoria técnica especializada
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mb-8"></div>

              <p className="text-gray-700 leading-relaxed mb-8">
                Apoio técnico para projetos novos, adequações, ampliações ou correções de sistemas existentes.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-5">
                <div className="border-b border-gray-300 pb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Análise de sistemas existentes</h3>
                  <p className="text-gray-600">Diagnóstico de adequação e sugestões de melhorias.</p>
                </div>
                <div className="border-b border-gray-300 pb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Projetos de novos sistemas</h3>
                  <p className="text-gray-600">Dimensionamento completo conforme normas técnicas.</p>
                </div>
                <div className="border-b border-gray-300 pb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Adequação a normas</h3>
                  <p className="text-gray-600">Conformidade com normas brasileiras e internacionais.</p>
                </div>
                <div className="border-b border-gray-300 pb-4">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Especificação de materiais</h3>
                  <p className="text-gray-600">Orientação para escolha de componentes por aplicação.</p>
                </div>
                <div className="border-b border-gray-300 pb-4 md:col-span-2">
                  <h3 className="text-xl font-bold text-gray-900 mb-1">Treinamento de equipes</h3>
                  <p className="text-gray-600">Capacitação de operação e manutenção para gestão dos sistemas.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Impacto — ComparisonTable (mantida intacta) */}
      <ComparisonTable
        title="Impacto da Proteção Catódica na Operação"
        subtitle="Análise comparativa dos cenários operacionais com e sem sistema de proteção catódica adequado"
        columnHeaders={{
          criterion: 'Critério Técnico',
          withoutSolution: 'Sem Proteção Adequada',
          withSolution: 'Com Proteção Catódica'
        }}
        rows={[
          {
            criterion: 'Velocidade de corrosão',
            withoutSolution: 'Corrosão acelerada e progressiva, com degradação contínua do metal',
            withSolution: 'Corrosão inibida ou significativamente reduzida, mantendo integridade estrutural'
          },
          {
            criterion: 'Risco de falha estrutural',
            withoutSolution: 'Alta probabilidade de falhas ocultas, com comprometimento da segurança',
            withSolution: 'Baixo risco operacional, com estrutura protegida de forma contínua'
          },
          {
            criterion: 'Custo de manutenção',
            withoutSolution: 'Elevado custo com manutenções corretivas frequentes e reparos emergenciais',
            withSolution: 'Redução significativa de custos, com manutenção preventiva planejada'
          },
          {
            criterion: 'Vida útil do ativo',
            withoutSolution: 'Redução da vida útil projetada, exigindo substituição prematura',
            withSolution: 'Extensão da vida útil da estrutura, maximizando retorno do investimento'
          },
          {
            criterion: 'Segurança operacional',
            withoutSolution: 'Risco ambiental e operacional elevado, com possibilidade de acidentes',
            withSolution: 'Operação segura e estável, com riscos controlados'
          },
          {
            criterion: 'Conformidade e auditoria',
            withoutSolution: 'Dificuldade em atender normas técnicas e requisitos de segurança',
            withSolution: 'Conformidade com normas técnicas brasileiras e internacionais'
          }
        ]}
        className="bg-gray-50"
      />

      {/* Serviços relacionados */}
      <section className="py-16 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-gray-600 mb-4">Serviços relacionados</p>
          <div className="flex flex-wrap gap-4">
            <Link
              to="/servicos/inspecao-revestimento"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Inspeção de Revestimento
            </Link>
            <Link
              to="/servicos/localizacao-tubulacao"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Localização de Tubulação
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