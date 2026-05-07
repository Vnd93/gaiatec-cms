/**
 * Timeline — 11 marcos da história da Gaiatec Sistemas (TASK 19).
 *
 * Renderizado pelo componente <Timeline> em /sobre.
 * Cada marco tem ano, título, ícone (nome do Lucide) e texto.
 */

export interface TimelineEntry {
  ano: number;
  titulo: string;
  icone: string; // nome do componente Lucide (ex: "Building2")
  texto: string;
}

export const timeline: TimelineEntry[] = [
  {
    ano: 2004,
    titulo: "Fundação",
    icone: "Building2",
    texto:
      "Criação da Gaiatec Sistemas, com o propósito de oferecer soluções inovadoras para medição e análise de líquidos e gases, transformando o mercado nacional com tecnologia e expertise.",
  },
  {
    ano: 2006,
    titulo: "Desenvolvimento de Soluções Industriais",
    icone: "Cog",
    texto:
      "Início da busca por tecnologias eficientes e essenciais para otimizar processos industriais em grandes setores estratégicos do país.",
  },
  {
    ano: 2009,
    titulo: "Parcerias Internacionais",
    icone: "Globe",
    texto:
      "Introdução de grandes marcas internacionais no mercado brasileiro, expandindo o portfólio e consolidando relações globais.",
  },
  {
    ano: 2010,
    titulo: "Referência em Instrumentação",
    icone: "Award",
    texto:
      "Reconhecimento como uma das principais empresas do setor de instrumentação de medição no Brasil.",
  },
  {
    ano: 2013,
    titulo: "Presença Nacional",
    icone: "Map",
    texto:
      "Consolidação da atuação em todo o Brasil, com atendimento às principais empresas de saneamento, gás e proteção catódica em todos os estados.",
  },
  {
    ano: 2014,
    titulo: "Combate a Perdas e Proteção Catódica",
    icone: "Shield",
    texto:
      "Execução de grandes projetos de saneamento para combate a perdas e proteção catódica focados em controle de perdas, com impacto direto na eficiência operacional.",
  },
  {
    ano: 2016,
    titulo: "Inovação em Macromedição",
    icone: "Gauge",
    texto:
      "Referência nacional em macromedição ultrassônica, com milhares de equipamentos fornecidos e resultados expressivos para companhias de saneamento.",
  },
  {
    ano: 2018,
    titulo: "Expansão para Biogás",
    icone: "Leaf",
    texto:
      "Atuação como uma das principais empresas no setor de biogás, com soluções completas em análise, controle, monitoramento e geração de energia renovável.",
  },
  {
    ano: 2022,
    titulo: "Telemetria e IoT",
    icone: "Antenna",
    texto:
      "Desenvolvimento e uso nos instrumentos da Gaiatec Sistemas de comunicação com IoT e plataformas de monitoramento remoto. Trazendo benefícios significativos e inovação para clientes e parceiros.",
  },
  {
    ano: 2024,
    titulo: "Mais de 500 Biodigestores Instalados",
    icone: "Sprout",
    texto:
      "Fornecimento de biodigestores de pequeno porte em diversos estados, levando sustentabilidade, energia limpa e benefícios sociais e ambientais.",
  },
  {
    ano: 2025,
    titulo: "Excelência e Inovação Contínua",
    icone: "Star",
    texto:
      "Compromisso em atender com excelência todos os parceiros, desenvolvendo novas soluções para otimizar operações e gerar resultados inteligentes e sustentáveis.",
  },
];
