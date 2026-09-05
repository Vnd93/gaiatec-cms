import React, { useState, useEffect } from 'react';

export interface SimulatorConfig {
  title: string;
  subtitle?: string;
  economyTypes?: Array<{
    value: string;
    label: string;
    unit: string;
    suggestedCost?: number;
  }>;
  defaultType?: string;
  showImplementationCost?: boolean;
  technicalNote?: string;
}

interface EconomicSimulatorProps {
  config: SimulatorConfig;
  className?: string;
}

export const EconomicSimulator: React.FC<EconomicSimulatorProps> = ({
  config,
  className = ''
}) => {
  const [economyType, setEconomyType] = useState(config.defaultType || config.economyTypes?.[0]?.value || 'energy');
  const [currentConsumption, setCurrentConsumption] = useState<number>(0);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [reductionPercent, setReductionPercent] = useState<number>(30);
  const [implementationCost, setImplementationCost] = useState<number>(0);

  const selectedType = config.economyTypes?.find(t => t.value === economyType);
  const unit = selectedType?.unit || 'kWh';

  // Atualizar custo sugerido quando mudar o tipo
  useEffect(() => {
    if (selectedType?.suggestedCost) {
      setUnitCost(selectedType.suggestedCost);
    }
  }, [economyType, selectedType]);

  // Cálculos
  const currentMonthlyCost = currentConsumption * unitCost;
  const reduction = currentMonthlyCost * (reductionPercent / 100);
  const newMonthlyCost = currentMonthlyCost - reduction;
  const annualSavings = reduction * 12;
  const payback = implementationCost > 0 && reduction > 0 
    ? Math.ceil(implementationCost / reduction) 
    : 0;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  return (
    <section className={`py-20 bg-gray-50 ${className}`}>
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
              {config.title}
            </h2>
            {config.subtitle && (
              <p className="text-base text-gray-600 max-w-3xl mx-auto">
                {config.subtitle}
              </p>
            )}
          </div>

          {/* Simulador */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200">
            <div className="grid lg:grid-cols-2 gap-0">
              {/* Coluna A - Inputs */}
              <div className="p-8 lg:border-r border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-6">
                  Parâmetros
                </h3>

                <div className="space-y-6">
                  {/* Tipo de economia (se houver múltiplos) */}
                  {config.economyTypes && config.economyTypes.length > 1 && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Tipo de economia
                      </label>
                      <select
                        value={economyType}
                        onChange={(e) => setEconomyType(e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-900"
                      >
                        {config.economyTypes.map((type) => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Consumo atual */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Consumo atual mensal ({unit})
                    </label>
                    <input
                      type="number"
                      value={currentConsumption || ''}
                      onChange={(e) => setCurrentConsumption(parseFloat(e.target.value) || 0)}
                      placeholder="Ex: 10000"
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>

                  {/* Custo unitário */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Custo por {unit} (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={unitCost || ''}
                      onChange={(e) => setUnitCost(parseFloat(e.target.value) || 0)}
                      placeholder={selectedType?.suggestedCost ? `Sugestão: ${selectedType.suggestedCost}` : "Ex: 0.65"}
                      className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                  </div>

                  {/* Percentual de redução */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      Redução estimada: {reductionPercent}%
                    </label>
                    <input
                      type="range"
                      min="10"
                      max="60"
                      step="5"
                      value={reductionPercent}
                      onChange={(e) => setReductionPercent(parseInt(e.target.value))}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-600 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:hover:bg-blue-700 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-blue-600 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:hover:bg-blue-700"
                      style={{
                        background: `linear-gradient(to right, #2563eb 0%, #2563eb ${((reductionPercent - 10) / 50) * 100}%, #e5e7eb ${((reductionPercent - 10) / 50) * 100}%, #e5e7eb 100%)`
                      }}
                    />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>10%</span>
                      <span>60%</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2 italic">
                      Varia conforme cenário e dimensionamento técnico
                    </p>
                  </div>

                  {/* Custo de implantação (opcional) */}
                  {config.showImplementationCost && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        Custo estimado de implantação (R$) - opcional
                      </label>
                      <input
                        type="number"
                        value={implementationCost || ''}
                        onChange={(e) => setImplementationCost(parseFloat(e.target.value) || 0)}
                        placeholder="Ex: 50000"
                        className="w-full px-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Coluna B - Resultados */}
              <div className="p-8 bg-gradient-to-br from-blue-50 to-white">
                <h3 className="text-xl font-bold text-gray-900 mb-6">
                  Resultados estimados
                </h3>

                {currentConsumption > 0 && unitCost > 0 ? (
                  <div className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                          Economia mensal
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(reduction)}
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                          Economia anual
                        </div>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(annualSavings)}
                        </div>
                      </div>

                      <div className="bg-white p-4 rounded-lg border border-gray-200">
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                          Redução
                        </div>
                        <div className="text-2xl font-bold text-blue-600">
                          {reductionPercent}%
                        </div>
                      </div>

                      {config.showImplementationCost && payback > 0 && (
                        <div className="bg-white p-4 rounded-lg border border-gray-200">
                          <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                            Payback
                          </div>
                          <div className="text-2xl font-bold text-[#0046b3]">
                            {payback} {payback === 1 ? 'mês' : 'meses'}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Gráfico */}
                    <div className="bg-white p-6 rounded-lg border border-gray-200">
                      <h4 className="text-sm font-bold text-gray-900 mb-4">
                        Comparativo visual
                      </h4>
                      <div className="space-y-4">
                        {/* Barra 1 - Custo Atual */}
                        <div>
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Custo Atual</span>
                            <span className="font-bold">{formatCurrency(currentMonthlyCost)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                            <div 
                              className="bg-red-500 h-full rounded-full flex items-center justify-end pr-2"
                              style={{ width: '100%' }}
                            >
                              <span className="text-white text-xs font-bold">100%</span>
                            </div>
                          </div>
                        </div>

                        {/* Barra 2 - Após Solução */}
                        <div>
                          <div className="flex justify-between text-xs text-gray-600 mb-1">
                            <span>Após Solução</span>
                            <span className="font-bold">{formatCurrency(newMonthlyCost)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-8 overflow-hidden">
                            <div 
                              className="bg-green-500 h-full rounded-full flex items-center justify-end pr-2"
                              style={{ width: `${((newMonthlyCost / currentMonthlyCost) * 100).toFixed(0)}%` }}
                            >
                              <span className="text-white text-xs font-bold">
                                {((newMonthlyCost / currentMonthlyCost) * 100).toFixed(0)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Legenda de Economia */}
                        <div className="pt-2 border-t border-gray-200">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-gray-600">Economia:</span>
                            <span className="text-lg font-bold text-green-600">{formatCurrency(reduction)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Nota técnica */}
                    <div className="bg-blue-50 border-l-4 border-blue-600 p-4">
                      <p className="text-xs text-gray-700 leading-relaxed">
                        {config.technicalNote || 
                          "Estimativa baseada nos parâmetros informados. Para cálculo técnico completo e dimensionamento preciso, solicite um estudo personalizado."}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-500 text-center">
                      Preencha os parâmetros ao lado para<br />visualizar os resultados
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
