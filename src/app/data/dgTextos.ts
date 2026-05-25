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
};
