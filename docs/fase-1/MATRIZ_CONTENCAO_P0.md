# Matriz de contenção P0

| Domínio | Risco P0 | Contenção implementada | Evidência principal | Estado |
|---|---|---|---|---|
| RDO | Autoinscrição por OTP | `rdo-otp` não cria usuário; resposta não enumerável; somente usuário previamente convidado, ativo e com papel RDO | `supabase/functions/rdo-otp/index.ts`; teste `RDO access... fail-closed` | Código pronto; live bloqueado |
| RDO | Mistura de permissões CMS/RDO | tabela independente `rdo_user_access` com `rdo_admin`/`rdo_member`; funções e UI consultam esse escopo | migração `0008_fase1_contencao_p0.sql`; `AuthContext.tsx` | Código pronto; live bloqueado |
| RDO | Alteração/exclusão após assinatura | RLS e trigger fail-closed deixam mutável apenas rascunho; comandos canônicos finalizam, arquivam, restauram e criam correção versionada | migração; `rdo-command`; teste de imutabilidade | Código pronto; RLS live não provada |
| RDO | Foto/PDF sensível público | buckets `rdo-fotos` e `rdo-assinados` privados; políticas por owner/admin ativo; URLs assinadas por 5 min | migração; `rdo-sign` | Código pronto; storage live não provado |
| RDO | Notificação controlada pelo cliente | cliente envia identificadores; servidor reconstrói relatório e destinatários, usa outbox/idempotência e higieniza HTML/assunto | `rdo-notify`; `_shared/email.ts`; teste de identificadores | Código pronto; envio live não provado |
| RDO | Reuso/forja de assinatura | token armazenado por hash, expiração e consumo atômico; hash de termos/evidência/PDF; rate limit e auditoria | `rdo-sign`; `rdo-command`; migração | Parcial: PDF canônico de assinatura desenhada pendente |
| Site | Erro de rota/chunk sem recuperação | `errorElement` e `RouteErrorPage` com recuperação controlada | `routes.tsx`; `RouteErrorPage.tsx` | Verificado no build |
| Site | Indexação de área privada | meta `noindex`, remoção de canonical no RDO, headers `X-Robots-Tag`, cache privado/no-store e frame deny | `AuthContext.tsx`; Worker; staging | Verificado no frontend/HTTP |
| Site | Soft 404 | Worker retorna 404 real para entidade/rota/asset inválido, mantendo allowlist explícita de SPA | `cloudflare/_worker.js`; teste e matriz HTTP | Verificado no staging |
| Site | Cache de conteúdo privado/obsoleto | Service Worker ignora rotas privadas; headers privados e no-store; staging sempre noindex | `public/sw.js`; Worker/headers | Verificado no staging |
| Site | Links críticos `#` e overflow mobile | links inertes removidos; contenção horizontal e cabeçalhos responsivos | componentes e `theme.css`; varredura e navegador | Verificado |
| Site | Headers fracos | HSTS, nosniff, referrer/permissions policy, COOP, frame policy e CSP report-only | `_headers`; Worker; matriz HTTP | Verificado no staging |
| Site | Reativação acidental do CMS/API antigo | caminhos legados permanecem desabilitados e teste estático impede regressão | `useSiteData.ts`; `containment.test.mjs` | Verificado |
| Formulários | Abuso, payload excessivo e dados não validados | limite de 16 KiB, limites de campos, enums e validação server-side | `submit-contact` | Código pronto; live bloqueado |
| Formulários | Spam automatizado | rate limit por IP/e-mail, honeypot e Turnstile adaptativo | `submit-contact`; `TurnstileChallenge.tsx` | Código pronto; segredos/live bloqueados |
| Formulários | Consentimento ambíguo | consentimento estruturado com finalidade, texto, versão e timestamp | componentes; `submit-contact` | Código pronto |
| Formulários | Duplicação/perda de notificação | UUID de idempotência, persistência segura e outbox/Resend idempotente | migração; `submit-contact` | Código pronto; live bloqueado |

## Owners necessários para encerrar os P0

| Pendência | Owner funcional requerido | Contenção atual |
|---|---|---|
| Aplicar migração/funções e executar RLS/fluxo remoto | Plataforma/Backend com acesso ao Supabase de staging | nada aplicado em produção; runbook fechado e código fail-closed |
| Validar termos, consentimento e força probatória | Jurídico + Negócio, conforme ADR-010 | termos marcados como pendentes de aprovação; sem alegação de ICP-Brasil |
| PDF canônico de assinatura desenhada | Backend/RDO | assinatura permanece bloqueada para aprovação do Gate até implementação e teste |

Enquanto esses owners não aceitarem e concluírem as ações, o critério “nenhum P0 sem owner e contenção” não pode ser comprovado para G1.
