import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { EconomicSimulator } from '@/app/components/EconomicSimulator';
import { TrendingUp } from 'lucide-react';

export const BeneficiosEconomicosPage = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 }
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <section className="relative h-[500px] overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            loading="eager"
            fetchPriority="high"
            src="/images/heroes/1.1.png"
            alt="Background Industrial Tech"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20"></div>
        </div>
        
        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Biodigestor / Viabilidade
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Benefícios Econômicos
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Transforme passivos ambientais em ativos energéticos.
            </p>
          </div>
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="py-16 md:py-24">
        <div className="container mx-auto px-6">
          <div className="grid lg:grid-cols-12 gap-12 lg:gap-16 items-start">
            
            {/* Left Column: Editorial/Technical Style */}
            <motion.div 
              className="lg:col-span-5 flex flex-col gap-12"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.div variants={itemVariants}>
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-6 tracking-tight">
                  Retorno Inteligente
                </h2>
                <p className="text-gray-600 leading-relaxed text-lg border-l-2 border-gray-200 pl-6">
                  O ganho econômico não vem de um único fator, mas da soma de economias diretas e indiretas ao longo do tempo, transformando sua operação.
                </p>
              </motion.div>

              {/* Clean Technical List */}
              <motion.div variants={itemVariants} className="space-y-10">
                <div className="group">
                  <span className="text-xs font-mono text-blue-600 mb-2 block tracking-widest">01. CUSTOS</span>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Redução Operacional</h4>
                  <p className="text-gray-600 leading-relaxed">
                    Diminuição drástica do consumo de insumos externos, substituindo custos variáveis por geração própria.
                  </p>
                </div>
                
                <div className="group">
                  <span className="text-xs font-mono text-blue-600 mb-2 block tracking-widest">02. PREVISIBILIDADE</span>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Segurança Financeira</h4>
                  <p className="text-gray-600 leading-relaxed">
                    Blindagem contra a inflação energética e flutuações de preços de fornecedores externos.
                  </p>
                </div>

                <div className="group">
                  <span className="text-xs font-mono text-blue-600 mb-2 block tracking-widest">03. PERFORMANCE</span>
                  <h4 className="text-xl font-bold text-gray-900 mb-2">Eficiência Operacional</h4>
                  <p className="text-gray-600 leading-relaxed">
                    Investimento com Payback claro que gera fluxo de caixa positivo contínuo após a amortização.
                  </p>
                </div>
              </motion.div>
              
              <motion.div variants={itemVariants} className="pt-8 border-t border-gray-100">
                <p className="text-2xl font-bold text-gray-900 leading-tight">
                  "Transformamos passivos ambientais em <span className="text-blue-600">ativos econômicos</span>."
                </p>
              </motion.div>
            </motion.div>

            {/* Right Column: Simulator */}
            <motion.div 
              className="lg:col-span-7"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <div className="sticky top-8">
                <EconomicSimulator
                  className="!py-0 !bg-transparent"
                  config={{
                    title: 'Simule sua Economia',
                    subtitle: 'Calcule o potencial de redução de custos baseado em seus parâmetros.',
                    economyTypes: [
                      {
                        value: 'gas',
                        label: 'Gás / GLP (kg)',
                        unit: 'kg',
                        suggestedCost: 8.50
                      },
                      {
                        value: 'energy',
                        label: 'Energia Elétrica (kWh)',
                        unit: 'kWh',
                        suggestedCost: 0.65
                      },
                      {
                        value: 'fertilizer',
                        label: 'Fertilizantes (kg)',
                        unit: 'kg',
                        suggestedCost: 2.00
                      }
                    ],
                    defaultType: 'gas',
                    showImplementationCost: true,
                    technicalNote: 'Estimativa preliminar. O retorno real depende de fatores como composição do resíduo e eficiência do sistema.'
                  }}
                />
              </div>
            </motion.div>

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
              to="/biodigestor/portes"
              className="text-sm text-gray-600 hover:text-gray-900 border-b border-gray-400 hover:border-gray-900 pb-0.5 transition-colors"
            >
              Portes dos Biodigestores
            </Link>
          </div>
        </div>
      </section>

      {/* Footer CTA - Minimalist */}
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