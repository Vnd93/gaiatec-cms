import React from 'react';
import { Link } from 'react-router-dom';
import heroImage from 'figma:asset/2cc791faa9578fb444798ba35a0133ab9b7d6591.png';

export const OQueEPage = () => {
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
              Biodigestor / Conceito Técnico
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              O que é um biodigestor
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Um sistema fechado de tratamento biológico projetado para promover a decomposição controlada de resíduos orgânicos na ausência de oxigênio.
            </p>
          </div>
        </div>
      </section>

      {/* Conceito técnico — 5/7 */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Conceito técnico
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
            </div>

            <div className="md:col-span-7 text-gray-700 leading-relaxed space-y-5">
              <p>
                Um biodigestor é um sistema fechado de tratamento biológico projetado para promover a decomposição controlada de resíduos orgânicos na ausência de oxigênio — processo conhecido como digestão anaeróbia.
              </p>
              <p>
                Durante esse processo, microrganismos específicos convertem a matéria orgânica em biogás (principalmente metano e dióxido de carbono) e em biofertilizante estabilizado, rico em nutrientes.
              </p>
              <p className="text-gray-900">
                O sistema opera de forma contínua, segura e previsível quando corretamente dimensionado e controlado.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Vídeo explicativo */}
      <section className="py-0 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              src="https://drive.google.com/file/d/1MCj_uslxroNOiR-uEjytoq0027VKemZ3/preview"
              className="absolute top-0 left-0 w-full h-full"
              allow="autoplay"
              allowFullScreen
            />
          </div>
        </div>
      </section>

      {/* O biodigestor como sistema — 4/8 */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-4 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                O biodigestor como sistema
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
              <p className="text-gray-600 mt-6 leading-relaxed">
                Diferente de estruturas rudimentares, um biodigestor moderno é um conjunto técnico integrado. Cada componente desempenha uma função específica e deve estar dimensionado em conjunto.
              </p>
            </div>

            <div className="md:col-span-8">
              <div className="space-y-0">
                {[
                  { num: '01', titulo: 'Câmara de digestão anaeróbia', desc: 'Ambiente vedado onde ocorre a decomposição biológica dos resíduos orgânicos na ausência de oxigênio.' },
                  { num: '02', titulo: 'Sistema de entrada controlada', desc: 'Regula o tipo, volume e frequência da alimentação do biodigestor com resíduos orgânicos.' },
                  { num: '03', titulo: 'Zona de produção e armazenamento de biogás', desc: 'Espaço superior do biodigestor onde o gás gerado é acumulado antes do consumo ou tratamento.' },
                  { num: '04', titulo: 'Sistema de alívio e segurança de pressão', desc: 'Válvulas e dispositivos que impedem sobrepressão, garantindo operação segura e contínua.' },
                  { num: '05', titulo: 'Sistema de saída do biofertilizante', desc: 'Estrutura de descarga do material digerido, pronto para uso como fertilizante agrícola.' },
                  { num: '06', titulo: 'Elementos de controle hidráulico', desc: 'Componentes que regulam o fluxo interno do sistema sem necessidade de energia elétrica.' }
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

      {/* O que acontece dentro — etapas biológicas */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
            O que acontece dentro do biodigestor
          </h2>
          <div className="w-12 h-1 bg-[#0057DE] mb-6"></div>
          <p className="text-gray-600 mb-12 max-w-3xl">
            A digestão anaeróbia ocorre em etapas biológicas sequenciais, cada uma conduzida por diferentes grupos de microrganismos.
          </p>

          <div className="md:grid md:grid-cols-2 md:gap-x-16 md:gap-y-12">
            <div>
              <span className="text-sm text-gray-400 font-mono">01</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1 mb-3">Hidrólise</h3>
              <p className="text-gray-700 leading-relaxed">
                Quebra de moléculas complexas (proteínas, gorduras, carboidratos) em compostos mais simples e solúveis. É a porta de entrada do processo biológico.
              </p>
            </div>

            <div>
              <span className="text-sm text-gray-400 font-mono">02</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1 mb-3">Acidogênese</h3>
              <p className="text-gray-700 leading-relaxed">
                Os compostos da hidrólise são convertidos em ácidos orgânicos, álcoois e CO₂ por bactérias acidogênicas. Etapa rápida e intensa.
              </p>
            </div>

            <div>
              <span className="text-sm text-gray-400 font-mono">03</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1 mb-3">Acetogênese</h3>
              <p className="text-gray-700 leading-relaxed">
                Conversão dos ácidos em acetato, hidrogênio e dióxido de carbono — substratos essenciais para a última etapa do processo.
              </p>
            </div>

            <div>
              <span className="text-sm text-gray-400 font-mono">04</span>
              <h3 className="text-xl font-bold text-gray-900 mt-1 mb-3">Metanogênese</h3>
              <p className="text-gray-700 leading-relaxed">
                Produção de metano (CH₄) a partir do acetato e hidrogênio. Etapa final e mais sensível do processo — é ela que define a qualidade e o volume do biogás gerado.
              </p>
            </div>
          </div>

          {/* Condições necessárias — bloco inline */}
          <div className="mt-16 md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-6 md:mb-0">
              <h3 className="text-xl font-bold text-gray-900">Condições necessárias</h3>
              <p className="text-gray-600 mt-2 text-sm leading-relaxed">
                Para que a digestão anaeróbia ocorra de forma estável e eficiente.
              </p>
            </div>
            <div className="md:col-span-7">
              <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                {[
                  'Ausência de oxigênio',
                  'Temperatura controlada',
                  'pH equilibrado',
                  'Presença de nutrientes',
                  'Tempo de retenção adequado'
                ].map((item, i) => (
                  <div key={i} className="border-b border-gray-200 pb-2">
                    <span className="text-sm text-gray-400 font-mono mr-2">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-gray-700">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Por que é uma solução tecnológica — 5/7 */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-5 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 leading-tight">
                Por que é uma solução tecnológica
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mt-5"></div>
              <p className="text-gray-600 mt-6 leading-relaxed">
                Um biodigestor não é apenas uma solução ambiental — ele é uma solução de engenharia que exige dimensionamento, controle e conformidade técnica.
              </p>
            </div>

            <div className="md:col-span-7">
              <div className="space-y-0">
                {[
                  { titulo: 'Dimensionamento técnico preciso', desc: 'Volume calculado conforme tipo e quantidade de resíduo, temperatura e tempo de retenção necessário.' },
                  { titulo: 'Controle de processo biológico', desc: 'Monitoramento de temperatura, pH, produção de biogás e estabilidade da digestão.' },
                  { titulo: 'Segurança operacional', desc: 'Sistemas de alívio de pressão, controle de vazão e contenção adequada de gases e efluentes.' },
                  { titulo: 'Integração com automação', desc: 'Possibilidade de monitoramento remoto, alarmes e coleta de dados operacionais.' },
                  { titulo: 'Conformidade com regulamentações', desc: 'Atendimento a normas ambientais, sanitárias e de segurança aplicáveis.' }
                ].map((item, i) => (
                  <div key={i} className="border-b border-gray-300 py-5">
                    <div className="flex items-start gap-4">
                      <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
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

      {/* Diferencial técnico — 7/5 invertido */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-6 max-w-6xl">
          <div className="md:grid md:grid-cols-12 md:gap-16 items-start">
            <div className="md:col-span-7 mb-8 md:mb-0">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                Diferencial técnico Gaiatec Sistemas
              </h2>
              <div className="w-12 h-1 bg-[#0057DE] mb-8"></div>

              <p className="text-gray-700 leading-relaxed mb-6">
                A Gaiatec Sistemas não fornece biodigestores genéricos. Cada sistema é dimensionado especificamente para as condições do cliente — considerando tipo de resíduo, volume, clima, objetivo final e restrições do local.
              </p>
              <p className="text-gray-900">
                Cada biodigestor Gaiatec Sistemas é uma solução única, projetada com rigor técnico e adaptada à realidade operacional do cliente.
              </p>
            </div>

            <div className="md:col-span-5">
              <p className="text-sm text-gray-400 font-mono uppercase tracking-wider mb-6">O que consideramos em cada projeto</p>
              <div className="space-y-0">
                {[
                  'Tipo e composição do resíduo orgânico',
                  'Volume de produção diária',
                  'Condições climáticas regionais',
                  'Objetivo final (energia, biofertilizante ou ambos)',
                  'Restrições de espaço e logística',
                  'Necessidade de automação e monitoramento'
                ].map((item, i) => (
                  <div key={i} className="border-b border-gray-200 py-3">
                    <div className="flex items-start gap-3">
                      <span className="text-sm text-gray-400 font-mono mt-0.5">{String(i + 1).padStart(2, '0')}</span>
                      <span className="text-gray-700">{item}</span>
                    </div>
                  </div>
                ))}
              </div>
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