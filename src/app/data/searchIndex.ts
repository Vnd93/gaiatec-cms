// ============================================================
// GAIATEC SISTEMAS — Search Index
// Flat array of all searchable content across the site
// ============================================================

export interface SearchItem {
  label: string;
  category: string;
  href: string;
  keywords: string;
}

export const searchIndex: SearchItem[] = [
  // ── SETORES ──
  { label: "Saneamento / Líquido", category: "Indústria", href: "/setores/saneamento", keywords: "água esgoto tratamento distribuição macromedição ultrassônico vazão" },
  { label: "Gás e Petróleo", category: "Setor", href: "/setores/gas-petroleo", keywords: "refinaria petroquímica exploração gás natural gasoduto" },
  { label: "Biogás e Biometano", category: "Setor", href: "/setores/biogas-biometano", keywords: "biodigestor energia renovável metano biomassa" },
  { label: "Proteção Catódica", category: "Setor", href: "/setores/protecao-catodica", keywords: "corrosão tubulação pipeline dutos revestimento" },
  { label: "HVAC", category: "Setor", href: "/setores/hvac", keywords: "ventilação ar condicionado climatização refrigeração" },
  { label: "Controle Ambiental", category: "Setor", href: "/setores/controle-ambiental", keywords: "emissão poluição monitoramento qualidade ar efluente" },
  { label: "Agronegócio", category: "Setor", href: "/setores/agronegocio", keywords: "agricultura fazenda irrigação solo sensor rural" },
  { label: "Indústria", category: "Setor", href: "/setores/industria", keywords: "fábrica manufatura automação processo industrial" },
  { label: "Telemetria", category: "Setor", href: "/setores/telemetria", keywords: "remoto monitoramento dados IoT wireless" },
  { label: "Instrumentação", category: "Setor", href: "/setores/instrumentacao", keywords: "medição sensor transmissor instrumento campo" },
  { label: "Segurança Operacional", category: "Setor", href: "/setores/seguranca-operacional", keywords: "detector gás segurança explosão área classificada" },

  // ── PRODUTOS ──
  { label: "Válvula de Controle Pneumática", category: "Produto", href: "/produtos", keywords: "válvula pneumática controle fluxo regulagem" },
  { label: "Válvula Borboleta Motorizada", category: "Produto", href: "/produtos", keywords: "válvula borboleta motor elétrico atuador" },
  { label: "Medidor de Vazão Eletromagnético", category: "Produto", href: "/produtos", keywords: "vazão eletromagnético líquido condutivo medição" },
  { label: "Medidor Ultrassônico Clamp-On", category: "Produto", href: "/produtos", keywords: "ultrassônico clamp-on não invasivo vazão portátil" },
  { label: "Transmissor de Pressão Diferencial", category: "Produto", href: "/produtos", keywords: "pressão diferencial transmissor 4-20mA HART" },
  { label: "Transmissor de Temperatura PT100", category: "Produto", href: "/produtos", keywords: "temperatura PT100 RTD termopar transmissor" },
  { label: "Analisador de Biogás Portátil", category: "Produto", href: "/produtos", keywords: "biogás analisador CH4 CO2 H2S portátil" },
  { label: "Detector de Gás Fixo", category: "Produto", href: "/produtos", keywords: "detector gás fixo segurança alarme explosão" },
  { label: "CLP Controlador Lógico Programável", category: "Produto", href: "/produtos", keywords: "CLP PLC controlador automação programável Siemens Allen-Bradley" },
  { label: "Supervisório SCADA", category: "Produto", href: "/produtos", keywords: "SCADA supervisório monitoramento controle tela" },
  { label: "Medidor de Vazão Coriolis", category: "Produto", href: "/produtos", keywords: "coriolis massa vazão densidade medição" },
  { label: "Medidor de Vazão Vortex", category: "Produto", href: "/produtos", keywords: "vortex vapor gás vazão medição" },
  { label: "Medidor de Vazão Turbina", category: "Produto", href: "/produtos", keywords: "turbina vazão líquido mecânico medição" },
  { label: "Manômetro Digital", category: "Produto", href: "/produtos", keywords: "manômetro pressão digital indicador local" },
  { label: "Atuador Elétrico", category: "Produto", href: "/produtos", keywords: "atuador elétrico válvula motorizado torque" },
  { label: "Sensores Agrícolas Inteligentes", category: "Produto", href: "/produtos", keywords: "sensor agrícola solo umidade clima IoT" },
  { label: "Sistema de Telemetria", category: "Produto", href: "/produtos", keywords: "telemetria remoto wireless dados transmissão" },
  { label: "Cromatógrafo de Gás", category: "Produto", href: "/produtos", keywords: "cromatógrafo análise gás composição qualidade" },
  { label: "Retificador de Proteção Catódica", category: "Produto", href: "/produtos", keywords: "retificador catódica corrente impressa proteção" },

  // ── SERVIÇOS ──
  { label: "Automação Industrial", category: "Serviço", href: "/servicos/automacao-industrial", keywords: "automação CLP SCADA painel controle programação" },
  { label: "Instrumentação Industrial", category: "Serviço", href: "/servicos/instrumentacao-industrial", keywords: "instrumentação medição sensor instalação campo" },
  { label: "Instalação e Comissionamento", category: "Serviço", href: "/servicos/instalacao-e-comissionamento", keywords: "instalação comissionamento startup partida montagem" },
  { label: "Manutenção Industrial", category: "Serviço", href: "/servicos/manutencao-industrial", keywords: "manutenção preventiva corretiva reparo assistência técnica" },
  { label: "Proteção Catódica", category: "Serviço", href: "/servicos/protecao-catodica", keywords: "catódica corrosão proteção pipeline dutos" },
  { label: "Inspeção de Revestimento", category: "Serviço", href: "/servicos/inspecao-de-revestimento", keywords: "inspeção revestimento coating holiday detector" },
  { label: "Calibração RBC Acreditada", category: "Serviço", href: "/servicos/calibracao-rbc", keywords: "calibração RBC Inmetro metrologia rastreabilidade certificado" },
  { label: "Consultoria Técnica", category: "Serviço", href: "/servicos/consultoria-tecnica", keywords: "consultoria projeto engenharia especificação técnica" },
  { label: "Medições Especializadas", category: "Serviço", href: "/servicos/medicoes-especializadas", keywords: "medição especializada campanha campo vazão pressão" },

  // ── BIODIGESTOR ──
  { label: "Biodigestor", category: "Biodigestor", href: "/biodigestor", keywords: "biodigestor anaeróbio biogás biometano tratamento resíduo" },
  { label: "Como Funciona o Biodigestor", category: "Biodigestor", href: "/biodigestor/como-funciona", keywords: "funcionamento processo anaeróbio digestão bactéria" },
  { label: "Portes de Biodigestores", category: "Biodigestor", href: "/biodigestor/portes", keywords: "porte tamanho modelo pequeno médio grande escala" },
  { label: "Benefícios do Biodigestor", category: "Biodigestor", href: "/biodigestor/beneficios", keywords: "benefício vantagem economia energia sustentabilidade" },
  { label: "Monitoramento de Biodigestores", category: "Biodigestor", href: "/biodigestor/monitoramento", keywords: "monitoramento remoto SCADA sensor IoT controle" },
  { label: "Biogás e Biometano", category: "Biodigestor", href: "/biodigestor/biogas-biometano", keywords: "biogás biometano GNR combustível veicular energia" },
  { label: "Automação de Biodigestores", category: "Biodigestor", href: "/biodigestor/automacao", keywords: "automação controle CLP biodigestor processo" },
  { label: "Biodigestor para Escolas", category: "Biodigestor", href: "/biodigestor/escolas", keywords: "escola educação didático ensino sustentabilidade" },

  // ── BLOG ──
  { label: "Blog — Artigos Técnicos", category: "Blog", href: "/blog", keywords: "artigo técnico publicação notícia informação" },
  { label: "Estudos de Caso", category: "Blog", href: "/blog", keywords: "case estudo projeto resultado cliente" },
  { label: "Novidades do Setor", category: "Blog", href: "/blog", keywords: "novidade tendência mercado atualização inovação" },

  // ── INSTITUCIONAL ──
  { label: "Sobre a Empresa", category: "Empresa", href: "/sobre", keywords: "sobre empresa história equipe missão valores certificação" },
  { label: "Contato", category: "Empresa", href: "/contato", keywords: "contato telefone email endereço orçamento WhatsApp" },
  { label: "Carreiras", category: "Empresa", href: "/sobre", keywords: "carreira vaga emprego trabalho oportunidade" },

  // ── PÁGINAS PRINCIPAIS ──
  { label: "Todos os Setores", category: "Página", href: "/setores", keywords: "setores indústrias atuação mercado" },
  { label: "Todos os Produtos", category: "Página", href: "/produtos", keywords: "catálogo produtos equipamentos instrumentos" },
  { label: "Todos os Serviços", category: "Página", href: "/servicos", keywords: "serviços assistência suporte técnico" },
];
