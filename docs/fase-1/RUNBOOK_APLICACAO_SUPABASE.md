# Runbook inicial — aplicação da contenção no Supabase de staging

Este runbook é exclusivamente para o ambiente de staging. Não autoriza acesso ou alteração de produção.

## Pré-condições

1. obter aprovação do owner de Plataforma/Backend e credencial temporária de staging;
2. confirmar documentalmente o `project-ref` e a URL de staging, distintos de produção;
3. registrar backup/snapshot recuperável do banco e do storage de staging;
4. definir, no secret store do projeto, `ALLOWED_ORIGINS`, `EVIDENCE_SALT`, `RESEND_API_KEY`, `RESEND_FROM`, `TURNSTILE_SECRET_KEY` e demais variáveis documentadas em `.env.example`;
5. não copiar secrets, usuários, relatórios, mídia ou conteúdo de produção;
6. preparar somente identidades e dados sintéticos rotulados e descartáveis.

## Ordem de execução

1. vincular o CLI explicitamente ao projeto de staging e conferir o ref antes de qualquer comando mutável;
2. executar lint/dry-run e revisar o plano da migração `0008_fase1_contencao_p0.sql`;
3. aplicar a migração em janela controlada;
4. criar ou confirmar ao menos um `rdo_admin` ativo por ato administrativo explícito; não depender do bootstrap legado;
5. publicar `_shared`, `rdo-otp`, `rdo-command`, `rdo-notify`, `rdo-sign`, `rdo-invite`, `rdo-team` e `submit-contact`;
6. executar os testes negativos e a matriz RLS abaixo;
7. verificar logs sem PII/secrets, outbox, rate limit e expiração/uso único dos tokens;
8. remover os dados sintéticos conforme o plano de descarte e anexar os resultados ao Gate G1.

## Matriz mínima de RLS/fluxo remoto

| Ator/caso | Resultado esperado |
|---|---|
| usuário inexistente solicita OTP | resposta genérica; nenhum usuário criado |
| usuário Auth sem `rdo_user_access` | sem acesso a relatório/storage |
| membro suspenso | acesso e comandos negados |
| membro ativo não owner | não lê/altera relatório alheio |
| owner ativo em rascunho | CRUD permitido dentro das políticas |
| owner após finalização/assinatura | UPDATE/DELETE negados |
| admin RDO ativo | acesso administrativo auditado, sem permissão CMS implícita |
| correção de assinado | nova versão; anterior preservado; motivo e vínculo registrados |
| token de assinatura repetido/expirado | negado; sem efeito duplicado |
| mídia privada | URL pública negada; signed URL curta funciona apenas para autorizado |
| notificação adulterada pelo cliente | destinatário/conteúdo reconstruídos no servidor |
| submissão duplicada | uma persistência/notificação efetiva pela mesma chave |
| payload grande/honeypot/rate/CAPTCHA inválido | rejeição controlada e auditável |

## Critérios de rollback

Interromper a validação e acionar o owner se houver bypass de RLS, bucket público, edição de assinado, criação por OTP, vazamento de segredo/PII ou notificação para destinatário não canônico. Preservar logs e evidências, revogar secrets temporários e restaurar staging pelo procedimento aprovado. Não promover nada a produção.

## Evidência de conclusão requerida

- ref inequívoco de staging e versão aplicada;
- saída dos testes RLS/E2E com IDs sintéticos, sem PII;
- prova de buckets privados e signed URLs expirando;
- prova de idempotência/rate limit/outbox;
- owner e data de aceite técnico;
- parecer jurídico-negocial registrado para ADR-010.
