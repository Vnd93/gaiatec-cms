/**
 * Textos curados dos produtos de Detecção de Gás (descrição + características),
 * a partir dos docs oficiais da Gaiatec — adaptados para o contexto Brasil
 * (sem referências a fabricante, origem/idioma de terceiros ou links externos).
 *
 * Produto presente aqui SOBRESCREVE descrição/features do catálogo; ausente
 * mantém o texto atual. Crescimento incremental conforme os docs são revisados.
 */
export interface DgTexto {
  descricao: string;
  features?: string[];
}

export const DG_TEXTOS: Record<string, DgTexto> = {
  "s-series": {
    descricao:
      "Veículo de inspeção a laser para varredura rápida de grandes extensões de rede de gás subterrânea, com detecção cega — localiza vazamentos mesmo sem conhecer o traçado exato da tubulação. Integra três tecnologias que podem operar isoladas ou combinadas: telemetria a laser superior (controle do feixe por tablet, giro de 360° e inclinação de ±90°, alcance de 100 m), varredura cega lateral a laser (feixe horizontal bidirecional, raio de 200 m) e detecção por bomba de sucção a nível ppb, que mede metano e etano e distingue gás natural de biogás.",
    features: [
      "Varredura cega lateral patenteada — detecta também contra o vento, limitação dos sistemas apenas por bomba de sucção",
      "Laser de infravermelho médio: absorção ~200× maior para metano e ~6.000× para etano",
      "Posicionamento RTK de precisão centimétrica + anemômetro para localizar a origem do vazamento",
      "Integração com mapas GIS da rede de gás e navegação inteligente da inspeção",
      "Análise com IA e nuvem para avaliar tendências de vazamento e gerar relatórios",
      "Posicionamento por satélite com trajeto e quilometragem, e foto dos pontos de alarme",
      "Suporta operação offline para áreas críticas ou dados sensíveis",
    ],
  },
  "s800": {
    descricao:
      "Sistema veicular de detecção de gás de alta precisão que monitora o ambiente por espectroscopia a laser, com sensibilidade de até 0,1 ppb. Ao detectar uma anomalia na rota, a equipe faz a inspeção secundária dos dutos próximos; o sistema identifica a origem do gás, distingue rapidamente gás natural de biogás, exibe a concentração em tempo real, emite alertas por voz, gera relatórios automáticos e classifica o estado do vazamento.",
    features: [
      "Sensibilidade até 1.000× maior que os métodos tradicionais (nível ppb)",
      "Detecta metano e etano simultaneamente, distinguindo gás natural de biogás",
      "Posicionamento por satélite com precisão centimétrica",
      "Anemômetro ultrassônico para localização precisa dos vazamentos",
      "Alertas por voz dos valores detectados",
      "Análise em tempo real, exibição gráfica e classificação automática de risco",
      "Integração com softwares de terceiros",
    ],
  },
  "s800-bomba": {
    descricao:
      "Veículo de detecção a laser que mede diretamente as concentrações de metano e etano, distinguindo gás natural de biogás. Emprega um laser interno com dois feixes em comprimentos de onda específicos, absorvidos apenas por metano e etano — como a taxa de absorção é proporcional à concentração, o sistema calcula os valores com exatidão.",
    features: [
      "Resposta rápida, elevando a eficiência da inspeção",
      "Unidade de detecção integrada e compacta",
      "Amostragem automática por bomba, com altura ajustável e instalação simples",
      "Distinção instantânea entre gás natural e biogás durante o trajeto",
      "Alta sensibilidade — capaz de detectar pequenos vazamentos",
      "Exibição em tempo real e alertas por voz das concentrações",
      "App de inspeção: trajeto, alarmes e relatórios",
      "Alta seletividade — reage apenas a metano e etano",
    ],
  },
  "s600": {
    descricao:
      "Sistema de detecção a laser de metano por varredura horizontal (cega), baseado em tecnologia óptica de última geração e patenteado. Emite um laser de varredura horizontal e explora a absorção característica do metano: ao atravessar uma nuvem de gás sobre a via ou o duto, parte da luz é absorvida; o receptor calcula a taxa de absorção e fornece o resultado em ppm·m — permitindo detecção mesmo sem conhecer a posição exata da tubulação.",
    features: [
      "Detecção a laser com resposta rápida",
      "Altura de instalação ajustável",
      "Varredura cega por laser horizontal lateral",
      "Modos de varredura configuráveis conforme o ambiente",
      "App de inspeção: trajeto, alarmes e relatórios",
      "Inicialização rápida, sem pré-aquecimento",
      "Exibição em tempo real e alertas por voz da concentração",
      "Alta seletividade — reage apenas a metano",
      "Instalável em diversos tipos de veículo",
    ],
  },
  "s700": {
    descricao:
      "Sistema de detecção a laser de metano por telemetria superior (rooftop), com tecnologia óptica avançada: alta sensibilidade, resposta rápida e estabilidade. Emite laser em frequência específica e explora a absorção do metano — ao atravessar uma nuvem de gás, parte do feixe é absorvida; calculando a taxa de absorção da luz refletida, obtém-se o resultado em ppm·m.",
    features: [
      "Proteção contra poeira, chuva e vibração",
      "Varredura a laser superior com controle do feixe em tempo real via app",
      "Controle de gimbal — ajusta ângulo e direção da sonda conforme o ambiente",
      "Posicionamento por satélite com registro de trajetos",
      "Banco de dados com exportação e geração de relatórios",
      "Captura de imagens nos pontos de alarme; câmera externa expansível",
      "Inicialização rápida, sem pré-aquecimento",
      "Alta seletividade — reage apenas a metano",
      "Montagem rápida em diversos tipos de veículo",
    ],
  },
  "ws100": {
    descricao:
      "Telêmetro a laser que emprega espectroscopia de absorção a laser de diodo sintonizável (TDLAS) para detectar com rapidez e precisão vazamentos de metano (CH4) a longa distância. A equipe opera a partir de área segura, alcançando regiões inacessíveis — vias movimentadas, prumadas externas de edifícios, dutos elevados e de longa distância — reduzindo o risco de acidentes.",
    features: [
      "Longo alcance: detecta metano de 0 a 200 m",
      "Detecção rápida: tempo de resposta de 0,1 segundo",
      "Alta precisão — reage apenas ao metano, sem influência ambiental",
      "Operação simples: autoteste na inicialização, praticamente sem manutenção",
      "Tela de alta resolução e luminosidade, legível sob luz solar intensa",
      "Leve e portátil, de design integrado",
    ],
  },
  "h10": {
    descricao:
      "Telêmetro a laser sintonizável para detecção rápida e precisa de vazamentos de metano (CH4) a longa distância. Emite um feixe de aproximadamente 1,65 µm que, ao incidir na superfície-alvo, sofre reflexão difusa; o aparelho analisa a luz recebida e calcula a concentração de coluna em ppm·m. Permite inspecionar áreas de difícil acesso a partir de zona segura.",
    features: [
      "Operação extremamente simples",
      "Autoteste e autocalibração na inicialização, livre de manutenção",
      "App de inspeção acoplado via Bluetooth",
      "Alta seletividade e precisão, sem influência das condições ambientais",
      'Tela TFT colorida de 2,4", legível sob forte luz solar',
    ],
  },
  "ks100": {
    descricao:
      "Veículo elétrico de inspeção de vazamento de gás (nível ppb), desenvolvido para detecção rápida em redes subterrâneas de vias estreitas — pátios, calçadas e ruas para não-motorizados. Mais ágil que os grandes veículos de detecção e mais rápido que a inspeção a pé, com fixação robusta e operação simples.",
    features: [
      "Alta velocidade de patrulha em vias urbanas com rede subterrânea",
      "Inspeção rápida em pátios, calçadas e vias estreitas",
      "Identifica rapidamente se há vazamento na rede",
      "Alertas por voz e exibição em tempo real dos resultados",
      "App de inspeção: trajeto, alarmes e relatórios",
      "Instalável em diversos veículos elétricos, montagem/desmontagem rápida",
      "Estrutura profissional e resistente",
    ],
  },
  "veiculo-autonomo": {
    descricao:
      "Solução inteligente que usa veículos de condução autônoma equipados com detecção a laser nível ppb para realizar, de forma automática e em alta frequência, detecção de vazamentos, inspeção de instalações e coleta de dados em redes subterrâneas urbanas, estações e parques industriais. Faz varredura em tempo real por MIR-TDLAS (laser sintonizável no infravermelho médio) com célula de caminho óptico longo, atingindo precisão de 0,1 ppb — mil vezes mais preciso que equipamentos tradicionais — e localizando rapidamente o ponto de vazamento, viabilizando inspeção 24/7 totalmente automatizada.",
    features: [
      "Redes subterrâneas urbanas: inspeção periódica das tubulações",
      "Estações de gás e portarias: verificação diária de segurança",
      "Parques industriais: inspeção dedicada de tubulações internas",
      "Resposta a emergências: deslocamento rápido sem expor pessoas",
      "Monitoramento preventivo no entorno de obras de terceiros",
    ],
  },
  "m10": {
    descricao:
      "Detector portátil tipo mochila de metano e etano por bomba de sucção a laser (nível ppb). Mede os dois gases simultaneamente, distinguindo instantaneamente gás natural de biogás: um laser interno emite dois feixes em comprimentos de onda específicos, absorvidos apenas por metano e etano, e a taxa de absorção (proporcional à concentração) permite calcular os valores exatos.",
    features: [
      "Resposta rápida, alta eficiência na inspeção",
      "Sondas de amostragem para todos os ambientes de aplicação",
      "Posicionamento por satélite com registro da trajetória",
      "App de celular sem fio: registra localização, fotos e envia dados",
      "Inicialização rápida, sem pré-aquecimento",
      "Excelente seletividade — reage apenas a metano e etano",
    ],
  },
  "c200mini": {
    descricao:
      "Detector portátil de metano e etano a laser que distingue biogás de gás natural instantaneamente em campo, medindo os dois gases ao mesmo tempo. Diferentemente da cromatografia gasosa tradicional, não exige longos tempos de análise, não consome insumos nem peças de desgaste e não tem concentração mínima para a análise de etano. Disponível em diversos modelos.",
    features: [
      "Distinção instantânea entre gás natural e biogás, com leitura simultânea de metano e etano",
      "Identificação automática de vazamentos, sem operação manual",
      "Amostragem e análise inteligentes — reage apenas a metano e etano",
      "Alertas por voz; tela LCD colorida grande",
      "Inicialização rápida, sem pré-aquecimento",
      "Bluetooth com app de inspeção: trajetos, relatórios e integração com terceiros",
      "Operação simples, detecção rápida e ótimo custo-benefício",
      "Compatível com diversas sondas externas",
    ],
  },
  "uf100": {
    descricao:
      "Inspetor de metano a laser embarcado em drone (VANT), para detecção aérea de vazamentos na rede de gás. Cobre áreas extensas, de difícil acesso ou perigosas, fazendo a leitura remota a partir de uma zona segura.",
  },
  "ws100mini": {
    descricao:
      "Telêmetro a laser de metano em versão compacta, com sensibilidade e precisão superiores aos métodos tradicionais. Pequeno, de baixo consumo e apto a longas tarefas contínuas, verifica tubulações de gás a 15, 30 e 60 m por detecção sem contato: emite um feixe laser estreito que, refletido pela superfície-alvo, retorna ao receptor e é convertido em sinal para o cálculo da concentração.",
    features: [
      "Compacto e portátil — cabe no bolso",
      "Autoteste na inicialização, sem calibração periódica",
      "Detecção contínua de longa duração",
      "Inspeção a distância, elevando produtividade e segurança",
    ],
  },

  /* ── Monitoramento Online ─────────────────────────────────────── */
  "sz100": {
    descricao:
      "Detector laser de metano montado em gimbal motorizado (PTZ), para varredura de grandes áreas com base em tecnologia TDLAS. Reúne alta sensibilidade, resposta rápida e ampla cobertura, substituindo um grande número de detectores pontuais sem deixar pontos cegos — indicado para estações de gás natural, indústria petroquímica, metalurgia, geração elétrica e demais locais com risco de vazamento.",
    features: [
      "Reage somente ao metano — sem interferência de outros gases ou de vapor d'água",
      "Resposta rápida, alta sensibilidade e ótima repetibilidade para monitoramento online em tempo real",
      "Ampla cobertura — substitui grande número de detectores pontuais, sem pontos cegos",
      "Armazenamento, exportação e visualização dos resultados em tempo real",
      "Opera mesmo sob condições climáticas adversas",
      "Autocalibração ao ligar — dispensa calibração manual",
    ],
  },
  "gq-tx100": {
    descricao:
      "Sistema online de monitoramento do teor de odorante (tetra-hidrotiofeno, THT) nas redes de gás natural. Como o gás é incolor e inodoro, a odorização é exigida por norma para tornar perceptível qualquer vazamento; o GQ-TX100 acompanha continuamente o nível de odorante, assegurando a dosagem adequada, otimizando os pontos de injeção, reduzindo custos e elevando a segurança da rede.",
    features: [
      "Projeto à prova de explosão — adequado a múltiplos cenários",
      "Consumo ultrabaixo de energia",
      "Posicionamento por satélite (GNSS)",
      "Rastreamento de rota e função antifurto",
      "Alarme em tempo real, com pontos de alarme configuráveis pelo usuário",
      "Múltiplas formas de transmissão — conexão estável e rápida",
      "Acesso por computador e celular, com alarme via SMS",
      "Consulta rápida e exportação de histórico (planilhas e gráficos)",
    ],
  },
  "gq-pm100": {
    descricao:
      "Sistema de monitoramento de pressão sem fio da série PM, baseado em tecnologia MEMS — compacto, de baixo consumo e alta precisão. Coleta, registra e transmite em tempo real a pressão da tubulação, atendendo redes urbanas de gás, água e esgoto, aquecimento urbano e poços de petróleo, com transmissão remota para a central.",
    features: [
      "Conceito de ultrabaixo consumo — autonomia de até 3 anos em modo padrão",
      "Alarme em tempo real para sobrepressão e subpressão (pontos configuráveis)",
      "Posicionamento por satélite (GNSS)",
      "Rastreamento de rota e função antifurto",
      "Design à prova de explosão — adequado a múltiplos cenários",
      "Múltiplas formas de transmissão — conexão estável e rápida",
      "Acesso por computador e celular; alarme via SMS",
      "Consulta rápida e exportação de histórico (planilhas e gráficos)",
    ],
  },
  "bomba-poco-de-valvula": {
    descricao:
      "Monitor de gás a laser tipo bomba de sucção para vigilância contínua da concentração de metano em poços de válvula e demais espaços confinados subterrâneos urbanos. Baseado em tecnologia TDLAS, é seguro, estável e de ultrabaixo consumo: o terminal envia periodicamente a concentração e o nível de bateria à central e, ao ultrapassar o limite, dispara o alarme automaticamente — permitindo estatísticas, consultas e backup dos dados.",
    features: [
      "Equipamento integrado e intrinsecamente seguro (Ex) — manutenção sem abrir a tampa",
      "Bateria de lítio interna com autonomia de 5+ anos",
      "Transmissão NB-IoT/4G, com mecanismo duplo: envio periódico + alarme",
      "Configuração remota de amostragem, envio e limiares — sem ir ao local",
      "Dois níveis de alarme, com envio via SMS",
      "Alertas de submersão, antifurto e inclinação acima de 45° com posição",
      "Proteção IP68; faixa de medição de 0 a 20% VOL",
      "Reage somente ao metano — sem interferência de outros gases",
    ],
  },
  "dm10": {
    descricao:
      "Sistema fixo de monitoramento, em tempo real, de vazamentos em redes subterrâneas de gás, baseado em espectroscopia a laser. Instalado sobre os trechos principais da malha urbana, vigia continuamente a segurança operacional dos dutos com ampla cobertura, alta imunidade a interferências, alta sensibilidade e resposta rápida — reagindo somente ao metano, sem influência de outros gases.",
    features: [
      "Reage somente ao metano — sem interferência de outros gases",
      "Resposta rápida, alta sensibilidade e repetibilidade para monitoramento online",
      "Autocalibração ao ligar — dispensa calibração manual",
      "Ultrabaixo consumo — autonomia superior a 3 anos",
      "Ativação manual (wake-up) e alarme antifurto",
      "Posicionamento automático com exibição no mapa",
      "Configuração remota de parâmetros; instalação fácil em cenários enterrados",
      "Acesso por computador e celular, com alarme via SMS",
      "Armazenamento e exportação de dados (planilhas e gráficos) em tempo real",
    ],
  },
  "gq-pm200": {
    descricao:
      "Sistema de monitoramento de pressão por telemetria sem fio da série PM, baseado em tecnologia MEMS — compacto, de baixo consumo e alta precisão. Coleta, registra e transmite em tempo real a pressão da tubulação, atendendo redes urbanas de gás, água e esgoto, aquecimento urbano e poços de petróleo, com transmissão remota para a central.",
    features: [
      "Alarme em tempo real para sobrepressão e subpressão (pontos configuráveis)",
      "Ultrabaixo consumo — autonomia de 3 anos em modo padrão",
      "Posicionamento por satélite (GNSS)",
      "Rastreamento de rota e função antifurto",
      "Design à prova de explosão",
      "Múltiplas formas de transmissão — conexão estável e rápida",
      "Acesso por computador e celular; alarme via SMS",
      "Consulta rápida e exportação de histórico (planilhas e gráficos)",
    ],
  },
  "c10": {
    descricao:
      "Poste inteligente de teste e proteção catódica para dutos de óleo, gás e gás urbano, atuando como unidade básica de sistemas inteligentes de proteção catódica. Mede potenciais (ligado/desligado e natural), interferência e corrente CA, densidade de corrente CC, desempenho de ânodos de sacrifício, temperatura e umidade — e, ao detectar anomalias, dispara alarme automático, eliminando as visitas físicas de baixa eficiência e alto risco.",
    features: [
      "Coleta remota de dados via NB-IoT/4G/5G",
      "Posicionamento por satélite com localização precisa no GIS",
      "Compatível com 95% dos postes de teste de aço do mercado",
      "API padrão — integra-se a qualquer sistema de gestão de dutos existente",
      "Armazena 6+ meses de dados em falha de comunicação, com reenvio automático",
      "Placa de PCB multicamada altamente integrada, de design compacto",
    ],
  },
  "poste-ia": {
    descricao:
      "Detector inteligente tipo poste com IA, dispositivo terminal de percepção para redes urbanas de gás em alta, média e baixa pressão. Integra posicionamento por satélite, IoT, big data, análise de imagem por IA, percepção de vibração e computação em borda (edge computing) para vigiar faixas verdes, calçadas, espaços confinados, estações industriais e vibração causada por obras de terceiros — entregando alarmes em níveis e uma solução sistêmica de gestão.",
    features: [
      "Detecção combinada: concentração de gás, vibração, imagem por IA e alagamento",
      "Alarmes em três níveis (comum, emergência e crítico)",
      "Painel com mapa de equipamentos, status por cor e detalhes do alarme (imagem 360°, vídeo)",
      "Reconhecimento por IA com computação em borda (edge computing)",
      "Integração com plataformas da distribuidora e órgãos reguladores",
      "Relatórios estatísticos e gestão da taxa de disponibilidade (online)",
      "App acompanhante: instalação, Bluetooth, status e tratamento de alarmes",
    ],
  },
  "vibracao-acustico": {
    descricao:
      "Sistema de monitoramento de vazamento de gás e de vibração de obras de terceiros baseado em reconhecimento por impressão acústica (voiceprint). Instalado em dutos, paredes ou pontos de purga, captura o áudio da rede e o envia à nuvem, onde um algoritmo de fusão ponderada faz a verificação cruzada multidimensional, identifica vazamentos por análise espectral e emite alarme de vibração — prevenindo rupturas causadas por escavações e obras próximas.",
    features: [
      "Reconhecimento por impressão acústica (voiceprint) com algoritmo de fusão ponderada",
      "Verificação cruzada multidimensional por sensores integrados",
      "Detecta vazamentos e vibração de obras de terceiros, prevenindo rupturas",
      "Análise espectral automática na nuvem",
      "Transmissão por NB-IoT/4G",
      "Instalação em dutos, paredes ou pontos de purga",
    ],
  },
  "poste-de-solo": {
    descricao:
      "Detector de gás em formato de poste fincado diretamente no solo, para monitoramento fixo e contínuo de vazamentos no ponto vigiado da rede enterrada. De instalação simples e discreta ao longo do traçado, alerta automaticamente diante da presença de gás.",
  },
  "enterrado": {
    descricao:
      "Detector de gás combustível de instalação subterrânea, concebido como guardião permanente da rede enterrada: posicionado junto aos dutos, vigia continuamente a presença de gás ao longo do traçado e alerta sobre vazamentos em dutos enterrados, apoiando a manutenção preventiva da malha.",
  },
  "pressao-sem-fio": {
    descricao:
      "Transmissor de pressão sem fio para monitoramento remoto e contínuo da pressão da rede de gás. Mede e transmite os valores à central sem necessidade de cabeamento, permitindo acompanhar em tempo real as condições operacionais da tubulação e detectar variações anormais de pressão.",
  },
  "poco-de-valvula": {
    descricao:
      "Monitor de gás combustível para poços de válvula e demais espaços confinados subterrâneos urbanos, voltado à inspeção de linhas vitais urbanas (city lifeline). Faz a vigilância contínua da concentração de gás no interior do poço e dispara alarme ao detectar vazamento, reduzindo o risco em ambientes confinados.",
  },
  "gtq-wx200": {
    descricao:
      "Terminal remoto para monitoramento contínuo de gás na rede, transmitindo em tempo real as leituras à central. Concebido para a vigilância fixa de pontos críticos da malha, integra-se à plataforma de gestão e dispara alarme ao detectar concentrações fora do limite.",
  },
  "gtq-wx200mini": {
    descricao:
      "Versão compacta do terminal remoto de monitoramento de gás, para instalação em pontos de espaço reduzido. Mantém a vigilância contínua e a transmissão em tempo real à central, com alarme automático ao ultrapassar os limites configurados.",
  },
  "dt-kny-wx300": {
    descricao:
      "Terminal inteligente para monitoramento de vazamento de gás em poços de válvula e espaços confinados subterrâneos. Faz a vigilância contínua da concentração no interior do poço e transmite dados e alarmes à central em tempo real, elevando a segurança da inspeção de linhas vitais urbanas.",
  },

  /* ── Localização de Tubulação PE ──────────────────────────────── */
  "a200": {
    descricao:
      "Localizador de tubulações de polietileno (PE) por método acústico. Uma cavidade ressonante acoplada ao duto injeta um sinal sonoro que usa o próprio gás como meio de propagação; o som atravessa o tubo PE e chega à superfície, onde um receptor portátil encontra o ponto de sinal mais forte — exatamente sobre a linha. Um algoritmo exclusivo foca apenas no duto PE-alvo, sem interferência de outras tubulações, indicando posição e direção com clareza.",
    features: [
      "Tecnologia acústica avançada — localiza dutos PE não detectáveis por métodos eletromagnéticos",
      "Sensor de alta sensibilidade e algoritmos profissionais para posicionamento preciso",
      "Seleção de frequência e algoritmos inteligentes que eliminam interferências",
      "Potência de saída ajustável — adapta-se a ambientes complexos",
      "Controle remoto sem fio do transmissor (liga/desliga, frequência e potência)",
      "Análise em tempo real com resultado imediato; sistema inteligente de economia de energia",
    ],
  },

  /* ── Detecção de Rede Enterrada ───────────────────────────────── */
  "st100": {
    descricao:
      "Detector de rede subterrânea de gás montado em carrinho com rodas: todos os componentes ficam concentrados no carro, que é simplesmente empurrado sobre o pavimento — sem necessidade de perfurar a via. Com bomba de sucção de alta potência, caminho de amostragem curto e resposta rápida, inspeciona com agilidade pátios, calçadas e vias para não-motorizados, reduzindo o esforço da equipe e sendo mais ágil que grandes veículos de detecção.",
    features: [
      "Inspeção de superfície empurrando o carrinho — sem perfurar o pavimento",
      "Bomba de sucção de alta potência, caminho curto e resposta rápida",
      "Componentes concentrados no carrinho — reduz o esforço da equipe",
      "Autoteste na partida e operação simples; localização rápida de suspeitas",
      "Alarme sonoro e visual — dispensa olhar a tela durante a inspeção",
      "App opcional via Bluetooth: trajeto, alarmes (posição e valor) e relatórios",
      "Haste telescópica — a unidade principal pode ser usada separadamente",
    ],
  },

  /* ── Detectores Portáteis ─────────────────────────────────────── */
  "dg100-tht": {
    descricao:
      "Detector portátil do teor de odorante (tetra-hidrotiofeno, THT) em redes de gás. Como o gás natural é incolor e inodoro, a odorização é exigida por norma para tornar perceptível qualquer vazamento; basta conectar um tubo fino ao ponto de purga do duto que a concentração de THT é exibida imediatamente — assegurando a dosagem adequada no ponto de consumo, reduzindo custos e otimizando os pontos de injeção.",
    features: [
      "Amostragem por bomba de sucção, com início automático da medição",
      "Módulo limitador de vazão interno — controla o fluxo do gás",
      "Autoteste ao ligar, pré-aquecimento rápido, resposta veloz e zeragem imediata",
      "Posicionamento por satélite opcional — registra local, horário e concentração",
      "Armazenamento e exportação de até 10.000 registros",
      "Autonomia superior a 10 h; proteção IP54; intrinsecamente seguro (Ex ib IIC T4 Gb)",
    ],
  },
  "dx300": {
    descricao:
      "Detector de gás portátil de faixa completa para múltiplas tarefas de campo: medição de altas concentrações durante a substituição de gás em dutos, medição quantitativa de vazamentos, localização precisa de pontos de vazamento em dutos enterrados e verificação de reguladores e instalações. Exibe simultaneamente três unidades (ppm, LEL e VOL), com troca automática entre ppm e VOL.",
    features: [
      "Faixa completa — de traços a altas concentrações (substituição de gás)",
      "Localização precisa de vazamentos em dutos enterrados e medição quantitativa em campo",
      "Pré-aquecimento rápido, pronto ao ligar, com troca automática de unidades",
      "Acessórios: haste de encaixe rápido e haste telescópica manual",
      "Bluetooth com app — trajeto, exportação de relatórios e integração com terceiros",
      "Alarme sonoro e visual; compacto e portátil",
    ],
  },
  "dx200": {
    descricao:
      "Detector de gás portátil para manutenção de redes, inspeção interna e localização precisa de vazamentos em dutos, reguladores e instalações de gás natural (CH4). Sensível, leve e robusto, oferece vários modos de operação — instalações expostas, espaços confinados, ultra-alta precisão e à prova de explosão — com excelente custo-benefício para uso em larga escala pelas equipes de campo.",
    features: [
      "Detecção e localização de vazamentos em dutos, reguladores e instalações",
      "Modos: instalação exposta, espaço confinado, ultra-alta precisão e Ex",
      "Sonda flexível tipo \"pescoço de cisne\" — ideal para espaços apertados",
      "Pré-aquecimento rápido, pronto ao ligar, com desligamento automático configurável",
      "Ponto de alarme ajustável; alarme sonoro de alta qualidade, com opção de mudo",
      "Autonomia superior a 10 h; proteção IP65; Ex ib IIC T3 Gb; apenas 180 g",
    ],
  },
  "cl01": {
    descricao:
      "Detector de gás portátil para manutenção de redes, inspeção interna de tubulações e localização precisa de pequenos vazamentos em dutos e reguladores. Em configuração opcional, mede também a pressão em dutos de média e baixa pressão, com leitura instantânea em duas unidades — apoiando inclusive o teste de estanqueidade no comissionamento da rede.",
    features: [
      "Detecção e localização de vazamentos em dutos, reguladores e instalações",
      "Modos: instalação exposta, espaço confinado, ultra-alta precisão e Ex",
      "Medição opcional de pressão (média/baixa) com exibição dupla mbar/bar e kPa",
      "Teste de estanqueidade da rede — usado no comissionamento de dutos",
      "Registro e comparação de múltiplas medições",
      "Pré-aquecimento rápido, pronto ao ligar; sonda flexível \"pescoço de cisne\"",
    ],
  },
  "dx100": {
    descricao:
      "Detector de gás portátil, compacto e econômico, para manutenção de redes, inspeção interna de tubulações e localização precisa de pequenos vazamentos em dutos, reguladores e instalações. Conta com LEDs indicadores de concentração — quanto maior o nível, mais LEDs acendem e mais rápido fica o alarme sonoro — permitindo o uso até em ambientes escuros.",
    features: [
      "Detecção e localização de vazamentos em dutos, reguladores e instalações",
      "LEDs indicadores de concentração — utilizável no escuro",
      "Resolução de medição e ponto de alarme ajustáveis",
      "Autoteste e pré-aquecimento rápidos — pronto ao ligar",
      "Alarme sonoro e visual de alta qualidade, com opção de mudo",
      "Configurações com sonda flexível \"pescoço de cisne\" ou sem sonda (mais compacto)",
    ],
  },
  "cp": {
    descricao:
      "Manômetro digital da série CP (baixa e média pressão) para a obtenção rápida da pressão operacional em sistemas de transporte e distribuição de gás. Mede separadamente ou ao mesmo tempo as pressões em dutos de média e baixa pressão, exibindo ambos os valores na mesma tela, e registra automaticamente monitoramentos longos — revelando o comportamento de estabilização da rede e a queda de pressão.",
    features: [
      "Leitura instantânea, sem pré-aquecimento, em duas unidades (mbar/bar e kPa)",
      "Medição simultânea de média e baixa pressão na mesma tela",
      "Teste de estanqueidade da rede de gás, com registro de múltiplos resultados",
      "Registro automático com intervalo/duração configurável",
      "Baixa pressão 0–100 mbar (res. 0,1 mbar); média 0–5 bar (res. 0,001 bar)",
      "Autonomia superior a 10 h; proteção IP54; 260 g",
    ],
  },
  "dx200-2": {
    descricao:
      "Versão manômetro do DX200: detector portátil voltado à medição rápida de pressão em tubulações de gás, atendendo a testes de estanqueidade e a inspeções abrangentes em campo. Com faixa de pressão configurável, entrega o resultado instantaneamente em duas unidades.",
    features: [
      "Faixa de pressão configurável — mede média ou baixa pressão em dutos",
      "Resultado instantâneo com exibição dupla (mbar/bar e kPa)",
      "Teste de estanqueidade — para comissionamento de dutos de gás natural",
    ],
  },
  "f40": {
    descricao:
      "Detector portátil 4-em-1 que mede simultaneamente oxigênio (O₂), sulfeto de hidrogênio (H₂S), monóxido de carbono (CO) e gases combustíveis. Em um único aparelho, atende à entrada em espaços confinados e galerias, a vazamentos em dutos de gás, à inspeção de equipamentos e ao combate a incêndios — qualquer ambiente sujeito a deficiência de oxigênio ou presença de gases tóxicos e inflamáveis.",
    features: [
      "Mede 4 gases ao mesmo tempo: O₂, H₂S, CO e combustíveis",
      "Alarmes sonoro, visual e por vibração",
      "Compacto e portátil, com clipe traseiro para transporte",
      "Armazenamento de dados em tempo real e exportação",
      "Bluetooth — transmite dados a dispositivos pareados",
      "Desligamento automático para economia de bateria",
      "Aplicações: bombeiros, indústria química, construção, obras elétricas e redes subterrâneas",
    ],
  },

  /* ── Monitoramento Meteorológico ──────────────────────────────── */
  "estacao-portatil": {
    descricao:
      "Estação meteorológica portátil ultrassônica que une corpo compacto e desempenho profissional para o monitoramento móvel em campo, pesquisa, exploração científica e resposta a emergências. Sem partes móveis (medição ultrassônica), fornece dados meteorológicos precisos e em tempo real onde as estações tradicionais, volumosas e de instalação complexa, não chegam.",
    features: [
      "Medição ultrassônica sem desgaste mecânico — alta durabilidade",
      "Múltiplas formas de transmissão e fácil de transportar",
      "Resposta rápida — leitura em tempo real",
      "Bateria de alta capacidade com troca rápida — longa autonomia",
    ],
  },
  "estacao-movel": {
    descricao:
      "Estação meteorológica automática (móvel) para a medição em campo, 24 horas por dia, das principais grandezas meteorológicas — direção e velocidade do vento, chuva, temperatura, umidade, iluminação, pressão atmosférica e radiação solar. Armazena pelo menos um ano de dados e os transmite à central por diversos meios (cabo, rádio digital ou rede móvel), apoiando estatísticas e processamento.",
    features: [
      "Mede vento (direção e velocidade), chuva, temperatura, umidade, luz, pressão e radiação solar",
      "Operação contínua 24 h em campo",
      "Armazenamento de grande capacidade — preserva mais de 1 ano de dados",
      "Comunicação por cabo, rádio digital ou rede móvel",
      "Fácil de transportar e operar",
    ],
  },
};
