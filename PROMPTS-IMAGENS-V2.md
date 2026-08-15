# Banco de imagens V2 — Gaiatec Sistemas

Manifesto auditável do banco fotográfico gerado em 14/08/2026. Os caminhos abaixo correspondem aos arquivos semânticos existentes no projeto; a coluna de cena resume o prompt específico usado como referência para cada imagem, sempre em conjunto com a direção global deste documento.

## Proveniência e direção fotográfica global

- Gerador: **ImageGen integrado ao Codex (built-in)**.
- Linguagem visual: fotografia editorial e industrial de altíssimo realismo, com aparência de captura por câmera profissional, luz natural ou iluminação industrial neutra, cores críveis e detalhes materiais convincentes.
- Humanização: profissionais brasileiros em situações de trabalho plausíveis, com diversidade de gênero, idade e tom de pele, expressões naturais, postura não posada e interação coerente com instrumentos, processos e clientes.
- Precisão técnica: equipamentos, tubulações, painéis, sensores, EPIs e ambientes devem ser compatíveis com o título e a aplicação descrita na página.
- Composição: sujeito principal claramente legível, profundidade de campo moderada e área de respiro compatível com textos, cards e recortes responsivos da interface.
- Luz e cor: cenas claras e acolhedoras; não há obrigação de usar tons escuros. A identidade da Gaiatec aparece pelo contexto de engenharia e pela consistência fotográfica, não por filtros artificiais.

## Proibições comuns

- Sem ilustração, desenho, pintura, 3D, CGI, render arquitetônico ou estética de banco de imagens genérico.
- Sem cyberpunk, neon excessivo, tratamento sombrio obrigatório, flare dramático artificial ou saturação irreal.
- Sem texto legível, números inventados em displays, logotipos, marcas de fabricantes ou marcas-d'água.
- Sem mãos ou rostos deformados, duplicação de pessoas, ferramentas flutuantes ou conexões fisicamente impossíveis.
- Sem EPI incoerente, atividade insegura ou profissional manipulando equipamento de forma tecnicamente implausível.
- Sem substituir precisão técnica por abstrações como hologramas, redes luminosas ou interfaces futuristas sobrepostas.

## Formatos, dimensões e variantes

Salvo a imagem social, cada path base possui oito saídas: `.webp` e `.avif` na versão base, mais `-480w`, `-1024w` e `-1920w` nos dois formatos. As variantes mantêm o enquadramento da família. A codificação adotada fica na faixa de WebP 80–82 e AVIF 60–62.

| Família | Dimensão/enquadramento base |
|---|---|
| Home — heroes, industries e highlights | 1920×1080, 16:9 |
| Home — products, services e news | 1920×1440, 4:3 |
| Home — solutions | 1920×1728, 10:9 |
| `/setores` | 1920×1440, 4:3 |
| `/servicos` — hero geral | 1920×1080, 16:9 |
| `/servicos` — detalhes | 1920×1440, 4:3 |
| Sobre | 1821×864 no hero; 1672×941 na equipe |
| Blog | 1774×887 no hero; cards entre 1536×1024 e 1693×929 |
| Contato | 1806×871 |
| Legal | 1672×941 |
| Social | 1200×630, `.jpg` e `.webp` |

Os paths das tabelas apontam para o WebP base, usado como referência primária no código. O stem equivalente identifica todas as variantes responsivas.

