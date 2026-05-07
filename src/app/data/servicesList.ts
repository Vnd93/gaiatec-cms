/**
 * Lista oficial dos 16 serviços da Gaiatec Sistemas (TASK 7).
 *
 * IMPORTANTE: Os títulos são APENAS o nome do serviço — sem prefixos
 * descritivos como "Serviços Especializados em..." ou "Soluções Avançadas...".
 *
 * Esta lista é usada em:
 *   - Homepage (seção Serviços em Destaque, primeiros 6 com destaque=true)
 *   - /servicos (lista completa de 16, agrupada por categoria)
 *   - Filtros de setor em ProdutosPage / SetoresPage
 *
 * Ícones: nome de ícone do lucide-react (PascalCase). Componente
 * ServicoCard mapeia automaticamente.
 */

export type ServicoCategoria =
  | "instalacao"
  | "manutencao"
  | "calibracao"
  | "consultoria"
  | "outros";

export interface ServicoListItem {
  slug: string;
  nome: string;
  descricaoCurta: string;
  icone: string; // nome do ícone Lucide (ex: "Wrench")
  categoria: ServicoCategoria;
  setores: string[]; // IDs internos dos setores aplicáveis
  destaque: boolean; // aparece na homepage?
  ordem: number;
}

export const servicesList: ServicoListItem[] = [
  {
    slug: "instalacoes-comissionamentos",
    nome: "Instalações e Comissionamentos de Equipamentos",
    descricaoCurta:
      "Implantação técnica e startup de instrumentação industrial em campo, com testes funcionais e documentação completa.",
    icone: "Wrench",
    categoria: "instalacao",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria", "HVAC"],
    destaque: true,
    ordem: 1,
  },
  {
    slug: "medicoes-em-campo",
    nome: "Medições em Campo",
    descricaoCurta:
      "Levantamentos técnicos de vazão, pressão, nível e gases em operação, com relatórios de engenharia.",
    icone: "Gauge",
    categoria: "instalacao",
    setores: ["Saneamento", "Biogás e Biometano", "Gás e Petróleo", "Indústria"],
    destaque: true,
    ordem: 2,
  },
  {
    slug: "deteccao-vazamento-gas",
    nome: "Detecção de Vazamento de Gás",
    descricaoCurta:
      "Inspeções com equipamentos certificados em redes, ramais e estações para identificar vazamentos com precisão.",
    icone: "Flame",
    categoria: "manutencao",
    setores: ["Gás e Petróleo", "Biogás e Biometano", "Indústria"],
    destaque: false,
    ordem: 3,
  },
  {
    slug: "deteccao-vazamento-agua",
    nome: "Detecção de Vazamento de Água",
    descricaoCurta:
      "Localização de vazamentos em adutoras e redes urbanas com correlação acústica e tecnologia ultrassônica.",
    icone: "Droplet",
    categoria: "manutencao",
    setores: ["Saneamento"],
    destaque: false,
    ordem: 4,
  },
  {
    slug: "calibracao-rbc-laboratorio",
    nome: "Calibração RBC / Rastreável em Laboratório",
    descricaoCurta:
      "Laboratório acreditado RBC e homologado pelo INMETRO para calibração de medidores com rastreabilidade internacional.",
    icone: "Award",
    categoria: "calibracao",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria"],
    destaque: true,
    ordem: 5,
  },
  {
    slug: "calibracao-rastreavel-campo",
    nome: "Calibração Rastreável em Campo",
    descricaoCurta:
      "Calibrações in-loco em medidores instalados, sem necessidade de retirada e parada de processo.",
    icone: "MapPin",
    categoria: "calibracao",
    setores: ["Saneamento", "Indústria"],
    destaque: false,
    ordem: 6,
  },
  {
    slug: "manutencoes",
    nome: "Manutenções",
    descricaoCurta:
      "Manutenções preventivas e corretivas em instrumentação, automação e proteção catódica.",
    icone: "Settings",
    categoria: "manutencao",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria", "HVAC"],
    destaque: true,
    ordem: 7,
  },
  {
    slug: "testes",
    nome: "Testes",
    descricaoCurta:
      "Testes funcionais (FAT/SAT), de hermeticidade e estanqueidade conforme normas técnicas aplicáveis.",
    icone: "CheckCircle2",
    categoria: "instalacao",
    setores: ["Gás e Petróleo", "Indústria"],
    destaque: false,
    ordem: 8,
  },
  {
    slug: "automacoes",
    nome: "Automações",
    descricaoCurta:
      "Projetos de automação ponta-a-ponta com CLPs, SCADA e integração de instrumentação de campo.",
    icone: "Cpu",
    categoria: "instalacao",
    setores: ["Saneamento", "Indústria", "HVAC", "Biogás e Biometano"],
    destaque: true,
    ordem: 9,
  },
  {
    slug: "controle-monitoramento",
    nome: "Controle e Monitoramento",
    descricaoCurta:
      "Sistemas de supervisão, telemetria e gestão de ativos remotos em tempo real, 24/7.",
    icone: "Monitor",
    categoria: "instalacao",
    setores: ["Telemetria", "Saneamento", "Biogás e Biometano"],
    destaque: false,
    ordem: 10,
  },
  {
    slug: "locacao-comodato",
    nome: "Locação e Comodato de Equipamentos",
    descricaoCurta:
      "Equipamentos de medição e detecção em regime de locação ou comodato com suporte técnico incluso.",
    icone: "Package",
    categoria: "outros",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria"],
    destaque: false,
    ordem: 11,
  },
  {
    slug: "plataforma-controle",
    nome: "Plataforma de Controle",
    descricaoCurta:
      "Plataforma web/mobile de monitoramento integrado de toda a malha de instrumentação Gaiatec.",
    icone: "LayoutDashboard",
    categoria: "outros",
    setores: ["Telemetria", "Saneamento", "Biogás e Biometano"],
    destaque: false,
    ordem: 12,
  },
  {
    slug: "protecao-catodica",
    nome: "Proteção Catódica",
    descricaoCurta:
      "Projeto, implantação e monitoramento de sistemas eletroquímicos para prevenção da corrosão em dutos.",
    icone: "Shield",
    categoria: "instalacao",
    setores: ["Gás e Petróleo", "Proteção Catódica"],
    destaque: true,
    ordem: 13,
  },
  {
    slug: "inspecao-revestimentos",
    nome: "Inspeção de Revestimentos",
    descricaoCurta:
      "Diagnóstico da integridade do revestimento de dutos com varredura técnica e relatórios normativos.",
    icone: "ScanLine",
    categoria: "manutencao",
    setores: ["Gás e Petróleo", "Proteção Catódica"],
    destaque: false,
    ordem: 14,
  },
  {
    slug: "projetos",
    nome: "Projetos",
    descricaoCurta:
      "Projetos completos de instrumentação, automação e controle para novas instalações ou retrofit.",
    icone: "Blocks",
    categoria: "consultoria",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria", "Biogás e Biometano"],
    destaque: false,
    ordem: 15,
  },
  {
    slug: "consultoria-inspecoes-tecnicas",
    nome: "Consultoria e Inspeções Técnicas",
    descricaoCurta:
      "Consultoria especializada e inspeções técnicas para conformidade normativa e otimização operacional.",
    icone: "Lightbulb",
    categoria: "consultoria",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria"],
    destaque: false,
    ordem: 16,
  },
];

/** Retorna apenas os serviços marcados como destaque (homepage). */
export const featuredServices = servicesList.filter((s) => s.destaque);

/** Retorna os serviços de uma categoria específica. */
export const servicesByCategory = (categoria: ServicoCategoria) =>
  servicesList.filter((s) => s.categoria === categoria);

/** Categorias com label em pt-BR. */
export const categoriaLabels: Record<ServicoCategoria, string> = {
  instalacao: "Instalação",
  manutencao: "Manutenção",
  calibracao: "Calibração",
  consultoria: "Consultoria",
  outros: "Outros",
};
