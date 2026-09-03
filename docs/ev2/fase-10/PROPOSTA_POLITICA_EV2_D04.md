# Proposta para decisão EV2-D04 — dados e provedor de IA

**Estado:** pendente de aprovação explícita do DPO/Security.

Este documento prepara a decisão; não a substitui. Até haver aprovação nominal e evidência, o
sistema mantém provedor externo desligado, aceita apenas fixtures sintéticas e não realiza chamadas
externas.

## Baseline técnico recomendado

| Tema                 | Baseline proposta                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------------------- |
| Finalidade           | localizar, explicar, extrair e preparar rascunhos de baixo risco                                                |
| Dados permitidos     | públicos aprovados e internos não sensíveis, somente após classificação formal                                  |
| Dados proibidos      | credenciais, segredos, PII, leads, anexos restritos, dados contratuais/fiscais e dados de terceiros sem direito |
| Treinamento          | opt-out contratual; dados da GAIATEC não treinam modelos                                                        |
| Retenção no provedor | zero ou o menor prazo tecnicamente possível e contratualmente verificável                                       |
| Retenção no CMS      | proposta de 24 h para sessões/mensagens; auditoria mínima sem conteúdo conforme política corporativa            |
| Região               | região aprovada pelo DPO, com transferência internacional documentada quando aplicável                          |
| Criptografia         | em trânsito e em repouso; chaves e rotação sob controle de infraestrutura                                       |
| Acesso               | token delegado curto, tool allowlist e permissão efetiva; nunca `service_role` para o modelo                    |
| Logs                 | hashes, códigos, custo e correlação; sem prompt bruto, segredo ou PII                                           |
| Revisão              | toda saída é proposta; campos de baixa confiança ficam pendentes                                                |
| Execução crítica     | fora de F-015; exige gate separado para F-016                                                                   |
| Incidente            | kill switch, bloqueio do provedor, preservação de evidência e fallback manual                                   |

## Decisões que o responsável deve registrar

1. provedor e produto/endpoint aprovados;
2. entidade contratante, DPA/termos e garantia de não treinamento;
3. região de processamento e armazenamento;
4. classes de dados permitidas e proibidas;
5. prazo de retenção no provedor, no CMS e na auditoria;
6. política de PII, anonimização e base legal;
7. responsáveis por custo, segurança, conteúdo e incidentes;
8. limites mensais e por sessão;
9. processo de revisão periódica do fornecedor;
10. data, aprovador e artefato de evidência.

## Registro de aprovação

| Campo                  | Preenchimento |
| ---------------------- | ------------- |
| Decisão                | pendente      |
| Provedor/endpoint      | pendente      |
| Região                 | pendente      |
| Classes permitidas     | pendente      |
| Retenção               | pendente      |
| Limite de custo        | pendente      |
| Aprovador DPO/Security | pendente      |
| Data                   | pendente      |
| Evidência/ticket       | pendente      |

Uma aprovação futura deve gerar nova versão imutável de política e testes do adapter real. Ela não
autoriza produção: apenas permite preparar um canary separado, com dados ainda sintéticos, budget,
red-team, contrato de privacidade e rollback previamente aprovados.
