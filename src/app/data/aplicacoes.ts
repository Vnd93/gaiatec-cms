/**
 * Aplicações Industriais — TASK 10/11.
 *
 * Cada aplicação representa um caso de uso real onde a Gaiatec entrega
 * solução técnica integrada (instrumentação + automação + serviços).
 *
 * Estrutura usada em:
 *   - /aplicacoes (listing com search + filtro setor)
 *   - /aplicacoes/[slug] (página de detalhe)
 *
 * Quando a tabela `aplicacoes_site` existir no Supabase, este array vira
 * fallback (mesmo padrão de servicesList.ts e sectors.ts).
 */

export interface AplicacaoListItem {
  slug: string;
  nome: string;
  descricaoCurta: string;
  descricaoCompleta: string;
  imagem: string;
  icone: string; // nome de ícone Lucide
  setores: string[]; // setores aplicáveis (IDs internos)
  produtosRelacionados: string[]; // slugs ou nomes
  servicosRelacionados: string[]; // slugs ou nomes da servicesList
  beneficios: string[]; // ROI / impactos
  casosUso: string[]; // casos típicos de aplicação
  destaque: boolean; // listagem em destaque
}

export const aplicacoes: AplicacaoListItem[] = [
  {
    slug: "macromedicao-redes-distribuicao",
    nome: "Macromedição em Redes de Distribuição",
    descricaoCurta:
      "Medição não-invasiva de grandes diâmetros em redes de água tratada com tecnologia ultrassônica clamp-on.",
    descricaoCompleta:
      "Macromedição é o coração da gestão de perdas em saneamento. Com medidores ultrassônicos clamp-on, instalamos sem interrupção do abastecimento, sem corte de tubulação e sem perda de carga. A solução Gaiatec inclui especificação técnica, instalação certificada, calibração rastreável e plataforma de telemetria para monitoramento remoto 24/7.",
    imagem: "/images/industries/5.4.png",
    icone: "Gauge",
    setores: ["Saneamento"],
    produtosRelacionados: [
      "Medidor Ultrassônico Clamp-On",
      "Medidor Eletromagnético",
      "Sistema de Telemetria",
    ],
    servicosRelacionados: [
      "instalacoes-comissionamentos",
      "calibracao-rastreavel-campo",
      "controle-monitoramento",
    ],
    beneficios: [
      "Redução de perdas hídricas em até 35%",
      "Instalação sem interrupção do processo",
      "Rastreabilidade RBC para conformidade ARSAE/INMETRO",
      "Monitoramento remoto via plataforma web/mobile",
    ],
    casosUso: [
      "Companhias estaduais de saneamento (CESBs)",
      "Autarquias municipais (SAAEs e DAEs)",
      "Concessionárias privadas de água",
      "Indústrias com alto consumo hídrico",
    ],
    destaque: true,
  },
  {
    slug: "producao-biogas-aterros",
    nome: "Produção de Biogás em Aterros Sanitários",
    descricaoCurta:
      "Captação, análise e aproveitamento do biogás gerado em aterros para geração de energia ou queima controlada.",
    descricaoCompleta:
      "Aterros sanitários são fontes naturais de biogás (metano + CO2). A Gaiatec projeta e implanta sistemas completos de captação, drenagem, análise da composição (CH4, CO2, O2, H2S) e aproveitamento energético — seja para geração elétrica ou queima em flares de alta eficiência. Solução integrada com instrumentação, automação e plataforma de monitoramento.",
    imagem: "/images/industries/5.3.png",
    icone: "Leaf",
    setores: ["Biogás e Biometano"],
    produtosRelacionados: [
      "Analisador de Biogás Portátil",
      "Cromatógrafo de Gases",
      "Detectores Multigás",
    ],
    servicosRelacionados: [
      "projetos",
      "instalacoes-comissionamentos",
      "controle-monitoramento",
    ],
    beneficios: [
      "Conformidade com licenciamento ambiental",
      "Geração de receita via créditos de carbono",
      "Geração de energia elétrica (~1 MW por 1.000 t/dia de RSU)",
      "Redução das emissões de metano (GEE potente)",
    ],
    casosUso: [
      "Aterros sanitários municipais",
      "Centrais de tratamento de resíduos",
      "Cooperativas de gestão de RSU",
    ],
    destaque: true,
  },
  {
    slug: "deteccao-vazamentos-gasodutos",
    nome: "Detecção de Vazamentos em Gasodutos",
    descricaoCurta:
      "Inspeções periódicas em gasodutos urbanos e industriais com equipamentos certificados ABNT NBR 15526.",
    descricaoCompleta:
      "Vazamentos em gasodutos representam risco de explosão, perdas econômicas e impacto ambiental. A Gaiatec realiza inspeções com detectores TVA, FID e laser remoto, gerando relatórios técnicos completos com georreferenciamento de pontos críticos. Atendemos distribuidoras, condomínios industriais e plantas químicas.",
    imagem: "/images/industries/5.5.png",
    icone: "Flame",
    setores: ["Gás e Petróleo", "Indústria"],
    produtosRelacionados: [
      "Detector de Gás Portátil",
      "Cromatógrafo TVA",
      "Detector de Vazamento por Laser",
    ],
    servicosRelacionados: [
      "deteccao-vazamento-gas",
      "inspecao-revestimentos",
      "consultoria-inspecoes-tecnicas",
    ],
    beneficios: [
      "Conformidade com ABNT NBR 15526 e Portaria 27/96",
      "Localização precisa via GPS de alta acurácia",
      "Relatório técnico assinado por engenheiro responsável",
      "Redução de risco de acidentes graves",
    ],
    casosUso: [
      "Distribuidoras de gás canalizado",
      "Condomínios industriais e parques químicos",
      "Estações de regulagem e medição",
      "Plantas de cogeração",
    ],
    destaque: true,
  },
  {
    slug: "monitoramento-h2s-refinarias",
    nome: "Monitoramento de H2S em Refinarias",
    descricaoCurta:
      "Detecção contínua de gás sulfídrico em áreas críticas com sensores eletroquímicos e infravermelho.",
    descricaoCompleta:
      "H2S é altamente tóxico e corrosivo. Em refinarias e plantas petroquímicas, monitoramento contínuo é obrigatório. A Gaiatec especifica e instala sistemas multipontos com detectores fixos eletroquímicos ou IR, integrados a CLPs/SCADA com alarmes audiovisuais e shutdown automático. Calibração RBC anual incluída.",
    imagem: "/images/services/4.7.png",
    icone: "Shield",
    setores: ["Gás e Petróleo", "Indústria"],
    produtosRelacionados: [
      "Detector Fixo de H2S",
      "Central de Alarme Multigás",
      "Sistema de Shutdown",
    ],
    servicosRelacionados: [
      "instalacoes-comissionamentos",
      "manutencoes",
      "calibracao-rbc-laboratorio",
    ],
    beneficios: [
      "Conformidade com NR-13, NR-15 e API RP 14C",
      "Resposta < 30s para níveis acima do limite",
      "Integração com sistema de combate a incêndio",
      "Histórico digital de eventos para auditorias",
    ],
    casosUso: [
      "Refinarias de petróleo",
      "Plantas petroquímicas",
      "Estações de tratamento de esgoto industrial",
      "Indústrias químicas com manuseio de enxofre",
    ],
    destaque: false,
  },
  {
    slug: "calibracao-medidores-vazao",
    nome: "Calibração de Medidores de Vazão (RBC)",
    descricaoCurta:
      "Calibração rastreável em laboratório acreditado RBC ou em campo com padrões certificados internacionalmente.",
    descricaoCompleta:
      "Calibração é exigência legal e técnica para medidores fiscais e operacionais. Nosso laboratório RBC (ABNT NBR ISO/IEC 17025) emite certificados aceitos em todo o Brasil e exterior. Para casos onde a retirada do medidor é inviável, oferecemos calibração in-loco com padrões portáteis rastreáveis ao SI.",
    imagem: "/images/services/4.5.png",
    icone: "Award",
    setores: ["Saneamento", "Gás e Petróleo", "Indústria"],
    produtosRelacionados: [
      "Provador de Vazão",
      "Medidor Padrão",
    ],
    servicosRelacionados: [
      "calibracao-rbc-laboratorio",
      "calibracao-rastreavel-campo",
    ],
    beneficios: [
      "Acreditação RBC reconhecida internacionalmente",
      "Rastreabilidade ao SI via INMETRO",
      "Incerteza expandida ≤ 0.2%",
      "Certificado válido para auditorias fiscais",
    ],
    casosUso: [
      "Medição fiscal de gás e líquidos",
      "Verificação metrológica obrigatória",
      "Recertificação periódica de instrumentos",
      "Auditorias internas e externas",
    ],
    destaque: true,
  },
  {
    slug: "protecao-catodica-dutos-subterraneos",
    nome: "Proteção Catódica em Dutos Subterrâneos",
    descricaoCurta:
      "Sistemas de corrente impressa e anodos galvânicos para prevenção de corrosão em dutos enterrados.",
    descricaoCompleta:
      "Corrosão é a principal causa de falhas em dutos enterrados (gasodutos, oleodutos, adutoras). Proteção Catódica é um sistema eletroquímico que impede a oxidação. A Gaiatec projeta, instala e monitora sistemas completos com retificadores, leitos de anodos, eletrodos de referência permanentes e telemetria 24/7 para acompanhamento remoto.",
    imagem: "/images/industries/5.1.png",
    icone: "Shield",
    setores: ["Gás e Petróleo", "Proteção Catódica", "Saneamento"],
    produtosRelacionados: [
      "Retificador de Proteção Catódica",
      "Eletrodo de Referência Cu/CuSO4",
      "Sistema de Telemetria",
    ],
    servicosRelacionados: [
      "protecao-catodica",
      "inspecao-revestimentos",
      "manutencoes",
    ],
    beneficios: [
      "Vida útil estendida do duto em 30+ anos",
      "Conformidade com NACE SP0169 e ABNT NBR 13231",
      "Monitoramento contínuo com alertas de anomalia",
      "Histórico digital para inspeções regulatórias",
    ],
    casosUso: [
      "Dutos de gás natural e GLP",
      "Oleodutos e dutos de produtos químicos",
      "Adutoras de água tratada",
      "Tanques de armazenamento enterrados",
    ],
    destaque: false,
  },
  {
    slug: "automacao-eta-ete",
    nome: "Automação de ETA / ETE",
    descricaoCurta:
      "Automação completa de Estações de Tratamento de Água e Esgoto com CLPs, SCADA e supervisão remota.",
    descricaoCompleta:
      "ETAs e ETEs modernas demandam automação avançada para garantir qualidade do tratamento, eficiência energética e conformidade com normas ambientais. A Gaiatec integra instrumentação de campo (vazão, pressão, pH, turbidez, OD) com CLPs e SCADA, gerando relatórios automáticos e alertas em tempo real.",
    imagem: "/images/services/4.1.png",
    icone: "Cpu",
    setores: ["Saneamento"],
    produtosRelacionados: [
      "CLP Multi-protocolo",
      "Sistema SCADA",
      "Sensor de pH/OD/Turbidez",
    ],
    servicosRelacionados: [
      "automacoes",
      "projetos",
      "instalacoes-comissionamentos",
    ],
    beneficios: [
      "Redução de custo operacional em até 25%",
      "Conformidade com CONAMA 357 e portarias estaduais",
      "Operação remota e desassistida",
      "Otimização do consumo de produtos químicos",
    ],
    casosUso: [
      "ETAs municipais e privadas",
      "ETEs urbanas e industriais",
      "Estações elevatórias",
      "Reservatórios e adutoras",
    ],
    destaque: false,
  },
  {
    slug: "telemetria-estacoes-remotas",
    nome: "Telemetria em Estações Remotas",
    descricaoCurta:
      "Monitoramento 24/7 de ativos distribuídos via rádio, celular ou satélite para operação centralizada.",
    descricaoCompleta:
      "Operações com pontos geograficamente distribuídos (estações de bombeamento, biodigestores, redes de gás, RTUs) demandam telemetria para evitar deslocamentos e responder rapidamente a eventos. A Gaiatec entrega solução end-to-end: aquisição (CLP/RTU), comunicação (4G, LoRaWAN, satélite), gateway, plataforma cloud e app mobile.",
    imagem: "/images/services/4.4.png",
    icone: "Antenna",
    setores: ["Telemetria", "Saneamento", "Biogás e Biometano", "Gás e Petróleo"],
    produtosRelacionados: [
      "RTU com modem 4G",
      "Gateway LoRaWAN",
      "Plataforma de Telemetria Web/App",
    ],
    servicosRelacionados: [
      "controle-monitoramento",
      "plataforma-controle",
      "automacoes",
    ],
    beneficios: [
      "Redução de deslocamentos em 80%+",
      "Resposta < 5min a eventos críticos",
      "Histórico ilimitado para análise de tendências",
      "Alertas via SMS, email e push notification",
    ],
    casosUso: [
      "Estações de bombeamento isoladas",
      "Biodigestores rurais e industriais",
      "Redes de distribuição de gás canalizado",
      "Reservatórios de água em zonas rurais",
    ],
    destaque: true,
  },
  {
    slug: "climatizacao-industrial-hvac",
    nome: "Climatização Industrial (HVAC)",
    descricaoCurta:
      "Soluções de climatização e ventilação para ambientes críticos com controle preciso de temperatura e umidade.",
    descricaoCompleta:
      "Salas limpas, data centers, hospitais e indústrias farmacêuticas demandam controle rigoroso de temperatura, umidade, pressão diferencial e qualidade do ar. A Gaiatec integra instrumentação BACnet/Modbus com sistemas de gerenciamento predial (BMS), garantindo conformidade com ISO 14644, ANVISA e ASHRAE.",
    imagem: "/images/services/4.6.png",
    icone: "Wind",
    setores: ["HVAC", "Indústria", "Controle Ambiental"],
    produtosRelacionados: [
      "Sensor de Temperatura/Umidade",
      "Sensor de Pressão Diferencial",
      "Controlador BACnet",
    ],
    servicosRelacionados: [
      "instalacoes-comissionamentos",
      "calibracao-rastreavel-campo",
      "manutencoes",
    ],
    beneficios: [
      "Conformidade ISO 14644-1 (salas limpas)",
      "Controle de temperatura ±0.5°C",
      "Eficiência energética via VAV",
      "Documentação completa para validação",
    ],
    casosUso: [
      "Indústria farmacêutica e cosmética",
      "Data centers e salas de servidores",
      "Hospitais e centros cirúrgicos",
      "Laboratórios e câmaras climáticas",
    ],
    destaque: false,
  },
  {
    slug: "analise-biogas-biodigestores",
    nome: "Análise de Biogás em Biodigestores",
    descricaoCurta:
      "Caracterização contínua da composição (CH4, CO2, H2S, O2) para otimizar a produção e qualidade do biogás.",
    descricaoCompleta:
      "Biodigestores industriais e rurais geram biogás com composição variável. A análise contínua permite otimizar a alimentação do digestor, garantir qualidade para uso (combustão, geração elétrica, biometano), e prevenir problemas de corrosão por H2S. Solução com analisadores fixos, portáteis e cromatógrafos para auditoria.",
    imagem: "/images/industries/5.3.png",
    icone: "Leaf",
    setores: ["Biogás e Biometano", "Agronegócio"],
    produtosRelacionados: [
      "Analisador de Biogás Portátil",
      "Analisador Fixo Multi-componente",
      "Cromatógrafo de Gases",
    ],
    servicosRelacionados: [
      "medicoes-em-campo",
      "calibracao-rastreavel-campo",
      "consultoria-inspecoes-tecnicas",
    ],
    beneficios: [
      "Otimização da geração elétrica",
      "Detecção precoce de instabilidade no digestor",
      "Conformidade ANP para biometano",
      "Controle de H2S < 5ppm para combustão limpa",
    ],
    casosUso: [
      "Biodigestores em frigoríficos e laticínios",
      "Aterros sanitários",
      "Estações de tratamento de esgoto",
      "Propriedades rurais (suinocultura, bovinocultura)",
    ],
    destaque: false,
  },
  {
    slug: "controle-pressao-adutoras",
    nome: "Controle de Pressão em Adutoras",
    descricaoCurta:
      "Monitoramento e modulação automática de pressão em redes de água tratada para reduzir perdas e roturas.",
    descricaoCompleta:
      "Pressões excessivas ou inconsistentes em adutoras causam roturas, vazamentos e desperdício de água tratada. A Gaiatec implanta sistemas de modulação por VRPs com transmissores de pressão, controladores PID e telemetria, garantindo pressão ótima em cada zona da rede 24/7, com adaptação automática à demanda.",
    imagem: "/images/services/4.2.png",
    icone: "Gauge",
    setores: ["Saneamento"],
    produtosRelacionados: [
      "Transmissor de Pressão",
      "Válvula Reguladora de Pressão",
      "Controlador PID",
    ],
    servicosRelacionados: [
      "instalacoes-comissionamentos",
      "automacoes",
      "controle-monitoramento",
    ],
    beneficios: [
      "Redução de roturas em até 60%",
      "Diminuição de perdas físicas em até 25%",
      "Otimização de consumo de energia em estações elevatórias",
      "Vida útil prolongada da rede",
    ],
    casosUso: [
      "Redes urbanas com setorização",
      "Adutoras com alta variação topográfica",
      "Sistemas de bombeamento intermitente",
      "Reservatórios e estações elevatórias",
    ],
    destaque: false,
  },
  {
    slug: "inspecao-revestimento-dutos",
    nome: "Inspeção de Revestimento de Dutos",
    descricaoCurta:
      "Diagnóstico técnico do revestimento anticorrosivo de dutos enterrados via DCVG e CIPS.",
    descricaoCompleta:
      "O revestimento é a primeira barreira contra corrosão em dutos enterrados. Falhas comprometem a proteção catódica e aceleram a degradação. A Gaiatec realiza inspeções DCVG (Direct Current Voltage Gradient) e CIPS (Close Interval Potential Survey), gerando mapeamento georreferenciado de defeitos para planejamento de manutenção.",
    imagem: "/images/services/4.8.png",
    icone: "ScanLine",
    setores: ["Gás e Petróleo", "Proteção Catódica"],
    produtosRelacionados: [
      "Equipamento DCVG",
      "Equipamento CIPS",
      "GPS de Alta Acurácia",
    ],
    servicosRelacionados: [
      "inspecao-revestimentos",
      "protecao-catodica",
      "consultoria-inspecoes-tecnicas",
    ],
    beneficios: [
      "Localização precisa de defeitos (±10 cm)",
      "Conformidade com NACE TM0109 e TM0497",
      "Priorização de reparos por criticidade",
      "Histórico digital para inspeções regulatórias",
    ],
    casosUso: [
      "Gasodutos e oleodutos",
      "Adutoras industriais",
      "Tanques de armazenamento enterrados",
      "Trocas de fornecedor / due diligence",
    ],
    destaque: false,
  },
];

export const featuredAplicacoes = aplicacoes.filter((a) => a.destaque);

export const aplicacaoBySlug = (slug: string) =>
  aplicacoes.find((a) => a.slug === slug);

/** Setores únicos extraídos das aplicações para uso em filtros */
export const setoresFromAplicacoes = Array.from(
  new Set(aplicacoes.flatMap((a) => a.setores)),
).sort();