## Home — banners

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/heroes/hero-biogas-biometano.webp` | Planta brasileira de biogás em operação durante o dia, digestores e tubulações reais, dois profissionais verificando o processo; fotografia ampla, clara, com respiro para o texto do banner. |
| `public/images/home/heroes/hero-macromedicao-saneamento.webp` | Engenheiros realizando macromedição em tubulação de uma estação de tratamento de água, infraestrutura hídrica visível e leitura técnica plausível; luz natural. |
| `public/images/home/heroes/hero-automacao-industrial.webp` | Profissionais em planta industrial moderna acompanhando painel de automação e processo real, CLP e instrumentação coerentes, ambiente claro e produtivo. |
| `public/images/home/heroes/hero-protecao-catodica.webp` | Técnico com EPI executando medição de proteção catódica em duto no campo, eletrodo e instrumento conectados corretamente, paisagem brasileira ensolarada. |
| `public/images/home/heroes/hero-gas-petroleo.webp` | Equipe inspecionando instrumentação em instalação de gás e petróleo, tubulações, válvulas e transmissores em escala real; área classificada tratada com sobriedade e segurança. |

## Home — produtos em destaque

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/products/medidor-gas-ultrassonico.webp` | Medidor ultrassônico para gás instalado em linha de processo, equipamento em primeiro plano e técnico conferindo a medição em contexto industrial real. |
| `public/images/home/products/analisador-biogas-portatil.webp` | Profissional utilizando analisador portátil junto à linha de biogás, coleta e leitura em campo claramente compreensíveis, biodigestor ao fundo. |
| `public/images/home/products/clp.webp` | CLP modular instalado em painel elétrico organizado, engenheira verificando entradas e saídas com tablet, luz industrial neutra. |
| `public/images/home/products/retificador-protecao-catodica.webp` | Retificador de corrente impressa instalado próximo a duto, gabinete e conexões visíveis, técnico realizando inspeção segura em campo. |
| `public/images/home/products/sensores-agricolas.webp` | Sensores de solo, umidade e clima instalados em lavoura brasileira, produtora ou técnica conferindo dados no próprio talhão. |
| `public/images/home/products/unidade-tratamento-ar.webp` | Unidade de tratamento de ar em casa de máquinas limpa, dutos, filtros e controle visíveis, profissional verificando parâmetros de operação. |
| `public/images/home/products/medidor-vazao-eletromagnetico.webp` | Medidor eletromagnético flangeado em tubulação de água, corpo e transmissor legíveis, engenheiro acompanhando a vazão em instalação real. |
| `public/images/home/products/sistema-telemetria-remota.webp` | Estação remota de telemetria com painel, antena e instrumentação junto a ativo hídrico, técnico consultando dados em tablet. |
| `public/images/home/products/transmissor-pressao.webp` | Transmissor de pressão montado em linha de processo, close técnico com profissional realizando verificação de campo. |
| `public/images/home/products/valvula-controle-automatica.webp` | Válvula de controle automática com atuador em skid de processo, engenheiro avaliando sua operação entre tubulações e instrumentos reais. |

Observação de escopo: estes dez arquivos pertencem à seção da **Home**. Eles não alteram as páginas nem os assets da família excluída `/produtos`.

## Home — setores atendidos

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/industries/saneamento.webp` | Profissionais trabalhando em estação de tratamento de água, tanques, passarelas e macromedição visíveis em luz diurna. |
| `public/images/home/industries/gas-petroleo.webp` | Inspeção humana de instrumentação em planta de gás e petróleo, tubulações e válvulas reais, operação segura e bem iluminada. |
| `public/images/home/industries/biogas-biometano.webp` | Operadores acompanhando digestores e linha de aproveitamento de biogás em propriedade brasileira, tecnologia renovável sem aparência cenográfica. |
| `public/images/home/industries/protecao-catodica.webp` | Levantamento de potencial em duto enterrado, técnico, caixa de teste e instrumento de campo em composição documental. |
| `public/images/home/industries/agronegocio.webp` | Agricultura de precisão em lavoura brasileira, sensores no solo e profissional analisando condições da cultura sob luz natural. |
| `public/images/home/industries/industria.webp` | Equipe acompanhando automação e instrumentação de processo em fábrica contemporânea, máquinas e tubulações tecnicamente coerentes. |

## Home — serviços

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/services/instalacoes-comissionamentos.webp` | Dupla técnica realizando instalação e startup de instrumento em tubulação, ferramentas e cabos corretamente posicionados. |
| `public/images/home/services/medicoes-em-campo.webp` | Técnico instalando medidor ultrassônico clamp-on em tubulação, sensores alinhados e unidade portátil conectada. |
| `public/images/home/services/calibracao-laboratorio.webp` | Profissional calibrando transmissor em bancada metrológica clara, padrões e conexões organizados, ambiente de laboratório real. |
| `public/images/home/services/manutencoes.webp` | Engenheiros executando manutenção preventiva em painel e instrumentação industrial, diagnóstico ativo e EPI apropriado. |
| `public/images/home/services/automacoes.webp` | Especialistas configurando CLP e painel de automação em fábrica, tablet e componentes elétricos como parte natural da tarefa. |
| `public/images/home/services/protecao-catodica.webp` | Técnico medindo potencial eletroquímico junto a duto e posto de teste, equipamento conectado de forma plausível. |

