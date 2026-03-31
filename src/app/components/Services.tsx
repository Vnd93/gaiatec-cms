import React from 'react';
import { SectionTitle } from '@/app/components/ui/SectionTitle';
import { Settings, ShieldCheck, PenTool, Lightbulb } from 'lucide-react';

const services = [
  {
    icon: Settings,
    title: 'Manutenção Preventiva',
    description: 'Programas de manutenção personalizados para garantir a longevidade e eficiência dos seus equipamentos.'
  },
  {
    icon: PenTool,
    title: 'Instalação Industrial',
    description: 'Equipe especializada para instalação de sistemas complexos seguindo todas as normas técnicas vigentes.'
  },
  {
    icon: ShieldCheck,
    title: 'Laudos e Certificações',
    description: 'Emissão de laudos técnicos e adequação de sistemas às normas NR-10, NR-12 e outras regulamentações.'
  },
  {
    icon: Lightbulb,
    title: 'Consultoria Técnica',
    description: 'Análise detalhada de processos e identificação de oportunidades de melhoria e automação.'
  }
];

export const Services = () => {
  return (
    <section id="servicos" className="py-20 bg-white relative overflow-hidden border-t border-gray-100">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-16">
          <span className="inline-block text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">O QUE FAZEMOS</span>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 leading-tight">Serviços Técnicos Especializados</h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto rounded-full"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-12">
          {services.map((service, index) => (
            <div key={index} className="bg-white border border-gray-200 p-7 rounded-lg hover:border-blue-300 hover:shadow-lg transition-all duration-300 group">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center mb-5 group-hover:scale-105 transition-transform shadow-md">
                <service.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-lg font-bold mb-3 text-gray-900">{service.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {service.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};