import {
  servicesList,
  type ServicoCategoria,
  type ServicoListItem,
} from "./servicesList";

export interface Service {
  slug: string;
  title: string;
  overline: string;
  shortDesc: string;
  fullDesc: string;
  image: string;
  includes: string[];
  sectors?: string[];
  norms?: string[];
  extra?: {
    label: string;
    items: string[];
  };
}

/**
 * Detalhe de serviço — fonte canônica unificada nos 16 serviços de
 * servicesList.ts (a "lista oficial"). Cada Service é construído a partir
 * do item canônico (nome, descrição curta, setores) e recebe uma camada
 * opcional de conteúdo rico (`RICH_DETAILS`) quando ela existe.
 *
 * Os ~8 serviços com conteúdo rico exibem hero com imagem, "O Que Inclui",
 * normas e blocos extras. Os demais renderizam um detalhe mais enxuto
 * (hero em gradiente brand + descrição + indústrias atendidas + CTA) —
 * a ServicoPage degrada graciosamente quando fullDesc/includes/image
 * estão vazios.
 *
 * Em produção o detalhe vem primeiro do CMS (useServico); este módulo é o
 * fallback usado quando o CMS está indisponível ou não tem o slug.
 */
type RichDetail = Pick<Service, "overline" | "fullDesc" | "image" | "includes"> &
  Partial<Pick<Service, "norms" | "extra">>;

/** Overline padrão por categoria, usado quando não há overline rico. */
const OVERLINE_BY_CATEGORIA: Record<ServicoCategoria, string> = {
  instalacao: "INSTALAÇÃO",
  manutencao: "MANUTENÇÃO",
  calibracao: "CALIBRAÇÃO",
  consultoria: "CONSULTORIA",
  outros: "SERVIÇO ESPECIALIZADO",
};

/**
 * Conteúdo rico por slug canônico (servicesList). Migrado do conjunto
 * antigo de 9 serviços e re-chaveado para os slugs oficiais. title,
 * shortDesc e sectors NÃO ficam aqui — vêm sempre do item canônico.
 */