## Home — soluções técnicas integradas

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/solutions/projetos-sob-medida.webp` | Equipe multidisciplinar discutindo projeto sob medida sobre desenhos e instrumento real, colaboração espontânea em ambiente de engenharia. |
| `public/images/home/solutions/capacidades-engenharia-metrologia.webp` | Engenheiros integrando projeto, instrumentação e metrologia em bancada técnica, equipamento de processo no centro da decisão. |
| `public/images/home/solutions/servico-suporte-tecnico.webp` | Especialista prestando suporte presencial a profissional do cliente, análise conjunta de instrumento e dados, relação consultiva humanizada. |

## Home — destaques

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/highlights/medicao-clamp-on.webp` | Técnico instalando par de transdutores clamp-on em grande tubulação sem interromper o processo, unidade de leitura conectada. |
| `public/images/home/highlights/gt-biodigest.webp` | Biodigestor em propriedade rural brasileira com operadores junto ao sistema de tubulações, escala e contexto de uso claramente visíveis. |
| `public/images/home/highlights/calibracao-rastreavel.webp` | Calibração rastreável de instrumento industrial em bancada, profissional registrando resultados com padrões organizados. |
| `public/images/home/highlights/telemetria-industrial.webp` | Equipe acompanhando ativos remotos por telemetria em centro operacional claro, tablet e infraestrutura física conectando campo e controle. |
| `public/images/home/highlights/inspecao-revestimento.webp` | Inspetor realizando levantamento de revestimento e proteção catódica ao longo de duto, instrumento portátil, cabos e posto de teste reais. |

## Home — notícias

| Path base | Cena/prompt específico |
|---|---|
| `public/images/home/news/escolha-medidor-vazao.webp` | Engenheiros comparando tecnologias de medição de vazão sobre bancada e linha de processo, decisão técnica em ambiente real. |
| `public/images/home/news/macromedicao-rede-municipal.webp` | Instalação de macromedição ultrassônica em adutora municipal, técnico ajustando sensores em estação de água. |
| `public/images/home/news/biometano-instrumentacao.webp` | Profissionais verificando instrumentação de uma planta de biogás/biometano, digestor, tratamento e linha de gás no mesmo contexto rural. |

## `/setores`

| Path base | Cena/prompt específico |
|---|---|
| `public/images/setores/saneamento.webp` | Medição clamp-on em adutora de estação de tratamento, técnico com EPI e infraestrutura de água em operação. |
| `public/images/setores/gas-petroleo.webp` | Engenheiros inspecionando instrumentos e válvulas em instalação de gás e petróleo, ambiente crítico claro, organizado e seguro. |
| `public/images/setores/biogas-biometano.webp` | Operação de biodigestor e tratamento de biogás em propriedade brasileira, profissionais acompanhando tubulações e parâmetros do processo. |
| `public/images/setores/protecao-catodica.webp` | Técnico realizando medição eletroquímica em posto de teste ao lado de duto enterrado, paisagem aberta e procedimento plausível. |
| `public/images/setores/hvac.webp` | Especialista verificando unidade de tratamento de ar e sensores de temperatura, umidade e pressão em ambiente industrial limpo. |
| `public/images/setores/controle-ambiental.webp` | Profissional operando sistema contínuo de monitoramento de emissões, analisadores e linha de amostragem em planta industrial. |
| `public/images/setores/seguranca-operacional.webp` | Trabalhadores realizando verificação de atmosfera com detector portátil antes de atividade em área de risco, EPIs e protocolo de segurança coerentes. |
| `public/images/setores/agronegocio.webp` | Técnica avaliando sensores de solo e estação meteorológica em cultivo brasileiro, agricultura de precisão integrada à rotina rural. |
| `public/images/setores/industria.webp` | Engenheiros acompanhando malha de controle em processo fabril, CLP, painel e instrumentação integrados sem sobreposição digital fictícia. |
| `public/images/setores/instrumentacao.webp` | Calibração e verificação de transmissores de processo por profissionais em bancada metrológica realista. |
| `public/images/setores/telemetria.webp` | Técnico junto a estação remota com antena e painel de telemetria, ativo industrial ou hídrico monitorado à distância. |

