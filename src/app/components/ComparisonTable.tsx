import React from 'react';

export interface ComparisonRow {
  criterion: string;
  withoutSolution: string;
  withSolution: string;
  note?: string;
}

interface ComparisonTableProps {
  title: string;
  subtitle?: string;
  columnHeaders: {
    criterion: string;
    withoutSolution: string;
    withSolution: string;
  };
  rows: ComparisonRow[];
  className?: string;
}

export const ComparisonTable: React.FC<ComparisonTableProps> = ({
  title,
  subtitle,
  columnHeaders,
  rows,
  className = ''
}) => {
  return (
    <section className={`py-20 bg-white ${className}`}>
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-12">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              {title}
            </h2>
            {subtitle && (
              <p className="text-lg text-gray-600">
                {subtitle}
              </p>
            )}
          </div>

          {/* Desktop: Tabela */}
          <div className="hidden lg:block">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              {/* Cabeçalho da tabela */}
              <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200">
                <div className="px-6 py-4 font-bold text-gray-900 text-sm uppercase tracking-wider">
                  {columnHeaders.criterion}
                </div>
                <div className="px-6 py-4 font-bold text-gray-900 text-sm uppercase tracking-wider border-l border-gray-200">
                  {columnHeaders.withoutSolution}
                </div>
                <div className="px-6 py-4 font-bold text-gray-900 text-sm uppercase tracking-wider border-l border-gray-200">
                  {columnHeaders.withSolution}
                </div>
              </div>

              {/* Linhas da tabela */}
              <div className="bg-white">
                {rows.map((row, index) => (
                  <div 
                    key={index}
                    className={`grid grid-cols-3 ${index !== rows.length - 1 ? 'border-b border-gray-200' : ''}`}
                  >
                    {/* Critério */}
                    <div className="px-6 py-5 font-semibold text-gray-900">
                      {row.criterion}
                      {row.note && (
                        <div className="mt-1 text-xs text-gray-500 font-normal italic">
                          {row.note}
                        </div>
                      )}
                    </div>

                    {/* Sem solução */}
                    <div className="px-6 py-5 border-l border-gray-200 bg-gray-50">
                      <div className="flex items-start gap-2">
                        <span className="text-red-500 text-sm mt-0.5 flex-shrink-0">▲</span>
                        <span className="text-gray-700 text-sm leading-relaxed">
                          {row.withoutSolution}
                        </span>
                      </div>
                    </div>

                    {/* Com solução */}
                    <div className="px-6 py-5 border-l border-gray-200">
                      <div className="flex items-start gap-2">
                        <span className="text-green-600 text-sm mt-0.5 flex-shrink-0">▼</span>
                        <span className="text-gray-700 text-sm leading-relaxed">
                          {row.withSolution}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Mobile: Cards empilhados */}
          <div className="lg:hidden space-y-6">
            {rows.map((row, index) => (
              <div 
                key={index}
                className="border border-gray-200 rounded-lg overflow-hidden bg-white"
              >
                {/* Critério */}
                <div className="bg-gray-50 px-5 py-4 border-b border-gray-200">
                  <h3 className="font-bold text-gray-900">{row.criterion}</h3>
                  {row.note && (
                    <p className="mt-1 text-xs text-gray-500 italic">{row.note}</p>
                  )}
                </div>

                {/* Comparação */}
                <div className="p-5 space-y-4">
                  {/* Sem solução */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      {columnHeaders.withoutSolution}
                    </div>
                    <div className="bg-gray-50 p-3 rounded">
                      <span className="text-gray-700 text-sm leading-relaxed">
                        {row.withoutSolution}
                      </span>
                    </div>
                  </div>

                  {/* Com solução */}
                  <div>
                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                      {columnHeaders.withSolution}
                    </div>
                    <div className="bg-white p-3 rounded border border-gray-200">
                      <span className="text-gray-700 text-sm leading-relaxed">
                        {row.withSolution}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};