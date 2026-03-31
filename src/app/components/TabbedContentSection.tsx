import React, { useState } from 'react';
import { motion } from 'motion/react';

export interface ContentTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface TabbedContentSectionProps {
  title?: string;
  subtitle?: string;
  tabs: ContentTab[];
  className?: string;
}

export const TabbedContentSection: React.FC<TabbedContentSectionProps> = ({
  title,
  subtitle,
  tabs,
  className = ''
}) => {
  const [activeTab, setActiveTab] = useState(tabs[0]?.id || '');

  const activeContent = tabs.find(tab => tab.id === activeTab);

  return (
    <section className={`py-20 bg-white ${className}`}>
      <div className="container mx-auto px-6 relative">
        {/* Header (opcional) */}
        {(title || subtitle) && (
          <div className="max-w-5xl mx-auto mb-16">
            {title && (
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-lg text-gray-600 leading-relaxed">
                {subtitle}
              </p>
            )}
          </div>
        )}

        {/* Layout de duas colunas */}
        <div className="max-w-7xl mx-auto relative">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
            {/* Coluna esquerda - Navegação lateral */}
            <div className="lg:col-span-3 relative">
              <nav className="lg:sticky lg:top-24 space-y-2 relative">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="w-full text-left px-5 py-3.5 rounded-md transition-colors duration-200 font-medium text-sm relative z-10"
                  >
                    <span className={`relative z-10 ${activeTab === tab.id ? 'text-white' : 'text-gray-700'}`}>
                      {tab.label}
                    </span>
                    
                    {/* Barrinha animada */}
                    {activeTab === tab.id && (
                      <motion.div
                        layoutId="activeTabIndicator"
                        className="absolute inset-0 bg-blue-600 rounded-md shadow-md"
                        transition={{
                          type: "spring",
                          stiffness: 380,
                          damping: 30
                        }}
                      />
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Coluna direita - Conteúdo dinâmico */}
            <div className="lg:col-span-9">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ 
                  duration: 0.5,
                  ease: [0.4, 0, 0.2, 1]
                }}
                className="bg-white border border-gray-200 rounded-lg p-8 md:p-10 min-h-[400px]"
              >
                {activeContent?.content}
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};