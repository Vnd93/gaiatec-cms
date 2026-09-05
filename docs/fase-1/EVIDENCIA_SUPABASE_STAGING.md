# Evidência — Supabase staging

Data: 2026-08-28 (America/Sao_Paulo)

## Identidade e isolamento

| Campo | Valor confirmado pela Management API |
|---|---|
| Project ref | `glcqsosxwgmlhzgcsnzv` |
| Nome | `GAIATEC CMS Staging` |
| Região | `us-east-2` |
| Estado inicial | `ACTIVE_HEALTHY` |

O endpoint consultado foi sempre o ref explícito. Nenhum projeto foi listado, consultado ou alterado além desse ref. O processo extraiu somente `SUPABASE_ACCESS_TOKEN`; o valor não foi impresso, salvo no repositório ou reutilizado como secret da aplicação.

## Baseline pré-aplicação

| Medida | Contagem |
|---|---:|
| tabelas `public` | 0 |
| usuários Auth | 0 |
| buckets Storage | 0 |
| histórico de migrations | 0 |

## Aplicação

- dry-run de 0001–0008 em uma transação encerrada com `ROLLBACK`: OK;
- migrations finais registradas: 0001–0009;
- 0008: contenção P0, buckets privados e colunas de PDF canônico;
- 0009: policy self-only, helpers `SECURITY INVOKER` e `search_path` fixo;
- secrets exclusivos criados: `ALLOWED_ORIGINS`, `PUBLIC_SITE_ORIGIN`, `EVIDENCE_SALT`, `RATE_LIMIT_SALT`;
- secrets não configurados: `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`;
- funções `ACTIVE`, `verify_jwt=true`: `rdo-otp`, `rdo-command`, `rdo-notify`, `rdo-sign`, `rdo-invite`, `rdo-team`, `submit-contact`.

O endpoint de migrations atribui versão temporal. Duas chamadas no mesmo segundo colidiram; a resposta não terminante inicial foi detectada pela auditoria da história, as migrations ausentes foram reaplicadas individualmente com `ErrorAction Stop`, e o conjunto final foi confirmado antes dos testes.

## Matriz remota

Todos os casos passaram:

- usuário Auth sem escopo lê zero relatórios;
- owner não forja `created_by` alheio (403);
- owner cria/edita rascunho;
- membro alheio e suspenso leem zero; admin RDO lê;
- finalização com duas assinaturas desenhadas gera PDF canônico;
- UPDATE/DELETE direto do assinado não muda o registro;
- correção gera versão 2 com `supersedes_id`;
- PDF público é negado (400), signed URL de 300 s funciona para owner (200) e é negada para membro alheio/sem escopo (400);
- SHA-256 do PDF baixado coincide com `canonical_pdf_hash`;
- usuário sem escopo recebe 403 no comando;
- OTP sem Resend retorna 503 e a contagem Auth permanece igual;
- notificação e assinatura remota sem Resend retornam 503;
- formulário sem consentimento retorna 400; corpo de 17 KB retorna 413;
- honeypot responde genericamente e não persiste;
- CAPTCHA adaptativo sem secret retorna 403;
- contato válido retorna 202, repetição retorna `duplicate`, outbox registra `email_not_configured`.

Script reproduzível: `scripts/phase1/remote-staging-tests.ps1`.

## Security Advisor

Resultado final: 0 `ERROR`, 0 `WARN`, 6 `INFO`. Os seis infos são tabelas intencionalmente com RLS e nenhuma policy pública (outboxes, contatos, recibos, throttle e rate limit), acessíveis somente pelo service role.

Fonte oficial do advisor: https://supabase.com/docs/reference/api/v1-get-security-advisors.

## Limpeza final

Contagem zero confirmada para usuários Auth, allowlist RDO, relatórios, fotos, eventos, recibos, outboxes RDO/contato, contatos, rate limits e objetos nos buckets `rdo-fotos`/`rdo-assinados`. Os buckets e a estrutura permanecem para o staging; nenhum dado sintético permaneceu.

## Fontes técnicas oficiais

- Management API: https://supabase.com/docs/reference/api/getting-started
- SQL query: https://supabase.com/docs/reference/api/v1-run-a-query
- migrations: https://supabase.com/docs/reference/api/v1-apply-a-migration
- secrets: https://supabase.com/docs/guides/functions/secrets
- deploy de Edge Functions: https://supabase.com/docs/guides/functions/deploy
