// ============================================================
// GAIATEC SISTEMAS — Content data (EPSA structure)
// ============================================================

export const navLinks = [
  {
    label: 'Produtos',
    href: '#produtos',
    children: [
      { label: 'Medidores de Vazao', href: '#' },
      { label: 'Transmissores de Pressao', href: '#' },
      { label: 'Medidores de Nivel', href: '#' },
      { label: 'Analisadores de Processo', href: '#' },
      { label: 'Valvulas de Controle', href: '#' },
      { label: 'Paineis e CLPs', href: '#' },
    ],
  },
  {
    label: 'Solucoes',
    href: '#solucoes',
    children: [
      { label: 'Projetos de Automacao', href: '#' },
      { label: 'Comissionamento', href: '#' },
      { label: 'Assistencia Tecnica', href: '#' },
      { label: 'Calibracao', href: '#' },
    ],
  },
  {
    label: 'Setores',
    href: '#setores',
    children: [
      { label: 'Saneamento', href: '#' },
      { label: 'Gas & Petroleo', href: '#' },
      { label: 'Bioenergia', href: '#' },
      { label: 'Papel & Celulose', href: '#' },
      { label: 'Mineracao', href: '#' },
      { label: 'Alimentos & Bebidas', href: '#' },
    ],
  },
  {
    label: 'Recursos',
    href: '#noticias',
  },
  {
    label: 'Sobre',
    href: '#sobre',
  },
];

export const introServices = [
  { title: 'Venda', description: 'Equipamentos novos das melhores marcas mundiais com garantia e suporte.', href: '#produtos' },
  { title: 'Locacao', description: 'Instrumentos em locacao para projetos temporarios e paradas programadas.', href: '#' },
  { title: 'Servicos', description: 'Manutencao, calibracao e comissionamento com equipe tecnica propria.', href: '#solucoes' },
  { title: 'Suporte', description: 'Assistencia tecnica especializada e pecas de reposicao originais.', href: '#contato' },
];

export const products = [
  {
    id: 1,
    name: 'Medidores de Vazao',
    specs: ['Eletromagneticos', 'Ultrassonicos', 'Coriolis', 'Vortex'],
    image: '/images/products/vazao.jpg',
    cta1: 'Ver Detalhes',
    cta2: 'Solicitar Orcamento',
  },
  {
    id: 2,
    name: 'Transmissores de Pressao',
    specs: ['Diferencial', 'Absoluta', 'Manometrica', 'Areas classificadas'],
    image: '/images/products/pressao.jpg',
    cta1: 'Ver Detalhes',
    cta2: 'Solicitar Orcamento',
  },
  {
    id: 3,
    name: 'Analisadores de Processo',
    specs: ['pH / ORP', 'Condutividade', 'Turbidez', 'Oxigenio dissolvido'],
    image: '/images/products/analisadores.jpg',
    cta1: 'Ver Detalhes',
    cta2: 'Solicitar Orcamento',
  },
];

export const sectors = [
  {
    id: 1,
    name: 'Saneamento',
    description: 'Tratamento de agua e esgoto com instrumentacao de alta confiabilidade e rastreabilidade metrologica.',
    bgImage: '/images/sectors/saneamento.jpg',
  },
  {
    id: 2,
    name: 'Gas & Petroleo',
    description: 'Solucoes para medicao e controle em ambientes explosivos com certificacao ATEX/IECEx.',
    bgImage: '/images/sectors/gas.jpg',
  },
  {
    id: 3,
    name: 'Bioenergia',
    description: 'Usinas de etanol e biodiesel com automacao de processos completa e integracao SCADA.',
    bgImage: '/images/sectors/bioenergia.jpg',
  },
  {
    id: 4,
    name: 'Papel & Celulose',
    description: 'Controle de processo para fabricas de celulose e papel com instrumentacao robusta.',
    bgImage: '/images/sectors/papel.jpg',
  },
  {
    id: 5,
    name: 'Mineracao',
    description: 'Instrumentacao robusta para ambientes severos de mineracao e beneficiamento mineral.',
    bgImage: '/images/sectors/mineracao.jpg',
  },
  {
    id: 6,
    name: 'Alimentos & Bebidas',
    description: 'Instrumentacao higienica certificada 3A e EHEDG para industria alimenticia.',
    bgImage: '/images/sectors/alimentos.jpg',
  },
];

export const solutions = [
  {
    id: 1,
    title: 'Projetos de Automacao',
    description: 'Engenharia de automacao do conceito a implementacao, incluindo FEED, detalhamento e comissionamento.',
    image: '/images/solutions/automacao.jpg',
    href: '#',
  },
  {
    id: 2,
    title: 'Calibracao e Metrologia',
    description: 'Laboratorio proprio com rastreabilidade RBC/Inmetro para instrumentos de processo industrial.',
    image: '/images/solutions/calibracao.jpg',
    href: '#',
  },
  {
    id: 3,
    title: 'Integracao SCADA',
    description: 'Desenvolvimento e implantacao de sistemas supervisorios integrados com instrumentacao de campo.',
    image: '/images/solutions/scada.jpg',
    href: '#',
  },
];

