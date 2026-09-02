# Lote piloto e tarefas operacionais da EV2.0

**Status:** autorizado e executado como piloto operacional G4 em staging; publicação bloqueada<br>
**Quantidade:** 20 produtos e 8 tarefas operacionais<br>
**Data:** 1 de setembro de 2026

## Fonte e regra de uso

A seleção foi feita a partir do portfólio mestre localizado em `Documentos/Soluções/outputs/gaiatec_portfolio_20260826/Portfolio_Mestre_GAIATEC_SISTEMAS.xlsx`, que contém 1.395 registros de produto.

O lote é uma amostra de trabalho para testar PIM, UX, validação, busca, mídia, workflow e release. A seleção original não autoriza importação automática. Em 2 de setembro de 2026, o solicitante concedeu autorização específica para sua importação controlada somente em staging. Essa autorização não inclui publicação, uso de imagem, produção nem aceitação de especificação técnica sem revisão humana e fonte oficial vigente.

## Critérios de seleção

- cobrir cinco segmentos e diferentes categorias técnicas;
- incluir produtos simples, famílias, variantes e sistemas compostos;
- exercitar atributos numéricos, unidades, comunicação, mídia, documentos e relações;
- incluir registros bem documentados e casos com lacunas deliberadas para validar o Centro de Qualidade;
- preservar o ID mestre e separar produto, modelo comercial, modelo original, fabricante e marca;
- impedir publicação enquanto houver origem, direito, identidade ou especificação não confirmada.

## Produtos selecionados

| Ordem | ID mestre  | Produto                                                 | Modelo            | Segmento                               | Papel no piloto                                     |
| ----: | ---------- | ------------------------------------------------------- | ----------------- | -------------------------------------- | --------------------------------------------------- |
|     1 | `GAI-0001` | Analisador Online de Gases por Ultravioleta Diferencial | `DOAS-2000`       | Análise Ambiental e de Processos       | atributos de gases, faixas e lacuna de marca/manual |
|     2 | `GAI-0007` | Analisador de Gabinete de DQO                           | `TC-300C`         | Análise Ambiental e de Processos       | unidade, faixa, princípio analítico e família       |
|     3 | `GAI-0011` | Analisador Online de Cloro Residual                     | `CLX-300`         | Análise Ambiental e de Processos       | processo, comunicação e grau de proteção            |
|     4 | `GAI-0111` | Sistema de Monitoramento Online de Odores               | `TH-2000-OU`      | Análise Ambiental e de Processos       | sistema composto, sensores e relações               |
|     5 | `GAI-0112` | Estação Compacta de Monitoramento da Qualidade do Ar    | `TH-2000-AQI`     | Análise Ambiental e de Processos       | múltiplas variáveis e telemetria                    |
|     6 | `GAI-0234` | Módulo de monitoramento, alarme e controle remoto       | `MT-025 v2`       | Automação, Telemetria e IoT            | versão/modelo e conectividade                       |
|     7 | `GAI-0235` | Módulo de monitoramento, alarme e controle remoto       | `MT-025 v3`       | Automação, Telemetria e IoT            | herança e comparação entre versões                  |
|     8 | `GAI-0236` | Módulo de telemetria                                    | `MT-331`          | Automação, Telemetria e IoT            | I/O, comunicação e compatibilidades                 |
|     9 | `GAI-0240` | Detector de Tetra-hidrotiofeno                          | `DG100 THT`       | Gases, Biogás e Energia                | detecção, software, aplicação e mídia               |
|    10 | `GAI-0241` | Sistema de Pré-Tratamento para Monitoramento Online     | `TH-2000`         | Gases, Biogás e Energia                | sistema/acessórios e relações técnicas              |
|    11 | `GAI-0406` | Turbina Hidrelétrica em Linha                           | `ILT24`           | Gases, Biogás e Energia                | sistema, desenho técnico e aplicação                |
|    12 | `GAI-0458` | Monitor de energia elétrica                             | `GM86`            | Inspeção, Localização e Diagnóstico    | atributos elétricos e imagens oficiais              |
|    13 | `GAI-0480` | Localizador de Tubulações e Cabos                       | `GX900`           | Inspeção, Localização e Diagnóstico    | kit, acessórios, variantes e galeria                |
|    14 | `GAI-0495` | Medidor ultrassônico de espessura                       | `GT1201`          | Inspeção, Localização e Diagnóstico    | faixas, materiais e comparação                      |
|    15 | `GAI-0534` | Canhão de Ar                                            | `AB-TC1000`       | Instrumentação e Controle de Processos | fluxo de sólidos e classificação pendente           |
|    16 | `GAI-0536` | Vibrador Pneumático                                     | `NTP`             | Instrumentação e Controle de Processos | família, imagens e atributos mecânicos              |
|    17 | `GAI-0691` | Medidor de Nível Ultrassônico Compacto                  | `GATSONIC NV-CP`  | Instrumentação e Controle de Processos | conflito documental e bloqueio de qualidade         |
|    18 | `GAI-0696` | Medidor de Nível Ultrassônico Remoto                    | `GATSONIC NV-RM`  | Instrumentação e Controle de Processos | comparação e correção de abas invertidas            |
|    19 | `GAI-1127` | Medidor de Vazão Ultrassônico Portátil                  | `GATSONIC-P 621Q` | Instrumentação e Controle de Processos | unidade, kit, acessórios e documentos               |
|    20 | `GAI-1130` | Medidor de Vazão Clamp-On, Inserção e Flangeado         | `GATSONIC-SLM`    | Instrumentação e Controle de Processos | variantes, instalação e manual completo             |

