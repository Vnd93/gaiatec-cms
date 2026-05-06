import React from 'react';
import { ArrowRight } from 'lucide-react';
import { optimizedBg } from './ResponsiveImage';

export const Careers = () => {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Background Image with Overlay — usa WebP 1920w */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-fixed"
        style={{ backgroundImage: `url("${optimizedBg('/images/slides/11.5.png', 1920)}")` }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/90 to-blue-800/85"></div>
      </div>

      <div className="container mx-auto px-6 relative z-10 text-center">
        <span className="inline-block text-xs font-bold text-blue-300 uppercase tracking-widest mb-3">FALE CONOSCO</span>
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-5 leading-tight">
          Construa o Futuro da sua Indústria Conosco
        </h2>
        <p className="text-base md:text-lg text-blue-100 max-w-2xl mx-auto mb-8 leading-relaxed">
          Desenvolva projetos customizados de automação e controle industrial com a expertise da Gaiatec Sistemas. Entre em contato e descubra como podemos otimizar seus processos, aumentar a eficiência operacional e impulsionar os resultados da sua planta industrial.
        </p>
        <button className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2 text-sm rounded-md shadow transition-all group">
          Fale com Nossos Especialistas <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform" />
        </button>
      </div>
    </section>
  );
};