const RICH_DETAILS: Record<string, RichDetail> = {
  automacoes: {
    overline: "AUTOMAÇÃO",
    fullDesc:
      "A Gaiatec Sistemas desenvolve projetos de automação industrial de ponta a ponta — desde o levantamento de campo e especificação dos instrumentos até a programação de CLPs, configuração de sistemas SCADA/HMI e comissionamento final. Atuamos em plantas industriais, estações de tratamento, redes de distribuição de gás, sistemas de proteção catódica e muito mais.\n\nNossa equipe combina expertise em instrumentação de campo com conhecimento aprofundado em protocolos de comunicação industrial (HART, MODBUS, PROFIBUS, 4–20 mA), garantindo integração confiável entre todos os pontos da malha de controle.",
    image: "/images/servicos/automacoes/hero.webp",
    includes: [
      "Levantamento e especificação de instrumentação",
      "Programação e configuração de CLPs (Allen-Bradley, Siemens, Schneider, Rockwell)",
      "Desenvolvimento de sistemas SCADA e IHM",
      "Projeto e montagem de painéis de automação",
      "Integração com sistemas ERP e historiadores de dados",
      "Testes funcionais FAT (Factory Acceptance Test) e SAT (Site Acceptance Test)",
      "Documentação técnica completa (P&ID, diagramas elétricos, memórias de cálculo)",
    ],
  },
  "protecao-catodica": {
    overline: "PROTEÇÃO CATÓDICA",
    fullDesc:
      "A corrosão é uma das principais causas de falhas em infraestruturas metálicas. A Gaiatec Sistemas projeta, instala e monitora sistemas de proteção catódica que protegem ativos críticos — dutos de gás e petróleo, redes de distribuição, tanques de armazenamento e estruturas metálicas — contra a degradação corrosiva.\n\nAtuamos tanto com sistemas de corrente impressa (ICCP) quanto com ânodos de sacrifício (galvânicos), selecionando a melhor solução conforme as características do solo, o tipo de estrutura e os requisitos normativos (ABNT NBR 6502, ABNT NBR 12979, entre outras).",
    image: "/images/servicos/protecao-catodica/hero.webp",
    includes: [
      "Levantamento de potencial eletroquímico em campo",
      "Projeto de sistema de proteção catódica",
      "Fornecimento de retificadores, ânodos e eletrodos de referência",
      "Instalação e comissionamento do sistema",
      "Testes de eficiência e ajuste de parâmetros",
      "Monitoramento remoto via telemetria",
      "Relatórios de inspeção e laudos técnicos",
      "Inspeção de revestimento anticorrosivo (PEARSON Survey, DCVG)",
    ],
    norms: ["ABNT NBR 6502", "ABNT NBR 12979", "NACE SP0169", "ISO 15589"],
  },
  "inspecao-revestimentos": {
    overline: "INSPEÇÃO",
    fullDesc:
      "O revestimento anticorrosivo é a primeira linha de defesa contra a corrosão em estruturas enterradas. Quando o revestimento apresenta falhas, a estrutura fica vulnerável à corrosão localizada — o que pode resultar em vazamentos, paradas não planejadas e riscos à segurança.\n\nA Gaiatec Sistemas realiza inspeções de revestimento com metodologias consagradas internacionalmente, identificando defeitos, avaliando a eficiência do sistema de proteção catódica e gerando relatórios técnicos detalhados para subsidiar decisões de manutenção.",
    image: "/images/servicos/inspecao-revestimentos/hero.webp",
    includes: [
      "Mobilização de equipe técnica especializada",
      "Execução das medições em campo",
      "Localização e marcação de defeitos no trajeto",
      "Relatório técnico completo com mapas e classificação dos defeitos",
      "Recomendações de reparo e priorização de intervenções",
    ],
    extra: {
      label: "Técnicas Aplicadas",
      items: [
        "PEARSON Survey — detecção de falhas de revestimento por indução eletromagnética",
        "DCVG (Direct Current Voltage Gradient) — avaliação da severidade de defeitos e classificação por índice de dano",
        "CIPS (Close Interval Potential Survey) — levantamento de potencial eletroquímico ao longo de dutos",
      ],
    },
  },
  "calibracao-rastreavel-laboratorio": {
    overline: "CALIBRAÇÃO RASTREÁVEL",
    fullDesc:
      "A Gaiatec Sistemas realiza calibração de instrumentos com rastreabilidade metrológica ao INMETRO, comprovada ao Sistema Internacional de Unidades (SI). Nossos certificados de calibração demonstram que as medições são rastreáveis aos padrões nacionais, com padrões de referência periodicamente calibrados.\n\nA calibração rastreável é exigida por sistemas de gestão da qualidade (ISO 9001), normas regulatórias e boas práticas de manutenção. Assim, você garante que seus instrumentos estão medindo corretamente — e tem o documento técnico que comprova isso.",
    image: "/images/servicos/calibracao-rastreavel-laboratorio/hero.webp",
    includes: [
      "Calibração de pressão (transmissores, manômetros, pressostatos)",
      "Calibração de temperatura (termopares, PT100, transmissores)",
      "Calibração de vazão (medidores ultrassônicos, eletromagnéticos, diferenciais)",
      "Calibração de nível (transmissores de pressão hidrostática)",
      "Calibração de instrumentos elétricos (multímetros, pinças amperimétricas)",
      "Calibração de instrumentos de análise de qualidade da água",
    ],
    extra: {
      label: "Modalidades",
      items: [
        "No laboratório — instrumento enviado à nossa sede",
        "No campo (in situ) — calibração realizada na planta do cliente com padrão portátil rastreado",
        "Calibração periódica — contratos de manutenção com agenda programada",
      ],
    },
  },
  manutencoes: {
    overline: "MANUTENÇÃO",
    fullDesc:
      "A parada não planejada de um instrumento ou sistema de controle pode comprometer a produção, a segurança e a conformidade regulatória de uma planta industrial. A Gaiatec Sistemas oferece contratos de manutenção industrial com atendimento técnico qualificado, tempo de resposta definido por SLA e planos preventivos baseados nas recomendações do fabricante e nas melhores práticas da norma NBR 5462.\n\nNossa equipe realiza tanto manutenção preventiva (inspeções programadas, ajustes, limpeza, verificações) quanto manutenção corretiva (diagnóstico e reparo de falhas) em instrumentos de campo, painéis de controle e sistemas de automação.",
    image: "/images/servicos/manutencoes/hero.webp",
    includes: [
      "Inspeções periódicas programadas",
      "Verificação e ajuste de instrumentos de campo",
      "Limpeza e conservação de painéis de automação",
      "Diagnóstico e correção de falhas operacionais",
      "Substituição de peças e componentes (com fornecimento)",
      "Atualização de firmware e configurações de instrumentos",
      "Relatório técnico de cada visita",
      "Controle de inventário de sobressalentes críticos",
    ],
    extra: {
      label: "Planos Disponíveis",
      items: [
        "Manutenção preventiva com visitas mensais/trimestrais/semestrais",
        "Manutenção corretiva com SLA de atendimento",
        "Contrato completo (preventiva + corretiva)",
        "Atendimento emergencial 24/7 (sob contrato)",
      ],
    },
  },
  "instalacoes-comissionamentos": {
    overline: "INSTALAÇÃO",
    fullDesc:
      "Uma instalação bem executada é condição fundamental para que um instrumento opere dentro das especificações do fabricante. A Gaiatec Sistemas realiza a instalação e o comissionamento de instrumentos e sistemas de automação com equipe técnica treinada pelos fabricantes e profundo conhecimento das normas aplicáveis.\n\nO processo de comissionamento inclui verificação de instalação mecânica e elétrica, configuração do instrumento, testes de loop, verificação de comunicação e geração de toda a documentação técnica necessária para operação e manutenção futura.",
    image: "/images/servicos/instalacoes-comissionamentos/hero.webp",
    includes: [
      "Recebimento e inspeção dos equipamentos (pre-commissioning check)",
      "Instalação mecânica conforme normas e recomendações do fabricante",
      "Instalação elétrica e de campo (cabeamento, aterramento, blindagem)",
      "Configuração paramétrica do instrumento (HART, display, faixas, alarmes)",
      "Loop check com simulação de processo",
      "Teste funcional integrado com o sistema de controle",
      "Treinamento operacional para equipe do cliente",
      "Entrega de documentação técnica (relatório de comissionamento, as-built)",
    ],
    norms: ["IEC 60079", "ABNT NBR 5410", "ISA 5.1", "ISA 20.00.01"],
  },
  "consultoria-inspecoes-tecnicas": {
    overline: "CONSULTORIA",
    fullDesc:
      "Quando o desafio é complexo e exige conhecimento especializado, a Gaiatec Sistemas oferece consultoria técnica independente para apoiar engenheiros, gestores e equipes de projetos nas melhores decisões sobre instrumentação, automação e metrologia industrial.\n\nCom mais de 20 anos de experiência e presença em múltiplos setores — saneamento, gás, petróleo, indústria, proteção catódica, biogás — nossa equipe traz visão prática e técnica para diagnosticar problemas, especificar soluções e orientar projetos com segurança.",
    image: "/images/servicos/consultoria-inspecoes-tecnicas/hero.webp",
    includes: [
      "Especificação técnica de instrumentação para projetos",
      "Análise de falhas em sistemas de medição e controle",
      "Auditoria metrológica e conformidade regulatória",
      "Revisão de P&IDs e listas de instrumentos",
      "Seleção tecnológica (comparativo entre soluções)",
      "Apoio em licitações e editais técnicos",
      "Pareceres técnicos e laudos para fins legais",
      "Treinamento técnico in company",
    ],
    extra: {
      label: "Formato",
      items: [
        "Consultoria pontual (por hora ou por projeto)",
        "Acompanhamento de projeto (retainer mensal)",
        "Visita técnica diagnóstica",
        "Relatório escrito / parecer técnico formal",
      ],
    },
  },
  "medicoes-em-campo": {
    overline: "MEDIÇÕES",
    fullDesc:
      "Algumas aplicações exigem medições temporárias de alta precisão — para caracterização de processo, verificação de medidores instalados, laudos periciais, testes de eficiência ou conformidade regulatória. A Gaiatec Sistemas realiza campanhas de medição especializada com equipamentos portáteis calibrados e equipe técnica experiente.",
    image: "/images/servicos/medicoes-em-campo/hero.webp",
    includes: [
      "Medição portátil ultrassônica clamp-on (sem corte de tubulação)",
      "Verificação de medidores instalados (meter verification)",
      "Perfil de velocidade em seções complexas",
      "Medição em canais abertos (calhas Parshall, vertedouros)",
      "Testes de estanqueidade e pressurização",
      "Campanhas de monitoramento de pH, turbidez, OD, condutividade",
      "Medição de composição de biogás (CH₄, CO₂, H₂S, O₂)",
      "Verificação de medidores fiscais",
    ],
    extra: {
      label: "Documentação Entregue",
      items: [
        "Relatório técnico de medição com metodologia, resultados e incerteza",
        "Certificados de calibração dos equipamentos utilizados",
        "Gráficos e séries temporais (quando aplicável)",
        "Conclusões e recomendações técnicas",
      ],
    },
  },
};

/** Constrói o Service de detalhe a partir do item canônico + overlay rico. */
function buildService(item: ServicoListItem): Service {
  const rich = RICH_DETAILS[item.slug];
  return {
    slug: item.slug,
    title: item.nome,
    overline: rich?.overline ?? OVERLINE_BY_CATEGORIA[item.categoria],
    shortDesc: item.descricaoCurta,
    fullDesc: rich?.fullDesc ?? "",
    image: rich?.image ?? "",
    includes: rich?.includes ?? [],
    sectors: item.setores,
    norms: rich?.norms,
    extra: rich?.extra,
  };
}

/** Os 16 serviços canônicos prontos para a página de detalhe. */
export const services: Service[] = servicesList.map(buildService);

export function getServiceBySlug(slug: string): Service | undefined {
  const item = servicesList.find((s) => s.slug === slug);
  return item ? buildService(item) : undefined;
}
