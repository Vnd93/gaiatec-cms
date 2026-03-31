import React from 'react';
import { Link } from 'react-router-dom';
import { ImageWithFallback } from '@/app/components/figma/ImageWithFallback';
import heroImage from 'figma:asset/814970b84aeef7a5132269899d2b12c94b7f926e.png';
import fogareiroImage from 'figma:asset/91128dc5b242f9103a49c1eb4e664f8fe457dbee.png';
import filtrosImage from 'figma:asset/136825e92a8acb454418eeb3ad76de2523a9beac.png';
import producaoImage from 'figma:asset/cdb1cb2aa3293ccfbda0e154b79ac379fd91b81c.png';

export const AutomacaoControlePage = () => {
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
            <div className="text-orange-500 font-bold uppercase tracking-wider mb-4 text-[12px]">
              Biodigestor / GT-BIODIGEST
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Automação e Controle do Processo
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Controle físico e hidráulico para estabilidade, segurança e aproveitamento eficiente do biogás — sem dependência de energia elétrica.
            </p>
          </div>
        </div>
      </section>

      {/* Conceito — 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O que significa controle no GT-BIODIGEST
              </h2>
              <div className="w-12 h-1 bg-orange-500 mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                No GT-BIODIGEST, automação e controle não significam eletrônica complexa ou dependência energética. Significam controle físico, hidráulico e operacional do processo — garantindo segurança, estabilidade e aproveitamento eficiente do biogás.
              </p>
              <p>
                O sistema foi projetado para funcionar de forma autônoma, com componentes simples, confiáveis e de baixa manutenção. Cada elemento tem função definida dentro do processo, da geração ao uso final do biogás.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Etapa 1 — Produção controlada (7/5 com imagem) */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <p className="text-sm text-gray-400 font-mono uppercase tracking-wider mb-10">Da geração ao uso do biogás</p>

          <div className="md:grid md:grid-cols-12 md:gap-12 items-start">
            <div className="md:col-span-7 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Produção controlada
              </h2>
              <div className="w-12 h-1 bg-orange-500 mb-8"></div>

              <p className="text-gray-700 leading-relaxed mb-6">
                A entrada dos resíduos é feita de forma adequada, a digestão anaeróbia ocorre em ambiente fechado e a pressão interna é naturalmente regulada. Não há geração descontrolada de gás — a estabilidade do processo biológico é mantida por projeto, não por intervenção constante.
              </p>

              <div className="grid grid-cols-2 gap-x-8 gap-y-3 mt-8">
                {[
                  'Entrada adequada de resíduos',
                  'Ambiente fechado e vedado',
                  'Pressão regulada naturalmente',
                  'Processo biológico estável'
                ].map((item, i) => (
                  <div key={i} className="border-b border-gray-300 pb-2">
                    <span className="text-sm text-gray-400 font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="md:col-span-5">
              <div className="overflow-hidden">
                <ImageWithFallback
                  src={producaoImage}
                  alt="Sistema de produção controlada do biogás"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-sm text-gray-400 font-mono mt-3">
                Produção controlada / GT-BIODIGEST
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Etapa 2 — Tratamento (4/8 invertido, imagem à esquerda) */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12 items-start">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <div className="overflow-hidden">
                <ImageWithFallback
                  src={filtrosImage}
                  alt="Sistema de filtragem e tratamento do biogás"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-sm text-gray-400 font-mono mt-3">
                Filtragem / Tratamento do biogás
              </p>
            </div>

            <div className="md:col-span-8">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Tratamento do biogás
              </h2>
              <div className="w-12 h-1 bg-orange-500 mb-8"></div>

              <p className="text-gray-700 leading-relaxed mb-6">
                Antes de ser utilizado, o biogás passa por elementos físicos de controle: desidratadores, filtros de impurezas e filtros de carvão ativado para remoção de compostos indesejados. Isso garante maior eficiência de queima e proteção dos equipamentos de uso final.
              </p>

              <h3 className="text-xl font-bold text-gray-900 mb-4">Distribuição segura</h3>
              <p className="text-gray-700 leading-relaxed">
                O biogás é conduzido por tubulações adequadas, conexões vedadas, válvulas manuais de controle e sistemas de alívio de pressão — tudo dimensionado para operação contínua e segura, sem risco de sobrepressão.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Fogareiro como validação — 5/7 invertido */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-12 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <div className="overflow-hidden">
                <ImageWithFallback
                  src={fogareiroImage}
                  alt="Fogareiro como ponto de validação do controle"
                  className="w-full h-auto"
                />
              </div>
              <p className="text-sm text-gray-400 font-mono mt-3">
                Validação de controle / Chama estável
              </p>
            </div>

            <div className="md:col-span-7">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                O fogareiro como elemento de controle
              </h2>
              <div className="w-12 h-1 bg-orange-500 mb-8"></div>

              <p className="text-gray-700 leading-relaxed mb-6">
                O fogareiro não é apenas um acessório de consumo. Ele funciona como ponto de validação do sistema inteiro: ao utilizá-lo, é possível confirmar a qualidade do biogás, avaliar a estabilidade da produção, verificar a eficiência do processo e demonstrar o funcionamento real do sistema.
              </p>
              <p className="text-gray-900">
                A chama estável indica controle adequado do processo biológico e do tratamento do gás.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Segurança + Simplicidade — duas colunas editoriais */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            Segurança e simplicidade integradas
          </h2>
          <div className="w-12 h-1 bg-orange-500 mb-12"></div>

          <div className="md:grid md:grid-cols-2 md:gap-16">
            {/* Segurança */}
            <div className="mb-12 md:mb-0">
              <h3 className="text-xl font-bold text-gray-900 mb-4">Segurança operacional</h3>
              <p className="text-gray-700 leading-relaxed mb-6">
                O controle do GT-BIODIGEST inclui segurança operacional por projeto: sistema fechado e vedado, válvula hidráulica automática de alívio, controle natural de pressão, redução de riscos de vazamento e operação sem ignição interna. O sistema opera dentro de limites seguros, mesmo em uso contínuo.
              </p>

              <div className="space-y-3">
                {[
                  'Sistema fechado e vedado',
                  'Válvula hidráulica de alívio',
                  'Controle natural de pressão',
                  'Operação sem ignição interna'
                ].map((item, i) => (
                  <div key={i} className="border-b border-gray-200 pb-2">
                    <p className="text-gray-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Automação física */}
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-4">Automação física</h3>
              <p className="text-gray-700 leading-relaxed mb-6">
                Diferente de sistemas que exigem energia elétrica constante, o GT-BIODIGEST utiliza automação física e hidráulica. Isso significa menor custo de operação, menor risco de falhas, manutenção simplificada e alta confiabilidade em ambientes rurais — com independência energética.
              </p>

              <div className="space-y-3">
                {[
                  'Menor custo de operação',
                  'Menor risco de falhas',
                  'Manutenção simplificada',
                  'Independência energética'
                ].map((item, i) => (
                  <div key={i} className="border-b border-gray-200 pb-2">
                    <p className="text-gray-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Integração avançada — bloco breve */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-6 md:mb-0">
              <h3 className="text-xl font-bold text-gray-900">Integração com automação avançada</h3>
              <p className="text-sm text-gray-400 font-mono mt-1">Opcional</p>
            </div>
            <div className="md:col-span-7 text-gray-700 leading-relaxed">
              <p>
                Para aplicações maiores ou mais técnicas, o sistema pode ser integrado a sensores de pressão, medidores de vazão, analisadores de biogás, sistemas de monitoramento e alarmes de segurança. Essa integração permite gestão mais precisa sem comprometer a autossuficiência do biodigestor.
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
              to="/biodigestor/monitoramento"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Monitoramento de Processos
            </Link>
            <Link
              to="/biodigestor/biogas-biometano"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Biogás e Biometano
            </Link>
            <Link
              to="/servicos/instrumentacao-industrial"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Instrumentação Industrial
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