## Tarefas reais do operador

| ID        | Tarefa a medir                                                                              | Resultado esperado                                             |
| --------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `EV2-T01` | Criar um rascunho com somente identidade mínima, fechar o navegador e recuperar o trabalho. | Autosave e recuperação sem exigir payload publicável.          |
| `EV2-T02` | Estruturar produto, modelo, variante e SKU, com herança e identificadores imutáveis.        | Zero duplicação indevida e hierarquia compreensível.           |
| `EV2-T03` | Classificar o item e preencher atributos, faixas e unidades com validação progressiva.      | Erros no campo, explicação e bloqueio somente no gate correto. |
| `EV2-T04` | Enviar ou reutilizar mídia/documento, registrar origem, direito, ALT e consultar usos.      | DAM contextual, rastreável e com exclusão protegida.           |
| `EV2-T05` | Executar dry-run e cadastro em massa de uma parte do lote, repetindo a operação.            | Validação prévia, idempotência e nenhum item parcial.          |
| `EV2-T06` | Pesquisar, filtrar e comparar produtos por atributo técnico e unidade.                      | Resultado explicável, facetas homologadas e tempo mensurado.   |
| `EV2-T07` | Revisar diferenças, solicitar correção, aprovar e publicar um release composto em staging.  | Segregação, MFA, dependências e publicação coerente.           |
| `EV2-T08` | Restaurar o release e comprovar projeção pública, busca, SEO, mídia e relações anteriores.  | Rollback rastreável e estado anterior íntegro.                 |

## Owners e revisores interinos

| Papel                            | Nomeação                                     | Responsabilidade no piloto                                              |
| -------------------------------- | -------------------------------------------- | ----------------------------------------------------------------------- |
| Data steward PIM / Product Owner | Comercial GAIATEC Sistemas                   | identidade comercial, prioridade, taxonomia e decisão de portfólio      |
| Revisor técnico / Tech Lead      | Pedro Nishida (`@pedronishida`)              | arquitetura, atributos técnicos, proveniência e critérios de engenharia |
| Revisor comercial/editorial      | Comercial GAIATEC Sistemas                   | apresentação, aplicação, SEO, marca e autorização de conteúdo           |
| Operação/DevOps                  | Pedro Nishida                                | ambientes, logs, backup, restore e execução controlada                  |
| QA                               | Pedro Nishida (aprovador) e Codex (executor) | cenários, evidências, regressão e decisão do gate                       |

As nomeações reutilizam o RACI aprovado em 28 de agosto de 2026 e permanecem interinas até delegação formal registrada.

## Gate do lote

O lote foi importado como rascunho privado, com fonte e owner registrados. Publicação continua exigindo validação individual de fonte oficial, correspondência de modelo, direitos e dados técnicos. Os casos `GAI-0691` e `GAI-0696` permanecem bloqueados e sem SKU enquanto o conflito documental das abas Compacto/Remoto não for corrigido e aprovado; `GAI-1130` permanece incompleto pelo fabricante original não identificado.
