# Segurança, LGPD e operação — Fase 7

## Controles implementados

- RLS habilitada e sem políticas públicas nas tabelas administrativas de blog, formulários e leads;
- Edge Functions usam `service_role` somente no servidor e RBAC/AAL para comandos administrativos;
- captura pública limitada por tamanho, origem, Zod, honeypot, rate limit e Turnstile adaptativo;
- formulário, versão, consentimento, campos, tipos, limites e relações de origem revalidados no servidor e no banco;
- idempotência preservada durante reenvios e referência pública não sequencial;
- consentimento append-only com texto, versão, política, horário de servidor e evidência técnica com IP hasheado;
- histórico append-only para status/atribuição, SLA persistido e notificação via outbox com retry/dead-letter;
- exportação exige permissão crítica, justificativa e gera auditoria; limite de 5.000 linhas;
- anonimização manual exige `cms:leads.privacy`; retenção automática remove payload, UTM e responsável;
- tracking de campanha somente emite evento quando o consentimento de cookies está aceito.

## Secrets necessários em staging

`SUPABASE_SERVICE_ROLE_KEY`, `OUTBOX_WORKER_SECRET`, `LEAD_EVIDENCE_SALT`, `RESEND_API_KEY`, `EMAIL_FROM`, `LEAD_NOTIFICATION_TO`, `CMS_ADMIN_URL`, `TURNSTILE_SECRET_KEY` e `VITE_TURNSTILE_SITE_KEY`.

Nenhum valor de secret deve ser registrado neste repositório. A ausência de configuração resulta em falha fechada ou notificação retida para retry.
