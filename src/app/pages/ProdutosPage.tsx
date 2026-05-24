import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router";
import { GitCompare, Check, ArrowRight } from "lucide-react";
import { AnimateOnScroll } from "../components/useScrollAnimation";
import { CTABanner } from "../components/CTABanner";
import { PageHero } from "../components/PageHero";
import { Carrossel } from "../components/ui/Carrossel";
import { useComparador } from "../components/produtos/ComparadorContext";
import { SEO, buildCollectionPageSchema } from "../components/SEO";

const KNOCKOUT = "'Knockout HTF68', sans-serif";

/* ────────────────────────────────────────────────────────
   DATA — exportado para reuso em /produtos/[slug] (ProdutoPage)
   ──────────────────────────────────────────────────────── */
export type Product = {
  id: number;
  category: string;
  name: string;
  desc: string;
  spec: string;
  image: string;
  sectors: string[];
  measureType: string[];
  details: {
    fullDesc: string;
    specs: { label: string; value: string }[];
    applications: string[];
  };
};

/** Gera slug consistente a partir do id+name para deep-linking. */
export const productSlug = (p: Product) =>
  `${p.id}-${p.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;

/** Busca produto pelo slug gerado por productSlug() */
export const productBySlug = (slug: string): Product | undefined =>
  products.find((p) => productSlug(p) === slug);

export const products: Product[] = [
  {
    id: 1,
    category: "MEDIÇÃO DE VAZÃO",
    name: "Medidor Eletromagnetico Flangeado",
    desc: "Medicao de vazao precisa para liquidos condutivos em tubulacoes industriais.",
    spec: "Faixa: DN15 - DN3000",
    image: "/images/heroes/1.2.webp",
    sectors: ["Saneamento", "Industria"],
    measureType: ["Vazao"],
    details: {
      fullDesc: "Medidor eletromagnetico flangeado para medicao de vazao de liquidos condutivos em tubulacoes industriais. Opera com alta precisao em condicoes adversas, sem partes moveis e sem perda de carga. Ideal para estacoes de tratamento de agua e efluentes, processos quimicos e alimenticios.",
      specs: [
        { label: "Diametro Nominal", value: "DN15 a DN3000" },
        { label: "Precisao", value: "±0.5% do valor medido" },
        { label: "Conexao", value: "Flangeada (ANSI / DIN)" },
        { label: "Protecao", value: "IP67 / IP68" },
        { label: "Alimentacao", value: "24 VDC / 220 VAC" },
        { label: "Saida", value: "4-20 mA / HART / Modbus" },
      ],
      applications: ["Estacoes de tratamento de agua e esgoto", "Processos quimicos e petroquimicos", "Industria alimenticia e de bebidas", "Controle de vazao em circuitos de refrigeracao"],
    },
  },
  {
    id: 2,
    category: "MEDIÇÃO DE VAZÃO",
    name: "Macromedidor Ultrasonico Clamp-On",
    desc: "Solucao portatil e nao intrusiva para medicao de grandes vazoes em tubulacoes.",
    spec: "Faixa: DN50 - DN6000",
    image: "/images/heroes/1.3.webp",
    sectors: ["Saneamento", "Industria"],
    measureType: ["Vazao"],
    details: {
      fullDesc: "Macromedidor ultrasonico clamp-on para medicao nao intrusiva de grandes vazoes. Instalacao externa a tubulacao, sem necessidade de parada do processo ou corte de tubulacao. Ideal para campanhas de medicao, auditorias e monitoramento permanente em redes de distribuicao de agua.",
      specs: [
        { label: "Diametro Nominal", value: "DN50 a DN6000" },
        { label: "Precisao", value: "±1.0% do valor medido" },
        { label: "Instalacao", value: "Clamp-on (externa)" },
        { label: "Tecnologia", value: "Tempo de transito ultrasonico" },
        { label: "Alimentacao", value: "Bateria / 24 VDC" },
        { label: "Saida", value: "4-20 mA / RS485 / Datalogger" },
      ],
      applications: ["Macromedicao em redes de distribuicao de agua", "Auditorias de vazao e perdas", "Monitoramento de adutoras e emissarios", "Campanhas temporarias de medicao"],
    },
  },
  {
    id: 3,
    category: "MEDIÇÃO DE VAZÃO",
    name: "Medidor Ultrasonico Clamp-On para Gas",
    desc: "Medicao nao intrusiva e precisa de vazao de gases em tubulacoes.",
    spec: "Faixa: DN50 - DN3000",
    image: "/images/heroes/1.4.webp",
    sectors: ["Gas e Petroleo", "Industria"],
    measureType: ["Vazao"],
    details: {
      fullDesc: "Medidor ultrasonico clamp-on para medicao de vazao de gases em tubulacoes industriais. Tecnologia nao intrusiva que elimina a necessidade de interrupcao do processo. Aplicavel em gas natural, biogas, ar comprimido e outros gases industriais.",
      specs: [
        { label: "Diametro Nominal", value: "DN50 a DN3000" },
        { label: "Precisao", value: "±1.5% do valor medido" },
        { label: "Tipo de Gas", value: "GN, biogas, ar comprimido, vapor" },
        { label: "Temperatura", value: "-40°C a +250°C" },
        { label: "Pressao Maxima", value: "Ate 100 bar" },
        { label: "Saida", value: "4-20 mA / HART / Modbus RTU" },
      ],
      applications: ["Medicao de gas natural em gasodutos", "Monitoramento de biogas em biodigestores", "Controle de ar comprimido industrial", "Medicao de vapor em caldeiras"],
    },
  },
  {
    id: 4,
    category: "MEDIÇÃO DE NÍVEL",
    name: "Sensor de Nivel Radar para Efluentes",
    desc: "Medicao continua de nivel em tanques e reservatorios de efluentes com alta precisao.",
    spec: "Alcance: ate 30m",
    image: "/images/heroes/1.5.webp",
    sectors: ["Saneamento", "Industria"],
    measureType: ["Nivel"],
    details: {
      fullDesc: "Sensor de nivel por radar de onda guiada para medicao continua em tanques e reservatorios de efluentes. Imune a espuma, vapor e condicoes adversas. Sem manutencao e sem contato com o meio, garantindo longa vida util em ambientes corrosivos.",
      specs: [
        { label: "Alcance", value: "Ate 30 metros" },
        { label: "Precisao", value: "±2 mm" },
        { label: "Frequencia", value: "26 GHz" },
        { label: "Protecao", value: "IP67" },
        { label: "Temperatura", value: "-40°C a +200°C" },
        { label: "Saida", value: "4-20 mA / HART" },
      ],
      applications: ["Tanques de tratamento de efluentes", "Reservatorios de agua potavel", "Silos de armazenamento industrial", "Poco de bombeamento"],
    },
  },
  {
    id: 5,
    category: "MEDIÇÃO DE PRESSÃO",
    name: "Transmissor de Pressao Serie GP",
    desc: "Medicao precisa de pressao para processos industriais e saneamento.",
    spec: "Faixa: 0-100 bar",
    image: "/images/pages/2.1.webp",
    sectors: ["Saneamento", "Industria", "HVAC"],
    measureType: ["Pressao"],
    details: {
      fullDesc: "Transmissor de pressao com celula ceramica ou piezoresistiva para processos industriais. Alta estabilidade a longo prazo, resistente a sobrepressao e compativel com diversos meios. Aplicavel em redes hidraulicas, sistemas HVAC e processos de saneamento.",
      specs: [
        { label: "Faixa de Medicao", value: "0 a 100 bar (configuravel)" },
        { label: "Precisao", value: "±0.25% do fundo de escala" },
        { label: "Material", value: "Aco inox 316L" },
        { label: "Protecao", value: "IP65" },
        { label: "Conexao", value: "1/2\" NPT / G1/2\"" },
        { label: "Saida", value: "4-20 mA / 0-10 V" },
      ],
      applications: ["Monitoramento de pressao em redes de agua", "Controle de pressao em sistemas HVAC", "Processos industriais em geral", "Sistemas de bombeamento"],
    },
  },
  {
    id: 6,
    category: "TELEMETRIA",
    name: "Modulo de Telemetria Gaiatec",
    desc: "Solucao avancada de telemetria para monitoramento remoto de processos industriais e saneamento.",
    spec: "Protocolo: 4G/LoRa",
    image: "/images/pages/2.2.webp",
    sectors: ["Saneamento", "Telemetria", "Industria"],
    measureType: [],
    details: {
      fullDesc: "Modulo de telemetria desenvolvido pela Gaiatec para monitoramento remoto de variaveis de processo. Comunicacao via 4G ou LoRa com envio de dados para plataforma web em tempo real. Compativel com sensores analogicos e digitais, ideal para operacoes distribuidas.",
      specs: [
        { label: "Comunicacao", value: "4G LTE / LoRa" },
        { label: "Entradas Analogicas", value: "4x 4-20 mA" },
        { label: "Entradas Digitais", value: "4x 24 VDC" },
        { label: "Alimentacao", value: "12-24 VDC / Solar" },
        { label: "Protecao", value: "IP65" },
        { label: "Plataforma", value: "Dashboard web em tempo real" },
      ],
      applications: ["Monitoramento remoto de estacoes de tratamento", "Controle de pocos artesianos", "Supervisao de redes de saneamento", "Monitoramento de processos industriais distribuidos"],
    },
  },
  {
    id: 7,
    category: "DETECÇÃO DE GÁS",
    name: "Detector Portatil de Vazamento de Gas",
    desc: "Seguranca em campo com deteccao portatil de vazamentos de gas.",
    spec: "Sensibilidade: 1 ppm",
    image: "/images/pages/2.3.webp",
    sectors: ["Gas e Petroleo", "Industria"],
    measureType: ["Analise de Gas"],
    details: {
      fullDesc: "Detector portatil para localizacao de vazamentos de gas em instalacoes industriais e redes de distribuicao. Sensibilidade de 1 ppm com alarme sonoro e visual. Certificacao ATEX para uso em areas classificadas.",
      specs: [
        { label: "Sensibilidade", value: "1 ppm (CH4)" },
        { label: "Gases Detectaveis", value: "CH4, GLP, H2, gases combustiveis" },
        { label: "Certificacao", value: "ATEX / IECEx" },
        { label: "Autonomia", value: "8 horas (bateria recarregavel)" },
        { label: "Display", value: "LCD com backlight" },
        { label: "Alarme", value: "Sonoro (95 dB) + Visual + Vibratório" },
      ],
      applications: ["Inspecao de redes de distribuicao de gas", "Deteccao de vazamentos em areas industriais", "Seguranca em espacos confinados", "Manutencao preventiva em instalacoes de GN e GLP"],
    },
  },
  {
    id: 8,
    category: "PROTEÇÃO CATÓDICA",
    name: "Junta Isolante Flangeada",
    desc: "Protecao contra corrosao em redes metalicas de gas e liquidos.",
    spec: "Diametro: DN25 - DN600",
    image: "/images/pages/2.4.webp",
    sectors: ["Gas e Petroleo", "Proteção Catódica"],
    measureType: [],
    details: {
      fullDesc: "Junta isolante flangeada para seccionamento eletrico de tubulacoes metalicas. Impede a propagacao de correntes parasitas e garante a eficiencia dos sistemas de protecao catodica. Fabricada com materiais dieletricos de alta resistencia.",
      specs: [
        { label: "Diametro", value: "DN25 a DN600" },
        { label: "Pressao Nominal", value: "Ate 150 bar" },
        { label: "Resistencia Dieletrica", value: "> 5 kV" },
        { label: "Material", value: "Aco carbono / Inox + resina epoxy" },
        { label: "Norma", value: "ABNT NBR 15589 / NACE SP0169" },
        { label: "Conexao", value: "Flangeada ANSI 150/300/600" },
      ],
      applications: ["Seccionamento eletrico em gasodutos", "Protecao catodica de redes enterradas", "Isolamento de estacoes de medicao", "Sistemas de distribuicao de gas natural"],
    },
  },
  {
    id: 9,
    category: "BIOGÁS E BIOMETANO",
    name: "Biodigestor Industrial Modular (BIOGAIA M)",
    desc: "Solucao modular de alta eficiencia para geracao de biogas em escala industrial.",
    spec: "Capacidade: ate 500m3/dia",
    image: "/images/pages/2.5.webp",
    sectors: ["Biogás e Biometano", "Agronegocio"],
    measureType: [],
    details: {
      fullDesc: "Sistema modular de biodigestao anaerobica para producao de biogas em escala industrial. Estrutura pre-fabricada com montagem rapida, automacao integrada e monitoramento remoto. Ideal para agroindustrias, frigorificos e aterros sanitarios.",
      specs: [
        { label: "Capacidade", value: "Ate 500 m³/dia de biogas" },
        { label: "Volume do Reator", value: "50 a 2.000 m³" },
        { label: "Substrato", value: "Residuos organicos, dejetos, vinhaça" },
        { label: "Automacao", value: "CLP + SCADA integrado" },
        { label: "Monitoramento", value: "Temperatura, pH, pressao, vazao" },
        { label: "Estrutura", value: "Modular pre-fabricada em aco" },
      ],
      applications: ["Agroindustrias e frigorificos", "Usinas sucroalcooleiras", "Aterros sanitarios", "Propriedades rurais de grande porte"],
    },
  },
  {
    id: 10,
    category: "BIOGÁS E BIOMETANO",
    name: "Biodigestor Compacto Rural (BIOGAIA R)",
    desc: "Sistema compacto para producao de biogas em propriedades rurais.",
    spec: "Capacidade: ate 50m3/dia",
    image: "/images/pages/2.6.webp",
    sectors: ["Biogás e Biometano", "Agronegocio"],
    measureType: [],
    details: {
      fullDesc: "Biodigestor compacto projetado para pequenas e medias propriedades rurais. Producao de biogas para cozimento, aquecimento e geracao de energia eletrica. Biofertilizante como subproduto para uso na lavoura.",
      specs: [
        { label: "Capacidade", value: "Ate 50 m³/dia de biogas" },
        { label: "Volume do Reator", value: "10 a 100 m³" },
        { label: "Substrato", value: "Dejetos suinos, bovinos, aves" },
        { label: "Instalacao", value: "Rapida, em ate 5 dias" },
        { label: "Manutencao", value: "Minima — sistema autonomo" },
        { label: "Subproduto", value: "Biofertilizante organico" },
      ],
      applications: ["Propriedades rurais de pequeno e medio porte", "Granjas de suinos e aves", "Fazendas leiteiras", "Comunidades rurais isoladas"],
    },
  },
  {
    id: 11,
    category: "ANALISE DE GAS",
    name: "Sistema Fixo de Analise de Biogas (GAIASENSE S)",
    desc: "Monitoramento continuo e em tempo real da composicao do biogas.",
    spec: "Gases: CH4, CO2, H2S, O2",
    image: "/images/pages/2.7.webp",
    sectors: ["Biogás e Biometano"],
    measureType: ["Analise de Gas"],
    details: {
      fullDesc: "Sistema fixo de analise continua de biogas para monitoramento em tempo real da composicao gasosa. Mede metano, dioxido de carbono, acido sulfidrico e oxigenio simultaneamente. Fundamental para otimizacao do processo de biodigestao e seguranca operacional.",
      specs: [
        { label: "Gases Analisados", value: "CH4, CO2, H2S, O2" },
        { label: "Principio", value: "Infravermelho (NDIR) + eletroquimico" },
        { label: "Faixa CH4", value: "0-100% vol." },
        { label: "Faixa H2S", value: "0-10.000 ppm" },
        { label: "Comunicacao", value: "4-20 mA / Modbus / Ethernet" },
        { label: "Protecao", value: "IP65 / ATEX opcional" },
      ],
      applications: ["Monitoramento de biodigestores", "Controle de qualidade de biogas", "Plantas de upgrading para biometano", "Aterros sanitarios"],
    },
  },
  {
    id: 12,
    category: "ANALISE DE GAS",
    name: "Analisador Portatil de Biogas (GAIASENSE P)",
    desc: "Equipamento portatil para analise de biogas em campo.",
    spec: "Gases: CH4, CO2, H2S",
    image: "/images/pages/2.8.webp",
    sectors: ["Biogás e Biometano"],
    measureType: ["Analise de Gas"],
    details: {
      fullDesc: "Analisador portatil para medicao em campo da composicao do biogas. Equipamento leve e compacto com display integrado e datalogger. Ideal para comissionamento, manutencao e auditorias em plantas de biogas.",
      specs: [
        { label: "Gases Analisados", value: "CH4, CO2, H2S" },
        { label: "Principio", value: "NDIR + eletroquimico" },
        { label: "Autonomia", value: "6 horas (bateria interna)" },
        { label: "Display", value: "LCD colorido com datalogger" },
        { label: "Peso", value: "< 1,5 kg" },
        { label: "Certificacao", value: "ATEX Zona 1" },
      ],
      applications: ["Comissionamento de biodigestores", "Auditoria de plantas de biogas", "Medicao em campo e inspecao", "Verificacao de qualidade do gas"],
    },
  },
  {
    id: 13,
    category: "AUTOMAÇÃO",
    name: "Controlador Logico Programavel (CLP)",
    desc: "Automacao avancada para processos industriais complexos com conectividade IoT.",
    spec: "Multi-protocolo · IoT ready · Modular",
    image: "/images/pages/2.9.webp",
    sectors: ["Industria", "Biogás e Biometano", "Saneamento"],
    measureType: [],
    details: {
      fullDesc: "Controlador logico programavel modular para automacao de processos industriais complexos. Suporta multiplos protocolos de comunicacao e conectividade IoT para integracao com sistemas SCADA e plataformas em nuvem.",
      specs: [
        { label: "Arquitetura", value: "Modular expansivel" },
        { label: "I/O", value: "Ate 256 pontos (DI/DO/AI/AO)" },
        { label: "Protocolos", value: "Modbus, Profibus, Ethernet/IP, OPC-UA" },
        { label: "Programacao", value: "IEC 61131-3 (Ladder, ST, FBD)" },
        { label: "Conectividade", value: "4G / Wi-Fi / Ethernet" },
        { label: "HMI", value: "IHM touchscreen integrada (opcional)" },
      ],
      applications: ["Automacao de estacoes de tratamento", "Controle de processos em biodigestores", "Automacao industrial em geral", "Integracao com sistemas SCADA"],
    },
  },
  {
    id: 14,
    category: "PROTEÇÃO CATÓDICA",
    name: "Retificador de Proteção Catódica",
    desc: "Protecao contra corrosao para dutos e estruturas metalicas enterradas.",
    spec: "Corrente impressa · Monitoramento integrado · IP65",
    image: "/images/pages/2.10.webp",
    sectors: ["Gas e Petroleo", "Proteção Catódica"],
    measureType: [],
    details: {
      fullDesc: "Retificador de corrente impressa para sistemas de protecao catodica de dutos, tanques e estruturas metalicas enterradas ou submersas. Monitoramento integrado com telemetria e ajuste automatico de corrente.",
      specs: [
        { label: "Tipo", value: "Corrente impressa (ICCP)" },
        { label: "Potencia", value: "50 a 5.000 W" },
        { label: "Tensao de Saida", value: "10 a 100 VDC (configuravel)" },
        { label: "Monitoramento", value: "Integrado com telemetria" },
        { label: "Protecao", value: "IP65 / Gabinete em aco inox" },
        { label: "Norma", value: "ABNT NBR 15589 / NACE SP0169" },
      ],
      applications: ["Protecao de gasodutos e oleodutos", "Tanques subterraneos de combustiveis", "Estruturas metalicas enterradas", "Plataformas e instalacoes offshore"],
    },
  },
  {
    id: 15,
    category: "AGRONEGOCIO",
    name: "Sensores Agricolas Inteligentes",
    desc: "Monitoramento de solo e clima para agricultura de precisao.",
    spec: "Solo, umidade, clima · IoT · Agricultura de precisao",
    image: "/images/pages/2.11.webp",
    sectors: ["Agronegocio"],
    measureType: ["Temperatura"],
    details: {
      fullDesc: "Estacao de monitoramento agricola com sensores de solo, umidade, temperatura e variaveis climaticas. Conectividade IoT para envio de dados em tempo real. Permite tomada de decisao baseada em dados para irrigacao, plantio e manejo.",
      specs: [
        { label: "Sensores", value: "Solo (umidade, temp.), clima (chuva, vento, radiacao)" },
        { label: "Comunicacao", value: "LoRa / 4G / Wi-Fi" },
        { label: "Alimentacao", value: "Solar + bateria" },
        { label: "Autonomia", value: "Operacao continua (solar)" },
        { label: "Plataforma", value: "Dashboard web + app mobile" },
        { label: "Alcance LoRa", value: "Ate 15 km (campo aberto)" },
      ],
      applications: ["Agricultura de precisao e irrigacao", "Monitoramento de safras e plantacoes", "Gestao de recursos hidricos rurais", "Estacoes meteorologicas de campo"],
    },
  },
  {
    id: 16,
    category: "HVAC",
    name: "Unidade de Tratamento de Ar (UTA)",
    desc: "Controle de temperatura e umidade para ambientes industriais criticos.",
    spec: "Temperatura · Umidade · Qualidade do ar · Ambientes criticos",
    image: "/images/pages/2.12.webp",
    sectors: ["HVAC", "Industria"],
    measureType: ["Temperatura"],
    details: {
      fullDesc: "Sistema integrado para controle preciso de temperatura, umidade e qualidade do ar em ambientes industriais criticos. Projetado para salas limpas, laboratorios, data centers e areas com requisitos normativos de climatizacao.",
      specs: [
        { label: "Controle", value: "Temperatura, umidade, qualidade do ar" },
        { label: "Precisao Temp.", value: "±0.5°C" },
        { label: "Precisao Umidade", value: "±2% UR" },
        { label: "Filtracao", value: "HEPA H13/H14 (opcional)" },
        { label: "Vazao de Ar", value: "500 a 50.000 m³/h" },
        { label: "Automacao", value: "CLP integrado + BMS" },
      ],
      applications: ["Salas limpas e laboratorios", "Data centers e CPDs", "Industria farmaceutica", "Ambientes com controle de contaminacao"],
    },
  },
  {
    id: 17,
    category: "AUTOMAÇÃO",
    name: "Valvula de Controle Automatica",
    desc: "Controle preciso de fluxo com atuadores eletricos ou pneumaticos.",
    spec: "Atuadores eletricos/pneumaticos · Controle de fluxo preciso",
    image: "/images/pages/2.13.webp",
    sectors: ["Industria", "Gas e Petroleo", "Saneamento"],
    measureType: ["Vazao"],
    details: {
      fullDesc: "Valvula de controle com atuador eletrico ou pneumatico para regulacao precisa de fluxo em processos industriais. Disponivel em diversos materiais e configuracoes para atender diferentes meios e condicoes operacionais.",
      specs: [
        { label: "Tipo", value: "Globo, borboleta, esfera" },
        { label: "Atuador", value: "Eletrico ou pneumatico" },
        { label: "Diametro", value: "DN15 a DN600" },
        { label: "Material", value: "Aco carbono, inox 316, Hastelloy" },
        { label: "Sinal de Controle", value: "4-20 mA / HART / Fieldbus" },
        { label: "Classe de Pressao", value: "ANSI 150 a 600" },
      ],
      applications: ["Controle de vazao em processos quimicos", "Regulacao de pressao em gasodutos", "Dosagem de produtos quimicos em ETAs", "Controle de nivel em tanques industriais"],
    },
  },
];

/** Destaques do carrossel — um produto por categoria, para variedade. */
const featuredProducts: Product[] = Array.from(
  new Map(products.map((p) => [p.category, p])).values()
).slice(0, 8);

const categoryTabs = [
  "Todos",
  "Medição de Vazão",
  "Medição de Nível",
  "Medição de Pressão",
  "Analise de Gas",
  "Biogás e Biometano",
  "Proteção Catódica",
  "Automacao",
  "HVAC",
  "Agronegocio",
  "Telemetria",
  "Detecção de Gás",
];

const catMap: Record<string, string> = {
  "Medição de Vazão": "MEDIÇÃO DE VAZÃO",
  "Medição de Nível": "MEDIÇÃO DE NÍVEL",
  "Medição de Pressão": "MEDIÇÃO DE PRESSÃO",
  "Analise de Gas": "ANALISE DE GAS",
  "Biogás e Biometano": "BIOGÁS E BIOMETANO",
  "Proteção Catódica": "PROTEÇÃO CATÓDICA",
  Automacao: "AUTOMAÇÃO",
  HVAC: "HVAC",
  Agronegocio: "AGRONEGOCIO",
  Telemetria: "TELEMETRIA",
  "Detecção de Gás": "DETECÇÃO DE GÁS",
};

const sidebarSectors = [
  "Saneamento",
  "Gas e Petroleo",
  "Biogás e Biometano",
  "HVAC",
  "Industria",
  "Agronegocio",
  "Proteção Catódica",
  "Telemetria",
];

const sidebarMeasure = ["Vazao", "Nivel", "Pressao", "Temperatura", "Analise de Gas"];

const sortOptions = ["Relevancia", "Nome A-Z", "Nome Z-A"];

/* ────────────────────────────────────────────────────────
   PRODUCT DETAIL MODAL
   ──────────────────────────────────────────────────────── */
function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff", maxWidth: 960, width: "100%",
          maxHeight: "90vh", overflow: "auto", position: "relative",
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: "absolute", top: 20, right: 20, zIndex: 10,
            width: 40, height: 40, border: "1px solid #ddd",
            backgroundColor: "#fff", cursor: "pointer",
            fontSize: 18, color: "#333", display: "flex",
            alignItems: "center", justifyContent: "center",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0057DE"; e.currentTarget.style.color = "#0057DE"; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#ddd"; e.currentTarget.style.color = "#333"; }}
        >
          ✕
        </button>

        {/* Header with image */}
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div style={{ position: "relative", minHeight: 320, overflow: "hidden" }}>
            <div style={{
              position: "absolute", inset: 0,
              backgroundImage: `url(${product.image})`,
              backgroundSize: "cover", backgroundPosition: "center",
            }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 60%)" }} />
            <div style={{ position: "absolute", bottom: 24, left: 24 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE" }}>
                {product.category}
              </span>
            </div>
          </div>
          <div style={{ padding: "40px 32px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 500, lineHeight: 1.05, textTransform: "uppercase", color: "#111", marginBottom: 16 }}>
              {product.name}
            </h2>
            <p style={{ fontSize: 15, lineHeight: 1.7, color: "#555", marginBottom: 24 }}>
              {product.details.fullDesc}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {product.sectors.map((s) => (
                <span key={s} style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                  color: "#888", border: "1px solid #ddd", padding: "4px 10px",
                }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Specs table */}
        <div style={{ padding: "0 32px 40px" }}>
          <div style={{ borderTop: "2px solid #111", paddingTop: 32, marginTop: 8 }}>
            <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 20 }}>
              ESPECIFICACOES TECNICAS
            </span>
            <div style={{ borderTop: "1px solid #eee" }}>
              {product.details.specs.map((s, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2"
                  style={{ borderBottom: "1px solid #eee", padding: "12px 0" }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#333", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    {s.label}
                  </span>
                  <span style={{ fontSize: 13, color: "#666", fontFamily: "monospace" }}>
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Applications */}
        <div style={{ padding: "0 32px 40px" }}>
          <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#0057DE", marginBottom: 20 }}>
            APLICACOES
          </span>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0" style={{ borderTop: "1px solid #eee", borderLeft: "1px solid #eee" }}>
            {product.details.applications.map((app, i) => (
              <div key={i} style={{ borderRight: "1px solid #eee", borderBottom: "1px solid #eee", padding: "16px 20px", display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ fontFamily: KNOCKOUT, fontSize: 16, color: "#0057DE", fontWeight: 500, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span style={{ fontSize: 13, color: "#555", lineHeight: 1.5 }}>{app}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "0 32px 40px" }}>
          <div className="flex flex-col sm:flex-row gap-0">
            <Link
              to="/contato"
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "16px 32px", fontSize: 12, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.1em",
                color: "#fff", backgroundColor: "#0057DE", flex: 1,
                textDecoration: "none", transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#000"; e.currentTarget.style.color = "#0057DE"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; e.currentTarget.style.color = "#000"; }}
            >
              Solicitar Orcamento
            </Link>
            <Link
              to="/contato"
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "16px 32px", fontSize: 12, fontWeight: 700,
                textTransform: "uppercase", letterSpacing: "0.1em",
                color: "#555", border: "1px solid #ddd", flex: 1,
                textDecoration: "none", transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#0057DE"; e.currentTarget.style.color = "#0057DE"; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#ddd"; e.currentTarget.style.color = "#555"; }}
            >
              Falar com Especialista
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────
   COMPONENT
   ──────────────────────────────────────────────────────── */
export default function ProdutosPage() {
  // URL params bookmarkable — TASK 12
  // Permite compartilhar links como /produtos?categoria=Vazao&setor=Saneamento&q=ultrassonico
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = searchParams.get("categoria") || "Todos";
  const search = searchParams.get("q") || "";
  const sort = searchParams.get("ordem") || "Relevancia";
  const sectorFilters = searchParams.getAll("setor");
  const measureFilters = searchParams.getAll("medicao");

  const [sectorOpen, setSectorOpen] = useState(true);
  const [measureOpen, setMeasureOpen] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Helper pra atualizar params imutavelmente (preserva os outros)
  const updateParams = (mutator: (params: URLSearchParams) => void) => {
    const next = new URLSearchParams(searchParams);
    mutator(next);
    setSearchParams(next, { replace: true });
  };

  const setActiveTab = (cat: string) => {
    updateParams((p) => {
      if (cat === "Todos") p.delete("categoria");
      else p.set("categoria", cat);
    });
  };

  const setSearch = (q: string) => {
    updateParams((p) => {
      if (!q) p.delete("q");
      else p.set("q", q);
    });
  };

  const setSort = (s: string) => {
    updateParams((p) => {
      if (s === "Relevancia") p.delete("ordem");
      else p.set("ordem", s);
    });
  };

  const toggleSectorFilter = (val: string) => {
    updateParams((p) => {
      const current = p.getAll("setor");
      p.delete("setor");
      const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
      next.forEach((v) => p.append("setor", v));
    });
  };

  const toggleMeasureFilter = (val: string) => {
    updateParams((p) => {
      const current = p.getAll("medicao");
      p.delete("medicao");
      const next = current.includes(val) ? current.filter((v) => v !== val) : [...current, val];
      next.forEach((v) => p.append("medicao", v));
    });
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  // Comparador (TASK 14b) — controla botão "+ Comparar" em cada card
  const { add: addComparador, has: hasComparador, isFull: comparadorFull } = useComparador();

  const filtered = useMemo(() => {
    let list = [...products];
    if (activeTab !== "Todos") {
      const mapped = catMap[activeTab];
      if (mapped) list = list.filter((p) => p.category === mapped);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.desc.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    if (sectorFilters.length > 0) {
      list = list.filter((p) => p.sectors.some((s) => sectorFilters.includes(s)));
    }
    if (measureFilters.length > 0) {
      list = list.filter((p) => p.measureType.some((m) => measureFilters.includes(m)));
    }
    if (sort === "Nome A-Z") list.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "Nome Z-A") list.sort((a, b) => b.name.localeCompare(a.name));
    return list;
  }, [activeTab, search, sort, sectorFilters, measureFilters]);

  return (
    <>
      <SEO
        title="Produtos de Alta Performance"
        description="Catálogo completo: medidores de vazão, detectores de gás, controladores, retificadores de proteção catódica, sensores e mais. Tecnologia industrial certificada."
        path="/produtos"
        keywords="medidores vazão, detectores gás, automação industrial, proteção catódica, instrumentação"
        schema={buildCollectionPageSchema({
          name: "Catálogo de Produtos — Gaiatec Sistemas",
          description: "Produtos para medição, controle, automação e segurança industrial.",
          itemCount: products.length,
        })}
      />

      {/* Product detail modal */}
      {selectedProduct && (
        <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
      )}

      {/* ═══════════════════════════════════════════
          1) HERO CLARO (consistente com /setores, /servicos, /aplicacoes)
         ═══════════════════════════════════════════ */}
      <PageHero overline="Produtos" title="Produtos de Alta Performance" image="/images/services/4.2.webp" />

      {/* ═══════════════════════════════════════════
          2) CARROSSEL DE DESTAQUES
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#fff", padding: "80px 0 90px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <Carrossel
              overline="Em destaque"
              title="Produtos que definem o padrão"
              slides={featuredProducts.map((p) => (
                <Link
                  key={p.id}
                  to={`/produtos/${productSlug(p)}`}
                  className="group block h-full overflow-hidden bg-white border border-slate-200"
                  style={{ textDecoration: "none" }}
                >
                  <div style={{ position: "relative", paddingTop: "66%", overflow: "hidden", background: "#eef2f7" }}>
                    <div className="group-hover:scale-105" style={{ position: "absolute", inset: 0, backgroundImage: `url(${p.image})`, backgroundSize: "cover", backgroundPosition: "center", transition: "transform 0.6s ease" }} />
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(5,11,24,0.45) 0%, rgba(5,11,24,0) 55%)" }} />
                  </div>
                  <div style={{ padding: "22px", display: "flex", flexDirection: "column", minHeight: 170 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#0057DE", marginBottom: 8 }}>
                      {p.category}
                    </span>
                    <h3 style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", lineHeight: 1.3, marginBottom: 8 }}>
                      {p.name}
                    </h3>
                    <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16, flex: 1 }}>{p.spec}</p>
                    <span className="group-hover:gap-2.5" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: "#0057DE", textTransform: "uppercase", letterSpacing: "0.08em", transition: "gap 0.3s ease" }}>
                      Ver detalhes <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              ))}
            />
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          3) CATEGORY TABS — underline style
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #222" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="flex gap-0 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {categoryTabs.map((cat) => {
              const isActive = activeTab === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveTab(cat)}
                  style={{
                    padding: "18px 20px",
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    border: "none",
                    borderBottom: isActive ? "2px solid #0057DE" : "2px solid transparent",
                    backgroundColor: "transparent",
                    color: isActive ? "#0057DE" : "#666",
                    cursor: "pointer",
                    transition: "all 0.3s ease",
                    whiteSpace: "nowrap",
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = "#fff"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = "#666"; }}
                >
                  {cat}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          4) TOOLBAR — search + sort + count
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f5f5f5", padding: "16px 0", borderBottom: "1px solid #e0e0e0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-6">
              <p style={{ fontSize: 13, color: "#888", fontFamily: "monospace" }}>
                <span style={{ color: "#0057DE", fontWeight: 700 }}>{filtered.length}</span>
                {" "}resultado{filtered.length !== 1 ? "s" : ""}
              </p>
              <div className="flex items-center gap-2" style={{ flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 700 }}>Ordenar:</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  style={{
                    backgroundColor: "#fff",
                    border: "1px solid #ddd",
                    color: "#555",
                    padding: "6px 28px 6px 10px",
                    fontSize: 12,
                    outline: "none",
                    cursor: "pointer",
                    appearance: "none" as const,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23999' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                    backgroundRepeat: "no-repeat",
                    backgroundPosition: "right 8px center",
                  }}
                >
                  {sortOptions.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Mobile filter toggle */}
              <button
                className="lg:hidden"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                style={{
                  padding: "6px 16px",
                  border: "1px solid #ddd",
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  color: sidebarOpen ? "#0057DE" : "#666",
                  cursor: "pointer",
                  backgroundColor: "#fff",
                }}
              >
                {sidebarOpen ? "— Fechar Filtros" : "+ Filtrar"}
              </button>
              {/* Search */}
              <div style={{ position: "relative", maxWidth: 260 }}>
                <input
                  type="text"
                  placeholder="Buscar produto..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: "100%",
                    backgroundColor: "#fff",
                    border: "1px solid #ddd",
                    color: "#333",
                    padding: "8px 14px",
                    fontSize: 12,
                    outline: "none",
                    transition: "border-color 0.3s",
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "#0057DE"; }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = "#ddd"; }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          5) PRODUCT GRID with sidebar
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#f5f5f5", padding: "0 0 100px" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <div className="flex flex-col lg:flex-row">
            {/* ── SIDEBAR ── */}
            <aside
              className={`${sidebarOpen ? "block" : "hidden"} lg:block`}
              style={{ flexShrink: 0, paddingTop: 40 }}
            >
              <div className="lg:w-[220px]" style={{ position: "sticky", top: 100, paddingRight: 40 }}>
                {/* SETOR */}
                <div style={{ marginBottom: 32 }}>
                  <button
                    onClick={() => setSectorOpen(!sectorOpen)}
                    className="flex items-center justify-between w-full"
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                      color: "#0057DE", border: "none", background: "none", cursor: "pointer",
                      padding: "0 0 10px", borderBottom: "1px solid #ddd", marginBottom: 16, textAlign: "left",
                    }}
                  >
                    Setor <span style={{ color: "#ccc" }}>{sectorOpen ? "—" : "+"}</span>
                  </button>
                  {sectorOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {sidebarSectors.map((s) => {
                        const isChecked = sectorFilters.includes(s);
                        return (
                          <button
                            key={s}
                            onClick={() => toggleSectorFilter(s)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                              color: isChecked ? "#111" : "#888", background: "none", border: "none",
                              cursor: "pointer", padding: 0, textAlign: "left", transition: "color 0.2s",
                              fontWeight: isChecked ? 700 : 400,
                            }}
                            onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.color = "#555"; }}
                            onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.color = "#888"; }}
                          >
                            <span style={{
                              width: 14, height: 14, border: isChecked ? "1px solid #0057DE" : "1px solid #ccc",
                              backgroundColor: isChecked ? "#0057DE" : "#fff", display: "flex",
                              alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff",
                              flexShrink: 0,
                            }}>
                              {isChecked && "✓"}
                            </span>
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* TIPO DE MEDIÇÃO */}
                <div style={{ marginBottom: 32 }}>
                  <button
                    onClick={() => setMeasureOpen(!measureOpen)}
                    className="flex items-center justify-between w-full"
                    style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                      color: "#0057DE", border: "none", background: "none", cursor: "pointer",
                      padding: "0 0 10px", borderBottom: "1px solid #ddd", marginBottom: 16, textAlign: "left",
                    }}
                  >
                    Tipo de Medicao <span style={{ color: "#ccc" }}>{measureOpen ? "—" : "+"}</span>
                  </button>
                  {measureOpen && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {sidebarMeasure.map((m) => {
                        const isChecked = measureFilters.includes(m);
                        return (
                          <button
                            key={m}
                            onClick={() => toggleMeasureFilter(m)}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                              color: isChecked ? "#111" : "#888", background: "none", border: "none",
                              cursor: "pointer", padding: 0, textAlign: "left", transition: "color 0.2s",
                              fontWeight: isChecked ? 700 : 400,
                            }}
                            onMouseEnter={(e) => { if (!isChecked) e.currentTarget.style.color = "#555"; }}
                            onMouseLeave={(e) => { if (!isChecked) e.currentTarget.style.color = "#888"; }}
                          >
                            <span style={{
                              width: 14, height: 14, border: isChecked ? "1px solid #0057DE" : "1px solid #ccc",
                              backgroundColor: isChecked ? "#0057DE" : "#fff", display: "flex",
                              alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff",
                              flexShrink: 0,
                            }}>
                              {isChecked && "✓"}
                            </span>
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Clear */}
                {(sectorFilters.length > 0 || measureFilters.length > 0) && (
                  <button
                    onClick={() => { clearFilters(); }}
                    style={{
                      fontSize: 11, fontWeight: 700, color: "#0057DE", background: "none",
                      border: "none", cursor: "pointer", padding: 0, textTransform: "uppercase",
                      letterSpacing: "0.1em", borderBottom: "1px solid #0057DE",
                    }}
                  >
                    Limpar filtros
                  </button>
                )}
              </div>
            </aside>

            {/* ── PRODUCT CARDS ── */}
            <div className="flex-1" style={{ paddingTop: 40 }}>
              {filtered.length === 0 ? (
                <div style={{ padding: "80px 40px", textAlign: "center" }}>
                  <p style={{ fontSize: 15, color: "#888", marginBottom: 16 }}>Nenhum produto encontrado para os filtros selecionados.</p>
                  <button
                    onClick={() => { setActiveTab("Todos"); setSearch(""); clearFilters(); }}
                    style={{ fontSize: 12, fontWeight: 700, color: "#0057DE", background: "none", border: "none", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.1em", borderBottom: "1px solid #0057DE" }}
                  >
                    Limpar todos os filtros
                  </button>
                </div>
              ) : (
                <div
                  className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-0"
                  style={{ borderTop: "1px solid #e0e0e0", borderLeft: "1px solid #e0e0e0" }}
                >
                  {filtered.map((product, i) => {
                    const isComparing = hasComparador(product.id);
                    const compareDisabled = !isComparing && comparadorFull;
                    return (
                    <AnimateOnScroll key={product.id} delay={i * 0.04}>
                      <Link
                        to={`/produtos/${productSlug(product)}`}
                        className="group relative block"
                        style={{
                          borderRight: "1px solid #e0e0e0",
                          borderBottom: "1px solid #e0e0e0",
                          backgroundColor: "#fff",
                          transition: "background-color 0.3s, box-shadow 0.3s",
                          height: "100%",
                          display: "flex",
                          flexDirection: "column",
                          cursor: "pointer",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fafafa"; e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.08)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#fff"; e.currentTarget.style.boxShadow = "none"; }}
                      >
                        {/* Botão Comparar (TASK 14b) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (compareDisabled) return;
                            addComparador({
                              id: product.id,
                              name: product.name,
                              category: product.category,
                              image: product.image,
                              spec: product.spec,
                            });
                          }}
                          disabled={compareDisabled}
                          title={
                            isComparing
                              ? "Remover do comparador"
                              : compareDisabled
                                ? "Limite de 3 produtos"
                                : "Adicionar ao comparador"
                          }
                          aria-label={`${isComparing ? "Remover" : "Adicionar"} ${product.name} ${isComparing ? "do" : "ao"} comparador`}
                          style={{
                            position: "absolute",
                            top: 12,
                            right: 12,
                            zIndex: 5,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "6px 10px",
                            fontSize: 11,
                            fontWeight: 600,
                            borderRadius: 999,
                            border: isComparing ? "1px solid #0057DE" : "1px solid #e2e8f0",
                            backgroundColor: isComparing ? "#0057DE" : "rgba(255,255,255,0.95)",
                            color: isComparing ? "#ffffff" : compareDisabled ? "#94a3b8" : "#475569",
                            cursor: compareDisabled ? "not-allowed" : "pointer",
                            opacity: compareDisabled ? 0.6 : 1,
                            backdropFilter: "blur(4px)",
                            transition: "all 0.2s ease",
                          }}
                        >
                          {isComparing ? (
                            <>
                              <Check size={12} strokeWidth={2.5} />
                              Comparando
                            </>
                          ) : (
                            <>
                              <GitCompare size={12} strokeWidth={2} />
                              Comparar
                            </>
                          )}
                        </button>

                        {/* Image */}
                        <div style={{ position: "relative", width: "100%", height: 220, overflow: "hidden" }}>
                          <div
                            style={{
                              position: "absolute", inset: 0,
                              backgroundImage: `url(${product.image})`,
                              backgroundSize: "cover", backgroundPosition: "center",
                              transition: "transform 0.6s ease",
                            }}
                            className="group-hover:scale-110"
                          />
                          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.1) 50%, transparent 100%)" }} />
                          {/* Category on image */}
                          <div style={{ position: "absolute", bottom: 16, left: 20 }}>
                            <span style={{
                              fontSize: 9, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase",
                              color: "#0057DE",
                            }}>
                              {product.category}
                            </span>
                          </div>
                        </div>

                        {/* Content */}
                        <div style={{ padding: "24px 20px 28px", flex: 1, display: "flex", flexDirection: "column" }}>
                          <h3 style={{
                            fontFamily: KNOCKOUT, fontSize: 20, fontWeight: 500, color: "#111",
                            textTransform: "uppercase", lineHeight: 1.1, marginBottom: 10,
                            transition: "color 0.3s",
                          }} className="group-hover:text-[#0057DE]">
                            {product.name}
                          </h3>
                          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#888", marginBottom: 16, flex: 1 }}>
                            {product.desc}
                          </p>

                          {/* Spec row — monospace industrial */}
                          <div style={{
                            borderTop: "1px solid #eee",
                            paddingTop: 12,
                            marginBottom: 20,
                            fontSize: 11,
                            fontFamily: "monospace",
                            color: "#999",
                            letterSpacing: "0.03em",
                          }}>
                            {product.spec}
                          </div>

                          {/* Sector tags */}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                            {product.sectors.map((s) => (
                              <span key={s} style={{
                                fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
                                color: "#aaa", border: "1px solid #e0e0e0", padding: "4px 8px",
                              }}>
                                {s}
                              </span>
                            ))}
                          </div>

                          {/* Action hint */}
                          <div style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            borderTop: "1px solid #eee", paddingTop: 16,
                          }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                              letterSpacing: "0.1em", color: "#0057DE", transition: "letter-spacing 0.3s",
                            }} className="group-hover:tracking-widest">
                              Ver detalhes
                            </span>
                            <span style={{ fontSize: 16, color: "#0057DE", transition: "transform 0.3s" }} className="group-hover:translate-x-1">
                              →
                            </span>
                          </div>
                        </div>
                      </Link>
                    </AnimateOnScroll>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </section>


      {/* ═══════════════════════════════════════════
          7) CATALOG REQUEST
         ═══════════════════════════════════════════ */}
      <section style={{ backgroundColor: "#000", padding: "100px 0" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", padding: "0 30px" }}>
          <AnimateOnScroll>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
              <div>
                <span style={{ display: "inline-block", fontSize: 12, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "#0057DE", marginBottom: 20 }}>
                  CATALOGO TECNICO
                </span>
                <h2 style={{ fontFamily: KNOCKOUT, fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 500, lineHeight: 1, textTransform: "uppercase", color: "#fff", marginBottom: 24 }}>
                  Receba o Catalogo Completo
                </h2>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: "#666", marginBottom: 32 }}>
                  Solicite o catalogo digital com especificacoes tecnicas detalhadas, datasheets e informacoes de aplicacao de todos os nossos equipamentos.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {["Datasheets completos de cada equipamento", "Tabelas de selecao por aplicacao", "Certificados e documentacao tecnica"].map((item, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                      <span style={{ fontFamily: KNOCKOUT, fontSize: 18, color: "#0057DE", fontWeight: 500, flexShrink: 0 }}>
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                      <span style={{ fontSize: 14, color: "#888" }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="lg:border-l lg:border-[#222] lg:pl-10">
                <div style={{ maxWidth: 400 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#555", marginBottom: 24 }}>
                    Solicitar via contato
                  </p>
                  <Link
                    to="/contato"
                    style={{
                      display: "inline-flex", alignItems: "center", gap: 12,
                      backgroundColor: "#0057DE", color: "#ffffff", padding: "16px 40px",
                      fontWeight: 700, fontSize: 13, textTransform: "uppercase",
                      letterSpacing: "0.08em", textDecoration: "none", transition: "all 0.3s ease",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#fff"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#0057DE"; }}
                  >
                    Solicitar Catalogo
                  </Link>
                  <p style={{ fontSize: 12, color: "#444", marginTop: 16 }}>
                    Ou envie um email para vendas@gaiatecsistemas.com.br
                  </p>
                </div>
              </div>
            </div>
          </AnimateOnScroll>
        </div>
      </section>

      {/* ═══════════════════════════════════════════
          8) CTA BANNER
         ═══════════════════════════════════════════ */}
      <CTABanner
        text="Precisa de suporte tecnico para escolher o equipamento ideal? Fale com a equipe Gaiatec."
        primaryLabel="Fale com um Especialista"
        secondaryLabel="Solicitar Proposta"
      />
    </>
  );
}
