# Avaliação formal — Gate G1

Data: 2026-08-28

Decisão: **BLOQUEADO**

## Critérios do planejamento

| Critério | Evidência | Avaliação |
|---|---|---|
| acesso RDO fechado | OTP/invite/escopo separados implementados e teste estático verde | não comprovado live; bloqueado |
| assinados imutáveis | trigger, RLS, comandos e versão corretiva implementados | RLS/fluxo remoto não executados; PDF canônico desenhado pendente; bloqueado |
| mídia sensível privada | buckets/policies privados e signed URLs curtas definidos | não aplicado/testado live; bloqueado |
| rotas privadas não indexáveis | meta noindex, canonical removido, headers privados e staging validados | aprovado no frontend/staging |
| nenhum P0 sem owner e contenção | owners funcionais e contenções registrados na matriz | aceites dos owners pendentes; bloqueado |
| testes críticos verdes | 4/4 testes locais, build, audit e Deno check verdes | suíte RLS/E2E remota ausente; bloqueado |

## Bloqueadores reais

1. **Backend de staging não aplicado nem testado.** A credencial/vinculação Supabase de staging não está disponível; Docker também não está disponível para a alternativa local. Sem isso, não há evidência de RLS, buckets, rate limit, outbox ou fluxo remoto.
2. **Aprovação jurídico-negocial ausente.** A ADR-010 exige validação humana dos termos e do modelo probatório. A Lei 14.063/2020 disciplina assinaturas eletrônicas e a MP 2.200-2, art. 10, §2º admite outros meios de comprovação quando aceitos pelas partes; isso não torna a redação ou o fluxo automaticamente aprovados. Fontes oficiais consultadas: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm e https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm.
3. **PDF canônico de assinatura desenhada pendente.** O backend registra hashes/evidências e trata PDF importado, mas ainda não gera e sela server-side um PDF canônico para o caso de assinatura desenhada. A notificação foi corrigida para não alegar anexo inexistente.

## Parecer

A contenção reduz o risco de o desenvolvimento ampliar as falhas conhecidas e mantém produção isolada. Ainda assim, os três bloqueadores impedem uma declaração responsável de Gate G1 aprovado. A branch deve permanecer na Fase 1 até que o runbook seja executado em staging, o PDF canônico seja concluído/testado e os owners técnico, jurídico e de negócio registrem aceite.

Não está autorizada a passagem para a Fase 2.