export const featureSlides = [
  {
    id: 1,
    label: 'Instrumentacao',
    title: 'Equipamentos de Classe Mundial',
    description: 'Representamos oficialmente as maiores marcas mundiais em instrumentacao industrial. Garantia, suporte e pecas originais.',
    cta: 'Ver Produtos',
    ctaLink: '#produtos',
    bgImage: '/images/slides/slide1.jpg',
  },
  {
    id: 2,
    label: 'Engenharia',
    title: 'Projetos Turn-Key de Automacao',
    description: 'Do levantamento de requisitos ao comissionamento em campo. Equipe propria de engenheiros especializados.',
    cta: 'Nossas Solucoes',
    ctaLink: '#solucoes',
    bgImage: '/images/slides/slide2.jpg',
  },
  {
    id: 3,
    label: 'Suporte',
    title: 'Assistencia Tecnica de Excelencia',
    description: 'Manutencao preventiva e corretiva, calibracao e pecas de reposicao com agilidade e rastreabilidade.',
    cta: 'Fale Conosco',
    ctaLink: '#contato',
    bgImage: '/images/slides/slide3.jpg',
  },
  {
    id: 4,
    label: 'Experiencia',
    title: '+20 Anos no Mercado Industrial',
    description: 'Mais de 500 projetos entregues nos setores mais exigentes da industria brasileira.',
    cta: 'Sobre Nos',
    ctaLink: '#sobre',
    bgImage: '/images/slides/slide4.jpg',
  },
];

export const partners = [
  'Endress+Hauser',
  'Emerson',
  'Siemens',
  'ABB',
  'Yokogawa',
];

export const newsItems = [
  {
    id: 1,
    title: 'Gaiatec participa da FENASAN 2026',
    excerpt: 'Estaremos presentes com estande completo apresentando as novidades em instrumentacao para saneamento e tratamento de agua.',
    date: '2026-03-10',
    image: '/images/news/fenasan.jpg',
    category: 'Eventos',
    featured: true,
  },
  {
    id: 2,
    title: 'Nova linha de medidores ultrassonicos',
    excerpt: 'Lancamento da serie UTX-3000 com precisao de 0.5% e comunicacao HART/Modbus integrada.',
    date: '2026-02-28',
    image: '/images/news/ultrassonicos.jpg',
    category: 'Produtos',
    featured: false,
  },
  {
    id: 3,
    title: 'Projeto concluido: ETA Ribeirao Preto',
    excerpt: 'Entrega completa de instrumentacao e automacao para a nova estacao de tratamento de agua.',
    date: '2026-02-15',
    image: '/images/news/eta.jpg',
    category: 'Cases',
    featured: false,
  },
  {
    id: 4,
    title: 'Certificacao ISO 9001 renovada',
    excerpt: 'Gaiatec renova certificacao de qualidade para mais um ciclo, reafirmando compromisso com excelencia.',
    date: '2026-01-20',
    image: '/images/news/iso.jpg',
    category: 'Institucional',
    featured: false,
  },
];

export const companyStats = [
  { number: '20+', label: 'Anos de experiencia' },
  { number: '500+', label: 'Projetos entregues' },
  { number: '50+', label: 'Marcas representadas' },
  { number: '1000+', label: 'Clientes atendidos' },
];

export const footerLinks = {
  produtos: [
    { label: 'Medidores de Vazao', href: '#' },
    { label: 'Transmissores', href: '#' },
    { label: 'Analisadores', href: '#' },
    { label: 'Valvulas', href: '#' },
    { label: 'Paineis e CLPs', href: '#' },
  ],
  solucoes: [
    { label: 'Projetos de Automacao', href: '#' },
    { label: 'Comissionamento', href: '#' },
    { label: 'Assistencia Tecnica', href: '#' },
    { label: 'Calibracao', href: '#' },
  ],
  setores: [
    { label: 'Saneamento', href: '#' },
    { label: 'Gas & Petroleo', href: '#' },
    { label: 'Bioenergia', href: '#' },
    { label: 'Papel & Celulose', href: '#' },
    { label: 'Mineracao', href: '#' },
  ],
  empresa: [
    { label: 'Sobre Nos', href: '#sobre' },
    { label: 'Carreiras', href: '#' },
    { label: 'Noticias', href: '#noticias' },
    { label: 'Contato', href: '#contato' },
  ],
  suporte: [
    { label: 'Central de Ajuda', href: '#' },
    { label: 'Documentacao', href: '#' },
    { label: 'Downloads', href: '#' },
    { label: 'Treinamentos', href: '#' },
  ],
};
