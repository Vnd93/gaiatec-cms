import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Fuel, 
  Leaf, 
  Factory, 
  Shield, 
  Sprout, 
  Fan, 
  Droplets, 
  Radio 
} from 'lucide-react';
import { SectionTitle } from '@/app/components/ui/SectionTitle';

const sectors = [
  {
    id: 'gas-petroleo',
    icon: Fuel,
    title: 'Gás e Petróleo',
    description: 'Soluções robustas para extração, refino e distribuição, garantindo segurança e eficiência em ambientes críticos.',
    image: '/images/pages/2.1.png'
  },
  {
    id: 'biogas',
    icon: Leaf,
    title: 'Biogás e Biometano',
    description: 'Tecnologia para produção e aproveitamento de energia renovável, otimizando plantas de biogás e biometano.',
    image: '/images/pages/2.2.png'
  },
  {
    id: 'industrias',
    icon: Factory,
    title: 'Indústrias',
    description: 'Automação e controle para diversos segmentos industriais, aumentando a produtividade e reduzindo custos operacionais.',
    image: '/images/pages/2.3.png'
  },
  {
    id: 'protecao',
    icon: Shield,
    title: 'Proteção Catódica',
    description: 'Sistemas avançados para prevenção de corrosão em dutos e estruturas metálicas enterradas ou submersas.',
    image: '/images/pages/2.4.png'
  },
  {
    id: 'agro',
    icon: Sprout,
    title: 'Agronegócio',
    description: 'Inovação para o campo com sistemas de monitoramento e automação para silos, estufas e processos agroindustriais.',
    image: '/images/pages/2.5.png'
  },
  {
    id: 'hvac',
    icon: Fan,
    title: 'HVAC',
    description: 'Controle preciso de climatização e ventilação para conforto térmico e qualidade do ar em ambientes industriais e comerciais.',
    image: '/images/pages/2.6.png'
  },
  {
    id: 'fluidos',
    icon: Droplets,
    title: 'Líquidos e Fluidos',
    description: 'Gerenciamento eficiente de bombeamento, armazenamento e tratamento de água, efluentes e outros fluidos industriais.',
    image: '/images/pages/2.7.png'
  },
  {
    id: 'telemetria',
    icon: Radio,
    title: 'Telemetria',
    description: 'Monitoramento remoto em tempo real de ativos e processos, permitindo gestão de dados e tomada de decisão ágil.',
    image: '/images/pages/2.8.png'
  }
];

export const Features = () => {
  const [activeSectorId, setActiveSectorId] = useState(sectors[0].id);
  const activeSector = sectors.find(s => s.id === activeSectorId) || sectors[0];

  // Função para definir animação customizada por ícone
  const getIconAnimation = (sectorId: string, isActive: boolean) => {
    if (!isActive) return {};
    
    switch(sectorId) {
      case 'hvac': // Fan girando
        return {
          rotate: 360,
          transition: { 
            duration: 2, 
            repeat: Infinity, 
            ease: "linear" 
          }
        };
      case 'agro': // Sprout crescendo e pulsando (verde)
        return {
          scale: [1, 1.2, 1],
          transition: { 
            duration: 1.5, 
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case 'fluidos': // Droplets caindo
        return {
          y: [0, 5, 0],
          transition: { 
            duration: 1.2, 
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case 'telemetria': // Radio pulsando (ondas)
        return {
          scale: [1, 1.15, 1],
          opacity: [1, 0.7, 1],
          transition: { 
            duration: 1.5, 
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case 'gas-petroleo': // Fuel vibrando
        return {
          x: [-2, 2, -2, 2, 0],
          transition: { 
            duration: 0.5,
            ease: "easeInOut"
          }
        };
      case 'biogas': // Leaf balançando
        return {
          rotate: [-5, 5, -5, 5, 0],
          transition: { 
            duration: 1,
            ease: "easeInOut"
          }
        };
      case 'industrias': // Factory subindo fumaça (movimento sutil)
        return {
          y: [-3, 0, -3],
          transition: { 
            duration: 2, 
            repeat: Infinity,
            ease: "easeInOut"
          }
        };
      case 'protecao': // Shield pulsando (proteção)
        return {
          scale: [1, 1.1, 1],
          transition: { 
            duration: 1.2,
            ease: "easeInOut"
          }
        };
      default:
        return {};
    }
  };

  return (
    <section className="py-24 bg-gradient-to-b from-gray-50 to-white">
      <div className="container mx-auto px-6">
        <SectionTitle 
          title="Setores de Atuação" 
          subtitle="ONDE ATUAMOS" 
          align="center"
        />

        {/* Grid de Setores - Todos Visíveis */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-16 mb-12">
          {sectors.map((sector) => {
            const isActive = activeSectorId === sector.id;
            return (
              <button
                key={sector.id}
                onClick={() => setActiveSectorId(sector.id)}
                className={`group relative p-6 rounded-xl transition-all duration-300 text-center ${
                  isActive
                    ? 'bg-white shadow-lg'
                    : 'bg-white/70 hover:shadow-md'
                }`}
              >
                {/* Ícone Animado */}
                <motion.div 
                  className={`mx-auto flex items-center justify-center`}
                  animate={isActive ? { scale: 1.4 } : { scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    animate={getIconAnimation(sector.id, isActive)}
                  >
                    <sector.icon 
                      className={`w-5 h-5 transition-colors duration-300 stroke-[1.5] ${ 
                        isActive
                          ? sector.id === 'agro' ? 'text-green-600' : 'text-blue-600'
                          : 'text-gray-600 group-hover:text-blue-600'
                      }`} 
                    />
                  </motion.div>
                </motion.div>

                {/* Nome do Setor */}
                <h3 className={`mt-3 text-sm font-bold transition-colors ${
                  isActive
                    ? 'text-gray-900'
                    : 'text-gray-700 group-hover:text-blue-600'
                }`}>
                  {sector.title}
                </h3>
              </button>
            );
          })}
        </div>

        {/* Card de Destaque - Grande */}
        <div className="relative h-[450px] rounded-2xl overflow-hidden shadow-2xl">
          <AnimatePresence mode='wait'>
            <motion.div 
              key={activeSector.id}
              className="absolute inset-0"
              initial={{ opacity: 0, y: -30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {/* Background Image */}
              <div className="absolute inset-0 bg-gradient-to-t from-blue-900/90 via-blue-900/50 to-transparent z-10" />
              <img
                loading="lazy"
                src={activeSector.image}
                alt={activeSector.title}
                className="w-full h-full object-cover"
              />
              
              {/* Content Overlay */}
              <div className="absolute inset-0 z-20 flex flex-col justify-end p-8 md:p-12">
                <div className="max-w-3xl">
                  {/* Badge */}
                  <div className="inline-flex items-center gap-2.5 bg-orange-500 rounded-full px-4 py-2 mb-4">
                    <activeSector.icon className="text-white w-4 h-4" />
                    <span className="text-white font-bold uppercase tracking-wider text-[10px]">
                      Setor em Destaque
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="font-bold text-white mb-4 text-[28px]">
                    {activeSector.title}
                  </h3>

                  {/* Description */}
                  <p className="text-gray-100 leading-relaxed text-[15px]">
                    {activeSector.description}
                  </p>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};