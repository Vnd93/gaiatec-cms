# Decisões e ações necessárias para EV2

Este registro separa as resoluções iniciais das decisões que pertencem aos gates posteriores. A falta de uma decisão não deve ser escondida por uma suposição técnica.

## Ações iniciais resolvidas

| ID      | Resolução                                                                                                                          | Evidência                                                                    | Estado    |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------- |
| EV2-A01 | Data steward: Comercial GAIATEC Sistemas; revisão técnica: Pedro Nishida; revisão comercial/editorial: Comercial GAIATEC Sistemas. | [Lote piloto EV2.0](LOTE_PILOTO_EV2_0.md) e RACI aprovado do ciclo anterior. | Resolvido |
| EV2-A02 | Selecionados 20 produtos de cinco segmentos e 8 tarefas operacionais.                                                              | [Lote piloto EV2.0](LOTE_PILOTO_EV2_0.md)                                    | Resolvido |
| EV2-D01 | Multisite será preparado na arquitetura e ativado somente em fase posterior, a partir da EV2.9 e após gates de isolamento.         | [ADR-015](../adr/ADR-015-multisite-preparado-e-ativacao-posterior.md)        | Resolvido |

Não há decisão organizacional pendente que impeça a abertura da EV2.0.

## Decisões por gate

| ID      | Decisão/ação                                                                                                                   | Responsável          | Gate limite                   | Estado inicial                                                                                     |
| ------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------- |
| EV2-D02 | MPN pelo fabricante; GTIN por GS1/ERP; NCM pelo ERP/fiscal; SKU pelo CMS. Preço/estoque permanecem no ERP e fora do piloto G4. | Direção/Comercial/TI | Antes de EV2.4                | Resolvido em 02/09/2026                                                                            |
| EV2-D03 | Escolher os 20 componentes do MVP do Estúdio Visual.                                                                           | UX/Marketing         | Antes de EV2.9                | Resolvido no candidato EV2.9; catálogo fechado e registrado em `fase-9/DECISAO_MVP_COMPONENTES.md` |
| EV2-D04 | Aprovar política de dados, retenção, região, provedor, PII e uso de IA.                                                        | DPO/Security         | Antes de provedor/dados reais | Pendente; baseline provider-off em `fase-10/PROPOSTA_POLITICA_EV2_D04.md`                          |
| EV2-O01 | Configurar e validar provedor e destinatário de e-mail reais.                                                                  | DevOps/Marketing     | Antes de produção             | Pendente                                                                                           |
| EV2-S01 | Analisar relatórios CSP e aprovar plano de migração de `Report-Only` para enforcement.                                         | Security/Frontend    | Antes de produção             | Pendente                                                                                           |
| EV2-P01 | Executar code splitting dos bundles de Excel/PDF.                                                                              | Frontend             | EV2.6 ou anterior             | Concluído no candidato EV2.6; orçamento automatizado comprova ambos fora do grafo inicial          |
| EV2-Q01 | Reduzir os 46 avisos de lint sem misturar a limpeza com funcionalidades.                                                       | Tech lead            | Backlog contínuo              | Backlog                                                                                            |

## Decisões condicionais futuras

- Experimentos A/B e personalização não sensível: somente após estabilidade comprovada da EV2.
- Engine de busca dedicada: somente quando volume ou SLO medido justificar sair de Postgres FTS/`pg_trgm`.
- IA transacional: candidato local sintético implementado na EV2.14; permanece operacionalmente
  desabilitada até migration, gateway, avaliações, aprovação humana, compensação, kill switch e
  fallback manual passarem no Gate G14.

## Modelo de registro

Ao resolver um item, registrar:

- decisão e justificativa;
- responsável e aprovador;
- data;
- artefato de evidência ou link para ADR/ticket;
- impacto no escopo, sequência e critérios de aceite.
