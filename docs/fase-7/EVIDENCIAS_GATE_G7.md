# Gate G7 — decisão formal

**Data:** 2026-08-30
**Decisão:** BLOQUEADO POR DEPENDÊNCIAS EXTERNAS/EDITORIAIS; HOMOLOGAÇÃO TÉCNICA APROVADA

| Critério                                                | Evidência remota                                                                                                     | Decisão atual                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| campanha → formulário → lead → atribuição → atendimento | formulário/campanha sintéticos, captura idempotente, atribuição comercial, histórico, SLA e 2 eventos na outbox      | técnico aprovado; entrega de e-mail depende de `RESEND_API_KEY`    |
| blog e páginas publicam/agendam/restauram               | revisor e marketing temporários com MFA; agenda, worker, `Article`, restauração, republicação e retirada comprovados | aprovado                                                           |
| contato consistente no site inteiro                     | `contato-principal` e `newsletter` publicados; frontend e captura validados com protocolo sintético anonimizado      | formulários aprovados; dados globais reais ainda dependem do owner |
| permissões e exportações testadas                       | admin, marketing, revisor e comercial temporários; negações AAL1/RBAC, exportação AAL2 e 7 ações de auditoria        | aprovado                                                           |
| nenhum encaminhamento anterior ativo                    | nenhuma função legada consumida; fixtures retiradas; zero item sintético na projeção pública ao final                | aprovado                                                           |

## Motivo

A implementação e o fluxo técnico completo estão publicados e homologados no Supabase/Cloudflare staging. A norma do gate não permite substituir a entrega real de e-mail, a revisão do DPO e o recadastro permanente de contato por fixtures sintéticas; por isso a decisão formal permanece bloqueada, sem invalidar a aprovação técnica.

## Condição de reavaliação

Para reavaliar, a GAIATEC deve fornecer/configurar a chave Resend, aprovar a revisão LGPD/DPO e publicar pelo CMS os dados globais permanentes. Depois, deve-se disparar um lead de homologação autorizado, comprovar a entrega e retirar o dado conforme a política.

Validação complementar dos formulários: `contato-principal` versão 1 e `newsletter` versão 1 foram publicados com MFA. O envio público retornou o protocolo sintético `LD-BDDCDE3FA3`, posteriormente anonimizado sob a correlação `95c52efb-37f9-4cb0-9934-ce2319a9bf2a`.

Identificador do round-trip: `20260830143413-3fb870`. Correlation ID do lote sintético: `e8d776ed-d8b7-44cb-83c9-e732271ce1d3`. As verificações de UX/UI, Axe e E2E foram aprovadas em staging com 26 testes aprovados, 2 skips condicionais e nenhuma falha.
