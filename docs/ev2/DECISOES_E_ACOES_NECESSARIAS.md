# Decisões e ações necessárias para EV2

Este registro separa as ações imediatas das decisões que podem ser tomadas nos gates posteriores. A falta de uma decisão não deve ser escondida por uma suposição técnica.

## Ações imediatas para concluir a Fase EV2.0

| ID      | Ação necessária                                                                    | Quem deve informar | Entrega esperada                                             | Prazo          |
| ------- | ---------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------ | -------------- |
| EV2-A01 | Nomear o data steward do PIM e os revisores por linha de produto.                  | Direção técnica    | Nome, papel e linha sob responsabilidade.                    | Durante EV2.0  |
| EV2-A02 | Selecionar o lote piloto.                                                          | Product/PIM        | Lista de 20–50 produtos e 5–8 tarefas reais de operador.     | Durante EV2.0  |
| EV2-D01 | Decidir se multisite integra o ciclo imediato ou permanece como plataforma futura. | Direção/Product    | `imediato` ou `futuro`, com justificativa e sites previstos. | Antes de EV2.1 |

Essas informações podem ser enviadas na tarefa do desenvolvimento ou registradas diretamente nesta seção. Elas não bloqueiam a abertura da EV2.0, mas bloqueiam seu encerramento ou o avanço indicado.

## Decisões por gate

| ID      | Decisão/ação                                                                           | Responsável          | Gate limite       | Estado inicial |
| ------- | -------------------------------------------------------------------------------------- | -------------------- | ----------------- | -------------- |
| EV2-D02 | Definir os sistemas mestres de ERP, preço, estoque, MPN, GTIN e NCM.                   | Direção/Comercial/TI | Antes de EV2.4    | Pendente       |
| EV2-D03 | Escolher os 20 componentes do MVP do Estúdio Visual.                                   | UX/Marketing         | Antes de EV2.9    | Pendente       |
| EV2-D04 | Aprovar política de dados, retenção, região, provedor, PII e uso de IA.                | DPO/Security         | Antes de EV2.10   | Pendente       |
| EV2-O01 | Configurar e validar provedor e destinatário de e-mail reais.                          | DevOps/Marketing     | Antes de produção | Pendente       |
| EV2-S01 | Analisar relatórios CSP e aprovar plano de migração de `Report-Only` para enforcement. | Security/Frontend    | Antes de produção | Pendente       |
| EV2-P01 | Executar code splitting dos bundles de Excel/PDF.                                      | Frontend             | EV2.6 ou anterior | Backlog        |
| EV2-Q01 | Reduzir os 46 avisos de lint sem misturar a limpeza com funcionalidades.               | Tech lead            | Backlog contínuo  | Backlog        |

## Decisões condicionais futuras

- Experimentos A/B e personalização não sensível: somente após estabilidade comprovada da EV2.
- Engine de busca dedicada: somente quando volume ou SLO medido justificar sair de Postgres FTS/`pg_trgm`.
- IA transacional: permanece desabilitada até política, tool gateway, avaliações, aprovação humana, kill switch e fallback manual passarem no gate.

## Modelo de registro

Ao resolver um item, registrar:

- decisão e justificativa;
- responsável e aprovador;
- data;
- artefato de evidência ou link para ADR/ticket;
- impacto no escopo, sequência e critérios de aceite.
