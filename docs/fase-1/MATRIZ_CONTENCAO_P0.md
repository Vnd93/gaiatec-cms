# Matriz de contenção P0

| Domínio | Risco P0 | Contenção implementada | Evidência principal | Estado |
|---|---|---|---|---|
| RDO | Autoinscrição por OTP | `rdo-otp` não cria usuário; somente convidado ativo; ausência de Resend falha antes de qualquer efeito | teste remoto confirmou HTTP 503 e contagem Auth inalterada | Verificado live/fail-closed |
| RDO | Mistura de permissões CMS/RDO | tabela independente `rdo_user_access` com `rdo_admin`/`rdo_member`; policy self-only e helpers invoker | migrations 0008/0009; matriz owner/admin/sem escopo/suspenso | Verificado live |
| RDO | Alteração/exclusão após assinatura | RLS e trigger deixam mutável apenas rascunho; correção cria versão 2 ligada à anterior | tentativa remota de UPDATE/DELETE não alterou/excluiu; correção passou | Verificado live |
| RDO | Foto/PDF sensível público | buckets privados; URL pública negada; signed URL de 300 s somente para autorizado | download remoto e SHA-256 conferido | Verificado live |
| RDO | Notificação controlada pelo cliente | cliente envia identificadores; servidor reconstrói relatório/destinatários e usa outbox | teste local de identificadores; sem Resend retorna 503 antes de envio | Verificado fail-closed |
| RDO | Reuso/forja de assinatura | PDF canônico server-side, snapshot/termos/hash, token por hash, consumo atômico, rate limit e auditoria | teste Deno + finalização remota desenhada; hash persistido igual ao PDF baixado | Verificado live para assinatura presencial; remoto fail-closed sem Resend |
| Site | Erro de rota/chunk sem recuperação | `errorElement` e `RouteErrorPage` com recuperação controlada | `routes.tsx`; `RouteErrorPage.tsx` | Verificado no build |
| Site | Indexação de área privada | meta `noindex`, remoção de canonical no RDO, headers `X-Robots-Tag`, cache privado/no-store e frame deny | `AuthContext.tsx`; Worker; staging | Verificado no frontend/HTTP |
| Site | Soft 404 | Worker retorna 404 real para entidade/rota/asset inválido, mantendo allowlist explícita de SPA | `cloudflare/_worker.js`; teste e matriz HTTP | Verificado no staging |
| Site | Cache de conteúdo privado/obsoleto | Service Worker ignora rotas privadas; headers privados e no-store; staging sempre noindex | `public/sw.js`; Worker/headers | Verificado no staging |
| Site | Links críticos `#` e overflow mobile | links inertes removidos; contenção horizontal e cabeçalhos responsivos | componentes e `theme.css`; varredura e navegador | Verificado |
| Site | Headers fracos | HSTS, nosniff, referrer/permissions policy, COOP, frame policy e CSP report-only | `_headers`; Worker; matriz HTTP | Verificado no staging |
| Site | Reativação acidental do CMS/API antigo | caminhos legados permanecem desabilitados e teste estático impede regressão | `useSiteData.ts`; `containment.test.mjs` | Verificado |
| Formulários | Abuso, payload excessivo e dados não validados | limite de 16 KiB, campos/enums e validação server-side | corpo de 17 KB retornou 413; consentimento inválido retornou 400 | Verificado live |
| Formulários | Spam automatizado | rate limit por IP/e-mail, honeypot e Turnstile adaptativo | honeypot não persistiu; CAPTCHA exigido retornou 403 sem secret | Verificado live/fail-closed |
| Formulários | Consentimento ambíguo | consentimento estruturado com finalidade, texto, versão e timestamp | submissão sintética e persistência inspecionadas | Verificado live |
| Formulários | Duplicação/perda de notificação | UUID de idempotência e outbox; ausência de Resend registra falha sem duplicar | primeira submissão 202, repetição 200/duplicate, outbox `email_not_configured` | Verificado live/fail-closed |

## Aceites funcionais para encerrar os P0

| Decisão | Owner funcional | Estado |
|---|---|---|
| Validar termos, consentimento e força probatória | Administrador da GAIATEC SISTEMAS, pelos papéis Jurídico + Negócio conforme ADR-010 | aceito formalmente em 2026-08-28, sob responsabilidade declarada; sem alegação de ICP-Brasil |

Os owners técnicos têm contenção e evidência remota. O aceite jurídico-negocial foi registrado em [Aceite jurídico-negocial da ADR-010](./ACEITE_JURIDICO_NEGOCIAL_ADR010.md); não resta P0 sem owner e contenção.
