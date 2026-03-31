export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  image: string;
  description: string;
  specifications: {
    label: string;
    value: string;
  }[];
  inStock: boolean;
  featured: boolean;
  brand: string;
}

export const categories = [
  'Todos os Produtos',
  'Válvulas de Controle',
  'Medidores de Vazão',
  'Sensores e Transmissores',
  'Controladores',
  'Analisadores de Gases',
  'Sistemas de Automação',
  'Atuadores',
  'Manômetros'
];

export const products: Product[] = [
  // Válvulas de Controle
  {
    id: 'VLV-001',
    name: 'Válvula de Controle Pneumática 2"',
    category: 'Válvulas de Controle',
    price: 4850.00,
    image: '/images/pages/2.1.png',
    description: 'Válvula de controle pneumática para regulagem precisa de fluxo em processos industriais',
    specifications: [
      { label: 'Tamanho', value: '2 polegadas' },
      { label: 'Pressão Máxima', value: '16 bar' },
      { label: 'Temperatura', value: '-10°C a 200°C' },
      { label: 'Material', value: 'Aço Inox 316' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },
  {
    id: 'VLV-002',
    name: 'Válvula Borboleta Motorizada 4"',
    category: 'Válvulas de Controle',
    price: 6200.00,
    image: '/images/pages/2.2.png',
    description: 'Válvula borboleta com atuador elétrico para controle automatizado',
    specifications: [
      { label: 'Tamanho', value: '4 polegadas' },
      { label: 'Pressão Máxima', value: '10 bar' },
      { label: 'Voltagem', value: '220V' },
      { label: 'Material', value: 'Ferro Fundido' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'VLV-003',
    name: 'Válvula Solenoide 1/2"',
    category: 'Válvulas de Controle',
    price: 890.00,
    image: '/images/pages/2.3.png',
    description: 'Válvula solenoide compacta para controle on/off rápido',
    specifications: [
      { label: 'Tamanho', value: '1/2 polegada' },
      { label: 'Pressão Máxima', value: '8 bar' },
      { label: 'Voltagem', value: '12V DC' },
      { label: 'Tipo', value: 'Normalmente Fechada' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },

  // Medidores de Vazão
  {
    id: 'MED-001',
    name: 'Medidor de Vazão Eletromagnético',
    category: 'Medidores de Vazão',
    price: 8500.00,
    image: '/images/pages/2.4.png',
    description: 'Medidor de vazão de alta precisão para líquidos condutivos',
    specifications: [
      { label: 'Faixa de Medição', value: '0-100 m³/h' },
      { label: 'Precisão', value: '±0.5%' },
      { label: 'Diâmetro', value: '50mm' },
      { label: 'Saída', value: '4-20mA + HART' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },
  {
    id: 'MED-002',
    name: 'Medidor Tipo Turbina',
    category: 'Medidores de Vazão',
    price: 3200.00,
    image: '/images/pages/2.5.png',
    description: 'Medidor de vazão tipo turbina para líquidos limpos',
    specifications: [
      { label: 'Faixa de Medição', value: '1-50 m³/h' },
      { label: 'Precisão', value: '±1%' },
      { label: 'Conexão', value: 'Rosca NPT 1"' },
      { label: 'Material', value: 'Aço Inox 304' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'MED-003',
    name: 'Medidor Ultrassônico Clamp-On',
    category: 'Medidores de Vazão',
    price: 12500.00,
    image: '/images/pages/2.6.png',
    description: 'Medidor ultrassônico não invasivo de última geração',
    specifications: [
      { label: 'Tipo', value: 'Clamp-On' },
      { label: 'Precisão', value: '±1%' },
      { label: 'Faixa de Diâmetro', value: '15mm a 6000mm' },
      { label: 'Display', value: 'LCD Touch Screen' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },

  // Sensores e Transmissores
  {
    id: 'SEN-001',
    name: 'Transmissor de Pressão',
    category: 'Sensores e Transmissores',
    price: 1850.00,
    image: '/images/pages/2.7.png',
    description: 'Transmissor de pressão com alta estabilidade e precisão',
    specifications: [
      { label: 'Faixa', value: '0-10 bar' },
      { label: 'Saída', value: '4-20mA' },
      { label: 'Precisão', value: '±0.25%' },
      { label: 'Conexão', value: '1/2" NPT' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'SEN-002',
    name: 'Sensor de Temperatura PT100',
    category: 'Sensores e Transmissores',
    price: 680.00,
    image: '/images/pages/2.8.png',
    description: 'Sensor PT100 para medição precisa de temperatura',
    specifications: [
      { label: 'Faixa', value: '-50°C a 400°C' },
      { label: 'Tipo', value: 'PT100 Classe A' },
      { label: 'Comprimento', value: '150mm' },
      { label: 'Conexão', value: '1/2" NPT' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'SEN-003',
    name: 'Transmissor de Nível Ultrassônico',
    category: 'Sensores e Transmissores',
    price: 3400.00,
    image: '/images/pages/2.9.png',
    description: 'Transmissor de nível sem contato por ultrassom',
    specifications: [
      { label: 'Alcance', value: '0-10 metros' },
      { label: 'Saída', value: '4-20mA + HART' },
      { label: 'Precisão', value: '±0.25%' },
      { label: 'Proteção', value: 'IP67' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },

  // Controladores
  {
    id: 'CTR-001',
    name: 'Controlador PID Digital',
    category: 'Controladores',
    price: 2100.00,
    image: '/images/pages/2.10.png',
    description: 'Controlador PID com display digital e múltiplas entradas',
    specifications: [
      { label: 'Entradas', value: '4 analógicas' },
      { label: 'Saídas', value: '2 analógicas + 4 digitais' },
      { label: 'Display', value: 'LCD retroiluminado' },
      { label: 'Comunicação', value: 'RS485 Modbus' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'CTR-002',
    name: 'CLP Compacto 32 I/O',
    category: 'Controladores',
    price: 5800.00,
    image: '/images/pages/2.11.png',
    description: 'Controlador lógico programável compacto para automação industrial',
    specifications: [
      { label: 'Entradas Digitais', value: '16' },
      { label: 'Saídas Digitais', value: '16' },
      { label: 'Memória', value: '128KB' },
      { label: 'Comunicação', value: 'Ethernet + RS485' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },

  // Analisadores de Gases
  {
    id: 'ANA-001',
    name: 'Analisador de Oxigênio Portátil',
    category: 'Analisadores de Gases',
    price: 7200.00,
    image: '/images/pages/2.12.png',
    description: 'Analisador portátil para medição de O2 com alta precisão',
    specifications: [
      { label: 'Faixa', value: '0-25% O2' },
      { label: 'Precisão', value: '±0.1%' },
      { label: 'Display', value: 'LCD Gráfico' },
      { label: 'Bateria', value: '8 horas de autonomia' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },
  {
    id: 'ANA-002',
    name: 'Detector Multigás 4 Gases',
    category: 'Analisadores de Gases',
    price: 9500.00,
    image: '/images/pages/2.13.png',
    description: 'Detector portátil para LEL, O2, H2S e CO',
    specifications: [
      { label: 'Gases', value: 'LEL, O2, H2S, CO' },
      { label: 'Alarmes', value: 'Visual, Sonoro e Vibratório' },
      { label: 'Bateria', value: '12 horas' },
      { label: 'Certificação', value: 'ATEX e IECEx' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },

  // Sistemas de Automação
  {
    id: 'AUT-001',
    name: 'Sistema SCADA Completo',
    category: 'Sistemas de Automação',
    price: 18500.00,
    image: '/images/pages/2.14.png',
    description: 'Sistema de supervisão e controle para plantas industriais',
    specifications: [
      { label: 'Licenças', value: '1000 Tags' },
      { label: 'Protocolos', value: 'Modbus, OPC, BACnet' },
      { label: 'Relatórios', value: 'Customizáveis' },
      { label: 'Servidores', value: 'Redundância Hot-Standby' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  },

  // Atuadores
  {
    id: 'ATU-001',
    name: 'Atuador Pneumático Rotativo',
    category: 'Atuadores',
    price: 1650.00,
    image: '/images/pages/2.15.png',
    description: 'Atuador pneumático para válvulas de 1/4 de volta',
    specifications: [
      { label: 'Torque', value: '150 Nm' },
      { label: 'Pressão', value: '4-7 bar' },
      { label: 'Ação', value: 'Dupla Ação' },
      { label: 'Montagem', value: 'ISO 5211' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'ATU-002',
    name: 'Atuador Elétrico Linear',
    category: 'Atuadores',
    price: 4200.00,
    image: '/images/pages/2.16.png',
    description: 'Atuador elétrico para válvulas lineares',
    specifications: [
      { label: 'Força', value: '5000 N' },
      { label: 'Curso', value: '100mm' },
      { label: 'Voltagem', value: '220V' },
      { label: 'Posicionador', value: '4-20mA integrado' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },

  // Manômetros
  {
    id: 'MAN-001',
    name: 'Manômetro Digital',
    category: 'Manômetros',
    price: 520.00,
    image: '/images/pages/2.1.png',
    description: 'Manômetro digital de alta precisão com display LCD',
    specifications: [
      { label: 'Faixa', value: '0-16 bar' },
      { label: 'Precisão', value: '±0.5%' },
      { label: 'Display', value: 'LCD 4 dígitos' },
      { label: 'Conexão', value: '1/4" NPT' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'MAN-002',
    name: 'Manômetro Diferencial',
    category: 'Manômetros',
    price: 780.00,
    image: '/images/pages/2.2.png',
    description: 'Manômetro para medição de pressão diferencial',
    specifications: [
      { label: 'Faixa', value: '0-2 bar' },
      { label: 'Classe', value: '1.6' },
      { label: 'Diâmetro', value: '100mm' },
      { label: 'Material', value: 'Aço Inox' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },

  // Produtos Adicionais
  {
    id: 'VLV-004',
    name: 'Válvula de Segurança PSV',
    category: 'Válvulas de Controle',
    price: 2850.00,
    image: '/images/pages/2.3.png',
    description: 'Válvula de segurança para proteção de sobrepressão',
    specifications: [
      { label: 'Set Point', value: '10 bar' },
      { label: 'Tamanho', value: '1" x 1.5"' },
      { label: 'Material', value: 'Aço Carbono' },
      { label: 'Certificação', value: 'ASME' }
    ],
    inStock: true,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'SEN-004',
    name: 'Sensor de Condutividade',
    category: 'Sensores e Transmissores',
    price: 2300.00,
    image: '/images/pages/2.4.png',
    description: 'Sensor de condutividade para controle de qualidade de água',
    specifications: [
      { label: 'Faixa', value: '0-2000 µS/cm' },
      { label: 'Saída', value: '4-20mA' },
      { label: 'Temperatura', value: '0-80°C' },
      { label: 'Material', value: 'Titânio' }
    ],
    inStock: false,
    featured: false,
    brand: 'Gaiatec'
  },
  {
    id: 'MED-004',
    name: 'Medidor de Vazão Mássico Coriolis',
    category: 'Medidores de Vazão',
    price: 22500.00,
    image: '/images/pages/2.5.png',
    description: 'Medidor de vazão mássico de altíssima precisão',
    specifications: [
      { label: 'Faixa', value: '0-50 t/h' },
      { label: 'Precisão', value: '±0.1%' },
      { label: 'Medições', value: 'Vazão, Densidade, Temperatura' },
      { label: 'Comunicação', value: 'HART + Modbus' }
    ],
    inStock: true,
    featured: true,
    brand: 'Gaiatec'
  }
];
