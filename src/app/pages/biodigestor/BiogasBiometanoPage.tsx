import React from 'react';
import { Link } from 'react-router-dom';
import heroImage from 'figma:asset/80fcf36e273298ab7335b1067797c20752dec638.png';

export const BiogasBiometanoPage = () => {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero Section */}
      <section className="relative h-[500px] overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${heroImage})`,
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />
        </div>

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-orange-500 font-bold uppercase tracking-wider mb-4 text-[12px]">
              Biodigestor / Energia
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Biogás x Biometano
            </h1>

            <p className="text-gray-200 leading-relaxed text-[16px]">
              Embora estejam diretamente relacionados, biogás e biometano não são a mesma coisa. Eles representam etapas diferentes do aproveitamento energético dos resíduos orgânicos.
            </p>
          </div>
        </div>
      </section>

      {/* O que é Biogás */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            O que é o Biogás?
          </h2>
          
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              O biogás é o gás produzido diretamente no biodigestor durante o processo de digestão anaeróbia.
            </p>

            <div className="bg-blue-50 border-l-4 border-blue-600 p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Composição Típica do Biogás</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Metano (CH₄)</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Dióxido de carbono (CO₂)</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Traços de outros gases</span>
                </li>
              </ul>
            </div>

            <p className="bg-gray-50 border border-gray-200 p-6">
              O biogás pode ser utilizado sem purificação avançada, dependendo da aplicação.
            </p>
          </div>
        </div>
      </section>

      {/* Principais usos do Biogás */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Principais usos do biogás
          </h2>
          
          <div className="space-y-4">
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Geração de energia térmica (calor)</p>
            </div>
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Geração de energia elétrica</p>
            </div>
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Uso direto em processos industriais</p>
            </div>
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Queima controlada para aproveitamento energético</p>
            </div>
          </div>
        </div>
      </section>

      {/* O que é Biometano */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            O que é o Biometano?
          </h2>
          
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              O biometano é o biogás que passou por um processo de purificação, no qual impurezas e o CO₂ são removidos, elevando a concentração de metano.
            </p>

            <p className="bg-orange-50 border-l-4 border-orange-500 p-6">
              Após esse tratamento, o biometano possui características semelhantes ao gás natural.
            </p>
          </div>
        </div>
      </section>

      {/* Principais usos do Biometano */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Principais usos do biometano
          </h2>
          
          <div className="space-y-4">
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Combustível veicular</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Injeção em redes de gás</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Uso industrial de maior exigência técnica</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Substituição direta de combustíveis fósseis</p>
            </div>
          </div>
        </div>
      </section>

      {/* Tabela Comparativa */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Comparativo: Biogás vs Biometano
          </h2>

          <div className="overflow-x-auto border border-gray-300 rounded-lg [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-gray-400">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="text-left px-6 py-4 font-bold text-gray-900 border-b border-gray-300">Aspecto</th>
                  <th className="text-left px-6 py-4 font-bold text-gray-900 border-b border-l border-gray-300">Biogás</th>
                  <th className="text-left px-6 py-4 font-bold text-gray-900 border-b border-l border-gray-300">Biometano</th>
                </tr>
              </thead>
              <tbody>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-900 border-b border-gray-200">Origem</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Produzido diretamente no biodigestor</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Biogás purificado</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-900 border-b border-gray-200">Teor de metano</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Menor</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Elevado</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-900 border-b border-gray-200">Nível de tratamento</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Básico</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Avançado</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-900 border-b border-gray-200">Uso principal</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Energia térmica e elétrica</td>
                  <td className="px-6 py-4 text-gray-700 border-b border-l border-gray-200">Combustível e gás substituto</td>
                </tr>
                <tr className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-semibold text-gray-900">Complexidade do sistema</td>
                  <td className="px-6 py-4 text-gray-700 border-l border-gray-200">Menor</td>
                  <td className="px-6 py-4 text-gray-700 border-l border-gray-200">Maior</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Qual escolher */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Qual escolher?
          </h2>
          
          <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
            <p>
              A escolha entre biogás e biometano depende de fatores como:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Objetivo do projeto</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Escala da operação</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Demanda energética</span>
                </li>
              </ul>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Infraestrutura disponível</span>
                </li>
                <li className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-gray-900 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Viabilidade econômica</span>
                </li>
              </ul>
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-600 p-6">
              <p className="text-gray-900 font-semibold">
                Em muitos projetos, o biogás já atende plenamente às necessidades energéticas, enquanto em outros o biometano agrega maior valor comercial.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Importante destacar */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="bg-gray-50 border-l-4 border-gray-900 p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
              Importante destacar
            </h2>
            
            <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
              <p>
                Biogás e biometano não são soluções concorrentes, mas etapas possíveis dentro da mesma cadeia de aproveitamento energético.
              </p>

              <p className="font-semibold text-gray-900">
                Um projeto pode iniciar com uso de biogás e, futuramente, evoluir para produção de biometano, conforme a maturidade e o porte da operação.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Aplicações e Usos */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-5xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-8">
            Aplicações e Usos
          </h2>
          
          <div className="space-y-4">
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Geração de energia térmica (calor)</p>
            </div>
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Geração de energia elétrica</p>
            </div>
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Uso direto em processos industriais</p>
            </div>
            <div className="bg-white border-l-4 border-blue-600 p-6">
              <p className="text-gray-700 text-lg">Queima controlada para aproveitamento energético</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Combustível veicular</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Injeção em redes de gás</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Uso industrial de maior exigência técnica</p>
            </div>
            <div className="bg-white border-l-4 border-orange-500 p-6">
              <p className="text-gray-700 text-lg">Substituição direta de combustíveis fósseis</p>
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
              to="/biodigestor/automacao-controle"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Automação e Controle
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

      {/* O papel da Gaiatec Sistemas */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-5xl">
          <div className="bg-gray-50 border-l-4 border-gray-900 p-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6">
              O papel da Gaiatec Sistemas
            </h2>
            
            <div className="space-y-6 text-gray-700 leading-relaxed text-lg">
              <p>
                A Gaiatec Sistemas é especializada em projetos de biodigestores e aproveitamento de biogás e biometano. Oferecemos soluções completas, desde a análise do projeto até a implementação e manutenção do sistema.
              </p>

              <p className="font-semibold text-gray-900">
                Nossa equipe técnica e consultores têm experiência em diversos setores, garantindo que a solução proposta seja a mais adequada para suas necessidades.
              </p>
            </div>
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