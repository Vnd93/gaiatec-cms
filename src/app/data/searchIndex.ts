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
  { label: "Automações", category: "Serviço", href: "/servicos/automacoes", keywords: "automação CLP SCADA painel controle programação" },
  { label: "Instrumentação Industrial", category: "Serviço", href: "/servicos", keywords: "instrumentação medição sensor instalação campo" },
  { label: "Instalações e Comissionamentos", category: "Serviço", href: "/servicos/instalacoes-comissionamentos", keywords: "instalação comissionamento startup partida montagem" },
  { label: "Manutenções", category: "Serviço", href: "/servicos/manutencoes", keywords: "manutenção preventiva corretiva reparo assistência técnica" },
  { label: "Proteção Catódica", category: "Serviço", href: "/servicos/protecao-catodica", keywords: "catódica corrosão proteção pipeline dutos" },
  { label: "Inspeção de Revestimentos", category: "Serviço", href: "/servicos/inspecao-revestimentos", keywords: "inspeção revestimento coating holiday detector" },
  { label: "Calibração Rastreável em Laboratório", category: "Serviço", href: "/servicos/calibracao-rastreavel-laboratorio", keywords: "calibração rastreável Inmetro metrologia rastreabilidade certificado laboratório" },
  { label: "Consultoria e Inspeções Técnicas", category: "Serviço", href: "/servicos/consultoria-inspecoes-tecnicas", keywords: "consultoria projeto engenharia especificação técnica" },
  { label: "Medições em Campo", category: "Serviço", href: "/servicos/medicoes-em-campo", keywords: "medição especializada campanha campo vazão pressão" },

  // ── BIODIGESTOR ──
  { label: "Biodigestor", category: "Biodigestor", href: "/biodigestor", keywords: "biodigestor anaeróbio biogás biometano tratamento resíduo" },
  { label: "Como Funciona o Biodigestor", category: "Biodigestor", href: "/biodigestor/como-funciona", keywords: "funcionamento processo anaeróbio digestão bactéria" },
  { label: "Portes de Biodigestores", category: "Biodigestor", href: "/biodigestor/portes", keywords: "porte tamanho modelo pequeno médio grande escala" },
  { label: "Benefícios do Biodigestor", category: "Biodigestor", href: "/biodigestor/beneficios", keywords: "benefício vantagem economia energia sustentabilidade" },
  { label: "Monitoramento de Biodigestores", category: "Biodigestor", href: "/biodigestor/monitoramento", keywords: "monitoramento remoto SCADA sensor IoT controle" },
  { label: "Biogás e Biometano", category: "Biodigestor", href: "/biodigestor/biogas-biometano", keywords: "biogás biometano GNR combustível veicular energia" },
  { label: "Automação de Biodigestores", category: "Biodigestor", href: "/biodigestor/automacao", keywords: "automação controle CLP biodigestor processo" },
  { label: "Biodigestor para Escolas", category: "Biodigestor", href: "/biodigestor/escolas", keywords: "escola educação didático ensino sustentabilidade" },

  // ── DETECÇÃO DE GÁS ──
  { label: "Detecção e Monitoramento de Gás", category: "Detecção de Gás", href: "/deteccao-de-gas", keywords: "detecção monitoramento gás metano etano laser tdlas ppb vazamento fuga gaiatec" },
  { label: "Detecção Móvel", category: "Detecção de Gás", href: "/deteccao-de-gas/deteccao-movel", keywords: "veículo veicular drone vant mochila laser varredura móvel s-series s800 s600 s700 ks100 m10 c200mini uf100 ws100 h10 autônomo" },
  { label: "Monitoramento Online", category: "Detecção de Gás", href: "/deteccao-de-gas/monitoramento-online", keywords: "fixo online 24/7 metano pressão válvula poste sz100 gq-tx100 gtq-wx200 gq-pm100 gq-pm200 dm10 c10 dt-kny-wx300 tht odorante poço transmissor vibração" },
  { label: "Localização de Tubulação PE", category: "Detecção de Gás", href: "/deteccao-de-gas/localizacao-tubulacao-pe", keywords: "polietileno pe tubo tubulação enterrada localizador acústico a200" },
  { label: "Detecção de Rede Enterrada", category: "Detecção de Gás", href: "/deteccao-de-gas/deteccao-rede-enterrada-gas", keywords: "subterrânea rede enterrada carrinho st100 vazamento duto inspeção" },
  { label: "Detectores Portáteis", category: "Detecção de Gás", href: "/deteccao-de-gas/detectores-portateis", keywords: "portátil handheld dg100 dx300 dx200 dx100 cl01 cp f40 manômetro tht multigás 4-em-1 oxigênio monóxido sulfeto" },
  { label: "Monitoramento Meteorológico", category: "Detecção de Gás", href: "/deteccao-de-gas/monitoramento-meteorologico", keywords: "estação meteorológica vento temperatura umidade ultrassônica portátil móvel dispersão clima" },

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