## `/servicos`

| Path base | Cena/prompt específico |
|---|---|
| `public/images/servicos/engenharia-de-campo/hero.webp` | Engenheira com tablet e técnico inspecionando transmissores e tubulação em estação de tratamento brasileira; hero amplo, claro e com respiro lateral. |
| `public/images/servicos/automacoes/hero.webp` | Dupla técnica configurando painel de automação e CLPs em planta industrial, interação real com tablet e componentes. |
| `public/images/servicos/protecao-catodica/hero.webp` | Técnico executando leitura de proteção catódica em posto de teste junto a duto, cabos, eletrodo e medidor coerentes. |
| `public/images/servicos/inspecao-revestimentos/hero.webp` | Inspeção de revestimento de duto por método de campo, profissional caminhando ou medindo com equipamento DCVG/CIPS plausível. |
| `public/images/servicos/calibracao-rastreavel-laboratorio/hero.webp` | Engenheira calibrando transmissor em laboratório, padrão de referência, mangueiras e registro de resultados organizados. |
| `public/images/servicos/manutencoes/hero.webp` | Profissionais diagnosticando e reparando instrumento ou painel em planta, cena de manutenção preventiva/corretiva sem pose publicitária. |
| `public/images/servicos/instalacoes-comissionamentos/hero.webp` | Instalação e comissionamento de instrumento em linha de processo, loop check e conferência conjunta por equipe de campo. |
| `public/images/servicos/consultoria-inspecoes-tecnicas/hero.webp` | Consultora e cliente avaliando instrumento, documentação e requisitos técnicos em ambiente de engenharia, conversa natural. |
| `public/images/servicos/medicoes-em-campo/hero.webp` | Campanha de medição clamp-on em tubulação industrial, sensores alinhados, unidade portátil e técnico concentrado no procedimento. |

## Sobre, Blog, Contato, Legal e Social

| Path base | Cena/prompt específico |
|---|---|
| `public/images/sobre/engenharia-institucional.webp` | Engenheira e engenheiro brasileiros verificando transmissor instalado em tubulação, instrumento portátil em uso, planta clara e real ao fundo. |
| `public/images/sobre/equipe-brasileira.webp` | Equipe brasileira diversa reunida em torno de desenhos técnicos e medidor de vazão, colaboração espontânea em oficina de engenharia. |
| `public/images/blog/hero-conteudo-tecnico.webp` | Engenheira analisando instrumento desmontado, notebook, multímetro e anotações junto à área de processo; conhecimento técnico aplicado. |
| `public/images/blog/medicao-ultrassonica-clamp-on.webp` | Técnico instalando transdutores clamp-on em grande adutora, unidade portátil conectada e procedimento em primeiro plano. |
| `public/images/blog/telemetria-saneamento.webp` | Dois profissionais analisando mapa e dados em tablet dentro do centro de controle de saneamento, tanques visíveis pela janela. |
| `public/images/blog/biogas-brasil.webp` | Especialista e produtor verificando tubulações e válvulas de uma planta rural de biogás brasileira, digestor ao fundo. |
| `public/images/blog/protecao-catodica.webp` | Técnico medindo potencial em caixa de teste de duto no campo, multímetro e eletrodo de referência conectados. |
| `public/images/blog/automacao-estacao-elevatoria.webp` | Engenheira e técnico configurando painel de inversores de uma estação elevatória, bombas e tubulações azuis ao fundo. |
| `public/images/blog/feira-saneamento.webp` | Profissionais brasileiros em feira técnica observando demonstração de medidores e corte de válvula, interação natural em estande movimentado. |
| `public/images/contato/atendimento-consultivo.webp` | Consultora conversando com cliente sobre medidor de vazão e dados em tablet, atendimento próximo dentro de ambiente técnico. |
| `public/images/legal/governanca-e-responsabilidade.webp` | Profissional administrativa e engenheiro revisando documentação ao lado de componente industrial, contexto claro de governança e responsabilidade. |
| `public/images/social/gaiatec-institucional.webp` | Três profissionais brasileiros com EPI avaliando transmissor em tubulação e registrando dados em tablet; composição social 1200×630. |

