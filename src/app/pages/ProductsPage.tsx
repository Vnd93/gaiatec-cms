import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { products, categories } from '@/app/data/products';
import { Link } from 'react-router-dom';
import heroBanner from 'figma:asset/ad0b7302a2e1a3586c2569629d8f17f6c48fbc4b.png';

export const ProductsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todos os Produtos');
  const [sortBy, setSortBy] = useState('name');
  const [showCategories, setShowCategories] = useState(false);

  const filteredProducts = useMemo(() => {
    let filtered = products.filter(product => {
      const matchesSearch = product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           product.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = selectedCategory === 'Todos os Produtos' || product.category === selectedCategory;
      return matchesSearch && matchesCategory;
    });

    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'name':
        default:
          return a.name.localeCompare(b.name);
      }
    });

    return filtered;
  }, [searchTerm, selectedCategory, sortBy]);

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative h-[500px] overflow-hidden">
        <div className="absolute inset-0">
          <img
            src={heroBanner}
            alt="Instrumentação industrial — tubulações e medidores"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/20" />

        <div className="container mx-auto px-6 h-full flex items-center relative z-10">
          <div className="max-w-3xl mx-[25px] my-[0px]">
            <div className="text-[#0057DE] font-bold uppercase tracking-wider mb-4 text-[12px]">
              Portfólio / Instrumentação & Automação
            </div>
            <h1 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              Equipamentos para controle de processos
            </h1>
            <p className="text-gray-200 leading-relaxed text-[16px]">
              Válvulas, medidores, sensores, controladores e analisadores selecionados para operações industriais que exigem precisão e confiabilidade.
            </p>
          </div>
        </div>
      </section>

      {/* Filtros e busca */}
      <section className="border-b border-gray-200 bg-gray-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1 w-full sm:max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Buscar por nome ou descrição"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-3 sm:py-2.5 border border-gray-300 bg-white text-[16px] sm:text-sm focus:outline-none focus:border-gray-900 transition-colors"
              />
            </div>

            <div className="flex gap-3">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 sm:flex-none px-3 py-3 sm:py-2.5 border border-gray-300 bg-white text-sm focus:outline-none focus:border-gray-900"
              >
                <option value="name">Ordenar: A–Z</option>
                <option value="price-asc">Preço: menor → maior</option>
                <option value="price-desc">Preço: maior → menor</option>
              </select>

              {/* Botão categorias — só mobile */}
              <button
                onClick={() => setShowCategories(!showCategories)}
                className="lg:hidden px-4 py-3 sm:py-2.5 border border-gray-300 bg-white text-sm text-gray-700 hover:border-gray-900 transition-colors whitespace-nowrap"
              >
                {selectedCategory === 'Todos os Produtos' ? 'Categorias' : selectedCategory}
              </button>
            </div>
          </div>

          {/* Categorias mobile — scroll horizontal */}
          {showCategories && (
            <div className="lg:hidden mt-3 -mx-6 px-6 pb-1 overflow-x-auto">
              <div className="flex gap-2 min-w-max">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category);
                      setShowCategories(false);
                    }}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm transition-colors ${
                      selectedCategory === category
                        ? 'bg-gray-900 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 active:bg-gray-100'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Conteúdo principal */}
      <section className="py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col lg:flex-row gap-12">

            {/* Sidebar — categorias (só desktop) */}
            <aside className="hidden lg:block lg:w-56 shrink-0">
              <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-4">Categorias</p>
              <div className="space-y-1">
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`w-full text-left px-0 py-1.5 text-sm transition-colors ${
                      selectedCategory === category
                        ? 'text-gray-900 font-semibold'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {selectedCategory === category && (
                      <span className="inline-block w-3 h-px bg-[#0057DE] mr-2 align-middle" />
                    )}
                    {category}
                  </button>
                ))}
              </div>
            </aside>

            {/* Grid de produtos */}
            <div className="flex-1">
              <div className="flex items-baseline justify-between mb-8 border-b border-gray-200 pb-4">
                <p className="text-sm text-gray-500">
                  {filteredProducts.length} {filteredProducts.length === 1 ? 'produto' : 'produtos'}
                  {selectedCategory !== 'Todos os Produtos' && (
                    <span> em <span className="text-gray-900">{selectedCategory}</span></span>
                  )}
                </p>
              </div>

              {filteredProducts.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-10">
                  {filteredProducts.map((product, index) => (
                    <div key={product.id} className="group">
                      {/* Imagem */}
                      <div className="relative h-52 bg-gray-100 overflow-hidden mb-4">
                        <img
                          src={product.image}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                        {!product.inStock && (
                          <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
                            <span className="text-xs font-mono uppercase tracking-wider text-gray-500">Indisponível</span>
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <p className="text-[11px] font-mono uppercase tracking-wider text-gray-400 mb-1.5">
                        {product.category}
                      </p>
                      <h3 className="text-gray-900 font-semibold mb-2 leading-snug">
                        {product.name}
                      </h3>
                      <p className="text-sm text-gray-500 leading-relaxed mb-3 line-clamp-2">
                        {product.description}
                      </p>

                      {/* Specs resumidas */}
                      <div className="space-y-1 mb-4">
                        {product.specifications.slice(0, 2).map((spec, i) => (
                          <div key={i} className="flex justify-between text-xs border-b border-gray-100 pb-1">
                            <span className="text-gray-400">{spec.label}</span>
                            <span className="text-gray-700 font-mono">{spec.value}</span>
                          </div>
                        ))}
                      </div>

                      {/* Preço e ação */}
                      <div className="flex items-end justify-between">
                        <div>
                          <span className="text-xs text-gray-400 font-mono">{product.id}</span>
                          <div className="text-gray-900 font-semibold">
                            R$ {product.price.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </div>
                        </div>
                        {product.inStock && (
                          <a
                            href={`https://wa.me/551122071986?text=Olá, tenho interesse no produto ${product.id} — ${product.name}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-gray-600 border-b border-gray-400 hover:border-gray-900 hover:text-gray-900 pb-0.5 transition-colors"
                          >
                            Solicitar
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center">
                  <p className="text-gray-400 mb-1">Nenhum produto encontrado.</p>
                  <p className="text-sm text-gray-400">Tente ajustar a busca ou selecione outra categoria.</p>
                </div>
              )}
            </div>
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