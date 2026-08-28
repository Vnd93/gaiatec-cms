# Avaliação formal — Gate G1

Data: 2026-08-28

Decisão: **BLOQUEADO exclusivamente pelo aceite jurídico-negocial**

## Critérios do planejamento

| Critério | Evidência | Avaliação |
|---|---|---|
| acesso RDO fechado | allowlist separada; sem escopo/suspenso/alheio negados; OTP sem Resend não criou usuário | técnico aprovado |
| assinados imutáveis | UPDATE/DELETE remotos sem efeito; correção versionada; PDF canônico server-side selado por SHA-256 | técnico aprovado |
| mídia sensível privada | buckets privados; público 400; signed URL curta 200 somente para owner | técnico aprovado |
| rotas privadas não indexáveis | meta/canonical/headers privados validados no frontend staging | técnico aprovado |
| nenhum P0 sem owner e contenção | matriz atualizada; terceiros ausentes falham fechados e têm limitação registrada | técnico aprovado |
| testes críticos verdes | testes locais, Deno, build, audit, matriz remota e Security Advisor verdes | técnico aprovado |

## Único bloqueador

A ADR-010 exige validação humana dos termos, consentimento e modelo probatório. A Lei 14.063/2020 disciplina assinaturas eletrônicas e a MP 2.200-2, art. 10, §2º admite outros meios de comprovação quando aceitos pelas partes; essas normas não substituem o aceite do Jurídico e do Negócio. Fontes oficiais: https://www.planalto.gov.br/ccivil_03/_ato2019-2022/2020/lei/l14063.htm e https://www.planalto.gov.br/ccivil_03/mpv/antigas_2001/2200-2.htm.

## Limitações operacionais que não abrem o P0

- não há credenciais exclusivas de staging para Resend ou Turnstile;
- OTP, notificações e assinatura remota retornam 503 antes de efeito quando Resend está ausente;
- CAPTCHA adaptativo retorna 403 sem secret;
- contato válido persiste de forma idempotente e registra outbox falha, sem alegar envio.

## Parecer

Os bloqueios técnicos ao alcance foram removidos e verificados no staging isolado. O Gate G1 continua bloqueado somente até o aceite formal do Jurídico e do Negócio. Não está autorizada a passagem para a Fase 2.
