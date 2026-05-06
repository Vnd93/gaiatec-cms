import React from 'react';
import { SectionTitle } from '@/app/components/ui/SectionTitle';
import { Button } from '@/app/components/ui/Button';
import { ShoppingCart, ArrowRight } from 'lucide-react';
import { ResponsiveImage } from './ResponsiveImage';

const products = [
  {
    id: 1,
    name: 'Controlador Industrial CLP-2000',
    category: 'Automação',
    price: 'Sob Consulta',
    image: '/images/slides/11.2.png'
  },
  {
    id: 2,
    name: 'Sistema de Exaustão EX-500',
    category: 'Ventilação',
    price: 'Sob Consulta',
    image: '/images/slides/11.3.png'
  },
  {
    id: 3,
    name: 'Sensor de Temperatura IoT',
    category: 'Instrumentação',
    price: 'Sob Consulta',
    image: '/images/slides/11.4.png'
  }
];

export const Products = () => {
  return (
    <section id="produtos" className="py-20 bg-white">
      <div className="container mx-auto px-4">
        <SectionTitle 
          title="Produtos em Destaque" 
          subtitle="NOSSO CATÁLOGO" 
          align="center"
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
          {products.map((product) => (
            <div key={product.id} className="group bg-white rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-300 border border-gray-100 overflow-hidden flex flex-col">
              <div className="relative h-64 overflow-hidden">
                <ResponsiveImage
                  src={product.image}
                  alt={product.name}
                  sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className="absolute top-4 right-4 bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  {product.category}
                </div>
              </div>
              
              <div className="p-6 flex-grow flex flex-col">
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {product.name}
                </h3>
                <p className="text-gray-500 mb-6 font-medium">
                  {product.price}
                </p>
                
                <div className="mt-auto pt-4 border-t border-gray-100 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 w-full text-xs">
                    Detalhes <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                  <Button variant="primary" size="sm" className="flex-1 w-full text-xs">
                    Orçamento <ShoppingCart className="w-3 h-3 ml-1" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        <div className="text-center mt-12">
           <Button variant="secondary" size="lg">
             Ver Catálogo Completo
           </Button>
        </div>
      </div>
    </section>
  );
};
