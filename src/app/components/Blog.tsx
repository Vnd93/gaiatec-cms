import React from 'react';
import { SectionTitle } from '@/app/components/ui/SectionTitle';
import { Button } from '@/app/components/ui/Button';
import { Calendar, User, ArrowRight } from 'lucide-react';

const posts = [
  {
    id: 1,
    title: 'A Importância da Automação na Indústria 4.0',
    excerpt: 'Descubra como a automação industrial está revolucionando os processos produtivos e aumentando a competitividade.',
    date: '28 Jan 2026',
    author: 'Eng. Roberto Silva',
    image: '/images/blog/6.5.png'
  },
  {
    id: 2,
    title: 'Eficiência Energética em Sistemas HVAC',
    excerpt: 'Dicas práticas para reduzir o consumo de energia em sistemas de climatização industrial sem perder performance.',
    date: '20 Jan 2026',
    author: 'Dra. Ana Costa',
    image: '/images/blog/6.6.png'
  },
  {
    id: 3,
    title: 'Tendências Tecnológicas para 2026',
    excerpt: 'O que esperar do futuro da tecnologia industrial? Confira as principais tendências apontadas por especialistas.',
    date: '15 Jan 2026',
    author: 'Equipe Gaiatec Sistemas',
    image: '/images/blog/6.7.png'
  }
];

export const Blog = () => {
  return (
    <section id="blog" className="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-block text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">BLOG GAIATEC SISTEMAS</span>
          <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4 leading-tight">Últimas Notícias</h2>
          <div className="w-24 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent mx-auto rounded-full mb-6"></div>
          <p className="mt-4 text-gray-600 text-base max-w-3xl mx-auto leading-relaxed">
            Acompanhe as novidades do setor e conteúdos exclusivos sobre tecnologia industrial.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {posts.map((post) => (
            <div key={post.id} className="bg-white rounded-xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 flex flex-col border border-gray-100 hover:border-blue-200 group">
              <div className="h-56 overflow-hidden relative">
                <div className="absolute inset-0 bg-gradient-to-t from-blue-900/60 to-transparent z-10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <img 
                  src={post.image} 
                  alt={post.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                />
              </div>
              <div className="p-7 flex flex-col flex-grow">
                <div className="flex items-center gap-4 text-xs text-gray-500 mb-4 font-medium">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-orange-500" />
                    {post.date}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4 text-blue-600" />
                    {post.author}
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-blue-600 cursor-pointer transition-colors leading-tight">
                  {post.title}
                </h3>
                <p className="text-gray-600 text-sm mb-6 flex-grow leading-relaxed">
                  {post.excerpt}
                </p>
                <a href="#" className="text-orange-500 font-bold text-sm hover:text-orange-600 mt-auto inline-flex items-center group-hover:gap-2 transition-all">
                  Ler mais <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};