## `/aplicacoes`

| Path base | Cena/prompt específico |
|---|---|
| `public/images/aplicacoes/hero-aplicacoes-industriais.webp` | Equipe brasileira multidisciplinar em planta industrial integrada, avaliando instrumentação e processo; composição 16:9 clara, humanizada e com respiro para o título. |
| `public/images/aplicacoes/macromedicao-redes-distribuicao.webp` | Medição ultrassônica clamp-on em grande adutora de rede de distribuição, sensores corretamente montados e técnico acompanhando a unidade portátil. |
| `public/images/aplicacoes/producao-biogas-aterros.webp` | Captação e aproveitamento de biogás em aterro sanitário, poços, linha de coleta e profissionais verificando a operação em campo. |
| `public/images/aplicacoes/deteccao-vazamentos-gasodutos.webp` | Inspeção de vazamentos ao longo de gasoduto com equipamento óptico/laser de campo e equipe brasileira seguindo procedimento seguro. |
| `public/images/aplicacoes/monitoramento-h2s-refinarias.webp` | Bump test e verificação de monitor de H₂S em refinaria, cilindro de gás padrão, detector e EPIs tecnicamente coerentes. |
| `public/images/aplicacoes/calibracao-medidores-vazao.webp` | Calibração rastreável de medidor de vazão em bancada metrológica, padrões, conexões e registro de resultados em ambiente claro. |
| `public/images/aplicacoes/protecao-catodica-dutos-subterraneos.webp` | Levantamento pipe-to-soil em duto subterrâneo, posto de teste, eletrodo de referência e retificador no contexto real de campo. |
| `public/images/aplicacoes/automacao-eta-ete.webp` | Engenheiros acompanhando SCADA, painéis e bombas de uma ETA/ETE automatizada, integração natural entre sala de controle e processo. |
| `public/images/aplicacoes/telemetria-estacoes-remotas.webp` | Comissionamento de RTU alimentada por painel solar em estação remota, antena, gabinete e ativo hídrico visíveis em paisagem brasileira. |
| `public/images/aplicacoes/climatizacao-industrial-hvac.webp` | Comissionamento de sistema HVAC industrial, unidade de tratamento de ar, dutos e instrumentos de pressão/vazão avaliados por técnicos. |
| `public/images/aplicacoes/analise-biogas-biodigestores.webp` | Análise de composição de biogás em biodigestor, profissional coletando amostra e conferindo analisador portátil junto à linha de processo. |
| `public/images/aplicacoes/controle-pressao-adutoras.webp` | Válvula redutora/controladora de pressão instalada em adutora, transmissores e técnico verificando a estabilidade do sistema. |
| `public/images/aplicacoes/inspecao-revestimento-dutos.webp` | Levantamento DCVG/CIPS ao longo da faixa de duto, eletrodos, cabos e registrador de campo usados por equipe com EPI adequado. |

## Exclusões preservadas

- `/biodigestor` e todas as suas subpáginas: imagens e referências existentes preservadas.
- `/deteccao-de-gas` e todas as suas subpáginas: imagens e referências existentes preservadas.
- `/produtos` e todas as suas subpáginas: imagens e referências existentes preservadas.
- Imagens semanticamente relacionadas a esses temas, quando presentes na Home, em `/setores`, `/servicos` ou no Blog, pertencem exclusivamente às páginas listadas neste manifesto e não redirecionam nem sobrescrevem assets das rotas excluídas.
